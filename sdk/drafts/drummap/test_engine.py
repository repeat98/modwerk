# SPDX-License-Identifier: GPL-3.0-or-later
"""DRUMMAP: the firmware-free engine on the host, and the ColdFire package's machine record."""
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

SOURCES = ('engine.c', 'grids.c', 'machine.c')
SUBSCRIBE = ('ot_machines:drummap_machine:60',)


class Engine(unittest.TestCase):
    @unittest.skipUnless(shutil.which('cc'), 'host C compiler unavailable')
    def test_engine_matches_drummap_and_writes_the_record(self):
        with tempfile.TemporaryDirectory() as folder:
            executable = Path(folder) / 'engine'
            result = subprocess.run([shutil.which('cc'), '-std=c99', '-Wall', '-Wextra', '-Werror', *SANITIZE,
                                     *[str(HERE / n) for n in ('engine.c', 'grids.c', 'test_engine.c')], '-o', str(executable)],
                                    capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            result = subprocess.run([str(executable)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertIn("match DrumMap's ReadDrumMap", result.stdout)
            self.assertIn('[PASS]', result.stdout)

    @unittest.skipUnless(shutil.which('cc'), 'host C compiler unavailable')
    def test_glue_compiles_freestanding(self):
        result = subprocess.run([shutil.which('cc'), '-std=c99', '-Wall', '-Wextra', '-Werror', '-ffreestanding',
                                 '-fno-builtin', '-fsyntax-only', str(HERE / 'machine.c')], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)

    @unittest.skipUnless(shutil.which('m68k-elf-gcc'), 'ColdFire compiler unavailable')
    def test_package_record(self):
        with tempfile.TemporaryDirectory() as folder:
            package = Path(folder) / 'drummap.mwrm'
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
        self.assertEqual(word >> 24, 60)
        self.assertEqual(at % 4, 0)
        self.assertLessEqual(at + 80, len(image))
        # struct modwerk_machine (80 bytes): abi, sig, label, flags, page, defaults, assign, admit, chooser_type,
        # track_page, ui_tick, leave, pool_open, pool_left, choice_left, list_draw, render, validate, the source price.
        fields = struct.unpack_from('>I2sBB' + '16I' + 'HHB3x', image, at)
        abi, sig, lo, hi = fields[:4]
        label, flags, page, defaults, assign, admit, chooser, track_page, ui_tick = fields[4:13]
        rest = fields[13:20]
        self.assertEqual((abi, sig, lo, hi), (1, b'DM', 1, 1))
        self.assertEqual(image[label:label + 8], b'DRUMMAP\0')
        self.assertEqual(flags, 8)  # BACKING, as VECTOR's sample-playing machine
        self.assertEqual((page, defaults, admit, chooser) + rest + fields[20:23], (0,) * 14)
        for entry in (assign, track_page, ui_tick):
            self.assertEqual(entry % 2, 0)
            self.assertLess(entry + 1, len(image))
            self.assertFalse(at <= entry < at + 80)


if __name__ == '__main__':
    unittest.main()
