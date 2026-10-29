import { execFile } from 'child_process';
import * as fs from 'fs';
import * as https from 'https';
import * as os from 'os';
import * as path from 'path';
import { FontDownload } from './catalog';

const FONT_EXT = /\.(ttf|otf|ttc)$/i;
const SKIP_PATH = /__MACOSX|woff|webfont/i;
const USER_AGENT = 'aura-code-vscode-extension';

export interface InstalledFont {
    file: string;
    family: string | null;
    face: string | null;
    ok: boolean;
    error: string | null;
}

/**
 * Descarga e instala fuentes para el usuario actual de Windows, sin servidores propios:
 * baja los archivos de su origen público, descomprime con el tar.exe de Windows e instala con install-font.ps1.
 */
export class FontInstaller {
    private watcher?: fs.FSWatcher;
    private watchTimer?: NodeJS.Timeout;
    private readonly seen = new Set<string>();

    constructor(private readonly extensionPath: string, private readonly log: (msg: string) => void) {}

    static isSupported(): boolean {
        return process.platform === 'win32';
    }

    /** Instala una fuente del catálogo. Devuelve las fuentes instaladas. */
    async installFromCatalog(id: string, spec: FontDownload, report: (msg: string) => void): Promise<InstalledFont[]> {
        const dir = await this.tempDir(id);
        const urls = spec.urls ? [...spec.urls] : [];
        if (spec.github) {
            report('Buscando la última versión en GitHub…');
            urls.push(await this.githubAsset(spec.github.repo, new RegExp(spec.github.asset)));
        }
        const files: string[] = [];
        for (const [i, url] of urls.entries()) {
            report(`Descargando ${urls.length > 1 ? `(${i + 1}/${urls.length}) ` : ''}…`);
            files.push(await this.download(url, dir));
        }
        report('Instalando…');
        const fonts: string[] = [];
        for (const file of files) {
            fonts.push(...await this.fontsIn(file, spec.files ? new RegExp(spec.files, 'i') : undefined));
        }
        return this.install(fonts);
    }

    /** Instala desde un .zip, .ttf, .otf o .ttc que ya está en el equipo. */
    async installFromFile(file: string): Promise<InstalledFont[]> {
        return this.install(await this.fontsIn(file));
    }

    /**
     * Vigila la carpeta de Descargas durante un rato: cuando aparece un paquete con fuentes
     * (por ejemplo, descargado a mano desde una página), pregunta y lo instala.
     * Nunca instala sin confirmación: una página web podría dejar un archivo en Descargas por su cuenta.
     */
    watchDownloads(
        confirm: (fileName: string, fontCount: number) => Thenable<boolean>,
        onInstalled: (fonts: InstalledFont[], file: string) => void,
        minutes = 15,
    ): void {
        const dir = path.join(os.homedir(), 'Downloads');
        if (!fs.existsSync(dir)) {
            return;
        }
        clearTimeout(this.watchTimer);
        this.watchTimer = setTimeout(() => this.stopWatching(), minutes * 60_000);
        if (this.watcher) {
            return;
        }
        this.log(`[fuentes] vigilando ${dir} durante ${minutes} min`);
        this.watcher = fs.watch(dir, (_event, name) => {
            if (!name || !/\.(zip|ttf|otf|ttc)$/i.test(name)) {
                return;
            }
            const file = path.join(dir, name.toString());
            if (this.seen.has(file)) {
                return;
            }
            this.seen.add(file);
            this.whenComplete(file)
                .then(async ok => {
                    if (!ok) {
                        this.seen.delete(file);
                        return;
                    }
                    const fonts = await this.fontsIn(file);
                    if (fonts.length && await confirm(path.basename(file), fonts.length)) {
                        onInstalled(await this.install(fonts), file);
                    }
                })
                .catch(err => this.log(`[fuentes] ${file}: ${err}`));
        });
    }

    stopWatching(): void {
        clearTimeout(this.watchTimer);
        this.watcher?.close();
        this.watcher = undefined;
    }

    dispose(): void {
        this.stopWatching();
    }

    // --- Internos --------------------------------------------------------------------

    private async tempDir(id: string): Promise<string> {
        const dir = path.join(os.tmpdir(), 'aura-code-fonts', `${id}-${Date.now()}`);
        await fs.promises.mkdir(dir, { recursive: true });
        return dir;
    }

    /** Espera a que el navegador termine de escribir el archivo (tamaño estable). */
    private async whenComplete(file: string): Promise<boolean> {
        let last = -1;
        for (let i = 0; i < 30; i++) {
            await new Promise(r => setTimeout(r, 1000));
            let size: number;
            try {
                size = (await fs.promises.stat(file)).size;
            } catch {
                return false;
            }
            if (size > 0 && size === last) {
                return true;
            }
            last = size;
        }
        return false;
    }

    private get(url: string, redirects = 8): Promise<import('http').IncomingMessage> {
        return new Promise((resolve, reject) => {
            const req = https.get(url, { headers: { 'User-Agent': USER_AGENT, Accept: '*/*' }, timeout: 30_000 }, res => {
                const status = res.statusCode ?? 0;
                if (status >= 300 && status < 400 && res.headers.location && redirects > 0) {
                    res.resume();
                    resolve(this.get(new URL(res.headers.location, url).toString(), redirects - 1));
                } else if (status !== 200) {
                    res.resume();
                    reject(new Error(`HTTP ${status} al descargar ${url}`));
                } else {
                    resolve(res);
                }
            });
            req.on('timeout', () => req.destroy(new Error('Tiempo de espera agotado')));
            req.on('error', reject);
        });
    }

    private async githubAsset(repo: string, pattern: RegExp): Promise<string> {
        const res = await this.get(`https://api.github.com/repos/${repo}/releases/latest`);
        let body = '';
        for await (const chunk of res) {
            body += chunk;
        }
        const assets: { name: string; browser_download_url: string }[] = JSON.parse(body).assets ?? [];
        const asset = assets.find(a => pattern.test(a.name));
        if (!asset) {
            throw new Error(`No encontré el archivo de la fuente en ${repo}`);
        }
        return asset.browser_download_url;
    }

    private async download(url: string, dir: string): Promise<string> {
        const res = await this.get(url);
        const disposition = String(res.headers['content-disposition'] ?? '');
        const fromHeader = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition)?.[1];
        let name = decodeURIComponent(fromHeader ?? path.basename(new URL(url).pathname)) || 'font';
        name = name.replace(/[<>:"/\\|?*]/g, '_');
        const file = path.join(dir, name);
        await new Promise<void>((resolve, reject) => {
            const out = fs.createWriteStream(file);
            res.pipe(out);
            out.on('finish', () => resolve());
            out.on('error', reject);
            res.on('error', reject);
        });
        this.log(`[fuentes] descargado ${url} -> ${file}`);
        return file;
    }

    /** Archivos de fuente dentro de un archivo (descomprimiendo si es un .zip). */
    private async fontsIn(file: string, filter?: RegExp): Promise<string[]> {
        const head = Buffer.alloc(2);
        const fd = await fs.promises.open(file, 'r');
        await fd.read(head, 0, 2, 0);
        await fd.close();
        if (head.toString('latin1') !== 'PK') {
            return FONT_EXT.test(file) ? [file] : [];
        }
        const dir = await this.tempDir('zip');
        await this.unzip(file, dir);
        return pickFonts(await walk(dir), filter);
    }

    private unzip(zip: string, dir: string): Promise<void> {
        const tar = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe');
        return new Promise((resolve, reject) => {
            execFile(tar, ['-xf', zip, '-C', dir], { windowsHide: true }, err => {
                if (!err) {
                    resolve();
                    return;
                }
                // Windows sin tar.exe (muy antiguo): PowerShell.
                execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
                    `Expand-Archive -LiteralPath '${zip.replace(/'/g, "''")}' -DestinationPath '${dir.replace(/'/g, "''")}' -Force`],
                    { windowsHide: true }, err2 => (err2 ? reject(err2) : resolve()));
            });
        });
    }

    private async install(fonts: string[]): Promise<InstalledFont[]> {
        if (!fonts.length) {
            throw new Error('El paquete no contiene archivos de fuente (.ttf, .otf o .ttc).');
        }
        const list = path.join(await this.tempDir('list'), 'fonts.txt');
        await fs.promises.writeFile(list, fonts.join('\r\n'), 'utf8');
        const script = path.join(this.extensionPath, 'media', 'install-font.ps1');
        const stdout = await new Promise<string>((resolve, reject) => {
            execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-ListFile', list],
                { windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (err, out, errOut) => (err ? reject(new Error(errOut || err.message)) : resolve(out)));
        });
        const result: InstalledFont[] = JSON.parse(stdout.trim());
        result.filter(r => !r.ok).forEach(r => this.log(`[fuentes] no se pudo instalar ${r.file}: ${r.error}`));
        this.log(`[fuentes] instaladas: ${result.filter(r => r.ok).map(r => `${r.family} ${r.face}`).join(', ')}`);
        return result;
    }
}

async function walk(dir: string): Promise<string[]> {
    const out: string[] = [];
    for (const entry of await fs.promises.readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            out.push(...await walk(full));
        } else {
            out.push(full);
        }
    }
    return out;
}

/** Elige qué archivos instalar de un paquete: TTF antes que OTF, estáticas antes que variables. */
export function pickFonts(all: string[], filter?: RegExp): string[] {
    let fonts = all.filter(f => FONT_EXT.test(f) && !SKIP_PATH.test(f) && (!filter || filter.test(f)));
    const ttf = fonts.filter(f => /\.(ttf|ttc)$/i.test(f));
    if (ttf.length) {
        fonts = ttf;
    }
    const isVariable = (f: string) => /variable|\[.*\]|VF\b/i.test(f);
    const statics = fonts.filter(f => !isVariable(f));
    if (statics.length && statics.length < fonts.length) {
        fonts = statics;
    }
    return fonts.slice(0, 60);
}
