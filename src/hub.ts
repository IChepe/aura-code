import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { WebSocket, WebSocketServer } from 'ws';
import { findGradient } from './catalog';
import { AuraConfig, getConfig } from './config';
import { t } from './i18n';
import { fileToDataUrl } from './images';
import { MediaCommand, MediaWatcher, NO_TRACK, TrackInfo, TrackPosition } from './media';

const DIAG_DIR = path.join(os.homedir(), '.aura-code');
/** Identifica esta compilación: una más nueva le quita el control a una ventana con código viejo. */
const BUILD = fs.statSync(__filename).mtimeMs;

/**
 * Cada ventana de VS Code tiene su propio proceso de extensión. La primera que logra abrir
 * el puerto se vuelve "dueña": observa la música y envía los efectos a todas las ventanas.
 * Las demás se conectan como clientes solo para mostrar la canción en la barra de estado.
 */
export class AuraHub implements vscode.Disposable {
    private wss?: WebSocketServer;
    private client?: WebSocket;
    private retryTimer?: NodeJS.Timeout;
    private disposed = false;
    private readonly media: MediaWatcher;

    private track: TrackInfo = NO_TRACK;
    private artUrl: string | null = null;
    private imageUrl: string | null = null;
    private imageKey = '';
    private starting = false;

    private position: TrackPosition | null = null;

    private readonly trackEmitter = new vscode.EventEmitter<TrackInfo>();
    readonly onTrack = this.trackEmitter.event;
    private readonly artEmitter = new vscode.EventEmitter<string | null>();
    readonly onArt = this.artEmitter.event;
    private readonly spectrumEmitter = new vscode.EventEmitter<number[]>();
    readonly onSpectrum = this.spectrumEmitter.event;
    private readonly positionEmitter = new vscode.EventEmitter<TrackPosition>();
    readonly onPosition = this.positionEmitter.event;

    constructor(private readonly extensionPath: string, private readonly log: vscode.OutputChannel) {
        this.media = new MediaWatcher(path.join(extensionPath, 'media', 'media-watcher.ps1'), m => log.appendLine(m));
        this.media.on('level', (v: number) => this.broadcast(JSON.stringify({ t: 'l', v }), 'windows'));
        this.media.on('spectrum', (v: number[]) => {
            this.spectrumEmitter.fire(v);
            this.broadcast(JSON.stringify({ t: 's', v }), 'ext');
        });
        this.media.on('position', (p: TrackPosition) => {
            this.position = p;
            this.positionEmitter.fire(p);
            this.broadcast(JSON.stringify({ t: 'pos', ...p }), 'ext');
        });
        this.media.on('track', (t: TrackInfo) => {
            this.setTrack(t);
            this.broadcast(JSON.stringify({ t: 'track', ...t }));
        });
        this.media.on('art', (url: string) => {
            this.setArt(url);
            this.broadcast(JSON.stringify({ t: 'art', url }));
        });
    }

    get isOwner(): boolean {
        return !!this.wss;
    }

    get currentTrack(): TrackInfo {
        return this.track;
    }

    get currentArt(): string | null {
        return this.artUrl;
    }

    get currentPosition(): TrackPosition | null {
        return this.position;
    }

    /** Botones del reproductor: los ejecuta la ventana dueña (la que observa la música). */
    sendCommand(cmd: MediaCommand): void {
        if (this.wss) {
            this.media.command(cmd);
        } else if (this.client?.readyState === WebSocket.OPEN) {
            this.client.send(JSON.stringify({ t: 'cmd', c: cmd }));
        }
    }

    private setTrack(t: TrackInfo): void {
        this.track = t;
        if (!t.title) {
            this.setArt(null);
            this.position = null;
        }
        this.trackEmitter.fire(t);
    }

    private setArt(url: string | null): void {
        this.artUrl = url;
        this.artEmitter.fire(url);
    }

    start(): void {
        this.tryOwn();
    }

    private tryOwn(): void {
        if (this.disposed || this.wss || this.starting) {
            return;
        }
        this.starting = true;
        const port = getConfig().port;
        const wss = new WebSocketServer({
            host: '127.0.0.1',
            port,
            // Solo aceptamos ventanas de VS Code y otros procesos de extensión (sin Origin).
            // Así una página web no puede conectarse y leer qué música escuchas.
            verifyClient: (info: { origin?: string }) => !info.origin || info.origin.startsWith('vscode-file://'),
        });
        wss.on('listening', () => {
            this.starting = false;
            this.log.appendLine(`[hub] escuchando en 127.0.0.1:${port}; esta ventana controla los efectos`);
            this.wss = wss;
            this.client?.close();
            this.client = undefined;
            this.refresh();
        });
        wss.on('error', (err: NodeJS.ErrnoException) => {
            this.starting = false;
            wss.close();
            if (this.wss === wss) {
                this.wss = undefined;
            }
            if (err.code === 'EADDRINUSE') {
                this.connectAsClient(port);
            } else {
                this.log.appendLine(`[hub] error del servidor: ${err.message}`);
                this.scheduleRetry(10000);
            }
        });
        wss.on('connection', (sock, req) => {
            const isWindow = (req.url ?? '').includes('role=window');
            (sock as any).isWindow = isWindow;
            this.sendInitial(sock);
            if (isWindow) {
                sock.on('message', data => this.onWindowMessage(String(data)));
                // Con aura.debug: un informe por ventana al conectarse, para depurar problemas de dibujo.
                if (vscode.workspace.getConfiguration('aura').get('debug', false)) {
                    setTimeout(() => sock.readyState === WebSocket.OPEN && sock.send(JSON.stringify({ t: 'diag' })), 4000);
                }
            } else {
                sock.on('message', data => this.onExtensionMessage(String(data)));
            }
        });
    }

    /** Mensajes de otras ventanas: botones del reproductor, o una versión más nueva que toma el control. */
    private onExtensionMessage(raw: string): void {
        let m: any;
        try {
            m = JSON.parse(raw);
        } catch {
            return;
        }
        if (m.t === 'cmd' && ['playpause', 'next', 'prev'].includes(m.c)) {
            this.media.command(m.c);
        } else if (m.t === 'hello' && typeof m.build === 'number' && m.build > BUILD && this.wss) {
            this.log.appendLine('[hub] otra ventana tiene una versión más nueva de Aura; le cedo el control');
            const wss = this.wss;
            this.wss = undefined;
            this.media.stop();
            wss.clients.forEach(c => c.terminate());
            wss.close();
            this.scheduleRetry(5000);
        }
    }

    private connectAsClient(port: number): void {
        if (this.disposed || this.client) {
            return;
        }
        const ws = new WebSocket(`ws://127.0.0.1:${port}/?role=ext`);
        this.client = ws;
        ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', build: BUILD })));
        ws.on('message', data => {
            try {
                const m = JSON.parse(String(data));
                switch (m.t) {
                    case 'track':
                        this.setTrack({ playing: m.playing, title: m.title, artist: m.artist, album: m.album, app: m.app });
                        break;
                    case 'art':
                        this.setArt(m.url);
                        break;
                    case 's':
                        this.spectrumEmitter.fire(m.v);
                        break;
                    case 'pos':
                        this.position = { p: m.p, d: m.d, u: m.u };
                        this.positionEmitter.fire(this.position);
                        break;
                }
            } catch {
                // ignorar mensajes no válidos
            }
        });
        ws.on('error', () => undefined);
        ws.on('close', () => {
            if (this.client === ws) {
                this.client = undefined;
            }
            // La ventana dueña se cerró: intentamos tomar su lugar.
            this.scheduleRetry(1000 + Math.random() * 2000);
        });
    }

    private scheduleRetry(ms: number): void {
        clearTimeout(this.retryTimer);
        this.retryTimer = setTimeout(() => this.tryOwn(), ms);
    }

    private configMessage(cfg: AuraConfig): string {
        const gradient = findGradient(cfg.background);
        let kind: string;
        if (gradient) {
            kind = 'gradient';
        } else if (cfg.background === 'image') {
            kind = 'image';
        } else if (cfg.background === 'album') {
            kind = 'album';
        } else {
            // 'wallpaper' tampoco dibuja nada: Windows hace translúcida la ventana (ver windowGlass.ts).
            kind = 'none';
        }
        return JSON.stringify({
            t: 'config',
            kind,
            id: cfg.background,
            css: gradient?.css ?? '',
            animated: gradient?.animated ?? false,
            accent: gradient?.accent ?? ['#6a3093', '#0f9b8e'],
            // El cristal ahora lo aplica aura.css; 1 desactiva el método anterior del runtime
            // (variables translúcidas que se sumaban capa sobre capa).
            glass: 1,
            blur: cfg.backgroundBlur,
            dim: cfg.backgroundDim,
            music: cfg.musicEnabled && MediaWatcher.isSupported(),
            reactivity: cfg.musicReactivity,
            transparency: cfg.transparency === 'acrylic' || cfg.transparency === 'mica' ? cfg.transparency : 'off',
        });
    }

    /** Relee la configuración y la envía a todas las ventanas. */
    async refresh(): Promise<void> {
        if (!this.wss) {
            return;
        }
        const cfg = getConfig();
        if (cfg.musicEnabled) {
            this.media.start();
        } else {
            this.media.stop();
            this.setTrack(NO_TRACK);
            this.broadcast(JSON.stringify({ t: 'track', ...NO_TRACK }));
        }

        this.broadcast(this.configMessage(cfg));
        const css = this.cssMessage(cfg);
        if (css) {
            this.broadcast(css, 'windows');
        }

        const file = cfg.background === 'image' ? cfg.customImage || null : null;
        const key = file ?? '';
        if (key !== this.imageKey) {
            this.imageKey = key;
            try {
                this.imageUrl = file ? await fileToDataUrl(file) : null;
            } catch (err) {
                this.imageUrl = null;
                vscode.window.showWarningMessage(t('bg.imageReadError', String(file)));
                this.log.appendLine(`[hub] ${err}`);
            }
            this.broadcast(JSON.stringify({ t: 'image', url: this.imageUrl }), 'windows');
        }
    }

    /** media/aura.css con la opacidad del cristal aplicada. */
    private cssMessage(cfg: AuraConfig): string | null {
        try {
            let text = fs.readFileSync(path.join(this.extensionPath, 'media', 'aura.css'), 'utf8')
                .replace(/__GLASS__/g, String(Math.round(cfg.glassOpacity * 100)));
            if (cfg.uiFont) {
                // Solo en la raíz: los elementos con fuente propia (iconos, editor) no se ven afectados.
                // Sin var(): si la variable no existe ahí, el navegador descarta toda la regla y usa una fuente serif.
                const family = cfg.uiFont.replace(/["\\;{}<>]/g, '');
                text += `\n.monaco-workbench { font-family: "${family}", "Segoe WPC", "Segoe UI", system-ui, sans-serif !important; }\n`;
            }
            return JSON.stringify({ t: 'css', text });
        } catch {
            return null;
        }
    }

    private onWindowMessage(raw: string): void {
        let m: any;
        try {
            m = JSON.parse(raw);
        } catch {
            return;
        }
        if (m.t === 'diag') {
            const text = JSON.stringify(m.data, null, 2);
            this.log.appendLine('[diag] ' + text);
            try {
                fs.mkdirSync(DIAG_DIR, { recursive: true });
                fs.writeFileSync(path.join(DIAG_DIR, 'diag.json'), text);
            } catch {
                // solo es informativo
            }
        }
    }

    private sendInitial(sock: WebSocket): void {
        const isWindow = (sock as any).isWindow;
        sock.send(JSON.stringify({ t: 'track', ...this.track }));
        if (this.artUrl) {
            sock.send(JSON.stringify({ t: 'art', url: this.artUrl }));
        }
        if (!isWindow) {
            if (this.position) {
                sock.send(JSON.stringify({ t: 'pos', ...this.position }));
            }
            return;
        }
        const css = this.cssMessage(getConfig());
        if (css) {
            sock.send(css);
        }
        sock.send(this.configMessage(getConfig()));
        sock.send(JSON.stringify({ t: 'image', url: this.imageUrl }));
    }

    /**
     * @param to 'windows' = solo ventanas (efectos, imágenes pesadas);
     *           'ext' = solo otros procesos de extensión (reproductor de la pestaña Música).
     */
    private broadcast(msg: string, to: 'all' | 'windows' | 'ext' = 'all'): void {
        if (!this.wss) {
            return;
        }
        for (const sock of this.wss.clients) {
            const isWindow = !!(sock as any).isWindow;
            if (sock.readyState === WebSocket.OPEN && (to === 'all' || (to === 'windows') === isWindow)) {
                sock.send(msg);
            }
        }
    }

    /** Reinicia el servidor (por ejemplo, si cambió el puerto). */
    restart(): void {
        this.wss?.close();
        this.wss = undefined;
        this.client?.close();
        this.client = undefined;
        this.media.stop();
        this.imageKey = '';
        this.tryOwn();
    }

    dispose(): void {
        this.disposed = true;
        clearTimeout(this.retryTimer);
        this.media.stop();
        this.wss?.close();
        this.client?.close();
        this.trackEmitter.dispose();
        this.artEmitter.dispose();
        this.spectrumEmitter.dispose();
        this.positionEmitter.dispose();
    }
}
