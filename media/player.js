// @ts-check
(function () {
    const vscode = acquireVsCodeApi();
    const $ = id => /** @type {HTMLElement} */ (document.getElementById(id));
    const canvas = /** @type {HTMLCanvasElement} */ ($('bars'));
    const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));

    const saved = vscode.getState() || {};
    let retro = !!saved.retro;
    let track = null;
    let pos = null;
    let target = [];
    let shown = [];
    let colors = null;
    let raf = 0;
    let i18n = {};
    const T = key => i18n['player.' + key] || key;

    document.body.classList.toggle('retro', retro);

    $('style').addEventListener('click', () => {
        retro = !retro;
        vscode.setState({ retro });
        document.body.classList.toggle('retro', retro);
        draw();
    });
    for (const cmd of ['prev', 'playpause', 'next']) {
        $(cmd).addEventListener('click', () => vscode.postMessage({ type: 'cmd', cmd }));
    }

    window.addEventListener('message', e => {
        const m = e.data;
        switch (m.type) {
            case 'state':
                i18n = m.i18n || i18n;
                track = m.track;
                pos = m.pos;
                setArt(m.art);
                render(m);
                break;
            case 'art':
                setArt(m.url);
                break;
            case 'pos':
                pos = m.pos;
                break;
            case 's':
                target = m.v;
                if (shown.length !== target.length) {
                    shown = target.map(() => 0);
                }
                start();
                break;
        }
    });

    function render(m) {
        const empty = $('empty');
        const has = m.supported && m.enabled && track && track.title;
        $('content').hidden = !has;
        empty.hidden = !!has;
        if (!m.supported) {
            empty.replaceChildren(T('windowsOnly'));
        } else if (!m.enabled) {
            const b = document.createElement('button');
            b.textContent = T('enable');
            b.addEventListener('click', () => vscode.postMessage({ type: 'enableMusic' }));
            empty.replaceChildren(T('off'), document.createElement('br'), b);
        } else if (!has) {
            colors = null;
            document.body.style.removeProperty('--accent');
            empty.replaceChildren(T('nothing'), document.createElement('br'), T('nothingHint'));
        }
        if (has) {
            $('title').textContent = track.title;
            $('title').title = track.title;
            $('artist').textContent = track.artist || track.album || track.app;
            $('state').textContent = track.playing ? 'Playing' : 'Paused';
        }
        start();
    }

    function setArt(url) {
        const img = /** @type {HTMLImageElement} */ ($('art'));
        img.hidden = !url;
        if (url) {
            img.src = url;
            pickColors(url);
        }
    }

    /** En el modo transparente, las barras y el progreso toman dos colores de la carátula. */
    function pickColors(url) {
        const img = new Image();
        img.onload = () => {
            const c = document.createElement('canvas');
            c.width = c.height = 16;
            const x = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
            x.drawImage(img, 0, 0, 16, 16);
            const d = x.getImageData(0, 0, 16, 16).data;
            const px = [];
            for (let i = 0; i < d.length; i += 4) {
                const max = Math.max(d[i], d[i + 1], d[i + 2]), min = Math.min(d[i], d[i + 1], d[i + 2]);
                px.push({ c: `rgb(${d[i]},${d[i + 1]},${d[i + 2]})`, s: max ? (max - min) / max : 0, v: max });
            }
            // Solo colores vivos y claros: en carátulas oscuras o en blanco y negro se usa el color del texto.
            const vivid = px.filter(p => p.s > 0.35 && p.v > 120).sort((a, b) => (b.s * b.v) - (a.s * a.v));
            if (vivid.length) {
                colors = [vivid[0].c, vivid[Math.min(vivid.length - 1, 12)].c];
                document.body.style.setProperty('--accent', colors[0]);
            } else {
                colors = null;
                document.body.style.removeProperty('--accent');
            }
            draw();
        };
        img.src = url;
    }

    function fmt(sec) {
        sec = Math.max(0, Math.floor(sec));
        return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
    }

    function start() {
        if (!raf) {
            raf = requestAnimationFrame(frame);
        }
    }

    function frame() {
        raf = 0;
        let moving = false;
        for (let i = 0; i < shown.length; i++) {
            const t = track && track.playing ? (target[i] || 0) / 100 : 0;
            shown[i] += (t - shown[i]) * (t > shown[i] ? 0.6 : 0.18);
            if (Math.abs(t - shown[i]) > 0.002) {
                moving = true;
            }
        }
        draw();
        updateTime();
        if (moving || (track && track.playing)) {
            raf = requestAnimationFrame(frame);
        }
    }

    function updateTime() {
        if (!pos || !pos.d) {
            $('time').textContent = '';
            $('progress').style.width = '0';
            return;
        }
        // La posición llega cada segundo; entre medio se avanza con el reloj si está sonando.
        const now = track && track.playing ? pos.p + Math.max(0, Date.now() - pos.u) / 1000 : pos.p;
        const p = Math.min(pos.d, now);
        $('time').textContent = `${fmt(p)} / ${fmt(pos.d)}`;
        $('progress').style.width = `${(p / pos.d) * 100}%`;
    }

    function draw() {
        const dpr = window.devicePixelRatio || 1;
        const w = canvas.clientWidth, h = canvas.clientHeight;
        if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
            canvas.width = Math.round(w * dpr);
            canvas.height = Math.round(h * dpr);
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        const n = shown.length || 48;
        const step = w / n;
        const bw = Math.max(2, Math.floor(step * 0.7));
        const fg = getComputedStyle(document.body).color;
        let fill = fg;
        if (!retro && colors) {
            const g = ctx.createLinearGradient(0, h, 0, 0);
            g.addColorStop(0, colors[0]);
            g.addColorStop(1, colors[1]);
            fill = g;
        }
        ctx.fillStyle = fill;
        for (let i = 0; i < n; i++) {
            const v = shown[i] || 0;
            // Mínimo de 2px: la "línea base" punteada del reproductor original.
            const bh = Math.max(2, Math.round(v * h));
            ctx.fillRect(Math.round(i * step), h - bh, bw, bh);
        }
    }

    new ResizeObserver(() => draw()).observe(canvas);
    vscode.postMessage({ type: 'ready' });
})();
