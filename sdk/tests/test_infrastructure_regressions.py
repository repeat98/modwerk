"""Behavior regressions for assembly audits, dispatch coverage and DSP ownership."""
import contextlib
import io
import os
import pathlib
import runpy
import struct
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

ROOT = pathlib.Path(__file__).resolve().parents[1] / 'octabam'
sys.path.insert(0, str(ROOT / 'tools'))
import toolpath
import ast, re, subprocess
build_bus = types.ModuleType('assembly_audit_fixture')
build_bus.__dict__.update(re=re, os=os, sys=sys, subprocess=subprocess,
                          _SCRATCH=pathlib.Path(tempfile.gettempdir()), DISASM='synthetic')
tree = ast.parse((ROOT / 'tools/build/build_bus.py').read_text(encoding='utf-8'))
needed = {'_LISTLINE', '_RT_NUM', '_RT_LABEL', 'MPYSU_AUDITED', '_VARIANT_FLAGS',
          '_listing', '_rt_fields', '_rt_same', '_roundtrip'}
body = [n for n in tree.body if getattr(n, 'name', None) in needed or
        isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id in needed for t in n.targets)]
exec(compile(ast.Module(body=body, type_ignores=[]), 'assembly_audit_fixture', 'exec'), build_bus.__dict__)
import verify_dirtystate as dirty
from remix import ledger
from remix.schema import Claims, DspHook, DspRange, DspSection, Kind, Module, NO_FALLBACK

class AssemblyAudit(unittest.TestCase):
    def audit(self, source, decode):
        with tempfile.TemporaryDirectory() as d, patch.object(build_bus, '_SCRATCH', pathlib.Path(d)), \
             patch.object(build_bus.subprocess, 'run', return_value=types.SimpleNamespace(stdout=decode)), \
             patch.dict(os.environ, {}, clear=True):
            build_bus._roundtrip(source, b'\0' * 3, 0, 'fixture')

    def test_parallel_moves_and_operands_survive(self):
        self.audit('000000: mac x1,y0,b x:(r1)+,x1 y:(r7)+,y0 ; f4f9ea',
                   '000000: mac X1,Y0,B X:(R1)+,X1 Y:(R7)+,Y0 ; f4f9ea')
        self.audit('000000: move #32,x0 ; 000000', '000000: move #$20,x0 ; 000000')
        self.audit('000000: lua (r1+n1),r2 ; 000000', '000000: lua (r1)+n1,r2 ; 000000')

    def test_lost_move_changed_operand_and_absent_decode_fail(self):
        source = '000000: mac x1,y0,b x:(r1)+,x1 y:(r7)+,y0 ; f4f9ea'
        for decode in ('000000: mac x1,y0,b x:(r1)+,x1 ; f4f9ea',
                       '000000: mac x0,y0,b x:(r1)+,x1 y:(r7)+,y0 ; f4f9ea', ''):
            with self.subTest(decode=decode), self.assertRaises(SystemExit):
                self.audit(source, decode)

class XTablePlacement(unittest.TestCase):
    def candidates(self, texts, stock_dsp):
        # Execute the actual candidate-selection block without booting the
        # firmware-dependent builder. The boundary stops before any image read.
        candidates = next(node for node in ast.walk(tree) if isinstance(node, ast.Assign)
                          and any(isinstance(target, ast.Name) and target.id == '_xt_tables'
                                  for target in node.targets))
        parent = next(nodes for node in ast.walk(tree)
                      for _, nodes in ast.iter_fields(node)
                      if isinstance(nodes, list) and candidates in nodes)
        start = parent.index(candidates)
        stop = next(index for index in range(start + 1, len(parent))
                    if isinstance(parent[index], ast.Assign)
                    and any(isinstance(target, ast.Name) and target.id == '_pristine'
                            for target in parent[index].targets))
        fixture = {'CARRIED': list(reversed(texts)), '_texts': texts,
                   '_MODS': {key: types.SimpleNamespace(dsp=types.SimpleNamespace(priority=index))
                             for index, key in enumerate(texts)},
                   'PTABLE_MARK': '$fab1e0', 'STOCK_DSP': stock_dsp}
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            exec(compile(ast.Module(body=parent[start:stop], type_ignores=[]),
                         'xtable_selection_fixture', 'exec'), fixture)
        return fixture['_xt_tables'], output.getvalue()

    def test_hook_tables_stay_in_p_beside_dispatched_effects(self):
        texts = {'Spectrum': 'move #$facade,r1', 'Sidechain': 'move #$fab1e0,r1',
                 'Character': 'move #$facade,r1', 'Air Chorus': 'move #$fab1e0,r1',
                 'No table': 'rts'}
        candidates, output = self.candidates(texts, {'Sidechain', 'No table'})
        self.assertEqual(candidates, ['Spectrum', 'Character', 'Air Chorus'])
        self.assertIn("Sidechain's table stays in P", output)
        self.assertNotIn("No table's", output)

    def test_hook_only_selection_never_parks_a_table(self):
        candidates, output = self.candidates({'Sidechain': '$fab1e0'}, {'Sidechain'})
        self.assertEqual(candidates, [])
        self.assertIn('not hardware-proven', output)

class DirtyStateCoverage(unittest.TestCase):
    def test_fill_targets_the_actual_fx2_block(self):
        with tempfile.TemporaryDirectory() as d:
            d = pathlib.Path(d); base = d / 'base.mem'
            base.write_bytes(struct.pack('<BII', 255, 0, 0))
            result = dirty.mem_with_fill(base, 0x5a5a5a, d / 'filled.mem')
            self.assertEqual(struct.unpack('<BII', result.read_bytes()[:9]), (1, 0x6200, 256))

    def test_builds_the_named_image_and_refuses_missing_code(self):
        remix = types.SimpleNamespace(name='fixture', modules=('FX',), fallback=NO_FALLBACK)
        mod = types.SimpleNamespace(name='fixture', dsp=types.SimpleNamespace(asm='fx.asm'),
                                    menu=types.SimpleNamespace(fx2_id=4, stock_dsp=False))
        with tempfile.TemporaryDirectory() as d, patch.object(dirty.tempfile, 'mkdtemp', return_value=d), \
             patch.object(dirty.registry, 'remix', return_value=remix), \
             patch.object(dirty.registry, 'modules', return_value={'FX': mod}), \
             patch.object(dirty.send_probe, 'dump_mem', return_value=pathlib.Path(d) / 'dummy'), \
             patch.object(dirty.send_probe, 'entry_points', return_value=(12, 13)), \
             patch.object(dirty.subprocess, 'run', return_value=types.SimpleNamespace(returncode=0)) as build, \
             patch.object(sys, 'argv', ['verify_dirtystate', 'fixture']), contextlib.redirect_stdout(io.StringIO()):
            with self.assertRaises(SystemExit) as failure:
                dirty.main()
            self.assertEqual(failure.exception.code, 1)
            self.assertEqual(build.call_args.kwargs['env']['REMIX'], 'fixture')

class MemoryOwnership(unittest.TestCase):
    def module(self, name, site, **claims):
        return Module(name, name.upper(), Kind.HYBRID, 'fixture',
                      dsp=DspSection('absent.asm', 20, hooks=(DspHook(site, (0, 0), 'entry'),)),
                      claims=Claims(**claims))

    def test_adjacent_two_word_hooks_collide(self):
        a = self.module('a', 0x88); b = self.module('b', 0x89)
        self.assertTrue(any('DSP hook site' in str(p) for p in ledger.check([a, b])))
        self.assertFalse(any('DSP hook site' in str(p) for p in ledger.check([a, self.module('b', 0x8a)])))

    def test_declared_range_cannot_enter_another_fx2_buffer(self):
        a = self.module('a', 0x88, owns_fx2_buffers=True)
        b = self.module('b', 0x98, dsp_ranges=(DspRange('y', 0x4100, 16, 'fixture'),))
        self.assertTrue(any('FX2 buffer region' in str(p) for p in ledger.check([a, b])))

class CycleExit(unittest.TestCase):
    def test_cli_over_budget_has_unsuccessful_exit(self):
        # Run the real command-line guard after replacing expensive measurement
        # with a deterministic over-budget result, without a toolchain or firmware.
        text = (ROOT / 'tools/build/cycle_count.py').read_text(encoding='utf-8')
        import ast
        tree = ast.parse(text); main = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'main')
        lines = text.splitlines(True)
        text = ''.join(lines[:main.lineno - 1]) + 'def main():\n    global OVER\n    OVER = True\n' + ''.join(lines[main.end_lineno:])
        with patch.object(sys, 'argv', ['cycle_count']), self.assertRaises(SystemExit):
            exec(compile(text, 'cycle_count.py', 'exec'), {'__name__': '__main__', '__file__': str(ROOT / 'tools/build/cycle_count.py')})
        with patch.object(sys, 'argv', ['cycle_count', '--json']):
            exec(compile(text, 'cycle_count.py', 'exec'), {'__name__': '__main__', '__file__': str(ROOT / 'tools/build/cycle_count.py')})

class FloatingCavePlacement(unittest.TestCase):
    """A floating cave past the clone window goes to the overflow run, as the browser places it."""
    def setUp(self):
        names = {'OVERFLOW_RUN', 'OVERFLOW_RUN_END', 'floating_cave_at'}
        body = [n for n in tree.body if getattr(n, 'name', None) in names or
                isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id in names for t in n.targets)]
        self.ns = {}
        exec(compile(ast.Module(body=body, type_ignores=[]), 'floating_cave_fixture', 'exec'), self.ns)

    def test_window_first_then_overflow_then_refusal(self):
        at, run, end, limit = self.ns['floating_cave_at'], self.ns['OVERFLOW_RUN'], self.ns['OVERFLOW_RUN_END'], 0x400d7c3c
        self.assertEqual(at(0x400d7001, run, 0x80, limit), 0x400d7080)        # next 128-byte boundary
        self.assertEqual(at(0x400d7b00, run, 0x13c, limit), 0x400d7b00)       # ends exactly at the limit
        self.assertEqual(at(0x400d7b00, run + 2, 0x13d, limit), run + 4)      # one byte over: overflow, 4-aligned
        self.assertEqual(at(0x400d7c80, run, 4, limit), run)                  # window cursor already past the limit
        self.assertEqual(at(0x400d7c01, end - 0x10, 0x10, limit), end - 0x10)  # the overflow's last bytes
        self.assertIsNone(at(0x400d7b00, end - 0x10, 0x200, limit))           # fits neither: the build refuses

    def test_browser_uses_the_same_overflow_run(self):
        menus = (ROOT.parents[1] / 'src/engine/module-menus.ts').read_text(encoding='utf-8')
        caves = (ROOT.parents[1] / 'src/engine/requested-modules.ts').read_text(encoding='utf-8')
        self.assertIn('OVERFLOW_START = 0x%x, OVERFLOW_END = 0x%x' % (self.ns['OVERFLOW_RUN'], self.ns['OVERFLOW_RUN_END']), menus)
        # requestedCaves: window at the next 128 bytes when the cave fits whole, else the overflow at the next 4.
        self.assertIn('let address = Math.ceil(cursor / 128) * 128', caves)
        self.assertIn('if (!inside) { address = Math.ceil(overflow / 4) * 4', caves)

    def test_the_window_assert_no_longer_runs_before_the_overflow(self):
        source = (ROOT / 'tools/build/build_bus.py').read_text(encoding='utf-8')
        loop = source[source.index('    for _c, _b in _plan:'):]
        self.assertLess(loop.index('floating_cave_at('), loop.index('past the stock zero run (or into the long chooser list)'))

class ToolSyntax(unittest.TestCase):
    def test_all_vendored_python_tools_parse(self):
        import ast
        for source in (ROOT / 'tools').rglob('*.py'):
            with self.subTest(source=str(source.relative_to(ROOT))):
                ast.parse(source.read_text(encoding='utf-8'), str(source))

# Builder extensions after the Poly8 record, oldest first. Each proves its own exact before/after transition.
EXTENSIONS = ['air-chorus-split-builder.json', 'plain-formatter-builder.json', 'floating-cave-overflow-builder.json', 'octabam-emulator-gates-5c71bc8c.json']
# Documentation-only imports, oldest first: upstream files byte for byte, no build input.
DOC_IMPORTS = ['octabam-docs-30fbb8e4.json', 'octabam-docs-dcf93d37.json']

class SelectiveImport(unittest.TestCase):
    def assert_current_builder_identity(self, path, historical):
        import hashlib, json
        record = json.loads((ROOT.parent / 'infrastructure-verification/poly8-shared-builder.json').read_text())
        adaptation = record['builderAdaptations'].get(path)
        if adaptation:
            self.assertEqual(adaptation['before'], historical)
        current = adaptation['after'] if adaptation else historical
        # Keep the earlier import and Poly8 records historical. Each later
        # opt-in extension proves its own exact before/after transition.
        for name in EXTENSIONS:
            extension = json.loads((ROOT.parent / 'infrastructure-verification' / name).read_text())
            adaptation = extension['builderAdaptations'].get(path)
            if adaptation:
                self.assertEqual(adaptation['before'], current)
                current = adaptation['after']
        self.assertEqual(hashlib.sha256((ROOT / path).read_bytes()).hexdigest(), current)

    def assert_extension_holds(self, name, path, after):
        """An extension's result is the current file, or the next extension's starting point."""
        import hashlib, json
        for later in EXTENSIONS[EXTENSIONS.index(name) + 1:]:
            adaptation = json.loads((ROOT.parent / 'infrastructure-verification' / later).read_text())['builderAdaptations'].get(path)
            if adaptation:
                self.assertEqual(adaptation['before'], after)
                return
        self.assertEqual(hashlib.sha256((ROOT / path).read_bytes()).hexdigest(), after)

    def test_air_chorus_extension_preserves_existing_native_builds(self):
        import hashlib, json
        record = json.loads((ROOT.parent / 'infrastructure-verification/air-chorus-split-builder.json').read_text())
        self.assertEqual(record['kind'], 'air-chorus-opt-in-builder-regression')
        self.assertEqual(set(record['builderAdaptations']), {'tools/build/build_bus.py', 'tools/build/ab_image.py', 'tools/remix/schema.py'})
        self.assertEqual(len(record['selections']), 38)
        for path, change in record['builderAdaptations'].items():
            self.assert_extension_holds('air-chorus-split-builder.json', path, change['after'])
        for row in record['selections']:
            self.assertNotIn('airwindows-chorus', row['moduleIds'])
            self.assertEqual(row['before'], row['after'])

    def test_plain_formatter_fix_preserves_native_builds(self):
        import json
        record = json.loads((ROOT.parent / 'infrastructure-verification/plain-formatter-builder.json').read_text())
        self.assertEqual(record['kind'], 'plain-formatter-builder-regression')
        self.assertEqual(set(record['builderAdaptations']), {'tools/build/build_bus.py'})
        self.assertGreaterEqual(len(record['selections']), 38)
        self.assertTrue(any('airwindows-chorus' in row['moduleIds'] for row in record['selections']))
        for path, change in record['builderAdaptations'].items():
            self.assert_extension_holds('plain-formatter-builder.json', path, change['after'])
        for row in record['selections']:
            self.assertEqual(row['before'], row['after'])

    def test_floating_cave_overflow_keeps_every_image_and_refuses_no_less(self):
        import json
        record = json.loads((ROOT.parent / 'infrastructure-verification/floating-cave-overflow-builder.json').read_text())
        self.assertEqual(record['kind'], 'floating-cave-overflow-builder-regression')
        self.assertEqual(set(record['builderAdaptations']), {'tools/build/build_bus.py'})
        for path, change in record['builderAdaptations'].items():
            self.assert_extension_holds('floating-cave-overflow-builder.json', path, change['after'])
        changed = [row for row in record['selections'] if row['before'] != row['after']]
        self.assertGreaterEqual(len(record['selections']) - len(changed), 100)
        self.assertTrue(any('bytes' in row['after'] for row in record['selections']))
        for row in changed:
            # Only refusals change, and only their reason: no image moves and nothing refused now builds.
            self.assertIn('refused', row['before'])
            self.assertIn('refused', row['after'])
        self.assertTrue(any('past the stock zero run' in row['before']['refused'] for row in changed))
        self.assertFalse(any('past the stock zero run' in row['after'].get('refused', '') for row in record['selections']))

    def test_poly8_builder_preserves_current_main_without_poly8(self):
        import json
        record = json.loads((ROOT.parent / 'infrastructure-verification/poly8-shared-builder.json').read_text())
        self.assertEqual(record['kind'], 'poly8-guarded-builder-regression')
        self.assertEqual(set(record['builderAdaptations']), {'tools/build/build_bus.py', 'tools/remix/ledger.py', 'tools/remix/platform_build.py', 'tools/remix/schema.py'})
        self.assertEqual(len(record['selections']), 38)
        for row in record['selections']:
            self.assertNotIn('poly8', row['moduleIds'])
            self.assertEqual(row['before'], row['after'])

    def test_emulator_and_gates_extension_changes_no_builder_file(self):
        import hashlib, json
        sdk = ROOT.parent
        record = json.loads((sdk / 'infrastructure-verification/octabam-emulator-gates-5c71bc8c.json').read_text(encoding='utf-8'))
        self.assertEqual(record['kind'], 'emulator-and-gates-extension')
        self.assertEqual(set(record['builderAdaptations']), {'Makefile', 'tools/emu/ot_emu/main.cpp', 'tools/emu/ot_emu/rtos.cpp', 'tools/emu/ot_emu/rtos.h',
                                                             'tools/emu/ot_emu/test_periph.cpp', 'tools/emu/ot_emu/usb.cpp', 'tools/emu/ot_emu/usb.h'})
        for path, change in record['builderAdaptations'].items():
            self.assert_extension_holds('octabam-emulator-gates-5c71bc8c.json', path, change['after'])
        # The builder is untouched: the native images and refusals of the earlier records hold by identity.
        for path, digest in record['builderSourcesUnchanged'].items():
            self.assertEqual(hashlib.sha256((ROOT / path).read_bytes()).hexdigest(), digest, path)
        imported = json.loads((sdk / record['importRecord']).read_text(encoding='utf-8'))
        self.assertEqual(imported['revision'], record['upstreamRevision'])
        self.assertEqual(imported['modules'], [])
        # A later docs import pins its newer copy of a file this one also brought.
        later = {f['path'] for name in DOC_IMPORTS for f in json.loads((sdk / 'imports' / name).read_text(encoding='utf-8'))['files']}
        for file in imported['files']:
            with self.subTest(path=file['path']):
                self.assertFalse(file['path'].startswith('modules/'))
                if file['path'] not in later:
                    self.assertEqual(hashlib.sha256((ROOT / file['path']).read_bytes()).hexdigest(), file['vendoredSha256'])
        # Every vendored copy that is not a recorded local adaptation is upstream's file byte for byte.
        adapted = {f['path'] for f in imported['files'] if f['sourceSha256'] != f['vendoredSha256']}
        self.assertEqual(adapted, {'Makefile', 'tools/emu/ot_emu/main.cpp', 'tools/emu/ot_emu/test_periph.cpp'})

    def test_docs_imports_are_upstream_files_byte_for_byte(self):
        import hashlib, json
        records = [json.loads((ROOT.parent / 'imports' / name).read_text(encoding='utf-8')) for name in DOC_IMPORTS]
        for index, (name, imported) in enumerate(zip(DOC_IMPORTS, records)):
            self.assertEqual((imported['kind'], imported['modules']), ('docs-backport', []))
            # A later docs import pins its newer copy of a file this one also brought.
            later = {f['path'] for record in records[index + 1:] for f in record['files']}
            for file in imported['files']:
                with self.subTest(record=name, path=file['path']):
                    self.assertTrue(file['path'].startswith('docs/') and file['path'].endswith('.md'))
                    self.assertEqual(file['sourceSha256'], file['vendoredSha256'])
                    if file['path'] not in later:
                        self.assertEqual(hashlib.sha256((ROOT / file['path']).read_bytes()).hexdigest(), file['vendoredSha256'])

    def test_exact_adapted_file_identities_and_scope(self):
        import hashlib, json
        sdk = ROOT.parent
        record = json.loads((sdk / 'imports/octabam-infrastructure-7b2984c8.json').read_text(encoding='utf-8'))
        self.assertEqual(record['modules'], [])
        self.assertEqual(record['revision'], '7b2984c859732ae6c797ae49c7d61d250b1b6519')
        self.assertTrue(record['files'])
        for file in record['files']:
            with self.subTest(path=file['path']):
                self.assertFalse(file['path'].startswith('modules/'))
                self.assert_current_builder_identity(file['path'], file['vendoredSha256'])

    def test_native_comparison_keeps_images_and_refusals_exact(self):
        import hashlib, json
        record = json.loads((ROOT.parent / 'infrastructure-verification/octabam-7b2984c8.json').read_text(encoding='utf-8'))
        self.assertEqual(len(record['selections']), 38)
        for row in record['selections']:
            self.assertEqual(row['before'], row['after'])
        for path, fingerprint in record['builderSourcesAfter'].items():
            self.assert_current_builder_identity(path, fingerprint)
