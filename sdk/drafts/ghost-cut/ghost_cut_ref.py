"""GHOST CUT reference -- the integer model of ghost_cut.asm, and its P table.

Milestone A: the TAPE engine. A mono ring of R words in the FX2 slot records
the track's mono sum, (L + R) / 2. GRAB freezes the last LEN of it (AUTO), the
next LEN (MAN) or whatever the ring holds (OFF) and loops it at RATE, forward,
reversed or as a pendulum, with a 256-sample crossfade over the seam. MIX
blends the loop over the dry track; MIX 0 and an idle loop are exact dry.

This file follows the DSP's order of operations and its fixed-point steps
(24-bit words, 48-bit products, floor shifts), so verify.py compares the DSP's
render with it sample for sample. It is also the source of TABLE, the P table
the manifest hands the build (RATE's 33 points, then LEN's 8 dividends).
"""

R = 0x3DFE            # ring words: the FX2 slot up to +$3DFD (Sidechain's key window starts at +$3DFE)
SEAM = 256            # crossfade samples over the loop seam (and the pre-roll it reads)
LMAX = R - SEAM - 16  # the longest loop: 15,598 samples, 353.7 ms
ESTEP = 0x8000        # the loop envelope's step a sample: 256 samples dry <-> loop
BLOCK = 16
CLEAR_BLOCKS = 124    # the ring is cleared 128 words a block after init: ceil(R / 128)
FS = 0x7FFFFF

# RATE: 4^((k - 64) / 64), so 0 is 1/4 x, 64 is 1 x, 127 just under 4 x; Q20 at
# k = 4i, i = 0..32, read with the knob's low bits and LFO fraction between points.
RATE_T = [round(4 ** ((4 * i - 64) / 64) * (1 << 20)) for i in range(33)]
# LEN: 1/64, 1/32, 3/64, 1/16, 3/32, 1/8, 3/16, 1/4 of a whole note. Samples of
# a 1/64 note: 44100 * 60 * 4 / 64 / BPM = 3,969,000 / tempo24 (tempo24 = BPM * 24).
LEN_MULT = [1, 2, 3, 4, 6, 8, 12, 16]
LEN_LABELS = ("1/64", "1/32", "3/64", "1/16", "3/32", "1/8", "3/16", "1/4")
LEN_N = [3969000 * m for m in LEN_MULT]
# The table holds 2N: the DSP's 24 div steps on a 48-bit dividend (high word in
# a1, low in a0) leave (dividend / 2) / divisor in a0, measured in dsp_host.
TABLE = tuple(RATE_T) + tuple(w for n in LEN_N for w in ((2 * n) >> 24, (2 * n) & 0xFFFFFF))
assert len(TABLE) == 33 + 16 and all(0 <= w < 1 << 24 for w in TABLE)

CAPT_LABELS = ("AUTO", "MAN", "OFF")
DIR_LABELS = ("FWD", "REV", "PEND")

IDLE, REC, LOOP, REL = 0, 1, 2, 3


def mpy(x, y):
    """mpy x0,y1,a: the 48-bit product of two Q23 words, as an integer (2xy)."""
    return 2 * x * y


def a1(v48):
    """The high word of a 48-bit accumulator value (a floor)."""
    return v48 >> 24


def sat(v):
    return max(-0x800000, min(0x7FFFFF, v))


def tempo24(bpm):
    """What dsp_host -tempo and the stock frame builder publish: BPM * 24."""
    return int(bpm * 24 + 0.5) & 0xFFFF


def loop_length(len_idx, t24):
    """LEN and the tempo -> loop samples: N / tempo24, halved until it fits."""
    if t24 < 720:
        t24 = 2880        # no or an implausible tempo word: 120 BPM
    if t24 > 7200:
        t24 = 7200        # 300 BPM
    L = LEN_N[min(max(len_idx, 0), 7)] // t24
    for _ in range(4):
        if L > LMAX:
            L >>= 1
    return L


def rate_q20(word):
    """vb_tab on RATE's word: the table's point and the knob's fraction between."""
    u = word & 0x7FFF00
    i = u >> 18
    f = (u & 0x03FF00) << 5
    t0, t1 = RATE_T[i], RATE_T[i + 1]
    return t0 + a1(mpy(f, t1 - t0))


class GhostCut:
    """One instance, fed a block at a time, as dsp_host's proc calls do."""

    def __init__(self):
        self.ring = [0] * R
        self.clear = CLEAR_BLOCKS
        self.state = IDLE
        self.latch = 0
        self.w = 0
        self.S = 0
        self.L = 0
        self.p = 0          # 48-bit play position: integer in the high word, fraction in the low
        self.back = 0       # PEND: 1 while moving backwards
        self.e = 0
        self.run = 0
        self.step = 0
        self.cnt = 0
        self.rq = 0
        self.primed = 0
        self.wet = 0

    def block(self, knobs, frames, t24=0):
        """knobs: the 12 slot values (ints); frames: [(l, r)], processed in place."""
        if self.clear:
            self.clear -= 1
            return list(frames)
        k = list(knobs) + [0] * (12 - len(knobs))
        capt = min(k[7], 2)
        direction = min(k[10], 2)
        L_target = loop_length(k[0], t24)
        # RATE glide: 1/16 of the way a block, snapped within 16
        target = rate_q20(k[2] << 16)
        s = self.rq if self.primed else target
        d = target - s
        s = s + (d >> 4)
        if abs(d) < 0x10:
            s = target
        self.rq = s
        inc = self.rq << 4          # asr #20 of rq in a 48-bit accumulator: int.frac
        # MIX run
        u = (k[5] << 16) & 0x7FFF00
        m = 0x7FFFFF if u >= 0x7F0000 else u
        if not self.primed:
            self.run = m
        d = m - self.run
        if abs(d) < 0x80:
            self.run = m
            self.step = 0
        else:
            self.step = d >> 7
        # GRAB, with hysteresis: grab at 96 or more, release at 32 or less
        g = k[1]
        if not self.latch:
            if g >= 96:
                self.latch = 1
                self._grab(capt, L_target)
        elif g <= 32:
            self.latch = 0
            self._release()
        seam0 = self.L - SEAM
        pend_end = self.L - 1
        self.primed = 1
        out = []
        for (dl, dr) in frames:
            # A: the MIX run
            self.run += self.step
            # B: the ring write (idle or recording), and MAN's countdown
            if self.state < LOOP:
                if self.state == REC or capt != 2:
                    self.ring[self.w] = (dl + dr) >> 1
                    self.w = (self.w + 1) % R
                    if self.state == REC:
                        self.cnt -= 1
                        if self.cnt == 0:
                            self.state = LOOP
                            self.p = 0
                            self.back = 0
            # C: the loop read and the envelope
            if self.state >= LOOP:
                if direction == 0:
                    self.p += inc
                    if self.p >= self.L << 24:
                        self.p -= self.L << 24
                elif direction == 1:
                    self.p -= inc
                    if self.p < 0:
                        self.p += self.L << 24
                elif not self.back:
                    self.p += inc
                    if self.p >= pend_end << 24:
                        self.p = 2 * (pend_end << 24) - self.p
                        self.back = 1
                else:
                    self.p -= inc
                    if self.p < 0:
                        self.p = -self.p
                        self.back = 0
                pi = self.p >> 24
                fr = (self.p & 0xFFFFFF) >> 1
                wet = self._interp(self.S + pi, fr)
                if direction != 2 and pi - seam0 >= 0:
                    gq = (pi - seam0) << 15
                    tw = self._interp(self.S + pi - self.L, fr)
                    wet = sat(wet + a1(2 * mpy(gq, sat((tw - wet) >> 1))))
                self.wet = wet
                if self.state == LOOP:
                    self.e = min(self.e + ESTEP, 0x7FFFFF)
                else:
                    self.e -= ESTEP
                    if self.e <= 0:
                        self.e = 0
                        self.state = IDLE
            # D: the output
            mm = a1(mpy(self.run, self.e))
            wet = self.wet
            ol = sat(dl + a1(2 * mpy(mm, sat((wet - dl) >> 1))))
            orr = sat(dr + a1(2 * mpy(mm, sat((wet - dr) >> 1))))
            out.append((ol, orr))
        return out

    def _interp(self, pos, fr):
        s0 = self.ring[pos % R]
        s1 = self.ring[(pos + 1) % R]
        return sat(s0 + a1(2 * mpy(fr, sat((s1 - s0) >> 1))))

    def _grab(self, capt, L_target):
        if self.state == REL:
            self.state = LOOP
            return
        if self.state != IDLE:
            return
        self.L = L_target
        if capt == 1:
            self.S = self.w
            self.cnt = self.L
            self.state = REC
            return
        self.S = (self.w - self.L) % R
        self.p = 0
        self.back = 0
        self.state = LOOP

    def _release(self):
        if self.state == LOOP:
            self.state = REL
        elif self.state == REC:
            self.state = IDLE


def render(left, right, schedule, t24=0):
    """left/right: ints; schedule: {block: [12 knob values]} (from that block on)."""
    gc = GhostCut()
    knobs = schedule[min(schedule)]
    outl, outr = [], []
    n = len(left)
    for b in range(-(-n // BLOCK)):
        if b in schedule:
            knobs = schedule[b]
        fr = [(left[i], right[i]) if i < n else (0, 0) for i in range(b * BLOCK, (b + 1) * BLOCK)]
        for (ol, orr) in gc.block(knobs, fr, t24):
            outl.append(ol)
            outr.append(orr)
    return outl[:n], outr[:n]
