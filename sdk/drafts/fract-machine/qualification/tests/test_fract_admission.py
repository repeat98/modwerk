"""The shipped profile admits one independent owner on either native DSP core."""
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

MODULE=Path(__file__).resolve().parents[2]
ROOT=next(p for p in MODULE.parents if (p/'sdk/tests/host_flags.py').is_file())
sys.path.insert(0,str(ROOT/'sdk/tests'))
from host_flags import SANITIZE

@unittest.skipUnless(shutil.which('cc'),'no host C compiler')
class AllTrackAdmission(unittest.TestCase):
    def test_all_tracks_exclusion_invalid_and_immutable_part(self):
        with tempfile.TemporaryDirectory(prefix='fract-admission-') as tmp:
            folder=Path(tmp);source=folder/'admission.c'
            source.write_text(r'''
#define main prior_fixture_main
#include "fract_machine.c"
#undef main
int main(void) {
 const struct modwerk_machine *m=&og_machine_descriptor;
 uint8_t part[6322],before[6322];
 for(unsigned owner=0;owner<8;++owner) {
  memset(part,0,sizeof part);
  for(unsigned track=0;track<8;++track)assert(m->admit_track(part,track));
  part[0x22+owner]=1;memcpy(part+0x3c+30*owner,"FR\1",3);
  memcpy(before,part,sizeof part);
  for(unsigned track=0;track<8;++track) {
   assert(m->admit_track(part,track)==(track==owner));
   assert(!memcmp(part,before,sizeof part));
  }
  part[0x3e + 30*owner]=2;
  for(unsigned track=0;track<8;++track)assert(m->admit_track(part,track));
 }
 assert(!m->admit_track(NULL,8));assert(!m->admit_track(NULL,~0u));
 puts("all8owners;64exclusionpairs;invalidtracks;Partimmutable");return 0;
}
''')
            cmd=['cc','-std=c11','-O1','-Wall','-Wextra','-Werror',*SANITIZE,
                 '-fno-sanitize-recover=all','-DOG_NATIVE_STAGE_ONE',
                 '-DOG_MACHINE_START_EXTENSION','-DOG_MACHINE_GRAIN_ONLY',
                 '-DOG_FRACT_CURRENT_ENGINE','-DOG_MACHINE_ALL_TRACKS']
            for path in (MODULE/'engine',MODULE/'support',MODULE,ROOT/'sdk/machines/octatrack/include',ROOT/'sdk/tests/fixtures'):
                cmd+=['-I',str(path)]
            result=subprocess.run([*cmd,str(source),'-o',str(folder/'check')],capture_output=True,text=True)
            self.assertEqual(result.returncode,0,result.stderr)
            result=subprocess.run([str(folder/'check')],capture_output=True,text=True)
            self.assertEqual(result.returncode,0,result.stdout+result.stderr)
