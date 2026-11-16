# SPDX-License-Identifier: GPL-3.0-or-later
"""The shared status word after a module's removal, against the actual loader and the Octatrack's tick dispatch
(runtime_removed_tick.c, #1314)."""
from pathlib import Path
import os
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / 'sdk/machines/octatrack/elekloader'


class RuntimeRemovedTick(unittest.TestCase):
    @unittest.skipUnless(shutil.which('cc') or shutil.which('gcc'), 'Native C compiler unavailable')
    def test_removed_module_neither_ticks_nor_keeps_the_status_word(self):
        with tempfile.TemporaryDirectory() as temp:
            # As built, and as the beta base runs modules (--cached-modules).
            for defines in ((), ('-DMODWERK_CACHED_MODULES',)):
                with self.subTest(defines=defines):
                    binary = Path(temp) / ('removed-tick%d%s' % (len(defines), '.exe' if os.name == 'nt' else ''))
                    command = [shutil.which('cc') or shutil.which('gcc'), '-std=c99', '-Wall', '-Wextra', '-Werror',
                               '-pedantic', '-DMODWERK_HOST', *defines, '-I' + str(BASE),
                               '-I' + str(ROOT / 'sdk/runtime/upload'), '-I' + str(ROOT / 'sdk/runtime/loader'),
                               str(ROOT / 'sdk/tests/runtime_removed_tick.c'), '-o', str(binary)]
                    subprocess.run(command, check=True, capture_output=True)
                    result = subprocess.run([str(binary)], capture_output=True, text=True)
                    self.assertEqual(result.returncode, 0, result.stderr)
                    self.assertIn('does not outlive it', result.stdout)


if __name__ == '__main__':
    unittest.main()
