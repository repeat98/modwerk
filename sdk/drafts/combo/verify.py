#!/usr/bin/env python3
"""COMBO's render gate: the assembled module, run in dsp_host.

    python3 verify.py            (from anywhere; needs a built vendor tree)

No firmware is read. combo.asm is assembled with dsp_asm at P:0x2000, its
CAB table (tables.py) placed at P:0x3000 where the build would put it, and
run from a synthetic memory image, as Mackity's and Resonator's gates do.
Knobs arrive as value<<16. What this cannot see: the composed image, the
real dispatcher, the panel and the sound on a unit.

Gates:
  1. Every instruction decodes as the mnemonic written: every product is
     the signed mpy/mac x0,y1 form (no mpysu/macsu), there is no rep, the
     state stays inside X:(r7+$00..$5f), and the fixed constants in the
     assembly are tables.py's.
  2. Bit for bit the model in reference.py: stereo noise at the defaults,
     a loud tone at the dearest setting, every CAB, knob automation over
     every knob's range, a 5-frame trig split every block, a GAIN word
     carrying an LFO's fraction bits, garbage in the state block before
     init, a stored CAB above 4, and two instances with their own knobs.
  3. Silence in is exact silence out at any setting.
  4. CAB OFF with BASS, MID and TREB at 64 is the drive alone: the model's
     float design and the render agree within 0.5 dB on a 1 kHz tone.
  5. The cycle meter, printed for TESTING.md and evidence/performance.json.
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
import tables as T  # noqa: E402

Q = R.Q
ORG = 0x2000
TABLE_AT = 0x3000
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
    asm.write_text((HERE / "combo.asm").read_text().replace("$fab1e0", f"${TABLE_AT:x}"))
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
    body = rec(0, ORG, words) + rec(0, TABLE_AT, list(T.TABLE)) + rec(0, 0x40, [0, 0, 0, 0])
    x = {0x415: 0x700, 0x416: 0x700, 0x419: 0, 0x208: 0x500, 0x20a: 0x6000,
         0x20c: 0, 0x20d: 16, 0x20e: 0, 0x213: 0x256}
    x.update({0x256 + i: 0x4000 for i in range(16)})
    for a, v in x.items():
        body += rec(1, a, [v])
    path.write_bytes(body + struct.pack("<BII", 0xff, 0, 0))
    return len(words)


def knob_row(k):
    return [k[n] for n in R.KNOBS] + [0] * 6


def full(rows):
    """block -> partial knob dict, as the model takes it, to block -> full dict for dsp_host."""
    cur, out = dict(R.KNOB_DEFAULTS), {}
    for b in sorted(rows):
        cur = {**cur, **rows[b]}
        out[b] = dict(cur)
    out.setdefault(0, dict(R.KNOB_DEFAULTS))
    return out


def run(work, mem, syms, insts, extra=(), tag="r"):
    """insts: [(left, right, {block: {knob: value}})]; returns [(L, R)], meter."""
    cmd = [str(DSP_HOST), "-mem", str(mem), "-init", f"{syms['init']:x}", "-proc", f"{syms['proc']:x}",
           "-ctx", "40,41,42", "-frames", "16", "-inst", str(len(insts)), "-stereo"]
    ins, n = [], max(len(i[0]) for i in insts)
    for k, (left, right, rows) in enumerate(insts):
        rows = full(rows)
        p = work / f"{tag}{k}.in"
        p.write_bytes(struct.pack(f"<{2 * len(left)}i", *[s for pair in zip(left, right) for s in pair]))
        ins.append(str(p))
        pf = work / f"{tag}{k}.params"
        pf.write_text("".join(f"{b},{','.join(map(str, knob_row(v)))}\n" for b, v in sorted(rows.items())))
        cmd += ["-params", ",".join(map(str, knob_row(rows[0]))), "-paramfile", str(pf)]
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


def rms(v):
    return math.sqrt(sum(s * s for s in v) / len(v)) or 1e-30


DEAR = {"GAIN": 127, "BASS": 127, "MID": 127, "TREB": 127, "CAB": 4, "LEV": 127}


def main():
    with tempfile.TemporaryDirectory() as tmp:
        work = pathlib.Path(tmp)
        blob, syms = assemble(work)
        mem = work / "m.mem"
        nwords = write_mem(blob, mem)
        print(f"[INFO] assembled {nwords} words, table {len(T.TABLE)}")

        # 1. decodes as written
        src = (HERE / "combo.asm").read_text()
        body = [l.split(";")[0].strip() for l in src.splitlines()]
        dis = disassemble(blob)
        products = [l for l in dis if re.search(r"\b(mpy|mac)", l)]
        signed = all(re.search(r"\b(mpy|mac)\s+x0,y1,[ab]\b", l) for l in products)
        wanted = sum(1 for l in body if re.match(r"(mpy|mac)\s", l))
        gate("1 products are signed mpy/mac x0,y1", signed and len(products) == wanted,
             f"({len(products)} in the disassembly, {wanted} in the source)")
        gate("1 no rep, no mpysu/macsu", not any(re.search(r"\brep\b|mpysu|macsu", l) for l in dis))
        offsets = [int(m, 16) for m in re.findall(r"\(r7\+\$([0-9a-f]+)\)", src)]
        gate("1 state inside X:(r7+$00..$5f)", max(offsets) <= 0x5f, f"(highest $%02x)" % max(offsets))
        copy_end = 0x40 + 5 + 15
        gate("1 the coefficient copy ends inside the state init clears",
             "move    #>$40,n4" in src and "do      #96," in src and copy_end <= 0x60, f"(ends at ${copy_end - 1:02x})")
        imms = {int(m, 16) for m in re.findall(r"#>\$([0-9a-f]{6})", src)}
        missing = [k for k, v in T.CONSTANTS.items() if (v & 0xffffff) not in imms]
        gate("1 the assembly carries tables.py's constants", not missing, f"missing {missing}" if missing else "")

        # 2. bit for bit the model
        n = 16 * 160
        nl, nr = noise(n, 0.5, 1), noise(n, 0.5, 2)
        (got,), meter_def, _ = run(work, mem, syms, [(nl, nr, {})], tag="def")
        same("2 defaults, stereo noise", got, nl, nr, {})
        t = tone(220, 0.9, n)
        (got,), meter_hot, _ = run(work, mem, syms, [(t, nl, {0: DEAR})], tag="hot")
        same("2 dearest setting, a loud tone and noise", got, t, nl, {0: DEAR})
        for cab in range(5):
            (got,), _, _ = run(work, mem, syms, [(nl, t, {0: {"CAB": cab, "GAIN": 90}})], tag=f"cab{cab}")
            same(f"2 CAB {T.CAB_NAMES[cab]}", got, nl, t, {0: {"CAB": cab, "GAIN": 90}})
        rows = {0: {}, 10: {"GAIN": 127, "BASS": 0}, 20: {"GAIN": 0, "MID": 127, "CAB": 0},
                30: {"TREB": 0, "LEV": 127, "CAB": 4}, 40: {"GAIN": 70, "BASS": 127, "LEV": 0},
                60: {"MID": 0, "TREB": 127, "LEV": 90, "CAB": 1}, 61: {"GAIN": 71, "BASS": 100},
                62: {"GAIN": 20, "CAB": 3}, 90: dict(R.KNOB_DEFAULTS)}
        (got,), _, _ = run(work, mem, syms, [(nl, nr, rows)], tag="auto")
        same("2 knob automation", got, nl, nr, rows)
        (got,), _, _ = run(work, mem, syms, [(nl, nr, rows)], extra=("-split", "5"), tag="split")
        same("2 a trig split every block", got, nl, nr, rows, split=5)
        (got,), _, _ = run(work, mem, syms, [(nl, nr, {0: {"GAIN": 30}})], extra=("-pword", "0:0=1eb700"),
                           tag="lfo")
        same("2 GAIN with an LFO's fraction bits", got, nl, nr, {0: {"GAIN": 30}}, pwords={0: 0xb700})
        (got,), _, _ = run(work, mem, syms, [(nl, nr, rows)], extra=("-dirty", "0x5a5a5a"), tag="dirty")
        same("2 garbage state before init", got, nl, nr, rows)
        (got,), _, _ = run(work, mem, syms, [(nl, nr, {0: {"CAB": 9}})], tag="cab9")
        same("2 a stored CAB above 4 plays 4X12", got, nl, nr, {0: {"CAB": 9}})
        a, b = run(work, mem, syms, [(nl, nr, {}), (t, t, {0: {"GAIN": 110, "CAB": 1, "TREB": 20}})],
                   tag="two")[0]
        same("2 two instances: the first", a, nl, nr, {})
        same("2 two instances: the second", b, t, t, {0: {"GAIN": 110, "CAB": 1, "TREB": 20}})

        # 3. silence
        z = [0] * n
        for k in ({}, DEAR, {"GAIN": 0, "LEV": 0, "CAB": 0}, {"BASS": 0, "MID": 0, "TREB": 0}):
            (got,), _, _ = run(work, mem, syms, [(z, z, {0: k})], tag="zero")
            gate(f"3 silence in, silence out at {k or 'the defaults'}", not any(s24(got[0]) + s24(got[1])))

        m3 = 44100 * 3
        burst = noise(4410, 0.5, 3) + [0] * (m3 - 4410)
        (got,), _, _ = run(work, mem, syms, [(burst, burst, {0: DEAR})], tag="tail")
        gate("3 a burst's tail at the dearest setting ends in exact silence",
             not any(s24(got[0][-44100:]) + s24(got[1][-44100:])))

        # 4. the float design
        m = 16 * 600
        k1 = tone(1000, 0.25, m)
        knobs = {"CAB": 0, "GAIN": 40}
        (got,), _, _ = run(work, mem, syms, [(k1, k1, {0: knobs})], tag="float")
        fl, _ = R.float_combo([s / Q for s in k1], [s / Q for s in k1], knobs)
        tail = slice(m // 2, m)
        d = 20 * math.log10(rms(s24(got[0])[tail]) / Q / rms(fl[tail]))
        gate("4 the render matches the float design at 1 kHz", abs(d) < 0.5, f"({d:+.2f} dB)")

        # 5. cost
        print(f"[INFO] cycle meter: {meter_def} a sample at the defaults, {meter_hot} at the dearest setting")
    if failures:
        sys.exit(f"[FAIL] {len(failures)}: {', '.join(failures)}")
    print("[PASS] combo")


if __name__ == "__main__":
    main()
