# Aura Code - instala fuentes solo para el usuario actual (sin permisos de administrador).
# Uso: install-font.ps1 -ListFile lista.txt [-DryRun]
#   lista.txt: una ruta de archivo .ttf/.otf/.ttc por línea (UTF-8).
# Devuelve JSON: [{ file, family, face, ok, error }]
param([Parameter(Mandatory = $true)][string]$ListFile, [switch]$DryRun)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -AssemblyName PresentationCore
Add-Type -Namespace Aura -Name FontNative -MemberDefinition @'
[DllImport("gdi32.dll", CharSet = CharSet.Unicode)]
public static extern int AddFontResourceW(string file);
[DllImport("user32.dll")]
public static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam, uint flags, uint timeout, out IntPtr result);
'@

$en = [Globalization.CultureInfo]::GetCultureInfo('en-US')
function Get-Name($dict) {
    if ($dict.ContainsKey($en)) { return $dict[$en] }
    return @($dict.Values)[0]
}

$dest = Join-Path $env:LOCALAPPDATA 'Microsoft\Windows\Fonts'
$key = 'HKCU:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts'
if (-not $DryRun) {
    New-Item -ItemType Directory -Force -Path $dest | Out-Null
    if (-not (Test-Path $key)) { New-Item -Path $key -Force | Out-Null }
}

$results = @()
foreach ($line in (Get-Content -LiteralPath $ListFile -Encoding UTF8)) {
    $file = [string]$line
    if ([string]::IsNullOrWhiteSpace($file)) { continue }
    try {
        $glyph = New-Object System.Windows.Media.GlyphTypeface (New-Object System.Uri $file)
        $family = Get-Name $glyph.Win32FamilyNames
        $face = Get-Name $glyph.Win32FaceNames
        $kind = if ([IO.Path]::GetExtension($file) -ieq '.otf') { 'OpenType' } else { 'TrueType' }
        # Nombre en el registro: "Familia Estilo (TrueType)"; sin estilo si es el normal.
        $name = if ($face -in @('Regular', 'Normal', $family)) { "$family ($kind)" } else { "$family $face ($kind)" }

        if (-not $DryRun) {
            $target = Join-Path $dest ([IO.Path]::GetFileName($file))
            if (-not (Test-Path -LiteralPath $target) -or (Get-Item -LiteralPath $target).Length -ne (Get-Item -LiteralPath $file).Length) {
                Copy-Item -LiteralPath $file -Destination $target -Force
            }
            Set-ItemProperty -Path $key -Name $name -Value $target
            [Aura.FontNative]::AddFontResourceW($target) | Out-Null
        }
        $results += [pscustomobject]@{ file = $file; family = $family; face = $face; ok = $true; error = $null }
    } catch {
        $results += [pscustomobject]@{ file = $file; family = $null; face = $null; ok = $false; error = $_.Exception.Message }
    }
}

if (-not $DryRun) {
    # Avisa a las aplicaciones abiertas que hay fuentes nuevas (WM_FONTCHANGE).
    $r = [IntPtr]::Zero
    [Aura.FontNative]::SendMessageTimeout([IntPtr]0xffff, 0x001D, [IntPtr]::Zero, [IntPtr]::Zero, 2, 1000, [ref]$r) | Out-Null
}

ConvertTo-Json -InputObject @($results) -Compress
