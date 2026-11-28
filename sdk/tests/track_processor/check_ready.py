#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""Actual Base loader/modset native tests; no module or firmware execution."""
from pathlib import Path
import shutil,subprocess,tempfile
def loader(source): return source
header=modset=publication_loader=publication_header=loader  # actual patched source
ROOT=Path(__file__).resolve().parents[3];SDK=ROOT/'sdk'
with tempfile.TemporaryDirectory(prefix='ms-set-ready-') as work:
    work=Path(work);rt=work/'runtime';shutil.copytree(SDK/'runtime',rt)
    (rt/'loader/loader.c').write_text(publication_loader(loader((rt/'loader/loader.c').read_text())))
    (rt/'loader/loader.h').write_text(publication_header(header((rt/'loader/loader.h').read_text())))
    host=rt/'loader/tests/host_test.c';host_source=host.read_text()
    host_source=host_source.replace('    if (failures) { fprintf(stderr, "%u loader checks failed', '''    /* Publication continuity is position-specific, including an Undo to the
       same predecessor image; owner ABI and generation stay unchanged. */
    struct runtime_module pa={0},pb={0};uint8_t ia[4],ib[4];
    pa.dsp.image=ia;pb.dsp.image=ib;
    unsigned spare=RUNTIME_MODULES-1u;CHECK(!live[spare] && !live[spare-1u]);
    set_live(spare,&pa);uint32_t first=modwerk_runtime_publication((uintptr_t)ia);
    CHECK(first);set_live(spare-1u,&pb);
    CHECK(modwerk_runtime_publication((uintptr_t)ia)==first);
    set_live(spare,0);CHECK(!modwerk_runtime_publication((uintptr_t)ia));
    set_live(spare,&pa);CHECK(modwerk_runtime_publication((uintptr_t)ia)>first);
    publication_sequence=UINT32_MAX;set_live(spare,&pa);
    CHECK(!modwerk_runtime_publication((uintptr_t)ia));
    set_live(spare,0);set_live(spare-1u,0);
    if (failures) { fprintf(stderr, "%u loader checks failed''',1)
    host.write_text(host_source)
    tests=rt/'loader/tests/set_test.h';text=tests.read_text()
    text=text.replace('CHECK(change_set.count==3 && change_set.published==0',
                      'CHECK(!modwerk_runtime_set_trial_ready());\n        CHECK(change_set.count==3 && change_set.published==0',1)
    text=text.replace('CHECK(change_set.published==cut &&',
                      'CHECK(modwerk_runtime_set_trial_ready()==(cut==3));\n        CHECK(change_set.published==cut &&',1)
    text=text.replace('CHECK(!modwerk_runtime_set_busy() &&',
                      'CHECK(!modwerk_runtime_set_trial_ready());\n        CHECK(!modwerk_runtime_set_busy() &&',1)
    tests.write_text(text)
    common=['clang','-std=c99','-Wall','-Wextra','-Werror','-O1','-fsanitize=undefined','-fno-sanitize-recover=all']
    subprocess.run([*common,'-DMODWERK_RUNTIME_SETS','-DRUNTIME_MODULES=128u','-DRUNTIME_POOL_BYTES=786432u',
        '-I'+str(rt/'loader'),'-I'+str(rt/'upload'),str(rt/'loader/tests/host_test.c'),str(rt/'upload/upload.c'),'-o',str(work/'loader-test')],check=True)
    subprocess.run([str(work/'loader-test')],check=True)
    machine=SDK/'machines/octatrack/elekloader'
    source=modset((machine/'modset.c').read_text())
    source=source.replace('#if defined MODWERK_RUNTIME_EVENTS && !defined MODWERK_HOST','#if defined MODWERK_RUNTIME_EVENTS')
    source=source.replace('extern const unsigned char modwerk_raise_ev_modules_ready[];', 'extern unsigned ms_test_ready(void);')
    source=source.replace('(void)((unsigned (*)(void))(uintptr_t)modwerk_raise_ev_modules_ready)();','(void)ms_test_ready();')
    (work/'modset.c').write_text(source)
    fixture=(machine/'test_modset.c').read_text()
    declarations='''
#define MODWERK_TEST_TRIAL_READY_IMPLEMENTED
static int ms_set_busy,ms_set_settled;
static unsigned ms_ready_calls;
static uint32_t ms_owner_epoch=2;
int modwerk_runtime_volatile_busy(void);
int modwerk_runtime_set_busy(void){return ms_set_busy;}
int modwerk_runtime_set_trial_ready(void){return ms_set_settled && !modwerk_runtime_volatile_busy();}
uint32_t modwerk_runtime_owner_epoch(void){return ms_owner_epoch;}
void modwerk_sample_memory_service(void){}
unsigned ms_test_ready(void){++ms_ready_calls;return 0;}
'''
    fixture=fixture.replace('#include "modset.c"',declarations+'\n#include "modset.c"',1)
    cases='''
    restored=1;pending=1;retry_at=0;modwerk_test_gate=1;volatile_busy=0;
    unsigned ready_before=ms_ready_calls,writes_before=writes;uint32_t result_before=modwerk_modset_result;
    ms_set_busy=1;ms_set_settled=0;ms_owner_epoch+=2;
    modwerk_modset_service();CHECK(ms_ready_calls==ready_before && writes==writes_before && pending);
    ms_set_settled=1;modwerk_modset_service();
    CHECK(ms_ready_calls==ready_before+1 && writes==writes_before && pending && modwerk_modset_result==result_before);
    modwerk_modset_service();CHECK(ms_ready_calls==ready_before+1 && writes==writes_before);
    volatile_busy=1;ms_owner_epoch+=2;modwerk_modset_service();CHECK(ms_ready_calls==ready_before+1 && writes==writes_before);
    volatile_busy=0;ms_set_settled=0;modwerk_modset_service();CHECK(ms_ready_calls==ready_before+1 && writes==writes_before);
'''
    fixture=fixture.replace('    if (failures) {',cases+'    if (failures) {',1)
    (work/'test.c').write_text(fixture)
    subprocess.run([*common,'-DMODWERK_HOST','-DMODWERK_RUNTIME_SETS','-DMODWERK_RUNTIME_EVENTS',
        '-I'+str(work),'-I'+str(rt/'loader'),'-I'+str(rt/'upload'),'-I'+str(machine),
        str(work/'test.c'),'-o',str(work/'modset-test')],check=True)
    subprocess.run([str(work/'modset-test')],check=True)
print('PASS: completed-set readiness only; partial/rollback/volatile states blocked, no saved-set writes during trial')
