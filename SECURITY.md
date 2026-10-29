# Security / Seguridad

🇬🇧 [English](#english) · 🇪🇸 [Español](#español)

## English

### Where to download it

To always get an unmodified copy, download Aura Code from this repository, [github.com/IChepe/aura-code](https://github.com/IChepe/aura-code), or from the **IChepe** publisher on the VS Code Marketplace (`IChepe.aura-code`).

### Reporting a vulnerability

If you find a security issue, **please don't open a public issue**. Use GitHub's [private vulnerability reporting](https://github.com/IChepe/aura-code/security/advisories/new) or write to **jdastorgamo1782@gmail.com** with:

- a description of the problem,
- steps to reproduce it,
- your Aura Code, VS Code and operating system versions.

You'll get a reply as soon as possible. Once fixed, a new version will be released and the reporter will be credited (if they wish).

### What Aura does on your PC

- Modifies VS Code's `workbench.desktop.main.js` and `product.json` (with a backup) only when you enable it, and restores them when you disable or uninstall it.
- Opens a WebSocket server **only on `127.0.0.1`** (not reachable from the network) that rejects connections from web pages.
- Runs the PowerShell scripts bundled in `media/` (music, window transparency and font installs).
- Connects to the internet **only** over HTTPS: when you ask to install a font (Google Fonts on GitHub, GitHub releases or dafont), and once a day to the public GitHub API to check for a new version (can be turned off with `aura.checkForUpdates`).
- Doesn't collect or send personal data.

## Español

### Dónde descargarla

Para tener siempre una copia sin modificar, descarga Aura Code desde este repositorio, [github.com/IChepe/aura-code](https://github.com/IChepe/aura-code), o del publicador **IChepe** en el Marketplace de VS Code (`IChepe.aura-code`).

### Reportar una vulnerabilidad

Si encuentras un problema de seguridad, **no abras un issue público**. Usa el [reporte privado de vulnerabilidades](https://github.com/IChepe/aura-code/security/advisories/new) de GitHub o escribe a **jdastorgamo1782@gmail.com** con:

- una descripción del problema,
- los pasos para reproducirlo,
- la versión de Aura Code, de VS Code y de tu sistema operativo.

Recibirás respuesta lo antes posible. Una vez corregido, se publicará una nueva versión y se dará crédito a quien lo reportó (si lo desea).

### Qué hace Aura con tu equipo

- Modifica `workbench.desktop.main.js` y `product.json` de VS Code (con copia de seguridad) solo cuando lo activas, y los restaura al desactivarla o desinstalarla.
- Abre un servidor WebSocket **solo en `127.0.0.1`** (no accesible desde la red) que rechaza conexiones de páginas web.
- Ejecuta los scripts de PowerShell incluidos en `media/` (música, transparencia de la ventana e instalación de fuentes).
- Se conecta a internet **solo** por HTTPS: cuando pides instalar una fuente (Google Fonts en GitHub, releases de GitHub o dafont), y una vez al día a la API pública de GitHub para ver si hay una versión nueva (se desactiva con `aura.checkForUpdates`).
- No recopila ni envía datos personales.
