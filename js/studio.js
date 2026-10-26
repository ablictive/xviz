// Studio: gradient-driven visualizers with stackable post effects, in the spirit of
// layer-and-preset visualizers. Every visualizer draws with the user's gradient (G).
(function () {
  const TAU = Math.PI * 2;
  const rand = (a, b) => a + Math.random() * (b - a);
  const BUCKETS = 32;

  // ---------------- gradient ----------------
  const hexToRgb = h => { const n = parseInt(h.replace('#', ''), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const rgbToHex = c => '#' + c.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
  const G = {
    lut: [], css: [], colors: [], key: '', offset: 0,
    set(colors, offset) {
      const key = colors.join(',');
      if (key !== this.key) {
        this.key = key; this.colors = colors;
        const rgb = colors.map(hexToRgb), n = rgb.length;
        this.lut = [];
        for (let i = 0; i < 256; i++) {
          const x = i / 255 * (n - 1), k = Math.min(n - 2, Math.floor(x)), f = n === 1 ? 0 : x - k;
          const A = rgb[Math.max(0, k)], B = rgb[Math.min(n - 1, k + 1)];
          this.lut.push([A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f, A[2] + (B[2] - A[2]) * f]);
        }
      }
      this.offset = offset;
      for (let b = 0; b < BUCKETS; b++) { const c = this.rgb(b / (BUCKETS - 1)); this.css[b] = `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`; }
    },
    // x in 0..1; with an offset the gradient ping-pongs so cycling never jumps
    rgb(x) {
      let u = x + this.offset;
      if (this.offset) { u = u % 2; if (u < 0) u += 2; if (u > 1) u = 2 - u; }
      return this.lut[Math.max(0, Math.min(255, Math.round(u * 255)))];
    },
    idx: x => Math.max(0, Math.min(BUCKETS - 1, Math.round(x * (BUCKETS - 1)))),
    rgba(x, a) { const c = this.rgb(x); return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`; },
    dark(x, k) { const c = this.rgb(x); return `rgb(${c[0] * k | 0},${c[1] * k | 0},${c[2] * k | 0})`; },
  };

  const PALETTES = [
    { name: 'Vapor', colors: ['#ff71ce', '#b967ff', '#01cdfe', '#05ffa1'] },
    { name: 'Sunset', colors: ['#3a1c71', '#d76d77', '#ffaf7b'] },
    { name: 'Aurora', colors: ['#00ffa3', '#03e1ff', '#dc1fff'] },
    { name: 'Y2K', colors: ['#d8e3ff', '#ff9ff3', '#9fe8ff', '#c3ffa1'] },
    { name: 'Ocean', colors: ['#001f54', '#0072ff', '#00c6ff', '#00f5d4'] },
    { name: 'Toxic', colors: ['#00b3ff', '#00ff87', '#b6ff00'] },
    { name: 'Fire', colors: ['#5c0000', '#ff2a00', '#ff8a00', '#ffe066'] },
    { name: 'Candy', colors: ['#a18cd1', '#fbc2eb', '#ff9a9e', '#fad0c4'] },
    { name: 'Midnight', colors: ['#141e30', '#4b6cb7', '#b06ab3'] },
    { name: 'Lava', colors: ['#f12711', '#f5af19'] },
    { name: 'Ice', colors: ['#7f7fd5', '#86a8e7', '#e0eafc'] },
    { name: 'Mono', colors: ['#5a5a5a', '#ffffff'] },
  ];

  function randomPalette() {
    const h = rand(0, 360), schemes = [[0, 35, 70], [0, 120, 240], [0, 150, 30], [0, 60, 180, 240], [0, -40, 40]];
    const s = schemes[Math.floor(rand(0, schemes.length))];
    return s.map((d, i) => {
      const hue = ((h + d) % 360 + 360) % 360, sat = rand(75, 100), lig = 45 + i * (25 / s.length) + rand(-5, 10);
      // hsl -> hex
      const a = sat / 100 * Math.min(lig / 100, 1 - lig / 100), f = n => { const k = (n + hue / 30) % 12; return (lig / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255; };
      return rgbToHex([f(0), f(8), f(4)]);
    });
  }

  // Groove state shared by the visualizers: snares flip/kick rotation, drops add a burst.
  const groove = { spin: 0, vel: 0, dir: 1, phase: 0, color: 0 };
  function updateGroove(a, cycle) {
    if (a.snare) { groove.vel += 0.06 * groove.dir; groove.dir = -groove.dir; groove.phase += 1.1; if (cycle) groove.color += 0.12; }
    if (a.drop) { groove.vel += 0.15; groove.phase += 2.5; if (cycle) groove.color += 0.35; }
    groove.spin += groove.vel; groove.vel *= 0.9;
  }

  // band value for a 0..1 position (low → high)
  const band = (a, x) => a.bands[Math.max(0, Math.min(a.bands.length - 1, Math.floor(x * a.bands.length * 0.85)))];
  const centre = (w, h) => [w / 2, h * 0.47];

  // ---------------- visualizers ----------------
  const parts = [];
  const nebula = {
    name: 'Nebula', blurb: 'Particle galaxy that swells with the bass',
    draw(ctx, w, h, a, t) {
      const [cx, cy] = centre(w, h), R = Math.min(w, h) * 0.44;
      if (!parts.length) for (let i = 0; i < 1200; i++) { const r = Math.pow(Math.random(), 0.7); parts.push({ a: rand(0, TAU), r, s: rand(0.4, 1.2) * (1.2 - r), b: G.idx(r) }); }
      ctx.globalCompositeOperation = 'lighter';
      const size = 1.2 + a.energy * 2.6 + a.hatPulse * 1.2, spin = 0.004 + a.energy * 0.03 + groove.vel * 0.3;
      for (let b = 0; b < BUCKETS; b++) {
        ctx.fillStyle = G.css[b]; ctx.beginPath();
        for (const p of parts) {
          if (p.b !== b) continue;
          p.a += p.s * spin;
          const rr = p.r * R * (0.55 + band(a, p.r) * 0.75) * (1 + a.beatPulse * 0.12 + a.dropPulse * 0.25);
          const x = cx + Math.cos(p.a + p.r * 3) * rr, y = cy + Math.sin(p.a + p.r * 3) * rr * 0.92;
          ctx.moveTo(x + size, y); ctx.arc(x, y, size, 0, TAU);
        }
        ctx.fill();
      }
      const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * (0.25 + a.bass * 0.3));
      core.addColorStop(0, G.rgba(0, 0.6)); core.addColorStop(1, G.rgba(0, 0));
      ctx.fillStyle = core; ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
    },
  };

  const ridgeHist = []; let ridgeTick = 0;
  const ridges = {
    name: 'Ridges', blurb: 'Stacked pulsar lines, like the classic album cover',
    solid: true,
    draw(ctx, w, h, a, t, bg) {
      const cols = 72, rows = 34;
      if (ridgeTick++ % 2 === 0) {
        const row = new Float32Array(cols);
        for (let i = 0; i < cols; i++) {
          const d = Math.abs(i - (cols - 1) / 2) / (cols / 2), env = Math.pow(Math.cos(d * Math.PI / 2), 2.4);
          row[i] = band(a, d * 0.9) * env * (0.8 + Math.random() * 0.4) + env * 0.03;
        }
        ridgeHist.unshift(row); if (ridgeHist.length > rows) ridgeHist.pop();
      }
      const x0 = w * 0.2, x1 = w * 0.8, top = h * 0.16, gap = h * 0.6 / rows, amp = h * 0.2;
      ctx.lineJoin = 'round';
      for (let r = ridgeHist.length - 1; r >= 0; r--) {
        const row = ridgeHist[r], y0 = top + (rows - 1 - r) * gap;
        ctx.beginPath(); ctx.moveTo(x0, y0);
        for (let i = 0; i < cols; i++) ctx.lineTo(x0 + i / (cols - 1) * (x1 - x0), y0 - row[i] * amp);
        ctx.lineTo(x1, y0);
        ctx.fillStyle = bg; ctx.fill();
        ctx.strokeStyle = G.css[G.idx(1 - r / rows)]; ctx.lineWidth = r === 0 ? 2.4 : 1.6; ctx.stroke();
      }
    },
  };

  let tunnelZ = 0;
  const tunnel = {
    name: 'Tunnel', blurb: 'Rings rush toward you, warped by the spectrum',
    draw(ctx, w, h, a, t) {
      const [cx, cy] = centre(w, h), maxR = Math.hypot(w, h) * 0.6, N = 28;
      tunnelZ = (tunnelZ + 0.004 + a.energy * 0.03 + a.beatPulse * 0.012 + a.dropPulse * 0.03) % 1;
      ctx.lineJoin = 'round';
      for (let k = 0; k < N; k++) {
        const z = ((k + tunnelZ) / N) % 1, s = Math.pow(z, 2.6) * maxR;
        if (s < 2) continue;
        const rot = k * (0.18 + groove.spin * 0.05) + t * 0.0003 + groove.spin;
        ctx.beginPath();
        for (let i = 0; i <= 72; i++) {
          const ang = i / 72 * TAU + rot, m = Math.abs(((i % 72) / 72) * 2 - 1);
          const r = s * (1 + band(a, m * 0.8) * 0.35 * z);
          const x = cx + Math.cos(ang) * r, y = cy + Math.sin(ang) * r;
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.strokeStyle = G.css[G.idx(z)]; ctx.globalAlpha = Math.min(1, z * 1.4); ctx.lineWidth = 0.6 + z * 4; ctx.stroke();
      }
      ctx.globalAlpha = 1;
    },
  };

  let spiralRot = 0;
  const spiral = {
    name: 'Sunflower', blurb: 'Golden-angle seeds that bloom per frequency',
    draw(ctx, w, h, a) {
      const [cx, cy] = centre(w, h), R = Math.min(w, h) * 0.42, n = 720, golden = 2.39996323, per = Math.ceil(n / BUCKETS);
      spiralRot += 0.002 + a.energy * 0.01 + groove.vel * 0.5;
      // seeds are batched by colour, inner seeds first, so the gradient runs centre → edge
      for (let b = 0; b < BUCKETS; b++) {
        ctx.fillStyle = G.css[b]; ctx.beginPath();
        for (let i = b * per; i < Math.min(n, (b + 1) * per); i++) {
          const f = i / n, ang = i * golden + spiralRot, rad = Math.sqrt(f) * R * (1 + a.beatPulse * 0.06);
          const sz = 0.8 + band(a, f) * 7 * (0.6 + f);
          const x = cx + Math.cos(ang) * rad, y = cy + Math.sin(ang) * rad;
          ctx.moveTo(x + sz, y); ctx.arc(x, y, sz, 0, TAU);
        }
        ctx.fill();
      }
    },
  };

  const silk = {
    name: 'Silk', blurb: 'Translucent ribbons for bass, mids and highs',
    draw(ctx, w, h, a, t) {
      const cy = h * 0.47, lv = [a.bass, a.bass, a.mid, a.mid, a.high, a.high, a.mid];
      ctx.globalCompositeOperation = 'lighter';
      for (let j = 0; j < lv.length; j++) {
        const amp = (0.05 + lv[j] * 0.3 + a.dropPulse * 0.1) * h, fr = 1.2 + j * 0.35, ph = t * 0.0005 * (1 + j * 0.25) + j + groove.phase * (j % 2 ? 0.5 : -0.5), thick = 8 + lv[j] * 70 + a.kickPulse * 12;
        const top = [];
        for (let x = 0; x <= w + 20; x += 20) top.push([x, cy + Math.sin(x / w * TAU * fr + ph) * amp * Math.sin(x / w * Math.PI) + (j - 3) * h * 0.025]);
        ctx.beginPath(); top.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
        for (let i = top.length - 1; i >= 0; i--) ctx.lineTo(top[i][0], top[i][1] + thick * Math.sin(top[i][0] / w * Math.PI));
        ctx.closePath();
        ctx.fillStyle = G.rgba(j / (lv.length - 1), 0.28); ctx.fill();
        ctx.beginPath(); top.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
        ctx.strokeStyle = G.rgba(j / (lv.length - 1), 0.9); ctx.lineWidth = 1.5; ctx.stroke();
      }
    },
  };

  const blob = {
    name: 'Blob', blurb: 'Layered liquid shapes that wobble to the mix',
    draw(ctx, w, h, a, t) {
      const [cx, cy] = centre(w, h), R = Math.min(w, h) * 0.3 * (1 + a.beatPulse * 0.05);
      for (let k = 0; k < 5; k++) {
        const base = R * (1 - k * 0.17), P = [];
        for (let i = 0; i < 90; i++) {
          const ang = i / 90 * TAU, m = Math.abs(i / 90 * 2 - 1);
          const r = base * (1 + band(a, m * 0.7 + k * 0.05) * 0.3 * (1 + k * 0.25) + (0.05 + a.hatPulse * 0.04) * Math.sin(ang * (3 + k + (a.hatPulse > 0.5 ? 4 : 0)) + t * 0.0009 * (k + 1) + groove.phase));
          P.push([cx + Math.cos(ang) * r, cy + Math.sin(ang) * r]);
        }
        ctx.beginPath(); ctx.moveTo((P[0][0] + P[89][0]) / 2, (P[0][1] + P[89][1]) / 2);
        for (let i = 0; i < 90; i++) { const n = P[(i + 1) % 90]; ctx.quadraticCurveTo(P[i][0], P[i][1], (P[i][0] + n[0]) / 2, (P[i][1] + n[1]) / 2); }
        const g = ctx.createRadialGradient(cx - base * 0.3, cy - base * 0.35, base * 0.05, cx, cy, base * 1.2);
        g.addColorStop(0, G.rgba(Math.min(1, k / 4 + 0.15), 1)); g.addColorStop(1, G.rgba(k / 4, 0.85));
        ctx.fillStyle = g; ctx.fill();
      }
      ctx.beginPath(); ctx.ellipse(cx - R * 0.25, cy - R * 0.45, R * 0.28, R * 0.1, -0.4, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fill();
    },
  };

  const polys = {
    name: 'Polygons', blurb: 'Nested shapes counter-rotating on the beat',
    draw(ctx, w, h, a, t) {
      const [cx, cy] = centre(w, h), R = Math.min(w, h) * 0.46, L = 18;
      ctx.lineJoin = 'round';
      for (let i = 0; i < L; i++) {
        const f = i / (L - 1), sides = 3 + (i % 6), r = R * (0.08 + f * 0.92) * (1 + band(a, f) * 0.25);
        const rot = (t * 0.0003 * (1 + f) + a.beatPulse * 0.2 + groove.spin * (1 + f)) * (i % 2 ? 1 : -1);
        ctx.beginPath();
        for (let k = 0; k <= sides; k++) { const an = rot + k / sides * TAU; const x = cx + Math.cos(an) * r, y = cy + Math.sin(an) * r; k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
        ctx.strokeStyle = G.css[G.idx(f)]; ctx.lineWidth = 1.2 + band(a, f) * 5; ctx.stroke();
      }
    },
  };

  const flowParts = [];
  const flow = {
    name: 'Flow', blurb: 'Particles drifting through a moving current',
    fade: 0.07,
    draw(ctx, w, h, a, t) {
      if (flowParts.length === 0) for (let i = 0; i < 800; i++) flowParts.push({ x: rand(0, w), y: rand(0, h) });
      const sp = 0.8 + a.energy * 6 + a.beatPulse * 3, segs = Array.from({ length: BUCKETS }, () => []);
      for (const p of flowParts) {
        const ang = (Math.sin(p.x * 0.0035 + t * 0.0003 + groove.phase) + Math.cos(p.y * 0.004 - t * 0.00025 - groove.phase * 0.7)) * Math.PI + a.bass * 1.5;
        const nx = p.x + Math.cos(ang) * sp, ny = p.y + Math.sin(ang) * sp;
        segs[G.idx(Math.min(1, Math.hypot(p.x - w / 2, p.y - h * 0.47) / (Math.min(w, h) * 0.6)))].push(p.x, p.y, nx, ny);
        p.x = nx; p.y = ny;
        if (p.x < 0 || p.x > w || p.y < 0 || p.y > h || Math.random() < 0.004) { p.x = rand(0, w); p.y = rand(0, h); }
      }
      ctx.lineWidth = 1.4 + a.energy * 1.5; ctx.lineCap = 'round'; ctx.globalCompositeOperation = 'lighter';
      segs.forEach((s, b) => {
        if (!s.length) return;
        ctx.strokeStyle = G.css[b]; ctx.beginPath();
        for (let i = 0; i < s.length; i += 4) { ctx.moveTo(s[i], s[i + 1]); ctx.lineTo(s[i + 2], s[i + 3]); }
        ctx.stroke();
      });
    },
  };

  const orbitals = {
    name: 'Orbitals', blurb: 'XY scope loops in three rotated copies',
    draw(ctx, w, h, a, t) {
      const [cx, cy] = centre(w, h), n = a.wave.length, q = Math.floor(n / 4);
      // normalise to the loudest sample so quiet passages still draw full-size loops
      let peak = 0.2; for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(a.wave[i]));
      const R = Math.min(w, h) * 0.32 / peak;
      ctx.globalCompositeOperation = 'lighter'; ctx.lineJoin = 'round';
      for (let c = 0; c < 3; c++) {
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(c / 3 * TAU + t * 0.0002 + groove.spin);
        ctx.beginPath();
        for (let i = 0; i < n; i += 2) { const x = a.wave[i] * R * (0.85 + a.bass * 0.4), y = a.wave[(i + q) % n] * R * (0.85 + a.mid * 0.4); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
        ctx.strokeStyle = G.css[G.idx(c / 2)]; ctx.lineWidth = 2; ctx.stroke();
        ctx.restore();
      }
      ctx.beginPath(); ctx.arc(cx, cy, Math.min(w, h) * (0.02 + a.beatPulse * 0.02), 0, TAU); ctx.fillStyle = G.css[0]; ctx.fill();
    },
  };

  const VIS = { nebula, ridges, tunnel, spiral, silk, blob, polys, flow, orbitals };

  // ---------------- post effects ----------------
  // `scene` holds the visualizer and its trails; effects are applied only to the visible
  // canvas, so glow and mirroring never feed back into the next frame.
  let scene, scx, buf, bctx, small, sctx, tint, tctx;
  function ensureBuf(c) {
    if (!buf) {
      scene = document.createElement('canvas'); scx = scene.getContext('2d');
      buf = document.createElement('canvas'); bctx = buf.getContext('2d');
      small = document.createElement('canvas'); sctx = small.getContext('2d');
      tint = document.createElement('canvas'); tctx = tint.getContext('2d');
    }
    if (buf.width !== c.width || buf.height !== c.height) { buf.width = scene.width = c.width; buf.height = scene.height = c.height; }
  }
  function background(ctx, w, h, mode) {
    if (mode === 'black') return '#000';
    if (mode === 'wash') {
      const g = ctx.createLinearGradient(0, 0, w, h);
      G.colors.forEach((c, i) => g.addColorStop(i / Math.max(1, G.colors.length - 1), G.dark(i / Math.max(1, G.colors.length - 1), 0.28)));
      return g;
    }
    return G.dark(0, 0.1);
  }

  const DEFAULT = { vis: 'nebula', colors: PALETTES[0].colors.slice(), bg: 'deep', fx: { bloom: true, trails: false, mirror: false, kaleido: false, rgb: false, zoom: true, cycle: false } };

  const PRESETS = [
    { name: 'Neon Nebula', cfg: { vis: 'nebula', colors: PALETTES[0].colors, bg: 'deep', fx: { bloom: true, zoom: true } } },
    { name: 'Pulsar', cfg: { vis: 'ridges', colors: PALETTES[11].colors, bg: 'black', fx: {} } },
    { name: 'Hyperspace', cfg: { vis: 'tunnel', colors: PALETTES[2].colors, bg: 'black', fx: { bloom: true, trails: true, zoom: true } } },
    { name: 'Sunflower', cfg: { vis: 'spiral', colors: PALETTES[1].colors, bg: 'wash', fx: { bloom: true, cycle: true } } },
    { name: 'Silk Road', cfg: { vis: 'silk', colors: PALETTES[7].colors, bg: 'deep', fx: { bloom: true, mirror: true } } },
    { name: 'Acid Mandala', cfg: { vis: 'flow', colors: PALETTES[5].colors, bg: 'black', fx: { kaleido: true, bloom: true } } },
    { name: 'Lava Lamp', cfg: { vis: 'blob', colors: PALETTES[9].colors, bg: 'wash', fx: { zoom: true, rgb: true } } },
    { name: 'Sacred Geometry', cfg: { vis: 'polys', colors: PALETTES[3].colors, bg: 'deep', fx: { bloom: true, kaleido: true, cycle: true } } },
  ];

  window.VizStudio = {
    VIS, PALETTES, PRESETS, DEFAULT, randomPalette, G,
    ids: Object.keys(VIS),
    normalize(cfg) {
      const c = Object.assign({}, DEFAULT, cfg || {});
      // a fresh start gets the default effects; a saved or shared look keeps exactly what it set
      c.fx = Object.assign(Object.fromEntries(Object.keys(DEFAULT.fx).map(k => [k, false])), cfg ? cfg.fx || {} : DEFAULT.fx);
      if (!VIS[c.vis]) c.vis = DEFAULT.vis;
      if (!Array.isArray(c.colors) || c.colors.length < 2 || !c.colors.every(x => /^#[0-9a-f]{6}$/i.test(x))) c.colors = DEFAULT.colors.slice();
      c.colors = c.colors.slice(0, 6);
      if (!['deep', 'black', 'wash'].includes(c.bg)) c.bg = 'deep';
      return c;
    },
    render(ctx, canvas, dpr, w, h, a, t, cfg) {
      const fx = cfg.fx, vis = VIS[cfg.vis] || nebula;
      updateGroove(a, fx.cycle);
      G.set(cfg.colors, fx.cycle ? t * 0.00006 + groove.color : 0);
      ensureBuf(canvas);
      const cw = canvas.width, ch = canvas.height;
      const out = ctx;
      ctx = scx; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // background: full repaint, or a translucent wash that leaves trails
      const bg = background(ctx, w, h, cfg.bg);
      ctx.save();
      ctx.globalAlpha = fx.trails ? 0.14 : (vis.fade || 1);
      ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
      ctx.restore();

      ctx.save();
      if (fx.zoom) { const [cx, cy] = centre(w, h), z = 1 + a.beatPulse * 0.035 + a.dropPulse * 0.07; ctx.translate(cx, cy); ctx.scale(z, z); ctx.translate(-cx, -cy); }
      vis.draw(ctx, w, h, a, t, vis.solid ? (typeof bg === 'string' ? bg : G.dark(0, 0.12)) : null);
      ctx.restore();

      ctx = out;
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'copy'; ctx.drawImage(scene, 0, 0); ctx.globalCompositeOperation = 'source-over';
      if (fx.mirror) { ctx.save(); ctx.setTransform(-1, 0, 0, 1, cw, 0); ctx.drawImage(canvas, 0, 0, cw / 2, ch, 0, 0, cw / 2, ch); ctx.restore(); }
      if (fx.kaleido) {
        bctx.globalCompositeOperation = 'copy'; bctx.drawImage(canvas, 0, 0);
        const cx = cw / 2, cy = ch * 0.47, R = Math.hypot(cw, ch);
        ctx.fillStyle = typeof bg === 'string' ? bg : G.dark(0, 0.12); ctx.fillRect(0, 0, cw, ch);
        for (let k = 0; k < 6; k++) {
          ctx.save(); ctx.translate(cx, cy); ctx.rotate(k * TAU / 6 + t * 0.00008); if (k % 2) ctx.scale(1, -1);
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R, -TAU / 12 - 0.002, TAU / 12 + 0.002); ctx.closePath(); ctx.clip();
          ctx.drawImage(buf, -cx, -cy); ctx.restore();
        }
      }
      if (fx.bloom) {
        const sw = Math.max(1, cw >> 3), sh = Math.max(1, ch >> 3);
        if (small.width !== sw || small.height !== sh) { small.width = sw; small.height = sh; }
        sctx.globalCompositeOperation = 'copy'; sctx.drawImage(canvas, 0, 0, sw, sh);
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(1, 0.5 + a.energy * 0.3 + a.dropPulse * 0.4); ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(small, 0, 0, cw, ch);
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      }
      if (fx.rgb) {
        const d = (2 + a.beatPulse * 8 + a.snarePulse * 6) * dpr;
        if (tint.width !== cw || tint.height !== ch) { tint.width = cw; tint.height = ch; }
        [['#ff0000', d], ['#00ffff', -d]].forEach(([c, dx]) => {
          tctx.globalCompositeOperation = 'copy'; tctx.drawImage(canvas, 0, 0);
          tctx.globalCompositeOperation = 'multiply'; tctx.fillStyle = c; tctx.fillRect(0, 0, cw, ch);
          ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.55; ctx.drawImage(tint, dx, 0);
        });
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      }
      ctx.restore();
    },
  };
})();
