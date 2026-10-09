#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Source recipe checks using only authored synthetic bytes; no firmware."""
import unittest
from types import SimpleNamespace

from build_core import stock_reference
from build_ports import check_table_contract, register_platform


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


class PlatformDependencyTests(unittest.TestCase):
    def registry(self):
        return SimpleNamespace(modules={}, broken={}, by_key={}, _ok={'consumer': False})

    def module(self, **changes):
        return SimpleNamespace(**dict(dict(name='usb-midi', key='USB MIDI',
                                           linked=(SimpleNamespace(source='platform/usb-midi/unit.s'),)), **changes))

    def test_registers_internal_dependency_and_invalidates_conversion_cache(self):
        registry, module = self.registry(), self.module()
        register_platform(registry, 'usb-midi', module)
        self.assertIs(registry.modules['usb-midi'], module)
        self.assertEqual(registry.by_key, {'USB MIDI': 'usb-midi'})
        self.assertEqual(registry._ok, {})

    def test_collision_preserves_existing_registry(self):
        for field, key in (('modules', 'usb-midi'), ('broken', 'usb-midi'), ('by_key', 'USB MIDI')):
            registry = self.registry()
            getattr(registry, field)[key] = 'existing'
            with self.subTest(field=field), self.assertRaisesRegex(ValueError, 'collides'):
                register_platform(registry, 'usb-midi', self.module())
            self.assertEqual(getattr(registry, field), {key: 'existing'})
            self.assertEqual(registry._ok, {'consumer': False})

    def test_rejects_mismatched_identity_or_source_without_registering(self):
        for changes in ({'name': 'other'}, {'key': ''}, {'linked': ()},
                        {'linked': (SimpleNamespace(source='modules/other/unit.s'),)},
                        {'linked': (SimpleNamespace(source='platform/usb-midi/../other.s'),)}):
            registry = self.registry()
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                register_platform(registry, 'usb-midi', self.module(**changes))
            self.assertEqual(registry.modules, {})
            self.assertEqual(registry.by_key, {})
            self.assertEqual(registry._ok, {'consumer': False})


class TableContractTests(unittest.TestCase):
    def test_accepts_append_contract(self):
        for position in (None, 16):
            check_table_contract(SimpleNamespace(tables=(SimpleNamespace(insert_at=position, count=16),)))

    def test_refuses_insertions_the_converter_and_its_oracle_both_miss(self):
        for position in (0, 2, 15):
            with self.subTest(position=position), self.assertRaisesRegex(ValueError, 'PERSONALIZE'):
                check_table_contract(SimpleNamespace(tables=(SimpleNamespace(insert_at=position, count=16, label='PERSONALIZE'),)))


if __name__ == '__main__':
    unittest.main()
