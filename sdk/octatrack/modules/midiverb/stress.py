"""Midiverb's stress run: eight instances, four a core, for two seconds in dsp_host -guard -dirty, then each alone.

The images carry stock's FX2 buffer table, read from stock's own DSP setup in dsp_host (OS 1.40C, 25 Nov 2026): a
core's four FX2 slots get Y:$4000 and Y:$8000, and the last two the window both cores share, $30000 and $34000 on
core 0 (T7, T8), $38000 and $3c000 on core 1 (T3, T4). dsp_host hands each instance its own entry, as the dispatcher
does. The ColdFire half that streams the programs does not run there, so a test driver placed before the engine (the
engine itself unchanged) reads the instance's index from the low three bits of slot 11 and copies its own stream
table's three words into the parameter block each call, as stream.c does.
Each instance switches program every sixteenth at 120 BPM (the dearest, Midiverb #16, half the time), holds STOP's
tail kill twice, runs three LFOs (LEVL sine, MIX triangle, slot E square) and gets a new value on every one of its
twelve slots each sixteenth, with a trig split of its own. The run passes when dsp_host finishes (no hang), the guard
counts no clobber, every instance sounds, and each instance's output equals its output rendered alone: the
instances share nothing, the shared window included.
"""
import math
import pathlib
import random
import sys

import verify as V

G = V.G
CALLS = 5513                 # 2.0 s of 16-frame blocks at 44.1 kHz
STEP = 345                   # a sixteenth at 120 BPM, in blocks
TABLE_AT = 0x3000            # per instance: its stream table
STREAMS_AT = 0x3100          # the stream tables, STEP * 6 calls each
LOOP = STEP * 6              # calls a stream table holds, round and round
BUFFERS = ({0x256: 0x4000, 0x258: 0x8000, 0x25a: 0x30000, 0x25c: 0x34000},   # stock's FX2 entries (1, 3, 5, 7): core 0
           {0x256: 0x4000, 0x258: 0x8000, 0x25a: 0x38000, 0x25c: 0x3c000})   # core 1
WINDOW = 0x3dfe              # the words of its buffer an instance may write: the ring and its program area
SPLITS = (1, 3, 7, 8, 12, 15, None, None)
DRIVER = """
; stress.py's test driver: this instance's stream words, then the engine.
proc:
        move    #>$ffffff,m4
        move    x:(r6+$b),a
        lsr     #$10,a
        and     #>$000007,a
        move    a1,n4
        move    #>$fab2e1,r4
        nop
        move    (r4)+n4
        move    p:(r4),x1
        move    x:(r7+$1e),a
        move    a,b
        asl     b
        add     b,a
        move    a,n4
        move    x1,r4
        nop
        move    (r4)+n4
        move    p:(r4)+,x0
        move    x0,x:(r6+$c)
        move    p:(r4)+,x0
        move    x0,x:(r6+$d)
        move    p:(r4)+,x0
        move    x0,x:(r6+$e)
        move    x:(r7+$1e),a
        add     #>$1,a
        move    #>$fab2e2,x0
        cmp     x0,a
        blt     mvqDRV2
        clr     a
mvqDRV2:
        move    a,x:(r7+$1e)
        bra     mvqPROC
"""


def plan(i, by, rnd):
    """Instance i's programs (from call, index) and tail kills over LOOP calls."""
    dear = by[("MV1", 16)]
    others = list(range(len(V.PROGRAMS)))
    out, kills = [], [(STEP * 2 + 40 + 11 * i, STEP * 2 + 70 + 11 * i), (STEP * 5 + 20, STEP * 5 + 60)]
    for s in range(LOOP // STEP):
        out.append((s * STEP + 7 * i, dear if (s + i) % 2 == 0 else rnd.choice(others)))
    return out, kills


def rows(i, rnd):
    """Instance i's twelve slots each block: three LFOs, a new value on every slot each sixteenth, index in slot 11."""
    out, held = {}, [rnd.randrange(128) for _ in range(12)]
    for b in range(CALLS):
        if b % STEP == 0:
            held = [rnd.randrange(128) for _ in range(12)]
        k = list(held)
        k[1] = 64 + round(63 * math.sin(2 * math.pi * b / 689 + i))           # LEVL, sine, a beat
        k[5] = round(127 * abs(((b + 97 * i) % 1378) / 689 - 1))               # MIX, triangle, two beats
        k[4] = 127 if (b // 1378 + i) % 2 else 0                               # E (unused), square, four beats
        k[11] = (rnd.randrange(16) << 3) | i                                    # the index, in its low bits
        out[b] = k
    return out


def main():
    G.require_tools()
    tmp = G.workdir("midiverb-stress-")
    work = pathlib.Path(tmp.name)
    source = DRIVER + (V.HERE / "engine.asm").read_text().replace("\nproc:\n", "\nmvqPROC:\n")
    asm = G.assemble(source, work, replace={"$fab2e1": f"${TABLE_AT:x}", "$fab2e2": f"${LOOP:x}"})
    by = {(q["bank"], q["number"]): i for i, q in enumerate(V.PROGRAMS)}
    rnd = random.Random(1987)
    n = 16 * CALLS
    table, streams, insts = [], [], []
    for i in range(8):
        programs, kills = plan(i, by, rnd)
        chunks = V.stream(programs, LOOP, kills)
        table.append(STREAMS_AT + 3 * LOOP * i)
        streams += [w for t in chunks for w in t]
        left = G.burst(n // 3, n, amp=0.98, seed=11 + i)
        right = [round(v * 0.8) for v in G.tone(110 * (i + 1), 0.7, n)]
        insts.append(G.Instance(left, right, rows=rows(i, rnd), split=SPLITS[i], core=0 if i < 4 else 1))
    extra = [(G.P, TABLE_AT, table), (G.P, STREAMS_AT, streams)]
    image = G.write_image(asm.words, work / "a.mem", org=asm.org, extra=extra, x=BUFFERS[0])
    image_b = G.write_image(asm.words, work / "b.mem", org=asm.org, extra=extra, x=BUFFERS[1])
    flags = dict(guard=WINDOW, dirty=0x5a, extra=("-guard-shared",), timeout=3600, check=False)
    together = G.run(asm, insts, image=image, image_b=image_b, **flags)
    ok = together.returncode == 0
    print(("[PASS]" if ok else "[FAIL]") + f" eight together: dsp_host exit {together.returncode}, layout {together.layout}")
    if not ok:
        print(together.stdout[-1200:])
    clobbers = sum(together.clobbers)
    ok &= clobbers == 0
    print(("[PASS]" if clobbers == 0 else "[FAIL]") + f" guard: {clobbers} clobbers, stray regions {together.stray}")
    silent = [i for i, z in enumerate(together.nonzero) if not z]
    ok &= not silent
    print(("[PASS]" if not silent else "[FAIL]") + f" every instance sounds: {silent or 'all'}")
    for i, inst in enumerate(insts):
        if together.harness_word(i):
            # dsp_host writes a word of its own into this position's block in an eight-instance run (dsp_gate.py), so it is
            # compared with the same eight where the other seven play their programs on silence.
            quiet = [x if j == i else G.Instance([0] * n, [0] * n, rows=x.rows, split=x.split, core=x.core)
                     for j, x in enumerate(insts)]
            other = G.run(asm, quiet, image=image, image_b=image_b, **flags)
            same = other.returncode == 0 and other.outputs[i] == together.outputs[i]
            what = "equals itself beside seven silent instances (dsp_host's own word lands at this position)"
        else:
            alone = G.run(asm, [inst], image=image, image_b=image_b, **flags)
            same = alone.returncode == 0 and alone.outputs[0] == together.outputs[i]
            what = "equals itself alone"
        ok &= same
        print(("[PASS]" if same else "[FAIL]") + f" instance {i} (core {inst.core}, split {inst.split}) {what}")
    print(f"meters together: {together.meters} executed instructions a sample per core, the worst block; "
          f"per instance {together.per_instance}; {n / 44100:.2f} s")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
