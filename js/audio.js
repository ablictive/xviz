// Audio engine: one AnalyserNode fed by whichever source is active
// (demo synth, local files, microphone, or tab/system capture).
(function () {
  const BANDS = 96;

  const Engine = {
    ctx: null, analyser: null, out: null,
    freqBytes: null, waveBytes: null,
    bands: new Float32Array(BANDS), wave: new Float32Array(512),
    bass: 0, mid: 0, high: 0, energy: 0, beat: false, beatPulse: 0,
    live: false, // true when real audio is reaching the analyser
    _bandEdges: null, _stream: null, _streamNode: null,

    ensure() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return this.ctx; }
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.ctx = ctx;
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0; // smoothing happens in analyse() with tunable attack/release
      this.out = ctx.createGain();
      this.out.gain.value = 0.8;
      this.out.connect(this.analyser);
      this.analyser.connect(ctx.destination);
      this.freqBytes = new Uint8Array(this.analyser.frequencyBinCount);
      this.waveBytes = new Uint8Array(this.analyser.fftSize);
      // log-spaced band edges from ~30 Hz to ~16 kHz
      const nyq = ctx.sampleRate / 2, bins = this.analyser.frequencyBinCount;
      this._bandEdges = [];
      for (let i = 0; i <= BANDS; i++) {
        const f = 30 * Math.pow(16000 / 30, i / BANDS);
        this._bandEdges.push(Math.min(bins - 1, Math.max(1, Math.round(f / nyq * bins))));
      }
      return ctx;
    },

    setVolume(v) { if (this.out) this.out.gain.value = v; },

    // Captured streams go to the analyser only, never the speakers (no feedback).
    async useStream(stream) {
      this.ensure();
      this.stopStream();
      this._stream = stream;
      this._streamNode = this.ctx.createMediaStreamSource(stream);
      this._streamNode.connect(this.analyser);
      this.analyser.disconnect();
      this._captureMode = true;
    },
    stopStream() {
      if (this._streamNode) { this._streamNode.disconnect(); this._streamNode = null; }
      if (this._stream) { this._stream.getTracks().forEach(t => t.stop()); this._stream = null; }
      if (this._captureMode && this.analyser) { this.analyser.connect(this.ctx.destination); this._captureMode = false; }
    },

    autoGain: true,
    bpm: 0,
    // Reaction tuning (the Sync tab). Per-band gains, envelope speeds, beat sensitivity,
    // how hard beats hit, and how fast motion runs relative to the music.
    tune: { bass: 1, mid: 1, high: 1, attack: 0.85, release: 0.55, beat: 0.5, punch: 1, motion: 1, contrast: 1, latency: 0, lock: false, autoSens: true },
    // outputs beyond bands/wave/bass/mid/high/energy:
    kick: false, snare: false, hat: false, drop: false,
    kickPulse: 0, snarePulse: 0, hatPulse: 0, dropPulse: 0,
    flux: 0, bright: 0, time: 0, // time = audio clock in ms, runs with the music
    _bandPeak: 0.3, _rmsAvg: 0.05, _beats: [], _floatWave: null, _lastT: 0, _speed: 1,
    _short: 0, _long: 0, _lastDrop: -1e9, _det: null, _prevAll: null, _fluxAvg: 1,
    _phase: 0, _kAdj: 0, _kickTimes: [], _queue: [], _pool: [], _out: null,
    beatPhase: 0, locked: false,

    _detectors() {
      if (this._det) return this._det;
      const hz = f => Math.max(1, Math.min(this.freqBytes.length - 1, Math.round(f / (this.ctx.sampleRate / 2) * this.freqBytes.length)));
      const mk = (lo, hi, gap, floor) => ({ lo: hz(lo), hi: Math.max(hz(lo) + 1, hz(hi)), gap, floor, prev: null, hist: [], last: -1e9 });
      this._det = { kick: mk(35, 150, 200, 6), snare: mk(1500, 5000, 140, 2.2), hat: mk(7000, 14000, 85, 1.5) };
      return this._det;
    },
    // Spectral-flux onset detector on one frequency range with an adaptive threshold.
    _onset(D, t, k) {
      const f = this.freqBytes;
      if (!D.prev) D.prev = new Float32Array(D.hi - D.lo + 1);
      let flux = 0;
      for (let i = D.lo; i <= D.hi; i++) { const d = f[i] - D.prev[i - D.lo]; if (d > 0) flux += d; D.prev[i - D.lo] = f[i]; }
      flux /= (D.hi - D.lo + 1);
      const h = D.hist; h.push(flux); if (h.length > 43) h.shift();
      let m = 0; for (const x of h) m += x; m /= h.length;
      let v = 0; for (const x of h) v += (x - m) * (x - m); const sd = Math.sqrt(v / h.length);
      if (h.length > 15 && flux > m + sd * k && flux > D.floor && t - D.last > D.gap) { D.last = t; return true; }
      return false;
    },

    analyse(sens, t) {
      const b = this.bands, T = this.tune;
      const dt = Math.min(100, Math.max(1, t - (this._lastT || t - 16.7))); this._lastT = t;
      const fr = dt / 16.67; // frame-rate independence: coefficients are tuned for 60 fps
      const ease = c => 1 - Math.pow(1 - c, fr);
      const decay = k => Math.pow(k, fr);

      if (!this.analyser || !this.live) {
        // Idle drift so the stage never looks dead.
        for (let i = 0; i < BANDS; i++) {
          const target = 0.08 + 0.06 * Math.sin(t * 0.0011 + i * 0.27) + 0.04 * Math.sin(t * 0.0023 - i * 0.11);
          b[i] += (target - b[i]) * 0.08;
        }
        for (let i = 0; i < this.wave.length; i++) this.wave[i] = Math.sin(i * 0.05 + t * 0.002) * 0.06 * Math.sin(t * 0.0007);
        this.bass = 0.1; this.mid = 0.08; this.high = 0.05; this.energy = 0.08; this.flux = 0; this.bright = 0.3;
        this.beat = this.kick = this.snare = this.hat = this.drop = false;
        this.kickPulse *= decay(0.92); this.snarePulse *= decay(0.9); this.hatPulse *= decay(0.85); this.dropPulse *= decay(0.97);
        this.beatPulse = this.kickPulse * T.punch;
        this.time += dt * 0.3 * T.motion;
        return this;
      }
      this.analyser.getByteFrequencyData(this.freqBytes);
      if (!this._floatWave) this._floatWave = new Float32Array(this.analyser.fftSize);
      const fw = this._floatWave;
      this.analyser.getFloatTimeDomainData(fw);

      // --- spectrum bands: per-band gain, auto-gain, then attack/release envelopes ---
      const e = this._bandEdges, raw = this._raw || (this._raw = new Float32Array(BANDS));
      let rawMax = 0, cw = 0, cs = 0;
      for (let i = 0; i < BANDS; i++) {
        let s = 0, n = 0;
        for (let k = e[i]; k <= Math.max(e[i], e[i + 1] - 1); k++) { s += this.freqBytes[k]; n++; }
        raw[i] = (s / n / 255) * (0.85 + i / BANDS * 0.55); // gentle tilt so highs show next to heavy lows
        if (raw[i] > rawMax) rawMax = raw[i];
        cw += raw[i] * i; cs += raw[i];
      }
      this._bandPeak = Math.max(rawMax, this._bandPeak * decay(0.9985), 0.05);
      const ag = this.autoGain ? Math.min(2.6, Math.max(0.8, 0.85 / this._bandPeak)) : 1;
      const up = ease(0.25 + T.attack * 0.75), down = ease(0.02 + (1 - T.release) * 0.33);
      for (let i = 0; i < BANDS; i++) {
        // smooth crossfade between the bass / mid / high gain knobs
        const x = i / BANDS, g = x < 0.15 ? T.bass : x < 0.2 ? T.bass + (T.mid - T.bass) * (x - 0.15) / 0.05 : x < 0.55 ? T.mid : x < 0.62 ? T.mid + (T.high - T.mid) * (x - 0.55) / 0.07 : T.high;
        const v = Math.pow(Math.min(1, raw[i] * sens * ag * g), T.contrast || 1);
        b[i] += (v - b[i]) * (v > b[i] ? up : down);
      }
      this.bright = cs > 0 ? Math.min(1, cw / cs / BANDS * 2.2) : 0;

      // --- waveform: start at a rising zero crossing so the scope holds still ---
      const N = fw.length, span = N / 2;
      let start = 0;
      for (let i = 1; i < N - span; i++) if (fw[i - 1] < 0 && fw[i] >= 0) { start = i; break; }
      let rms = 0;
      for (let i = start; i < start + span; i++) rms += fw[i] * fw[i];
      rms = Math.sqrt(rms / span);
      // scale to the running average level (not the loudest hit) and soft-compress,
      // so the trace stays readable between kicks
      this._rmsAvg = this._rmsAvg + (Math.max(rms, 0.002) - this._rmsAvg) * ease(0.03);
      const wg = (this.autoGain ? Math.min(8, 0.22 / this._rmsAvg) : 1) * Math.min(2, sens);
      const step = span / this.wave.length;
      for (let i = 0; i < this.wave.length; i++) {
        const j = start + Math.floor(i * step);
        let v = (fw[j] + fw[j + 1]) * 0.5 * wg;
        v = Math.sign(v) * Math.min(1.2, Math.pow(Math.abs(v), 0.75));
        this.wave[i] = this.wave[i] * 0.35 + v * 0.65;
      }

      const avg = (a, z) => { let s = 0; for (let i = a; i < z; i++) s += b[i]; return s / (z - a); };
      this.bass = avg(0, 14); this.mid = avg(14, 56); this.high = avg(56, BANDS);
      this.energy = avg(0, BANDS);

      // --- onsets: kick, snare and hi-hat each get their own detector ---
      const D = this._detectors(), k = 2.3 - T.beat * 1.7 + (T.autoSens ? this._kAdj : 0); // beat slider: 0 = only big hits, 1 = every tick
      this.kick = this._onset(D.kick, t, k);
      this.snare = this._onset(D.snare, t, k + 0.2);
      this.hat = this._onset(D.hat, t, k + 0.3);
      // auto sensitivity: steer the threshold so detected kicks run near the tempo
      // (or about two a second before a tempo is known)
      if (this.kick) this._kickTimes.push(t);
      while (this._kickTimes.length && t - this._kickTimes[0] > 4000) this._kickTimes.shift();
      if (T.autoSens && t - (this._lastAdj || 0) > 250) {
        this._lastAdj = t;
        const rate = this._kickTimes.length / 4, want = this.bpm ? this.bpm / 60 : 2;
        if (rate > want * 1.35) this._kAdj = Math.min(0.9, this._kAdj + 0.05);
        else if (rate < want * 0.6 && this.energy > 0.15) this._kAdj = Math.max(-0.9, this._kAdj - 0.05);
      }
      // beat lock: a phase-locked grid at the detected tempo. Real kicks nudge the phase,
      // and pulses land on the grid even when a kick is missed or doubled.
      const realKick = this.kick;
      this.locked = !!(T.lock && this.bpm);
      if (this.bpm) {
        this._phase += dt / (60000 / this.bpm);
        if (realKick) { const err = this._phase > 0.5 ? this._phase - 1 : this._phase; this._phase -= err * 0.35; }
      }
      let gridBeat = false;
      if (this._phase >= 1) { this._phase -= Math.floor(this._phase); gridBeat = true; }
      this.beatPhase = this._phase;
      if (this.locked) this.kick = gridBeat;
      const hold = 0.8 + T.release * 0.15;
      this.kickPulse = this.kick ? 1 : this.kickPulse * decay(hold);
      this.snarePulse = this.snare ? 1 : this.snarePulse * decay(hold - 0.04);
      this.hatPulse = this.hat ? 1 : this.hatPulse * decay(hold - 0.12);
      this.beat = this.kick;
      this.beatPulse = Math.min(2, this.kickPulse * T.punch);
      if (realKick) { this._trackTempo(t); }
      if (t - D.kick.last > 4000) this.bpm = 0;

      // --- overall onset strength (0..1) for motion ---
      if (!this._prevAll) this._prevAll = new Float32Array(this.freqBytes.length);
      let fl = 0;
      for (let i = 1; i < this.freqBytes.length; i += 2) { const d = this.freqBytes[i] - this._prevAll[i]; if (d > 0) fl += d; this._prevAll[i] = this.freqBytes[i]; }
      this._fluxAvg += (fl - this._fluxAvg) * ease(0.02);
      this.flux = Math.min(1, fl / (this._fluxAvg * 2.5 + 1));

      // --- drops: loudness jumps well above the last few seconds ---
      this._short += (rms - this._short) * ease(0.15);
      this._long += (rms - this._long) * ease(0.006);
      this.drop = false;
      if (this._short > this._long * 1.55 && this._short > 0.04 && t - this._lastDrop > 6000) { this.drop = true; this._lastDrop = t; }
      this.dropPulse = this.drop ? 1 : this.dropPulse * decay(0.975);

      // --- audio clock: motion speeds up with loud, busy passages and slows in quiet ones ---
      const target = T.motion * (0.25 + this.energy * 1.5 + this.flux * 0.5 + this.beatPulse * 0.4);
      this._speed += (target - this._speed) * ease(0.12);
      this.time += dt * this._speed;
      return T.latency > 0 ? this._delayed(t, T.latency) : this;
    },

    // Latency offset: hand the visuals the analysis from `ms` ago, for setups where the
    // sound reaches your ears late (Bluetooth speakers and headphones). Hits that happen
    // between output frames are merged so none are lost.
    _delayed(t, ms) {
      const KEYS = ['bass', 'mid', 'high', 'energy', 'flux', 'bright', 'kickPulse', 'snarePulse', 'hatPulse', 'dropPulse', 'beatPulse', 'bpm', 'time', 'beatPhase'];
      const EVENTS = ['kick', 'snare', 'hat', 'drop', 'beat'];
      const snap = this._pool.pop() || { bands: new Float32Array(BANDS), wave: new Float32Array(this.wave.length) };
      snap.t = t; snap.bands.set(this.bands); snap.wave.set(this.wave);
      KEYS.forEach(k => { snap[k] = this[k]; }); EVENTS.forEach(k => { snap[k] = this[k]; });
      this._queue.push(snap);
      if (!this._out) { this._out = { bands: new Float32Array(BANDS), wave: new Float32Array(this.wave.length) }; KEYS.forEach(k => { this._out[k] = this[k]; }); }
      const o = this._out; EVENTS.forEach(k => { o[k] = false; });
      while (this._queue.length && this._queue[0].t <= t - ms) {
        const s = this._queue.shift();
        o.bands.set(s.bands); o.wave.set(s.wave);
        KEYS.forEach(k => { o[k] = s[k]; }); EVENTS.forEach(k => { o[k] = o[k] || s[k]; });
        if (this._pool.length < 64) this._pool.push(s);
      }
      while (this._queue.length > 90) this._pool.push(this._queue.shift());
      return o;
    },

    // Tempo: every pair of beats in the last 8 s votes for a BPM (gaps folded into 70–180),
    // and the busiest 2-BPM bucket wins. Robust to off-beat hits that fool consecutive-gap methods.
    _trackTempo(t) {
      const beats = this._beats;
      beats.push(t);
      while (beats.length && t - beats[0] > 8000) beats.shift();
      if (beats.length < 6) return;
      const votes = new Map(), all = [];
      for (let i = 0; i < beats.length; i++) for (let j = i + 1; j < beats.length; j++) {
        const gap = beats[j] - beats[i]; if (gap > 1100) break;
        let bpm = 60000 / gap; while (bpm < 70) bpm *= 2; while (bpm > 180) bpm /= 2;
        all.push(bpm);
        const k = Math.round(bpm / 2) * 2;
        votes.set(k, (votes.get(k) || 0) + 1);
        votes.set(k - 2, (votes.get(k - 2) || 0) + 0.4); votes.set(k + 2, (votes.get(k + 2) || 0) + 0.4);
      }
      let best = 0, bestV = 0;
      votes.forEach((v, k) => { if (v > bestV) { bestV = v; best = k; } });
      if (bestV < 4) return;
      // refine: mean of the raw votes near the winning bucket (frame timing jitters single gaps)
      const near = all.filter(b => Math.abs(b - best) <= 3);
      const est = Math.round(near.reduce((x, y) => x + y, 0) / near.length);
      this.bpm = this.bpm && Math.abs(this.bpm - est) <= 1 ? this.bpm : est;
    },
  };
  Engine.BANDS = BANDS;

  // ---------------- Demo synth: three looping tracks ----------------
  const DEMO_TRACKS = [
    { title: 'Dial-Up Dreams', artist: 'xVIZ demo loop', bpm: 124, root: 45, prog: [0, 5, 3, 7], swing: 0 },
    { title: 'Low-Rise Jeans Forever', artist: 'xVIZ demo loop', bpm: 132, root: 50, prog: [0, 3, 8, 10], swing: 0.04 },
    { title: 'Server Room Rave', artist: 'xVIZ demo loop', bpm: 140, root: 41, prog: [0, 0, 1, 3], swing: 0 },
  ];

  const Demo = {
    index: 0, playing: false, _timer: null, _step: 0, _next: 0, _noise: null, _bus: null,
    get track() { return DEMO_TRACKS[this.index]; },
    get tracks() { return DEMO_TRACKS; },
    start() {
      const ctx = Engine.ensure();
      if (!this._noise) {
        const len = ctx.sampleRate;
        this._noise = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = this._noise.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
      this._bus = ctx.createGain(); this._bus.gain.value = 0.9; this._bus.connect(Engine.out);
      this.playing = true; this._step = 0; this._next = ctx.currentTime + 0.06;
      this._timer = setInterval(() => this._schedule(), 25);
      Engine.live = true;
    },
    stop() {
      this.playing = false; clearInterval(this._timer);
      if (this._bus) { const b = this._bus; b.gain.setTargetAtTime(0, Engine.ctx.currentTime, 0.03); setTimeout(() => b.disconnect(), 300); this._bus = null; }
    },
    go(delta) { const was = this.playing; this.stop(); this.index = (this.index + delta + DEMO_TRACKS.length) % DEMO_TRACKS.length; if (was) this.start(); },
    progress() { return this.playing ? (this._step % 64) / 64 : 0; },
    seconds() { return this._step * 60 / this.track.bpm / 4; },

    _schedule() {
      const ctx = Engine.ctx, tr = this.track, sixteenth = 60 / tr.bpm / 4;
      while (this._next < ctx.currentTime + 0.12) {
        const s = this._step % 16, bar = Math.floor(this._step / 16) % 4;
        const t = this._next + (s % 2 ? tr.swing : 0);
        const chord = tr.root + tr.prog[bar];
        if (s % 4 === 0) this._kick(t);
        if (s === 4 || s === 12) this._snare(t);
        if (s % 2 === 0) this._hat(t, s % 4 === 2 ? 0.16 : 0.07);
        if (this.index === 2 && s % 4 === 3) this._hat(t, 0.05);
        const bassPat = [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0];
        if (bassPat[s]) this._bass(t, chord - 12 + (s === 13 ? 7 : 0), sixteenth * 1.6);
        if (s === 0) this._pad(t, chord, sixteenth * 16);
        if (s % 3 === 0 && this.index !== 2) this._pluck(t, chord + [12, 15, 19, 24, 19, 15][(this._step / 3 | 0) % 6], sixteenth);
        if (this.index === 2 && s % 2 === 1) this._pluck(t, chord + 24 + (s % 4 === 1 ? 0 : 3), sixteenth * 0.6);
        this._step++; this._next += sixteenth;
      }
    },
    _hz(m) { return 440 * Math.pow(2, (m - 69) / 12); },
    _env(g, t, a, peak, d) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); },
    _kick(t) {
      const ctx = Engine.ctx, o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      this._env(g, t, 0.003, 1.0, 0.32); o.connect(g).connect(this._bus); o.start(t); o.stop(t + 0.4);
    },
    _snare(t) {
      const ctx = Engine.ctx, n = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      n.buffer = this._noise; f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.7;
      this._env(g, t, 0.002, 0.45, 0.18); n.connect(f).connect(g).connect(this._bus); n.start(t); n.stop(t + 0.25);
    },
    _hat(t, v) {
      const ctx = Engine.ctx, n = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      n.buffer = this._noise; f.type = 'highpass'; f.frequency.value = 7500;
      this._env(g, t, 0.001, v, 0.05); n.connect(f).connect(g).connect(this._bus); n.start(t, Math.random()); n.stop(t + 0.08);
    },
    _bass(t, m, d) {
      const ctx = Engine.ctx, o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.value = this._hz(m);
      f.type = 'lowpass'; f.Q.value = 6; f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(140, t + d);
      this._env(g, t, 0.005, 0.32, d); o.connect(f).connect(g).connect(this._bus); o.start(t); o.stop(t + d + 0.05);
    },
    _pad(t, m, d) {
      const ctx = Engine.ctx, g = ctx.createGain(), f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 2200;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.06, t + 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      f.connect(g).connect(this._bus);
      [0, 3, 7, 10].forEach((iv, i) => {
        const o = ctx.createOscillator(); o.type = i % 2 ? 'triangle' : 'sawtooth';
        o.frequency.value = this._hz(m + 12 + iv); o.detune.value = (i - 1.5) * 7;
        o.connect(f); o.start(t); o.stop(t + d + 0.05);
      });
    },
    _pluck(t, m, d) {
      const ctx = Engine.ctx, o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'square'; o.frequency.value = this._hz(m);
      this._env(g, t, 0.003, 0.06, d * 1.4); o.connect(g).connect(this._bus); o.start(t); o.stop(t + d * 1.6);
    },
  };

  // ---------------- Local file player ----------------
  const Files = {
    list: [], index: 0, el: null, _node: null,
    load(fileList) {
      this.list.forEach(f => URL.revokeObjectURL(f.url));
      this.list = [...fileList].map(f => ({ name: f.name.replace(/\.[^.]+$/, ''), url: URL.createObjectURL(f) }));
      this.index = 0;
    },
    _ensureEl() {
      if (this.el) return;
      Engine.ensure();
      this.el = new Audio();
      this.el.crossOrigin = 'anonymous';
      this._node = Engine.ctx.createMediaElementSource(this.el);
      this._node.connect(Engine.out);
      this.el.addEventListener('ended', () => this.go(1, true));
    },
    get track() {
      const f = this.list[this.index];
      if (!f) return null;
      const parts = f.name.split(' - ');
      return parts.length > 1 ? { artist: parts[0].trim(), title: parts.slice(1).join(' - ').trim() } : { title: f.name, artist: `Local file ${this.index + 1} of ${this.list.length}` };
    },
    get playing() { return this.el && !this.el.paused; },
    play() { this._ensureEl(); if (!this.el.src || this.el.dataset.idx != this.index) { this.el.src = this.list[this.index].url; this.el.dataset.idx = this.index; } Engine.live = true; return this.el.play(); },
    pause() { this.el && this.el.pause(); },
    go(d, auto) { if (!this.list.length) return; this.index = (this.index + d + this.list.length) % this.list.length; if (auto && this.index === 0) { this.pause(); return; } this.play(); },
    progress() { return this.el && this.el.duration ? this.el.currentTime / this.el.duration : 0; },
    seconds() { return this.el ? this.el.currentTime : 0; },
    seek(frac) { if (this.el && this.el.duration) this.el.currentTime = frac * this.el.duration; },
  };

  window.VizAudio = { Engine, Demo, Files };
})();
