"""Renders the music in tools/music/score.py to music/*.mp3.

Needs FluidSynth, the FluidR3 General MIDI SoundFont and ffmpeg
(apt-get install fluidsynth fluid-soundfont-gm ffmpeg) and mido (pip install
mido). Run from the repository root:

    python3 tools/music/build.py
    node tools/music/measure.cjs     # with the dev server up: the MP3 lead-ins

Each loop is written three times and the second pass kept, so the reverb of its end
rings into its start; levels are evened out by scene.
"""

import json
import os
import re
import subprocess
import sys
import tempfile
import wave
from array import array

sys.path.insert(0, os.path.dirname(__file__))
import score  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'music')
SF2 = '/usr/share/sounds/sf2/FluidR3_GM.sf2'
RATE = 44100
# How loud each kind of track sits (mean level, dBFS): calmer scenes quieter.
LEVEL = {'map': -21, 'calm': -24, 'duel': -20, 'boss': -19, 'title': -23, 'victory': -21, 'defeat': -24}


def run(*cmd):
    return subprocess.run(cmd, check=True, capture_output=True, text=True)


def render(piece, beats_total, wav):
    with tempfile.NamedTemporaryFile(suffix='.mid', delete=False) as f:
        mid = f.name
    piece.write(mid, beats_total)
    run('fluidsynth', '-ni', '-q', '-g', '0.6', '-r', str(RATE), '-F', wav, SF2, mid)
    os.unlink(mid)


def mean_db(wav, start=None, end=None):
    trim = f'atrim=start_sample={start}:end_sample={end},' if start is not None else ''
    r = subprocess.run(['ffmpeg', '-hide_banner', '-i', wav, '-af', f'{trim}volumedetect', '-f', 'null', '-'],
                       capture_output=True, text=True)
    mean = float(re.search(r'mean_volume: (-?[\d.]+) dB', r.stderr).group(1))
    peak = float(re.search(r'max_volume: (-?[\d.]+) dB', r.stderr).group(1))
    return mean, peak


FADE = round(0.05 * RATE)   # samples of blend at the seam
PAD = round(0.5 * RATE)     # samples kept either side of the loop, never played


def loop_wav(wav, out, start, end):
    """The loop [start, end) of a stereo render, its first FADE samples blended
    from what follows `end`, so the wrap from its end to its start is seamless.
    PAD samples either side go with it: an MP3 is inexact at its very edges, so
    the loop must not touch them."""
    with wave.open(wav) as w:
        ch, rate = w.getnchannels(), w.getframerate()
        data = array('h', w.readframes(w.getnframes()))
    seg = data[(start - PAD) * ch:(end + PAD) * ch]
    after = data[end * ch:(end + FADE) * ch]
    for k in range(min(FADE, len(after) // ch)):
        a = k / FADE
        for c in range(ch):
            i = k * ch + c
            j = PAD * ch + i
            seg[j] = int(after[i] * (1 - a) + seg[j] * a)
    with wave.open(out, 'wb') as w:
        w.setnchannels(ch); w.setsampwidth(2); w.setframerate(rate)
        w.writeframes(seg.tobytes())


def encode(wav, mp3, gain_db):
    run('ffmpeg', '-hide_banner', '-y', '-i', wav, '-af', f'volume={gain_db:.2f}dB,alimiter=limit=0.95:latency=1',
        '-ac', '2', '-c:a', 'libmp3lame', '-b:a', '96k', mp3)


def main():
    os.makedirs(OUT, exist_ok=True)
    manifest = {'tracks': {}, 'stingers': {}}
    jobs = [('title', lambda: score.special('title'), 'title'),
            ('victory', lambda: score.special('victory'), 'victory'),
            ('defeat', lambda: score.special('defeat'), 'defeat')]
    for act in (1, 2, 3):
        for name in ('map', 'calm', 'duel', 'boss'):
            jobs.append((f'{name}-{act}', (lambda a=act, n=name: score.scene(a, n)), name))
    tmp = tempfile.mkdtemp()
    for tid, make, kind in jobs:
        piece, L = make()
        wav = os.path.join(tmp, f'{tid}.wav')
        render(piece, 3 * L + 8, wav)   # the second of three passes is the loop
        beat = 60 / piece.bpm
        start, end = round(L * beat * RATE), round(2 * L * beat * RATE)
        cut = os.path.join(tmp, f'{tid}-loop.wav')
        loop_wav(wav, cut, start, end)
        mean, peak = mean_db(cut)
        gain = LEVEL[kind] - mean
        encode(cut, os.path.join(OUT, f'{tid}.mp3'), gain)
        manifest['tracks'][tid] = {'bpm': piece.bpm, 'beat': round(beat, 5), 'seconds': round((end - start) / RATE, 5), 'pad': round(PAD / RATE, 5), 'offset': round(PAD / RATE, 5)}
        print(f'{tid}: {L * beat:.1f}s at {piece.bpm} bpm, level {mean:.1f} → {LEVEL[kind]} dB')
    for act in (1, 2, 3):
        for kind in ('win', 'lose', 'door', 'stronger', 'heal'):
            piece, _ = score.stinger(act, kind)
            wav = os.path.join(tmp, f'{kind}-{act}.wav')
            render(piece, 8, wav)
            mean, peak = mean_db(wav)
            end = round(3.4 * RATE)
            run('ffmpeg', '-hide_banner', '-y', '-i', wav, '-af',
                f'atrim=end_sample={end},afade=t=out:st=2.9:d=0.5,volume={-4 - peak:.2f}dB',
                '-ac', '2', '-c:a', 'libmp3lame', '-b:a', '96k', os.path.join(OUT, f'{kind}-{act}.mp3'))
            manifest['stingers'][f'{kind}-{act}'] = {'offset': 0}
    with open(os.path.join(OUT, 'tracks.json'), 'w') as f:
        json.dump(manifest, f, indent=1)
    print('done; now node tools/music/measure.cjs')


if __name__ == '__main__':
    main()
