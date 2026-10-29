import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { t } from './i18n';
import { downloadTo, latestRelease } from './net';

const REPO = 'IChepe/aura-code';
const DAY = 24 * 60 * 60 * 1000;
const LAST_CHECK = 'aura.lastUpdateCheck';
const SKIPPED = 'aura.skippedVersion';

function parse(v: string): number[] {
    return v.replace(/^v/, '').split(/[.-]/).slice(0, 3).map(n => parseInt(n, 10) || 0);
}

export function isNewer(candidate: string, current: string): boolean {
    const a = parse(candidate), b = parse(current);
    for (let i = 0; i < 3; i++) {
        if (a[i] !== b[i]) {
            return a[i] > b[i];
        }
    }
    return false;
}

/**
 * Avisa cuando hay una versión nueva en los Releases de GitHub y la instala con un clic.
 * Si Aura se instaló desde el Marketplace, VS Code ya se encarga de actualizarla y esto no hace nada.
 */
export class Updater {
    constructor(private readonly ctx: vscode.ExtensionContext, private readonly log: (msg: string) => void) {}

    private get version(): string {
        return this.ctx.extension.packageJSON.version;
    }

    private get fromMarketplace(): boolean {
        const meta = this.ctx.extension.packageJSON.__metadata;
        return !!meta && (meta.source === 'gallery' || !!meta.publisherId);
    }

    /** @param manual true cuando lo pide el usuario: ignora el intervalo, la versión omitida y avisa si está al día. */
    async check(manual = false): Promise<void> {
        const enabled = vscode.workspace.getConfiguration('aura').get('checkForUpdates', true);
        if (!manual) {
            if (!enabled || this.fromMarketplace || Date.now() - this.ctx.globalState.get(LAST_CHECK, 0) < DAY) {
                return;
            }
        }
        await this.ctx.globalState.update(LAST_CHECK, Date.now());

        let release;
        try {
            release = await latestRelease(REPO);
        } catch (err) {
            this.log(`[actualizaciones] ${err}`);
            if (manual) {
                vscode.window.showWarningMessage(t('update.checkFailed', String(err instanceof Error ? err.message : err)));
            }
            return;
        }
        const latest = release.tag_name.replace(/^v/, '');
        if (!isNewer(latest, this.version)) {
            if (manual) {
                vscode.window.showInformationMessage(t('update.upToDate', this.version));
            }
            return;
        }
        if (!manual && this.ctx.globalState.get(SKIPPED) === latest) {
            return;
        }

        const choice = await vscode.window.showInformationMessage(
            t('update.available', latest, this.version), t('btn.update'), t('btn.releaseNotes'), t('btn.skipVersion'));
        if (choice === t('btn.releaseNotes')) {
            await vscode.env.openExternal(vscode.Uri.parse(release.html_url));
        } else if (choice === t('btn.skipVersion')) {
            await this.ctx.globalState.update(SKIPPED, latest);
        } else if (choice === t('btn.update')) {
            const asset = release.assets.find(a => a.name.endsWith('.vsix'));
            if (!asset) {
                await vscode.env.openExternal(vscode.Uri.parse(release.html_url));
                return;
            }
            await this.install(asset.browser_download_url, latest);
        }
    }

    private async install(url: string, latest: string): Promise<void> {
        try {
            await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: t('update.downloading', latest) },
                async () => {
                    const dir = path.join(os.tmpdir(), 'aura-code-update', String(Date.now()));
                    await fs.promises.mkdir(dir, { recursive: true });
                    const vsix = await downloadTo(url, dir);
                    await vscode.commands.executeCommand('workbench.extensions.installExtension', vscode.Uri.file(vsix));
                },
            );
        } catch (err) {
            this.log(`[actualizaciones] ${err}`);
            vscode.window.showErrorMessage(t('update.failed', String(err instanceof Error ? err.message : err)));
            return;
        }
        const choice = await vscode.window.showInformationMessage(t('update.done', latest), t('btn.reload'));
        if (choice) {
            await vscode.commands.executeCommand('workbench.action.reloadWindow');
        }
    }
}
