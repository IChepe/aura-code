import { execFile } from 'child_process';
import * as vscode from 'vscode';
import { FONT_DOWNLOADS, FONTS, FontEntry } from './catalog';
import { getConfig, setSetting } from './config';

function run(cmd: string, args: string[]): Promise<string> {
    return new Promise(resolve => {
        execFile(cmd, args, { windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (_err, stdout) => resolve(stdout ?? ''));
    });
}

const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '');

// "Super Mario 256 Regular (TrueType)" -> "Super Mario 256"
const STYLE_SUFFIX = /\s+(regular|bold|italic|oblique|light|semilight|thin|medium|semibold|semi bold|demibold|extrabold|extra bold|extralight|black|heavy|book|normal|condensed|negrita|cursiva|oblicua|fina|gruesa)(\s.*)?$/i;

function cleanFamily(name: string): string {
    let n = name.replace(/\s*\((truetype|opentype|all res)\)\s*$/i, '').split(' & ')[0].trim();
    while (STYLE_SUFFIX.test(n)) {
        n = n.replace(STYLE_SUFFIX, '').trim();
    }
    return n;
}

let cache: Promise<string[] | null> | undefined;

/** Familias de fuentes instaladas, o null si no se puede saber en este sistema. */
export function installedFamilies(): Promise<string[] | null> {
    cache ??= (async () => {
        let names: string[];
        if (process.platform === 'win32') {
            const key = 'SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts';
            const out = (await run('reg', ['query', 'HKLM\\' + key])) + (await run('reg', ['query', 'HKCU\\' + key]));
            names = out
                .split(/\r?\n/)
                .map(l => /^\s+(.+?)\s+REG_SZ/.exec(l)?.[1])
                .filter((n): n is string => !!n);
        } else {
            const out = await run('fc-list', [':', 'family']);
            if (!out) {
                return null;
            }
            names = out.split(/\r?\n/).map(l => l.split(',')[0]);
        }
        return [...new Set(names.map(cleanFamily).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    })();
    return cache;
}

export interface FontStatus extends FontEntry {
    installed: boolean | null;
    /** Nombre real con el que está instalada (puede diferir del nombre del catálogo). */
    resolvedFamily: string;
    /** Aura puede descargarla e instalarla sola. */
    autoInstall: boolean;
}

export async function fontStatuses(): Promise<FontStatus[]> {
    const families = await installedFamilies();
    return FONTS.map(f => {
        const wanted = normalize(f.match ?? f.family);
        const found = families?.find(n => normalize(n) === wanted) ?? families?.find(n => normalize(n).includes(wanted));
        return {
            ...f,
            installed: families ? !!found : null,
            resolvedFamily: found ?? f.family,
            autoInstall: process.platform === 'win32' && !!FONT_DOWNLOADS[f.id],
        };
    });
}

export function refreshFontCache(): void {
    cache = undefined;
}

/** @param mono false = fuente decorativa: la terminal solo acepta monoespaciadas, así que no se toca. */
export async function applyCodeFont(family: string, ligatures: boolean, mono = true): Promise<void> {
    const value = `'${family}', Consolas, 'Courier New', monospace`;
    const editor = vscode.workspace.getConfiguration('editor');
    await editor.update('fontFamily', value, vscode.ConfigurationTarget.Global);
    await editor.update('fontLigatures', ligatures, vscode.ConfigurationTarget.Global);
    if (getConfig().fontApplyToTerminal && mono) {
        await vscode.workspace.getConfiguration('terminal.integrated').update('fontFamily', value, vscode.ConfigurationTarget.Global);
    }
}

/** Fuente de la interfaz (barra lateral, pestañas, menús). La aplica Aura con CSS. */
export function applyUiFont(family: string): Thenable<void> {
    return setSetting('uiFont', family);
}

export function currentFontFamily(): string {
    return vscode.workspace.getConfiguration('editor').get('fontFamily', '');
}

/** Selector con todas las fuentes instaladas, para usar cualquiera (por ejemplo una de juegos). */
export async function pickInstalledFont(filter = ''): Promise<string | undefined> {
    const families = await installedFamilies();
    if (!families) {
        return vscode.window.showInputBox({ prompt: 'Nombre exacto de la fuente instalada' });
    }
    const qp = vscode.window.createQuickPick();
    qp.items = families.map(label => ({ label }));
    qp.placeholder = 'Elige una fuente instalada en tu equipo';
    qp.value = filter;
    return new Promise(resolve => {
        qp.onDidAccept(() => {
            resolve(qp.selectedItems[0]?.label);
            qp.hide();
        });
        qp.onDidHide(() => {
            resolve(undefined);
            qp.dispose();
        });
        qp.show();
    });
}
