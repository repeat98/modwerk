"""UNGEMACH's host tests: the engine under UBSan and ASan (test_engine.c), and the calibration tool builds.

Runs with no arguments from the checkout root; skips when no host C compiler is here."""
import pathlib
import shutil
import subprocess
import tempfile
import unittest

HERE = pathlib.Path(__file__).resolve().parent
CC = shutil.which('cc') or shutil.which('gcc')
SANITIZE = ['-std=c99', '-O1', '-g', '-fsanitize=undefined,address', '-fno-sanitize-recover=all']


@unittest.skipUnless(CC, 'no host C compiler')
class Engine(unittest.TestCase):
    def test_engine(self):
        with tempfile.TemporaryDirectory() as folder:
            exe = pathlib.Path(folder) / 'engine'
            subprocess.run([CC, *SANITIZE, '-o', str(exe), 'engine.c', 'test_engine.c', '-lm'], cwd=HERE, check=True)
            out = subprocess.run([str(exe)], cwd=HERE, check=True, capture_output=True, text=True).stdout
            self.assertIn('all passed', out)

    def test_calibration_builds(self):
        with tempfile.TemporaryDirectory() as folder:
            subprocess.run([CC, '-std=c99', '-O2', '-Wall', '-Wextra', '-Werror', '-o', str(pathlib.Path(folder) / 'calib'),
                            'calib_waves.c', 'engine.c', '-lm'], cwd=HERE, check=True)


if __name__ == '__main__':
    unittest.main()
