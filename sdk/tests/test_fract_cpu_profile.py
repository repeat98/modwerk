"""Private measurement must preserve the native source/audio contracts."""
from pathlib import Path
import subprocess
import tempfile
import unittest
from host_flags import SANITIZE

ROOT=Path(__file__).resolve().parents[2]

class FractCpuProfileTests(unittest.TestCase):
    def test_timer_windows_and_native_audio_contracts(self):
        with tempfile.TemporaryDirectory(prefix='fract-profile-') as temp:
            work=Path(temp)
            flags=['cc','-std=c11','-O1','-Wall','-Wextra','-Werror',*SANITIZE,
                   '-fno-sanitize-recover=all','-DOG_MACHINE_CPU_PROFILE',
                   '-DOG_MACHINE_GRAIN_ONLY','-DOG_MACHINE_PROTOTYPE',
                   '-DOG_FRACT_CURRENT_ENGINE','-DOG_MACHINE_START_EXTENSION','-DOG_NATIVE_STAGE_ONE']
            for folder in ('sdk/drafts/fract-machine/engine','sdk/drafts/fract-machine/support',
                           'sdk/drafts/fract-machine','sdk/machines/octatrack/include',
                           'sdk/runtime/loader','sdk/tests/fixtures'):
                flags+=['-I',str(ROOT/folder)]
            wrapped=work/'native.c'
            wrapped.write_text('#include <stdint.h>\nstatic uint32_t clock_ticks;\n'
                               '#define OG_CPU_TIMER() (clock_ticks++)\n'
                               '#include "cpu_profile.c"\n'
                               '#define main native_fixture_main\n'
                               '#include "fract_machine.c"\n#undef main\n'+r'''
#ifdef OG_MACHINE_CPU_PROFILE_DETAIL
static void phase_checks(void) {
    uint32_t observed[4]={0};
    for (unsigned format=0;format<4;++format) {
        fixture(format,2049);
        OgSource src={0};assert(og_describe(0,&src));
        OgGrain state={0};
        uint8_t controls[OG_PARAMS]={127,16,64,64,64,64};
        for (unsigned block=0;block<64;++block) {
            unsigned count=block+1;
            int32_t audio[128]={0};
            uint32_t before[4];
            for (unsigned k=0;k<4;++k) before[k]=grain_phase[k];
            uint32_t grain_before=sums[GRAIN];
            uint32_t render_at=og_cpu_render_begin(count);
            uint32_t grain_at=og_cpu_clock();
            og_engine(&state,&src,controls,audio,count);
            og_cpu_grain_end(grain_at,count);
            og_cpu_render_end(render_at);
            uint32_t phase_ticks=0;
            for (unsigned k=0;k<4;++k) {
                uint32_t delta=grain_phase[k]-before[k];
                observed[k]+=delta;phase_ticks+=delta;
            }
            /* The fake clock advances once per timer read. Overlapping
             * output/birth/mix timers double count reads and fail this. */
            assert(phase_ticks<=sums[GRAIN]-grain_before);
        }
    }
    for (unsigned k=0;k<4;++k) assert(observed[k]>0);
    puts("nonoverlapping engine phases across formats and chunk sizes OK");
}
#endif
int main(int argc,char **argv) {
#ifdef OG_MACHINE_CPU_PROFILE_DETAIL
    if (argc==2 && !strcmp(argv[1],"phases")) {phase_checks();return 0;}
#endif
    return native_fixture_main(argc,argv);
}
''')
            for detail in (False,True):
                profile_flags=['-DOG_MACHINE_CPU_PROFILE_DETAIL'] if detail else []
                for source,name,modes in ((ROOT/'sdk/tests/fixtures/fract_cpu_profile.c','timer',['']),
                                          (wrapped,'native',['differential','native','packets','start','lifecycle'])):
                    if detail and name=='native':
                        modes=[*modes,'phases']
                    binary=work/(name+('-detail' if detail else ''))
                    with self.subTest(detail=detail,fixture=name):
                        result=subprocess.run([*flags,*profile_flags,str(source),'-o',str(binary)],capture_output=True,text=True)
                        self.assertEqual(result.returncode,0,result.stderr)
                    for mode in modes:
                        with self.subTest(detail=detail,fixture=name,mode=mode):
                            result=subprocess.run([str(binary),*([mode] if mode else [])],capture_output=True,text=True)
                            self.assertEqual(result.returncode,0,result.stdout+result.stderr)

if __name__=='__main__':
    unittest.main()
