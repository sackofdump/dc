// ============================================================
// audio.js — small WebAudio module that synthesizes subtle SFX.
// No beeps, no chiptune.  Each cue is a filtered noise burst with a
// soft envelope, sometimes layered with a low triangle/sine tone for
// "weight".  No samples to load — everything is generated on the fly.
// ============================================================
window.DDI = window.DDI || {};
DDI.audio = (function () {
  let ctx = null;
  let master = null;
  let muted = false;
  // Per-cue throttle map so spammy events (every projectile hit) don't
  // stack into a wall of noise.
  const lastPlay = Object.create(null);

  function ensureCtx() {
    if (ctx) return;
    try {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return;
      ctx = new C();
      master = ctx.createGain();
      master.gain.value = 0.32;
      master.connect(ctx.destination);
    } catch (e) {
      console.warn('[audio] init failed', e);
    }
  }

  // Browsers require a user gesture before audio plays.  Hook a one-shot
  // listener on the first interaction to unlock the context.
  function arm() {
    const unlock = function () {
      ensureCtx();
      if (ctx && ctx.state === 'suspended') ctx.resume();
      removeEventListener('pointerdown', unlock);
      removeEventListener('keydown', unlock);
      removeEventListener('touchstart', unlock);
    };
    addEventListener('pointerdown', unlock, { once: false });
    addEventListener('keydown',     unlock, { once: false });
    addEventListener('touchstart',  unlock, { once: false });
  }

  function setMuted(v) { muted = !!v; }
  function setVolume(v) {
    ensureCtx();
    if (master) master.gain.value = Math.max(0, Math.min(1, v));
  }

  // Build a small white-noise buffer once, reuse it.  Buffer source is
  // single-shot per play.
  let noiseBuf = null;
  function getNoiseBuffer() {
    if (!ctx) return null;
    if (noiseBuf) return noiseBuf;
    const sr = ctx.sampleRate;
    const len = Math.floor(sr * 1.5);
    const b = ctx.createBuffer(1, len, sr);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    noiseBuf = b;
    return b;
  }

  // Filtered, enveloped white-noise burst — the workhorse for organic
  // thuds, swooshes, shings, and crunches.
  function noise(opts) {
    if (!ctx || muted || !master) return;
    opts = opts || {};
    const dur = Math.max(0.03, opts.dur || 0.10);
    const cutoff = opts.cutoff || 1200;
    const cutoffEnd = opts.cutoffEnd != null ? opts.cutoffEnd : cutoff;
    const Q = opts.Q != null ? opts.Q : 0.7;
    const vol = opts.vol != null ? opts.vol : 0.5;
    const attack = opts.attack || 0.005;
    const filterType = opts.filterType || 'lowpass';

    const buf = getNoiseBuffer();
    if (!buf) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = opts.rate || 1;

    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(cutoff, ctx.currentTime);
    if (cutoffEnd !== cutoff) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(40, cutoffEnd), ctx.currentTime + dur);
    }
    filter.Q.value = Q;

    const gain = ctx.createGain();
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(vol, now + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    src.connect(filter); filter.connect(gain); gain.connect(master);
    src.start(now); src.stop(now + dur + 0.02);
  }

  // Soft tonal layer — used sparingly for "weight" alongside a noise burst.
  function tone(opts) {
    if (!ctx || muted || !master) return;
    opts = opts || {};
    const freq = opts.freq || 220;
    const dur = opts.dur || 0.25;
    const vol = opts.vol || 0.10;
    const type = opts.type || 'triangle';
    const sweepTo = opts.sweepTo;

    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (sweepTo) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, sweepTo), ctx.currentTime + dur);
    }

    const gain = ctx.createGain();
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(vol, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    osc.connect(gain); gain.connect(master);
    osc.start(now); osc.stop(now + dur + 0.02);
  }

  // ------------- Cues -------------
  // Each cue is intentionally short and muted to layer well with combat
  // noise; no clean tonal beeps.
  const SFX = {
    // Generic projectile-on-enemy thud — short, low-pass-filtered noise.
    hit:        function () { noise({ dur: 0.06, cutoff: 700,  cutoffEnd: 350, Q: 0.7, vol: 0.18 }); },
    // Crit gets a chunkier crunch + a hint of low triangle for weight.
    crit:       function () {
      noise({ dur: 0.10, cutoff: 1100, cutoffEnd: 400, Q: 1.0, vol: 0.30 });
      tone({ freq: 130, sweepTo: 60, dur: 0.16, vol: 0.07, type: 'triangle' });
    },
    // Hero hurt — wet thud + low rumble.
    hurt:       function () {
      noise({ dur: 0.18, cutoff: 500, cutoffEnd: 180, Q: 1.2, vol: 0.30 });
      tone({ freq: 160, sweepTo: 80, dur: 0.20, vol: 0.10, type: 'triangle' });
    },
    // Gold pickup — tiny high paper-rustle click.
    pickup_gold:function () { noise({ dur: 0.04, cutoff: 3200, cutoffEnd: 2200, Q: 1.8, vol: 0.13 }); },
    // Gem — slightly longer with a soft inner sine for sparkle.
    pickup_gem: function () {
      noise({ dur: 0.06, cutoff: 2600, cutoffEnd: 1500, Q: 2.2, vol: 0.16 });
      tone({ freq: 720, dur: 0.14, vol: 0.06, type: 'sine' });
    },
    // Chest — woody crack-creak; layered low triangle for body.
    pickup_chest: function () {
      noise({ dur: 0.28, cutoff: 900, cutoffEnd: 380, Q: 0.6, vol: 0.32 });
      tone({ freq: 220, sweepTo: 330, dur: 0.32, vol: 0.10, type: 'triangle' });
    },
    // Level up — quiet warm "lift" with no clear pitch (no chime/jingle
    // character, just a brief upward filter sweep on filtered noise).
    levelup:    function () {
      noise({ dur: 0.55, cutoff: 320, cutoffEnd: 1100, Q: 0.5, vol: 0.10 });
    },
    // Generic ability cast — short whoosh.
    cast:       function () { noise({ dur: 0.08, cutoff: 1400, cutoffEnd: 600, Q: 1.2, vol: 0.10 }); },
    // ULT — long swelling whoosh + low rumble.
    ult:        function () {
      noise({ dur: 0.55, cutoff: 400, cutoffEnd: 1800, Q: 0.5, vol: 0.25 });
      tone({ freq: 90, sweepTo: 220, dur: 0.55, vol: 0.18, type: 'triangle' });
    },
    // Death — deep rumble down-sweep, lingering filtered noise.
    death:      function () {
      tone({ freq: 165, sweepTo: 45, dur: 1.10, vol: 0.22, type: 'sawtooth' });
      noise({ dur: 0.95, cutoff: 350, cutoffEnd: 80, Q: 0.5, vol: 0.28 });
    },
    // Boss appears — low ominous swell.
    boss_spawn: function () {
      tone({ freq: 70, sweepTo: 35, dur: 0.85, vol: 0.28, type: 'triangle' });
      noise({ dur: 0.65, cutoff: 220, cutoffEnd: 90, Q: 0.5, vol: 0.32 });
    },
    // Elite ability telegraph — soft warning whoosh.
    telegraph:  function () { noise({ dur: 0.18, cutoff: 1400, cutoffEnd: 2400, Q: 0.9, vol: 0.14 }); },
    // Portal/zone enter — woosh-in.
    portal:     function () {
      noise({ dur: 0.40, cutoff: 800, cutoffEnd: 2000, Q: 0.8, vol: 0.22 });
      tone({ freq: 180, sweepTo: 480, dur: 0.45, vol: 0.10, type: 'sine' });
    },
    // Pickup something special (xp shrine, ult juice).
    boon:       function () {
      noise({ dur: 0.14, cutoff: 1800, cutoffEnd: 800, Q: 1.4, vol: 0.16 });
      tone({ freq: 330, sweepTo: 660, dur: 0.20, vol: 0.08, type: 'sine' });
    },
    // Soft UI tap (tooltip, button) — barely audible click.
    ui_tap:     function () { noise({ dur: 0.025, cutoff: 1600, Q: 2.4, vol: 0.07 }); },
    // Modal open — gentle swell.
    ui_swell:   function () {
      noise({ dur: 0.18, cutoff: 600, cutoffEnd: 1500, Q: 0.7, vol: 0.10 });
    },
  };

  function play(name) {
    if (muted) return;
    ensureCtx();
    if (!ctx) return;
    const fn = SFX[name];
    if (!fn) return;
    const now = (typeof performance !== 'undefined') ? performance.now() : Date.now();
    // Default per-cue throttle 35 ms — overrides per cue below.
    const TH = { hit: 45, crit: 60, pickup_gold: 30, cast: 40, ui_tap: 20 };
    const th = TH[name] != null ? TH[name] : 35;
    if (lastPlay[name] && now - lastPlay[name] < th) return;
    lastPlay[name] = now;
    fn();
  }

  return { arm, play, setMuted, setVolume, ensureCtx };
})();
