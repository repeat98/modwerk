"""Host-tool regressions; all device/audio inputs here are synthetic."""
import contextlib
import importlib.util
import io
import json
import pathlib
import re
import shutil
import struct
import subprocess
import sys
import tempfile
import threading
import time
import types
import unittest
from unittest.mock import patch

HW = pathlib.Path(__file__).resolve().parents[1] / "octabam/tools/hw"
spec = importlib.util.spec_from_file_location("usb_probe_contract", HW / "usb_probe.py")
probe = importlib.util.module_from_spec(spec)
# Playback is replaced at the host boundary. Tests need neither NumPy,
# PortAudio, pyusb nor attached hardware, and cannot send device commands.
with patch.dict(sys.modules, {"numpy": types.ModuleType("numpy")}):
    spec.loader.exec_module(probe)


class UsbProbeHost(unittest.TestCase):
    def test_stopped_poller_can_join_repeatedly(self):
        sampled = threading.Event()

        def read(_device, ep3out):
            if ep3out:
                sampled.set()
            return {"produced": 1}

        with patch.object(probe, "read_counters", side_effect=read):
            poller = probe.Poller(object(), 0.001)
            poller.start()
            try:
                self.assertTrue(sampled.wait(2), "poller did not sample")
            finally:
                poller.stop()
                poller.join(timeout=2)
            poller.join(timeout=2)
        self.assertFalse(poller.is_alive())
        self.assertGreaterEqual(len(poller.samples), 1)
        self.assertEqual(poller.errors, [])

    def test_missing_input_request_is_not_retried_and_output_keeps_polling(self):
        sampled = threading.Event()
        calls = {False: 0, True: 0}

        def read(_device, ep3out):
            calls[ep3out] += 1
            if ep3out:
                raise RuntimeError("synthetic STALL: no input module")
            if calls[False] >= 2:
                sampled.set()
            return {"produced": calls[False]}

        with patch.object(probe, "read_counters", side_effect=read):
            poller = probe.Poller(object(), 0.001)
            poller.start()
            try:
                self.assertTrue(sampled.wait(2))
            finally:
                poller.stop()
                poller.join(timeout=2)
        self.assertFalse(poller.is_alive())
        self.assertEqual(calls[True], 1)
        self.assertEqual(len(poller.errors), 1)
        self.assertTrue(all(out is None for _, _, out in poller.samples))

    def test_cli_writes_report_after_thread_shutdown(self):
        def read(_device, ep3out):
            names = probe.IN_RING_NAMES if ep3out else probe.AUDIO_NAMES
            return dict.fromkeys(names, 0)

        def play(*_args):
            time.sleep(0.04)
            return {"wall_s": 0.04, "cycles": 1, "requested_s": 0.04,
                    "t_end": time.monotonic()}

        with tempfile.TemporaryDirectory() as temp:
            report = pathlib.Path(temp) / "synthetic.json"
            argv = ["usb_probe.py", "--unit", "mkii", "--duration", "0.04",
                    "--poll-interval", "0.002", "--json", str(report)]
            with patch.object(sys, "argv", argv), \
                 patch.object(probe, "find_device", return_value=object()), \
                 patch.object(probe, "find_output_device", return_value=(0, 2)), \
                 patch.object(probe, "read_counters", side_effect=read), \
                 patch.object(probe, "run_sustained", side_effect=play), \
                 patch.object(probe, "host_fingerprint", return_value={"fixture": True}), \
                 contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(probe.main(), 0)
            result = json.loads(report.read_text())
            self.assertEqual(result["host"], {"fixture": True})
            self.assertEqual(result["unit"], "mkii")
            # No draining is a failure, even though the recorder process
            # itself exits successfully. Exit code is not qualification.
            self.assertEqual(result["verdict"], "MATCHES_REPORTED_FAILURE")

    def test_counter_payloads_are_exact_big_endian_and_direction_specific(self):
        for ep3out in (False, True):
            names = probe.IN_RING_NAMES if ep3out else probe.AUDIO_NAMES
            values = list(range(len(names)))
            values[0] = 0xffffffff if ep3out else -1
            payload = struct.pack(">" + ("I" if ep3out else "i") * len(values), *values)
            device = types.SimpleNamespace(ctrl_transfer=lambda *args, **kw: payload)
            self.assertEqual(probe.read_counters(device, ep3out), dict(zip(names, values)))
            for bad in (payload[:-1], payload + b"\0"):
                device.ctrl_transfer = lambda *args, **kw: bad
                with self.assertRaisesRegex(RuntimeError, "expected"):
                    probe.read_counters(device, ep3out)

    def test_close_overruns_are_separate_from_open_stream_verdict(self):
        def counters(produced, consumed, overruns):
            result = dict.fromkeys(probe.AUDIO_NAMES, 0)
            result.update(produced=produced, consumed=consumed, overruns=overruns)
            return result

        samples = [(0, counters(0, 0, 0), None),
                   (1, counters(44100, 44100, 0), None),
                   (1.2, counters(52920, 44100, 4), None)]
        summary = probe.summarize(samples, [], t_open_end=1)
        self.assertEqual(summary["ep3_in"]["overruns_delta"], 0)
        self.assertEqual(summary["at_close"]["ep3_in_overruns"], 4)
        play = {"cycles": 1, "wall_s": 1, "requested_s": 1}
        self.assertEqual(probe.verdict(play, summary)[0], "CLEAN")
        samples[1][1]["overruns"] = 1
        self.assertEqual(probe.verdict(play, probe.summarize(samples, [], 1))[0],
                         "MATCHES_REPORTED_FAILURE")

    def test_missing_counter_evidence_is_ambiguous(self):
        summary = probe.summarize([(0, None, None)], [(0, "in", "STALL")], 1)
        play = {"cycles": 1, "wall_s": 1, "requested_s": 1}
        self.assertEqual(probe.verdict(play, summary)[0], "AMBIGUOUS")


class RecorderPcm(unittest.TestCase):
    @unittest.skipUnless(shutil.which("swift"), "Swift compiler is a native developer check")
    def test_actual_recorder_conversion_handles_full_scale(self):
        # Run the real IOProc's conversion block with synthetic Float input;
        # no CoreAudio device is opened. Before the Double fix, +1.0 traps.
        source = (HW / "rec.swift").read_text()
        block = re.search(r"let v = max\([^\n]+\n\s*pcm\[[^\n]+", source)
        self.assertIsNotNone(block)
        program = '''
let src: [Float] = [-2, -1, -0.5, 0, 0.5, 1, 2, Float(1).nextDown]
var pcm = [Int32](repeating: 0, count: src.count)
let c = 1, k = 0, written = 0, channels = 1, ch = 0
for i in src.indices {
''' + block.group() + '''
}
let expected: [Int32] = [-2147483647, -2147483647, -1073741823, 0,
                         1073741823, 2147483647, 2147483647, 2147483519]
precondition(pcm == expected, "PCM conversion changed: \\(pcm)")
print("recorder full-scale conversion passed")
'''
        with tempfile.TemporaryDirectory() as temp:
            script = pathlib.Path(temp) / "pcm.swift"
            script.write_text(program)
            result = subprocess.run([shutil.which("swift"), "-module-cache-path",
                                     str(pathlib.Path(temp) / "cache"), str(script)],
                                    capture_output=True, text=True, timeout=120)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("recorder full-scale conversion passed", result.stdout)


if __name__ == "__main__":
    unittest.main()
