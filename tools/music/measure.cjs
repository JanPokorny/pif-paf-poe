// Measures, for each music/*.mp3, where its first sample lands when a browser
// decodes it (an MP3 encoder pads the start), and writes it into
// music/tracks.json, so the game loops from exactly there. Run after
// tools/music/build.py, with the dev server up on :8080. A loop's offset is
// that plus the padding build.py keeps before it.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

(async () => {
  const dir = path.resolve(__dirname, '../../music');
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'tracks.json'), 'utf8'));
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  await page.goto('http://localhost:8080/manifest.webmanifest');
  for (const [group, entries] of Object.entries(manifest)) {
    for (const id of Object.keys(entries)) {
      const file = path.join(dir, `${id}.mp3`);
      // The reference: ffmpeg's decode, which honours the encoder's gapless info.
      const ref = execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', file, '-t', '1', '-ac', '1', '-f', 's16le', '-ar', '44100', '-']);
      const offset = await page.evaluate(async ([mp3b64, refb64]) => {
        const bytes = Uint8Array.from(atob(mp3b64), (c) => c.charCodeAt(0));
        const ac = new OfflineAudioContext(1, 1, 44100);
        const buf = await ac.decodeAudioData(bytes.buffer);
        const L = buf.getChannelData(0), R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L;
        const ref = new Int16Array(Uint8Array.from(atob(refb64), (c) => c.charCodeAt(0)).buffer);
        let best = 0, bestErr = Infinity;
        for (let o = 0; o < 3000; o++) {
          let err = 0;
          for (let k = 3000; k < 20000; k += 4) { const d = (L[k + o] + R[k + o]) / 2 - ref[k] / 32767; err += d * d; }
          if (err < bestErr) { bestErr = err; best = o; }
        }
        return best;
      }, [fs.readFileSync(file).toString('base64'), ref.toString('base64')]);
      entries[id].offset = +((entries[id].pad ?? 0) + offset / 44100).toFixed(5);
      console.log(`${id}: ${offset} samples`);
    }
  }
  fs.writeFileSync(path.join(dir, 'tracks.json'), JSON.stringify(manifest, null, 1));
  await browser.close();
})();
