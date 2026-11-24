# SPDX-License-Identifier: GPL-3.0-or-later
"""Linked private trust storage stays bounded and empty before declaration filling."""
import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('base_trust_storage_builder',
    ROOT / 'sdk/machines/octatrack/elekloader/build_core.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


def fixture():
    start, load, run = 0x40a955e0, 0x40000400, 0x40000500
    image = bytearray(256 + 2528)
    image[256:1328] = b'MWMD' + bytes((2, 0, 24)) + bytes(1065)
    image[1328:] = b'MWTD' + bytes((1, 0, 24)) + bytes(1449)
    return image, {'modwerk_machine_declarations': start,
                   'modwerk_table_declarations': start + 1072}, \
        {'ddr': [start, start + 2528], 'run_load': run}, load


class TrustStorage(unittest.TestCase):
    def test_complete_linked_reservations_and_unused_records(self):
        image, mapping, layout, load = fixture()
        proof = builder.check_trust_storage(image, mapping, layout, load)
        self.assertEqual([entry['bytes'] for entry in proof.values()], [1072, 1456])
        self.assertTrue(all(entry['count'] == 0 for entry in proof.values()))
        for at in (256, 261, 262, 1327, 1328, 1333, 2783):
            changed = bytearray(image)
            changed[at] ^= 1
            with self.subTest(offset=at), self.assertRaises(ValueError):
                builder.check_trust_storage(changed, mapping, layout, load)

    def test_missing_symbols_uninitialized_storage_and_truncation_are_refused(self):
        image, mapping, layout, load = fixture()
        for changed in ({}, dict(mapping, modwerk_machine_declarations=True),
                        dict(mapping, modwerk_table_declarations=layout['ddr'][1]),
                        dict(mapping, modwerk_table_declarations=layout['ddr'][0] + 1070),
                        dict(mapping, modwerk_table_declarations=layout['ddr'][0])):
            with self.subTest(mapping=changed), self.assertRaises(ValueError):
                builder.check_trust_storage(image, changed, layout, load)
        with self.assertRaises(ValueError):
            builder.check_trust_storage(image[:-1], mapping, layout, load)
        for changed in ({}, dict(layout, ddr=[layout['ddr'][0]]),
                        dict(layout, run_load=True), dict(layout, run_load=load - 1)):
            with self.subTest(layout=changed), self.assertRaises(ValueError):
                builder.check_trust_storage(image, mapping, changed, load)


class ReplaceLiteral(unittest.TestCase):
    """Synthetic parts: a reservation the builder partly stored as a stock reference, as an empty one can be."""
    stock = bytes(range(16)) + bytes(4) + bytes((0x18, 0, 0, 0)) + bytes(range(100, 116))

    def stock_at(self, address, n):
        return self.stock[address - 0x1000:address - 0x1000 + n]

    def test_a_stock_reference_that_reproduces_the_reservation_splits_around_it(self):
        parts = [['hex', 'aabb'], ['stock', '0x00001010', 8], ['hex', 'ccdd']]
        empty = self.stock_at(0x1010, 8)
        self.assertEqual(builder.replace_literal(parts, 2, empty, bytes(range(1, 9)), self.stock_at),
                         [['hex', 'aabb'], ['hex', '0102030405060708'], ['hex', 'ccdd']])
        self.assertEqual(builder.replace_literal(parts, 4, empty[2:6], b'\1\2\3\4', self.stock_at),
                         [['hex', 'aabb'], ['stock', '0x00001010', 2], ['hex', '01020304'],
                          ['stock', '0x00001016', 2], ['hex', 'ccdd']])
        across = [['hex', '0000']] + parts[1:]
        self.assertEqual(builder.replace_literal(across, 0, bytes(2) + empty, bytes(range(1, 11)), self.stock_at),
                         [['hex', '0102'], ['hex', '030405060708090a'], ['hex', 'ccdd']])

    def test_the_base_digest_becomes_literal_where_its_end_was_stored_as_stock(self):
        # build_core.py keeps IDENTIFY's digest authored: a hash ending in 0x00 before zero padding can be stored as
        # the start of a stock reference, and the site's baseIdentity then refuses the package.
        digest = bytes(range(1, 32)) + bytes(1)
        parts = [['hex', digest[:31].hex()], ['stock', '0x00001010', 8]]
        self.assertEqual(builder.replace_literal(parts, 0, digest, digest, self.stock_at),
                         [['hex', digest[:31].hex()], ['hex', '00'], ['stock', '0x00001011', 7]])

    def test_a_stock_reference_that_differs_or_cannot_be_read_is_refused(self):
        parts = [['stock', '0x00001000', 8]]
        with self.assertRaises(ValueError):
            builder.replace_literal(parts, 0, bytes(8), bytes(range(8)), self.stock_at)
        with self.assertRaises(ValueError):
            builder.replace_literal([['stock', '0x00001010', 8]], 0, bytes(8), bytes(8), None)
        with self.assertRaises(ValueError):
            builder.replace_literal([['fill', 'x', 8]], 0, bytes(8), bytes(8), self.stock_at)


if __name__ == '__main__':
    unittest.main()
