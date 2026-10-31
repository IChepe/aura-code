import * as crypto from 'crypto';
import * as vscode from 'vscode';
import { getConfig } from './config';
import { getLang, messages, t } from './i18n';
import { AuraHub } from './hub';
import { MediaCommand, MediaWatcher } from './media';

/** Pestaña "Música" del panel inferior (junto a Problems, Output, Terminal): reproductor con visualizador. */
export class MusicViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
    static readonly viewId = 'aura.musicView';
    private view?: vscode.WebviewView;
    private readonly disposables: vscode.Disposable[] = [];

    constructor(private readonly extensionUri: vscode.Uri, private readonly hub: AuraHub, private readonly log: (msg: string) => void) {
        this.disposables.push(
            hub.onTrack(() => this.sendState()),
            hub.onArt(url => this.post({ type: 'art', url })),
            hub.onPosition(pos => this.post({ type: 'pos', pos })),
            // El espectro llega ~40 veces por segundo: solo se envía si la pestaña está a la vista.
            hub.onSpectrum(v => this.view?.visible && this.post({ type: 's', v })),
            vscode.workspace.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration('aura.music') || e.affectsConfiguration('editor.fontFamily')) {
                    this.sendState();
                }
            }),
        );
    }

    resolveWebviewView(view: vscode.WebviewView): void {
        this.view = view;
        view.webview.options = { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')] };
        view.webview.html = this.html(view.webview);
        view.webview.onDidReceiveMessage((m: { type: string; cmd?: MediaCommand; message?: string }) => {
            if (m.type === 'clientError') {
                this.log(`[música] error en el panel: ${m.message}`);
            } else if (m.type === 'ready') {
                this.sendState();
            } else if (m.type === 'cmd' && m.cmd) {
                this.hub.sendCommand(m.cmd);
            } else if (m.type === 'enableMusic') {
                vscode.workspace.getConfiguration('aura').update('music.enabled', true, vscode.ConfigurationTarget.Global);
            }
        }, null, this.disposables);
        view.onDidChangeVisibility(() => view.visible && this.sendState(), null, this.disposables);
    }

    /** Cambió el idioma: se vuelve a generar el HTML. */
    relocalize(): void {
        if (this.view) {
            this.view.webview.html = this.html(this.view.webview);
        }
    }

    private sendState(): void {
        this.post({
            type: 'state',
            track: this.hub.currentTrack,
            art: this.hub.currentArt,
            pos: this.hub.currentPosition,
            enabled: getConfig().musicEnabled,
            supported: MediaWatcher.isSupported(),
            i18n: messages('player.'),
        });
    }

    private post(msg: unknown): void {
        this.view?.webview.postMessage(msg);
    }

    private html(webview: vscode.Webview): string {
        const nonce = crypto.randomBytes(16).toString('base64');
        const css = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'player.css'));
        const js = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'player.js'));
        return `<!DOCTYPE html>
<html lang="${getLang()}">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: ${webview.cspSource}; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${css}">
</head>
<body>
<section class="window" id="player">
  <header>
    <span>AUDIO</span>
    <button class="square" id="style" title="${t('player.style')}"></button>
  </header>
  <div class="body">
    <div id="empty" class="empty" hidden></div>
    <div id="content">
      <h1 id="title"></h1>
      <p id="artist"></p>
      <div class="row">
        <div class="art"><img id="art" alt="" hidden></div>
        <canvas id="bars"></canvas>
      </div>
      <div class="status">
        <span id="state"></span>
        <span class="controls">
          <button id="prev" title="${t('player.prev')}"><svg viewBox="0 0 16 16"><path d="M3 3h2v10H3zM13 3v10L6 8z"/></svg></button>
          <button id="playpause" title="${t('player.playPause')}"><svg viewBox="0 0 16 16"><path d="M2 3v10l6-5zM10 3h2v10h-2zM13 3h2v10h-2z"/></svg></button>
          <button id="next" title="${t('player.next')}"><svg viewBox="0 0 16 16"><path d="M11 3h2v10h-2zM3 3v10l7-5z"/></svg></button>
        </span>
        <span id="time"></span>
      </div>
      <div class="progress"><div id="progress"></div></div>
    </div>
  </div>
</section>
<script nonce="${nonce}" src="${js}"></script>
</body>
</html>`;
    }

    dispose(): void {
        this.disposables.forEach(d => d.dispose());
    }
}
