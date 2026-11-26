"""MACKITY's two references, imported by verify.py and test_reference.py.

float_mackity: upstream/MackityProc.cpp in double precision at 44.1 kHz, less
its 32-bit float dither and denormal noise (the Octatrack's path is 24-bit
fixed point, where neither applies).

Model: mackity.asm instruction by instruction, on 24-bit words and a 56-bit
accumulator, so dsp_host's render must match it to the bit. The constants
here are the ones in the assembly; verify.py checks that they are, and
test_reference.py derives them again from the upstream formulas.
"""
import math

FS = 44100.0
Q = 1 << 23

# The upstream filter design, MackityProc.cpp lines 18-45, at 44.1 kHz.
IIR_A, IIR_B = 0.001860867, 0.000287496
FC, Q_A, Q_B = 19160.0, 0.431684981684982, 1.1582298
CURVE = 0.1768


def biquad(fc, q):
    k = math.tan(math.pi * fc / FS)
    norm = 1.0 / (1.0 + k / q + k * k)
    b0 = k * k * norm
    return b0, 2.0 * b0, b0, 2.0 * (k * k - 1.0) * norm, (1.0 - k / q + k * k) * norm


def q23(v):
    return round(v * Q)


def halved(fc, q):
    """The assembly's biquad words: b0, b1, b2, -a1, -a2, each halved, in Q23."""
    b0, b1, b2, a1, a2 = biquad(fc, q)
    return tuple(q23(c / 2) for c in (b0, b1, b2, -a1, -a2))


BQ_A = halved(FC, Q_A)
BQ_B = halved(FC, Q_B)
K1, K2 = q23(IIR_A), q23(IIR_B)
KQ = q23(CURVE / 4)
TRIMC = round(65536 * 16384 / 169)      # kn^2 * TRIMC = (k/13)^2 / 128
CONSTANTS = {"K1": K1, "K2": K2, "KQ": KQ, "TRIMC": TRIMC,
             **{f"A{i}": w for i, w in enumerate(BQ_A)}, **{f"B{i}": w for i, w in enumerate(BQ_B)}}


def trim_a(knob):
    """The original's In Trim A for a TRIM knob: (10 A)^2 = (knob/13)^2."""
    return knob / 130.0


def pad_b(knob):
    return 1.0 if knob >= 127 else knob / 128.0


def float_mackity(left, right, a, b):
    """Upstream's sample loop on floats in [-1, 1); returns two float lists."""
    in_trim = (a * 10.0) ** 2
    ba, bb = biquad(FC, Q_A), biquad(FC, Q_B)
    out = []
    for ch in (left, right):
        ia = ib = 0.0
        sa = [0.0] * 4
        sb = [0.0] * 4
        y = []
        for x in ch:
            ia = ia * (1.0 - IIR_A) + x * IIR_A
            x -= ia
            x *= in_trim
            o = ba[0] * x + ba[1] * sa[0] + ba[2] * sa[1] - ba[3] * sa[2] - ba[4] * sa[3]
            sa = [x, sa[0], o, sa[2]]
            x = max(-1.0, min(1.0, o))
            x -= x ** 5 * CURVE
            o = bb[0] * x + bb[1] * sb[0] + bb[2] * sb[1] - bb[3] * sb[2] - bb[4] * sb[3]
            sb = [x, sb[0], o, sb[2]]
            x = o
            ib = ib * (1.0 - IIR_B) + x * IIR_B
            x -= ib
            y.append(x * b)
        out.append(y)
    return out


# ---- the fixed-point model -------------------------------------------------

def s24(v):
    v &= 0xffffff
    return v - (1 << 24) if v & 0x800000 else v


def w56(a):
    a &= (1 << 56) - 1
    return a - (1 << 56) if a >> 55 else a


def lim(a):
    """move a,x0 / move a,x:(..): the limiter."""
    return max(-0x800000, min(0x7fffff, a >> 24))


def hi(a):
    """move a1,x0: the middle word, unlimited."""
    return s24(a >> 24)


def ld(x):
    return x << 24


def mac(a, x, y):
    return w56(a + 2 * x * y)


def biquad_fx(x, s, c):
    """Direct form 1 at quarter scale, halved coefficients; s = [x1, x2, y1, y2]."""
    a = 0
    for v, k in zip((x, s[0], s[1], s[2], s[3]), c):
        a = mac(a, v, k)
    a = w56(a << 1)
    s[1], s[0], s[3] = s[0], x, s[2]
    return a


class Model:
    """One instance of mackity.asm. call(frames, knobs) runs one proc."""

    def __init__(self):
        self.x = [0] * 32   # X:(r7+$00..$1f), as init leaves it

    def knobs(self, trim_word, pad_word):
        kn = trim_word & 0x7fffff
        t = lim(mac(0, lim(mac(0, kn, kn)), TRIMC))
        pn = pad_word & 0x7fffff
        b = ld(pn) >> 1
        if pn >= 0x7f0000:
            b = ld(0x400000)
        return t, hi(b)

    def call(self, frames, trim_word, pad_word):
        x = self.x
        x[0x18], x[0x1b] = self.knobs(trim_word, pad_word)
        if x[0x1e] == 0:
            x[0x19], x[0x1c], x[0x1e] = x[0x18], x[0x1b], 1
        for t, r in ((0x18, 0x19), (0x1b, 0x1c)):
            if abs(ld(x[t]) - ld(x[r])) < ld(64):
                x[r] = x[t]
        out = []
        for left, right in frames:
            for t, r in ((0x18, 0x19), (0x1b, 0x1c)):
                x[r] = hi(((ld(x[t]) - ld(x[r])) >> 6) + ld(x[r]))
            out.append((self.channel(0x00, left), self.channel(0x0c, right)))
        return out

    def channel(self, base, sample):
        x = self.x
        s = x[base:base + 12]
        # high-pass in
        h = hi(ld(sample) >> 2)
        b = ld(s[0]) + s[1]
        d = lim(ld(h) - ld(s[0]))
        b = mac(b, d, K1)
        s[0], s[1] = hi(b), b & 0xffffff
        y = lim(ld(h) - ld(s[0]))
        # biquad A
        st = s[2:6]
        a = biquad_fx(y, st, BQ_A)
        st[2] = lim(a)
        s[2:6] = st
        # trim and clip
        w = lim(w56(a << 1))
        c = lim(w56(mac(0, w, x[0x19]) << 8))
        # the curve
        c2 = lim(mac(0, c, c))
        c4 = lim(mac(0, c2, c2))
        t = lim(mac(0, c4, KQ))
        b = mac(0, t, c)
        p = lim((ld(c) >> 2) - b)
        # biquad B
        st = s[6:10]
        a = biquad_fx(p, st, BQ_B)
        u = lim(a)
        st[2] = u
        s[6:10] = st
        # high-pass out
        b = ld(s[10]) + s[11]
        d = lim(ld(u) - ld(s[10]))
        b = mac(b, d, K2)
        s[10], s[11] = hi(b), b & 0xffffff
        y = lim(ld(u) - ld(s[10]))
        out = lim(w56(mac(0, y, x[0x1c]) << 3))
        x[base:base + 12] = s
        return out


def render(left, right, knob_rows, frames=16, split=0, pwords=None):
    """dsp_host's schedule in the model: blocks of `frames`, a knob row per
    block (block -> (trim, pad)), and a split call first when split > 0.
    pwords: slot -> companion bits 8-15 added to that knob word every call."""
    m = Model()
    out_l, out_r = [], []
    cur = knob_rows.get(0, (13, 127))
    pw = pwords or {}
    for blk in range((len(left) + frames - 1) // frames):
        cur = knob_rows.get(blk, cur)
        words = ((cur[0] << 16) | pw.get(0, 0), (cur[1] << 16) | pw.get(1, 0))
        lo = blk * frames
        fr = list(zip(left[lo:lo + frames], right[lo:lo + frames]))
        parts = [fr[:split], fr[split:]] if split else [fr]
        for part in parts:
            for l, r in m.call(part, *words):
                out_l.append(l)
                out_r.append(r)
    return out_l, out_r, m
