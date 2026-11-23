"""Resonator's P table, generated at build time (offsets in OFF; resonator.asm reads them from `$fab1e0`).

  NOTE    128  theta = 2f/fs of MIDI notes 0..127 (A4 = note 69 = 440 Hz)
  COL     128  theta of the 128 Colundi frequencies, ascending
  R       128  pole radius for DCAY 0..127: T60 from 25 ms to 10 s
  G       128  input gain (1 - r)^0.75 / 4, matched to R
  SEMI     56  four voice offsets in semitones per CHRD chord
  CRATIO   56  the same offsets as frequency ratios / 32 (COLUN snaps those)
  TRATIO   56  eight partial ratios / 32 per TYPE; 0 leaves the partial out
  TAMP     56  eight partial levels per TYPE
  VMAP     32  the voice of each of the 8 modes, for VOIC 1..4 (mode m -> m mod n)
  JMAP     32  the partial of each mode, for VOIC 1..4 (m div n)
  TONEK   128  the exciter one-pole's coefficient per TONE value
  SNAP    120  per scale, the step from each pitch class to its nearest scale note
  KERNEL    6  sin(pi t) = t * P(t^2), P's Taylor coefficients / 8, highest first

The Colundi sequence is Aleksi Perälä's: 128 absolute frequencies from
colundi.net, here as tubbutec's full Scala file lists them (10.8 Hz base,
"everyOne") converted back to Hz and rounded to the published 0.01 Hz.
Degree 78 is 440 Hz and 79 is 441 Hz. Used with the owner's waiver of
23 Nov 2026 (the owner spoke with the Colundi side).
"""
import math

FS = 44100
Q = 1 << 23
MAX = Q - 1
MODES = 8

COLUNDI_HZ = (
    10.8, 13.8, 14.3, 19.7, 20.8, 27.3, 27.7, 31.32, 31.7, 32.0, 33.0, 33.8, 35.0, 38.0, 39.0, 40.0,
    45.0, 46.98, 55.0, 59.9, 62.64, 63.0, 70.0, 70.47, 73.6, 80.0, 83.0, 90.0, 98.4, 105.0, 108.0, 110.0,
    111.0, 120.0, 126.22, 136.1, 140.25, 141.27, 144.72, 147.0, 147.85, 160.0, 172.06, 174.0, 183.58, 187.61,
    194.18, 194.71, 197.0, 207.36, 210.42, 211.44, 221.23, 250.0, 256.0, 264.0, 273.0, 285.0, 288.0, 293.0,
    315.0, 315.8, 320.0, 341.0, 342.0, 345.0, 360.0, 372.0, 384.0, 396.0, 402.0, 404.0, 408.0, 410.0, 413.0,
    416.0, 417.0, 420.82, 440.0, 441.0, 445.0, 448.0, 464.0, 480.0, 492.8, 526.0, 528.0, 586.0, 620.0, 630.0,
    639.0, 685.0, 728.0, 741.0, 784.0, 852.0, 880.0, 963.0, 984.0, 1000.0, 1033.0, 1052.0, 1074.0, 1185.0,
    1296.0, 1417.0, 1820.0, 2025.0, 2041.0, 2675.0, 3240.0, 3835.0, 3975.0, 4049.0, 4129.0, 4173.0, 4221.0,
    4280.0, 4444.0, 4671.0, 4840.0, 5201.0, 5284.0, 5907.0, 6051.0, 8000.0, 9999.0, 12000.0,
)
assert len(COLUNDI_HZ) == 128 and list(COLUNDI_HZ) == sorted(COLUNDI_HZ)
assert COLUNDI_HZ[78] == 440.0 and COLUNDI_HZ[79] == 441.0

# CHRD: the semitones of voices 2-4 above the root (voice 1). VOIC sets how many voices sound.
CHORDS = (
    ("OCT", (12, 24, 36)), ("5TH", (7, 12, 19)), ("SUS2", (2, 7, 12)), ("SUS4", (5, 7, 12)),
    ("MAJ", (4, 7, 12)), ("MIN", (3, 7, 12)), ("MAJ7", (4, 7, 11)), ("MIN7", (3, 7, 10)), ("DOM7", (4, 7, 10)),
    ("DIM", (3, 6, 9)), ("AUG", (4, 8, 12)), ("ADD9", (4, 7, 14)), ("5THS", (7, 14, 21)), ("4THS", (5, 10, 15)),
)
CHORD_NAMES = tuple(name for name, _ in CHORDS)

# TYPE: each voice's partials as (ratio to its note, level). Textbook acoustics, not any product's tables.
TYPES = (
    ("PURE", [(1, 1)]),                                                          # one sine-like mode
    ("STRNG", [(k, 1 / k) for k in range(1, 9)]),                                # a string: harmonics 1-8
    ("TUBE", [(2 * k - 1, 1 / (2 * k - 1)) for k in range(1, 9)]),               # a closed pipe: odd harmonics
    ("BAR", [(r, 0.7 ** i) for i, r in enumerate(                                # a free bar (beam)
        (1, 2.756, 5.404, 8.933, 13.345, 18.638, 24.811, 31.868))]),
    ("PLATE", [(r, 0.8 ** i) for i, r in enumerate(                              # a supported square plate
        (1, 2.5, 4, 5, 6.5, 8.5, 9, 10))]),
    ("DRUM", [(r, 0.75 ** i) for i, r in enumerate(                              # a circular membrane
        (1, 1.594, 2.136, 2.296, 2.653, 2.918, 3.156, 3.501))]),
    ("BELL", list(zip((0.5, 1, 1.2, 1.5, 2, 2.5, 2.667, 3),                      # a church bell: hum, prime, tierce ...
                      (0.6, 1, 0.8, 0.5, 0.9, 0.5, 0.4, 0.3)))),
)
TYPE_NAMES = tuple(name for name, _ in TYPES)

# SCALE: OFF, then twelve keys x these scales, key-major (CMAJ, CMIN, ... BPMI).
SCALES = (
    ("MAJ", (0, 2, 4, 5, 7, 9, 11)), ("MIN", (0, 2, 3, 5, 7, 8, 10)), ("DOR", (0, 2, 3, 5, 7, 9, 10)),
    ("PHR", (0, 1, 3, 5, 7, 8, 10)), ("LYD", (0, 2, 4, 6, 7, 9, 11)), ("MIX", (0, 2, 4, 5, 7, 9, 10)),
    ("HMI", (0, 2, 3, 5, 7, 8, 11)), ("MMI", (0, 2, 3, 5, 7, 9, 11)), ("PMA", (0, 2, 4, 7, 9)),
    ("PMI", (0, 3, 5, 7, 10)),
)
KEYS = ("C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B")
SCALE_LABELS = ("OFF",) + tuple(k + s for k in KEYS for s, _ in SCALES)
assert len(SCALE_LABELS) == 121 and max(map(len, SCALE_LABELS)) <= 5

SIZES = (("NOTE", 128), ("COL", 128), ("R", 128), ("G", 128), ("SEMI", 56), ("CRATIO", 56), ("TRATIO", 56),
         ("TAMP", 56), ("VMAP", 32), ("JMAP", 32), ("TONEK", 128), ("SNAP", 120), ("KERNEL", 6))
OFF = {name: sum(n for _, n in SIZES[:i]) for i, (name, _) in enumerate(SIZES)}


def note_hz(n):
    return 440.0 * 2 ** ((n - 69) / 12)


def t60(d):
    return 0.025 * 400 ** (d / 127)


def radius(d):
    return 10 ** (-3 / (FS * t60(d)))


def tone_hz(v):
    """TONE below 64: the exciter's low-pass corner, 150 Hz up to 20 kHz. Above 64: its high-pass corner,
    20 Hz up to 3 kHz. 64 is flat."""
    return 150 * (20000 / 150) ** (v / 64) if v < 64 else 20 * (3000 / 20) ** ((v - 64) / 63)


def word(x):
    return max(-Q, min(MAX, round(x * Q))) & 0xFFFFFF


def theta(hz):
    return word(2 * hz / FS)


def snap_steps(degrees):
    """For each pitch class, the step to the nearest scale note (ties go down)."""
    return [min((abs(d), d) for s in degrees for d in (s - pc, s - pc - 12, s - pc + 12))[1] for pc in range(12)]


def partials(type_index):
    """The TYPE's eight (ratio, level) pairs, levels scaled to unit energy; missing partials are (0, 0)."""
    parts = TYPES[type_index][1]
    norm = math.sqrt(sum(level ** 2 for _, level in parts))
    return [(r, level / norm) for r, level in parts] + [(0, 0)] * (MODES - len(parts))


def voice_partial(voices, m):
    return m % voices, m // voices


def table():
    semi, cratio = [], []
    for _, steps in CHORDS:
        semi += [0] + list(steps)
        cratio += [word(2 ** (s / 12) / 32) for s in (0,) + steps]
    tratio, tamp = [], []
    for t in range(len(TYPES)):
        for r, level in partials(t):
            tratio.append(word(r / 32))
            tamp.append(word(level))
    vmap = [voice_partial(n, m)[0] for n in range(1, 5) for m in range(MODES)]
    jmap = [voice_partial(n, m)[1] for n in range(1, 5) for m in range(MODES)]
    tonek = [word(1 - math.exp(-2 * math.pi * tone_hz(v) / FS)) for v in range(128)]
    snap = [d & 0xFFFFFF for _, degrees in SCALES for d in snap_steps(degrees)]
    kernel = [word(c / 8) for c in reversed([(-1) ** j * math.pi ** (2 * j + 1) / math.factorial(2 * j + 1)
                                             for j in range(6)])]
    t = ([theta(note_hz(n)) for n in range(128)] + [theta(hz) for hz in COLUNDI_HZ]
         + [word(radius(d)) for d in range(128)] + [word((1 - radius(d)) ** 0.75 / 4) for d in range(128)]
         + semi + cratio + tratio + tamp + vmap + jmap + tonek + snap + kernel)
    assert len(t) == sum(n for _, n in SIZES)
    return tuple(t)


TABLE = table()
assert len(CHORDS) * 4 == 56 and len(TYPES) * MODES == 56
assert OFF == {"NOTE": 0, "COL": 128, "R": 256, "G": 384, "SEMI": 512, "CRATIO": 568, "TRATIO": 624, "TAMP": 680,
               "VMAP": 736, "JMAP": 768, "TONEK": 800, "SNAP": 928, "KERNEL": 1048}, OFF
