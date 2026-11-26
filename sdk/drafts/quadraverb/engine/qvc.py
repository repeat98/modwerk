#!/usr/bin/env python3
"""The Quadraverb engine's integer model, its relocation into one FX2 ring, and the code generator.

A prototype (ENGINE.md, "The first bit-exact prototype" and "Modulation on the DSP"): one factory program becomes
straight-line DSP56300 code that verify.py runs in dsp_host, bit for bit against the models here. A moving program
(sweeps, pitch shift, Leslie) keeps its code; its LFO runs on the DSP on tick samples and rewrites the tables
(Lfo, Moving, tick_lines).

  python3 -B qvc.py <programs.json> <program> [--asm OUT.asm]   sizes, the code, the tables
  python3 -B qvc.py <programs.json> --all                       every program's body priced (interlock_scan's model)
  python3 -B qvc.py - --moving <lfo dir>/lfo.json               every moving program's ring (its sweeps' whole range)

programs.json comes from extract.mjs and is derived from the ROM: keep it, and every generated program, outside
the repository (~/.cache/modwerk-local/quadraverb/engine/).

The integer model (Machine) is the engine's arithmetic, not a claim about the original's. Every choice that the
original might make differently is marked ASSUMPTION below and listed in ENGINE.md:

  words      24-bit two's complement fractions (the DSP56300's data width). ASSUMPTION: the original's width is
             not recorded (the converters are 16-bit; the internal words may be wider or narrower).
  store      a write stores A limited to 24 bits: A truncated (floored) to a word, or the largest word of its
             sign when A is outside [-1, 1). This is the DSP56300's move-from-accumulator limiter. ASSUMPTION:
             truncation without rounding, and saturation rather than wrap.
  A          56 bits, units of 2^-47 (a2:a1:a0); a product is (word * coefficient) << 1 as mpy/mac make it, so no
             bit of a product is lost; sums wrap at 56 bits (the DSP's arithmetic saturation mode is off).
             ASSUMPTION: the original's accumulator is wide enough not to lose product bits either.
  write's    the product of a write scales A limited to a word (y1 = A, limited, then mpy x0,y1), while a select
  product    of 01 adds the full A. ASSUMPTION (the original may scale the full accumulator).
  B, M       hold words: a read latches the word it read, a write the word it wrote (A limited, or the input at
             step 0x5e). Adding B or M adds the word. ASSUMPTION: the latches are word wide.
  coefficient  c / 2048 exactly: x0 = c << 12. The original's 11-bit coefficient, as FIRMWARE.md reads it.
  input      floor((L + R) / 2), stored as the word step 0x5e writes. Not the original's: its converter.
  outputs    the words read at steps 0x00 (left) and 0x5f (right), wet only, unscaled.

The code (generate): a is A, b is B, x1 is M; x0 holds the next product's coefficient (X, the r7 block, walked by r2),
y0 the next read's word, y1 A limited before a write. r4-r6 take the accesses in turn, each walking the ring (modulo)
with a post-added n that a reload from the distance table (Y, after the ring, walked by r3) sets for its next access;
a chain's last distance in a sample closes it for the next, and (r2)+n2, (r3)+n3 close the two tables, so nothing is
reset a sample. n7 holds the input word; r0 and r1 the left and right slots (n0 = n1 = 2). A read nothing uses (no
product, no latch, no output) and a store no read reaches are left out; their add select still acts.
"""
import json
import pathlib
import sys

FRAME = [0x5F] + list(range(0x5F))
IN_STEP, LEFT_STEP, RIGHT_STEP = 0x5E, 0x00, 0x5F
ACC_BITS = 56
FX2_WORDS = 15870      # an FX2 slot's buffer below Sidechain's key window (Midiverb's layout)


def load(path, p):
    """Program p of extract.mjs's output: (name, [{a, c, op}] by step index, static)."""
    rows = json.load(open(path))
    row = next(r for r in rows if r["p"] == p)
    return row["name"], row["steps"], row["static"]


# ---- the integer model ---------------------------------------------------------------------------

def wrap56(v, bits=ACC_BITS):
    m = 1 << bits
    v &= m - 1
    return v - m if v >> (bits - 1) else v


def lim(acc, frac=23):
    """A move from the accumulator: a1, or the largest word of its sign when a2 is not a1's sign (ASSUMPTION:
    truncation, saturation). frac: the word's fraction bits (23 on the DSP; wider only for check_model.py)."""
    top = 1 << (2 * frac + 1)
    if acc >= top:
        return (1 << frac) - 1
    if acc < -top:
        return -(1 << frac)
    return acc >> (frac + 1)


def product(word, c, neg, frac=23):
    p = (word * (c << (frac - 11))) << 1      # mpy: the Q46 product aligned to Q47 (at 23 fraction bits)
    return -p if neg else p


def bits(op):
    return dict(neg=bool(op & 0x10), write=bool(op & 8), latch=bool(op & 4), sel=op & 3, m=bool(op & 1))


class Machine:
    """The engine's arithmetic over a ring of `size` words. addr[i]: step i's address relative to the pointer, or
    None for a read nothing uses (its word then reads as 0, which changes nothing: see analyse). The pointer counts
    down once a sample, so a word written at h is read at h + d after d samples."""

    def __init__(self, steps, size, addr, frac=23):
        self.steps, self.size, self.addr = steps, size, addr
        self.frac = frac             # 23: the DSP's words. More only to measure what truncation costs (check_model)
        # The word-width rule of the stream (qvs.py, ENGINE.md "Word width"): a read in `narrow` takes its word with
        # the low 8 bits cleared (floored to 16 bits, as the word crossed SDRAM); `narrow_all` floors every store.
        self.narrow, self.narrow_all = set(), False
        self.mem = [0] * size
        self.p = 0
        self.A = 0
        self.B = 0
        self.M = 0

    def sample(self, x, tap=None):
        """x: the input word (24 bits). Returns the output words (frac + 1 bits)."""
        f = self.frac
        up, acc_bits = f + 1, 2 * f + 10
        x = x << (f - 23) if f >= 23 else x >> (23 - f)
        left = right = 0
        for i in FRAME:
            s = self.steps[i]
            o = bits(s["op"])
            a = self.addr[i]
            cell = None if a is None else (a + self.p) % self.size
            A = self.A
            if o["write"]:
                aw = lim(A, f)
                word = x if i == IN_STEP else aw
                if self.narrow_all:
                    word = (word >> 8) << 8
                if cell is not None:
                    self.mem[cell] = word
                add = [0, 0 if o["latch"] else A, self.B << up, self.M << up][o["sel"]]
                self.A = wrap56(product(aw, s["c"], o["neg"], f) + add, acc_bits)
            else:
                word = 0 if cell is None else self.mem[cell]
                if i in self.narrow:
                    word = (word >> 8) << 8
                if i == LEFT_STEP:
                    left = word
                elif i == RIGHT_STEP:
                    right = word
                add = A if (o["sel"] == 1 or (o["latch"] and o["sel"])) else \
                    [0, A, self.B << up, self.M << up][o["sel"]]
                self.A = wrap56(product(word, s["c"], o["neg"], f) + add, acc_bits)
            if o["latch"]:
                if o["m"]:
                    self.M = word
                else:
                    self.B = word
            if tap:
                tap(i, self)
        self.p = (self.p - 1) % self.size
        return left, right

    def run(self, left, right):
        out_l, out_r = [], []
        for l, r in zip(left, right):
            ol, orr = self.sample((l + r) >> 1)
            out_l.append(ol)
            out_r.append(orr)
        return out_l, out_r


def raw_machine(steps, frac=23):
    """The program as the original addresses it: 64K words, every step's own address."""
    return Machine(steps, 0x10000, [s["a"] for s in steps], frac)


# ---- the modulation (tools/qvlfo.mjs, ported byte for byte) ------------------------------------------
#
# Each kind's tick returns the firmware's writes into the DSP program as (byte address, value), exactly as
# qvlfo.mjs reconstructs them (and qvlfo.mjs checks against the firmware). extract_lfo.mjs gives every moving
# program's parameters, its start state and the firmware's program after every later tick.

def tri8(st, r):
    """The sweeps' triangle: 16-bit phase, 8-bit rate on the low byte, reflected at both ends, H flips at the top."""
    h, l = st["P"] >> 8, st["P"] & 0xFF
    if not st["D"]:
        l += r
        if l > 0xFF:
            l &= 0xFF
            h = (h + 1) & 0xFF
            if h == 0:
                st["D"] = 1
                st["H"] ^= 1
                h = 0xFF
                l = (-l) & 0xFF
                if l == 0:
                    l = 0xFF
    else:
        l -= r
        if l < 0:
            l &= 0xFF
            h = (h - 1) & 0xFF
            if h == 0xFF:
                st["D"] = 0
                h = 0
                l = (-l) & 0xFF
                if l == 0:
                    h = 1
    st["P"] = (h << 8) | l


def tri8_plain(P, D, r):
    """tri8 as the DSP computes it: up, P += r and past 0xffff P = 0x10000 - max(P - 0x10000, 1); down, P -= r and
    below 0 P = -P. Returns (P, D, flipped H). check_lfo() holds it to tri8 for every phase and direction."""
    if not D:
        P += r
        if P > 0xFFFF:
            return 0x10000 - max(P - 0x10000, 1), 1, True
        return P, 0, False
    P -= r
    return (-P, 0, False) if P < 0 else (P, 1, False)


def tri16(s, R):
    """A Leslie rotor: 16-bit rate, reflected as 0xffff - P at both ends; H flips at the top, B at the bottom."""
    if not s["D"]:
        P = s["P"] + R
        if P > 0xFFFF:
            s["D"] = 1
            s["H"] ^= 1
            P = 0xFFFF - (P & 0xFFFF)
    else:
        P = s["P"] - R
        if P < 0:
            s["D"] = 0
            s["B"] ^= 1
            P = 0xFFFF - (P & 0xFFFF)
    s["P"] = P


def shape(P, parabolic):
    """0..0xffff, largest at P = 0: 1 - p^2 squared in 8-bit pieces as the firmware does (equal to floor(P^2/65536)),
    or 1 - p."""
    if not parabolic:
        return 0xFFFF - P
    h, l = P >> 8, P & 0xFF
    return 0xFFFF - ((h * h + ((2 * h * l + ((l * l) >> 8)) >> 8)) & 0xFFFF)


def displacement(X, depth):
    return (X * depth // 256) & 0xFFFF


def pair_writes(w, near, far, centre, sign, disp):
    n, f = disp >> 8, disp & 0xFF
    a = (centre + sign * n) & 0xFFFF
    b = (a + sign) & 0xFFFF
    w += [(near * 4, a & 0xFF), (near * 4 + 1, a >> 8), (near * 4 + 2, 255 - f),
          (far * 4, b & 0xFF), (far * 4 + 1, b >> 8), (far * 4 + 2, f)]


LESLIE_TARGET = {"stop": (0x0000, 0x0000), "slow": (0x0058, 0x006A), "fast": (0x0230, 0x03DA)}


class Lfo:
    """One program's modulation: kind, parameters and state as extract_lfo.mjs gives them. tick() returns the
    firmware's writes. moves(): every address each moving read can take and the steps whose coefficient moves."""

    def __init__(self, row):
        self.kind, self.par = row["kind"], row["params"]
        self.st = json.loads(json.dumps(row["state"]))
        if self.kind == "leslie":
            # The speed bits come from MIDI, which the engine does not take: the rotors turn at the program's own
            # speed, and extract_lfo.mjs starts them there, so the rate's slew toward it never acts.
            t = LESLIE_TARGET[self.par["speed"]]
            assert (self.st["r1"]["rate"], self.st["r2"]["rate"]) == t, "the rotors start at the program's speed"

    def pairs(self):
        """The sweeps' pairs as (near, far, centre, pair sign), the near step chosen by the overall sign later."""
        return [(p["steps"], (self.par["centre"] + p["offset"]) & 0xFFFF, p["sign"], p["near"]) for p in self.par["pairs"]]

    def tick(self):
        w = []
        st, par = self.st, self.par
        if self.kind == "sweep":
            tri8(st, par["rate"])
            disp = displacement(shape(st["P"], par["parabolic"]), par["depth"])
            sgn = -1 if st["H"] else 1
            for (lo, hi), centre, psign, near in self.pairs():
                s = sgn * psign
                nf = (lo, hi) if near == "first" or s > 0 else (hi, lo)
                pair_writes(w, nf[0], nf[1], centre, s, disp)
            w.append((0x17F, 1))
        elif self.kind == "pitch":
            R = par["rate"] & 0xFFFF
            st["P"] = (st["P"] + R) & 0xFFFF
            h, l = st["P"] >> 8, st["P"] & 0xFF
            idx = ((h if h & 0x80 else 0xFF - h) << 1) & 0xFF
            w += [(0x1B * 4 + 2, self.fade[idx]), (0x1C * 4 + 2, self.fade[0xFF - idx])]
            h2 = h ^ 0x80
            h2p = h2 + 1
            h1p = (h2p & 0xFF) ^ 0x80
            w += [(0x14 * 4, h), (0x18 * 4, h2), (0x19 * 4, h2p & 0xFF), (0x15 * 4, h1p)]
            if h2p > 0xFF:
                w += [(0x15 * 4 + 1, 0x18), (0x19 * 4 + 1, 0x19)]
            elif h1p == 0xFF:
                w += [(0x15 * 4 + 1, 0x19), (0x19 * 4 + 1, 0x18)]
            else:
                w += [(0x15 * 4 + 1, 0x18), (0x19 * 4 + 1, 0x18)]
            w += [(0x16 * 4 + 2, l), (0x1A * 4 + 2, l)]
        elif self.kind == "leslie":
            st["count"] = (st["count"] + 1) & 0xFF          # the slew's clock; at the program's speed it changes nothing
            am = par["am"]
            for s, centre, (near, far), (g1s, g2s) in self.rotors():
                tri16(s, s["rate"])
                disp = displacement(shape(s["P"], True), s["depth"])
                pair_writes(w, near, far, centre, -1 if s["H"] else 1, disp)
                top = s["P"] >> 8
                Bm = (top * am) >> 8
                R0 = (0x7F - am) & 0xFF
                if not s["H"]:
                    R0 = (R0 + ((0xFF - top) >> 1)) & 0xFF
                g1, g2 = (R0 - Bm, R0 + Bm) if s["B"] else (R0 + Bm, R0 - Bm)
                w += [(g1s * 4 + 2, g1 & 0xFF), (g2s * 4 + 2, g2 & 0xFF)]
        else:
            raise ValueError(self.kind)
        w += [(0x17F, 1)] if self.kind != "sweep" else []
        return w

    def rotors(self):
        return [(self.st["r1"], 0x1900, (0x0B, 0x0C), (0x0F, 0x11)), (self.st["r2"], 0x1B00, (0x13, 0x14), (0x17, 0x19))]

    def moves(self, steps):
        """({step: every address it can take}, {steps whose coefficient moves}), from the parameters: every
        displacement in samples at both signs (sweeps, Leslie), every tap position (pitch). steps: the program."""
        addrs, coef = {}, set()

        def collect(w):
            cur = {}
            for b, v in w:
                s, k = b >> 2, b & 3
                if k == 2:
                    coef.add(s)
                elif k == 3:
                    assert b == 0x17F and v == 1, f"byte {b:#x}: an op byte that moves"
                else:
                    a = cur.get(s, steps[s]["a"])
                    cur[s] = (a & 0xFF00) | v if k == 0 else (a & 0xFF) | (v << 8)
            for s, a in cur.items():
                addrs.setdefault(s, set()).add(a)

        def sweep_all(groups, depth):
            for n in range(displacement(0xFFFF, depth) // 256 + 1):
                for sgn in (1, -1):
                    w = []
                    for near, far, centre, s in groups(sgn):
                        pair_writes(w, near, far, centre, s, n << 8)
                    collect(w)

        if self.kind == "sweep":
            def groups(sgn):
                out = []
                for (lo, hi), centre, psign, near in self.pairs():
                    s = sgn * psign
                    nf = (lo, hi) if near == "first" or s > 0 else (hi, lo)
                    out.append((nf[0], nf[1], centre, s))
                return out
            sweep_all(groups, self.par["depth"])
        elif self.kind == "leslie":
            for s, centre, (near, far), gains in self.rotors():
                coef.update(gains)
                sweep_all(lambda sgn: [(near, far, centre, sgn)], s["depth"])
        elif self.kind == "pitch":
            saved = json.loads(json.dumps(self.st))
            for h in range(256):
                self.st["P"] = ((h << 8) - self.par["rate"]) & 0xFFFF
                collect(self.tick())
            self.st = saved
        return addrs, coef


def image_of(steps):
    """The 384 bytes of a program, as the firmware holds it."""
    out = bytearray(384)
    for i, s in enumerate(steps):
        out[4 * i:4 * i + 4] = bytes([s["a"] & 0xFF, s["a"] >> 8, s["c"] >> 3, ((s["c"] & 7) << 5) | s["op"]])
    return out


def step_of(img, i):
    d = img[4 * i:4 * i + 4]
    return {"a": d[0] | d[1] << 8, "c": d[2] << 3 | d[3] >> 5, "op": d[3] & 0x1F}


def load_lfo(path, p):
    """Program p of extract_lfo.mjs's lfo.json: (row, fade table) or (None, None) when it is not there."""
    data = json.load(open(path))
    row = next((r for r in data["programs"] if r["p"] == p), None)
    return row, data.get("fade")


def ticks_of(lfo_dir, p):
    """The firmware's whole DSP program after every recorded tick (extract_lfo.mjs): a list of 384-byte images."""
    import gzip
    raw = gzip.open(pathlib.Path(lfo_dir) / f"ticks-{p}.bin.gz").read()
    return [raw[k:k + 384] for k in range(0, len(raw), 384)]


# The tick timing. The firmware's ticks come from the 8051's timer (tickUs: the emulator's cycles a tick plus the
# assumed 3-cycle interrupt response, at 1 us a cycle); the original's DSP runs at 42 samples a millisecond (the
# firmware's own conversion of delay times), so a tick comes every 10.73 of its samples (22.3 for the Leslies).
# ENGINE.md, "Tick timing": the engine keeps that figure in samples (ORIGINAL_KHZ), so a program plays sample for
# sample as on the original, its sweeps 5 % faster in seconds like its delays; --realtime uses 44.1 instead
# (ticks a second as on the original). Either way: samples a tick = INT + FRAC / 2^23, a tick lands before a sample
# whenever the count of samples to wait reaches 0, and then the count restarts at INT, or INT + 1 when FRAC's
# running sum carries.
ORIGINAL_KHZ = 42.0
ENGINE_KHZ = 44.1


def tick_timing(row, realtime=False):
    t = (ENGINE_KHZ if realtime else ORIGINAL_KHZ) * round(row["tickUs"], 2) / 1000
    i = int(t)
    f = round((t - i) * (1 << 23))
    return i, f, t


class Moving:
    """The engine with its modulation: a Machine whose steps the LFO rewrites on tick samples.

    off: step -> the offset that takes a moving read's original address to its relocated one (relocate()); None runs
    on the original's own 64K addresses (raw). The first tick comes after INT samples."""

    def __init__(self, row, fade, size, addr, off, timing, frac=23):
        self.lfo = Lfo(row)
        self.lfo.fade = fade
        self.img = image_of(row["steps"])
        steps = [step_of(self.img, i) for i in range(96)]
        self.m = Machine(steps, size, list(addr), frac)
        self.off = off
        self.INT, self.FRAC = timing[0], timing[1]
        self.wait, self.acc = self.INT, 0

    def tick(self):
        for b, v in self.lfo.tick():
            self.img[b] = v
        for i in range(96):
            s = step_of(self.img, i)
            if s != self.m.steps[i]:
                if s["a"] != self.m.steps[i]["a"]:
                    self.m.addr[i] = s["a"] if self.off is None else (s["a"] + self.off[i]) % self.m.size
                self.m.steps[i] = s

    def sample(self, x):
        if self.wait == 0:
            self.tick()
            self.acc += self.FRAC
            self.wait = self.INT + (self.acc >> 23)
            self.acc &= (1 << 23) - 1
        self.wait -= 1
        return self.m.sample(x)

    def run(self, left, right):
        out_l, out_r = [], []
        for l, r in zip(left, right):
            ol, orr = self.sample((l + r) >> 1)
            out_l.append(ol)
            out_r.append(orr)
        return out_l, out_r


# ---- delay lines and relocation ------------------------------------------------------------------

def live_read(i, s, coef=()):
    """A read whose word matters: a product (a coefficient the modulation can make non-zero counts), a latch, or an
    output."""
    return s["c"] > 0 or i in coef or bits(s["op"])["latch"] or i in (LEFT_STEP, RIGHT_STEP)


def analyse(steps, moving=None):
    """Every live read as (line, delay): the line is the write that last stored its word (the nearest write; on a
    tie the later step in the frame), the delay in samples. A delay of 0 reads what a write earlier in this frame
    stored; a write later in the frame at the same address stored it 65,536 samples ago.

    moving: (addrs, coef) from Lfo.moves(): a moving read must take its word from the same line at every address it
    can take, at a delay of at least 1, and its line covers the longest; a step whose coefficient moves is live.
    Returns (access, length, reach): reach maps a moving read to its delays from its line at every address."""
    addrs, coef = moving or ({}, set())
    order = {i: j for j, i in enumerate(FRAME)}
    writes = [i for i in FRAME if steps[i]["op"] & 8]
    for i in addrs:
        assert i not in writes, f"step {i:#x}: a write that moves"
    access, length, reach = {}, {w: None for w in writes}, {}

    def nearest(r, a):
        best = None
        for w in writes:
            d = (a - steps[w]["a"]) & 0xFFFF
            if d == 0 and order[w] > order[r]:
                d = 0x10000
            if best is None or d < best[1] or (d == best[1] and order[w] > order[best[0]]):
                best = (w, d)
        return best

    for r in FRAME:
        s = steps[r]
        if s["op"] & 8 or not live_read(r, s, coef):
            continue
        best = nearest(r, s["a"])
        if r in addrs:
            seen = {a: nearest(r, a) for a in addrs[r] | {s["a"]}}
            lines = {v[0] for v in seen.values()}
            if len(lines) != 1:
                raise ValueError(f"step {r:#x}: its sweep reads from {len(lines)} lines")
            reach[r] = {a: d for a, (_, d) in seen.items()}
            if min(reach[r].values()) < 1:
                raise ValueError(f"step {r:#x}: its sweep reaches a delay of 0")
            length[best[0]] = max(length[best[0]] or 0, max(reach[r].values()))
        access[r] = best
        length[best[0]] = max(length[best[0]] or 0, best[1])
    return access, length, reach


def relocate(steps, ring_max=FX2_WORDS, moving=None):
    """Pack the lines head to tail: line w takes words h_w .. h_w + length_w. A write nothing reads keeps no word.
    Returns (addr by step, ring size), and with moving (Lfo.moves()) also off: a moving read's relocated address is
    its original address + off[step] at every address it can take. Raises when the lines need more than ring_max
    words."""
    access, length, reach = analyse(steps, moving)
    head, at = {}, 0
    for w in sorted(length, key=lambda w: FRAME.index(w)):
        if length[w] is None:
            continue
        head[w] = at
        at += length[w] + 1
    if at > ring_max:
        raise ValueError(f"the lines need {at} words, more than {ring_max}")
    addr = [None] * 96
    for w, h in head.items():
        addr[w] = h
    for r, (w, d) in access.items():
        addr[r] = head[w] + d
    if moving is None:
        return addr, at
    off = {}
    for r, ds in reach.items():
        w = access[r][0]
        offs = {head[w] + d - a for a, d in ds.items()}
        if len(offs) != 1:
            raise ValueError(f"step {r:#x}: its sweep wraps the original's 64K ring")
        off[r] = offs.pop()
    return addr, at, off


# ---- code generation --------------------------------------------------------------------------------

DATA = {"x0", "x1", "y0", "y1", "a", "b"}
XYX, XYY = {"x0", "x1", "a", "b"}, {"y0", "y1", "a", "b"}
CHAINS = (4, 5, 6)
COEF_AT = 0x10           # r7+: the coefficient table (at most 96 words, then one word the closing fetch reads)
STATE = dict(base=0x00, r4=0x01, r5=0x02, r6=0x03, n4=0x04, n5=0x05, n6=0x06, a2=0x07, a1=0x08, a0=0x09,
             b=0x0A, x1=0x0B, sig=0x0C)
SIGNATURE = 0x515601


class Op:
    """One micro-operation: an ALU op or one move. kind: alu, x, y (a memory move in that space) or r (register to
    register). reg: the move's data register (memory moves) or (src, dst) (r). ea: the address register."""

    def __init__(self, kind, text, reads=(), writes=(), reg=None, ea=None, tag=None):
        self.kind, self.text, self.reads, self.writes = kind, text, set(reads), set(writes)
        self.reg, self.ea, self.tag = reg, ea, tag


class Ins:
    def __init__(self):
        self.alu = None
        self.moves = []

    @property
    def ops(self):
        return ([self.alu] if self.alu else []) + self.moves

    def reads(self):
        return set().union(*(o.reads for o in self.ops)) if self.ops else set()

    def writes(self):
        return set().union(*(o.writes for o in self.ops)) if self.ops else set()

    def valid(self):
        mv = self.moves
        if len(mv) > 2:
            return False
        if len(mv) == 1:
            m = mv[0]
            return not (m.kind == "r" and self.alu and not set(m.reg) <= DATA)
        if len(mv) == 2:
            k = {m.kind: m for m in mv}
            if set(k) == {"x", "y"}:
                x, y = k["x"], k["y"]
                return (x.reg in XYX and y.reg in XYY and x.ea is not None and y.ea is not None
                        and (x.ea < 4) != (y.ea < 4))
            if set(k) == {"x", "r"}:
                return k["x"].reg in XYX and k["r"].reg[0] in ("a", "b") and k["r"].reg[1] in ("y0", "y1")
            if set(k) == {"r", "y"}:
                return k["r"].reg[0] in ("a", "b") and k["r"].reg[1] in ("x0", "x1") and k["y"].reg in XYY
            return False
        return True

    def can_take(self, op):
        if op.kind == "alu" and self.alu:
            return False
        if op.reads & self.writes() or op.writes & self.writes():
            return False
        if op.kind != "alu" and any(m.kind == op.kind for m in self.moves):
            return False
        trial = Ins()
        trial.alu, trial.moves = self.alu, self.moves + [op]
        if op.kind == "alu":
            trial.alu, trial.moves = op, list(self.moves)
        return trial.valid()

    def add(self, op):
        if op.kind == "alu":
            self.alu = op
        else:
            self.moves.append(op)

    def text(self):
        order = {"x": 0, "r": 1, "y": 2}
        parts = [self.alu.text if self.alu else "move"] + [m.text for m in sorted(self.moves, key=lambda m: order[m.kind])]
        if not self.alu and not self.moves:
            return "nop"
        return " ".join(parts)


def mem_op(space, ea, n, reg, store, tag=None, post="+n"):
    """A memory move through (rEA)+nN (post '+n'), (rEA)+ ('+') or (rEA) ('')."""
    addr = f"{space}:(r{ea})" + ("+n%d" % n if post == "+n" else "+" if post == "+" else "")
    reads = {f"r{ea}"} | ({f"n{n}"} if post == "+n" else set())
    writes = {f"r{ea}"} if post else set()
    if store:
        return Op(space, f"{reg},{addr}", reads | {reg}, writes, reg, ea, tag)
    return Op(space, f"{addr},{reg}", reads, writes | {reg}, reg, ea, tag)


def alu(text, reads, writes, tag=None):
    return Op("alu", text, reads, writes, tag=tag)


def rmove(src, dst, tag=None):
    return Op("r", f"{src},{dst}", {src}, {dst}, (src, dst), tag=tag)


def generate(steps, addr, size, prefix="qv", schedule=True, mod=None, unit=False):
    """Straight-line code for one sample, the tables and init/proc around it. Returns (asm text, info).

    unit: the build a module packages (USTATE): MIX, the ring cleared over calls, init and a stale state set up
    through one subroutine, the dispatcher's r0, n7 and r6 given back.

    mod: a moving program's modulation, dict(lfo=Lfo, moving=Lfo.moves(), off=relocate()'s off, timing=tick_timing(),
    fade=the pitch crossfade). Every step whose coefficient can move is a product (its coefficient may be 0 now),
    and proc runs the samples in segments between ticks, rewriting the tables on each tick (tick_lines).

    schedule=False is the plain form: every read's word fetched right after the access before it, every reload in the
    first free slot after its access or else right after it. schedule=True moves a read's word ahead of the stores
    before it (unless it reads one of them at delay 0) into the product before them, and puts a reload that needs an
    instruction of its own where it fills a stall (a move of A right after the instruction that computes it) and
    stays three instructions ahead of its chain's next access."""
    moving = mod["moving"] if mod else None
    mcoef = moving[1] if moving else set()
    line_of, _, _ = analyse(steps, moving)      # live read -> (line, delay)
    frame_acc = [i for i in FRAME if addr[i] is not None]      # the accesses: live reads, stores a line keeps
    reads = [i for i in frame_acc if not steps[i]["op"] & 8]

    def has_product(i):
        return steps[i]["c"] > 0 or i in mcoef
    products = [i for i in FRAME if has_product(i)]
    coef = [steps[i]["c"] << 12 for i in products]
    ops = []                         # the micro-ops of one sample, in order
    fetched = set()

    def access(i, reg, store):       # its chain is assigned once every access is in order (below)
        op = Op("y", "", {reg} if store else (), () if store else {reg}, reg, 4, tag=("access", i))
        op.store = store
        return op

    def fetch_after(x):
        """Fetch the next read's word after access x, when nothing between can change it."""
        k = frame_acc.index(x)
        later = frame_acc[k + 1:]
        r2 = next((r for r in later if r in reads), None)
        if r2 is None or r2 in fetched:
            return
        between = later[:later.index(r2)]
        if between and not schedule:
            return
        if any(line_of[r2] == (w, 0) for w in between):
            return                   # it reads what one of those stores writes this sample
        fetched.add(r2)
        ops.append(access(r2, "y0", False))

    # The sample starts with the first product's coefficient and the first read's word.
    if coef:
        ops.append(mem_op("x", 2, 2, "x0", False, tag="coef", post="+"))
    assert frame_acc[0] in reads, "the first access of a frame is a read (step 0x5f)"
    fetched.add(frame_acc[0])
    ops.append(access(frame_acc[0], "y0", False))
    nprod = 0

    def coef_fetch():
        nonlocal nprod
        nprod += 1
        if nprod == len(products):   # the last product: its fetch only takes r2 back to the table's start
            return mem_op("x", 2, 2, "x0", False, tag="coefclose")
        return mem_op("x", 2, 2, "x0", False, tag="coef", post="+")

    for i in FRAME:
        s = steps[i]
        o = bits(s["op"])
        sign = "-" if o["neg"] else ""
        if not o["write"]:
            if addr[i] is None:      # a dead read: only its add select acts
                if o["sel"] == 0:
                    ops.append(alu("clr a", (), {"a"}))
                elif o["sel"] == 2:
                    ops.append(alu("tfr b,a", {"b"}, {"a"}))
                elif o["sel"] == 3:
                    ops.append(alu("tfr x1,a", {"x1"}, {"a"}))
                continue
            assert i in fetched, f"step {i:#x}: its word was not fetched"
            if i == RIGHT_STEP:
                ops.append(mem_op("x", 1, 1, "y0", True, tag="outR"))
            elif i == LEFT_STEP:
                ops.append(mem_op("x", 0, 0, "y0", True, tag="outL"))
            if o["latch"]:
                if o["m"]:
                    ops.append(rmove("y0", "x1"))
                else:
                    ops.append(alu("tfr y0,b", {"y0"}, {"b"}))
            add_a = o["sel"] == 1 or (o["latch"] and o["sel"])
            if not add_a and o["sel"] == 2:
                ops.append(alu("tfr b,a", {"b"}, {"a"}))
            elif not add_a and o["sel"] == 3:
                ops.append(alu("tfr x1,a", {"x1"}, {"a"}))
            if has_product(i):
                mac = "mpy" if o["sel"] == 0 else "mac"
                ops.append(alu(f"{mac} {sign}y0,x0,a", {"y0", "x0"} | ({"a"} if mac == "mac" else set()), {"a"},
                               tag="product"))
                ops.append(coef_fetch())
            elif o["sel"] == 0:
                ops.append(alu("clr a", (), {"a"}))
            fetch_after(i)
        else:
            # y1 = A limited: the word stored (A is replaced by B or M first for selects 10 and 11), the
            # product's operand and the latched word. Step 0x5e stores and latches the input (n7) instead.
            store = addr[i] is not None
            add_a = o["sel"] == 1 and not o["latch"]
            pre = None
            if o["sel"] == 2:
                pre = alu("tfr b,a", {"b"}, {"a"})
            elif o["sel"] == 3:
                pre = alu("tfr x1,a", {"x1"}, {"a"})
            src = "n7" if i == IN_STEP else "y1" if pre else "a"
            need_y1 = has_product(i) or (o["latch"] and i != IN_STEP) or (store and src == "y1")
            if need_y1:
                ops.append(rmove("a", "y1"))
            if pre:
                ops.append(pre)
            if store:
                ops.append(access(i, src, True))
            if has_product(i):
                mac = "mac" if (o["sel"] in (2, 3) or add_a) else "mpy"
                ops.append(alu(f"{mac} {sign}x0,y1,a", {"x0", "y1"} | ({"a"} if mac == "mac" else set()), {"a"},
                               tag="product"))
                ops.append(coef_fetch())
            elif o["sel"] == 0 or (o["sel"] == 1 and o["latch"]):
                ops.append(alu("clr a", (), {"a"}))
            if o["latch"]:
                word = "n7" if i == IN_STEP else "y1"
                if o["m"]:
                    ops.append(Op("r", f"{word},x1", {word}, {"x1"}, (word, "x1")))
                elif word == "y1":
                    ops.append(alu("tfr y1,b", {"y1"}, {"b"}))
                else:
                    ops.append(Op("r", "n7,b", {"n7"}, {"b"}, ("n7", "b")))
            if store:
                fetch_after(i)

    # The chains take the accesses in turn, in the order the code makes them.
    acc = [op for op in ops if op.tag and op.tag[0] == "access"]
    order = [op.tag[1] for op in acc]
    chain = {}
    for j, op in enumerate(acc):
        c = CHAINS[j % len(CHAINS)]
        chain[op.tag[1]] = c
        ea = f"y:(r{c})+n{c}"
        op.ea, op.text = c, (f"{op.reg},{ea}" if op.store else f"{ea},{op.reg}")
        op.reads |= {f"r{c}", f"n{c}"}
        op.writes |= {f"r{c}"}

    # Pack in order: each micro-op joins the instruction before it when the forms and the data flow allow.
    code = []
    for op in ops:
        if code and code[-1].can_take(op):
            code[-1].add(op)
        else:
            ins = Ins()
            ins.add(op)
            code.append(ins)

    def stall_after(g):
        """Whether code[g + 1] waits a cycle for an accumulator code[g] writes (A.2: arith, transfer)."""
        if g + 1 >= len(code):
            return False
        made = (code[g].alu.writes if code[g].alu else set()) | \
            {r for m in code[g].moves for r in m.writes if r in ("a", "b")}
        return any(made & m.reads for m in code[g + 1].moves)

    def place(op, lo, hi, gap_ok):
        """Put op into code[lo:hi]: a free single-move slot (an ALU op alone) where gap_ok(k), else (schedule) an
        instruction of its own where it fills a stall, else its own right at lo."""
        for k in range(lo, hi):
            if code[k].alu and not code[k].moves and code[k].can_take(op) and (gap_ok(k) or not schedule):
                code[k].add(op)
                return
        ins = Ins()
        ins.add(op)
        if schedule:
            for g in range(lo - 1, hi - 1):
                if stall_after(g) and gap_ok(g + 1, inserted=True):
                    code.insert(g + 1, ins)
                    return
        code.insert(lo, ins)

    # The input word, before the left output overwrites its slot.
    out_l = next(k for k, c in enumerate(code) if any(m.tag == "outL" for m in c.moves))
    place(Op("x", "x:(r0),n7", {"r0"}, {"n7"}, "n7", 0, tag="input"), 1, out_l, lambda k, inserted=False: True)

    # Reloads. An access (rC)+nC moves rC on to the chain's next access, so nC must hold that distance when the
    # access runs: after each access its chain's n register takes the distance its next access will add. A chain's
    # last distance in a sample closes it: to its first access in the next sample, the pointer one less.
    D = {}                           # step -> the distance its access adds
    then = {}                        # step -> the distance the reload after its access loads
    for c in CHAINS:
        mine = [k for k in order if chain[k] == c]
        for j, k in enumerate(mine):
            D[k] = ((addr[mine[j + 1]] if j + 1 < len(mine) else addr[mine[0]] - 1) - addr[k]) % size
        for j, k in enumerate(mine):
            then[k] = D[mine[(j + 1) % len(mine)]]

    def pos(i):
        return next(k for k, c in enumerate(code) for m in c.moves if m.tag == ("access", i))

    for idx, i in enumerate(order):
        c = chain[i]
        later = [k for k in order[idx + 1:] if chain[k] == c]
        k0 = pos(i)
        if later:
            k1 = pos(later[0])

            def gap_ok(k, inserted=False, k1=k1):
                return k1 + inserted - k >= 4
        else:                        # its next access is the chain's first in the next sample
            k1 = len(code)
            f = pos(next(k for k in order if chain[k] == c))

            def gap_ok(k, inserted=False, f=f):
                return len(code) + inserted - k + f >= 4
        place(mem_op("y", 3, 3, f"n{c}", False, tag=("reload", i), post="+"), k0 + 1, k1, gap_ok)
    # The distance table, in the order the reloads run; the last reload takes r3 back to the table's start.
    reloads = [m for c in code for m in c.moves if m.tag and m.tag[0] == "reload"]
    dist = [then[m.tag[1]] for m in reloads]
    reloads[-1].text = reloads[-1].text.replace("(r3)+,", "(r3)+n3,")
    reloads[-1].reads |= {"n3"}
    closure = {c: D[next(k for k in order if chain[k] == c)] for c in CHAINS}   # nC when a sample starts
    first_cell = {c: addr[next(k for k in order if chain[k] == c)] for c in CHAINS}
    body = [c.text() for c in code]
    info = dict(coef=coef, dist=dist, closure=closure, first=first_cell, size=size, words=len(body),
                accesses=len(order), products=len(products), body=body)
    if mod:
        # What a tick rewrites. A moving read k changes the distance into it, D[k], loaded by the reload after the
        # access before it on its chain, and the distance out of it, D[next]. A chain's first access in a sample is
        # reached from the last one of the sample before: it must not move (the register already points at it).
        reload_at = {m.tag[1]: j for j, m in enumerate(reloads)}
        chains = {c: [k for k in order if chain[k] == c] for c in CHAINS}
        need = []
        for k in sorted(moving[0]):
            c = chain[k]
            mine = chains[c]
            j = mine.index(k)
            assert j > 0, f"step {k:#x}: a moving read is its chain's first access"
            for x in (mine[j - 1], k):
                if x not in need:
                    need.append(x)
        dists = []
        for x in need:
            mine = chains[chain[x]]
            j = mine.index(x)
            nxt, last = (mine[j + 1], False) if j + 1 < len(mine) else (mine[0], True)
            dists.append(dict(x=x, next=nxt, last=last, slot=reload_at[mine[j - 1]],
                              first_reg=f"n{chain[x]}" if j == 0 else None))
        info.update(mod=mod, coef_index={i: products.index(i) for i in products}, dists=dists, addr=list(addr),
                    steps=steps, order=order, chain=chain, reload_at=reload_at)
    if unit:
        info["unit"] = True
    return assemble_text(info, prefix), info


def imm(v):
    return f"#>${v & 0xFFFFFF:06x}"


# A moving program's state beyond STATE: the samples left in this call, the samples before the next tick, the tick
# timing's running fraction; the LFO's own words after the coefficient table (at most 97 words from COEF_AT).
MSTATE = dict(rem=0x0D, wait=0x0E, frac=0x0F)
LFO_AT = 0x71
R7_END = 0x84            # the r7 block is $00..$83 (sdk/octabam/docs/TRAPS.md)


def lfo_words(lfo):
    """The LFO's words in the r7 block, from LFO_AT, with their start values: the phase, and the flags (bit 0
    direction D, bit 1 the half H, bit 2 the Leslie's B); the Leslie adds four scratch words for its taps."""
    st = lfo.st
    flags = lambda s: s["D"] | s["H"] << 1 | s.get("B", 0) << 2
    if lfo.kind == "sweep":
        return [("P", st["P"]), ("F", flags(st))]
    if lfo.kind == "pitch":
        return [("P", st["P"])]
    return [("P1", st["r1"]["P"]), ("F1", flags(st["r1"])), ("P2", st["r2"]["P"]), ("F2", flags(st["r2"])),
            ("S0", 0), ("S1", 0), ("S2", 0), ("S3", 0)]


def tick_lines(info, P):
    """One tick on the DSP: the LFO's step and every table entry it moves (the X coefficients through r7, the Y
    distances through r3, which points at the distance table on every sample boundary). Uses a, b, x0, x1, y0, y1
    (A, B and M are saved in the state block around it) and n3, which it restores."""
    mod, steps, addr = info["mod"], info["steps"], info["addr"]
    lfo, off = mod["lfo"], mod["off"]
    W = {k: LFO_AT + j for j, (k, _) in enumerate(lfo_words(lfo))}
    out = []
    e = out.append
    ci = info["coef_index"]
    low = lambda i: (steps[i]["c"] & 7) << 12

    def x7(k):
        return f"x:(r7+${k:02x})"

    def coef_x(i):
        return x7(COEF_AT + ci[i])

    def store_g(i):
        """a1 holds a coefficient's high byte g (any bits above): its table entry is (g & 0xff) << 15 | low << 12."""
        e("        and     #>$0000ff,a")
        e("        asl     #15,a,a")
        if low(i):
            e(f"        add     {imm(low(i))},a")
        e(f"        move    a1,{coef_x(i)}")

    def parabola_disp(depth):
        """a: P (clean). Leaves x1 = f << 15 and b = n (clean), the displacement's sample and fraction."""
        e("        asl     #7,a,b")
        e("        move    b1,x0")
        e("        move    a1,y1")
        e("        mpy     x0,y1,b")
        e("        move    b1,x0")
        e(f"        move    {imm(0xFFFF)},b")
        e("        sub     x0,b")
        disp(depth)

    def disp(depth):
        """b: X (clean). floor(X * depth / 256) = d: x1 = (d & 0xff) << 15, b = d >> 8."""
        e("        asl     #7,b,b")
        e("        move    b1,x0")
        e(f"        move    {imm(depth << 8)},y1")
        e("        mpy     x0,y1,a")
        e("        tfr     a,b")
        e("        asl     #15,b,b")
        e("        and     #>$7f8000,b")
        e("        move    b1,x1")
        e("        asr     #8,a,a")
        e("        move    a1,y0")
        e("        tfr     y0,b")

    def pair(near, far, centre, s, dest):
        """x1 = f << 15, b = n: the near step reads centre + s n with weight 255 - f, the far one a sample further
        out with f. Their relocated addresses go to dest[near], dest[far] (a register or an r7 word)."""
        e(f"        move    {imm(0x7F8000 | low(near))},a")
        e("        sub     x1,a")
        e(f"        move    a1,{coef_x(near)}")
        if low(far):
            e("        tfr     x1,a")
            e(f"        add     {imm(low(far))},a")
            e(f"        move    a1,{coef_x(far)}")
        else:
            e(f"        move    x1,{coef_x(far)}")
        for k, extra in ((near, 0), (far, s)):
            base = centre + extra
            nmax = displacement(0xFFFF, lfo_depth(k)) >> 8
            assert 0 <= base - nmax and base + nmax <= 0xFFFF, "a sweep that wraps the 16-bit address"
            e(f"        move    {imm(base + off[k])},a")
            e(f"        {'add' if s > 0 else 'sub'}     b,a")
            e(f"        move    a1,{dest[k]}")

    def lfo_depth(k):
        if lfo.kind == "sweep":
            return lfo.par["depth"]
        r = lfo.st["r1"] if k in (0x0B, 0x0C) else lfo.st["r2"]
        return r["depth"]

    regs = {}
    if lfo.kind == "sweep":
        par = lfo.par
        e(f"        move    {x7(W['P'])},a")
        e(f"        move    {x7(W['F'])},b")
        e(f"        jset    #0,b1,{P}TDN")
        e(f"        add     {imm(par['rate'])},a")
        e(f"        cmp     {imm(0xFFFF)},a")
        e(f"        jle     {P}TPS")
        e(f"        sub     {imm(0x10000)},a")
        e(f"        move    {imm(1)},x0")
        e("        cmp     x0,a")
        e("        tlt     x0,a")
        e("        neg     a")
        e(f"        add     {imm(0x10000)},a")
        e("        eor     #>$000003,b")
        e(f"        jmp     {P}TPS")
        e(f"{P}TDN:")
        e(f"        sub     {imm(par['rate'])},a")
        e(f"        jge     {P}TPS")
        e("        neg     a")
        e("        bclr    #0,b1")
        e(f"{P}TPS:")
        e(f"        move    a1,{x7(W['P'])}")
        e(f"        move    b1,{x7(W['F'])}")
        if par["parabolic"]:
            parabola_disp(par["depth"])
        else:
            e(f"        move    {imm(0xFFFF)},b")
            e("        sub     a,b")
            disp(par["depth"])
        moving_steps = sorted(mod["moving"][0])
        assert len(moving_steps) <= 4
        regs = dict(zip(moving_steps, ("x0", "y0", "y1", "x1")))
        # x1 holds f << 15 until the pairs' coefficients are written; the last pair's far step may take it after
        e(f"        move    {x7(W['F'])},a")
        e(f"        jset    #1,a1,{P}TH1")
        for sgn, label in ((1, None), (-1, f"{P}TH1")):
            if label:
                e(f"{label}:")
            plan = []
            for (lo, hi), centre, psign, near in lfo.pairs():
                s = sgn * psign
                nf = (lo, hi) if near == "first" or s > 0 else (hi, lo)
                plan.append((nf[0], nf[1], centre, s))
            # every coefficient first (they need x1), then every address
            for near, far, centre, s in plan:
                e(f"        move    {imm(0x7F8000 | low(near))},a")
                e("        sub     x1,a")
                e(f"        move    a1,{coef_x(near)}")
                if low(far):
                    e("        tfr     x1,a")
                    e(f"        add     {imm(low(far))},a")
                    e(f"        move    a1,{coef_x(far)}")
                else:
                    e(f"        move    x1,{coef_x(far)}")
            for near, far, centre, s in plan:
                for k, extra in ((near, 0), (far, s)):
                    nmax = displacement(0xFFFF, par["depth"]) >> 8
                    base = centre + extra
                    assert 0 <= base - nmax and base + nmax <= 0xFFFF, "a sweep that wraps the 16-bit address"
                    e(f"        move    {imm(base + off[k])},a")
                    e(f"        {'add' if s > 0 else 'sub'}     b,a")
                    e(f"        move    a1,{regs[k]}")
            if sgn > 0:
                e(f"        jmp     {P}TDS")
    elif lfo.kind == "pitch":
        L = len(info["dist"])
        R16 = lfo.par["rate"] & 0xFFFF
        e(f"        move    {x7(W['P'])},a")
        e(f"        add     {imm(R16)},a")
        e("        and     #>$00ffff,a")
        e(f"        move    a1,{x7(W['P'])}")
        e("        asl     #15,a,b")
        e("        and     #>$7f8000,b")
        e("        move    b1,x1")                      # l << 15, the taps' fraction
        e("        asr     #8,a,a")
        e("        move    a1,y0")                      # h, the tap in the window
        e("        tfr     y0,a")
        e(f"        jset    #7,y0,{P}TPH")
        e(f"        move    {imm(0xFF)},a")
        e("        sub     y0,a")
        e(f"{P}TPH:")
        e("        asl     a")
        e("        and     #>$0000ff,a")                # idx: the crossfade's position
        e(f"        add     {imm(L)},a")
        e("        move    a1,n3")
        e(f"        move    {imm(2 * L + 0xFF)},b")
        e("        sub     a,b")
        e("        move    y:(r3+n3),a")                # fade[idx] << 15
        e("        move    b1,n3")
        if low(0x1B):
            e(f"        add     {imm(low(0x1B))},a")
        e(f"        move    a1,{coef_x(0x1B)}")
        e("        move    y:(r3+n3),a")                # fade[0xff - idx] << 15
        if low(0x1C):
            e(f"        add     {imm(low(0x1C))},a")
        e(f"        move    a1,{coef_x(0x1C)}")
        e(f"        move    {imm(-(L - 1))},n3")
        for i in (0x16, 0x1A):
            if low(i):
                e("        tfr     x1,a")
                e(f"        add     {imm(low(i))},a")
                e(f"        move    a1,{coef_x(i)}")
            else:
                e(f"        move    x1,{coef_x(i)}")
        # the taps: 14 at the window's page + h, 18 at + (h ^ 0x80), 19 at 0x1800 + (h ^ 0x80) + 1, and 15 at
        # 0x1800 + h + 1, but 0x19ff at h = 0xfe and 0x1800 at h = 0xff (the firmware's quirk)
        hi14, hi18 = steps[0x14]["a"] & 0xFF00, steps[0x18]["a"] & 0xFF00
        e("        tfr     y0,b")
        e("        eor     #>$000080,b")
        e("        tfr     b,a")
        e(f"        add     {imm(hi18 + off[0x18])},a")
        e("        move    a1,x1")
        e("        tfr     b,a")
        e(f"        add     {imm(0x1801 + off[0x19])},a")
        e("        move    a1,y1")
        e("        tfr     y0,b")
        e(f"        add     {imm(0x1801 + off[0x15])},b")
        e("        tfr     y0,a")
        e(f"        cmp     {imm(0xFE)},a")
        e(f"        jlt     {P}TQA")
        e(f"        jgt     {P}TQB")
        e(f"        add     {imm(0x100)},b")
        e(f"        jmp     {P}TQA")
        e(f"{P}TQB:")
        e(f"        sub     {imm(0x100)},b")
        e(f"{P}TQA:")
        e(f"        add     {imm(hi14 + off[0x14])},a")
        e("        move    a1,x0")
        e("        move    b1,y0")
        regs = {0x14: "x0", 0x15: "y0", 0x18: "x1", 0x19: "y1"}
        assert set(regs) == set(mod["moving"][0])
    elif lfo.kind == "leslie":
        am = lfo.par["am"]
        scratch = {}
        for r, (s_, centre, (near, far), (g1s, g2s)) in enumerate(lfo.rotors()):
            Pw, Fw = W[f"P{r + 1}"], W[f"F{r + 1}"]
            R = s_["rate"]
            t = f"{P}L{r}"
            e(f"        move    {x7(Pw)},a")
            e(f"        move    {x7(Fw)},b")
            e(f"        jset    #0,b1,{t}DN")
            e(f"        add     {imm(R)},a")
            e(f"        cmp     {imm(0xFFFF)},a")
            e(f"        jle     {t}PS")
            e("        neg     a")
            e(f"        add     {imm(0x1FFFF)},a")
            e("        eor     #>$000003,b")
            e(f"        jmp     {t}PS")
            e(f"{t}DN:")
            e(f"        sub     {imm(R)},a")
            e(f"        jge     {t}PS")
            e("        neg     a")
            e(f"        sub     {imm(1)},a")
            e("        eor     #>$000005,b")
            e(f"{t}PS:")
            e(f"        move    a1,{x7(Pw)}")
            e(f"        move    b1,{x7(Fw)}")
            parabola_disp(s_["depth"])
            dest = {near: x7(W[f"S{2 * r}"]), far: x7(W[f"S{2 * r + 1}"])}
            scratch.update(dest)
            e(f"        move    {x7(Fw)},a")
            e(f"        jset    #1,a1,{t}H1")
            pair(near, far, centre, 1, dest)
            e(f"        jmp     {t}HD")
            e(f"{t}H1:")
            pair(near, far, centre, -1, dest)
            e(f"{t}HD:")
            # the gains: R0 = 127 - AM, plus 127 - (top >> 1) while H is 0; then R0 +- top * AM / 256, by B
            e(f"        move    {x7(Pw)},a")
            e("        asr     #8,a,a")
            e("        move    a1,x0")
            e(f"        move    {imm(am << 15)},y1")
            e("        mpy     x0,y1,a")
            e("        move    a1,y0")                  # Bm
            e(f"        move    {x7(Fw)},b")
            e(f"        move    {imm((0x7F - am) & 0xFF)},a")
            e(f"        jset    #1,b1,{t}R0")
            e(f"        move    {x7(Pw)},b")
            e("        asr     #9,b,b")
            e("        move    b1,x1")
            e(f"        add     {imm(0x7F)},a")
            e("        sub     x1,a")
            e("        and     #>$0000ff,a")
            e(f"{t}R0:")
            e("        move    a1,x1")                  # R0
            e(f"        move    {x7(Fw)},b")
            e("        tfr     x1,a")
            e(f"        jset    #2,b1,{t}B1")
            e("        add     y0,a")
            store_g(g1s)
            e("        tfr     x1,a")
            e("        sub     y0,a")
            store_g(g2s)
            e(f"        jmp     {t}GD")
            e(f"{t}B1:")
            e("        sub     y0,a")
            store_g(g1s)
            e("        tfr     x1,a")
            e("        add     y0,a")
            store_g(g2s)
            e(f"{t}GD:")
        regs = dict(zip(sorted(scratch), ("x0", "y0", "y1", "x1")))
        for k, reg in regs.items():
            e(f"        move    {scratch[k]},{reg}")
    e(f"{P}TDS:")
    # The distances: D[x] = the relocated address of x's next access on its chain - x's own (- 1 past the
    # sample's end), into the distance table's slot that the reload before x loads, and into x's n register
    # when x is its chain's first access of the sample (its reload has run already).
    for d in info["dists"]:
        x, nx = d["x"], d["next"]
        c = -1 if d["last"] else 0
        if nx in regs and x in regs:
            e(f"        tfr     {regs[nx]},a")
            e(f"        sub     {regs[x]},a")
            if c:
                e(f"        add     {imm(c)},a")
        elif nx in regs:
            e(f"        tfr     {regs[nx]},a")
            e(f"        sub     {imm(addr[x] - c)},a")
        else:
            e(f"        move    {imm(addr[nx] + c)},a")
            e(f"        sub     {regs[x]},a")
        e(f"        move    a1,y:(r3+${d['slot']:02x})")
        if d["first_reg"]:
            e(f"        move    a1,{d['first_reg']}")
    # The stream (qvs.py): a moving window's read publishes its relocated address in an r7 word.
    for k, word in mod.get("publish", {}).items():
        e(f"        move    {regs[k]},x:(r7+${word:02x})")
    return forward_branches(out)


def forward_branches(lines):
    """dsp_asm assembles no absolute jump to a label and no backward branch (sdk/octabam/docs/TRAPS.md,
    trap-bra-back): every conditional here is a forward bcc, a bit test btst + bcs/bcc."""
    import re
    out = []
    for l in lines:
        m = re.match(r"^\s+j(set|clr)\s+#(\d+),(\w+),(\w+)$", l)
        if m:
            out += [f"        btst    #{m.group(2)},{m.group(3)}", f"        {'bcs' if m.group(1) == 'set' else 'bcc'}     {m.group(4)}"]
            continue
        m = re.match(r"^\s+j(le|ge|lt|gt|eq|ne|mp)\s+(\w+)$", l)
        if m:
            out.append(f"        {'bra' if m.group(1) == 'mp' else 'b' + m.group(1)}     {m.group(2)}")
            continue
        out.append(l)
    return out


# A unit build (assemble_text with info["unit"]): the engine as a module runs it on an Octatrack, which dsp_host does not
# model. Its words in the r7 block, after the LFO's (at most $78): the ring words still to clear and where the clear is,
# the call's r0, n7 and r6 (the dispatcher's block, count and parameter page, given back), the mix's two coefficients and
# the dry scratch's address (32 Y words after the tables).
USTATE = dict(clr=0x79, clrp=0x7A, r0=0x7B, n7=0x7C, r6=0x7D, cw=0x7E, cd=0x7F, dry=0x80)
# An area build (the release package: info["area"], qvs.generate(area=...)): a unit build whose code the base writes into
# one of the slot's program areas, with the stream from the slot's record. Its own words: the dispatcher's frame flag
# (a1 at entry), whether the call before ended a frame, and whether the program still waits for a frame's first call
# after its clear. The program starts at a frame's start, so the stream's frames are whole from the first.
ASTATE = dict(qf=0x81, ended=0x82, wait=0x83)
UNIT_SIGNATURE = 0x515702   # bump with any change to the unit build's state layout
CLEAR_WORDS = 1024          # ring words a unit build clears a call (Midiverb clears 512)
MIX_SLOT = 5                # MIX on knob F, as Midiverb's
DRY_WORDS = 32              # (L, R) of up to 16 samples


def mix_m(mix):
    """MIX 0-127 as the unit build's weight m, 0-128: m = MIX + (MIX >= 64), so 0 is the dry alone, 127 the wet alone."""
    return mix + (mix >= 64)


def mix_out(wet, dry, mix):
    """The unit build's output word: floor((wet m + dry (128 - m)) / 128), as its mix pass computes it exactly."""
    m = mix_m(mix)
    return (wet * m + dry * (128 - m)) >> 7


def assemble_text(info, P):
    size, coef, dist = info["size"], info["coef"], info["dist"]
    mod = info.get("mod")
    unit = info.get("unit")
    S = STATE
    U = USTATE
    L = len(dist)
    fade = 256 if mod and mod["lfo"].kind == "pitch" else 0
    lines = [f"; Generated by qvc.py: one Quadraverb program as straight-line code. Ring {size} words, "
             f"{info['accesses']} accesses, {info['products']} products, {L} distances.",
             f"; State, r7+: " + "  ".join(f"{v:02x} {k}" for k, v in S.items()) +
             f"  {COEF_AT:02x}.. the coefficients.",
             "; Y: the ring at the buffer's base, the distance table after it."]
    area = info.get("area")
    A = ASTATE
    sig = area["sig"] if area else UNIT_SIGNATURE if unit else SIGNATURE
    if unit:
        assert area or not info.get("stream"), "a unit build carries no stream"
        assert COEF_AT + len(coef) + 1 <= LFO_AT and LFO_AT + 8 <= U["clr"] and max(U.values()) < R7_END
        assert size + L + fade + DRY_WORDS <= FX2_WORDS, "the ring, its tables and the dry scratch fit the FX2 buffer"
        lines += ["; A unit build: " + "  ".join(f"{v:02x} {k}" for k, v in U.items()) +
                  f". The dry scratch after the tables; the ring cleared {CLEAR_WORDS} words a call, the wet silent",
                  "; until it is clear. MIX on knob F. init and a proc that meets another build's state both set up",
                  f"; through {P}SETUP.", ""]
        if not area:
            lines += ["init:",
                      "        move    #>$ffffff,m4",
                      "        move    x:>$213,r4",
                      "        move    x:(r4),a",
                      f"        move    a,x:(r7+${S['base']:02x})",
                      f"        bsr     {P}SETUP",
                      "        rts"]
        setup = [f"{P}SETUP:",
                 "        move    #>$ffffff,m4",
                 f"        move    x:(r7+${S['base']:02x}),a",
                 f"        move    #>${size:06x},x0",
                 "        add     x0,a",
                 "        move    a,r4",
                 "        sub     x0,a"]
    else:
        lines += ["", "init:",
                  "        move    x:>$213,r4",
                  "        move    x:(r4),a",
                  f"        move    a,x:(r7+${S['base']:02x})",
                  "        move    a,r4",
                  "        clr     b",
                  f"        move    #>${size:06x},x0",
                  f"        do      x0,>{P}ZRING",
                  "        move    b,y:(r4)+",
                  f"{P}ZRING:",
                  "        nop"]
        setup = lines
    if area:     # an area carries its tables as P words after its code ({P}DATA), copied at its set-up
        setup += [f"        move    #>{P}DATA,r1", f"        do      #{L},{P}PDST", "        move    p:(r1)+,x0",
                  "        move    x0,y:(r4)+", f"{P}PDST:"]
        info["data"] = list(dist) + list(coef)
    else:
        for k, d in enumerate(dist):     # r4 now points at the table, just after the ring
            setup += [f"        move    #>${d:06x},x0", "        move    x0,y:(r4)+"]
    if fade:
        # The pitch crossfade after the distances (from the ROM, so only ever in a generated program)
        assert len(mod["fade"]) == 256
        for v in mod["fade"]:
            setup += [f"        move    {imm(v << 15)},x0", "        move    x0,y:(r4)+"]
    setup += [f"        lua     (r7+${COEF_AT:02x}),r4"]
    if area:
        setup += [f"        do      #{len(coef)},{P}PCOF", "        move    p:(r1)+,x0", "        move    x0,x:(r4)+",
                  f"{P}PCOF:"]
    else:
        for v in coef:
            setup += [f"        move    #>${v:06x},x0", "        move    x0,x:(r4)+"]
    for c in CHAINS:
        setup += [f"        move    #>${info['first'][c]:06x},b", "        add     a,b",
                  f"        move    b,x:(r7+${S['r%d' % c]:02x})",
                  f"        move    #>${info['closure'][c]:06x},x0", f"        move    x0,x:(r7+${S['n%d' % c]:02x})"]
    setup += ["        clr     b",
              *[f"        move    b,x:(r7+${S[k]:02x})" for k in ("a2", "a1", "a0", "b", "x1")],
              f"        move    #>${sig:06x},x0",
              f"        move    x0,x:(r7+${S['sig']:02x})"]
    if area:     # b is 0 here: the stream's words, and the program waits for a frame's first call
        setup += (info.get("stream") or {}).get("init", [])
        setup += ["        move    #>$000001,x0", f"        move    x0,x:(r7+${A['wait']:02x})",
                  f"        move    b,x:(r7+${A['ended']:02x})"]
    if mod:
        words = lfo_words(mod["lfo"])
        assert COEF_AT + len(coef) + 1 <= LFO_AT and LFO_AT + len(words) <= R7_END, "the r7 block is full"
        setup += [f"        move    {imm(mod['timing'][0])},x0", f"        move    x0,x:(r7+${MSTATE['wait']:02x})",
                  f"        move    b,x:(r7+${MSTATE['frac']:02x})"]
        for j, (_, v) in enumerate(words):
            setup += [f"        move    {imm(v)},x0", f"        move    x0,x:(r7+${LFO_AT + j:02x})"]
    if unit:
        # a holds the base: the clear starts there, the dry scratch follows the tables
        setup += [f"        move    a,x:(r7+${U['clrp']:02x})",
                  f"        move    #>${size:06x},x0",
                  f"        move    x0,x:(r7+${U['clr']:02x})",
                  f"        move    #>${size + L + fade:06x},x0",
                  "        add     x0,a",
                  f"        move    a,x:(r7+${U['dry']:02x})",
                  "        rts", ""]
        lines += ["",
                  "proc:",
                  "; The dispatcher's parameter page, count and block, given back at the end.",
                  f"        move    r6,x:(r7+${U['r6']:02x})",
                  f"        move    n7,x:(r7+${U['n7']:02x})",
                  f"        move    r0,x:(r7+${U['r0']:02x})",
                  "        move    #>$ffffff,m4",
                  *([f"        move    a1,x:(r7+${A['qf']:02x})"] if area else []),
                  "; State another build left (stock runs init only when a slot's effect id changes): set up afresh,",
                  "; keeping the slot's buffer base.",
                  f"        move    x:(r7+${S['sig']:02x}),a",
                  f"        move    #>${sig:06x},x0",
                  "        cmp     x0,a",
                  f"        beq     {P}SIGK",
                  f"        bsr     {P}SETUP",
                  f"{P}SIGK:",
                  "; MIX (F): m = MIX + (MIX >= 64), 0 to 128; the wet takes m / 256 and the dry (128 - m) / 256, doubled after.",
                  f"        move    x:(r6+${MIX_SLOT:x}),a",
                  "        and     #>$7f0000,a",
                  "        move    a1,b",
                  "        and     #>$400000,b",
                  "        asr     #6,b,b",
                  "        add     b,a",
                  "        asr     a",
                  f"        move    a1,x:(r7+${U['cw']:02x})",
                  "        move    a1,x0",
                  "        move    #>$400000,b",
                  "        sub     x0,b",
                  f"        move    b1,x:(r7+${U['cd']:02x})",
                  "; The ring still clearing: the wet stays silent.",
                  f"        move    x:(r7+${U['clr']:02x}),a",
                  "        tst     a",
                  f"        bne     {P}WIPE",
                  *([f"; An area's program starts at a frame's first call after its clear: until then the dry.",
                     f"        move    x:(r7+${A['wait']:02x}),a",
                     "        tst     a",
                     f"        beq     {P}WOK",
                     f"        move    x:(r7+${A['ended']:02x}),a",
                     "        tst     a",
                     f"        beq     {P}WDST",
                     *(["; ... and once the base names both blocks in the slot's record: take() then sees every frame.",
                        "        move    r7,b", "        lsr     #6,b", "        and     #>$00003c,b", "        add     #>$007fb0,b",
                        "        move    b1,r1", "        nop", "        move    x:(r1+$1),b", "        tst     b",
                        f"        beq     {P}WDST", "        move    x:(r1+$2),b", "        tst     b", f"        beq     {P}WDST"]
                       if info.get("stream") else []),
                     "        clr     a",
                     f"        move    a,x:(r7+${A['wait']:02x})",
                     f"{P}WOK:",
                     *(info.get("stream") or {}).get("head", [])] if area else []),
                  "; (L + R) / 2 into every left slot, while a and b are free; the dry L and R into the scratch.",
                  f"        move    x:(r7+${U['dry']:02x}),r4",
                  "        move    r0,r1",
                  "        move    #>$2,n1",
                  f"        do      n7,>{P}AVGE",
                  "        move    x:(r1)+,a",
                  "        move    x:(r1)-,x0    a,y:(r4)+",
                  "        add     x0,a          x0,y:(r4)+",
                  "        asr     a",
                  "        move    a,x:(r1)+n1",
                  f"{P}AVGE:"]
    else:
        stream = info.get("stream") or {}
        lines += stream.get("init", [])
        lines += ["        rts", "",
                  "proc:", *stream.get("head", []),
                  "; (L + R) / 2 into every left slot, while a and b are free.",
                  "        move    r0,r1",
                  "        move    #>$2,n1",
                  f"        do      n7,>{P}AVGE",
                  "        move    x:(r1)+,a",
                  "        move    x:(r1)-,x0",
                  "        add     x0,a",
                  "        asr     a",
                  "        move    a,x:(r1)+n1",
                  f"{P}AVGE:"]
    stream = info.get("stream") or {}
    lines += ["        move    r0,r1",
              "        move    #>$2,n0",
              "        move    (r1)+",
              f"        move    #>${size - 1:06x},m4",
              f"        move    #>${size - 1:06x},m5",
              f"        move    #>${size - 1:06x},m6",
              *[f"        move    x:(r7+${S['r%d' % c]:02x}),r{c}" for c in CHAINS],
              *[f"        move    x:(r7+${S['n%d' % c]:02x}),n{c}" for c in CHAINS],
              f"        move    x:(r7+${S['base']:02x}),a",
              f"        move    #>${size:06x},x0",
              "        add     x0,a",
              "        move    a,r3",
              f"        move    #>${(-(L - 1)) & 0xFFFFFF:06x},n3",
              f"        lua     (r7+${COEF_AT:02x}),r2",
              f"        move    #>${(-len(coef)) & 0xFFFFFF:06x},n2"]
    restore = [f"        move    x:(r7+${S['a1']:02x}),a",
               f"        move    x:(r7+${S['a0']:02x}),a0",
               f"        move    x:(r7+${S['a2']:02x}),a2",
               f"        move    x:(r7+${S['b']:02x}),b",
               f"        move    x:(r7+${S['x1']:02x}),x1"]
    save = [f"        move    a2,x:(r7+${S['a2']:02x})",
            f"        move    a1,x:(r7+${S['a1']:02x})",
            f"        move    a0,x:(r7+${S['a0']:02x})",
            f"        move    b1,x:(r7+${S['b']:02x})",
            f"        move    x1,x:(r7+${S['x1']:02x})"]
    tail = [*[f"        move    r{c},x:(r7+${S['r%d' % c]:02x})" for c in CHAINS],
            *[f"        move    n{c},x:(r7+${S['n%d' % c]:02x})" for c in CHAINS],
            *stream.get("tail", []),
            "        move    #>$ffffff,m4",
            "        move    #>$ffffff,m5",
            "        move    #>$ffffff,m6"]
    if unit:
        tail += ["; out = (wet m + dry (128 - m)) / 128, exactly: m = 128 is the wet alone, 0 the dry alone.",
                 f"        move    x:(r7+${U['r0']:02x}),r0",
                 f"        move    x:(r7+${U['dry']:02x}),r4",
                 f"        move    x:(r7+${U['n7']:02x}),n7",
                 f"        move    x:(r7+${U['cw']:02x}),y1",
                 f"        move    x:(r7+${U['cd']:02x}),x1",
                 f"        do      n7,>{P}MIXE",
                 "        move    x:(r0)+,x0    y:(r4)+,y0",
                 "        mpy     x0,y1,a       x1,x0",
                 "        mac     y0,x0,a       x:(r0)-,x0    y:(r4)+,y0",
                 "        asl     a",
                 "        mpy     x0,y1,b       x1,x0",
                 "        mac     y0,x0,b       a,x:(r0)+",
                 "        asl     b",
                 "        move    b,x:(r0)+",
                 f"{P}MIXE:",
                 f"        move    x:(r7+${U['r6']:02x}),r6",
                 "        rts", "",
                 "; A call while the ring clears: the next words of it, and the dry at its mix.",
                 f"{P}WIPE:",
                 f"        move    x:(r7+${U['clrp']:02x}),r4",
                 f"        move    #>${CLEAR_WORDS:06x},x0",
                 "        cmp     x0,a",
                 "        tgt     x0,a",
                 f"        move    x:(r7+${U['clr']:02x}),b",
                 "        sub     a,b",
                 f"        move    b1,x:(r7+${U['clr']:02x})",
                 "        move    a1,x1",
                 "        clr     a",
                 f"        do      x1,>{P}WIPL",
                 "        move    a,y:(r4)+",
                 f"{P}WIPL:",
                 f"        move    r4,x:(r7+${U['clrp']:02x})",
                 *([f"{P}WDST:", f"        move    x:(r7+${A['qf']:02x}),x0",
                    f"        move    x0,x:(r7+${A['ended']:02x})"] if area else []),
                 f"        move    x:(r7+${U['cd']:02x}),y1",
                 f"        do      n7,>{P}WDRY",
                 "        move    x:(r0),x0",
                 "        mpy     x0,y1,a",
                 "        asl     a",
                 "        move    a,x:(r0)+",
                 "        move    x:(r0),x0",
                 "        mpy     x0,y1,a",
                 "        asl     a",
                 "        move    a,x:(r0)+",
                 f"{P}WDRY:",
                 f"        move    x:(r7+${U['r6']:02x}),r6",
                 "        rts", ""] + setup
    else:
        tail += ["        rts", ""]
    body = [f"{P}BODY:"] + [f"        {t}" for t in info["body"]]
    if not mod:
        lines += restore + [f"        do      n7,{P}SMPE"] + body + [f"{P}SMPE:"] + save + tail
        return "\n".join(lines + ([f"{P}DATA:"] if area else []))
    M = MSTATE
    INT, FRAC = mod["timing"][0], mod["timing"][1]
    nseg = 16 // INT + 2          # segments a call of up to 16 samples can need: ticks come INT or more apart
    seg = [f"        move    n7,x:(r7+${M['rem']:02x})",
           "; The samples run in segments: up to the next tick or the call's end. A tick rewrites the tables",
           "; between two samples, with A, B and M saved. An idle segment skips to the outer loop's end.",
           f"        do      #{nseg},{P}OUTE",
           f"{P}SEG:",
           f"        move    x:(r7+${M['rem']:02x}),a",
           "        tst     a",
           f"        jeq     {P}SKIP",
           f"        move    x:(r7+${M['wait']:02x}),b",
           "        tst     b",
           f"        jne     {P}RUN",
           f"{P}TICK:"]
    seg += tick_lines(info, P)
    seg += [f"        move    x:(r7+${M['frac']:02x}),a",
            f"        add     {imm(FRAC)},a",
            f"        move    {imm(INT)},b",
            f"        jclr    #23,a1,{P}NC",
            "        bclr    #23,a1",
            "        add     #1,b",
            f"{P}NC:",
            f"        move    a1,x:(r7+${M['frac']:02x})",
            f"        move    x:(r7+${M['rem']:02x}),a",
            f"{P}TEND:",
            f"{P}RUN:",
            "        cmp     b,a",
            "        tgt     b,a",
            "        sub     a,b",
            f"        move    b1,x:(r7+${M['wait']:02x})",
            "        move    a1,x0",
            f"        move    x:(r7+${M['rem']:02x}),b",
            "        sub     a,b",
            f"        move    b1,x:(r7+${M['rem']:02x})",
            *restore,
            f"        do      x0,{P}SMPE"]
    lines += forward_branches(seg) + body + [f"{P}SMPE:"] + save + [f"{P}SKIP:", "        nop", f"{P}OUTE:"] + tail
    return "\n".join(lines + ([f"{P}DATA:"] if area else []))


def price(body, reps=3):
    """The body's cycles a sample by sdk/cycle-scan/interlock_scan.py's model, run as a loop (reps passes, so the
    stalls across the loop's end count), and its stalls by kind."""
    root = next(up for up in pathlib.Path(__file__).resolve().parents if (up / "sdk/cycle-scan").exists())
    sys.path.insert(0, str(root / "sdk/cycle-scan"))
    import interlock_scan as IS
    seq = [IS.Ins(k, t, 1) for k, t in enumerate(body * reps)]
    total, stalls, _ = IS.analyze(seq)
    return total / reps, {k: v / reps for k, v in stalls.items() if v}


def main(argv):
    path = argv[0]
    if argv[1] == "--all":
        # Every program's body as compiled from its snapshot (moving programs at one moment), priced by the model.
        # The relocation is not limited here: only the code's shape is priced.
        rows = []
        for r in json.load(open(path)):
            addr, size = relocate(r["steps"], ring_max=1 << 30)
            for schedule in (False, True):
                _, info = generate(r["steps"], addr, size, schedule=schedule)
                cyc, st = price(info["body"])
                rows.append((schedule, cyc, r["p"], r["name"], info["words"], size, st))
        for schedule in (False, True):
            rs = sorted(x for x in rows if x[0] == schedule)
            cs = [x[1] for x in rs]
            print(f"{'scheduled' if schedule else 'plain    '}: cycles a sample (the body) min {cs[0]:.0f}  median "
                  f"{cs[len(cs) // 2]:.0f}  max {cs[-1]:.0f}; instructions {min(x[4] for x in rs)}-{max(x[4] for x in rs)}")
            for x in rs[:2] + rs[-3:]:
                print(f"    {x[2]:2d} {x[3]:16s} {x[1]:5.1f} cycles  {x[4]} instructions  ring {x[5]}  stalls "
                      + ", ".join(f"{k} {v:.0f}" for k, v in x[6].items()))
        return
    if argv[1] == "--moving":
        # Every moving program extract_lfo.mjs gives: its ring with every sweep's whole range, and whether it fits.
        data = json.load(open(argv[2]))
        fit = []
        for r in data["programs"]:
            lfo = Lfo(r)
            lfo.fade = data["fade"]
            addr, size, off = relocate(r["steps"], 1 << 30, lfo.moves(r["steps"]))
            if size <= FX2_WORDS:
                fit.append(r["p"])
            print(f"{r['p']:2d} {r['name']:16s} {r['kind']:6s} ring {size:6d} words"
                  + ("  fits the FX2 buffer" if size <= FX2_WORDS else ""))
        print(f"{len(fit)} of {len(data['programs'])} fit {FX2_WORDS} words: {fit}")
        return
    p = int(argv[1])
    name, steps, static = load(path, p)
    addr, size = relocate(steps)
    text, info = generate(steps, addr, size)
    print(f"{p} {name}: static {static}, ring {size} words, {info['accesses']} accesses, {info['products']} products, "
          f"{info['words']} instructions a sample")
    if "--asm" in argv:
        open(argv[argv.index("--asm") + 1], "w").write(text)
    else:
        print("\n".join(info["body"]))


if __name__ == "__main__":
    main(sys.argv[1:])
