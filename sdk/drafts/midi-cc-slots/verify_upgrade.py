#!/usr/bin/env python3
"""Exact old/new draft upgrade and Undo with the real C loader; host glue only."""
import argparse
from pathlib import Path
import subprocess
import tempfile
from verify_loader import ROOT, fixture_source


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ['main', 'previous', 'package']:
        parser.add_argument('--'+name, required=True, type=Path)
    args = parser.parse_args()
    source = fixture_source(args.main) + r'''
static uint8_t previous_stock[sizeof stock];
static void read_package(const char *path) {
    FILE *f=fopen(path,"rb");CHECK(f);if(!f)return;
    n=(uint32_t)fread(p,1,sizeof p,f);fclose(f);
}
int main(int argc,char **argv) {
    CHECK(argc==4);if(failures)return 1;
    FILE *f=fopen(argv[1],"rb");CHECK(f);if(!f)return 1;
    CHECK(fread(stock,1,sizeof stock,f)==sizeof stock);fclose(f);
    memcpy(original,stock,sizeof stock);
    uint32_t free_before=modwerk_runtime_free(0);
    read_package(argv[2]);
    CHECK(b->prepare(0,p,n) && b->publish(0)==MU_APPLIED && b->retire(0));
    CHECK(modwerk_runtime_active()==1);memcpy(previous_stock,stock,sizeof stock);
    read_package(argv[3]);
    CHECK(b->prepare(0,p,n));
    if(failures){fprintf(stderr,"upgrade refusal %u\n",modwerk_runtime_refusal());return 1;}
    CHECK(b->publish(0)==MU_APPLIED && modwerk_runtime_active()==1);
    CHECK(memcmp(stock,previous_stock,sizeof stock)!=0);
    CHECK(b->restore(0) && b->retire(0));
    CHECK(modwerk_runtime_active()==1 && !memcmp(stock,previous_stock,sizeof stock));
    CHECK(b->prepare(0,p,n) && b->publish(0)==MU_APPLIED && b->retire(0));
    uint32_t id=be32(p+28);memset(p,0,32);memcpy(p,"MWRM\0\4",6);put32(p+28,id);
    CHECK(b->prepare(0,p,32) && b->publish(0)==MU_APPLIED && b->retire(0));
    CHECK(modwerk_runtime_active()==0 && !memcmp(stock,original,sizeof stock));
    CHECK(modwerk_runtime_free(0)==free_before && !locked && !masked);
    if(failures)return 1;
    puts("Exact previous/new packages: same-ID upgrade, Undo to previous, Keep new, removal and allocation recovery passed (host glue only).");return 0;
}
'''
    with tempfile.TemporaryDirectory(prefix='cc-upgrade-') as work:
        folder = Path(work)
        (folder/'fixture.c').write_text(source)
        subprocess.run(['cc', '-std=c99', '-I', str(ROOT/'sdk/runtime/loader'), '-I', str(ROOT/'sdk/runtime/upload'), str(folder/'fixture.c'), '-o', str(folder/'fixture')], check=True, capture_output=True)
        subprocess.run([str(folder/'fixture'), str(args.main.resolve()), str(args.previous.resolve()), str(args.package.resolve())], check=True)


if __name__ == '__main__':
    main()
