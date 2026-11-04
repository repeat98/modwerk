"""Lossless CPU optimization: native/scalar parity and bounds."""
from pathlib import Path
import hashlib
import importlib.util
import shutil
import sys
import subprocess
import tempfile
import unittest
import test_fract_machine as machine
import test_fract_ui as ui
from host_flags import SANITIZE

ROOT = Path(__file__).resolve().parents[2]
FLAGS = ['-DOG_MACHINE_GRAIN_ONLY']


@unittest.skipUnless(shutil.which('cc'), 'no host C compiler')
class CpuMachineContract(unittest.TestCase):
    PROFILE_FLAGS = FLAGS

    def test_zero_callback_still_calls_native_and_retires_invalid_sources(self):
        with tempfile.TemporaryDirectory(prefix='fract-zero-callback-') as directory:
            work=Path(directory);fixture=ROOT/'sdk/tests/fixtures/fract_machine.c'
            source=work/'zero.c'
            source.write_text('#define main fixture_main\n#include "'+str(fixture)+'"\n#undef main\n'+r'''
int main(void) {
 char *args[]={"fixture","native",0};assert(!fixture_main(2,args));
 for(unsigned track=0;track<8;++track) for(unsigned ping=0;ping<2;++ping)
  for(unsigned offset=0;offset<=16;++offset) for(unsigned invalid=0;invalid<4;++invalid) {
   fixture(3,2049);machine_tracks=1u<<track;
   source_record=0x80000510u+track*48u+ping*384u;
   packet_cursor=0x80001c90u+ping*0xa80u+track*336u;
   put(source_record+2,2,0x7f66);put(source_record+8,2,0x7f55);
   put(source_record+28,1,99);put(0x800049d8u+track*168u+24u,1,255);
   put(0x80004898u+40u*track+4u,4,0x12345678u);
   uint8_t original[sizeof lanes];memcpy(original,lanes,sizeof lanes);
   if(invalid==1)put(0x800049d8u+track*168u+20u,1,0);
   if(invalid==2)put(0x46c920a4u,4,0);
   if(invalid==3)put(0x800049d8u+track*168u,1,0);
   og_owner=track;og_state.identity=0x1234;og_state.head[0].length=123;
   stock_packet_frames=0;unsigned calls=stock_render_calls;
   assert(og_machine_render(track,ping,offset,offset)==37);
   assert(stock_render_calls==calls+1 && !memcmp(original,lanes,sizeof lanes));
   assert(!U8(0x800049d8u+track*168u+24u));
   assert(!U32(0x80004898u+40u*track+4u));
   if(invalid)assert(og_owner==8 && !og_state.head[0].length);
   else assert(og_owner==track && og_state.head[0].length==123);
  }
 return 0;
}
''')
            command=['cc','-std=c11','-O1','-Wall','-Wextra','-Werror',*SANITIZE,
                     '-fno-sanitize-recover=all','-DOG_NATIVE_STAGE_ONE','-DOG_MACHINE_START_EXTENSION',
                     '-DOG_FRACT_CURRENT_ENGINE',*FLAGS]
            for path in ('sdk/drafts/fract-machine/engine','sdk/drafts/fract-machine/support','sdk/drafts/fract-machine','sdk/machines/octatrack/include'):
                command+=['-I',str(ROOT/path)]
            binary=work/'zero';r=subprocess.run([*command,str(source),'-o',str(binary)],capture_output=True,text=True)
            self.assertEqual(r.returncode,0,r.stderr)
            r=subprocess.run([str(binary)],capture_output=True,text=True)
            self.assertEqual(r.returncode,0,r.stdout+r.stderr)
    def test_page_coordinates_match_division_for_every_admitted_frame(self):
        with tempfile.TemporaryDirectory(prefix='fract-page-coordinates-') as directory:
            work=Path(directory);source=work/'coordinates.c'
            source.write_text(r'''#include <assert.h>
#include "page_coordinates.h"
int main(void) {
 OgSource s={0};s.frames=44860416u;
 for(unsigned format=0;format<4;++format) {
  s.bytes=format<2?3:2;s.channels=(format&1u)+1u;
  unsigned bytes=s.bytes*s.channels,page=6144u/bytes;
  for(uint32_t frame=0;frame<s.frames;++frame) {
   unsigned bpf,perpage,index,offset;
   og_page_coordinates(&s,frame,&bpf,&perpage,&index,&offset);
   assert(bpf==bytes && perpage==page);
   assert(index==frame/page && offset==frame%page);
  }
 }
 return 0;
}
''')
            binary=work/'coordinates'
            command=['cc','-std=c11','-O2','-Wall','-Wextra','-Werror',*SANITIZE,
                     '-fno-sanitize-recover=all','-I',str(ROOT/'sdk/drafts/fract-machine/engine'),
                     '-I',str(ROOT/'sdk/drafts/fract-machine/support'),str(source),'-o',str(binary)]
            r=subprocess.run(command,capture_output=True,text=True);self.assertEqual(r.returncode,0,r.stderr)
            r=subprocess.run([str(binary)],capture_output=True,text=True);self.assertEqual(r.returncode,0,r.stderr)

    def test_native_word_snapshot_preserves_every_saved_control_bit(self):
        with tempfile.TemporaryDirectory(prefix='fract-native-words-') as directory:
            work=Path(directory)
            fixture=ROOT/'sdk/tests/fixtures/fract_machine.c'
            source=work/'roundtrip.c'
            source.write_text('#define main fixture_main\n#include "'+str(fixture)+'"\n#undef main\n'+r'''
int main(void) {
 uint32_t random=0x195bfc47u;
 for(unsigned n=0;n<4096;++n) {
  fixture(3,2049);unsigned track=n&7u,ping=(n>>3)&1u;
  source_record=0x80000510u+track*48u+ping*384u;
  for(unsigned i=0;i<48;++i) {
   random=random*1664525u+1013904223u;
   put(source_record+i,1,random>>24);
  }
  uint8_t original[sizeof lanes];memcpy(original,lanes,sizeof lanes);
  uint16_t main[6];uint8_t setup[6];
  for(unsigned i=0;i<6;++i) {
   main[i]=get(source_record+2*i,2);setup[i]=get(source_record+24+i,1);
  }
  OgNativeView view;assert(og_native_open(track,&view));
  for(unsigned i=0;i<6;++i) {
   assert(og_native_main(&view,i)==main[i]);
   assert(og_native_setup(&view,i)==setup[i]);
  }
  og_native_close(track,&view);assert(!memcmp(original,lanes,sizeof lanes));
 }
 return 0;
}
''')
            binary=work/'roundtrip'
            command=['cc','-std=c11','-O1','-Wall','-Wextra','-Werror',*SANITIZE,
                     '-fno-sanitize-recover=all','-DOG_NATIVE_STAGE_ONE','-DOG_MACHINE_START_EXTENSION',
                     '-DOG_FRACT_CURRENT_ENGINE',*FLAGS]
            for path in ('sdk/drafts/fract-machine/engine','sdk/drafts/fract-machine/support','sdk/drafts/fract-machine','sdk/machines/octatrack/include'):
                command+=['-I',str(ROOT/path)]
            r=subprocess.run([*command,str(source),'-o',str(binary)],capture_output=True,text=True)
            self.assertEqual(r.returncode,0,r.stderr)
            r=subprocess.run([str(binary)],capture_output=True,text=True)
            self.assertEqual(r.returncode,0,r.stderr)

    def test_independent_scalar_audio_and_state_and_overflow_bounds(self):
        with tempfile.TemporaryDirectory(prefix='fract-cpu-') as directory:
            work = Path(directory)
            common = ['cc', '-std=c11', '-Wall', '-Wextra', '-Werror', '-O1',
                      *SANITIZE, '-fno-sanitize-recover=all', *FLAGS]
            for path in ('sdk/drafts/fract-machine/engine', 'sdk/drafts/fract-machine/support', 'sdk/drafts/fract-machine',
                         'sdk/machines/octatrack/include', 'sdk/tests/fixtures'):
                common += ['-I', str(ROOT / path)]
            result = subprocess.run([*common, '-c', str(ROOT / 'sdk/tests/fixtures/fract_cpu_reference.c'),
                                     '-o', str(work / 'oracle.o')], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            result = subprocess.run([*common, '-DOG_FRACT_CURRENT_ENGINE', '-DOG_NATIVE_STAGE_ONE', '-DOG_MACHINE_START_EXTENSION',
                                     str(ROOT / 'sdk/tests/fixtures/fract_cpu.c'), str(work / 'oracle.o'),
                                     '-o', str(work / 'fixture')], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            result = subprocess.run([str(work / 'fixture')], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertIn('three live readers', result.stdout)


class CpuUiContract(ui.FractUiContract):
    PROFILE_FLAGS = FLAGS

    @unittest.skipUnless(shutil.which('cc'), 'no host C compiler')
    def test_cached_waveform_peaks_remain_exact_and_reduce_page_resolutions(self):
        with tempfile.TemporaryDirectory(prefix='fract-ui-peak-') as directory:
            binary = Path(directory) / 'fixture'
            gc = '-Wl,-dead_strip' if sys.platform == 'darwin' else '-Wl,--gc-sections'
            command = ['cc', '-std=c11', '-Wall', '-Wextra', '-Werror', '-O1',
                       *SANITIZE, '-fno-sanitize-recover=all', *FLAGS,
                       '-ffunction-sections', '-fdata-sections', gc,
                       '-I', str(ROOT / 'sdk/drafts/fract-machine'),
                       '-I', str(ROOT / 'sdk/drafts/fract-machine/support'),
                       str(ROOT / 'sdk/tests/fixtures/fract_ui_peak.c'), '-o', str(binary)]
            result = subprocess.run(command, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            result = subprocess.run([str(binary)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)


class CpuRecipeContract(unittest.TestCase):
    def test_boot_payload_match_is_reconstructed_only_from_readable_unowned_pieces(self):
        path = ROOT / 'sdk/drafts/fract-machine/build_private.py'
        spec = importlib.util.spec_from_file_location('fract_cpu_builder', path)
        builder = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(builder)
        image, stock = b'abcdef', b'abcXXXdef'
        item = dict(offset=0, length=6, address=builder.STOCK_END,
                    sha256=hashlib.sha256(image).hexdigest(), purpose='authored synthetic fixture')
        recipe = dict(copies=[item], fills=[])
        events, base = dict(events=[], owned=[]), dict(sites=[])
        result = builder.bounded_recipe(recipe, image, stock, builder.STOCK_FROM, events, base)
        self.assertEqual([r['length'] for r in result['copies']], [3, 3])
        rebuilt = b''.join(stock[r['address']-builder.STOCK_FROM:
                                r['address']-builder.STOCK_FROM+r['length']] for r in result['copies'])
        self.assertEqual(rebuilt, image)
        self.assertEqual(recipe['copies'], [item])
        legal = dict(item, address=builder.STOCK_FROM)
        self.assertEqual(builder.bounded_recipe(dict(copies=[legal]), image, image,
                         builder.STOCK_FROM, events, base)['copies'], [legal])
        for occupied in (dict(events=[dict(site=builder.STOCK_FROM, length=len(stock))], owned=[]),
                         dict(events=[], owned=[dict(site=builder.STOCK_FROM, length=len(stock))])):
            with self.assertRaises(ValueError):
                builder.bounded_recipe(recipe, image, stock, builder.STOCK_FROM, occupied, base)
        with self.assertRaises(ValueError):
            builder.bounded_recipe(recipe, image, stock, builder.STOCK_FROM, events,
                                   dict(sites=[dict(addr=hex(builder.STOCK_FROM), len=len(stock))]))
        with self.assertRaises(ValueError):
            builder.bounded_recipe(recipe, image, stock, builder.STOCK_END, events, base)


if __name__ == '__main__':
    unittest.main()
