"""Run the scoped host and ColdFire checks through Modwerk's normal test discovery."""
from pathlib import Path
import subprocess
import sys
import unittest


class ClypsDraft(unittest.TestCase):
    def test_coldfire_link_and_performance_callbacks(self):
        subprocess.run([sys.executable, '-B', Path(__file__).with_name('verify.py')], check=True)
