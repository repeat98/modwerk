#!/usr/bin/env python3
"""Print stock_guard() lines for TEMPO LFO reference sites from a local 1.40C MAIN OS.

Usage:
  python3 fill_guards.py --os /path/to/section_3_MAIN_OS.bin

Never commits firmware. TEMPO tip packages do not Detour these sites —
base owns lea/store; this script only documents hashes for local verify.
"""
from __future__ import annotations

import argparse
import hashlib
import sys
from pathlib import Path

OS_SHA256 = "164f31224bf61181e3f50e7dec40df9afcae5b16dbf6e4c0d0cc5e986af0a84e"
BASE = 0x40000400

SITES = (
    ("dest lea+cmpi (base-owned; do not Detour)", 0x4000D042, 8, "audio LFO destination lea — base mw_lfo_pmtr_dest"),
    ("store span (base-owned; do not Detour)", 0x4000D07A, 6, "stock store — base mw_lfo_pmtr_store + contribute after_store → tm_on_store"),
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
    print("# Reference hashes only — TEMPO tip does not claim these sites")
    print("from remix.stock_guard import stock_guard")
    print()
    for name, addr, length, note in SITES:
        offset = addr - BASE
        if offset < 0 or offset + length > len(raw):
            print(f"# SKIP {name}: outside image")
            continue
        span = raw[offset : offset + length]
        sha = hashlib.sha256(span).hexdigest()
        print(f"# {name}: {note}")
        print(f"# bytes {span.hex()} @ {addr:#x}")
        print(f'stock_guard({addr:#x}, {length}, "{sha}")')
        print()
    print("# Coordinated map: 30 PROB … 38 TSTR, 39 TEMPO. Catalog SHUT.")
    print("# Do not private-detour 0x4000d07a — contribute after_store (MOP-71/204).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
