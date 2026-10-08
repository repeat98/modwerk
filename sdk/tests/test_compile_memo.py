"""Firmware-free orchestration regressions: fake compilers, no DSP execution."""
import ast
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch

NATIVE = Path(__file__).resolve().parents[1] / 'octabam'
sys.path.insert(0, str(NATIVE / 'tools'))
from remix import compile_cache as memo


class CompileMemo(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='octamod-compiler-fixture.')
        self.root = Path(self.temporary.name)
        self.tool = self.root / 'fake-assembler'
        self.tool.write_bytes(b'synthetic native tool identity A')
        self.tool.chmod(0o700)
        self.work = self.root / 'work'
        self.work.mkdir()
        self.cache = self.root / 'memo'
        self.symbols = 'init 1000\nproc 1001\n'
        self.blob = b'\x12\x34\x56' * 2  # arbitrary synthetic words, never executed
        self.stdout = 'synthetic compiler listing\n'
        self.calls = []
        self.env = patch.dict(os.environ, {'OCTABAM_CACHE': str(self.cache), 'OCTABAM_NO_CACHE': ''})
        self.lookup = patch.object(memo.shutil, 'which', return_value=str(self.tool))
        self.runner = patch.object(memo.subprocess, 'run', side_effect=self.compile)
        for item in (self.env, self.lookup, self.runner):
            item.start(); self.addCleanup(item.stop)
        self.addCleanup(self.temporary.cleanup)

    def compile(self, command, **kwargs):
        self.calls.append(command)
        if '-in' in command:
            Path(command[command.index('-out') + 1]).write_bytes(self.blob)
            Path(command[command.index('-sym') + 1]).write_text(self.symbols)
        else:
            output = Path(command[command.index('-o') + 1])
            if not output.is_absolute(): output = Path(kwargs.get('cwd') or Path.cwd()) / output
            output.write_bytes(b'synthetic ELF object')
        return subprocess.CompletedProcess(command, 0, self.stdout, '')

    def assemble(self, source='init:\n rts\n', org=0x1000, listing=True):
        return memo.assemble_dsp(source, org, self.tool, self.work, listing)

    def test_assembler_constants_are_passed_and_invalidate_the_cache(self):
        source = self.root / 'fixture.s'; source.write_text('.ifdef FLAG\n nop\n.endif\n')
        output = self.work / 'fixture.o'
        memo.assemble_coldfire(source, '54455', output, defsyms=(('FLAG', 1),))
        memo.assemble_coldfire(source, '54455', output, defsyms=(('FLAG', 1),))
        self.assertEqual(len(self.calls), 1)
        self.assertIn('FLAG=0x1', self.calls[0])
        memo.assemble_coldfire(source, '54455', output, defsyms=(('FLAG', 2),))
        self.assertEqual(len(self.calls), 2)
        self.assertIn('FLAG=0x2', self.calls[1])

    def test_identical_compiles_run_once_and_return_exact_bytes_symbols_and_listing(self):
        results = [self.assemble() for _ in range(20)]
        self.assertEqual(len(self.calls), 1)
        self.assertTrue(all(result == (self.blob, self.symbols, self.stdout) for result in results))

    def test_changed_source_origin_listing_tool_bytes_and_environment_invalidate(self):
        self.assemble(); self.assemble('init:\n nop\n rts\n'); self.assemble(org=0x2000); self.assemble(listing=False)
        before = self.tool.stat()
        self.tool.write_bytes(b'synthetic native tool identity B')
        os.utime(self.tool, ns=(before.st_atime_ns, before.st_mtime_ns))
        self.assemble()
        with patch.dict(os.environ, {'OCTAMOD_SYNTHETIC_COMPILER_OPTION': 'changed'}): self.assemble()
        self.assertEqual(len(self.calls), 6)

    def test_no_cache_really_compiles_every_invocation(self):
        with patch.dict(os.environ, {'OCTABAM_NO_CACHE': '1'}):
            self.assemble(); self.assemble()
        self.assertEqual(len(self.calls), 2)
        self.assertFalse(self.cache.exists())

    def test_external_file_and_time_dependencies_stay_cold(self):
        for source in (' include "other.asm"\n', ' .incbin "payload.bin"\n', ' incdir "other"\n', ' dc @date()\n', ' dc getenv("PARAM")\n'):
            self.assemble(source); self.assemble(source)
        self.assertEqual(len(self.calls), 10)
        self.assertFalse(self.cache.exists())

    def test_executable_wrappers_stay_cold(self):
        self.tool.write_bytes(b'#!/usr/bin/python3\n')
        self.assemble(); self.assemble()
        self.assertEqual(len(self.calls), 2)

    def test_missing_tools_cannot_use_a_previous_success(self):
        self.assemble()
        with patch.object(memo.shutil, 'which', return_value=None), patch.object(memo.subprocess, 'run', side_effect=FileNotFoundError('missing compiler')):
            with self.assertRaises(FileNotFoundError): self.assemble()

    def test_corrupt_and_truncated_cache_entries_are_recompiled(self):
        self.assemble()
        entry, = (self.cache / 'dsp-assembly').iterdir()
        for contents in ('{"payload":', '{"key":"wrong","payload":{"blob":"00","stdout":"stale","symbols":""},"sha256":"invalid"}'):
            entry.write_text(contents)
            self.assertEqual(self.assemble(), (self.blob, self.symbols, self.stdout))
        self.assertEqual(len(self.calls), 3)

    def test_failed_compiles_are_never_cached_and_stale_outputs_are_removed(self):
        (self.work / 'out.bin').write_bytes(b'old success')
        with patch.object(memo.subprocess, 'run', side_effect=subprocess.CalledProcessError(2, ['synthetic'], stderr='rejected source')):
            with self.assertRaises(subprocess.CalledProcessError): self.assemble()
        self.assertFalse((self.work / 'out.bin').exists())
        self.assertFalse(self.cache.exists())
        self.assemble()
        self.assertEqual(len(self.calls), 1)

    def test_unwritable_cache_falls_back_to_compilation(self):
        self.cache.write_text('not a directory')
        self.assemble(); self.assemble()
        self.assertEqual(len(self.calls), 2)

    def test_objects_are_restored_as_independent_copies_and_cpu_changes_invalidate(self):
        source, output = self.root / 'unit.s', self.work / 'unit.o'
        source.write_text(' synthetic assembly text\n')
        memo.assemble_coldfire(source, '5475', output)
        output.write_bytes(b'a gate modified its own object')
        memo.assemble_coldfire(source, '5475', output)
        self.assertEqual(output.read_bytes(), b'synthetic ELF object')
        self.assertEqual(len(self.calls), 1)
        memo.assemble_coldfire(source, '54455', output)
        self.assertEqual(len(self.calls), 2)

    def test_concurrent_cache_writes_leave_an_intact_entry_and_private_outputs(self):
        from concurrent.futures import ThreadPoolExecutor
        def one(index):
            work = self.root / f'worker{index}'
            return memo.assemble_dsp('synthetic concurrent source', 0x1000, self.tool, work)
        with ThreadPoolExecutor(max_workers=4) as pool:
            results = list(pool.map(one, range(4)))
        self.assertTrue(all(result == (self.blob, self.symbols, self.stdout) for result in results))
        count = len(self.calls)
        self.assertEqual(one(4), results[0])
        self.assertEqual(len(self.calls), count)
        self.assertEqual(len(list((self.cache / 'dsp-assembly').iterdir())), 1)

    def builder(self):
        # Extract only the integration function; importing build_bus would load
        # native manifests and require firmware. No submitted source is evaluated.
        tree = ast.parse((NATIVE / 'tools/build/build_bus.py').read_text(encoding='utf-8'))
        function, = [node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == 'assemble_syms']
        decoder = self.root / 'fake-decoder'; decoder.write_text('synthetic identity')
        audit = Mock()
        namespace = dict(pathlib=__import__('pathlib'), _SCRATCH=self.work, DIS=self.tool, DISASM=decoder, os=os, _roundtrip=audit)
        exec(compile(ast.Module(body=[function], type_ignores=[]), '<reviewed integration function>', 'exec'), namespace)
        return namespace['assemble_syms'], audit

    def test_cached_assembly_still_runs_the_roundtrip_audit_and_preserves_rejections(self):
        build, audit = self.builder()
        first = build('init:\n rts\n', 0x1000, 'fixture')
        audit.side_effect = ValueError('synthetic roundtrip rejection')
        with self.assertRaisesRegex(ValueError, 'roundtrip rejection'):
            build('init:\n rts\n', 0x1000, 'fixture')
        self.assertEqual(len(self.calls), 1)
        self.assertEqual(audit.call_count, 2)
        self.assertEqual(first[0], [0x563412, 0x563412])
        self.assertEqual(audit.call_args.args, (self.stdout, self.blob, 0x1000, 'fixture'))

    def test_cached_assembly_still_resolves_the_local_stock_guard_every_time(self):
        build, _ = self.builder()
        self.blob = bytes(30)
        self.symbols = 'dlstubinit 1001\ndlstubproc 1002\ndlstubdone 1009\n'
        with patch('remix.stock_guard.stock_dsp_words', return_value=tuple(range(9))) as guard:
            build('; OCTAMOD_LOCAL_NULL_STUB\n', 0x1000)
            guard.side_effect = ValueError('synthetic stock fingerprint rejection')
            with self.assertRaisesRegex(ValueError, 'stock fingerprint rejection'):
                build('; OCTAMOD_LOCAL_NULL_STUB\n', 0x1000)
        self.assertEqual(len(self.calls), 1)
        self.assertEqual(guard.call_count, 2)


if __name__ == '__main__': unittest.main()
