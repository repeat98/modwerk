# SPDX-License-Identifier: MIT
"""Reviewed no-POLY VECTOR/FM source, ownership and complete-link proofs."""
from dataclasses import replace
import importlib.util
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

import machine_composition as adapter

APP = Path(__file__).resolve().parents[4]
SDK = APP / 'sdk/octabam'
sys.path.insert(0, str(SDK / 'tools'))
from remix import registry


def load(path):
    """A manifest with POSIX unit sources, as the compatibility gate hands octabam's composition (Windows paths carry
    backslashes, and remix.machine_composition splits sources on "modules/")."""
    module = registry._load_one(path)
    return replace(module, linked=tuple(replace(u, source=str(u.source).replace('\\', '/')) for u in module.linked))


def modules():
    old = Path.cwd()
    try:
        os.chdir(SDK)
        return [load(SDK / ('modules/' + name + '/manifest.py')) for name in ('vector', 'synth')]
    finally:
        os.chdir(old)


class SourceTests(unittest.TestCase):
    def test_unknown_saved_signatures_and_stock_pointer_are_not_overwritten(self):
        original = (SDK / 'modules/poly8/shared-machine.c').read_text()
        source = adapter.controller_source(SDK)
        self.assertIn("s[0]=='P' && s[1]=='L' && s[2]==1) return STOCK", source)
        self.assertIn("s[0]=='A' && s[1]=='B' && s[2]==1) return STOCK", source)
        self.assertNotIn('U32(0x400d5f4cu)=page;', source)
        self.assertNotIn('mr_pb_table[mr_row(POLY)]=', source)
        self.assertEqual((SDK / 'modules/poly8/shared-machine.c').read_text(), original)

    def test_poly_present_controller_keeps_engines_but_not_stock_pointer_writer(self):
        source = adapter.controller_source(SDK, include_poly=True)
        self.assertIn('return kind==POLY', source)
        self.assertIn('pm_ui_tick();', source)
        self.assertNotIn('U32(0x400d5f4cu)=page;', source)
        hooks = adapter.hook_source(SDK, include_poly=True)
        self.assertIn('poly_is_track', hooks)
        self.assertIn('mr_note_on:', hooks)
        self.assertNotIn('.long 0x400b3eac', hooks)

    def test_vector_address_arithmetic_is_portable_and_source_drift_refused(self):
        import vector_runtime
        original = (SDK / 'modules/vector/control.s').read_text()
        source = vector_runtime.source_variant(original)
        self.assertNotIn('#staging-268525901', source)
        self.assertNotIn('saved-1187503478', source)
        self.assertNotIn('saved-1187503778', source)
        self.assertIn('add.l #268525901,%a1', source)
        self.assertEqual((SDK / 'modules/vector/control.s').read_text(), original)
        with self.assertRaisesRegex(ValueError, 'Reviewed VECTOR runtime source changed'):
            vector_runtime.source_variant(original + '\n')

    def test_source_drift_fails_closed(self):
        with patch.dict(adapter.PINS, {'modules/poly8/shared-machine.c': '0' * 64}):
            with self.assertRaisesRegex(ValueError, 'Reviewed shared machine source changed'):
                adapter.controller_source(SDK)
        with self.assertRaisesRegex(ValueError, 'adapter seam changed'):
            adapter._once('missing', 'required', 'replacement')

    def test_hooks_own_private_parameter_table_and_no_poly_dispatch(self):
        hooks = adapter.hook_source(SDK)
        for symbol in ('mr_resolve_pb:', 'jsr mr_page', 'lea mr_pb_table,%a0', 'mr_source_render:'):
            self.assertIn(symbol, hooks)
        for symbol in ('poly_increment_shift', 'poly_is_track', 'polyphony_call', 'mr_note_on:', 'mr_octkey:'):
            self.assertNotIn(symbol, hooks)
        self.assertIn('bridge_main_replay:\n        .space 6', hooks)
        self.assertIn('bridge_edit_replay:\n        .space 8', hooks)
        self.assertIn('bridge_draw_replay:\n        .space 8', hooks)
        self.assertIn('mr_src_names:\n        .space 20', hooks)

    def test_machine_subsets_require_private_source_lifetime(self):
        for m in modules():
            with self.assertRaisesRegex(ValueError, 'private source work directory'):
                adapter.effective_modules([m], SDK)

    def test_changed_participant_claim_is_not_silently_removed(self):
        vector, synth = modules()
        detour = vector.detours[0]
        changed = replace(vector, detours=(replace(detour, symbol='unknown_owner'), *vector.detours[1:]))
        with tempfile.TemporaryDirectory() as work, self.assertRaisesRegex(ValueError, 'composition seam drift'):
            adapter.effective_modules([changed, synth], SDK, work)

    def test_changed_quantizer_layout_is_not_silently_supplied_by_fm(self):
        _, synth = modules()
        quantizer = load(SDK / 'modules/quantizer/manifest.py')
        table = quantizer.tables[0]
        changed = replace(quantizer, tables=(replace(table, insert_at=2), *quantizer.tables[1:]))
        with tempfile.TemporaryDirectory() as work, self.assertRaisesRegex(ValueError, 'bundled quantizer declaration drift'):
            adapter.effective_modules([synth, changed], SDK, work)


@unittest.skipUnless(shutil.which('m68k-elf-gcc'), 'native ColdFire compiler required')
class ManifestTests(unittest.TestCase):
    def test_fm_normalizes_only_its_exact_redundant_quantizer(self):
        vector, synth = modules()
        quantizer = load(SDK / 'modules/quantizer/manifest.py')
        for selected in ([synth, quantizer], [quantizer, vector, synth]):
            with tempfile.TemporaryDirectory() as work:
                result = adapter.effective_modules(selected, SDK, work)
                normalized = next(m for m in result if m.name == 'quantizer')
                self.assertEqual(normalized.key, quantizer.key)
                for field in ('linked', 'detours', 'symbol_refs', 'pokes', 'tables'):
                    self.assertEqual(getattr(normalized, field), (), field)
                fm = next(m for m in result if m.name == 'synth')
                self.assertTrue(any(u.label.startswith('fm_') for u in fm.linked))
                self.assertEqual(len([m for m in result if m.name == 'machine-bridge']), 1)
        with tempfile.TemporaryDirectory() as work:
            result = adapter.effective_modules([vector, quantizer], SDK, work)
            self.assertIs(next(m for m in result if m.name == 'quantizer'), quantizer)
        self.assertTrue(quantizer.linked and quantizer.tables)

    def test_poly_present_group_preserves_visible_members_and_private_controller(self):
        poly = load(SDK / 'modules/poly8/manifest.py')
        with tempfile.TemporaryDirectory() as work:
            result = adapter.effective_modules([poly, *modules()], SDK, work)
            self.assertEqual([m.name for m in result], ['poly8', 'vector', 'synth'])
            registry_unit = next(u for u in result[0].linked if u.label == 'machine_registry')
            self.assertIn('mr_note_on:', Path(registry_unit.source).read_text())
            source = (Path(work) / 'shared-runtime-controller.c').read_text()
            self.assertNotIn('U32(0x400d5f4cu)=page;', source)
            self.assertEqual([c.symbol for c in registry_unit.stock_copies], ['mr_src_names'])
            self.assertTrue(all(p.write[-1] == (8 if len(p.write) == 4 else 7) for p in result[0].pokes[:6]))

    def test_pair_has_one_owner_without_hidden_poly_or_unrelated_dedup(self):
        vector, synth = modules()
        unrelated = load(SDK / 'modules/repitch/manifest.py')
        with tempfile.TemporaryDirectory() as work:
            result = adapter.effective_modules([vector, synth, unrelated], SDK, work)
            self.assertEqual([m.name for m in result], ['machine-bridge', 'vector', 'synth', 'repitch'])
            self.assertIs(result[-1], unrelated)
            bridge, v, fm = result[:3]
            self.assertEqual(len(bridge.detours), 19)
            self.assertEqual(len(bridge.symbol_refs), 11)  # with the chooser-name pointer (POLY8 0.3.2)
            self.assertEqual(len(bridge.pokes), 16)  # six count sites and the chooser's ten cursor clamps
            self.assertTrue(all(p.write[-1] == (7 if len(p.write) == 4 else 6) for p in bridge.pokes))
            self.assertTrue(any(d.site == 0x400449be for d in fm.detours))
            self.assertFalse(any(d.symbol in ('fm_tick_hook', 'fm_resolve_pb') for d in fm.detours))
            self.assertFalse(any(u.label in ('polyphony', 'polyui') for m in result for u in m.linked))
            claims = []
            for m in result[:3]:
                claims += [(d.site, d.site + (d.pad_to or 6), m.name) for d in m.detours]
                claims += [(r.addr, r.addr + 4, m.name) for r in m.symbol_refs]
                claims += [(p.addr, p.addr + len(p.write), m.name) for p in m.pokes]
                claims += [(addr, addr + 4, m.name) for table in m.tables for addr, _ in table.refs]
            self.assertEqual(len(claims), 96)
            for previous, current in zip(sorted(claims), sorted(claims)[1:]):
                self.assertLessEqual(previous[1], current[0], (previous, current))
            self.assertEqual(sum(r.symbol == 'mr_pb_table' for r in bridge.symbol_refs), 5)
            self.assertEqual({c.symbol for c in bridge.linked[0].stock_copies},
                             {'bridge_main_replay', 'bridge_edit_replay', 'bridge_draw_replay', 'bridge_stock_pool_open', 'mr_src_names'})


FM_ADAPTER = Path(os.environ.get('MODWERK_FM_ADAPTER', Path(__file__).with_name('fm_runtime.py')))
@unittest.skipUnless(shutil.which('m68k-elf-as') and FM_ADAPTER.is_file(),
                     'native toolchain and reviewed FM runtime adapter required')
class LinkTests(unittest.TestCase):
    def test_complete_pair_two_origin_relocation_and_private_parameter_routes(self):
        self._proof(False)

    def test_fm_only_two_origin_relocation_without_absent_engines(self):
        self._proof(True)

    def _proof(self, only_fm):
        spec = importlib.util.spec_from_file_location('composed_fm_adapter', FM_ADAPTER)
        fm = importlib.util.module_from_spec(spec);spec.loader.exec_module(fm)
        with tempfile.TemporaryDirectory(dir='/private/tmp' if HOST_IMAGE else None) as temp:
            work = Path(temp)
            selected = modules()[1:] if only_fm else modules()
            result = adapter.effective_modules(selected, SDK, work / 'bridge')
            result = [fm.port(m, SDK, work / 'fm', composition=True) if m.name == 'synth' else m for m in result]
            objects = []
            for i, unit in enumerate(u for m in result for u in m.linked):
                obj = work / (str(i) + '.o')
                subprocess.run(['m68k-elf-as', '-mcpu=5475', str(Path(unit.source) if Path(unit.source).is_absolute() else SDK / unit.source), '-o', str(obj)], check=True, capture_output=True)
                if unit.exports:
                    subprocess.run(['m68k-elf-objcopy', *['--globalize-symbol=' + name for name in unit.exports], str(obj)], check=True, capture_output=True)
                objects.append(obj)
            images, maps = [], []
            for origin in (0, 0x21030):
                script = work / 'link.ld'
                script.write_text('SECTIONS { . = ' + hex(origin) + '; .text : { *(.text*) *(.rodata*) *(.data*) } .bss : { *(.bss*) *(COMMON) } /DISCARD/ : { *(.comment) *(.note*) *(.eh_frame) } }')
                elf, binary = work / 'linked.elf', work / 'linked.bin'
                subprocess.run(['m68k-elf-ld', '--no-warn-rwx-segments', '-T', str(script), '-o', str(elf), *map(str, objects)], check=True, capture_output=True)
                symbols = subprocess.check_output(['m68k-elf-nm', str(elf)], text=True)
                self.assertNotIn(' U ', symbols)
                self.assertNotIn(' B ', symbols)
                maps.append({line.split()[2]: int(line.split()[0], 16) for line in symbols.splitlines() if len(line.split()) == 3})
                subprocess.run(['m68k-elf-objcopy', '-O', 'binary', str(elf), str(binary)], check=True, capture_output=True)
                images.append(binary.read_bytes())
            low, high = images
            self.assertEqual(len(low), len(high))
            expected, offsets = bytearray(low), []
            at = 0
            while at + 4 <= len(low):
                a, b = int.from_bytes(low[at:at+4], 'big'), int.from_bytes(high[at:at+4], 'big')
                if b - a == 0x21030 and a < len(low):
                    expected[at:at+4] = b.to_bytes(4, 'big');offsets.append(at);at += 4
                else:
                    at += 2
            self.assertEqual(bytes(expected), high)
            for name in ('mr_pb_table', 'mr_resolve_pb', 'mr_page', 'mr_source_render', 'fm_descriptor', 'sy_render', 'qz_pkey', 'qz_scale_at'):
                self.assertEqual(maps[1][name], maps[0][name] + 0x21030)
            # No POLY engine or absent-participant callback is linked. The PB
            # resolver calls a package-owned descriptor; custom table sites
            # refer to mr_pb_table and therefore restore through the loader.
            for name in ('polyphony_call', 'poly_is_track', 'pm_ui_tick', 'pm_assign'):
                self.assertNotIn(name, maps[0])
            page = maps[0]['fm_descriptor']
            self.assertEqual(int.from_bytes(low[page+2:page+6], 'big'), maps[0]['sy_render'])
            for fixed in (0x400d2cb0, 0x400d2ca8, 0x400d24d0):
                self.assertNotIn(fixed.to_bytes(4, 'big'), low)
            if only_fm:
                self.assertNotIn('st_type', maps[0])
                self.assertNotIn('st_key', maps[0])
                self.assertEqual([m.name for m in result], ['machine-bridge', 'synth'])
            sites = sum(len(m.detours)+len(m.symbol_refs)+len(m.pokes)+sum(len(t.refs) for t in m.tables) for m in result)
            print(f'{"FM only" if only_fm else "VECTOR/FM"} composition proof: {len(low)}B, {len(offsets)} self-relocations, {sites} sites, no absent engine')


HOST_IMAGE = os.environ.get('MODWERK_COMPOSITION_HOST_IMAGE')
@unittest.skipUnless((sys.platform.startswith('linux') and shutil.which('cc')) or HOST_IMAGE,
                     'Linux host compiler or explicit private Docker host fixture required')
class HostTests(unittest.TestCase):
    def test_actual_controller_rows_parameters_saved_fallback_and_private_page(self):
        self._proof('vector_fm_controller_fixture.c')

    def test_fm_only_controller_private_page_and_missing_machine_preservation(self):
        self._proof('fm_controller_fixture.c')

    def _proof(self, fixture):
        with tempfile.TemporaryDirectory(dir='/private/tmp' if HOST_IMAGE else None) as temp:
            work = Path(temp)
            (work / 'controller.c').write_text(adapter.controller_source(SDK))
            shutil.copyfile(Path(__file__).with_name(fixture), work / 'probe.c')
            if HOST_IMAGE:
                command = ['docker', 'run', '--rm', '--network', 'none', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--read-only',
                           '--tmpfs', '/tmp:rw,exec,nosuid,nodev,size=16m', '--mount', f'type=bind,source={work},target=/fixture,readonly', HOST_IMAGE,
                           'sh', '-c', 'cc -std=c99 -Wall -Wextra -Werror -I /fixture /fixture/probe.c -o /tmp/probe && /tmp/probe']
                result = subprocess.run(command, capture_output=True, text=True)
                self.assertEqual(result.returncode, 0, result.stderr)
            else:
                binary = work / 'probe'
                subprocess.run(['cc', '-std=c99', '-Wall', '-Wextra', '-Werror', '-I', str(work), str(work / 'probe.c'), '-o', str(binary)], check=True, capture_output=True)
                result = subprocess.run([str(binary)], check=True, capture_output=True, text=True)
            self.assertIn('independent tracks', result.stdout)
            print(result.stdout.strip())


@unittest.skipUnless(shutil.which('cc'), 'host C compiler required')
class LifetimeTests(unittest.TestCase):
    def test_known_stock_ui_roots_refuse_retained_or_unreadable_graphs(self):
        source = Path(__file__).parent
        with tempfile.TemporaryDirectory() as temp:
            binary = Path(temp) / 'lifetime'
            subprocess.run(['cc', '-std=c99', '-Wall', '-Wextra', '-Werror', '-I', str(source),
                            str(source / 'machine_lifetime.c'), str(source / 'machine_lifetime_fixture.c'),
                            '-o', str(binary)], check=True, capture_output=True)
            result = subprocess.run([str(binary)], check=True, capture_output=True, text=True)
            self.assertIn('retained-before-read', result.stdout)
            print(result.stdout.strip())
        if shutil.which('m68k-elf-gcc'):
            with tempfile.TemporaryDirectory() as temp:
                obj = Path(temp) / 'lifetime.o'
                subprocess.run(['m68k-elf-gcc', *adapter.FLAGS, '-c', str(source / 'machine_lifetime.c'),
                                '-o', str(obj)], check=True, capture_output=True)
                self.assertNotIn(' U ', subprocess.check_output(['m68k-elf-nm', str(obj)], text=True))


if __name__ == '__main__':
    unittest.main()
