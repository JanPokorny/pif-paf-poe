// Renders the soundtrack to music/*.mp3 and music/tracks.json, offline, from
// tools/music/compose.js. Run from the repository root with the dev server up
// (python3 -m http.server 8080), after `npm install --prefix tools/music`:
//
//   node tools/render-music.cjs
//
// Each act has four loops (map, calm, duel, boss); title, victory and defeat
// one each; each act a stinger per music event. The game loops and crossfades
// them (src/music.js).
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const path = require('path');

const BARS = 16;
const TRACKS = [['title', 0, 'title'], ['victory', 1, 'victory'], ['defeat', 1, 'defeat']];
for (const a of [1, 2, 3]) for (const s of ['map', 'calm', 'duel', 'boss']) TRACKS.push([`${s}-${a}`, a, s]);
const STINGERS = ['win', 'lose', 'door', 'stronger', 'heal'];

(async () => {
  const { Mp3Encoder } = await import(path.resolve(__dirname, 'music/node_modules/@breezystack/lamejs/dist/lamejs.js'));
  const encode = (b64) => {
    const pcm = new Int16Array(Buffer.from(b64, 'base64').buffer.slice(0));
    const enc = new Mp3Encoder(1, 44100, 64);
    const parts = [];
    for (let k = 0; k < pcm.length; k += 1152) { const o = enc.encodeBuffer(pcm.subarray(k, k + 1152)); if (o.length) parts.push(Buffer.from(o)); }
    const end = enc.flush(); if (end.length) parts.push(Buffer.from(end));
    return Buffer.concat(parts);
  };
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('page:', e.message));
  await page.goto('http://localhost:8080/tools/music/render.html');
  await page.waitForFunction(() => window.ready);
  const out = path.resolve(__dirname, '../music');
  fs.mkdirSync(out, { recursive: true });
  const manifest = { tracks: {}, stingers: {} };
  for (const [id, act, scene] of TRACKS) {
    const r = await page.evaluate(([a, s, b]) => window.track(a, s, b), [act, scene, BARS]);
    const mp3 = encode(r.data);
    const { offset } = await page.evaluate(([m, p]) => window.offsetOf(m, p), [mp3.toString('base64'), r.data]);
    fs.writeFileSync(path.join(out, `${id}.mp3`), mp3);
    manifest.tracks[id] = { bpm: +r.bpm.toFixed(3), beat: +r.beat.toFixed(5), seconds: +r.seconds.toFixed(5), offset: +(offset / 44100).toFixed(5) };
    console.log(`${id}: ${r.seconds.toFixed(1)}s, ${(mp3.length / 1024).toFixed(0)} KB, peak ${r.peak.toFixed(2)}, offset ${offset}`);
  }
  for (const a of [1, 2, 3]) for (const kind of STINGERS) {
    const r = await page.evaluate(([x, k]) => window.stinger(x, k), [a, kind]);
    const mp3 = encode(r.data);
    const { offset } = await page.evaluate(([m, p]) => window.offsetOf(m, p), [mp3.toString('base64'), r.data]);
    const id = `${kind}-${a}`;
    fs.writeFileSync(path.join(out, `${id}.mp3`), mp3);
    manifest.stingers[id] = { offset: +(offset / 44100).toFixed(5) };
    console.log(`${id}: ${(mp3.length / 1024).toFixed(0)} KB, offset ${offset}`);
  }
  fs.writeFileSync(path.join(out, 'tracks.json'), JSON.stringify(manifest, null, 1));
  await browser.close();
})();
