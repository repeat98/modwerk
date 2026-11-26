#!/usr/bin/env python3
"""The Quadraverb engine's SDRAM stream: which delay reads go to a ColdFire-side ring, the fixed transfer plan, a model
of the ColdFire's side, and the DSP's copy code (ENGINE.md, "The SDRAM stream").

  python3 -B qvs.py <programs.json> --all [--lfo DIR] [--lat FRAMES]      every program's split, sizes and halfwords
  python3 -B qvs.py <programs.json> <program> [--lfo DIR] [--lat FRAMES]  one program's plan, then the models' gate

What moves. A read r of line w at delay D (qvc.analyse) takes the word w stored D samples ago. When D is at least
16 * LAT (the round trip, LAT frames), the ColdFire can send that word in time: the DSP sends each frame's 16 new head
words of w out, the ColdFire keeps them in an SDRAM ring and sends back, LAT frames later, the run the read takes in
its next frame. So a line keeps only its head (16 samples, or up to its longest read that stays) in the DSP's ring, and
each streamed read gets a window. Reads of one line less than 16 apart share a window.

The DSP's ring stays one modulo ring walked by a pointer that counts down a sample (qvc). Every region in it, a line or
a window, is read and written only at its own addresses relative to that pointer, so the step code is unchanged: only
its addresses move. A window of W words is a line whose head is written W words at a time at the frame's start, by the
copy: word i of the run at the region's head + i (pointer-relative, newest first), and a read at line delay D reads it
at the region's local delay e = 15 + D - Dmin. During the frame the pointer walks 16 words down the run; the region
above takes the words already read (ENGINE.md has the proof in prose).

A moving read (a sweep's swept pair) is a window whose run moves with the read: the DSP publishes the read's address
(U, pointer-relative) in each outgoing block, and keeps the last LAT values. At frame k both sides take the value
published at frame k - LAT, U_old, and the run starts at line delay B = D(U_old) + lo; lo and hi are the read's whole
drift (every tap of the window, against the published one) over LAT + 1 frames, computed here over the LFO's whole
cycle, so the window is W = 16 + hi - lo words. The region holds every B the read can take (R = Bmax - Bmin + W words);
the copy writes its W words at the region's offset B - Bmin. Nothing on the ColdFire runs the LFO.

Words. The channel carries 16 bits a word. The DSP sends a word floored to its top 16 bits (word >> 8) in the low 16
bits; the halfword it receives lands in the low 16 bits with bits 16-23 unknown (probe A on the unit, 26 November
2026), so the copy ignores them: (word & $ffff) << 8. Every read through the stream therefore takes a 16-bit word; the
reference model (qvc.Machine.narrow) floors exactly those reads. Every other word keeps 24 bits.

Blocks. In-block (ColdFire -> DSP, read in frame k): each static window's run, then each moving window's, W words each,
newest first. Out-block (DSP -> ColdFire, written in frame k): each streamed line's 16 head words, newest first, then
each moving window's published U. The ColdFire uses out-block j for in-block j + LAT at the earliest.
"""
import collections
import json
import math
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import qvc  # noqa: E402

N = 16                 # samples a frame
LAT = 4                # frames from an out-block to the in-block that can use it (ASSUMPTION, FIRMWARE.md "Memory": 64 samples)
FADE_WORDS = 256       # the pitch crossfade after the distance table


# ---- the moving reads' drift -----------------------------------------------------------------------------------

def groups_of(row, moving):
    """The moving reads that share a window: a sweep's pair, a Leslie rotor's pair, a pitch shift's tap pair."""
    kind = row["kind"]
    if kind == "sweep":
        gs = [tuple(p["steps"]) for p in row["params"]["pairs"]]
    elif kind == "leslie":
        gs = [(0x0B, 0x0C), (0x13, 0x14)]
    else:
        gs = [(0x14, 0x15), (0x18, 0x19)]
    return [tuple(s for s in g if s in moving[0]) for g in gs if any(s in moving[0] for s in g)]


def ticks_for(row):
    """Ticks that cover the LFO's whole cycle (each phase in both directions and halves), plus a margin."""
    if row["kind"] == "sweep":
        return min(4 * 65536 // max(row["params"]["rate"], 1) + 256, 600000)
    if row["kind"] == "leslie":
        return min(4 * 65536 // max(min(row["state"]["r1"]["rate"], row["state"]["r2"]["rate"]), 1) + 256, 600000)
    return 65536 + 256


def track(row, fade, taps):
    """Each tap's original address after every tick (index 0: before the first)."""
    lfo = qvc.Lfo(row)
    lfo.fade = fade
    cur = {t: row["steps"][t]["a"] for t in taps}
    seq = [tuple(cur[t] for t in taps)]
    for _ in range(ticks_for(row)):
        for b, v in lfo.tick():
            s, k = b >> 2, b & 3
            if s in cur and k < 2:
                cur[s] = (cur[s] & 0xFF00) | v if k == 0 else (cur[s] & 0xFF) | (v << 8)
        seq.append(tuple(cur[t] for t in taps))
    return seq


def drift(seq, a_w, lat, int_samples):
    """(lo, hi, Dmin_rep, Dmax_rep) for a window whose first tap is published: every tap's delay minus the published
    one's, at most M ticks later, where M is the most ticks that fit between a frame's start and the end of the frame
    lat frames on (ticks come int_samples or more apart)."""
    M = (N * (lat + 1) - 1) // int_samples + 1
    D = [tuple((a - a_w) & 0xFFFF for a in s) for s in seq]
    lo, hi = 1 << 20, -(1 << 20)
    tmin = [min(d) for d in D]
    tmax = [max(d) for d in D]
    for i in range(len(D) - M):
        r = D[i][0]
        lo = min(lo, min(tmin[i:i + M + 1]) - r)
        hi = max(hi, max(tmax[i:i + M + 1]) - r)
    reps = [d[0] for d in D]
    return lo, hi, min(reps), max(reps), M


# ---- the plan --------------------------------------------------------------------------------------------------

class Window:
    def __init__(self, **kw):
        self.__dict__.update(kw)

    def __repr__(self):
        return f"Window({self.__dict__})"


def static_windows(reads):
    """Group (step, D) reads sorted by D into windows: a read joins the last window when it is less than 16 past it."""
    out = []
    for r, d in sorted(reads, key=lambda x: x[1]):
        if out and d - out[-1]["dmax"] < N:
            out[-1]["taps"].append((r, d))
            out[-1]["dmax"] = d
        else:
            out.append(dict(taps=[(r, d)], dmin=d, dmax=d))
    return [Window(kind="static", taps=w["taps"], dmin=w["dmin"], W=N + w["dmax"] - w["dmin"],
                   R=N + w["dmax"] - w["dmin"]) for w in out]


class Plan:
    """One program's split. kind: 'static' or the LFO's kind. Attributes after build():
      local      {line: local length} for every line (its words are length + 1)
      streamed   [line] in ring order, each keeping local[line] (16 or more) words of head
      windows    [Window] static first (in-block order), then moving: line, taps [(step, D)], W, R, h (ring head);
                 moving: rep, lo, hi, Bmin, Bmax, U0 (the published address at init)
      addr, size, off    as qvc.relocate gives them (off for every moving read)
      narrow     the reads that take their word through the stream
      in_words, out_words   halfwords a frame each way"""

    def __init__(self, steps, row=None, fade=None, lat=LAT, budget=None, force=(), reserve=0):
        self.steps, self.row, self.fade, self.lat = steps, row, fade, lat
        self.kind = row["kind"] if row else "static"
        self.moving = None
        if row:
            lfo = qvc.Lfo(row)
            lfo.fade = fade
            self.moving = lfo.moves(steps)
            self.timing = qvc.tick_timing(row)
        self.access, self.length, self.reach = qvc.analyse(steps, self.moving)
        self.accesses = sum(1 for i in qvc.FRAME if i in self.access) + sum(1 for w, l in self.length.items() if l is not None)
        tables = self.accesses + (FADE_WORDS if self.kind == "pitch" else 0)
        self.budget = (qvc.FX2_WORDS - tables - reserve) if budget is None else budget   # reserve: a unit build's dry scratch
        self.force = set(force)       # lines to stream as far as they can, fit or not (a test)
        self._drift = {}

    # every item on a line: ('s', step, D) or ('g', taps, Dmin_reach, Dmax_reach)
    def items(self, w):
        out = []
        moving = self.moving[0] if self.moving else {}
        grouped = set()
        if self.row:
            for g in groups_of(self.row, self.moving):
                g = tuple(s for s in g if s in self.access and self.access[s][0] == w)
                if g:
                    ds = [d for s in g for d in self.reach[s].values()]
                    out.append(("g", g, min(ds), max(ds)))
                    grouped.update(g)
        for r, (line, d) in self.access.items():
            if line != w or r in grouped:
                continue
            if r in moving:
                ds = list(self.reach[r].values())
                out.append(("g", (r,), min(ds), max(ds)))
            else:
                out.append(("s", r, d, d))
        return sorted(out, key=lambda it: (it[2], it[3]))

    def moving_window(self, w, taps):
        key = (w, taps)
        if key not in self._drift:
            seq = track(self.row, self.fade, taps)
            a_w = self.steps[w]["a"]
            lo, hi, rmin, rmax, M = drift(seq, a_w, self.lat, self.timing[0])
            # the window must also hold the reads at every address the relocation allows (qvc.analyse's reach)
            W = N + hi - lo
            Bmin, Bmax = rmin + lo, rmax + lo
            self._drift[key] = Window(kind="moving", line=w, taps=[(t, None) for t in taps], rep=taps[0], lo=lo,
                                      hi=hi, Bmin=Bmin, Bmax=Bmax, W=W, R=Bmax - Bmin + W, M=M,
                                      D0=(self.steps[taps[0]]["a"] - a_w) & 0xFFFF)
        return self._drift[key]

    def option(self, w, j):
        """Line w streaming its items from j on: (local length, windows, memory words, cost) or None."""
        its = self.items(w)
        if j >= len(its):
            return self.length[w], [], self.length[w] + 1, 0
        floor = N * self.lat
        wins, statics = [], []
        for it in its[j:]:
            if it[0] == "s":
                if it[2] < floor:
                    return None
                statics.append((it[1], it[2]))
            else:
                if it[2] < floor:
                    return None
                mw = self.moving_window(w, it[1])
                if mw.Bmin < floor:
                    return None
                wins.append(mw)
        wins = static_windows(statics) + wins
        for x in wins:
            x.line = w
        local = max([N] + [it[3] for it in its[:j]])
        mem = local + 1 + sum(x.R for x in wins)
        cost = 2 * sum(x.W for x in wins) + N + sum(1 for x in wins if x.kind == "moving")
        return local, wins, mem, cost

    def build(self):
        lines = [w for w in self.length if self.length[w] is not None]
        cur = {w: len(self.items(w)) for w in lines}          # nothing streamed
        opt = {w: self.option(w, cur[w]) for w in lines}
        total = sum(o[2] for o in opt.values())
        for w in lines:
            if w in self.force:
                best = next((j for j in range(len(self.items(w))) if self.option(w, j)), None)
                if best is not None:
                    total -= opt[w][2]
                    cur[w], opt[w] = best, self.option(w, best)
                    total += opt[w][2]
        while total > self.budget:
            pick = None
            for w in lines:
                for j in range(cur[w]):
                    o = self.option(w, j)
                    if o is None or o[2] >= opt[w][2]:
                        continue
                    gain, more = opt[w][2] - o[2], o[3] - opt[w][3]
                    score = gain / max(more, 1e-9)
                    if pick is None or score > pick[0]:
                        pick = (score, w, j, o)
            if pick is None:
                break
            _, w, j, o = pick
            total += o[2] - opt[w][2]
            cur[w], opt[w] = j, o
        # then give back what the greedy took past the budget: the dearest streaming that can stay local
        while total <= self.budget:
            pick = None
            for w in lines:
                if w in self.force:
                    continue
                for j in range(cur[w] + 1, len(self.items(w)) + 1):
                    o = self.option(w, j)
                    if o is None or total + o[2] - opt[w][2] > self.budget or o[3] >= opt[w][3]:
                        continue
                    if pick is None or opt[w][3] - o[3] > pick[0]:
                        pick = (opt[w][3] - o[3], w, j, o)
            if pick is None:
                break
            _, w, j, o = pick
            total += o[2] - opt[w][2]
            cur[w], opt[w] = j, o
        self.fits = total <= self.budget
        self.local = {w: opt[w][0] for w in lines}
        self.streamed = sorted([w for w in lines if opt[w][1]], key=lambda w: (self.local[w], qvc.FRAME.index(w)))
        wins = [x for w in self.streamed for x in opt[w][1]]
        self.windows = [x for x in wins if x.kind == "static"] + [x for x in wins if x.kind == "moving"]
        self.layout()
        return self

    def layout(self):
        """Regions in ring order: the local lines, the streamed lines' heads, the static windows (one run), the moving
        windows. Then every step's address, as qvc.relocate gives it."""
        steps, at, head = self.steps, 0, {}
        for w in sorted(self.local, key=lambda w: qvc.FRAME.index(w)):
            if w not in self.streamed:
                head[w] = at
                at += self.local[w] + 1
        for w in self.streamed:
            head[w] = at
            at += self.local[w] + 1
        for x in self.windows:
            x.h = at
            at += x.R
        self.head, self.size = head, at
        addr = [None] * 96
        for w, h in head.items():
            addr[w] = h
        self.narrow, where = set(), {}
        for x in self.windows:
            for t, _ in x.taps:
                where[t] = x
                self.narrow.add(t)
        off = {}
        for r, (w, d) in self.access.items():
            x = where.get(r)
            if x is None:
                addr[r] = head[w] + d
                e0 = head[w]
            elif x.kind == "static":
                addr[r] = x.h + 15 + d - x.dmin
                e0 = None
            else:
                addr[r] = x.h + 15 + d - x.Bmin
                e0 = x.h + 15 - x.Bmin
            if self.moving and r in self.reach:
                offs = {(e0 if e0 is not None else head[w]) + dd - a for a, dd in self.reach[r].items()}
                if len(offs) != 1:
                    raise ValueError(f"step {r:#x}: its sweep wraps the original's 64K ring")
                off[r] = offs.pop()
        for x in self.windows:
            if x.kind == "moving":
                x.U0 = addr[x.rep]
        self.addr, self.off = addr, off
        self.in_words = sum(x.W for x in self.windows)
        self.out_words = N * len(self.streamed) + sum(1 for x in self.windows if x.kind == "moving")

    def summary(self):
        mw = [x for x in self.windows if x.kind == "moving"]
        return (f"ring {self.size} words (budget {self.budget}), {len(self.streamed)} lines streamed, "
                f"{len(self.windows)} windows ({len(mw)} moving), {self.in_words} halfwords a frame in, "
                f"{self.out_words} out" + ("" if self.fits else ", DOES NOT FIT"))


# ---- the DSP's copy code ---------------------------------------------------------------------------------------

def r7_free(info, need, taken=()):
    """need r7 words beside the state, the coefficients (and the word the closing fetch reads), the LFO's words and
    `taken` (an area build's unit and area words)."""
    used = set(range(0, qvc.COEF_AT + len(info["coef"]) + 1)) | set(taken)
    if info.get("mod"):
        used |= set(range(qvc.LFO_AT, qvc.LFO_AT + len(qvc.lfo_words(info["mod"]["lfo"]))))
    free = [k for k in range(qvc.R7_END) if k not in used]
    if len(free) < need:
        raise ValueError(f"the r7 block has {len(free)} free words, the stream needs {need}")
    return free[:need]


def imm(v):
    return f"#>${v & 0xFFFFFF:06x}"


def copy_in(n, dest="r5"):
    """n words from x:(r3)+ (bits 0-15 a halfword, 16-23 unknown) to y:(dest)+ as (h & $ffff) << 8: x0 the halfword,
    y1 = $80, so mpy x0,y1 leaves exactly h << 8 in the accumulator's low word, which y0 carries to Y. Two
    instructions a word, a and b in turn so no move reads an accumulator the instruction before computed."""
    acc = lambda k: "a" if k % 2 == 0 else "b"
    st = f"y0,y:({dest})+"
    if n == 1:
        return ["        move    x:(r3)+,x0", "        mpy     x0,y1,a", "        nop", "        move    a0,y0",
                f"        move    {st}"]
    out = ["        move    x:(r3)+,x0",
           "        mpy     x0,y1,a x:(r3)+,x0",
           "        mpy     x0,y1,b" + (" x:(r3)+,x0" if n > 2 else ""),
           "        move    a0,y0"]
    for k in range(2, n):
        load = " x:(r3)+,x0" if k + 1 < n else ""
        out += [f"        mpy     x0,y1,{acc(k)}{load} {st}", f"        move    {acc(k - 1)}0,y0"]
    out += [f"        move    {st}", f"        move    {acc(n - 1)}0,y0", f"        move    {st}"]
    return out


def as_loop(lines, label, first, count, period):
    """Fold lines[first:first + count * period] (count repeats of one period) into a DO loop."""
    if count < 2:
        return lines
    body = lines[first:first + period]
    assert lines[first:first + count * period] == body * count
    return lines[:first] + [f"        do      #{count},{label}"] + body + [f"{label}:"] + lines[first + count * period:]


def copy_out(modes):
    """len(modes) words from y:(r5) (each word's post-update mode: '+' or '+n5') to x:(r3)+ as word >> 8 (floor) in
    the low 16 bits: x0 = $008000, so mpy y0,x0 leaves word >> 8 in the accumulator's high word, which moves
    unlimited. One instruction a word: each stores the accumulator it computed two instructions before."""
    acc = lambda k: "a" if k % 2 == 0 else "b"
    n = len(modes)
    ld = lambda j: f" y:(r5){modes[j]},y0"
    out = ["        move   " + ld(0)]
    if n == 1:
        return out + ["        mpy     y0,x0,a", "        nop", "        move    a,x:(r3)+"]
    out += ["        mpy     y0,x0,a" + ld(1)]
    out += ["        mpy     y0,x0,b" + (ld(2) if n > 2 else "")]
    for k in range(2, n):
        out += [f"        mpy     y0,x0,{acc(k)} {acc(k)},x:(r3)+" + (ld(k + 1) if k + 1 < n else "")]
    out += [f"        move    {acc(n - 2)},x:(r3)+", f"        move    {acc(n - 1)},x:(r3)+"]
    return out


def stream_code(plan, info, P="qv", area=None):
    """The stream's DSP code for one program (qvc.assemble_text's hooks): init words, the head of proc (which call
    of the frame this is; at its first, the in-block into the windows) and the tail (at its last, the heads and the
    published addresses into the out-block). r7 words: FLAG (an a=0 call ran this frame), LAST (this call ends the
    frame), MBIN and MBOUT (this frame's block addresses, written by the base), and per moving window U (its read's
    address, written by every tick) and the last LAT published values (FIFO, oldest first)."""
    mw = [x for x in plan.windows if x.kind == "moving"]
    L = plan.lat
    # An area build (qvc ASTATE): the blocks come from the slot's record, named by the base; the out-block starts with
    # the program's tag and K, its frame number since it started (modulo $8000); the copy in waits Q = LAT frames.
    if area:
        assert not mw, "an area build streams static windows only so far"
    taken = (*qvc.USTATE.values(), *qvc.ASTATE.values()) if area else ()
    words = r7_free(info, 4 + len(mw) * (L + 1) + (2 if area else 0), taken)
    FLAG, LAST, MBIN, MBOUT = words[:4]
    K, Q = words[-2:] if area else (None, None)
    Uw = [words[4 + j * (L + 1)] for j in range(len(mw))]
    Fw = [[words[4 + j * (L + 1) + 1 + i] for i in range(L)] for j in range(len(mw))]
    S, first4 = plan.size, info["first"][4]
    x7 = lambda k: f"x:(r7+${k:02x})"
    init = ["        clr     b", f"        move    b,{x7(FLAG)}", f"        move    b,{x7(LAST)}"]
    if area:
        init += [f"        move    b,{x7(k)}" for k in (MBIN, MBOUT, K, Q)]
    for j, x in enumerate(mw):
        init += [f"        move    {imm(x.U0)},x0", f"        move    x0,{x7(Uw[j])}"]
        init += [f"        move    x0,{x7(f)}" for f in Fw[j]]
    head = ["; The stream (qvs.py): an a=0 call starts a split frame, an a=1 call ends every frame; the frame's first",
            "; call copies the in-block into the windows.",
            *([f"        move    x:(r7+${qvc.ASTATE['qf']:02x}),a"] if area else []),
            "        tst     a",
            "        move    #>$000001,x0",
            f"        bne     {P}KFLA",
            f"        move    x0,{x7(FLAG)}",
            "        clr     b",
            f"        move    b,{x7(LAST)}",
            f"        bra     {P}KCIN",
            f"{P}KFLA:",
            f"        move    x0,{x7(LAST)}",
            f"        move    {x7(FLAG)},b",
            "        clr     a",
            f"        move    a,{x7(FLAG)}",
            "        tst     b",
            f"        bne     {P}KCDN",
            f"{P}KCIN:"]
    if area:
        # this frame's bank is the parameter page's, r6 & $ffe000; the slot's record at $7fb0 + 4 ((r7 >> 8) & 15)
        head += ["        move    r7,b",
                 "        lsr     #6,b",
                 "        and     #>$00003c,b",
                 "        add     #>$007fb0,b",
                 "        move    b1,r3",
                 f"        move    x:(r7+${qvc.USTATE['r6']:02x}),b",
                 "        and     #>$ffe000,b",
                 "        move    b1,x0",
                 "        move    x:(r3+$2),b",
                 "        tst     b",
                 f"        beq     {P}KNOU",
                 "        add     x0,b",
                 f"{P}KNOU:",
                 f"        move    b1,{x7(MBOUT)}",
                 "        move    x:(r3+$1),b",
                 "        tst     b",
                 f"        beq     {P}KCDN",
                 "        add     x0,b",
                 f"        move    b1,{x7(MBIN)}",
                 f"        move    {x7(Q)},b",
                 f"        move    {imm(L)},x0",
                 "        cmp     x0,b",
                 f"        blt     {P}KCDN"]
    head += [f"        move    {x7(MBIN)},r3",
            "        move    #>$000080,y1",
            f"        move    {imm(S - 1)},m5"]
    statics = [x for x in plan.windows if x.kind == "static"]
    if statics:
        n = sum(x.W for x in statics)
        assert all(statics[i + 1].h == statics[i].h + statics[i].R for i in range(len(statics) - 1))
        head += [f"        move    {x7(qvc.STATE['r4'])},r5", f"        move    {imm(statics[0].h - first4)},n5",
                 "        lua     (r5)+n5,r5"]
        body = copy_in(n)
        head += as_loop(body, f"{P}KSTL", 4, (n - 3) // 2, 4) if n >= 7 else body
    for j, x in enumerate(mw):
        head += [f"        move    {x7(Fw[j][0])},a"]
        for i in range(1, L):
            head += [f"        move    {x7(Fw[j][i])},x0", f"        move    x0,{x7(Fw[j][i - 1])}"]
        head += [f"        move    {x7(Uw[j])},x0", f"        move    x0,{x7(Fw[j][L - 1])}",
                 f"        add     {imm(x.lo - 15 - first4)},a", "        move    a1,n5",
                 f"        move    {x7(qvc.STATE['r4'])},r5", "        lua     (r5)+n5,r5"]
        head += copy_in(x.W)
    head += [f"{P}KCDN:"]
    # the out-block: each streamed line's delays 1..16 at the frame's end (r4 = base + first4 + the next pointer)
    modes = []
    lines = plan.streamed
    for i, w in enumerate(lines):
        h = plan.head[w]
        for t in range(N):
            if t == N - 1 and i + 1 < len(lines):
                skip = plan.head[lines[i + 1]] + 1 - (h + N)
                modes.append(("n", skip))
            else:
                modes.append(("+", None))
    tail = []
    if lines:
        tail += [f"{P}KOST:", f"        move    {x7(LAST)},b", "        tst     b", f"        beq     {P}KOUT"]
        if area:     # no block while the base has not named it; else the tag and K first
            tail += [f"        move    {x7(MBOUT)},b", "        tst     b", f"        beq     {P}KOUT",
                     f"        move    {x7(MBOUT)},r3", f"        move    {imm(area['tag'])},x0", "        move    x0,x:(r3)+",
                     f"        move    {x7(K)},x0", "        move    x0,x:(r3)+",
                     "        move    #>$008000,x0"]
        else:
            tail += [f"        move    {x7(MBOUT)},r3", "        move    #>$008000,x0"]
        tail += [
                 f"        move    {imm(plan.head[lines[0]] + 1 - first4)},n5", "        move    r4,r5",
                 "        lua     (r5)+n5,r5"]
        # n5 holds each skip from just after the use before it, far ahead of its own use
        skips = [v for m_, v in modes if m_ == "n"]
        body = copy_out(["+n5" if m_ == "n" else "+" for m_, _ in modes])
        if skips:
            tail += [f"        move    {imm(skips[0])},n5"]
            # a different skip goes in right after the load that used the one before
            uses = [k for k, l in enumerate(body) if "(r5)+n5" in l]
            for i in reversed(range(len(skips) - 1)):
                if skips[i + 1] != skips[i]:
                    body.insert(uses[i] + 1, f"        move    {imm(skips[i + 1])},n5")
        tail += body
        for j, x in enumerate(mw):
            tail += [f"        move    {x7(Fw[j][L - 1])},x0", "        move    x0,x:(r3)+"]
        if area:     # K counts the frames sent, modulo $8000; Q up to LAT
            tail += [f"        move    {x7(K)},b", "        add     #1,b", "        and     #>$007fff,b",
                     f"        move    b1,{x7(K)}", f"        move    {x7(Q)},b", f"        move    {imm(L)},x0",
                     "        cmp     x0,b", f"        bge     {P}KQOK", "        add     #1,b", f"        move    b1,{x7(Q)}",
                     f"{P}KQOK:"]
        tail += [f"{P}KOUT:"]
    return dict(init=init, head=head, tail=tail, words=dict(FLAG=FLAG, LAST=LAST, MBIN=MBIN, MBOUT=MBOUT, K=K, Q=Q),
                publish={x.rep: Uw[j] for j, x in enumerate(mw)})


def generate(plan, prefix="qv", schedule=True, area=None):
    """The program's code with its stream: (asm text, info), info['stream'] the stream's pieces. area: dict(sig, tag),
    the release package's area build (qvc.ASTATE): a unit build, its stream named by the slot's record."""
    mod = None
    if plan.row:
        lfo = qvc.Lfo(plan.row)
        lfo.fade = plan.fade
        mod = dict(lfo=lfo, moving=plan.moving, off=plan.off, timing=plan.timing, fade=plan.fade)
    _, info = qvc.generate(plan.steps, plan.addr, plan.size, prefix, schedule, mod, unit=bool(area))
    if area:
        info["area"] = area
    if plan.windows:
        st = stream_code(plan, info, prefix, area)
        info["stream"] = st
        if mod:
            mod["publish"] = st["publish"]
    tables = len(info["dist"]) + (FADE_WORDS if plan.kind == "pitch" else 0)
    assert plan.size + tables <= qvc.FX2_WORDS or not plan.fits, "the ring and its tables pass the FX2 buffer"
    return qvc.assemble_text(info, prefix), info


# ---- the ColdFire's side ---------------------------------------------------------------------------------------

def s16(h):
    h &= 0xFFFF
    return h - 0x10000 if h & 0x8000 else h


class ColdFire:
    """The base's side of one instance's stream, from the plan alone: an SDRAM ring per streamed line, written from
    each out-block's head runs, and an in-block per frame built from the rings. compose(k) may use out-blocks of
    frames up to k - lat only, which is the channel's latency; a read of a sample the ColdFire has not received is an
    error (the plan would be wrong), a read before the stream started is 0 (the ring is cleared at the pick)."""

    def __init__(self, plan):
        self.plan, self.lat = plan, plan.lat
        self.ring = {}
        for w in plan.streamed:
            longest = max([x.dmin + x.W - N if x.kind == "static" else x.Bmax + x.W - N
                           for x in plan.windows if x.line == w])
            self.ring[w] = [0] * (1 << math.ceil(math.log2(longest + N * (self.lat + 2))))
        self.pending = collections.deque()
        self.published = {}           # frame -> [U per moving window]
        self.newest = -1              # the newest sample in the rings
        self.ring_words = sum(len(r) for r in self.ring.values())

    def receive(self, k, block):
        self.pending.append((k, list(block)))

    def ingest(self, k, block):
        pos = 0
        for w in self.plan.streamed:
            ring = self.ring[w]
            for i in range(N):                       # newest first
                ring[(N * k + N - 1 - i) % len(ring)] = block[pos + i] & 0xFFFF
            pos += N
        self.published[k] = [v & 0xFFFF for v in block[pos:]]
        assert k == self.newest // N + 1 or (self.newest < 0 and k == 0), "out-blocks arrive in order"
        self.newest = N * k + N - 1

    def sample(self, w, n):
        if n < 0:
            return 0
        if n > self.newest:
            raise AssertionError(f"line {w:#x}: sample {n} asked, the ColdFire has up to {self.newest}")
        ring = self.ring[w]
        assert n > self.newest - len(ring), "the ring is too short"
        return ring[n % len(ring)]

    def compose(self, k):
        while self.pending and self.pending[0][0] <= k - self.lat:
            self.ingest(*self.pending.popleft())
        assert k - self.lat < 0 or self.newest == N * (k - self.lat) + N - 1, "an out-block is missing"
        out, j = [], 0
        for x in self.plan.windows:
            if x.kind == "static":
                B = x.dmin
            else:
                U = self.published[k - self.lat][j] if k - self.lat >= 0 else x.U0
                j += 1
                B = U - x.h - 15 + x.Bmin + x.lo
            out += [self.sample(x.line, N * k + N - 1 - B - i) for i in range(x.W)]
        return out


# ---- the DSP's side, modelled ----------------------------------------------------------------------------------

class SplitEngine:
    """What the DSP does, in the integer model: the program on the plan's ring (qvc.Machine or qvc.Moving), and at a
    frame's start the in-block copied into the windows, at its end the out-block taken from the heads."""

    def __init__(self, plan, timing=None):
        self.plan = plan
        if plan.row:
            self.mv = qvc.Moving(plan.row, plan.fade, plan.size, plan.addr, plan.off, timing or plan.timing)
            self.m = self.mv.m
        else:
            self.mv = None
            self.m = qvc.Machine(plan.steps, plan.size, plan.addr)
        self.fifo = [[x.U0] * plan.lat for x in plan.windows if x.kind == "moving"]

    def frame(self, block, xs):
        """block: the in-block (16-bit halfwords, bits 16-23 ignored); xs: this frame's input words. Returns
        (outputs, out-block)."""
        m, S, pl = self.m, self.plan.size, self.plan
        p0 = m.p
        pos, j, pub = 0, 0, []
        for x in pl.windows:
            if x.kind == "static":
                at = x.h
            else:
                U = m.addr[x.rep]
                old = self.fifo[j].pop(0)
                self.fifo[j].append(U)
                pub.append(U)
                j += 1
                at = old + x.lo - 15
            for i in range(x.W):
                m.mem[(at + p0 + i) % S] = s16(block[pos + i]) << 8
            pos += x.W
        outs = [(self.mv or m).sample(v) for v in xs]
        pe = m.p
        out = []
        for w in pl.streamed:
            h = pl.head[w]
            out += [(m.mem[(h + pe + 1 + i) % S] >> 8) & 0xFFFF for i in range(N)]
        return outs, out + pub


def run_split(plan, left, right, inject=None):
    """The DSP model and the ColdFire model together, frame by frame. Returns ((left, right), in-blocks,
    out-blocks). inject(k, block): what the DSP receives instead (junk in bits 16-23)."""
    eng, cf = SplitEngine(plan), ColdFire(plan)
    ol, orr, ins, outs = [], [], [], []
    xs = [(l + r) >> 1 for l, r in zip(left, right)]
    for k in range((len(xs) + N - 1) // N):
        blk = cf.compose(k)
        ins.append(blk)
        o, ob = eng.frame(inject(k, blk) if inject else blk, (xs[N * k:N * k + N] + [0] * N)[:N])
        outs.append(ob)
        cf.receive(k, ob)
        for a, b in o:
            ol.append(a)
            orr.append(b)
    return (ol[:len(xs)], orr[:len(xs)]), ins, outs


def reference(plan, left, right, narrow=True, every=False):
    """The unsplit program on the original's 64K addresses; narrow: the streamed reads take 16-bit words, every: every
    store is floored to 16 bits."""
    if plan.row:
        mv = qvc.Moving(plan.row, plan.fade, 0x10000, [s["a"] for s in plan.steps], None, plan.timing)
        m = mv.m
    else:
        mv = None
        m = qvc.raw_machine(plan.steps)
    if narrow:
        m.narrow = set(plan.narrow)
    m.narrow_all = every
    return (mv or m).run(left, right)


def make_plan(programs, p, lfo_dir=None, lat=LAT, force=(), reserve=0):
    lfo_dir = pathlib.Path(lfo_dir or pathlib.Path.home() / ".cache/modwerk-local/quadraverb/engine/lfo")
    rows = {r["p"]: r for r in json.load(open(programs))}
    row, fade = qvc.load_lfo(lfo_dir / "lfo.json", p)
    if rows[p]["static"]:
        return Plan(rows[p]["steps"], lat=lat, force=force, reserve=reserve).build()
    if row is None:
        return None
    return Plan(row["steps"], row, fade, lat=lat, force=force, reserve=reserve).build()


def main(argv):
    programs = argv[0]
    lfo_dir = argv[argv.index("--lfo") + 1] if "--lfo" in argv else None
    lat = int(argv[argv.index("--lat") + 1]) if "--lat" in argv else LAT
    force = [int(v, 16) for v in argv[argv.index("--force") + 1].split(",")] if "--force" in argv else ()
    names = {r["p"]: r["name"] for r in json.load(open(programs))}
    if argv[1] == "--all":
        res = []
        for p in sorted(names):
            pl = make_plan(programs, p, lfo_dir, lat)
            if pl is None:
                print(f"{p:2d} {names[p]:16s} gated or restarted by onsets: not run")
                continue
            res.append((p, pl))
            mv = sum(1 for x in pl.windows if x.kind == "moving")
            print(f"{p:2d} {names[p]:16s} {pl.kind:6s} ring {pl.size:5d}  in {pl.in_words:3d}  out {pl.out_words:3d}  "
                  f"lines {len(pl.streamed):2d}  windows {len(pl.windows):2d}{f' ({mv} moving)' if mv else ''}"
                  + ("" if pl.fits else "  DOES NOT FIT"))
        ok = [pl for _, pl in res if pl.fits]
        for k in ("in_words", "out_words"):
            v = sorted(getattr(pl, k) for pl in ok)
            print(f"{k}: median {v[len(v) // 2]}, max {v[-1]}")
        print(f"{len(ok)} of {len(res)} fit")
        return
    p = int(argv[1])
    pl = make_plan(programs, p, lfo_dir, lat, force)
    print(f"{p} {names[p]}: {pl.summary()}")
    for x in pl.windows:
        print("   ", x.kind, f"line {x.line:02x}", "W", x.W, "R", x.R, "taps", [(f"{t:02x}", d) for t, d in x.taps],
              "" if x.kind == "static" else f"lo {x.lo} hi {x.hi} B {x.Bmin}..{x.Bmax} M {x.M}")
    import random
    n = int(argv[argv.index("--samples") + 1]) if "--samples" in argv else 16000
    rnd = random.Random(11)
    noise = [round(0.45 * (1 << 23) * (2 * rnd.random() - 1)) for _ in range(n)]
    (l, r), ins, outs = run_split(pl, noise, noise)
    want = reference(pl, noise, noise)
    bad = next((i for i in range(n) if (l[i], r[i]) != (want[0][i], want[1][i])), None)
    print("split model + ColdFire == the unsplit model (streamed reads at 16 bits):", "yes" if bad is None else f"NO at {bad}")


if __name__ == "__main__":
    main(sys.argv[1:])
