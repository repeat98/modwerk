#!/usr/bin/env python3
"""BAR LED's gate: stock 1.40C under the ColdFire port with the unit preloaded.

    python3 modules/bar-led/verify.py        (from an octabam root)

Assembles unit.s at a free ROM run (0x400d24d0), preloads it and a `jsr` to it
over the beat-flash call (0x40056f24), and runs the sequencer on a staged
project with pattern A01's length poked to 12, 16 and 20 steps (bank RAM
0x400e21e0 + 0x8e53, normal mode). It reads every write of the master step
0x800065b4 and every set_led (0x40013784) call returning to 0x40056f2a, and
passes when each beat flash on step 0 asks for id 39 (green) and every other
flash for stock's 38 (red), each for 3 ticks, over at least three patterns.

Reads, and SKIPs without any of them: the port (out/emu/ot_emu, OT_EMU), the
stock MAIN OS (out/raw/section_3_MAIN_OS.bin, BAR_IMAGE) and a card holding a
project (BAR_CARD, BAR_SET, BAR_PROJECT; tools/emu/ot_emu/stage_card.py makes
one). What it cannot see: the LED's colour on a unit.
"""
import os
import pathlib
import re
import struct
import subprocess
import sys
import tempfile

HERE = pathlib.Path(__file__).absolute().parent
ROOT = pathlib.Path.cwd()
EMU = pathlib.Path(os.environ.get("OT_EMU", ROOT / "out/emu/ot_emu"))
IMAGE = pathlib.Path(os.environ.get("BAR_IMAGE", ROOT / "out/raw/section_3_MAIN_OS.bin"))
CARD = os.environ.get("BAR_CARD", "")
SET, PROJECT = os.environ.get("BAR_SET", "OCTABAM"), os.environ.get("BAR_PROJECT", "")
CAVE, SITE, RETURN = 0x400d24d0, 0x40056f24, 0x40056f2a
PATTERN_LENGTH = 0x400e21e0 + 0x8e53        # pattern A01's length byte in the bank's RAM
STEP_WRITE = re.compile(r"\[0x800065b4\] <- (0x[0-9a-f]+|0) \(2\) at pc \S+ in \S+\s+i=(\d+)")
FLASH = re.compile(r"\[\s*(\d+)\] at 0x40013784 .*?\[sp 0x[0-9a-f]+: (0x[0-9a-f]+) (0x[0-9a-f]+) (0x[0-9a-f]+)")


def skip(why):
    print("[SKIP] bar-led: " + why)
    sys.exit(0)


def flashes(log):
    """(master step at the flash, LED id, count) for every beat flash, in order."""
    events = [(int(i), 0, int(v, 16)) for v, i in STEP_WRITE.findall(log)]
    events += [(int(i), 1, (int(led, 16), int(n, 16))) for i, ret, led, n in FLASH.findall(log) if int(ret, 16) == RETURN]
    step, out = None, []
    for _, kind, value in sorted(events):
        if kind == 0:
            step = value
        else:
            out.append((step,) + value)
    return out


def main():
    if not EMU.is_file() or not IMAGE.is_file() or not CARD or not PROJECT:
        skip("needs OT_EMU, the stock MAIN OS and BAR_CARD/BAR_PROJECT")
    failed = False
    with tempfile.TemporaryDirectory() as tmp:
        tmp = pathlib.Path(tmp)
        subprocess.run(["m68k-elf-as", "-mcpu=54455", "-o", tmp / "u.o", HERE / "unit.s"], check=True)
        subprocess.run(["m68k-elf-ld", "-e", "bl_flash", "-Ttext=%#x" % CAVE, "-o", tmp / "u.elf", tmp / "u.o"], check=True)
        subprocess.run(["m68k-elf-objcopy", "-O", "binary", tmp / "u.elf", tmp / "u.bin"], check=True)
        (tmp / "jsr.bin").write_bytes(b"\x4e\xb9" + struct.pack(">I", CAVE))
        for length in (12, 16, 20):
            log = subprocess.run([str(EMU), "--image", str(IMAGE),
                                  "--preload", "%#x=%s;%#x=%s" % (CAVE, tmp / "u.bin", SITE, tmp / "jsr.bin"),
                                  "--card", CARD, "--set", SET, "--project", PROJECT, "--load-ms", "20000",
                                  "--sequencer", "--internal-clock", "--frames", "20000",
                                  "--step", "-:poke:%#x=%d" % (PATTERN_LENGTH, length),
                                  "--watch-mem", "0x800065b4,2", "--watch-pc", "0x40013784"],
                                 capture_output=True, text=True, timeout=600).stdout
            seen = flashes(log)
            wrong = [f for f in seen if f[1:] != ((39 if f[0] == 0 else 38), 3)]
            greens = sum(1 for f in seen if f[1] == 39)
            text = " ".join(("G" if led == 39 else "r") + "@%s" % step for step, led, _ in seen)
            if wrong or greens < 3:
                print("[FAIL] bar-led: %d steps: %s" % (length, text))
                failed = True
            else:
                print("[PASS] bar-led: %d steps: %s" % (length, text))
    sys.exit(1 if failed else 0)


main()
