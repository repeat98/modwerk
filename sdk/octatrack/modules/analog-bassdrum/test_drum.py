# SPDX-License-Identifier: MIT
"""Analog BD 0.2.0 on the host: test_drum.c under UBSan/ASan, and tables.h against tools/tables.ts."""
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent


class Drum(unittest.TestCase):
    @unittest.skipUnless(shutil.which('cc'), 'no host C compiler')
    def test_engine(self):
        with tempfile.TemporaryDirectory() as folder:
            exe = Path(folder) / 'drum'
            subprocess.run(['cc', '-std=c11', '-O1', '-g', '-Wall', '-Wextra', '-Werror', '-fsanitize=undefined,address',
                            '-fno-sanitize-recover=all', '-o', str(exe), str(HERE / 'test_drum.c'), str(HERE / 'drum.c')],
                           check=True)
            result = subprocess.run([str(exe)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    @unittest.skipUnless(shutil.which('node'), 'no Node.js')
    def test_tables(self):
        result = subprocess.run(['node', str(HERE / 'tools/tables.ts'), '--check'], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)


if __name__ == '__main__':
    unittest.main()
