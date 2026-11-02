#!/usr/bin/env python3
"""BAR LED's gate: stock 1.40C under the ColdFire port with the unit preloaded.

    python3 modules/bar-led/verify.py        (from an octabam root)

Assembles unit.s at a free ROM run (0x400d24d0), preloads it and a `jsr` to it
over the beat-flash call (0x40056f24), runs the sequencer on a staged project
and reads every set_led (0x40013784) call returning to 0x40056f2a. Passes when
the transport start is followed by beats whose LED id is 39 on beats 1, 5, 9
and 38 on the others, each for 3 ticks.

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
BEATS = 11


def skip(why):
    print("[SKIP] bar-led: " + why)
    sys.exit(0)


def main():
    if not EMU.is_file() or not IMAGE.is_file() or not CARD or not PROJECT:
        skip("needs OT_EMU, the stock MAIN OS and BAR_CARD/BAR_PROJECT")
    with tempfile.TemporaryDirectory() as tmp:
        tmp = pathlib.Path(tmp)
        subprocess.run(["m68k-elf-as", "-mcpu=54455", "-o", tmp / "u.o", HERE / "unit.s"], check=True)
        subprocess.run(["m68k-elf-ld", "-e", "bl_flash", "-Ttext=%#x" % CAVE, "-o", tmp / "u.elf", tmp / "u.o"], check=True)
        subprocess.run(["m68k-elf-objcopy", "-O", "binary", tmp / "u.elf", tmp / "u.bin"], check=True)
        (tmp / "jsr.bin").write_bytes(b"\x4e\xb9" + struct.pack(">I", CAVE))
        log = subprocess.run([str(EMU), "--image", str(IMAGE),
                              "--preload", "%#x=%s;%#x=%s" % (CAVE, tmp / "u.bin", SITE, tmp / "jsr.bin"),
                              "--card", CARD, "--set", SET, "--project", PROJECT, "--load-ms", "20000",
                              "--sequencer", "--internal-clock", "--frames", "14000",
                              "--watch-pc", "0x40013784"], capture_output=True, text=True, timeout=600).stdout
    calls = [(int(i, 16), int(n, 16)) for r, i, n in
             re.findall(r"\[sp 0x[0-9a-f]+: (0x[0-9a-f]+) (0x[0-9a-f]+) (0x[0-9a-f]+)", log) if int(r, 16) == RETURN]
    want = [(39 if b % 4 == 0 else 38, 3) for b in range(BEATS)]
    if calls[:BEATS] != want:
        print("[FAIL] bar-led: beat flashes %s, want %s" % (calls[:BEATS], want))
        sys.exit(1)
    print("[PASS] bar-led: %d beats, green (39) on 1, 5, 9; red (38) on the rest" % BEATS)


main()
