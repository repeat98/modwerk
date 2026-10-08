"""DSP data words: who owns them, and which ones the port saw written.

`owners(selected)` lists every claim on DSP data memory in a selection --
each module's declared ranges (schema.Claims.dsp_ranges), its FX2 buffer
region and core-private Y words, the bus scratch and stock's per-frame
staging -- resolved to a domain: "shared" for the window both cores see
(Y:0x30000-0x3FFFF, where X, Y and P alias), "<payload>:<space>" below it.
ledger.check compares them.

`violations(census, selected)` holds a port census against the same
claims: every 256-word region of the shared window that a core wrote
must meet a range that core is allowed to write. The census is the port's
`--dsp-writes` file (tools/emu/ot_emu: per frame command, per core, per
space, the NON-ZERO writes into each 256-word region), which verify_set
records on every run. Its limits: a zero written over zero is not seen, so
a warm-up clear shows only through the words it later fills; a region is
accepted when any allowed range meets it, so a stray write inside an
accepted region is not seen; below the shared window the census cannot
tell one module's writes from stock's or another module's on the same
core, so only the shared window is held to the claims.

    python3 tools/remix/dsp_ranges.py census <file>     # the runs each core wrote
"""

from __future__ import annotations

import pathlib
import re
import sys
from dataclasses import dataclass

if __package__ in (None, ""):
    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from remix.schema import HALF_BASE, SHARED_WINDOW, BusRole  # noqa: E402

BUS_SCRATCH = (0x36000, 0x36200)        # the send bus's accumulators and mailboxes, both cores
# Payload A's per-frame parameter staging (CHIP.md section 3). Payload B
# reads X:0x30000-0x30045 and writes X:0x30044 (P:0x8f-0x133).
STOCK_STAGING = (0x30000, 0x30048)
# Modwerk retains the approved stock mailbox; relocating it would change images.
STOCK_MAILBOX = (0x38000, 0x38010)
FX2_REGION = (0x4000, 0xC000)
REGION = 0x100                          # the census granularity, in words
CORE_PAYLOAD = {0: "A", 1: "B"}


@dataclass(frozen=True)
class Owned:
    owner: str
    what: str
    domain: str
    start: int
    end: int
    declared: bool = False      # a Claims.dsp_ranges entry (the others are derived)
    bus_shared: bool = False    # the bus scratch, shared by every bus participant
    bus_member: bool = False    # the owner takes part in the bus


def payloads(m) -> frozenset[str]:
    p = getattr(getattr(m, "dsp", None), "payloads", None)
    return frozenset(p) if p else frozenset({"A", "B"})


def bus_member(m) -> bool:
    h = getattr(m, "harness", None)
    return bool((m.dsp is not None and m.dsp.bus_role is not BusRole.NONE)
                or (h is not None and (h.bus_client or h.is_server)))


def owners(selected) -> list[Owned]:
    from remix import ledger
    out: list[Owned] = []
    for m in selected:
        member = bus_member(m)
        claims = getattr(m, "claims", None)
        seen = set()
        for r in (claims.dsp_ranges if claims is not None else ()):
            for p in sorted(payloads(m)):
                dom, start, end = r.resolve(p)
                if (dom, start, end) in seen:
                    continue
                seen.add((dom, start, end))
                out.append(Owned(m.name, r.what, dom, start, end, declared=True, bus_member=member))
        if claims is not None and claims.owns_fx2_buffers:
            for p in sorted(payloads(m)):
                out.append(Owned(m.name, "FX2 buffer region", f"{p}:y", *FX2_REGION, bus_member=member))
        words = ledger.private_y(m)
        for p in sorted(payloads(m)) if words else ():
            for w in sorted(words):
                out.append(Owned(m.name, f"core-private y:$0{w:03x}", f"{p}:y", w, w + 1,
                                 bus_member=member))
    members = [m.name for m in selected if bus_member(m)]
    if members:
        out.append(Owned("the bus", f"scratch ({', '.join(members)})", "shared", *BUS_SCRATCH,
                         bus_shared=True))
    out.append(Owned("stock", "per-frame parameter staging", "shared", *STOCK_STAGING))
    out.append(Owned("stock", "core 1 -> core 0 mailbox", "shared", *STOCK_MAILBOX))
    return out


def allowed(selected) -> dict[int, list[tuple[int, int, str]]]:
    """Per core, the (start, end, whose) shared-window ranges it may write."""
    out: dict[int, list[tuple[int, int, str]]] = {0: [], 1: []}
    for core in out:
        out[core].append((*STOCK_STAGING, "stock staging"))
    out[1].append((*STOCK_MAILBOX, "stock mailbox"))
    if any(bus_member(m) for m in selected):
        for core in out:
            out[core].append((*BUS_SCRATCH, "bus scratch"))
    for m in selected:
        claims = getattr(m, "claims", None)
        if claims is None:
            continue
        for core, p in CORE_PAYLOAD.items():
            if p not in payloads(m):
                continue
            for r in claims.dsp_ranges:
                dom, start, end = r.resolve(p)
                if dom == "shared":
                    out[core].append((start, end, f"{m.name}'s {r.what}"))
            if claims.stock_instance_buffer and not claims.fx1_only:
                # the allocator's FX2 slots for bank tracks 3-4 are in this core's half
                half = HALF_BASE[p]
                out[core].append((half, half + 0x8000, f"{m.name}'s allocator buffer"))
    return out


_CELL = re.compile(r"\b([01])([XY])([0-9a-f]{5}):(\d+)")


def parse_census(text: str) -> dict[tuple[int, str, int], int]:
    """{(core, space, region start): non-zero writes} summed over every frame."""
    total: dict[tuple[int, str, int], int] = {}
    for core, space, region, n in _CELL.findall(text):
        k = (int(core), space.lower(), int(region, 16))
        total[k] = total.get(k, 0) + int(n)
    return total


def runs(census, core: int, space: str, lo: int = 0, hi: int = SHARED_WINDOW[1]) -> list[tuple[int, int]]:
    """Contiguous written regions as (start, end) for one core and space."""
    out: list[tuple[int, int]] = []
    for r in range(lo, hi, REGION):
        if census.get((core, space, r)):
            if out and out[-1][1] == r:
                out[-1] = (out[-1][0], r + REGION)
            else:
                out.append((r, r + REGION))
    return out


def violations(census, selected) -> list[str]:
    """Shared-window regions a core wrote that no range it may write meets."""
    ok = allowed(selected)
    bad = []
    lo, hi = SHARED_WINDOW
    for core in (0, 1):
        for space in ("x", "y"):
            stray = {r: census[(core, space, r)] for start, end in runs(census, core, space, lo, hi)
                     for r in range(start, end, REGION)
                     if not any(a < r + REGION and r < b for a, b, _w in ok[core])}
            for start, end in runs({(core, space, r): n for r, n in stray.items()}, core, space, lo, hi):
                n = sum(stray[r] for r in range(start, end, REGION))
                bad.append(f"core {core} ({CORE_PAYLOAD[core]}) wrote {space.upper()}:0x{start:05x}-"
                           f"0x{end - 1:05x} ({n} non-zero writes), which no range it may write meets")
    return bad


def main(argv):
    if len(argv) != 3 or argv[1] != "census":
        sys.exit(__doc__)
    census = parse_census(pathlib.Path(argv[2]).read_text())
    for core in (0, 1):
        for space in ("x", "y"):
            spans = ", ".join(f"0x{a:05x}-0x{b - 1:05x}" for a, b in runs(census, core, space))
            print(f"core {core} ({CORE_PAYLOAD[core]}) {space.upper()}: {spans or 'none'}")


if __name__ == "__main__":
    main(sys.argv)
