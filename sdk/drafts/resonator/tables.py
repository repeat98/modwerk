"""Resonator's P table: pitch, decay and input-gain words, generated at build time.

Layout (resonator.asm reads it from the `$fab1e0` base):
  +0    NOTE    128 x (cos w, sin w)  MIDI note 0..127, A4 = note 69 = 440 Hz
  +256  COLUNDI 128 x (cos w, sin w)  Colundi degree 0..127
  +512  R       128 pole radii        T60 from 25 ms (DCAY 0) to 10 s (DCAY 127)
  +640  G       128 input gains       (1 - r)^0.75 / 16, matched to R

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


def note_hz(n):
    return 440.0 * 2 ** ((n - 69) / 12)


def t60(d):
    return 0.025 * 400 ** (d / 127)


def radius(d):
    return 10 ** (-3 / (FS * t60(d)))


def word(x):
    return max(-Q, min(MAX, round(x * Q))) & 0xFFFFFF


def pole(hz):
    w = 2 * math.pi * hz / FS
    return word(math.cos(w)), word(math.sin(w))


def table():
    out = []
    for hz in [note_hz(n) for n in range(128)] + list(COLUNDI_HZ):
        out += pole(hz)
    radii = [word(radius(d)) for d in range(128)]
    gains = [word((1 - radius(d)) ** 0.75 / 16) for d in range(128)]
    return tuple(out + radii + gains)


TABLE = table()
assert len(TABLE) == 768
