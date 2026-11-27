#!/usr/bin/env python3
"""The release package's stress run: eight tracks for two seconds in dsp_host -guard -dirty, then each alone.

  python3 -B stress_area.py <programs.json> <lfo_dir>

What the Quadraverb allows: one program a core (a slot's two program areas take half a core's arena). So T1 (core 1) and
T5 (core 0) run programs, and the other six tracks have the effect with no area named (the base's refusal leaves a slot
dry). Each running track walks through the programs in its own order (16 in the two seconds, the two dearest first), one every sixteenth at 120 BPM: PROG
moves (the area fades), and 60 frames later the stand-in for the base names the next program's area in the slot's
record (what the base does once it has written the code), and that area sets itself up, clears and starts. MIX sweeps
a triangle, slot E a square and slot D a sine, every slot gets a new value each sixteenth; trig splits on six tracks.
The in-blocks are random halfwords (the copies' paths, not the sound); the out-blocks are kept in X.

Passes when dsp_host finishes (no hang), the guard counts no clobber, both running tracks sound, and each track's
output equals its output rendered alone. The tags and K of the out-blocks are verify_area.py's to check, bit for bit.
"""
import math
import pathlib
import random
import struct
import sys

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import qvarea  # noqa: E402
import qvcf  # noqa: E402
import verify as V  # noqa: E402
import verify_area as VA  # noqa: E402

G = V.G
N = 16
CALLS = 5513                 # 2.0 s of 16-sample blocks at 44.1 kHz
STEP = 345                   # a sixteenth at 120 BPM, in blocks
WRITE = 60                   # blocks from PROG moving to the base naming the new area (writing the code takes about 50)
AREAS = 0x4000               # every release area, 0x500 words apart, on each core
TBL = 0x60000                # per running track: the record's word 0 each frame (X)
INS = 0x80000                # per track: its in-blocks, frame by frame (X)
OUTS = 0x100000              # per track: its out-blocks (X)
WIN, WOUT = 352, 146
WINDOW = 0x3dfe              # the words of its buffer an instance may write: the ring, its tables and the dry scratch
BUFFERS = ({0x256: 0x4000, 0x258: 0x8000, 0x25a: 0x30000, 0x25c: 0x34000},
           {0x256: 0x4000, 0x258: 0x8000, 0x25a: 0x38000, 0x25c: 0x3c000})
SPLITS = (1, 3, 7, 8, 12, 15, None, None)
RUNNING = (0, 4)             # T1 on core 1 and T5 on core 0 (instance i: core 0 if i < 4 else 1, as midiverb's stress)


def harness():
    """verify_area's stand-in, with the record's word 0 from a table each frame and the out-blocks kept in X."""
    x7 = lambda k: f"x:(r7+${k:02x})"
    H = lambda k: x7(VA.H0 + k)
    return f"""
; stress_area.py's stand-in for the base. H0 frame, H1 split, H2 in-table, H3 out-table, H4 in-offset, H5 flag, H6 r0,
; H7 n7, H8 page, H9 bank, H10 out-offset, H11 bank page, H12 the record's word-0 table (0: none), H13 the record.
proc:
        move    a1,{H(5)}
        move    r0,{H(6)}
        move    n7,{H(7)}
        move    r6,{H(8)}
        move    {H(0)},b
        move    #>$000001,x0
        and     x0,b
        asl     #13,b,b
        move    #>$002000,x0
        add     x0,b
        move    b1,{H(9)}
        move    #>${VA.PAGE:06x},x0
        add     x0,b
        move    b1,r1
        move    {H(11)},r2
        do      #12,qwXK
        move    x:(r6)+,x0
        move    x0,x:(r1)+
qwXK:
        move    {H(8)},r6
        move    b1,{H(11)}
        tst     a
        bne     qwXA
        move    #>$000001,x0
        move    x0,{H(1)}
        bra     qwXF
qwXA:
        move    {H(1)},b
        clr     a
        move    a,{H(1)}
        tst     b
        bne     qwXG
qwXF:
        move    {H(12)},b
        tst     b
        beq     qwXN
        move    {H(0)},x0
        add     x0,b
        move    b1,r1
        move    {H(13)},r2
        move    x:(r1),x0
        move    x0,x:(r2)
qwXN:
        move    {H(9)},b
        move    {H(4)},x0
        add     x0,b
        move    b1,r2
        move    {H(2)},r1
        do      #{WIN},qwXC
        move    x:(r1)+,x0
        move    x0,x:(r2)+
qwXC:
        move    r1,{H(2)}
qwXG:
        move    {H(6)},r0
        move    {H(7)},n7
        move    {H(11)},r6
        move    {H(5)},a
        bsr     qsPROC
        move    {H(8)},r6
        move    {H(5)},a
        tst     a
        beq     qwXE
        move    {H(9)},b
        move    {H(10)},x0
        add     x0,b
        move    b1,r1
        move    {H(3)},r2
        do      #{WOUT},qwXD
        move    x:(r1)+,x0
        move    x0,x:(r2)+
qwXD:
        move    r2,{H(3)}
        move    {H(0)},a
        move    #>$000001,x0
        add     x0,a
        move    a1,{H(0)}
qwXE:
        rts
"""


def main(argv):
    programs, lfo_dir = argv[0], argv[1]
    G.require_tools()
    tmp = G.workdir("qv-stress-")
    work = pathlib.Path(tmp.name)
    plans = qvcf.plans(programs, lfo_dir)
    areas = [qvarea.area(pl, i, work)[2] for i, pl in enumerate(plans)]
    at = [AREAS + 0x500 * i for i in range(len(areas))]
    assert all(len(a["words"]) <= 0x500 for a in areas)
    source = harness() + qvarea.SHELL.read_text().replace("\nproc:", "\nqsPROC:")
    asm = G.assemble(source, work, name="qvstress")
    rnd = random.Random(1989)
    n = N * CALLS
    insts, extra = [], [[], []]
    for i in range(8):
        core = 0 if i < 4 else 1
        r7 = 0x6000 + 0x100 * (2 + 2 * i)
        rec = 0x7FB0 + 4 * ((r7 >> 8) & 15)
        running = i in RUNNING
        order = list(range(len(areas)))
        rnd.shuffle(order)
        dear = [qvcf.PROGRAMS.index(p) for p in (53, 66)]                  # the dearest first
        order = dear + [p for p in order if p not in dear]
        seq = [order[s % len(order)] for s in range(CALLS // STEP + 1)]
        word0 = [at[seq[min(len(seq) - 1, max(0, (f - WRITE) // STEP))]] if running else 0 for f in range(CALLS)]
        tbl, inb, outb = TBL + (i % 4) * 0x2000, INS, OUTS + (i % 4) * WOUT * CALLS   # a core's tracks read one in-table
        ex = extra[core]
        ex.append((G.X, tbl, word0))
        ex.append((G.X, rec, [0 if not running else word0[0], VA.IN_OFF[0], VA.OUT_OFF[0], 0]))
        ex.append((G.X, r7 + VA.H0, [0, 0, inb, outb, VA.IN_OFF[0], 0, 0, 0, 0, 0, VA.OUT_OFF[0], 0,
                                     tbl if running else 0, rec]))
        rows, held = {}, [rnd.randrange(128) for _ in range(12)]
        for b in range(CALLS):
            if b % STEP == 0:
                held = [rnd.randrange(128) for _ in range(12)]
            k = list(held)
            s = b // STEP
            k[0] = seq[s] if running else 0                                     # PROG: the next program, WRITE blocks early
            k[3] = 64 + round(63 * math.sin(2 * math.pi * b / 689 + i))         # D, sine, a beat
            k[5] = round(127 * abs(((b + 97 * i) % 1378) / 689 - 1))            # MIX, triangle, two beats
            k[4] = 127 if (b // 1378 + i) % 2 else 0                            # E (unused), square, four beats
            rows[b] = k
        left = G.burst(n // 3, n, amp=0.98, seed=11 + i)
        right = [round(v * 0.8) for v in G.tone(110 * (i + 1), 0.7, n)]
        insts.append((G.Instance(left, right, rows=rows, split=SPLITS[i], core=core), running, seq, outb))
    for core in (0, 1):
        ins = [rnd.randrange(0x10000) | (rnd.randrange(1, 256) << 16) for _ in range(WIN * CALLS)]
        extra[core] += [(G.X, INS, ins)] + [(G.P, a, qvarea.relocate(ar, a)) for a, ar in zip(at, areas)]
    image = G.write_image(asm.words, work / "a.mem", org=asm.org, extra=extra[0], x=BUFFERS[0])
    image_b = G.write_image(asm.words, work / "b.mem", org=asm.org, extra=extra[1], x=BUFFERS[1])
    flags = dict(guard=WINDOW, dirty=0x5a, extra=("-guard-shared",), timeout=3600, check=False)
    ok = True
    together = G.run(asm, [x[0] for x in insts], image=image, image_b=image_b, **flags)
    good = together.returncode == 0
    ok &= good
    print(("[PASS]" if good else "[FAIL]") + f" eight together: dsp_host exit {together.returncode}, layout {together.layout}")
    if not good:
        print(together.stdout[-1500:])
        sys.exit(1)
    clobbers = sum(together.clobbers)
    ok &= clobbers == 0
    print(("[PASS]" if clobbers == 0 else "[FAIL]") + f" guard: {clobbers} clobbers, stray regions {together.stray}")
    silent = [i for i in RUNNING if not together.nonzero[i]]
    ok &= not silent
    print(("[PASS]" if not silent else "[FAIL]") + f" both running tracks sound: {silent or 'yes'}")
    print(f"meters together: {together.meters} executed instructions a sample per core, the worst block; "
          f"per instance {together.per_instance}; {n / 44100:.2f} s")
    # Each track against itself beside seven silent ones, every track in its place: the stand-in's words sit at its own
    # r7 block, and dsp_host writes a word of its own into some positions' blocks in an eight-instance run (midiverb).
    for i, (inst, running, seq, outb) in enumerate(insts):
        quiet = [x[0] if j == i else G.Instance([0] * n, [0] * n, rows=x[0].rows, split=x[0].split, core=x[0].core)
                 for j, x in enumerate(insts)]
        other = G.run(asm, quiet, image=image, image_b=image_b, **flags)
        same = other.returncode == 0 and other.outputs[i] == together.outputs[i]
        ok &= same
        print(("[PASS]" if same else "[FAIL]") + f" track {i + 1} (core {inst.core}, split {inst.split}"
              f"{', running' if running else ', no area'}) equals itself beside seven silent tracks")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main(sys.argv[1:])
