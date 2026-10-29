# Aura Code ✨

**Convierte VS Code en una ventana de cristal que respira con tu música.**

> 🛡️ **Versión oficial.** Este repositorio — [github.com/IChepe/aura-code](https://github.com/IChepe/aura-code) — es la **única fuente oficial** de Aura Code, creada por [**IChepe**](https://github.com/IChepe).
> En el Marketplace de VS Code la versión oficial es la del publicador **IChepe** (`IChepe.aura-code`).
> Cualquier otra copia, *fork* o paquete con otro autor **no es oficial** y no está verificada: descarga solo desde aquí.

Aura Code es una extensión de código abierto que cambia por completo la apariencia de Visual Studio Code:

- 🪟 **Cristal sobre tu escritorio**: VS Code se vuelve translúcido y ves tu escritorio — o tu fondo animado de **Wallpaper Engine** — en vivo detrás del código. Tú decides cuánto resalta VS Code.
- 🎨 **Catálogo de fondos**: degradados animados (Aurora, Nebulosa, Neón Tokio, Lava…), la carátula de la canción que suena o cualquier imagen tuya, con paneles de cristal.
- 🎵 **Pestaña Música**: un reproductor junto a *Problems / Output / Terminal* con título, artista, carátula, **visualizador de frecuencias real**, progreso y controles ⏮ ⏯ ⏭. Funciona con Spotify, YouTube en el navegador y cualquier app que muestre su música en Windows.
- 💓 **Fondos que laten con la música**: el fondo toma los colores del álbum y pulsa al ritmo.
- 🔤 **Catálogo de fuentes** para programar: Cascadia Code, JetBrains Mono, Fira Code, Monaspace, Victor Mono, Maple Mono y más.
- 🎮 **Fuentes de videojuegos**: Minecraft (Monocraft, Minecraftia), Super Mario, Mario Kart, Zelda, Pokémon, Undertale, arcade y retro. Úsalas en el código o en la interfaz (barra lateral, pestañas, menús).
- ⚡ **Instalación de fuentes con un clic** (Windows): Aura las descarga de su origen público, las instala solo para tu usuario y te avisa cuando están listas. Sin permisos de administrador.

---

## 📦 Instalación

### Opción 1 — Desde el Marketplace de VS Code (recomendada)

1. En VS Code abre **Extensiones** (`Ctrl+Shift+X`).
2. Busca **Aura Code** y comprueba que el publicador sea **IChepe**.
3. Pulsa **Instalar**.

> Si todavía no aparece en el Marketplace, usa la opción 2.

### Opción 2 — Descargando el instalador (`.vsix`) desde GitHub

1. Ve a la página de [**Releases**](https://github.com/IChepe/aura-code/releases) y descarga el archivo `aura-code-X.Y.Z.vsix` más reciente.
2. En VS Code abre **Extensiones** (`Ctrl+Shift+X`) → menú **`···`** → **Instalar desde VSIX…** (*Install from VSIX…*) y elige el archivo.

   O desde una terminal:

   ```bash
   code --install-extension aura-code-1.0.0.vsix
   ```

### Opción 3 — Compilándola tú mismo desde el código

Requisitos: [Node.js](https://nodejs.org) 18 o superior y [Git](https://git-scm.com).

```bash
git clone https://github.com/IChepe/aura-code.git
cd aura-code
npm install
npx vsce package
code --install-extension aura-code-1.0.0.vsix
```

---

## 🚀 Primeros pasos

1. Tras instalar, haz clic en **✨ Aura** (barra de estado, abajo a la derecha) o ejecuta `Ctrl+Shift+P` → **Aura: Abrir catálogo**.
2. Pulsa **Activar**. Aura pedirá permiso para modificar un archivo de VS Code ([por qué](#-cómo-funciona)).
3. **Cierra VS Code por completo** (*File → Exit*) y vuelve a abrirlo.
4. Elige un fondo en el catálogo:
   - **Mi escritorio (cristal)** → ves tu escritorio / Wallpaper Engine en vivo. Ajusta cuánto resalta VS Code con el botón **👁 92%** de la barra de estado.
   - **Carátula de la música** → el fondo toma los colores de la canción.
   - Un **degradado**, una **imagen propia** o **sin fondo**.
5. Abre la pestaña **Música** del panel inferior y pon tu canción favorita 🎶.

### Comandos

| Comando | Qué hace |
| --- | --- |
| `Aura: Abrir catálogo` | Panel con fondos, ajustes y fuentes |
| `Aura: Elegir fondo` / `Aura: Elegir fuente` | Selectores rápidos |
| `Aura: Mostrar el reproductor de música` | Abre la pestaña Música |
| `Aura: Ajustar visibilidad de VS Code sobre el escritorio` | Opacidad del modo cristal |
| `Aura: VS Code más visible` / `más transparente` | Ajuste de 5 en 5 % (puedes asignarles un atajo) |
| `Aura: Usar una imagen propia como fondo…` | Elige una imagen de tu equipo |
| `Aura: Instalar fuente desde archivo…` | Instala un `.zip`, `.ttf` u `.otf` |
| `Aura: Usar otra fuente instalada…` | Cualquier fuente de tu equipo, en el código o en la interfaz |
| `Aura: Restaurar la fuente de la interfaz` | Vuelve a la fuente normal de los menús |
| `Aura: Activar/desactivar sincronización con la música` | |
| `Aura: Activar efectos` / `Aura: Desactivar y restaurar VS Code` | Aplica o quita el parche |

### Ajustes principales

| Ajuste | Por defecto | Descripción |
| --- | --- | --- |
| `aura.background` | `aurora` | Fondo: un degradado, `album`, `wallpaper` (cristal), `image` o `none` |
| `aura.windowOpacity` | `0.92` | Visibilidad de VS Code sobre el escritorio (fondo *Mi escritorio*) |
| `aura.glassOpacity` | `0.78` | Opacidad de los paneles sobre los fondos |
| `aura.backgroundDim` / `aura.backgroundBlur` | `0.35` / `0` | Oscurecer / desenfocar el fondo |
| `aura.music.enabled` / `aura.music.reactivity` | `true` / `1` | Sincronización con la música |
| `aura.uiFont` | | Fuente de la interfaz |
| `aura.fontApplyToTerminal` | `true` | Aplicar también a la terminal (solo fuentes monoespaciadas) |
| `aura.transparency` | `off` | `acrylic` / `mica`: material de Windows 11 (experimental) |
| `aura.debug` | `false` | Guarda un informe técnico local para diagnosticar problemas |

---

## 🔧 Cómo funciona

La API oficial de extensiones **no permite** cambiar el fondo de VS Code. Por eso Aura, igual que otras extensiones populares de fondos, añade un pequeño bloque de código al final de `workbench.desktop.main.js` (el archivo que dibuja la interfaz).

```
┌────────────────────┐   WebSocket local    ┌─────────────────────────────┐
│ Extensión (Node)   │ ───────────────────▶ │ Ventana de VS Code          │
│ · configuración    │   127.0.0.1 (solo    │ (código inyectado)          │
│ · imágenes, CSS    │   este equipo)       │ · capa de fondo y cristal   │
│ · música ──────────┼── PowerShell ───┐    │ · pulso con la música       │
└────────────────────┘                 │    └─────────────────────────────┘
                                       ▼
            Windows Media Controls (título, carátula, controles)
            Core Audio / WASAPI (volumen y espectro en tiempo real)
```

- **Copias de seguridad**: antes de modificar nada se guarda una copia `*.aura-backup`. Al desactivar o desinstalar, VS Code queda **idéntico byte a byte** al original.
- **Checksums**: Aura actualiza `product.json` para que VS Code no muestre el aviso de *"instalación dañada"*.
- **Actualizaciones de VS Code**: cada actualización borra el parche; Aura lo detecta y lo vuelve a aplicar (te pedirá reiniciar una vez).
- **Modo cristal (Mi escritorio)**: no modifica archivos; le pide a Windows que dibuje la ventana con transparencia.

> ⚠️ Modificar archivos de VS Code no está soportado oficialmente por Microsoft. Si algo se ve mal, ejecuta **Aura: Desactivar y restaurar VS Code**.

---

## 🔒 Privacidad y seguridad

- **Nada sale de tu equipo.** Aura no tiene servidores, no recopila datos, no usa analíticas ni telemetría.
- **El servidor interno solo escucha en `127.0.0.1`** (la dirección "localhost" de tu propio equipo, que no es accesible desde internet ni desde tu red) y **rechaza conexiones de páginas web**, para que ningún sitio pueda saber qué música escuchas ni controlar tu reproductor.
- **Las únicas conexiones a internet** ocurren cuando tú pides instalar una fuente, y solo por HTTPS a sus orígenes públicos: el repositorio abierto de Google Fonts, releases de GitHub y dafont.
- **Fuentes de la carpeta Descargas**: Aura nunca instala nada sin preguntarte.
- **El código inyectado en VS Code solo dibuja** (estilos y colores); no ejecuta órdenes ni lee archivos.
- Los scripts de PowerShell incluidos (`media/*.ps1`) son legibles: puedes revisar exactamente qué hacen.

¿Encontraste un problema de seguridad? Lee [SECURITY.md](SECURITY.md).

---

## ⚠️ Limitaciones conocidas

- La música, el cristal sobre el escritorio y la instalación automática de fuentes funcionan en **Windows 10/11**. En macOS y Linux funcionan los fondos, los paneles de cristal y el catálogo de fuentes.
- En el modo cristal, Windows aplica la misma transparencia a toda la ventana (texto incluido): sube la visibilidad si te cuesta leer.
- El **minimapa** se dibuja opaco.
- Las fuentes de videojuegos son **creaciones de fans o libres** inspiradas en cada juego, no las tipografías oficiales; Aura no las incluye, solo las descarga de su origen público.
- Tras instalar una fuente nueva hay que cerrar y abrir VS Code para verla.
- Si VS Code está instalado para todos los usuarios (en `Program Files`), puede que necesites abrirlo una vez como administrador para activar Aura.

## 🗑️ Desinstalar

1. Ejecuta **Aura: Desactivar y restaurar VS Code** y reinicia VS Code.
2. Desinstala la extensión desde la pestaña Extensiones.

(Si desinstalas sin desactivar, Aura restaura VS Code automáticamente la próxima vez que se reinicie.)

---

## 🛠️ Desarrollo

```bash
git clone https://github.com/IChepe/aura-code.git
cd aura-code
npm install
npm run compile
```

Abre la carpeta en VS Code y pulsa **F5** (*Probar Aura Code*) para lanzar una ventana de pruebas.

```
src/
  extension.ts     Activación, comandos, barra de estado, instalación de fuentes
  hub.ts           Servidor WebSocket local; coordina varias ventanas
  patchCore.ts     Aplicar/quitar el parche, checksums, copias de seguridad
  uninstall.ts     Limpieza automática al desinstalar
  media.ts         Lee la música desde media-watcher.ps1
  musicView.ts     Pestaña "Música" del panel
  windowGlass.ts   Cristal sobre el escritorio
  catalog.ts       Catálogo de fondos y fuentes  ← ¡agrega los tuyos aquí!
  catalogPanel.ts  Panel del catálogo
  fonts.ts, fontInstaller.ts   Detección, descarga e instalación de fuentes
media/
  runtime.js           Código que se inyecta en la ventana de VS Code
  aura.css             Estilos del cristal (se envían sin volver a parchear)
  media-watcher.ps1    Música: metadatos, espectro y controles (Windows)
  window-opacity.ps1   Transparencia de la ventana (Windows)
  install-font.ps1     Instala fuentes para el usuario (Windows)
  catalog.*, player.*  Interfaces del catálogo y del reproductor
```

## 🤝 Contribuir

¡Las contribuciones son bienvenidas! Ideas:

- 🎨 Más degradados o fuentes en `src/catalog.ts`.
- 🐧 Música en Linux (MPRIS / `playerctl`) y macOS.
- 🖼️ Presentación de imágenes de una carpeta.
- 🌍 Traducción al inglés.

1. Haz un *fork* y crea una rama: `git checkout -b mi-mejora`
2. Haz tus cambios y pruébalos con **F5**
3. Abre un *Pull Request* explicando qué cambiaste

## 👤 Autor

Creado por **IChepe** — [github.com/IChepe](https://github.com/IChepe) · jdastorgamo1782@gmail.com

## 📄 Licencia

[MIT](LICENSE) © 2026 IChepe. Puedes usar, modificar y compartir Aura Code libremente manteniendo el aviso de copyright.
