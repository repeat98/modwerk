"""Host checks of the SEQ port: no firmware, unit or emulator.

seq.s assembles for the chip with nothing left undefined, defines every
symbol runtime.json and manifest.py name, and lays out the seq.work payload
exactly as the pinned octabam source does, so a seq.work moves between the
two unchanged.
"""

import hashlib
import json
import re
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
AS = shutil.which("m68k-elf-as")
NM = shutil.which("m68k-elf-nm")
UPSTREAM_SHA256 = "625f0fdad291b3f80052b9c776f31773b12ca9f8ff304780b6532b8a7b120b63"
PAYLOAD = ("ef_bank", "ef_dep_mem", "ef_plk_mem", "ef_lane_mem", "ef_midi_bank", "ef_midi_dep_mem",
           "ef_midi_plk_mem", "ef_midi_lane_mem", "ef_tone_mem", "ef_p2_dep_mem", "ef_p2_plk_mem", "ef_dirty")


def assemble(source, tmp, prelude=""):
    src = Path(tmp) / "unit.s"
    src.write_text(prelude + source.read_text())
    obj = Path(tmp) / "unit.o"
    subprocess.run([AS, "-mcpu=54455", "--defsym", "MODWERK_EVENTS=1", "-I", tmp, str(src), "-o", str(obj)],
                   check=True, capture_output=True, text=True)
    out = subprocess.run([NM, str(obj)], check=True, capture_output=True, text=True).stdout
    symbols, undefined = {}, set()
    for line in out.splitlines():
        parts = line.split()
        if len(parts) == 2 and parts[0] == "U":
            undefined.add(parts[1])
        elif len(parts) == 3:
            symbols[parts[2]] = (int(parts[0], 16), parts[1])
    return symbols, undefined


class SeqPort(unittest.TestCase):
    def test_upstream_is_the_pinned_source(self):
        self.assertEqual(hashlib.sha256((HERE / "upstream/seq.s").read_bytes()).hexdigest(), UPSTREAM_SHA256)

    def test_no_octabam_module_is_named(self):
        code = "\n".join(line.split("|")[0] for line in (HERE / "seq.s").read_text().splitlines())
        for pattern in (r"\bstore_\w+", r"\bplk_\w+", r"\bSTORE\b", r"remix\.inc", r"\bEF_CLIENT\b"):
            self.assertIsNone(re.search(pattern, code), pattern)

    @unittest.skipUnless(AS and NM, "m68k-elf binutils not installed")
    def test_assembles_and_defines_what_the_base_calls(self):
        with tempfile.TemporaryDirectory() as tmp:
            symbols, undefined = assemble(HERE / "seq.s", tmp)
        self.assertEqual(undefined, set())
        runtime = json.loads((HERE / "runtime.json").read_text())
        wanted = {entry["fn"] for entry in runtime["subscribe"]}
        wanted |= set(re.findall(r'"seq", "(\w+)"', (HERE / "manifest.py").read_text()))
        self.assertTrue(wanted)
        for name in sorted(wanted):
            self.assertIn(name, symbols, name)
            self.assertEqual(symbols[name][1], "T", name + " is not a global text symbol")

    @unittest.skipUnless(AS and NM, "m68k-elf binutils not installed")
    def test_seq_work_layout_matches_octabam(self):
        inc = ".set EF_CLIENT, 1\n.set FX2_TBL, 0x400d5fdc\n.set FX2_ID_MAX, 31\n"
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / "remix.inc").write_text(inc)
            ours, _ = assemble(HERE / "seq.s", tmp)
            theirs, _ = assemble(HERE / "upstream/seq.s", tmp)
        base_ours, base_theirs = ours["ef_bank"][0], theirs["ef_bank"][0]
        for name in PAYLOAD:
            self.assertEqual(ours[name][0] - base_ours, theirs[name][0] - base_theirs, name)


if __name__ == "__main__":
    unittest.main()
