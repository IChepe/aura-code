import * as fs from 'fs';
import * as path from 'path';

const MIME: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
    '.svg': 'image/svg+xml',
    '.avif': 'image/avif',
};

export const IMAGE_EXTENSIONS = Object.keys(MIME).map(e => e.slice(1));

export async function fileToDataUrl(file: string): Promise<string> {
    const data = await fs.promises.readFile(file);
    const mime = MIME[path.extname(file).toLowerCase()] ?? 'image/jpeg';
    return `data:${mime};base64,${data.toString('base64')}`;
}
