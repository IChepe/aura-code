// @ts-check
(function () {
    const vscode = acquireVsCodeApi();
    let state = null;
    /** Texto traducido que envía la extensión (claves ui.*). */
    const T = key => (state && state.i18n && state.i18n['ui.' + key]) || key;

    const $ = id => /** @type {HTMLElement} */ (document.getElementById(id));

    function h(tag, props, ...children) {
        const e = document.createElement(tag);
        Object.entries(props || {}).forEach(([k, v]) => {
            if (k === 'class') e.className = v;
            else if (k === 'style') Object.assign(e.style, v);
            else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
            else e.setAttribute(k, v);
        });
        children.flat().forEach(c => c != null && e.append(c));
        return e;
    }

    function send(msg) {
        vscode.postMessage(msg);
    }

    window.addEventListener('message', e => {
        const m = e.data;
        if (m.type === 'state') {
            state = m;
            render();
        } else if (m.type === 'track' && state) {
            state.track = m.track;
            renderTrack();
        }
    });

    function render() {
        renderStatus();
        renderTrack();
        renderBackgrounds();
        renderSettings();
        renderFonts();
    }

    function renderStatus() {
        const box = $('patch-status');
        box.replaceChildren(
            state.patched
                ? h('div', { class: 'status ok' }, T('effectsOn'),
                    h('button', { class: 'link', onclick: () => send({ type: 'disable' }) }, T('deactivate')))
                : h('div', { class: 'status off' }, T('effectsOff'),
                    h('button', { class: 'primary', onclick: () => send({ type: 'enable' }) }, T('activate')))
        );
    }

    function renderTrack() {
        const box = $('now-playing');
        const t = state.track;
        if (!t || !t.title || !state.config.musicEnabled) {
            box.hidden = true;
            return;
        }
        box.hidden = false;
        box.replaceChildren(
            h('span', { class: 'eq' + (t.playing ? ' on' : '') }, h('i'), h('i'), h('i')),
            h('div', {}, h('strong', {}, t.title), h('small', {}, t.artist || t.app))
        );
    }

    function card(id, title, desc, preview, extra) {
        const active = state.config.background === id;
        return h('button', {
            class: 'card' + (active ? ' active' : ''),
            title: desc,
            onclick: () => send(id === 'image' ? { type: 'pickImage' } : { type: 'setBackground', id }),
        }, preview, h('div', { class: 'card-body' }, h('strong', {}, title), h('small', {}, desc), extra || null));
    }

    function renderBackgrounds() {
        $('specials').replaceChildren(...state.specials.map(s => {
            const preview = h('div', { class: 'preview special special-' + s.id }, h('span', {}, s.icon));
            const extra = s.id === 'image' && state.config.customImage
                ? h('small', { class: 'path' }, state.config.customImage.split(/[\\/]/).pop())
                : null;
            if (s.id === 'album' && state.platform !== 'win32') {
                return card(s.id, s.name, T('windowsOnly'), preview);
            }
            return card(s.id, s.name, s.description, preview, extra);
        }));
        $('gradients').replaceChildren(...state.gradients.map(g => {
            const preview = h('div', { class: 'preview' + (g.animated ? ' animated' : '') });
            preview.style.background = g.css;
            return card(g.id, g.name, g.description, preview, g.animated ? h('em', {}, T('animated')) : null);
        }));
    }

    const SLIDERS = {
        glassOpacity: v => Math.round(v * 100) + '%',
        backgroundDim: v => Math.round(v * 100) + '%',
        backgroundBlur: v => v + ' px',
        'music.reactivity': v => Math.round(v * 100) + '%',
        windowOpacity: v => Math.round(v * 100) + '%',
    };
    const CONFIG_KEY = {
        windowOpacity: 'windowOpacity',
        glassOpacity: 'glassOpacity',
        backgroundDim: 'backgroundDim',
        backgroundBlur: 'backgroundBlur',
        'music.reactivity': 'musicReactivity',
        'music.enabled': 'musicEnabled',
        transparency: 'transparency',
    };
    const timers = {};

    function renderSettings() {
        for (const [id, fmt] of Object.entries(SLIDERS)) {
            const input = /** @type {HTMLInputElement} */ ($(id));
            if (document.activeElement !== input) {
                input.value = String(state.config[CONFIG_KEY[id]]);
            }
            $(id + '-val').textContent = fmt(Number(input.value));
        }
        /** @type {HTMLInputElement} */ ($('music.enabled')).checked = state.config.musicEnabled;
        /** @type {HTMLSelectElement} */ ($('transparency')).value = state.config.transparency;
        /** @type {HTMLSelectElement} */ ($('language')).value = state.config.language;
    }

    for (const [id, fmt] of Object.entries(SLIDERS)) {
        const input = /** @type {HTMLInputElement} */ ($(id));
        input.addEventListener('input', () => {
            $(id + '-val').textContent = fmt(Number(input.value));
            clearTimeout(timers[id]);
            timers[id] = setTimeout(() => send({ type: 'setSetting', key: id, value: Number(input.value) }), 150);
        });
    }
    $('music.enabled').addEventListener('change', e =>
        send({ type: 'setSetting', key: 'music.enabled', value: /** @type {HTMLInputElement} */ (e.target).checked }));
    $('transparency').addEventListener('change', e =>
        send({ type: 'setSetting', key: 'transparency', value: /** @type {HTMLSelectElement} */ (e.target).value }));
    $('language').addEventListener('change', e =>
        send({ type: 'setSetting', key: 'language', value: /** @type {HTMLSelectElement} */ (e.target).value }));
    $('refresh-fonts').addEventListener('click', () => send({ type: 'refreshFonts' }));
    document.querySelectorAll('[data-visibility]').forEach(b => b.addEventListener('click', e => {
        e.preventDefault();
        send({ type: 'setSetting', key: 'windowOpacity', value: Number(/** @type {HTMLElement} */ (b).dataset.visibility) });
    }));

    $('pick-installed').addEventListener('click', () => send({ type: 'pickInstalledFont' }));
    $('install-file').addEventListener('click', () => send({ type: 'installFontFile' }));

    function renderFonts() {
        const code = (state.currentFont || '').toLowerCase();
        const ui = (state.config.uiFont || '').toLowerCase();
        const uses = (current, family) => current.startsWith("'" + family.toLowerCase() + "'") || current.startsWith(family.toLowerCase());

        const uiBox = $('ui-font');
        uiBox.hidden = !ui;
        if (ui) {
            uiBox.replaceChildren(
                h('span', {}, T('uiFont'), h('strong', {}, state.config.uiFont)),
                h('button', { class: 'link', onclick: () => send({ type: 'resetUiFont' }) }, T('restoreUiFont')));
        }

        function row(f) {
            const inCode = uses(code, f.resolvedFamily);
            const inUi = ui === f.resolvedFamily.toLowerCase();
            let actions;
            if (f.installed === false && f.autoInstall) {
                // Los botones instalan la fuente (descarga automática) y luego la aplican.
                actions = [
                    h('button', { class: f.mono === false ? '' : 'primary', title: T('installCodeTitle'), onclick: () => send({ type: 'applyFont', id: f.id, target: 'code' }) }, T('installCode')),
                    h('button', { class: f.mono === false ? 'primary' : '', title: T('installUiTitle'), onclick: () => send({ type: 'applyFont', id: f.id, target: 'ui' }) }, T('installUi')),
                ];
            } else if (f.installed === false) {
                actions = [h('button', { onclick: () => send({ type: 'applyFont', id: f.id, target: 'code' }) }, T('download'))];
            } else {
                actions = [
                    inCode ? h('span', { class: 'badge active' }, T('inCode'))
                        : h('button', { class: f.mono === false ? '' : 'primary', onclick: () => send({ type: 'applyFont', id: f.id, target: 'code' }) }, T('code')),
                    inUi ? h('span', { class: 'badge active' }, T('inUi'))
                        : h('button', { class: f.mono === false ? 'primary' : '', onclick: () => send({ type: 'applyFont', id: f.id, target: 'ui' }) }, T('ui')),
                ];
            }
            const sample = h('div', { class: 'sample' }, f.category === 'game' && f.mono === false ? (f.game || f.name) + ' · ' + T('hello') : T('sample'));
            sample.style.fontFamily = `'${f.resolvedFamily}', monospace`;
            sample.style.fontVariantLigatures = f.ligatures ? 'normal' : 'none';
            return h('div', { class: 'font' + (inCode || inUi ? ' active' : '') },
                h('div', { class: 'font-head' },
                    h('strong', {}, f.name),
                    f.game ? h('span', { class: 'badge game' }, f.game) : null,
                    f.installed === true ? h('span', { class: 'badge' }, T('installed')) : null,
                    f.installed === false ? h('span', { class: 'badge muted' }, T('notInstalled')) : null,
                    f.mono === false ? h('span', { class: 'badge muted' }, T('decorative')) : null,
                    f.ligatures ? h('span', { class: 'badge muted' }, T('ligatures')) : null,
                    h('span', { class: 'spacer' }),
                    ...actions),
                sample,
                h('small', {}, f.note));
        }

        $('fonts').replaceChildren(...state.fonts.filter(f => f.category !== 'game').map(row));
        $('game-fonts').replaceChildren(...state.fonts.filter(f => f.category === 'game').map(row));
    }

    send({ type: 'ready' });
})();
