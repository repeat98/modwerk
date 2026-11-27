"""Every native PAN position must equal the scalar integer law and RNG."""
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
import sys

MODULE = Path(__file__).resolve().parents[2]
ROOT = next(p for p in MODULE.parents if (p/'sdk/tests/host_flags.py').is_file())
sys.path.insert(0,str(ROOT/'sdk/tests'))
from host_flags import SANITIZE  # noqa: E402


@unittest.skipUnless(shutil.which('cc'), 'no host C compiler')
class PanBirthContract(unittest.TestCase):
    def test_all_widths_positions_unity_and_rng_match_integer_law(self):
        with tempfile.TemporaryDirectory(prefix='fract-pan-birth-') as directory:
            work = Path(directory)
            source = work / 'pan.c'
            source.write_text(r'''
#define main original_fixture_main
#include "fract_machine.c"
#undef main
static unsigned root(unsigned power) {
    unsigned lo=0,hi=257;
    while(hi-lo>1) {unsigned m=(lo+hi)/2;if(m*m<=power)lo=m;else hi=m;}
    return lo;
}
static uint32_t undo_left(uint32_t value,unsigned shift) {
    uint32_t out=value;for(unsigned i=shift;i<32;i+=shift)out^=value<<i;return out;
}
static uint32_t before_word(uint32_t word) {
    word=undo_left(word,5);word^=word>>17;return undo_left(word,13);
}
int main(void) {
    for(unsigned value=0;value<128;++value) {
        unsigned width=(value*128u+63u)/127u,range=2*width+1;
        for(unsigned position=0;position<range;++position) {
            uint32_t high=(position*65536u+range-1u)/range,word=high<<16|0x5ac7u;
            OgGrain state={0};state.seed=0x12345678u;state.pan_seed=before_word(word);
            uint32_t initial=state.pan_seed;
            OgHead head={0};head.phase=0x123abcdeu;head.cursor=27831;
            pan_birth(&state,&head,value);
            assert(state.seed==0x12345678u && head.phase==0x123abcdeu && head.cursor==27831);
            if(!value) {assert(state.pan_seed==initial && head.left==256 && head.right==256);continue;}
            assert(state.pan_seed==word);
            int pan=(int)(((word>>16)*range)>>16)-(int)width;
            assert(head.left==root(((unsigned)(128-pan)<<16)/(128+width)));
            assert(head.right==root(((unsigned)(128+pan)<<16)/(128+width)));
        }
    }
    return 0;
}
''')
            command = ['cc', '-std=c11', '-O1', '-Wall', '-Wextra', '-Werror', *SANITIZE,
                       '-fno-sanitize-recover=all', '-DOG_NATIVE_STAGE_ONE',
                       '-DOG_MACHINE_START_EXTENSION', '-DOG_FRACT_CURRENT_ENGINE', '-DOG_MACHINE_GRAIN_ONLY']
            for path in (MODULE/'engine', MODULE/'support', MODULE,
                         ROOT/'sdk/machines/octatrack/include', ROOT/'sdk/tests/fixtures'):
                command += ['-I', str(path)]
            binary = work / 'pan'
            r = subprocess.run([*command, str(source), '-o', str(binary)], capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, r.stderr)
            r = subprocess.run([str(binary)], capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
