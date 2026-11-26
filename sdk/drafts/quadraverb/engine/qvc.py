#!/usr/bin/env python3
"""The Quadraverb engine's integer model, its relocation into one FX2 ring, and the code generator.

A prototype (ENGINE.md, "The first bit-exact prototype"): one static factory program becomes straight-line
DSP56300 code that verify.py runs in dsp_host, bit for bit against the models here.

  python3 -B qvc.py <programs.json> <program> [--asm OUT.asm]   sizes, the code, the tables
  python3 -B qvc.py <programs.json> --all                       every program's body priced (interlock_scan's model)

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
  coefficient  c / 2048 exactly: x0 = c << 12. The original's 11-bit coefficient, as the README reads it.
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
                if cell is not None:
                    self.mem[cell] = word
                add = [0, 0 if o["latch"] else A, self.B << up, self.M << up][o["sel"]]
                self.A = wrap56(product(aw, s["c"], o["neg"], f) + add, acc_bits)
            else:
                word = 0 if cell is None else self.mem[cell]
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


# ---- delay lines and relocation ------------------------------------------------------------------

def live_read(i, s):
    """A read whose word matters: a product, a latch, or an output."""
    return s["c"] > 0 or bits(s["op"])["latch"] or i in (LEFT_STEP, RIGHT_STEP)


def analyse(steps):
    """Every live read as (line, delay): the line is the write that last stored its word (the nearest write; on a
    tie the later step in the frame), the delay in samples. A delay of 0 reads what a write earlier in this frame
    stored; a write later in the frame at the same address stored it 65,536 samples ago."""
    order = {i: j for j, i in enumerate(FRAME)}
    writes = [i for i in FRAME if steps[i]["op"] & 8]
    access, length = {}, {w: None for w in writes}
    for r in FRAME:
        s = steps[r]
        if s["op"] & 8 or not live_read(r, s):
            continue
        best = None
        for w in writes:
            d = (s["a"] - steps[w]["a"]) & 0xFFFF
            if d == 0 and order[w] > order[r]:
                d = 0x10000
            if best is None or d < best[1] or (d == best[1] and order[w] > order[best[0]]):
                best = (w, d)
        access[r] = best
        length[best[0]] = max(length[best[0]] or 0, best[1])
    return access, length


def relocate(steps, ring_max=FX2_WORDS):
    """Pack the lines head to tail: line w takes words h_w .. h_w + length_w. A write nothing reads keeps no word.
    Returns (addr by step, ring size). Raises when the lines need more than ring_max words."""
    access, length = analyse(steps)
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
    return addr, at


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


def generate(steps, addr, size, prefix="qv", schedule=True):
    """Straight-line code for one sample, the tables and init/proc around it. Returns (asm text, info).

    schedule=False is the plain form: every read's word fetched right after the access before it, every reload in the
    first free slot after its access or else right after it. schedule=True moves a read's word ahead of the stores
    before it (unless it reads one of them at delay 0) into the product before them, and puts a reload that needs an
    instruction of its own where it fills a stall (a move of A right after the instruction that computes it) and
    stays three instructions ahead of its chain's next access."""
    line_of, _ = analyse(steps)      # live read -> (line, delay)
    frame_acc = [i for i in FRAME if addr[i] is not None]      # the accesses: live reads, stores a line keeps
    reads = [i for i in frame_acc if not steps[i]["op"] & 8]
    products = [i for i in FRAME if steps[i]["c"] > 0]
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
            if s["c"]:
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
            need_y1 = s["c"] > 0 or (o["latch"] and i != IN_STEP) or (store and src == "y1")
            if need_y1:
                ops.append(rmove("a", "y1"))
            if pre:
                ops.append(pre)
            if store:
                ops.append(access(i, src, True))
            if s["c"]:
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
    return assemble_text(info, prefix), info


def assemble_text(info, P):
    size, coef, dist = info["size"], info["coef"], info["dist"]
    S = STATE
    L = len(dist)
    lines = [f"; Generated by qvc.py: one Quadraverb program as straight-line code. Ring {size} words, "
             f"{info['accesses']} accesses, {info['products']} products, {L} distances.",
             f"; State, r7+: " + "  ".join(f"{v:02x} {k}" for k, v in S.items()) +
             f"  {COEF_AT:02x}.. the coefficients.",
             "; Y: the ring at the buffer's base, the distance table after it.",
             "", "init:",
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
    for k, d in enumerate(dist):     # r4 now points at the table, just after the ring
        lines += [f"        move    #>${d:06x},x0", "        move    x0,y:(r4)+"]
    lines += [f"        lua     (r7+${COEF_AT:02x}),r4"]
    for v in coef:
        lines += [f"        move    #>${v:06x},x0", "        move    x0,x:(r4)+"]
    for c in CHAINS:
        lines += [f"        move    #>${info['first'][c]:06x},b", "        add     a,b",
                  f"        move    b,x:(r7+${S['r%d' % c]:02x})",
                  f"        move    #>${info['closure'][c]:06x},x0", f"        move    x0,x:(r7+${S['n%d' % c]:02x})"]
    lines += ["        clr     b",
              *[f"        move    b,x:(r7+${S[k]:02x})" for k in ("a2", "a1", "a0", "b", "x1")],
              f"        move    #>${SIGNATURE:06x},x0", f"        move    x0,x:(r7+${S['sig']:02x})",
              "        rts", "",
              "proc:",
              "; (L + R) / 2 into every left slot, while a and b are free.",
              "        move    r0,r1",
              "        move    #>$2,n1",
              f"        do      n7,>{P}AVGE",
              "        move    x:(r1)+,a",
              "        move    x:(r1)-,x0",
              "        add     x0,a",
              "        asr     a",
              "        move    a,x:(r1)+n1",
              f"{P}AVGE:",
              "        move    r0,r1",
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
              f"        move    #>${(-len(coef)) & 0xFFFFFF:06x},n2",
              f"        move    x:(r7+${S['a1']:02x}),a",
              f"        move    x:(r7+${S['a0']:02x}),a0",
              f"        move    x:(r7+${S['a2']:02x}),a2",
              f"        move    x:(r7+${S['b']:02x}),b",
              f"        move    x:(r7+${S['x1']:02x}),x1",
              f"        do      n7,>{P}SMPE"]
    lines += [f"{P}BODY:"] + [f"        {t}" for t in info["body"]]
    lines += [f"{P}SMPE:",
              *[f"        move    r{c},x:(r7+${S['r%d' % c]:02x})" for c in CHAINS],
              *[f"        move    n{c},x:(r7+${S['n%d' % c]:02x})" for c in CHAINS],
              f"        move    a2,x:(r7+${S['a2']:02x})",
              f"        move    a1,x:(r7+${S['a1']:02x})",
              f"        move    a0,x:(r7+${S['a0']:02x})",
              f"        move    b1,x:(r7+${S['b']:02x})",
              f"        move    x1,x:(r7+${S['x1']:02x})",
              "        move    #>$ffffff,m4",
              "        move    #>$ffffff,m5",
              "        move    #>$ffffff,m6",
              "        rts", ""]
    return "\n".join(lines)


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
