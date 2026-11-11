"""Host-only tests for publication runner identity and failure handling."""
import json
from pathlib import Path
import tempfile
import unittest

import publication_runner as runner


class FakeChild:
    def __init__(self, exit_code=0):
        self.exit_code = exit_code

    def poll(self):
        return self.exit_code

    def wait(self):
        if self.exit_code is None:
            self.exit_code = 143
        return self.exit_code


class PublicationRunnerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="track-solo-runner-")
        self.base = Path(self.temp.name)
        self.root = self.base / "repo"
        self.cache = self.base / "cache"
        self.build = self.base / "build"
        self.output = self.base / "runs"
        self.emulator = self.base / "ot_emu.synthetic"
        self.panel = self.base / "panel_link.synthetic.py"
        self.manifest_path = self.base / "reviewed-inputs.json"
        self._write(self.root / "sdk/catalog.json", "synthetic catalog\n")
        self._write(self.root / "scripts/build-module-packages.py", "synthetic builder\n")
        for rel in runner.PINNED_SOURCE_FILES:
            self._write(self.root / rel, f"synthetic source {rel}\n")
        for rel in runner.PRODUCTION_FILES:
            self._write(self.root / runner.MODULE / rel, f"synthetic source {rel}\n")
        self._write(self.root / "sdk/octabam/tools/synthetic_tool.py", "synthetic helper\n")
        for rel in (
            "ata-order-experiment-1/integrated-base-4/MAIN.raw",
            "ata-order-experiment-1/integrated-base-4/symbols.json",
            "stock-main.private.bin",
            "fixture-2/card.private.img",
        ):
            self._write(self.cache / rel, f"synthetic input {rel}\n")
        self._write(self.build / "track-solo.mwrm", "synthetic package\n")
        self._write(self.build / "symbols.json", "synthetic package symbols\n")
        self._write(self.emulator, "synthetic emulator executable identity\n")
        self._write(self.panel, "synthetic panel helper\n")

        self.manifest_args = self._args("manifest")
        self.run_args = self._args("run", "synthetic-run")
        self.manifest = runner.make_manifest(self.manifest_args, self.root, self._hasher)
        self.manifest_path.write_text(json.dumps(self.manifest, indent=2) + "\n")
        self.run_args.input_manifest = self.manifest_path

    def tearDown(self):
        self.temp.cleanup()

    def _write(self, path, content):
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)

    def _args(self, command, label=None):
        argv = [
            command,
            "--cache-root", str(self.cache),
            "--build-dir", str(self.build),
            "--emulator", str(self.emulator),
            "--panel-helper", str(self.panel),
        ]
        if command == "manifest":
            argv += ["--manifest-output", str(self.manifest_path)]
        else:
            argv += [label, "--input-manifest", str(self.manifest_path),
                     "--output-root", str(self.output)]
        return runner.build_parser().parse_args(argv)

    def _hasher(self, path):
        path = Path(path)
        if path.name == "track-solo.mwrm":
            return runner.EXPECTED_PACKAGE_SHA256
        return runner.digest(path)

    def _invoke(self, args, **kwargs):
        return runner.run_fixture(
            args,
            root=self.root,
            hasher=self._hasher,
            lock_path=self.base / "emulator.lock",
            active_scan=kwargs.pop("active_scan", lambda _name: []),
            **kwargs,
        )

    def test_real_checkout_source_paths_point_to_module_files(self):
        real_root = Path(__file__).resolve().parents[4]
        paths = runner.source_paths(real_root)

        self.assertTrue(all(path.is_file() for path in paths.values()))
        for rel in runner.PRODUCTION_FILES:
            key = f"{runner.MODULE}/{rel}"
            expected = real_root / runner.MODULE / rel
            self.assertIn(key, paths)
            self.assertEqual(paths[key], expected)
            self.assertTrue(expected.is_file())
            self.assertNotIn(rel, paths)
        self.assertEqual(
            paths[f"{runner.MODULE}/README.md"],
            real_root / runner.MODULE / "README.md",
        )
        self.assertNotEqual(
            paths[f"{runner.MODULE}/README.md"],
            real_root / "README.md",
        )

    def test_mute_modes_inputs_match_fixture_consumers(self):
        def keys(args):
            return set(runner.input_paths(args))

        routine = self._args("manifest")
        routine.routine = True
        self.assertTrue({"mute-modes.mwrm", "mute-symbols.json"}.issubset(keys(routine)))

        paired = self._args("manifest")
        paired.paired = True
        self.assertIn("mute-modes.mwrm", keys(paired))
        self.assertNotIn("mute-symbols.json", keys(paired))

        control = self._args("manifest")
        control.broad_profile = "control"
        self.assertIn("mute-modes.mwrm", keys(control))
        self.assertNotIn("mute-symbols.json", keys(control))

        for profile in ("machines", "master"):
            broad = self._args("manifest")
            broad.broad_profile = profile
            self.assertNotIn("mute-modes.mwrm", keys(broad))
            self.assertNotIn("mute-symbols.json", keys(broad))

    def test_mismatched_input_refuses_before_launch_and_records_failure(self):
        (self.cache / "stock-main.private.bin").write_text("different synthetic MAIN\n")
        launched = []
        with self.assertRaises(runner.RunFailed) as raised:
            self._invoke(self.run_args, popen=lambda *a, **k: launched.append((a, k)))

        self.assertEqual(launched, [])
        run_dir = raised.exception.run_dir
        error = json.loads((run_dir / "runner-error.json").read_text())
        isolation = json.loads((run_dir / "isolation.json").read_text())
        self.assertIn("input SHA-256 mismatch", error["error"])
        self.assertFalse(isolation["cleanup"]["containerLaunched"])
        self.assertTrue(isolation["runnerError"])

    def test_default_image_is_immutable_and_used_for_launch(self):
        child = FakeChild(0)
        command_seen = []

        def launch(command, **kwargs):
            command_seen.append(command)
            return child

        code, run_dir = self._invoke(self.run_args, popen=launch)
        self.assertEqual(code, 0)
        self.assertEqual(self.run_args.docker_image, runner.DEFAULT_DOCKER_IMAGE)
        self.assertIn(runner.DEFAULT_DOCKER_IMAGE, command_seen[0])
        recorded = json.loads((run_dir / "inputs.json").read_text())
        self.assertEqual(recorded["dockerImage"], runner.DEFAULT_DOCKER_IMAGE)
        self.assertEqual(recorded["manifestSha256"], runner.digest(self.manifest_path))

    def test_broad_profiles_bind_their_own_fixture_cards(self):
        control_card = self.cache / "broad-fixtures-repro-1/control/card.private.img"
        machine_card = self.cache / "broad-fixtures-repro-1/machines/card.private.img"
        self._write(control_card, "synthetic control profile card\n")
        self._write(machine_card, "synthetic machines profile card\n")
        self._write(self.cache / "mute-linked/mute-modes.mwrm", "synthetic mute package\n")

        control_args = self._args("manifest")
        control_args.broad_profile = "control"
        machines_args = self._args("manifest")
        machines_args.broad_profile = "machines"
        control_manifest = runner.make_manifest(control_args, self.root, self._hasher)
        machines_manifest = runner.make_manifest(machines_args, self.root, self._hasher)

        self.assertNotEqual(
            control_manifest["inputSha256"]["card.private.img"],
            machines_manifest["inputSha256"]["card.private.img"],
        )
        self.assertEqual(control_manifest["selection"]["broadProfile"], "control")
        self.assertEqual(machines_manifest["selection"]["broadProfile"], "machines")
        self.assertIn("broad-fixture/card.private.img", control_manifest["inputSha256"])
        self.assertIn("broad-fixture/card.private.img", machines_manifest["inputSha256"])

    def test_missing_input_after_run_directory_reservation_writes_reports(self):
        (self.cache / "fixture-2/card.private.img").unlink()
        with self.assertRaises(runner.RunFailed) as raised:
            self._invoke(self.run_args, popen=lambda *a, **k: self.fail("must not launch"))

        run_dir = raised.exception.run_dir
        self.assertTrue((run_dir / "runner-error.json").is_file())
        isolation = json.loads((run_dir / "isolation.json").read_text())
        self.assertIn("card.private.img", isolation["runnerError"])
        self.assertEqual(isolation["cleanup"]["lockAcquired"], False)
        self.assertEqual(isolation["cleanup"]["lockReleased"], False)

    def test_copy_failure_writes_error_and_cleanup_report(self):
        def fail_copy(_source, _destination):
            raise OSError("synthetic copy failure")

        with self.assertRaises(runner.RunFailed) as raised:
            self._invoke(
                self.run_args,
                popen=lambda *a, **k: self.fail("must not launch"),
                copy_file=fail_copy,
            )

        run_dir = raised.exception.run_dir
        error = json.loads((run_dir / "runner-error.json").read_text())
        isolation = json.loads((run_dir / "isolation.json").read_text())
        self.assertIn("synthetic copy failure", error["error"])
        self.assertTrue(isolation["cleanup"]["lockAcquired"])
        self.assertTrue(isolation["cleanup"]["lockReleased"])
        self.assertIsNone(isolation["inputAndCopiedSourceFilesUnchanged"])

    def test_cleanup_distinguishes_natural_exit_from_owned_stop(self):
        natural = FakeChild(0)
        natural_stops = []
        _, natural_dir = self._invoke(
            self.run_args,
            popen=lambda *_args, **_kwargs: natural,
            stop_container=lambda name: natural_stops.append(name) or 0,
        )
        natural_cleanup = json.loads((natural_dir / "isolation.json").read_text())["cleanup"]
        self.assertEqual(natural_stops, [])
        self.assertFalse(natural_cleanup["stopRequested"])
        self.assertIsNone(natural_cleanup["stoppedContainer"])
        self.assertEqual(natural_cleanup["childStateAtCleanup"], "exited")

        stopped = FakeChild(None)
        scans = iter(([], [], ["other emulator: ot_emu"]))
        stop_calls = []

        def stop_owned(name):
            stop_calls.append(name)
            stopped.exit_code = 143
            return 0

        stop_args = self._args("run", "owned-stop")
        with self.assertRaises(runner.RunFailed) as raised:
            self._invoke(
                stop_args,
                active_scan=lambda _name: next(scans),
                popen=lambda *_args, **_kwargs: stopped,
                stop_container=stop_owned,
            )
        stop_dir = raised.exception.run_dir
        stop_error = json.loads((stop_dir / "runner-error.json").read_text())
        stop_isolation = json.loads((stop_dir / "isolation.json").read_text())
        self.assertEqual(stop_calls, ["track-solo-owned-stop"])
        self.assertEqual(stop_error["stoppedContainer"], "track-solo-owned-stop")
        self.assertTrue(stop_error["stopRequested"])
        self.assertEqual(stop_isolation["cleanup"]["childStateAtCleanup"], "exited")


if __name__ == "__main__":
    unittest.main()
