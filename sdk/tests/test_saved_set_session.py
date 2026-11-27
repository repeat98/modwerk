# SPDX-License-Identifier: GPL-3.0-or-later
"""Execute the actual ISR/cache session helper with interrupted engine I/O."""
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
GLUE = ROOT / 'sdk/machines/octatrack/module-adapters/saved-set-export'

class SavedSetSession(unittest.TestCase):
    def test_fixed_requests_freeze_expiry_and_interrupted_publication(self):
        cc = shutil.which('cc')
        if not cc:
            self.skipTest('host compiler unavailable')
        for defines in ([], ['-DRUNTIME_POOL_BYTES=1572864u', '-DRUNTIME_IMAGE_BYTES=262144u', '-DRUNTIME_MODULE_BYTES=524288u']):
            with self.subTest(defines=defines), tempfile.TemporaryDirectory() as temp:
                binary = str(Path(temp) / 'session')
                result = subprocess.run([cc, '-std=c99', '-Wall', '-Wextra', '-Werror', '-pedantic', *defines,
                    '-I', str(GLUE), '-I', str(ROOT / 'sdk/runtime/loader'), '-I', str(ROOT / 'sdk/runtime/upload'),
                    *[str(GLUE / name) for name in ('saved_set_export.c', 'saved_set_session.c', 'test_saved_set_session.c')],
                    str(ROOT / 'sdk/runtime/upload/sha256.c'), '-o', binary], capture_output=True, text=True)
                self.assertEqual(result.returncode, 0, result.stderr)
                run = subprocess.run([binary], capture_output=True, text=True)
                self.assertEqual(run.returncode, 0, run.stderr)
                self.assertIn('no ISR I/O, interrupted freeze and expiry passed', run.stdout)

if __name__ == '__main__':
    unittest.main()
