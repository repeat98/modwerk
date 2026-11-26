#!/usr/bin/env python3
"""Quadraverb program -> straight-line DSP56300 code, priced with the stall model (sdk/cycle-scan/interlock_scan.py).

A PRICING PROTOTYPE: the instruction shapes, pointer chains and reload scheduling are the engine's; the latch and
select corner cases are simplified, and nothing here has run in dsp_host yet (ENGINE.md).
  node dumpall.mjs <rom> programs.json && python3 -B qvc_price.py programs.json [program]


Registers: a = the Quadraverb's accumulator A, b = latch B, x1 = latch M, x0 = this step's coefficient,
y0 = this step's delay word (prefetched by the step before), y1 = scratch (A before a write).
Delay memory: one Y ring, modulo; CHAINS address registers walk it. Each access (a read's prefetch, a write's store)
post-adds its chain's n register, which then has to be reloaded with the distance to that chain's next access.
X: r2 walks the coefficients in step order (the r7 block). Y: r3 walks the distances in reload order.
A frame is FRAME order (0x5f, 0 .. 0x5e); the code is one sample, inside the block's DO loop.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT / "sdk/cycle-scan"))
import interlock_scan as IS  # noqa: E402

FRAME = [0x5F] + list(range(0x5F))
CHAINS = ["r4", "r5", "r6"]


class Emitter:
    def __init__(self):
        self.code = []          # (text, words)
        self.pending = []       # chains whose n waits for a reload, oldest first
        self.reloads = []       # reload order: chain index (the distance table follows it)

    def ins(self, alu=None, x=None, y=None, r=None, words=1):
        """One instruction. x: an X move text or None (a free X slot takes a pending reload when the form allows it)."""
        if x is not None:
            # no free X slot here: reloads still waiting go out first, as soon after their access as possible
            while self.pending:
                k = self.pending.pop(0)
                self.code.append((f"move y:(r3)+,n{CHAINS[k][1]}", 1))
                self.reloads.append(k)
        if x is None and y is None and r is None and self.pending:
            # ALU (or nothing) + X move: the class I form takes any register, n included; X:R takes a,b -> y0,y1
            c = self.pending.pop(0)
            x = f"y:(r3)+,n{CHAINS[c][1]}"
            self.reloads.append(c)
        parts = [alu or ("move" if (x or y or r) else "nop")]
        if alu is None and (x or y or r):
            parts = ["move"]
        if x:
            parts.append(x)
        if r:
            parts.append(r)
        if y:
            parts.append(y)
        text = parts[0] + (" " + " ".join(parts[1:]) if len(parts) > 1 else "")
        self.code.append((text, words))

    def access_chain(self, c):
        """Before chain c is used: its earlier reload must have gone out."""
        while c in self.pending:
            k = self.pending.pop(0)
            self.code.append((f"move y:(r3)+,n{CHAINS[k][1]}", 1))
            self.reloads.append(k)

    def used(self, c):
        self.pending.append(c)


def compile_program(steps):
    e = Emitter()
    order = [steps[i] | {"i": i} for i in FRAME]
    n = len(order)
    chain_of, k = {}, 0
    for j, s in enumerate(order):
        chain_of[j] = k % len(CHAINS)
        k += 1
    for j, s in enumerate(order):
        op, kk = s["op"], s["k"]
        w, latch, sel, neg = op & 8, op & 4, op & 3, op & 0x10
        nx = order[(j + 1) % n]
        jn = (j + 1) % n
        nxt_read = not (nx["op"] & 8)
        sign = "-" if neg else ""
        if not w:
            out = s["i"] in (0, 0x5F)
            if out:
                e.ins(x=None, alu=None, r=None) if False else None
                e.code.append((f"move y0,x:(r7+${'08' if s['i'] == 0 else '09'})", 1))
            if latch and op & 1:
                e.code.append(("move y0,x1", 1))
            elif latch:
                e.ins(alu="tfr y0,b")
            elif sel == 2:
                e.ins(alu="tfr b,a")
            elif sel == 3:
                e.ins(alu="tfr x1,a")
            mac = "mpy" if sel == 0 else "mac"
            if kk == 0 and mac == "mpy":
                alu = "clr a"
            elif kk == 0:
                alu = None
            else:
                alu = f"{mac} {sign}y0,x0,a"
            if nxt_read:
                c = chain_of[jn]
                e.access_chain(c)
                e.ins(alu=alu or "nop", x="x:(r2)+,x0", y=f"y:({CHAINS[c]})+n{CHAINS[c][1]},y0")
                e.used(c)
            else:
                e.ins(alu=alu or "nop", x="x:(r2)+,x0")
        else:
            c = chain_of[j]
            # W1: y1 = A (and latch B = A): X:R form, its X slot free for a reload
            e.ins(alu="tfr a,b" if (latch and not op & 1) else None, r="a,y1")
            if latch and op & 1:
                e.code.append(("move a,x1", 1))
            if sel == 2 and not (latch and not op & 1):
                e.ins(alu="tfr b,a")
            elif sel == 3 and not (latch and op & 1):
                e.ins(alu="tfr x1,a")
            mac = "mac" if (sel in (2, 3) or (sel == 1 and not latch)) else "mpy"
            if latch and sel == 2 and not op & 1:
                pass  # B already overwritten above in this simplified form (priced only)
            e.access_chain(c)
            store = "a" if mac == "mpy" or sel == 1 else "y1"
            e.ins(alu=f"{mac} {sign}x0,y1,a", x="x:(r2)+,x0", y=f"{store},y:({CHAINS[c]})+n{CHAINS[c][1]}")
            e.used(c)
            if nxt_read:
                cn = chain_of[jn]
                e.access_chain(cn)
                e.ins(y=f"y:({CHAINS[cn]})+n{CHAINS[cn][1]},y0")
                e.used(cn)
    while e.pending:
        k = e.pending.pop(0)
        e.code.append((f"move y:(r3)+,n{CHAINS[k][1]}", 1))
        e.reloads.append(k)
    return e


def price(code, reps=3):
    seq = [IS.Ins(i, t, w) for i, (t, w) in enumerate(code * reps)]
    t, st, _ = IS.analyze(seq)
    return t / reps, {k: v / reps for k, v in st.items()}, len(code)


if __name__ == "__main__":
    P = json.load(open(sys.argv[1]))  # node dumpall.mjs <rom> <out.json>
    rows = []
    for pr in P:
        e = compile_program(pr["steps"])
        cyc, st, words = price(e.code)
        rows.append((cyc, pr["p"], pr["name"], words, st))
    rows.sort()
    cs = [r[0] for r in rows]
    print(f"cycles a sample (steps only): min {cs[0]:.0f}  median {cs[len(cs)//2]:.0f}  max {cs[-1]:.0f}")
    print(f"code words: min {min(r[3] for r in rows)}  max {max(r[3] for r in rows)}")
    for r in rows[:3] + rows[-5:]:
        print(f"  {r[1]:2d} {r[2]:16s} {r[0]:5.0f} cycles  {r[3]} words  stalls {r[4]}")
    if len(sys.argv) > 2:
        e = compile_program(P[int(sys.argv[2])]["steps"])
        print("\n".join(t for t, _ in e.code))
