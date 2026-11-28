"""Bulk LCD updates preserve pixel clipping, word boundaries and ink modes."""
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

MODULE = Path(__file__).resolve().parents[2]
ROOT = next(p for p in MODULE.parents if (p/'sdk/tests/host_flags.py').is_file())
sys.path.insert(0,str(ROOT/'sdk/tests'))
from host_flags import SANITIZE  # noqa: E402


@unittest.skipUnless(shutil.which('cc'), 'no host C compiler')
class UiColumnContract(unittest.TestCase):
    def test_column_masks_equal_individual_pixels_at_every_edge(self):
        with tempfile.TemporaryDirectory(prefix='fract-ui-columns-') as directory:
            work = Path(directory)
            source = work / 'columns.c'
            source.write_text(r'''
#include <assert.h>
#include <string.h>
#include "fract_ui.c"
int main(void) {
    for(unsigned x=0;x<128;++x) for(unsigned y=0;y<64;++y)
      for(unsigned bits=0;bits<128;++bits) for(unsigned ink=0;ink<3;++ink) {
        uint32_t got[256],want[256];
        for(unsigned i=0;i<256;++i)got[i]=want[i]=0x195c3e87u^(i*0x7b13u);
        ui_column_bits(got,x,y,bits,ink);
        for(unsigned row=0;row<7;++row)if(bits&(1u<<row)) {
            unsigned yy=y+row;
            if(x<8 || x>=120 || yy<1 || yy>=56)continue;
            uint32_t *word=want+2*x+(yy<32),mask=1u<<(yy&31u);
            if(ink==2)*word^=mask;else if(ink)*word|=mask;else *word&=~mask;
        }
        assert(!memcmp(got,want,sizeof got));
    }
    return 0;
}
''')
            binary = work / 'columns'
            command = ['cc', '-std=c11', '-O1', '-Wall', '-Wextra', '-Werror',
                       *SANITIZE, '-fno-sanitize-recover=all', '-ffunction-sections',
                       '-fdata-sections', '-Wl,-dead_strip' if sys.platform == 'darwin' else '-Wl,--gc-sections']
            for path in (MODULE, MODULE/'support'):
                command += ['-I', str(path)]
            r = subprocess.run([*command, str(source), '-o', str(binary)], capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, r.stderr)
            r = subprocess.run([str(binary)], capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
