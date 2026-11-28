"""Protect the monotone window-half contract used by the native mixer."""
import ctypes
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


MODULE = Path(__file__).resolve().parents[2]


class WindowTables(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        compiler = shutil.which('cc')
        if not compiler:
            raise unittest.SkipTest('host C compiler unavailable')
        directory = tempfile.TemporaryDirectory(prefix='fract-window-tables-')
        cls.addClassCleanup(directory.cleanup)
        work = Path(directory.name)
        source = work / 'tables.c'
        source.write_text(
            '#define OG_NATIVE_STAGE_ONE\n#define OG_WINDOW_STORAGE\n'
            '#include "window.h"\n'
            'const unsigned table_counts[] = {'
            'sizeof og_hann_gain / sizeof *og_hann_gain,'
            'sizeof og_shape_gain / sizeof *og_shape_gain,'
            'sizeof og_shape_rows / sizeof *og_shape_rows};\n')
        library = work / 'tables.so'
        subprocess.run([compiler, '-std=c11', '-shared', '-fPIC',
                        '-I' + str(MODULE / 'support'), str(source),
                        '-o', str(library)], check=True, capture_output=True)
        cls.library = ctypes.CDLL(str(library))
        counts = (ctypes.c_uint * 3).in_dll(cls.library, 'table_counts')
        cls.hann = (ctypes.c_uint16 * counts[0]).in_dll(cls.library, 'og_hann_gain')
        cls.gains = (ctypes.c_uint16 * counts[1]).in_dll(cls.library, 'og_shape_gain')
        cls.rows = (ctypes.c_uint32 * counts[2]).in_dll(cls.library, 'og_shape_rows')

    def test_every_authored_window_half_is_monotone(self):
        halves = [('Hann', list(self.hann))]
        for index, row in enumerate(self.rows, 1):
            attack, release = (row >> 8) & 4095, row >> 20
            segments = row & 255
            for name, offset, length in [('attack', attack, segments),
                                         ('release', release, 128 - segments)]:
                self.assertLessEqual(offset + length + 1, len(self.gains))
                halves.append((f'SHPE {index} {name}',
                               list(self.gains[offset:offset + length + 1])))
        for name, values in halves:
            with self.subTest(half=name):
                self.assertTrue(values)
                self.assertTrue(all(left <= right
                                    for left, right in zip(values, values[1:])),
                                'equal constant endpoints must bound a constant interval')


if __name__ == '__main__':
    unittest.main()
