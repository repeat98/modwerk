"""COMBO's constants and P table, generated at build time (combo.asm reads the table from `$fab1e0`).

Everything here is Modwerk's own design, from textbook filter formulas
(Robert Bristow-Johnson's Audio EQ Cookbook); no impulse response, curve or
voicing is taken from any product.

  VOICE 5 rows x 16 words from word 0, one per VOIC setting (CLEAN, BOOST,
        ROCK, SOLID, BASS): the pre low-pass biquad (5, as the CAB rows, its b
        words times the voice's drive x 2), then KHP, CA, CB, BIAS, FB, KL,
        KT (copied to X each call), then VC, WB, WM, WT (read by the knob
        code). See VOICES below.
  CAB   5 rows x 25 words from word 80 (biquad 1; biquad 2 and its step to PRES 127;
        biquad 3 and its step to MIC 127; see cab_row): one row per CAB setting (OFF, 1X10, 1X12, 2X12,
        4X12), three biquads per row, each as b0, b1, b2, -a1, -a2, halved,
        in Q23. A cabinet is a resonant high-pass (the low thump), a
        resonant low-pass (the speaker's upper-mid bump and roll-off) and a
        second low-pass that steepens the top. OFF is three unit
        passthroughs, so CAB OFF is exact.
  COMP  128 words from word 205: the level after the curve at each GAIN
        step, 1/sqrt(G) halved, so turning GAIN up adds drive, not volume.

Per voice (VOICES): the pre high-pass one-pole (KHP) and the pre low-pass
biquad before the curve (what reaches the drive: the low cut that tightens
it, and a resonant top that band-limits it and puts a bump where the voice
wants its bite); the drive's range (in the pre low-pass's gain); the curve (CA c - CB c^3 on
c + BIAS, less FB, the curve's value at BIAS, so silence stays silence: a
BIAS makes even harmonics); the level after it (VC); the tone stack's
splits (KL, KT) and its band weights (WB, WM, WT), so each voice has its own
EQ with BASS, MID and TREB at their centre.

The fixed filter (a combo.asm immediate):
  KDC   DC blocker after the cabinet, one-pole high-pass at 10 Hz: the cabinet's
        resonant high-pass can freeze a truncated offset in its dead band
"""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import halfband  # noqa: E402

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


def one_pole(fc):
    return 1.0 - math.exp(-2 * math.pi * fc / FS)


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


def peaking(fc, q, db):
    w = 2 * math.pi * fc / FS
    al = math.sin(w) / (2 * q)
    g = 10 ** (db / 40)
    a0 = 1 + al / g
    return ((1 + al * g) / a0, -2 * math.cos(w) / a0, (1 - al * g) / a0, -2 * math.cos(w) / a0, (1 - al / g) / a0)


def cab_presence(i):
    """The cabinet's second biquad at PRES 127: its resonant low-pass a quarter higher and 1.6 times as sharp, a
    presence bump; with CAB OFF, a +6 dB peak at 3.5 kHz."""
    d = CAB_DESIGN[i]
    if d is None:
        return peaking(3500.0, 0.9, 6.0)
    lf, lq = d[1]
    return lowpass(lf * 1.25, lq * 1.6)


def cab_offaxis(i):
    """The cabinet's third biquad at AXIS 127: the mic off the cone's axis, its top rolled off an octave lower;
    with CAB OFF, a gentle roll-off from 4.5 kHz (the developer asked for AXIS without a cabinet, 26 Nov 2026)."""
    d = CAB_DESIGN[i]
    if d is None:
        return lowpass(4500.0, 0.707)
    l2f, l2q = d[2]
    return lowpass(l2f * 0.45, l2q)


def interp_words(c0, c1):
    """halved(c0) and the step to halved(c1), scaled by 128/127 so a knob at 127 lands on c1:
    combo.asm forms each word as c0 + k/128 x step."""
    h0, h1 = halved(c0), halved(c1)
    return h0, tuple(q23((b - a) / Q * 128 / 127) for a, b in zip(h0, h1))


def interp(c0, c1, k):
    """The float coefficients at knob k, as the assembly forms them."""
    h0, st = interp_words(c0, c1)
    return tuple(2 * (a / Q + k / 128 * d / Q) * (1 if j < 3 else -1) for j, (a, d) in enumerate(zip(h0, st)))


def cab_row(i):
    b1, b2, b3 = cab_biquads(i)
    p0, pd = interp_words(b2, cab_presence(i))
    m0, md = interp_words(b3, cab_offaxis(i))
    return halved(b1) + p0 + pd + m0 + md


CAB_ROW = 25
CAB_ROWS = tuple(cab_row(i) for i in range(len(CAB_NAMES)))


def gain_g(k):
    """GAIN's drive: ((k+16)/16)^2, +0 dB at 0, +38 dB at 127."""
    return ((k + 16) / 16.0) ** 2


VOICE_NAMES = ("CLEAN", "BOOST", "ROCK", "SOLID", "BASS")

# name: high-pass Hz, (low-pass Hz, Q), drive x (BOOST = 1), curve (a, b) in a c - b c^3, bias,
#       tone splits (Hz), band weights (BASS, MID, TREB at their centre), level trim
VOICES = (
    # clean: wide band, little drive, a scooped middle
    dict(hp=60.0, lp=(9000.0, 0.7071), drive=0.5, curve=(0.75, 0.25), bias=0.0,
         split=(250.0, 1600.0), weights=(1.10, 0.62, 1.20), trim=1.0),
    # boost: chiming upper mids, early soft break-up with even harmonics
    dict(hp=100.0, lp=(5000.0, 1.4), drive=1.0, curve=(0.75, 0.25), bias=0.12,
         split=(300.0, 2500.0), weights=(0.80, 1.00, 1.20), trim=1.0),
    # rock: tight lows, mids forward, the most drive
    dict(hp=180.0, lp=(3200.0, 1.1), drive=1.7, curve=(0.75, 0.25), bias=0.08,
         split=(400.0, 3000.0), weights=(0.95, 1.25, 0.95), trim=1.0),
    # solid: flat and bright, clean until it clips hard at the top
    dict(hp=40.0, lp=(10000.0, 0.6), drive=0.6, curve=(0.9, 0.1), bias=0.0,
         split=(300.0, 2200.0), weights=(1.00, 1.00, 1.15), trim=1.0),
    # bass: keeps the lowest octave, a darker top, a little growl in the low mids
    dict(hp=28.0, lp=(4500.0, 0.8), drive=0.8, curve=(0.75, 0.25), bias=0.05,
         split=(180.0, 1200.0), weights=(1.20, 0.85, 1.05), trim=1.0),
)
# DIST: early reflections from a 1024-word ring in the slot's Y buffer (base + $400): (delay in samples,
# gain at DIST 127) for each side; opposite signs and different times keep the two sides apart.
ROOM_L = ((263, 0.50), (571, -0.36))
ROOM_R = ((389, 0.46), (797, -0.30))
ROOM_DIRECT = 0.35        # the direct sound drops by up to this much (about -3.7 dB) as the mic moves away
RING = 1024
VOICE_ROW = 16
VG_SHIFT = 9            # combo.asm: asl #9 after the GAIN product; q is limited at full scale, so it stays
                        # under (143/256)^2 x 512 = 160 of the accumulator's 256, and the pre low-pass carries
                        # the voice's drive x 2 (BOOST's x2 x 512 is the old x1024)


def curve_fx(c, ca, cb):
    """The assembly's curve on a limited word c: CA c - CB c^3 (56-bit, before FB)."""
    c2 = max(-0x800000, min(0x7fffff, (2 * c * c) >> 24))
    c3 = max(-0x800000, min(0x7fffff, (2 * c2 * c) >> 24))
    return 2 * c * ca - 2 * c3 * cb


def voice_words(v):
    hp = q23(one_pole(v["hp"]))
    pre = halved(tuple(c * 2 * v["drive"] if i < 3 else c for i, c in enumerate(lowpass(*v["lp"]))))
    ca, cb = q23(v["curve"][0] / 4), q23(v["curve"][1] / 4)
    bias = q23(v["bias"])
    fb = max(-0x800000, min(0x7fffff, curve_fx(bias, ca, cb) >> 24))
    kl, kt = q23(one_pole(v["split"][0])), q23(one_pole(v["split"][1]))
    a, b = v["curve"]
    peak = a - b                                    # the curve's top, as 0.5 for 0.75/0.25
    vc = q23(0.5 * v["trim"] * 0.5 / peak / math.sqrt(v["drive"]))
    wb, wm, wt = (q23(w / 2) for w in v["weights"])
    return pre + (hp, ca, cb, bias, fb, kl, kt, vc, wb, wm, wt)


# COMP: the level after the curve for each GAIN step, 1/sqrt(G) = 16/(k+16), halved: more GAIN
# drives the curve harder without getting louder, and the cabinet keeps its headroom.
VOICE_ROWS = tuple(voice_words(v) for v in VOICES)
CAB_AT = VOICE_ROW * len(VOICES)
COMP_AT = CAB_AT + len(CAB_ROWS) * CAB_ROW
COMP = tuple(q23(0.5 / math.sqrt(gain_g(k))) for k in range(128))


KDC = q23(one_pole(10.0))
# The 2x oversampler: four all-pass coefficients, a transition band of 0.06 of the 2x rate (pass-band to
# 16.8 kHz, stop-band -57 dB; halfband.py). Even ones on path 0, odd ones on path 1.
HALFBAND = tuple(q23(a) for a in halfband.coefficients(4, 0.06))
TABLE = tuple(w & 0xffffff for w in tuple(w for row in VOICE_ROWS for w in row)
              + tuple(w for row in CAB_ROWS for w in row) + COMP)
assert CAB_AT == 80 and COMP_AT == 205 and len(TABLE) == 333

CONSTANTS = {"KDC": KDC, **{f"HB{i}": a for i, a in enumerate(HALFBAND)}}


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
    for n, v, row in zip(VOICE_NAMES, VOICES, VOICE_ROWS):
        print(f"{n:5} " + " ".join(f"{w & 0xffffff:06x}" for w in row))
    print("table", len(TABLE), "words")
