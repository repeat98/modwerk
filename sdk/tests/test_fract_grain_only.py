"""Active grain-only controls and lossless upgrade of older FR:1 Parts."""
import subprocess
import tempfile
from pathlib import Path
import unittest
import test_fract_machine as legacy
import test_fract_ui as ui

class FractGrainOnlyContract(legacy.FractMachineTests):
    PROFILE_FLAGS = ['-DOG_MACHINE_GRAIN_ONLY']

    def test_old_part_upgrade_preserves_grains_and_moves_shape_and_pan_once(self):
        with tempfile.TemporaryDirectory(prefix='fract-layout-') as directory:
            source = Path(directory)/'layout.c'
            source.write_text('''#include <assert.h>
#include <string.h>
#include "control_layout.h"
int main(void) {
 uint8_t part[6322], mirror[6322], expected[6322];
 for(unsigned previous=0;previous<2;++previous) for(unsigned t=0;t<8;++t) for(unsigned shape=0;shape<128;shape+=17)
  for(unsigned pan=0;pan<128;pan+=19) {
   memset(part,0x5a,sizeof part);memset(mirror,0x5a,sizeof mirror);
   part[og_control_offset(t,previous?4:5)]=mirror[og_control_offset(t,previous?4:5)]=shape;
   part[og_control_offset(t,previous?5:6)]=mirror[og_control_offset(t,previous?5:6)]=pan;
   part[og_control_offset(t,11)]=mirror[og_control_offset(t,11)]=previous?167:0;
   memcpy(expected,part,sizeof part);
   expected[og_control_offset(t,4)]=shape;
   expected[og_control_offset(t,5)]=64;
   expected[og_control_offset(t,6)]=pan;
   expected[og_control_offset(t,11)]=OG_GRAIN_LAYOUT_MARKER;
   assert(og_grain_layout_upgrade(part,mirror,t));
   assert(!memcmp(part,expected,sizeof part) && !memcmp(mirror,expected,sizeof part));
   assert(!og_grain_layout_upgrade(part,mirror,t));
   assert(!memcmp(part,expected,sizeof part) && !memcmp(mirror,expected,sizeof part));
  }
 assert(!og_grain_layout_upgrade(part,mirror,8));return 0;
}
''')
            binary=Path(directory)/'layout'
            result=subprocess.run(['cc','-std=c11','-Wall','-Wextra','-Werror','-I',str(legacy.DRAFT),str(source),'-o',str(binary)],capture_output=True,text=True)
            self.assertEqual(result.returncode,0,result.stderr)
            result=subprocess.run([str(binary)],capture_output=True,text=True)
            self.assertEqual(result.returncode,0,result.stderr)

class FractGrainUiContract(ui.FractUiContract):
    PROFILE_FLAGS = ['-DOG_MACHINE_GRAIN_ONLY']

if __name__ == '__main__':
    unittest.main()
