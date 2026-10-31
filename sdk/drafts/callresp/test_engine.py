# SPDX-License-Identifier: GPL-3.0-or-later
"""CALL & RESPONSE: the firmware-free engine on the host, and the ColdFire package's machine record."""
from pathlib import Path
import json
import shutil
import struct
import subprocess
import sys
import tempfile
import unittest

HERE = Path(__file__).resolve().parent
ROOT = next(d for d in HERE.parents if (d / 'package.json').is_file())  # sdk/octabam/modules/ or sdk/drafts/
sys.path.insert(0, str(ROOT / 'sdk/tests'))
from host_flags import SANITIZE  # noqa: E402

SOURCES = ('engine.c', 'machine.c')
SUBSCRIBE = ('ot_machines:callresp_machine:80',)


class Engine(unittest.TestCase):
    @unittest.skipUnless(shutil.which('cc'), 'host C compiler unavailable')
    def test_engine_pairs_and_writes_the_record(self):
        with tempfile.TemporaryDirectory() as folder:
            executable = Path(folder) / 'engine'
            result = subprocess.run([shutil.which('cc'), '-std=c99', '-Wall', '-Wextra', '-Werror', *SANITIZE,
                                     *[str(HERE / n) for n in ('engine.c', 'test_engine.c')], '-o', str(executable)],
                                    capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            result = subprocess.run([str(executable)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertIn('answers pairwise distinct', result.stdout)
            self.assertIn('[PASS]', result.stdout)

    @unittest.skipUnless(shutil.which('cc'), 'host C compiler unavailable')
    def test_glue_compiles_freestanding(self):
        result = subprocess.run([shutil.which('cc'), '-std=c99', '-Wall', '-Wextra', '-Werror', '-ffreestanding',
                                 '-fno-builtin', '-fsyntax-only', str(HERE / 'machine.c')], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)

    @unittest.skipUnless(shutil.which('m68k-elf-gcc'), 'ColdFire compiler unavailable')
    def test_package_record(self):
        with tempfile.TemporaryDirectory() as folder:
            package = Path(folder) / 'callresp.mwrm'
            subprocess.run([sys.executable, '-B', str(ROOT / 'sdk/runtime/loader/build.py'),
                            *[str(HERE / name) for name in SOURCES], *[arg for hook in SUBSCRIBE for arg in ('--subscribe', hook)],
                            '-o', str(package)], check=True, capture_output=True)
            data = package.read_bytes()
        events = json.loads((ROOT / 'sdk/machines/octatrack/events.json').read_text())['events']
        index = next(event['index'] for event in events if event['event'] == 'ot_machines')
        image_bytes, _, _, hooks = struct.unpack_from('>4I', data, 8)
        self.assertEqual(hooks, index + 1)
        image = data[76 + hooks * 4:76 + hooks * 4 + image_bytes]
        word = struct.unpack_from('>I', data, 76 + index * 4)[0]
        at = word & 0xffffff
        self.assertEqual(word >> 24, 80)
        self.assertEqual(at % 4, 0)
        self.assertLessEqual(at + 88, len(image))
        # struct modwerk_machine_setup: the 80-byte machine (abi, sig, label, flags, page, defaults, assign, admit,
        # chooser_type, track_page, ui_tick, leave, pool_open, pool_left, choice_left, list_draw, render, validate,
        # the source price) and its setup page and knob.
        fields = struct.unpack_from('>I2sBB' + '16I' + 'HHB3x' + '2I', image, at)
        abi, sig, lo, hi = fields[:4]
        label, flags, page, defaults, assign, admit, chooser, track_page, ui_tick = fields[4:13]
        rest = fields[13:20]
        setup_page, setup_knob = fields[23:25]
        self.assertEqual((abi, sig, lo, hi), (1, b'CR', 1, 1))
        self.assertEqual(image[label:label + 9], b'CALLRESP\0')
        self.assertEqual(flags, 8 | 64)  # BACKING and SETUP_PAGE, as TB-3PO's sample-track machine
        self.assertEqual((page, defaults, admit, chooser) + rest + fields[20:23], (0,) * 14)
        for entry in (assign, track_page, ui_tick, setup_page, setup_knob):
            self.assertEqual(entry % 2, 0)
            self.assertLess(entry + 1, len(image))
            self.assertFalse(at <= entry < at + 88)


if __name__ == '__main__':
    unittest.main()
