import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { FONT_DOWNLOADS, GRADIENTS, localize, SPECIAL_BACKGROUNDS } from './catalog';
import { CatalogPanel } from './catalogPanel';
import { getConfig, setSetting } from './config';
import { FontInstaller, InstalledFont } from './fontInstaller';
import { applyCodeFont, applyUiFont, fontStatuses, pickInstalledFont, refreshFontCache } from './fonts';
import { AuraHub } from './hub';
import { getLang, MessageKey, t } from './i18n';
import { IMAGE_EXTENSIONS } from './images';
import { TrackInfo } from './media';
import { MusicViewProvider } from './musicView';
import * as core from './patchCore';
import { Updater } from './updater';
import { applyWindowGlass } from './windowGlass';

const WANT_PATCHED = 'aura.wantPatched';

export function activate(ctx: vscode.ExtensionContext): void {
    const log = vscode.window.createOutputChannel('Aura Code');
    const appRoot = vscode.env.appRoot;
    const paths = core.appPaths(appRoot);
    const hub = new AuraHub(ctx.extensionPath, log);
    ctx.subscriptions.push(log, hub);

    const music = new MusicViewProvider(ctx.extensionUri, hub);
    ctx.subscriptions.push(music, vscode.window.registerWebviewViewProvider(MusicViewProvider.viewId, music));

    const isPatched = () => core.hasPatch(paths.workbench);

    // --- Barra de estado ---------------------------------------------------------
    const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    status.command = 'aura.openCatalog';
    const updateStatus = (track: TrackInfo) => {
        if (track.title && getConfig().musicEnabled) {
            const label = track.artist ? `${track.title} — ${track.artist}` : track.title;
            status.text = `$(${track.playing ? 'pulse' : 'debug-pause'}) ${label.length > 45 ? label.slice(0, 44) + '…' : label}`;
            status.tooltip = t('status.trackTooltip', t(track.playing ? 'status.playing' : 'status.paused'), track.app || t('status.yourPc'));
        } else {
            status.text = '$(sparkle) Aura';
            status.tooltip = t('status.idleTooltip');
        }
        status.show();
    };
    updateStatus(hub.currentTrack);
    ctx.subscriptions.push(status, hub.onTrack(track => {
        updateStatus(track);
        CatalogPanel.notifyTrack(track);
    }));

    // --- Activar / desactivar ----------------------------------------------------
    /**
     * Identifica el código inyectado (contenido de runtime.js + puerto). Así solo se pide reiniciar
     * VS Code cuando ese código cambia, no en cada actualización de la extensión.
     */
    function runtimeSource(): { code: string; id: string } {
        const port = String(getConfig().port);
        const template = fs.readFileSync(path.join(ctx.extensionPath, 'media', 'runtime.js'), 'utf8');
        const id = crypto.createHash('sha256').update(template + port).digest('hex').slice(0, 12);
        return { code: template.replace('__AURA_PORT__', port).replace('__AURA_VERSION__', id), id };
    }

    function writePatches(): void {
        const cfg = getConfig();
        core.writeWorkbenchPatch(appRoot, runtimeSource().code);
        core.writeMainPatch(appRoot, cfg.transparency === 'acrylic' || cfg.transparency === 'mica' ? cfg.transparency : null);
        core.rememberInstall(appRoot);
    }

    function explainWriteError(err: unknown): void {
        const code = (err as NodeJS.ErrnoException).code;
        const hint = code === 'EPERM' || code === 'EACCES' ? t('patch.permissionHint') : '';
        vscode.window.showErrorMessage(t('patch.writeError', (err as Error).message, hint));
        log.appendLine(String(err));
    }

    /** Recargar no basta: el proceso principal de VS Code conserva en memoria los archivos y checksums anteriores. */
    async function askRestart(message: string): Promise<void> {
        const choice = await vscode.window.showInformationMessage(t('patch.restartAll', message), t('btn.closeVsCode'));
        if (choice) {
            await vscode.commands.executeCommand('workbench.action.quit');
        }
    }

    async function enable(): Promise<void> {
        if (!isPatched()) {
            const ok = await vscode.window.showWarningMessage(t('patch.confirm'), { modal: true }, t('btn.activate'));
            if (ok !== t('btn.activate')) {
                return;
            }
        }
        try {
            writePatches();
        } catch (err) {
            explainWriteError(err);
            return;
        }
        await ctx.globalState.update(WANT_PATCHED, true);
        CatalogPanel.notify();
        await askRestart(t('patch.enabled'));
    }

    async function disable(): Promise<void> {
        try {
            core.removePatches(appRoot);
            core.forgetInstall(appRoot);
        } catch (err) {
            explainWriteError(err);
            return;
        }
        await ctx.globalState.update(WANT_PATCHED, false);
        CatalogPanel.notify();
        await askRestart(t('patch.restored'));
    }

    // --- Fondos y fuentes --------------------------------------------------------
    async function setBackground(id: string): Promise<void> {
        await setSetting('background', id);
        if (id !== 'none' && !isPatched()) {
            await enable();
        }
    }

    async function pickImage(): Promise<void> {
        const files = await vscode.window.showOpenDialog({
            canSelectMany: false,
            openLabel: t('bg.dialogUse'),
            filters: { [t('bg.filterImages')]: IMAGE_EXTENSIONS },
        });
        if (files?.[0]) {
            await setSetting('customImage', files[0].fsPath);
            await setBackground('image');
        }
    }

    // --- Instalación de fuentes ----------------------------------------------------
    const installer = new FontInstaller(ctx.extensionPath, m => log.appendLine(m));
    ctx.subscriptions.push(installer);

    function fontsChanged(): void {
        refreshFontCache();
        CatalogPanel.notify();
    }

    async function askRestartForFonts(name: string): Promise<void> {
        const choice = await vscode.window.showInformationMessage(t('font.installedRestart', name), t('btn.closeNow'), t('btn.later'));
        if (choice === t('btn.closeNow')) {
            await vscode.commands.executeCommand('workbench.action.quit');
        }
    }

    /** La familia "base" de lo instalado (la más corta: "JetBrains Mono" antes que "JetBrains Mono Bold"). */
    function baseFamily(fonts: InstalledFont[]): string | undefined {
        return fonts.filter(f => f.ok && f.family).map(f => f.family!).sort((a, b) => a.length - b.length)[0];
    }

    async function installCatalogFont(id: string, name: string): Promise<boolean> {
        const spec = FONT_DOWNLOADS[id];
        try {
            const result = await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: t('font.installing', name) },
                progress => installer.installFromCatalog(id, spec, message => progress.report({ message })),
            );
            fontsChanged();
            return result.some(r => r.ok);
        } catch (err) {
            log.appendLine(`[fuentes] ${err}`);
            const choice = await vscode.window.showErrorMessage(
                t('font.installFailed', name, String(err instanceof Error ? err.message : err)), t('btn.details'));
            if (choice) {
                log.show();
            }
            return false;
        }
    }

    /** Tras instalar desde un archivo o desde Descargas: preguntar dónde usarla. */
    async function offerInstalled(fonts: InstalledFont[], source: string): Promise<void> {
        fontsChanged();
        const family = baseFamily(fonts);
        if (!family) {
            vscode.window.showWarningMessage(t('font.noValidFonts', source));
            return;
        }
        const choice = await vscode.window.showInformationMessage(
            t('font.installedFrom', family, source), t('btn.inCode'), t('btn.inUi'), t('btn.justInstall'));
        if (choice === t('btn.inCode') || choice === t('btn.inUi')) {
            await applyNamedFont(family, choice === t('btn.inCode') ? 'code' : 'ui');
        }
        await askRestartForFonts(family);
    }

    async function installFontFile(): Promise<void> {
        const files = await vscode.window.showOpenDialog({
            canSelectMany: false,
            openLabel: t('font.dialogInstall'),
            filters: { [t('font.filterFonts')]: ['zip', 'ttf', 'otf', 'ttc'] },
        });
        if (!files?.[0]) {
            return;
        }
        try {
            const result = await installer.installFromFile(files[0].fsPath);
            await offerInstalled(result, path.basename(files[0].fsPath));
        } catch (err) {
            vscode.window.showErrorMessage(`Aura: ${err instanceof Error ? err.message : err}`);
        }
    }

    /** Fuentes sin descarga directa: abrir la página y vigilar Descargas para instalar lo que llegue. */
    async function manualDownload(name: string, url: string): Promise<void> {
        if (url) {
            await vscode.env.openExternal(vscode.Uri.parse(url));
        }
        if (!FontInstaller.isSupported()) {
            vscode.window.showInformationMessage(t('font.manualOtherOs', name));
            return;
        }
        installer.watchDownloads(
            async (fileName, count) => (await vscode.window.showInformationMessage(
                t('font.detected', fileName, count), t('btn.install'), t('btn.no'))) === t('btn.install'),
            (fonts, file) => offerInstalled(fonts, path.basename(file)),
        );
        const choice = await vscode.window.showInformationMessage(t('font.manualInfo', name), t('btn.haveIt'));
        if (choice) {
            await installFontFile();
        }
    }

    async function applyFontById(id: string, target: 'code' | 'ui' = 'code'): Promise<void> {
        let font = (await fontStatuses()).find(f => f.id === id);
        if (!font) {
            return;
        }
        let justInstalled = false;
        if (font.installed === false) {
            if (!font.autoInstall) {
                await manualDownload(font.name, font.url);
                return;
            }
            if (!await installCatalogFont(font.id, font.name)) {
                return;
            }
            justInstalled = true;
            font = (await fontStatuses()).find(f => f.id === id) ?? font;
        }
        if (target === 'code' && font.mono === false) {
            const choice = await vscode.window.showWarningMessage(t('font.notMono', font.name), t('btn.useInUi'), t('btn.useInCodeAnyway'));
            if (choice === t('btn.useInUi')) {
                target = 'ui';
            } else if (choice !== t('btn.useInCodeAnyway')) {
                return;
            }
        }
        await applyNamedFont(font.resolvedFamily, target, font.ligatures, font.mono !== false);
        if (justInstalled) {
            await askRestartForFonts(font.name);
        }
    }

    async function applyNamedFont(family: string, target: 'code' | 'ui', ligatures = false, mono = true): Promise<void> {
        if (target === 'ui') {
            await applyUiFont(family);
            if (!isPatched()) {
                await enable();
            }
        } else {
            await applyCodeFont(family, ligatures, mono);
        }
        vscode.window.setStatusBarMessage(t(target === 'ui' ? 'font.appliedUi' : 'font.appliedCode', family), 3000);
    }

    async function pickInstalled(target?: 'code' | 'ui', filter = ''): Promise<void> {
        const family = await pickInstalledFont(filter);
        if (!family) {
            return;
        }
        if (!target) {
            const where = await vscode.window.showQuickPick(
                [
                    { label: `$(code) ${t('btn.inCode')}`, description: t('font.whereCode'), target: 'code' as const },
                    { label: `$(layout) ${t('btn.inUi')}`, description: t('font.whereUi'), target: 'ui' as const },
                ],
                { placeHolder: t('font.where', family) },
            );
            if (!where) {
                return;
            }
            target = where.target;
        }
        await applyNamedFont(family, target);
    }

    // --- Visibilidad sobre el escritorio (fondo "Mi escritorio") -----------------
    const visibilityItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
    visibilityItem.command = 'aura.setVisibility';
    ctx.subscriptions.push(visibilityItem);

    function updateVisibilityItem(): void {
        const cfg = getConfig();
        if (cfg.background !== 'wallpaper' || process.platform !== 'win32') {
            visibilityItem.hide();
            return;
        }
        visibilityItem.text = `$(eye) ${Math.round(cfg.windowOpacity * 100)}%`;
        visibilityItem.tooltip = t('visibility.tooltip');
        visibilityItem.show();
    }
    updateVisibilityItem();

    async function setVisibility(value: number): Promise<void> {
        const clamped = Math.round(Math.max(0.3, Math.min(1, value)) * 100) / 100;
        await setSetting('windowOpacity', clamped);
        if (getConfig().background !== 'wallpaper') {
            const choice = await vscode.window.showInformationMessage(t('visibility.onlyWallpaper'), t('btn.useThatBackground'));
            if (choice) {
                await setBackground('wallpaper');
            }
        }
    }

    // --- Actualizaciones -----------------------------------------------------------
    const updater = new Updater(ctx, m => log.appendLine(m));

    // --- Comandos ----------------------------------------------------------------
    const actions = {
        setBackground,
        pickImage,
        applyFont: applyFontById,
        pickInstalledFont: (target?: 'code' | 'ui') => pickInstalled(target),
        resetUiFont: async () => { await applyUiFont(''); },
        installFontFile,
        setSetting: async (key: string, value: unknown) => { await setSetting(key, value); },
        enable,
        disable,
        isPatched,
        currentTrack: () => hub.currentTrack,
    };

    const VISIBILITY_LEVELS: { value: number; label: MessageKey; detail?: MessageKey }[] = [
        { value: 100, label: 'visibility.opaque', detail: 'visibility.opaqueDetail' },
        { value: 95, label: 'visibility.prominent', detail: 'visibility.prominentDetail' },
        { value: 90, label: 'visibility.veryVisible' },
        { value: 85, label: 'visibility.balanced', detail: 'visibility.balancedDetail' },
        { value: 78, label: 'visibility.translucent' },
        { value: 70, label: 'visibility.subtle', detail: 'visibility.subtleDetail' },
        { value: 55, label: 'visibility.ghost', detail: 'visibility.ghostDetail' },
    ];

    ctx.subscriptions.push(
        vscode.commands.registerCommand('aura.openCatalog', () => CatalogPanel.show(ctx.extensionUri, actions)),
        vscode.commands.registerCommand('aura.enable', enable),
        vscode.commands.registerCommand('aura.disable', disable),
        vscode.commands.registerCommand('aura.pickImage', pickImage),
        vscode.commands.registerCommand('aura.checkForUpdates', () => updater.check(true)),
        vscode.commands.registerCommand('aura.toggleMusic', async () => {
            const next = !getConfig().musicEnabled;
            await setSetting('music.enabled', next);
            vscode.window.setStatusBarMessage(t(next ? 'music.synced' : 'music.off'), 3000);
        }),
        vscode.commands.registerCommand('aura.setVisibility', async () => {
            const current = Math.round(getConfig().windowOpacity * 100);
            const pick = await vscode.window.showQuickPick(
                VISIBILITY_LEVELS.map(l => ({
                    label: `${l.value}%  ${t(l.label)}`,
                    description: l.value === current ? t('visibility.current') : '',
                    detail: l.detail ? t(l.detail) : undefined,
                    value: l.value,
                })),
                { placeHolder: t('visibility.placeholder', current) },
            );
            if (pick) {
                await setVisibility(pick.value / 100);
            }
        }),
        vscode.commands.registerCommand('aura.moreVisible', () => setVisibility(getConfig().windowOpacity + 0.05)),
        vscode.commands.registerCommand('aura.lessVisible', () => setVisibility(getConfig().windowOpacity - 0.05)),
        vscode.commands.registerCommand('aura.pickBackground', async () => {
            const current = getConfig().background;
            const lang = getLang();
            const items = [
                ...SPECIAL_BACKGROUNDS.map(s => localize(s, lang)).map(s => ({ label: `${s.icon}  ${s.name}`, description: s.description, id: s.id as string })),
                { label: '', kind: vscode.QuickPickItemKind.Separator, id: '' },
                ...GRADIENTS.map(g => localize(g, lang)).map(g => ({
                    label: `$(color-mode) ${g.name}`,
                    description: g.description + (g.animated ? ` · ${t('bg.animated')}` : ''),
                    id: g.id,
                })),
            ].map(i => ({ ...i, picked: i.id === current }));
            const pick = await vscode.window.showQuickPick(items, { placeHolder: t('bg.pick') });
            if (!pick) {
                return;
            }
            if (pick.id === 'image') {
                await pickImage();
            } else {
                await setBackground(pick.id);
            }
        }),
        vscode.commands.registerCommand('aura.pickFont', async () => {
            const fonts = await fontStatuses();
            const item = (f: (typeof fonts)[number]) => ({
                label: (f.category === 'game' ? '$(game) ' : '') + f.name,
                description: [
                    f.game,
                    f.installed === false ? `$(cloud-download) ${t('font.notInstalled')}` : f.installed ? `$(check) ${t('font.installed')}` : '',
                    f.mono === false ? t('font.decorative') : '',
                ].filter(Boolean).join(' · '),
                detail: f.note,
                id: f.id,
            });
            const pick = await vscode.window.showQuickPick([
                { label: t('font.sepCode'), kind: vscode.QuickPickItemKind.Separator, id: '' },
                ...fonts.filter(f => f.category !== 'game').map(item),
                { label: t('font.sepGames'), kind: vscode.QuickPickItemKind.Separator, id: '' },
                ...fonts.filter(f => f.category === 'game').map(item),
                { label: '', kind: vscode.QuickPickItemKind.Separator, id: '' },
                { label: `$(search) ${t('font.other')}`, description: t('font.otherDesc'), detail: undefined, id: '__installed' },
            ], { placeHolder: t('font.pick') });
            if (!pick) {
                return;
            }
            if (pick.id === '__installed') {
                await pickInstalled();
            } else {
                await applyFontById(pick.id);
            }
        }),
        vscode.commands.registerCommand('aura.pickInstalledFont', () => pickInstalled()),
        vscode.commands.registerCommand('aura.installFontFile', installFontFile),
        vscode.commands.registerCommand('aura.showMusic', () => vscode.commands.executeCommand(`${MusicViewProvider.viewId}.focus`)),
        vscode.commands.registerCommand('aura.resetUiFont', () => applyUiFont('')),
    );

    // --- Reaccionar a cambios de configuración -----------------------------------
    ctx.subscriptions.push(vscode.workspace.onDidChangeConfiguration(async e => {
        if (e.affectsConfiguration('aura.port')) {
            hub.restart();
            if (isPatched()) {
                writePatches();
                await askRestart(t('patch.portChanged'));
            }
        } else if (e.affectsConfiguration('aura.transparency') && isPatched()) {
            // Solo acrílico/mica viven en el proceso principal y necesitan reiniciar VS Code.
            const hadMaterial = core.hasPatch(paths.main);
            try {
                writePatches();
            } catch (err) {
                explainWriteError(err);
            }
            hub.refresh();
            if (hadMaterial !== core.hasPatch(paths.main) || core.hasPatch(paths.main)) {
                vscode.window.showInformationMessage(t('patch.transparencyRestart'));
            }
        } else if (e.affectsConfiguration('aura')) {
            hub.refresh();
        }
        if (e.affectsConfiguration('aura.background') || e.affectsConfiguration('aura.windowOpacity')) {
            applyWindowGlass(ctx.extensionPath, getConfig(), m => log.appendLine(m));
        }
        if (e.affectsConfiguration('aura.language')) {
            CatalogPanel.relocalize();
            music.relocalize();
        }
        if (e.affectsConfiguration('aura') || e.affectsConfiguration('editor.fontFamily')) {
            updateStatus(hub.currentTrack);
            updateVisibilityItem();
            CatalogPanel.notify();
        }
    }));

    hub.start();
    checkPatchHealth();
    // Cada ventana nueva aplica el cristal (o lo quita) en todas, incluida ella misma.
    applyWindowGlass(ctx.extensionPath, getConfig(), m => log.appendLine(m));
    // Unos segundos después de abrir, para no competir con el arranque de VS Code.
    const updateTimer = setTimeout(() => updater.check(), 15_000);
    ctx.subscriptions.push({ dispose: () => clearTimeout(updateTimer) });

    // Tras una actualización de VS Code el parche desaparece; o el código inyectado cambió en una
    // actualización de Aura. En ambos casos se vuelve a aplicar.
    async function checkPatchHealth(): Promise<void> {
        if (!ctx.globalState.get(WANT_PATCHED, false)) {
            if (!ctx.globalState.get('aura.welcomed', false)) {
                await ctx.globalState.update('aura.welcomed', true);
                const choice = await vscode.window.showInformationMessage(t('welcome'), t('btn.openCatalog'));
                if (choice) {
                    CatalogPanel.show(ctx.extensionUri, actions);
                }
            }
            return;
        }
        const injected = core.patchVersion(paths.workbench);
        if (injected === runtimeSource().id) {
            return;
        }
        try {
            writePatches();
        } catch (err) {
            explainWriteError(err);
            return;
        }
        await askRestart(t(injected ? 'patch.auraUpdated' : 'patch.vscodeUpdated'));
    }
}

export function deactivate(): void {
    // Los recursos se liberan mediante ctx.subscriptions.
}
