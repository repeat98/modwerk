"""GHOST CUT reference -- the integer model of ghost_cut.asm, and its P table.

A mono ring of R words in the FX2 slot records the track's mono sum,
(L + R) / 2. GRAB freezes the last LEN of it (AUTO), the next LEN (MAN) or
whatever the ring holds (OFF), bakes a 256-sample crossfade over the seam
into the ring (eight blocks) and loops it, forward, reversed or as a
pendulum: on TAPE at RATE, on GRAIN with two grains at PTCH. MIX
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
# PTCH (GRAIN): 2^(s/12) for s = -24..+24 semitones, Q20, and the last point again
# so a fraction past +24 reads it twice.
PITCH_T = [round(2 ** ((s - 24) / 12) * (1 << 20)) for s in range(49)] + [1 << 22]
# MOTN: the drift's triangle takes 1/4 to 32 bars. Its phase is 48-bit with a cycle
# of 2^45; a block (16 samples) adds tempo24 * 2K, K = 2^48 / (bars * 254,016,000)
# (a bar is 254,016,000 / tempo24 samples).
MOTN_BARS = (0.25, 0.5, 1, 2, 4, 8, 16, 32)
MOTN_LABELS = ("1/4B", "1/2B", "1B", "2B", "4B", "8B", "16B", "32B")
MOTN_K = [round((1 << 48) / (b * 254016000)) for b in MOTN_BARS]
PHASE_CYCLE = 1 << 45
TABLE = (tuple(RATE_T) + tuple(w for n in LEN_N for w in ((2 * n) >> 24, (2 * n) & 0xFFFFFF))
         + tuple(PITCH_T) + tuple(MOTN_K))
assert len(TABLE) == 33 + 16 + 50 + 8 and all(0 <= w < 1 << 23 or i in range(33, 49) for i, w in enumerate(TABLE))
PT_AT = 33 + 16
MK_AT = PT_AT + 50

CAPT_LABELS = ("AUTO", "MAN", "OFF")
ENG_LABELS = ("TAPE", "GRAIN")
GRAIN0 = 441          # GRN 0: 10 ms; each step adds 24 samples (GRN 127: 3,489, 79 ms)
GRAIN_STEP = 24
PH_ONE = 0x400000     # a grain's phase is Q22: 1.0 here
DIR_LABELS = ("FWD", "REV", "PEND")

IDLE, REC, BAKE, LOOP, REL = 0, 1, 2, 3, 4
BAKE_STEP = 32        # seam words baked a block
BAKE_LEAD = 7 * BLOCK # the loop starts this far in: where it would be had it played since GRAB


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


def clamp_t24(t24):
    if t24 < 720:
        t24 = 2880        # no or an implausible tempo word: 120 BPM
    if t24 > 7200:
        t24 = 7200        # 300 BPM
    return t24


def loop_length(len_idx, t24):
    """LEN and the tempo -> loop samples: N / tempo24, halved until it fits."""
    t24 = clamp_t24(t24)
    L = LEN_N[min(max(len_idx, 0), 7)] // t24
    for _ in range(4):
        if L > LMAX:
            L >>= 1
    return L


def pitch_q20(word):
    """PTCH's word -> 2^(s/12), s = knob - 64 clamped to +-24, its fraction between semitones."""
    x = (word & 0x7FFF00) - (40 << 16)
    x = max(0, min(48 << 16, x))
    i = x >> 16
    f = (x & 0xFF00) << 15
    t0, t1 = PITCH_T[i], PITCH_T[i + 1]
    return t0 + a1(mpy(f, t1 - t0))


def glide(cur, target, primed):
    """1/16 of the way a block, snapped within 16; unprimed, on the target."""
    s = cur if primed else target
    d = target - s
    s = s + (d >> 4)
    if abs(d) < 0x10:
        s = target
    return s


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
        self.eng = 0        # the running engine
        self.rq2 = 0        # PTCH, Q20 (glided)
        self.ph = [0, PH_ONE // 2]
        self.d = [0, 0]     # each grain's offset from the playhead, 48-bit
        self.flag = 0       # the engine knob differs from the running engine: duck
        self.baked = 0      # BAKE: seam words done
        self.mphase = 0     # the drift's triangle, 48-bit, cycle 2^45
        self.D = 0          # the second head's offset, 48-bit
        self.slope = 0      # ... and its step a sample
        self.wetR = 0

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
        self.rq = glide(self.rq, rate_q20(k[2] << 16), self.primed)
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
        if self.state == BAKE:
            self._bake(direction, inc)
        pend_end = self.L - 1
        # GRAIN: the engine, PTCH, the grain length
        eng_k = min(k[6], 1)
        self.rq2 = glide(self.rq2, pitch_q20(k[3] << 16), self.primed)
        delta = (self.rq2 - self.rq) << 4            # each grain's offset moves this a sample
        G = GRAIN0 + GRAIN_STEP * k[8]
        if G > self.L >> 2:
            G = self.L >> 2
        if G < 64:
            G = 64
        inc_g = (1 << 22) // G
        if self.state < LOOP or (self.state == LOOP and self.e == 0 and self.eng != eng_k):  # idle, rec, bake: at once
            self.eng = eng_k
            self.ph = [0, PH_ONE // 2]
            self.d = [0, 0]
        self.flag = 1 if self.eng != eng_k else 0
        # DRFT and MOTN: the second head's offset, DRFT x L/2 x a triangle over MOTN bars
        if self.state >= LOOP:
            self.mphase += 2 * clamp_t24(t24) * MOTN_K[min(k[9], 7)]
            if (self.mphase >> 24) >= PHASE_CYCLE >> 24:
                self.mphase -= PHASE_CYCLE
            h = self.mphase >> 24
            b = (PHASE_CYCLE >> 24) - h
            if b > h:
                b = h
            tri = sat(b << 3)
            m = a1(mpy(tri, (k[4] << 16) & 0x7FFF00))
            target = mpy(m, self.L >> 1)
            self.slope = (target - self.D) >> 4
        self.primed = 1
        out = []
        for (dl, dr) in frames:
            # A: the MIX run
            self.run += self.step
            # one job a sample: record (idle or recording), nothing (baking), or loop
            if self.state < BAKE:
                if self.state == REC or capt != 2:
                    self.ring[self.w] = (dl + dr) >> 1
                    self.w = (self.w + 1) % R
                    if self.state == REC:
                        self.cnt -= 1
                        if self.cnt == 0:
                            self.state = BAKE
                            self.baked = 0
            elif self.state >= LOOP:
                Lq = self.L << 24
                if direction == 0:
                    self.p += inc
                    if self.p >= Lq:
                        self.p -= Lq
                elif direction == 1:
                    self.p -= inc
                    if self.p < 0:
                        self.p += Lq
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
                if self.eng == 0:
                    self.wet = self._read(self.p)
                    self.D += self.slope
                    q2 = self.p + self.D
                    if q2 >= Lq:
                        q2 -= Lq
                    self.wetR = sat(self._read(q2))
                else:
                    self.D += self.slope
                    prod = 0
                    for i in (0, 1):
                        ph = self.ph[i] + inc_g
                        if ph >= PH_ONE:
                            ph -= PH_ONE
                            self.d[i] = 0
                        self.ph[i] = ph
                        self.d[i] += delta
                        q = self.p + self.d[i]
                        if i == 1:
                            q += self.D               # the second grain reads at the drifted head
                        if q >= Lq:
                            q -= Lq
                            if i == 1 and q >= Lq:
                                q -= Lq
                        if q < 0:
                            q += Lq
                        tap = sat(self._read(q))
                        b = PH_ONE - ph
                        if b > ph:
                            b = ph
                        w = sat(b << 2)
                        if i == 0:
                            prod = sat(a1(mpy(w, tap)))
                        else:
                            self.wet = sat(a1(mpy(w, tap) + (prod << 24)))
                            self.wetR = self.wet
                up = min(self.e + ESTEP, 0x7FFFFF)
                down = self.e - ESTEP
                a = down if self.state == REL else up
                if self.flag:
                    a = down
                if a <= 0:
                    a = 0
                    if self.state == REL:
                        self.state = IDLE
                self.e = a
            # D: the output
            mm = a1(mpy(self.run, self.e))
            wet = self.wet
            ol = sat(dl + a1(2 * mpy(mm, sat((wet - dl) >> 1))))
            orr = sat(dr + a1(2 * mpy(mm, sat((self.wetR - dr) >> 1))))
            out.append((ol, orr))
        return out

    def _read(self, q):
        """gcRD and TAPE's read: the baked loop at q (48-bit), linearly interpolated."""
        return self._interp(self.S + (q >> 24), (q & 0xFFFFFF) >> 1)

    def _bake(self, direction, inc):
        """32 words of the seam a block: the loop's tail toward the pre-roll, g = j / 256."""
        for k in range(BAKE_STEP):
            j = self.baked + k
            t = (self.S + self.L - SEAM + j) % R
            pre = self.ring[(self.S - SEAM + j) % R]
            tail = self.ring[t]
            self.ring[t] = sat(tail + a1(2 * mpy(j << 15, sat((pre - tail) >> 1))))
        self.baked += BAKE_STEP
        if self.baked < SEAM:
            return
        self.ring[(self.S + self.L) % R] = self.ring[self.S]
        self.mphase = self.D = self.slope = 0
        lead = BAKE_LEAD * inc
        self.p = (self.L << 24) - lead if direction == 1 else lead
        self.back = 0
        self.state = LOOP

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
        self.baked = 0
        self.state = BAKE

    def _release(self):
        if self.state == LOOP:
            self.state = REL
        elif self.state in (REC, BAKE):
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
