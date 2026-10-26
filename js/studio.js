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

  // Shape sliders, read by every visualizer: size, density, thickness, speed, complexity, reactivity.
  let P = { scale: 1, density: 1, thick: 1, speed: 1, detail: 1, react: 1 };
  const SPD = () => P.speed;

  // band value for a 0..1 position (low → high), scaled by the Reactivity slider
  const band = (a, x) => Math.min(1.6, a.bands[Math.max(0, Math.min(a.bands.length - 1, Math.floor(x * a.bands.length * 0.85)))] * P.react);
  const centre = (w, h) => [w / 2, h * 0.47];

  // ---------------- visualizers ----------------
  const parts = [];
  const nebula = {
    name: 'Nebula', blurb: 'Particle galaxy that swells with the bass',
    draw(ctx, w, h, a, t) {
      const [cx, cy] = centre(w, h), R = Math.min(w, h) * 0.44;
      const want = Math.round(1200 * P.density);
      while (parts.length < want) { const r = Math.pow(Math.random(), 0.7); parts.push({ a: rand(0, TAU), r, s: rand(0.4, 1.2) * (1.2 - r), b: G.idx(r) }); }
      if (parts.length > want) parts.length = want;
      ctx.globalCompositeOperation = 'lighter';
      const size = (1.2 + a.energy * 2.6 + a.hatPulse * 1.2) * P.thick, spin = (0.004 + a.energy * 0.03) * SPD() + groove.vel * 0.3;
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
      const cols = 72, rows = Math.round(34 * P.density);
      if (ridgeTick++ % 2 === 0) {
        const row = new Float32Array(cols);
        for (let i = 0; i < cols; i++) {
          const d = Math.abs(i - (cols - 1) / 2) / (cols / 2), env = Math.pow(Math.cos(d * Math.PI / 2), 2.4);
          row[i] = band(a, d * 0.9) * env * (0.8 + Math.random() * 0.4) + env * 0.03;
        }
        ridgeHist.unshift(row); while (ridgeHist.length > rows) ridgeHist.pop();
      }
      const x0 = w * 0.2, x1 = w * 0.8, top = h * 0.16, gap = h * 0.6 / rows, amp = h * 0.2;
      ctx.lineJoin = 'round';
      for (let r = ridgeHist.length - 1; r >= 0; r--) {
        const row = ridgeHist[r], y0 = top + (rows - 1 - r) * gap;
        ctx.beginPath(); ctx.moveTo(x0, y0);
        for (let i = 0; i < cols; i++) ctx.lineTo(x0 + i / (cols - 1) * (x1 - x0), y0 - row[i] * amp);
        ctx.lineTo(x1, y0);
        ctx.fillStyle = bg; ctx.fill();
        ctx.strokeStyle = G.css[G.idx(1 - r / rows)]; ctx.lineWidth = (r === 0 ? 2.4 : 1.6) * P.thick; ctx.stroke();
      }
    },
  };

  let tunnelZ = 0;
  const tunnel = {
    name: 'Tunnel', blurb: 'Rings rush toward you, warped by the spectrum',
    draw(ctx, w, h, a, t) {
      const [cx, cy] = centre(w, h), maxR = Math.hypot(w, h) * 0.6, N = Math.round(28 * P.density);
      tunnelZ = (tunnelZ + (0.004 + a.energy * 0.03 + a.beatPulse * 0.012 + a.dropPulse * 0.03) * SPD()) % 1;
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
        ctx.strokeStyle = G.css[G.idx(z)]; ctx.globalAlpha = Math.min(1, z * 1.4); ctx.lineWidth = (0.6 + z * 4) * P.thick; ctx.stroke();
      }
      ctx.globalAlpha = 1;
    },
  };

  let spiralRot = 0;
  const spiral = {
    name: 'Sunflower', blurb: 'Golden-angle seeds that bloom per frequency',
    draw(ctx, w, h, a) {
      const [cx, cy] = centre(w, h), R = Math.min(w, h) * 0.42, n = Math.round(720 * P.density), golden = 2.39996323, per = Math.ceil(n / BUCKETS);
      spiralRot += (0.002 + a.energy * 0.01) * SPD() + groove.vel * 0.5;
      // seeds are batched by colour, inner seeds first, so the gradient runs centre → edge
      for (let b = 0; b < BUCKETS; b++) {
        ctx.fillStyle = G.css[b]; ctx.beginPath();
        for (let i = b * per; i < Math.min(n, (b + 1) * per); i++) {
          const f = i / n, ang = i * golden + spiralRot, rad = Math.sqrt(f) * R * (1 + a.beatPulse * 0.06);
          const sz = (0.8 + band(a, f) * 7 * (0.6 + f)) * P.thick;
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
      const cy = h * 0.47, lv = [a.bass, a.bass, a.mid, a.mid, a.high, a.high, a.mid].slice(0, Math.max(2, Math.round(7 * Math.min(1, P.density)))).map(v => v * P.react);
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
        ctx.strokeStyle = G.rgba(j / (lv.length - 1), 0.9); ctx.lineWidth = 1.5 * P.thick; ctx.stroke();
      }
    },
  };

  const blob = {
    name: 'Blob', blurb: 'Layered liquid shapes that wobble to the mix',
    draw(ctx, w, h, a, t) {
      const [cx, cy] = centre(w, h), R = Math.min(w, h) * 0.3 * (1 + a.beatPulse * 0.05);
      const layers = Math.max(2, Math.round(5 * P.detail));
      for (let k = 0; k < layers; k++) {
        const base = R * (1 - k * 0.85 / layers), Q = [];
        for (let i = 0; i < 90; i++) {
          const ang = i / 90 * TAU, m = Math.abs(i / 90 * 2 - 1);
          const r = base * (1 + band(a, m * 0.7 + k * 0.05) * 0.3 * (1 + k * 0.25) + (0.05 + a.hatPulse * 0.04) * Math.sin(ang * (3 + k + (a.hatPulse > 0.5 ? 4 : 0)) + t * 0.0009 * (k + 1) + groove.phase));
          Q.push([cx + Math.cos(ang) * r, cy + Math.sin(ang) * r]);
        }
        ctx.beginPath(); ctx.moveTo((Q[0][0] + Q[89][0]) / 2, (Q[0][1] + Q[89][1]) / 2);
        for (let i = 0; i < 90; i++) { const n = Q[(i + 1) % 90]; ctx.quadraticCurveTo(Q[i][0], Q[i][1], (Q[i][0] + n[0]) / 2, (Q[i][1] + n[1]) / 2); }
        const g = ctx.createRadialGradient(cx - base * 0.3, cy - base * 0.35, base * 0.05, cx, cy, base * 1.2);
        g.addColorStop(0, G.rgba(Math.min(1, k / (layers - 1) + 0.15), 1)); g.addColorStop(1, G.rgba(k / (layers - 1), 0.85));
        ctx.fillStyle = g; ctx.fill();
      }
      ctx.beginPath(); ctx.ellipse(cx - R * 0.25, cy - R * 0.45, R * 0.28, R * 0.1, -0.4, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fill();
    },
  };

  const polys = {
    name: 'Polygons', blurb: 'Nested shapes counter-rotating on the beat',
    draw(ctx, w, h, a, t) {
      const [cx, cy] = centre(w, h), R = Math.min(w, h) * 0.46, L = Math.max(4, Math.round(18 * P.detail));
      ctx.lineJoin = 'round';
      for (let i = 0; i < L; i++) {
        const f = i / (L - 1), sides = 3 + (i % 6), r = R * (0.08 + f * 0.92) * (1 + band(a, f) * 0.25);
        const rot = (t * 0.0003 * (1 + f) + a.beatPulse * 0.2 + groove.spin * (1 + f)) * (i % 2 ? 1 : -1);
        ctx.beginPath();
        for (let k = 0; k <= sides; k++) { const an = rot + k / sides * TAU; const x = cx + Math.cos(an) * r, y = cy + Math.sin(an) * r; k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
        ctx.strokeStyle = G.css[G.idx(f)]; ctx.lineWidth = (1.2 + band(a, f) * 5) * P.thick; ctx.stroke();
      }
    },
  };

  const flowParts = [];
  const flow = {
    name: 'Flow', blurb: 'Particles drifting through a moving current',
    fade: 0.07,
    draw(ctx, w, h, a, t) {
      const fw = Math.round(800 * P.density);
      while (flowParts.length < fw) flowParts.push({ x: rand(0, w), y: rand(0, h) });
      if (flowParts.length > fw) flowParts.length = fw;
      const sp = (0.8 + a.energy * 6 + a.beatPulse * 3) * SPD(), segs = Array.from({ length: BUCKETS }, () => []);
      for (const p of flowParts) {
        const ang = (Math.sin(p.x * 0.0035 + t * 0.0003 + groove.phase) + Math.cos(p.y * 0.004 - t * 0.00025 - groove.phase * 0.7)) * Math.PI + a.bass * 1.5;
        const nx = p.x + Math.cos(ang) * sp, ny = p.y + Math.sin(ang) * sp;
        segs[G.idx(Math.min(1, Math.hypot(p.x - w / 2, p.y - h * 0.47) / (Math.min(w, h) * 0.6)))].push(p.x, p.y, nx, ny);
        p.x = nx; p.y = ny;
        if (p.x < 0 || p.x > w || p.y < 0 || p.y > h || Math.random() < 0.004) { p.x = rand(0, w); p.y = rand(0, h); }
      }
      ctx.lineWidth = (1.4 + a.energy * 1.5) * P.thick; ctx.lineCap = 'round'; ctx.globalCompositeOperation = 'lighter';
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
      const copies = Math.max(1, Math.round(3 * P.detail));
      for (let c = 0; c < copies; c++) {
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(c / copies * TAU + t * 0.0002 + groove.spin);
        ctx.beginPath();
        for (let i = 0; i < n; i += 2) { const x = a.wave[i] * R * (0.85 + a.bass * 0.4), y = a.wave[(i + q) % n] * R * (0.85 + a.mid * 0.4); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
        ctx.strokeStyle = G.css[G.idx(copies > 1 ? c / (copies - 1) : 0)]; ctx.lineWidth = 2 * P.thick; ctx.stroke();
        ctx.restore();
      }
      ctx.beginPath(); ctx.arc(cx, cy, Math.min(w, h) * (0.02 + a.beatPulse * 0.02), 0, TAU); ctx.fillStyle = G.css[0]; ctx.fill();
    },
  };

  // ---------------- particle dance ----------------
  // Dancers spring toward a formation that breathes with the spectrum. Kicks throw them
  // outward, snares twist the formation, hi-hats jitter the treble dancers, and drops
  // (or every 32 kicks) switch to a new formation.
  const FORMS = [
    (u) => [Math.cos(u * TAU), Math.sin(u * TAU)],                                                     // ring
    (u, i) => { const r = i % 2 ? 0.55 : 1; return [Math.cos(u * TAU) * r, Math.sin(u * TAU) * r]; },  // double ring
    (u) => { const a = u * TAU, r = 0.55 + 0.45 * Math.cos(5 * a); return [Math.cos(a) * r, Math.sin(a) * r]; }, // flower
    (u) => { const a = u * TAU; return [Math.sin(a) * 1.1, Math.sin(2 * a) * 0.6]; },                  // figure eight
    (u) => { const a = u * TAU * 3, r = u; return [Math.cos(a) * r, Math.sin(a) * r]; },                // spiral
    (u) => { const a = u * TAU, k = Math.floor(u * 5), f = u * 5 - k, p0 = k / 5 * TAU - Math.PI / 2, p1 = (k + 2) / 5 * TAU - Math.PI / 2; return [Math.cos(p0) + (Math.cos(p1) - Math.cos(p0)) * f, Math.sin(p0) + (Math.sin(p1) - Math.sin(p0)) * f]; }, // star
    (u, i, n) => { const c = Math.ceil(Math.sqrt(n)), x = i % c, y = Math.floor(i / c); return [(x / (c - 1)) * 2 - 1, (y / (c - 1)) * 2 - 1]; }, // grid
    (u) => [u * 2.2 - 1.1, Math.sin(u * TAU * 2) * 0.35],                                              // wave line
  ];
  const dancers = []; let form = 0, kicksSinceForm = 0, danceSpin = 0;
  const dance = {
    name: 'Particle Dance', blurb: 'Dancers spring between formations on the beat',
    fade: 0.32,
    draw(ctx, w, h, a, t) {
      const [cx, cy] = centre(w, h), R = Math.min(w, h) * 0.25, n = Math.round(280 * P.density);
      while (dancers.length < n) dancers.push({ x: cx + rand(-50, 50), y: cy + rand(-50, 50), vx: 0, vy: 0 });
      if (dancers.length > n) dancers.length = n;
      if (a.kick) kicksSinceForm++;
      if (a.drop || kicksSinceForm >= 32) { form = (form + 1 + Math.floor(Math.random() * (FORMS.length - 1))) % FORMS.length; kicksSinceForm = 0; }
      danceSpin += (0.002 + a.energy * 0.01) * SPD() + groove.vel * 0.4;
      const pull = 0.03 + a.energy * 0.05, damp = 0.84, breathe = 1 + Math.min(0.2, a.bass * 0.18 * P.react);
      ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
      const segs = Array.from({ length: BUCKETS }, () => []), dots = Array.from({ length: BUCKETS }, () => []);
      for (let i = 0; i < n; i++) {
        const d = dancers[i], u = i / n, [fx, fy] = FORMS[form](u, i, n);
        const lvl = band(a, u), rr = R * breathe * (1 + Math.min(0.3, lvl * 0.25));
        const cs = Math.cos(danceSpin), sn = Math.sin(danceSpin);
        const hx = cx + (fx * cs - fy * sn) * rr, hy = cy + (fx * sn + fy * cs) * rr;
        d.vx += (hx - d.x) * pull; d.vy += (hy - d.y) * pull;
        if (a.kick) { const dx = d.x - cx, dy = d.y - cy, m = Math.hypot(dx, dy) + 1; d.vx += dx / m * 9 * a.beatPulse * P.react; d.vy += dy / m * 9 * a.beatPulse * P.react; }
        if (a.hat && u > 0.6) { d.vx += rand(-4, 4); d.vy += rand(-4, 4); }
        if (a.snare) { const dx = d.x - cx, dy = d.y - cy; d.vx += -dy * 0.04 * groove.dir; d.vy += dx * 0.04 * groove.dir; }
        const ox = d.x, oy = d.y;
        d.vx *= damp; d.vy *= damp; d.x += d.vx * SPD(); d.y += d.vy * SPD();
        const b = G.idx(u);
        segs[b].push(ox, oy, d.x, d.y); dots[b].push(d.x, d.y, (1.4 + lvl * 3.2) * P.thick);
      }
      for (let b = 0; b < BUCKETS; b++) {
        const s = segs[b], q = dots[b]; if (!q.length) continue;
        ctx.strokeStyle = G.css[b]; ctx.fillStyle = G.css[b];
        ctx.lineWidth = 1.6 * P.thick; ctx.globalAlpha = 0.55; ctx.beginPath();
        for (let i = 0; i < s.length; i += 4) { ctx.moveTo(s[i], s[i + 1]); ctx.lineTo(s[i + 2], s[i + 3]); }
        ctx.stroke(); ctx.globalAlpha = 1; ctx.beginPath();
        for (let i = 0; i < q.length; i += 3) { ctx.moveTo(q[i] + q[i + 2], q[i + 1]); ctx.arc(q[i], q[i + 1], q[i + 2], 0, TAU); }
        ctx.fill();
      }
      // faint thread joining neighbours so the formation reads as a shape
      ctx.globalAlpha = 0.18; ctx.strokeStyle = G.css[16]; ctx.lineWidth = 1 * P.thick; ctx.beginPath();
      for (let i = 0; i < n; i++) { const d = dancers[i]; i ? ctx.lineTo(d.x, d.y) : ctx.moveTo(d.x, d.y); }
      ctx.stroke(); ctx.globalAlpha = 1;
    },
  };

  // ---------------- polar curves ----------------
  // Layered rose and spirograph curves. Snares morph the petal count, each layer's radius
  // follows its own band, and the curve is coloured along its length.
  const ROSE_K = [2, 3, 5 / 2, 7 / 3, 4, 5, 7 / 4, 6, 3 / 2, 8 / 3];
  const polarState = { k: 3, target: 3, step: 0 };
  const polar = {
    name: 'Polar Curves', blurb: 'Rose and spirograph curves that morph on snares',
    draw(ctx, w, h, a, t) {
      const [cx, cy] = centre(w, h), R = Math.min(w, h) * 0.4;
      if (a.snare || a.drop) { polarState.step = (polarState.step + 1 + (a.drop ? 3 : 0)) % ROSE_K.length; polarState.target = ROSE_K[polarState.step]; }
      polarState.k += (polarState.target - polarState.k) * 0.06;
      const layers = Math.max(1, Math.round(3 * P.detail)), pts = Math.round(700 * Math.min(1.5, P.density));
      ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.globalCompositeOperation = 'lighter';
      for (let L = 0; L < layers; L++) {
        const f = layers > 1 ? L / (layers - 1) : 0, lvl = band(a, 0.1 + f * 0.7);
        const rot = t * 0.0002 * SPD() * (L % 2 ? -1 : 1) + groove.spin * (1 + L * 0.3);
        const scale = R * (0.45 + f * 0.55) * (0.85 + lvl * 0.4 + a.beatPulse * 0.05);
        const k = polarState.k + L * 0.5, spiro = L % 2 === 1;
        const turns = spiro ? 7 : 4, wob = 0.12 * P.react * a.mid;
        for (let i = 0; i <= pts; i++) {
          const th = i / pts * TAU * turns;
          let r;
          if (spiro) r = 0.55 + 0.45 * Math.cos(k * 1.5 * th / turns * 2) * Math.cos(th * 0.5);
          else r = Math.cos(k * th);
          r += wob * Math.sin(th * 9 + t * 0.003);
          const x = cx + Math.cos(th + rot) * r * scale, y = cy + Math.sin(th + rot) * r * scale;
          if (i % Math.ceil(pts / BUCKETS) === 0) {
            if (i) { ctx.lineTo(x, y); ctx.stroke(); }
            ctx.beginPath(); ctx.moveTo(x, y);
            ctx.strokeStyle = G.css[G.idx((i / pts + f * 0.3) % 1)]; ctx.lineWidth = (1.3 + lvl * 2.2) * P.thick;
          } else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(cx, cy, (3 + a.beatPulse * 8) * P.thick, 0, TAU); ctx.fillStyle = G.css[BUCKETS - 1]; ctx.fill();
    },
  };

  // ---------------- wavy form ----------------
  // A 3-D sea of wave lines in perspective. Each row carries the spectrum from a moment
  // ago, so sound rolls toward you as swells; kicks lift the front rows.
  const waveRows = []; let waveTick = 0;
  const wavy = {
    name: 'Wavy Form', blurb: 'A rolling 3-D sea of lines shaped by the music',
    solid: true,
    draw(ctx, w, h, a, t, bg) {
      const rows = Math.max(10, Math.round(30 * P.density)), cols = 90;
      if ((waveTick++ % Math.max(1, Math.round(3 / SPD()))) === 0) {
        const row = new Float32Array(cols);
        for (let i = 0; i < cols; i++) { const d = Math.abs(i - (cols - 1) / 2) / (cols / 2); row[i] = band(a, d * 0.85) * (0.35 + 0.65 * Math.cos(d * Math.PI / 2)); }
        // two smoothing passes so each row reads as a rolling swell, not a jagged spectrum
        for (let pass = 0; pass < 3; pass++) for (let i = 1; i < cols - 1; i++) row[i] = (row[i - 1] + row[i] * 2 + row[i + 1]) / 4;
        waveRows.unshift(row); while (waveRows.length > rows) waveRows.pop();
      }
      const horizon = h * 0.2, base = h * 0.86;
      ctx.lineJoin = 'round';
      for (let r = waveRows.length - 1; r >= 0; r--) {
        const z = 1 - r / rows, persp = 0.25 + z * 0.75;                     // 0 far … 1 near
        const y0 = horizon + (base - horizon) * Math.pow(z, 1.6);
        const span = w * (0.35 + 0.75 * persp), x0 = w / 2 - span / 2, row = waveRows[r];
        const amp = h * 0.16 * persp * (1 + (r < 4 ? a.kickPulse * 0.4 : 0));
        ctx.beginPath(); ctx.moveTo(x0, y0 + 40);
        for (let i = 0; i < cols; i++) {
          const u = i / (cols - 1), swell = Math.sin(u * TAU * (1.5 + P.detail) + t * 0.0012 * SPD() + r * 0.35 + groove.phase) * 0.4;
          ctx.lineTo(x0 + u * span, y0 - (row[i] + swell * (0.4 + a.mid)) * amp);
        }
        ctx.lineTo(x0 + span, y0 + 40); ctx.closePath();
        ctx.fillStyle = bg; ctx.fill();
        ctx.beginPath();
        for (let i = 0; i < cols; i++) {
          const u = i / (cols - 1), swell = Math.sin(u * TAU * (1.5 + P.detail) + t * 0.0012 * SPD() + r * 0.35 + groove.phase) * 0.4;
          const x = x0 + u * span, y = y0 - (row[i] + swell * (0.4 + a.mid)) * amp;
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.strokeStyle = G.css[G.idx(z)]; ctx.globalAlpha = 0.35 + z * 0.65; ctx.lineWidth = (0.8 + z * 2.2) * P.thick; ctx.stroke();
      }
      ctx.globalAlpha = 1;
    },
  };

  // ---------------- starfield ----------------
  const stars = [];
  const starfield = {
    name: 'Starfield', blurb: 'Hyperspace streaks that surge with every kick',
    fade: 0.5,
    draw(ctx, w, h, a) {
      const [cx, cy] = centre(w, h), n = Math.round(700 * P.density), F = Math.min(w, h) * 0.6;
      while (stars.length < n) stars.push({ x: rand(-1, 1), y: rand(-1, 1), z: rand(0.05, 1), b: Math.floor(rand(0, BUCKETS)) });
      if (stars.length > n) stars.length = n;
      const sp = (0.002 + a.energy * 0.018 + a.beatPulse * 0.02 + a.dropPulse * 0.05) * SPD();
      const segs = Array.from({ length: BUCKETS }, () => []);
      const tw = Math.sin(groove.spin) * 0.3;
      for (const s of stars) {
        const z0 = s.z; s.z -= sp;
        if (s.z <= 0.02) { s.x = rand(-1, 1); s.y = rand(-1, 1); s.z = 1; s.b = Math.floor(rand(0, BUCKETS)); continue; }
        const rx = s.x * Math.cos(tw) - s.y * Math.sin(tw), ry = s.x * Math.sin(tw) + s.y * Math.cos(tw);
        segs[s.b].push(cx + rx / z0 * F * 0.5, cy + ry / z0 * F * 0.5, cx + rx / s.z * F * 0.5, cy + ry / s.z * F * 0.5, s.z);
      }
      ctx.lineCap = 'round'; ctx.globalCompositeOperation = 'lighter';
      segs.forEach((q, b) => {
        if (!q.length) return;
        ctx.strokeStyle = G.css[b]; ctx.lineWidth = (1.2 + a.high * 2) * P.thick; ctx.beginPath();
        for (let i = 0; i < q.length; i += 5) { ctx.moveTo(q[i], q[i + 1]); ctx.lineTo(q[i + 2], q[i + 3]); }
        ctx.stroke();
      });
    },
  };

  // ---------------- ripples ----------------
  const rings = [];
  const ripples = {
    name: 'Ripples', blurb: 'Every kick, snare and hi-hat drops a ripple',
    draw(ctx, w, h, a) {
      const [cx, cy] = centre(w, h), m = Math.min(w, h);
      if (a.kick) rings.push({ x: cx, y: cy, r: 10, v: 6 + a.beatPulse * 6, c: 0.05, life: 1, wid: 5 });
      if (a.snare) rings.push({ x: cx + rand(-0.3, 0.3) * w, y: cy + rand(-0.25, 0.25) * h, r: 6, v: 5, c: 0.55, life: 1, wid: 3.5 });
      if (a.hat && Math.random() < 0.6) rings.push({ x: rand(0, w), y: rand(0, h), r: 2, v: 3, c: 0.95, life: 0.7, wid: 1.6 });
      if (a.drop) for (let k = 0; k < 5; k++) rings.push({ x: cx, y: cy, r: 10 + k * 30, v: 9, c: k / 4, life: 1, wid: 7 });
      while (rings.length > 140) rings.shift();
      ctx.globalCompositeOperation = 'lighter'; ctx.lineJoin = 'round';
      for (let i = rings.length - 1; i >= 0; i--) {
        const g = rings[i]; g.r += g.v * SPD(); g.v *= 0.985; g.life -= 0.008 * SPD() * (g.wid < 2 ? 3 : 1);
        if (g.life <= 0 || g.r > m * 1.2) { rings.splice(i, 1); continue; }
        ctx.beginPath();
        for (let k = 0; k <= 64; k++) {
          const ang = k / 64 * TAU, wob = 1 + band(a, Math.abs(k / 32 - 1)) * 0.08;
          const x = g.x + Math.cos(ang) * g.r * wob, y = g.y + Math.sin(ang) * g.r * wob;
          k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.strokeStyle = G.css[G.idx(g.c)]; ctx.globalAlpha = Math.max(0, g.life); ctx.lineWidth = g.wid * P.thick * (0.4 + g.life * 0.6); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, m * (0.06 + a.bass * 0.12));
      core.addColorStop(0, G.rgba(0.05, 0.9)); core.addColorStop(1, G.rgba(0.05, 0));
      ctx.fillStyle = core; ctx.fillRect(cx - m * 0.3, cy - m * 0.3, m * 0.6, m * 0.6);
    },
  };

  // ---------------- fractal tree ----------------
  const tree = {
    name: 'Fractal Tree', blurb: 'Six branching arms that open with the mids',
    draw(ctx, w, h, a, t) {
      const [cx, cy] = centre(w, h), arms = 6, depth = Math.max(5, Math.min(9, Math.round(7 + (P.detail - 1) * 3)));
      const len0 = Math.min(w, h) * 0.13 * (1 + a.bass * 0.3 * P.react + a.beatPulse * 0.05);
      const spread = 0.32 + band(a, 0.35) * 0.5 + Math.sin(t * 0.0008 * SPD()) * 0.08;
      const ratio = 0.7 + band(a, 0.1) * 0.07;
      const layers = Array.from({ length: depth }, () => []);
      function grow(x, y, ang, len, d) {
        const x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
        layers[d].push(x, y, x2, y2);
        if (d + 1 >= depth) return;
        const sway = Math.sin(t * 0.001 * SPD() + d) * 0.05 + groove.vel * 0.5;
        grow(x2, y2, ang - spread + sway, len * ratio, d + 1);
        grow(x2, y2, ang + spread + sway, len * ratio, d + 1);
      }
      for (let k = 0; k < arms; k++) grow(cx, cy, k / arms * TAU + groove.spin * 0.5 + t * 0.00005 * SPD(), len0, 0);
      ctx.lineCap = 'round'; ctx.globalCompositeOperation = 'lighter';
      layers.forEach((q, d) => {
        ctx.strokeStyle = G.css[G.idx(d / (depth - 1))]; ctx.lineWidth = Math.max(0.6, (depth - d) * 0.55) * P.thick;
        ctx.globalAlpha = 0.5 + band(a, d / depth) * 0.5; ctx.beginPath();
        for (let i = 0; i < q.length; i += 4) { ctx.moveTo(q[i], q[i + 1]); ctx.lineTo(q[i + 2], q[i + 3]); }
        ctx.stroke();
      });
      ctx.globalAlpha = 1;
    },
  };

  // ---------------- plasma ----------------
  let plasmaC, plasmaX, plasmaImg;
  const plasma = {
    name: 'Plasma', blurb: 'Classic demoscene plasma, mapped onto your gradient',
    draw(ctx, w, h, a, t) {
      const pw = Math.max(40, Math.round(w / (7 / Math.min(1.6, P.detail)))), ph = Math.max(24, Math.round(pw * h / w));
      if (!plasmaC) { plasmaC = document.createElement('canvas'); plasmaX = plasmaC.getContext('2d'); }
      if (plasmaC.width !== pw || plasmaC.height !== ph) { plasmaC.width = pw; plasmaC.height = ph; plasmaImg = plasmaX.createImageData(pw, ph); }
      const d = plasmaImg.data, T = t * 0.001 * SPD(), sc = 0.06 / P.scale, ccx = pw / 2, ccy = ph * 0.47;
      const kb = a.bass * 2 * P.react, km = a.mid * 1.5 * P.react, shift = groove.phase * 0.2 + a.beatPulse * 0.15;
      let o = 0;
      for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) {
        const dx = x - ccx, dy = y - ccy, dist = Math.sqrt(dx * dx + dy * dy);
        let v = Math.sin(x * sc + T) + Math.sin(y * sc * 1.3 - T * 1.2) + Math.sin((x + y) * sc * 0.7 + T * 0.7 + km)
          + Math.sin(dist * sc * 1.8 - T * 2 - kb);
        v = (v / 8 + 0.5 + shift) % 1; if (v < 0) v += 1;
        const c = G.rgb(v < 0.5 ? v * 2 : 2 - v * 2);
        d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255; o += 4;
      }
      plasmaX.putImageData(plasmaImg, 0, 0);
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.globalAlpha = 0.6 + a.energy * 0.4; ctx.drawImage(plasmaC, 0, 0, w, h); ctx.globalAlpha = 1;
    },
  };

  const VIS = { nebula, dance, polar, wavy, ridges, tunnel, starfield, ripples, spiral, silk, blob, polys, tree, flow, plasma, orbitals };

  // ---------------- post effects ----------------
  // `scene` holds the visualizer and its trails; effects are applied only to the visible
  // canvas, so glow and mirroring never feed back into the next frame.
  let scene, scx, buf, bctx, small, sctx, pix, pctx, tint, tctx, lines, noise;
  function ensureBuf(c) {
    if (!buf) {
      scene = document.createElement('canvas'); scx = scene.getContext('2d');
      buf = document.createElement('canvas'); bctx = buf.getContext('2d');
      small = document.createElement('canvas'); sctx = small.getContext('2d');
      pix = document.createElement('canvas'); pctx = pix.getContext('2d');
      tint = document.createElement('canvas'); tctx = tint.getContext('2d');
      lines = document.createElement('canvas'); lines.width = 4; lines.height = 4;
      const lx = lines.getContext('2d'); lx.fillStyle = 'rgba(0,0,0,.85)'; lx.fillRect(0, 0, 4, 1); lx.fillRect(0, 2, 4, 1);
      noise = document.createElement('canvas'); noise.width = noise.height = 256;
      const nx = noise.getContext('2d'), img = nx.createImageData(256, 256);
      for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
      nx.putImageData(img, 0, 0);
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

  // effect switches; each has a strength in `amt` (0..1, kaleido = segment count)
  const FX_KEYS = ['bloom', 'trails', 'zoom', 'warp', 'shake', 'mirror', 'quad', 'kaleido', 'rgb', 'glitch', 'pixel', 'scan', 'grain', 'vignette', 'huepop', 'strobe', 'cycle'];
  const AMT_DEFAULT = { bloom: 0.55, trails: 0.5, zoom: 0.5, warp: 0.5, shake: 0.4, kaleido: 0.33, rgb: 0.5, glitch: 0.5, pixel: 0.3, scan: 0.45, grain: 0.35, vignette: 0.6, huepop: 0.5, strobe: 0.4, cycle: 0.4 };
  const P_DEFAULT = { scale: 1, density: 1, thick: 1, speed: 1, detail: 1, react: 1, bright: 1, sat: 1, hue: 0 };
  const DEFAULT = { vis: 'nebula', colors: PALETTES[0].colors.slice(), bg: 'deep', fx: { bloom: true, zoom: true }, amt: AMT_DEFAULT, p: P_DEFAULT };

  const PRESETS = [
    { name: 'Neon Nebula', cfg: { vis: 'nebula', colors: PALETTES[0].colors, bg: 'deep', fx: { bloom: true, zoom: true } } },
    { name: 'Dance Floor', cfg: { vis: 'dance', colors: PALETTES[0].colors, bg: 'black', fx: { bloom: true, zoom: true, vignette: true } } },
    { name: 'Rose Window', cfg: { vis: 'polar', colors: PALETTES[7].colors, bg: 'deep', fx: { bloom: true, cycle: true, huepop: true }, p: { detail: 1.3 } } },
    { name: 'Night Sea', cfg: { vis: 'wavy', colors: PALETTES[4].colors, bg: 'black', fx: { bloom: true, vignette: true, grain: true } } },
    { name: 'Warp Speed', cfg: { vis: 'starfield', colors: PALETTES[10].colors, bg: 'black', fx: { bloom: true, warp: true, shake: true } } },
    { name: 'Bass Pond', cfg: { vis: 'ripples', colors: PALETTES[2].colors, bg: 'deep', fx: { bloom: true, zoom: true, vignette: true } } },
    { name: 'Neon Grove', cfg: { vis: 'tree', colors: PALETTES[5].colors, bg: 'black', fx: { bloom: true, glitch: true } } },
    { name: 'Acid Plasma', cfg: { vis: 'plasma', colors: PALETTES[0].colors, bg: 'black', fx: { scan: true, vignette: true, huepop: true } } },
    { name: 'VHS Dreams', cfg: { vis: 'silk', colors: PALETTES[1].colors, bg: 'deep', fx: { bloom: true, scan: true, grain: true, rgb: true, vignette: true } } },
    { name: 'Pulsar', cfg: { vis: 'ridges', colors: PALETTES[11].colors, bg: 'black', fx: { grain: true, vignette: true } } },
    { name: 'Hyperspace', cfg: { vis: 'tunnel', colors: PALETTES[2].colors, bg: 'black', fx: { bloom: true, trails: true, zoom: true } } },
    { name: 'Acid Mandala', cfg: { vis: 'flow', colors: PALETTES[5].colors, bg: 'black', fx: { kaleido: true, bloom: true } } },
    { name: 'Lava Lamp', cfg: { vis: 'blob', colors: PALETTES[9].colors, bg: 'wash', fx: { zoom: true, rgb: true } } },
    { name: 'Sacred Geometry', cfg: { vis: 'polys', colors: PALETTES[3].colors, bg: 'deep', fx: { bloom: true, kaleido: true, cycle: true } } },
    { name: '8-Bit Rave', cfg: { vis: 'spiral', colors: PALETTES[5].colors, bg: 'black', fx: { pixel: true, strobe: true, scan: true, zoom: true } } },
  ];

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  let hue = 0, lastStrobe = 0, strobeV = 0, glitchT = 0;

  window.VizStudio = {
    VIS, PALETTES, PRESETS, DEFAULT, FX_KEYS, AMT_DEFAULT, P_DEFAULT, randomPalette, G,
    ids: Object.keys(VIS),
    normalize(cfg) {
      const c = Object.assign({}, DEFAULT, cfg || {});
      // a fresh start gets the default effects; a saved or shared look keeps exactly what it set
      c.fx = Object.assign(Object.fromEntries(FX_KEYS.map(k => [k, false])), cfg ? cfg.fx || {} : DEFAULT.fx);
      Object.keys(c.fx).forEach(k => { if (!FX_KEYS.includes(k)) delete c.fx[k]; else c.fx[k] = !!c.fx[k]; });
      c.amt = Object.assign({}, AMT_DEFAULT, (cfg && cfg.amt) || {});
      Object.keys(c.amt).forEach(k => { c.amt[k] = clamp(Number(c.amt[k]) || 0, 0, 1); });
      c.p = Object.assign({}, P_DEFAULT, (cfg && cfg.p) || {});
      Object.keys(c.p).forEach(k => { c.p[k] = Number(c.p[k]); if (!isFinite(c.p[k])) c.p[k] = P_DEFAULT[k] ?? 1; });
      if (!VIS[c.vis]) c.vis = DEFAULT.vis;
      if (!Array.isArray(c.colors) || c.colors.length < 2 || !c.colors.every(x => /^#[0-9a-f]{6}$/i.test(x))) c.colors = DEFAULT.colors.slice();
      c.colors = c.colors.slice(0, 6);
      if (!['deep', 'black', 'wash'].includes(c.bg)) c.bg = 'deep';
      return c;
    },
    surprise() {
      const ids = Object.keys(VIS), pick = arr => arr[Math.floor(Math.random() * arr.length)];
      const fx = { bloom: Math.random() < 0.8 };
      const extras = ['zoom', 'trails', 'warp', 'shake', 'mirror', 'kaleido', 'rgb', 'glitch', 'scan', 'grain', 'vignette', 'huepop', 'cycle'];
      for (let i = 0; i < 3; i++) fx[pick(extras)] = true;
      if (fx.mirror && fx.kaleido) fx.mirror = false;
      return this.normalize({ vis: pick(ids), colors: Math.random() < 0.5 ? pick(PALETTES).colors.slice() : randomPalette(), bg: pick(['deep', 'black', 'black', 'wash']), fx });
    },
    render(ctx, canvas, dpr, w, h, a, t, cfg, opts = {}) {
      const fx = cfg.fx, amt = cfg.amt, vis = VIS[cfg.vis] || nebula;
      P = cfg.p;
      updateGroove(a, fx.cycle);
      G.set(cfg.colors, fx.cycle ? t * 0.00012 * amt.cycle + groove.color : 0);
      ensureBuf(canvas);
      const cw = canvas.width, ch = canvas.height;
      const out = ctx;
      ctx = scx; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // background: full repaint, a translucent wash that leaves trails, or a warped copy of the last frame
      const bg = background(ctx, w, h, cfg.bg), solidBg = typeof bg === 'string' ? bg : G.dark(0, 0.12);
      if (fx.warp) {
        bctx.globalCompositeOperation = 'copy'; bctx.drawImage(scene, 0, 0);
        ctx.save(); ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
        const [cx, cy] = centre(w, h), z = 1.01 + amt.warp * 0.04 + a.bass * 0.02 * amt.warp;
        ctx.translate(cx, cy); ctx.rotate((0.004 + a.mid * 0.01) * amt.warp * (groove.dir) + groove.vel * 0.2); ctx.scale(z, z); ctx.translate(-cx, -cy);
        ctx.globalAlpha = 0.72 + amt.warp * 0.22; ctx.drawImage(buf, 0, 0, w, h);
        ctx.restore();
      } else {
        ctx.save();
        ctx.globalAlpha = fx.trails ? 0.32 - amt.trails * 0.28 : (vis.fade || 1);
        ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
        ctx.restore();
      }

      ctx.save();
      const [cx, cy] = centre(w, h);
      let z = P.scale;
      if (fx.zoom) z *= 1 + (a.beatPulse * 0.035 + a.dropPulse * 0.07) * amt.zoom * 2;
      if (fx.shake) { const k = (Math.pow(a.bass, 2) * 18 + a.beatPulse * 6) * amt.shake; ctx.translate(rand(-k, k), rand(-k, k)); }
      if (z !== 1) { ctx.translate(cx, cy); ctx.scale(z, z); ctx.translate(-cx, -cy); }
      vis.draw(ctx, w, h, a, t, vis.solid ? solidBg : null);
      ctx.restore();

      ctx = out;
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      // colour grade + hue pops on snares, applied while copying the scene in
      if (fx.huepop && a.snare) hue += 40 + amt.huepop * 100;
      hue *= 0.92;
      const hueDeg = (P.hue || 0) + (fx.huepop ? hue : 0);
      const graded = P.bright !== 1 || P.sat !== 1 || Math.abs(hueDeg) > 0.5;
      if (graded) ctx.filter = `brightness(${P.bright}) saturate(${P.sat}) hue-rotate(${hueDeg.toFixed(1)}deg)`;
      ctx.globalCompositeOperation = 'copy'; ctx.drawImage(scene, 0, 0); ctx.globalCompositeOperation = 'source-over';
      ctx.filter = 'none';

      if (fx.mirror || fx.quad) { ctx.save(); ctx.setTransform(-1, 0, 0, 1, cw, 0); ctx.drawImage(canvas, 0, 0, cw / 2, ch, 0, 0, cw / 2, ch); ctx.restore(); }
      if (fx.quad) { ctx.save(); ctx.setTransform(1, 0, 0, -1, 0, ch); ctx.drawImage(canvas, 0, 0, cw, ch / 2, 0, 0, cw, ch / 2); ctx.restore(); }
      if (fx.kaleido) {
        const segs = 2 * Math.round(2 + amt.kaleido * 4); // 4–12, always even so neighbours mirror cleanly
        bctx.globalCompositeOperation = 'copy'; bctx.drawImage(canvas, 0, 0);
        const kx = cw / 2, ky = ch * 0.47, R = Math.hypot(cw, ch);
        ctx.fillStyle = solidBg; ctx.fillRect(0, 0, cw, ch);
        for (let k = 0; k < segs; k++) {
          ctx.save(); ctx.translate(kx, ky); ctx.rotate(k * TAU / segs + t * 0.00008); if (k % 2) ctx.scale(1, -1);
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R, -TAU / segs / 2 - 0.002, TAU / segs / 2 + 0.002); ctx.closePath(); ctx.clip();
          ctx.drawImage(buf, -kx, -ky); ctx.restore();
        }
      }
      if (fx.glitch) {
        if (a.snare || a.drop || Math.random() < 0.004 * amt.glitch) glitchT = 6 + amt.glitch * 10;
        if (glitchT > 0) {
          glitchT--;
          for (let i = 0; i < 3 + amt.glitch * 8; i++) {
            const sy = rand(0, ch), sh = rand(2, 40) * dpr, dx = rand(-60, 60) * dpr * amt.glitch;
            ctx.drawImage(canvas, 0, sy, cw, sh, dx, sy, cw, sh);
          }
        }
      }
      if (fx.pixel) {
        const px = Math.max(2, Math.round((3 + amt.pixel * 14 + a.beatPulse * 6 * amt.pixel) * dpr));
        const sw = Math.max(1, Math.round(cw / px)), sh = Math.max(1, Math.round(ch / px));
        if (pix.width !== sw || pix.height !== sh) { pix.width = sw; pix.height = sh; }
        pctx.globalCompositeOperation = 'copy'; pctx.drawImage(canvas, 0, 0, sw, sh);
        ctx.imageSmoothingEnabled = false; ctx.globalCompositeOperation = 'copy'; ctx.drawImage(pix, 0, 0, cw, ch);
        ctx.imageSmoothingEnabled = true; ctx.globalCompositeOperation = 'source-over';
      }
      if (fx.bloom) {
        const sw = Math.max(1, cw >> 3), sh = Math.max(1, ch >> 3);
        if (small.width !== sw || small.height !== sh) { small.width = sw; small.height = sh; }
        sctx.globalCompositeOperation = 'copy'; sctx.drawImage(canvas, 0, 0, sw, sh);
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = clamp((0.25 + amt.bloom * 0.6) + a.energy * 0.3 + a.dropPulse * 0.4, 0, 1); ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(small, 0, 0, cw, ch);
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      }
      if (fx.rgb) {
        const d = (1 + amt.rgb * 3 + (a.beatPulse * 8 + a.snarePulse * 6) * amt.rgb * 1.5) * dpr;
        if (tint.width !== cw || tint.height !== ch) { tint.width = cw; tint.height = ch; }
        [['#ff0000', d], ['#00ffff', -d]].forEach(([c, dx]) => {
          tctx.globalCompositeOperation = 'copy'; tctx.drawImage(canvas, 0, 0);
          tctx.globalCompositeOperation = 'multiply'; tctx.fillStyle = c; tctx.fillRect(0, 0, cw, ch);
          ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.55; ctx.drawImage(tint, dx, 0);
        });
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      }
      if (fx.scan) {
        ctx.globalAlpha = 0.15 + amt.scan * 0.5; ctx.fillStyle = ctx.createPattern(lines, 'repeat');
        ctx.save(); ctx.scale(dpr, dpr); ctx.fillRect(0, 0, w, h); ctx.restore(); ctx.globalAlpha = 1;
      }
      if (fx.grain) {
        ctx.save(); ctx.globalAlpha = 0.05 + amt.grain * 0.3; ctx.globalCompositeOperation = 'overlay';
        ctx.translate(rand(-128, 0), rand(-128, 0)); ctx.fillStyle = ctx.createPattern(noise, 'repeat'); ctx.fillRect(0, 0, cw + 256, ch + 256);
        ctx.restore();
      }
      if (fx.vignette) {
        const v = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * (0.45 - amt.vignette * 0.25), cw / 2, ch / 2, Math.hypot(cw, ch) * 0.55);
        v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, `rgba(0,0,0,${0.35 + amt.vignette * 0.6})`);
        ctx.fillStyle = v; ctx.fillRect(0, 0, cw, ch);
      }
      if (fx.strobe && opts.flash !== false) {
        // capped at ~2.5 flashes a second on wall-clock time, whatever the music does
        const now = performance.now();
        if ((a.drop || (a.snare && amt.strobe > 0.5) || (a.kick && amt.strobe > 0.85)) && now - lastStrobe > 400) { strobeV = 1; lastStrobe = now; }
        if (strobeV > 0.02) { ctx.fillStyle = `rgba(255,255,255,${strobeV * (0.25 + amt.strobe * 0.5)})`; ctx.fillRect(0, 0, cw, ch); }
      }
      strobeV *= 0.75;
      ctx.restore();
    },
  };
})();
