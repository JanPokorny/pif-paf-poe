"""The game's music, as MIDI: one hand-written theme per act, arranged for
each scene, and a short phrase per music event.

tools/music/build.py renders these with FluidSynth and a General MIDI
SoundFont (FluidR3_GM) into the loops in music/.

Themes are written in scale degrees, so the boss can play its act's theme in a
darker mode: '3' is the third of the scale in the melody's octave, '6-' a
sixth an octave down, '1+' the tonic an octave up, '7#' a raised seventh,
'r' a rest. Durations are in beats.
"""

import random
import mido

MODES = {
    'major':    [0, 2, 4, 5, 7, 9, 11],
    'dorian':   [0, 2, 3, 5, 7, 9, 10],
    'minor':    [0, 2, 3, 5, 7, 8, 10],
    'phrygian': [0, 1, 3, 5, 7, 8, 10],
}

# General MIDI programs (0-based).
P = dict(piano=0, celesta=8, glock=9, musicbox=10, vibes=11, marimba=12, xylo=13,
         nylon=24, bass=32, violin=40, cello=42, contrabass=43, tremolo=44, pizz=45, harp=46,
         timpani=47, strings=48, slowstrings=49, choir=52, trumpet=56, trombone=57, tuba=58,
         horn=60, brass=61, oboe=68, bassoon=70, clarinet=71, piccolo=72, flute=73, recorder=74,
         warmpad=89)

# ── The themes ──────────────────────────────────────────────────────────────
# Sixteen bars each: an A phrase and its answer B. Chords are scale degrees,
# one per bar or two (half a bar each).

ACTS = {
    1: dict(  # The Meadow: C major, a flute over harp and strings.
        tonic=60, mode='major', bpm=100, boss_mode='minor',
        lead='flute', lead2='piccolo', calm='celesta', arp='harp', pad='slowstrings', bass='bass',
        boss_lead='horn', perc='light',
        chords=[[1], [6], [4], [5], [1], [6], [2, 5], [1],
                [4], [1], [2], [5], [6], [4], [2, 5], [1]],
        melody="""
            3:1 5:1 6:.5 5:.5 3:1 | 1:1.5 2:.5 3:1 1:1 | 4:1 6:1 1+:1 6:1 | 5:2 2:1 r:1 |
            3:1 5:1 6:.5 5:.5 3:1 | 1+:1.5 7:.5 6:1 3:1 | 4:1 6:.5 4:.5 2:1 7-:1 | 1:3 r:1 |
            6:.5 5:.5 4:1 1:1 4:1 | 5:.5 4:.5 3:1 1:2 | 2:.5 3:.5 4:1 6:1 2+:1 | 7:1 6:.5 5:.5 2:2 |
            1+:1 7:.5 6:.5 3:1 6:1 | 6:1 5:.5 4:.5 1:2 | 2:1 4:1 7-:1 2:1 | 1:2 r:2
        """),
    2: dict(  # The Quarry: D dorian, clarinet and marimba over bassoon.
        tonic=62, mode='dorian', bpm=96, boss_mode='phrygian',
        lead='clarinet', lead2='marimba', calm='vibes', arp='marimba', pad='strings', bass='bassoon',
        boss_lead='trombone', perc='wood',
        chords=[[1], [7], [4], [1], [1], [7], [4], [1],
                [3], [7], [4], [5], [3], [4], [7, 5], [1]],
        melody="""
            1:.5 3:.5 5:1 4:.5 3:.5 1:1 | 7-:1 2:1 4:.5 3:.5 2:1 | 4:.5 5:.5 6:1 5:1 4:1 | 3:1.5 2:.5 1:2 |
            5:.5 6:.5 1+:1 7:.5 6:.5 5:1 | 4:1 5:.5 4:.5 2:2 | 6:1 5:1 4:.5 3:.5 2:1 | 1:3 r:1 |
            3:.5 5:.5 7:1 5:1 3:1 | 2:1 4:.5 2:.5 7-:2 | 4:.5 6:.5 1+:1 6:.5 5:.5 4:1 | 5:1.5 4:.5 2:2 |
            3:1 5:1 6:.5 5:.5 3:1 | 4:1 3:.5 2:.5 1:2 | 2:1 4:1 5:.5 4:.5 2:1 | 1:2 r:2
        """),
    3: dict(  # The Summit: A minor, an oboe and a horn over strings and timpani.
        tonic=57, mode='minor', bpm=104, boss_mode='phrygian',
        lead='oboe', lead2='horn', calm='harp', arp='harp', pad='tremolo', bass='contrabass',
        boss_lead='brass', perc='timpani',
        chords=[[1], [6], [3], [7], [1], [4], [5], [1],
                [6], [7], [3], [6], [4], [1], [4, 5], [1]],
        melody="""
            1:2 5:1 4:.5 3:.5 | 3:1 4:1 5:2 | 3:1 2:1 1:1 7-:1 | 2:3 r:1 |
            1:1 5:1 1+:1.5 7:.5 | 6:1 5:.5 4:.5 5:2 | 4:1 3:1 2:1 7#-:1 | 1:3 r:1 |
            3:1 4:.5 5:.5 6:1 5:1 | 4:1 5:.5 4:.5 2:2 | 5:1 6:.5 5:.5 3:1 5:1 | 6:2 3:2 |
            4:1 6:1 1+:1 6:1 | 5:1.5 4:.5 3:2 | 2:1 4:1 3:1 7#-:1 | 1:2 r:2
        """),
}


def parse_melody(text):
    """'3:1 5:.5 r:1 | …' → [(degree, octave, accidental, beats) or (None, 0, 0, beats)]."""
    out = []
    for tok in text.replace('|', ' ').split():
        d, dur = tok.split(':')
        if d == 'r':
            out.append((None, 0, 0, float(dur)))
            continue
        octave = d.count('+') - d.count('-')
        acc = d.count('#') - d.count('b')
        deg = int(''.join(ch for ch in d if ch.isdigit()))
        out.append((deg, octave, acc, float(dur)))
    return out


def pitch(tonic, mode, deg, octave=0, acc=0):
    """A scale degree (1-based, any integer) as a MIDI note."""
    sc = MODES[mode]
    i = deg - 1
    return tonic + sc[i % 7] + 12 * (i // 7 + octave) + acc


def triad(tonic, mode, deg, octave=0):
    return [pitch(tonic, mode, deg + k, octave) for k in (0, 2, 4)]


# ── Writing notes ───────────────────────────────────────────────────────────

class Piece:
    """Notes in beats, on channels with their instruments; written to MIDI."""

    def __init__(self, bpm, seed):
        self.bpm = bpm
        self.notes = []       # (start, dur, ch, pitch, vel)
        self.channels = {}    # ch -> (program, volume, pan, reverb)
        self.rng = random.Random(seed)

    def channel(self, ch, program, volume=100, pan=64, reverb=50):
        self.channels[ch] = (P[program] if isinstance(program, str) else program, volume, pan, reverb)

    def note(self, start, dur, ch, p, vel, human=True):
        if human:
            vel += self.rng.randint(-6, 6)
            start += self.rng.uniform(0, 0.012) if start > 0 else 0
        self.notes.append((start, dur, ch, int(p), max(1, min(127, int(vel)))))

    def write(self, path, total_beats):
        mid = mido.MidiFile(ticks_per_beat=480)
        tr = mido.MidiTrack()
        mid.tracks.append(tr)
        tr.append(mido.MetaMessage('set_tempo', tempo=mido.bpm2tempo(self.bpm), time=0))
        for ch, (prog, vol, pan, rev) in sorted(self.channels.items()):
            if ch != 9:
                tr.append(mido.Message('program_change', channel=ch, program=prog, time=0))
            tr.append(mido.Message('control_change', channel=ch, control=7, value=vol, time=0))
            tr.append(mido.Message('control_change', channel=ch, control=10, value=pan, time=0))
            tr.append(mido.Message('control_change', channel=ch, control=91, value=rev, time=0))
        events = []
        for start, dur, ch, p, vel in self.notes:
            on = round(start * 480)
            off = max(on + 1, round((start + dur) * 480) - 6)
            events.append((on, 1, mido.Message('note_on', channel=ch, note=p, velocity=vel)))
            events.append((off, 0, mido.Message('note_off', channel=ch, note=p, velocity=0)))
        events.sort(key=lambda e: (e[0], e[1]))
        t = 0
        for at, _, msg in events:
            tr.append(msg.copy(time=at - t))
            t = at
        end = round(total_beats * 480)
        tr.append(mido.MetaMessage('end_of_track', time=max(0, end - t)))
        mid.save(path)


def bar_chords(spec, bar):
    """The chord degrees of a bar, as (beat offset, length, degree)."""
    cs = spec['chords'][bar % len(spec['chords'])]
    if len(cs) == 1:
        return [(0, 4, cs[0])]
    return [(0, 2, cs[0]), (2, 2, cs[1])]


# ── Layers ──────────────────────────────────────────────────────────────────

def melody(pc, spec, mode, ch, t0, octave=0, vel=88, bars=None, only=None, staccato=1.0):
    """The theme. `only`: the bars to play (others rest)."""
    t = 0
    for deg, octv, acc, dur in parse_melody(spec['melody']):
        bar = int(t // 4)
        if deg is not None and (only is None or bar in only) and (bars is None or bar < bars):
            p = pitch(spec['tonic'] + 12, mode, deg, octv + octave, acc)
            accent = 8 if t % 4 == 0 else 0
            pc.note(t0 + t, dur * staccato, ch, p, vel + accent)
        t += dur


def arpeggio(pc, spec, mode, ch, t0, bars, step=0.5, shape=(0, 1, 2, 1), octave=-1, vel=58):
    for b in range(bars):
        for off, length, deg in bar_chords(spec, b):
            tones = triad(spec['tonic'], mode, deg, octave)
            tones = tones + [tones[0] + 12]
            k = 0
            t = 0.0
            while t < length - 1e-6:
                p = tones[shape[k % len(shape)]]
                pc.note(t0 + b * 4 + off + t, step * 1.6, ch, p, vel + (8 if t == 0 else 0))
                t += step
                k += 1


def pad(pc, spec, mode, ch, t0, bars, octave=-1, vel=46):
    for b in range(bars):
        for off, length, deg in bar_chords(spec, b):
            for p in triad(spec['tonic'], mode, deg, octave):
                pc.note(t0 + b * 4 + off, length, ch, p, vel, human=False)


def bassline(pc, spec, mode, ch, t0, bars, style='half', vel=78):
    for b in range(bars):
        for off, length, deg in bar_chords(spec, b):
            root = pitch(spec['tonic'] - 24, mode, deg)
            fifth = pitch(spec['tonic'] - 24, mode, deg + 4)
            if style == 'whole':
                pc.note(t0 + b * 4 + off, length, ch, root, vel)
            elif style == 'half':
                for k in range(int(length // 2)):
                    pc.note(t0 + b * 4 + off + 2 * k, 1.9, ch, root if k % 2 == 0 else fifth, vel)
            elif style == 'walk':
                for k in range(int(length)):
                    pc.note(t0 + b * 4 + off + k, 0.9, ch, [root, root, fifth, root + 12][k % 4], vel)
            elif style == 'drive':
                for k in range(int(length * 2)):
                    pc.note(t0 + b * 4 + off + k * 0.5, 0.45, ch, root if k % 4 != 3 else fifth, vel - (0 if k % 2 == 0 else 10))


def ostinato(pc, spec, mode, ch, t0, bars, octave=-1, vel=62, step=0.5):
    """Plucked eighths on the chord: root, fifth, octave, fifth."""
    for b in range(bars):
        for off, length, deg in bar_chords(spec, b):
            r = pitch(spec['tonic'], mode, deg, octave)
            f = pitch(spec['tonic'], mode, deg + 4, octave)
            seq = [r, f, r + 12, f]
            for k in range(int(length / step)):
                pc.note(t0 + b * 4 + off + k * step, step * 0.9, ch, seq[k % 4], vel + (10 if k % 4 == 0 else 0))


DRUMS = dict(kick=36, snare=38, rim=37, hat=42, openhat=46, shaker=70, cabasa=69, tamb=54,
             wood_hi=76, wood_lo=77, claves=75, tom_lo=45, tom_mid=47, tom_hi=50, crash=49, ride=51, triangle=81)


def drums(pc, t0, bars, kind, vel=60):
    d = DRUMS
    for b in range(bars):
        t = t0 + b * 4
        if kind == 'light':      # shaker eighths, a woodblock on the off beats
            for k in range(8):
                pc.note(t + k * 0.5, 0.2, 9, d['shaker'], vel - 18 + (8 if k % 2 == 0 else 0))
            for k in (1, 3):
                pc.note(t + k, 0.2, 9, d['wood_hi'], vel - 10)
        elif kind == 'wood':     # claves and low woodblock, a soft kick
            for k, inst in ((0, 'kick'), (1.5, 'claves'), (2, 'wood_lo'), (3, 'claves'), (3.5, 'claves')):
                pc.note(t + k, 0.2, 9, d[inst], vel - (14 if inst == 'kick' else 8))
        elif kind == 'drive':    # duels: kick, snare on two and four, hats
            for k in range(8):
                pc.note(t + k * 0.5, 0.2, 9, d['hat'], vel - 16 + (10 if k % 2 == 0 else 0))
            for k in (0, 2.5):
                pc.note(t + k, 0.3, 9, d['kick'], vel + 6)
            for k in (1, 3):
                pc.note(t + k, 0.3, 9, d['snare'], vel - 4)
        elif kind == 'boss':     # toms and kick, heavier
            for k in (0, 1.5, 2, 3.5):
                pc.note(t + k, 0.3, 9, d['kick'], vel + 10)
            for k, inst in ((1, 'tom_mid'), (2.5, 'tom_lo'), (3, 'snare'), (3.75, 'tom_hi')):
                pc.note(t + k, 0.3, 9, d[inst], vel)
            if b % 4 == 0:
                pc.note(t, 1.5, 9, d['crash'], vel - 6)


def timpani(pc, spec, mode, ch, t0, bars, vel=80, roll_end=True):
    for b in range(bars):
        deg = bar_chords(spec, b)[0][2]
        root = pitch(spec['tonic'] - 24, mode, deg)
        pc.note(t0 + b * 4, 1, ch, root, vel)
        pc.note(t0 + b * 4 + 2, 1, ch, root, vel - 14)
        if roll_end and b % 4 == 3:
            for k in range(6):
                pc.note(t0 + b * 4 + 3 + k / 6, 1 / 6, ch, root, vel - 20 + k * 4)


# ── Scenes ──────────────────────────────────────────────────────────────────
# Each scene writes its loop three times: the second pass is the loop kept
# (with the first pass's echoes ringing into it), and the third's start is
# blended into it, so the loop's end flows on without a click.
# Returns (piece, beats per loop).

LOOP_BARS = 16


def scene(act, name):
    spec = ACTS[act]
    bars = LOOP_BARS
    tempo = {'map': 1, 'calm': 0.82, 'duel': 1.14, 'boss': 1.2}.get(name, 1)
    mode = spec['boss_mode'] if name == 'boss' else spec['mode']
    pc = Piece(round(spec['bpm'] * tempo), seed=act * 101 + len(name))
    L = bars * 4
    for t0 in (0, L, 2 * L):
        if name == 'map':
            pc.channel(0, spec['lead'], 105, 64, 55)
            pc.channel(1, spec['arp'], 88, 38, 60)
            pc.channel(2, spec['pad'], 70, 92, 75)
            pc.channel(3, spec['bass'], 92, 60, 30)
            pc.channel(9, 0, 80, 70, 25)
            melody(pc, spec, mode, 0, t0)
            arpeggio(pc, spec, mode, 1, t0, bars)
            pad(pc, spec, mode, 2, t0, bars)
            bassline(pc, spec, mode, 3, t0, bars, 'half')
            if spec['perc'] == 'timpani':
                pc.channel(4, 'timpani', 80, 64, 40)
                timpani(pc, spec, mode, 4, t0, bars, vel=62)
            else:
                drums(pc, t0, bars, spec['perc'], 52)
        elif name == 'calm':
            pc.channel(0, spec['calm'], 92, 64, 70)
            pc.channel(1, 'harp', 80, 40, 70)
            pc.channel(2, 'warmpad', 62, 88, 80)
            pc.channel(3, spec['bass'], 70, 60, 40)
            # The theme only in its second half, as if remembered.
            melody(pc, spec, mode, 0, t0, octave=1 if spec['calm'] != 'harp' else 0, vel=70, only=set(range(8, 16)))
            arpeggio(pc, spec, mode, 1, t0, bars, step=1, shape=(0, 1, 2, 3), vel=50)
            pad(pc, spec, mode, 2, t0, bars, vel=40)
            bassline(pc, spec, mode, 3, t0, bars, 'whole', vel=60)
        elif name == 'duel':
            pc.channel(0, spec['lead2'], 100, 64, 45)
            pc.channel(1, 'pizz', 96, 40, 45)
            pc.channel(2, 'strings', 72, 90, 60)
            pc.channel(3, spec['bass'], 96, 60, 25)
            pc.channel(9, 0, 92, 64, 25)
            melody(pc, spec, mode, 0, t0, staccato=0.8)
            ostinato(pc, spec, mode, 1, t0, bars)
            pad(pc, spec, mode, 2, t0, bars, vel=42)
            bassline(pc, spec, mode, 3, t0, bars, 'drive', vel=80)
            drums(pc, t0, bars, 'drive', 58)
        elif name == 'boss':
            pc.channel(0, spec['boss_lead'], 110, 64, 50)
            pc.channel(1, 'cello', 100, 44, 40)
            pc.channel(2, 'tremolo', 78, 88, 60)
            pc.channel(3, 'contrabass', 100, 60, 25)
            pc.channel(4, 'timpani', 96, 64, 40)
            pc.channel(9, 0, 90, 64, 25)
            melody(pc, spec, mode, 0, t0, octave=-1, vel=96)
            ostinato(pc, spec, mode, 1, t0, bars, octave=-1, vel=72)
            pad(pc, spec, mode, 2, t0, bars, vel=48)
            bassline(pc, spec, mode, 3, t0, bars, 'drive', vel=86)
            timpani(pc, spec, mode, 4, t0, bars, vel=84)
            drums(pc, t0, bars, 'boss', 60)
    return pc, L


def special(name):
    """Title, victory and defeat: the first act's theme, and the last's."""
    if name == 'title':
        spec, mode, bpm = ACTS[1], 'major', 80
    elif name == 'victory':
        spec, mode, bpm = ACTS[1], 'major', 92
    else:
        spec, mode, bpm = ACTS[3], 'minor', 64
    bars = LOOP_BARS
    pc = Piece(bpm, seed=len(name) * 7)
    L = bars * 4
    for t0 in (0, L, 2 * L):
        if name == 'title':
            pc.channel(0, 'musicbox', 96, 64, 70)
            pc.channel(1, 'harp', 80, 40, 70)
            pc.channel(2, 'slowstrings', 60, 90, 80)
            pc.channel(3, 'flute', 70, 70, 70)
            melody(pc, spec, mode, 0, t0, octave=1, vel=72, only=set(range(0, 8)))
            melody(pc, spec, mode, 3, t0, vel=62, only=set(range(8, 16)))
            arpeggio(pc, spec, mode, 1, t0, bars, step=1, shape=(0, 1, 2, 3), vel=48)
            pad(pc, spec, mode, 2, t0, bars, vel=38)
        elif name == 'victory':
            pc.channel(0, 'brass', 100, 64, 55)
            pc.channel(1, 'strings', 90, 40, 60)
            pc.channel(2, 'harp', 80, 90, 60)
            pc.channel(3, 'tuba', 88, 60, 30)
            pc.channel(4, 'timpani', 84, 64, 40)
            pc.channel(5, 'glock', 70, 80, 60)
            melody(pc, spec, mode, 0, t0, vel=90)
            melody(pc, spec, mode, 5, t0, octave=1, vel=58, only=set(range(8, 16)))
            pad(pc, spec, mode, 1, t0, bars, vel=52)
            arpeggio(pc, spec, mode, 2, t0, bars, step=0.5, vel=52)
            bassline(pc, spec, mode, 3, t0, bars, 'walk', vel=72)
            timpani(pc, spec, mode, 4, t0, bars, vel=70)
        else:  # defeat
            pc.channel(0, 'piano', 92, 64, 70)
            pc.channel(1, 'cello', 72, 50, 70)
            pc.channel(2, 'slowstrings', 58, 84, 80)
            melody(pc, spec, mode, 0, t0, octave=0, vel=62)
            pad(pc, spec, mode, 2, t0, bars, vel=36)
            bassline(pc, spec, mode, 1, t0, bars, 'whole', vel=58)
    return pc, L


def stinger(act, kind):
    """A phrase over the music, in the act's key: about two seconds."""
    spec = ACTS[act]
    tonic, mode = spec['tonic'], spec['mode']
    pc = Piece(spec['bpm'], seed=act * 13 + len(kind))
    up = lambda d, o=0: pitch(tonic + 12, mode, d, o)  # noqa: E731
    if kind == 'win':
        pc.channel(0, 'glock', 100, 64, 60)
        pc.channel(1, 'strings', 90, 64, 60)
        for k, d in enumerate([1, 3, 5, 8]):
            pc.note(k * 0.5, 1.2, 0, up(d, 1), 92, human=False)
        for p in triad(tonic, mode, 1):
            pc.note(1.5, 2.5, 1, p, 70, human=False)
    elif kind == 'lose':
        pc.channel(0, 'oboe' if act != 2 else 'clarinet', 100, 64, 60)
        pc.channel(1, 'cello', 90, 64, 60)
        for k, d in enumerate([5, 4, 3, 1]):
            pc.note(k * 0.6, 0.7, 0, up(d), 80, human=False)
        pc.note(0, 3, 1, pitch(tonic - 12, 'minor', 1), 70, human=False)
    elif kind == 'door':
        pc.channel(0, 'harp', 100, 64, 70)
        pc.channel(1, 'brass', 95, 64, 60)
        for k in range(15):
            pc.note(k * 0.08, 1.5, 0, pitch(tonic, mode, 1 + k), 70 + k, human=False)
        for p in triad(tonic, mode, 1) + [tonic + 12]:
            pc.note(1.3, 2.5, 1, p, 88, human=False)
    elif kind == 'stronger':
        pc.channel(0, 'trombone', 100, 64, 50)
        pc.channel(1, 'timpani', 100, 64, 40)
        pc.note(0, 0.9, 0, pitch(tonic - 12, 'phrygian', 1), 90, human=False)
        pc.note(1, 1.8, 0, pitch(tonic - 12, 'phrygian', 2), 94, human=False)
        for k in range(10):
            pc.note(k * 0.15, 0.15, 1, tonic - 24, 60 + k * 3, human=False)
    elif kind == 'heal':
        pc.channel(0, 'celesta', 100, 64, 70)
        for k, d in enumerate([3, 5, 8, 10]):
            pc.note(k * 0.33, 1.5, 0, up(d), 80, human=False)
    return pc, 0
