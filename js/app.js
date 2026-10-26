// App shell: wires the controls, routes transport to the active provider,
// and runs the render loop.
(function () {
  const { Engine, Demo, Files } = window.VizAudio;
  const Spotify = window.VizSpotify, Apple = window.VizApple, Themes = window.VizThemes, Studio = window.VizStudio;
  const $ = id => document.getElementById(id);
  const store = Spotify.store;
  const embedded = window.self !== window.top; // running inside a preview frame
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const META = Themes.meta, IDS = META.map(m => m.id);
  const pref = (k, def) => { const v = store.get(k); return v == null ? def : v === '1'; };

  const S = {
    theme: IDS.includes(store.get('theme')) ? store.get('theme') : 'chrome',
    mode: ['radial', 'wave', 'kaleido'].includes(store.get('mode')) ? store.get('mode') : 'radial',
    sens: Number(store.get('sens') || 1.1),
    vol: Number(store.get('vol') || 0.8),
    flash: pref('flash', !reduceMotion),
    autoHide: pref('autoHide', true),
    titleCard: pref('titleCard', true),
    autoGain: pref('autoGain', true),
    view: store.get('view') === 'studio' ? 'studio' : 'theme', // theme | studio
    studio: (() => { try { return Studio.normalize(JSON.parse(store.get('studio'))); } catch { return Studio.normalize(); } })(),
    shuffle: false,
    provider: 'demo', // demo | files | spotify | apple
    capture: null,    // tab | mic | null
  };

  // ---------------- toast ----------------
  let toastTimer;
  function toast(msg, ms = 4200) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), ms); }
  const fail = e => toast(e && e.message ? e.message : String(e), 6000);

  // ---------------- themes ----------------
  const canvas = $('viz');
  const grid = $('themeGrid');
  META.forEach((m, i) => {
    const b = document.createElement('button');
    b.className = 'theme-card'; b.type = 'button'; b.dataset.themeBtn = m.id; b.id = 'card-' + m.id;
    const sw = document.createElement('span'); sw.className = 'tc-swatch'; sw.style.background = m.swatch;
    const kbd = document.createElement('kbd'); kbd.textContent = (i + 1) % 10; sw.append(kbd);
    const lab = document.createElement('span'); lab.className = 'tc-label';
    const name = document.createElement('b'); name.textContent = m.name;
    const after = document.createElement('small'); after.textContent = m.after;
    lab.append(name, after); b.append(sw, lab);
    b.addEventListener('click', () => setTheme(m.id));
    grid.append(b);
  });

  let cardTimer;
  function showCard(name, sub) {
    if (!S.titleCard) return;
    $('tcName').textContent = name; $('tcAfter').textContent = sub;
    const c = $('titleCard'); c.classList.add('show'); clearTimeout(cardTimer); cardTimer = setTimeout(() => c.classList.remove('show'), 1600);
  }
  function setTheme(id, quiet) {
    const m = META.find(x => x.id === id) || META[0];
    const changed = S.view !== 'theme' || S.theme !== m.id;
    S.view = 'theme'; store.set('view', 'theme');
    S.theme = m.id; document.body.dataset.theme = m.id; store.set('theme', m.id);
    document.body.style.removeProperty('--accent'); document.body.style.removeProperty('--accent-2');
    document.querySelectorAll('[data-theme-btn]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.themeBtn === m.id)));
    document.querySelectorAll('[data-vis]').forEach(b => b.setAttribute('aria-pressed', 'false'));
    $('pillName').textContent = m.name;
    $('pillCount').textContent = `Theme ${IDS.indexOf(m.id) + 1} / ${IDS.length} · ${m.after}`;
    $('pillSwatch').style.background = m.swatch;
    if (changed) startFade();
    if (!quiet && changed) showCard(m.name, m.after);
    shuffleClock = performance.now();
  }

  // ---------------- studio ----------------
  const VIS_IDS = Studio.ids;
  const VIS_ICONS = {
    nebula: '<circle cx="16" cy="16" r="3"/><circle cx="8" cy="10" r="1.6"/><circle cx="24" cy="9" r="1.2"/><circle cx="25" cy="21" r="1.8"/><circle cx="9" cy="23" r="1.3"/><circle cx="16" cy="5" r="1"/><circle cx="16" cy="27" r="1"/>',
    ridges: '<path d="M3 10h6l3-4 3 4h14M3 16h7l3-6 3 6h13M3 22h8l3-5 3 5h12" fill="none" stroke-width="2"/>',
    tunnel: '<circle cx="16" cy="16" r="13" fill="none" stroke-width="1.5"/><circle cx="16" cy="16" r="8.5" fill="none" stroke-width="1.5"/><circle cx="16" cy="16" r="4.5" fill="none" stroke-width="1.5"/><circle cx="16" cy="16" r="1.5"/>',
    spiral: Array.from({ length: 34 }, (_, i) => { const a = i * 2.4, r = Math.sqrt(i / 34) * 13; return `<circle cx="${(16 + Math.cos(a) * r).toFixed(1)}" cy="${(16 + Math.sin(a) * r).toFixed(1)}" r="${(0.6 + i / 34 * 1.3).toFixed(1)}"/>`; }).join(''),
    silk: '<path d="M2 14c6-8 10 8 16 0s10-6 12-2M2 19c6-6 10 6 16 0s10-4 12-1" fill="none" stroke-width="2"/>',
    blob: '<path d="M16 3c6 0 13 5 12 12s-5 14-12 14S3 24 4 16 10 3 16 3z"/>',
    polys: '<path d="M16 3l11 19H5z" fill="none" stroke-width="1.6"/><path d="M16 8l8 8-8 8-8-8z" fill="none" stroke-width="1.6"/><circle cx="16" cy="16" r="3" fill="none" stroke-width="1.6"/>',
    flow: '<path d="M3 9c5-4 8 4 13 0s8-3 13 0M3 16c5-4 8 4 13 0s8-3 13 0M3 23c5-4 8 4 13 0s8-3 13 0" fill="none" stroke-width="1.6" stroke-linecap="round"/>',
    orbitals: '<ellipse cx="16" cy="16" rx="13" ry="5" fill="none" stroke-width="1.5"/><ellipse cx="16" cy="16" rx="13" ry="5" transform="rotate(60 16 16)" fill="none" stroke-width="1.5"/><ellipse cx="16" cy="16" rx="13" ry="5" transform="rotate(120 16 16)" fill="none" stroke-width="1.5"/>',
  };
  const gradCss = (colors, deg = 90) => `linear-gradient(${deg}deg, ${colors.join(', ')})`;
  const lum = hex => { const n = parseInt(hex.slice(1), 16); return 0.2126 * (n >> 16 & 255) + 0.7152 * (n >> 8 & 255) + 0.0722 * (n & 255); };

  VIS_IDS.forEach(id => {
    const v = Studio.VIS[id], b = document.createElement('button');
    b.type = 'button'; b.className = 'vis-card'; b.dataset.vis = id; b.id = 'vis-' + id;
    b.innerHTML = `<svg viewBox="0 0 32 32" aria-hidden="true">${VIS_ICONS[id]}</svg>`;
    const sp = document.createElement('span'), nm = document.createElement('b'), bl = document.createElement('small');
    nm.textContent = v.name; bl.textContent = v.blurb; sp.append(nm, bl); b.append(sp);
    b.addEventListener('click', () => setVis(id));
    $('visGrid').append(b);
  });
  Studio.PALETTES.forEach((p, i) => {
    const b = document.createElement('button'), sw = document.createElement('i'), nm = document.createElement('span');
    b.type = 'button'; b.className = 'palette'; b.id = 'pal-' + i; b.dataset.palette = i;
    sw.style.background = gradCss(p.colors); nm.textContent = p.name; b.append(sw, nm);
    b.addEventListener('click', () => { S.studio.colors = p.colors.slice(); saveStudio(true); });
    $('paletteGrid').append(b);
  });
  const FX = [['bloom', 'Bloom'], ['trails', 'Trails'], ['zoom', 'Beat zoom'], ['mirror', 'Mirror'], ['kaleido', 'Kaleidoscope'], ['rgb', 'RGB split'], ['cycle', 'Color cycle']];
  FX.forEach(([k, label]) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'fx'; b.dataset.fx = k; b.id = 'fx-' + k; b.textContent = label;
    b.addEventListener('click', () => { S.studio.fx[k] = !S.studio.fx[k]; saveStudio(); });
    $('fxGrid').append(b);
  });
  document.querySelectorAll('[data-bg]').forEach(b => b.addEventListener('click', () => { S.studio.bg = b.dataset.bg; saveStudio(); }));

  function renderStops() {
    const box = $('stops'); box.textContent = '';
    S.studio.colors.forEach((c, i) => {
      const wrap = document.createElement('div'); wrap.className = 'stop';
      const inp = document.createElement('input'); inp.type = 'color'; inp.value = c; inp.id = 'stop-' + i; inp.setAttribute('aria-label', `Color ${i + 1}`);
      const code = document.createElement('code'); code.textContent = c;
      const rm = document.createElement('button'); rm.type = 'button'; rm.className = 'rm'; rm.textContent = '✕'; rm.setAttribute('aria-label', `Remove color ${i + 1}`);
      rm.disabled = S.studio.colors.length <= 2;
      inp.addEventListener('input', () => { S.studio.colors[i] = inp.value; code.textContent = inp.value; saveStudio(false, true); });
      rm.addEventListener('click', () => { S.studio.colors.splice(i, 1); saveStudio(true); });
      wrap.append(inp, rm, code); box.append(wrap);
    });
    $('addStop').disabled = S.studio.colors.length >= 6;
  }
  // rebuild: re-render the colour inputs too (skipped while a picker is being dragged)
  function saveStudio(rebuild, live) {
    S.studio = Studio.normalize(S.studio);
    store.set('studio', JSON.stringify(S.studio));
    const st = S.studio, g = gradCss(st.colors);
    document.body.style.setProperty('--grad', g);
    $('gradPreview').style.background = g;
    if (rebuild) renderStops();
    if (live) return refreshStudioAccent();
    document.querySelectorAll('[data-vis]').forEach(b => b.setAttribute('aria-pressed', String(S.view === 'studio' && b.dataset.vis === st.vis)));
    document.querySelectorAll('[data-palette]').forEach(b => b.setAttribute('aria-pressed', String(Studio.PALETTES[b.dataset.palette].colors.join() === st.colors.join())));
    document.querySelectorAll('[data-fx]').forEach(b => b.setAttribute('aria-pressed', String(!!st.fx[b.dataset.fx])));
    document.querySelectorAll('[data-bg]').forEach(b => b.setAttribute('aria-pressed', String(st.bg === b.dataset.bg)));
    refreshStudioAccent();
    renderPresets();
  }
  function refreshStudioAccent() {
    const cols = S.studio.colors, sorted = [...cols].sort((x, y) => lum(y) - lum(x));
    $('gradDot').style.background = `conic-gradient(${cols.join(', ')}, ${cols[0]})`;
    if (S.view !== 'studio') return;
    $('pillSwatch').style.background = `conic-gradient(${cols.join(', ')}, ${cols[0]})`;
    document.body.style.setProperty('--accent', sorted[0]);
    document.body.style.setProperty('--accent-2', sorted[1] || sorted[0]);
  }
  function setVis(id, quiet) {
    const v = Studio.VIS[id] || Studio.VIS[VIS_IDS[0]];
    const changed = S.view !== 'studio' || S.studio.vis !== id;
    S.view = 'studio'; store.set('view', 'studio');
    S.studio.vis = id; document.body.dataset.theme = 'studio';
    document.querySelectorAll('[data-theme-btn]').forEach(b => b.setAttribute('aria-pressed', 'false'));
    $('pillName').textContent = v.name;
    $('pillCount').textContent = `Studio ${VIS_IDS.indexOf(id) + 1} / ${VIS_IDS.length} · ${v.blurb}`;
    saveStudio();
    if (changed) startFade();
    if (!quiet && changed) showCard(v.name, 'Studio');
    shuffleClock = performance.now();
  }
  $('addStop').addEventListener('click', () => {
    const c = S.studio.colors; if (c.length >= 6) return;
    c.push(Studio.randomPalette()[0]); saveStudio(true);
  });
  function randomGradient() { S.studio.colors = Studio.randomPalette(); saveStudio(true); if (S.view !== 'studio') setVis(S.studio.vis); }
  $('randomGrad').addEventListener('click', randomGradient);
  $('reverseGrad').addEventListener('click', () => { S.studio.colors.reverse(); saveStudio(true); });
  $('colorsBtn').addEventListener('click', () => {
    if (S.view !== 'studio') { setVis(S.studio.vis); toast('Colors drive the Studio visualizers. Pick a gradient or build your own.', 3500); }
    openDrawer('studio');
    $('colorsSection').scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' });
  });

  // presets: built-ins plus your own, and portable share codes
  const encodeLook = cfg => 'XV1.' + btoa(unescape(encodeURIComponent(JSON.stringify(cfg)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  function decodeLook(code) {
    const body = code.trim().replace(/^XV1\./, '').replace(/-/g, '+').replace(/_/g, '/');
    return Studio.normalize(JSON.parse(decodeURIComponent(escape(atob(body + '==='.slice((body.length + 3) % 4))))));
  }
  const userPresets = () => { try { return JSON.parse(store.get('studioPresets')) || []; } catch { return []; } };
  function applyLook(cfg, name) { S.studio = Studio.normalize(JSON.parse(JSON.stringify(cfg))); saveStudio(true); setVis(S.studio.vis, true); if (name) showCard(name, 'Studio preset'); }
  function renderPresets() {
    const box = $('presetList'); box.textContent = '';
    const mine = userPresets();
    [...Studio.PRESETS.map(p => ({ ...p, builtin: true })), ...mine].forEach((p, i) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'preset';
      const sw = document.createElement('i'); sw.style.background = `conic-gradient(${p.cfg.colors.join(', ')}, ${p.cfg.colors[0]})`;
      const nm = document.createElement('span'); nm.textContent = p.name; b.append(sw, nm);
      b.addEventListener('click', e => {
        if (e.target.classList.contains('x')) { const list = userPresets().filter(x => x.name !== p.name); store.set('studioPresets', JSON.stringify(list)); renderPresets(); toast(`Deleted “${p.name}”.`, 2000); return; }
        applyLook(p.cfg, p.name);
      });
      if (!p.builtin) { const x = document.createElement('em'); x.className = 'x'; x.textContent = '✕'; x.title = 'Delete preset'; b.append(x); }
      box.append(b);
    });
  }
  $('presetForm').addEventListener('submit', e => {
    e.preventDefault();
    const name = $('presetName').value.trim() || `My look ${userPresets().length + 1}`;
    const list = userPresets().filter(x => x.name !== name);
    list.push({ name, cfg: JSON.parse(JSON.stringify(S.studio)) });
    store.set('studioPresets', JSON.stringify(list.slice(-24)));
    $('presetName').value = ''; renderPresets(); toast(`Saved “${name}”.`, 2000);
  });
  $('codeForm').addEventListener('submit', e => {
    e.preventDefault();
    try { applyLook(decodeLook($('shareCode').value), 'Shared look'); $('shareCode').value = ''; }
    catch { toast('That share code is not valid. Copy it again and paste the whole thing.'); }
  });
  $('copyCode').addEventListener('click', () => {
    const code = encodeLook(S.studio), field = $('shareCode');
    const fallback = () => { field.value = code; field.focus(); field.select(); toast('Code selected. Copy it to share this look.', 3000); };
    try { navigator.clipboard.writeText(code).then(() => toast('Share code copied.', 2000), fallback); } catch { fallback(); }
  });

  const stepTheme = d => {
    if (S.view === 'studio') return setVis(VIS_IDS[(VIS_IDS.indexOf(S.studio.vis) + d + VIS_IDS.length) % VIS_IDS.length]);
    setTheme(IDS[(IDS.indexOf(S.theme) + d + IDS.length) % IDS.length]);
  };
  // theme crossfade: freeze the last frame of the old theme and fade it out over the new one
  const fadeCanvas = document.createElement('canvas');
  let fadeStart = -1;
  function startFade() {
    if (reduceMotion || !canvas.width) return;
    fadeCanvas.width = canvas.width; fadeCanvas.height = canvas.height;
    fadeCanvas.getContext('2d').drawImage(canvas, 0, 0);
    fadeStart = performance.now();
  }
  function drawFade(ctx, t) {
    if (fadeStart < 0) return;
    const k = 1 - (t - fadeStart) / 700;
    if (k <= 0) { fadeStart = -1; return; }
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = k * k; ctx.drawImage(fadeCanvas, 0, 0); ctx.restore();
  }
  $('themePrev').addEventListener('click', () => stepTheme(-1));
  $('themeNext').addEventListener('click', () => stepTheme(1));
  $('themePill').addEventListener('click', () => openDrawer(S.view === 'studio' ? 'studio' : 'themes', true));

  // shuffle: new theme every 30 s, switched on a beat when music is live
  let shuffleClock = performance.now();
  function setShuffle(on) { S.shuffle = on; $('shuffleBtn').setAttribute('aria-pressed', String(on)); shuffleClock = performance.now(); toast(on ? 'Shuffle on. A new look every 30 seconds.' : 'Shuffle off.', 2500); }
  $('shuffleBtn').addEventListener('click', () => setShuffle(!S.shuffle));
  function shuffleTick(t, a) {
    if (!S.shuffle || t - shuffleClock < 30000) return;
    if (Engine.live && !a.beat && t - shuffleClock < 34000) return;
    if (S.view === 'studio') { let v; do { v = VIS_IDS[Math.floor(Math.random() * VIS_IDS.length)]; } while (v === S.studio.vis); setVis(v); return; }
    let next; do { next = IDS[Math.floor(Math.random() * IDS.length)]; } while (next === S.theme);
    setTheme(next);
  }



  function setMode(m) {
    S.mode = m; store.set('mode', m);
    document.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
  }
  document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));

  // ---------------- drawer ----------------
  const drawer = $('drawer');
  function openDrawer(tab, toggle) {
    if (toggle && !drawer.hidden && drawer.dataset.tab === tab) { drawer.hidden = true; return; }
    drawer.hidden = false; drawer.dataset.tab = tab;
    document.querySelectorAll('.tab').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    document.querySelectorAll('.tab-body').forEach(s => { s.hidden = s.dataset.body !== tab; });
    wake();
  }
  document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => openDrawer(b.dataset.tab)));
  $('closeDrawer').addEventListener('click', () => { drawer.hidden = true; });
  $('openSource').addEventListener('click', () => openDrawer('source', true));
  $('helpBtn').addEventListener('click', () => { $('help').hidden = false; });
  $('closeHelp').addEventListener('click', () => { $('help').hidden = true; });
  $('help').addEventListener('click', e => { if (e.target.id === 'help') $('help').hidden = true; });

  // ---------------- providers ----------------
  function stopLocal() { if (Demo.playing) Demo.stop(); Files.pause(); }
  function stopCapture() { Engine.stopStream(); S.capture = null; }
  function setProvider(p) {
    if (p !== S.provider && (S.provider === 'demo' || S.provider === 'files')) stopLocal();
    S.provider = p; refreshSourceUI();
  }
  const streamState = () => S.provider === 'spotify' ? Spotify.state : S.provider === 'apple' ? Apple.state : null;
  function isPlaying() {
    if (S.provider === 'demo') return Demo.playing;
    if (S.provider === 'files') return !!Files.playing;
    const st = streamState(); return !!(st && st.playing);
  }
  function updateLive() {
    Engine.live = !!S.capture || (S.provider === 'demo' && Demo.playing) || (S.provider === 'files' && !!Files.playing);
  }

  const transport = {
    async toggle() {
      try {
        if (S.provider === 'demo') { stopCapture(); Demo.playing ? Demo.stop() : Demo.start(); }
        else if (S.provider === 'files') { stopCapture(); Files.playing ? Files.pause() : await Files.play(); }
        else if (S.provider === 'spotify') { isPlaying() ? await Spotify.pause() : await Spotify.play(); setTimeout(pollSpotify, 400); }
        else if (S.provider === 'apple') { isPlaying() ? await Apple.pause() : await Apple.play(); }
      } catch (e) { fail(e); }
      updateLive(); refreshNow();
    },
    async go(d) {
      try {
        if (S.provider === 'demo') Demo.go(d);
        else if (S.provider === 'files') Files.go(d);
        else if (S.provider === 'spotify') { await (d > 0 ? Spotify.next() : Spotify.prev()); setTimeout(pollSpotify, 500); }
        else if (S.provider === 'apple') await (d > 0 ? Apple.next() : Apple.prev());
      } catch (e) { fail(e); }
      updateLive(); refreshNow();
    },
    async seek(frac) {
      try {
        if (S.provider === 'files') Files.seek(frac);
        else if (S.provider === 'spotify') { await Spotify.seek(frac); setTimeout(pollSpotify, 400); }
        else if (S.provider === 'apple') await Apple.seek(frac);
        else toast('Demo beats loop forever, so there is nothing to skip to.', 2500);
      } catch (e) { fail(e); }
      refreshNow();
    },
  };
  $('playBtn').addEventListener('click', () => transport.toggle());
  $('prevBtn').addEventListener('click', () => transport.go(-1));
  $('nextBtn').addEventListener('click', () => transport.go(1));
  $('seek').addEventListener('click', e => {
    const r = $('seek').getBoundingClientRect(), x = Math.min(1, Math.max(0, (e.clientX - r.left - 14) / (r.width - 28)));
    transport.seek(x);
  });
  $('seek').addEventListener('keydown', e => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault(); e.stopPropagation();
    transport.seek(Math.min(1, Math.max(0, currentProgress() + (e.key === 'ArrowRight' ? 0.05 : -0.05))));
  });

  // ---------------- sources ----------------
  $('srcDemo').addEventListener('click', () => { stopCapture(); setProvider('demo'); if (!Demo.playing) Demo.start(); updateLive(); refreshNow(); });
  $('fileInput').addEventListener('change', async e => {
    if (!e.target.files.length) return;
    stopCapture(); Files.load(e.target.files); setProvider('files');
    try { await Files.play(); } catch (err) { fail(err); }
    updateLive(); refreshNow(); e.target.value = '';
  });

  const streamingBlocked = () => { if (embedded) { toast('Streaming sign-in and sound capture run in the full app on your computer. See the README.', 6500); return true; } return false; };

  $('srcSpotify').addEventListener('click', async () => {
    if (streamingBlocked()) return;
    if (!Spotify.connected) { try { await Spotify.login(); } catch (e) { fail(e); openDrawer('settings'); } return; }
    setProvider('spotify'); await pollSpotify();
    if (!S.capture) toast('Spotify connected. Turn on “Tab or system audio” and pick the Spotify tab or your screen.', 6500);
  });
  $('srcApple').addEventListener('click', async () => {
    if (streamingBlocked()) return;
    try {
      if (!Apple.connected) { $('appleStatus').textContent = 'Connecting…'; await Apple.connect(refreshNow); }
      setProvider('apple'); $('appleSearch').hidden = false; $('appleQuery').focus();
      if (!S.capture) toast('Apple Music connected. Search a song, then turn on “Tab or system audio” and choose this tab.', 6500);
    } catch (e) { fail(e); openDrawer('settings'); }
    refreshSourceUI();
  });
  $('appleSearch').addEventListener('submit', async e => {
    e.preventDefault();
    const q = $('appleQuery').value.trim(); if (!q) return;
    const ul = $('appleResults'); ul.textContent = 'Searching…';
    try {
      const songs = await Apple.search(q); ul.textContent = '';
      if (!songs.length) ul.textContent = 'No songs found.';
      songs.forEach(s => {
        const li = document.createElement('li'), b = document.createElement('button'), img = document.createElement('img'), sp = document.createElement('span');
        img.src = s.art; img.alt = ''; sp.textContent = `${s.title} — ${s.artist}`; b.type = 'button'; b.append(img, sp);
        b.addEventListener('click', async () => { try { await Apple.playSong(s.id); } catch (err) { fail(err); } });
        li.append(b); ul.append(li);
      });
    } catch (err) { ul.textContent = ''; fail(err); }
  });

  async function startCapture(kind) {
    if (streamingBlocked()) return;
    try {
      let stream;
      if (kind === 'mic') {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      } else {
        if (!navigator.mediaDevices.getDisplayMedia) throw new Error('This browser cannot share tab audio. Try Chrome or Edge, or use the microphone.');
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: true, audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
          preferCurrentTab: S.provider === 'apple', selfBrowserSurface: 'include', systemAudio: 'include',
        });
        if (!stream.getAudioTracks().length) { stream.getTracks().forEach(t => t.stop()); throw new Error('No sound came through. Share again and tick “Share tab audio” (or “Share system audio”).'); }
      }
      if (S.provider === 'demo' || S.provider === 'files') stopLocal();
      await Engine.useStream(stream);
      S.capture = kind;
      stream.getTracks().forEach(t => t.addEventListener('ended', () => { if (S.capture === kind) { stopCapture(); updateLive(); refreshSourceUI(); toast('Sound capture stopped.'); } }));
      toast(kind === 'mic' ? 'Listening through the microphone.' : 'Capturing sound. The visuals now follow the music.');
    } catch (e) { if (e.name !== 'NotAllowedError') fail(e); else toast('Sharing was cancelled.'); }
    updateLive(); refreshSourceUI();
  }
  $('srcTab').addEventListener('click', () => S.capture === 'tab' ? (stopCapture(), updateLive(), refreshSourceUI()) : startCapture('tab'));
  $('srcMic').addEventListener('click', () => S.capture === 'mic' ? (stopCapture(), updateLive(), refreshSourceUI()) : startCapture('mic'));

  // ---------------- settings ----------------
  $('redirectUri').textContent = Spotify.redirectUri;
  $('spotifyClientId').value = store.get('spotifyClientId') || '';
  $('appleToken').value = store.get('appleToken') || '';
  [['flashToggle', 'flash'], ['autoHideToggle', 'autoHide'], ['cardToggle', 'titleCard'], ['autoGainToggle', 'autoGain']].forEach(([id, key]) => {
    $(id).checked = S[key];
    $(id).addEventListener('change', e => { S[key] = e.target.checked; store.set(key, S[key] ? '1' : '0'); Engine.autoGain = S.autoGain; });
  });
  Engine.autoGain = S.autoGain;
  $('saveSetup').addEventListener('click', () => {
    store.set('spotifyClientId', $('spotifyClientId').value.trim() || null);
    store.set('appleToken', $('appleToken').value.trim() || null);
    toast('Saved on this device.');
  });

  // ---------------- sliders / view ----------------
  $('sens').value = S.sens; $('vol').value = S.vol;
  $('sens').addEventListener('input', e => setTune('gain', Number(e.target.value)));

  // ---------------- sync: reaction tuning ----------------
  const FEELS = {
    Chill: { gain: 1, bass: 1, mid: 1, high: 0.8, attack: 0.5, release: 0.8, beat: 0.35, punch: 0.6, motion: 0.6 },
    Balanced: { gain: 1.1, bass: 1, mid: 1, high: 1, attack: 0.85, release: 0.55, beat: 0.5, punch: 1, motion: 1 },
    Punchy: { gain: 1.2, bass: 1.2, mid: 1, high: 1, attack: 1, release: 0.3, beat: 0.65, punch: 1.6, motion: 1.4 },
    'Bass heavy': { gain: 1.1, bass: 1.5, mid: 0.8, high: 0.7, attack: 0.95, release: 0.45, beat: 0.55, punch: 1.4, motion: 1.1 },
    Vocal: { gain: 1.2, bass: 0.8, mid: 1.4, high: 1.1, attack: 0.7, release: 0.65, beat: 0.4, punch: 0.8, motion: 0.9 },
  };
  const TUNE_ROWS = {
    tuneLevels: [
      ['gain', 'Overall gain', 0.4, 2.5, 0.05, 'How big everything moves'],
      ['bass', 'Bass', 0, 2.5, 0.05, 'Kicks and sub, below ~250 Hz'],
      ['mid', 'Mids', 0, 2.5, 0.05, 'Vocals, synths, guitars'],
      ['high', 'Highs', 0, 2.5, 0.05, 'Hi-hats, cymbals, air'],
    ],
    tuneTiming: [
      ['attack', 'Attack', 0, 1, 0.01, 'How fast visuals jump on a hit'],
      ['release', 'Decay', 0, 1, 0.01, 'How long they hang before falling'],
      ['beat', 'Beat sensitivity', 0, 1, 0.01, 'Low catches only big hits, high catches every tick'],
      ['punch', 'Beat punch', 0, 2, 0.05, 'How hard each kick hits the visuals'],
      ['motion', 'Motion speed', 0, 2.5, 0.05, 'Movement speed. It always follows the music\'s energy'],
    ],
  };
  const pct = (k, v) => k === 'gain' || k === 'bass' || k === 'mid' || k === 'high' || k === 'punch' || k === 'motion' ? `${Math.round(v * 100)}%` : `${Math.round(v * 100)}`;
  const saved = (() => { try { return JSON.parse(store.get('tune')) || {}; } catch { return {}; } })();
  Object.assign(Engine.tune, FEELS.Balanced, saved); delete Engine.tune.gain;
  Object.entries(TUNE_ROWS).forEach(([box, rows]) => rows.forEach(([k, label, min, max, step, help]) => {
    const row = document.createElement('div'); row.className = 'tune-row';
    const lab = document.createElement('label'); lab.htmlFor = 'tune-' + k; lab.textContent = label;
    const out = document.createElement('output'); out.id = 'out-' + k;
    const inp = document.createElement('input'); inp.type = 'range'; inp.id = 'tune-' + k; inp.min = min; inp.max = max; inp.step = step;
    const sm = document.createElement('small'); sm.textContent = help;
    inp.addEventListener('input', () => setTune(k, Number(inp.value)));
    row.append(lab, out, inp, sm); $(box).append(row);
  }));
  Object.keys(FEELS).forEach(name => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'feel'; b.dataset.feel = name; b.textContent = name;
    b.addEventListener('click', () => applyFeel(name));
    $('feelRow').append(b);
  });
  function tuneValue(k) { return k === 'gain' ? S.sens : Engine.tune[k]; }
  function setTune(k, v, quiet) {
    if (k === 'gain') { S.sens = v; store.set('sens', v); $('sens').value = v; }
    else Engine.tune[k] = v;
    if (!quiet) { store.set('tune', JSON.stringify(Engine.tune)); refreshTuneUI(); }
  }
  function applyFeel(name) {
    Object.entries(FEELS[name]).forEach(([k, v]) => setTune(k, v, true));
    store.set('tune', JSON.stringify(Engine.tune)); refreshTuneUI(); toast(`${name} feel.`, 1500);
  }
  function refreshTuneUI() {
    Object.values(TUNE_ROWS).flat().forEach(([k]) => { const v = tuneValue(k); $('tune-' + k).value = v; $('out-' + k).textContent = pct(k, v); });
    const cur = Object.entries(FEELS).find(([, f]) => Object.entries(f).every(([k, v]) => Math.abs(tuneValue(k) - v) < 0.011));
    document.querySelectorAll('[data-feel]').forEach(b => b.setAttribute('aria-pressed', String(!!cur && cur[0] === b.dataset.feel)));
  }
  $('resetTune').addEventListener('click', () => applyFeel('Balanced'));
  refreshTuneUI();

  // live meter + hit lamps, drawn only while the Sync tab is open
  const meterCtx = $('meter').getContext('2d');
  const lampOn = {};
  function drawMeter(a, t) {
    if (drawer.hidden || drawer.dataset.tab !== 'sync') return;
    const c = $('meter'), r = c.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1);
    if (c.width !== Math.round(r.width * d)) { c.width = Math.round(r.width * d); c.height = Math.round(96 * d); }
    const W2 = c.width, H2 = c.height, m = meterCtx, cs = getComputedStyle(document.body);
    m.clearRect(0, 0, W2, H2);
    const g = m.createLinearGradient(0, 0, W2, 0);
    g.addColorStop(0, cs.getPropertyValue('--accent').trim() || '#fff'); g.addColorStop(1, cs.getPropertyValue('--accent-2').trim() || '#fff');
    m.beginPath(); m.moveTo(0, H2);
    for (let i = 0; i < a.bands.length; i++) m.lineTo(i / (a.bands.length - 1) * W2, H2 - a.bands[i] * (H2 - 6));
    m.lineTo(W2, H2); m.closePath(); m.globalAlpha = 0.35; m.fillStyle = g; m.fill(); m.globalAlpha = 1;
    m.strokeStyle = g; m.lineWidth = 2 * d; m.stroke();
    m.fillStyle = 'rgba(255,255,255,.55)'; m.font = `${10 * d}px ui-monospace, monospace`;
    [['BASS', 0.04], ['MIDS', 0.3], ['HIGHS', 0.75]].forEach(([l, x]) => m.fillText(l, x * W2, 13 * d));
    [['kick', a.kick], ['snare', a.snare], ['hat', a.hat], ['drop', a.drop]].forEach(([k, hit]) => {
      if (hit) lampOn[k] = t;
      const on = t - (lampOn[k] || -1e9) < (k === 'drop' ? 900 : 110);
      const el = $('lamp-' + k); if (el.classList.contains('on') !== on) el.classList.toggle('on', on);
    });
    const bpm = a.bpm ? `${a.bpm} BPM` : '— BPM'; if ($('lampBpm').textContent !== bpm) $('lampBpm').textContent = bpm;
  }
  $('vol').addEventListener('input', e => { S.vol = Number(e.target.value); store.set('vol', S.vol); Engine.setVolume(S.vol); if (Apple.music) Apple.music.volume = S.vol; });
  function toggleFs() { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else (document.documentElement.requestFullscreen?.() || Promise.reject()).catch(() => toast('Fullscreen is not available here.')); }
  $('fsBtn').addEventListener('click', toggleFs);
  function toggleUI() { document.body.classList.toggle('ui-hidden'); if (document.body.classList.contains('ui-hidden')) toast('Controls hidden. Press H or tap the screen to bring them back.', 2500); }
  $('hideBtn').addEventListener('click', toggleUI);
  canvas.addEventListener('click', () => { document.body.classList.remove('ui-hidden'); drawer.hidden = true; });

  // auto-hide controls after a few idle seconds while music plays
  let idleTimer;
  function wake() {
    document.body.classList.remove('ui-idle');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (S.autoHide && isPlaying() && drawer.hidden && $('help').hidden && !document.querySelector('.deck:hover, .topbar:hover, input:focus')) document.body.classList.add('ui-idle');
    }, 3500);
  }
  ['pointermove', 'pointerdown', 'keydown', 'touchstart'].forEach(ev => addEventListener(ev, wake, { passive: true }));

  addEventListener('keydown', e => {
    if (e.target.closest('input, textarea')) return;
    const k = e.key;
    if (e.code === 'Space') { e.preventDefault(); transport.toggle(); }
    else if (k === 'ArrowRight') transport.go(1);
    else if (k === 'ArrowLeft') transport.go(-1);
    else if (k === ']') stepTheme(1);
    else if (k === '[') stepTheme(-1);
    else if (/^[0-9]$/.test(k)) setTheme(IDS[(Number(k) + 9) % 10]);
    else if (k === 'm' || k === 'M') { const ms = ['radial', 'wave', 'kaleido']; setMode(ms[(ms.indexOf(S.mode) + 1) % 3]); }
    else if (k === 's' || k === 'S') setShuffle(!S.shuffle);
    else if (k === 't' || k === 'T') openDrawer('themes', true);
    else if (k === 'f' || k === 'F') toggleFs();
    else if (k === 'h' || k === 'H') toggleUI();
    else if (k === 'p' || k === 'P') snapshot();
    else if (k === 'v' || k === 'V') setVis(S.view === 'studio' ? VIS_IDS[(VIS_IDS.indexOf(S.studio.vis) + 1) % VIS_IDS.length] : S.studio.vis);
    else if (k === 'c' || k === 'C') $('colorsBtn').click();
    else if (k === 'r' || k === 'R') randomGradient();
    else if (k === 'y' || k === 'Y') openDrawer('sync', true);
    else if (k === '?') $('help').hidden = !$('help').hidden;
    else if (k === 'Escape') { drawer.hidden = true; $('help').hidden = true; }
  });

  // ---------------- now playing ----------------
  const now = { title: '', artist: '', art: '', artImg: null, time: '00:00', playing: false };
  function setArt(url) {
    if (url === now.art) return; now.art = url;
    const box = $('art'); box.textContent = '';
    if (url) {
      const img = new Image(); img.alt = ''; img.src = url; box.append(img);
      const c = new Image(); c.crossOrigin = 'anonymous'; c.onerror = () => { const f = new Image(); f.src = url; now.artImg = f; }; c.src = url; now.artImg = c;
    }
    else { const s = document.createElement('span'); s.textContent = '♫'; box.append(s); now.artImg = null; }
  }
  function currentProgress() {
    if (S.provider === 'demo') return Demo.progress();
    if (S.provider === 'files') return Files.progress();
    const st = streamState(); return st ? st.progress : 0;
  }
  const mmss = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  function refreshNow() {
    let title = 'Press play', artist = '', art = '', secs = 0;
    if (S.provider === 'demo') { const t = Demo.track; title = t.title; artist = t.artist; secs = Demo.seconds(); }
    else if (S.provider === 'files') { const t = Files.track; if (t) { title = t.title; artist = t.artist; } secs = Files.seconds(); }
    else {
      const st = streamState();
      if (st) { title = st.title; artist = st.artist; art = st.art; secs = st.seconds || 0; }
      else { title = 'Nothing playing'; artist = S.provider === 'spotify' ? 'Start a song in any Spotify app' : 'Search for a song to play'; }
    }
    $('trackTitle').textContent = title; $('trackArtist').textContent = artist;
    const prog = currentProgress();
    $('progressBar').style.width = `calc(${(prog * 100).toFixed(1)}% - ${(prog * 28).toFixed(1)}px)`;
    $('seek').setAttribute('aria-valuenow', Math.round(prog * 100));
    setArt(art);
    const playing = isPlaying();
    if (title !== now.title || artist !== now.artist) updateMediaSession(title, artist, art);
    if (playing !== now.playing) { syncWakeLock(playing); if ('mediaSession' in navigator) navigator.mediaSession.playbackState = playing ? 'playing' : 'paused'; }
    Object.assign(now, { title, artist, time: mmss(secs), playing });
    const bpm = Engine.live && Engine.bpm ? `${Engine.bpm} BPM` : '';
    if ($('bpm').textContent !== bpm) $('bpm').textContent = bpm;
    $('playBtn').setAttribute('aria-label', playing ? 'Pause' : 'Play');
    $('playIcon').innerHTML = playing ? '<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>' : '<path d="M7 4v16l13-8z"/>';
  }
  function refreshSourceUI() {
    const labels = { demo: 'Demo', files: 'Files', spotify: 'Spotify', apple: 'Apple Music' };
    $('srcLabel').textContent = labels[S.provider] + (S.capture ? (S.capture === 'mic' ? ' + mic' : ' + capture') : '');
    $('srcDot').classList.toggle('live', Engine.live);
    const pressed = { srcDemo: S.provider === 'demo', srcFileLabel: S.provider === 'files', srcSpotify: S.provider === 'spotify', srcApple: S.provider === 'apple', srcTab: S.capture === 'tab', srcMic: S.capture === 'mic' };
    Object.entries(pressed).forEach(([id, v]) => $(id).setAttribute('aria-pressed', String(v)));
    $('spotifyStatus').textContent = Spotify.connected ? 'Connected' : 'Not connected';
    $('appleStatus').textContent = Apple.connected ? 'Connected' : 'Not connected';
    $('srcTab').querySelector('small').textContent = S.capture === 'tab' ? 'On · tap to stop' : 'Tick “Share audio” when asked';
    $('srcMic').querySelector('small').textContent = S.capture === 'mic' ? 'On · tap to stop' : 'Hears the room';
  }
  // lock screen, headphone buttons and keyboard media keys
  function updateMediaSession(title, artist, art) {
    if (!('mediaSession' in navigator)) return;
    try { navigator.mediaSession.metadata = new MediaMetadata({ title, artist, album: 'xVIZ', artwork: art ? [{ src: art, sizes: '300x300' }] : [] }); } catch {}
  }
  if ('mediaSession' in navigator) {
    const set = (action, fn) => { try { navigator.mediaSession.setActionHandler(action, fn); } catch {} };
    set('play', () => { if (!isPlaying()) transport.toggle(); });
    set('pause', () => { if (isPlaying()) transport.toggle(); });
    set('nexttrack', () => transport.go(1));
    set('previoustrack', () => transport.go(-1));
    set('seekto', d => { if (S.provider === 'files' && Files.el && Files.el.duration) transport.seek(d.seekTime / Files.el.duration); });
  }
  // keep the screen awake while music plays
  let wakeLock = null;
  async function syncWakeLock(on) {
    try {
      if (on && !wakeLock && navigator.wakeLock && document.visibilityState === 'visible') { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); }
      else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
    } catch { wakeLock = null; }
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncWakeLock(isPlaying()); });

  // drop audio files anywhere on the page
  let dragDepth = 0;
  addEventListener('dragenter', e => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { dragDepth++; $('dropZone').hidden = false; } });
  addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('dropZone').hidden = true; } });
  addEventListener('dragover', e => e.preventDefault());
  addEventListener('drop', async e => {
    e.preventDefault(); dragDepth = 0; $('dropZone').hidden = true;
    const files = [...e.dataTransfer.files].filter(f => f.type.startsWith('audio/') || /\.(mp3|wav|flac|m4a|aac|ogg|opus)$/i.test(f.name));
    if (!files.length) { toast('Drop audio files: MP3, WAV, FLAC, M4A, AAC or OGG.'); return; }
    stopCapture(); Files.load(files); setProvider('files');
    try { await Files.play(); } catch (err) { fail(err); }
    updateLive(); refreshNow(); toast(files.length === 1 ? `Playing ${files[0].name}` : `Playing ${files.length} files`, 2500);
  });

  // save the current frame as a PNG
  function snapshot() {
    if (embedded) { toast('Saving frames works in the full app.', 3000); return; }
    try {
      canvas.toBlob(blob => {
        if (!blob) { toast('Could not save this frame.'); return; }
        const a = document.createElement('a'), url = URL.createObjectURL(blob);
        a.href = url; a.download = `xviz-${S.view === 'studio' ? S.studio.vis : S.theme}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`;
        document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
        toast('Frame saved.', 2000);
      });
    } catch { toast('This cover art blocks saving frames. Try another theme or track.'); }
  }
  $('snapBtn').addEventListener('click', snapshot);
  if (embedded) $('snapBtn').hidden = true;

  async function pollSpotify() {
    if (S.provider !== 'spotify' || !Spotify.connected) return;
    try { await Spotify.poll(); } catch (e) { fail(e); }
    refreshNow();
  }
  setInterval(() => { refreshNow(); refreshSourceUI(); }, 500);
  setInterval(pollSpotify, 3000);

  // ---------------- render loop ----------------
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, dpr = 1;
  let maxDpr = 2;
  function resize() {
    dpr = Math.min(maxDpr, window.devicePixelRatio || 1);
    W = innerWidth; H = innerHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  addEventListener('resize', resize); resize();
  const opts = {};
  const playBtn = $('playBtn');
  let lastT = 0, slowFrames = 0, lastPulse = -1;
  function frame(t) {
    const a = Engine.analyse(S.sens, t);
    Object.assign(opts, { flash: S.flash, title: now.title, artist: now.artist, artImg: now.artImg, time: now.time, playing: now.playing });
    // visuals run on the audio clock (a.time), so motion follows the music instead of a metronome
    if (S.view === 'studio') Studio.render(ctx, canvas, dpr, W, H, a, a.time, S.studio);
    else Themes.render(ctx, canvas, dpr, W, H, a, a.time, S.theme, S.mode, opts);
    drawMeter(a, t);
    drawFade(ctx, t);
    shuffleTick(t, a);
    // the play button breathes with the beat
    const pulse = Math.round(a.beatPulse * 20) / 20;
    if (pulse !== lastPulse) { playBtn.style.setProperty('--pulse', pulse); lastPulse = pulse; }
    // drop to 1x resolution if the device can't keep up
    const dt = t - lastT; lastT = t;
    if (dt > 26 && dt < 200) slowFrames++; else if (slowFrames > 0) slowFrames -= 0.5;
    if (slowFrames > 90 && maxDpr > 1) { maxDpr = 1; slowFrames = 0; resize(); }
    requestAnimationFrame(frame);
  }

  // ---------------- boot ----------------
  if (!embedded) {
    // a shared look can arrive as ?look=XV1.… on the full app
    const look = new URLSearchParams(location.search).get('look');
    if (look) { try { S.studio = decodeLook(look); S.view = 'studio'; } catch { toast('That shared look link is broken.'); } }
  }
  saveStudio(true);
  if (S.view === 'studio') setVis(S.studio.vis, true); else setTheme(S.theme, true);
  setMode(S.mode); refreshSourceUI(); refreshNow();
  requestAnimationFrame(frame);

  // ---------------- updates ----------------
  // version.json is the single source of truth. When the copy on the server changes,
  // offer a one-click reload; the service worker always fetches fresh files first.
  let loadedVersion = null, updateDismissed = false;
  async function fetchVersion() {
    try { const r = await fetch('version.json', { cache: 'no-store' }); if (!r.ok) return null; return (await r.json()).version; } catch { return null; }
  }
  async function checkForUpdate(manual) {
    const v = await fetchVersion();
    if (!v) { if (manual) toast('Could not reach the update server. Check your connection.'); return; }
    if (!loadedVersion) { loadedVersion = v; $('versionLabel').textContent = v; return; }
    if (v !== loadedVersion) { $('updateHint').textContent = `Version ${v} is ready.`; if (!updateDismissed || manual) $('updateBar').hidden = false; }
    else if (manual) toast(`You have the latest version (${v}).`, 2500);
  }
  $('updateNow').addEventListener('click', async () => {
    try { const regs = await navigator.serviceWorker?.getRegistrations?.(); await Promise.all((regs || []).map(r => r.update())); } catch {}
    location.reload();
  });
  $('updateLater').addEventListener('click', () => { $('updateBar').hidden = true; updateDismissed = true; });
  $('checkUpdate').addEventListener('click', () => checkForUpdate(true));
  if (!embedded) {
    checkForUpdate();
    setInterval(checkForUpdate, 15 * 60 * 1000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkForUpdate(); });
    // installable app + offline support (needs https or 127.0.0.1)
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || /^(127\.0\.0\.1|localhost)$/.test(location.hostname))) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  } else { $('versionLabel').textContent = 'preview'; $('checkUpdate').hidden = true; }
  if (!embedded) {
    Spotify.handleRedirect().then(done => { if (done) { setProvider('spotify'); pollSpotify(); toast('Spotify connected. Turn on “Tab or system audio” so the visuals hear it.', 6500); } }).catch(fail);
  }
})();
