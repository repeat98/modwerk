"""Host checks of the CX OSC port: no firmware or unit required."""

import hashlib
import json
import re
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent


def repo_root():
    path = HERE
    while path != path.parent:
        if (path / "package.json").is_file() and (path / "sdk/imports").is_dir():
            return path
        path = path.parent
    raise RuntimeError("modwerk repo root not found")


ROOT = repo_root()
AS = shutil.which("m68k-elf-as")
NM = shutil.which("m68k-elf-nm")
REG_FLAGS = 785  # PROTECT | SETUP_ALL | START | NATIVE_FLEX
IMPORT_JSON = ROOT / "sdk/imports/cx-osc-256bcf4.json"
RELATIONS = ROOT / "sdk/machines/octatrack/compatibility.json"


class CxOscPort(unittest.TestCase):
    def test_import_record_matches_upstream(self):
        self.assertTrue(IMPORT_JSON.is_file(), str(IMPORT_JSON))
        record = json.loads(IMPORT_JSON.read_text())
        self.assertEqual(record["module"], "cx-osc")
        for entry in record["files"]:
            rel = entry["destPath"].split("upstream/cxosc/", 1)[-1]
            got = hashlib.sha256((HERE / "upstream" / "cxosc" / rel).read_bytes()).hexdigest()
            self.assertEqual(got, entry["sha256"], rel)

    def test_runtime_contributes_machines(self):
        runtime = json.loads((HERE / "runtime.json").read_text())
        contributes = [c for c in runtime.get("contribute", []) if c.get("to") == "ot_machines"]
        self.assertEqual(len(contributes), 1)
        self.assertIn("cx_machine", contributes[0].get("data", ""))
        self.assertIn("fm_machine_name", contributes[0].get("replaces", []))

    def test_machine_registration_flags_setup_all(self):
        text = (HERE / "cx_registration.s").read_text()
        m = re.search(r"cx_machine:\s*\n(?:.*\n){3}\s*\.long\s+(\d+)", text)
        self.assertIsNotNone(m, "cx_machine flags word missing")
        self.assertEqual(int(m.group(1)), REG_FLAGS)

    def test_registration_symbols(self):
        text = (HERE / "cx_registration.s").read_text()
        for sym in ("cx_machine", "cx_machine_start", "cx_fmstart", "sy_render"):
            self.assertIn(sym, text)
        page = (HERE / "upstream/cxosc/page.s").read_text()
        self.assertIn("fm_track_page", page)
        self.assertIn("cx_ui_tick", page)

    def test_compat_relation_covers_synth_overlap(self):
        doc = json.loads(RELATIONS.read_text())
        rel = next(r for r in doc["relations"] if set(r["modules"]) == {"synth", "cx-osc"})
        self.assertEqual(rel["kind"], "group-owned")
        self.assertGreaterEqual(len(rel["sites"]), 20)

    def test_octamod_conflicts_synth(self):
        meta = json.loads((HERE / "octamod.module.json").read_text())
        self.assertIn("synth", meta["compatibility"]["conflicts"])

    def test_package_builds(self):
        if not (ROOT / "node_modules").is_dir():
            self.skipTest("npm install not run in this worktree")
        # module:doctor copies drafts into sdk/octatrack/modules; module:dev refuses when both exist.
        parts = HERE.parts
        if "octatrack" in parts and "modules" in parts and "drafts" not in parts:
            self.skipTest("staged listed copy (module:doctor); run from sdk/drafts")
        out = subprocess.run(
            ["npm", "run", "-s", "module:dev", "--", "cx-osc", "--build-only"],
            cwd=ROOT, capture_output=True, text=True, check=True,
        )
        self.assertIn("Built", out.stdout + out.stderr)

    @unittest.skipUnless(AS and NM, "m68k-elf binutils not installed")
    def test_cx_registration_assembles(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "cx_registration.s"
            src.write_text((HERE / "cx_registration.s").read_text())
            obj = Path(tmp) / "reg.o"
            subprocess.run([AS, "-mcpu=54455", "-o", str(obj), str(src)], check=True, capture_output=True, text=True)
            nm = subprocess.run([NM, str(obj)], check=True, capture_output=True, text=True).stdout
            for sym in ("cx_machine", "cx_fmstart", "cx_take_midi_note_on"):
                self.assertIn(sym, nm, sym)


if __name__ == "__main__":
    unittest.main()