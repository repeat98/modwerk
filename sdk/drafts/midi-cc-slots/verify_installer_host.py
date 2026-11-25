#!/usr/bin/env python3
"""Real C loader + modset sector reader, exact installer packages; host glue only."""
import argparse,subprocess,tempfile
from pathlib import Path
from verify_loader import ROOT,fixture_source

def main():
 p=argparse.ArgumentParser(description=__doc__)
 for n in ['main','installer']:p.add_argument('--'+n,type=Path,required=True)
 a=p.parse_args()
 source='#define MODWERK_RUNTIME_EVENTS\n#define RUNTIME_MODULES 128\n#define RUNTIME_POOL_BYTES (768*1024)\n'+fixture_source(a.main)
 identity=__import__('json').loads((a.installer/'installer-receipt.json').read_text())['base']
 source+='\nconst unsigned char modwerk_raise_ev_mute_keep[]={0},modwerk_raise_ev_trig_muted[]={0};\nconst uint8_t modwerk_base_digest[32]={'+','.join('0x'+identity[i:i+2] for i in range(0,64,2))+'};\n'
 source+=r'''
const uint8_t modwerk_events_code[1]={0},modwerk_events_code_end[1]={0};
void modwerk_diag_set(void){}
void modwerk_diag_refused(uint32_t module,uint32_t refusal){(void)module;(void)refusal;}
extern uint32_t modwerk_test_ticks;
extern uint8_t modwerk_test_held;
extern volatile uint32_t modwerk_modset_count,modwerk_modset_result,modwerk_modset_generation;
void modwerk_modset_service(void);
struct file_object { uint32_t word[6]; };
uint8_t modwerk_test_card_io[512];
static const char *folder;
static int corrupt,foreign;
int olog_stock_open(struct file_object *o,const char *path,const char *mode,void *io,unsigned n) {
 (void)io;CHECK(n==512);char name[2048];snprintf(name,sizeof name,"%s%s",folder,path);FILE *f=fopen(name,!strcmp(mode,"r")?"rb":"wb");if(!f)return -1;
 memset(o,0,sizeof *o);memcpy(o,&f,sizeof f);o->word[4]=path[8]=='1';return 0;
}
int olog_stock_read(struct file_object *o,void *out,unsigned n) {
 FILE *f;memcpy(&f,o,sizeof f);long at=ftell(f);if(fread(out,1,n,f)!=n)return 0;
 if(at==0&&foreign&&n>=52)((uint8_t *)out)[20]^=1;
 if(at==512&&corrupt&&o->word[4])((uint8_t *)out)[0]^=1;
 return 1;
}
int olog_stock_write(struct file_object *o,const void *data,unsigned n){FILE *f;memcpy(&f,o,sizeof f);return fwrite(data,1,n,f)==n;}
int olog_stock_close(struct file_object *o){FILE *f;memcpy(&f,o,sizeof f);return fclose(f);}
int main(int argc,char **argv) {
 CHECK(argc==4);if(failures)return 1;folder=argv[2];
 FILE *f=fopen(argv[1],"rb");CHECK(f);if(!f)return 1;CHECK(fread(stock,1,sizeof stock,f)==sizeof stock);fclose(f);memcpy(original,stock,sizeof stock);
 base_features=0xffffu;metadata_allow=1;engine_why=0;
 corrupt=!strcmp(argv[3],"fallback");foreign=!strcmp(argv[3],"foreign");modwerk_test_held=!strcmp(argv[3],"skip");
 modwerk_test_ticks=200;modwerk_modset_service();
 if(foreign||modwerk_test_held){CHECK(modwerk_runtime_active()==0&&modwerk_modset_count==0);CHECK(modwerk_modset_result==(foreign?4u:3u));}
 else {
  CHECK(modwerk_modset_result==1&&modwerk_modset_count==4&&modwerk_runtime_active()==4);CHECK(modwerk_modset_generation==(corrupt?1u:2u));
  unsigned seen=0;for(unsigned i=0;i<RUNTIME_MODULES;i++)if(live[i]){uint32_t m=live[i]->id;seen|=m==0x95cff696u?1:m==0xbe4ff75au?2:m==0x73bab3b1u?4:m==0xf36a496du?8:0;}CHECK(seen==15);
  /* A normal USB-shaped replacement and Undo preserve all restored companions. */
  f=fopen(argv[1],"rb");CHECK(f);if(f)fclose(f);
  uint8_t remove[32]={0x4d,0x57,0x52,0x4d,0,4};put32(remove+28,0xf36a496du);
  CHECK(b->enter(0));CHECK(b->prepare(0,remove,32));CHECK(b->publish(0)==MU_APPLIED&&modwerk_runtime_active()==3);
  CHECK(b->restore(0)&&b->retire(0)&&modwerk_runtime_active()==4);CHECK(b->leave(0));
 }
 CHECK(!locked&&!masked);return failures?1:0;
}
'''
 with tempfile.TemporaryDirectory(prefix='installer-c-') as t:
  w=Path(t);(w/'fixture.c').write_text(source);(w/'modset.c').write_text('#define MODWERK_HOST\n#define MODWERK_HOST_CARD\n#define RUNTIME_MODULES 128\n#define RUNTIME_POOL_BYTES (768*1024)\n#include "'+str(ROOT/'sdk/machines/octatrack/elekloader/modset.c')+'"\n')
  subprocess.run(['cc','-std=c99','-I',str(ROOT/'sdk/runtime/loader'),'-I',str(ROOT/'sdk/runtime/upload'),'-I',str(ROOT/'sdk/machines/octatrack/elekloader'),str(w/'fixture.c'),str(w/'modset.c'),'-o',str(w/'check')],check=True)
  for case in ['restored','fallback','foreign','skip']:subprocess.run([str(w/'check'),str(a.main.resolve()),str(a.installer.resolve()),case],check=True)
 print('Exact four packages: actual C seed restoration, newer-slot corruption fallback, foreign-base/FUNC refusal, removal and Undo passed. Host glue, not hardware/DSP execution.')
if __name__=='__main__':main()
