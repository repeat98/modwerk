# SPDX-License-Identifier: GPL-3.0-or-later
"""DATAMATIC: the firmware-free engine on the host, and the ColdFire package's generator record."""
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

SOURCES = ('engine.c', 'tables.c', 'generator.c')
SUBSCRIBE = ('ot_midi_generators:datamatic_midi:45',)


class Engine(unittest.TestCase):
    @unittest.skipUnless(shutil.which('cc'), 'host C compiler unavailable')
    def test_engine_streams_lines_and_record(self):
        with tempfile.TemporaryDirectory() as folder:
            executable = Path(folder) / 'engine'
            result = subprocess.run([shutil.which('cc'), '-std=c99', '-Wall', '-Wextra', '-Werror', *SANITIZE,
                                     str(HERE / 'engine.c'), str(HERE / 'tables.c'), str(HERE / 'test_engine.c'), '-o', str(executable)],
                                    capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            result = subprocess.run([str(executable)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertIn('off the base note', result.stdout)
            self.assertIn('[PASS]', result.stdout)

    @unittest.skipUnless(shutil.which('cc'), 'host C compiler unavailable')
    def test_glue_compiles_freestanding(self):
        for name in ('generator.c',):
            result = subprocess.run([shutil.which('cc'), '-std=c99', '-Wall', '-Wextra', '-Werror', '-ffreestanding',
                                     '-fno-builtin', '-fsyntax-only', str(HERE / name)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)

    @unittest.skipUnless(shutil.which('m68k-elf-gcc'), 'ColdFire compiler unavailable')
    def test_package_records(self):
        with tempfile.TemporaryDirectory() as folder:
            package = Path(folder) / 'datamatic.mwrm'
            subprocess.run([sys.executable, '-B', str(ROOT / 'sdk/runtime/loader/build.py'),
                            *[str(HERE / name) for name in SOURCES], *[arg for hook in SUBSCRIBE for arg in ('--subscribe', hook)],
                            '-o', str(package)], check=True, capture_output=True)
            data = package.read_bytes()
        events = json.loads((ROOT / 'sdk/machines/octatrack/events.json').read_text())['events']
        indices = {event['event']: event['index'] for event in events if event['event'] in ('ot_midi_generators',)}
        image_bytes, _, _, hooks = struct.unpack_from('>4I', data, 8)
        self.assertEqual(hooks, max(indices.values()) + 1)
        image = data[76 + hooks * 4:76 + hooks * 4 + image_bytes]

        def record(event, order, size):
            word = struct.unpack_from('>I', data, 76 + indices[event] * 4)[0]
            at = word & 0xffffff
            self.assertEqual(word >> 24, order)
            self.assertEqual(at % 4, 0)
            self.assertLessEqual(at + size, len(image))
            return at

        def inside(at, size, entries):
            for entry in entries:
                self.assertEqual(entry % 2, 0)
                self.assertLess(entry + 1, len(image))
                self.assertFalse(at <= entry < at + size)

        # struct modwerk_midi_generator: abi, label, id, pages, assign, page, knob, yes, ui_tick (modwerk_events.h).
        at = record('ot_midi_generators', 45, 36)
        abi, label, ident, pages, assign, page, knob, yes, ui_tick = struct.unpack_from('>9I', image, at)
        self.assertEqual((abi, ident, pages, ui_tick), (2, ord('D'), 1, 0))
        self.assertEqual(image[label:label + 8], b'DATAMAT\0')
        inside(at, 36, (assign, page, knob, yes))

    def test_tables_are_generated(self):
        with tempfile.TemporaryDirectory() as folder:
            copy = Path(folder) / 'generate_tables.py'
            shutil.copy(HERE / 'generate_tables.py', copy)
            subprocess.run([sys.executable, '-B', str(copy)], check=True, capture_output=True)
            self.assertEqual((Path(folder) / 'tables.c').read_text(), (HERE / 'tables.c').read_text())


if __name__ == '__main__':
    unittest.main()
