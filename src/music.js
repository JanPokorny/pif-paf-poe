// The music: recordings rendered ahead of time from tools/music/score.py (by
// tools/music/build.py), looped and crossfaded here. Nothing is synthesised
// while the game runs, so a busy page can neither push the music out of time
// nor make it crackle.
//
//   setScene(name, act)   name: title, map, duel, elite, boss, calm, event,
//                         victory, defeat. The tracks crossfade.
//   musicEvent(kind)      win, lose, door, stronger, heal: a short phrase in
//                         the act's key, on the next beat of the track.

import { audioContext, setMusicActive } from './sound.js';

let enabled = true;
try { enabled = localStorage.getItem('ppp-music') !== 'off'; } catch { /* private mode */ }
export const musicOn = () => enabled;
export function setMusic(on) {
  enabled = on;
  try { localStorage.setItem('ppp-music', on ? 'on' : 'off'); } catch { /* ignore */ }
  if (on) start(); else stop();
}

// Each act has four loops; a scene plays one of them.
const TRACK = { title: 'title', victory: 'victory', defeat: 'defeat', map: 'map', calm: 'calm', event: 'calm', duel: 'duel', elite: 'duel', boss: 'boss' };
const trackOf = (scene, act) => {
  const t = TRACK[scene] ?? 'map';
  return ['title', 'victory', 'defeat'].includes(t) ? t : `${t}-${Math.min(3, Math.max(1, act))}`;
};
const FADE = 1.6;      // seconds of crossfade between tracks
const DUCK = 0.5;      // the band's level under a stinger

let ctx = null, band = null, stings = null;
let manifest = null;
const buffers = new Map();   // file id -> Promise<AudioBuffer>
let playing = null;          // { id, src, gain, t0, info }: t0 is when the loop's first beat sounded
let scene = 'title', act = 0;
let running = false, switching = 0;

function load(id) {
  if (!buffers.has(id)) {
    buffers.set(id, fetch(`music/${id}.mp3`).then((r) => r.arrayBuffer()).then((b) => ctx.decodeAudioData(b)).catch(() => {
      buffers.delete(id);   // try again next time
      return null;
    }));
  }
  return buffers.get(id);
}

async function build() {
  ctx = audioContext();
  if (!ctx) return false;
  band = ctx.createGain(); band.connect(ctx.destination);
  stings = ctx.createGain(); stings.connect(ctx.destination);
  try { manifest = await (await fetch('music/tracks.json')).json(); } catch { manifest = null; }
  return !!manifest;
}

// Fade the current track out and the scene's in.
async function play() {
  if (!running || !manifest) return;
  const id = trackOf(scene, act);
  if (playing?.id === id) return;
  const mine = ++switching;
  const buf = await load(id);
  if (!buf || mine !== switching || !running) return;
  const info = manifest.tracks[id];
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  // Past the padding before the loop, and exactly one loop long.
  src.loopStart = info.offset;
  src.loopEnd = info.offset + info.seconds;
  const gain = ctx.createGain();
  src.connect(gain).connect(band);
  const now = ctx.currentTime + 0.05;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(1, now + FADE);
  src.start(now, info.offset);
  if (playing) {
    const old = playing;
    old.gain.gain.cancelScheduledValues(now);
    old.gain.gain.setValueAtTime(old.gain.gain.value, now);
    old.gain.gain.linearRampToValueAtTime(0, now + FADE);
    old.src.stop(now + FADE + 0.1);
  }
  playing = { id, src, gain, t0: now, info };
  // The rest of the act's tracks, ready for the next change of scene.
  if (act >= 1) for (const s of ['map', 'calm', 'duel', 'boss']) load(trackOf(s, act));
}

let building = null;
async function start() {
  if (!enabled) return;
  if (!ctx) {
    building ??= build();   // taps come fast: build once
    if (!(await building)) { building = null; ctx = null; return; }
  }
  if (ctx.state === 'suspended') ctx.resume();
  running = true;
  setMusicActive(true);
  band.gain.cancelScheduledValues(ctx.currentTime);
  band.gain.setValueAtTime(1, ctx.currentTime);
  play();
}
function stop() {
  running = false;
  switching++;
  setMusicActive(false);
  if (!ctx || !playing) return;
  const now = ctx.currentTime;
  playing.gain.gain.cancelScheduledValues(now);
  playing.gain.gain.setValueAtTime(playing.gain.gain.value, now);
  playing.gain.gain.linearRampToValueAtTime(0, now + 0.4);
  playing.src.stop(now + 0.5);
  playing = null;
}

export function setScene(name, a = act) {
  if (name === scene && a === act) return;
  scene = name; act = a;
  play();
}

// A phrase over the music, from the track's next beat; the band ducks under it.
export async function musicEvent(kind) {
  if (!enabled || !running || !manifest) return;
  const id = `${kind}-${Math.min(3, Math.max(1, act))}`;
  const info = manifest.stingers[id];
  if (!info) return;
  const buf = await load(id);
  if (!buf || !running) return;
  let t = ctx.currentTime + 0.06;
  if (playing) {
    const beat = playing.info.beat;
    t = playing.t0 + Math.ceil((t - playing.t0) / beat) * beat;
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(stings);
  src.start(t, info.offset);
  const g = band.gain;
  g.cancelScheduledValues(t - 0.1);
  g.setTargetAtTime(DUCK, t - 0.06, 0.04);
  g.setTargetAtTime(1, t + 1.6, 0.3);
}

// Browsers only let audio start from a tap -- on phones, from the lift of a
// finger, not the touch -- so every tap tries until the audio is running.
export function unlockMusic() {
  if (!enabled) return;
  if (!running) start();
  else if (ctx && ctx.state !== 'running') ctx.resume?.();
}

document.addEventListener('visibilitychange', () => {
  if (!ctx) return;
  if (document.visibilityState === 'hidden') ctx.suspend?.();
  else if (enabled || running) ctx.resume?.();
});
