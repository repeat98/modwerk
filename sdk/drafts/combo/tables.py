"""COMBO's constants and P table, generated at build time (combo.asm reads the table from `$fab1e0`).

Everything here is Modwerk's own design, from textbook filter formulas
(Robert Bristow-Johnson's Audio EQ Cookbook); no impulse response, curve or
voicing is taken from any product.

  CAB   5 rows x 15 words: one row per CAB setting (OFF, 1X10, 1X12, 2X12,
        4X12), three biquads per row, each as b0, b1, b2, -a1, -a2, halved,
        in Q23. A cabinet is a resonant high-pass (the low thump), a
        resonant low-pass (the speaker's upper-mid bump and roll-off) and a
        second low-pass that steepens the top. OFF is three unit
        passthroughs, so CAB OFF is exact.

The fixed filters (combo.asm immediates):
  KHP   pre high-pass one-pole at 90 Hz (keeps the drive from farting out)
  PRE   pre low-pass biquad at 7 kHz, Q 0.707: band-limits what reaches the
        waveshaper, so its harmonics alias less
  KL    tone stack's low split, one-pole at 300 Hz
  KT    tone stack's high split, one-pole at 2.2 kHz
"""
import math

FS = 44100.0
Q = 1 << 23

CAB_NAMES = ("OFF", "1X10", "1X12", "2X12", "4X12")

# (high-pass Hz, Q), (low-pass Hz, Q), (low-pass Hz, Q) per cabinet.
CAB_DESIGN = (
    None,
    ((120.0, 1.3), (3600.0, 1.4), (5500.0, 0.6)),
    ((95.0, 1.2), (4200.0, 1.2), (6500.0, 0.6)),
    ((85.0, 1.1), (3800.0, 1.0), (5800.0, 0.65)),
    ((75.0, 1.5), (3200.0, 1.3), (5000.0, 0.7)),
)


def q23(v):
    w = round(v * Q)
    if not -Q <= w < Q:
        raise ValueError(f"{v} does not fit Q23")
    return w


def word(v):
    return q23(v) & 0xffffff


def lowpass(fc, q):
    w = 2 * math.pi * fc / FS
    al = math.sin(w) / (2 * q)
    a0 = 1 + al
    b0 = (1 - math.cos(w)) / 2 / a0
    return b0, 2 * b0, b0, -2 * math.cos(w) / a0, (1 - al) / a0


def highpass(fc, q):
    w = 2 * math.pi * fc / FS
    al = math.sin(w) / (2 * q)
    a0 = 1 + al
    b0 = (1 + math.cos(w)) / 2 / a0
    return b0, -2 * b0, b0, -2 * math.cos(w) / a0, (1 - al) / a0


PASS = (1.0, 0.0, 0.0, 0.0, 0.0)


def halved(c):
    """The assembly's biquad words: b0, b1, b2, -a1, -a2, each halved."""
    b0, b1, b2, a1, a2 = c
    return tuple(q23(v / 2) for v in (b0, b1, b2, -a1, -a2))


def cab_biquads(i):
    d = CAB_DESIGN[i]
    if d is None:
        return (PASS, PASS, PASS)
    (hf, hq), (lf, lq), (l2f, l2q) = d
    return (highpass(hf, hq), lowpass(lf, lq), lowpass(l2f, l2q))


CAB_ROWS = tuple(tuple(w for bq in cab_biquads(i) for w in halved(bq)) for i in range(len(CAB_NAMES)))
TABLE = tuple(w & 0xffffff for row in CAB_ROWS for w in row)


def one_pole(fc):
    return 1.0 - math.exp(-2 * math.pi * fc / FS)


KHP = q23(one_pole(90.0))
KL = q23(one_pole(300.0))
KT = q23(one_pole(2200.0))
PRE = halved(lowpass(7000.0, 0.7071))
CA, CB = q23(0.1875), q23(0.0625)      # the curve: 0.1875 c - 0.0625 c^3 (quarter scale of 0.75c - 0.25c^3)

CONSTANTS = {"KHP": KHP, "KL": KL, "KT": KT, "CA": CA, "CB": CB,
             **{f"P{i}": w for i, w in enumerate(PRE)}}


def response(coeffs, f):
    """|H(f)| of a cascade of biquads given as float (b0, b1, b2, a1, a2)."""
    z = complex(math.cos(2 * math.pi * f / FS), -math.sin(2 * math.pi * f / FS))
    g = 1.0
    for b0, b1, b2, a1, a2 in coeffs:
        g *= abs((b0 + b1 * z + b2 * z * z) / (1 + a1 * z + a2 * z * z))
    return g


if __name__ == "__main__":
    for i, n in enumerate(CAB_NAMES):
        bqs = cab_biquads(i)
        pts = [(f, 20 * math.log10(response(bqs, f))) for f in (50, 80, 100, 150, 500, 1000, 2000, 3000,
                                                                4000, 6000, 8000, 12000)]
        peak = max(response(bqs, f) for f in range(20, 22000, 5))
        print(f"{n:5} peak {20 * math.log10(peak):+.1f} dB  " + " ".join(f"{f}:{d:+.1f}" for f, d in pts))
    print("table", len(TABLE), "words")
