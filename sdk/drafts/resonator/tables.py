"""Resonator's P table, generated at build time (offsets in OFF; resonator.asm reads them from `$fab1e0`).

  NOTE     24  theta = 2f/fs of MIDI notes 127 down to 116 (A4 = note 69 = 440 Hz) in 48 bits, high
               word first; with k, r = divmod(127 - n, 12), note n is note 127 - r shifted right
               k times and rounded, which is exactly the 24-bit theta of every note 0..127
  COL     128  theta of the 128 Colundi frequencies, ascending
  R        33  pole radius at DCAY 0, 4 ... 128 (T60 from 25 ms to 10 s); between them linear
  G        33  input gain (1 - r)^0.75 / 4 at the same points, matched to R
  SEMI     56  four voice offsets in semitones per CHRD chord
  CRATIO   56  the same offsets as frequency ratios / 32 (COLUN snaps those)
  TRATIO   56  eight partial ratios / 32 per TYPE; 0 leaves the partial out
  TAMP     56  eight partial levels per TYPE
  VJ       32  for VOIC 1..4 and mode m: its voice (m mod n) times 8 plus its partial (m div n)
  TONEK    34  the exciter one-pole's coefficient at TONE 0, 4 ... 64 (low-pass corners, 64 the
               20 kHz end) and 64, 68 ... 128 (high-pass corners); between them linear
  SNAP    120  per scale, the step from each pitch class to its nearest scale note
  KERNEL    6  sin(pi t) = t * P(t^2), P's Taylor coefficients / 8, highest first
  WMIX     33  the ring's mix gain sqrt(1 - d^2) at MIX 0, 4 ... 128, d = (1 - MIX/128)^2 the dry's:
               constant power; between them linear

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

SIZES = (("NOTE", 24), ("COL", 128), ("R", 33), ("G", 33), ("SEMI", 56), ("CRATIO", 56), ("TRATIO", 56),
         ("TAMP", 56), ("VJ", 32), ("TONEK", 34), ("SNAP", 120), ("KERNEL", 6), ("WMIX", 33))
STEP = 4   # R, G and TONEK hold every fourth value; the DSP interpolates linearly between them
OFF = {name: sum(n for _, n in SIZES[:i]) for i, (name, _) in enumerate(SIZES)}


def note_hz(n):
    return 440.0 * 2 ** ((n - 69) / 12)


def t60(d):
    return 0.025 * 400 ** (d / 127)


def radius(d):
    return 10 ** (-3 / (FS * t60(d)))


# The input gain per DCAY: G_SCALE * (1 - r)^G_EXP, cut by up to 2 dB below DCAY 32. A partial's ring on
# noise goes as G / sqrt(1 - r), a hit's as G: 0.45 holds the ring on noise about 4 dB under the dry at
# every DCAY (three voices of STRNG at GAIN 32); a ring as loud as the dry would drive hot hits through the
# soft clip, whose ceiling (2/3 FS) is below a full-scale dry's. Short rings follow hits closest, hence the cut.
G_EXP, G_SCALE = 0.45, 0.157


def in_gain(d):
    return G_SCALE * (1 - radius(d)) ** G_EXP * 10 ** (-max(0, 32 - d) / 320)


def dry_gain(v):
    """MIX v: the dry's gain (1 - v/128)^2; 127 is 0, only the ring."""
    return 0.0 if v >= 127 else (1 - v / 128) ** 2


def ring_gain(v):
    return math.sqrt(1 - dry_gain(v) ** 2)


def tone_hz(v, high=None):
    """TONE below 64: the exciter's low-pass corner, 150 Hz up to 20 kHz. Above 64: its high-pass corner,
    20 Hz up to 3 kHz. 64 is flat. high picks a branch, so the low-pass curve's 20 kHz end at 64 exists."""
    high = v >= 64 if high is None else high
    return 20 * (3000 / 20) ** ((v - 64) / 63) if high else 150 * (20000 / 150) ** (v / 64)


def tone_k(hz):
    return 1 - math.exp(-2 * math.pi * hz / FS)


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


# What the DSP computes from the table (rnd is convergent, as Python's round): resonator.asm's rzntheta, rzdecay
# (lerp_word on R and G) and rzlerp. verify.py holds them to the ideal curves for every knob value.
def note_word(n):
    """rzntheta: the 48-bit theta of note 127 - r, shifted right k = (127 - n) div 12 times, rounded."""
    k, r = divmod(127 - n, 12)
    hi, lo = TABLE[OFF["NOTE"] + 2 * r:][:2]
    return round((((hi << 24) | lo) >> k) / (1 << 24))


def lerp_word(name, v):
    """rzlerp: table name's point v div 4 plus a quarter of the step to the next per v mod 4, rounded."""
    i, f = divmod(v, STEP)
    a, b = TABLE[OFF[name] + i], TABLE[OFF[name] + i + 1]
    return round(a + (b - a) * f / STEP)


def tonek_word(v):
    return lerp_word("TONEK", v + STEP) if v >= 64 else lerp_word("TONEK", v)


def dry_word(v):
    """The dry's gain minus 1, as the main call stores it: m^2 - 2m with m = v/128, -1 exactly at 127."""
    return -Q if v == 127 else ((v << 16) * (v << 16) * 2 >> 24) - 2 * (v << 16)


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
    vj = [8 * voice_partial(n, m)[0] + voice_partial(n, m)[1] for n in range(1, 5) for m in range(MODES)]
    tonek = ([word(tone_k(tone_hz(v, False))) for v in range(0, 65, STEP)]
             + [word(tone_k(tone_hz(v, True))) for v in range(64, 129, STEP)])
    note = []
    for r in range(12):
        v = round(2 * note_hz(127 - r) / FS * Q * (1 << 24))
        note += [v >> 24, v & 0xFFFFFF]
    snap = [d & 0xFFFFFF for _, degrees in SCALES for d in snap_steps(degrees)]
    kernel = [word(c / 8) for c in reversed([(-1) ** j * math.pi ** (2 * j + 1) / math.factorial(2 * j + 1)
                                             for j in range(6)])]
    t = (note + [theta(hz) for hz in COLUNDI_HZ]
         + [word(radius(d)) for d in range(0, 129, STEP)] + [word(in_gain(d)) for d in range(0, 129, STEP)]
         + semi + cratio + tratio + tamp + vj + tonek + snap + kernel
         + [word(ring_gain(v)) for v in range(0, 129, STEP)])
    assert len(t) == sum(n for _, n in SIZES)
    return tuple(t)


TABLE = table()
assert len(CHORDS) * 4 == 56 and len(TYPES) * MODES == 56
assert OFF == {"NOTE": 0, "COL": 24, "R": 152, "G": 185, "SEMI": 218, "CRATIO": 274, "TRATIO": 330, "TAMP": 386,
               "VJ": 442, "TONEK": 474, "SNAP": 508, "KERNEL": 628, "WMIX": 634}, OFF
assert len(TABLE) == 667
