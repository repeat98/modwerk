# SPDX-License-Identifier: GPL-3.0-or-later
"""FM runtime relocation contracts; source-only, never firmware."""
import dataclasses
import importlib.util
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

from fm_runtime import port, source_variant

APP = Path(__file__).resolve().parents[4]
SDK = APP / 'sdk/octabam'
sys.path.append(str(APP / 'sdk'))  # firmware_codec
import firmware_codec  # noqa: E402
UPSTREAM = Path(os.environ.get('ELEKLOADER_UPSTREAM', Path.home() / '.cache/modwerk-upstream/elekloader'))


class SourceTests(unittest.TestCase):
    def test_imported_engine_fixed_addresses_become_symbol_references(self):
        path = SDK / 'modules/synth/upstream/synth/poly.s'
        original = path.read_text()
        changed = source_variant(path.name, original)
        self.assertIn('.set    KEYS_AT, qz_pkey', changed)
        self.assertIn('.set    SCALE_AT, qz_scale_at', changed)
        self.assertEqual(path.read_text(), original)

    def test_changed_upstream_contract_is_refused(self):
        original = (SDK / 'modules/synth/upstream/synth/poly.s').read_text()
        with self.assertRaisesRegex(ValueError, 'source contract changed'):
            source_variant('poly.s', original.replace('0x400d2cb0', '0x400d2cb4'))

    def test_private_quantizer_reads_its_own_engine_helpers(self):
        original = (SDK / 'modules/synth/upstream/quantizer/quantizer.s').read_text()
        changed = source_variant('quantizer.s', original)
        self.assertNotIn('movea.l KIND_FLEX,', changed)
        self.assertEqual(changed.count('lea     sy_render,'), 6)
        self.assertNotIn('.set    qz_pmask, KEYS_AT', changed)

    def test_only_composed_registration_keeps_descriptor_inside_group(self):
        original = (SDK / 'modules/synth/registration.s').read_text()
        standalone = source_variant('registration.s', original)
        composed = source_variant('registration.s', original, composition=True)
        self.assertIn('move.l %d0,1074618188', standalone)
        self.assertNotIn('1074618188', composed)
        self.assertIn('jsr fm_descriptor', composed)

    def test_composed_port_requires_both_standalone_hooks_removed(self):
        from types import SimpleNamespace
        for symbol in ('fm_tick_hook', 'fm_resolve_pb'):
            module = SimpleNamespace(name='synth', detours=(SimpleNamespace(symbol=symbol),))
            with tempfile.TemporaryDirectory() as work, self.assertRaisesRegex(ValueError, 'own both'):
                port(module, SDK, work, composition=True)


@unittest.skipUnless(shutil.which('m68k-elf-as') and (UPSTREAM / 'elekloader/sdk/octabam.py').is_file(),
                     'native binutils and pinned Elekloader checkout required')
class LinkTests(unittest.TestCase):
    def test_complete_engine_links_and_relocates_without_pinned_units(self):
        firmware_codec.use_elekloader(UPSTREAM)
        from elekloader.sdk.octabam import Octabam
        spec = importlib.util.spec_from_file_location('runtime_build_fm_test', APP / 'sdk/runtime/loader/build.py')
        build = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(build)
        original = Octabam(str(SDK)).modules['synth']
        with tempfile.TemporaryDirectory() as work:
            work = Path(work)
            adapted = port(original, SDK, work / 'source')
            self.assertEqual(adapted.tables, original.tables)
            self.assertEqual(adapted.detours, original.detours)
            self.assertEqual(adapted.symbol_refs, original.symbol_refs)
            self.assertTrue(all(u.dram and u.cave_addr is None for u in adapted.linked))
            objects = []
            for unit in adapted.linked:
                obj = work / (unit.label + '.o')
                subprocess.run(['m68k-elf-as', '-mcpu=54455', unit.source, '-o', str(obj)], check=True,
                               capture_output=True)
                objects.append(obj)
            low, symbols, bss, fixups = build.link_units(objects, 'm68k-elf-', 0, work, anywhere=True)
            high, shifted, other_bss, other_fixups = build.link_units(objects, 'm68k-elf-', 0x21030, work, anywhere=True)
            expected = bytearray(low)
            for at in fixups:
                expected[at:at + 4] = (int.from_bytes(expected[at:at + 4], 'big') + 0x21030).to_bytes(4, 'big')
            self.assertEqual(bytes(expected), high)
            self.assertEqual((bss, fixups), (other_bss, other_fixups))
            for name in ('qz_pkey', 'qz_pmask', 'qz_clock', 'qz_oct', 'qz_scale_at', 'fm_descriptor', 'sy_render'):
                self.assertEqual(shifted[name], symbols[name] + 0x21030)
            self.assertEqual(symbols['qz_pmask'] - symbols['qz_pkey'], 8)
            self.assertEqual(symbols['qz_clock'] - symbols['qz_pkey'], 40)
            self.assertEqual(symbols['qz_oct'] - symbols['qz_pkey'], 44)
            # The helper layout is an upstream ABI used by the quantizer/page.
            pg = symbols['fm_descriptor']
            self.assertEqual(int.from_bytes(low[pg + 2:pg + 6], 'big'), symbols['sy_render'])
            for fixed in (0x400d2cb0, 0x400d2ca8, 0x400d24d0):
                self.assertNotIn(fixed.to_bytes(4, 'big'), low)
            # A composed source variant cannot export a stale descriptor pointer
            # into stock data; removal and Undo own only the package's private table.
            effective = dataclasses.replace(original, detours=tuple(
                d for d in original.detours if d.symbol not in ('fm_tick_hook', 'fm_resolve_pb')))
            composed = port(effective, SDK, work / 'composed', composition=True)
            composed_objects = []
            for unit in composed.linked:
                obj = work / ('composed-' + unit.label + '.o')
                subprocess.run(['m68k-elf-as', '-mcpu=54455', unit.source, '-o', str(obj)], check=True,
                               capture_output=True)
                composed_objects.append(obj)
            owned, _, _, _ = build.link_units(composed_objects, 'm68k-elf-', 0, work, anywhere=True)
            self.assertNotIn((0x400d5f4c).to_bytes(4, 'big'), owned)
            print(f'FM relocation proof: {len(low)} code/data bytes, {bss} BSS bytes, {len(fixups)} relocations')


if __name__ == '__main__':
    unittest.main()
