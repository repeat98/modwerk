"""COMBO's references, imported by verify.py.

float_combo: the design in double precision (what the chain is meant to do).
Model: combo.asm instruction by instruction, on 24-bit words and a 56-bit
accumulator, so dsp_host's render must match it to the bit. The constants
are tables.py's; verify.py checks that the assembly carries them.
"""
import math

import halfband
import tables as T

FS = T.FS
Q = T.Q
KNOB_DEFAULTS = {"GAIN": 40, "BASS": 64, "MID": 64, "TREB": 64, "CAB": 2, "LEV": 64}
KNOBS = tuple(KNOB_DEFAULTS)


# ---- the float design -------------------------------------------------------

gain_g = T.gain_g


def float_combo(left, right, knobs):
    """The chain on floats in [-1, 1) for fixed knobs: one mono amp, 2x oversampled; returns two float lists."""
    kv = {**KNOB_DEFAULTS, **knobs}
    hp, lk, tk, dc = T.one_pole(90.0), T.one_pole(300.0), T.one_pole(2200.0), T.one_pole(10.0)
    pre = T.lowpass(7000.0, 0.7071)
    cab = T.cab_biquads(min(kv["CAB"], 4))
    g = gain_g(kv["GAIN"])
    gb, gm, gt = kv["BASS"] / 64.0, kv["MID"] / 64.0, kv["TREB"] / 64.0
    lev = (kv["LEV"] / 64.0) ** 2
    hb = halfband.coefficients(4, 0.06)
    up, down = halfband.Up(hb), halfband.Down(hb)

    def bq(c, s, x):
        b0, b1, b2, a1, a2 = c
        y = b0 * x + b1 * s[0] + b2 * s[1] - a1 * s[2] - a2 * s[3]
        s[:] = [x, s[0], y, s[2]]
        return y

    def drive(v):
        c = max(-1.0, min(1.0, v * g))
        return 0.75 * c - 0.25 * c ** 3

    sh = sl = st = sd = 0.0
    sp = [0.0] * 4
    sc = [[0.0] * 4 for _ in range(3)]
    y = []
    for xl, xr in zip(left, right):
        x = (xl + xr) / 2
        sh += hp * (x - sh)
        first, second = up(bq(pre, sp, x - sh))
        p = down(drive(first), drive(second)) / math.sqrt(g) * lev
        sl += lk * (p - sl)
        st += tk * (p - st)
        v = gb * sl + gm * (st - sl) + gt * (p - st)
        for c_, s_ in zip(cab, sc):
            v = bq(c_, s_, v)
        sd += dc * (v - sd)
        y.append(max(-1.0, min(1.0, v - sd)))
    return y, list(y)


# ---- the fixed-point model ---------------------------------------------------

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
    """Direct form 1, halved coefficients; s = [x1, x2, y1, y2]. Returns the accumulator."""
    a = 0
    for v, k in zip((x, s[0], s[1], s[2], s[3]), c):
        a = mac(a, v, k)
    a = w56(a << 1)
    s[1], s[0], s[3] = s[0], x, s[2]
    s[2] = lim(a)
    return a


def one_pole(s, i, inp, k):
    """48-bit one-pole low-pass state at s[i] (high), s[i+1] (low): s += k (inp - s)."""
    b = ld(s[i]) + s[i + 1]
    d = lim(ld(inp) - ld(s[i]))
    b = mac(b, d, k)
    s[i], s[i + 1] = hi(b), b & 0xffffff
    return b


PRE = T.PRE
ROWS = T.CAB_ROWS


class Model:
    """One instance of combo.asm. call(frames, words) runs one proc; words are the six knob words."""

    def __init__(self):
        self.x = [0] * 0x60   # X:(r7+$00..$5f), as init leaves it

    def knobs(self, w):
        x = self.x
        kn = w[0] & 0x7fffff
        u = hi(w56((ld(kn) >> 1) + ld(0x080000)))
        x[0x30] = lim(mac(0, u, u))
        x[0x32] = hi(ld(w[1] & 0x7fffff))
        x[0x34] = hi(ld(w[2] & 0x7fffff))
        x[0x36] = hi(ld(w[3] & 0x7fffff))
        ln = w[5] & 0x7fffff
        lv = lim(mac(0, ln, ln))
        x[0x38] = lim(mac(0, lv, T.COMP[(w[0] & 0x7f0000) >> 16]))
        idx = min((w[4] & 0x7f0000) >> 16, 4)
        x[0x40:0x45] = list(PRE)
        x[0x45:0x54] = list(ROWS[idx])

    def call(self, frames, words):
        x = self.x
        self.knobs(words)
        if x[0x3f] == 0:
            for t in range(0x30, 0x3a, 2):
                x[t + 1] = x[t]
            x[0x3f] = 1
        for t in range(0x30, 0x3a, 2):
            if abs(ld(x[t]) - ld(x[t + 1])) < ld(64):
                x[t + 1] = x[t]
        out = []
        for left, right in frames:
            for t in range(0x30, 0x3a, 2):
                x[t + 1] = hi(((ld(x[t]) - ld(x[t + 1])) >> 6) + ld(x[t + 1]))
            y = lim(self.amp(left, right))
            out.append((y, y))
        return out

    def allpass(self, st, v, coef):
        x = self.x
        d = lim(ld(v) - ld(x[st + 1]))
        y = lim(mac(ld(x[st]), d, coef))
        x[st], x[st + 1] = v, y
        return y

    def drive(self, q):
        x = self.x
        c = lim(w56(mac(0, q, x[0x31]) << 10))
        c2 = lim(mac(0, c, c))
        c3 = lim(mac(0, c2, c))
        bb = mac(0, c3, T.CB)
        return lim(mac(0, c, T.CA) - bb)

    def amp(self, left, right):
        x = self.x
        s = x[0:0x18]
        # the mono sum, pre high-pass
        h = hi(w56(ld(left) + ld(right)) >> 3)
        b = one_pole(s, 0, h, T.KHP)
        y = lim(ld(h) - ld(hi(b)))
        # pre low-pass
        st = s[2:6]
        a = biquad_fx(y, st, x[0x40:0x45])
        s[2:6] = st
        x[0:0x18] = s
        q = lim(a)
        # 2x: up, the amp on both samples, down
        hb, ap = T.HALFBAND, self.allpass
        first = ap(0x1a, ap(0x18, q, hb[0]), hb[2])
        second = ap(0x1e, ap(0x1c, q, hb[1]), hb[3])
        ps = self.drive(second)
        pf = self.drive(first)
        t1 = ap(0x26, ap(0x24, pf, hb[1]), hb[3])
        t0 = ap(0x22, ap(0x20, ps, hb[0]), hb[2])
        x[0x28], x[0x29], x[0x2a] = t1, ps, q
        a = (ld(t0) + ld(t1)) >> 1
        s = x[0:0x18]
        # OUT = COMP x LEV
        p = lim(w56(mac(0, lim(a), x[0x39]) << 3))
        # tone stack
        one_pole(s, 6, p, T.KL)
        one_pole(s, 8, p, T.KT)
        L, Tt = s[6], s[8]
        a = mac(0, L, x[0x33])
        m = lim(ld(Tt) - ld(L))
        a = mac(a, m, x[0x35])
        hh = lim(ld(p) - ld(Tt))
        a = mac(a, hh, x[0x37])
        v = lim(w56(a << 1))
        # cabinet
        for j, sb in enumerate((0x0a, 0x0e, 0x12)):
            st = s[sb:sb + 4]
            a = biquad_fx(v, st, x[0x45 + 5 * j:0x4a + 5 * j])
            v = lim(a)
            s[sb:sb + 4] = st
        # DC blocker, then back to full scale
        b = one_pole(s, 0x16, v, T.KDC)
        x[0:0x18] = s
        return w56((ld(v) - ld(hi(b))) << 2)


def knob_words(k, pwords=None):
    pw = pwords or {}
    return [(k[n] << 16) | pw.get(i, 0) for i, n in enumerate(KNOBS)]


def render(left, right, knob_rows, frames=16, split=0, pwords=None):
    """dsp_host's schedule in the model: blocks of `frames`, a knob row per
    block (block -> {name: value}), and a split call first when split > 0.
    pwords: slot -> companion bits 8-15 added to that knob word every call."""
    m = Model()
    out_l, out_r = [], []
    cur = dict(KNOB_DEFAULTS)
    for blk in range((len(left) + frames - 1) // frames):
        if blk in knob_rows:
            cur = {**cur, **knob_rows[blk]}
        words = knob_words(cur, pwords)
        lo = blk * frames
        fr = list(zip(left[lo:lo + frames], right[lo:lo + frames]))
        parts = [fr[:split], fr[split:]] if split else [fr]
        for part in parts:
            for l, r in m.call(part, words):
                out_l.append(l)
                out_r.append(r)
    return out_l, out_r, m
