#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""Compile the actual bank-read wrapper with a fake native writer; no firmware."""
from pathlib import Path
import subprocess
import tempfile

HERE=Path(__file__).resolve().parent
source=(HERE/'native.c').read_text()
start=source.index('static int bank_valid(')
bank=source[start:source.index('/* These are',start)]
start=source.index('int psl_bank_read(')
wrapper=source[start:source.index('__asm__(',start)]
code=r'''
#include <stdint.h>
#include <assert.h>
static unsigned entered,left,expected_banks;
static uintptr_t expected_file,expected_target;
static unsigned expected_probe;
static void psl_foreign_begin(unsigned patterns,unsigned tracks,unsigned banks)
{assert(patterns==65535 && tracks==255 && banks==expected_banks);++entered;}
static void psl_foreign_end(void){++left;}
int psl_stock_bank_read(uintptr_t file,uintptr_t target,unsigned probe)
{assert(file==expected_file && target==expected_target && probe==expected_probe);return 58;}
''' +bank+wrapper+r'''
int main(void)
{
    expected_file=0x1234;expected_target=0;expected_probe=1;
    assert(psl_bank_read(expected_file,expected_target,expected_probe)==58 && !entered && !left);
    /* Header checks never initialize a destination, even with a bank pointer. */
    expected_target=0x400e21e0u;expected_probe=2;
    assert(psl_bank_read(expected_file,expected_target,expected_probe)==58 && !entered && !left);
    expected_probe=0;
    for(unsigned n=0;n<16;++n){
        expected_banks=1u<<n;expected_target=0x400e21e0u+n*0x9b340u;
        assert(psl_bank_read(expected_file,expected_target,0)==58);
        expected_target+=0x08000000u;
        assert(psl_bank_read(expected_file,expected_target,0)==58);
    }
    assert(entered==32 && left==32);
    expected_banks=65535;expected_target=0x40123456u;
    assert(psl_bank_read(expected_file,expected_target,0)==58 && entered==33 && left==33);
}
'''
with tempfile.TemporaryDirectory(prefix='psl-native-scope-') as folder:
    path=Path(folder);(path/'test.c').write_text(code)
    subprocess.run(['cc','-std=c99','-Wall','-Wextra','-Werror','-fsanitize=address,undefined',
        str(path/'test.c'),'-o',str(path/'test')],check=True)
    subprocess.run([path/'test'],check=True)
print('PASS native bank scope: read-only startup probes, all destination banks and aliases, unknown destination, argument/return preservation')
