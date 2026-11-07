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
A fourth run at 16 steps pauses and continues mid-pattern: at frames 7003 and
13003 the transport word 0x800065b8 is written 2 (stopped, position kept, as
the STOP key writes it) and back to 1. The beat ticks run on through that
poke, so the flashes no longer land on step 0; there the rule is the module's
own: green on the first flash after the pattern wraps (a lower step than the
flash before), red on every other, the flashes during the pause included.
A fifth run changes pattern while playing, through the panel: A01 at 16 steps
and A02 at 12, [PLAY], then [PTN] + [TRIG 2] in the first pass. Stock switches
at A01's end (the playing-pattern byte 0x800065be turns 1); it passes when the
step-0 rule holds throughout, the green lands on A02's 1 at least twice, and
A02's passes end on step 8 (12 steps, beats on 0, 4, 8), not 12.

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
NEXT_LENGTH = PATTERN_LENGTH + 0x8ed8       # A02's: one pattern's stride further on
STEP_WRITE = re.compile(r"\[0x800065b4\] <- (0x[0-9a-f]+|0) \(2\) at pc \S+ in \S+\s+i=(\d+)")
PATTERN_WRITE = re.compile(r"\[0x800065be\] <- (0x[0-9a-f]+|0) \(1\) at pc \S+ in \S+\s+i=(\d+)")
# [PLAY], then [PTN] + [TRIG 2] in A01's first pass (emulated ms, panel key codes)
CHANGE = (("0 poke %#x=16" % PATTERN_LENGTH), ("0 poke %#x=12" % NEXT_LENGTH), "200 key 0x28 down", "320 key 0x28 up",
          "3000 key 0x2e down", "3120 key 0x01 down", "3240 key 0x01 up", "3360 key 0x2e up", "10000 quit")
FLASH = re.compile(r"\[\s*(\d+)\] at 0x40013784 .*?\[sp 0x[0-9a-f]+: (0x[0-9a-f]+) (0x[0-9a-f]+) (0x[0-9a-f]+)")


def skip(why):
    print("[SKIP] bar-led: " + why)
    sys.exit(0)


def flashes(log):
    """(master step at the flash, LED id, count, playing pattern) for every beat flash, in order."""
    events = [(int(i), 0, int(v, 16)) for v, i in STEP_WRITE.findall(log)]
    events += [(int(i), 2, int(v, 16)) for v, i in PATTERN_WRITE.findall(log)]
    events += [(int(i), 1, (int(led, 16), int(n, 16))) for i, ret, led, n in FLASH.findall(log) if int(ret, 16) == RETURN]
    step, pattern, out = None, 0, []
    for _, kind, value in sorted(events):
        if kind == 0:
            step = value
        elif kind == 2:
            pattern = value
        else:
            out.append((step,) + value + (pattern,))
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
        pause = "0x800065b8=0;0x800065b9=0;0x800065ba=0;0x800065bb=%d"
        for length, paused in ((12, False), (16, False), (20, False), (16, True)):
            steps = [x for f, v in ((7003, 2), (10003, 1), (13003, 2), (16003, 1)) for x in ("--step", "%d:poke:%s" % (f, pause % v))] if paused else []
            log = subprocess.run([str(EMU), "--image", str(IMAGE),
                                  "--preload", "%#x=%s;%#x=%s" % (CAVE, tmp / "u.bin", SITE, tmp / "jsr.bin"),
                                  "--card", CARD, "--set", SET, "--project", PROJECT, "--load-ms", "20000",
                                  "--sequencer", "--internal-clock", "--frames", "20000",
                                  "--step", "-:poke:%#x=%d" % (PATTERN_LENGTH, length), *steps,
                                  "--watch-mem", "0x800065b4,2", "--watch-pc", "0x40013784"],
                                 capture_output=True, text=True, timeout=600).stdout
            seen = flashes(log)
            if paused:
                wrong = [f for i, f in enumerate(seen) if f[1:3] != ((39 if i == 0 or f[0] < seen[i - 1][0] else 38), 3)]
            else:
                wrong = [f for f in seen if f[1:3] != ((39 if f[0] == 0 else 38), 3)]
            greens = sum(1 for f in seen if f[1] == 39)
            name = "%d steps%s" % (length, ", paused twice" if paused else "")
            text = " ".join(("G" if led == 39 else "r") + "@%s" % step for step, led, _, _ in seen)
            if wrong or greens < 3:
                print("[FAIL] bar-led: %s: %s" % (name, text))
                failed = True
            else:
                print("[PASS] bar-led: %s: %s" % (name, text))
        (tmp / "change.txt").write_text("\n".join(CHANGE) + "\n")
        log = subprocess.run([str(EMU), "--image", str(IMAGE),
                              "--preload", "%#x=%s;%#x=%s" % (CAVE, tmp / "u.bin", SITE, tmp / "jsr.bin"),
                              "--card", CARD, "--set", SET, "--project", PROJECT, "--load-ms", "20000",
                              "--live-script", str(tmp / "change.txt"),
                              "--watch-mem", "0x800065b4,11", "--watch-pc", "0x40013784"],     # the step word to the pattern byte
                             capture_output=True, text=True, timeout=600).stdout
        seen = flashes(log)
        wrong = [f for f in seen if f[1:3] != ((39 if f[0] == 0 else 38), 3)]
        before = [f[0] for f in seen if f[3] == 0 and f[0] is not None]
        after = [f for f in seen if f[3] == 1]
        ok = (not wrong and max(before, default=0) == 12 and sum(1 for f in after if f[1] == 39) >= 2
              and max((f[0] for f in after), default=99) == 8)
        text = " ".join(("G" if led == 39 else "r") + "@%s%s" % (step, "" if p == 0 else "(A02)") for step, led, _, p in seen)
        print("[%s] bar-led: A01 16 steps, then A02 12 steps cued while playing: %s" % ("PASS" if ok else "FAIL", text))
        failed |= not ok
    sys.exit(1 if failed else 0)


main()
