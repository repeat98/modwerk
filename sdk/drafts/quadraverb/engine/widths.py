#!/usr/bin/env python3
"""What 16-bit words cost against the engine's 24-bit model (ENGINE.md, "Word width"): the input to the owner's
word-width decision, measured on the integer model only.

  python3 -B widths.py <programs.json> <program> [<program> ...] [--seconds S] [--lfo DIR]

For each program and signal (an impulse at 0.25 and noise at 0.1 and 0.3, as check_model.py), the unsplit program on
the original's 64K addresses three ways:
  24-bit     every word 24 bits (qvc.Machine as verified)
  stream     the reads that go through SDRAM in qvs.py's split take 16-bit words, the rest 24 (what the engine runs)
  all 16     every store floored to 16 bits (Machine.narrow_all)
Prints the 24-bit output's peak and, for the other two, the largest difference and its RMS, in dB below full scale.
"""
import json
import math
import random
import sys
import pathlib

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import qvs  # noqa: E402

Q = 1 << 23


def db(v):
    return -999.0 if v <= 0 else 20 * math.log10(v / Q)


def main(argv):
    programs = argv[0]
    secs = float(argv[argv.index("--seconds") + 1]) if "--seconds" in argv else 2.0
    lfo_dir = argv[argv.index("--lfo") + 1] if "--lfo" in argv else None
    ps = [int(a) for a in argv[1:] if a.isdigit()]
    names = {r["p"]: r["name"] for r in json.load(open(programs))}
    n = int(44100 * secs)
    rnd = random.Random(5)
    impulse = [0] * n
    impulse[3] = Q // 4
    sigs = [("impulse 0.25", impulse), ("noise 0.1", [round(0.1 * Q * (2 * rnd.random() - 1)) for _ in range(n)]),
            ("noise 0.3", [round(0.3 * Q * (2 * rnd.random() - 1)) for _ in range(n)])]
    print(f"{secs:g} s; dB below full scale: the 24-bit output's peak; the largest difference / its RMS against it")
    for p in ps:
        plan = qvs.make_plan(programs, p, lfo_dir)
        print(f"{p:2d} {names[p]:16s} {len(plan.narrow)} reads through SDRAM")
        for sname, xs in sigs:
            ref = qvs.reference(plan, xs, xs, narrow=False)
            peak = max(max(abs(v) for v in ch) for ch in ref)
            row = [f"   {sname:12s} peak {db(peak):6.1f}"]
            for label, kw in (("stream", dict(narrow=True)), ("all 16", dict(narrow=False, every=True))):
                got = qvs.reference(plan, xs, xs, **kw)
                diffs = [g - r for gc, rc in zip(got, ref) for g, r in zip(gc, rc)]
                mx = max(abs(d) for d in diffs)
                rms = math.sqrt(sum(d * d for d in diffs) / len(diffs))
                row.append(f"{label} {db(mx):6.1f} / {db(rms):6.1f}")
            print("  ".join(row), flush=True)


if __name__ == "__main__":
    main(sys.argv[1:])
