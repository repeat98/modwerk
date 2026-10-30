# SPDX-License-Identifier: GPL-3.0-or-later
"""TB-3PO: the firmware-free engine on the host, and the ColdFire package's generator record."""
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

SOURCES = ('engine.c', 'generator.c')
SUBSCRIBE = 'ot_midi_generators:tb3po_midi:40'


class Engine(unittest.TestCase):
    @unittest.skipUnless(shutil.which('cc'), 'host C compiler unavailable')
    def test_engine_matches_tb3po_c_and_writes_the_record(self):
        with tempfile.TemporaryDirectory() as folder:
            executable = Path(folder) / 'engine'
            result = subprocess.run([shutil.which('cc'), '-std=c99', '-Wall', '-Wextra', '-Werror', *SANITIZE,
                                     str(HERE / 'engine.c'), str(HERE / 'test_engine.c'), '-o', str(executable)],
                                    capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            result = subprocess.run([str(executable)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertIn('0 step differences', result.stdout)
            self.assertIn('[PASS]', result.stdout)

    @unittest.skipUnless(shutil.which('cc'), 'host C compiler unavailable')
    def test_generator_glue_compiles_freestanding(self):
        result = subprocess.run([shutil.which('cc'), '-std=c99', '-Wall', '-Wextra', '-Werror', '-ffreestanding',
                                 '-fno-builtin', '-fsyntax-only', str(HERE / 'generator.c')], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)

    @unittest.skipUnless(shutil.which('m68k-elf-gcc'), 'ColdFire compiler unavailable')
    def test_package_generator_record(self):
        with tempfile.TemporaryDirectory() as folder:
            package = Path(folder) / 'tb3po.mwrm'
            subprocess.run([sys.executable, '-B', str(ROOT / 'sdk/runtime/loader/build.py'),
                            *[str(HERE / name) for name in SOURCES], '--subscribe', SUBSCRIBE, '-o', str(package)],
                           check=True, capture_output=True)
            data = package.read_bytes()
        events = json.loads((ROOT / 'sdk/machines/octatrack/events.json').read_text())['events']
        index = next(event['index'] for event in events if event['event'] == 'ot_midi_generators')
        image_bytes, _, _, hooks = struct.unpack_from('>4I', data, 8)
        self.assertEqual(hooks, index + 1)
        word = struct.unpack_from('>I', data, 76 + index * 4)[0]
        at = word & 0xffffff
        self.assertEqual(word >> 24, 40)
        image = data[76 + hooks * 4:76 + hooks * 4 + image_bytes]
        self.assertEqual(at % 4, 0)
        self.assertLessEqual(at + 36, len(image))
        # struct modwerk_midi_generator: abi, label, id, pages, assign, page, knob, yes, ui_tick (modwerk_events.h).
        abi, label, ident, pages, assign, page, knob, yes, ui_tick = struct.unpack_from('>9I', image, at)
        self.assertEqual((abi, ident, pages, ui_tick), (2, ord('T'), 1, 0))
        self.assertEqual(image[label:label + 7], b'TB-3PO\0')
        for entry in (assign, page, knob, yes):
            self.assertEqual(entry % 2, 0)
            self.assertLess(entry + 1, len(image))
            self.assertFalse(at <= entry < at + 36)


if __name__ == '__main__':
    unittest.main()
