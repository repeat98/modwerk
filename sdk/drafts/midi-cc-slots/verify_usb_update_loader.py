#!/usr/bin/env python3
"""Real C loader replacement/Undo of both reviewed packages; no CPU execution or USB."""
import argparse,subprocess,tempfile
from pathlib import Path
from verify_loader import ROOT,fixture_source

def main():
 p=argparse.ArgumentParser(description=__doc__)
 for key in ['main','original','test']:p.add_argument('--'+key,type=Path,required=True)
 a=p.parse_args();source=fixture_source(a.main)+r'''
static void read_package(const char *path){FILE *f=fopen(path,"rb");CHECK(f);if(f){n=(uint32_t)fread(p,1,sizeof p,f);fclose(f);}}
static void title(const char *name){CHECK(modwerk_runtime_active()==1);for(unsigned i=0;i<RUNTIME_MODULES;i++)if(live[i])CHECK(!strcmp(live[i]->dsp.name,name));}
int main(int argc,char **argv){
 CHECK(argc==4);if(failures)return 1;
 FILE *f=fopen(argv[1],"rb");CHECK(f);if(!f)return 1;CHECK(fread(stock,1,sizeof stock,f)==sizeof stock);fclose(f);memcpy(original,stock,sizeof stock);
 read_package(argv[2]);CHECK(b->prepare(0,p,n)&&b->publish(0)==MU_APPLIED&&b->retire(0));title("MIDI CC SLOTS");
 uint32_t free_before=modwerk_runtime_free(0);
 read_package(argv[3]);CHECK(b->prepare(0,p,n)&&b->publish(0)==MU_APPLIED);title("MIDI2 TEST 17");
 CHECK(b->restore(0)&&b->retire(0));title("MIDI CC SLOTS");CHECK(modwerk_runtime_free(0)==free_before);
 read_package(argv[3]);CHECK(b->prepare(0,p,n)&&b->publish(0)==MU_APPLIED&&b->retire(0));title("MIDI2 TEST 17");CHECK(modwerk_runtime_free(0)==free_before);
 read_package(argv[2]);CHECK(b->prepare(0,p,n)&&b->publish(0)==MU_APPLIED);title("MIDI CC SLOTS");
 CHECK(b->restore(0)&&b->retire(0));title("MIDI2 TEST 17");
 read_package(argv[2]);CHECK(b->prepare(0,p,n)&&b->publish(0)==MU_APPLIED&&b->retire(0));title("MIDI CC SLOTS");
 CHECK(modwerk_runtime_free(0)==free_before&&!locked&&!masked);return failures?1:0;
}
'''
 with tempfile.TemporaryDirectory(prefix='midi-update-loader-') as t:
  w=Path(t);(w/'test.c').write_text(source)
  subprocess.run(['cc','-std=c99','-I',str(ROOT/'sdk/runtime/loader'),'-I',str(ROOT/'sdk/runtime/upload'),str(w/'test.c'),'-o',str(w/'check')],check=True)
  subprocess.run([str(w/'check'),str(a.main.resolve()),str(a.original.resolve()),str(a.test.resolve())],check=True)
 print('Both exact packages: real loader replacement, Undo, retirement, reverse replacement and memory reclamation passed. Synthetic host only; not USB/CPU execution/card persistence.')
if __name__=='__main__':main()
