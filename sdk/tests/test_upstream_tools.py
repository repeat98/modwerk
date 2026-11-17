"""Upstream tool checkouts against local throwaway repositories; no network or device."""
import importlib.util
import json
import pathlib
import shutil
import stat
import subprocess
import tempfile
import unittest
from unittest import mock
import zipfile

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
        def remove_readonly(function, path, error):
            # Git pack files carry the read-only attribute on Windows.
            if not isinstance(error[1], PermissionError):
                raise error[1]
            pathlib.Path(path).chmod(stat.S_IWRITE)
            function(path)
        shutil.rmtree(self.temp, onerror=remove_readonly)

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

    def test_update_moves_a_plain_pin_and_keeps_it_unedited(self):
        self.pins.write_text(json.dumps({"rytm-emu": {"repository": self.url, "commit": self.first, "updated": "x"}}))
        tools.sync("rytm-emu", self.url, self.first, self.base, False)
        (self.upstream / "src.rs").write_text("// upstream fix\n")
        second = self.commit("fix")
        self.assertEqual(tools.update_plain(self.pins, "rytm-emu", self.base, "2026-11-02"), (second, True))
        pins = json.loads(self.pins.read_text())["rytm-emu"]
        self.assertEqual((pins["commit"], pins["updated"]), (second, "2026-11-02"))
        path = tools.sync("rytm-emu", self.url, second, self.base, False)
        self.assertEqual(tools.edits(path), set())
        self.assertTrue((path / "src.rs").exists())
        self.assertEqual(tools.update_plain(self.pins, "rytm-emu", self.base), (second, False))

    def test_the_rytm_emu_pin_is_a_full_commit_of_its_repository(self):
        pin = json.loads(tools.PINS.read_text())["rytm-emu"]
        self.assertEqual(pin["repository"], "https://github.com/trigcondition/rytm-emu.git")
        self.assertRegex(pin["commit"], "^[0-9a-f]{40}$")

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


class ArchivePin(unittest.TestCase):
    def setUp(self):
        self.temp = pathlib.Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.temp)
        source = self.temp / "ziddle-1.zip"
        with zipfile.ZipFile(source, "w") as bundle:
            bundle.writestr("ziddle-1/Cargo.toml", "[workspace]\n")
            bundle.writestr("ziddle-1/ziddle/src/lib.rs", "// upstream\n")
        self.entry = {"archive": source.as_uri(), "sha256": tools.sha(source.read_bytes())}
        self.base = self.temp / "checkouts"
        self.base.mkdir()

    def test_unpacks_once_keeps_builds_and_refuses_local_edits(self):
        path = tools.fetch_archive(self.entry, self.base)
        self.assertEqual(path, self.base / "ziddle-1")
        (path / "target").mkdir()
        self.assertEqual(tools.fetch_archive(self.entry, self.base), path)
        (path / "Cargo.toml").write_text("# mine\n")
        with self.assertRaisesRegex(ValueError, "local edits"):
            tools.fetch_archive(self.entry, self.base)
        (path / "Cargo.toml").unlink()
        with self.assertRaisesRegex(ValueError, "local edits"):
            tools.fetch_archive(self.entry, self.base)

    def test_an_archive_other_than_the_pinned_one_is_refused_unwritten(self):
        with self.assertRaisesRegex(ValueError, "does not match its pin"):
            tools.fetch_archive(dict(self.entry, sha256="0" * 64), self.base)
        self.assertEqual(list(self.base.iterdir()), [])

    def test_the_ziddle_pin_is_berbasofts_source_archive(self):
        pin = json.loads(tools.PINS.read_text())["ziddle"]
        self.assertRegex(pin["archive"], r"^https://berbasoft\.com/ziddle/ziddle-\d+\.zip$")
        self.assertRegex(pin["sha256"], "^[0-9a-f]{64}$")


if __name__ == "__main__":
    unittest.main()
