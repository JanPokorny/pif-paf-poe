// Tiny synthesised sound effects. No files to load.

let ctx = null;
let enabled = true;
try { enabled = localStorage.getItem('ppp-sound') !== 'off'; } catch { /* private mode */ }

export const soundOn = () => enabled;
// The music shares the context; while it plays, it answers wins and losses
// itself, in its own key.
let musicActive = false;
export function setMusicActive(on) { musicActive = on; }
export function audioContext() {
  try {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    return ctx;
  } catch { return null; }
}
export function setSound(on) {
  enabled = on;
  try { localStorage.setItem('ppp-sound', on ? 'on' : 'off'); } catch { /* ignore */ }
}

function tone(freq, dur, { type = 'sine', gain = 0.12, at = 0, slide = 0 } = {}) {
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

// A short burst of filtered noise: a pencil stroke.
function scratch(at = 0, dur = 0.18) {
  const t = ctx.currentTime + at;
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (0.6 + 0.4 * Math.sin(i / 90));
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = 2400;
  f.Q.value = 0.8;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.09, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(ctx.destination);
  src.start(t);
}

const SOUNDS = {
  thud: () => { tone(90, 0.25, { gain: 0.25, slide: 0.5 }); scratch(0, 0.12); },
  scribbleX: () => { scratch(0, 0.16); scratch(0.3, 0.16); },
  scribbleO: () => scratch(1.4, 0.45),
  select: () => tone(660, 0.06, { type: 'triangle', gain: 0.06 }),
  place: () => { tone(220, 0.09, { type: 'triangle', gain: 0.16, slide: 0.6 }); tone(110, 0.08, { gain: 0.1 }); },
  move: () => tone(300, 0.16, { type: 'sawtooth', gain: 0.035, slide: 1.8 }),
  undo: () => tone(500, 0.1, { type: 'triangle', gain: 0.05, slide: 0.5 }),
  trick: () => { tone(880, 0.1, { type: 'square', gain: 0.04 }); tone(1320, 0.12, { type: 'square', gain: 0.03, at: 0.08 }); },
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, { type: 'triangle', gain: 0.1, at: i * 0.1 })),
  lose: () => [392, 330, 262].forEach((f, i) => tone(f, 0.3, { type: 'triangle', gain: 0.1, at: i * 0.15 })),
  coin: () => { tone(988, 0.06, { type: 'square', gain: 0.04 }); tone(1319, 0.12, { type: 'square', gain: 0.04, at: 0.06 }); },
  click: () => tone(440, 0.04, { type: 'triangle', gain: 0.04 }),
  heal: () => [440, 554, 659].forEach((f, i) => tone(f, 0.18, { gain: 0.07, at: i * 0.07 })),
};

const BUZZ = { place: 12, win: [30, 40, 30], lose: 80, trick: 20 };

export function sfx(name) {
  if (!enabled) return;
  try { if (BUZZ[name] && navigator.vibrate) navigator.vibrate(BUZZ[name]); } catch { /* no haptics */ }
  try {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    if (musicActive && (name === 'win' || name === 'lose')) return;
    SOUNDS[name]?.();
  } catch { /* no audio */ }
}
