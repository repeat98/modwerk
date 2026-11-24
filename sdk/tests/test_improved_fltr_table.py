# SPDX-License-Identifier: GPL-3.0-or-later
"""Improved FLTR (Analog Rytm MKII): src/width-table.h matches tools/calibration.json, and the table is sane."""
from pathlib import Path
import importlib.util
import unittest

ROOT = Path(__file__).resolve().parents[2]
TOOLS = ROOT / 'sdk/analog-rytm-mkii/modules/improved-fltr/tools'


def load():
    spec = importlib.util.spec_from_file_location('improved_fltr_width_table', TOOLS / 'width_table.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class WidthTable(unittest.TestCase):
    def test_header_is_current(self):
        wt = load()
        self.assertEqual(wt.OUT.read_text(), wt.text(), 'src/width-table.h is stale: run tools/width_table.py')

    def test_wider_bands_take_lower_words_and_less_gain(self):
        words, log2q, gain, log2u, att = load().tables()
        self.assertEqual(len(words), 62)
        for w in range(1, 61):                  # 1..60 semitones, the widths band.s uses
            self.assertGreaterEqual(words[w], words[w + 1])
            self.assertGreaterEqual(log2q[w], log2q[w + 1])
            self.assertGreaterEqual(gain[w], gain[w + 1])
        self.assertTrue(all(-32768 <= v < 0x7f00 for v in words))
        self.assertEqual(len(log2u), 513)
        self.assertTrue(all(a <= b for a, b in zip(log2u, log2u[1:])))
        self.assertTrue(all(0 <= v < 256 for v in att))


if __name__ == '__main__':
    unittest.main()
