// aura-code:version=__AURA_VERSION__
// Este archivo se inyecta al final de workbench.desktop.main.js y corre dentro de la ventana de VS Code.
// Solo dibuja: recibe todo (fondo, colores, música) de la extensión por un WebSocket local.
(function () {
    if (typeof window === 'undefined' || typeof document === 'undefined' || window.__auraCode) {
        return;
    }
    window.__auraCode = true;

    var PORT = __AURA_PORT__;

    // Variables de color del tema que se vuelven translúcidas para lograr el efecto cristal.
    var GLASS_VARS = [
        'editor-background', 'editorGutter-background', 'editorPane-background', 'minimap-background',
        'editorStickyScroll-background', 'breadcrumb-background',
        'sideBar-background', 'sideBarSectionHeader-background', 'sideBarStickyScroll-background',
        'activityBar-background', 'auxiliaryBar-background',
        'panel-background', 'panelStickyScroll-background', 'terminal-background',
        'titleBar-activeBackground', 'titleBar-inactiveBackground',
        'statusBar-background', 'statusBar-noFolderBackground',
        'tab-activeBackground', 'tab-inactiveBackground', 'tab-unfocusedActiveBackground', 'tab-unfocusedInactiveBackground',
        'editorGroupHeader-tabsBackground', 'editorGroupHeader-noTabsBackground',
        'welcomePage-background'
    ];

    var BASE_CSS = [
        'body.aura-on, body.aura-on .monaco-workbench { background: transparent !important; }',
        'html.aura-clear, html.aura-clear body { background: transparent !important; }',
        '#aura-root { position: fixed; inset: 0; z-index: -1; pointer-events: none; overflow: hidden; display: none; }',
        'body.aura-on #aura-root { display: block; }',
        '#aura-root > div { position: absolute; inset: 0; }',
        '#aura-bg { background-size: cover; background-position: center; background-repeat: no-repeat; transition: opacity .8s ease; }',
        '#aura-bg.drift { inset: -15%; animation: aura-drift 45s ease-in-out infinite alternate; will-change: transform; }',
        '@keyframes aura-drift {',
        '  0% { transform: translate3d(-4%, -3%, 0) scale(1) rotate(0deg); }',
        '  50% { transform: translate3d(3%, 2%, 0) scale(1.08) rotate(4deg); }',
        '  100% { transform: translate3d(-2%, 4%, 0) scale(1.04) rotate(-3deg); }',
        '}',
        '#aura-art { inset: -12%; background-size: cover; background-position: center; filter: blur(60px) saturate(1.6); opacity: 0; transition: opacity 1.2s ease; }',
        '#aura-art.on { opacity: .8; }',
        '#aura-glow { opacity: 0; mix-blend-mode: screen; will-change: opacity, transform;',
        '  background: radial-gradient(circle at 18% 28%, var(--aura-c1, #6a3093) 0%, transparent 55%), radial-gradient(circle at 82% 72%, var(--aura-c2, #0f9b8e) 0%, transparent 55%); }',
        '#aura-dim { background: #000; }'
    ].join('\n');

    var cfg = null;
    var imageUrl = null;
    var artUrl = null;
    var playing = false;
    var colors = ['#6a3093', '#0f9b8e', '#2c5364'];
    var level = 0, target = 0, avg = 0, raf = 0;
    var root, bg, art, glow, dim, baseStyle, extraStyle, glassStyle, socket;

    function el(id) {
        var d = document.createElement('div');
        d.id = id;
        return d;
    }

    function style(text) {
        var s = document.createElement('style');
        s.setAttribute('data-aura', '1');
        s.textContent = text;
        document.head.appendChild(s);
        return s;
    }

    function init() {
        baseStyle = style(BASE_CSS);
        // CSS adicional enviado por la extensión: permite corregir estilos sin volver a parchear VS Code.
        extraStyle = style('');
        glassStyle = style('');
        root = el('aura-root');
        bg = el('aura-bg');
        art = el('aura-art');
        glow = el('aura-glow');
        dim = el('aura-dim');
        root.appendChild(bg);
        root.appendChild(art);
        root.appendChild(glow);
        root.appendChild(dim);
        document.body.insertBefore(root, document.body.firstChild);

        // Cuando cambia el tema, VS Code reescribe sus estilos: recalculamos el cristal.
        var pending = 0;
        new MutationObserver(function (records) {
            for (var i = 0; i < records.length; i++) {
                var t = records[i].target;
                var node = t.nodeType === 1 ? t : t.parentNode;
                if (!node || !node.getAttribute || node.getAttribute('data-aura') !== '1') {
                    clearTimeout(pending);
                    pending = setTimeout(applyGlass, 120);
                    return;
                }
            }
        }).observe(document.head, { childList: true, subtree: true, characterData: true });

        connect();
    }

    function connect() {
        var ws;
        try {
            ws = new WebSocket('ws://127.0.0.1:' + PORT + '/?role=window');
        } catch (e) {
            setTimeout(connect, 4000);
            return;
        }
        socket = ws;
        ws.onmessage = function (e) {
            try {
                handle(JSON.parse(e.data));
            } catch (err) {
                console.warn('[aura-code]', err);
            }
        };
        ws.onclose = function () {
            setTimeout(connect, 3000);
        };
    }

    function handle(m) {
        switch (m.t) {
            case 'l':
                onLevel(m.v);
                break;
            case 'css':
                extraStyle.textContent = m.text || '';
                break;
            case 'diag':
                socket.send(JSON.stringify({ t: 'diag', data: diagnose() }));
                break;
            case 'config':
                cfg = m;
                render();
                break;
            case 'image':
                imageUrl = m.url;
                render();
                break;
            case 'track':
                playing = !!m.playing;
                if (!m.title) {
                    artUrl = null;
                    resetColors();
                    render();
                }
                if (!playing) {
                    onLevel(0);
                }
                break;
            case 'art':
                artUrl = m.url;
                extractColors(m.url, function (c) {
                    colors = c;
                    paintColors();
                    render();
                });
                break;
        }
    }

    function resetColors() {
        if (cfg && cfg.accent) {
            colors = [cfg.accent[0], cfg.accent[1], cfg.accent[0]];
        }
        paintColors();
    }

    function paintColors() {
        root.style.setProperty('--aura-c1', colors[0]);
        root.style.setProperty('--aura-c2', colors[1]);
        root.style.setProperty('--aura-c3', colors[2]);
    }

    function render() {
        if (!cfg || !root) {
            return;
        }
        if (root.parentNode !== document.body) {
            document.body.insertBefore(root, document.body.firstChild);
        }
        var clear = cfg.transparency !== 'off';
        var show = cfg.kind !== 'none';
        document.body.classList.toggle('aura-on', show || clear);
        document.documentElement.classList.toggle('aura-clear', clear);

        if (!artUrl) {
            resetColors();
        }

        bg.className = '';
        bg.style.background = '';
        bg.style.filter = '';
        bg.style.transform = '';
        art.className = '';

        if (clear) {
            // Con acrílico/mica la ventana ya deja ver lo de atrás: solo dejamos el brillo musical.
            bg.style.opacity = '0';
        } else if (cfg.kind === 'gradient') {
            bg.style.opacity = '1';
            bg.style.background = cfg.css;
            if (cfg.animated) {
                bg.className = 'drift';
            }
        } else if (cfg.kind === 'image') {
            bg.style.opacity = imageUrl ? '1' : '0';
            if (imageUrl) {
                bg.style.background = 'center / cover no-repeat url("' + imageUrl + '")';
            }
            if (cfg.blur > 0) {
                // El zoom evita que el desenfoque deje bordes transparentes.
                bg.style.filter = 'blur(' + cfg.blur + 'px)';
                bg.style.transform = 'scale(1.08)';
            }
        } else if (cfg.kind === 'album') {
            bg.style.opacity = '1';
            bg.style.background = 'linear-gradient(135deg, var(--aura-c1) 0%, var(--aura-c3) 50%, var(--aura-c2) 100%)';
            bg.className = 'drift';
            if (artUrl) {
                art.style.backgroundImage = 'url("' + artUrl + '")';
                art.className = 'on';
            }
        } else {
            bg.style.opacity = '0';
        }

        dim.style.opacity = clear ? '0' : String(cfg.dim);
        glow.style.display = cfg.music ? '' : 'none';
        applyGlass();
    }

    function parseColor(s) {
        s = (s || '').trim();
        var m;
        if ((m = /^#([0-9a-f]{3,8})$/i.exec(s))) {
            var h = m[1];
            if (h.length === 3 || h.length === 4) {
                h = h.split('').map(function (c) { return c + c; }).join('');
            }
            if (h.length !== 6 && h.length !== 8) {
                return null;
            }
            return {
                r: parseInt(h.slice(0, 2), 16),
                g: parseInt(h.slice(2, 4), 16),
                b: parseInt(h.slice(4, 6), 16),
                a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1
            };
        }
        if ((m = /^rgba?\(([^)]+)\)$/i.exec(s))) {
            var p = m[1].split(/[\s,\/]+/).filter(Boolean).map(parseFloat);
            if (p.length < 3) {
                return null;
            }
            return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
        }
        return null;
    }

    function applyGlass() {
        if (!cfg || !glassStyle) {
            return;
        }
        var wb = document.querySelector('.monaco-workbench');
        if (!wb) {
            setTimeout(applyGlass, 500);
            return;
        }
        var active = cfg.kind !== 'none' || cfg.transparency !== 'off';
        var alpha = active ? cfg.glass : 1;
        var text = '';
        if (alpha < 1) {
            // Desactivamos temporalmente nuestro estilo para leer los colores originales del tema.
            glassStyle.media = 'not all';
            var cs = getComputedStyle(wb);
            var rules = [];
            for (var i = 0; i < GLASS_VARS.length; i++) {
                var name = '--vscode-' + GLASS_VARS[i];
                var c = parseColor(cs.getPropertyValue(name));
                if (c) {
                    rules.push(name + ': rgba(' + Math.round(c.r) + ',' + Math.round(c.g) + ',' + Math.round(c.b) + ',' + (c.a * alpha).toFixed(3) + ') !important;');
                }
            }
            glassStyle.media = '';
            text = '.monaco-workbench {' + rules.join('') + '}';
        }
        if (glassStyle.textContent !== text) {
            glassStyle.textContent = text;
        }
    }

    // --- Música ---------------------------------------------------------------

    function onLevel(v) {
        target = cfg && cfg.music && playing ? v : 0;
        if (!raf) {
            raf = requestAnimationFrame(tick);
        }
    }

    function tick() {
        // Ataque rápido y caída lenta: se siente como un pulso, no como un parpadeo.
        level += (target - level) * (target > level ? 0.55 : 0.1);
        avg = avg * 0.97 + level * 0.03;
        var r = cfg ? cfg.reactivity : 1;
        var beat = level > avg * 1.3 && level > 0.08 ? 1 : 0;
        var energy = Math.min(1, level * 1.3 * r);
        glow.style.opacity = String(Math.min(1, energy * 0.9 + beat * 0.15 * r));
        glow.style.transform = 'scale(' + (1 + energy * 0.06 + beat * 0.02 * r).toFixed(4) + ')';
        if (cfg && cfg.transparency === 'off') {
            dim.style.opacity = String(cfg.dim * (1 - 0.45 * energy));
        }
        if (target === 0 && level < 0.002) {
            level = 0;
            glow.style.opacity = '0';
            raf = 0;
            return;
        }
        raf = requestAnimationFrame(tick);
    }

    function extractColors(url, cb) {
        var img = new Image();
        img.onload = function () {
            try {
                var size = 24;
                var canvas = document.createElement('canvas');
                canvas.width = canvas.height = size;
                var ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, size, size);
                var d = ctx.getImageData(0, 0, size, size).data;
                var buckets = {};
                for (var i = 0; i < d.length; i += 4) {
                    var r = d[i], g = d[i + 1], b = d[i + 2];
                    var max = Math.max(r, g, b), min = Math.min(r, g, b);
                    if (max < 35) {
                        continue;
                    }
                    var sat = (max - min) / max;
                    var key = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
                    var e = buckets[key] || (buckets[key] = { w: 0, n: 0, r: 0, g: 0, b: 0 });
                    e.w += 1 + sat * 4;
                    e.n++;
                    e.r += r;
                    e.g += g;
                    e.b += b;
                }
                var list = Object.keys(buckets).map(function (k) { return buckets[k]; });
                list.sort(function (a, b) { return b.w - a.w; });
                var out = list.slice(0, 3).map(function (e) {
                    return 'rgb(' + Math.round(e.r / e.n) + ',' + Math.round(e.g / e.n) + ',' + Math.round(e.b / e.n) + ')';
                });
                while (out.length < 3) {
                    out.push(out[0] || '#6a3093');
                }
                cb(out);
            } catch (err) {
                console.warn('[aura-code]', err);
            }
        };
        img.src = url;
    }

    // Informe para depurar: qué elementos hay encima del fondo en varios puntos de la ventana.
    function diagnose() {
        function describe(e) {
            var cs = getComputedStyle(e);
            var cls = typeof e.className === 'string' ? e.className : '';
            return e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (cls ? '.' + cls.trim().split(/\s+/).slice(0, 4).join('.') : '') +
                ' | bg=' + cs.backgroundColor + (cs.backgroundImage !== 'none' ? ' +img' : '') +
                ' | pos=' + cs.position + ' z=' + cs.zIndex + ' op=' + cs.opacity;
        }
        var wb = document.querySelector('.monaco-workbench');
        var stacks = {};
        [[0.5, 0.5], [0.15, 0.5], [0.5, 0.02], [0.5, 0.985], [0.02, 0.5]].forEach(function (p) {
            stacks[p.join(',')] = document.elementsFromPoint(innerWidth * p[0], innerHeight * p[1]).slice(0, 30).map(describe);
        });
        var chain = [];
        for (var n = root; n; n = n.parentElement) {
            chain.push(describe(n));
        }
        return {
            href: location.href,
            htmlClass: document.documentElement.className,
            bodyClass: document.body.className,
            rootChain: chain,
            rootRect: JSON.stringify(root.getBoundingClientRect()),
            layers: [bg, art, glow, dim].map(describe),
            bgInline: bg.getAttribute('style') ? bg.getAttribute('style').slice(0, 200) : '',
            glassCss: glassStyle.textContent.slice(0, 600),
            editorBgVar: wb ? getComputedStyle(wb).getPropertyValue('--vscode-editor-background') : null,
            workbenchCount: document.querySelectorAll('.monaco-workbench').length,
            cfg: cfg ? { kind: cfg.kind, id: cfg.id, glass: cfg.glass, dim: cfg.dim, transparency: cfg.transparency } : null,
            hasImage: !!imageUrl,
            stacks: stacks
        };
    }

    if (document.body) {
        init();
    } else {
        document.addEventListener('DOMContentLoaded', init);
    }
})();
