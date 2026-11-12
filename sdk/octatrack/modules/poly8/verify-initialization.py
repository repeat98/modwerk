#!/usr/bin/env python3
"""Reject POLY8 state in NOBITS: its platform loader never clears BSS.

The emulator zero-fills RAM at construction. This compiled-section gate
must fail even when an ordinary native boot happens to pass.
"""
import argparse
from pathlib import Path
import re
import subprocess
import tempfile


def verify(folder):
    checked = []
    with tempfile.TemporaryDirectory(prefix="poly8-initialization-") as work:
        for name in ("polyphony.s", "registration.s", "shared-machine.s"):
            obj = Path(work) / (name + ".o")
            subprocess.run(["m68k-elf-as", "-mcpu=54455", "-o", str(obj),
                            str(folder / name)], check=True, capture_output=True)
            sections = subprocess.check_output(["m68k-elf-readelf", "-SW", str(obj)], text=True)
            for line in sections.splitlines():
                row = re.match(r"^\s*\[\s*\d+\]\s+(\S+)\s+(NOBITS|PROGBITS)\s+[0-9a-fA-F]+\s+[0-9a-fA-F]+\s+([0-9a-fA-F]+)\s+\S+\s+(\S+)", line)
                if row and row[2] == "NOBITS" and "A" in row[4]:
                    assert int(row[3], 16) == 0, (name + ": " + row[1] + " allocates " +
                        str(int(row[3], 16)) + " bytes outside the loaded image; " +
                        "POLY8 startup state must not depend on zero-filled SDRAM")
            assert re.search(r"\]\s+\.text\s+PROGBITS", sections), name + ": missing runtime code"
            checked.append(name)
    return checked


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-directory", type=Path, default=Path(__file__).parent)
    args = parser.parse_args()
    print("PASS: all POLY8 runtime state is in loaded sections: " +
          ", ".join(verify(args.source_directory.resolve())))
