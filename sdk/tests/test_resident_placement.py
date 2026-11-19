"""Real buffer bookkeeping, stock-head regression and resident lifetime gates."""
import importlib.util
import os
from pathlib import Path
import shutil
import struct
import subprocess
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[2]
ADAPTER=ROOT/'sdk/machines/octatrack/module-adapters'
ELEK=ROOT/'sdk/machines/octatrack/elekloader'
RUNTIME=ADAPTER/'resident-runtime'
sys.path.append(str(ADAPTER))
import resident_placement as placement
import resident_source


def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path)
    module=importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module


def generated():
    core=load('resident_placement_core_fixture',ELEK/'build_core.py')
    result={}
    for name in core.DYNLOAD_SOURCES:
        text=(core.DYNLOAD/name).read_text()
        for old,new in core.DSP_EDITS.get(name,())+core.WIDTH_EDITS.get(name,()):
            if text.count(old)!=1: raise AssertionError('Changed base input seam: '+name)
            text=text.replace(old,new)
        if name=='buffers.c': text=placement.buffers(text)
        if name=='manager.c': text=placement.manager(text)
        result[name]=text
    return result


def board_entries(source):
    """Exact guarded entry functions, without unrelated board MMIO services.

    PE linkers retain unrelated exports/refptrs despite section collection.
    The complete board translation unit is still compiled for ColdFire by
    test_resident_driver; this native fixture exercises these entries only.
    """
    def unique(marker):
        if source.count(marker) != 1: raise AssertionError('Changed board fixture seam: '+marker)
        return source.index(marker)
    start=unique('#if defined(MODWERK_RESIDENT_STOCK_HOOKS) && !defined(MODWERK_HOST)\n')
    setup_end=unique('/* This base only prepares dormant authored engines.')
    entries=unique('int modwerk_stock_hook_export_idle(void)\n')
    end=unique('static int stock_hook_tick(void)\n')
    globals=[]
    for marker in ('static unsigned rebinding;', 'static int probing = -1;',
                   'static int peeking = -1;', 'volatile struct selftest modwerk_selftest;',
                   'int dl_publication_idle(void);'):
        at=unique(marker); globals.append(source[at:source.index('\n',at)+1])
    return '#include "fxids.h"\n#include "selftest.h"\n'+''.join(globals)+source[start:setup_end]+source[entries:end]+'#endif\n'


class ResidentPlacement(unittest.TestCase):
    @unittest.skipUnless(shutil.which('cc'),'Native C compiler unavailable')
    def test_real_buffer_capacity_kept_targets_outgoing_and_generation_retirement(self):
        with tempfile.TemporaryDirectory() as tmp:
            work=Path(tmp)
            for name,text in generated().items(): (work/name).write_text(text)
            shutil.copyfile(ELEK/'fxids.h',work/'fxids.h')
            out=work/'resources'
            result=subprocess.run(['cc','-std=c11','-Wall','-Wextra','-Werror','-pedantic',
                '-DMODWERK_FX_IDS=64','-I'+str(work),'-I'+str(RUNTIME),
                str(work/'buffers.c'),str(RUNTIME/'stock_hooks.c'),str(RUNTIME/'stock_hook_resources.c'),
                str(RUNTIME/'test_stock_hook_resources.c'),'-o',str(out)],capture_output=True,text=True)
            self.assertEqual(result.returncode,0,result.stderr)
            result=subprocess.run([str(out)],capture_output=True,text=True)
            self.assertEqual(result.returncode,0,result.stderr)

    @unittest.skipUnless(shutil.which('cc'),'Native C compiler unavailable')
    def test_actual_board_export_and_saved_set_begin_fence_without_mmio(self):
        with tempfile.TemporaryDirectory() as tmp:
            work=Path(tmp)
            for name,text in generated().items(): (work/name).write_text(text)
            (work/'dsp.c').write_text(board_entries(resident_source.sources()['dsp.c']))
            shutil.copyfile(ELEK/'fxids.h',work/'fxids.h')
            # Exact adapter entry bodies and their actual initial state are
            # compiled without unrelated MMIO functions or linker pruning.
            flags=['-std=c11','-Os','-Wall','-Wextra','-Werror','-Wno-int-to-pointer-cast','-ffunction-sections','-fdata-sections',
                   '-DMODWERK_RESIDENT_STOCK_HOOKS','-DMODWERK_FX_IDS=64',
                   '-DMODWERK_DSP_ALLOWANCE0=3120','-DMODWERK_DSP_ALLOWANCE1=3565','-DMODWERK_DSP_RESERVE=342']
            flags+=['-DMODWERK_DSP_%s%d=4096'%(name,c) for name in ('TABLE','WORDS','MISS','METER') for c in (0,1)]
            includes=['-I'+str(p) for p in (work,ELEK,RUNTIME,ADAPTER/'controller-policy',ROOT/'sdk/runtime/loader',ROOT/'sdk/runtime/upload')]
            objects=[]
            for source in (work/'dsp.c',RUNTIME/'stock_hooks.c',RUNTIME/'stock_hook_driver.c',
                           RUNTIME/'stock_hook_resources.c',RUNTIME/'test_stock_hook_binding.c'):
                out=work/(source.stem+'.o')
                result=subprocess.run(['cc',*flags,*includes,'-c',str(source),'-o',str(out)],capture_output=True,text=True)
                self.assertEqual(result.returncode,0,result.stderr); objects.append(out)
            out=work/'binding'
            result=subprocess.run(['cc',*map(str,objects),'-o',str(out)],capture_output=True,text=True)
            self.assertEqual(result.returncode,0,result.stderr)
            result=subprocess.run([str(out)],capture_output=True,text=True)
            self.assertEqual(result.returncode,0,result.stderr)

    @unittest.skipUnless(shutil.which('cc'),'Native C compiler unavailable')
    def test_actual_manager_refuses_competing_selection_publication_and_queued_work(self):
        with tempfile.TemporaryDirectory() as tmp:
            work=Path(tmp)
            for name,text in generated().items(): (work/name).write_text(text)
            shutil.copyfile(ELEK/'fxids.h',work/'fxids.h')
            out=work/'manager-fixture'
            flags=['-std=c11','-Wall','-Wextra','-Werror','-DDL_NATIVE_TEST','-DMODWERK_FX_IDS=64',
                   '-DMODWERK_DSP_ALLOWANCE0=3120','-DMODWERK_DSP_ALLOWANCE1=3565']
            result=subprocess.run(['cc',*flags,'-I'+str(work),'-I'+str(RUNTIME),
                str(work/'allocator.c'),str(work/'buffers.c'),str(RUNTIME/'stock_hooks.c'),
                str(RUNTIME/'stock_hook_resources.c'),str(RUNTIME/'test_stock_hook_manager.c'),
                '-o',str(out)],capture_output=True,text=True)
            self.assertEqual(result.returncode,0,result.stderr)
            result=subprocess.run([str(out)],capture_output=True,text=True)
            self.assertEqual(result.returncode,0,result.stderr)

    def test_every_source_seam_requires_exact_reviewed_context(self):
        texts=generated()
        self.assertIn('Private policy applies to both stock and 16K maps',texts['manager.c'])
        self.assertIn('queued_token || buffers.open',texts['manager.c'])
        self.assertIn('modwerk_dsp_buffer_permitted',texts['buffers.c'])
        self.assertEqual(texts['buffers.c'].count('modwerk_dsp_buffer_permitted'),3)
        for fn,name in ((placement.buffers,'buffers.c'),(placement.manager,'manager.c')):
            with self.assertRaisesRegex(ValueError,'seam changed'): fn(texts[name])
        source=resident_source.sources()['dsp.c']
        self.assertIn('int modwerk_stock_hook_export_idle(void)',source)
        self.assertIn('if (modwerk_saved_set_busy()) return MW_HOOK_BUSY;',source)
        self.assertIn('if (modwerk_saved_set_busy()) return 0;',source)
        self.assertIn('!modwerk_saved_set_busy() && dl_hook_buffer_ranges_idle(feature)',source)
        self.assertIn('struct mw_hook_buffer_claim claim = mw_hook_default_claim(kind, id < 32u && !fx_in(modwerk_fx_modules, id)), exact = {0};',source)
        self.assertIn('if (modwerk_stock_hook_buffer_policy(core, id, &exact)) claim = exact;',source)
        self.assertIn('mw_hook_buffer_permitted_held(mw_stock_hooks_held(&stock_hook_driver.leases) | controller_reserved(),',source)
        self.assertIn('return modwerk_controller_held() | live;',source)
        self.assertIn('if (enable) return MW_HOOK_STATE;',source) # preparation never opens controller admission
        entries=board_entries(source)
        self.assertNotIn('static int stock_hook_tick',entries)
        self.assertIn('static int probing = -1;',entries)
        self.assertIn('static int peeking = -1;',entries)
        with self.assertRaisesRegex(AssertionError,'fixture seam'):
            board_entries(source.replace('int modwerk_stock_hook_export_idle(void)', 'int changed_export_idle(void)'))

    @unittest.skipUnless(shutil.which('m68k-elf-gcc'),'ColdFire compiler unavailable')
    def test_actual_guarded_manager_and_resources_compile_for_mcf54455(self):
        with tempfile.TemporaryDirectory() as tmp:
            work=Path(tmp)
            for name,text in generated().items(): (work/name).write_text(text)
            shutil.copyfile(ELEK/'fxids.h',work/'fxids.h')
            flags=['-mcpu=54455','-Os','-Wall','-Wextra','-Werror','-ffreestanding','-fno-builtin',
                   '-DMODWERK_RESIDENT_STOCK_HOOKS','-DMODWERK_FX_IDS=64',
                   '-DMODWERK_DSP_ALLOWANCE0=3120','-DMODWERK_DSP_ALLOWANCE1=3565','-DMODWERK_DSP_RESERVE=342']
            flags+=['-DMODWERK_DSP_%s%d=4096'%(name,c) for name in ('TABLE','WORDS','MISS','METER') for c in (0,1)]
            for source in (work/'manager.c',work/'buffers.c',RUNTIME/'stock_hook_resources.c'):
                result=subprocess.run(['m68k-elf-gcc',*flags,'-I'+str(work),'-I'+str(ELEK),'-I'+str(RUNTIME),
                                      '-c',str(source),'-o',str(work/(source.stem+'.o'))],capture_output=True,text=True)
                self.assertEqual(result.returncode,0,result.stderr)

    @unittest.skipUnless(os.environ.get('ELEKLOADER_DSP_HOST') and os.environ.get('ELEKLOADER_DSP_ASM'),
                         'Explicit independent native DSP host/assembler unavailable')
    def test_actual_imported_full_ring_init_overwrites_stock_head_and_shadow_preserves_it(self):
        # This is a negative baseline for the placement fix, not a claim about
        # the physical instrument's scheduling, timing or saved state.
        here=ROOT/'sdk/octabam/modules/airwindows-chorus'
        previous=sys.modules.get('verify'); old_path=list(sys.path)
        try:
            sys.path.insert(0,str(here)); verify=load('head_verify_fixture',here/'verify.py')
            verify.ASM=Path(os.environ['ELEKLOADER_DSP_ASM']); verify.HOST=Path(os.environ['ELEKLOADER_DSP_HOST'])
            verify.DIS=verify.ASM.parent.parent/'disassemble/dsp56kDisassemble'
            sys.modules['verify']=verify
            heads=load('independent_head_writer_fixture',here/'verify_shared_buffer.py')
            with tempfile.TemporaryDirectory() as tmp:
                work=Path(tmp)
                for name,file in (('everb','everb.asm'),('miniverb','miniverb.asm'),('airwindows-chorus','chorus.asm')):
                    if name=='airwindows-chorus': memory,symbols,_,_=verify.assemble(work)
                    else:
                        blob,sym=work/'code.bin',work/'code.sym'
                        result=subprocess.run([str(verify.ASM),'-in',str(ROOT/'sdk/octabam/modules'/name/file),
                            '-org','2000','-out',str(blob),'-sym',str(sym)],capture_output=True,text=True)
                        self.assertEqual(result.returncode,0,result.stdout+result.stderr)
                        symbols={k:int(v,16) for k,v in (line.split() for line in sym.read_text().splitlines() if line.strip())}
                        raw=blob.read_bytes(); words=[int.from_bytes(raw[i:i+3],'little') for i in range(0,len(raw),3)]
                        mem=verify.rec(0,0x2000,words)+verify.rec(0,0x40,[0,0,0,0])
                        values={0x415:0x700,0x416:0x700,0x419:0,0x208:0x500,0x20a:0x6000,
                                0x20c:0,0x20d:16,0x20e:0,0x213:0x255}
                        values.update({0x255+i:b for i,b in enumerate((0x1000,0x4000,0x1c00,0x8000,0x2800,0x30000,0x3400,0x34000))})
                        for address,value in values.items(): mem+=verify.rec(1,address,[value])
                        memory=work/'image.mem'; memory.write_bytes(mem+struct.pack('<BII',0xff,0,0))
                    for base,count in ((0x30000,72),(0x38000,16)):
                        _,preserved=heads.render(work,memory,symbols,bytes(128*16*8),8,base,count)
                        self.assertEqual(preserved,name=='airwindows-chorus',(name,hex(base)))
                        if not preserved:
                            self.assertEqual((work/'canary.bin').read_bytes(),bytes(count*4))
        finally:
            sys.path[:]=old_path
            if previous is None: sys.modules.pop('verify',None)
            else: sys.modules['verify']=previous


if __name__=='__main__': unittest.main()
