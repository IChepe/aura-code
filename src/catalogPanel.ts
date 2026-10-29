import * as crypto from 'crypto';
import * as vscode from 'vscode';
import { GRADIENTS, localize, SPECIAL_BACKGROUNDS } from './catalog';
import { getConfig } from './config';
import { currentFontFamily, fontStatuses, refreshFontCache } from './fonts';
import { getLang, messages, t } from './i18n';
import { TrackInfo } from './media';

export interface CatalogActions {
    setBackground(id: string): Promise<void>;
    pickImage(): Promise<void>;
    applyFont(id: string, target: 'code' | 'ui'): Promise<void>;
    pickInstalledFont(target?: 'code' | 'ui'): Promise<void>;
    resetUiFont(): Promise<void>;
    installFontFile(): Promise<void>;
    setSetting(key: string, value: unknown): Promise<void>;
    enable(): Promise<void>;
    disable(): Promise<void>;
    isPatched(): boolean;
    currentTrack(): TrackInfo;
}

/** Panel web con el catálogo de fondos, fuentes y ajustes. */
export class CatalogPanel {
    private static current?: CatalogPanel;
    private readonly disposables: vscode.Disposable[] = [];

    static show(extensionUri: vscode.Uri, actions: CatalogActions): void {
        if (CatalogPanel.current) {
            CatalogPanel.current.panel.reveal();
            return;
        }
        const panel = vscode.window.createWebviewPanel('auraCatalog', t('ui.catalogTitle'), vscode.ViewColumn.Active, {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
        });
        CatalogPanel.current = new CatalogPanel(panel, extensionUri, actions);
    }

    /** Avisa al panel (si está abierto) que cambió algo. */
    static notify(): void {
        CatalogPanel.current?.sendState();
    }

    /** Cambió el idioma: se vuelve a generar el HTML del panel. */
    static relocalize(): void {
        const current = CatalogPanel.current;
        if (current) {
            current.panel.title = t('ui.catalogTitle');
            current.panel.webview.html = current.html(current.extensionUri);
        }
    }

    static notifyTrack(track: TrackInfo): void {
        CatalogPanel.current?.panel.webview.postMessage({ type: 'track', track });
    }

    private constructor(private readonly panel: vscode.WebviewPanel, private readonly extensionUri: vscode.Uri, private readonly actions: CatalogActions) {
        panel.iconPath = vscode.Uri.joinPath(extensionUri, 'media', 'icon.png');
        panel.webview.html = this.html(extensionUri);
        panel.onDidDispose(() => this.dispose(), null, this.disposables);
        panel.webview.onDidReceiveMessage(m => this.onMessage(m), null, this.disposables);
    }

    private async onMessage(m: any): Promise<void> {
        try {
            switch (m.type) {
                case 'ready':
                    await this.sendState();
                    break;
                case 'setBackground':
                    await this.actions.setBackground(String(m.id));
                    break;
                case 'pickImage':
                    await this.actions.pickImage();
                    break;
                case 'applyFont':
                    await this.actions.applyFont(String(m.id), m.target === 'ui' ? 'ui' : 'code');
                    break;
                case 'pickInstalledFont':
                    await this.actions.pickInstalledFont();
                    break;
                case 'resetUiFont':
                    await this.actions.resetUiFont();
                    break;
                case 'installFontFile':
                    await this.actions.installFontFile();
                    break;
                case 'refreshFonts':
                    refreshFontCache();
                    await this.sendState();
                    break;
                case 'setSetting':
                    await this.actions.setSetting(String(m.key), m.value);
                    break;
                case 'openUrl':
                    if (/^https:\/\//.test(m.url)) {
                        await vscode.env.openExternal(vscode.Uri.parse(m.url));
                    }
                    break;
                case 'enable':
                    await this.actions.enable();
                    break;
                case 'disable':
                    await this.actions.disable();
                    break;
            }
        } catch (err) {
            vscode.window.showErrorMessage(`Aura: ${err instanceof Error ? err.message : err}`);
        }
        await this.sendState();
    }

    private async sendState(): Promise<void> {
        await this.panel.webview.postMessage({
            type: 'state',
            gradients: GRADIENTS.map(g => localize(g, getLang())),
            specials: SPECIAL_BACKGROUNDS.map(b => localize(b, getLang())),
            i18n: messages('ui.'),
            fonts: await fontStatuses(),
            currentFont: currentFontFamily(),
            config: getConfig(),
            patched: this.actions.isPatched(),
            track: this.actions.currentTrack(),
            platform: process.platform,
        });
    }

    private html(extensionUri: vscode.Uri): string {
        const webview = this.panel.webview;
        const nonce = crypto.randomBytes(16).toString('base64');
        const css = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'catalog.css'));
        const js = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'catalog.js'));
        return `<!DOCTYPE html>
<html lang="${getLang()}">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${css}">
<title>${t('ui.catalogTitle')}</title>
</head>
<body>
<header class="hero">
  <div>
    <h1>Aura <span>Code</span></h1>
    <p>${t('ui.subtitle')}</p>
  </div>
  <div class="hero-side">
    <div id="now-playing" class="now-playing" hidden></div>
    <div id="patch-status"></div>
  </div>
</header>

<section>
  <h2>${t('ui.backgrounds')}</h2>
  <div id="specials" class="grid"></div>
  <div id="gradients" class="grid"></div>
</section>

<section>
  <h2>${t('ui.settings')}</h2>
  <div class="settings">
    <label class="wide">${t('ui.visibility')} <output id="windowOpacity-val"></output>
      <input type="range" id="windowOpacity" min="0.3" max="1" step="0.01">
      <span class="presets">
        <button data-visibility="0.7">${t('ui.subtle')}</button>
        <button data-visibility="0.85">${t('ui.balanced')}</button>
        <button data-visibility="0.95">${t('ui.prominent')}</button>
        <button data-visibility="1">${t('ui.opaque')}</button>
      </span></label>
    <label>${t('ui.glass')} <output id="glassOpacity-val"></output>
      <input type="range" id="glassOpacity" min="0.1" max="1" step="0.01"></label>
    <label>${t('ui.dim')} <output id="backgroundDim-val"></output>
      <input type="range" id="backgroundDim" min="0" max="0.95" step="0.01"></label>
    <label>${t('ui.blur')} <output id="backgroundBlur-val"></output>
      <input type="range" id="backgroundBlur" min="0" max="80" step="1"></label>
    <label>${t('ui.reactivity')} <output id="music.reactivity-val"></output>
      <input type="range" id="music.reactivity" min="0" max="2" step="0.05"></label>
    <label class="check"><input type="checkbox" id="music.enabled"> ${t('ui.syncMusic')}</label>
    <label>${t('ui.transparency')}
      <select id="transparency">
        <option value="off">${t('ui.transparencyOff')}</option>
        <option value="acrylic">${t('ui.transparencyAcrylic')}</option>
        <option value="mica">${t('ui.transparencyMica')}</option>
      </select></label>
    <label>${t('ui.language')}
      <select id="language">
        <option value="auto">${t('ui.languageAuto')}</option>
        <option value="es">Español</option>
        <option value="en">English</option>
      </select></label>
  </div>
</section>

<section>
  <div class="section-head">
    <h2>${t('ui.fonts')}</h2>
    <span class="head-actions">
      <button class="link" id="install-file">${t('ui.installFromFile')}</button>
      <button class="link" id="pick-installed">${t('ui.useOtherFont')}</button>
      <button class="link" id="refresh-fonts">${t('ui.rescanFonts')}</button>
    </span>
  </div>
  <div id="ui-font" class="ui-font" hidden></div>
  <h3>${t('ui.fontsForCode')}</h3>
  <div id="fonts" class="fonts"></div>
  <h3>${t('ui.fontsGames')}</h3>
  <p class="hint">${t('ui.gamesHint')}</p>
  <div id="game-fonts" class="fonts"></div>
</section>

<script nonce="${nonce}" src="${js}"></script>
</body>
</html>`;
    }

    private dispose(): void {
        CatalogPanel.current = undefined;
        this.disposables.forEach(d => d.dispose());
    }
}
