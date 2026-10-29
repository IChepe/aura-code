# Seguridad

## Versión oficial

La única fuente oficial de Aura Code es este repositorio, [github.com/IChepe/aura-code](https://github.com/IChepe/aura-code), y el publicador **IChepe** en el Marketplace de VS Code (`IChepe.aura-code`). No instales copias de otros autores o sitios: podrían estar modificadas.

## Reportar una vulnerabilidad

Si encuentras un problema de seguridad, **no abras un issue público**. Escribe a **jdastorgamo1782@gmail.com** con:

- una descripción del problema,
- los pasos para reproducirlo,
- la versión de Aura Code, de VS Code y de tu sistema operativo.

Recibirás respuesta lo antes posible. Una vez corregido, se publicará una nueva versión y se dará crédito a quien lo reportó (si lo desea).

## Qué hace Aura con tu equipo

- Modifica `workbench.desktop.main.js` y `product.json` de VS Code (con copia de seguridad) solo cuando lo activas, y los restaura al desactivarla o desinstalarla.
- Abre un servidor WebSocket **solo en `127.0.0.1`** (no accesible desde la red) que rechaza conexiones de páginas web.
- Ejecuta los scripts de PowerShell incluidos en `media/` (música, transparencia de la ventana e instalación de fuentes).
- Se conecta a internet **solo** cuando pides instalar una fuente, por HTTPS, a Google Fonts (GitHub), releases de GitHub o dafont.
- No recopila ni envía datos personales.
