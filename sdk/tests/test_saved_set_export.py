# SPDX-License-Identifier: GPL-3.0-or-later
"""Actual fixed-file reader and immutable snapshot code; no firmware or device."""
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
GLUE = ROOT / 'sdk/machines/octatrack/module-adapters/saved-set-export'
LOADER = ROOT / 'sdk/runtime/loader'
UPLOAD = ROOT / 'sdk/runtime/upload'

class SavedSetExport(unittest.TestCase):
    def test_actual_reader_and_snapshot(self):
        cc = shutil.which('cc')
        if not cc:
            self.skipTest('host compiler unavailable')
        for defines in ([], ['-DRUNTIME_POOL_BYTES=1572864u', '-DRUNTIME_IMAGE_BYTES=262144u', '-DRUNTIME_MODULE_BYTES=524288u']):
            with self.subTest(defines=defines), tempfile.TemporaryDirectory() as temp:
                binary = str(Path(temp) / 'snapshot')
                subprocess.run([cc, '-std=c99', '-Wall', '-Wextra', '-Werror', '-pedantic', '-DMODWERK_HOST', *defines,
                    '-I', str(GLUE), '-I', str(LOADER), '-I', str(UPLOAD), str(GLUE / 'saved_set_export.c'),
                    str(GLUE / 'saved_set_reader.c'), str(GLUE / 'test_saved_set_export.c'), str(UPLOAD / 'sha256.c'),
                    '-o', binary], check=True, capture_output=True)
                result = subprocess.run([binary], capture_output=True, text=True)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertIn('interrupted publication passed', result.stdout)

if __name__ == '__main__':
    unittest.main()
