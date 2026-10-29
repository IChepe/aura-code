import * as vscode from 'vscode';

export type Transparency = 'off' | 'acrylic' | 'mica';

export interface AuraConfig {
    background: string;
    customImage: string;
    glassOpacity: number;
    backgroundBlur: number;
    backgroundDim: number;
    musicEnabled: boolean;
    musicReactivity: number;
    transparency: Transparency;
    windowOpacity: number;
    uiFont: string;
    language: 'auto' | 'es' | 'en';
    fontApplyToTerminal: boolean;
    port: number;
}

export function getConfig(): AuraConfig {
    const c = vscode.workspace.getConfiguration('aura');
    return {
        background: c.get('background', 'aurora'),
        customImage: c.get('customImage', ''),
        glassOpacity: c.get('glassOpacity', 0.78),
        backgroundBlur: c.get('backgroundBlur', 0),
        backgroundDim: c.get('backgroundDim', 0.35),
        musicEnabled: c.get('music.enabled', true),
        musicReactivity: c.get('music.reactivity', 1),
        transparency: c.get('transparency', 'off'),
        windowOpacity: c.get('windowOpacity', 0.92),
        uiFont: c.get('uiFont', ''),
        language: c.get('language', 'auto'),
        fontApplyToTerminal: c.get('fontApplyToTerminal', true),
        port: c.get('port', 47823),
    };
}

export function setSetting(key: string, value: unknown): Thenable<void> {
    return vscode.workspace.getConfiguration('aura').update(key, value, vscode.ConfigurationTarget.Global);
}
