#!/usr/bin/env python3
"""The gate of a Quadraverb development build: the packaged engine (qvunit.py gen) in dsp_host, bit for bit against the
integer model, with its knob and its spread ring clear.

  python3 -B verify_unit.py <programs.json> <program> [--asm FILE] [--cycles DSP_HOST_WITH_STEPTRACE] [--samples N]

FILE defaults to the draft's gen/engine.asm, the file the package is built from; the gate first checks it is what
qvc.generate(unit=True) makes of the program now (so it is neither stale nor edited by hand).

What a unit build adds to the prototype verify.py holds (qvc.USTATE):
  clear    the ring is cleared CLEAR_WORDS a call, not in init; until it is clear the wet is silent and the engine does
           not run, so the model starts on the sample after the last clearing call (S0, from the calls' lengths)
  mix      out = floor((wet m + dry (128 - m)) / 128), m = MIX + (MIX >= 64): MIX 127 is the wet alone, 0 the dry alone
  setup    init and a proc that meets another build's state set up through one subroutine; the dispatcher's r0, n7 and
           r6 are given back (not visible in dsp_host: by inspection)
Gates: the file, labels, traps, operands; bit-exact at MIX 127 (noise, impulse), 0, 64 and 100 under an LFO's dirty
word, trig splits at 1, 5, 7 and 13, a Y full of garbage before init, two instances, a stale signature at the first
call, and dsp_host's guard over the instance's 15,870 words (no stray write). --cycles: interlock_scan's model of a
steady call (static: one block; moving: 32 blocks, so the ticks fall at every position) and of a clearing call.
"""
import os
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import qvc  # noqa: E402
import qvunit  # noqa: E402
import verify as V  # noqa: E402  (the prototype's gate: model, signals, operand and label checks, price)

G = V.G


def clear_samples(size, n_calls_lengths):
    """Samples the clearing calls take: the first ceil(size / CLEAR_WORDS) calls."""
    calls = -(-size // qvc.CLEAR_WORDS)
    return sum(n_calls_lengths[:calls])


def call_lengths(n, split=None):
    out = []
    while sum(out) < n:
        out += [split, 16 - split] if split else [16]
    return out


def expect(model_out, left, right, mix, s0):
    """The unit build's output: the dry at its mix while the ring clears (s0 samples), then the model's wet mixed."""
    wl, wr = model_out
    n = len(left)
    ol, orr = [], []
    for i in range(n):
        a, b = (0, 0) if i < s0 else (wl[i - s0], wr[i - s0])
        ol.append(qvc.mix_out(a, left[i], mix))
        orr.append(qvc.mix_out(b, right[i], mix))
    return ol, orr


def main(argv):
    path, p = argv[0], int(argv[1])
    n = int(argv[argv.index("--samples") + 1]) if "--samples" in argv else 16 * 1000
    asm_file = pathlib.Path(argv[argv.index("--asm") + 1]) if "--asm" in argv else qvunit.GEN / "engine.asm"
    name, text, info, m = qvunit.compile_program(path, p)
    steps, addr, size, mv = m["steps"], m["addr"], m["size"], m.get("mv")
    gates = G.Gates(f"Quadraverb development build, program {p} {' '.join(name.split())}")
    packaged = asm_file.read_text() if asm_file.exists() else None
    gates(f"the packaged engine ({asm_file}) is qvc.generate(unit=True)'s, unedited", packaged == text + "\n",
          "" if packaged == text + "\n" else "missing: run qvunit.py gen" if packaged is None else
          "differs: run qvunit.py gen again")
    calls = -(-size // qvc.CLEAR_WORDS)
    print(f"ring {size} words: cleared in {calls} calls of up to {qvc.CLEAR_WORDS} words; {info['words']} instructions "
          f"a sample in the body")

    def model(left, right, s0):
        return V.model(steps, addr, size, left[s0:], right[s0:], mv)

    G.require_tools()
    tmp = G.workdir("qv-unit-")
    work = pathlib.Path(tmp.name)
    bad = V.labels_unique(text)
    gates("labels: none is part of another (dsp_asm substitutes label text)", not bad, str(bad[:3]))
    asm = G.assemble(text, work, name=f"qvu{p}")
    problems = G.trap_problems(asm, forms=("x0,y1", "y0,x0"))
    gates("assembler traps", not problems, "; ".join(problems[:5]))
    wrong = V.operand_mismatches(asm)
    gates("every instruction decodes with the operands written", not wrong, "; ".join(wrong[:5]))
    offsets = G.state_offsets(text)
    gates("the r7 block: $00..$83 only", max(offsets) < qvc.R7_END, f"highest ${max(offsets):02x}")
    image = asm.image(x={0x256 + 2: V.SECOND_BASE})

    sigs = V.signals(n)
    meter = 0

    def case(label, left, right, mix, split=None, knobs=None, **kw):
        nonlocal meter
        s0 = clear_samples(size, call_lengths(len(left), split))
        want = expect(model(left, right, s0), left, right, mix, s0)
        knob = [0] * 12
        knob[qvc.MIX_SLOT] = mix
        r = G.run(asm, [G.Instance(left, right, knobs=knobs or knob, split=split)], image=image, tag="c" + "".join(ch for ch in label if ch.isalnum())[:32], **kw)
        meter = max(meter, r.meter or 0)
        gates.same(f"bit-exact, {label}", r.outputs[0], want)
        return r

    noise_l, noise_r = sigs[0][1], sigs[0][2]
    imp_l, imp_r = sigs[1][1], sigs[1][2]
    case("MIX 127 (the wet alone), noise", noise_l, noise_r, 127)
    case("MIX 127, two impulses", imp_l, imp_r, 127)
    case("MIX 0 (the dry alone), noise", noise_l, noise_r, 0)
    case("MIX 64, noise", noise_l, noise_r, 64)
    knob = [0] * 12
    knob[qvc.MIX_SLOT] = 100
    case("MIX 100 under an LFO (bits 8-15 of its word set)", noise_l, noise_r, 100, knobs=knob,
         pwords=[(0, qvc.MIX_SLOT, 100 << 16 | 0xA500)])
    for split in (1, 5, 7, 13):
        case(f"MIX 90, split at frame {split}", noise_l, noise_r, 90, split=split)
    case("MIX 127, Y full of garbage before init (the spread clear)", noise_l, noise_r, 127, dirty=0x5A5A5A)
    r = case("MIX 127, the guard over the instance's 15,870 words", noise_l, noise_r, 127, guard=qvc.FX2_WORDS,
             check=False)
    gates("the guard: no stray write, no clobber", r.stray[0] == 0 and r.clobbers[0] == 0 and r.returncode == 0,
          f"stray {r.stray[0]}, clobbers {r.clobbers[0]}, exit {r.returncode}")

    # Two instances: separate buffers and state blocks, the second split at 7, each with its own MIX.
    l2, r2 = G.noise(n, 0.4, 21), G.noise(n, 0.4, 22)
    k1, k2 = [0] * 12, [0] * 12
    k1[qvc.MIX_SLOT], k2[qvc.MIX_SLOT] = 127, 64
    r = G.run(asm, [G.Instance(noise_l, noise_r, knobs=k1), G.Instance(l2, r2, knobs=k2, split=7)], image=image, tag="two")
    s0a = clear_samples(size, call_lengths(n))
    s0b = clear_samples(size, call_lengths(n, 7))
    gates.same("bit-exact, two instances: the first", r.outputs[0],
               expect(model(noise_l, noise_r, s0a), noise_l, noise_r, 127, s0a))
    gates.same("bit-exact, two instances: the second (split at 7, MIX 64)", r.outputs[1],
               expect(model(l2, r2, s0b), l2, r2, 64, s0b))
    print(f"       layout {r.layout}")

    # A stale state: init leaves another build's signature, so the first call sets up afresh from the kept base.
    stale = text.replace(f"        bsr     qvSETUP\n        rts\n",
                         f"        bsr     qvSETUP\n        clr     b\n        move    b,x:(r7+$0c)\n        rts\n", 1)
    assert stale != text
    sasm = G.assemble(stale, work, name=f"qvs{p}")
    s0 = clear_samples(size, call_lengths(n))
    r = G.run(sasm, [G.Instance(noise_l, noise_r, knobs=k1)], image=sasm.image(x={0x256 + 2: V.SECOND_BASE}), tag="stale")
    gates.same("bit-exact, another build's state at the first call (proc sets up afresh)", r.outputs[0],
               expect(model(noise_l, noise_r, s0), noise_l, noise_r, 127, s0))
    print(f"meter: {meter} executed instructions a sample, the worst block (the clearing calls included)")

    if "--cycles" in argv:
        host = argv[argv.index("--cycles") + 1]
        os.environ.setdefault("OCTABAM_ROOT", str(V.ROOT / "sdk/octabam"))
        sys.path.insert(0, str(V.ROOT / "sdk/cycle-scan"))
        import interlock_scan as IS
        IS.DIS = G.tool("dsp_disasm")
        old = os.environ.get("DSP_HOST")
        os.environ["DSP_HOST"] = host
        first = calls + 2                     # the first block after the clear, and one more
        traced = [64] if m["static"] else list(range(first, first + 32))
        cs = []
        try:
            def trace(blocks, mix=127):
                s = 16 * blocks
                kn = [0] * 12
                kn[qvc.MIX_SLOT] = mix
                s0_ = clear_samples(size, call_lengths(s))
                rr = G.run(asm, [G.Instance(noise_l[:s], noise_r[:s], knobs=kn)], image=image, tag="trace",
                           extra=("-trace", "400000", "-trackinst", "0", "-steptrace", "-diff", str(blocks)))
                gates.same(f"bit-exact under the tracing host, {blocks} blocks", rr.outputs[0],
                           expect(model(noise_l[:s], noise_r[:s], s0_), noise_l[:s], noise_r[:s], mix, s0_))
                return V.price(asm, rr.stdout)
            for blocks in traced:
                cs.append(trace(blocks))
            wipe = trace(2)                    # block 1: a clearing call
        finally:
            if old is None:
                del os.environ["DSP_HOST"]
            else:
                os.environ["DSP_HOST"] = old
        F = G.FRAMES
        mean = sum(x["cycles"] for x in cs) / len(cs)
        worst = max(cs, key=lambda x: x["cycles"])
        body = sum(x["body_cycles"] for x in cs) / len(cs)
        line = (f"cycles a sample (interlock_scan, {'block 63' if m['static'] else f'blocks {traced[0] - 1}-{traced[-1] - 1}'}): "
                f"proc {mean:.1f} on average, {worst['cycles']:.1f} in the dearest block; the body {body:.1f}; "
                f"executed {worst['executed']:.1f} instructions a sample in the dearest block; "
                f"a clearing call {wipe['cycles']:.1f} a sample ({wipe['cycles'] * F:.0f} cycles)")
        if not m["static"]:
            ticks = [t for x in cs for t in x["ticks"]]
            line += f"; {len(ticks)} ticks of {min(ticks)}-{max(ticks)} cycles"
        print(line)
    gates.finish()


if __name__ == "__main__":
    main(sys.argv[1:])
