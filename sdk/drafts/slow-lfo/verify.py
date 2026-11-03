#!/usr/bin/env python3
"""SLOW LFO's gate: stock 1.40C under the ColdFire port with the unit preloaded.

    python3 modules/slow-lfo/verify.py        (from an octabam root)

Assembles unit.s at a free ROM run (0x400d24d0) and preloads it with a jmp at
each detour site and the two MULT counts poked to 10. Then:
  1. Rate: with track 1's LFO 1 MULT set in its live lane (0x80000810 + 0x3e),
     the LFO's phase value (state 0x800010e8 +0) over frames 100..2100 at
     MULT 0 (1X), 7, 8 and 9 must be 1/2, 1/4 and 1/8 of 1X, within 1 %.
  2. Labels: the MULT formatter (0x4003bda4) called with 0, 6, 7, 8, 9 must
     write 1X, 64X, 1/2X, 1/4X, 1/8X.

Reads, and SKIPs without any of them: the port (out/emu/ot_emu, OT_EMU), the
stock MAIN OS (out/raw/section_3_MAIN_OS.bin, SLOW_IMAGE) and a card holding a
project (SLOW_CARD, SLOW_SET, SLOW_PROJECT; tools/emu/ot_emu/stage_card.py
makes one). Not covered: the MIDI engine (the staged project plays no MIDI
track), the LFO's audible output, the page as drawn.
"""
import os
import pathlib
import struct
import subprocess
import sys
import tempfile

HERE = pathlib.Path(__file__).absolute().parent
ROOT = pathlib.Path.cwd()
EMU = pathlib.Path(os.environ.get("OT_EMU", ROOT / "out/emu/ot_emu"))
IMAGE = pathlib.Path(os.environ.get("SLOW_IMAGE", ROOT / "out/raw/section_3_MAIN_OS.bin"))
CARD = os.environ.get("SLOW_CARD", "")
SET, PROJECT = os.environ.get("SLOW_SET", "OCTABAM"), os.environ.get("SLOW_PROJECT", "")
CAVE = 0x400d24d0
DETOURS = ((0x4000cfb0, "sl_rate_audio", 10), (0x4000cfd6, "sl_mult_audio", 6), (0x40003c16, "sl_rate_midi", 10),
           (0x40003c3c, "sl_mult_midi", 6), (0x4003bda4, "sl_format", 6))
COUNTS = (0x400d38b0, 0x400d421c)
LANE_MULT, STATE = 0x80000810 + 0x3e, 0x800010e8


def skip(why):
    print("[SKIP] slow-lfo: " + why)
    sys.exit(0)


def emu(preload, *args):
    return subprocess.run([str(EMU), "--image", str(IMAGE), "--preload", preload, "--card", CARD, "--set", SET,
                           "--project", PROJECT, "--load-ms", "20000", "--sequencer", "--internal-clock", *args],
                          capture_output=True, text=True, timeout=600)


def main():
    if not EMU.is_file() or not IMAGE.is_file() or not CARD or not PROJECT:
        skip("needs OT_EMU, the stock MAIN OS and SLOW_CARD/SLOW_PROJECT")
    failed = False
    with tempfile.TemporaryDirectory() as tmp:
        tmp = pathlib.Path(tmp)
        subprocess.run(["m68k-elf-as", "-mcpu=54455", "-o", tmp / "u.o", HERE / "unit.s"], check=True)
        subprocess.run(["m68k-elf-ld", "-e", "sl_format", "-Ttext=%#x" % CAVE, "-o", tmp / "u.elf", tmp / "u.o"], check=True)
        subprocess.run(["m68k-elf-objcopy", "-O", "binary", tmp / "u.elf", tmp / "u.bin"], check=True)
        syms = {f[2]: int(f[0], 16) for f in (line.split() for line in subprocess.run(
            ["m68k-elf-nm", tmp / "u.elf"], capture_output=True, text=True, check=True).stdout.splitlines()) if len(f) == 3}
        parts = ["%#x=%s" % (CAVE, tmp / "u.bin")]
        for site, name, length in DETOURS:
            (tmp / ("%x.bin" % site)).write_bytes(b"\x4e\xf9" + struct.pack(">I", syms[name]) + b"\x4e\x71" * ((length - 6) // 2))
            parts.append("%#x=%s" % (site, tmp / ("%x.bin" % site)))
        (tmp / "count.bin").write_bytes(struct.pack(">I", 10))
        parts += ["%#x=%s" % (a, tmp / "count.bin") for a in COUNTS]
        preload = ";".join(parts)

        moved = {}
        for mult in (0, 7, 8, 9):
            a, b = tmp / ("a%d" % mult), tmp / ("b%d" % mult)
            emu(preload, "--frames", "2200", "--step", "-:poke:%#x=%d" % (LANE_MULT, mult),
                "--step", "100:dump:%#x,4=%s" % (STATE, a), "--step", "2100:dump:%#x,4=%s" % (STATE, b))
            moved[mult] = (struct.unpack(">I", b.read_bytes())[0] - struct.unpack(">I", a.read_bytes())[0]) & 0xffffffff
        for mult, want in ((7, 0.5), (8, 0.25), (9, 0.125)):
            got = moved[mult] / moved[0]
            ok = abs(got - want) <= 0.01 * want
            failed |= not ok
            print("[%s] slow-lfo: MULT %d moves %d phase units, %.4f of 1X's %d (want %g)"
                  % ("PASS" if ok else "FAIL", mult, moved[mult], got, moved[0], want))

        steps = []
        for v in (0, 6, 7, 8, 9):
            steps += ["--step", "-:call:0x4003bda4,0x400d4600,%d" % v, "--step", "-:dump:0x400d4600,8=%s" % (tmp / ("l%d" % v))]
        emu(preload, "--frames", "5", *steps)
        for v, want in ((0, "1X"), (6, "64X"), (7, "1/2X"), (8, "1/4X"), (9, "1/8X")):
            got = (tmp / ("l%d" % v)).read_bytes().split(b"\0")[0].decode("latin1")
            failed |= got != want
            print("[%s] slow-lfo: MULT %d reads %s (want %s)" % ("PASS" if got == want else "FAIL", v, got, want))
    sys.exit(1 if failed else 0)


main()
