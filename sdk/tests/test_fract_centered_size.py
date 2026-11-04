"""Source-coordinate and LCD properties for the private centred-SIZE engine."""
from pathlib import Path
import os
import subprocess
import tempfile
import unittest
from host_flags import SANITIZE

ROOT = Path(__file__).resolve().parents[2]


class CenteredSizeContract(unittest.TestCase):
    def compile_run(self, source, native=False):
        with tempfile.TemporaryDirectory(prefix='fract-centred-size-') as directory:
            binary = Path(directory) / 'fixture'
            command = ['cc', '-std=c11', '-O1', '-Wall', '-Wextra', '-Werror',
                       *SANITIZE, '-fno-sanitize-recover=all', '-DOG_MACHINE_GRAIN_ONLY']
            if native:
                command += ['-DOG_FRACT_CURRENT_ENGINE', '-DOG_NATIVE_STAGE_ONE', '-DOG_MACHINE_START_EXTENSION']
            else:
                command += ['-ffunction-sections', '-fdata-sections',
                            '-Wl,-dead_strip' if os.uname().sysname == 'Darwin' else '-Wl,--gc-sections']
            for path in ('sdk/drafts/fract-machine/engine', 'sdk/drafts/fract-machine/support',
                         'sdk/drafts/fract-machine', 'sdk/machines/octatrack/include',
                         'sdk/tests/fixtures'):
                command += ['-I', str(ROOT / path)]
            r = subprocess.run([*command, str(source), '-o', str(binary)], capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, r.stderr)
            r = subprocess.run([str(binary)], capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, r.stdout + r.stderr)

    def test_native_birth_coordinates_and_live_continuity(self):
        self.compile_run(ROOT / 'sdk/tests/fixtures/fract_centered_size.c', native=True)

    def test_both_bars_are_symmetric_monotonic_and_wrap(self):
        with tempfile.TemporaryDirectory(prefix='fract-centred-ui-') as directory:
            source = Path(directory) / 'bars.c'
            source.write_text(r'''
#include <assert.h>
#include <string.h>
#include "fract_ui.c"
#include "sizes.h"
static unsigned bit(uint32_t *f,unsigned x,unsigned y) {
 return (f[2*x+(y<32)]>>(y&31u))&1u;
}
int main(void) {
 const uint32_t lengths[]={1,2,441,2048,88200,441000,44860416};
 for(unsigned n=0;n<7;++n) {
  FractUiOverview v={0};v.frames=lengths[n];
  unsigned previous_centre=0;
  for(unsigned pos=0;pos<128;++pos) {
   v.position=(uint32_t)((uint64_t)(v.frames-1)*pos/127u);
   unsigned centre=ui_frame_x(v.position,v.frames)-10;
   assert(centre>=previous_centre);previous_centre=centre;
   uint32_t before[256]={0};unsigned previous_count=0;
   for(unsigned size=0;size<128;++size) {
    uint32_t f[256]={0};v.length=og_length(size>>1);
    fract_ui_overview_draw(f,&v);unsigned count=0;
    for(unsigned i=0;i<108;++i) {
     unsigned ink=bit(f,10+i,17);count+=ink;
     assert(ink==bit(f,10+i,43));
     assert(ink==bit(f,10+(2*centre+216-i)%108,17));
     assert(!bit(before,10+i,17) || ink);
    }
    assert(count>=3 && count>=previous_count);
    assert(bit(f,10+centre,17));
    if(v.length>=v.frames) assert(count==108);
    if(!pos) assert(bit(f,117,17) && bit(f,11,17));
    memcpy(before,f,sizeof f);previous_count=count;
   }
  }
 }
 return 0;
}
''')
            self.compile_run(source)


if __name__ == '__main__':
    unittest.main()
