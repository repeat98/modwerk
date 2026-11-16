# SPDX-License-Identifier: GPL-3.0-or-later
"""Compile actual generated board/transport gates; execute frame-job refusal."""
import importlib.util
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
ELEK = ROOT / 'sdk/machines/octatrack/elekloader'
ADAPTER = ROOT / 'sdk/machines/octatrack/module-adapters'
GLUE = ADAPTER / 'saved-set-export'
sys.path[:0] = [str(ADAPTER), str(GLUE)]
import resident_driver
import resident_source
import saved_set_wiring

def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

core = load('saved_set_core_fixture', ELEK / 'build_core.py')

def generated(resident):
    texts = {}
    for name in core.DYNLOAD_SOURCES:
        text = (core.DYNLOAD / name).read_text()
        for old, new in core.DSP_EDITS.get(name, ()) + core.WIDTH_EDITS.get(name, ()):
            if text.count(old) != 1:
                raise ValueError('Reviewed base source seam changed')
            text = text.replace(old, new)
        if name == 'transfer.c':
            if resident:
                text = resident_driver.transport(text)
            text = saved_set_wiring.transfer(text, resident)
        elif name == 'selection.c':
            text = saved_set_wiring.selection(text)
        texts[name] = text
    text = resident_source.sources()['dsp.c'] if resident else (ELEK / 'dsp.c').read_text()
    texts['dsp.c'] = saved_set_wiring.dsp(text)
    return texts

class SavedSetWiring(unittest.TestCase):
    def test_exact_source_seams_refuse_drift(self):
        texts = generated(False)
        for method, name in ((saved_set_wiring.dsp, 'dsp.c'),
                             (saved_set_wiring.transfer, 'transfer.c'),
                             (saved_set_wiring.selection, 'selection.c')):
            with self.subTest(source=name), self.assertRaisesRegex(ValueError, 'seam changed'):
                method(texts[name])
        for changed in ({}, {'modwerk_saved_set_export': True},
                        {'modwerk_saved_set_export': 0x48000000},
                        {'modwerk_saved_set_export': 0x40000402}):
            with self.assertRaises(ValueError):
                core.check_saved_set_storage(changed, {'bss': [0x40000400, 0x47f00000]})
        n = core.RUNTIME_POOL_BYTES + 0x1000 + 60
        mapping = {'modwerk_saved_set_export': 0x40b00000}
        proof = core.check_saved_set_storage(mapping, {'bss': [0x40b00000, 0x40b00000+n]})
        self.assertEqual(proof['bytes'], n)
        self.assertEqual(proof['uncachedAddress'], 0x48b00000)
        with self.assertRaises(ValueError):
            core.check_saved_set_storage(mapping, {'bss': [0x40b00000, 0x40b00000+n-1]})

    @unittest.skipUnless(shutil.which('m68k-elf-gcc'), 'ColdFire compiler unavailable')
    def test_actual_board_objects_and_exact_bss_capacity(self):
        for resident in (False, True):
            with self.subTest(resident=resident), tempfile.TemporaryDirectory() as tmp:
                work = Path(tmp)
                for name, text in generated(resident).items():
                    (work / name).write_text(text)
                usb = load('saved_set_usb_fixture', ELEK / 'usb_base.py')
                (work / 'usb_base.h').write_text(usb.header())
                flags = ['-std=c99', '-mcpu=54455', '-Os', '-Wall', '-Wextra', '-Werror', '-ffreestanding', '-fno-builtin',
                         '-DMODWERK_SAVED_SET_EXPORT', '-DMODWERK_RUNTIME_VOLATILE_JOURNAL', '-DMODWERK_DSP_LOADER', '-DMODWERK_FX_IDS=128',
                         '-DRUNTIME_POOL_BYTES=786432u', '-DMODWERK_DSP_ALLOWANCE0=3120',
                         '-DMODWERK_DSP_ALLOWANCE1=3565', '-DMODWERK_DSP_RESERVE=342']
                flags += ['-DMODWERK_DSP_%s%d=4096' % (name, c) for name in ('TABLE', 'WORDS', 'MISS', 'METER') for c in (0, 1)]
                if resident:
                    flags.append('-DMODWERK_RESIDENT_STOCK_HOOKS')
                includes = ['-I'+str(path) for path in (work, ELEK, GLUE, ADAPTER / 'resident-runtime', ADAPTER / 'controller-policy',
                    ROOT / 'sdk/runtime/loader', ROOT / 'sdk/runtime/upload')]
                sources = [work / 'transfer.c', work / 'selection.c', work / 'dsp.c', ELEK / 'ep0.c', ELEK / 'modset.c',
                           GLUE / 'saved_set_export.c', GLUE / 'saved_set_reader.c', GLUE / 'saved_set_session.c']
                for source in sources:
                    result = subprocess.run(['m68k-elf-gcc', *flags, *includes, '-c', str(source),
                        '-o', str(work / (source.stem + '.o'))], capture_output=True, text=True)
                    self.assertEqual(result.returncode, 0, result.stderr)
                nm = subprocess.run(['m68k-elf-nm', '-S', str(work / 'ep0.o')], check=True, capture_output=True, text=True).stdout
                row = next(line.split() for line in nm.splitlines() if line.endswith(' modwerk_saved_set_export'))
                self.assertEqual(row[2], 'B')
                self.assertEqual(int(row[1], 16), 790588)
                gate = next(line.split() for line in nm.splitlines() if line.endswith(' modwerk_machine_journal_begin_safe'))
                self.assertEqual(gate[2], 'T')

    @unittest.skipUnless(shutil.which('cc'), 'Host C compiler unavailable')
    def test_actual_frame_starts_refuse_during_export_without_mutating_jobs(self):
        texts = generated(True)
        clock = '*(volatile uint32_t *)0xfc07c00cu'
        self.assertEqual(texts['transfer.c'].count(clock), 1)
        texts['transfer.c'] = '#include <stdint.h>\nextern volatile uint32_t test_clock;\n' + texts['transfer.c'].replace(clock, 'test_clock')
        with tempfile.TemporaryDirectory() as tmp:
            work = Path(tmp)
            for name, text in texts.items():
                (work / name).write_text(text)
            shutil.copyfile(ELEK / 'fxids.h', work / 'fxids.h')
            fixture = work / 'fixture.c'
            fixture.write_text('''#include <assert.h>
#include "transfer.h"
volatile uint32_t test_clock;
static int exporting=1;
int modwerk_saved_set_busy(void) { return exporting; }
unsigned modwerk_dsp_flags(unsigned core) { (void)core; return 0; }
void modwerk_diag_frame(void) {} /* diag.c: the frame interrupt's freeze watch */
void dl_selection_tick(void) { assert(!exporting); }
void dl_residency_tick(void) { assert(!exporting); }
void dl_show_message(const char *p,unsigned n) { (void)p; (void)n; }
int dl_hook_reset_start(unsigned,unsigned,unsigned,unsigned,const uint32_t *);
int dl_transfer_export_idle(void);
int main(void) {
    const uint32_t words[1]={1};
    assert(dl_transfer_export_idle());
    for(unsigned c=0;c<2;++c) {
        assert(!dl_command_start(c,10,0,1,0));
        assert(!dl_hook_reset_start(c,1,0,1,words));
        assert(dl_job_status(c)==-2);
    }
    dl_ui(); assert(!dl_frame()); assert(dl_transfer_export_idle());
    exporting=0; assert(dl_command_start(0,10,0,1,0)); assert(!dl_transfer_export_idle());
    return 0;
}
''')
            executable = work / 'transport'
            result = subprocess.run(['cc', '-std=c11', '-Wall', '-Wextra', '-Werror', '-pedantic', '-DDL_NATIVE_TEST',
                '-DMODWERK_FX_IDS=128', '-DMODWERK_DSP_TABLE0=4096', '-DMODWERK_DSP_TABLE1=4096',
                '-DMODWERK_DSP_WORDS0=2000', '-DMODWERK_DSP_WORDS1=2000', '-I'+str(work),
                str(work / 'transfer.c'), str(fixture), '-o', str(executable)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            run = subprocess.run([str(executable)], capture_output=True, text=True)
            self.assertEqual(run.returncode, 0, run.stderr)

if __name__ == '__main__':
    unittest.main()
