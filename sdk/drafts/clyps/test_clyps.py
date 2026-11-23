"""Run the scoped host and ColdFire checks through Modwerk's normal test discovery."""
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


class ClypsDraft(unittest.TestCase):
    def test_coldfire_link_and_performance_callbacks(self):
        subprocess.run([sys.executable, '-B', Path(__file__).with_name('verify.py')], check=True)

    def test_reference_clipboard(self):
        source = Path(__file__).parent / 'tests/reference_clipboard.c'
        with tempfile.TemporaryDirectory() as tmp:
            binary = Path(tmp) / 'clipboard'
            subprocess.run(['cc', '-std=c11', '-Wall', '-Wextra', '-Werror',
                            source, '-o', binary], check=True)
            subprocess.run([binary], check=True)
