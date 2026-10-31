import { ChildProcess, spawn } from 'child_process';
import { EventEmitter } from 'events';
import * as readline from 'readline';

export interface TrackInfo {
    playing: boolean;
    title: string;
    artist: string;
    album: string;
    app: string;
}

export const NO_TRACK: TrackInfo = { playing: false, title: '', artist: '', album: '', app: '' };

export interface TrackPosition {
    /** Posición en segundos. */
    p: number;
    /** Duración en segundos. */
    d: number;
    /** Momento de la medición (ms desde epoch). */
    u: number;
}

export type MediaCommand = 'playpause' | 'next' | 'prev';

/**
 * Lanza media-watcher.ps1 y traduce su salida a eventos:
 *  'level' (number 0..1), 'spectrum' (number[] 0..100), 'track' (TrackInfo),
 *  'position' (TrackPosition), 'art' (data URL)
 */
export class MediaWatcher extends EventEmitter {
    private proc?: ChildProcess;
    private stopped = true;
    private restartTimer?: NodeJS.Timeout;

    constructor(private readonly scriptPath: string, private readonly log: (msg: string) => void) {
        super();
    }

    static isSupported(): boolean {
        return process.platform === 'win32';
    }

    start(): void {
        if (!MediaWatcher.isSupported() || !this.stopped) {
            return;
        }
        this.stopped = false;
        this.spawn();
    }

    /** Controla el reproductor que está sonando (Spotify, navegador…). */
    command(cmd: MediaCommand): void {
        this.proc?.stdin?.write(cmd + '\n');
    }

    stop(): void {
        this.stopped = true;
        clearTimeout(this.restartTimer);
        this.proc?.kill();
        this.proc = undefined;
    }

    private spawn(): void {
        const proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', this.scriptPath], {
            windowsHide: true,
        });
        this.proc = proc;

        readline.createInterface({ input: proc.stdout! }).on('line', line => this.onLine(line));
        proc.stderr?.on('data', d => this.log('[media] ' + String(d).trim()));
        proc.on('exit', code => {
            if (this.proc === proc) {
                this.proc = undefined;
            }
            if (!this.stopped) {
                this.log(`[media] el observador terminó (código ${code}); reintentando en 5 s`);
                this.restartTimer = setTimeout(() => this.spawn(), 5000);
            }
        });
    }

    private onLine(line: string): void {
        let msg: any;
        try {
            msg = JSON.parse(line);
        } catch {
            return;
        }
        switch (msg.t) {
            case 'l':
                this.emit('level', msg.v);
                break;
            case 's':
                this.emit('spectrum', msg.v);
                break;
            case 'pos':
                this.emit('position', { p: msg.p, d: msg.d, u: msg.u } satisfies TrackPosition);
                break;
            case 'track':
                this.emit('track', {
                    playing: !!msg.playing,
                    title: msg.title ?? '',
                    artist: msg.artist ?? '',
                    album: msg.album ?? '',
                    app: msg.app ?? '',
                } satisfies TrackInfo);
                break;
            case 'art':
                this.emit('art', `data:${sniffMime(msg.b64, msg.mime)};base64,${msg.b64}`);
                break;
            case 'error':
            case 'info':
                this.log(`[media] ${msg.where}: ${msg.msg}`);
                break;
        }
    }
}

/** Windows a veces reporta image/jpeg para PNGs; miramos los primeros bytes. */
function sniffMime(b64: string, fallback: string): string {
    if (b64.startsWith('iVBOR')) {
        return 'image/png';
    }
    if (b64.startsWith('/9j/')) {
        return 'image/jpeg';
    }
    if (b64.startsWith('UklGR')) {
        return 'image/webp';
    }
    return fallback || 'image/jpeg';
}
