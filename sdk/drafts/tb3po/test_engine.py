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

SOURCES = ('engine.c', 'generator.c', 'machine.c')
SUBSCRIBE = ('ot_midi_generators:tb3po_midi:40', 'ot_machines:tb3po_machine:50')


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
    def test_glue_compiles_freestanding(self):
        for name in ('generator.c', 'machine.c'):
            result = subprocess.run([shutil.which('cc'), '-std=c99', '-Wall', '-Wextra', '-Werror', '-ffreestanding',
                                     '-fno-builtin', '-fsyntax-only', str(HERE / name)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)

    @unittest.skipUnless(shutil.which('m68k-elf-gcc'), 'ColdFire compiler unavailable')
    def test_package_records(self):
        with tempfile.TemporaryDirectory() as folder:
            package = Path(folder) / 'tb3po.mwrm'
            subprocess.run([sys.executable, '-B', str(ROOT / 'sdk/runtime/loader/build.py'),
                            *[str(HERE / name) for name in SOURCES], *[arg for hook in SUBSCRIBE for arg in ('--subscribe', hook)],
                            '-o', str(package)], check=True, capture_output=True)
            data = package.read_bytes()
        events = json.loads((ROOT / 'sdk/machines/octatrack/events.json').read_text())['events']
        indices = {event['event']: event['index'] for event in events if event['event'] in ('ot_midi_generators', 'ot_machines')}
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
        at = record('ot_midi_generators', 40, 36)
        abi, label, ident, pages, assign, page, knob, yes, ui_tick = struct.unpack_from('>9I', image, at)
        self.assertEqual((abi, ident, pages, ui_tick), (2, ord('T'), 1, 0))
        self.assertEqual(image[label:label + 7], b'TB-3PO\0')
        inside(at, 36, (assign, page, knob, yes))
        # struct modwerk_machine_setup: the 80-byte machine (abi, sig, label, flags, page, defaults, assign, admit,
        # chooser_type, track_page, ui_tick, leave, pool_open, pool_left, choice_left, list_draw, render, validate,
        # the source price) and its setup page and knob.
        at = record('ot_machines', 50, 88)
        fields = struct.unpack_from('>I2sBB' + '16I' + 'HHB3x' + '2I', image, at)
        abi, sig, lo, hi = fields[:4]
        label, flags, page, defaults, assign, admit, chooser, track_page, ui_tick = fields[4:13]
        leave, pool_open, pool_left, choice_left, list_draw, render, validate = fields[13:20]
        source_voice, source_engine, source_kind, setup_page, setup_knob = fields[20:25]
        self.assertEqual((abi, sig, lo, hi), (1, b'T3', 1, 1))
        self.assertEqual(image[label:label + 7], b'TB-3PO\0')
        self.assertEqual(flags, 8 | 64)  # BACKING, SETUP_PAGE, as VECTOR without its pool
        self.assertEqual((page, defaults, admit, chooser, leave, pool_open, pool_left, choice_left, list_draw, render, validate), (0,) * 11)
        self.assertEqual((source_voice, source_engine, source_kind), (0, 0, 0))
        inside(at, 88, (assign, track_page, ui_tick, setup_page, setup_knob))


if __name__ == '__main__':
    unittest.main()
