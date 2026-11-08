"""Exact imported source and real native controller relocation preparation."""
import importlib.util
from pathlib import Path
import re
import shutil
import struct
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
ADAPTERS = ROOT / 'sdk/machines/octatrack/module-adapters'
sys.path.insert(0, str(ADAPTERS))
import stock_hook_controllers as controllers
spec = importlib.util.spec_from_file_location('stock_hook_controller_builder', ROOT / 'sdk/runtime/loader/build.py')
builder = importlib.util.module_from_spec(spec); spec.loader.exec_module(builder)
SDK = ROOT / 'sdk/octabam'
UPSTREAM = Path.home() / '.cache/modwerk-upstream/elekloader'


class StockHookControllers(unittest.TestCase):
    def test_every_imported_controller_input_is_pinned_and_unknown_modules_refuse(self):
        for name in controllers.UNITS:
            with tempfile.TemporaryDirectory() as tmp:
                sdk = Path(tmp)
                for relative, text in controllers.sources(name, SDK).items():
                    path = sdk / relative; path.parent.mkdir(parents=True, exist_ok=True); path.write_bytes(text.encode())
                self.assertEqual(controllers.sources(name, sdk), controllers.sources(name, SDK))
                path.write_bytes((text + '\n').encode())
                with self.assertRaisesRegex(ValueError, 'source changed'):
                    controllers.sources(name, sdk)
        for name in ('analog-bassdrum', 'character', '../output-matrix'):
            with self.assertRaisesRegex(ValueError, 'No reviewed'):
                controllers.sources(name, SDK)

    @unittest.skipUnless(shutil.which('m68k-elf-as'), 'ColdFire assembler unavailable')
    def test_actual_authored_reference_and_two_origin_native_reconstruction(self):
        for name in controllers.UNITS:
            for imports in (None, {'modwerk_controller_write_begin': 0x47410000, 'modwerk_controller_write_end': 0x47410100}):
                with tempfile.TemporaryDirectory() as tmp:
                    result = controllers.compile_original(name, SDK, builder, Path(tmp),
                        pool_origins=(0x40c10000, 0x40c20000), fixture_imports=imports)
                    self.assertGreater(len(result['image']), 0)
                    self.assertEqual(len(result['nativePools']), 2)
                    self.assertIsNone(result['encodedSha256'])
                    self.assertFalse(result['productionLeaseBound'])
                    self.assertFalse(result['admission'])
                    self.assertEqual(result['matrixModeLeased'], name == 'output-matrix')

    @unittest.skipUnless(shutil.which('m68k-elf-as'), 'ColdFire assembler unavailable')
    def test_native_adaptation_requires_strong_backend_and_refuses_unqualified_mode_writes(self):
        for name in controllers.UNITS:
            with tempfile.TemporaryDirectory() as tmp:
                source=Path(tmp)/'controller.s'; obj=Path(tmp)/'controller.o'
                source.write_text(controllers.adapted_source(name, SDK))
                subprocess.run(['m68k-elf-as', '-mcpu=54455', source, '-o', obj], check=True, capture_output=True)
                symbols=subprocess.check_output(['m68k-elf-nm',obj],text=True)
                for entry in ('modwerk_controller_write_begin','modwerk_controller_write_end'):
                    self.assertIn(' U '+entry, symbols)
                self.assertNotIn(' W ',symbols)
                text=source.read_text()
                for entry in controllers.UNITS[name][2]:
                    self.assertEqual(text.count('\n%s:\n' % entry), 1)
                    self.assertIn(entry + '_begun:', text); self.assertIn(entry + '_ended:', text)
                # A frame hook leases only when its body would write: its precheck reads, writes only
                # its own stack frame and registers, and returns before Begin.
                entry = {'sidechain-compressor': 'sc_norm', 'output-matrix': 'page_levels'}[name]
                precheck = text[text.index('\n%s:\n' % entry):text.index('jsr modwerk_controller_write_begin',
                                                                          text.index('\n%s:\n' % entry))]
                self.assertEqual(precheck.count('        rts'), 1)
                for line in precheck.splitlines():
                    code = line.split('|')[0].split()
                    if not code or code[0].endswith(':') or code[0].startswith(('b', 'cmp', 'tst', 'jsr', 'rts', 'pea', '.')):
                        continue
                    operands, depth, part = [], 0, ''
                    for ch in ' '.join(code[1:]):
                        depth += ch == '('; depth -= ch == ')'
                        if ch == ',' and not depth: operands.append(part); part = ''
                        else: part += ch
                    operands.append(part)
                    target = operands[-1].strip()
                    self.assertTrue(re.fullmatch(r'%(?:[ad][0-7]|sp|ccr)(?:[-/]%[ad][0-7])*|-?\d*\(%sp\)', target), line)
                if name=='output-matrix':
                    # The authored conversion runs only through the leased entries; its CC
                    # notification and the redraw are outside every held span.
                    body = text[text.index('mw_matrix_mode_body:'):text.index('mw_matrix_notify:')]
                    self.assertNotIn('jsr     MENU_REDRAW', body); self.assertNotIn('jsr     CC_OUT', body)
                    self.assertIn('bsr     convert_all', body)
                    front = text[text.index('set_mode:'):text.index('mw_matrix_mode_body:')]
                    self.assertIn('bsr     matrix_enter', front); self.assertIn('bsr     matrix_leave', front)
        for imports in ({}, {'modwerk_controller_write_begin': 0x08000000, 'modwerk_controller_write_end': 0x47410100}):
            with tempfile.TemporaryDirectory() as tmp:
                with self.assertRaisesRegex(ValueError, 'exact bounded strong'):
                    controllers.compile_original('output-matrix', SDK, builder, Path(tmp), fixture_imports=imports)

    @unittest.skipUnless(shutil.which('m68k-elf-as') and (UPSTREAM / 'elekloader/sdk/octabam.py').is_file(),
                         'ColdFire assembler or Elekloader checkout unavailable')
    def test_encoded_packages_are_base_bound_and_deterministic(self):
        base = {'modwerk_controller_write_begin': 0x41234560, 'modwerk_controller_write_end': 0x41234600,
                'modwerk_cue_cfg_clamp': 0x41234680}
        for name in controllers.UNITS:
            with tempfile.TemporaryDirectory() as one, tempfile.TemporaryDirectory() as two:
                a = controllers.encode(name, SDK, builder, Path(one), base, UPSTREAM)
                b = controllers.encode(name, SDK, builder, Path(two), base, UPSTREAM)
                self.assertEqual(a['package'], b['package'])
                data = a['package']
                self.assertEqual(data[:4], b'MWRM'); self.assertEqual(struct.unpack('>H', data[4:6])[0], 7)
                self.assertEqual(struct.unpack('>I', data[28:32])[0], builder.module_id(name))
                image = data[76 - 4:]  # ABI 7: 72-byte header, no hooks
                self.assertEqual(struct.unpack('>I', data[8:12])[0], a['imageBytes'])
                # The lease entries are absolute base addresses, never relocated.
                for key in controllers.LEASE_IMPORTS:
                    self.assertIn(struct.pack('>I', base[key]), data)
                rows = controllers.policy_rows(name, a)
                self.assertEqual([r['entryName'] for r in rows], list(controllers.DEFAULT_ENTRIES[name]))
                self.assertIn('{{{0x', controllers.policies_c(rows))
                with tempfile.TemporaryDirectory() as three:
                    moved = controllers.encode(name, SDK, builder, Path(three),
                                               dict(base, modwerk_controller_write_end=0x41234700), UPSTREAM)
                self.assertNotEqual(moved['packageSha256'], a['packageSha256'])
            for bad in ({}, dict(base, modwerk_controller_write_begin=0x41234561),
                        dict(base, modwerk_controller_write_end=base['modwerk_controller_write_begin'])):
                with tempfile.TemporaryDirectory() as tmp, self.assertRaisesRegex(ValueError, 'lease entries'):
                    controllers.encode(name, SDK, builder, Path(tmp), bad, UPSTREAM)
        self.assertIn('matrix_enter', controllers.DEFAULT_ENTRIES['output-matrix'])
        # Output Matrix: the base owns its boot widenings, and its stock-equal spans ship as copies.
        with tempfile.TemporaryDirectory() as tmp, self.assertRaisesRegex(ValueError, 'boot widenings'):
            controllers.encode('output-matrix', SDK, builder, Path(tmp),
                               {k: v for k, v in base.items() if k != 'modwerk_cue_cfg_clamp'}, UPSTREAM)
        with tempfile.TemporaryDirectory() as tmp:
            matrix = controllers.encode('output-matrix', SDK, builder, Path(tmp), base, UPSTREAM)
        data = matrix['package']
        self.assertEqual((matrix['sites'], matrix['copies']), (20, len(controllers.STOCK_COPIES['output-matrix'])))
        image = data[72:72 + matrix['imageBytes']]
        for label, delta, address, length, digest in controllers.STOCK_COPIES['output-matrix']:
            self.assertIn(struct.pack('>IIHH', 0, address, length, 0)[4:] + bytes.fromhex(digest), data)
        for address in controllers.BASE_OWNED_SITES['output-matrix']:
            self.assertNotIn(struct.pack('>I', address), data[72 + matrix['imageBytes']:])
        # Sidechain's page record heads its image: COMPRESSOR's descriptor and its stock SHA-256.
        with tempfile.TemporaryDirectory() as tmp:
            sc = controllers.encode('sidechain-compressor', SDK, builder, Path(tmp), base, UPSTREAM)
        image = sc['package'][72:72 + sc['imageBytes']]
        self.assertEqual(image[:5], b'MWPP\x01')
        self.assertEqual(struct.unpack('>I', image[8:12])[0], 0x400d5a82)
        # A base that raises ev_mute_keep: Sidechain answers it (ABI 8 hook word, order 50).
        registry = {'events': [{'event': 'ev_%d' % i, 'index': i} for i in (4, 5, 6)] + [{'event': 'ev_mute_keep', 'index': 7}]}
        raising = dict(base, modwerk_raise_ev_mute_keep=0x41234700)
        with tempfile.TemporaryDirectory() as tmp:
            a = controllers.encode('sidechain-compressor', SDK, builder, Path(tmp), raising, UPSTREAM, registry=registry)
        self.assertEqual(struct.unpack('>H', a['package'][4:6])[0], 8)
        self.assertEqual(len(a['hooks']), 8)
        self.assertEqual(a['hooks'][:7], [builder.NONE] * 7)
        self.assertEqual(a['hooks'][7] >> 24, 50)
        with tempfile.TemporaryDirectory() as tmp:
            plain = controllers.encode('sidechain-compressor', SDK, builder, Path(tmp), base, UPSTREAM, registry=registry)
        self.assertEqual(plain['hooks'], [])
        self.assertEqual(a['entries'], plain['entries'])

    def test_stock_copy_sources_are_patched_by_nobody(self):
        # The gate's own claims (every active module and the committed base): a copy
        # taken from bytes someone patches would depend on install order.
        spec = importlib.util.spec_from_file_location('controller_compat', ROOT / 'scripts/module-compat.py')
        compat = importlib.util.module_from_spec(spec); spec.loader.exec_module(compat)
        _, modules, inputs, _ = compat.repository_inputs()
        copies = {k: list(v) for k, v in inputs['copies'].items()}
        copies.setdefault('output-matrix', []).extend(
            (address, length, 'controller copy') for _, _, address, length, _ in controllers.STOCK_COPIES['output-matrix'])
        problems = compat.check(modules, **dict(inputs, copies=copies))
        self.assertEqual([p['text'] for p in problems if 'output-matrix' in p['modules']], [])

    def test_trust_rows_refuse_malformed_and_duplicate_rows(self):
        row = dict(module='output-matrix', moduleId=0xcaf158b5, controllerSha256='11' * 32, sourcePolicySha256='22' * 32,
                   revisions=[1, 1, 1], feature=2, requiredCores=1, version=1, imageBytes=64, entryName='page_levels',
                   entry=8, beginReturn=16, endReturn=24)
        self.assertEqual(controllers.policies_c([row]).count('\n'), 1)
        # Analog BD's row (base_bound.py): feature 4 on both cores, and nothing else for it.
        self.assertEqual(controllers.policies_c([dict(row, feature=4, requiredCores=3)]).count('\n'), 1)
        for change in (dict(requiredCores=3), dict(feature=4, requiredCores=1), dict(feature=8, requiredCores=3),
                       dict(entry=9), dict(endReturn=64),
                       dict(beginReturn=24), dict(controllerSha256='00' * 32), dict(revisions=[1, 2, 1]), dict(version=2)):
            with self.assertRaises(ValueError):
                controllers.policies_c([dict(row, **change)])
        with self.assertRaises(ValueError):
            controllers.policies_c([row, dict(row)])
        with self.assertRaises(ValueError):
            controllers.policies_c([dict(row, entry=2 * i) for i in range(1, 27)])

    def test_page_record_matches_the_browser_descriptor_clone(self):
        """Sidechain's real MWPP record, applied as controller_board.c's page_stage applies it, to a synthetic
        donor whose enable words are set, equals what src/engine/descriptors.ts composeDescriptors makes from the
        same recipe and donor (integers, then the inherited enable nibbles, then the strings) apart from the
        record's own formatter pointers. A record that dropped inheritedEnable would clear stock COMPRESSOR's
        page-1 enables (ATK..RMS)."""
        import hashlib, json
        recipe = next(r for r in json.loads((ROOT / controllers.PAGE_RECIPES['sidechain-compressor']).read_text())['recipes']
                      if r['id'] == 'sidechain-compressor')
        record, symbols = bytearray(), {}
        for line in controllers.page_record('sidechain-compressor').splitlines():
            op, _, rest = line.strip().partition(' ')
            if op == '.ascii':
                record += json.loads(rest).encode('latin-1')
            elif op in ('.byte', '.word'):
                record += b''.join(int(v, 0).to_bytes(1 if op == '.byte' else 2, 'big') for v in rest.split(','))
            elif op == '.long':  # a value, or a formatter's offset in the image: a stand-in here
                value = int(rest, 0) if ' - mw_page' not in rest else symbols.setdefault(rest, 0x200 + 4 * len(symbols))
                record += value.to_bytes(4, 'big')
        self.assertEqual(record[:5], b'MWPP\x01')
        self.assertEqual((struct.unpack('>I', record[8:12])[0], record[12:44].hex()), (recipe['donorAddress'], recipe['donorSha256']))
        donor = bytes((5 * i + 1) & 255 for i in range(controllers.PAGE_BYTES))
        donor = donor[:0x18a] + bytes.fromhex('0000a5c3') + bytes.fromhex('01111111') + donor[0x192:]
        # controller_board.c page_stage, from the record alone.
        page, at = bytearray(donor), 44
        for _ in range(record[5]):
            off, width, inherit, value = struct.unpack('>HBBI', record[at:at + 8]); at += 8
            self.assertIn(inherit, (0, 1))
            new = value.to_bytes(4, 'big')[4 - width:]
            page[off:off + width] = bytes((p & ~n | d & n) if inherit else n for p, n, d in zip(page[off:off + width], new, donor[off:off + width]))
        for _ in range(record[6]):
            off, width, length = struct.unpack('>HBB', record[at:at + 4])
            page[off:off + width] = record[at + 4:at + 4 + length] + bytes(width - length); at += 4 + (length + 3 & ~3)
        pointers = []
        for _ in range(record[7]):
            off, zero, _ = struct.unpack('>HHI', record[at:at + 8]); at += 8
            self.assertEqual(zero, 0); pointers.append(off)
        self.assertEqual(at, len(record))
        # descriptors.ts composeDescriptors on the same donor.
        clone = bytearray(donor)
        lo, hi = struct.unpack('>I', donor[0x18e:0x192])[0], struct.unpack('>I', donor[0x18a:0x18e])[0]
        for field in recipe['integers']:
            clone[field['offset']:field['offset'] + field['width']] = field['value'].to_bytes(field['width'], 'big')
        for slot in recipe['inheritedEnable']:
            offset, mask = (0x18e if slot < 8 else 0x18a), 0xf << (slot % 8) * 4
            word = struct.unpack('>I', clone[offset:offset + 4])[0] & ~mask | (lo if slot < 8 else hi) & mask
            clone[offset:offset + 4] = struct.pack('>I', word)
        for field in recipe['strings']:
            text = field['value'].encode('latin-1')
            clone[field['offset']:field['offset'] + field['width']] = text + bytes(field['width'] - len(text))
        for off in pointers:
            page[off:off + 4] = clone[off:off + 4] = bytes(4)
        self.assertEqual(sorted(pointers), sorted(p['offset'] for p in recipe['rawPointers']))
        self.assertEqual(page.hex(), clone.hex())
        # The stock page-1 enables survive; MON (slot 7) and slots 8-11 are on, KWID (slot 11) with its link to KBAS.
        self.assertEqual(struct.unpack('>II', page[0x18a:0x192]), (0x3111, 0x11111111))


if __name__ == '__main__': unittest.main()
