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
tree = ast.parse((ROOT / 'tools/build/build_bus.py').read_text())
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
        text = (ROOT / 'tools/build/cycle_count.py').read_text()
        import ast
        tree = ast.parse(text); main = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'main')
        lines = text.splitlines(True)
        text = ''.join(lines[:main.lineno - 1]) + 'def main():\n    global OVER\n    OVER = True\n' + ''.join(lines[main.end_lineno:])
        with patch.object(sys, 'argv', ['cycle_count']), self.assertRaises(SystemExit):
            exec(compile(text, 'cycle_count.py', 'exec'), {'__name__': '__main__', '__file__': str(ROOT / 'tools/build/cycle_count.py')})
        with patch.object(sys, 'argv', ['cycle_count', '--json']):
            exec(compile(text, 'cycle_count.py', 'exec'), {'__name__': '__main__', '__file__': str(ROOT / 'tools/build/cycle_count.py')})

class ToolSyntax(unittest.TestCase):
    def test_all_vendored_python_tools_parse(self):
        import ast
        for source in (ROOT / 'tools').rglob('*.py'):
            with self.subTest(source=str(source.relative_to(ROOT))):
                ast.parse(source.read_text(), str(source))

class SelectiveImport(unittest.TestCase):
    def test_exact_adapted_file_identities_and_scope(self):
        import hashlib, json
        sdk = ROOT.parent
        record = json.loads((sdk / 'imports/octabam-infrastructure-7b2984c8.json').read_text())
        self.assertEqual(record['modules'], [])
        self.assertEqual(record['revision'], '7b2984c859732ae6c797ae49c7d61d250b1b6519')
        self.assertTrue(record['files'])
        for file in record['files']:
            with self.subTest(path=file['path']):
                self.assertFalse(file['path'].startswith('modules/'))
                self.assertEqual(hashlib.sha256((ROOT / file['path']).read_bytes()).hexdigest(), file['vendoredSha256'])

    def test_native_comparison_keeps_images_and_refusals_exact(self):
        import hashlib, json
        record = json.loads((ROOT.parent / 'infrastructure-verification/octabam-7b2984c8.json').read_text())
        self.assertEqual(len(record['selections']), 38)
        for row in record['selections']:
            self.assertEqual(row['before'], row['after'])
        for path, fingerprint in record['builderSourcesAfter'].items():
            self.assertEqual(hashlib.sha256((ROOT / path).read_bytes()).hexdigest(), fingerprint)
