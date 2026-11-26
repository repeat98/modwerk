#!/usr/bin/env python3
"""Expand remix.inc into sdk/drafts/cx-osc/standalone/*.s for USB package builds."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
UP = ROOT / "upstream/cxosc"
OUT = ROOT / "standalone"

PASS1 = """
| Modwerk standalone remix.inc (pass 1)
.set CX_PASS1, 1
.set HAVE_EF_CX, 0
.set HK_MACHINE_ROWS, 0
.set HAVE_SYDRUM, 0
"""


def main() -> None:
    OUT.mkdir(exist_ok=True)
    machine_pre = PASS1 + (UP / "engine_abi.inc").read_text() + (UP / "machine_limits.inc").read_text()
    ms = (UP / "machine.s").read_text().replace('.include "remix.inc"', machine_pre, 1)
    (OUT / "machine.s").write_text(ms)

    morph = (UP / "lfo_morph.inc.s").read_text()
    ps = (UP / "poly.s").read_text()
    idx = ps.index('.include "remix.inc"')
    ps = ps[:idx] + PASS1 + ps[idx + len('.include "remix.inc"') :]
    idx2 = ps.index('.include "remix.inc"')
    ps = ps[:idx2] + morph + ps[idx2 + len('.include "remix.inc"') :]
    (OUT / "poly.s").write_text(ps)
    print(f"wrote {OUT}/machine.s and poly.s")


if __name__ == "__main__":
    main()