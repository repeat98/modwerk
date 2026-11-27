#!/usr/bin/env python3
"""Print stock_guard() lines for SEQ POS sites from a local 1.40C MAIN OS.

Usage:
  python3 fill_guards.py --os /path/to/section_3_MAIN_OS.bin

Never commits firmware. Paste the printed lines into manifest.py, then run
the native build and module:verify on your machine.
"""

from __future__ import annotations

import argparse
import hashlib
import sys
from pathlib import Path

OS_SHA256 = "164f31224bf61181e3f50e7dec40df9afcae5b16dbf6e4c0d0cc5e986af0a84e"
BASE = 0x40000400

# (name, address, length, note)
# Count / formatter / beq are base-owned after #21/#23 — not in this package.
SITES = (
    ("sp_dest_audio lea (USB keeps; base owns after MOP-39)", 0x4000D042, 4, "audio LFO destination lea → sp_dest_audio"),
    ("sp_audio_step load", 0x400A2D6A, 6, "tick audio step load → sp_audio_step (playmodes pm_audio_step)"),
    ("PMTR count midi?", 0x400D4214, 4, "MIDI LFO PMTR count (confirm beside WAVE 0x400d4218)"),
)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--os", required=True, type=Path, help="section_3_MAIN_OS.bin")
    args = parser.parse_args()
    raw = args.os.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    if digest != OS_SHA256:
        print(f"refusing: OS sha256 {digest} is not original 1.40C ({OS_SHA256})", file=sys.stderr)
        return 1
    print("# Paste into manifest.py (Detour expect= / Poke expect=)")
    print("from remix.stock_guard import stock_guard")
    print()
    for name, addr, length, note in SITES:
        offset = addr - BASE
        if offset < 0 or offset + length > len(raw):
            print(f"# SKIP {name}: outside image")
            continue
        span = raw[offset : offset + length]
        sha = hashlib.sha256(span).hexdigest()
        value = int.from_bytes(span, "big") if length <= 4 else None
        print(f"# {name}: {note}")
        print(f"# bytes {span.hex()} " + (f"u32={value} " if value is not None else "") + f"@ {addr:#x}")
        print(f'stock_guard({addr:#x}, {length}, "{sha}")')
        print()
    print("# Also locate: PMTR formatter/label table (descriptor A[6] @ 0x400d38d8)")
    print("# and FUNC+TRACK+LEVEL / FUNC+TRACK+NO handlers; add their spans the same way.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
