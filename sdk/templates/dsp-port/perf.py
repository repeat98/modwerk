#!/usr/bin/env python3
"""__NAME__'s performance measurements for evidence/performance.json, in dsp_host.

    python3 -B perf.py              (the tools verify.py finds; a few minutes)
    python3 -B perf.py --stress     (the stress run only)

measured  executed instructions a sample from dsp_host's meter, one instance on verify.py's synthetic image:
          the defaults, the dearest setting and a moving pattern (every knob swept by a triangle and jumped
          every 37 blocks), each unsplit and with a trig split at every position 1-15.
stress    eight instances, four a core, each on its own stem (bursts, a full-scale square, a sweep, noise,
          impulses, DC steps, silence, a chord), all twelve parameter words given a new value every block,
          trig splits of 1, 3, 7, 8, 12 and 15 frames, under -guard and -dirty. dsp_host itself writes a word a
          block into the instance at core 1 position 2 (dsp_gate.HARNESS_WORD): its output from silence is
          not the module's.

Add a static count once the sample loop is written: the loop's words from the disassembly, priced as
sdk/octabam/tools/build/cycle_count.py prices straight-line loops (sdk/octatrack/modules/mackity/perf.py).
Then npm run perf:audit -- check evidence/performance.json --stamp (docs/MODULE_PERFORMANCE.md).
"""
import math
import pathlib
import random
import sys

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import verify as V  # noqa: E402  (finds sdk/octatrack/tools)

G, R = V.G, V.R
Q = G.Q
BLOCKS = 4096
SECONDS = 2


def moving(blocks, seed=1, every_slot=False):
    """Every knob swept by a triangle (each a quarter turn apart) and jumped every 37 blocks; every_slot also
    gives the slots the module does not read a new random value every block."""
    rnd = random.Random(seed)
    rows = {}
    for b in range(blocks):
        knobs = [127 - abs(((b + 64 * k) % 256) - 128) for k in range(len(R.KNOBS))]
        knobs = [min(127, max(0, v)) for v in knobs]
        if b % 37 == 0:
            knobs = [rnd.randrange(128) for _ in R.KNOBS]
        rest = [rnd.randrange(128) for _ in range(12 - len(knobs))] if every_slot else []
        rows[b] = tuple(knobs + rest)
    return rows


def stems(n, live):
    rnd = random.Random(9)
    on = lambda i, v: v if i < live else 0  # noqa: E731
    return [
        [on(i, round(0.9 * Q * (rnd.random() * 2 - 1) * math.exp(-(i % 11025) / 1500))) for i in range(n)],
        [on(i, Q - 1 if (i // 110) % 2 else -Q) for i in range(n)],
        [on(i, round(0.9 * Q * math.sin(2 * math.pi * (20 * (1000 ** (i / live))) * i / G.FS))) for i in range(n)],
        [on(i, round(Q * (rnd.random() * 2 - 1))) for i in range(n)],
        [on(i, Q - 1 if i % 4410 == 0 else 0) for i in range(n)],
        [on(i, (Q - 1) if (i // 8820) % 2 else -Q) for i in range(n)],
        [0] * n,
        [on(i, round(0.3 * Q * sum(math.sin(2 * math.pi * f * i / G.FS) for f in (220, 277.2, 329.6))))
         for i in range(n)],
    ]


def main():
    G.require_tools(HERE)
    with G.workdir("__ID__-perf-") as tmp:
        work = pathlib.Path(tmp)
        asm = G.assemble(V.SOURCE, work)
        if "--stress" not in sys.argv:
            sig = G.noise(16 * BLOCKS, 0.7, 5)
            cases = {"defaults": dict(knobs=R.DEFAULTS), "dearest": dict(knobs=R.DEAREST),
                     "moving": dict(rows=moving(BLOCKS))}
            worst = (0.0, "")
            for name, knobs in cases.items():
                found = {}
                for split in range(16):
                    found[split] = G.run(asm, [G.Instance(sig, sig, **knobs)], split=split or None, tag=name).meter
                    if found[split] > worst[0]:
                        worst = (found[split], f"{name}, split {split}")
                print(f"measured {name}: unsplit {found[0]:.2f}, worst with a split {max(found[s] for s in range(1, 16)):.2f}")
            print(f"measured worst: {worst[0]:.2f} executed instructions a sample ({worst[1]})")

        n = G.FS * SECONDS * 2
        insts = [G.Instance(s, s, rows=moving(n // 16, seed=k + 11, every_slot=True), split=split, core=k // 4)
                 for k, (s, split) in enumerate(zip(stems(n, G.FS * SECONDS), (1, 3, 7, 8, 12, 15, 0, 0)))]
        r = G.run(asm, insts, dirty=0x5a, guard=True, check=False, tag="stress", timeout=1800)
        print(f"stress: dsp_host exit {r.returncode}; meters {r.meters}; clobbers {sum(r.clobbers)}, stray {sum(r.stray)}")
        for k, (core, pos) in enumerate(r.layout):
            note = " (dsp_host's own word lands here)" if r.harness_word(k) else ""
            print(f"  instance {k}: core {core} pos {pos}, {r.per_instance[k]} a sample, {r.nonzero[k]} non-zero samples{note}")
        if r.returncode:
            print(r.stdout[-2000:])


if __name__ == "__main__":
    main()
