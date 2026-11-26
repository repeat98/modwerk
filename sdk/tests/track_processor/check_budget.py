#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""Native tests of actual DSP glue and publication code; no firmware runs."""
from pathlib import Path
import subprocess,tempfile,re
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[3]/'sdk/machines/octatrack/module-adapters'))
from track_budget import dsp
def publication(source): return source  # actual public source is already gated
ROOT=Path(__file__).resolve().parents[3];SDK=ROOT/'sdk'
machine=SDK/'machines/octatrack/elekloader';dyn=SDK/'octabam/platform/dsp-dynload-transport'
flags=['clang','-std=c11','-Wall','-Wextra','-Werror','-O1','-fsanitize=undefined','-fno-sanitize-recover=all']
with tempfile.TemporaryDirectory(prefix='ms-budget-') as td:
    work=Path(td)
    (work/'dsp.c').write_text(dsp((machine/'dsp.c').read_text(),(SDK/'machines/octatrack/module-adapters/resident-runtime/track_budget.c').read_text()))
    fixture=(machine/'test_dsp.c').read_text()
    declarations='''
static unsigned budget_locks,budget_inject,budget_nudges;
static uint8_t incoming[16];
uint16_t ms_track_budget_lock(void){
    ++budget_locks;
    if(budget_inject && budget_locks==2){budget_inject=0;CHECK(modwerk_dsp_track_target(incoming));}
    return 0;
}
void ms_track_budget_unlock(uint16_t s){CHECK(!s);}
void dl_residency_nudge(void){++budget_nudges;}
'''
    fixture=fixture.replace('/* The compaction planner:',declarations+'\n/* The compaction planner:',1)
    cases='''
    modwerk_test_bank=0;memset(modwerk_test_live_fx,0,16);
    memset(source_voice,0,sizeof source_voice);memset(source_owner,0,sizeof source_owner);
    memset(source_engine,0,sizeof source_engine);memset(slot_cycles,0,sizeof slot_cycles);
    memset(owner,0,sizeof owner);dl_catalog[0].cycles=0;dl_catalog[13].cycles=342;
    memset(incoming,13,16);
    /* First activation interrupted between fit and reservation. The boundary
       sees the prospective price, publishes with M/S off, and closes ENABLE. */
    budget_locks=0;budget_inject=1;
    CHECK(!modwerk_dsp_track_charge(100,448,RUNTIME_EXECUTED,1));
    CHECK(!track_cycles && !budget_inject && track_quote==784);
    for(unsigned i=0;i<3;++i)modwerk_dsp_track_tick();
    CHECK(modwerk_dsp_track_charge(100,448,RUNTIME_EXECUTED,1) && track_cycles==784);
    CHECK(!modwerk_dsp_track_target(incoming) && track_cycles==784);
    CHECK(!modwerk_dsp_track_fits(100,448,RUNTIME_EXECUTED));
    /* Off is acknowledged elsewhere; releasing charge nudges an unchanged
       automatic bank selection. A repeated release cannot nudge twice. */
    unsigned nudges=budget_nudges;
    CHECK(modwerk_dsp_track_charge(100,0,0,0) && budget_nudges==nudges+1);
    CHECK(modwerk_dsp_track_charge(100,0,0,0) && budget_nudges==nudges+1);
    CHECK(modwerk_dsp_track_target(incoming));
    for(unsigned i=0;i<3;++i)modwerk_dsp_track_tick();
    CHECK(modwerk_dsp_track_fits(100,448,RUNTIME_EXECUTED));
    CHECK(modwerk_dsp_track_charge(100,448,RUNTIME_EXECUTED,1));
    /* Mandatory bank costs pause M/S first. Source ownership is preserved
       while the reservation is still held; allocator keeps refusing. */
    source_owner[4]=99;source_voice[4]=10;
    uint32_t mandatory[16];for(unsigned i=0;i<16;++i)mandatory[i]=342;
    make_way(mandatory);CHECK(source_owner[4]==99 && source_voice[4]==10);
    CHECK(track_cycles==784 && !modwerk_dsp_track_fits(100,448,RUNTIME_EXECUTED));
    CHECK(modwerk_dsp_track_charge(100,0,0,0));
    /* Project loads keep a lease until their native intermediate sets finish. */
    CHECK(modwerk_dsp_track_target(0));
    modwerk_dsp_track_tick();CHECK(!modwerk_dsp_track_fits(100,448,RUNTIME_EXECUTED));
    modwerk_dsp_track_tick();modwerk_dsp_track_tick();
    CHECK(modwerk_dsp_track_fits(100,448,RUNTIME_EXECUTED));
'''
    fixture=fixture.replace('    if (failures) { fprintf(stderr, "%u DSP glue checks failed',cases+'    if (failures) { fprintf(stderr, "%u DSP glue checks failed',1)
    (work/'test.c').write_text(fixture)
    subprocess.run([*flags,'-DMS_TRACK_BUDGET_HOST','-DMODWERK_HOST',
        '-DMODWERK_DSP_ALLOWANCE0=3120','-DMODWERK_DSP_ALLOWANCE1=3565','-DMODWERK_DSP_RESERVE=342',
        '-I'+str(work),'-I'+str(machine),'-I'+str(dyn),'-I'+str(SDK/'runtime/upload'),'-I'+str(SDK/'runtime/loader'),
        str(work/'test.c'),'-o',str(work/'budget-test')],check=True)
    subprocess.run([str(work/'budget-test')],check=True)
    (work/'publication.c').write_text(publication((dyn/'publication.c').read_text()))
    fixture=(SDK/'octabam/tools/experimental/dsp_dynload/test_publication.c').read_text()
    # Ordinary DSP-loader builds have no resident track reservation service.
    # Keep the unmodified baseline fixture as a link/behavior regression.
    (work/'publication-baseline.c').write_text(fixture)
    subprocess.run([*flags,'-DDL_NATIVE_TEST','-I'+str(dyn),str(work/'publication.c'),str(work/'publication-baseline.c'),'-o',str(work/'publication-baseline')],check=True)
    subprocess.run([str(work/'publication-baseline')],check=True)
    fixture=fixture.replace('static unsigned prepared,cancelled,armed,requeued;',
'''static unsigned prepared,cancelled,armed,requeued;
static unsigned target_open=1,target_calls;
int modwerk_dsp_track_target(const uint8_t *ids){(void)ids;++target_calls;return target_open;}''',1)
    cases='''
    /* Incoming target is already resident, but M/S still owns its charge.
       Boundary holds/replays the exact request until known off. */
    prepare_reply=DL_SELECT_WAIT;reply=DL_SELECT_WAIT;ready=1;target_open=0;
    dl_pub_memory[0xc0]=8;unsigned was_prepared=prepared,was_armed=armed,was_refused=dl_publication_refused;
    assert(!dl_pattern_boundary());
    for(unsigned i=0;i<6;++i)dl_publication_tick();
    assert(prepared==was_prepared && dl_publication_refused==was_refused);
    target_open=1;dl_publication_tick();reply=DL_SELECT_READY;dl_publication_tick();
    assert(prepared==was_prepared+1 && armed==was_armed+1 && dl_pub_memory[0xc0]==8);
    assert(dl_pattern_boundary());dl_pub_memory[0xbe]=8;dl_publication_tick();
    /* Unbound incoming target, partial preparation, then capacity loss. The
       manager still advances independently; a cached cycle refusal retries
       with a fresh token instead of discarding the requested pattern. */
    ready=0;reply=DL_SELECT_WAIT;dl_pub_memory[0xc0]=9;dl_publication_tick();
    target_open=0;was_prepared=prepared;was_refused=dl_publication_refused;
    for(unsigned i=0;i<6;++i)dl_publication_tick();
    target_open=1;reply=DL_SELECT_PROCESSING;dl_publication_tick();
    reply=DL_SELECT_WAIT;dl_publication_tick();assert(prepared==was_prepared+1);
    reply=DL_SELECT_READY;dl_publication_tick();ready=1;assert(dl_pattern_boundary());
    dl_pub_memory[0xbe]=9;dl_publication_tick();assert(dl_publication_refused==was_refused);
    /* A newer request supersedes a wait; no stale target reappears. */
    target_open=0;dl_pub_memory[0xc0]=10;dl_publication_tick();
    dl_pub_memory[0xc0]=11;dl_publication_tick();target_open=1;reply=DL_SELECT_WAIT;
    dl_publication_tick();reply=DL_SELECT_READY;dl_publication_tick();
    assert(dl_pub_memory[0xc0]==11 && target_calls);
'''
    fixture=fixture.replace('    puts("PASS:',cases+'    puts("PASS:',1)
    (work/'publication-test.c').write_text(fixture)
    subprocess.run([*flags,'-DMODWERK_RESIDENT_STOCK_HOOKS','-DDL_NATIVE_TEST','-I'+str(dyn),str(work/'publication.c'),str(work/'publication-test.c'),'-o',str(work/'publication-test')],check=True)
    subprocess.run([str(work/'publication-test')],check=True)
    # Compile the actual immediate/project request logic with only its native
    # register access and calls substituted. No stock routine is executed.
    source=publication((dyn/'publication.c').read_text())
    chunks=source.split('#ifndef DL_NATIVE_TEST')
    source=chunks[0]+''.join(('#ifndef DL_NATIVE_TEST' if i in (2,3,4) else '#if 1')+s for i,s in enumerate(chunks[1:],1))
    source=re.sub(r'__asm__ volatile\("move.w[^;]+;', '(void)0;', source,flags=re.S)
    source=source.replace('uint16_t sr;', '(void)0;')
    source=source.replace('*(volatile uint32_t *)0x800065b8u','host_playing')
    source='static unsigned host_playing;\n'+source
    (work/'immediate.c').write_text(source)
    fixture='''
#include <assert.h>
#include <stdint.h>
#include <string.h>
#include <stdio.h>
#include "immediate.c"
uint8_t dl_pub_memory[256];volatile uint32_t dl_modal_pending,dl_residency_enabled=1;
const uint32_t dl_stub_at_boot=1;
static unsigned open_gate=1,gate_calls,prepares,arms,cancels,posts,loads;
static uint32_t last_args[5];static int answer=DL_SELECT_WAIT,resident;
int modwerk_dsp_track_target(const uint8_t *p){(void)p;++gate_calls;return open_gate;}
unsigned capture(unsigned b,unsigned p,uint8_t *out,uint8_t *src){
 if(b>=16||p>=16)return 0;memset(out,(int)p,16);memset(src,1,8);return 1;
}
void requeue(unsigned b,unsigned p){dl_pub_memory[0xbf]=(uint8_t)b;dl_pub_memory[0xc0]=(uint8_t)p;}
int dl_publication_idle(void){return 1;}
int dl_publication_ready(const uint8_t *p){(void)p;return resident;}
int dl_publication_prepare(const uint8_t *p,const uint8_t *s,uint32_t t){(void)p;(void)s;assert(t);++prepares;return DL_SELECT_WAIT;}
int dl_publication_poll(uint32_t t){assert(t);return answer;}
void dl_publication_arm(uint32_t t){assert(t);++arms;}
void dl_selection_cancel(uint32_t t){(void)t;++cancels;}
void dl_selection_commit(uint32_t t){(void)t;}
void dl_pattern_post_body(unsigned b,unsigned p,unsigned c,int d,unsigned e){
 ++posts;last_args[0]=b;last_args[1]=p;last_args[2]=c;last_args[3]=(uint32_t)d;last_args[4]=e;
}
unsigned dl_project_post_body(const char *p){(void)p;++loads;return 1;}
int dl_project_metadata(const char *p,struct dl_project_target *t){(void)p;memset(t,0,sizeof *t);return 1;}
int main(void){
 uint32_t args[5]={0,1,2,0xffffffffu,4};resident=1;open_gate=0;
 assert(!dl_pattern_request_guard(args));
 for(unsigned i=0;i<8;++i)dl_publication_tick();
 assert(!prepares && !posts && immediate_pending==1);
 open_gate=1;answer=DL_SELECT_READY;dl_publication_tick();
 assert(prepares==1 && posts==1 && arms==1 && !memcmp(last_args,args,sizeof args));
 /* A partial prepare is drained by the independent manager. A cached cycles
    refusal after the lease releases must reprepare, retaining all five args. */
 args[1]=2;resident=0;open_gate=0;assert(!dl_pattern_request_guard(args));
 dl_publication_tick();open_gate=1;answer=DL_SELECT_WAIT;dl_publication_tick();
 assert(immediate_pending==2);open_gate=0;dl_publication_tick();
 open_gate=1;answer=DL_SELECT_PROCESSING;dl_publication_tick();assert(immediate_pending==1);
 unsigned before=prepares;answer=DL_SELECT_READY;dl_publication_tick();
 assert(prepares==before+1 && posts==2 && !memcmp(last_args,args,sizeof args));
 /* New resident intent supersedes an old pending request instead of later
    replaying it; cancellation goes through the existing manager contract. */
 args[1]=3;open_gate=0;assert(!dl_pattern_request_guard(args));dl_publication_tick();
 args[1]=4;open_gate=1;resident=1;assert(dl_pattern_request_guard(args));
 dl_publication_tick();assert(!immediate_pending && posts==2);
 /* A project cannot begin native publication while M/S is still enabled,
    and renews the lease throughout its asynchronous load. */
 project_pending=2;open_gate=0;dl_publication_tick();assert(!loads && project_pending==2);
 open_gate=1;dl_publication_tick();assert(loads==1 && project_pending==4);
 before=gate_calls;for(unsigned i=0;i<5;++i)dl_publication_tick();assert(gate_calls>=before+5);
 project_done=1;project_result=1;dl_publication_tick();assert(!project_pending);
 assert(cancels);puts("PASS: actual stopped-request gate/retry, five-argument retention, supersession and asynchronous project lease; native calls substituted");
}
'''
    (work/'immediate-test.c').write_text(fixture)
    subprocess.run([*flags,'-DMODWERK_RESIDENT_STOCK_HOOKS','-DDL_NATIVE_TEST','-I'+str(work),'-I'+str(dyn),str(work/'immediate-test.c'),'-o',str(work/'immediate-test')],check=True)
    subprocess.run([str(work/'immediate-test')],check=True)
print('PASS: actual DSP glue/budget race, mandatory-bank pause, retained charge/nudge, bound/unbound publication waits, retry and supersession; host facts only')
