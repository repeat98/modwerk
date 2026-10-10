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



class UsbBaseTests(unittest.TestCase):
    """The base's own configuration and sites, with synthetic stock bytes only."""
    def setUp(self):
        import hashlib, importlib.util, pathlib
        import usb_base
        self.usb, self.sha = usb_base, lambda data: hashlib.sha256(data).hexdigest()
        path = pathlib.Path(__file__).resolve().parents[3] / 'octabam/platform/usb-midi/descriptors.py'
        spec = importlib.util.spec_from_file_location('usbmidi_descriptors', path)
        self.midi = importlib.util.module_from_spec(spec); spec.loader.exec_module(self.midi)

    def test_mass_storage_is_usb_midis_and_the_vendor_interface_follows(self):
        for hs in (True, False):
            for other in (True, False):
                cfg = self.usb.configuration(hs, other)
                self.assertEqual(len(cfg), 41)
                self.assertEqual(cfg[:9], bytes([9, 7 if other else 2, 41, 0, 2, 1, 0, 0xc0, 3]))
                self.assertEqual(cfg[9:32], self.midi.midi_config(hs, other)[9:32])
                self.assertEqual(cfg[32:], bytes([9, 4, 1, 0, 0, 0xff, 0x4d, 1, 0]))

    def test_assembly_aligns_each_table_and_keeps_the_stock_rejoins(self):
        text = self.usb.assembly()
        self.assertIn('.set modwerk_cfg_len, 41', text)
        self.assertEqual(text.count('    .balign 64\n'), 4)
        for name in self.usb.tables():
            self.assertIn('\n%s:\n' % name, text)
        for rejoin in ('0x4001d864', '0x4001d8a2', '0x4001de5c', '0x4001de6a', '0x4001de74',
                       '0x4001e60c', '0x4001e922', '0x4001e958', 'olog_idle_hook'):
            self.assertIn('jmp     ' + rejoin, text)
        self.assertIn('orl     #0x00010001,%d0', text)

    def image(self, changes=()):
        stock = {addr: expected.to_bytes(4, 'big') for addr, expected, _ in self.usb.POINTERS}
        for addr, length, _, _ in self.usb.DETOURS:
            stock[addr] = bytes(range(addr & 0xff, (addr & 0xff) + length))
        stock.update(changes)
        return stock, lambda addr, n: stock[addr][:n]

    def guarded(self, stock):
        return tuple((addr, length, self.sha(stock[addr]), symbol) for addr, length, _, symbol in self.usb.DETOURS)

    def test_sites_replace_six_bytes_and_point_at_the_tables(self):
        stock, image_at = self.image()
        original = self.usb.DETOURS
        try:
            self.usb.DETOURS = self.guarded(stock)
            sites = self.usb.sites(image_at)
        finally:
            self.usb.DETOURS = original
        self.assertEqual([s['target'] for s in sites if s['op'] == 'ptr'],
                         ['modwerk_cfg_fs', 'modwerk_cfg_hs', 'modwerk_cfg_os_hs', 'modwerk_cfg_os_fs'])
        jumps = [s for s in sites if s['op'] == 'jmp']
        self.assertEqual([s['target'] for s in jumps], ['modwerk_usb_clamp1', 'modwerk_usb_clamp2', 'modwerk_ep0_shim',
                                                        'modwerk_ep0_poll_shim', 'modwerk_bus_reset_shim',
                                                        'modwerk_session_end_shim'])
        self.assertTrue(all(len(bytes.fromhex(s['stock'])) == 6 for s in jumps))

    def test_any_changed_stock_byte_is_refused_including_skipped_ones(self):
        stock, _ = self.image()
        guards = self.guarded(stock)
        clamp = self.usb.DETOURS[0][0]
        for changes in ({self.usb.POINTERS[0][0]: b'\x40\x0e\x20\x00'},
                        {clamp: stock[clamp][:11] + b'\xff'}):
            _, image_at = self.image(changes)
            original = self.usb.DETOURS
            try:
                self.usb.DETOURS = guards
                with self.subTest(changes=list(changes)), self.assertRaisesRegex(ValueError, 'not stock'):
                    self.usb.sites(image_at)
            finally:
                self.usb.DETOURS = original


if __name__ == '__main__':
    unittest.main()
