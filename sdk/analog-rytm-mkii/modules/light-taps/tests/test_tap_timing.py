# SPDX-License-Identifier: GPL-3.0-or-later
"""Light Taps' timing on the host: builds tests/tap_timing.c, which includes
src/main.c with the panel driver's addresses replaced, and runs its cases.
No firmware, unit or emulator. Skips without a C compiler."""

import os
import shutil
import subprocess
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
CC = shutil.which("cc") or shutil.which("gcc") or shutil.which("clang")


@unittest.skipUnless(CC, "no C compiler on this computer")
class TapTiming(unittest.TestCase):
    def test_cases(self):
        with tempfile.TemporaryDirectory() as tmp:
            exe = os.path.join(tmp, "tap_timing")
            subprocess.run([CC, "-std=c99", "-Wall", "-Wextra", "-Werror", "-o", exe,
                            os.path.join(HERE, "tap_timing.c")], check=True)
            run = subprocess.run([exe], capture_output=True, text=True)
        lines = run.stdout.splitlines()
        self.assertTrue(lines, "the test printed nothing")
        failed = [line for line in lines if not line.startswith("ok ")]
        self.assertEqual(failed, [], "\n".join(failed))
        self.assertEqual(run.returncode, 0)


if __name__ == "__main__":
    unittest.main()
