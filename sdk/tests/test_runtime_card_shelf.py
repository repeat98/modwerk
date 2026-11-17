# SPDX-License-Identifier: GPL-3.0-or-later
"""modset.c's sector store and load with modules switched off, through every power cut. Synthetic card, no stock input."""
from pathlib import Path
import os
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]


class RuntimeCardShelf(unittest.TestCase):
    @unittest.skipUnless(shutil.which('cc') or shutil.which('gcc'), 'Native C compiler unavailable')
    def test_a_power_cut_while_a_switch_is_saved_keeps_every_module(self):
        with tempfile.TemporaryDirectory() as temp:
            binary = Path(temp) / ('card-shelf.exe' if os.name == 'nt' else 'card-shelf')
            command = [shutil.which('cc') or shutil.which('gcc'), '-std=c99', '-Wall', '-Wextra', '-Werror',
                       '-DMODWERK_HOST', '-DMODWERK_HOST_CARD', '-I' + str(ROOT / 'sdk/runtime/upload'),
                       '-I' + str(ROOT / 'sdk/runtime/loader'), '-I' + str(ROOT / 'sdk/machines/octatrack/elekloader'),
                       str(ROOT / 'sdk/tests/runtime_card_shelf.c'), '-o', str(binary)]
            subprocess.run(command, check=True, capture_output=True)
            result = subprocess.run([str(binary)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn('each module found once at the next start', result.stdout)


if __name__ == '__main__':
    unittest.main()
