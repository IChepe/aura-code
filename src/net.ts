import * as fs from 'fs';
import type { IncomingMessage } from 'http';
import * as https from 'https';
import * as path from 'path';

const USER_AGENT = 'aura-code-vscode-extension';

/** GET solo por HTTPS (https.get rechaza redirecciones a http://), siguiendo redirecciones. */
export function httpsGet(url: string, redirects = 8): Promise<IncomingMessage> {
    return new Promise((resolve, reject) => {
        const req = https.get(url, { headers: { 'User-Agent': USER_AGENT, Accept: '*/*' }, timeout: 30_000 }, res => {
            const status = res.statusCode ?? 0;
            if (status >= 300 && status < 400 && res.headers.location && redirects > 0) {
                res.resume();
                resolve(httpsGet(new URL(res.headers.location, url).toString(), redirects - 1));
            } else if (status !== 200) {
                res.resume();
                reject(new Error(`HTTP ${status} (${url})`));
            } else {
                resolve(res);
            }
        });
        req.on('timeout', () => req.destroy(new Error('timeout')));
        req.on('error', reject);
    });
}

export async function httpsJson<T>(url: string): Promise<T> {
    const res = await httpsGet(url);
    let body = '';
    for await (const chunk of res) {
        body += chunk;
    }
    return JSON.parse(body) as T;
}

/** Descarga a una carpeta; el nombre sale de Content-Disposition o de la URL. */
export async function downloadTo(url: string, dir: string): Promise<string> {
    const res = await httpsGet(url);
    const disposition = String(res.headers['content-disposition'] ?? '');
    const fromHeader = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition)?.[1];
    let name = decodeURIComponent(fromHeader ?? path.basename(new URL(url).pathname)) || 'download';
    name = name.replace(/[<>:"/\\|?*]/g, '_');
    const file = path.join(dir, name);
    await new Promise<void>((resolve, reject) => {
        const out = fs.createWriteStream(file);
        res.pipe(out);
        out.on('finish', () => resolve());
        out.on('error', reject);
        res.on('error', reject);
    });
    return file;
}

export interface GithubRelease {
    tag_name: string;
    html_url: string;
    assets: { name: string; browser_download_url: string }[];
}

export function latestRelease(repo: string): Promise<GithubRelease> {
    return httpsJson<GithubRelease>(`https://api.github.com/repos/${repo}/releases/latest`);
}
