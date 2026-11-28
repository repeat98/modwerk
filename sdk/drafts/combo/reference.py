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
KNOB_DEFAULTS = {"GAIN": 40, "BASS": 64, "MID": 64, "TREB": 64, "CAB": 2, "LEV": 64,
                 "VOIC": 1, "TGHT": 64, "PRES": 0, "AXIS": 0, "DIST": 0, "MIX": 127}
PAGE1 = ("GAIN", "BASS", "MID", "TREB", "CAB", "LEV")
KNOBS = tuple(KNOB_DEFAULTS)


# ---- the float design -------------------------------------------------------

gain_g = T.gain_g


def float_combo(left, right, knobs):
    """The chain on floats in [-1, 1) for fixed knobs: one mono amp, 2x oversampled; returns two float lists."""
    kv = {**KNOB_DEFAULTS, **knobs}
    vo = T.VOICES[min(kv["VOIC"], 4)]
    hp = T.one_pole(vo["hp"]) * (kv["TGHT"] + 16) / 80
    lk, tk, dc = T.one_pole(vo["split"][0]), T.one_pole(vo["split"][1]), T.one_pole(10.0)
    pre = T.lowpass(*vo["lp"])
    ci = min(kv["CAB"], 4)
    b1, b2, b3 = T.cab_biquads(ci)
    cab = (b1, T.interp(b2, T.cab_presence(ci), kv["PRES"]), T.interp(b3, T.cab_offaxis(ci), kv["AXIS"]))
    mix = (kv["MIX"] * 65536 + kv["MIX"] * 512) / Q
    dist = kv["DIST"] / 128
    direct = 1 - T.ROOM_DIRECT * dist
    ring = [0.0] * T.RING
    taps = [[(dl, g * dist) for dl, g in side] for side in (T.ROOM_L, T.ROOM_R)]
    g = gain_g(kv["GAIN"]) * vo["drive"]
    wb, wm, wt = vo["weights"]
    gb, gm, gt = wb * kv["BASS"] / 64.0, wm * kv["MID"] / 64.0, wt * kv["TREB"] / 64.0
    ca, cb = vo["curve"]
    bias = vo["bias"]
    lev = (kv["LEV"] / 64.0) ** 2 * vo["trim"] * 0.5 / (ca - cb) / math.sqrt(vo["drive"])
    hb = halfband.coefficients(4, 0.06)
    up, down = halfband.Up(hb), halfband.Down(hb)

    def bq(c, s, x):
        b0, b1, b2, a1, a2 = c
        y = b0 * x + b1 * s[0] + b2 * s[1] - a1 * s[2] - a2 * s[3]
        s[:] = [x, s[0], y, s[2]]
        return y

    def curve(c):
        return ca * c - cb * c ** 3

    def drive(v):
        c = max(-1.0, min(1.0, v * g + bias))
        return curve(c) - curve(bias)

    sh = sl = st = sd = 0.0
    sp = [0.0] * 4
    sc = [[0.0] * 4 for _ in range(3)]
    y, yr = [], []
    for n, (xl, xr) in enumerate(zip(left, right)):
        x = (xl + xr) / 2
        sh += hp * (x - sh)
        first, second = up(bq(pre, sp, x - sh))
        p = down(drive(first), drive(second)) / math.sqrt(gain_g(kv["GAIN"])) * lev
        sl += lk * (p - sl)
        st += tk * (p - st)
        v = gb * sl + gm * (st - sl) + gt * (p - st)
        for c_, s_ in zip(cab, sc):
            v = bq(c_, s_, v)
        sd += dc * (v - sd)
        w = (v - sd) * direct
        ring[n % T.RING] = w
        wl = w + sum(g * ring[(n - dl) % T.RING] for dl, g in taps[0])
        wr = w + sum(g * ring[(n - dl) % T.RING] for dl, g in taps[1])
        y.append(max(-1.0, min(1.0, xl + mix * (wl - xl))))
        yr.append(max(-1.0, min(1.0, xr + mix * (wr - xr))))
    return y, yr


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


ROWS = T.CAB_ROWS
VROWS = T.VOICE_ROWS


class Model:
    """One instance of combo.asm. call(frames, words) runs one proc; words are the six knob words."""

    def __init__(self):
        self.x = [0] * 0x64   # X:(r7+$00..$63), as init leaves it
        self.x[0x5c] = T.RING  # samples until the ring has been written once
        self.ring, self.p = [0] * T.RING, 0

    def knobs(self, w):
        x = self.x
        vr = VROWS[min((w[6] & 0x7f0000) >> 16, 4)]
        idx = min((w[4] & 0x7f0000) >> 16, 4)
        row = ROWS[idx]
        tp, tm = w[7] & 0x7f0000, (w[7] & 0x7f00) << 8          # PRES, AXIS as k/128
        x[0x40:0x45] = list(vr[0:5])
        x[0x45:0x4a] = list(row[0:5])
        x[0x4a:0x4f] = [lim(w56(mac(0, s24(d), tp) + ld(s24(c)))) for c, d in zip(row[5:10], row[10:15])]
        x[0x4f:0x54] = [lim(w56(mac(0, s24(d), tm) + ld(s24(c)))) for c, d in zip(row[15:20], row[20:25])]
        x[0x54:0x5b] = list(vr[5:12])
        # TGHT: KHP x (t+16)/80, as KHP x ((t+16)/256 x 0.8) x 4
        u = ((w[6] & 0x7f00) << 7) + 0x080000
        f = lim(mac(0, u, 0x666666))
        x[0x54] = lim(w56(mac(0, f, x[0x54]) << 2))
        # MIX: k/128 + k/16384, so 127 is all but the last 1/16384 wet
        k = (w[8] & 0x7f00) << 8
        x[0x3a] = k + (k >> 7)
        vc, wb, wm, wt = vr[12:16]
        kn = w[0] & 0x7fffff
        u = hi(w56((ld(kn) >> 1) + ld(0x080000)))
        x[0x30] = lim(mac(0, u, u))
        ln = w[5] & 0x7fffff
        lv = lim(mac(0, ln, ln))
        x[0x38] = lim(mac(0, lim(mac(0, lv, T.COMP[(w[0] & 0x7f0000) >> 16])), vc))
        # DIST: the direct sound x (1 - 0.35 d); the reflections' gains x d, 0 until the ring is full
        d = w[8] & 0x7f0000
        f = lim(ld(0x7fffff) - mac(0, d, T.q23(T.ROOM_DIRECT)))
        x[0x38] = lim(mac(0, x[0x38], f))
        x[0x32] = lim(mac(0, hi(ld(w[1] & 0x7fffff)), wb))
        x[0x34] = lim(mac(0, hi(ld(w[2] & 0x7fffff)), wm))
        x[0x36] = lim(mac(0, hi(ld(w[3] & 0x7fffff)), wt))

    def call(self, frames, words):
        x = self.x
        self.knobs(words)
        x[0x5c] = max(0, x[0x5c] - len(frames))
        dd = 0 if x[0x5c] else words[8] & 0x7f0000
        for i, (_, g) in enumerate(T.ROOM_L + T.ROOM_R):
            x[0x5d + i] = lim(mac(0, dd, T.q23(g)))
        if x[0x3f] == 0:
            for t in range(0x30, 0x3c, 2):
                x[t + 1] = x[t]
            x[0x3f] = 1
        for t in range(0x30, 0x3c, 2):
            if abs(ld(x[t]) - ld(x[t + 1])) < ld(64):
                x[t + 1] = x[t]
        out = []
        for left, right in frames:
            for t in range(0x30, 0x3c, 2):
                x[t + 1] = hi(((ld(x[t]) - ld(x[t + 1])) >> 6) + ld(x[t + 1]))
            h = lim(self.amp(left, right))            # the wet, halved
            ring = self.ring
            ring[self.p] = h
            self.p = (self.p + 1) % T.RING
            hs = []
            for side, gi in ((T.ROOM_L, 0x5d), (T.ROOM_R, 0x5f)):
                a = ld(h)
                for j, (dl, _) in enumerate(side):
                    a = mac(a, ring[(self.p - dl - 1) % T.RING], x[gi + j])
                hs.append(lim(a))
            pair = []
            for d, h in zip((left, right), hs):       # out = 2 (d/2 + MIX (h - d/2))
                b = ld(d) >> 1
                e = lim(w56(ld(h) - b))
                b = mac(b, e, x[0x3b])
                pair.append(lim(w56(b << 1)))
            out.append(tuple(pair))
        return out

    def allpass(self, st, v, coef):
        x = self.x
        d = lim(ld(v) - ld(x[st + 1]))
        y = lim(mac(ld(x[st]), d, coef))
        x[st], x[st + 1] = v, y
        return y

    def drive(self, q):
        x = self.x
        a = w56(mac(0, q, x[0x31]) << T.VG_SHIFT)
        c = lim(w56(a + ld(x[0x57])))
        c2 = lim(mac(0, c, c))
        c3 = lim(mac(0, c2, c))
        bb = mac(0, c3, x[0x56])
        a = w56(mac(0, c, x[0x55]) - bb)
        return lim(w56(a - ld(x[0x58])))

    def amp(self, left, right):
        x = self.x
        s = x[0:0x18]
        # the mono sum, pre high-pass
        h = hi(w56(ld(left) + ld(right)) >> 3)
        b = one_pole(s, 0, h, x[0x54])
        y = lim(ld(h) - ld(hi(b)))
        # pre low-pass, with the voice's drive (limited at full scale)
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
        p = lim(w56(mac(0, lim(a), x[0x39]) << 4))
        # tone stack
        one_pole(s, 6, p, x[0x59])
        one_pole(s, 8, p, x[0x5a])
        L, Tt = s[6], s[8]
        a = mac(0, L, x[0x33])
        m = lim(ld(Tt) - ld(L))
        a = mac(a, m, x[0x35])
        hh = lim(ld(p) - ld(Tt))
        a = mac(a, hh, x[0x37])
        v = lim(w56(a << 2))
        # cabinet
        for j, sb in enumerate((0x0a, 0x0e, 0x12)):
            st = s[sb:sb + 4]
            a = biquad_fx(v, st, x[0x45 + 5 * j:0x4a + 5 * j])
            v = lim(a)
            s[sb:sb + 4] = st
        # DC blocker, then back to half of full scale
        b = one_pole(s, 0x16, v, T.KDC)
        x[0:0x18] = s
        return w56((ld(v) - ld(hi(b))) << 1)


def knob_words(k, pwords=None):
    pw = pwords or {}
    words = [(k[n] << 16) | pw.get(i, 0) for i, n in enumerate(PAGE1)]
    return words + [(k["VOIC"] << 16) | (k["TGHT"] << 8), (k["PRES"] << 16) | (k["AXIS"] << 8),
                    (k["DIST"] << 16) | (k["MIX"] << 8)]


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
