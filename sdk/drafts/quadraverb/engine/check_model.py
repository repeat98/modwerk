#!/usr/bin/env python3
"""The integer model (qvc.Machine, on the original's 64K addresses) against tools/qv.mjs's floating-point model of the
original, on the same program and input: an impulse response and noise. Prints the largest difference in 24-bit LSBs
and in dB below full scale, and fails past the tolerance.

  python3 -B check_model.py <programs.json> <program> [--samples N] [--tolerance-db DB] [--frac BITS]

Needs node on PATH (it runs float_ir.mjs). --frac runs the integer model with wider words (BITS fraction bits instead of the DSP's 23), to show how much of a
difference is truncation: it shrinks by about 2^(BITS-23) when it is.

What the difference measures: the integer model truncates every stored word to 24 bits and saturates outside
[-1, 1); the float model does neither (qv.mjs: "Word width and saturation are not modelled yet"). Below saturation the
two agree to within the accumulated truncation, so a difference near full scale would mean the integer model plays
another program. A case where the integer model saturates a store is reported, not judged.

The default tolerance is -80 dBFS (about 840 LSB at 24 bits). Truncation alone reaches -91 dBFS in SKANK GUITAR (56),
whose resonant filters amplify it; with --frac 31 the same difference falls by about 250 times, so it is truncation
and not a different program. Far below anything audible either way.
"""
import json
import math
import pathlib
import random
import subprocess
import sys
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import qvc  # noqa: E402

Q = 1 << 23


def float_model(programs, p, xs):
    with tempfile.TemporaryDirectory(prefix="qv-float-") as d:
        i, o = pathlib.Path(d) / "in.json", pathlib.Path(d) / "out.json"
        i.write_text(json.dumps([x / Q for x in xs]))
        subprocess.run(["node", str(HERE / "float_ir.mjs"), programs, str(p), str(i), str(o)], check=True)
        out = json.loads(o.read_text())
    return out["left"], out["right"]


def main(argv):
    programs, p = argv[0], int(argv[1])
    n = int(argv[argv.index("--samples") + 1]) if "--samples" in argv else 44100 * 2
    tol = float(argv[argv.index("--tolerance-db") + 1]) if "--tolerance-db" in argv else -80.0
    frac = int(argv[argv.index("--frac") + 1]) if "--frac" in argv else 23
    name, steps, _ = qvc.load(programs, p)
    rnd = random.Random(5)
    impulse = [0] * n
    impulse[3] = Q // 4
    cases = [("impulse 0.25", impulse), ("noise 0.1", [round(0.1 * Q * (2 * rnd.random() - 1)) for _ in range(n)]),
             ("noise 0.3", [round(0.3 * Q * (2 * rnd.random() - 1)) for _ in range(n)])]
    ok = True
    for cname, xs in cases:
        m = qvc.raw_machine(steps, frac)
        il, ir = [], []
        saturated = [0]
        plain = qvc.lim

        def lim(acc, f=23):
            saturated[0] += not -(1 << (2 * f + 1)) <= acc < 1 << (2 * f + 1)
            return plain(acc, f)
        qvc.lim = lim
        try:
            for x in xs:
                l, r = m.sample(x)
                il.append(l)
                ir.append(r)
        finally:
            qvc.lim = plain
        fl, fr = float_model(programs, p, xs)
        worst, at, peak, energy = 0.0, 0, 0.0, 0.0
        for k in range(n):
            for a, b in ((il[k], fl[k]), (ir[k], fr[k])):
                e = abs(a / (1 << frac) - b)
                peak = max(peak, abs(b))
                energy += b * b
                if e > worst:
                    worst, at = e, k
        db = 20 * math.log10(worst) if worst else -math.inf
        if saturated[0]:     # the program overloads inside: the models differ by design (saturation vs none)
            print(f"[INFO] {p} {name}, {cname}: the integer model saturated {saturated[0]} stores, so the float model "
                  f"(no saturation) differs by up to {worst * Q:.0f} LSB ({db:.1f} dBFS); not judged")
            continue
        good = db <= tol
        ok &= good
        print(f"[{'PASS' if good else 'FAIL'}] {p} {name}, {cname}, {n} samples, {frac + 1}-bit words, no store saturated: the largest "
              f"difference {worst * Q:.2f} LSB ({db:.1f} dBFS) at sample {at}; float peak {peak:.4f}, "
              f"energy {energy:.4f}")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main(sys.argv[1:])
