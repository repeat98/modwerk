"""Live SIZE modulation must preserve the independent scalar audio/state."""
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
class SizeModulationContract(unittest.TestCase):
    def test_every_size_step_and_continuously_modulated_audio_match_scalar(self):
        with tempfile.TemporaryDirectory(prefix='fract-size-modulation-') as directory:
            work = Path(directory)
            source = work / 'size.c'
            source.write_text(r'''
#define main original_fixture_main
#include "fract_machine.c"
#undef main
extern void cpu_reference_all(OgGrain *,uint32_t,const uint8_t *,int32_t *,unsigned,
                              void (*)(void *,uint32_t,int32_t *),void *);
extern void cpu_reference_reset(OgGrain *,uint32_t);
static void reference_read(void *context,uint32_t frame,int32_t *pcm) {
    OgSource *s=context;unsigned remaining;
    uintptr_t at=og_locate(s,frame,&remaining);decode(s,at,pcm);
    if(s->frames>=2048 && s->frames-1u-frame<128u && at) {
        int32_t first[2];uintptr_t start=og_locate(s,0,&remaining);decode(s,start,first);
        if(start)for(unsigned c=0;c<2;++c)
            pcm[c]=(int16_t)(pcm[c]+(((first[c]-pcm[c])*(int)(128u-(s->frames-1u-frame)))>>7));
    }
}
int main(void) {
    _Static_assert(OG_ENGINE_READERS==2 && OG_MAX_GRAINS==3 && sizeof(OgGrain)==128,"Two live readers; unchanged storage ABI");
    for(unsigned i=0;i<64;++i)
        assert(og_step(i)==(1u<<31)/(og_length(i)-1u));
    for(unsigned size=0;size<128;++size)for(unsigned density=1;density<128;++density) {
        uint32_t length=og_size(size);
        assert(og_hop(length,density)==(length*127u+2u*density-1u)/(2u*density));
    }
    OgGrain stopped;memset(&stopped,0x5a,sizeof stopped);og_reset(&stopped,17);
    for(unsigned g=0;g<OG_MAX_GRAINS;++g)assert(!stopped.head[g].length && !stopped.head[g].rev_seed);
    stopped.head[2].length=123;og_stop(&stopped);
    for(unsigned g=0;g<OG_MAX_GRAINS;++g)assert(!stopped.head[g].length);
    unsigned random=0x27f4ac71u;
    for(unsigned format=0;format<4;++format) {
        fixture(format,2049);
        OgSource src={0};assert(og_describe(0,&src));src.join_mode=1;
        OgGrain native={0},scalar={0};og_reset(&native,1);cpu_reference_reset(&scalar,1);
        for(unsigned n=0;n<4096;++n) {
            random=random*1664525u+1013904223u;
            uint8_t p[OG_PARAMS]={127,(uint8_t)(n&127u),(uint8_t)(random>>25),64,
                (uint8_t)(random>>17&127u),(uint8_t)(random>>9&127u),
                (uint8_t)(n*7u&127u),(uint8_t)(random>>1&127u)};
            if(n%4==0)p[1]=0;
            if(n%4==1)p[1]=127;
            if(n%11==0)p[0]=8;
            unsigned count=1u+(n%64u);
            int32_t got[128],want[128];
            for(unsigned j=0;j<128;++j)got[j]=want[j]=((int)j-64)*65536;
            og_engine(&native,&src,p,got,count);
            cpu_reference_all(&scalar,src.frames,p,want,count,reference_read,&src);
            assert(!memcmp(got,want,sizeof got));
            assert(!memcmp(&native,&scalar,sizeof native));assert(!native.head[2].length);
        }
    }
    /* A failed launch may be coalesced only inside this call. Preserve the
     * exact countdown even at its end, before a later SIZE edit rescales it. */
    const unsigned waits[]={0,1,7,8,15,16,24,25,31,32,63,64,100};
    const unsigned counts[]={1,2,7,8,15,16,31,32,63,64};
    for(unsigned format=0;format<4;++format)for(unsigned edit=0;edit<2;++edit) {
        fixture(format,2049);
        OgSource src={0};assert(og_describe(0,&src));src.join_mode=1;
        OgGrain native={0},scalar={0};og_reset(&native,1);cpu_reference_reset(&scalar,1);
        uint8_t p[OG_PARAMS]={127,0,18,64,127,127,0,127};
        int32_t got[128],want[128];
        for(unsigned warm=0;warm<52;++warm) {
            for(unsigned j=0;j<128;++j)got[j]=want[j]=((int)j-64)*65536;
            og_engine(&native,&src,p,got,8);
            cpu_reference_all(&scalar,src.frames,p,want,8,reference_read,&src);
            assert(!memcmp(got,want,sizeof got));assert(!memcmp(&native,&scalar,sizeof native));assert(!native.head[2].length);
        }
        for(unsigned g=0;g<OG_ENGINE_READERS;++g)assert(native.head[g].length);
        for(unsigned g=OG_ENGINE_READERS;g<OG_MAX_GRAINS;++g)assert(!native.head[g].length);
        for(unsigned w=0;w<sizeof waits/sizeof *waits;++w)
        for(unsigned c=0;c<sizeof counts/sizeof *counts;++c) {
            OgGrain a=native,b=scalar;a.countdown=b.countdown=waits[w];
            p[1]=edit?127:0;
            for(unsigned pass=0;pass<2;++pass) {
                for(unsigned j=0;j<128;++j)got[j]=want[j]=((int)j-64)*65536;
                unsigned count=pass?7:counts[c];
                og_engine(&a,&src,p,got,count);
                cpu_reference_all(&b,src.frames,p,want,count,reference_read,&src);
                assert(!memcmp(got,want,sizeof got));assert(!memcmp(&a,&b,sizeof a));assert(!a.head[2].length);
                p[1]^=127;
            }
        }
    }
    puts("all64 SIZE steps;16384 modulated callbacks plus occupied-head boundaries: exact audio and state");
    return 0;
}
''')
            flags = ['cc', '-std=c11', '-O1', '-Wall', '-Wextra', '-Werror',
                     *SANITIZE, '-fno-sanitize-recover=all', '-DOG_MACHINE_GRAIN_ONLY']
            for path in (MODULE/'engine', MODULE/'support', MODULE,
                         ROOT/'sdk/machines/octatrack/include', ROOT/'sdk/tests/fixtures'):
                flags += ['-I', str(path)]
            oracle = work / 'oracle.o'
            r = subprocess.run([*flags, '-c', str(ROOT / 'sdk/tests/fixtures/fract_cpu_reference.c'),
                                '-o', str(oracle)], capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, r.stderr)
            binary = work / 'size'
            r = subprocess.run([*flags, '-DOG_FRACT_CURRENT_ENGINE', '-DOG_NATIVE_STAGE_ONE',
                                '-DOG_MACHINE_START_EXTENSION', str(source), str(oracle),
                                '-o', str(binary)], capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, r.stderr)
            r = subprocess.run([str(binary)], capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
