#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Source recipe checks using only authored synthetic bytes; no firmware."""
import unittest

from build_core import stock_reference


class StockReplayTests(unittest.TestCase):
    def test_span_crosses_source_parts_without_changing_neighbors(self):
        parts = [['hex', 'aa0000000000'], ['hex', '00000000bb'], ['stock', '0x1234', 8]]
        self.assertEqual(stock_reference(parts, 1, 9, 0x40000000),
                         [['hex', 'aa'], ['stock', '0x40000000', 9],
                          ['hex', 'bb'], ['stock', '0x1234', 8]])

    def test_rejects_nonzero_instruction_in_replay_placeholder(self):
        with self.assertRaisesRegex(ValueError, 'zero source placeholder'):
            stock_reference([['hex', '0000000100000000']], 0, 8, 0x40000000)

    def test_rejects_existing_stock_reference_in_replay_span(self):
        with self.assertRaisesRegex(ValueError, 'zero source placeholder'):
            stock_reference([['stock', '0x1234', 8]], 0, 8, 0x40000000)

    def test_rejects_span_outside_source(self):
        for offset, length in ((0, 9), (8, 1), (-1, 1), (0, 0)):
            with self.subTest(offset=offset, length=length), self.assertRaises(ValueError):
                stock_reference([['hex', '00' * 8]], offset, length, 0x40000000)

    def test_replaces_whole_source_part(self):
        self.assertEqual(stock_reference([['hex', '00' * 8]], 0, 8, 0x40000000),
                         [['stock', '0x40000000', 8]])


if __name__ == '__main__':
    unittest.main()
