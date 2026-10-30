# SPDX-License-Identifier: GPL-3.0-or-later
"""SCENE GEN: the firmware-free engine on the host, and the ColdFire package's SEQUENCER rows record."""
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

SOURCES = ('engine.c', 'rows.c')
SUBSCRIBE = ('ot_sequencer_rows:scenegen_rows:50',)
LABELS = (b'SCN TARGET', b'SCN PARAMS', b'SCN SPREAD', b'SCENE GEN')


class Engine(unittest.TestCase):
    @unittest.skipUnless(shutil.which('cc'), 'host C compiler unavailable')
    def test_engine_generates_inside_the_lines(self):
        with tempfile.TemporaryDirectory() as folder:
            executable = Path(folder) / 'engine'
            result = subprocess.run([shutil.which('cc'), '-std=c99', '-Wall', '-Wextra', '-Werror', *SANITIZE,
                                     str(HERE / 'engine.c'), str(HERE / 'test_engine.c'), '-o', str(executable)],
                                    capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            result = subprocess.run([str(executable)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertIn('inside their ranges and reach', result.stdout)
            self.assertIn('[PASS]', result.stdout)

    @unittest.skipUnless(shutil.which('cc'), 'host C compiler unavailable')
    def test_glue_compiles_freestanding(self):
        result = subprocess.run([shutil.which('cc'), '-std=c99', '-Wall', '-Wextra', '-Werror', '-ffreestanding',
                                 '-fno-builtin', '-fsyntax-only', str(HERE / 'rows.c')], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)

    @unittest.skipUnless(shutil.which('m68k-elf-gcc'), 'ColdFire compiler unavailable')
    def test_package_record(self):
        with tempfile.TemporaryDirectory() as folder:
            package = Path(folder) / 'scenegen.mwrm'
            subprocess.run([sys.executable, '-B', str(ROOT / 'sdk/runtime/loader/build.py'),
                            *[str(HERE / name) for name in SOURCES], *[arg for hook in SUBSCRIBE for arg in ('--subscribe', hook)],
                            '-o', str(package)], check=True, capture_output=True)
            data = package.read_bytes()
        events = json.loads((ROOT / 'sdk/machines/octatrack/events.json').read_text())['events']
        index = next(event['index'] for event in events if event['event'] == 'ot_sequencer_rows')
        image_bytes, _, _, hooks = struct.unpack_from('>4I', data, 8)
        self.assertEqual(hooks, index + 1)
        image = data[76 + hooks * 4:76 + hooks * 4 + image_bytes]
        word = struct.unpack_from('>I', data, 76 + index * 4)[0]
        at = word & 0xffffff
        self.assertEqual(word >> 24, 50)
        self.assertEqual(at % 4, 0)
        # struct modwerk_sequencer_rows: count, then per row its label, getter and setter
        count = struct.unpack_from('>I', image, at)[0]
        self.assertEqual(count, len(LABELS))
        self.assertLessEqual(at + 4 + 12 * count, len(image))
        for i, expected in enumerate(LABELS):
            label, get, set_ = struct.unpack_from('>3I', image, at + 4 + 12 * i)
            self.assertEqual(image[label:label + len(expected) + 1], expected + b'\0')
            for entry in (get, set_):
                self.assertEqual(entry % 2, 0)
                self.assertLess(entry + 1, len(image))
                self.assertFalse(at <= entry < at + 4 + 12 * count)


if __name__ == '__main__':
    unittest.main()
