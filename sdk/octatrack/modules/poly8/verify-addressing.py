#!/usr/bin/env python3
"""Assemble POLY8 without firmware and verify its local PC-relative addresses.

GNU as can silently wrap an out-of-range local PC16 displacement. Checking
its resolved instruction bytes catches writes into a neighbouring module,
even when the linker sees no remaining relocation to validate.

The render (polyphony_call up to poly_amp_hook, poly_note_increment and the
routines from poly_cached_call on) runs from the cached alias on a base whose
modules run uncached. There a PC-relative data operand would read POLY8's
state through the data cache, where another task's later write through the
uncached alias leaves a stale line. Every POLY8 symbol those lines name as
data must therefore be absolute (`SYM:l`); branches and calls may stay
relative.
"""
import argparse
from pathlib import Path
import re
import subprocess
import tempfile


def verify(source):
    with tempfile.TemporaryDirectory(prefix="poly8-addressing-") as work:
        obj = Path(work) / "polyphony.o"
        listing = Path(work) / "polyphony.lst"
        subprocess.run(["m68k-elf-as", "-mcpu=54455", "-al=" + str(listing),
                        "-o", str(obj), str(source)], check=True, capture_output=True)
        rows = subprocess.check_output(["m68k-elf-nm", obj], text=True).splitlines()
        symbols = {row[2]: int(row[0], 16) for line in rows
                   if len(row := line.split()) == 3 and row[1].lower() == "t"}
        checked = 0
        errors = []
        for line in listing.read_text().splitlines():
            if "(%pc)" not in line:
                continue
            row = re.match(r"^\s*(\d+)\s+([0-9a-fA-F]+)\s+([0-9A-F]{4})\s+([0-9A-F]{4})\s+\t(.*)$", line)
            assert row, "Unsupported PC-relative instruction listing: " + line
            number, address, opcode, displacement, text = row.groups()
            target = re.search(r"([A-Za-z_.][A-Za-z0-9_.]*)\(%pc\)", text)
            assert target and target[1] in symbols, "Unknown local PC-relative target: " + text
            # All current POLY8 forms have a single signed displacement word
            # immediately after the opcode. No index or full extension form.
            assert int(opcode, 16) & 0x3f == 0x3a, "Unsupported PC-relative encoding: " + line
            delta = int(displacement, 16)
            if delta & 0x8000:
                delta -= 0x10000
            actual = (int(address, 16) + 2 + delta) & 0xffffffff
            expected = symbols[target[1]]
            if actual != expected:
                errors.append(f"line {number}: {target[1]} resolves to 0x{actual:x}, expected 0x{expected:x}")
            checked += 1
        assert checked >= 50, "POLY8 address scan did not cover the runtime"
        assert not errors, "PC-relative address corruption: " + "; ".join(errors)
        return checked


CACHED = (("polyphony_call:", "poly_amp_hook:"), ("poly_note_increment:", "poly_semitone_q15:"),
          ("poly_cached_call:", None))


def cached_operands(source):
    """Lines of the cached render that name a POLY8 symbol as data without `:l`."""
    lines = Path(source).read_text().splitlines()
    bad = []
    for start, end in CACHED:
        a = next(i for i, line in enumerate(lines) if line.startswith(start))
        b = next((i for i, line in enumerate(lines) if end and line.startswith(end)), len(lines))
        for number in range(a, b):
            code = lines[number].split("|", 1)[0]
            if not code.strip() or code.lstrip().startswith((".", "bsr", "bra", "jsr", "jmp", "b")) \
                    or re.match(r"^\s*b[a-z]+(\.[swl])?\s", code):
                continue
            code = re.sub(r"#(?:poly|pm)_\w+|\((?:poly|pm)_\w+\)\.l", "", code)  # immediates, (SYM).l
            for name in re.findall(r"\b((?:poly|pm)_[A-Za-z0-9_]+)(?!:l|\w)", code):
                if not re.match(r"^\s*[A-Za-z0-9_.]+:", code) or name not in code.split(":", 1)[0]:
                    bad.append(f"line {number + 1}: {name} in {code.strip()}")
    return bad


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=Path(__file__).with_name("polyphony.s"))
    args = parser.parse_args()
    checked = verify(args.source.resolve())
    bad = cached_operands(args.source.resolve())
    assert not bad, "Cached render names POLY8 data without absolute addressing: " + "; ".join(bad)
    print(f"PASS: {checked} compiled local PC-relative addresses resolve to their declared storage/code; "
          "the cached render addresses POLY8 data absolutely")
