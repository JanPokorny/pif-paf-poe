/* global OfflineAudioContext */
// The game's music, composed and rendered offline. tools/render-music.cjs
// runs this in a headless browser (an OfflineAudioContext), and the game only
// plays back the recordings in music/ and crossfades between them. Rendering
// ahead means no notes scheduled while the page is busy: nothing drifts out of
// time and nothing crackles.
//
// renderTrack(act, scene, bars)  `bars` bars, written twice with the same
//                                notes; the second pass (with the first one's
//                                echoes ringing into it) is the seamless loop.
// renderStinger(act, kind)       one phrase: win, lose, door, stronger, heal.

const MODES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  minor: [0, 2, 3, 5, 7, 8, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
};
// Chords as scale degrees (0-based) of the act's mode.
const ACTS = {
  0: { root: 60, mode: 'major', bpm: 84, prog: [0, 5, 3, 4], lead: 'flute', arp: 'pluck', bass: 'round', pad: 'soft' },     // title
  1: { root: 60, mode: 'major', bpm: 96, prog: [0, 5, 3, 4], lead: 'flute', arp: 'pluck', bass: 'round', pad: 'soft' },     // Meadow, C major
  2: { root: 62, mode: 'dorian', bpm: 100, prog: [0, 6, 3, 0], lead: 'marimba', arp: 'square', bass: 'saw', pad: 'reed' },  // Quarry, D dorian
  3: { root: 57, mode: 'minor', bpm: 108, prog: [0, 5, 2, 6], lead: 'bell', arp: 'glass', bass: 'deep', pad: 'saw' },       // Summit, A minor
};
// The boss darkens whatever act it lives in.
const BOSS = { 1: { mode: 'minor', prog: [0, 5, 6, 4] }, 2: { mode: 'phrygian', prog: [0, 1, 6, 0] }, 3: { mode: 'phrygian', prog: [0, 1, 5, 4] } };

const LAYERS = ['pad', 'bass', 'arp', 'lead', 'bell', 'kick', 'hat', 'snare'];
const SCENES = {
  title:   { pad: 0.8, lead: 0.5, bell: 0.4, tempo: 0.9, density: 0.4 },
  map:     { pad: 0.7, bass: 0.7, arp: 0.5, lead: 0.55, hat: 0.3, tempo: 1, density: 0.55 },
  calm:    { pad: 0.9, arp: 0.35, bell: 0.45, tempo: 0.85, density: 0.35 },
  event:   { pad: 0.7, bass: 0.4, bell: 0.5, lead: 0.4, tempo: 0.9, density: 0.45 },
  duel:    { pad: 0.45, bass: 0.85, arp: 0.7, lead: 0.5, kick: 0.6, hat: 0.5, tempo: 1.05, density: 0.65 },
  elite:   { pad: 0.5, bass: 0.9, arp: 0.8, lead: 0.55, kick: 0.75, hat: 0.6, snare: 0.5, tempo: 1.1, density: 0.75 },
  boss:    { pad: 0.6, bass: 1, arp: 0.85, lead: 0.6, bell: 0.3, kick: 0.9, hat: 0.65, snare: 0.7, tempo: 1.15, density: 0.85, boss: true },
  victory: { pad: 0.9, bell: 0.7, lead: 0.6, arp: 0.4, tempo: 0.95, density: 0.5, bright: true },
  defeat:  { pad: 0.8, bell: 0.3, tempo: 0.75, density: 0.25, dark: true },
};

// ── State, for one render ───────────────────────────────────────────────────

let ctx = null, master = null, delay = null;
const bus = {};
let scene = 'map', act = 1;
let barIndex = 0;
let seed = 1;
let current = null;

const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const pick = (a) => a[(rnd() * a.length) | 0];
const mtof = (m) => 440 * 2 ** ((m - 69) / 12);

function harmony() {
  const a = ACTS[act] ?? ACTS[1];
  const sc = SCENES[scene] ?? SCENES.map;
  let { mode, prog } = a;
  if (sc.boss) ({ mode, prog } = BOSS[act] ?? BOSS[1]);
  if (sc.dark) { mode = 'minor'; prog = [0, 5, 3, 4]; }
  if (sc.bright) { mode = 'major'; prog = [0, 3, 4, 0]; }
  return { ...a, mode, prog, bpm: a.bpm * (sc.tempo ?? 1), density: sc.density ?? 0.5 };
}
// A scale degree (any integer) as a MIDI note.
function degree(h, d, octave = 0) {
  const sc = MODES[h.mode];
  const o = Math.floor(d / 7);
  return h.root + sc[((d % 7) + 7) % 7] + 12 * (o + octave);
}
const triad = (h, chord) => [chord, chord + 2, chord + 4].map((d) => degree(h, d));

// ── Instruments ─────────────────────────────────────────────────────────────

function env(g, t, a, peak, d, sustain = 0.0001, release = 0.05) {
  a = Math.max(a, 0.006);   // anything quicker reads as a click on a phone speaker
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustain), t + a + d);
  if (sustain > 0.0001) g.gain.exponentialRampToValueAtTime(0.0001, t + a + d + release);
}
function osc(type, f, t, end, out, detune = 0) {
  const o = ctx.createOscillator();
  o.type = type; o.frequency.setValueAtTime(f, t); o.detune.value = detune;
  o.connect(out); o.start(t); o.stop(end + 0.05);
  return o;
}
function lowpass(freq, q = 0.7) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq; f.Q.value = q; return f; }
let noiseBuf = null;
function noise(t, dur, out) {
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf; s.connect(out); s.start(t, Math.random() * 0.5, dur + 0.05);
}

const VOICES = {
  // Leads and arpeggios.
  pluck(t, m, dur, v, out) {
    const g = ctx.createGain(), f = lowpass(2600);
    f.frequency.setValueAtTime(3200, t); f.frequency.exponentialRampToValueAtTime(700, t + 0.25);
    osc('triangle', mtof(m), t, t + dur + 0.4, f); f.connect(g).connect(out);
    env(g, t, 0.005, 0.22 * v, 0.35);
  },
  square(t, m, dur, v, out) {
    const g = ctx.createGain(), f = lowpass(1500, 2);
    f.frequency.setValueAtTime(2200, t); f.frequency.exponentialRampToValueAtTime(500, t + 0.2);
    osc('square', mtof(m), t, t + dur + 0.3, f); f.connect(g).connect(out);
    env(g, t, 0.004, 0.09 * v, 0.25);
  },
  glass(t, m, dur, v, out) {
    const g = ctx.createGain();
    osc('sine', mtof(m), t, t + 0.9, g); osc('sine', mtof(m + 19), t, t + 0.5, g);
    g.connect(out); env(g, t, 0.003, 0.12 * v, 0.6);
  },
  flute(t, m, dur, v, out) {
    const g = ctx.createGain(), f = lowpass(2400);
    const o = osc('sine', mtof(m), t, t + dur + 0.3, f);
    osc('triangle', mtof(m), t, t + dur + 0.3, f, 4);
    const lfo = ctx.createOscillator(), lg = ctx.createGain();
    lfo.frequency.value = 5.2; lg.gain.value = mtof(m) * 0.006;
    lfo.connect(lg).connect(o.frequency); lfo.start(t + 0.15); lfo.stop(t + dur + 0.3);
    f.connect(g).connect(out);
    env(g, t, 0.06, 0.16 * v, dur * 0.8, 0.09 * v, 0.25);
  },
  marimba(t, m, dur, v, out) {
    const g = ctx.createGain();
    osc('sine', mtof(m), t, t + 0.6, g); osc('sine', mtof(m) * 4, t, t + 0.08, g);
    g.connect(out); env(g, t, 0.002, 0.25 * v, 0.45);
  },
  bell(t, m, dur, v, out) {
    // Two-operator FM: a struck, inharmonic shimmer.
    const g = ctx.createGain(), mod = ctx.createGain();
    const c = osc('sine', mtof(m), t, t + 2, g);
    const mo = osc('sine', mtof(m) * 3.5, t, t + 2, mod);
    mod.gain.setValueAtTime(mtof(m) * 2.2, t); mod.gain.exponentialRampToValueAtTime(1, t + 1.2);
    mod.connect(c.frequency); void mo;
    g.connect(out); env(g, t, 0.002, 0.13 * v, 1.6);
  },
  // Bass.
  round(t, m, dur, v, out) {
    const g = ctx.createGain(), f = lowpass(500);
    osc('triangle', mtof(m), t, t + dur, f); osc('sine', mtof(m - 12), t, t + dur, f);
    f.connect(g).connect(out); env(g, t, 0.01, 0.3 * v, dur * 0.7, 0.12 * v, 0.08);
  },
  saw(t, m, dur, v, out) {
    const g = ctx.createGain(), f = lowpass(380, 3);
    f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(260, t + 0.2);
    osc('sawtooth', mtof(m), t, t + dur, f);
    f.connect(g).connect(out); env(g, t, 0.006, 0.2 * v, dur * 0.6, 0.08 * v, 0.06);
  },
  deep(t, m, dur, v, out) {
    const g = ctx.createGain(), f = lowpass(320);
    osc('sine', mtof(m - 12), t, t + dur, f); osc('square', mtof(m - 12), t, t + dur, f, 3);
    f.connect(g).connect(out); env(g, t, 0.01, 0.38 * v, dur * 0.8, 0.15 * v, 0.1);
  },
  // Pads: a whole bar, slow in and out.
  soft(t, notes, dur, v, out) {
    const g = ctx.createGain(), f = lowpass(900);
    for (const m of notes) { osc('triangle', mtof(m), t, t + dur + 1, f, -6); osc('sine', mtof(m + 12), t, t + dur + 1, f, 5); }
    f.connect(g).connect(out); env(g, t, dur * 0.35, 0.05 * v, dur * 0.4, 0.04 * v, 0.9);
  },
  reed(t, notes, dur, v, out) {
    const g = ctx.createGain(), f = lowpass(700, 1.5);
    for (const m of notes) osc('square', mtof(m), t, t + dur + 1, f, (m % 3) * 4 - 4);
    f.connect(g).connect(out); env(g, t, dur * 0.3, 0.025 * v, dur * 0.4, 0.02 * v, 0.9);
  },
  sawpad(t, notes, dur, v, out) {
    const g = ctx.createGain(), f = lowpass(600, 1);
    f.frequency.setValueAtTime(400, t); f.frequency.linearRampToValueAtTime(1300, t + dur * 0.6); f.frequency.linearRampToValueAtTime(500, t + dur + 1);
    for (const m of notes) { osc('sawtooth', mtof(m), t, t + dur + 1, f, -8); osc('sawtooth', mtof(m), t, t + dur + 1, f, 8); }
    f.connect(g).connect(out); env(g, t, dur * 0.3, 0.03 * v, dur * 0.4, 0.025 * v, 0.9);
  },
  // Drums.
  kick(t, v, out) {
    const g = ctx.createGain();
    const o = osc('sine', 150, t, t + 0.3, g);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
    g.connect(out); env(g, t, 0.002, 0.6 * v, 0.25);
  },
  hat(t, v, out) {
    const g = ctx.createGain(), f = ctx.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = 7000;
    noise(t, 0.05, f); f.connect(g).connect(out); env(g, t, 0.001, 0.12 * v, 0.04);
  },
  snare(t, v, out) {
    const g = ctx.createGain(), f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.7;
    noise(t, 0.18, f); f.connect(g).connect(out); env(g, t, 0.001, 0.22 * v, 0.15);
    const tg = ctx.createGain(); osc('triangle', 190, t, t + 0.1, tg); tg.connect(out); env(tg, t, 0.001, 0.15 * v, 0.08);
  },
};
const PAD = { soft: 'soft', reed: 'reed', saw: 'sawpad' };

// ── The composer: one bar at a time ─────────────────────────────────────────

let lastLead = 7;
function composeBar(t0) {
  const h = current = harmony();
  const beat = 60 / h.bpm, step = beat / 4, bar = beat * 4;
  // The echo follows the tempo: a dotted eighth.
  if (Math.abs(delay.delayTime.value - beat * 0.75) > 0.002) delay.delayTime.setTargetAtTime(beat * 0.75, t0, 0.08);
  const chord = h.prog[barIndex % h.prog.length];
  const notes = triad(h, chord);
  const dens = h.density;
  const L = (k) => bus[k];
  // Only layers the scene plays get notes: silent ones would only cost the phone.
  const sc = SCENES[scene] ?? SCENES.map;
  const on = (k) => (sc[k] ?? 0) > 0;

  // Pad: the chord, held.
  if (on('pad')) VOICES[PAD[h.pad]](t0, notes.map((m) => m - 12), bar, 1, L('pad'));
  // Bass: root on the one, then a figure that grows with the density.
  const root = degree(h, chord, -2);
  const fig = dens > 0.7 ? [0, 3, 6, 8, 10, 12, 14] : dens > 0.5 ? [0, 6, 8, 12] : [0, 8];
  for (const s of on('bass') ? fig : []) {
    const m = s === 0 || rnd() < 0.6 ? root : rnd() < 0.5 ? root + 7 : root + 12;
    VOICES[h.bass](t0 + s * step, m, step * (s === 0 ? 4 : 2), s === 0 ? 1 : 0.7, L('bass'));
  }
  // Arpeggio: the chord broken in sixteenths or eighths, a pattern per bar.
  const every = dens > 0.6 ? 1 : 2;
  const shape = pick([[0, 1, 2, 1], [0, 1, 2, 3], [2, 1, 0, 1], [0, 2, 1, 3]]);
  const arpNotes = [...notes, notes[0] + 12];
  for (let s = 0; s < 16 && on('arp'); s += every) {
    if (rnd() > 0.55 + dens * 0.45) continue;
    const m = arpNotes[shape[(s / every) % shape.length]] + (h.arp === 'glass' ? 12 : 0);
    VOICES[h.arp](t0 + s * step, m, step * every, s % 4 === 0 ? 1 : 0.7, L('arp'));
  }
  // Lead: a random walk on the scale that leans toward chord tones.
  let s = rnd() < 0.5 ? 0 : 2;
  while (s < 16 && on('lead')) {
    const len = pick(dens > 0.6 ? [2, 2, 4, 1, 3] : [4, 4, 2, 6, 8]);
    if (rnd() < 0.25 + (1 - dens) * 0.3) { s += len; continue; }   // a rest
    lastLead += pick([-2, -1, -1, 0, 1, 1, 2, 3, -3]);
    lastLead = Math.max(2, Math.min(12, lastLead));
    if (s % 4 === 0) {   // on the beat, settle onto the chord
      const tones = [chord, chord + 2, chord + 4, chord + 7].map((d) => ((d % 7) + 7) % 7);
      if (!tones.includes(((lastLead % 7) + 7) % 7)) lastLead += 1;
    }
    VOICES[h.lead](t0 + s * step, degree(h, lastLead), step * len, 0.9, L('lead'));
    s += len;
  }
  // Bells: now and then, a high chord tone that rings over the bar.
  for (const at of [0, 8]) if (on('bell') && rnd() < 0.55) VOICES.bell(t0 + at * step, pick(notes) + 12, bar, 0.8, L('bell'));
  // Drums.
  for (let k = 0; k < 16; k++) {
    const t = t0 + k * step;
    const four = dens > 0.8;
    if (on('kick') && (k % (four ? 4 : 8) === 0 || (!four && k === 10 && rnd() < 0.5))) VOICES.kick(t, 1, L('kick'));
    if (on('hat') && (k % 2 === 0 || (dens > 0.7 && rnd() < 0.3))) VOICES.hat(t, k % 4 === 2 ? 1 : 0.55, L('hat'));
    if (on('snare') && (k === 4 || k === 12 || (k === 15 && rnd() < 0.3))) VOICES.snare(t, k === 15 ? 0.5 : 1, L('snare'));
  }
  barIndex++;
  return bar;
}

// Events: a short phrase over the music, from the next beat.
const PHRASES = {
  win: [0, 2, 4, 7], lose: [4, 3, 1, 0], door: [0, 4, 7, 11, 14], stronger: [0, -1, -3, -5], heal: [2, 4, 6],
};
function playEvent(kind, t) {
  const h = current ?? harmony();
  const beat = 60 / h.bpm;
  const ph = PHRASES[kind];
  if (!ph) return;
  const voice = kind === 'lose' || kind === 'stronger' ? 'marimba' : 'bell';
  ph.forEach((d, i) => VOICES[voice](t + i * beat * 0.5, degree(h, d, 1), beat, 1, bus.event));
  if (kind === 'win' || kind === 'door') VOICES.kick(t, 0.8, bus.event);
  if (kind === 'lose') VOICES.round(t, degree(h, 0, -2), beat * 3, 1, bus.event);
}

// ── Rendering ───────────────────────────────────────────────────────────────

const VOLUME = 0.32;
function build(c, levels) {
  ctx = c;
  master = ctx.createGain(); master.gain.value = VOLUME;
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp).connect(ctx.destination);
  delay = ctx.createDelay(2); delay.delayTime.value = 0.45;
  const fb = ctx.createGain(); fb.gain.value = 0.28;
  const wet = ctx.createGain(); wet.gain.value = 0.22;
  delay.connect(fb).connect(delay); delay.connect(wet).connect(master);
  for (const k of [...LAYERS, 'event']) {
    bus[k] = ctx.createGain(); bus[k].gain.value = levels[k] ?? 0;
    bus[k].connect(master);
    if (['lead', 'bell', 'arp', 'event'].includes(k)) bus[k].connect(delay);
  }
}
const seedOf = (a, name) => (a * 7919 + [...name].reduce((n, ch) => n * 31 + ch.charCodeAt(0), 7)) >>> 0;

export async function renderTrack(a, name, bars, sampleRate = 44100) {
  act = a; scene = name;
  const h = harmony();
  const bar = (60 / h.bpm) * 4;
  const loop = bar * bars;
  const c = new OfflineAudioContext(1, Math.ceil(sampleRate * (loop * 2 + 0.05)), sampleRate);
  build(c, SCENES[name]);
  delay.delayTime.value = (60 / h.bpm) * 0.75;
  for (let pass = 0; pass < 2; pass++) {
    seed = seedOf(a, name); barIndex = 0; lastLead = 7;
    for (let k = 0; k < bars; k++) composeBar(0.02 + pass * loop + k * bar);
  }
  const buf = await c.startRendering();
  const from = Math.round((0.02 + loop) * sampleRate);
  const data = buf.getChannelData(0).slice(from, from + Math.round(loop * sampleRate));
  return { data, bpm: h.bpm, bars, beat: 60 / h.bpm, seconds: loop };
}

export async function renderStinger(a, kind, sampleRate = 44100) {
  act = a; scene = 'map';
  current = harmony();
  const c = new OfflineAudioContext(1, Math.ceil(sampleRate * 3.2), sampleRate);
  build(c, {});
  bus.event.gain.value = 0.9;
  delay.delayTime.value = (60 / current.bpm) * 0.75;
  playEvent(kind, 0.02);
  const buf = await c.startRendering();
  return { data: buf.getChannelData(0).slice(Math.round(0.02 * sampleRate)) };
}
