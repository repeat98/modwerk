# SPDX-License-Identifier: MIT
"""Firmware-free regressions for the staged, base-owned AED service."""
from pathlib import Path
import shutil
import subprocess
import struct
import sys
import tempfile
import unittest
import json
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

    def test_menu_selection_confirmation_and_dialog_retirement(self):
        self.run_fixture(['sample_editor_service.c', 'test_sample_editor_menu.c'],
                         ['-DMW_SAMPLE_MENU_HOST', '-DMODWERK_RUNTIME_EVENTS'])

    @unittest.skipUnless(shutil.which('m68k-elf-gcc'), 'ColdFire compiler unavailable')
    def test_actual_c_package_uses_the_required_descriptor_alignment(self):
        # A generic source-only client keeps the base regression independent
        # of any particular module. Host alignment hides ColdFire's default.
        with tempfile.TemporaryDirectory() as folder:
            package = Path(folder) / 'sample-action.mwrm'
            source = Path(folder) / 'action.c'
            header = ROOT / 'sdk/machines/octatrack/include/modwerk_sample_editor.h'
            source.write_text('#include "' + str(header) + '"\n' + '''
static void probe_open(uint32_t token, const struct modwerk_sample_editor_api *api)
{ (void)token; (void)api; }
const struct modwerk_sample_action sample_action = {
    MODWERK_SAMPLE_EDITOR_ABI, MODWERK_SAMPLE_ACTION_BYTES, 0x706c616eu, 0,
    probe_open, "TEST ACTION", {0, 0, 0}
};
''')
            subprocess.run([sys.executable, '-B', str(ROOT / 'sdk/runtime/loader/build.py'),
                            str(source),
                            '--subscribe', 'ot_sample_editor_actions:sample_action:50',
                            '-o', str(package)], check=True, capture_output=True)
            data = package.read_bytes()
        events = json.loads((ROOT / 'sdk/machines/octatrack/hooks.json').read_text())['events']
        index = next(event['index'] for event in events if event['event'] == 'ot_sample_editor_actions')
        image_bytes, _, _, hooks = struct.unpack_from('>4I', data, 8)
        self.assertEqual(hooks, index + 1)
        at = struct.unpack_from('>I', data, 76 + index * 4)[0] & 0xffffff
        image = data[76 + hooks * 4:76 + hooks * 4 + image_bytes]
        self.assertEqual(at % 4, 0)
        self.assertLessEqual(at + 64, len(image))
        abi, size, action, flags, entry = struct.unpack_from('>5I', image, at)
        self.assertEqual((abi, size, action, flags), (1, 64, 0x706c616e, 0))
        self.assertEqual(entry % 2, 0)
        self.assertLess(entry + 1, len(image))
        self.assertFalse(at <= entry < at + 64)


if __name__ == '__main__':
    unittest.main()
