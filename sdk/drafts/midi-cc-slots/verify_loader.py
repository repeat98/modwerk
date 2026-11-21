#!/usr/bin/env python3
"""Exercise the real runtime loader with the private draft and user MAIN; no ColdFire execution or USB."""
import argparse
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[3]


def fixture_source(main):
    loader = ROOT / 'sdk/runtime/loader'
    source = (loader / 'tests/host_test.c').read_text().split('int main(void)')[0]
    source = source.replace('#include "../loader.c"', f'#include "{loader / "loader.c"}"')
    source = source.replace('#include "../../upload/sha256.c"', f'#include "{ROOT / "sdk/runtime/upload/sha256.c"}"')
    source = source.replace('#define STOCK 0x1000u', '#define STOCK 0x40000400u')
    # The original small fake address range never crosses the host pool's
    # truncated address; real firmware addresses need an explicit upper bound.
    source = source.replace('a >= lo && n <= RUNTIME_POOL_BYTES - (a - lo)', 'a >= lo && a - lo < RUNTIME_POOL_BYTES && n <= RUNTIME_POOL_BYTES - (a - lo)')
    size = main.stat().st_size
    source = source.replace('stock[256], original[256]', f'stock[{size}], original[{size}]')
    return source


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--package', required=True, type=Path)
    p.add_argument('--main', required=True, type=Path)
    args = p.parse_args()
    loader = ROOT / "sdk/runtime/loader"
    source = fixture_source(args.main)
    source += r'''
int main(int argc, char **argv) {
    CHECK(argc == 3);
    FILE *f = fopen(argv[1], "rb"); CHECK(f); if (!f) return 1;
    CHECK(fread(stock, 1, sizeof stock, f) == sizeof stock); fclose(f);
    memcpy(original, stock, sizeof stock);
    f = fopen(argv[2], "rb"); CHECK(f); if (!f) return 1;
    n = (uint32_t)fread(p, 1, sizeof p, f); fclose(f);
    uint32_t free_before = modwerk_runtime_free(0);
    CHECK(b->prepare(0,p,n));
    if (failures) { fprintf(stderr,"prepare refusal %u\n",modwerk_runtime_refusal());return 1; }
    CHECK(b->publish(0)==MU_APPLIED && modwerk_runtime_active()==1);
    CHECK(memcmp(stock, original, sizeof stock)!=0);
    CHECK(b->restore(0) && b->retire(0) && modwerk_runtime_active()==0);
    CHECK(!memcmp(stock, original, sizeof stock) && modwerk_runtime_free(0)==free_before);
    CHECK(b->prepare(0,p,n) && b->publish(0)==MU_APPLIED && b->retire(0));
    /* The empty package removes this same id; Undo above and removal both restore every byte. */
    uint32_t id_saved=be32(p+28); memset(p,0,32); memcpy(p,"MWRM\0\4",6);put32(p+28,id_saved);
    CHECK(b->prepare(0,p,32) && b->publish(0)==MU_APPLIED && b->retire(0));
    CHECK(modwerk_runtime_active()==0 && !memcmp(stock,original,sizeof stock));
    CHECK(modwerk_runtime_free(0)==free_before && !locked && !masked);
    if(failures)return 1;
    puts("Exact draft: loader prepare, publish, Undo, repeat install, removal and full memory reclamation passed (host glue; no firmware execution).");return 0;
}
'''
    with tempfile.TemporaryDirectory(prefix='cc-loader-') as temp:
        folder = Path(temp); (folder/'fixture.c').write_text(source)
        subprocess.run(['cc','-std=c99','-I',str(loader),'-I',str(ROOT/'sdk/runtime/upload'),str(folder/'fixture.c'),'-o',str(folder/'fixture')],check=True,capture_output=True)
        subprocess.run([str(folder/'fixture'),str(args.main.resolve()),str(args.package.resolve())],check=True)

if __name__ == '__main__':
    main()
