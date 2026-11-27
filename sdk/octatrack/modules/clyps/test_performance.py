"""Compile the selected performance adapter with the same callbacks as the module."""
from pathlib import Path
import subprocess
import tempfile
import unittest


class PerformancePanel(unittest.TestCase):
    def test_row_advance_and_context(self):
        here = Path(__file__).resolve().parent
        sdk = next(p for p in here.parents if (p/'runtime/loader/modwerk_module.h').exists())
        with tempfile.TemporaryDirectory() as tmp:
            exe = Path(tmp)/'performance-host'
            subprocess.run(['cc','-std=c99','-Wall','-Wextra','-Werror','-I',sdk/'runtime/loader',
                            here/'tests/performance_host.c','-o',exe],check=True)
            subprocess.run([exe],check=True)
            subprocess.run([exe, 'fresh-session'],check=True)
            for transport in ('stop', 'play'):
                for read in ('eof', 'complete'):
                    for order in ('init-first', 'read-first'):
                        with self.subTest(transport=transport, read=read, order=order):
                            subprocess.run([exe, transport, read, order], check=True)


if __name__ == '__main__':
    unittest.main()
