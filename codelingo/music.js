// Lesson background music (R11): an original, quiet, looping 8-bit tune made with WebAudio.
// No audio files. A lookahead timer schedules notes slightly ahead on the audio clock
// instead of one setTimeout per note. Never throws, even without AudioContext.
(() => {
  'use strict';

  const BPM = 100;
  const STEP = 60 / BPM / 2; // one eighth note, seconds
  const LOOKAHEAD = 0.15; // schedule this far ahead, seconds
  const TICK_MS = 25; // how often the scheduler wakes up
  const GAIN = 0.025; // master volume (R11: low)
  const MAX_HZ = 1000; // no shrill notes

  // 8 bars x 8 eighths, MIDI note numbers, 0 = rest. Highest note G5 (784 Hz).
  const LEAD = [
    72, 0, 67, 0, 69, 72, 74, 0,
    76, 0, 74, 72, 69, 0, 67, 0,
    69, 0, 72, 0, 74, 76, 74, 72,
    69, 0, 0, 0, 67, 0, 0, 0,
    72, 0, 67, 0, 69, 72, 74, 0,
    76, 0, 79, 76, 74, 0, 72, 0,
    74, 0, 72, 69, 67, 0, 69, 72,
    72, 0, 0, 0, 0, 0, 0, 0,
  ];
  // Bass roots per bar (C, Am, F, G, C, Am, Dm, C); played root / fifth / octave / fifth.
  const ROOTS = [48, 45, 41, 43, 48, 45, 50, 48];
  const BASS_PATTERN = [0, -1, 7, -1, 12, -1, 7, -1];

  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

  let ctx = null;
  let master = null;
  let timer = 0;
  let step = 0;
  let nextAt = 0;

  function note(type, midi, at, dur, vol) {
    const f = hz(midi);
    if (f > MAX_HZ) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, at);
    g.gain.setValueAtTime(vol, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + dur);
    o.connect(g);
    g.connect(master);
    o.start(at);
    o.stop(at + dur + 0.02);
  }

  function schedule(i, at) {
    const lead = LEAD[i];
    if (lead) note('square', lead, at, STEP * 0.9, 0.5);
    const off = BASS_PATTERN[i % 8];
    if (off >= 0) note('triangle', ROOTS[Math.floor(i / 8)] + off, at, STEP * 1.8, 0.9);
  }

  function tick() {
    if (!ctx || !master) return;
    try {
      while (nextAt < ctx.currentTime + LOOKAHEAD) {
        schedule(step, nextAt);
        nextAt += STEP;
        step = (step + 1) % LEAD.length;
      }
    } catch (e) { stop(); }
  }

  // Must be called from a user gesture the first time (iOS unlocks audio on a tap).
  function start() {
    if (timer) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = ctx || new AC();
      if (ctx.state === 'suspended' && ctx.resume) {
        const p = ctx.resume();
        if (p && p.catch) p.catch(() => {});
      }
      master = ctx.createGain();
      master.gain.setValueAtTime(GAIN, ctx.currentTime);
      master.connect(ctx.destination);
      step = 0;
      nextAt = ctx.currentTime + 0.05;
      tick();
      timer = setInterval(tick, TICK_MS);
      return true;
    } catch (e) {
      stop();
      return false;
    }
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = 0;
    if (master) {
      // Disconnecting the master silences notes that were already scheduled ahead.
      try { master.disconnect(); } catch (e) { /* already gone */ }
      master = null;
    }
  }

  window.CLMusic = {
    start,
    stop,
    get playing() { return timer !== 0; },
    BPM, GAIN, MAX_HZ, BARS: LEAD.length / 8,
  };
})();
