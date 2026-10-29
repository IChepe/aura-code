# Aura Code - hace translúcidas todas las ventanas de VS Code (modo "Cristal").
# Uso: window-opacity.ps1 -Alpha 220   (0-255; 255 = opaca, quita el efecto)
param([int]$Alpha = 255, [string]$ProcessName = 'Code')

$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @"
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

public static class AuraWindowGlass {
    delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr lParam);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr hWnd, StringBuilder s, int n);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowTextLength(IntPtr hWnd);
    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")] static extern IntPtr GetWindowLongPtr(IntPtr hWnd, int index);
    [DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW")] static extern IntPtr SetWindowLongPtr(IntPtr hWnd, int index, IntPtr value);
    [DllImport("user32.dll")] static extern bool SetLayeredWindowAttributes(IntPtr hWnd, uint key, byte alpha, uint flags);

    const int GWL_EXSTYLE = -20;
    const long WS_EX_LAYERED = 0x80000;
    const uint LWA_ALPHA = 0x2;

    public static int Apply(string processName, byte alpha) {
        int count = 0;
        EnumWindows((hWnd, l) => {
            if (!IsWindowVisible(hWnd) || GetWindowTextLength(hWnd) == 0) return true;
            var cls = new StringBuilder(64);
            GetClassName(hWnd, cls, cls.Capacity);
            if (cls.ToString() != "Chrome_WidgetWin_1") return true;
            uint pid;
            GetWindowThreadProcessId(hWnd, out pid);
            try {
                if (!string.Equals(Process.GetProcessById((int)pid).ProcessName, processName, StringComparison.OrdinalIgnoreCase)) return true;
            } catch { return true; }

            long style = GetWindowLongPtr(hWnd, GWL_EXSTYLE).ToInt64();
            if (alpha >= 255) {
                if ((style & WS_EX_LAYERED) != 0) {
                    SetLayeredWindowAttributes(hWnd, 0, 255, LWA_ALPHA);
                    SetWindowLongPtr(hWnd, GWL_EXSTYLE, new IntPtr(style & ~WS_EX_LAYERED));
                }
            } else {
                SetWindowLongPtr(hWnd, GWL_EXSTYLE, new IntPtr(style | WS_EX_LAYERED));
                SetLayeredWindowAttributes(hWnd, 0, alpha, LWA_ALPHA);
            }
            count++;
            return true;
        }, IntPtr.Zero);
        return count;
    }
}
"@

$a = [Math]::Max(25, [Math]::Min(255, $Alpha))
[AuraWindowGlass]::Apply($ProcessName, [byte]$a)
