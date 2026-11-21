# SPDX-License-Identifier: MIT
"""Host check for the threshold-slice planner. No firmware."""
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DRAFT = ROOT / 'sdk' / 'drafts' / 'threshold-slices'


@unittest.skipUnless(shutil.which('cc'), 'host C compiler unavailable')
class ThresholdSlices(unittest.TestCase):
    def test_scan_places_starts_on_rises(self):
        with tempfile.TemporaryDirectory() as folder:
            executable = Path(folder) / 'threshold'
            result = subprocess.run([
                shutil.which('cc'), '-std=c99', '-Wall', '-Wextra', '-Werror',
                '-I', str(DRAFT),
                str(DRAFT / 'test_threshold.c'), str(DRAFT / 'threshold.c'),
                '-o', str(executable),
            ], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            result = subprocess.run([str(executable)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertIn('PASS:', result.stdout)


if __name__ == '__main__':
    unittest.main()
