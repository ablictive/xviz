// Theme renderers. Each theme paints its own backdrop + effects, and styles the
// three shared modes (orbit / scope / kaleido) through a few hooks.
(function () {
  const TAU = Math.PI * 2;
  const rand = (a, b) => a + Math.random() * (b - a);

  // ---------- shared geometry ----------
  // Snares nudge the rotation (alternating direction) so motion follows the groove.
  let spin = 0, spinVel = 0, spinDir = 1;
  function updateSpin(a) {
    if (a.snare) { spinVel += 0.05 * spinDir; spinDir = -spinDir; }
    if (a.drop) spinVel += 0.12;
    spin += spinVel; spinVel *= 0.9;
  }

  // A theme may pass `layout` to move the centre (cy), scale the scope (amp) or the kaleidoscope (kr).
  // Kaleido: the live waveform folded into 8 mirrored petals. Themes colour it with `ink`,
  // or take it over entirely with their own `kaleido` hook.
  function drawKaleido(ctx, w, h, a, th, t, opts) {
    const L = th.layout || {};
    const cx = w / 2, cy = h * (L.cy || 0.46), m = Math.min(w, h) * (L.kr || 1);
    const segs = 8, R0 = m * (0.035 + a.bass * 0.05), R = m * 0.34 * (0.75 + a.energy * 0.6), n = 96, amp = m * 0.11;
    const rot = t * 0.00015 + spin + a.beatPulse * 0.05;
    const pts = [];
    for (let i = 0; i < n; i++) {
      const f = i / (n - 1), env = Math.sin(f * Math.PI);
      const wv = a.wave[Math.floor(f * (a.wave.length - 1))];
      pts.push([R0 + f * R, (wv * amp + Math.sin(f * 7 + t * 0.002) * m * 0.03 * a.mid) * env, f]);
    }
    ctx.translate(cx, cy);
    if (th.kaleido) { th.kaleido(ctx, pts, segs, rot, a, t, opts, R0); return; }
    const ink = th.kaleidoInk ? th.kaleidoInk(t) : (th.ink || ['#fff']);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (th.kaleidoBlend) ctx.globalCompositeOperation = th.kaleidoBlend;
    for (let s = 0; s < segs; s++) for (const flip of [1, -1]) {
      ctx.save(); ctx.rotate(rot + s / segs * TAU); ctx.scale(1, flip);
      ink.forEach((c, k) => {
        ctx.beginPath();
        pts.forEach(([x, y], i) => { const yy = y * (1 - k * 0.3) + k * 3; i ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy); });
        ctx.strokeStyle = c; ctx.lineWidth = (th.inkWidth || 2.5) * (1 - k * 0.25); ctx.globalAlpha = k ? 0.75 : 1; ctx.stroke();
      });
      ctx.restore();
    }
    ctx.beginPath(); ctx.arc(0, 0, R0 * 0.8 + a.beatPulse * 6, 0, TAU); ctx.fillStyle = ink[0]; ctx.globalAlpha = 0.9; ctx.fill(); ctx.globalAlpha = 1;
  }
  function drawRadial(ctx, w, h, a, th, t, opts) {
    const L = th.layout || {};
    const cx = w / 2, cy = h * (L.cy || 0.46), r0 = Math.min(w, h) * (0.16 + a.bass * 0.05);
    const n = 120, rot = t * 0.00012 + spin;
    const pts = [];
    for (let i = 0; i < n; i++) {
      const k = i < n / 2 ? i : n - 1 - i; // mirror so it's symmetric
      const v = a.bands[Math.floor(k / (n / 2) * a.bands.length * 0.8)];
      const ang = rot + i / n * TAU;
      const len = r0 * 0.15 + v * Math.min(w, h) * 0.26;
      pts.push([ang, len, v]);
    }
    th.radial(ctx, cx, cy, r0, pts, a, t, opts);
  }
  function drawWave(ctx, w, h, a, th, t) {
    const L = th.layout || {};
    const pts = [], n = a.wave.length, cy = h * (L.cy || 0.46), amp = h * (L.amp || 0.36);
    for (let i = 0; i < n; i++) pts.push([i / (n - 1) * w, cy + a.wave[i] * amp * (0.6 + a.energy)]);
    th.wave(ctx, pts, w, h, a, t);
  }
  function path(ctx, pts) { ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); }
  function radialPath(ctx, cx, cy, r0, pts, scale = 1) {
    ctx.beginPath();
    pts.forEach(([ang, len], i) => { const r = r0 + len * scale; const x = cx + Math.cos(ang) * r, y = cy + Math.sin(ang) * r; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.closePath();
  }

  // ---------- flash limiter: never more than ~2.5 flashes per second ----------
  // rate-limited on wall-clock time (not the audio clock), so the cap holds whatever the music does
  const flash = { v: 0, last: 0, hit(_, allowed) { const now = performance.now(); if (allowed && now - this.last > 400) { this.v = 1; this.last = now; } }, decay(k) { this.v *= k; } };

  // ---------- noise texture for grain ----------
  let grain = null;
  function grainCanvas() {
    if (grain) return grain;
    grain = document.createElement('canvas'); grain.width = grain.height = 256;
    const g = grain.getContext('2d'), img = g.createImageData(256, 256);
    for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
    g.putImageData(img, 0, 0);
    return grain;
  }
  function drawGrain(ctx, w, h, alpha, mode = 'overlay') {
    const pat = ctx.createPattern(grainCanvas(), 'repeat');
    ctx.save(); ctx.globalAlpha = alpha; ctx.globalCompositeOperation = mode;
    ctx.translate(rand(-128, 0), rand(-128, 0)); ctx.fillStyle = pat; ctx.fillRect(0, 0, w + 256, h + 256);
    ctx.restore();
  }

  // =================================================================
  // Y2K CHROME — liquid metal, iridescent sweeps, sparkle stars
  // =================================================================
  const sparkles = [];
  function star(ctx, x, y, r, a) {
    ctx.save(); ctx.globalAlpha = a; ctx.translate(x, y); ctx.beginPath();
    for (let i = 0; i < 8; i++) { const rr = i % 2 ? r * 0.18 : r; const an = i / 8 * TAU; ctx.lineTo(Math.cos(an) * rr, Math.sin(an) * rr); }
    ctx.closePath(); ctx.fillStyle = '#fff'; ctx.shadowColor = '#bff'; ctx.shadowBlur = 12; ctx.fill(); ctx.restore();
  }
  function chromeGrad(ctx, x0, y0, x1, y1, t) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1), s = (Math.sin(t * 0.0006) + 1) / 2;
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.3 + s * 0.1, '#c7cfdd'); g.addColorStop(0.48, '#5d6782');
    g.addColorStop(0.52, '#2b3247'); g.addColorStop(0.7, '#d6ddea'); g.addColorStop(1, '#8fa0bd');
    return g;
  }
  const chrome = {
    name: 'Y2K Chrome',
    ink: ['#ffffff', '#9fe8ff', '#ff9ff3'], inkWidth: 3,
    bg(ctx, w, h, a, t) {
      const g = ctx.createRadialGradient(w / 2, h * 0.45, 10, w / 2, h * 0.5, Math.max(w, h) * 0.8);
      g.addColorStop(0, '#2a2f45'); g.addColorStop(0.6, '#10131f'); g.addColorStop(1, '#05060a');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      // iridescent sweep
      ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.1 + a.energy * 0.18;
      const ir = ctx.createLinearGradient(0, 0, w, h), o = (t * 0.00005) % 1;
      ['#ff9ff3', '#9fe8ff', '#c3ffa1', '#ffe29f', '#ff9ff3'].forEach((c, i) => ir.addColorStop((i / 4 + o) % 1, c));
      ctx.fillStyle = ir; ctx.fillRect(0, 0, w, h); ctx.restore();
      // liquid metal blob
      const cx = w / 2, cy = h * 0.46, R = Math.min(w, h) * (0.1 + a.bass * 0.08 + a.beatPulse * 0.02);
      ctx.beginPath();
      for (let i = 0; i <= 72; i++) {
        const an = i / 72 * TAU;
        const r = R * (1 + 0.12 * Math.sin(an * 3 + t * 0.0013) + 0.08 * Math.sin(an * 5 - t * 0.0019) + a.mid * 0.25 * Math.sin(an * 7 + t * 0.003));
        const x = cx + Math.cos(an) * r, y = cy + Math.sin(an) * r; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.fillStyle = chromeGrad(ctx, cx - R, cy - R, cx + R * 0.6, cy + R, t); ctx.globalAlpha = 0.9; ctx.fill(); ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.ellipse(cx - R * 0.3, cy - R * 0.45, R * 0.35, R * 0.14, -0.5, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.fill();
    },
    radial(ctx, cx, cy, r0, pts, a, t) {
      ctx.save(); ctx.lineJoin = 'round';
      radialPath(ctx, cx, cy, r0, pts); ctx.fillStyle = chromeGrad(ctx, cx - r0 * 2, cy - r0 * 2, cx + r0 * 2, cy + r0 * 2, t); ctx.globalAlpha = 0.35; ctx.fill(); ctx.globalAlpha = 1;
      ctx.lineWidth = 3; ctx.strokeStyle = '#eaf2ff'; ctx.shadowColor = '#9fe8ff'; ctx.shadowBlur = 16; ctx.stroke();
      radialPath(ctx, cx, cy, r0, pts, 0.6); ctx.strokeStyle = '#ff9ff3'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.restore();
    },
    wave(ctx, pts, w, h, a, t) {
      ctx.save(); ctx.lineJoin = 'round';
      for (let k = 3; k >= 0; k--) {
        ctx.save(); ctx.translate(0, k * 6); path(ctx, pts);
        ctx.strokeStyle = ['#ffffff', '#9fe8ff', '#ff9ff3', '#c3ffa1'][k]; ctx.globalAlpha = k ? 0.45 : 1; ctx.lineWidth = k ? 2 : 4; ctx.stroke(); ctx.restore();
      }
      ctx.restore();
    },
    fx(ctx, w, h, a, t) {
      if (a.beat || a.hat || Math.random() < a.high * 0.15) for (let i = 0; i < (a.drop ? 24 : a.beat ? 6 : a.hat ? 2 : 1); i++) sparkles.push({ x: rand(0, w), y: rand(0, h * 0.8), r: rand(6, 18), life: 1 });
      for (let i = sparkles.length - 1; i >= 0; i--) { const s = sparkles[i]; s.life -= 0.02; if (s.life <= 0) { sparkles.splice(i, 1); continue; } star(ctx, s.x, s.y, s.r * (0.5 + s.life), s.life); }
    },
  };

  // =================================================================
  // FRUTIGER AERO — sky, glassy bubbles, grassy hills, lens flare
  // =================================================================
  const bubbles = [];
  const aero = {
    name: 'Frutiger Aero',
    ink: ['#ffffff', '#29b6f6', '#7ed957'], inkWidth: 3.5,
    bg(ctx, w, h, a, t) {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#2ea8f0'); g.addColorStop(0.55, '#a9e3ff'); g.addColorStop(0.75, '#e9fbff'); g.addColorStop(1, '#bff2c9');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      // sun + flare
      const sx = w * 0.82, sy = h * 0.14, sr = Math.min(w, h) * (0.2 + a.energy * 0.12);
      const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr);
      sg.addColorStop(0, 'rgba(255,255,255,.95)'); sg.addColorStop(0.25, 'rgba(255,255,230,.5)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = sg; ctx.fillRect(0, 0, w, h);
      ctx.save(); ctx.globalCompositeOperation = 'screen';
      [[0.35, 30, '#bff'], [0.55, 14, '#cfc'], [0.75, 44, '#fff8']].forEach(([k, r, c]) => { ctx.beginPath(); ctx.arc(sx + (w / 2 - sx) * k * 2, sy + (h / 2 - sy) * k * 2, r, 0, TAU); ctx.fillStyle = c; ctx.globalAlpha = 0.25; ctx.fill(); });
      ctx.restore();
      // aurora ribbon
      ctx.save(); ctx.globalAlpha = 0.35;
      for (let k = 0; k < 2; k++) {
        ctx.beginPath(); ctx.moveTo(0, h * 0.3);
        for (let x = 0; x <= w; x += 20) ctx.lineTo(x, h * (0.28 + k * 0.08) + Math.sin(x * 0.006 + t * 0.0006 + k) * 40 * (0.5 + a.mid));
        ctx.lineTo(w, h * 0.6); ctx.lineTo(0, h * 0.6); ctx.closePath();
        const rg = ctx.createLinearGradient(0, h * 0.25, 0, h * 0.6); rg.addColorStop(0, k ? '#7ed957' : '#ffffff'); rg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = rg; ctx.fill();
      }
      ctx.restore();
      // rolling hills
      [['#7ed957', '#2e9e44', 0.8, 0.0009], ['#a5ec74', '#4fbf4a', 0.86, -0.0006]].forEach(([c1, c2, y0, sp]) => {
        ctx.beginPath(); ctx.moveTo(0, h);
        for (let x = 0; x <= w; x += 16) ctx.lineTo(x, h * y0 + Math.sin(x * 0.004 + t * sp) * 26 + Math.sin(x * 0.011) * 10);
        ctx.lineTo(w, h); ctx.closePath();
        const hg = ctx.createLinearGradient(0, h * y0 - 30, 0, h); hg.addColorStop(0, c1); hg.addColorStop(1, c2); ctx.fillStyle = hg; ctx.fill();
      });
    },
    radial(ctx, cx, cy, r0, pts, a, t) {
      // glass orb with water ripples
      const og = ctx.createRadialGradient(cx - r0 * 0.3, cy - r0 * 0.4, r0 * 0.1, cx, cy, r0 * 1.1);
      og.addColorStop(0, 'rgba(255,255,255,.95)'); og.addColorStop(0.5, 'rgba(120,210,255,.55)'); og.addColorStop(1, 'rgba(20,120,200,.6)');
      ctx.beginPath(); ctx.arc(cx, cy, r0, 0, TAU); ctx.fillStyle = og; ctx.fill();
      for (let k = 0; k < 3; k++) {
        radialPath(ctx, cx, cy, r0, pts, 1 - k * 0.3);
        ctx.strokeStyle = ['rgba(255,255,255,.95)', 'rgba(126,217,87,.8)', 'rgba(41,182,246,.7)'][k]; ctx.lineWidth = 4 - k; ctx.stroke();
      }
      ctx.beginPath(); ctx.ellipse(cx - r0 * 0.25, cy - r0 * 0.5, r0 * 0.5, r0 * 0.22, 0, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fill();
    },
    wave(ctx, pts, w, h, a, t) {
      ctx.save();
      path(ctx, pts); ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
      const g = ctx.createLinearGradient(0, h * 0.3, 0, h); g.addColorStop(0, 'rgba(41,182,246,.55)'); g.addColorStop(1, 'rgba(41,182,246,0)');
      ctx.fillStyle = g; ctx.fill();
      path(ctx, pts); ctx.strokeStyle = '#fff'; ctx.lineWidth = 5; ctx.lineJoin = 'round'; ctx.shadowColor = '#29b6f6'; ctx.shadowBlur = 14; ctx.stroke();
      ctx.restore();
    },
    fx(ctx, w, h, a, t) {
      const spawn = a.drop ? 30 : a.beat ? 5 : a.hat ? 2 : (Math.random() < 0.1 + a.energy * 0.4 ? 1 : 0);
      for (let i = 0; i < spawn && bubbles.length < 70; i++) bubbles.push({ x: rand(0, w), y: h + 30, r: rand(8, 34) * (a.beat ? 1.3 : 1), s: rand(0.4, 1.3), ph: rand(0, TAU) });
      for (let i = bubbles.length - 1; i >= 0; i--) {
        const b = bubbles[i]; b.y -= b.s * (1.2 + a.energy * 5); b.x += Math.sin(t * 0.002 + b.ph) * 0.6;
        if (b.y < -40) { bubbles.splice(i, 1); continue; }
        const g = ctx.createRadialGradient(b.x - b.r * 0.35, b.y - b.r * 0.35, b.r * 0.05, b.x, b.y, b.r);
        g.addColorStop(0, 'rgba(255,255,255,.9)'); g.addColorStop(0.35, 'rgba(255,255,255,.12)'); g.addColorStop(0.9, 'rgba(160,230,255,.3)'); g.addColorStop(1, 'rgba(255,255,255,.75)');
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fillStyle = g; ctx.fill();
      }
    },
  };

  // =================================================================
  // CYBERCORE — neon grid floor, striped sun, scanlines, glitch slices
  // =================================================================
  const glyphs = 'アイウエオカキクケコｱｲｳ01ﾊﾋﾌﾍﾎ<>/\\#$%'.split('');
  const rain = [];
  const cyber = {
    name: 'Cybercore',
    ink: ['#00f0ff', '#ff2bd6', '#ffe600'], kaleidoBlend: 'lighter',
    bg(ctx, w, h, a, t) {
      ctx.fillStyle = '#03030a'; ctx.fillRect(0, 0, w, h);
      const hz = h * 0.58;
      // sky glow
      const sg = ctx.createLinearGradient(0, 0, 0, hz); sg.addColorStop(0, '#03030a'); sg.addColorStop(1, '#2a0a3a'); ctx.fillStyle = sg; ctx.fillRect(0, 0, w, hz);
      // striped sun
      const sr = Math.min(w, h) * 0.2 * (1 + a.bass * 0.15), sx = w / 2, sy = hz - sr * 0.15;
      ctx.save(); ctx.beginPath(); ctx.arc(sx, sy, sr, Math.PI, TAU); ctx.closePath(); ctx.clip();
      const sunG = ctx.createLinearGradient(0, sy - sr, 0, sy); sunG.addColorStop(0, '#ffe600'); sunG.addColorStop(1, '#ff2bd6');
      ctx.fillStyle = sunG; ctx.fillRect(sx - sr, sy - sr, sr * 2, sr);
      ctx.fillStyle = '#03030a'; for (let i = 0; i < 7; i++) { const yy = sy - sr * 0.08 - i * sr * 0.11; ctx.fillRect(sx - sr, yy, sr * 2, 2 + (7 - i) * 0.9); }
      ctx.restore();
      // grid floor
      ctx.save(); ctx.beginPath(); ctx.rect(0, hz, w, h - hz); ctx.clip();
      ctx.fillStyle = '#08001a'; ctx.fillRect(0, hz, w, h - hz);
      ctx.strokeStyle = '#ff2bd6'; ctx.lineWidth = 1.2; ctx.shadowColor = '#ff2bd6'; ctx.shadowBlur = 6;
      const speed = (t * 0.0004 * (1 + a.energy * 3)) % 1;
      for (let i = 0; i < 18; i++) { const z = (i + speed) / 18; const y = hz + Math.pow(z, 2.2) * (h - hz); ctx.globalAlpha = z; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
      ctx.globalAlpha = 0.8;
      for (let i = -20; i <= 20; i++) { ctx.beginPath(); ctx.moveTo(w / 2 + i * 12, hz); ctx.lineTo(w / 2 + i * w * 0.12, h); ctx.stroke(); }
      ctx.restore();
      // glyph rain
      if (Math.random() < 0.3 + a.high) rain.push({ x: Math.floor(rand(0, w / 18)) * 18, y: -10, s: rand(2, 6), c: glyphs[Math.floor(rand(0, glyphs.length))] });
      ctx.font = '14px "Share Tech Mono", monospace'; ctx.fillStyle = 'rgba(0,240,255,.35)';
      for (let i = rain.length - 1; i >= 0; i--) { const r = rain[i]; r.y += r.s; if (r.y > hz || rain.length > 160) { rain.splice(i, 1); continue; } if (Math.random() < 0.05) r.c = glyphs[Math.floor(rand(0, glyphs.length))]; ctx.fillText(r.c, r.x, r.y); }
    },
    radial(ctx, cx, cy, r0, pts, a, t) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineJoin = 'round'; ctx.lineWidth = 2;
      [[1, '#ff2bd6', 3], [0.7, '#00f0ff', 2], [0.42, '#ffe600', 1.2]].forEach(([k, c, lw]) => {
        radialPath(ctx, cx, cy, r0, pts, k); ctx.strokeStyle = c; ctx.lineWidth = lw; ctx.shadowColor = c; ctx.shadowBlur = 14; ctx.stroke();
      });
      ctx.globalCompositeOperation = 'source-over'; ctx.lineWidth = 2;
      ctx.beginPath(); for (let i = 0; i < 6; i++) { const an = i / 6 * TAU + t * 0.0005; ctx.lineTo(cx + Math.cos(an) * r0 * 0.92, cy + Math.sin(an) * r0 * 0.92); } ctx.closePath();
      ctx.strokeStyle = '#00f0ff'; ctx.shadowColor = '#00f0ff'; ctx.stroke();
      ctx.font = `800 ${Math.round(r0 * 0.28)}px Orbitron, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#d8fbff';
      ctx.fillText(String(Math.round(a.energy * 999)).padStart(3, '0'), cx, cy);
      ctx.restore();
    },
    wave(ctx, pts, w, h, a) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineWidth = 2;
      [['#ff2bd6', -3], ['#00f0ff', 3], ['#ffffff', 0]].forEach(([c, dx]) => { ctx.save(); ctx.translate(dx * (1 + a.beatPulse * 3), 0); path(ctx, pts); ctx.strokeStyle = c; ctx.stroke(); ctx.restore(); });
      ctx.restore();
    },
    fx(ctx, w, h, a, t, canvas, dpr) {
      // glitch: shift a few horizontal slices on beats
      if (a.beatPulse > 0.6) {
        for (let i = 0; i < 5; i++) {
          const sy = rand(0, h), sh = rand(4, 40), dx = rand(-40, 40) * a.beatPulse;
          ctx.drawImage(canvas, 0, sy * dpr, canvas.width, sh * dpr, dx, sy, w, sh);
        }
      }
      ctx.fillStyle = 'rgba(0,0,0,.25)'; for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
      const v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
      v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.6)'); ctx.fillStyle = v; ctx.fillRect(0, 0, w, h);
    },
  };

  // =================================================================
  // INDIE SLEAZE — on-camera flash, grain, smeared neon, date stamp
  // =================================================================
  const scribbles = [];
  const indie = {
    name: 'Indie Sleaze',
    ink: ['#ff2e63', '#ffd23f', '#fff4f1'], inkWidth: 5,
    bg(ctx, w, h, a, t, opts) {
      // motion-blur trail instead of a clean clear
      ctx.fillStyle = 'rgba(18,7,9,.32)'; ctx.fillRect(0, 0, w, h);
      const g = ctx.createRadialGradient(w * 0.3, h * 0.35, 0, w * 0.3, h * 0.35, Math.max(w, h) * 0.6);
      g.addColorStop(0, `rgba(255,46,99,${0.12 + a.bass * 0.25})`); g.addColorStop(1, 'rgba(255,46,99,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      const g2 = ctx.createRadialGradient(w * 0.75, h * 0.7, 0, w * 0.75, h * 0.7, Math.max(w, h) * 0.5);
      g2.addColorStop(0, `rgba(255,210,63,${0.06 + a.high * 0.3})`); g2.addColorStop(1, 'rgba(255,210,63,0)'); ctx.fillStyle = g2; ctx.fillRect(0, 0, w, h);
      if (a.beat) flash.hit(t, opts.flash);
    },
    radial(ctx, cx, cy, r0, pts, a) {
      ctx.save(); ctx.lineJoin = 'round';
      for (let k = 0; k < 3; k++) {
        ctx.beginPath(); pts.forEach(([ang, len], i) => { const r = r0 + len * (1 - k * 0.2) + rand(-4, 4); const x = cx + Math.cos(ang) * r, y = cy + Math.sin(ang) * r; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath();
        ctx.strokeStyle = ['#ff2e63', '#ffd23f', '#fff4f1'][k]; ctx.lineWidth = [6, 3, 1.5][k]; ctx.stroke();
      }
      ctx.font = `${Math.round(r0 * 0.38)}px "Permanent Marker", cursive`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff4f1'; ctx.save(); ctx.translate(cx, cy); ctx.rotate(-0.12 + a.beatPulse * 0.08); ctx.fillText('LOUD', 0, 0); ctx.restore();
      ctx.restore();
    },
    wave(ctx, pts, w, h, a) {
      ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (let k = 0; k < 3; k++) { ctx.save(); ctx.translate(rand(-6, 6), rand(-6, 6)); path(ctx, pts); ctx.strokeStyle = ['#ff2e63', '#ffd23f', '#fff4f1'][k]; ctx.lineWidth = [10, 5, 2][k]; ctx.globalAlpha = 0.85; ctx.stroke(); ctx.restore(); }
      ctx.restore();
    },
    fx(ctx, w, h, a, t, canvas, dpr, opts) {
      if (a.beat && Math.random() < 0.6) scribbles.push({ x: rand(0, w), y: rand(0, h * 0.7), txt: ['xoxo', 'party!!', '♥', 'last night', 'ur so cool', '★', 'omg'][Math.floor(rand(0, 7))], rot: rand(-0.4, 0.4), life: 1, s: rand(22, 48) });
      ctx.save(); ctx.textAlign = 'center';
      for (let i = scribbles.length - 1; i >= 0; i--) { const s = scribbles[i]; s.life -= 0.012; if (s.life <= 0) { scribbles.splice(i, 1); continue; }
        ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.rot); ctx.globalAlpha = s.life; ctx.font = `${s.s}px "Permanent Marker", cursive`; ctx.fillStyle = i % 2 ? '#ffd23f' : '#ff2e63'; ctx.fillText(s.txt, 0, 0); ctx.restore(); }
      ctx.restore();
      drawGrain(ctx, w, h, 0.22);
      if (flash.v > 0.02) { ctx.fillStyle = `rgba(255,250,245,${flash.v * 0.55})`; ctx.fillRect(0, 0, w, h); flash.decay(0.82); }
      // vignette + date stamp, like a party photo
      const v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.7);
      v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.7)'); ctx.fillStyle = v; ctx.fillRect(0, 0, w, h);
      const d = new Date(); const stamp = `'${String(d.getFullYear()).slice(2)} ${d.getMonth() + 1} ${d.getDate()}  ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      ctx.font = 'bold 22px "Courier Prime", monospace'; ctx.textAlign = 'right'; ctx.fillStyle = '#ff9a1f'; ctx.shadowColor = '#ff6a00'; ctx.shadowBlur = 8;
      ctx.fillText(stamp, w - 24, h * 0.62); ctx.shadowBlur = 0;
    },
  };

  // =================================================================
  // UNDERGROUND — concrete, xerox halftone, warning tape, strobe
  // =================================================================
  const underground = {
    name: 'Underground',
    ink: ['#b6ff00', '#ff5a1f'], inkWidth: 3,
    bg(ctx, w, h, a, t, opts) {
      ctx.fillStyle = '#121311'; ctx.fillRect(0, 0, w, h);
      drawGrain(ctx, w, h, 0.12, 'source-over');
      // halftone field: rings outward from the centre, bass in the middle, highs at the edge
      const cell = Math.max(14, Math.min(w, h) / 34), cols = Math.ceil(w / cell), rows = Math.ceil(h / cell);
      const cx = w / 2, cy = h * 0.46, maxD = Math.hypot(w, h) / 2;
      ctx.fillStyle = '#b6ff00';
      for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) {
        const x = c * cell + cell / 2, y = r * cell + cell / 2, d = Math.hypot(x - cx, y - cy) / maxD;
        const v = a.bands[Math.min(a.bands.length - 1, Math.floor(d * a.bands.length * 0.75))];
        const ripple = Math.sin(d * 26 - t * 0.004) * 0.12 * (0.4 + a.bass);
        const s = v * 1.25 - d * 0.35 + ripple;
        if (s <= 0.03) continue;
        ctx.globalAlpha = Math.min(0.55, s);
        ctx.beginPath(); ctx.arc(x, y, Math.min(cell * 0.48, s * cell * 0.5), 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (a.beat) flash.hit(t, opts.flash);
    },
    radial(ctx, cx, cy, r0, pts, a, t) {
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, r0, 0, TAU); ctx.fillStyle = '#e6e8dc'; ctx.fill();
      ctx.beginPath(); ctx.arc(cx, cy, r0 * 0.28, 0, TAU); ctx.fillStyle = '#121311'; ctx.fill();
      ctx.strokeStyle = '#121311'; ctx.lineWidth = 1; for (let k = 0.4; k < 1; k += 0.08) { ctx.beginPath(); ctx.arc(cx, cy, r0 * k, 0, TAU); ctx.stroke(); }
      ctx.translate(cx, cy); ctx.rotate(t * 0.0035); ctx.fillStyle = '#ff5a1f'; ctx.fillRect(r0 * 0.3, -3, r0 * 0.6, 6);
      ctx.restore();
      ctx.save(); ctx.fillStyle = '#b6ff00';
      pts.forEach(([ang, len], i) => { if (i % 3) return; const r = r0 + 8 + len; ctx.fillRect(cx + Math.cos(ang) * r - 3, cy + Math.sin(ang) * r - 3, 6, 6); });
      ctx.restore();
    },
    wave(ctx, pts, w, h, a) {
      ctx.save(); ctx.strokeStyle = '#b6ff00'; ctx.lineWidth = 3; ctx.lineJoin = 'miter';
      ctx.beginPath(); pts.forEach((p, i) => { const x = Math.round(p[0] / 8) * 8, y = Math.round(p[1] / 8) * 8; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke();
      ctx.restore();
    },
    fx(ctx, w, h, a, t) {
      // warning-tape ticker
      const th = 30, y = h * 0.1, off = (t * 0.06) % 240;
      ctx.save(); ctx.translate(0, y); ctx.rotate(-0.04);
      ctx.fillStyle = '#ffd400'; ctx.fillRect(-20, 0, w + 40, th);
      ctx.fillStyle = '#121311'; ctx.font = '13px "Rubik Mono One", sans-serif'; ctx.textBaseline = 'middle';
      for (let x = -off; x < w + 240; x += 240) ctx.fillText('NO PHOTOS · NO PHONES ·', x, th / 2 + 1);
      ctx.restore();
      if (flash.v > 0.02) { ctx.fillStyle = `rgba(230,232,220,${flash.v * 0.7})`; ctx.fillRect(0, 0, w, h); flash.decay(0.7); }
    },
  };

  const hashStr = s => { let x = 7; for (let i = 0; i < (s || '').length; i++) x = (x * 31 + s.charCodeAt(i)) >>> 0; return x; };

  // =================================================================
  // AMP '98 — after Winamp: beveled skin window, LED spectrum with peak caps, dot scope
  // =================================================================
  const LED = ['#00b800', '#2fd100', '#7be000', '#c8e600', '#f0d000', '#ff9a00', '#ff4a00', '#ff1a00'];
  const ledAt = f => LED[Math.max(0, Math.min(LED.length - 1, Math.floor(f * LED.length)))];
  const ampPeaks = [];
  function bevel(ctx, x, y, w, h, fill, lite, dark) {
    ctx.fillStyle = fill; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = lite; ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y, 1, h);
    ctx.fillStyle = dark; ctx.fillRect(x, y + h - 1, w, 1); ctx.fillRect(x + w - 1, y, 1, h);
  }
  const amp = {
    name: "Amp '98",
    layout: { cy: 0.5, amp: 1.2 },
    rect(w, h) {
      const W = Math.min(w - 40, 880), H = Math.min(h * 0.46, 360);
      return { x: (w - W) / 2, y: Math.max(150, h * 0.48 - H / 2), w: W, h: H };
    },
    bg(ctx, w, h, a, t, opts) {
      const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#14141f'); g.addColorStop(1, '#05050a');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      const r = this.rect(w, h), fx = r.x - 10, fy = r.y - 72, fw = r.w + 20, fh = r.h + 82;
      bevel(ctx, fx, fy, fw, fh, '#29293a', '#5c5c7c', '#09090f');
      // title bar with gold grip lines
      ctx.fillStyle = '#1b1b28'; ctx.fillRect(fx + 4, fy + 4, fw - 8, 14);
      ctx.fillStyle = '#b8954a'; for (let y = fy + 6; y < fy + 17; y += 3) ctx.fillRect(fx + 6, y, fw - 12, 1);
      ctx.font = '10px Silkscreen, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const label = "AMP '98  ·  VISUALIZATION", lw = ctx.measureText(label).width + 16;
      ctx.fillStyle = '#1b1b28'; ctx.fillRect(fx + fw / 2 - lw / 2, fy + 4, lw, 14);
      ctx.fillStyle = '#e8e8ff'; ctx.fillText(label, fx + fw / 2, fy + 11.5);
      // LCD time
      bevel(ctx, fx + 10, fy + 24, 128, 40, '#000', '#09090f', '#5c5c7c');
      ctx.textAlign = 'left'; ctx.fillStyle = '#2ef22e'; ctx.font = '30px VT323, monospace';
      ctx.fillText((opts.playing ? '▶ ' : '❚❚ ') + (opts.time || '00:00'), fx + 18, fy + 45);
      // scrolling title marquee
      const mx = fx + 148, mw = fw - 158;
      bevel(ctx, mx, fy + 24, mw, 20, '#000', '#09090f', '#5c5c7c');
      ctx.save(); ctx.beginPath(); ctx.rect(mx + 2, fy + 25, mw - 4, 18); ctx.clip();
      ctx.font = '19px VT323, monospace'; ctx.fillStyle = '#2ef22e';
      const text = `${opts.artist ? opts.artist + ' - ' : ''}${opts.title || 'xVIZ'}  ***  `;
      const tw = ctx.measureText(text).width, off = (t * 0.04) % tw;
      for (let x = mx + 6 - off; x < mx + mw; x += tw) ctx.fillText(text, x, fy + 35);
      ctx.restore();
      ctx.font = '15px VT323, monospace'; ctx.fillStyle = '#1f9a1f';
      ctx.fillText('320 kbps   44 kHz', mx + 4, fy + 56);
      ctx.textAlign = 'right'; ctx.fillStyle = a.energy > 0.12 ? '#2ef22e' : '#1f5a1f'; ctx.fillText('STEREO', mx + mw - 4, fy + 56);
      // visualization pane
      bevel(ctx, r.x - 2, r.y - 2, r.w + 4, r.h + 4, '#000', '#09090f', '#5c5c7c');
      ctx.fillStyle = '#0b1f0b'; for (let x = r.x + 6; x < r.x + r.w; x += 12) for (let y = r.y + 6; y < r.y + r.h; y += 12) ctx.fillRect(x, y, 1, 1);
    },
    radial(ctx, cx, cy, r0, pts) {
      r0 *= 0.7;
      [1, 0.75, 0.5].forEach((k, j) => {
        pts.forEach(([ang, len]) => {
          const r = r0 + len * 0.7 * k;
          ctx.fillStyle = j ? ledAt(len * k / 140) + '99' : ledAt(len / 120);
          ctx.fillRect(cx + Math.cos(ang) * r - 1.5, cy + Math.sin(ang) * r - 1.5, 3, 3);
        });
      });
      ctx.font = '22px VT323, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#2ef22e'; ctx.fillText('AMP', cx, cy);
    },
    kaleido(ctx, pts, segs, rot, a) {
      for (let s = 0; s < segs; s++) for (const flip of [1, -1]) {
        ctx.save(); ctx.rotate(rot + s / segs * TAU); ctx.scale(1, flip);
        pts.forEach(([x, y, f], i) => { if (i % 2) return; ctx.fillStyle = ledAt(f); ctx.fillRect(x - 1.5, y - 1.5, 3, 3); });
        ctx.restore();
      }
      ctx.fillStyle = ledAt(a.bass); ctx.fillRect(-4, -4, 8, 8);
    },
    wave(ctx, pts, w, h) {
      const cy = h * 0.5;
      ctx.strokeStyle = 'rgba(46,242,46,.35)'; ctx.lineWidth = 1; path(ctx, pts); ctx.stroke();
      pts.forEach(([x, y], i) => { if (i % 2) return; ctx.fillStyle = ledAt(Math.abs(y - cy) / (h * 0.45)); ctx.fillRect(x - 1.5, y - 1.5, 3, 3); });
    },
    fx() {},
  };

  // =================================================================
  // LIQUID WARP — after MilkDrop: per-frame feedback zoom/rotate with hue drift
  // =================================================================
  let warpBuf = null, warpCtx = null;
  const hueAt = (t, off = 0) => (t * 0.025 + off) % 360;
  const warp = {
    name: 'Liquid Warp',
    kaleidoInk: t => [`hsl(${hueAt(t)},100%,62%)`, `hsl(${hueAt(t, 140)},100%,62%)`, '#ffffff'],
    layout: { amp: 0.3 },
    bg(ctx, w, h, a, t, opts) {
      const c = opts.canvas;
      if (!warpBuf) { warpBuf = document.createElement('canvas'); warpCtx = warpBuf.getContext('2d'); }
      if (warpBuf.width !== c.width || warpBuf.height !== c.height) { warpBuf.width = c.width; warpBuf.height = c.height; }
      warpCtx.globalCompositeOperation = 'copy'; warpCtx.drawImage(c, 0, 0);
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
      ctx.save();
      const z = 1.018 + a.bass * 0.035 + a.beatPulse * 0.025;
      ctx.translate(w / 2 + Math.sin(t * 0.00041) * w * 0.004, h / 2 + Math.cos(t * 0.00033) * h * 0.004);
      ctx.rotate(Math.sin(t * 0.00023) * 0.014 + (a.mid - 0.15) * 0.02 + (spinVel * 0.6));
      ctx.scale(z, z * (1 + Math.sin(t * 0.0005) * 0.004));
      ctx.translate(-w / 2, -h / 2);
      ctx.globalAlpha = 0.93;
      ctx.filter = 'hue-rotate(4deg) saturate(1.06)';
      ctx.drawImage(warpBuf, 0, 0, w, h);
      ctx.restore();
    },
    radial(ctx, cx, cy, r0, pts, a, t) {
      ctx.lineJoin = 'round';
      radialPath(ctx, cx, cy, r0 * 0.6, pts, 0.8); ctx.strokeStyle = `hsl(${hueAt(t)},100%,65%)`; ctx.lineWidth = 4; ctx.stroke();
      radialPath(ctx, cx, cy, r0 * 0.6, pts, 0.8); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2; ctx.stroke();
    },
    wave(ctx, pts, w, h, a, t) {
      ctx.lineJoin = 'round';
      path(ctx, pts); ctx.strokeStyle = `hsl(${hueAt(t, 180)},100%,62%)`; ctx.lineWidth = 6; ctx.stroke();
      path(ctx, pts); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
    },
    fx(ctx, w, h, a, t) {
      // seed shapes the feedback loop will smear into tunnels
      if (a.beatPulse > 0.5) {
        ctx.beginPath(); ctx.arc(w / 2, h / 2, 14 + a.bass * 40, 0, TAU);
        ctx.strokeStyle = `hsl(${hueAt(t, 90)},100%,70%)`; ctx.lineWidth = 3; ctx.stroke();
      }
      const k = 3, rr = Math.min(w, h) * 0.08 * (0.5 + a.high * 2);
      for (let i = 0; i < k; i++) {
        const an = t * 0.0011 + i / k * TAU;
        ctx.fillStyle = `hsl(${hueAt(t, i * 120)},100%,65%)`;
        ctx.beginPath(); ctx.arc(w / 2 + Math.cos(an) * rr, h / 2 + Math.sin(an) * rr, 2 + a.high * 5, 0, TAU); ctx.fill();
      }
    },
  };

  // =================================================================
  // MAGNET CLOUD — after iTunes' Magnetosphere: particles pulled by three glowing poles
  // =================================================================
  const POLES = [{ c: '255,138,92' }, { c: '111,183,255' }, { c: '200,139,255' }];
  const motes = [];
  const magnet = {
    name: 'Magnet Cloud',
    ink: ['rgba(111,183,255,.75)', 'rgba(255,138,92,.6)', 'rgba(200,139,255,.6)'], inkWidth: 1.6, kaleidoBlend: 'lighter',
    bg(ctx, w, h, a, t) {
      ctx.fillStyle = 'rgba(2,3,10,.2)'; ctx.fillRect(0, 0, w, h);
      if (motes.length === 0) for (let i = 0; i < 1500; i++) motes.push({ x: Math.random() * w, y: Math.random() * h, vx: 0, vy: 0, b: i % 3 });
      const lv = [a.bass, a.mid, a.high], m = Math.min(w, h);
      POLES.forEach((p, k) => {
        const an = t * (0.00021 + k * 0.00007) + k * 2.1;
        p.x = w / 2 + Math.cos(an) * w * 0.26 * Math.sin(t * 0.00013 + k);
        p.y = h * 0.46 + Math.sin(an * 1.3) * m * 0.2;
        p.l = lv[k];
      });
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 3; k++) {
        const p = POLES[k];
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, m * (0.05 + p.l * 0.18));
        g.addColorStop(0, `rgba(${p.c},.55)`); g.addColorStop(1, `rgba(${p.c},0)`);
        ctx.fillStyle = g; ctx.fillRect(p.x - m * 0.25, p.y - m * 0.25, m * 0.5, m * 0.5);
        ctx.fillStyle = `rgba(${p.c},.9)`;
        for (const q of motes) {
          if (q.b !== k) continue;
          const dx = p.x - q.x, dy = p.y - q.y, d = Math.hypot(dx, dy) + 30;
          const pull = (0.25 + p.l * 2.2) * 30 / d;
          q.vx += dx / d * pull - dy / d * 0.35; q.vy += dy / d * pull + dx / d * 0.35;
          if (a.beat && d < m * 0.2) { q.vx -= dx / d * 9; q.vy -= dy / d * 9; }
          q.vx *= 0.94; q.vy *= 0.94; q.x += q.vx; q.y += q.vy;
          ctx.fillRect(q.x, q.y, 1.6, 1.6);
        }
      }
      ctx.restore();
    },
    radial(ctx, cx, cy, r0, pts) { ctx.globalCompositeOperation = 'lighter'; radialPath(ctx, cx, cy, r0, pts, 0.7); ctx.strokeStyle = 'rgba(111,183,255,.5)'; ctx.lineWidth = 2; ctx.stroke(); },
    wave(ctx, pts) { ctx.globalCompositeOperation = 'lighter'; path(ctx, pts); ctx.strokeStyle = 'rgba(234,243,255,.45)'; ctx.lineWidth = 1.5; ctx.stroke(); },
    fx() {},
  };

  // =================================================================
  // BASS HALO — after Trap Nation: shaking layered halo around the cover art, flying dust
  // =================================================================
  let haloBlur = null, haloSrc = null;
  const dust = [];
  const HALO = ['#ff3ea5', '#7a5cff', '#3fd2ff', '#ffffff'];
  function smoothRing(ctx, cx, cy, r0, pts, scale) {
    const P = pts.map(([ang, len]) => [cx + Math.cos(ang) * (r0 + len * scale), cy + Math.sin(ang) * (r0 + len * scale)]);
    ctx.beginPath(); ctx.moveTo((P[0][0] + P[P.length - 1][0]) / 2, (P[0][1] + P[P.length - 1][1]) / 2);
    for (let i = 0; i < P.length; i++) { const n = P[(i + 1) % P.length]; ctx.quadraticCurveTo(P[i][0], P[i][1], (P[i][0] + n[0]) / 2, (P[i][1] + n[1]) / 2); }
    ctx.closePath();
  }
  function coverArt(ctx, img, x, y, s, fallbackHue) {
    if (img && img.complete && img.naturalWidth) ctx.drawImage(img, x, y, s, s);
    else { const g = ctx.createLinearGradient(x, y, x + s, y + s); g.addColorStop(0, `hsl(${fallbackHue},80%,55%)`); g.addColorStop(1, `hsl(${fallbackHue + 60},80%,35%)`); ctx.fillStyle = g; ctx.fillRect(x, y, s, s); }
  }
  const halo = {
    name: 'Bass Halo',
    ink: ['#ffffff', '#3fd2ff', '#7a5cff', '#ff3ea5'], inkWidth: 4,
    layout: { cy: 0.47 },
    shake(a) { const k = Math.pow(a.bass, 2) * 16 + a.beatPulse * 4; return [rand(-k, k), rand(-k, k)]; },
    bg(ctx, w, h, a, t, opts) {
      ctx.fillStyle = '#07070c'; ctx.fillRect(0, 0, w, h);
      const img = opts.artImg;
      if (img && img.complete && img.naturalWidth && haloSrc !== img.src) {
        haloSrc = img.src; haloBlur = document.createElement('canvas'); haloBlur.width = haloBlur.height = 64;
        const b = haloBlur.getContext('2d'); b.filter = 'blur(6px)'; b.drawImage(img, -8, -8, 80, 80);
      }
      if (haloBlur && img && haloSrc === img.src) {
        const s = Math.max(w, h) * 1.2; ctx.globalAlpha = 0.32 + a.bass * 0.2; ctx.drawImage(haloBlur, (w - s) / 2, (h - s) / 2, s, s); ctx.globalAlpha = 1;
      } else {
        const hue = hashStr(opts.title) % 360, g = ctx.createRadialGradient(w / 2, h * 0.47, 0, w / 2, h * 0.47, Math.max(w, h) * 0.7);
        g.addColorStop(0, `hsla(${hue},70%,30%,.6)`); g.addColorStop(1, 'rgba(7,7,12,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      }
      const v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
      v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.75)'); ctx.fillStyle = v; ctx.fillRect(0, 0, w, h);
    },
    radial(ctx, cx, cy, r0, pts, a, t, opts) {
      r0 = r0 * 1.05;
      for (let k = 0; k < HALO.length; k++) {
        smoothRing(ctx, cx, cy, r0, pts, 1.1 - k * 0.22);
        ctx.fillStyle = HALO[k]; ctx.globalAlpha = k === 3 ? 1 : 0.85; ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r0, 0, TAU); ctx.clip();
      coverArt(ctx, opts.artImg, cx - r0, cy - r0, r0 * 2, hashStr(opts.title) % 360);
      ctx.restore();
      ctx.beginPath(); ctx.arc(cx, cy, r0, 0, TAU); ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.stroke();
    },
    wave(ctx, pts, w, h, a) {
      ctx.lineJoin = 'round';
      HALO.forEach((c, k) => { ctx.save(); ctx.translate(0, (3 - k) * 4 * (1 + a.bass * 2)); path(ctx, pts); ctx.strokeStyle = c; ctx.lineWidth = k === 3 ? 3 : 4; ctx.stroke(); ctx.restore(); });
    },
    fx(ctx, w, h, a) {
      const cx = w / 2, cy = h * 0.47;
      for (let i = 0; i < 3 + a.bass * 8 && dust.length < 260; i++) { const an = rand(0, TAU); dust.push({ x: cx + Math.cos(an) * 40, y: cy + Math.sin(an) * 40, vx: Math.cos(an), vy: Math.sin(an), s: rand(0.6, 2.4) }); }
      ctx.fillStyle = '#fff';
      for (let i = dust.length - 1; i >= 0; i--) {
        const d = dust[i], sp = 0.6 + a.bass * 7; d.x += d.vx * sp * d.s; d.y += d.vy * sp * d.s;
        if (d.x < -10 || d.x > w + 10 || d.y < -10 || d.y > h + 10) { dust.splice(i, 1); continue; }
        ctx.globalAlpha = Math.min(1, Math.hypot(d.x - cx, d.y - cy) / 300) * 0.8; ctx.fillRect(d.x, d.y, d.s, d.s);
      }
      ctx.globalAlpha = 1;
    },
  };

  // =================================================================
  // CLEAN CUT — after Monstercat: flat colour field, crisp white line work, big caps title
  // =================================================================
  const CLEAN = [[29, 140, 248], [227, 18, 62], [0, 177, 106], [247, 164, 0], [140, 63, 255], [255, 79, 160], [11, 195, 195], [255, 102, 0]];
  const cleanCol = [29, 140, 248];
  const clean = {
    name: 'Clean Cut',
    ink: ['#ffffff'], inkWidth: 3,
    layout: { cy: 0.32, amp: 0.25, kr: 0.62 },
    bg(ctx, w, h, a, t, opts) {
      const target = CLEAN[hashStr(opts.title) % CLEAN.length];
      for (let k = 0; k < 3; k++) cleanCol[k] += (target[k] - cleanCol[k]) * 0.04;
      ctx.fillStyle = `rgb(${cleanCol.map(Math.round).join(',')})`; ctx.fillRect(0, 0, w, h);
    },
    radial(ctx, cx, cy, r0, pts) {
      // kept compact so the ring clears the title block under it
      r0 *= 0.8;
      smoothRing(ctx, cx, cy, r0, pts, 0.45); ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, r0 * 0.82, 0, TAU); ctx.lineWidth = 2; ctx.globalAlpha = 0.6; ctx.stroke(); ctx.globalAlpha = 1;
    },
    wave(ctx, pts) { path(ctx, pts); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.stroke(); },
    fx(ctx, w, h, a, t, canvas, dpr, opts) {
      const x0 = w * 0.1, y0 = h * 0.6 + 18, s = Math.max(56, Math.min(120, w * 0.075));
      coverArt(ctx, opts.artImg, x0, y0, s, hashStr(opts.title) % 360);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(x0, y0, s, s);
      const tx = x0 + s + 18, maxW = w * 0.9 - tx;
      ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillStyle = '#fff';
      const fit = (str, px, weight) => { let f = px; ctx.font = `${weight} ${f}px Montserrat, "Arial Black", sans-serif`; while (ctx.measureText(str).width > maxW && f > 12) { f -= 2; ctx.font = `${weight} ${f}px Montserrat, "Arial Black", sans-serif`; } return f; };
      const artist = (opts.artist || '').toUpperCase(), title = (opts.title || '').toUpperCase();
      const f1 = fit(artist, Math.round(s * 0.42), 800); ctx.fillText(artist, tx, y0 + 2);
      fit(title, Math.round(s * 0.26), 500); ctx.fillText(title, tx, y0 + f1 + 10);
    },
  };

  const META = [
    { id: 'chrome', after: 'Liquid chrome & bubble type', swatch: 'linear-gradient(135deg,#fff,#9aa3b5 45%,#2b3247 52%,#d6ddea)' },
    { id: 'aero', after: 'Frutiger Aero, Vista-era glass', swatch: 'linear-gradient(180deg,#2ea8f0,#a9e3ff 55%,#7ed957 75%,#2e9e44)' },
    { id: 'cyber', after: 'Synthwave grid & glitch', swatch: 'linear-gradient(180deg,#03030a 20%,#2a0a3a 45%,#ff2bd6 60%,#ffe600 70%,#08001a 72%)' },
    { id: 'indie', after: 'Party flash photos, 2007', swatch: 'radial-gradient(circle at 30% 35%,#ff2e63,#120709 70%)' },
    { id: 'underground', after: 'Warehouse rave flyers', swatch: 'radial-gradient(#b6ff00 35%,transparent 38%) 0 0/9px 9px,#121311' },
    { id: 'amp', after: 'After Winamp', swatch: 'radial-gradient(circle,transparent 32%,#000 38%) 0 0/7px 7px,radial-gradient(circle at 50% 50%,#ff1a00,#c8e600 35%,#00b800 60%,#002a00 80%)' },
    { id: 'warp', after: 'After MilkDrop', swatch: 'radial-gradient(circle,#000 10%,transparent 45%),conic-gradient(#b06bff,#3cf2c2,#ffcf3c,#ff4fa0,#b06bff)' },
    { id: 'magnet', after: 'After iTunes Magnetosphere', swatch: 'radial-gradient(circle at 30% 40%,#ff8a5c,transparent 30%),radial-gradient(circle at 70% 60%,#6fb7ff,transparent 35%),radial-gradient(circle at 55% 25%,#c88bff,transparent 25%),#02030a' },
    { id: 'halo', after: 'After Trap Nation', swatch: 'radial-gradient(circle,#c9c9d6 0 22%,#fff 23% 27%,#3fd2ff 28% 32%,#7a5cff 33% 37%,#ff3ea5 38% 42%,#07070c 44%)' },
    { id: 'clean', after: 'After Monstercat', swatch: 'radial-gradient(circle at 50% 45%,transparent 0 20%,#fff 21% 25%,transparent 26%),#1d8cf8' },
  ];
  const LIST = { chrome, aero, cyber, indie, underground, amp, warp, magnet, halo, clean };
  META.forEach(m => { m.name = LIST[m.id].name; });

  window.VizThemes = {
    list: LIST,
    meta: META,
    render(ctx, canvas, dpr, w, h, a, t, theme, mode, opts) {
      const th = this.list[theme] || chrome;
      opts.canvas = canvas; opts.dpr = dpr;
      updateSpin(a);
      ctx.save(); th.bg(ctx, w, h, a, t, opts); ctx.restore();
      ctx.save();
      if (th.shake) { const [dx, dy] = th.shake(a); ctx.translate(dx, dy); }
      let W = w, H = h;
      if (th.rect) { const r = th.rect(w, h); ctx.translate(r.x, r.y); ctx.beginPath(); ctx.rect(0, 0, r.w, r.h); ctx.clip(); W = r.w; H = r.h; }
      if (mode === 'kaleido') drawKaleido(ctx, W, H, a, th, t, opts);
      else if (mode === 'radial') drawRadial(ctx, W, H, a, th, t, opts);
      else drawWave(ctx, W, H, a, th, t);
      ctx.restore();
      ctx.save(); th.fx(ctx, w, h, a, t, canvas, dpr, opts); ctx.restore();
    },
  };
})();
