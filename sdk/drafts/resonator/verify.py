#!/usr/bin/env python3
"""RESONATOR's render gate: the assembled module, run in dsp_host.

    python3 verify.py            (from anywhere; needs a built vendor tree)

No firmware is read. The module is assembled with dsp_asm at P:0x2000, its
table (tables.py) placed at P:0x3000 where the build would put it, and run as
one instance from a synthetic memory image, as TapeHead's gate does. Knobs
arrive as value<<16. What this cannot see: the composed image, the real
dispatcher, the panel and the sound on a unit.

Gates:
  1. No instruction decodes as mpysu (a negative second operand would be read
     unsigned); the sample loop is straight-line.
  2. MIX 0 is exact passthrough; zero in is exactly zero out at every TUNE,
     full GAIN and full DCAY.
  3. Pitch: NOTE 69 rings at 440 Hz; COLUNDI degrees 78 and 79 at 440 and
     441 Hz, degree 0 at 10.8 Hz, each within 0.01 Hz, and degree 127 at
     12 kHz within 2 ppm, measured on a ten-second ring.
  4. DCAY 64 rings for the table's T60 within 5 %.
  5. The tail ends in digital silence: a 24-bit state sticks in a dead band
     (#2047 saw it); this one must reach exact zero after the input stops.
  6. A full-scale sine at resonance with GAIN and DCAY at maximum stays
     bounded by the soft clip (|wet| <= 2/3).
  7. A trig split and a garbage-filled block before init change nothing.
  8. INTV UNI is one centred mode (L == R); a spread chord differs L/R.
"""
import math
import os
import pathlib
import re
import struct
import subprocess
import sys
import tempfile
from runpy import run_path

HERE = pathlib.Path(__file__).resolve().parent
T = run_path(str(HERE / "tables.py"))
Q = 1 << 23
ORG, TABLE_AT = 0x2000, 0x3000
FS = 44100

failures = []


def _tool(name, sub):
    env = os.environ.get(name.upper())
    if env:
        return pathlib.Path(env)
    roots = [HERE, *HERE.parents, pathlib.Path.home() / ".cache/modwerk-upstream"]
    for base in roots:
        for root in (base, base / "sdk" / "octabam", base / "octabam"):
            p = root / "vendor/dsp56300/build/source" / sub
            if p.exists():
                return p
    sys.exit(f"[FAIL] {sub} not found: npm run upstream:tools, then make setup in that octabam checkout, "
             f"or set {name.upper()}")


DSP_ASM = _tool("dsp_asm", "dsp_host/dsp_asm")
DSP_HOST = _tool("dsp_host", "dsp_host/dsp_host")
DISASM = _tool("dsp_disasm", "disassemble/dsp56kDisassemble")


def gate(name, ok, detail=""):
    print(f"[{'PASS' if ok else 'FAIL'}] {name} {detail}".rstrip(), flush=True)
    if not ok:
        failures.append(name)


def assemble(work):
    src = (HERE / "resonator.asm").read_text().replace("$fab1e0", f"${TABLE_AT:x}")
    asm, blob, sym = work / "r.asm", work / "r.bin", work / "r.sym"
    asm.write_text(src)
    r = subprocess.run([str(DSP_ASM), "-in", str(asm), "-org", f"{ORG:x}", "-out", str(blob), "-sym", str(sym)],
                       capture_output=True, text=True)
    if r.returncode:
        sys.exit(f"[FAIL] dsp_asm: {r.stdout}{r.stderr}")
    syms = {k: int(v, 16) for k, v in (l.split() for l in sym.read_text().splitlines() if l.strip())}
    code = blob.read_bytes()
    return blob, [int.from_bytes(code[i:i + 3], "little") for i in range(0, len(code), 3)], syms


def disassemble(blob):
    r = subprocess.run([str(DISASM), "-in", str(blob), "-pc", f"{ORG:x}", "-le"], capture_output=True, text=True)
    return [(int(m.group(1), 16), m.group(2)) for m in
            (re.match(r"^([0-9a-f]{6}):\s+(\S+)", l) for l in r.stdout.splitlines()) if m]


def rec(sp, addr, words):
    return struct.pack("<BII", sp, addr, len(words)) + struct.pack(f"<{len(words)}I", *words)


def write_mem(words, path, garbage=False):
    body = rec(0, ORG, words) + rec(0, TABLE_AT, list(T["TABLE"])) + rec(0, 0x40, [0, 0, 0, 0])
    if garbage:  # the default instance's r7 block (dsp_host: track 1 FX2, X:0x6200)
        body += rec(1, 0x6200, [(i * 0x9e3779 + 0x5a5a5a) & 0xffffff for i in range(64)])
    x = {0x415: 0x700, 0x416: 0x700, 0x419: 0, 0x208: 0x500, 0x20a: 0x6000,
         0x20c: 0, 0x20d: 16, 0x20e: 0, 0x213: 0x256}
    x.update({0x256 + i: 0x4000 for i in range(16)})
    for a, v in x.items():
        body += rec(1, a, [v])
    path.write_bytes(body + struct.pack("<BII", 0xff, 0, 0))


def run(work, mem, syms, knobs, left, right=None, extra=(), tag="r"):
    """knobs: PTCH INTV DCAY DAMP GAIN MIX TUNE (TUNE is slot 6, page 2)."""
    right = left if right is None else right
    inp, out = work / f"{tag}.in", work / f"{tag}.out"
    inter = [s for pair in zip(left, right) for s in pair]
    inp.write_bytes(struct.pack(f"<{len(inter)}i", *inter))
    cmd = [str(DSP_HOST), "-mem", str(mem), "-init", f"{syms['init']:x}", "-proc", f"{syms['proc']:x}",
           "-ctx", "40,41,42", "-frames", "16", "-blocks", str((len(left) + 15) // 16),
           "-params", ",".join(map(str, list(knobs) + [0] * (12 - len(knobs)))),
           "-in", str(inp), "-out", str(out), "-stereo", *extra]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=900)
    if r.returncode:
        sys.exit(f"[FAIL] dsp_host exit {r.returncode}:\n{r.stdout[-2000:]}{r.stderr}")
    data = out.read_bytes()
    o = list(struct.unpack(f"<{len(data) // 4}i", data))
    meter = re.search(r"\(([\d.]+)/sample max", r.stdout)
    return o[0::2], o[1::2], (float(meter.group(1)) if meter else None)


def burst(n, frames=2048, amp=0.5, seed=7):
    s, out = seed, []
    for i in range(n):
        s = (s * 1103515245 + 12345) & 0x7fffffff
        out.append(round(amp * Q * ((s >> 7) / (1 << 23) - 1)) if i < frames else 0)
    return out


def freq(y, start, stop):
    """Least-squares period over every rising zero crossing: the end points alone
    carry the tail's quantization (a few samples at a few LSB)."""
    ups = [i + y[i] / (y[i] - y[i + 1]) for i in range(start, stop - 1) if y[i] < 0 <= y[i + 1]]
    n = len(ups)
    mk, mt = (n - 1) / 2, sum(ups) / n
    period = sum((k - mk) * (t - mt) for k, t in enumerate(ups)) / sum((k - mk) ** 2 for k in range(n))
    return FS / period


def t60_measured(y):
    win = 441
    env = [max(abs(v) for v in y[i:i + win]) or 1 for i in range(0, len(y) - win, win)]
    peak = max(range(len(env)), key=env.__getitem__)
    db = [20 * math.log10(e / env[peak]) for e in env]
    a = next(i for i in range(peak, len(db)) if db[i] < -10)
    b = next(i for i in range(peak, len(db)) if db[i] < -40)
    return 60 / ((db[a] - db[b]) / ((b - a) * win / FS))


def main():
    work = pathlib.Path(tempfile.mkdtemp(prefix="resonator-verify-"))
    blob, words, syms = assemble(work)
    mem = work / "r.mem"
    write_mem(words, mem)
    dis = disassemble(blob)
    print(f"assembled {len(words)} words; init P:{syms['init']:04x} proc P:{syms['proc']:04x}")

    gate("no mpysu anywhere", not [a for a, m in dis if m.startswith(("mpysu", "macsu"))])
    loop = [m for a, m in dis if syms["rzmixv"] < a < syms["rzframe"]]
    branch = re.compile(r"^(b|j)(sr|ra|mp|cc|cs|ne|eq|lt|le|gt|ge|pl|mi)|^rep|^brk")
    gate("sample loop is straight-line", loop.count("do") == 1 and not [m for m in loop if branch.match(m)])

    n = 4800
    tone = [round(0.7 * Q * math.sin(2 * math.pi * 330 * i / FS)) for i in range(n)]
    tone_r = [round(0.6 * Q * math.sin(2 * math.pi * 123 * i / FS)) for i in range(n)]
    l, r, _ = run(work, mem, syms, [69, 7, 127, 32, 127, 0, 1], tone, tone_r, tag="dry")
    gate("MIX 0 is exact passthrough", l == tone and r == tone_r)
    l, _, _ = run(work, mem, syms, [69, 7, 127, 32, 0, 100, 1], tone, tag="mix100")
    dry = max(map(abs, l[n // 2:])) / max(map(abs, tone))
    gate("MIX 100 keeps the dry at (1 - 100/128)^2", abs(dry / (28 / 128) ** 2 - 1) < 0.01,
         f"({20 * math.log10(dry):.1f} dB; GAIN 0 silences the ring)")
    for tune in (0, 1):
        l, r, _ = run(work, mem, syms, [127, 24, 127, 0, 127, 127, tune], [0] * n, tag=f"zero{tune}")
        gate(f"zero in, zero out (TUNE {tune})", not any(l) and not any(r))

    ring = 10 * FS
    meter = None
    for name, knobs, want in (("NOTE 69", [69, 0, 127, 0, 127, 127, 0], 440.0),
                              ("COLUNDI 78", [78, 0, 127, 0, 127, 127, 1], 440.0),
                              ("COLUNDI 79", [79, 0, 127, 0, 127, 127, 1], 441.0),
                              ("COLUNDI 0", [0, 0, 127, 0, 127, 127, 1], 10.8),
                              ("COLUNDI 127", [127, 0, 127, 0, 127, 127, 1], 12000.0)):
        l, _, meter = run(work, mem, syms, knobs, burst(ring), tag="pitch")
        f = freq(l, FS, 6 * FS)
        gate(f"{name} rings at {want} Hz", abs(f - want) < max(0.01, 2e-6 * want), f"({f:.4f} Hz)")
    print(f"dsp_host meter: {meter} instructions/sample max")

    want = T["t60"](64)
    l, _, _ = run(work, mem, syms, [57, 0, 64, 0, 127, 127, 0], burst(3 * FS), tag="decay")
    got = t60_measured(l)
    gate("DCAY 64 rings for the table's T60", abs(got / want - 1) < 0.05, f"({got:.3f} s, table {want:.3f} s)")

    for d, secs in ((64, 6), (100, 30)):
        l, r, _ = run(work, mem, syms, [57, 7, d, 0, 127, 127, 0], burst(secs * FS, amp=0.9), tag="tail")
        last = l[-FS // 2:] + r[-FS // 2:]
        gate(f"DCAY {d} tail ends in digital silence after {secs} s", not any(last),
             f"(last half second peaks {max(map(abs, last))} LSB)")

    hot = [round((Q - 1) * math.sin(2 * math.pi * 440 * i / FS)) for i in range(4 * FS)]
    l, r, _ = run(work, mem, syms, [69, 12, 127, 0, 127, 127, 0], hot, tag="hot")
    peak = max(map(abs, l + r))
    gate("full-scale sine at resonance stays inside the soft clip", peak <= round(2 * Q / 3) + 4,
         f"(peak {peak - round(2 * Q / 3):+d} LSB from 2/3 FS)")

    x = burst(FS)
    whole = run(work, mem, syms, [60, 5, 90, 40, 64, 100, 1], x, tag="whole")
    split = run(work, mem, syms, [60, 5, 90, 40, 64, 100, 1], x, extra=("-split", "7"), tag="split")
    gate("a trig split changes nothing", whole[:2] == split[:2])
    write_mem(words, work / "dirty.mem", garbage=True)
    dirty = run(work, work / "dirty.mem", syms, [60, 5, 90, 40, 64, 100, 1], x, extra=("-dirty", "0x1234"),
                tag="dirty")
    gate("a garbage block before init changes nothing", whole[:2] == dirty[:2])

    l, r, _ = run(work, mem, syms, [57, 0, 80, 0, 64, 127, 0], burst(FS), tag="uni")
    gate("INTV UNI is one centred mode", l == r and any(l))
    l, r, _ = run(work, mem, syms, [57, 7, 80, 0, 64, 127, 0], burst(FS), tag="spread")
    gate("a spread chord differs left and right", l != r)

    if failures:
        sys.exit(f"[FAIL] {len(failures)} gate(s): {', '.join(failures)}")
    print("[PASS] resonator verify")


if __name__ == "__main__":
    main()
