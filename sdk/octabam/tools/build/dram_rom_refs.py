# SPDX-License-Identifier: MIT
"""A DRAM unit's reference that no DRAM unit, payload, DRAM region or declared defsym defines resolves from the ROM
units' global symbols, as a ROM unit's references do in build_bus.py. The configurator follows the same rule
(src/engine/coldfire-runtime.ts: romReferences): a module's DRAM code can name a byte its own ROM unit owns.
A build that linked before this rule has no such reference, since ld refused it."""
import subprocess


def references(objects, nm="m68k-elf-nm"):
    """(wanted, defined) over the assembled DRAM objects: names they reference undefined (weak included), and the
    global and weak names they define."""
    wanted, defined = set(), set()
    for obj in objects:
        for row in (line.split() for line in subprocess.run([nm, str(obj)], check=True, capture_output=True, text=True).stdout.splitlines()):
            kind, name = (row[0], row[1]) if len(row) == 2 else (row[1], row[2]) if len(row) == 3 else (None, None)
            if kind in ("U", "w", "v"):
                wanted.add(name)
            elif kind is not None and (kind.isupper() or kind in ("W", "V")):
                defined.add(name)
    return wanted, defined


def rom_externals(objects, exports, taken, nm="m68k-elf-nm"):
    """{name: address} to add to the DRAM link's --defsym set: the ROM `exports` the `objects` reference and nothing
    else defines, less `taken` (declared defsyms, payload and region symbols, which keep their own values)."""
    wanted, defined = references(objects, nm)
    return {n: exports[n] for n in sorted(wanted - defined - set(taken)) if n in exports}
