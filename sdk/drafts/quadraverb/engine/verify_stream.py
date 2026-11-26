#!/usr/bin/env python3
"""The stream's gate: a program split by qvs.py, its DSP code in dsp_host and the ColdFire model, bit for bit against
the integer model of the unsplit program on the original's 64K addresses (ENGINE.md, "The SDRAM stream").

  python3 -B verify_stream.py <programs.json> <program> [--lat FRAMES] [--force LINES] [--samples N]
                              [--cycles DSP_HOST_WITH_STEPTRACE] [--keep DIR] [--lfo DIR]

--force 34,..: stream these lines (hex step numbers of their writes) as far as they can go, needed or not: a test
of a moving window where the split itself keeps the moving reads local.

How the blocks reach dsp_host. The test's proc entry is a stand-in for the base (`proc`, below the engine): before
a frame's first call it points the engine's MBIN and MBOUT words at this frame's bank (X:$2000 or X:$4000 + the
instance's offset, alternating every frame, as the host masks do) and copies the frame's in-block there from a table
in high X; after the frame's last call (a = 1) it copies the out-block into a table in high Y. The in-blocks are the
ColdFire model's (qvs.ColdFire), serving the out-blocks of the DSP model (qvs.SplitEngine) with the channel's
latency, each halfword with random junk in bits 16-23. The gate holds dsp_host's out-blocks to the model's, word for
word, so the ColdFire model fed with the DSP's own out-blocks would have sent exactly the in-blocks injected: the
run is the closed loop, block by block.

Gates:
  plan        the split fits the FX2 buffer with the ring's tables
  models      the DSP model + the ColdFire model == the unsplit program on 64K addresses whose streamed reads take
              16-bit words (qvc.Machine.narrow), noise and impulse; a moving program's with its modulation
  traps       as verify.py (x0,y1 and y0,x0 products only, no rep, every operand as written)
  bit-exact   dsp_host's output and out-blocks == the models: one instance, trig splits at frames 1, 5, 7, 13, a dirty
              Y, two instances on separate buffers, blocks and state
--cycles: the engine's cycles a sample (interlock_scan's model), the stand-in's instructions left out, and the
stream's copies alone.
"""
import os
import pathlib
import random
import struct
import sys

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import verify as V  # noqa: E402
import qvc  # noqa: E402
import qvs  # noqa: E402

G = V.G
TABLE = (0x080000, 0x140000)       # each instance's in-blocks (X) and captured out-blocks (Y), test memory only
BANK_OFF = 0x1000                  # the in-block at bank + $1000 + $400 * instance, the out-block $800 above
HARNESS = 0xC0                     # the stand-in's words, r7 + $c0.. (above the engine's $00-$83: test only)


def harness(st, win, wout):
    """The stand-in for the base: the test's proc entry, which calls the engine's (qvENGP)."""
    x7 = lambda k: f"x:(r7+${k:02x})"
    H = lambda k: x7(HARNESS + k)
    w = st["words"]
    return f"""
; The base's stand-in (verify_stream.py): this frame's blocks, then the engine.
proc:
        move    a1,{H(5)}
        move    r0,{H(6)}
        move    n7,{H(7)}
        tst     a
        bne     qvWXA
        move    #>$000001,x0
        move    x0,{H(1)}
        bra     qvWXF
qvWXA:
        move    {H(1)},b
        clr     a
        move    a,{H(1)}
        tst     b
        bne     qvWXG
qvWXF:
        move    {H(0)},b
        move    #>$000001,x0
        and     x0,b
        asl     #13,b,b
        move    {H(4)},x0
        add     x0,b
        move    b1,{x7(w['MBIN'])}
        move    #>$000800,x0
        add     x0,b
        move    b1,{x7(w['MBOUT'])}
        move    {H(2)},r1
        move    {x7(w['MBIN'])},r2
        do      #{win},qvWXC
        move    x:(r1)+,x0
        move    x0,x:(r2)+
qvWXC:
        move    r1,{H(2)}
qvWXG:
        move    {H(6)},r0
        move    {H(7)},n7
        move    {H(5)},a
        move    #>qvENGP,r1
        nop
        jsr     (r1)
        move    {H(5)},a
        tst     a
        beq     qvWXE
        move    {x7(w['MBOUT'])},r1
        move    {H(3)},r2
        do      #{wout},qvWXD
        move    x:(r1)+,x0
        move    x0,y:(r2)+
qvWXD:
        move    r2,{H(3)}
        move    {H(0)},a
        move    #>$000001,x0
        add     x0,a
        move    a1,{H(0)}
qvWXE:
        rts
"""


def labels_unique(text):
    import re
    labels = re.findall(r"^(\w+):", text, re.M)
    bad = [(a, b) for a in labels for b in labels if a != b and a in b]
    return bad


def junk(blocks, seed):
    rnd = random.Random(seed)
    return [[(v & 0xFFFF) | (rnd.randrange(1, 256) << 16) for v in b] for b in blocks]


def image_for(asm, plan, ins_list, second_base, test_ring=False):
    extra = []
    for i, ins in enumerate(ins_list):
        r7 = 0x6000 + 0x100 * (2 + 2 * i)
        flat = [v for b in ins for v in b]
        assert len(flat) <= TABLE[1] - TABLE[0] and plan.in_words <= 0x400 and plan.out_words <= 0x400
        base = TABLE[0] + i * (TABLE[1] - TABLE[0])
        extra.append((G.X, base, flat))
        extra.append((G.X, r7 + HARNESS, [0, 0, base, base, 0x2000 + BANK_OFF + 0x400 * i]))
    return asm.image(extra=extra, x={0x256 + 2: second_base})


def captured(path, plan, frames, i):
    raw = pathlib.Path(path).read_bytes()
    words = struct.unpack(f"<{len(raw) // 4}I", raw)
    at = i * (TABLE[1] - TABLE[0])
    w = plan.out_words
    return [[v & 0xFFFF for v in words[at + k * w:at + (k + 1) * w]] for k in range(frames)]


def run(asm, plan, image, insts, tag, frames, extra=()):
    dump = asm.work / f"{tag}.outblocks"
    span = len(insts) * (TABLE[1] - TABLE[0])
    r = G.run(asm, insts, image=image, tag=tag,
              extra=("-dumpy", f"{TABLE[0]:x},{TABLE[0] + span:x},{dump}", *extra))
    return r, [captured(dump, plan, frames, i) for i in range(len(insts))]


def price(asm, stdout, frames=G.FRAMES):
    """verify.price without the stand-in's instructions, and the stream's copies alone."""
    import interlock_scan as IS
    calls, cur = [], None
    for line in stdout.splitlines():
        m = IS.TRACE.match(line)
        if not m:
            continue
        if int(m.group(1)) == 0:
            cur = []
            calls.append(cur)
        cur.append(int(m.group(2), 16))
    lo_w = asm.syms["proc"]
    pcs = [pc for pc in calls[-1] if pc < lo_w]
    P = {asm.org + i: w for i, w in enumerate(asm.words)}
    ins = IS.decode(P, pcs, min(pcs))
    seq = []
    for k, pc in enumerate(pcs):
        i = IS.Ins(pc, *ins[pc])
        if i.cond and k + 1 < len(pcs):
            i.taken = pcs[k + 1] != pc + i.nwords
        seq.append(i)
    total, stalls, _ = IS.analyze(seq)
    part = lambda a, b: IS.analyze([i for i in seq if asm.syms[a] <= i.pc < asm.syms[b]])[0] / frames
    out = dict(cycles=total / frames, body=part("qvBODY", "qvSMPE"), cin=part("qvKCIN", "qvKCDN"),
               cout=part("qvKOST", "qvKOUT"), block=total, ticks=[])
    if "qvTICK" in asm.syms:
        t0, t1 = asm.syms["qvTICK"], asm.syms["qvTEND"]
        k = 0
        while k < len(seq):
            if seq[k].pc == t0:
                j = k
                while j < len(seq) and t0 <= seq[j].pc < t1:
                    j += 1
                out["ticks"].append(IS.analyze(seq[k:j])[0])
                k = j
            else:
                k += 1
    return out


def main(argv):
    programs, p = argv[0], int(argv[1])
    lat = int(argv[argv.index("--lat") + 1]) if "--lat" in argv else qvs.LAT
    force = [int(v, 16) for v in argv[argv.index("--force") + 1].split(",")] if "--force" in argv else ()
    lfo_dir = argv[argv.index("--lfo") + 1] if "--lfo" in argv else None
    plan = qvs.make_plan(programs, p, lfo_dir, lat, force)
    names = {r: n for r, n, _ in [(x, qvc.load(programs, x)[0], 0) for x in [p]]}
    gates = G.Gates(f"Quadraverb stream, program {p} {names[p]}")
    print(f"{plan.kind}: {plan.summary()}; latency {lat} frames")
    for x in plan.windows:
        if x.kind == "moving":
            print(f"   moving window, line {x.line:02x}: taps {[f'{t:02x}' for t, _ in x.taps]}, drift {x.lo}..{x.hi} over "
                  f"{x.M} ticks, W {x.W}, region {x.R} words, B {x.Bmin}..{x.Bmax}")
    gates("plan: the split fits the FX2 buffer", plan.fits)
    if not plan.windows:
        sys.exit("[FAIL] nothing streams: verify.py runs this program")
    text, info = qvs.generate(plan)
    gates("plan: the ring and its tables fit", plan.size + len(info["dist"]) + (qvs.FADE_WORDS if plan.kind == "pitch" else 0)
          <= qvc.FX2_WORDS, f"{plan.size} + {len(info['dist'])}")
    longest = max(x.dmin + x.W - qvs.N if x.kind == "static" else x.Bmax + x.W - qvs.N for x in plan.windows)
    n = int(argv[argv.index("--samples") + 1]) if "--samples" in argv else max(16000, longest + 3200)
    n = (n + 15) // 16 * 16
    frames = n // 16
    print(f"program {p}: {info['accesses']} accesses, {info['products']} products, {info['words']} instructions a "
          f"sample in the body; {n} samples (the longest streamed read {longest})")

    sigs = V.signals(n)
    models = {}
    for sname, left, right in sigs:
        (ol, orr), ins, outs = qvs.run_split(plan, left, right)
        want = qvs.reference(plan, left, right)
        gates.same(f"models: DSP model + ColdFire model == the unsplit program (16-bit streamed reads), {sname}",
                   (ol, orr), want)
        nz = sum(1 for v in want[0] if v)
        print(f"       ({nz} non-zero left samples)")
        models[sname] = ((ol, orr), ins, outs)

    G.require_tools()
    tmp = G.workdir("qv-stream-")
    work = pathlib.Path(argv[argv.index("--keep") + 1]) if "--keep" in argv else pathlib.Path(tmp.name)
    work.mkdir(parents=True, exist_ok=True)
    text = text.replace("\nproc:", "\nqvENGP:") + harness(info["stream"], plan.in_words, plan.out_words)
    bad = labels_unique(text)
    gates("labels: none is part of another (dsp_asm substitutes label text)", not bad, str(bad[:3]))
    asm = G.assemble(text, work, name=f"qvs{p}")
    problems = G.trap_problems(asm, forms=("x0,y1", "y0,x0"))
    gates("assembler traps", not problems, "; ".join(problems[:5]))
    wrong = V.operand_mismatches(asm)
    gates("every instruction decodes with the operands written", not wrong, "; ".join(wrong[:5]))

    def check(tag, r, cap, k, want_audio, want_out):
        gates.same(f"bit-exact, {tag}", r.outputs[k], want_audio)
        bad = next((f for f in range(frames) if cap[k][f] != want_out[f]), None)
        gates(f"bit-exact out-blocks, {tag}", bad is None, "" if bad is None else
              f"first difference in frame {bad}: word {next(i for i in range(plan.out_words) if cap[k][bad][i] != want_out[bad][i])}")

    for sname, left, right in sigs:
        (wl, wr), ins, outs = models[sname]
        image = image_for(asm, plan, [junk(ins, 7)], V.SECOND_BASE)
        r, cap = run(asm, plan, image, [G.Instance(left, right)], f"one{sname}", frames)
        check(f"one instance, {sname}", r, cap, 0, (wl, wr), outs)
    left, right = sigs[0][1], sigs[0][2]
    (wl, wr), ins, outs = models["noise"]
    image = image_for(asm, plan, [junk(ins, 8)], V.SECOND_BASE)
    for split in (1, 5, 7, 13):
        r, cap = run(asm, plan, image, [G.Instance(left, right, split=split)], f"split{split}", frames)
        check(f"split at frame {split}", r, cap, 0, (wl, wr), outs)
    r, cap = run(asm, plan, image, [G.Instance(left, right)], "dirty", frames, extra=("-dirty", hex(0x5A5A5A)))
    check("a dirty Y before init", r, cap, 0, (wl, wr), outs)
    l2, r2 = G.noise(n, 0.4, 21), G.noise(n, 0.4, 22)
    (wl2, wr2), ins2, outs2 = qvs.run_split(plan, l2, r2)
    image2 = image_for(asm, plan, [junk(ins, 9), junk(ins2, 10)], V.SECOND_BASE)
    r, cap = run(asm, plan, image2, [G.Instance(left, right), G.Instance(l2, r2, split=7)], "two", frames)
    check("two instances: the first", r, cap, 0, (wl, wr), outs)
    check("two instances: the second (split at 7)", r, cap, 1, (wl2, wr2), outs2)
    print(f"       layout {r.layout}")

    if "--cycles" in argv:
        host = argv[argv.index("--cycles") + 1]
        os.environ.setdefault("OCTABAM_ROOT", str(V.ROOT / "sdk/octabam"))
        sys.path.insert(0, str(V.ROOT / "sdk/cycle-scan"))
        import interlock_scan as IS
        IS.DIS = G.tool("dsp_disasm")
        old = os.environ.get("DSP_HOST")
        os.environ["DSP_HOST"] = host
        traced = [64] if not plan.row else list(range(2, 34))
        cs = []
        try:
            for blocks in traced:
                m = 16 * blocks
                r = G.run(asm, [G.Instance(left[:m], right[:m])], image=image, tag="trace",
                          extra=("-trace", "400000", "-trackinst", "0", "-steptrace", "-diff", str(blocks)))
                gates.same(f"bit-exact under the tracing host, {blocks} blocks", r.outputs[0],
                           tuple(v[:m] for v in (wl, wr)))
                cs.append(price(asm, r.stdout))
        finally:
            if old is None:
                del os.environ["DSP_HOST"]
            else:
                os.environ["DSP_HOST"] = old
        mean = sum(c["cycles"] for c in cs) / len(cs)
        worst = max(c["cycles"] for c in cs)
        body = sum(c["body"] for c in cs) / len(cs)
        cin = sum(c["cin"] for c in cs) / len(cs)
        cout = sum(c["cout"] for c in cs) / len(cs)
        print(f"cycles a sample (interlock_scan, {len(cs)} traced block(s)): proc {mean:.1f} on average, {worst:.1f} in the "
              f"dearest block; the body {body:.1f}; the copy in {cin:.1f} ({plan.in_words} words, "
              f"{cin * 16 / plan.in_words:.2f} a word), the copy out {cout:.1f} ({plan.out_words} words, "
              f"{cout * 16 / plan.out_words:.2f} a word)")
        ticks = [t for c in cs for t in c["ticks"]]
        if ticks:
            print(f"a tick: {min(ticks)}-{max(ticks)} cycles")
    gates.finish()


if __name__ == "__main__":
    main(sys.argv[1:])
