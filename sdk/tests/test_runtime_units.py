# SPDX-License-Identifier: GPL-3.0-or-later
"""Native linked preparation regressions using authored, firmware-free fixtures."""
import hashlib
import importlib.util
from pathlib import Path
import shutil
import struct
import sys
import tempfile
from types import SimpleNamespace
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.append(str(ROOT / 'sdk/machines/octatrack/module-adapters'))
import runtime_tables
import runtime_units
spec = importlib.util.spec_from_file_location('table_fixture_builder', ROOT / 'sdk/runtime/loader/build.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


@unittest.skipUnless(shutil.which('m68k-elf-as') and shutil.which('m68k-elf-ld'), 'ColdFire binutils unavailable')
class RuntimeUnits(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.root = Path(self.folder.name)
        self.sdk = self.root / 'sdk'
        self.sdk.mkdir()
        (self.sdk / 'row.s').write_text('.include "remix.inc"\n.text\n.global entry\nentry:\n.ifdef SC_KEY\nnop\n.endif\nrts\n')
        self.unit = SimpleNamespace(label='row', source='row.s', defsyms=(), stock_copies=(),
                                    include=lambda selected: '.set SC_KEY,1\n' if 'SC' in selected else '| no SC\n',
                                    reference_for=lambda selected: (0x40003000, hashlib.sha256(
                                        bytes.fromhex('4e714e75' if 'SC' in selected else '4e75')).hexdigest()))
        table = SimpleNamespace(old=0x40001000, count=16, insert_at=2,
                                symbols=(('row', 'entry'),), refs=((0x40002002, 0x40001000),))
        self.module = SimpleNamespace(key='TEST', name='test', linked=(self.unit,), tables=(table,), detours=(), pokes=(),
                                      symbol_refs=(), requires=(), keeps=(), dram_regions=(), overrides=(),
                                      cf_patches=(), dsp=None)
        self.data = struct.pack('>16I', *range(0x40004000, 0x40004040, 4))
        self.guard = runtime_tables.capture(table, self.read)

    def read(self, address, n):
        if 0x40001000 <= address and address + n <= 0x40001040:
            return self.data[address - 0x40001000:address - 0x40001000 + n]
        if address == 0x40002002 and n == 4:
            return struct.pack('>I', 0x40001000)
        if address == 0x40002100 and n == 6:
            return b'\x4e\x71' * 3
        raise ValueError('Outside authored synthetic fixture')

    def prepare(self, name='work', selected=frozenset({'TEST'}), selected_builder=builder):
        return runtime_units.compile_linked(self.module, self.sdk, selected_builder, self.root / name,
                                            'm68k-elf-', selected, [self.guard], self.read)

    def test_real_assembly_and_callable_variant_match_their_own_references(self):
        normal = self.prepare()
        variant = self.prepare('with-sc', {'TEST', 'SC'})
        self.assertTrue(normal['tableOracle'] and variant['tableOracle'])
        self.assertEqual(normal['origins'], [0, 0x10000])
        self.assertEqual(len(normal['copies']), 3)
        self.assertNotEqual(normal['referenceProofs'][0]['sha256'], variant['referenceProofs'][0]['sha256'])
        self.assertEqual(len(normal['sites']), 1)
        self.assertEqual(normal['hooks'], [])

    def test_runtime_json_subscribes_and_assembles_the_event_form(self):
        normal = self.prepare()
        (self.sdk / 'row.s').write_text('.include "remix.inc"\n.text\n.global entry\nentry:\n.ifdef SC_KEY\nnop\n.endif\n'
                                        '.ifdef MODWERK_EVENTS\nnop\nnop\n.endif\nrts\n')
        (self.sdk / 'modules/test').mkdir(parents=True)
        (self.sdk / 'modules/test/runtime.json').write_text(
            '{"schema": 1, "subscribe": [{"event": "ev_play_increment", "fn": "entry", "order": 40}]}')
        evented = self.prepare('evented')  # the native reference still holds: only the package form changes
        self.assertEqual(len(evented['image']), len(normal['image']) + 4)
        index = next(e['index'] for e in builder.site_events()['events'] if e['event'] == 'ev_play_increment')
        self.assertEqual(len(evented['hooks']), index + 1)
        self.assertEqual(evented['hooks'][index], 40 << 24 | evented['symbols']['entry'])

    def test_a_raising_package_asks_for_the_entry_by_index_and_may_take_the_tick(self):
        normal = self.prepare()
        (self.sdk / 'row.s').write_text('.include "remix.inc"\n.text\n.global entry\nentry:\n.ifdef SC_KEY\nnop\n.endif\n'
                                        '.ifdef MODWERK_EVENTS\nmovea.l raise_ev_mute_keep,%a0\njsr (%a0)\n.endif\nrts\n'
                                        '.ifdef MODWERK_EVENTS\n.balign 4\n.global raise_ev_mute_keep\nraise_ev_mute_keep: .long 0\n.endif\n')
        (self.sdk / 'modules/test').mkdir(parents=True)
        (self.sdk / 'modules/test/runtime.json').write_text(
            '{"schema": 1, "subscribe": [{"event": "module_tick", "fn": "entry"}], "raise": ["ev_mute_keep"]}')
        raised = self.prepare('raised')  # the native reference still holds; no base is named anywhere
        index = next(e['index'] for e in builder.site_events()['events'] if e['event'] == 'ev_mute_keep')
        slot = raised['symbols']['raise_ev_mute_keep']
        self.assertEqual(raised['image'][slot:slot + 4], bytes(4))         # the loader fills it at install
        self.assertEqual(raised['hooks'][0], raised['symbols']['entry'])     # the core tick: its offset, no order
        self.assertEqual(raised['hooks'][index], builder.RAISE << 24 | slot)
        self.assertNotIn(slot, raised['offsets'])
        (self.sdk / 'row.s').write_text((self.sdk / 'row.s').read_text().replace('raise_ev_mute_keep: .long 0', 'other: .long 0')
                                        .replace('.global raise_ev_mute_keep', '').replace('movea.l raise_ev_mute_keep', 'movea.l other'))
        with self.assertRaisesRegex(ValueError, 'raise_ev_mute_keep'):  # no slot for the entry
            self.prepare('no-slot')
        raw = runtime_units.compile_linked(self.module, self.sdk, builder, self.root / 'raw', 'm68k-elf-', {'TEST'},
                                           [self.guard], self.read, events=False)
        self.assertEqual((raw['image'], raw['hooks']), (normal['image'], []))

    def test_runtime_json_rests_mark_its_own_detours_in_the_package(self):
        (self.sdk / 'row.s').write_text('.include "remix.inc"\n.text\n.global entry\nentry:\n.ifdef SC_KEY\nnop\n.endif\nrts\n'
                                        '.ifdef MODWERK_EVENTS\n.global hook\nhook:\nrts\n.global in_use\nin_use:\nmoveq #0,%d0\nrts\n.endif\n')
        self.module.detours = (SimpleNamespace(site=0x40002100, expect=b'\x4e\x71' * 3, unit='row', symbol='hook',
                                               target=None, kind='jmp', pad_to=None),)
        (self.sdk / 'modules/test').mkdir(parents=True)
        declaration = self.sdk / 'modules/test/runtime.json'
        declaration.write_text('{"schema": 1, "subscribe": [{"event": "ev_in_use", "fn": "in_use", "order": 50}], '
                               '"rests": ["0x40002100"]}')
        result = self.prepare()
        data = builder.package(result['image'], result['bss'], result['hooks'], result['offsets'], result['sites'],
                               name='test', hashed=True, title='TEST', layout=1, copies=result['copies'], abi=8)
        length = lambda address: data[data.index(struct.pack('>I', address)) + 4]
        self.assertEqual(length(0x40002100), 6 | builder.REST_FLAG)  # the detour rests with the module ...
        self.assertEqual(length(0x40002002), 4)                       # ... a table reference never
        declaration.write_text(declaration.read_text().replace('0x40002100', '0x40002002'))
        with self.assertRaisesRegex(ValueError, 'only its own detours'):
            self.prepare('table-rests')

    def test_source_drift_and_mismatched_callable_variant_are_refused(self):
        (self.sdk / 'row.s').write_text('.text\n.global entry\nentry:\nnop\nrts\n')
        with self.assertRaisesRegex(ValueError, 'reference changed'):
            self.prepare()
        (self.sdk / 'row.s').write_text('.include "remix.inc"\n.text\n.global entry\nentry:\n.ifdef SC_KEY\nnop\n.endif\nrts\n')
        normal_reference = self.unit.reference_for({'TEST'})
        self.unit.reference_for = lambda selected: normal_reference
        with self.assertRaisesRegex(ValueError, 'reference changed'):
            self.prepare('wrong-variant', {'TEST', 'SC'})

    def test_missing_relocation_is_detected_by_fresh_high_origin_image(self):
        broken = SimpleNamespace(**vars(builder))
        original = builder.link_units
        def omit(objects, cross, origin, work):
            image, symbols, bss, offsets = original(objects, cross, origin, work)
            self.assertTrue(offsets)
            return image, symbols, bss, offsets[1:]
        broken.link_units = omit
        with self.assertRaisesRegex(ValueError, 'high-origin'):
            self.prepare(selected_builder=broken)

    def test_dependencies_external_sources_and_changed_table_guards_are_refused(self):
        self.module.requires = ('unported',)
        with self.assertRaisesRegex(ValueError, 'unported resource'):
            self.prepare()
        self.assertFalse((self.root / 'work').exists())
        self.module.requires = ()
        self.unit.source = '../outside.s'
        with self.assertRaisesRegex(ValueError, 'external symbols'):
            self.prepare()
        self.unit.source = 'row.s'
        self.data = b'\1' + self.data[1:]
        with self.assertRaisesRegex(ValueError, 'stock table'):
            self.prepare('changed-stock')


if __name__ == '__main__':
    unittest.main()
