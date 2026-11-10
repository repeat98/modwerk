"""Read-only draft import/evidence checks; never execute module manifests."""
import ast
import hashlib
import json
from pathlib import Path
import re
import unittest

APP = Path(__file__).resolve().parents[2]
ID = "recorder-loop-fix"
RECORD = json.loads((APP / ("sdk/imports/" + ID + "-6f9e5bc.json")).read_text())
DRAFT = APP / RECORD["root"]


class ImportedDraft(unittest.TestCase):
    def test_exact_imports_and_stock_guard_hygiene(self):
        paths = [entry["path"] for entry in RECORD["files"]]
        self.assertEqual(len(paths), len(set(paths)))
        for entry in RECORD["files"]:
            data = (DRAFT / entry["path"]).read_bytes()
            digest = hashlib.sha256(data).hexdigest()
            self.assertEqual(digest, entry["vendoredSha256"], entry["path"])
            self.assertRegex(entry["revision"], r"^[a-f0-9]{40}$")
            if digest == entry["sourceSha256"]:
                self.assertEqual(len(data), entry["sourceBytes"])
                self.assertEqual(hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest(), entry["sourceGitBlob"])
            else:
                self.assertEqual(entry["path"], "manifest.py")
        tree = ast.parse((DRAFT / "manifest.py").read_text())
        guards = [n for n in ast.walk(tree) if isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id == "stock_guard"]
        self.assertEqual(len(guards), 8)
        for guard in guards:
            self.assertEqual(len(guard.args), 3)
            self.assertGreater(ast.literal_eval(guard.args[1]), 0)
            self.assertRegex(ast.literal_eval(guard.args[2]), r"^[a-f0-9]{64}$")
        if ID == "recorder-loop-fix":
            caves = [n for n in ast.walk(tree) if isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id == "CavePatch"]
            self.assertEqual(len(caves), 8)
            for cave in caves:
                stock = next(k.value for k in cave.keywords if k.arg == "hook_stock")
                self.assertIsInstance(stock, ast.Call)
                self.assertEqual(stock.func.id, "stock_guard")
        else:
            tables = [n for n in ast.walk(tree) if isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id == "TableGrow"]
            self.assertEqual(len(tables), 3)
            for table in tables:
                self.assertEqual(ast.literal_eval(next(k.value for k in table.keywords if k.arg == "insert_at")), 2)

    def test_draft_snapshot_keeps_its_original_evidence_beside_the_live_release(self):
        self.assertEqual(RECORD["root"], "sdk/drafts/" + ID)
        live = APP / "sdk/octabam/modules" / ID
        self.assertTrue(live.is_dir())
        for path in ["sdk/catalog.json", "src/catalog/module-documents.json"]:
            entries = json.loads((APP / path).read_text())["modules"]
            self.assertIn(ID, {entry["id"] for entry in entries})
        baseline = json.loads((APP / "sdk/approvals/module-qualification-baseline.json").read_text())["modules"]
        self.assertNotIn(ID, {entry["id"] for entry in baseline})
        self.assertTrue(json.loads((live / "evidence/probes.json").read_text())["passed"])
        current = json.loads((live / "octamod.module.json").read_text())
        self.assertNotEqual(current.get("build", {}).get("status"), "pending")
        document = json.loads((DRAFT / "octamod.module.json").read_text())
        self.assertEqual(document["version"], RECORD["moduleVersion"])
        self.assertEqual(document["source"]["revision"], RECORD["revision"])
        self.assertEqual(document["build"]["status"], "pending")
        self.assertNotIn("qualification", document["tests"])
        performance = json.loads((DRAFT / "performance.json").read_text())
        self.assertFalse(performance["qualification"])
        self.assertIsNone(performance["comparison"]["longestFrameInterruptCycles"])
        probes = json.loads((DRAFT / "evidence/probes.json").read_text())
        reproduction = json.loads((DRAFT / "evidence/reproduction.json").read_text())
        self.assertTrue(probes["standardProbesPassed"])
        self.assertEqual(probes["passed"], reproduction["exitStatus"] == 0)
        if ID == "recorder-loop-fix":
            late = probes["lateArmComparison"]
            self.assertEqual((late["cases"], late["idealGapMismatches"]), (13279, 953))
            self.assertFalse(late["passed"])
            self.assertFalse(probes["passed"])
            self.assertEqual((late["rlen16Cases"], late["rlen16Mismatches"]), (1897, 0))
        else:
            self.assertTrue(probes["passed"])
        # Bind the pending template to the exact current native source inventory.
        hashes = {}
        for path in sorted(DRAFT.rglob("*")):
            relative = path.relative_to(DRAFT).as_posix()
            if path.is_file() and relative not in ("octamod.module.json", "qualification.example.json") and not relative.startswith("media/") and path.suffix.lower() != ".md" and not re.search(r"(^|/)(LICENSE|LICENCE|COPYING)(\.|$)", relative, re.I):
                hashes[relative] = hashlib.sha256(path.read_bytes()).hexdigest()
        fingerprint = hashlib.sha256(json.dumps(hashes, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()
        self.assertEqual(fingerprint, json.loads((DRAFT / "qualification.example.json").read_text())["sourceSha256"])
        capture = json.loads((DRAFT / "media/capture.json").read_text())
        self.assertEqual(fingerprint, capture["sourceSha256"])
        self.assertEqual(document["version"], capture["moduleVersion"])
        for entry in document["media"]:
            self.assertEqual(entry["otUi"]["imageSha256"], capture["imageSha256"])
            self.assertEqual(hashlib.sha256((DRAFT / entry["path"]).read_bytes()).hexdigest(), capture["screenshots"][Path(entry["path"]).name])
        for path in DRAFT.rglob("*"):
            self.assertFalse(path.is_symlink())
            self.assertNotIn(path.name, [".git", "__pycache__", "vendor", "out"])
            self.assertNotIn(path.suffix.lower(), [".bin", ".syx", ".o", ".elf", ".raw", ".private", ".so", ".dylib", ".zip", ".wav"])


if __name__ == "__main__":
    unittest.main()
