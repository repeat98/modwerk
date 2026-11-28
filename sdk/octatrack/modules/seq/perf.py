#!/usr/bin/env python3
"""SEQ ColdFire static bounds for evidence/performance.json (instruction model only)."""
from __future__ import annotations

import pathlib
import re
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent
INS_PER_CYCLE = 2.49216
BUDGET = 26_600_000


def assemble():
    obj = pathlib.Path("/tmp/seq-perf-events.o")
    subprocess.run(
        ["m68k-elf-as", "-mcpu=5475", "--defsym", "MODWERK_EVENTS=1", "-o", str(obj), str(HERE / "seq.s")],
        check=True,
    )
    return obj


def count_range(dis: list[str], start: str, end: str) -> int:
    rec = False
    n = 0
    for line in dis:
        if f"<{start}>" in line and line.strip().endswith(f"<{start}>:"):
            rec = True
            continue
        if rec and f"<{end}>" in line and line.strip().endswith(f"<{end}>:"):
            break
        if rec and re.match(r"^\s+[0-9a-f]+:", line):
            n += 1
    return n


def static_counts():
    obj = assemble()
    dis = subprocess.check_output(["m68k-elf-objdump", "-d", str(obj)], text=True).splitlines()
    yes = count_range(dis, "ef_yes", "ef_no")
    draw = count_range(dis, "ef_draw", "ef_fill")
    # YES writes the pattern then redraws.
    measured = round((yes + draw) * INS_PER_CYCLE)
    return {
        "yes_instructions": yes,
        "draw_instructions": draw,
        "measured_cycles": measured,
        "budget": BUDGET,
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