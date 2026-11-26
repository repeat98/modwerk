#!/usr/bin/env python3
"""The Quadraverb engine prototype's gate: a program compiled by qvc.py, run in dsp_host, bit for bit against the
integer model; and the model's relocation against the program as the original addresses it.

  python3 -B verify.py <programs.json> <program> [--samples N] [--cycles DSP_HOST_WITH_STEPTRACE] [--keep DIR] [--plain]

--plain: the generator's plain form (no stall scheduling, qvc.generate(schedule=False)).

Gates:
  relocation   the model on the relocated ring == the model on the original's 64K addresses (noise, impulse)
  traps        the assembler traps of sdk/octabam/docs/TRAPS.md (only x0,y1 and y0,x0 products, no mpysu, no rep)
  bit-exact    dsp_host's output == the model: noise and an impulse, one instance, 16-frame blocks; trig splits at
               several frames; two instances on separate buffers and state blocks, each with its own input
--cycles: one steady block traced (-steptrace) and priced by sdk/cycle-scan/interlock_scan.py, the whole proc and
the sample loop's body alone, in cycles a sample.
"""
import os
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent
ROOT = next(up for up in HERE.parents if (up / "sdk/octatrack/tools/dsp_gate.py").exists())
sys.path.insert(0, str(ROOT / "sdk/octatrack/tools"))
sys.path.insert(0, str(HERE))
import dsp_gate as G  # noqa: E402
import qvc  # noqa: E402

SECOND_BASE = 0x8000   # the second instance's buffer (the synthetic allocator hands every entry 0x4000)


def model(steps, addr, size, left, right):
    return qvc.Machine(steps, size, addr).run(left, right)


def signals(n):
    impulse = [0] * n
    impulse[3] = impulse[3 + 4800] = G.Q // 2      # two impulses, the second while the first still rings
    return [("noise", G.noise(n, 0.45, 11), G.noise(n, 0.3, 12)),
            ("impulse", impulse, [0] * n)]


def operand_mismatches(asm):
    """Every instruction whose disassembled operands differ from dsp_asm's listing (stronger than trap_problems,
    which compares mnemonics): numbers compared by value."""
    def norm(s):
        s = re.sub(r"\s+", " ", s.strip().lower())
        s = re.sub(r"\$0*([0-9a-f]+)", lambda m: "$" + m.group(1), s)
        return s.replace("#>", "#").replace(">", "").replace("<", "").replace("$0)", ")")
    wrote = G.listing(asm)
    return [f"P:{l.addr:04x} {wrote[l.addr].text.strip()} decodes {l.mnemonic} {l.operands}" for l in G.disassemble(asm)
            if l.addr in wrote and norm(wrote[l.addr].mnemonic + " " + wrote[l.addr].operands)
            != norm(l.mnemonic + " " + l.operands)]


def price(asm, stdout, frames=G.FRAMES):
    """Cycles a sample of the last traced call, the whole proc and the body alone (interlock_scan's model)."""
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
    pcs = calls[-1]
    P = {asm.org + i: w for i, w in enumerate(asm.words)}
    ins = IS.decode(P, pcs, min(pcs))
    seq = []
    for k, pc in enumerate(pcs):
        i = IS.Ins(pc, *ins[pc])
        if i.cond and k + 1 < len(pcs):
            i.taken = pcs[k + 1] != pc + i.nwords
        seq.append(i)
    total, stalls, _ = IS.analyze(seq)
    lo, hi = asm.syms["qvBODY"], asm.syms["qvSMPE"]
    body = [i for i in seq if lo <= i.pc < hi]
    btotal, bstalls, _ = IS.analyze(body)
    return dict(executed=len(pcs) / frames, cycles=total / frames, body_executed=len(body) / frames,
                body_cycles=btotal / frames, body_stalls={k: v / frames for k, v in bstalls.items() if v},
                stalls={k: v / frames for k, v in stalls.items() if v})


def main(argv):
    path, p = argv[0], int(argv[1])
    n = int(argv[argv.index("--samples") + 1]) if "--samples" in argv else 16 * 1000
    name, steps, static = qvc.load(path, p)
    gates = G.Gates(f"Quadraverb engine prototype, program {p} {name}")
    gates("a static program", static)
    addr, size = qvc.relocate(steps)
    text, info = qvc.generate(steps, addr, size, schedule="--plain" not in argv)
    print(f"program {p} {name} ({'plain' if '--plain' in argv else 'scheduled'}): ring {size} words, {info['accesses']} accesses, {info['products']} products, "
          f"{len(info['dist'])} distances, {info['words']} instructions a sample")

    sigs = signals(n)
    want = {}
    for sname, left, right in sigs:
        want[sname] = model(steps, addr, size, left, right)
        raw = qvc.raw_machine(steps).run(left, right)
        gates.same(f"relocation: the ring model == the 64K model, {sname}", raw, want[sname])

    G.require_tools()
    tmp = G.workdir("qv-engine-")
    work = pathlib.Path(argv[argv.index("--keep") + 1]) if "--keep" in argv else pathlib.Path(tmp.name)
    work.mkdir(parents=True, exist_ok=True)
    asm = G.assemble(text, work, name=f"qv{p}")
    problems = G.trap_problems(asm, forms=("x0,y1", "y0,x0"))
    gates("assembler traps", not problems, "; ".join(problems[:5]))
    wrong = operand_mismatches(asm)
    gates("every instruction decodes with the operands written", not wrong, "; ".join(wrong[:5]))
    image = asm.image(x={0x256 + 2: SECOND_BASE})

    meter = 0
    for sname, left, right in sigs:
        r = G.run(asm, [G.Instance(left, right)], image=image, tag=f"one{sname}")
        meter = max(meter, r.meter)
        gates.same(f"bit-exact, one instance, {sname}", r.outputs[0], want[sname])
        nz = sum(1 for v in want[sname][0] if v)
        print(f"       ({nz} non-zero left samples in the model)")
    left, right = sigs[0][1], sigs[0][2]
    for split in (1, 5, 7, 13):
        r = G.run(asm, [G.Instance(left, right, split=split)], image=image, tag=f"split{split}")
        meter = max(meter, r.meter)
        gates.same(f"bit-exact, split at frame {split}", r.outputs[0], want["noise"])
    r = G.run(asm, [G.Instance(left, right)], image=image, tag="dirty", dirty=0x5A5A5A)
    gates.same("bit-exact from a state block full of another effect's words (init clears it)", r.outputs[0],
               want["noise"])
    l2, r2 = G.noise(n, 0.4, 21), G.noise(n, 0.4, 22)
    want2 = model(steps, addr, size, l2, r2)
    r = G.run(asm, [G.Instance(left, right), G.Instance(l2, r2, split=7)], image=image, tag="two")
    meter = max(meter, r.meter)
    gates.same("bit-exact, two instances: the first", r.outputs[0], want["noise"])
    gates.same("bit-exact, two instances: the second (split at 7)", r.outputs[1], want2)
    print(f"       layout {r.layout}")
    print(f"meter: {meter} executed instructions a sample, the worst block")

    if "--cycles" in argv:
        host = argv[argv.index("--cycles") + 1]
        os.environ.setdefault("OCTABAM_ROOT", str(ROOT / "sdk/octabam"))
        sys.path.insert(0, str(ROOT / "sdk/cycle-scan"))
        import interlock_scan as IS
        IS.DIS = G.tool("dsp_disasm")
        old = os.environ.get("DSP_HOST")
        os.environ["DSP_HOST"] = host
        blocks = 64
        m = 16 * blocks
        try:
            r = G.run(asm, [G.Instance(left[:m], right[:m])], image=image, tag="trace",
                      extra=("-trace", "400000", "-trackinst", "0", "-steptrace", "-diff", str(blocks)))
        finally:
            if old is None:
                del os.environ["DSP_HOST"]
            else:
                os.environ["DSP_HOST"] = old
        gates.same("bit-exact under the tracing host", r.outputs[0], tuple(v[:m] for v in want["noise"]))
        c = price(asm, r.stdout)
        print(f"cycles a sample (interlock_scan): proc {c['cycles']:.1f} ({c['executed']:.1f} executed), "
              f"the body {c['body_cycles']:.1f} ({c['body_executed']:.1f} executed); body stalls "
              + ", ".join(f"{k} {v:.1f}" for k, v in c["body_stalls"].items()))
    gates.finish()


if __name__ == "__main__":
    main(sys.argv[1:])
