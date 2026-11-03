#!/usr/bin/env python3
"""RINGMOD SC's stress render: eight instances on one core beside the key fixture.

    python3 tools/stress.py [seconds]      (default 30; needs a built vendor tree)

dsp_host -guard -dirty 0x5a, 16-frame blocks: instance 0 is tools/keystub.asm
publishing T5, instances 1-8 are RINGMOD SC in both modes with different KEY,
knobs and trig splits, and every knob of every instance is moved on a
schedule (a new value every block somewhere, MODE and KEY included). The
fixture stands in for the base's key bus tap, whose cost the base charges
(41 executed instructions a sample a core, dsp-sites.json), not this figure.
No ColdFire, no real LFOs or parameter locks, one core.

Passes when no RINGMOD SC instance writes outside its block (as far as the
guard's first reports show), the host reports no hang, and no output sample
sits on the store's limit.
"""
import pathlib
import random
import re
import struct
import subprocess
import sys
import tempfile

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
import verify as v  # noqa: E402


def main():
    seconds = float(sys.argv[1]) if len(sys.argv) > 1 else 30.0
    blocks = int(seconds * 44100 / 16)
    work = pathlib.Path(tempfile.mkdtemp(prefix="ringsc-stress-"))
    text = (v.HERE / "ringsc.asm").read_text()
    _, words, mod = v.assemble(work, text, v.ORG, "ringsc")
    _, swords, stub = v.assemble(work, (v.HERE / "tools" / "keystub.asm").read_text(), v.STUB, "keystub")
    mem = work / "ringsc.mem"
    v.write_mem(mem, (v.ORG, words), (v.STUB, swords))
    n = blocks * 16
    rng = random.Random(7)
    files = []
    for i, (f, amp) in enumerate([(55, 0.25)] + [(110 * (k + 1), 0.2) for k in range(8)]):
        p = work / f"in{i}.raw"
        p.write_bytes(struct.pack(f"<{2 * n}i", *v.stereo(v.sine(f, amp, n))))
        files.append(str(p))
    params = [[4, 0, 0, 0, 0, 0, 0, 0]] + [v.knobs(mode=k % 2, key=(5, 5, 3, 100)[k % 4], atk=127, rel=127, klpf=(127, 40, 20, 90)[k % 4])
                                           for k in range(8)]
    sched = []
    for b in range(4, blocks, 3):
        inst, slot = rng.randrange(1, 9), rng.choice((0, 1, 2, 3, 4, 5, 6))
        val = rng.choice((0, 5, 3, 100)) if slot == 0 else rng.randrange(2) if slot == 6 else rng.randrange(128)
        sched.append(f"{b}:{inst}:{slot}={val}")
    cmd = [str(v.DSP_HOST), "-mem", str(mem), "-inst", "9",
           "-init", ",".join([f"{stub['ksini']:x}"] + [f"{mod['init']:x}"] * 8),
           "-proc", ",".join([f"{stub['ksloc']:x}"] + [f"{mod['proc']:x}"] * 8),
           "-ctx", "40,41,42", "-frames", "16", "-blocks", str(blocks), "-stereo",
           "-in", ",".join(files), "-out", str(work / "out.raw"),
           "-split", ",".join(str(s) for s in (0, 0, 5, 0, 11, 0, 3, 0, 9)),
           "-sched", ",".join(sched), "-guard", "-dirty", "0x5a"]
    for p in params:
        cmd += ["-params", ",".join(map(str, p))]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=3600)
    log = r.stdout
    # A RINGMOD SC instance writes nothing outside its block.
    strays = re.findall(r"stray\s+inst ([1-8]) ", log)
    clean = len(re.findall(r"instance [1-8]: .*, 0 CLOBBERING", log)) if not strays else 0
    meter = re.search(r"core 0 meter: max (\d+) instructions in block \d+, mean (\d+)", log)
    limit = 0
    for k in range(1, 9):
        d = (work / f"out.raw.i{k}").read_bytes()
        limit += sum(1 for s in struct.unpack(f"<{len(d) // 4}i", d) if abs(s) >= v.FULL)
    print(f"blocks {blocks} ({seconds:.0f} s), {len(sched)} knob moves, exit {r.returncode}")
    print(f"instances clean under the guard: {clean} of 8; samples on the store's limit: {limit}")
    if meter:
        print(f"core meter: max {meter.group(1)} instructions/block, mean {meter.group(2)} "
              f"({int(meter.group(1)) / 16:.1f}/sample for the fixture and eight instances)")
    hang = "HANG" in log or r.returncode != 0
    ok = clean == 8 and not hang and limit == 0
    print("[PASS] stress" if ok else "[FAIL] stress")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
