#!/usr/bin/env python3
"""Host proof that owner-compat-relation.json closes every synth+cx-osc clash when the draft is staged."""

import json
import shutil
import subprocess
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
ROOT = HERE
while ROOT != ROOT.parent:
    if (ROOT / "package.json").is_file() and (ROOT / "scripts/module-compat.py").is_file():
        break
    ROOT = ROOT.parent
else:
    raise RuntimeError("modwerk repo root not found")

RELATION = json.loads((HERE / "owner-compat-relation.json").read_text())["relations"][0]
COMPAT = ROOT / "sdk/machines/octatrack/compatibility.json"


def stage_draft(root: Path) -> Path:
    listing = root / "sdk/octatrack/modules/cx-osc"
    if listing.exists():
        shutil.rmtree(listing)
    shutil.copytree(HERE, listing)
    subprocess.run(
        [
            "node",
            "-e",
            "import('./scripts/mirror-octatrack-modules.mjs').then(m=>m.mirrorOctatrackModules(process.cwd()))",
        ],
        cwd=root,
        check=True,
        capture_output=True,
        text=True,
    )
    return listing


def compat_report(root: Path, relations: list) -> dict:
    doc = json.loads(COMPAT.read_text())
    doc["relations"] = relations
    backup = root / "sdk/machines/octatrack/.compat-backup.json"
    shutil.copy2(COMPAT, backup)
    try:
        COMPAT.write_text(json.dumps(doc, indent=2) + "\n")
        out = subprocess.run(
            ["python3", "-B", "scripts/module-compat.py", "--json", "--with", "cx-osc"],
            cwd=root,
            capture_output=True,
            text=True,
            check=False,
        )
        raw = out.stdout.strip()
        if not raw:
            raise RuntimeError(out.stderr or "modules:compat returned no JSON")
        return json.loads(raw)
    finally:
        shutil.copy2(backup, COMPAT)
        backup.unlink(missing_ok=True)


class VerifyCompatRelation(unittest.TestCase):
    def test_group_owned_closes_synth_cx_clashes(self):
        stage = stage_draft(ROOT)
        self.addCleanup(lambda: shutil.rmtree(stage, ignore_errors=True))
        self.addCleanup(lambda: shutil.rmtree(ROOT / "sdk/octabam/modules/cx-osc", ignore_errors=True))
        without = compat_report(ROOT, [])
        synth = [p for p in without["problems"] if "synth" in p["modules"] and "cx-osc" in p["modules"]]
        self.assertGreaterEqual(len(synth), 1, "expected synth+cx-osc detour overlaps before relation")
        with_rel = compat_report(ROOT, [RELATION])
        left = [p for p in with_rel["problems"] if "cx-osc" in p["modules"]]
        self.assertEqual(left, [], left[:3] if left else left)


if __name__ == "__main__":
    unittest.main()