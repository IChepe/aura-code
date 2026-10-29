export interface GradientBackground {
    id: string;
    name: string;
    description: string;
    css: string;
    animated: boolean;
    /** Colores del brillo que reacciona a la música cuando no hay carátula. */
    accent: [string, string];
}

export interface SpecialBackground {
    id: 'album' | 'wallpaper' | 'image' | 'none';
    name: string;
    description: string;
    icon: string;
}

export interface FontEntry {
    id: string;
    name: string;
    family: string;
    ligatures: boolean;
    url: string;
    note: string;
    /** 'code' (por defecto) = para programar; 'game' = inspirada en videojuegos. */
    category?: 'code' | 'game';
    /** false = letras de ancho variable: desalinean el código, mejor usarlas en la interfaz. */
    mono?: boolean;
    game?: string;
    /** Texto a buscar entre las fuentes instaladas si el nombre real puede variar. */
    match?: string;
}

export const GRADIENTS: GradientBackground[] = [
    {
        id: 'aurora',
        name: 'Aurora',
        description: 'Verdes y violetas como luces del norte.',
        css: 'linear-gradient(125deg, #0f2027 0%, #203a43 30%, #0f9b8e 60%, #6a3093 100%)',
        animated: true,
        accent: ['#0f9b8e', '#6a3093'],
    },
    {
        id: 'nebula',
        name: 'Nebulosa',
        description: 'Nubes de color sobre el espacio profundo.',
        css: 'radial-gradient(circle at 20% 30%, #7b2ff7 0%, transparent 45%), radial-gradient(circle at 80% 20%, #f107a3 0%, transparent 40%), radial-gradient(circle at 60% 80%, #00c6ff 0%, transparent 45%), #07051a',
        animated: true,
        accent: ['#7b2ff7', '#f107a3'],
    },
    {
        id: 'neon',
        name: 'Neón Tokio',
        description: 'Rosa y cian estilo synthwave.',
        css: 'linear-gradient(135deg, #0d0221 0%, #261447 40%, #ff3864 75%, #2de2e6 100%)',
        animated: true,
        accent: ['#ff3864', '#2de2e6'],
    },
    {
        id: 'sunset',
        name: 'Atardecer',
        description: 'Cielo morado que se apaga en naranja.',
        css: 'linear-gradient(160deg, #2b1055 0%, #7597de 45%, #ff7e5f 80%, #feb47b 100%)',
        animated: false,
        accent: ['#ff7e5f', '#7597de'],
    },
    {
        id: 'ocean',
        name: 'Océano',
        description: 'Azules profundos y tranquilos.',
        css: 'linear-gradient(160deg, #000428 0%, #004e92 60%, #00b4db 100%)',
        animated: true,
        accent: ['#00b4db', '#004e92'],
    },
    {
        id: 'forest',
        name: 'Bosque',
        description: 'Verdes húmedos y suaves.',
        css: 'linear-gradient(140deg, #0b1d13 0%, #134e2a 45%, #3a7d44 80%, #a8e063 100%)',
        animated: false,
        accent: ['#a8e063', '#3a7d44'],
    },
    {
        id: 'lava',
        name: 'Lava',
        description: 'Brasas rojas sobre negro.',
        css: 'radial-gradient(circle at 25% 75%, #ff512f 0%, transparent 45%), radial-gradient(circle at 75% 25%, #dd2476 0%, transparent 45%), #160707',
        animated: true,
        accent: ['#ff512f', '#dd2476'],
    },
    {
        id: 'vaporwave',
        name: 'Vaporwave',
        description: 'Pastel ochentero.',
        css: 'linear-gradient(180deg, #ff71ce 0%, #b967ff 35%, #01cdfe 70%, #05ffa1 100%)',
        animated: true,
        accent: ['#ff71ce', '#01cdfe'],
    },
    {
        id: 'midnight',
        name: 'Medianoche',
        description: 'Casi negro, discreto y elegante.',
        css: 'linear-gradient(180deg, #020111 0%, #191621 50%, #3a3a52 100%)',
        animated: false,
        accent: ['#5b5bd6', '#3a3a52'],
    },
    {
        id: 'candy',
        name: 'Algodón de azúcar',
        description: 'Rosas y lilas claros.',
        css: 'linear-gradient(135deg, #ff9a9e 0%, #fad0c4 35%, #a18cd1 70%, #fbc2eb 100%)',
        animated: true,
        accent: ['#ff9a9e', '#a18cd1'],
    },
];

export const SPECIAL_BACKGROUNDS: SpecialBackground[] = [
    {
        id: 'album',
        name: 'Carátula de la música',
        description: 'El fondo toma los colores y la portada de la canción que suena.',
        icon: '♫',
    },
    {
        id: 'wallpaper',
        name: 'Mi escritorio (cristal)',
        description: 'VS Code se vuelve un cristal: ves tu escritorio o Wallpaper Engine en vivo detrás del código.',
        icon: '▣',
    },
    {
        id: 'image',
        name: 'Imagen propia',
        description: 'Elige cualquier imagen de tu equipo.',
        icon: '+',
    },
    {
        id: 'none',
        name: 'Sin fondo',
        description: 'VS Code normal (solo se mantienen las fuentes).',
        icon: '∅',
    },
];

export const FONTS: FontEntry[] = [
    {
        id: 'cascadia',
        name: 'Cascadia Code',
        family: 'Cascadia Code',
        ligatures: true,
        url: 'https://github.com/microsoft/cascadia-code/releases',
        note: 'De Microsoft, viene con Windows Terminal.',
    },
    {
        id: 'jetbrains',
        name: 'JetBrains Mono',
        family: 'JetBrains Mono',
        ligatures: true,
        url: 'https://www.jetbrains.com/lp/mono/',
        note: 'Muy legible, letras altas.',
    },
    {
        id: 'fira',
        name: 'Fira Code',
        family: 'Fira Code',
        ligatures: true,
        url: 'https://github.com/tonsky/FiraCode/releases',
        note: 'La clásica de las ligaduras.',
    },
    {
        id: 'monaspace-neon',
        name: 'Monaspace Neon',
        family: 'Monaspace Neon',
        ligatures: true,
        url: 'https://monaspace.githubnext.com/',
        note: 'De GitHub. Hay variantes Argon, Xenon, Radon y Krypton.',
    },
    {
        id: 'monaspace-radon',
        name: 'Monaspace Radon',
        family: 'Monaspace Radon',
        ligatures: true,
        url: 'https://monaspace.githubnext.com/',
        note: 'Estilo manuscrito, ideal para comentarios.',
    },
    {
        id: 'victor',
        name: 'Victor Mono',
        family: 'Victor Mono',
        ligatures: true,
        url: 'https://rubjo.github.io/victor-mono/',
        note: 'Cursivas tipo caligrafía.',
    },
    {
        id: 'maple',
        name: 'Maple Mono',
        family: 'Maple Mono',
        ligatures: true,
        url: 'https://github.com/subframe7536/maple-font/releases',
        note: 'Redondeada y amigable.',
    },
    {
        id: 'geist',
        name: 'Geist Mono',
        family: 'Geist Mono',
        ligatures: false,
        url: 'https://vercel.com/font',
        note: 'Moderna y limpia, de Vercel.',
    },
    {
        id: 'iosevka',
        name: 'Iosevka',
        family: 'Iosevka',
        ligatures: true,
        url: 'https://github.com/be5invis/Iosevka/releases',
        note: 'Estrecha: cabe más código por línea.',
    },
    {
        id: 'hack',
        name: 'Hack',
        family: 'Hack',
        ligatures: false,
        url: 'https://sourcefoundry.org/hack/',
        note: 'Sobria y muy clara.',
    },
    {
        id: 'source-code-pro',
        name: 'Source Code Pro',
        family: 'Source Code Pro',
        ligatures: false,
        url: 'https://github.com/adobe-fonts/source-code-pro/releases',
        note: 'De Adobe.',
    },
    {
        id: 'plex',
        name: 'IBM Plex Mono',
        family: 'IBM Plex Mono',
        ligatures: false,
        url: 'https://github.com/IBM/plex/releases',
        note: 'Con personalidad, de IBM.',
    },
    {
        id: 'consolas',
        name: 'Consolas',
        family: 'Consolas',
        ligatures: false,
        url: '',
        note: 'Incluida en Windows (la de siempre).',
    },

    // --- Inspiradas en videojuegos ----------------------------------------------
    // Fuentes de fans o libres (no las oficiales de cada juego). Aura no las incluye: solo enlaza la descarga.
    {
        id: 'monocraft',
        name: 'Monocraft',
        family: 'Monocraft',
        ligatures: true,
        url: 'https://github.com/IdreesInc/Monocraft/releases',
        note: 'Fuente para programar con el estilo de Minecraft, ¡con ligaduras!',
        category: 'game',
        game: 'Minecraft',
    },
    {
        id: 'minecraftia',
        name: 'Minecraftia',
        family: 'Minecraftia',
        ligatures: false,
        url: 'https://www.dafont.com/search.php?q=minecraftia',
        note: 'La letra de los menús de Minecraft.',
        category: 'game',
        game: 'Minecraft',
        mono: false,
    },
    {
        id: 'press-start',
        name: 'Press Start 2P',
        family: 'Press Start 2P',
        ligatures: false,
        url: 'https://fonts.google.com/specimen/Press+Start+2P',
        note: 'Arcade de 8 bits, como Super Mario Bros. de NES. Monoespaciada.',
        category: 'game',
        game: 'Mario / arcade',
    },
    {
        id: 'super-mario',
        name: 'Super Mario 256',
        family: 'Super Mario 256',
        ligatures: false,
        url: 'https://www.dafont.com/search.php?q=super+mario',
        note: 'Letras redondas y gorditas de Super Mario.',
        category: 'game',
        game: 'Super Mario',
        mono: false,
        match: 'super mario',
    },
    {
        id: 'mario-kart',
        name: 'Mario Kart DS',
        family: 'Mario Kart DS',
        ligatures: false,
        url: 'https://www.dafont.com/search.php?q=mario+kart',
        note: 'Las letras de los títulos de Mario Kart.',
        category: 'game',
        game: 'Mario Kart',
        mono: false,
        match: 'mario kart',
    },
    {
        id: 'zelda-botw',
        name: 'The Wild Breath of Zelda',
        family: 'The Wild Breath of Zelda',
        ligatures: false,
        url: 'https://www.dafont.com/search.php?q=zelda',
        note: 'Inspirada en Zelda: Breath of the Wild.',
        category: 'game',
        game: 'Zelda',
        mono: false,
        match: 'wild breath',
    },
    {
        id: 'triforce',
        name: 'Triforce',
        family: 'Triforce',
        ligatures: false,
        url: 'https://www.dafont.com/search.php?q=triforce',
        note: 'El logo clásico de The Legend of Zelda.',
        category: 'game',
        game: 'Zelda',
        mono: false,
    },
    {
        id: 'pokemon',
        name: 'Pokémon Solid',
        family: 'Pokemon Solid',
        ligatures: false,
        url: 'https://www.dafont.com/search.php?q=pokemon',
        note: 'El logo amarillo de Pokémon.',
        category: 'game',
        game: 'Pokémon',
        mono: false,
        match: 'pokemon',
    },
    {
        id: 'determination',
        name: 'Determination',
        family: 'Determination',
        ligatures: false,
        url: 'https://www.dafont.com/search.php?q=determination',
        note: 'La letra de los diálogos de Undertale.',
        category: 'game',
        game: 'Undertale',
        mono: false,
        match: 'determination',
    },
    {
        id: 'vt323',
        name: 'VT323',
        family: 'VT323',
        ligatures: false,
        url: 'https://fonts.google.com/specimen/VT323',
        note: 'Terminal verde retro, al estilo Fallout. Monoespaciada.',
        category: 'game',
        game: 'Fallout / retro',
    },
    {
        id: 'pixelify',
        name: 'Pixelify Sans',
        family: 'Pixelify Sans',
        ligatures: false,
        url: 'https://fonts.google.com/specimen/Pixelify+Sans',
        note: 'Pixel art moderno, ideal para la interfaz.',
        category: 'game',
        game: 'Pixel art',
        mono: false,
    },
];

/** Textos en inglés del catálogo (el español está en cada entrada). */
const EN: Record<string, { name?: string; description?: string; note?: string }> = {
    // Degradados
    'aurora': { description: 'Greens and violets like the northern lights.' },
    'nebula': { name: 'Nebula', description: 'Clouds of color over deep space.' },
    'neon': { name: 'Neon Tokyo', description: 'Pink and cyan, synthwave style.' },
    'sunset': { name: 'Sunset', description: 'Purple sky fading into orange.' },
    'ocean': { name: 'Ocean', description: 'Deep, calm blues.' },
    'forest': { name: 'Forest', description: 'Soft, damp greens.' },
    'lava': { name: 'Lava', description: 'Red embers on black.' },
    'vaporwave': { description: '80s pastel.' },
    'midnight': { name: 'Midnight', description: 'Almost black, discreet and elegant.' },
    'candy': { name: 'Cotton candy', description: 'Light pinks and lilacs.' },
    // Fondos especiales
    'album': { name: 'Album cover', description: 'The background takes the colors and artwork of the song playing.' },
    'wallpaper': { name: 'My desktop (glass)', description: 'VS Code turns into glass: see your desktop or Wallpaper Engine live behind your code.' },
    'image': { name: 'Custom image', description: 'Choose any image on your PC.' },
    'none': { name: 'No background', description: 'Regular VS Code (only your fonts are kept).' },
    // Fuentes
    'cascadia': { note: 'By Microsoft, ships with Windows Terminal.' },
    'jetbrains': { note: 'Very readable, tall letters.' },
    'fira': { note: 'The classic ligature font.' },
    'monaspace-neon': { note: 'By GitHub. Also comes in Argon, Xenon, Radon and Krypton.' },
    'monaspace-radon': { note: 'Handwriting style, great for comments.' },
    'victor': { note: 'Calligraphy-like italics.' },
    'maple': { note: 'Rounded and friendly.' },
    'geist': { note: 'Modern and clean, by Vercel.' },
    'iosevka': { note: 'Narrow: fits more code per line.' },
    'hack': { note: 'Sober and very clear.' },
    'source-code-pro': { note: 'By Adobe.' },
    'plex': { note: 'Full of personality, by IBM.' },
    'consolas': { note: 'Included with Windows (the classic one).' },
    'monocraft': { note: 'A coding font in Minecraft style, with ligatures!' },
    'minecraftia': { note: 'The Minecraft menu font.' },
    'press-start': { note: '8-bit arcade, like Super Mario Bros. on NES. Monospaced.' },
    'super-mario': { note: 'Round, chunky Super Mario letters.' },
    'mario-kart': { note: 'The Mario Kart title letters.' },
    'zelda-botw': { note: 'Inspired by Zelda: Breath of the Wild.' },
    'triforce': { note: 'The classic The Legend of Zelda logo.' },
    'pokemon': { note: 'The yellow Pokémon logo.' },
    'determination': { note: 'The Undertale dialogue font.' },
    'vt323': { note: 'Retro green terminal, Fallout style. Monospaced.' },
    'pixelify': { note: 'Modern pixel art, great for the interface.' },
};

/** Devuelve una entrada del catálogo con sus textos en el idioma pedido. */
export function localize<T extends { id: string }>(entry: T, lang: 'es' | 'en'): T {
    return lang === 'en' ? { ...entry, ...EN[entry.id] } : entry;
}

/**
 * De dónde descargar cada fuente para instalarla con un clic. Solo fuentes públicas, sin servidor propio:
 * el repositorio abierto de Google Fonts, releases de GitHub y descargas directas de dafont.
 */
export interface FontDownload {
    /** Archivos .ttf/.otf/.zip descargables directamente. */
    urls?: string[];
    /** Último release de GitHub: repositorio y expresión regular del archivo a bajar. */
    github?: { repo: string; asset: string };
    /** Dentro de un .zip, solo instalar archivos cuyo nombre o carpeta cumpla esta expresión regular. */
    files?: string;
}

const GF = 'https://raw.githubusercontent.com/google/fonts/main/ofl/';
const DAFONT = 'https://dl.dafont.com/dl/?f=';

export const FONT_DOWNLOADS: Record<string, FontDownload> = {
    'cascadia': { urls: [GF + 'cascadiacode/CascadiaCode%5Bwght%5D.ttf', GF + 'cascadiacode/CascadiaCode-Italic%5Bwght%5D.ttf'] },
    'jetbrains': { urls: [GF + 'jetbrainsmono/JetBrainsMono%5Bwght%5D.ttf', GF + 'jetbrainsmono/JetBrainsMono-Italic%5Bwght%5D.ttf'] },
    'fira': { urls: [GF + 'firacode/FiraCode%5Bwght%5D.ttf'] },
    'monaspace-neon': { github: { repo: 'githubnext/monaspace', asset: '^monaspace-variable-.*\\.zip$' }, files: 'Neon' },
    'monaspace-radon': { github: { repo: 'githubnext/monaspace', asset: '^monaspace-variable-.*\\.zip$' }, files: 'Radon' },
    'victor': { urls: [GF + 'victormono/VictorMono%5Bwght%5D.ttf', GF + 'victormono/VictorMono-Italic%5Bwght%5D.ttf'] },
    'maple': { github: { repo: 'subframe7536/maple-font', asset: '^MapleMono-TTF\\.zip$' } },
    'geist': { urls: [GF + 'geistmono/GeistMono%5Bwght%5D.ttf'] },
    'hack': { github: { repo: 'source-foundry/Hack', asset: '-ttf\\.zip$' } },
    'source-code-pro': { urls: [GF + 'sourcecodepro/SourceCodePro%5Bwght%5D.ttf', GF + 'sourcecodepro/SourceCodePro-Italic%5Bwght%5D.ttf'] },
    'plex': {
        urls: ['Regular', 'Bold', 'Italic', 'BoldItalic'].map(s => GF + `ibmplexmono/IBMPlexMono-${s}.ttf`),
    },
    'monocraft': { github: { repo: 'IdreesInc/Monocraft', asset: '^Monocraft-ttf\\.zip$' } },
    'minecraftia': { urls: [DAFONT + 'minecraftia'] },
    'press-start': { urls: [GF + 'pressstart2p/PressStart2P-Regular.ttf'] },
    'super-mario': { urls: [DAFONT + 'super_mario_256'] },
    'mario-kart': { urls: [DAFONT + 'mario_kart_ds'] },
    'zelda-botw': { urls: [DAFONT + 'the_wild_breath_of_zelda'] },
    'triforce': { urls: [DAFONT + 'triforce'] },
    'pokemon': { urls: [DAFONT + 'pokemon'] },
    'determination': { urls: [DAFONT + 'determination'] },
    'vt323': { urls: [GF + 'vt323/VT323-Regular.ttf'] },
    'pixelify': { urls: [GF + 'pixelifysans/PixelifySans%5Bwght%5D.ttf'] },
};

export function findGradient(id: string): GradientBackground | undefined {
    return GRADIENTS.find(g => g.id === id);
}
