#!/usr/bin/env python3
"""The Quadraverb engine prototype's gate: a program compiled by qvc.py, run in dsp_host, bit for bit against the
integer model; and the model's relocation against the program as the original addresses it.

  python3 -B verify.py <programs.json> <program> [--samples N] [--cycles DSP_HOST_WITH_STEPTRACE] [--keep DIR] [--plain]
                       [--lfo DIR] [--realtime] [--test-ring]

--plain: the generator's plain form (no stall scheduling, qvc.generate(schedule=False)).
A moving program (a sweep, pitch shift or Leslie) comes from extract_lfo.mjs's output in --lfo DIR (default
~/.cache/modwerk-local/quadraverb/engine/lfo): its start program, LFO state and the firmware's program after every
tick. --realtime: ticks a second as on the original instead of samples a tick (ENGINE.md, "Tick timing").
--test-ring: a ring larger than the FX2 buffer, for dsp_host only (its Y memory goes past the chip's): the gate then
proves the code, not that the program fits a unit.

Gates:
  tables       (moving) the model's DSP program after every tick == the firmware's (16,384 ticks recorded by
               extract_lfo.mjs, which also checks tools/qvlfo.mjs's reconstruction against it), and the DSP's
               triangle step (qvc.tri8_plain) == the firmware's (qvc.tri8) at every phase and direction
  relocation   the model on the relocated ring == the model on the original's 64K addresses (noise, impulse);
               a moving program's with its modulation running
  traps        the assembler traps of sdk/octabam/docs/TRAPS.md (only x0,y1 and y0,x0 products, no mpysu, no rep)
  bit-exact    dsp_host's output == the model: noise and an impulse, one instance, 16-frame blocks; trig splits at
               several frames; two instances on separate buffers and state blocks, each with its own input
--cycles: one steady block traced (-steptrace) and priced by sdk/cycle-scan/interlock_scan.py, the whole proc and
the sample loop's body alone, in cycles a sample.
"""
import json
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


def model(steps, addr, size, left, right, mv=None):
    if mv:
        return qvc.Moving(mv["row"], mv["fade"], size, addr, mv["off"], mv["timing"]).run(left, right)
    return qvc.Machine(steps, size, addr).run(left, right)


def raw_model(steps, left, right, mv=None):
    if mv:
        return qvc.Moving(mv["row"], mv["fade"], 0x10000, [s["a"] for s in steps], None, mv["timing"]).run(left, right)
    return qvc.raw_machine(steps).run(left, right)


def table_gates(gates, row, fade, lfo_dir):
    """The model's program after every tick against the firmware's, and tri8_plain against tri8."""
    lfo = qvc.Lfo(row)
    lfo.fade = fade
    img = qvc.image_of(row["steps"])
    want = qvc.ticks_of(lfo_dir, row["p"])
    bad = None
    for t, w in enumerate(want):
        for b, v in lfo.tick():
            img[b] = v
        if bytes(img) != w:
            bad = t
            break
    gates(f"tables: the model's program == the firmware's after each of {len(want)} ticks", bad is None,
          "" if bad is None else f"first difference after tick {bad + 1}: steps "
          + " ".join(f"{i:02x}" for i in range(96) if img[4 * i:4 * i + 4] != w[4 * i:4 * i + 4]))
    if row["kind"] == "sweep":
        r = row["params"]["rate"]
        wrong = 0
        for D in (0, 1):
            for P in range(0x10000):
                st = dict(P=P, D=D, H=0)
                qvc.tri8(st, r)
                got = qvc.tri8_plain(P, D, r)
                wrong += (st["P"], st["D"], st["H"]) != (got[0], got[1], int(got[2]))
        gates(f"tables: the DSP's triangle step == the firmware's at rate {r}, every phase and direction", not wrong,
              f"{wrong} differ")


def signals(n):
    impulse = [0] * n
    impulse[3] = impulse[3 + 4800] = G.Q // 2      # two impulses, the second while the first still rings
    return [("noise", G.noise(n, 0.45, 11), G.noise(n, 0.3, 12)),
            ("impulse", impulse, [0] * n)]


def operand_mismatches(asm):
    """Every instruction whose disassembled operands differ from dsp_asm's listing (stronger than trap_problems,
    which compares mnemonics): numbers compared by value."""
    def norm(s, at=None):
        s = re.sub(r"\s+", " ", s.strip().lower())
        s = re.sub(r"func_0*([0-9a-f]+)", lambda m: "$" + m.group(1), s)
        s = re.sub(r"#<?>?(\d+)\b(?!\))", lambda m: "#$%x" % int(m.group(1)), s)     # dsp_asm lists #3, the disassembler #$3
        if at is not None and re.match(r"^b(cc|cs|eq|ne|ge|gt|le|lt|ra|sr|pl|mi) ", s):
            # dsp_asm lists a relative branch's displacement, the disassembler its target
            s = re.sub(r"\$([0-9a-f]+)$", lambda m: "$%x" % ((at + int(m.group(1), 16)) & 0xFFFFFF), s)
        s = re.sub(r"\$0*([0-9a-f]+)", lambda m: "$" + m.group(1), s)
        return s.replace("#>", "#").replace(">", "").replace("<", "").replace("$0)", ")")
    wrote = G.listing(asm)
    return [f"P:{l.addr:04x} {wrote[l.addr].text.strip()} decodes {l.mnemonic} {l.operands}" for l in G.disassemble(asm)
            if l.addr in wrote and norm(wrote[l.addr].mnemonic + " " + wrote[l.addr].operands, l.addr)
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
    out = dict(executed=len(pcs) / frames, cycles=total / frames, body_executed=len(body) / frames,
               body_cycles=btotal / frames, body_stalls={k: v / frames for k, v in bstalls.items() if v},
               stalls={k: v / frames for k, v in stalls.items() if v}, block=total, ticks=[])
    if "qvTICK" in asm.syms:
        # every tick's own instructions (qvTICK .. qvTEND), priced on their own
        t0, t1 = asm.syms["qvTICK"], asm.syms["qvTEND"]
        k = 0
        while k < len(seq):
            if seq[k].pc == t0:
                j = k
                while j < len(seq) and t0 <= seq[j].pc < t1:
                    j += 1
                tc, ts, _ = IS.analyze(seq[k:j])
                out["ticks"].append(tc)
                out.setdefault("tick_stalls", []).append(sum(ts.values()))
                k = j
            else:
                k += 1
    return out


def main(argv):
    path, p = argv[0], int(argv[1])
    n = int(argv[argv.index("--samples") + 1]) if "--samples" in argv else 16 * 1000
    name, steps, static = qvc.load(path, p)
    gates = G.Gates(f"Quadraverb engine prototype, program {p} {name}")
    mv, mod = None, None
    ring_max = 1 << 20 if "--test-ring" in argv else qvc.FX2_WORDS
    if static:
        addr, size = qvc.relocate(steps, ring_max)
    else:
        lfo_dir = pathlib.Path(argv[argv.index("--lfo") + 1] if "--lfo" in argv else
                               pathlib.Path.home() / ".cache/modwerk-local/quadraverb/engine/lfo")
        row, fade = qvc.load_lfo(lfo_dir / "lfo.json", p)
        gates("a moving program extract_lfo.mjs gives", row is not None)
        steps = row["steps"]
        lfo = qvc.Lfo(row)
        lfo.fade = fade
        moving = lfo.moves(steps)
        addr, size, off = qvc.relocate(steps, ring_max, moving)
        timing = qvc.tick_timing(row, "--realtime" in argv)
        mv = dict(row=row, fade=fade, off=off, timing=timing)
        mod = dict(lfo=lfo, moving=moving, off=off, timing=timing, fade=fade)
        print(f"{row['kind']}: {json.dumps(row['params'])}; a tick every {timing[2]:.4f} samples "
              f"({'ticks a second as on the original' if '--realtime' in argv else 'samples a tick as on the original'}),"
              f" {row['tickUs']:.2f} us a tick")
        if size > qvc.FX2_WORDS:
            print(f"[INFO] the ring needs {size} words, more than the FX2 buffer's {qvc.FX2_WORDS}: a host-only test")
        table_gates(gates, row, fade, lfo_dir)
    # The chains walk the ring by modulo addressing, whose buffers hold at most 32,768 words on the DSP56300
    # (M = $0001-$7fff; from $8000 M selects multiple wrap-around) and in dsp_host: far above an FX2 slot's ring,
    # but a limit for --test-ring.
    if size > 0x8000:
        sys.exit(f"[FAIL] a ring of {size} words: modulo addressing takes at most 32,768, so no host test either")
    text, info = qvc.generate(steps, addr, size, schedule="--plain" not in argv, mod=mod)
    print(f"program {p} {name} ({'plain' if '--plain' in argv else 'scheduled'}): ring {size} words, {info['accesses']} accesses, {info['products']} products, "
          f"{len(info['dist'])} distances, {info['words']} instructions a sample")

    sigs = signals(n)
    want = {}
    for sname, left, right in sigs:
        want[sname] = model(steps, addr, size, left, right, mv)
        raw = raw_model(steps, left, right, mv)
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
    if size <= 0x4000:
        image = asm.image(x={0x256 + 2: SECOND_BASE})
    else:
        # --test-ring: a modulo ring over 16K words needs a base on a multiple of the next power of two (the
        # DSP56300's modulo addressing), which the FX2 slot's Y:0x4000 is not: both instances go to 64K-aligned
        # words that only dsp_host has
        assert "--test-ring" in argv
        image = asm.image(x={0x256: 0x10000, 0x256 + 2: 0x20000})

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
    want2 = model(steps, addr, size, l2, r2, mv)
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
        # dsp_host traces block 0 and block -diff - 1: a static program prices block 63; a moving one every
        # block from 1 to 32 (one run each), so the ticks fall on every position a block can hold them
        traced = [64] if static else list(range(2, 34))
        cs = []
        try:
            for blocks in traced:
                m = 16 * blocks
                r = G.run(asm, [G.Instance(left[:m], right[:m])], image=image, tag="trace",
                          extra=("-trace", "400000", "-trackinst", "0", "-steptrace", "-diff", str(blocks)))
                gates.same(f"bit-exact under the tracing host, {blocks} blocks", r.outputs[0],
                           tuple(v[:m] for v in want["noise"]))
                cs.append(price(asm, r.stdout))
        finally:
            if old is None:
                del os.environ["DSP_HOST"]
            else:
                os.environ["DSP_HOST"] = old
        c = cs[-1]
        if static:
            print(f"cycles a sample (interlock_scan): proc {c['cycles']:.1f} ({c['executed']:.1f} executed), "
                  f"the body {c['body_cycles']:.1f} ({c['body_executed']:.1f} executed); body stalls "
                  + ", ".join(f"{k} {v:.1f}" for k, v in c["body_stalls"].items()))
        else:
            F = G.FRAMES
            mean = sum(x["cycles"] for x in cs) / len(cs)
            worst = max(cs, key=lambda x: x["cycles"])
            quiet = [x for x in cs if not x["ticks"]]
            ticks = [t for x in cs for t in x["ticks"]]
            body = sum(x["body_cycles"] for x in cs) / len(cs)
            other = [(x["block"] - x["body_cycles"] * F - sum(x["ticks"])) for x in cs]
            print(f"cycles a sample (interlock_scan, blocks 1-{len(cs)}, {len(ticks)} ticks): proc {mean:.1f} on "
                  f"average, {worst['cycles']:.1f} in the dearest block ({len(worst['ticks'])} ticks)"
                  + (f", {min(x['cycles'] for x in quiet):.1f} in a block without one" if quiet else "")
                  + f"; the body {body:.1f}; body stalls "
                  + ", ".join(f"{k} {v:.1f}" for k, v in c["body_stalls"].items()))
            base = min(other)
            seg = max((o - base) / len(x["ticks"]) for o, x in zip(other, cs) if x["ticks"])
            tstalls = [t for x in cs for t in x.get("tick_stalls", [])]
            print(f"a tick: {min(ticks)}-{max(ticks)} cycles ({sum(ticks) / len(ticks):.1f} mean, "
                  f"{sum(tstalls) / len(tstalls):.1f} of them stalls), "
                  f"{sum(ticks) / len(ticks) / mv['timing'][2]:.1f} a sample on average; the proc around the body "
                  f"and the ticks {base / F:.1f}-{max(other) / F:.1f} a sample, a tick's segment adding up to {seg:.0f}; "
                  f"the dearest sample (the body, the dearest tick, its segment) about "
                  f"{body + base / F + max(ticks) + seg:.0f} cycles")
    gates.finish()


if __name__ == "__main__":
    main(sys.argv[1:])
