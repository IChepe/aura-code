// Se ejecuta con "vscode:uninstall" cuando la extensión se desinstala por completo:
// deja VS Code exactamente como estaba.
import * as fs from 'fs';
import { forgetInstall, knownInstalls, removePatches } from './patchCore';

for (const appRoot of knownInstalls()) {
    try {
        if (fs.existsSync(appRoot)) {
            removePatches(appRoot);
        }
        forgetInstall(appRoot);
    } catch (err) {
        console.error('[aura-code] No se pudo restaurar', appRoot, err);
    }
}
