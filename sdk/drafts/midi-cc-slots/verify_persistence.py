#!/usr/bin/env python3
"""Exact-package saved-set check with real C loader/modset; simulated files, no hardware."""
import argparse
from pathlib import Path
import subprocess
import tempfile

from verify_loader import ROOT, fixture_source


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--package', required=True, type=Path)
    parser.add_argument('--main', required=True, type=Path)
    args = parser.parse_args()
    source = fixture_source(args.main) + r'''
extern uint32_t modwerk_test_ticks;
extern volatile uint32_t modwerk_modset_count, modwerk_modset_result;
void modwerk_modset_candidate(const uint8_t *, uint32_t);
void modwerk_modset_accepted(void);
void modwerk_modset_service(void);
const uint8_t modwerk_base_digest[32] = {1,2,3};
void modwerk_diag_set(void) {}
static const char *card;
static int fail_write;
int modwerk_test_file(int op,const char *path,uint8_t *data,unsigned length) {
    char file[2048]; snprintf(file,sizeof file,"%s%s",card,path);
    if(op && fail_write) return 0;
    FILE *f=fopen(file,op?"wb":"rb"); if(!f) return 0;
    unsigned done=op?fwrite(data,1,length,f):fread(data,1,length,f);
    int closed=fclose(f); return closed ? 0 : (int)done;
}
static void keep_package(void) {
    CHECK(b->enter(0));
    CHECK(b->prepare(0,p,n));
    if(failures) return;
    modwerk_modset_candidate(p,n);
    CHECK(b->publish(0)==MU_APPLIED && b->retire(0));
    modwerk_modset_accepted(); b->leave(0);
    modwerk_modset_service();
    CHECK(modwerk_modset_result==(fail_write?8u:7u));
}
int main(int argc,char **argv) {
    CHECK(argc==5); if(failures) return 1;
    card=argv[3]; const char *step=argv[4];
    FILE *f=fopen(argv[1],"rb"); CHECK(f); if(!f) return 1;
    CHECK(fread(stock,1,sizeof stock,f)==sizeof stock); fclose(f);
    memcpy(original,stock,sizeof stock);
    modwerk_test_ticks=181; modwerk_modset_service();
    if(!strcmp(step,"seed")) {
        CHECK(modwerk_modset_result==2);
        id=0x11223344; begin(8,0,RUNTIME_NONE,0,0,0,0x71); keep_package();
        CHECK(modwerk_modset_count==1 && modwerk_runtime_active()==1);
    } else {
        CHECK(modwerk_modset_result==1);
        int installed=!strcmp(step,"restored") || !strcmp(step,"remove");
        CHECK(modwerk_modset_count==(installed?2u:1u));
        CHECK(modwerk_runtime_active()==(installed?2u:1u));
        CHECK((memcmp(stock,original,sizeof stock)!=0)==installed);
        unsigned companion=0;
        for(unsigned i=0;i<RUNTIME_MODULES;i++) companion+=live[i] && live[i]->id==0x11223344;
        CHECK(companion==1); /* unrelated synthetic companion survives every boot */
        if(!strcmp(step,"install") || !strcmp(step,"failed")) {
            f=fopen(argv[2],"rb"); CHECK(f); if(!f) return 1;
            n=(uint32_t)fread(p,1,sizeof p,f); fclose(f);
            fail_write=!strcmp(step,"failed"); keep_package();
            CHECK(modwerk_modset_count==2 && modwerk_runtime_active()==2);
            CHECK(memcmp(stock,original,sizeof stock)!=0);
        } else if(!strcmp(step,"remove")) {
            f=fopen(argv[2],"rb"); CHECK(f); if(!f) return 1;
            CHECK(fread(p,1,32,f)==32); fclose(f);
            uint32_t module=be32(p+28); memset(p,0,32);
            memcpy(p,"MWRM\0\4",6); put32(p+28,module); n=32; keep_package();
            CHECK(modwerk_modset_count==1 && modwerk_runtime_active()==1);
            CHECK(!memcmp(stock,original,sizeof stock));
        }
    }
    CHECK(!locked && !masked);
    return failures?1:0;
}
'''
    with tempfile.TemporaryDirectory(prefix='cc-persistence-') as temp:
        folder = Path(temp)
        (folder / 'fixture.c').write_text(source)
        modset = ROOT / 'sdk/machines/octatrack/elekloader/modset.c'
        (folder / 'modset.c').write_text(f'#define MODWERK_HOST\n#include "{modset}"\n')
        subprocess.run(['cc', '-std=c99', '-I', str(ROOT / 'sdk/runtime/loader'),
                        '-I', str(ROOT / 'sdk/runtime/upload'), str(folder / 'fixture.c'),
                        str(folder / 'modset.c'), '-o', str(folder / 'fixture')], check=True)
        for case, steps in [('success', ['seed', 'install', 'restored', 'remove', 'removed']),
                            ('failed-save', ['seed', 'failed', 'removed'])]:
            card = folder / case
            card.mkdir()
            for step in steps:
                # Each invocation is a fresh process: all runtime and modset RAM is discarded.
                subprocess.run([str(folder / 'fixture'), str(args.main.resolve()),
                                str(args.package.resolve()), str(card), step], check=True)
    print('Exact package: Keep, fresh-process restore, removal/restart and failed-save fallback passed; '
          'synthetic companion preserved. Host file simulation only; no ColdFire or hardware execution.')


if __name__ == '__main__':
    main()
