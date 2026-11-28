"""Runs Freeze's host gate (verify.py) under npm run sdk:check and module:doctor."""
import pathlib
import runpy
import sys
import unittest


class FreezeHostGate(unittest.TestCase):
    def test_gate(self):
        sys.argv = [str(pathlib.Path(__file__).with_name('verify.py'))]
        with self.assertRaises(SystemExit) as done:
            runpy.run_path(sys.argv[0], run_name='__main__')
        self.assertIn(done.exception.code, (0, 77))


if __name__ == '__main__':
    unittest.main()
