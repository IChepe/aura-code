// Lógica para inyectar y retirar Aura de los archivos de VS Code.
// No depende de la API de vscode para poder usarse también desde uninstall.ts.
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export const START = '/*! aura-code:start */';
export const END = '/*! aura-code:end */';

const WORKBENCH_REL = 'vs/workbench/workbench.desktop.main.js';
const STATE_DIR = path.join(os.homedir(), '.aura-code');
const STATE_FILE = path.join(STATE_DIR, 'installs.json');

export interface AppPaths {
    workbench: string;
    main: string;
    product: string;
}

export function appPaths(appRoot: string): AppPaths {
    return {
        workbench: path.join(appRoot, 'out', ...WORKBENCH_REL.split('/')),
        main: path.join(appRoot, 'out', 'main.js'),
        product: path.join(appRoot, 'product.json'),
    };
}

function escapeRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const BLOCK = new RegExp('\\n?' + escapeRegExp(START) + '[\\s\\S]*?' + escapeRegExp(END) + '\\n?', 'g');

export function strip(src: string): string {
    return src.replace(BLOCK, '');
}

export function hasPatch(file: string): boolean {
    return fs.existsSync(file) && fs.readFileSync(file, 'utf8').includes(START);
}

/** Versión de Aura escrita en el parche, o null si no hay parche. */
export function patchVersion(file: string): string | null {
    if (!fs.existsSync(file)) {
        return null;
    }
    const m = /aura-code:version=([\w.-]+)/.exec(fs.readFileSync(file, 'utf8'));
    return m ? m[1] : null;
}

function backupOnce(file: string): void {
    const backup = file + '.aura-backup';
    if (!fs.existsSync(backup)) {
        fs.copyFileSync(file, backup);
    }
}

function checksum(buf: Buffer): string {
    return crypto.createHash('sha256').update(buf).digest('base64').replace(/=+$/, '');
}

/** Actualiza product.json para que VS Code no muestre el aviso de "instalación dañada". */
export function fixChecksum(appRoot: string): void {
    const p = appPaths(appRoot);
    const raw = fs.readFileSync(p.product, 'utf8');
    const old: string | undefined = JSON.parse(raw).checksums?.[WORKBENCH_REL];
    if (!old) {
        return;
    }
    const current = checksum(fs.readFileSync(p.workbench));
    if (current !== old) {
        // Reemplazo textual para conservar el formato original del archivo.
        fs.writeFileSync(p.product, raw.replace(old, current));
    }
}

export function writeWorkbenchPatch(appRoot: string, runtime: string): void {
    const p = appPaths(appRoot);
    backupOnce(p.workbench);
    backupOnce(p.product);
    const src = strip(fs.readFileSync(p.workbench, 'utf8'));
    fs.writeFileSync(p.workbench, src + '\n' + START + '\n' + runtime + '\n' + END + '\n');
    fixChecksum(appRoot);
}

/** Inyecta en el proceso principal el material de ventana de Windows 11 (acrílico/mica). */
export function writeMainPatch(appRoot: string, material: 'acrylic' | 'mica' | null): void {
    const p = appPaths(appRoot);
    const src = strip(fs.readFileSync(p.main, 'utf8'));
    if (!material) {
        fs.writeFileSync(p.main, src);
        return;
    }
    backupOnce(p.main);
    const code = [
        'import __auraElectron from "electron";',
        'try {',
        '  __auraElectron.app.on("browser-window-created", (_e, win) => {',
        '    const setBg = win.setBackgroundColor.bind(win);',
        '    const apply = () => { try { setBg("#00000000"); if (win.setBackgroundMaterial) { win.setBackgroundMaterial(' + JSON.stringify(material) + '); } } catch {} };',
        '    win.setBackgroundColor = () => {};',
        '    apply();',
        '    win.once("ready-to-show", apply);',
        '  });',
        '} catch {}',
    ].join('\n');
    fs.writeFileSync(p.main, START + '\n' + code + '\n' + END + '\n' + src);
}

export function removePatches(appRoot: string): void {
    const p = appPaths(appRoot);
    for (const file of [p.workbench, p.main]) {
        if (hasPatch(file)) {
            fs.writeFileSync(file, strip(fs.readFileSync(file, 'utf8')));
        }
    }
    if (fs.existsSync(p.product) && fs.existsSync(p.workbench)) {
        fixChecksum(appRoot);
    }
}

function readInstalls(): string[] {
    try {
        return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    } catch {
        return [];
    }
}

/** Recuerda qué instalaciones fueron modificadas para poder limpiarlas al desinstalar. */
export function rememberInstall(appRoot: string): void {
    const list = readInstalls();
    if (!list.includes(appRoot)) {
        list.push(appRoot);
    }
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(list, null, 2));
}

export function forgetInstall(appRoot: string): void {
    const list = readInstalls().filter(r => r !== appRoot);
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(list, null, 2));
}

export function knownInstalls(): string[] {
    return readInstalls();
}
