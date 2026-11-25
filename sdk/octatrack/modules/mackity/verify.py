#!/usr/bin/env python3
"""MACKITY's render gate: the assembled module, run in dsp_host.

    python3 verify.py            (from anywhere; needs a built vendor tree)

No firmware is read. mackity.asm is assembled with dsp_asm at P:0x2000 and
run from a synthetic memory image, as Resonator's gate does. Knobs arrive
as value<<16. What this cannot see: the composed image, the real
dispatcher, the panel and the sound on a unit.

Gates:
  1. Every instruction decodes as the mnemonic written: every product is
     the signed mpy/mac x0,y1 form (no mpysu/macsu), there is no rep, and
     the state stays inside X:(r7+$00..$1f).
  2. Bit for bit the model in reference.py (which test_reference.py holds
     to upstream's algorithm): stereo noise at the defaults, a loud tone at
     TRIM 127, knob automation over both knobs' ranges, a 5-frame trig split
     every block, a TRIM word carrying an LFO's fraction bits, garbage in
     the state block before init, and two instances with their own knobs.
  3. Silence in is exact silence out at any setting; a burst's tail ends in
     exact silence.
  4. The cycle meter, printed for TESTING.md and evidence/performance.json.
"""
import math
import os
import pathlib
import random
import re
import struct
import subprocess
import sys
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import reference as R  # noqa: E402

Q = R.Q
ORG = 0x2000
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
    asm, blob, sym = work / "m.asm", work / "m.bin", work / "m.sym"
    asm.write_text((HERE / "mackity.asm").read_text())
    r = subprocess.run([str(DSP_ASM), "-in", str(asm), "-org", f"{ORG:x}", "-out", str(blob), "-sym", str(sym)],
                       capture_output=True, text=True)
    if r.returncode:
        sys.exit(f"[FAIL] dsp_asm: {r.stdout}{r.stderr}")
    syms = {k: int(v, 16) for k, v in (l.split() for l in sym.read_text().splitlines() if l.strip())}
    return blob, syms


def disassemble(blob):
    r = subprocess.run([str(DISASM), "-in", str(blob), "-pc", f"{ORG:x}", "-le"], capture_output=True, text=True)
    return [l for l in r.stdout.splitlines() if re.match(r"^[0-9a-f]{6}:", l)]


def rec(sp, addr, words):
    return struct.pack("<BII", sp, addr, len(words)) + struct.pack(f"<{len(words)}I", *words)


def write_mem(blob, path):
    code = blob.read_bytes()
    words = [int.from_bytes(code[i:i + 3], "little") for i in range(0, len(code), 3)]
    body = rec(0, ORG, words) + rec(0, 0x40, [0, 0, 0, 0])
    x = {0x415: 0x700, 0x416: 0x700, 0x419: 0, 0x208: 0x500, 0x20a: 0x6000,
         0x20c: 0, 0x20d: 16, 0x20e: 0, 0x213: 0x256}
    x.update({0x256 + i: 0x4000 for i in range(16)})
    for a, v in x.items():
        body += rec(1, a, [v])
    path.write_bytes(body + struct.pack("<BII", 0xff, 0, 0))


def knob_row(trim, pad):
    return [trim, pad] + [0] * 10


def run(work, mem, syms, insts, extra=(), tag="r"):
    """insts: [(left, right, {block: (trim, pad)})]; returns [(L, R)], meter."""
    cmd = [str(DSP_HOST), "-mem", str(mem), "-init", f"{syms['init']:x}", "-proc", f"{syms['proc']:x}",
           "-ctx", "40,41,42", "-frames", "16", "-inst", str(len(insts)), "-stereo"]
    ins, n = [], max(len(i[0]) for i in insts)
    for k, (left, right, rows) in enumerate(insts):
        p = work / f"{tag}{k}.in"
        p.write_bytes(struct.pack(f"<{2 * len(left)}i", *[s for pair in zip(left, right) for s in pair]))
        ins.append(str(p))
        pf = work / f"{tag}{k}.params"
        pf.write_text("".join(f"{b},{','.join(map(str, knob_row(*v)))}\n" for b, v in sorted(rows.items())))
        cmd += ["-params", ",".join(map(str, knob_row(*rows[0]))), "-paramfile", str(pf)]
    out = work / f"{tag}.out"
    cmd += ["-blocks", str((n + 15) // 16), "-in", ",".join(ins), "-out", str(out), *extra]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=900)
    if r.returncode:
        sys.exit(f"[FAIL] dsp_host exit {r.returncode}:\n{r.stdout[-2000:]}{r.stderr}")
    res = []
    for k in range(len(insts)):
        data = (out if k == 0 else pathlib.Path(f"{out}.i{k}")).read_bytes()
        o = list(struct.unpack(f"<{len(data) // 4}i", data))
        res.append((o[0::2], o[1::2]))
    meter = re.search(r"\(([\d.]+)/sample max", r.stdout)
    return res, (float(meter.group(1)) if meter else None), r.stdout


def s24(v):
    return [((s & 0xffffff) ^ 0x800000) - 0x800000 for s in v]


def noise(n, amp, seed):
    rnd = random.Random(seed)
    return [round(amp * Q * (rnd.random() * 2 - 1)) for _ in range(n)]


def tone(f, amp, n):
    return [round(amp * Q * math.sin(2 * math.pi * f * i / R.FS)) for i in range(n)]


def same(name, got, left, right, rows, **kw):
    want_l, want_r, _ = R.render(left, right, rows, **kw)
    gl, gr = s24(got[0][:len(left)]), s24(got[1][:len(right)])
    bad = next((i for i in range(len(left)) if (gl[i], gr[i]) != (want_l[i], want_r[i])), None)
    gate(name, bad is None, "" if bad is None else
         f"first difference at frame {bad}: {gl[bad]},{gr[bad]} vs model {want_l[bad]},{want_r[bad]}")


def main():
    with tempfile.TemporaryDirectory() as tmp:
        work = pathlib.Path(tmp)
        blob, syms = assemble(work)
        mem = work / "m.mem"
        write_mem(blob, mem)

        # 1. decodes as written
        src = (HERE / "mackity.asm").read_text()
        body = [l.split(";")[0].strip() for l in src.splitlines()]
        dis = disassemble(blob)
        products = [l for l in dis if re.search(r"\b(mpy|mac)", l)]
        signed = all(re.search(r"\b(mpy|mac)\s+x0,y1,[ab]\b", l) for l in products)
        wanted = sum(1 for l in body if re.match(r"(mpy|mac)\s", l))
        gate("1 products are signed mpy/mac x0,y1", signed and len(products) == wanted,
             f"({len(products)} in the disassembly, {wanted} in the source)")
        gate("1 no rep, no mpysu/macsu", not any(re.search(r"\brep\b|mpysu|macsu", l) for l in dis))
        offsets = [int(m, 16) for m in re.findall(r"\(r7\+\$([0-9a-f]+)\)", src)]
        gate("1 state inside X:(r7+$00..$1f)", max(offsets) <= 0x1f, f"(highest $%02x)" % max(offsets))

        # 2. bit for bit the model
        n = 16 * 160
        nl, nr = noise(n, 0.7, 1), noise(n, 0.7, 2)
        (got,), meter_def, _ = run(work, mem, syms, [(nl, nr, {0: (13, 127)})], tag="def")
        same("2 defaults, stereo noise", got, nl, nr, {0: (13, 127)})
        t = tone(440, 0.9, n)
        (got,), meter_hot, _ = run(work, mem, syms, [(t, nl, {0: (127, 127)})], tag="hot")
        same("2 TRIM 127, a loud tone and noise", got, t, nl, {0: (127, 127)})
        rows = {0: (13, 127), 10: (127, 127), 20: (0, 127), 30: (64, 0), 40: (5, 100),
                60: (100, 64), 61: (101, 65), 62: (40, 127), 90: (13, 127)}
        (got,), _, _ = run(work, mem, syms, [(nl, nr, rows)], tag="auto")
        same("2 knob automation", got, nl, nr, rows)
        (got,), _, _ = run(work, mem, syms, [(nl, nr, rows)], extra=("-split", "5"), tag="split")
        same("2 a trig split every block", got, nl, nr, rows, split=5)
        (got,), _, _ = run(work, mem, syms, [(nl, nr, {0: (30, 127)})], extra=("-pword", "0:0=1eb700"),
                           tag="lfo")
        same("2 TRIM with an LFO's fraction bits", got, nl, nr, {0: (30, 127)}, pwords={0: 0xb700})
        (got,), _, _ = run(work, mem, syms, [(nl, nr, rows)], extra=("-dirty", "0x5a5a5a"), tag="dirty")
        same("2 garbage state before init", got, nl, nr, rows)
        a, b = run(work, mem, syms, [(nl, nr, {0: (13, 127)}), (t, t, {0: (90, 110)})], tag="two")[0]
        same("2 two instances: the first", a, nl, nr, {0: (13, 127)})
        same("2 two instances: the second", b, t, t, {0: (90, 110)})

        # 3. silence
        z = [0] * n
        for trim, pad in ((13, 127), (127, 127), (0, 0), (64, 64)):
            (got,), _, _ = run(work, mem, syms, [(z, z, {0: (trim, pad)})], tag="zero")
            gate(f"3 silence in, silence out at TRIM {trim} PAD {pad}", not any(s24(got[0]) + s24(got[1])))
        m = 44100 * 3
        burst = noise(4410, 0.5, 3) + [0] * (m - 4410)
        (got,), _, _ = run(work, mem, syms, [(burst, burst, {0: (127, 127)})], tag="tail")
        gate("3 a burst's tail ends in silence", not any(s24(got[0][-44100:]) + s24(got[1][-44100:])))

        # 4. cost
        print(f"[INFO] cycle meter: {meter_def} a sample at the defaults, {meter_hot} at TRIM 127")
    if failures:
        sys.exit(f"[FAIL] {len(failures)}: {', '.join(failures)}")
    print("[PASS] mackity")


if __name__ == "__main__":
    main()
