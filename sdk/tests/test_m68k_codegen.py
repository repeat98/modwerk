# SPDX-License-Identifier: GPL-3.0-or-later
"""The ColdFire code generation guard (sdk/runtime/m68k_codegen.py): what it refuses, that the base's flag removes
GCC 16.2's late-combine miscompile, and that the C every other shipping builder compiles has none of it."""
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('m68k_codegen_under_test', ROOT / 'sdk/runtime/m68k_codegen.py')
codegen = importlib.util.module_from_spec(spec); spec.loader.exec_module(codegen)
TOOLS = all(shutil.which('m68k-elf-' + tool) for tool in ('gcc', 'objdump'))
# The builders' reviewed toolchain (Modwerk's source-tools image) is GCC 16; an older local compiler rejects some
# released sources and never had the miscompile.
VERSION = subprocess.run(['m68k-elf-gcc', '-dumpfullversion'], capture_output=True, text=True).stdout.strip() if TOOLS else ''
# controller_board.c's page_write as the base compiles it (-O2): GCC 16.2 made it `move.b (%a0)+,(0,%a0,%d0.l)`.
COPY = '''#include <stdint.h>
void copy(uint32_t to, const uint8_t *from)
{ volatile uint8_t *d = (volatile uint8_t *)(uintptr_t)to; for (unsigned i = 0; i < 0x192; ++i) d[i] = from[i]; }
'''


def compile_c(source, flags, work, includes=()):
    obj = work / (Path(source).stem + '-%d.o' % len(list(work.glob('*.o'))))
    subprocess.run(['m68k-elf-gcc', *flags, *(f for i in includes for f in ('-I', str(i))), '-c', str(source), '-o', str(obj)],
                   check=True, capture_output=True)
    return obj


def disassembled(obj):
    return subprocess.run(['m68k-elf-objdump', '-d', str(obj)], check=True, capture_output=True, text=True).stdout


class M68kCodegen(unittest.TestCase):
    @unittest.skipUnless(TOOLS, 'no ColdFire compiler')
    def test_c_source_builder_checks_actual_objects_before_packaging(self):
        with tempfile.TemporaryDirectory() as folder:
            work = Path(folder)
            safe = work / 'safe.c'
            safe.write_text('volatile unsigned value;\nvoid module_tick(void *p){(void)p; ++value;}\n')
            bad = work / 'bad.c'
            # A raw instruction keeps the refusal stable across optimizers and
            # bypasses assembler CPU validation, exercising the object guard.
            bad.write_text('void module_tick(void *p){(void)p;'
                           '__asm__ __volatile__(".short 0x41f0,0x0e00");}\n')
            for source, passes in [(safe, True), (bad, False)]:
                output = source.with_suffix('.mwrm')
                run = subprocess.run([sys.executable, '-B', str(ROOT / 'sdk/runtime/loader/build.py'),
                                      str(source), '-o', str(output)], capture_output=True, text=True)
                if passes:
                    self.assertEqual(run.returncode, 0, run.stderr)
                    self.assertEqual(output.read_bytes()[:4], b'MWRM')
                else:
                    self.assertNotEqual(run.returncode, 0)
                    self.assertIn('MCF54455', run.stdout + run.stderr)
                    self.assertFalse(output.exists())

    def test_target_checks_share_one_disassembly_per_object(self):
        safe = '00000000 <safe>:\n   0: 41f0 0c00      lea %a0@(0,%d0:l:4),%a0\n'
        with patch.object(codegen.subprocess, 'run', return_value=SimpleNamespace(stdout=safe)) as run:
            self.assertEqual(codegen.check_mcf54455(iter(['first.o', 'second.o'])), 2)
            self.assertEqual(run.call_count, 2)
        for text, error in [
            ('00000000 <bad>:\n   0: 1198 0800      moveb %a0@+,%a0@(0,%d0:l)\n', 'late-combine'),
            ('00000000 <bad>:\n   0: 41f0 0e00      lea %a0@(0,%d0:l:8),%a0\n', 'MCF54455'),
        ]:
            with patch.object(codegen.subprocess, 'run', return_value=SimpleNamespace(stdout=text)) as run:
                with self.assertRaisesRegex(ValueError, error):
                    codegen.check_mcf54455(['bad.o'])
                self.assertEqual(run.call_count, 1)

    def test_instrument_index_modes_are_separate_from_the_emulator_guard(self):
        text = '''00000000 <indexes>:
   0: 41f0 0e00      lea %a0@(0,%d0:l:8),%a0
   4: 41f0 0200      lea %a0@(0,%d0:w:2),%a0
   8: 41f0 0c00      lea %a0@(0,%d0:l:4),%a0
   c: 41f0 6200      lea %a0@(0,%fp:w:2),%a0
'''
        self.assertEqual(len(codegen.index_hits(text)), 3)
        self.assertEqual(codegen.hits(text), [])

    @unittest.skipUnless(TOOLS, 'no ColdFire compiler')
    def test_sdk_target_rejects_the_wrong_target_failure_class(self):
        with tempfile.TemporaryDirectory() as tmp:
            work = Path(tmp); source = work / 'index.c'
            source.write_text('char *index8(char *p,unsigned n){return p+8*n;}\n')
            # An explicit incompatible object is stable across optimizer
            # heuristics; a small C expression need not choose scaled LEA.
            wrong_source = work / 'wrong.s'
            wrong_source.write_text('.text\n.globl wrong_index\nwrong_index:\n'
                                    'lea (%a0,%d0.l*8),%a0\nrts\n')
            wrong = compile_c(wrong_source, ['-mcpu=5475'], work)
            with self.assertRaisesRegex(ValueError, 'MCF54455'):
                codegen.check_mcf54455([wrong])
            correct = compile_c(source, ['-mcpu=54455', '-Os', *codegen.FLAGS], work)
            self.assertEqual(codegen.check_mcf54455([correct]), 1)

    def test_refuses_a_stepped_source_register_its_destination_reuses(self):
        text = '''00000000 <copy>:
   0:	1198 0800      	moveb %a0@+,%a0@(0,%d0:l)
   4:	2f2f 0008      	movel %sp@(8),%sp@-
   8:	1298           	moveb %a0@+,%a1@
   a:	2562 0004      	movel %a2@-,%a2@(4)
   e:	2d1e           	movel %fp@+,%a6@-
  10:	1031 8800      	moveb %a1@(0,%a0:l),%d0
  14:	10c0           	moveb %d0,%a0@+
  16:	30d8           	movew %a0@+,%a0@+
'''
        found = codegen.hits(text)
        self.assertEqual([f.split(': ', 1)[1] for f in found],
                         ['moveb %a0@+,%a0@(0,%d0:l)', 'movel %a2@-,%a2@(4)', 'movel %fp@+,%a6@-', 'movew %a0@+,%a0@+'])
        self.assertTrue(all(f.startswith('copy+0x') for f in found))

    @unittest.skipUnless(TOOLS, 'ColdFire compiler unavailable')
    def test_the_flag_removes_the_page_write_miscompile(self):
        flags = ['-mcpu=54455', '-O2', '-std=c99', '-ffreestanding', '-fno-builtin']
        with tempfile.TemporaryDirectory() as tmp:
            work = Path(tmp); source = work / 'copy.c'; source.write_text(COPY)
            plain = codegen.hits(disassembled(compile_c(source, flags, work)))
            if VERSION.startswith('16.'):  # the reviewed toolchain: the miscompile is there without the flag
                self.assertTrue(plain, VERSION)
                with self.assertRaisesRegex(ValueError, 'late-combine'):
                    codegen.check([work / 'copy-0.o'])
            self.assertEqual(codegen.hits(disassembled(compile_c(source, flags + list(codegen.FLAGS), work))), [])

    @unittest.skipUnless(VERSION.startswith('16.'), 'the reviewed GCC 16 ColdFire compiler is unavailable')
    def test_other_shipping_c_builds_have_no_stepped_register_reuse(self):
        """The C the startup, logger, upload, machine-composition and elemod builders compile, with their own flags
        (none of them adds the base's flag: it would change released bytes and none of them needs it)."""
        jobs = []
        upload = ROOT / 'sdk/runtime/upload'
        up = importlib.util.spec_from_file_location('upload_compile_flags', upload / 'compile.py')
        upload_compile = importlib.util.module_from_spec(up); up.loader.exec_module(upload_compile)
        jobs += [(upload / n, [f for f in upload_compile.FLAGS if f != '-fstack-usage'], [upload]) for n in upload_compile.SOURCES]
        logger = ['-mcpu=54455', '-Os', '-std=c99', '-ffreestanding', '-fno-builtin', '-fno-zero-initialized-in-bss',
                  '-fno-common', '-fno-merge-constants', '-fno-asynchronous-unwind-tables', '-fno-unwind-tables', '-Wall']
        jobs += [(p, logger, []) for p in sorted((ROOT / 'sdk/runtime/logging').glob('*.c'))]
        with tempfile.TemporaryDirectory() as tmp:
            work = Path(tmp)
            sys.path.insert(0, str(ROOT / 'sdk/runtime/startup'))
            art = importlib.util.spec_from_file_location('startup_public_art', ROOT / 'sdk/runtime/startup/public_art.py')
            public_art = importlib.util.module_from_spec(art); art.loader.exec_module(public_art)
            (work / 'boot_art.h').write_text(public_art.header())
            jobs.append((ROOT / 'sdk/runtime/startup/boot_anim.c', logger, [work]))
            sys.path.insert(0, str(ROOT / 'sdk/machines/octatrack/module-adapters'))
            import machine_composition, analog_bd_runtime, analog_bd_write_lease
            sdk, bd = ROOT / 'sdk/octabam', ROOT / 'sdk/octabam/modules/analog-bassdrum'
            for name, text, includes in (
                    ('vector-fm-controller.c', machine_composition.controller_source(sdk), []),
                    ('shared-runtime-controller.c', machine_composition.controller_source(sdk, include_poly=True), []),
                    ('analog-bd-runtime-control.c', analog_bd_runtime.control_source((bd / 'control.c').read_text()), [bd]),
                    ('analog-bd-lease-control.c', analog_bd_write_lease.source((bd / 'control.c').read_text()),
                     [bd, analog_bd_write_lease.HEADER.parent])):
                (work / name).write_text(text)
                jobs.append((work / name, list(machine_composition.FLAGS), includes))
            elemod = ['-mcpu=54455', '-O2', '-ffreestanding', '-fno-builtin', '-nostdlib', '-fno-pic', '-fno-pie',
                      '-fomit-frame-pointer', '-fno-asynchronous-unwind-tables', '-fno-unwind-tables']  # build-elemod-packages.mjs
            for machine in sorted((ROOT / 'sdk/machines').glob('*/machine.json')):
                sdk_dir = (json.loads(machine.read_text()).get('sdk') or {})
                if sdk_dir.get('platform') != 'elemod':
                    continue
                for document in sorted((ROOT / sdk_dir['modules']).glob('*/modwerk.module.json')):
                    build = json.loads((document.parent / json.loads(document.read_text())['platform']['build']).read_text())
                    for release in build.get('releases', {}).values():
                        extra = build.get('cflags', []) + release.get('cflags', [])
                        jobs += [(document.parent / s, elemod + extra, [document.parent / 'src', machine.parent / 'include'])
                                 for s in build['sources'] if s.endswith('.c')]
            self.assertGreater(len(jobs), 20)
            objects = [compile_c(source, flags, work, includes) for source, flags, includes in jobs]
            self.assertEqual(codegen.check(objects), len(objects))


if __name__ == '__main__': unittest.main()
