#!/usr/bin/env python3
"""RINGMOD SC's render gate: the assembled module, run, against a model.

    python3 verify.py            (from anywhere; needs a built vendor tree)

No firmware is read. ringsc.asm is assembled with dsp_asm and run by dsp_host from a synthetic memory image beside
tools/keystub.asm, a fixture that publishes its own audio where the base's key
bus (KEYBUS, Sidechain Compressor's tap made a base feature) puts every
track's. Instance 0 is the key track, instance 1 the track carrying RINGMOD
SC. The module sits on T5 (X:$420 = 4), so the key is T5 on its core's bus and
T3 in the other core's publish region; a second image puts it on T2, with T1
local and T7 across.

What this cannot see: the base's tap and its generation counter, the two cores
running at once, the base's placement, the dispatcher and the panel.

Gates:
  1. No instruction decodes as mpysu.
  2. KEY OFF, a KEY byte above 8, and DPTH 0 in both modes return the input
     bit for bit; a silent key does too in DUCK. So does any setting while the
     key bus is not live on the module's core (no seed mark, a wrong one, or a
     counter out of range): a card image has no bus.
  3. DUCK and RING match model() within TOL (4e-7, about 3 LSB: the model
     runs the key's low-pass, RECT and SLEW's level in exact integers; gates 6,
     7, 8, 10d and 10e hold it to the same) over their knobs (in RING ATK,
     HOLD and REL are SLEW, S&H and RECT), with the
     first-block ramps included; DUCK's ATK at 32
     takes about 205 samples; a steady 55 Hz key holds the duck steady (no
     buzz at twice its frequency) and a decaying one lets it recover without
     dips.
  4. A key on the other core's publish region gives the same samples as the
     same key on this core's bus.
  5. A block split by a trig gives the same samples as an unsplit one once
     the knob ramps have landed.
  6. A key track dispatched after this one is heard one block late.
  7. dsp_host -guard reports no write outside the instance at all (a reader
     writes nothing in the bus or the window), from a dirty state block.
  9. Each continuous knob, turned one step every two blocks under a tone,
     leaves no step at the block rate above -70 dBFS (verify_knob_clicks's
     measure).
  8. A MODE or KEY change mid-render follows the model's fade (depth to 0,
     switch with the key's state cleared, depth back from the next call), and
     no output step exceeds a quarter of the input's level, where an unfaded
     switch can step by twice it.
 10. RING's three key stages on a steady input under a full-scale 55 Hz key:
     a. S&H 8 holds each key for exactly 128 samples;
     b. SLEW 60 drives the gain with the key's level: it never goes below 0
        and swings less than half the input, where SLEW 0 rings down to -1;
     c. RECT 127 rectifies the key: the gain never goes below -1% and its mean
        is near 2/pi (|sin|), where RECT 0 reaches -1;
     d. SLEW switched across 0 and back, once and every eight blocks (a lock
        or an LFO), follows the model and steps the output by no more than a
        quarter of the input a sample, where an unramped switch from the key
        to its level steps by up to twice the input;
     e. S&H turned from 127 to 0 takes a new key from the next call on: the
        output equals S&H 0's from the change on, where the old hold ran out
        its count (up to 2,032 samples).
     (RING with all three at 0 is 0.1.0's ring modulator bit for bit: compared
     against 0.1 in TESTING.md, not here.)
"""
import math
import os
import pathlib
import re
import shutil
import struct
import subprocess
import sys
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
Q = 1 << 23
FULL = Q - 1
ORG, STUB = 0x2000, 0x2800
TOL = 4e-7  # about 3 LSB: the model is integer-exact where the DSP's arithmetic decides (worst 1.8e-07)


def _tool(name, sub):
    env = os.environ.get(name.upper())
    if env:
        return pathlib.Path(env)
    for base in [HERE, *HERE.parents]:
        for root in (base, base / "sdk" / "octabam"):
            p = root / "vendor/dsp56300/build/source" / sub
            if p.exists():
                return p
    sys.exit(f"[FAIL] {sub} not found: build the vendor tree or set {name.upper()}")


DSP_ASM = _tool("dsp_asm", "dsp_host/dsp_asm")
DSP_HOST = _tool("dsp_host", "dsp_host/dsp_host")
DISASM = _tool("dsp_disasm", "disassemble/dsp56kDisassemble")

failures = []


def gate(name, ok, detail=""):
    print(f"[{'PASS' if ok else 'FAIL'}] {name} {detail}".rstrip(), flush=True)
    if not ok:
        failures.append(name)


def assemble(work, text, org, tag):
    src, blob, sym = work / f"{tag}.asm", work / f"{tag}.bin", work / f"{tag}.sym"
    src.write_text(text)
    r = subprocess.run([str(DSP_ASM), "-in", str(src), "-org", f"{org:x}",
                        "-out", str(blob), "-sym", str(sym)], capture_output=True, text=True)
    if r.returncode:
        sys.exit(f"[FAIL] dsp_asm {tag}: {r.stdout}{r.stderr}")
    syms = {k: int(v, 16) for k, v in (l.split() for l in sym.read_text().splitlines() if l.strip())}
    code = blob.read_bytes()
    return blob, [int.from_bytes(code[i:i + 3], "little") for i in range(0, len(code), 3)], syms


def mnemonics(blob, org):
    r = subprocess.run([str(DISASM), "-in", str(blob), "-pc", f"{org:x}", "-le"],
                       capture_output=True, text=True)
    return [m.group(1) for m in (re.match(r"^[0-9a-f]{6}:\s+(\S+)", l) for l in r.stdout.splitlines()) if m]


def rec(sp, addr, words):
    return struct.pack("<BII", sp, addr, len(words)) + struct.pack(f"<{len(words)}I", *words)


# The key bus is live on a core once the base's tap has seeded it: its mark at
# base-2 holds $10000 and its counter at base-1 is 0..3 (tracks 5-8 core: base
# Y:$33e00, tracks 1-4: Y:$3be00).
LIVE = {0x33dfe: [0x10000, 0], 0x3bdfe: [0x10000, 0]}


def write_mem(path, *code, own=5, bus=LIVE):
    """`own` is the track the module sits on, 1-8: X:$420 holds it less one,
    as the dispatcher leaves it. `bus`: the seed marks and counters in Y."""
    body = b"".join(rec(0, org, words) for org, words in code) + rec(0, 0x40, [0, 0, 0, 0])
    for a, words in bus.items():
        body += rec(2, a, words)
    x = {0x415: 0x700, 0x416: 0x700, 0x419: 0, 0x208: 0x500, 0x20a: 0x6000,
         0x20c: 0, 0x20d: 16, 0x20e: 0, 0x213: 0x256, 0x420: own - 1}
    x.update({0x256 + i: 0x4000 for i in range(16)})
    for a, v in x.items():
        body += rec(1, a, [v])
    path.write_bytes(body + struct.pack("<BII", 0xff, 0, 0))


class Rig:
    def __init__(self, work, mem, ring, stub):
        self.work, self.mem, self.ring, self.stub, self.n = work, mem, ring, stub, 0

    def run(self, key, audio, kn, pub="ksloc", track=4, first="key", split=None, extra=()):
        """Stereo interleaved int lists in, RINGMOD SC's stereo output out."""
        self.n += 1
        kf, af, out = (self.work / f"{self.n}.{s}" for s in ("key", "in", "out"))
        kf.write_bytes(struct.pack(f"<{len(key)}i", *key))
        af.write_bytes(struct.pack(f"<{len(audio)}i", *audio))
        k = (f"{self.stub['ksini']:x}", f"{self.stub[pub]:x}", str(kf), ",".join(map(str, [track] + [0] * 7)))
        m = (f"{self.ring['init']:x}", f"{self.ring['proc']:x}", str(af), ",".join(map(str, kn)))
        a, b = (k, m) if first == "key" else (m, k)
        cmd = [str(DSP_HOST), "-mem", str(self.mem), "-inst", "2", "-init", f"{a[0]},{b[0]}",
               "-proc", f"{a[1]},{b[1]}", "-ctx", "40,41,42", "-frames", "16",
               "-blocks", str(len(audio) // 32), "-params", a[3], "-params", b[3],
               "-in", f"{a[2]},{b[2]}", "-stereo", "-out", str(out)]
        if split is not None:
            cmd += ["-split", f"{split},{split}"]
        r = subprocess.run(cmd + list(extra), capture_output=True, text=True, timeout=600)
        if r.returncode:
            sys.exit(f"[FAIL] dsp_host exit {r.returncode}:\n{r.stdout[-2000:]}{r.stderr}")
        data = (out if first != "key" else pathlib.Path(str(out) + ".i1")).read_bytes()
        return list(struct.unpack(f"<{len(data) // 4}i", data)), r.stdout


def sine(f, amp, n, phase=0.0):
    return [round(amp * FULL * math.sin(2 * math.pi * f * i / 44100 + phase)) for i in range(n)]


def stereo(left, right=None):
    right = left if right is None else right
    return [s for pair in zip(left, right) for s in pair]


def knobs(dpth=127, atk=0, rel=45, klpf=127, mode=0, key=5, hold=34):
    return [key, dpth, klpf, atk, hold, rel, mode, 0, 0, 0, 0, 0]


def _ramp(cur, t48):
    """rq81: (value, step) for a 48-bit target."""
    step = (t48 - (cur << 24)) >> 28
    return (t48 >> 24 if step == 0 else cur), step


def _q(v):
    """rq83: 1 at 0; above it u = 40 + 11v/16 and (1 - f/16) * 2^-i, i = u>>3, f = u&7."""
    if v == 0:
        return FULL
    u = min(FULL, 0x280000 + (((v << 16) * 0x580000 * 2) >> 24))
    return (FULL - (u & 0x070000) * 8) >> (u >> 19)


def _p(v):
    """KLPF: (1 - f/16) * 2^-i for u = 72 - 9v/16."""
    u = ((0x480000 << 24) - (v << 16) * 0x480000 * 2) >> 24
    return (FULL - (u & 0x070000) * 8) >> (u >> 19)



def model(key, audio, kn, delay=0, sched=None):
    """ringsc.asm in floats, with its integer knob ramps and its MODE/KEY
    fade. `delay` shifts the key by whole blocks (a key track dispatched after
    this one); `sched` is {block: knobs} for a change mid-render."""
    one = FULL / Q
    lim = lambda v: max(-1.0, min(one, v))
    key = [0] * (32 * delay) + key
    d = warm = cnt = shc = 0
    h = -Q                                                 # RECT's u = 2r - 1: -1 (r = 0) from init
    slowr = 0                                              # the level's coefficient (a word): SLEW's last above 0
    wt = 0                                                 # SLEW's weight
    cfg = (0, 0)
    e = cur = last = held = env = 0.0
    lpw = 0                                                # the key low-pass's word
    out = []
    for blk in range(len(audio) // 32):
        kn = (sched or {}).get(blk, kn)
        keysel, dpth, klpf, atk, hold, rel = kn[:6]
        mode = kn[6]
        win = 32 + 16 * hold
        new = (mode, keysel)
        if new != cfg and d == 0:
            cfg, warm = new, 1                             # adopted with the depth at 0, the state cleared
        quiet = new != cfg
        if not quiet and warm:
            warm -= 1
            quiet = True
            if warm == 0:
                e = cur = last = held = env = 0.0
                lpw = 0
                shc = 0
        w = dpth << 16
        d, dstep = _ramp(d, 0 if quiet else ((w << 24) >> 7) + (w << 24))
        m, ks = cfg
        seg = list(audio[blk * 32:blk * 32 + 32])
        if not 1 <= ks <= 8:
            out += seg
            continue
        cw = _p(klpf)
        decay, slow = (FULL - _q(rel)) / Q if rel else 0.0, (FULL - _q(atk)) / Q if atk else 0.0
        if m == 0 or atk:
            slowr = FULL - _q(atk) if atk else 0           # DUCK writes it every call, RING only above 0
        if m:
            wt, wstep = _ramp(wt, (FULL << 24) if atk else 0)  # SLEW's weight: 1 above 0, ramped in 16 samples
            per = 16 * hold                                # S&H: a new key every 16v samples
            shc = min(shc, per)                            # a shorter period cuts the current hold short
            r16 = rel << 16
            h, hstep = _ramp(h, 2 * (((r16 << 24) >> 7) + (r16 << 24)) - (1 << 47))  # RECT: u = 2r - 1, ramped
        for f in range(16):
            i = blk * 32 + f * 2
            km = (key[i] + key[i + 1]) >> 1                # rq86 in integers (units of 2^-46): mono, low-passed,
            acc = lpw * Q + cw * km - cw * lpw             # the word stored, the key four times from the whole sum
            lpw = acc // Q
            kgw = max(-Q, min(FULL, (4 * acc) // Q))
            kg = kgw / Q
            if m == 0:
                d += dstep
                cur = max(cur, min(abs(kg), one))
                pk = max(last, cur)
                cnt -= 1
                if cnt <= 0:
                    last, cur, cnt = cur, 0.0, win
                t = max(pk, e * decay)
                e = t - slow * max(0.0, t - e)
                e = math.floor(e * Q) / Q                  # the stored word
                for ch in (0, 1):
                    x = seg[f * 2 + ch] / Q
                    out.append(lim(x - x * (e * (d / Q))) * Q)
            else:
                shc -= 1                                   # S&H: period 0 takes every key
                if shc <= 0:
                    shc, held = per, kgw                   # the word y1 takes
                # RECT and SLEW's level in exact integers (units of 2^-46), as the accumulator holds them.
                r2 = -held * h if held < 0 else held * Q   # RECT: k + r(|k| - k) = k(1 - 2r) = -k * u below 0
                ak = min(abs(r2) // Q, FULL)               # |key| as the word x1 takes it
                lv = abs(r2) - ak * slowr + round(env * Q) * slowr
                env = min(FULL, lv // Q) / Q               # SLEW's level, kept at 0 too
                k = r2 / (Q * Q)
                w = wt / Q
                k = lim(k + w * (env - k))                 # crossfaded from the key to its level by w
                h += hstep
                wt += wstep
                for ch in (0, 1):
                    x = seg[f * 2 + ch] / Q
                    out.append(lim(x - x * (d / Q) + x * ((d / Q) * k)) * Q)
                d += dstep
    return out


def err(got, want):
    return max(abs(a - b) for a, b in zip(got, want)) / Q


def main():
    work = pathlib.Path(tempfile.mkdtemp(prefix="ringsc-verify-"))
    try:
        text = (HERE / "ringsc.asm").read_text()
        blob, words, ring = assemble(work, text, ORG, "ringsc")
        _, swords, stub = assemble(work, (HERE / "tools" / "keystub.asm").read_text(), STUB, "keystub")
        mem = work / "ringsc.mem"
        write_mem(mem, (ORG, words), (STUB, swords))
        rig = Rig(work, mem, ring, stub)
        mem_b = work / "ringsc_b.mem"
        write_mem(mem_b, (ORG, words), (STUB, swords), own=2)
        rig_b = Rig(work, mem_b, ring, stub)

        gate("1 no mpysu", "mpysu" not in mnemonics(blob, ORG), f"({len(words)} words)")

        n = 4800
        bass = stereo(sine(110, 0.25, n), sine(165, 0.25, n))
        kick = stereo(sine(55, 0.25, n))
        for name, bus in (("no seed mark", {}), ("a wrong mark", {0x33dfe: [0x10001, 0]}),
                          ("a counter of 4", {0x33dfe: [0x10000, 4]}), ("only the other core seeded", {0x3bdfe: [0x10000, 0]})):
            mem_n = work / "nobus.mem"
            write_mem(mem_n, (ORG, words), (STUB, swords), bus=bus)
            rig_n = Rig(work, mem_n, ring, stub)
            same = all(rig_n.run(kick, bass, knobs(mode=m, key=k), pub=p, track=t)[0] == bass
                       for m in (0, 1) for k, p, t in ((5, "ksloc", 4), (3, "ksfor", 2)))
            gate(f"2b no key bus ({name}): bit-exact, both modes, both key paths", same)
        for name, kn, key in (("KEY OFF", knobs(key=0), kick),
                              ("KEY byte 100", knobs(key=100), kick),
                              ("DUCK DPTH 0", knobs(dpth=0), kick),
                              ("RING DPTH 0", knobs(dpth=0, mode=1), kick),
                              ("DUCK silent key", knobs(), [0] * (2 * n))):
            got, _ = rig.run(key, bass, kn)
            gate(f"2 bit-exact: {name}", got == bass)

        worst, at = 0.0, None
        cases = [knobs(mode=m, atk=a, rel=r, klpf=l, dpth=d, hold=h)
                 for m in (0, 1) for a in (0, 50, 127) for r in (0, 45, 100, 127)
                 for l in (127, 90, 30, 0) for d in (127, 70) for h in (34, 0, 127)]
        for kn in cases:
            got, _ = rig.run(kick, bass, kn)
            e = err(got, model(kick, bass, kn))
            if e > worst:
                worst, at = e, kn
        gate("3 DUCK and RING match the model", worst <= TOL,
             f"(worst {worst:.2e} over {len(cases)} settings" + (f", at {at}" if worst > TOL else "") + ")")

        dc = stereo([Q // 16] * n)
        # No buzz: under a steady 55 Hz key the gain on a steady input holds
        # still once the follower has settled, at REL 0 too, where following
        # |key| itself would swing it from full to none 110 times a second.
        # A key that decays lets the gain recover without dipping again.
        nn = 9600
        flat_in = stereo([Q // 4] * nn)
        hum = stereo(sine(55, 0.1, nn))
        swing = []
        for r in (0, 45):
            got, _ = rig.run(hum, flat_in, knobs(dpth=64, rel=r, key=5))
            tail = got[2 * 3000::2]
            swing.append((max(tail) - min(tail)) / (Q // 4))
        fall = stereo([round(v * math.exp(-i / 4410)) for i, v in enumerate(sine(55, 0.25, nn))])
        got, _ = rig.run(fall, flat_in, knobs(rel=45, key=5))
        left = got[2 * 1200::2]
        dips = max(left[i - 1] - left[i] for i in range(1, len(left))) / (Q // 4)
        gate("3d steady key: the duck holds still", max(swing) < 0.01,
             f"(swing {swing[0]:.4f} at REL 0, {swing[1]:.4f} at 45, of the input)")
        gate("3e decaying key: the gain recovers without dips", dips < 0.002 and left[-1] > left[0],
             f"(largest dip {dips:.5f} of the input)")
        # DUCK's attack: a key that steps on takes about 1/q samples to pull the gain down.
        step_key = stereo([0] * 1600 + [Q // 2] * (n - 1600))
        got, _ = rig.run(step_key, dc, knobs(atk=32))
        k = next(i for i in range(1600, n) if got[2 * i] < (Q // 16) * 0.37)
        gate("3c DUCK ATK 32: 63% down after about 205 samples", 160 <= k - 1600 <= 260, f"({k - 1600})")

        for m in (0, 1):
            kn = knobs(mode=m, rel=60)
            same, _ = rig.run(kick, bass, kn)
            far, _ = rig.run(kick, bass, knobs(mode=m, rel=60, key=3), pub="ksfor", track=2)
            gate(f"4 other-core key, mode {m}", far == same)
            # The same module on the other core (T2): T1 is local, T7 is across.
            near_b, _ = rig_b.run(kick, bass, knobs(mode=m, rel=60, key=1), track=0)
            far_b, _ = rig_b.run(kick, bass, knobs(mode=m, rel=60, key=7), pub="ksfob", track=2)
            gate(f"4b on the tracks 1-4 core, mode {m}", near_b == same and far_b == same)
            parts, _ = rig.run(kick, bass, kn, split=5)
            # The knob ramps restart at the split, and after the warm-up the
            # split run starts its ramp in the second call of a block where the
            # unsplit one waits for the next: they differ while the depth ramps
            # in (at most the input's level) and are equal once it has landed.
            gate(f"5 split block, mode {m}", parts[640:] == same[640:]
                 and err(parts, same) <= 0.25, f"(ramp-in {err(parts, same):.2e})")
            late, _ = rig.run(kick, bass, kn, first="ring")
            e = err(late, model(kick, bass, kn, delay=1))
            gate(f"6 key dispatched after: one block late, mode {m}", e <= TOL, f"({e:.2e})")

        # The fixture's publish is a stray write by design (instance 0); the
        # module itself is instance 1.
        got, log = rig.run(kick, bass, knobs(rel=100), extra=("-guard", "-dirty", "0x5a"))
        # A reader writes nothing outside its block: not a want word, not the bus.
        mine = re.findall(r"stray\s+inst 1 ", log)
        clean = re.search(r"instance 1: .*, 0 CLOBBERING", log) and not mine
        e = err(got, model(kick, bass, knobs(rel=100)))
        gate("7 guard, dirty state", bool(clean) and e <= TOL, f"({e:.2e})")

        # A change mid-render: slot 6 is MODE, slot 0 KEY (instance 1).
        flat = stereo([Q // 4] * n)
        for name, a, b, slot, val in (("DUCK -> RING", knobs(), knobs(mode=1), 6, 1),
                                      ("RING -> DUCK", knobs(mode=1), knobs(), 6, 0),
                                      ("KEY T5 -> OFF", knobs(mode=1), knobs(mode=1, key=0), 0, 0)):
            got, _ = rig.run(kick, flat, a, extra=("-sched", f"100:1:{slot}={val}"))
            e = err(got, model(kick, flat, a, sched={100: b}))
            before, _ = rig.run(kick, flat, a)
            after, _ = rig.run(kick, flat, b)
            step = lambda y: max(abs(y[i] - y[i - 2]) for i in range(1300, len(y)))
            # The fade is one 16-sample ramp each way: a full-depth wet can
            # move by the input's level over it, 1/8 of that a sample at most.
            lo = max(step(before), step(after))
            gate(f"8 change mid-render: {name}", e <= TOL and step(got) <= max(2 * lo, Q // 4 // 4),
                 f"(model {e:.2e}, largest step {step(got) / Q:.4f}; steady {lo / Q:.4f}, input 0.25)")

        # Zipper: verify_knob_clicks's measure (the third difference's energy
        # per sample phase of the block, the excess over the median phase as
        # one step a block) on a 438.75 Hz tone at 0.3 FS under a steady key,
        # each continuous knob turned 20 -> 110 one step every two blocks.
        nb = 400
        tone_in = stereo(sine(438.75, 0.3, nb * 16))
        steady = stereo([Q // 8] * (nb * 16))

        def step_db(y):
            y = [v / Q for v in y[0::2]]
            d3 = [y[i] - 3 * y[i - 1] + 3 * y[i - 2] - y[i - 3] for i in range(3, len(y))]
            ph = [[] for _ in range(16)]
            for i, v in enumerate(d3[16 * 110:16 * 300], 16 * 110 + 3):
                ph[i % 16].append(v * v)
            en = sorted(sum(p) / len(p) for p in ph)
            med = (en[7] + en[8]) / 2
            return 10 * math.log10(max(sum(max(0.0, v - med) for v in en) / 6, 1e-30))

        # The instrument first: the same tone under a gain stepped once every
        # two blocks by a knob step must read as a step (about -52 dBFS).
        fake = [round(v * (20 + min(90, max(0, (i // 32 - 110) // 2))) / 128) for i, v in enumerate(tone_in)]
        gate("9a the step measure sees a block-rate step", step_db(fake) > -60.0, f"({step_db(fake):.0f} dBFS)")

        worst_db, at = -999.0, None
        for name, mode, slot in (("DPTH", 0, 1), ("KLPF", 0, 2), ("ATK", 0, 3), ("HOLD", 0, 4), ("REL", 0, 5),
                                 ("DPTH", 1, 1), ("KLPF", 1, 2), ("SLEW", 1, 3), ("RECT", 1, 5)):
            base = knobs(mode=mode, rel=0, hold=34 if mode == 0 else 0)
            base[slot] = 20
            sched = ",".join(f"{110 + 2 * k}:1:{slot}={20 + k}" for k in range(1, 91))
            moved, _ = rig.run(steady, tone_in, base, extra=("-sched", sched))
            still, _ = rig.run(steady, tone_in, base)
            db = step_db(moved)
            if db - max(step_db(still), -200) > 6 and db > worst_db:
                worst_db, at = db, f"{name} in {'RING' if mode else 'DUCK'}"
        gate("9 no knob steps at the block rate", worst_db <= -70.0,
             f"(loudest {worst_db:.0f} dBFS at {at})" if at else "(none above the steady render)")

        # RING's key stages, on a steady input under a full-scale key (0.25 * 4).
        nr = 9600
        level = Q // 4
        flat_r = stereo([level] * nr)
        key_r = stereo(sine(55, 0.25, nr))
        tail = lambda y: [v / level for v in y[2 * 3000::2]]
        got, _ = rig.run(key_r, flat_r, knobs(mode=1, atk=0, hold=8, rel=0))
        left = got[2 * 3000::2]
        runs, run = [], 1
        for i in range(1, len(left)):
            if left[i] == left[i - 1]:
                run += 1
            else:
                runs.append(run)
                run = 1
        inner = set(runs[1:])
        gate("10a S&H 8: each key held for 128 samples", inner == {128}, f"(run lengths {sorted(inner)[:4]})")
        plain = tail(rig.run(key_r, flat_r, knobs(mode=1, atk=0, hold=0, rel=0))[0])
        slewed = tail(rig.run(key_r, flat_r, knobs(mode=1, atk=60, hold=0, rel=0))[0])
        gate("10b SLEW 60: the gain follows the key's level", min(slewed) >= 0 and max(slewed) - min(slewed) < 0.5
             and min(plain) < -0.9, f"(gain {min(slewed):.3f}..{max(slewed):.3f}; SLEW 0 reaches {min(plain):.3f})")
        rect = tail(rig.run(key_r, flat_r, knobs(mode=1, atk=0, hold=0, rel=127))[0])
        mean = sum(rect) / len(rect)
        gate("10c RECT 127: the key rectified", min(rect) >= -0.01 and abs(mean - 2 / math.pi) < 0.03 and min(plain) < -0.9,
             f"(gain {min(rect):.3f}..{max(rect):.3f}, mean {mean:.3f}; RECT 0 reaches {min(plain):.3f})")

        # SLEW across 0: once each way, then every eight blocks (as a lock or an LFO on ATK would).
        lstep = lambda y: max(abs(y[i] - y[i - 2]) for i in range(2 * 3000, len(y)))
        lo = max(lstep(rig.run(key_r, flat_r, knobs(mode=1, atk=a, hold=0, rel=0))[0]) for a in (0, 30))
        for name, ch in (("once each way", {350: 30, 450: 0}),
                         ("every eight blocks", {350 + 8 * i: (30 if i % 2 == 0 else 0) for i in range(24)})):
            base = knobs(mode=1, atk=0, hold=0, rel=0)
            got, _ = rig.run(key_r, flat_r, base, extra=("-sched", ",".join(f"{b}:1:3={v}" for b, v in ch.items())))
            e = err(got, model(key_r, flat_r, base, sched={b: knobs(mode=1, atk=v, hold=0, rel=0) for b, v in ch.items()}))
            gate(f"10d SLEW across 0, {name}: no click", e <= TOL and lstep(got) <= max(2 * lo, level // 4),
                 f"(model {e:.2e}, largest step {lstep(got) / level:.3f} of the input; steady {lo / level:.3f})")

        # S&H 127 -> 0: the next call takes a new key.
        sh = knobs(mode=1, atk=0, hold=127, rel=0)
        got, _ = rig.run(key_r, flat_r, sh, extra=("-sched", "400:1:4=0"))
        every, _ = rig.run(key_r, flat_r, knobs(mode=1, atk=0, hold=0, rel=0))
        diff = [i // 2 for i in range(len(got)) if got[i] != every[i]]
        last = max(diff) if diff else -1
        e = err(got, model(key_r, flat_r, sh, sched={400: knobs(mode=1, atk=0, hold=0, rel=0)}))
        gate("10e S&H 127 -> 0: a new key from the next call", e <= TOL and last < 400 * 16,
             f"(model {e:.2e}; last sample unlike S&H 0's: {last - 400 * 16} after the change)")
    finally:
        shutil.rmtree(work, ignore_errors=True)
    if failures:
        sys.exit(f"[FAIL] {len(failures)} gate(s): {', '.join(failures)}")
    print("[PASS] RINGMOD SC render gate")


if __name__ == "__main__":
    main()
