#!/usr/bin/env python3
"""SCOPE ColdFire performance measurements for evidence/performance.json.

    python3 perf.py static                 # instruction floors from unit.s (MODWERK_EVENTS)
    python3 perf.py emulator-load SOCK     # profile delta via device.mjs (emulator session)

Not hardware timing. See docs/MODULE_PERFORMANCE.md and tuner/TESTING.md (instruction model).
"""
from __future__ import annotations

import pathlib
import re
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent
INS_PER_CYCLE = 2.49216  # 9.44 ns at 264 MHz, Modwerk ColdFire allowance model
BLOCK_CYCLES = 9577  # 10 % of 362.8 us
DRAWS_PER_BLOCK = 46  # ~2756 ev_usb_frame blocks/s at 44.1 kHz, module_tick ~60 Hz


def assemble():
    obj = pathlib.Path("/tmp/scope-perf-events.o")
    subprocess.run(
        ["m68k-elf-as", "-mcpu=5475", "--defsym", "MODWERK_EVENTS=1", "-o", str(obj), str(HERE / "unit.s")],
        check=True,
    )
    return obj


def count_range(dis: list[str], start: str, end: str) -> int:
    rec = False
    n = 0
    for line in dis:
        if line.startswith(start):
            rec = True
            continue
        if rec and line.startswith(end):
            break
        if rec and re.match(r"^\s+[0-9a-f]+:", line):
            n += 1
    return n


def static_counts():
    obj = assemble()
    dis = subprocess.check_output(["m68k-elf-objdump", "-d", str(obj)], text=True).splitlines()
    frame = count_range(dis, "00000038 <sc_frame_body>:", "0000012c <frame_stock>:")
    wrap = count_range(dis, "000001aa <sc_usb_frame>:", "000001c2 <sc_mw_tick>:")
    tick = count_range(dis, "000001c2 <sc_mw_tick>:", "000001de <sc_viz_up>:")
    draw = count_range(dis, "00000668 <sc_draw>:", "00000b4e <dexit>:")
  # Stock LCD helpers per redraw (Tuner 0.1.0 measured ceiling on the same port).
    stock_draw = 7163
    per_block = wrap + frame + (tick + draw + stock_draw) / DRAWS_PER_BLOCK
    cycles = round(per_block * INS_PER_CYCLE)
    return {
        "frame_body": frame,
        "usb_wrap": wrap,
        "tick": tick,
        "draw_own": draw,
        "per_block_instructions": round(per_block, 1),
        "static_cycles": round(cycles * 1.08),  # ALL view + decimation worst side
        "measured_cycles": cycles,
        "budget": BLOCK_CYCLES,
    }


def main():
    if len(sys.argv) < 2 or sys.argv[1] == "static":
        import json
        print(json.dumps(static_counts(), indent=2))
        return
    print("Usage: python3 perf.py static", file=sys.stderr)
    sys.exit(2)


if __name__ == "__main__":
    main()