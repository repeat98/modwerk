#!/usr/bin/env python3
"""OUTPUT MATRIX's gate: the built image under the ColdFire port (ot_emu).

    python3 modules/output-matrix/verify.py        (from the octabam root)

Reads, and SKIPs without any of them:
  - the image: out/mainos_bus.bin built with OUTPUT MATRIX (MATRIX_IMAGE overrides);
  - the port: out/emu/ot_emu (`make emu-cf`; OT_EMU overrides);
  - the fixture: octabam's one-THRU card, T1 a THRU machine on inputs A/B and
    nothing else sounding (`tools/verify/stems_fixture.py --thru1` in octabam,
    which writes out/stems_fixture_thru1.json), or MATRIX_FIXTURE=<that json>.

What it runs (each an ot_emu run of the fixture, CUE CFG and T1's destination
poked, RMS over the last 2,000 samples of core 0's eight TX0 ring words: 0/1
CUE, 2/3 MAIN, 4/5 PHONES):
  1. every destination code 0..13 reaches exactly its outputs (MASTER off);
  2. MATRIX MAIN equals the stock path's MAIN in the same image (0.05%);
  3. CUE and PHONES follow the stock level law against MAIN, (MAIN/CUE)^2;
  4. mono jacks: with L = R, MNL..PHR carry exactly the stereo level (0.2%);
  5. MKII: PHL lands on word 5, as stock's MKII phones swap;
  6. MASTER on: T1 on MAIN reaches MAIN through T8; on PHNS, MAIN is silent;
  7. FUNC + TRACK mute silences a routed track on every output;
  8. DIR inputs reach MAIN in MATRIX as in the stock path (0.05%);
  9. declick: switching MAIN -> PHNS mid-tone adds no step larger than the
     tone's own (MAIN) and no more than 10% over it (PHONES, the fade-in);
 10. the mode switch (keys, MKII): NORMAL -> MATRIX converts bank 1, bank 16
     and the live bytes by the rules (MODEL below), and marks changed banks
     for saving; a power cycle (CS1 and card of that run, the firmware's own
     power-up load) keeps MATRIX and the current track's code;
 11. every conversion rule, by the keys: MATRIX -> STUDIO and -> NORMAL for
     all 14 codes and a stray cue level (two Parts, bank 16, the saved Part,
     the live bytes, NORMAL's cue bits from the current Part), both round
     trips back, STUDIO -> MATRIX for the four level cases, and NORMAL ->
     MATRIX with and without CUE MUTES TRACK; the current bank's power-cycle
     copies of the Parts; track 8 as the master (never cued, no cue level);
     CC 51 out for each track a switch into NORMAL cues.
What it cannot see: hardware timing, the analogue jacks, other modules.
"""
import json
import math
import os
import pathlib
import re
import shutil
import struct
import subprocess
import sys
import tempfile
import wave
from concurrent.futures import ThreadPoolExecutor

HERE = pathlib.Path(__file__).absolute().parent
ROOT = pathlib.Path.cwd() if (pathlib.Path.cwd() / "tools/emu").is_dir() else HERE.parents[1]
EMU = pathlib.Path(os.environ.get("OT_EMU", ROOT / "out/emu/ot_emu"))
IMAGE = pathlib.Path(os.environ.get("MATRIX_IMAGE", ROOT / "out/mainos_bus.bin"))
FIXTURE = pathlib.Path(os.environ.get("MATRIX_FIXTURE", ROOT / "out/stems_fixture_thru1.json"))
PY = ROOT / ".venv/bin/python3" if (ROOT / ".venv/bin/python3").exists() else pathlib.Path(sys.executable)

# The destination codes (manifest.py _CODES): per code, (CUE, MAIN, PHONES).
CODES = (("off", "st", "off"), ("st", "off", "off"), ("off", "off", "st"), ("st", "st", "off"),
         ("off", "st", "st"), ("st", "off", "st"), ("st", "st", "st"), ("off", "L", "off"),
         ("off", "R", "off"), ("L", "off", "off"), ("R", "off", "off"), ("off", "off", "L"),
         ("off", "off", "R"), ("off", "off", "off"))
B0, BANK, WORK_LV = 0x400e21e0, 0x9b340, 0x8ed92
FAILS = []


def check(ok, what):
    print(("  ok    " if ok else "  FAIL  ") + what)
    if not ok:
        FAILS.append(what)


def expected_words(code):
    words = set()
    for bus, kind in enumerate(CODES[code]):
        if kind in ("st", "L"):
            words.add(2 * bus)
        if kind in ("st", "R"):
            words.add(2 * bus + 1)
    return words


# The conversion rules (matrix.s convert_all), as the gate expects them.
CUE_DESTS = {1, 3, 5, 6, 9, 10}
LEVEL_DESTS = {0, 3, 4, 6, 7, 8, 2, 11, 12}          # MAIN, or PHONES only (kept on MAIN)


def out_of_matrix(level, code, master=False):
    """MATRIX (level, code) -> STUDIO or NORMAL (LEVEL, cue level). master:
    track 8 with MASTER TRACK on, which has no cue outside MATRIX."""
    code = code if code <= 13 else 0
    if master:
        return (0 if code == 13 else level, 0)
    return (level if code in LEVEL_DESTS else 0, level if code in CUE_DESTS else 0)


def from_studio(main, cue, master=False):
    if master:
        return main, 0
    if cue == 0:
        return main, 0
    return (main, 3) if main else (cue, 1)


def from_normal(level, cue, cued, mutes, master=False):
    if master or not cued:
        return level, 0
    if cue == 0:
        return level, (13 if mutes else 0)
    return (cue, 1) if (level == 0 or mutes) else (level, 3)


def tone4(path, seconds=8):
    with wave.open(str(path), "wb") as w:
        w.setnchannels(4); w.setsampwidth(2); w.setframerate(44100)
        w.writeframes(b"".join(struct.pack("<hhhh", *(int(0.25 * 32767 * math.sin(2 * math.pi * 1000 * i / 44100)),) * 4)
                               for i in range(44100 * seconds)))


class Run:
    def __init__(self, work, fx):
        self.work, self.fx = work, fx

    def emu(self, tag, args, frames=200, audio=None, card=None):
        out = self.work / tag
        cmd = [str(EMU), "--image", str(IMAGE), "--card", str(card or self.fx["card"]), "--set", self.fx["set"],
               "--project", self.fx["project"], "--load-ms", "30000", "--dsp", "--main-level", "64"] + args
        if audio is not False:
            cmd += ["--sequencer", "--internal-clock", "--frames", str(frames), "--pre-roll", "40", "--poke-trig", "2",
                    "--audio-in", str(audio or self.fx["audio_in"]), "--audio-out", str(out)]
        with open(f"{out}.log", "w") as log:
            r = subprocess.run(cmd, stdout=log, stderr=subprocess.STDOUT, timeout=900)
        if r.returncode:
            raise RuntimeError(f"ot_emu exit {r.returncode}: {out}.log")
        return out

    @staticmethod
    def words(prefix):
        log = pathlib.Path(f"{prefix}.log").read_text()
        start = int(re.search(r"audio out\s*:.*transport start at frame (\d+)", log).group(1))
        with wave.open(f"{prefix}_core0.wav") as w:
            n = w.getnchannels(); raw = w.readframes(w.getnframes())
        v = [int.from_bytes(raw[i:i + 3], "little", signed=True) for i in range(0, len(raw), 3)]
        return [v[f * n:(f + 1) * n] for f in range(start, len(v) // n)]

    @staticmethod
    def rms(frames, last=2000):
        tail = frames[-last:]
        return [math.sqrt(sum(f[c] ** 2 for f in tail) / len(tail)) for c in range(8)]


def main():
    for what, path in (("image", IMAGE), ("port", EMU), ("fixture", FIXTURE)):
        if not path.exists():
            print(f"verify output-matrix: SKIP (no {what}: {path})")
            return 0
    fx = json.loads(FIXTURE.read_text())
    work = pathlib.Path(tempfile.mkdtemp(prefix="output_matrix_verify_"))
    run = Run(work, fx)
    tone = work / "tone4.wav"; tone4(tone)
    base = "0x8000000a=0;0x80000034=0"                       # no mutes, MASTER off
    matrix = base + ";0x80000037=2"
    jobs = {}
    with ThreadPoolExecutor(max_workers=6) as pool:
        def go(tag, args, **kw):
            jobs[tag] = pool.submit(run.emu, tag, args, **kw)
        go("normal", ["--poke", base])
        for c in range(14):
            go(f"c{c}", ["--poke", matrix, "--step", f"20:poke:0x80000c51={c}"])
        levels = ";0x80000036=127;0x80000032=127;0x80000035=127"
        go("st_tone", ["--poke", matrix + levels, "--step", "20:poke:0x80000c51=0"], audio=tone)
        for c in range(7, 13):
            go(f"mono{c}", ["--poke", matrix + levels, "--step", f"20:poke:0x80000c51={c}"], audio=tone)
        go("mkii", ["--mkii", "--poke", matrix, "--step", "20:poke:0x80000c51=11"])
        go("master_main", ["--poke", "0x8000000a=0;0x80000034=1;0x80000037=2", "--step", "20:poke:0x80000c51=0"])
        go("master_phns", ["--poke", "0x8000000a=0;0x80000034=1;0x80000037=2", "--step", "20:poke:0x80000c51=2"])
        go("mute", ["--poke", matrix, "--step", "20:poke:0x80000c51=6", "--step", "60:poke:0x8000000a=1"])
        go("dir_normal", ["--poke", base + ";0x80000031=127"])
        go("dir_matrix", ["--poke", matrix + ";0x80000031=127", "--step", "20:poke:0x80000c51=0"])
        go("declick", ["--poke", matrix + levels, "--step", "20:poke:0x80000c51=0", "--step", "100:poke:0x80000c51=2"],
           frames=160, audio=tone)
        conv = conversion_jobs(run, pool, work)
        mx = matrix_jobs(run, pool, work)
    res = {t: j.result() for t, j in jobs.items()}

    print("verify output-matrix: routing")
    normal = run.rms(run.words(res["normal"]))
    for c in range(14):
        r = run.rms(run.words(res[f"c{c}"]))
        want = expected_words(c)
        check(all((r[w] > 1000) == (w in want) for w in range(8)),
              f"code {c:2d}: signal on words {sorted(w for w in range(8) if r[w] > 1000)}, expected {sorted(want)}")
    main0 = run.rms(run.words(res["c0"]))
    check(all(abs(main0[w] - normal[w]) <= 5e-4 * normal[w] for w in (2, 3)),
          f"MATRIX MAIN {main0[2]:.0f}/{main0[3]:.0f} = stock path {normal[2]:.0f}/{normal[3]:.0f}")
    cue1, ph2 = run.rms(run.words(res["c1"])), run.rms(run.words(res["c2"]))
    ratio = (127 / 64) ** 2                                     # the fixture: MAIN 127, CUE 64, MIX 64
    check(abs(main0[2] / cue1[0] / ratio - 1) < 0.01 and abs(main0[2] / ph2[4] / ratio - 1) < 0.01,
          f"MAIN/CUE {main0[2] / cue1[0]:.3f}, MAIN/PHONES {main0[2] / ph2[4]:.3f}, law (127/64)^2 = {ratio:.3f}")

    print("verify output-matrix: mono, MKII, master, mute, inputs")
    st = run.rms(run.words(res["st_tone"]))[2]
    for c, word in zip(range(7, 13), (2, 3, 0, 1, 4, 5)):
        m = run.rms(run.words(res[f"mono{c}"]))[word]
        check(abs(m / st - 1) < 2e-3, f"code {c} on word {word}: {m:.0f}, stereo per side {st:.0f}")
    mk = run.rms(run.words(res["mkii"]))
    check(mk[4] == 0 and mk[5] > 1000, f"MKII PHL: words 4/5 = {mk[4]:.0f}/{mk[5]:.0f} (left on 5)")
    mm, mp = run.rms(run.words(res["master_main"])), run.rms(run.words(res["master_phns"]))
    check(mm[2] > 1000 and mm[4] == 0, f"MASTER, T1 MAIN: MAIN {mm[2]:.0f}, PHONES {mm[4]:.0f}")
    check(mp[2] == 0 and mp[4] > 1000, f"MASTER, T1 PHNS: MAIN {mp[2]:.0f}, PHONES {mp[4]:.0f}")
    mu = run.rms(run.words(res["mute"]))
    check(max(mu[:6]) == 0, f"T1 on ALL, muted: {[round(x) for x in mu[:6]]}")
    dn, dr = run.rms(run.words(res["dir_normal"])), run.rms(run.words(res["dir_matrix"]))
    check(abs(dr[2] / dn[2] - 1) < 5e-4, f"DIR AB 127: MATRIX MAIN {dr[2]:.0f}, stock path {dn[2]:.0f}")

    print("verify output-matrix: declick")
    x = run.words(res["declick"])
    tone_step = max(abs(x[i + 1][2] - x[i][2]) for i in range(600, 1200))   # MAIN before the switch
    for word, limit in ((2, 1.0), (4, 1.1)):
        after = max(abs(x[i + 1][word] - x[i][word]) for i in range(1300, len(x) - 1))
        check(after <= limit * tone_step, f"word {word}: largest step after the switch {after}, the tone's own {tone_step}")

    conversion_checks(conv)
    matrix_checks(mx)
    shutil.rmtree(work, ignore_errors=True)
    print(f"verify output-matrix: {'FAIL (' + str(len(FAILS)) + ')' if FAILS else 'PASS'}")
    return 1 if FAILS else 0


def keys(*steps):
    lines = []
    for at, code in steps:
        lines += [f"{at} key {code} down", f"{at + 60} key {code} up"]
    return lines


def conversion_jobs(run, pool, work):
    """MATRIX selected with the keys (PROJ, CONTROL, AUDIO, CUE CFG, MATRIX),
    then CUE + LEVEL +8 detents (two steps) on the current track; dumps for the conversion, and a
    second boot from that run's CS1 and card."""
    menu = keys((500, "0x1c"), (900, "0x20"), (1100, "0x20"), (1300, "0x31"), (1700, "0x31"), (2100, "0x21"),
                (2300, "0x20"), (2500, "0x20"), (2700, "0x31"), (3000, "0x32"), (3300, "0x32"))
    script = work / "conv.script"
    script.write_text("\n".join(menu + ["4000 key 0x2a down", "4300 enc 6 8", "4500 key 0x2a up", "7000 quit"]) + "\n")
    card = work / "conv_card.img"; shutil.copy(run.fx["card"], card)
    dumps = {"pre_live": "0x80000c50,16", "mode": "0x80000037,1", "track": "0x80000000,1", "mask": "0x80000008,4",
             "b1": f"{B0 + WORK_LV:#x},16", "b16": f"{B0 + 15 * BANK + WORK_LV:#x},16", "live": "0x80000c50,16",
             "save1": f"{B0 + 0x9b332:#x},4", "cs1": "0x10000000,0x100000"}
    spec = ";".join(f"{a}={work / ('conv_' + k + '.bin')}" for k, a in ((k, v) for k, v in dumps.items() if k != "pre_live"))
    pre = work / "pre.script"; pre.write_text("300 quit\n")
    jobs = {"pre": pool.submit(run.emu, "conv_pre", ["--mkii", "--live-script", str(pre), "--mem-dump",
                                                    f"0x80000c50,16={work / 'conv_pre_live.bin'};0x80000008,4={work / 'conv_pre_mask.bin'};"
                                                    f"{B0 + WORK_LV:#x},16={work / 'conv_pre_b1.bin'};"
                                                    f"{B0 + 15 * BANK + WORK_LV:#x},16={work / 'conv_pre_b16.bin'};"
                                                    f"0x8000009c,4={work / 'conv_pre_mutes.bin'};"
                                                    f"0x80000034,1={work / 'conv_pre_master.bin'}"],
                               audio=False, card=card)}
    jobs["conv"] = pool.submit(lambda: (run.emu("conv", ["--mkii", "--live-script", str(script), "--card-out",
                                                         str(work / "conv_out.img"), "--mem-dump", spec], audio=False,
                                                card=card), power_cycle(run, work))[1])
    return work, jobs


# The CUE CFG rows: the cursor starts on NORMAL, so 0, 1 or 2 DOWNs. The
# PROJECT menu reopens on CONTROL's list, so a second visit takes one YES.
def menu_to(row, at, first=True):
    steps = [(at, "0x1c")]
    steps += [(at + 400, "0x20"), (at + 600, "0x20"), (at + 800, "0x31")] if first else []
    steps += [(at + 1200, "0x31"), (at + 1600, "0x21")]
    steps += [(at + 1800 + 200 * k, "0x20") for k in range(row)]
    steps += [(at + 2400, "0x31"), (at + 2700, "0x32"), (at + 3000, "0x32")]
    return keys(*steps)


def part_lv(bank, part, saved=False):
    return B0 + bank * BANK + (0x9505c if saved else WORK_LV) + part * 0x18b2


CS1_LV = {False: 0x100a4ee0, True: 0x100ab1a8}               # the current bank's Parts kept for a power cycle


# MATRIX fixtures: Part 1 codes 0..7, Part 2 codes 8..13, a stray cue level
# (100, read as MAIN) and MAIN at level 0; levels 40 + code, all distinct.
R_PAIRS = ([(40 + c, c) for c in range(8)], [(40 + c, c) for c in range(8, 14)] + [(90, 100), (0, 0)])
# STUDIO and NORMAL fixtures, one Part: (LEVEL, cue level) on T1..T8.
S_PAIRS = [(50, 0), (0, 60), (50, 60), (0, 0), (70, 30), (0, 127), (127, 0), (5, 5)]
N_PAIRS = [(50, 0), (50, 60), (0, 60), (50, 0), (0, 0), (50, 60), (0, 60), (50, 0)]
N_CUED = 0b01101110                                   # T2, T3, T4, T6, T7 cued


def pokes(pairs_by_part, extra=""):
    out = []
    for part, pairs in enumerate(pairs_by_part):
        for t, (lv, cue) in enumerate(pairs):
            addrs = [part_lv(bank, part, saved) for bank, saved in ((0, False), (0, True), (15, False))]
            addrs += [CS1_LV[saved] + part * 0x18b2 for saved in (False, True)]
            for base in addrs:
                a = base + 2 * t
                out += [f"{a:#x}={lv}", f"{a + 1:#x}={cue}"]
            if part == 0:
                out += [f"{0x80000c50 + 2 * t:#x}={lv}", f"{0x80000c51 + 2 * t:#x}={cue}"]
    return ";".join(out) + extra


M0, M1 = ";0x80000034=0", ";0x80000034=1"                   # MASTER TRACK off / on
MATRIX = {  # tag: (mode, pairs by Part, extra pokes, rows chosen in order)
    "rs": (2, R_PAIRS, M0, (1,)), "rs_r": (2, R_PAIRS, M0, (1, 2)),
    "rn": (2, R_PAIRS, M0 + ";0x80000009=0;0x8000009f=0;0x8000004a=3", (0,)),
    "rn_r": (2, R_PAIRS, M0 + ";0x80000009=0;0x8000009f=0", (0, 2)),
    "sr": (1, (S_PAIRS,), M0, (2,)),
    "nr": (0, (N_PAIRS,), M0 + f";0x80000009={N_CUED};0x8000009f=0", (2,)),
    "nr_m": (0, (N_PAIRS,), M0 + f";0x80000009={N_CUED};0x8000009f=1", (2,)),
    # track 8 as the master: R_PAIRS' Part 1 puts it on MNL, so give it CUE (and Part 2 T8 MN at 0)
    "rs_t8": (2, ([*R_PAIRS[0][:7], (77, 1)], R_PAIRS[1]), M1, (1,)),
    "rn_t8": (2, ([*R_PAIRS[0][:7], (77, 6)], R_PAIRS[1]), M1 + ";0x80000009=0;0x8000009f=0;0x8000004a=3", (0,)),
    "sr_t8": (1, ([*S_PAIRS[:7], (90, 60)],), M1, (2,)),
}


def matrix_jobs(run, pool, work):
    jobs = {}
    for tag, (mode, pairs, extra, rows) in MATRIX.items():
        lines = []
        for k, row in enumerate(rows):
            lines += menu_to(row, 500 + 4000 * k, first=k == 0)
        script = work / f"m_{tag}.script"
        script.write_text("\n".join(lines + [f"{500 + 4000 * len(rows)} quit"]) + "\n")
        dumps = {f"p{p}": f"{part_lv(0, p):#x},16" for p in range(2)}
        dumps.update(s0=f"{part_lv(0, 0, True):#x},16", b16=f"{part_lv(15, 0):#x},16", live="0x80000c50,16",
                     cs1w=f"{CS1_LV[False]:#x},16", cs1s=f"{CS1_LV[True]:#x},16",
                     mask="0x80000008,4", maskcs1="0x100b14d4,4", mode="0x80000037,1")
        spec = ";".join(f"{a}={work / f'm_{tag}_{k}.bin'}" for k, a in dumps.items())
        jobs[tag] = pool.submit(run.emu, f"m_{tag}", ["--mkii", "--poke", f"0x80000037={mode};" + pokes(pairs, extra),
                                                      "--live-script", str(script), "--mem-dump", spec,
                                                      "--midi-out", str(work / f"m_{tag}.midi")], audio=False)
    return work, jobs


def matrix_checks(mx):
    work, jobs = mx
    for j in jobs.values():
        j.result()
    print("verify output-matrix: conversion rules")
    rd = lambda tag, k: (work / f"m_{tag}_{k}.bin").read_bytes()
    pairs = lambda b: [(b[2 * t], b[2 * t + 1]) for t in range(8)]
    for tag, (mode, parts, extra, rows) in MATRIX.items():
        final = (0, 1, 2)[rows[-1]]
        master = M1 in extra
        mt = lambda t: master and t == 7
        check(rd(tag, "mode")[0] == final, f"{tag}: CUE CFG {rd(tag, 'mode')[0]}, expected {final}")
        cued_from = [int(c in CUE_DESTS and not mt(t)) for t, (_, c) in enumerate(parts[0])] if mode == 2 else None
        for p, src in enumerate(parts):
            want = list(src)
            cued = [N_CUED >> t & 1 for t in range(8)] if mode == 0 else [0] * 8
            if mode == 2:                              # MATRIX -> STUDIO or NORMAL
                want = [out_of_matrix(*x, mt(t)) for t, x in enumerate(want)]
                if len(rows) > 1:                      # and back
                    want = [from_studio(*x, mt(t)) for t, x in enumerate(want)] if rows[0] == 1 else \
                           [from_normal(*x, cued_from[t], 0, mt(t)) for t, x in enumerate(want)]
            elif mode == 1:
                want = [from_studio(*x, mt(t)) for t, x in enumerate(want)]
            else:
                want = [from_normal(*x, cued[t], extra.endswith("=1"), mt(t)) for t, x in enumerate(want)]
            got = pairs(rd(tag, f"p{p}"))
            check(got == want, f"{tag} Part {p + 1}: {got}, expected {want}")
            if p == 0:
                for k in ("s0", "b16", "live", "cs1w", "cs1s"):
                    check(pairs(rd(tag, k)) == want, f"{tag} {k} matches Part 1: {pairs(rd(tag, k))}")
        if final == 0:                                 # into NORMAL: the cue bits and CC 51 out
            bits = sum(1 << t for t, c in enumerate(cued_from) if c)
            for k in ("mask", "maskcs1"):
                got = rd(tag, k)[1]
                check(got == bits, f"{tag}: NORMAL cue bits ({k}) {got:08b}, expected {bits:08b} (the current Part's CUE destinations{', not the master' if master else ''})")
            if "0x8000004a=3" in extra:
                out = (work / f"m_{tag}.midi").read_bytes()
                ccs = sorted({(b & 15, v) for b, c, v in zip(out, out[1:], out[2:]) if b & 0xf0 == 0xb0 and c == 0x33})
                check(len(ccs) == bin(bits).count("1") and all(v == 1 for _, v in ccs),
                      f"{tag}: CC 51 out {ccs} for the {bin(bits).count('1')} newly cued tracks")


def power_cycle(run, work):
    q = work / "q.script"; q.write_text("300 quit\n")
    run.emu("cycle", ["--mkii", "--cs1-in", str(work / "conv_cs1.bin"), "--no-post", "--live-script", str(q),
                      "--mem-dump", f"0x80000037,1={work / 'cyc_mode.bin'};0x80000c50,16={work / 'cyc_live.bin'}"],
            audio=False, card=work / "conv_out.img")


def conversion_checks(conv):
    work, jobs = conv
    for j in jobs.values():
        j.result()
    rd = lambda k: (work / f"conv_{k}.bin").read_bytes()
    print("verify output-matrix: mode switch and power cycle")
    mask = int.from_bytes((work / "conv_pre_mask.bin").read_bytes(), "big")
    mutes = int.from_bytes((work / "conv_pre_mutes.bin").read_bytes(), "big")
    t = rd("track")[0]
    pre = lambda k: (work / f"conv_pre_{k}.bin").read_bytes()
    master = (work / "conv_pre_master.bin").read_bytes()[0] != 0
    conv = lambda b: [from_normal(b[2 * k], b[2 * k + 1], mask >> (16 + k) & 1, mutes, master and k == 7) for k in range(8)]
    check(rd("mode")[0] == 2, f"CUE CFG after YES on MATRIX: {rd('mode')[0]}")
    for name in ("b1", "b16"):
        got = [(rd(name)[2 * k], rd(name)[2 * k + 1]) for k in range(8)]
        exp = conv(pre(name))
        if name == "b1":
            exp[t] = (exp[t][0], min(13, exp[t][1] + 2))
        check(got == exp, f"{name} (LEVEL, code) {got}, expected {exp} (the NORMAL rules; T{t + 1} then two steps)")
    live = [(rd("live")[2 * k], rd("live")[2 * k + 1]) for k in range(8)]
    exp = conv(pre("live")); exp[t] = (exp[t][0], min(13, exp[t][1] + 2))
    check(live == exp, f"live (LEVEL, code) {live}, expected {exp}")
    check(int.from_bytes(rd("save1"), "big") == 1, "bank 1 marked for the next save")
    mode = (work / "cyc_mode.bin").read_bytes()[0]; cyc = list((work / "cyc_live.bin").read_bytes()[1::2])
    check(mode == 2 and cyc[t] == 2, f"after a power cycle: CUE CFG {mode}, T{t + 1} code {cyc[t]}")


if __name__ == "__main__":
    sys.exit(main())
