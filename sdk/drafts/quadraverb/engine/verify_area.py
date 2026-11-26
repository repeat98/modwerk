#!/usr/bin/env python3
"""The release package's DSP side in dsp_host: the shell (../shell.asm) runs a program's area, relocated as
qv_runtime.c's code() relocates it, with the stream named by the slot's record; bit for bit against the models.

  python3 -B verify_area.py <programs.json> <lfo_dir> <index> [--samples N]

index: the program's place in manifest.REVERBS (what PROG stores). The test's proc is a stand-in for the base:
- the slot's record at X:$7fb0 + 4 ((r7 >> 8) & 15) names the area (placed at AT, not where it was assembled) and the
  blocks' offsets in the frame's bank;
- each frame's bank is X:$2000 or X:$4000, alternating; the stand-in puts the dispatcher's parameter page there (its
  MIX copied), writes the frame's in-block at the bank + the in-offset before the frame's first call, and after its last
  call keeps the out-block from the bank + the out-offset;
- the in-blocks are what qv_runtime.c sends: zeros until the program has run 3 frames, then qvs.ColdFire's.
The program starts at the first call that begins a frame after its clear (qvc ASTATE); until then the output is the dry
at its mix. From there the model is qvs.SplitEngine (LAT 3) on the samples from that frame on, and the out-blocks are
[tag, K, the model's out-block].

Gates: the relocation equals an assembly at AT; labels, traps, operands as written; bit-exact audio and out-blocks with
one instance (MIX 127, 64 and 0), trig splits at frames 1, 5, 7 and 13, a dirty Y, and two instances on separate
records, blocks and buffers.
"""
import pathlib
import random
import struct
import sys

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import qvarea  # noqa: E402
import qvc  # noqa: E402
import qvcf  # noqa: E402
import qvs  # noqa: E402
import verify as V  # noqa: E402

G = V.G
N = qvs.N
LAT = qvcf.LAT
AT = (0x3400, 0x3C00)              # where the test puts each instance's area: neither of the assembly's origins
IN_OFF = (0x1BE0, 0x1D40)          # each instance's in-block and out-block in a bank, as the base's channel has them
OUT_OFF = (0x1840, 0x18E0)
PAGE = 0x0C00                      # the parameter page in the bank (the stand-in's choice)
TABLE = (0x080000, 0x140000)       # in-blocks (X) and captured out-blocks (Y), test memory only
H0 = 0xC0                          # the stand-in's words, r7 + $c0.. (above the engine's $00-$83)


def harness(win, wout):
    x7 = lambda k: f"x:(r7+${k:02x})"
    H = lambda k: x7(H0 + k)
    return f"""
; The base's stand-in (verify_area.py). H0 frame, H1 a split frame's first call ran, H2/H3 the tables, H4 in-offset,
; H5 the flag, H6 r0, H7 n7, H8 the dispatcher's page, H9 this frame's bank, H10 out-offset.
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
        move    #>${PAGE:06x},x0
        add     x0,b
        move    b1,r1
        move    x:(r6+5),x0
        move    x0,x:(r1+5)
        move    r1,{H(11)}
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
        move    {H(9)},b
        move    {H(4)},x0
        add     x0,b
        move    b1,r2
        move    {H(2)},r1
        do      #{win},qwXC
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
        do      #{wout},qwXD
        move    x:(r1)+,x0
        move    x0,y:(r2)+
qwXD:
        move    r2,{H(3)}
        move    {H(0)},a
        move    #>$000001,x0
        add     x0,a
        move    a1,{H(0)}
qwXE:
        rts
"""


def calls(n, split=None):
    """(samples, a) of every call: a = 1 ends a frame."""
    out = []
    while sum(c for c, _ in out) < n:
        out += [(split, 0), (N - split, 1)] if split else [(N, 1)]
    return out


def start_frame(size, cl):
    """The frame the program starts at: its first call that begins a frame after the clear's calls."""
    cleared = -(-size // qvc.CLEAR_WORDS)
    frame, ended = 0, True
    for k, (_, a) in enumerate(cl):
        if k >= cleared and ended:
            return frame
        ended = bool(a)
        frame += a
    raise ValueError("the program never starts")


def blocks_in(plan, frames, f0, outs, win):
    """What the runtime sends for every frame of the run: zeros before f0 + LAT, then compose(k) (ColdFire, LAT 3)."""
    cf = qvs.ColdFire(plan)
    rows = []
    for f in range(frames):
        k = f - f0
        if k < 0:
            rows.append([0] * win)
            continue
        blk = cf.compose(k)
        cf.receive(k, outs[k])
        blk = blk if k >= LAT else [0] * len(blk)
        rows.append(blk + [0] * (win - len(blk)))
    return rows


def junk(rows, seed):
    rnd = random.Random(seed)
    return [[(v & 0xFFFF) | (rnd.randrange(1, 256) << 16) for v in b] for b in rows]


def expected(plan, left, right, mix, f0, tag):
    """(audio, out-blocks from f0 on, the in-blocks the runtime sends)."""
    xs = [(l + r) >> 1 for l, r in zip(left, right)]
    frames = len(left) // N
    eng = qvs.SplitEngine(plan)
    cf = qvs.ColdFire(plan)
    wet, outs = [], []
    for k in range(frames - f0):
        blk = cf.compose(k)
        o, ob = eng.frame(blk, xs[N * (f0 + k):N * (f0 + k + 1)])
        cf.receive(k, ob)
        outs.append(ob)
        wet += o
    s0 = N * f0
    ol, orr = [], []
    for i in range(len(left)):
        a, b = (0, 0) if i < s0 else wet[i - s0]
        ol.append(qvc.mix_out(a, left[i], mix))
        orr.append(qvc.mix_out(b, right[i], mix))
    return (ol, orr), [[tag, k & 0x7FFF] + ob for k, ob in enumerate(outs)], outs


def main(argv):
    programs, lfo_dir, index = argv[0], argv[1], int(argv[2])
    plan = qvcf.plans(programs, lfo_dir)[index]
    p = qvcf.REVERBS[index]
    gates = G.Gates(f"Quadraverb area, index {index} (program {p} {qvc.load(programs, p)[0].strip()})")
    G.require_tools()
    tmp = G.workdir("qv-area-")
    work = pathlib.Path(tmp.name)
    text, info, ar = qvarea.area(plan, index, work)
    win, wout = max(plan.in_words, 1), plan.out_words + 2   # this program's blocks: the base moves more, the area reads these
    print(f"area: {len(ar['words'])} words, {len(ar['relocs'])} relocated; ring {plan.size}, in {plan.in_words}, out "
          f"{plan.out_words}; blocks {win} in, {wout} out")
    for at in AT:
        direct = G.assemble(text, work, org=at, name=f"qd{at:x}").words + [v & 0xFFFFFF for v in info["data"]]
        gates(f"relocation: code() at ${at:x} == the area assembled there", qvarea.relocate(ar, at) == direct)
    bad = V.labels_unique(text)
    gates("labels: none is part of another (dsp_asm substitutes label text)", not bad, str(bad[:3]))
    a0 = G.assemble(text, work, org=AT[0], name="qcheck")
    problems = G.trap_problems(a0, forms=("x0,y1", "y0,x0"))
    gates("assembler traps", not problems, "; ".join(problems[:5]))
    wrong = V.operand_mismatches(a0)
    gates("every instruction decodes with the operands written", not wrong, "; ".join(wrong[:5]))

    shell = qvarea.SHELL.read_text()
    gates("shell.asm is what qvarea.py writes", shell == qvarea.shell_text())
    main_text = harness(win, wout) + shell.replace("\nproc:", "\nqsPROC:")   # dsp_asm branches forward only
    asm = G.assemble(main_text, work, name="qvmain")
    tag = qvarea.tag_of(index)

    longest = max(x.dmin + x.W - N for x in plan.windows) if plan.windows else 0
    n = int(argv[argv.index("--samples") + 1]) if "--samples" in argv else max(16000, longest + 3200)
    frames = -(-n // N)
    cap = (TABLE[1] - TABLE[0]) // 2 // max(win, wout)   # each instance has half the tables
    if frames > cap:
        frames = cap
        print(f"       samples cut to {16 * frames} by the tables (the longest streamed read {longest})")
    n = N * frames
    print(f"{n} samples, the longest streamed read {longest}")

    def records(insts):
        out = []
        for i in range(insts):
            r7 = 0x6000 + 0x100 * (2 + 2 * i)
            rec = 0x7FB0 + 4 * ((r7 >> 8) & 15)
            out.append((G.X, rec, [AT[i], IN_OFF[i], OUT_OFF[i], 0]))
            out.append((G.P, AT[i], qvarea.relocate(ar, AT[i])))
        return out

    def image_for(ins_rows):
        extra = records(len(ins_rows))
        for i, rows in enumerate(ins_rows):
            r7 = 0x6000 + 0x100 * (2 + 2 * i)
            base = TABLE[0] + i * (TABLE[1] - TABLE[0]) // 2
            flat = [v for b in rows for v in b]
            extra.append((G.X, base, flat))
            extra.append((G.X, r7 + H0, [0, 0, base, base, IN_OFF[i]] + [0] * 5 + [OUT_OFF[i], 0]))
        return asm.image(extra=extra, x={0x256 + 2: V.SECOND_BASE})

    def run(insts, ins_rows, tag_, extra=()):
        dump = work / f"{tag_}.outblocks"
        half = (TABLE[1] - TABLE[0]) // 2
        r = G.run(asm, insts, image=image_for(ins_rows), tag=tag_,
                  extra=("-dumpy", f"{TABLE[0]:x},{TABLE[1]:x},{dump}", *extra))
        raw = pathlib.Path(dump).read_bytes()
        words = struct.unpack(f"<{len(raw) // 4}I", raw)
        caps = [[[v & 0xFFFF for v in words[i * half + k * wout:i * half + (k + 1) * wout]] for k in range(frames)]
                for i in range(len(insts))]
        return r, caps

    def check(label, r, caps, i, audio, outs, f0):
        gates.same(f"bit-exact, {label}", r.outputs[i], audio)
        got = caps[i][f0:]
        bad = next((k for k in range(len(outs)) if got[k][:len(outs[k])] != outs[k]), None)
        gates(f"out-blocks: [tag, K, the model's], {label}", bad is None,
              "" if bad is None else f"first difference in the program's frame {bad}")

    sigs = V.signals(n)
    left, right = sigs[0][1], sigs[0][2]
    for label, l_, r_, mix, split in (("noise, MIX 127", left, right, 127, None),
                                      ("impulse, MIX 127", sigs[1][1], sigs[1][2], 127, None),
                                      ("noise, MIX 64", left, right, 64, None),
                                      ("noise, MIX 0", left, right, 0, None),
                                      *((f"noise, split at {s}", left, right, 100, s) for s in (1, 5, 7, 13))):
        f0 = start_frame(plan.size, calls(n, split))
        audio, outs, raw_outs = expected(plan, l_, r_, mix, f0, tag)
        rows = junk(blocks_in(plan, frames, f0, raw_outs, win), 7)
        knobs = [0] * 12
        knobs[qvc.MIX_SLOT] = mix
        r, caps = run([G.Instance(l_, r_, knobs=knobs, split=split)], [rows], "c" + "".join(c for c in label if c.isalnum()))
        check(label, r, caps, 0, audio, outs, f0)
    f0 = start_frame(plan.size, calls(n))
    audio, outs, raw_outs = expected(plan, left, right, 127, f0, tag)
    rows = junk(blocks_in(plan, frames, f0, raw_outs, win), 8)
    knobs = [0] * 12
    knobs[qvc.MIX_SLOT] = 127
    r, caps = run([G.Instance(left, right, knobs=knobs)], [rows], "dirty", extra=("-dirty", hex(0x5A5A5A)))
    check("a dirty Y before init", r, caps, 0, audio, outs, f0)
    l2, r2 = G.noise(n, 0.4, 21), G.noise(n, 0.4, 22)
    f1 = start_frame(plan.size, calls(n, 7))
    audio2, outs2, raw2 = expected(plan, l2, r2, 90, f1, tag)
    rows2 = junk(blocks_in(plan, frames, f1, raw2, win), 9)
    k2 = [0] * 12
    k2[qvc.MIX_SLOT] = 90
    r, caps = run([G.Instance(left, right, knobs=knobs), G.Instance(l2, r2, knobs=k2, split=7)], [rows, rows2], "two")
    check("two instances: the first", r, caps, 0, audio, outs, f0)
    check("two instances: the second (split at 7, MIX 90)", r, caps, 1, audio2, outs2, f1)
    print(f"       layout {r.layout}")
    gates.finish()


if __name__ == "__main__":
    main(sys.argv[1:])
