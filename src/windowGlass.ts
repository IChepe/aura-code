import { execFile } from 'child_process';
import * as path from 'path';
import { AuraConfig } from './config';

/**
 * Modo "Cristal": le pide a Windows que dibuje todas las ventanas de VS Code con cierta opacidad
 * (SetLayeredWindowAttributes). Así se ve el escritorio o Wallpaper Engine en vivo detrás, nítido,
 * sin parchear nada y sin reiniciar.
 */
export function applyWindowGlass(extensionPath: string, cfg: AuraConfig, log: (msg: string) => void): void {
    if (process.platform !== 'win32') {
        return;
    }
    // Solo el fondo "Mi escritorio (cristal)" vuelve translúcida la ventana; los demás la dejan opaca.
    const opacity = cfg.background === 'wallpaper' ? cfg.windowOpacity : 1;
    const alpha = Math.round(Math.max(0.1, Math.min(1, opacity)) * 255);
    const script = path.join(extensionPath, 'media', 'window-opacity.ps1');
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-Alpha', String(alpha)],
        { windowsHide: true },
        (err, stdout) => log(err ? `[cristal] error: ${err.message}` : `[cristal] opacidad ${alpha}/255 en ${stdout.trim()} ventana(s)`));
}
