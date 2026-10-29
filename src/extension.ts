import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { FONT_DOWNLOADS, GRADIENTS, SPECIAL_BACKGROUNDS } from './catalog';
import { CatalogPanel } from './catalogPanel';
import { getConfig, setSetting } from './config';
import { FontInstaller, InstalledFont } from './fontInstaller';
import { applyCodeFont, applyUiFont, fontStatuses, pickInstalledFont, refreshFontCache } from './fonts';
import { AuraHub } from './hub';
import { IMAGE_EXTENSIONS } from './images';
import { TrackInfo } from './media';
import { MusicViewProvider } from './musicView';
import * as core from './patchCore';
import { applyWindowGlass } from './windowGlass';

const WANT_PATCHED = 'aura.wantPatched';

export function activate(ctx: vscode.ExtensionContext): void {
    const log = vscode.window.createOutputChannel('Aura Code');
    const appRoot = vscode.env.appRoot;
    const paths = core.appPaths(appRoot);
    const version: string = ctx.extension.packageJSON.version;
    const hub = new AuraHub(ctx.extensionPath, log);
    ctx.subscriptions.push(log, hub);

    const music = new MusicViewProvider(ctx.extensionUri, hub);
    ctx.subscriptions.push(music, vscode.window.registerWebviewViewProvider(MusicViewProvider.viewId, music));

    const isPatched = () => core.hasPatch(paths.workbench);

    // --- Barra de estado ---------------------------------------------------------
    const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    status.command = 'aura.openCatalog';
    const updateStatus = (t: TrackInfo) => {
        if (t.title && getConfig().musicEnabled) {
            const label = t.artist ? `${t.title} — ${t.artist}` : t.title;
            status.text = `$(${t.playing ? 'pulse' : 'debug-pause'}) ${label.length > 45 ? label.slice(0, 44) + '…' : label}`;
            status.tooltip = `Aura · ${t.playing ? 'Sonando' : 'En pausa'} en ${t.app || 'tu equipo'}\nClic para abrir el catálogo`;
        } else {
            status.text = '$(sparkle) Aura';
            status.tooltip = 'Aura · Abrir catálogo de fondos y fuentes';
        }
        status.show();
    };
    updateStatus(hub.currentTrack);
    ctx.subscriptions.push(status, hub.onTrack(t => {
        updateStatus(t);
        CatalogPanel.notifyTrack(t);
    }));

    // --- Activar / desactivar ----------------------------------------------------
    function writePatches(): void {
        const cfg = getConfig();
        const runtime = fs.readFileSync(path.join(ctx.extensionPath, 'media', 'runtime.js'), 'utf8')
            .replace('__AURA_PORT__', String(cfg.port))
            .replace('__AURA_VERSION__', version);
        core.writeWorkbenchPatch(appRoot, runtime);
        core.writeMainPatch(appRoot, cfg.transparency === 'acrylic' || cfg.transparency === 'mica' ? cfg.transparency : null);
        core.rememberInstall(appRoot);
    }

    function explainWriteError(err: unknown): void {
        const code = (err as NodeJS.ErrnoException).code;
        const hint = code === 'EPERM' || code === 'EACCES'
            ? ' No hay permisos para modificar la instalación de VS Code: ábrelo como administrador una vez y vuelve a intentarlo.'
            : '';
        vscode.window.showErrorMessage(`Aura: no se pudo modificar VS Code. ${(err as Error).message}.${hint}`);
        log.appendLine(String(err));
    }

    async function askReload(message: string, fullRestart: boolean): Promise<void> {
        if (fullRestart) {
            // Recargar no basta: el proceso principal de VS Code conserva en memoria los archivos y
            // checksums anteriores (aparecería el aviso de "instalación dañada" y no cargaría el parche).
            const choice = await vscode.window.showInformationMessage(
                `${message} Cierra TODAS las ventanas de VS Code y vuelve a abrirlo para ver los cambios.`, 'Cerrar VS Code');
            if (choice) {
                await vscode.commands.executeCommand('workbench.action.quit');
            }
            return;
        }
        const choice = await vscode.window.showInformationMessage(message, 'Recargar ahora');
        if (choice) {
            await vscode.commands.executeCommand('workbench.action.reloadWindow');
        }
    }

    async function enable(): Promise<void> {
        if (!isPatched()) {
            const ok = await vscode.window.showWarningMessage(
                'Aura necesita modificar un archivo de VS Code para dibujar fondos y transparencia. ' +
                'Se guarda una copia de seguridad y puedes revertirlo con "Aura: Desactivar y restaurar VS Code".',
                { modal: true },
                'Activar',
            );
            if (ok !== 'Activar') {
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
        await askReload('Aura está activo ✨', true);
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
        await askReload('VS Code fue restaurado.', true);
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
            openLabel: 'Usar como fondo',
            filters: { Imágenes: IMAGE_EXTENSIONS },
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
        const choice = await vscode.window.showInformationMessage(
            `✅ "${name}" quedó instalada. VS Code solo reconoce fuentes nuevas al abrirse: ciérralo por completo y vuelve a abrirlo para verla.`,
            'Cerrar VS Code ahora', 'Más tarde');
        if (choice === 'Cerrar VS Code ahora') {
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
                { location: vscode.ProgressLocation.Notification, title: `Aura: instalando "${name}"` },
                progress => installer.installFromCatalog(id, spec, message => progress.report({ message })),
            );
            fontsChanged();
            return result.some(r => r.ok);
        } catch (err) {
            log.appendLine(`[fuentes] ${err}`);
            const choice = await vscode.window.showErrorMessage(
                `Aura: no se pudo instalar "${name}" (${err instanceof Error ? err.message : err}).`, 'Ver detalles');
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
            vscode.window.showWarningMessage(`Aura: "${source}" no contenía fuentes válidas.`);
            return;
        }
        const choice = await vscode.window.showInformationMessage(
            `✅ Instalé "${family}" desde ${source}. ¿Dónde quieres usarla?`, 'En el código', 'En la interfaz', 'Solo instalar');
        if (choice === 'En el código' || choice === 'En la interfaz') {
            await applyNamedFont(family, choice === 'En el código' ? 'code' : 'ui');
        }
        await askRestartForFonts(family);
    }

    async function installFontFile(): Promise<void> {
        const files = await vscode.window.showOpenDialog({
            canSelectMany: false,
            openLabel: 'Instalar fuente',
            filters: { Fuentes: ['zip', 'ttf', 'otf', 'ttc'] },
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
            vscode.window.showInformationMessage(`Descarga e instala "${name}" y luego vuelve a elegirla.`);
            return;
        }
        installer.watchDownloads(
            async (fileName, count) => (await vscode.window.showInformationMessage(
                `Aura detectó "${fileName}" en Descargas con ${count} fuente(s). ¿Instalarlas?`, 'Instalar', 'No')) === 'Instalar',
            (fonts, file) => offerInstalled(fonts, path.basename(file)),
        );
        const choice = await vscode.window.showInformationMessage(
            `Descarga "${name}" desde la página. Cuando termine, Aura la detectará en tu carpeta Descargas y te ofrecerá instalarla (durante 15 minutos).`,
            'Ya la tengo: instalar desde archivo…');
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
            const choice = await vscode.window.showWarningMessage(
                `"${font.name}" tiene letras de distinto ancho: el código se verá desalineado. Queda mejor en la interfaz.`,
                'Usar en la interfaz', 'Usar en el código igual');
            if (choice === 'Usar en la interfaz') {
                target = 'ui';
            } else if (choice !== 'Usar en el código igual') {
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
        vscode.window.setStatusBarMessage(`Aura: "${family}" aplicada ${target === 'ui' ? 'en la interfaz' : 'en el código'}`, 3000);
    }

    async function pickInstalled(target?: 'code' | 'ui', filter = ''): Promise<void> {
        const family = await pickInstalledFont(filter);
        if (!family) {
            return;
        }
        if (!target) {
            const where = await vscode.window.showQuickPick(
                [
                    { label: '$(code) En el código', description: 'Editor y terminal', target: 'code' as const },
                    { label: '$(layout) En la interfaz', description: 'Barra lateral, pestañas, menús', target: 'ui' as const },
                ],
                { placeHolder: `¿Dónde usar "${family}"?` },
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
        visibilityItem.tooltip = 'Aura · Visibilidad de VS Code sobre tu escritorio\nClic para cambiarla';
        visibilityItem.show();
    }
    updateVisibilityItem();

    async function setVisibility(value: number): Promise<void> {
        const clamped = Math.round(Math.max(0.3, Math.min(1, value)) * 100) / 100;
        await setSetting('windowOpacity', clamped);
        if (getConfig().background !== 'wallpaper') {
            const choice = await vscode.window.showInformationMessage(
                'La visibilidad solo aplica con el fondo "Mi escritorio (cristal)".', 'Usar ese fondo');
            if (choice) {
                await setBackground('wallpaper');
            }
        }
    }

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

    ctx.subscriptions.push(
        vscode.commands.registerCommand('aura.openCatalog', () => CatalogPanel.show(ctx.extensionUri, actions)),
        vscode.commands.registerCommand('aura.enable', enable),
        vscode.commands.registerCommand('aura.disable', disable),
        vscode.commands.registerCommand('aura.pickImage', pickImage),
        vscode.commands.registerCommand('aura.toggleMusic', async () => {
            const next = !getConfig().musicEnabled;
            await setSetting('music.enabled', next);
            vscode.window.setStatusBarMessage(`Aura: música ${next ? 'sincronizada' : 'desactivada'}`, 3000);
        }),
        vscode.commands.registerCommand('aura.setVisibility', async () => {
            const current = Math.round(getConfig().windowOpacity * 100);
            const levels = [
                { value: 100, label: 'Opaco', detail: 'Sin transparencia' },
                { value: 95, label: 'Destacado', detail: 'VS Code resalta mucho, el escritorio se intuye' },
                { value: 90, label: 'Muy visible', detail: '' },
                { value: 85, label: 'Equilibrado', detail: 'Código y escritorio a partes iguales' },
                { value: 78, label: 'Translúcido', detail: '' },
                { value: 70, label: 'Sutil', detail: 'El escritorio protagoniza' },
                { value: 55, label: 'Fantasma', detail: 'Solo para lucirse' },
            ];
            const pick = await vscode.window.showQuickPick(
                levels.map(l => ({
                    label: `${l.value}%  ${l.label}`,
                    description: l.value === current ? '(actual)' : '',
                    detail: l.detail || undefined,
                    value: l.value,
                })),
                { placeHolder: `Visibilidad de VS Code sobre tu escritorio (ahora ${current}%)` },
            );
            if (pick) {
                await setVisibility(pick.value / 100);
            }
        }),
        vscode.commands.registerCommand('aura.moreVisible', () => setVisibility(getConfig().windowOpacity + 0.05)),
        vscode.commands.registerCommand('aura.lessVisible', () => setVisibility(getConfig().windowOpacity - 0.05)),
        vscode.commands.registerCommand('aura.pickBackground', async () => {
            const current = getConfig().background;
            const items = [
                ...SPECIAL_BACKGROUNDS.map(s => ({ label: `${s.icon}  ${s.name}`, description: s.description, id: s.id as string })),
                { label: '', kind: vscode.QuickPickItemKind.Separator, id: '' },
                ...GRADIENTS.map(g => ({ label: `$(color-mode) ${g.name}`, description: g.description + (g.animated ? ' · animado' : ''), id: g.id })),
            ].map(i => ({ ...i, picked: i.id === current }));
            const pick = await vscode.window.showQuickPick(items, { placeHolder: 'Elige un fondo' });
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
                description: [f.game, f.installed === false ? '$(cloud-download) no instalada' : f.installed ? '$(check) instalada' : '',
                    f.mono === false ? 'decorativa' : ''].filter(Boolean).join(' · '),
                detail: f.note,
                id: f.id,
            });
            const pick = await vscode.window.showQuickPick([
                { label: 'Para programar', kind: vscode.QuickPickItemKind.Separator, id: '' },
                ...fonts.filter(f => f.category !== 'game').map(item),
                { label: 'Videojuegos', kind: vscode.QuickPickItemKind.Separator, id: '' },
                ...fonts.filter(f => f.category === 'game').map(item),
                { label: '', kind: vscode.QuickPickItemKind.Separator, id: '' },
                { label: '$(search) Otra fuente instalada…', description: 'Cualquier fuente de tu equipo', detail: undefined, id: '__installed' },
            ], { placeHolder: 'Elige una fuente para el editor' });
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
                await askReload('Aura cambió de puerto.', true);
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
                vscode.window.showInformationMessage('Aura: cierra VS Code por completo y vuelve a abrirlo para aplicar el cambio de transparencia.');
            }
        } else if (e.affectsConfiguration('aura')) {
            hub.refresh();
        }
        if (e.affectsConfiguration('aura.background') || e.affectsConfiguration('aura.windowOpacity')) {
            applyWindowGlass(ctx.extensionPath, getConfig(), m => log.appendLine(m));
            updateVisibilityItem();
        }
        if (e.affectsConfiguration('aura') || e.affectsConfiguration('editor.fontFamily')) {
            updateStatus(hub.currentTrack);
            CatalogPanel.notify();
        }
    }));

    hub.start();
    checkPatchHealth();
    // Cada ventana nueva aplica el cristal (o lo quita) en todas, incluida ella misma.
    applyWindowGlass(ctx.extensionPath, getConfig(), m => log.appendLine(m));

    // Tras una actualización de VS Code el parche desaparece; o la extensión se actualizó y el
    // código inyectado quedó viejo. En ambos casos ofrecemos reaplicarlo.
    async function checkPatchHealth(): Promise<void> {
        if (!ctx.globalState.get(WANT_PATCHED, false)) {
            if (!ctx.globalState.get('aura.welcomed', false)) {
                await ctx.globalState.update('aura.welcomed', true);
                const choice = await vscode.window.showInformationMessage(
                    '¡Aura Code instalado! Abre el catálogo para elegir fondos, fuentes y sincronizar con tu música.', 'Abrir catálogo');
                if (choice) {
                    CatalogPanel.show(ctx.extensionUri, actions);
                }
            }
            return;
        }
        const injected = core.patchVersion(paths.workbench);
        if (injected === version) {
            return;
        }
        try {
            writePatches();
        } catch (err) {
            explainWriteError(err);
            return;
        }
        await askReload(injected ? 'Aura se actualizó.' : 'VS Code se actualizó y Aura se volvió a aplicar.', true);
    }
}

export function deactivate(): void {
    // Los recursos se liberan mediante ctx.subscriptions.
}
