#!/usr/bin/env python3
"""RESONATOR's render gate: the assembled module, run in dsp_host.

    python3 verify.py            (from anywhere; needs a built vendor tree)

No firmware is read. The module is assembled with dsp_asm at P:0x2000, its
table (tables.py) placed at P:0x3000 where the build would put it, and run as
one instance from a synthetic memory image, as TapeHead's gate does. Knobs
arrive as value<<16. What this cannot see: the composed image, the real
dispatcher, the panel and the sound on a unit.

Gates:
  1. Every instruction decodes as the mnemonic written (no mpysu); the sample
     loop is straight-line.
  2. MIX 0 is exact passthrough, MIX 100 leaves the dry at (28/128)^2, MIX 127
     with the ring silenced is digital silence; zero in is exactly zero out
     with COLUN off and on. The mix is at constant power (dry^2 + ring^2 = 1
     from the table, for every MIX value). At the default setting, noise at
     MIX 0, 32, 64, 96 and 127 changes level by under 3 dB per step (the
     effects guide's check), and the ring alone (MIX 127) sits within 6 dB of
     the dry on steady noise at DCAY 0, 32, 64, 96 and 127, within 2 dB of
     each other. MIX 1-3 sit up to 0.15 dB under constant power (the
     table's first step), from MIX 4 within 0.03 dB.
  3. Pitch: NOTE 69 rings at 440 Hz; Colundi degrees 78 and 79 at 440 and
     441 Hz, degree 0 at 10.8 Hz, each within 0.01 Hz, and degree 127 at
     12 kHz within 2 ppm, measured on a ten-second ring.
  4. Voices and bodies, every partial within 0.05 Hz: MAJ on A3 in four
     voices; MAJ on degree 78 snapped to Colundi (440, 528, 639, 880 Hz);
     MAJ on D4 in C MAJ (diatonic: D minor); a root C#4 snapped down to C4;
     a MAJ triad in three voices; two STRNG voices of MAJ (four harmonics
     each); one BELL voice (eight partials); a STRNG voice on degree 78,
     its harmonics not snapped.
  5. DCAY 64 rings for the table's T60 within 5 %.
  6. The tail ends in digital silence: a 24-bit state sticks in a dead band
     (#2047 saw it); this one must reach exact zero after the input stops.
  7. A full-scale sine at resonance with GAIN and DCAY at maximum stays
     bounded by the soft clip (|wet| <= 2/3). The soft clip's aliasing at its
     hardest audit case (fx:audit's 9.1 kHz tone at -1 dBFS, GAIN 127, DCAY 0,
     the rest at the dearest setting): every folded harmonic together at most
     -45 dBc to the fundamental (-47.1 measured; -21.3 with GAIN at +24 dB).
  8. Once the modes are tuned, a trig split changes nothing (the call
     before a trig keeps the last block's tuning by design); a garbage-filled
     block before init changes nothing.
  9. One PURE voice is centred (L == R); a chord differs L/R; TONE's two
     ends differ.
 10. The table's short forms, for every knob value (tables.py's models of
     rzntheta, rzdecay and rzlerp): each note's theta is bit for bit the 24-bit
     theta of its frequency; the interpolated decay keeps T60 within 1 %,
     the input gain within 0.1 dB and TONE's corner within 2 % of their
     curves. In dsp_host: NOTE 0, 115, 116 and 127 ring at their pitch
     (both ends of the octave shift); DCAY 66 and 99, between table points,
     ring for their T60 within 5 %; TONE 30 (low-pass) and 99 (high-pass),
     between table points, pass a tone at the one-pole's level within
     0.05 dB.
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
        body += rec(1, 0x6200, [(i * 0x9e3779 + 0x5a5a5a) & 0xffffff for i in range(89)])
    x = {0x415: 0x700, 0x416: 0x700, 0x419: 0, 0x208: 0x500, 0x20a: 0x6000,
         0x20c: 0, 0x20d: 16, 0x20e: 0, 0x213: 0x256}
    x.update({0x256 + i: 0x4000 for i in range(16)})
    for a, v in x.items():
        body += rec(1, a, [v])
    path.write_bytes(body + struct.pack("<BII", 0xff, 0, 0))


def run(work, mem, syms, knobs, left, right=None, extra=(), tag="r"):
    """knobs: the twelve slot values (knobs() builds them by name)."""
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


DEFAULTS = {"PTCH": 57, "CHRD": 4, "DCAY": 64, "TONE": 64, "GAIN": 32, "MIX": 64,
            "COLUN": 0, "TYPE": 1, "VOIC": 2, "SCALE": 0}
SLOTS = {"PTCH": 0, "CHRD": 1, "DCAY": 2, "TONE": 3, "GAIN": 4, "MIX": 5,
         "COLUN": 6, "TYPE": 7, "VOIC": 8, "SCALE": 9}
CHORD = {name: i for i, name in enumerate(T["CHORD_NAMES"])}
TYPE = {name: i for i, name in enumerate(T["TYPE_NAMES"])}
SCALE = {name: i for i, name in enumerate(T["SCALE_LABELS"])}


def knobs(**kw):
    v = [0] * 12
    for name, value in {**DEFAULTS, **kw}.items():
        v[SLOTS[name]] = value
    return v


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


def tone_hz(y, f0, start=FS // 2, blocks=3, blen=FS // 2):
    """The frequency of the partial near f0 (within 1/(2 blen/FS) Hz): the phase step
    of Hann-windowed demodulations at f0. Returns (Hz, level)."""
    zs = []
    rot = complex(math.cos(2 * math.pi * f0 / FS), -math.sin(2 * math.pi * f0 / FS))
    win = [0.5 - 0.5 * math.cos(2 * math.pi * i / blen) for i in range(blen)]
    for b in range(blocks):
        at = start + b * blen
        ph = complex(math.cos(2 * math.pi * f0 * at / FS), -math.sin(2 * math.pi * f0 * at / FS))
        z = 0j
        for i in range(blen):
            z += win[i] * y[at + i] * ph
            ph *= rot
        zs.append(z)
    steps = [math.atan2((b / a).imag, (b / a).real) for a, b in zip(zs, zs[1:])]
    return f0 + sum(steps) / len(steps) / (2 * math.pi * blen / FS), abs(zs[0]) / blen


def bin_power(y, k):
    """Goertzel: the power of DFT bin k of y (a rectangular window: the tone sits on the bin)."""
    c, s1, s2 = 2 * math.cos(2 * math.pi * k / len(y)), 0.0, 0.0
    for v in y:
        s1, s2 = v + c * s1 - s2, s1
    return s1 * s1 + s2 * s2 - c * s1 * s2


def t60_measured(y):
    win = 441
    env = [max(abs(v) for v in y[i:i + win]) or 1 for i in range(0, len(y) - win, win)]
    peak = max(range(len(env)), key=env.__getitem__)
    db = [20 * math.log10(e / env[peak]) for e in env]
    a = next(i for i in range(peak, len(db)) if db[i] < -10)
    b = next(i for i in range(peak, len(db)) if db[i] < -40)
    return 60 / ((db[a] - db[b]) / ((b - a) * win / FS))


def listing(work):
    r = subprocess.run([str(DSP_ASM), "-in", str(work / "r.asm"), "-org", f"{ORG:x}", "-list"],
                       capture_output=True, text=True)
    return {int(m.group(1), 16): m.group(2) for m in
            (re.match(r"^([0-9a-f]{6}):\s+(\S+)", l) for l in r.stdout.splitlines()) if m}


def main():
    work = pathlib.Path(tempfile.mkdtemp(prefix="resonator-verify-"))
    blob, words, syms = assemble(work)
    mem = work / "r.mem"
    write_mem(words, mem)
    dis = disassemble(blob)
    print(f"assembled {len(words)} words, table {len(T['TABLE'])}; init P:{syms['init']:04x} proc P:{syms['proc']:04x}")

    wrote = listing(work)
    bad = [f"{a:04x} {wrote[a]} -> {m}" for a, m in dis if a in wrote and wrote[a] != m]
    gate("every instruction decodes as written", not bad and len(wrote) > 100, ", ".join(bad[:5]))
    gate("no mpysu anywhere", not [a for a, m in dis if m.startswith(("mpysu", "macsu"))])
    do_at = max(a for a, m in dis if m == "do" and a < syms["rzframe"])
    loop = [m for a, m in dis if do_at <= a < syms["rzframe"]]
    branch = re.compile(r"^(b|j)(sr|ra|mp|cc|cs|ne|eq|lt|le|gt|ge|pl|mi)|^rep|^brk")
    gate("sample loop is straight-line", loop.count("do") == 1 and not [m for m in loop if branch.match(m)])

    nh = T["note_hz"]
    off = [n for n in range(128) if T["note_word"](n) != T["theta"](nh(n))]
    cents = max(abs(1200 * math.log2(T["note_word"](n) / (2 * nh(n) / FS * Q))) for n in range(128))
    gate("every note's theta is exact", not off, f"(worst {cents:.2f} cents from the curve; differing: {off[:5]})")
    t60 = max(abs(-3 / (FS * math.log10(T["lerp_word"]("R", d) / Q)) / T["t60"](d) - 1) for d in range(128))
    gate("interpolated decay keeps T60 within 1 %", t60 < 0.01, f"(worst {100 * t60:.2f} %)")
    gdb = max(abs(20 * math.log10(T["lerp_word"]("G", d) / (T["in_gain"](d) * Q))) for d in range(128))
    gate("interpolated input gain within 0.1 dB", gdb < 0.1, f"(worst {gdb:.3f} dB)")
    corner = max(abs(-math.log(1 - T["tonek_word"](v) / Q) * FS / (2 * math.pi) / T["tone_hz"](v) - 1)
                 for v in range(128))
    gate("interpolated TONE corner within 2 %", corner < 0.02, f"(worst {100 * corner:.2f} %)")
    power = [10 * math.log10((1 + T["dry_word"](v) / Q) ** 2 + (T["lerp_word"]("WMIX", v) / Q) ** 2)
             for v in range(128)]
    dry = max(abs((1 + T["dry_word"](v) / Q) - T["dry_gain"](v)) * Q for v in range(128))
    gate("MIX at constant power, the dry at (1 - MIX/128)^2",
         max(map(abs, power)) < 0.15 and max(map(abs, power[4:])) < 0.03 and dry <= 1,
         f"(dry^2 + ring^2 worst {max(power, key=abs):+.3f} dB, at MIX {max(range(128), key=lambda v: abs(power[v]))}; "
         f"from MIX 4 {max(map(abs, power[4:])):.3f} dB; dry within {dry:.0f} LSB)")

    n = 4800
    tone = [round(0.7 * Q * math.sin(2 * math.pi * 330 * i / FS)) for i in range(n)]
    tone_r = [round(0.6 * Q * math.sin(2 * math.pi * 123 * i / FS)) for i in range(n)]
    l, r, _ = run(work, mem, syms, knobs(DCAY=127, GAIN=127, MIX=0, COLUN=1, TONE=127, SCALE=40, VOIC=3), tone,
                  tone_r, tag="dry")
    gate("MIX 0 is exact passthrough", l == tone and r == tone_r)
    l, _, _ = run(work, mem, syms, knobs(GAIN=0, MIX=100), tone, tag="mix100")
    dry = max(map(abs, l[n // 2:])) / max(map(abs, tone))
    gate("MIX 100 keeps the dry at (1 - 100/128)^2", abs(dry / (28 / 128) ** 2 - 1) < 0.01,
         f"({20 * math.log10(dry):.1f} dB; GAIN 0 silences the ring)")
    l, r, _ = run(work, mem, syms, knobs(GAIN=0, MIX=127), tone, tag="mix127")
    gate("MIX 127 with the ring silenced is digital silence (no dry left)", not any(l) and not any(r))
    sweep = burst(3 * FS, frames=FS, amp=0.5, seed=23)
    levels = []
    for v in (0, 32, 64, 96, 127):
        l, r, _ = run(work, mem, syms, knobs(MIX=v), sweep, tag="sweep")
        levels.append(10 * math.log10(sum(a * a for a in l + r) / (2 * len(l))))
    steps = [b - a for a, b in zip(levels, levels[1:])]
    gate("MIX 0, 32, 64, 96, 127 on noise at the default setting: under 3 dB per step",
         all(abs(x) < 3 for x in steps), "(" + ", ".join(f"{x:+.1f}" for x in steps) + " dB)")
    steady = burst(8 * FS, frames=8 * FS, amp=0.5, seed=29)
    dry_rms = math.sqrt(sum(a * a for a in steady[6 * FS:]) / (2 * FS))
    ring = []
    for d in (0, 32, 64, 96, 127):
        l, r, _ = run(work, mem, syms, knobs(MIX=127, DCAY=d), steady, tag="ring")
        wet = math.sqrt(sum(a * a for a in l[6 * FS:] + r[6 * FS:]) / (4 * FS))
        ring.append(20 * math.log10(wet / dry_rms))
    gate("the ring alone on steady noise at DCAY 0-127: within 6 dB of the dry, within 2 dB of each other",
         all(abs(x) < 6 for x in ring) and max(ring) - min(ring) < 2,
         "(" + ", ".join(f"{x:+.1f}" for x in ring) + " dB)")
    for col in (0, 1):
        l, r, _ = run(work, mem, syms, knobs(PTCH=127, TYPE=TYPE["BELL"], DCAY=127, GAIN=127, MIX=127,
                                              COLUN=col, TONE=127, SCALE=60, VOIC=3), [0] * n, tag=f"zero{col}")
        gate(f"zero in, zero out (COLUN {col})", not any(l) and not any(r))

    ring = 10 * FS
    meter = None
    one = dict(TYPE=TYPE["PURE"], VOIC=0, DCAY=127, GAIN=127, MIX=127)
    for name, kn, want in (("NOTE 69", knobs(PTCH=69, **one), 440.0),
                           ("COLUN 78", knobs(PTCH=78, COLUN=1, **one), 440.0),
                           ("COLUN 79", knobs(PTCH=79, COLUN=1, **one), 441.0),
                           ("COLUN 0", knobs(PTCH=0, COLUN=1, **one), 10.8),
                           ("COLUN 127", knobs(PTCH=127, COLUN=1, **one), 12000.0),
                           *((f"NOTE {k}", knobs(PTCH=k, **one), nh(k)) for k in (0, 115, 116, 127))):
        l, _, meter = run(work, mem, syms, kn, burst(ring), tag="pitch")
        f = freq(l, FS, 6 * FS)
        gate(f"{name} rings at {round(want, 3)} Hz", abs(f - want) < max(0.01, 2e-6 * want), f"({f:.4f} Hz)")
    print(f"dsp_host meter: {meter} instructions/sample max")

    long = 3 * FS
    lit = dict(DCAY=127, GAIN=127, MIX=127)
    pure4 = dict(TYPE=TYPE["PURE"], VOIC=3, **lit)
    for name, kn, wants in (
            ("MAJ on A3, four voices", knobs(PTCH=57, CHRD=CHORD["MAJ"], **pure4), [nh(57), nh(61), nh(64), nh(69)]),
            ("MAJ on Colundi 78, snapped", knobs(PTCH=78, CHRD=CHORD["MAJ"], COLUN=1, **pure4),
             [440.0, 528.0, 639.0, 880.0]),
            ("MAJ on D4 in C MAJ (D minor)", knobs(PTCH=62, CHRD=CHORD["MAJ"], SCALE=SCALE["CMAJ"], **pure4),
             [nh(62), nh(65), nh(69), nh(74)]),
            ("C#4 snaps down to C4 in C MAJ", knobs(PTCH=61, TYPE=TYPE["PURE"], VOIC=0, SCALE=SCALE["CMAJ"], **lit),
             [nh(60)]),
            ("MAJ triad in three voices", knobs(PTCH=57, CHRD=CHORD["MAJ"], TYPE=TYPE["PURE"], VOIC=2, **lit),
             [nh(57), nh(61), nh(64)]),
            ("two STRNG voices of MAJ", knobs(PTCH=57, CHRD=CHORD["MAJ"], TYPE=TYPE["STRNG"], VOIC=1, **lit),
             [nh(57) * k for k in (1, 2, 3, 4)] + [nh(61) * k for k in (1, 2, 3, 4)]),
            ("one BELL voice", knobs(PTCH=57, TYPE=TYPE["BELL"], VOIC=0, **lit),
             [nh(57) * r for r, _ in T["TYPES"][TYPE["BELL"]][1]]),
            ("STRNG on Colundi 78, harmonics not snapped", knobs(PTCH=78, TYPE=TYPE["STRNG"], VOIC=0, COLUN=1, **lit),
             [440.0 * k for k in (1, 2, 3, 4)])):
        l, r, _ = run(work, mem, syms, kn, burst(long), tag="chord")
        mono = [a + b for a, b in zip(l, r)]
        got = [tone_hz(mono, f) for f in wants]
        floor = max(level for _, level in got) * 1e-3
        ok = all(abs(f - w) < 0.05 and level > floor for (f, level), w in zip(got, wants))
        gate(f"{name}", ok, "(" + ", ".join(f"{f:.2f}" for f, _ in got) + " Hz)")

    want = T["t60"](64)
    l, _, _ = run(work, mem, syms, knobs(TYPE=TYPE["PURE"], VOIC=0, DCAY=64, GAIN=127, MIX=127),
                  burst(3 * FS), tag="decay")
    got = t60_measured(l)
    gate("DCAY 64 rings for the table's T60", abs(got / want - 1) < 0.05, f"({got:.3f} s, table {want:.3f} s)")

    for d in (66, 99):
        want = T["t60"](d)
        l, _, _ = run(work, mem, syms, knobs(TYPE=TYPE["PURE"], VOIC=0, DCAY=d, GAIN=127, MIX=127),
                      burst(4 * FS), tag="decay")
        got = t60_measured(l)
        gate(f"DCAY {d}, between table points, rings for its T60", abs(got / want - 1) < 0.05,
             f"({got:.3f} s, curve {want:.3f} s)")

    for d, secs in ((64, 6), (100, 30)):
        l, r, _ = run(work, mem, syms, knobs(TYPE=TYPE["BAR"], CHRD=CHORD["MAJ7"], VOIC=3, DCAY=d, GAIN=127,
                                             MIX=127, TONE=127), burst(secs * FS, amp=0.9), tag="tail")
        last = l[-FS // 2:] + r[-FS // 2:]
        gate(f"DCAY {d} tail ends in digital silence after {secs} s", not any(last),
             f"(last half second peaks {max(map(abs, last))} LSB)")

    hot = [round((Q - 1) * math.sin(2 * math.pi * 440 * i / FS)) for i in range(4 * FS)]
    l, r, _ = run(work, mem, syms, knobs(PTCH=69, CHRD=CHORD["OCT"], TYPE=TYPE["STRNG"], VOIC=3, DCAY=127,
                                         GAIN=127, MIX=127), hot, tag="hot")
    peak = max(map(abs, l + r))
    gate("full-scale sine at resonance stays inside the soft clip", peak <= round(2 * Q / 3) + 4,
         f"(peak {peak - round(2 * Q / 3):+d} LSB from 2/3 FS)")

    nfft, m9 = 32768, 6763   # fx:audit's 9.1 kHz tone, on an exact bin of its 32768-point window
    amp = round(10 ** (-1 / 20) * (Q - 1))
    sig = [round(amp * math.sin(2 * math.pi * m9 * i / nfft)) for i in range(16384 + nfft)]
    l, r, _ = run(work, mem, syms, knobs(PTCH=60, CHRD=CHORD["MAJ7"], DCAY=0, TONE=127, GAIN=127, MIX=127, COLUN=1,
                                         TYPE=TYPE["BELL"], VOIC=3), sig, tag="alias")
    true_bins = {h * m9 for h in range(1, 40) if h * m9 < nfft // 2}
    folded = set()
    for h in range(2, 40):
        k = (h * m9) % nfft
        k = nfft - k if k > nfft // 2 else k
        if h * m9 > nfft // 2 and k not in true_bins and k:
            folded.add(k)
    worst = -999.0
    for y in (l[16384:], r[16384:]):
        alias = sum(bin_power(y, k) for k in folded)
        worst = max(worst, 10 * math.log10(alias / bin_power(y, m9) + 1e-30))
    gate(f"a -1 dBFS 9.1 kHz tone at GAIN 127, DCAY 0: the soft clip aliases at most -45 dBc",
         worst <= -45, f"({worst:.1f} dBc)")

    x = [0] * 16 * 16 + burst(FS)   # the eight modes tune in, one per block, before the input starts
    busy = knobs(PTCH=60, TYPE=TYPE["PLATE"], CHRD=CHORD["MIN7"], VOIC=3, DCAY=90, GAIN=64, MIX=100,
                 COLUN=1, TONE=90)
    whole = run(work, mem, syms, busy, x, tag="whole")
    split = run(work, mem, syms, busy, x, extra=("-split", "7"), tag="split")
    gate("once tuned, a trig split changes nothing", whole[:2] == split[:2])
    write_mem(words, work / "dirty.mem", garbage=True)
    dirty = run(work, work / "dirty.mem", syms, busy, x, extra=("-dirty", "0x1234"), tag="dirty")
    gate("a garbage block before init changes nothing", whole[:2] == dirty[:2])

    l, r, _ = run(work, mem, syms, knobs(TYPE=TYPE["PURE"], VOIC=0, DCAY=80, GAIN=64, MIX=127), burst(FS), tag="uni")
    gate("one PURE voice is centred", l == r and any(l))
    l, r, _ = run(work, mem, syms, knobs(CHRD=CHORD["MAJ"], VOIC=3, DCAY=80, GAIN=64, MIX=127), burst(FS),
                  tag="spread")
    gate("a chord differs left and right", l != r)
    dark = run(work, mem, syms, knobs(TONE=0, MIX=127), burst(FS), tag="dark")
    bright = run(work, mem, syms, knobs(TONE=127, MIX=127), burst(FS), tag="bright")
    gate("TONE's two ends differ", dark[:2] != bright[:2])

    # TONE between table points: a tone at a PURE voice's pitch rings at the one-pole's level relative to
    # TONE 64 (flat, the direct path): its low-pass k / (1 - (1 - k) e^-jw), or the high-pass 1 minus that.
    for v, note in ((30, 96), (99, 57)):
        f0 = nh(note)
        sine = [round(0.01 * Q * math.sin(2 * math.pi * f0 * i / FS)) for i in range(FS)]
        level = {}
        for t in (64, v):
            l, _, _ = run(work, mem, syms, knobs(PTCH=note, TYPE=TYPE["PURE"], VOIC=0, DCAY=40, GAIN=32, MIX=127,
                                                 TONE=t), sine, tag="tone")
            level[t] = max(map(abs, l[3 * FS // 4:]))
        k = T["tonek_word"](v) / Q
        z = complex(math.cos(2 * math.pi * f0 / FS), -math.sin(2 * math.pi * f0 / FS))
        h = k / (1 - (1 - k) * z)
        want = 20 * math.log10(abs(1 - h) if v > 64 else abs(h))
        got = 20 * math.log10(level[v] / level[64])
        gate(f"TONE {v}, between table points, passes the one-pole's level", abs(got - want) < 0.05,
             f"({got:.2f} dB, model {want:.2f} dB)")

    if failures:
        sys.exit(f"[FAIL] {len(failures)} gate(s): {', '.join(failures)}")
    print("[PASS] resonator verify")


if __name__ == "__main__":
    main()
