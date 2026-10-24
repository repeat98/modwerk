# SPDX-License-Identifier: MIT
"""Firmware-free regressions for the staged, base-owned AED service."""
from pathlib import Path
import shutil
import subprocess
import struct
import sys
import tempfile
import unittest
from host_flags import SANITIZE

ROOT = Path(__file__).resolve().parents[2]
ADAPTERS = ROOT / 'sdk/machines/octatrack/module-adapters'


@unittest.skipUnless(shutil.which('cc'), 'host C compiler unavailable')
class SampleEditor(unittest.TestCase):
    def run_fixture(self, sources, defines=()):
        with tempfile.TemporaryDirectory() as folder:
            executable = Path(folder) / 'fixture'
            result = subprocess.run([
                shutil.which('cc'), '-std=c99', '-Wall', '-Wextra', '-Werror',
                *SANITIZE, *defines,
                *[flag for directory in ('sdk/runtime/loader', 'sdk/runtime/upload',
                                         'sdk/machines/octatrack/include', 'sdk/machines/octatrack/elekloader')
                  for flag in ('-I', str(ROOT / directory))],
                *[str(ADAPTERS / source) for source in sources], '-o', str(executable),
            ], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            result = subprocess.run([str(executable)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertIn('PASS:', result.stdout)

    def test_confirmation_source_lifetime_and_owner_retirement(self):
        self.run_fixture(['sample_editor_service.c', 'test_sample_editor_service.c'],
                         ['-DMW_SAMPLE_EDITOR_HOST_MAIN'])

    def test_typed_action_and_public_base_refusal(self):
        self.run_fixture(['sample_editor_actions.c', 'test_sample_editor_actions.c'],
                         ['-DMODWERK_RUNTIME_EVENTS'])

    def test_board_publication_and_verified_rollback(self):
        self.run_fixture(['sample_editor_service.c', 'sample_editor_board.c',
                          'test_sample_editor_board.c'], ['-DMW_SAMPLE_BOARD_HOST'])

    def test_actual_independent_controller_with_shared_service(self):
        self.run_fixture(['sample_editor_service.c', 'test_sample_editor_module.c',
                          *[ROOT / 'sdk/drafts/beat-slicer' / name for name in
                            ('device_module.c', 'device_font.c', 'grid_preview.c')]])

    @unittest.skipUnless(shutil.which('m68k-elf-gcc'), 'ColdFire compiler unavailable')
    def test_actual_c_package_uses_the_required_descriptor_alignment(self):
        # Host pointer alignment hid the target's default two-byte alignment.
        # Build the real package: a valid C object must also be admissible by
        # the base's four-byte typed-record decoder.
        with tempfile.TemporaryDirectory() as folder:
            package = Path(folder) / 'beat-slicer.mwrm'
            subprocess.run([sys.executable, '-B', str(ROOT / 'sdk/runtime/loader/build.py'),
                            *[str(ROOT / 'sdk/drafts/beat-slicer' / name) for name in
                              ('device_module.c', 'device_font.c', 'grid_preview.c')],
                            '--subscribe', 'ot_sample_editor_actions:bs_sample_action:50',
                            '-o', str(package)], check=True, capture_output=True)
            data = package.read_bytes()
        image_bytes, _, _, hooks = struct.unpack_from('>4I', data, 8)
        self.assertEqual(hooks, 33)
        at = struct.unpack_from('>I', data, 76 + 32 * 4)[0] & 0xffffff
        image = data[76 + hooks * 4:76 + hooks * 4 + image_bytes]
        self.assertEqual(at % 4, 0)
        self.assertLessEqual(at + 64, len(image))
        abi, size, action, flags, entry = struct.unpack_from('>5I', image, at)
        self.assertEqual((abi, size, action, flags), (1, 64, 0x446c151d, 0))
        self.assertEqual(entry % 2, 0)
        self.assertLess(entry + 1, len(image))
        self.assertFalse(at <= entry < at + 64)


if __name__ == '__main__':
    unittest.main()
