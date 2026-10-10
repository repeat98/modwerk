"""Upstream tool checkouts against local throwaway repositories; no network or device."""
import importlib.util
import json
import pathlib
import shutil
import subprocess
import tempfile
import unittest

APP = pathlib.Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("upstream_tools", APP / "scripts/upstream-tools.py")
tools = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tools)
IMPORTED = APP / "sdk/octabam/tools/hw"


def git(root, *args):
    return subprocess.run(["git", "-C", str(root), "-c", "user.name=t", "-c", "user.email=t@example.invalid",
                           "-c", "commit.gpgsign=false", "-c", "core.autocrlf=false", *args], check=True, capture_output=True, text=True).stdout.strip()


class UpstreamCheckouts(unittest.TestCase):
    def setUp(self):
        self.temp = pathlib.Path(tempfile.mkdtemp())
        self.upstream = self.temp / "upstream"
        (self.upstream / "tools/hw").mkdir(parents=True)
        git(self.temp, "init", "-q", "-b", "main", str(self.upstream))
        for name in tools.adapter.TOOLS:
            shutil.copyfile(IMPORTED / name, self.upstream / "tools/hw" / name)
        (self.upstream / "tools/hw/usb_offset.py").write_text("# upstream-only tool\n")
        self.first = self.commit("first")
        self.url = self.upstream.as_uri()
        self.base = self.temp / "checkouts"
        self.base.mkdir()
        self.pins = self.temp / "pins.json"
        self.pins.write_text(json.dumps({"octabam": {"repository": self.url, "commit": self.first, "updated": "x"}}))

    def tearDown(self):
        shutil.rmtree(self.temp)

    def commit(self, message):
        git(self.upstream, "add", "-A")
        git(self.upstream, "commit", "-q", "-m", message)
        return git(self.upstream, "rev-parse", "HEAD")

    def sync(self, commit=None):
        return tools.sync("octabam", self.url, commit or self.first, self.base, True)

    def test_checkout_carries_exactly_the_reviewed_repairs_and_is_repeatable(self):
        path = self.sync()
        for _ in range(2):
            self.assertEqual(tools.git(path, "rev-parse", "HEAD"), self.first)
            self.assertEqual(tools.edits(path), set(tools.REPAIRED))
            for name, spec in tools.adapter.TOOLS.items():
                self.assertEqual(tools.sha((path / "tools/hw" / name).read_bytes()), spec["output"])
            self.assertTrue((path / "tools/hw/usb_offset.py").exists())
            path = self.sync()

    def test_own_edits_are_refused_and_kept(self):
        path = self.sync()
        for item, text in (("tools/hw/usb_offset.py", "# mine\n"), ("tools/hw/rec.swift", "// mine\n")):
            original = (path / item).read_bytes()
            (path / item).write_text(text)
            with self.assertRaisesRegex(ValueError, "local edits"):
                self.sync()
            self.assertEqual((path / item).read_text(), text)
            (path / item).write_bytes(original)
        self.sync()

    def test_update_moves_to_main_and_reapplies_repairs(self):
        self.sync()
        (self.upstream / "tools/hw/sos_capture.py").write_text("# new upstream tool\n")
        second = self.commit("second")
        self.assertEqual(tools.update_octabam(self.pins, self.base, "2026-10-10"), (second, True))
        pins = json.loads(self.pins.read_text())["octabam"]
        self.assertEqual((pins["commit"], pins["updated"]), (second, "2026-10-10"))
        path = self.sync(second)
        self.assertTrue((path / "tools/hw/sos_capture.py").exists())
        self.assertEqual(tools.edits(path), set(tools.REPAIRED))
        self.assertEqual(tools.update_octabam(self.pins, self.base), (second, False))

    def test_update_refuses_when_a_repaired_tool_changed_upstream(self):
        self.sync()
        with open(self.upstream / "tools/hw/usb_probe.py", "a") as tool:
            tool.write("# changed upstream\n")
        self.commit("changed probe")
        before = self.pins.read_text()
        with self.assertRaisesRegex(ValueError, "review its repairs"):
            tools.update_octabam(self.pins, self.base)
        self.assertEqual(self.pins.read_text(), before)
        self.assertEqual(tools.git(self.base / "octabam", "rev-parse", "HEAD"), self.first)

    def test_checkouts_stay_outside_git_and_on_their_own_remote(self):
        with self.assertRaisesRegex(ValueError, "outside every Git"):
            tools.outside_git(APP / "never-created/upstream")
        self.assertFalse((APP / "never-created").exists())
        self.sync()
        with self.assertRaisesRegex(ValueError, "does not track"):
            tools.sync("octabam", self.url + "-other", self.first, self.base, True)
        # A plain upstream (Elekloader) may carry no edits at all.
        path = tools.sync("plain", self.url, self.first, self.base, False)
        self.assertEqual(tools.edits(path), set())
        (path / "tools/hw/rec.swift").write_text("// mine\n")
        with self.assertRaisesRegex(ValueError, "local edits"):
            tools.sync("plain", self.url, self.first, self.base, False)


if __name__ == "__main__":
    unittest.main()
