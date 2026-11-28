/* SPDX-License-Identifier: MIT
 * Native execution of the actual returning-board source. Runtime owner facts,
 * allocator and DSP ACKs are modelled; no firmware or DSP code is executed.
 */
#include <assert.h>
#include <stdio.h>
#include <string.h>
#include "processor_contract.h"
#include "transfer.h"
#include "resident_engines.h"
#define KEYBUS 8u
static uint32_t ticks,ledger_epoch=2;
static uint8_t started=1,mask[2],mask_known=3;
static struct {uint8_t held[2];} transport;
static struct {uint8_t op;} kb_lane[2];
static unsigned kb_wanted,fit=1,reserved,price_calls,release_count,stall[2],unknown[2],shut[2],engine_wait;
static struct runtime_module modules[16];
static struct runtime_owner owners[16];
static unsigned live[16];
struct mw_engine mw_engines[2][MW_ENGINE_FEATURES];
static struct dl_owned_job jobs[2];
static uint16_t physical[2],reset_count[2];
static uint8_t values[2][16][4];
static uint32_t next_ticket;
uint32_t modwerk_runtime_owner_epoch(void){return ledger_epoch;}
const struct runtime_module *modwerk_runtime_module(unsigned at){return at<16 && live[at]?&modules[at]:0;}
int modwerk_runtime_owner_snapshot(const uint8_t *image,struct runtime_owner *out){
    for(unsigned i=0;i<16;++i)if(live[i] && modules[i].dsp.image==image){*out=owners[i];return 1;}return 0;
}
int modwerk_runtime_owner_held(const struct runtime_owner *o,unsigned *hint){
    for(unsigned i=0;i<16;++i)if(live[i] && !memcmp(o,&owners[i],sizeof *o)){*hint=i;return 1;}return 0;
}
int modwerk_dsp_track_fits(uint32_t owner,unsigned n,unsigned kind){assert(owner==0x54504348 && n && kind==RUNTIME_HARDWARE);++price_calls;return fit;}
int modwerk_dsp_track_charge(uint32_t owner,unsigned n,unsigned kind,int on){
    assert(owner==0x54504348);if(on){assert(kind==RUNTIME_HARDWARE && n);if(!fit)return 0;reserved=n;}
    else{assert(!physical[0] && !physical[1] && !jobs[0].ticket && !jobs[1].ticket);reserved=0;++release_count;}return 1;
}
uint32_t modwerk_dsp_track_price(unsigned n,unsigned kind){assert(kind==RUNTIME_EXECUTED);return (n*7u+3u)/4u;}
int dl_owned_closed(unsigned c){return (int)shut[c];}
void dl_owned_fail_closed(unsigned c){shut[c]=1;}
int dl_owned_command_reserve(unsigned c,uint32_t g,unsigned op,unsigned id,unsigned a,unsigned b,struct dl_owned_job *out){
    if(jobs[c].ticket || shut[c])return 0;
    *out=(struct dl_owned_job){.core=(uint8_t)c,.opcode=(uint8_t)op,.generation=g,.ticket=++next_ticket,.id=(uint16_t)id,.init=(uint16_t)a,.proc=(uint16_t)b};jobs[c]=*out;return 1;
}
int dl_owned_reset_reserve(unsigned c,uint32_t g,unsigned f,unsigned offset,unsigned count,const uint32_t *words,struct dl_owned_job *out){
    assert(f==16 && !(physical[c]&16) && offset==reset_count[c] && count && words);
    if(jobs[c].ticket || shut[c])return 0;
    assert(offset+count<=1839 && !(offset<1024 && offset+count>1024));
    *out=(struct dl_owned_job){.core=(uint8_t)c,.opcode=11,.generation=g,.ticket=++next_ticket,.offset=(uint16_t)offset,.count=(uint16_t)count};jobs[c]=*out;return 1;
}
int dl_owned_submit(const struct dl_owned_job *j){assert(jobs[j->core].ticket==j->ticket);return 1;}
int dl_owned_cancel(const struct dl_owned_job *j){jobs[j->core].ticket=0;return 1;}
int dl_owned_job_poll(const struct dl_owned_job *j,struct dl_owned_progress *p){
    (void)p;unsigned c=j->core;assert(jobs[c].ticket==j->ticket);
    if(unknown[c])return -1;if(stall[c])return 0;
    if(j->opcode==10){assert(physical[c]==j->id);if(j->init&16)assert(reserved && reset_count[c]==1839);physical[c]=j->init;if(!(physical[c]&16))reset_count[c]=0;}
    else if(j->opcode==11)reset_count[c]=(uint16_t)(reset_count[c]+j->count);
    else if(j->opcode==13){assert(physical[c]&16);unsigned m=j->id&15;values[c][m][0]=(uint8_t)(j->init>>8);values[c][m][1]=(uint8_t)j->init;values[c][m][2]=(uint8_t)(j->proc>>8);values[c][m][3]=(uint8_t)j->proc;}
    else assert(0);return 1;
}
int dl_owned_job_release(const struct dl_owned_job *j){assert(jobs[j->core].ticket==j->ticket);jobs[j->core].ticket=0;return 1;}
int mw_engines_admit(unsigned f,unsigned held,unsigned words){assert(f==16 && held&16);return words<=2048?MW_ENGINE_FITS:MW_ENGINE_MEMORY;}
void mw_engines_package(unsigned f,uint32_t g,const struct mw_engine_unit u[2]){assert(f==16 && g && u[0].count==u[1].count && u[0].words==u[1].words);}
void mw_engines_want(unsigned f){assert(f&16);}
static unsigned tp_wanted(void),tp_held(void);
static unsigned engine_features(void){return tp_wanted();}
unsigned modwerk_controller_held(void){return tp_held();}
int mw_engines_place(unsigned f,unsigned cores,uint32_t g,const uint8_t busy[2],const uint8_t masks[2],unsigned known){
    (void)busy;(void)masks;assert(f==16 && cores==3 && known==3);
    for(unsigned c=0;c<2;++c){mw_engines[c][4].state=MW_ENGINE_PLACED;mw_engines[c][4].generation=g;}return 1;
}
#include "processor_board.inc"
static void run(unsigned n){while(n--){++ticks;tp_tick();if(!tp_wanted() && !engine_wait)for(unsigned c=0;c<2;++c)if(!tp_busy(c) && !(mask[c]&16))mw_engines[c][4].state=MW_ENGINE_FREE;}}
static uint32_t words[18+1+8]={TP_BRA,18,TP_PACKAGE_MAGIC,1,1,8,2,0,1,0x008040,0,0x400000,0,8,18,19,19,0,TP_RTS,64,1,64,1,64,1,64,1};
static struct runtime_dsp_entry entry={0,0,0,3};
static void add(unsigned i,unsigned generation){
    modules[i].id=100+i;modules[i].hook[RUNTIME_TICK]=0x10000+256*i;
    modules[i].dsp=(struct runtime_dsp){.module=100+i,.present=1,.requires=16,.engine=words,.engine_count=27,.entries=&entry,.entry_count=1,.cycles=10,.kind=RUNTIME_EXECUTED,.image=(const uint8_t *)(uintptr_t)(0x10000+256*i)};
    owners[i]=(struct runtime_owner){.generation=generation,.module=100+i,.owned_extent=0x10000+256*i,.image_bytes=64};live[i]=1;ledger_epoch+=2;
}
static int control(unsigned i,unsigned e,unsigned r,uint32_t lo,uint32_t hi){return tp_scoped_controls(modules[i].hook[RUNTIME_TICK],owners[i].owned_extent+8,e,r,lo,hi);}
int main(void){
    run(2);assert(!tp_program.count && !reserved);
    for(unsigned i=0;i<16;++i)add(i,1);
    run(60);assert(tp_active && tp_program.count==16 && tp_settling()==0);
    for(unsigned i=0;i<16;++i)assert(control(i,1,1,0x01020304,0x05060708)==0);
    run(40);
    for(unsigned i=0;i<16;++i){assert(control(i,1,1,0x01020304,0x05060708)==1);assert(values[0][i][0]==5 && values[1][i][0]==1);}
    unsigned before=price_calls;
    for(unsigned i=0;i<100;++i)assert(control(0,1,1,0x01020304,0x05060708)==1);
    assert(price_calls==before); /* controls never rescan bank/price */
    assert(control(0,1,2,0xff020304,0)==-1);
    assert(tp_scoped_controls(modules[0].hook[RUNTIME_TICK],owners[1].owned_extent+8,1,2,0,0)==-2);
    /* A pending core ACK cannot certify newer intent. Other modules advance. */
    stall[0]=1;assert(control(0,1,2,0x11121314,0x15161718)==0);run(2);
    assert(control(0,1,3,0x21222324,0x25262728)==0);run(4);
    assert(control(0,1,3,0x21222324,0x25262728)==0);
    stall[0]=0;run(40);assert(control(0,1,3,0x21222324,0x25262728)==1);
    /* Incoming update pauses the whole chain through both off ACKs/drain. */
    struct runtime_dsp incoming=modules[0].dsp;incoming.controller_sha256[0]=99;
    assert(tp_admit(&modules[0].dsp,&incoming,RUNTIME_METADATA_PREPARE)==RUNTIME_OK);
    assert(tp_active);assert(tp_admit(&modules[0].dsp,&incoming,RUNTIME_METADATA_SWITCH)==RUNTIME_BUSY);
    stall[1]=1;run(3);assert(reserved && physical[1]&16);
    assert(tp_admit(&modules[0].dsp,&incoming,RUNTIME_METADATA_SWITCH)==RUNTIME_BUSY);
    stall[1]=0;run(4);assert(!reserved && !physical[0] && !physical[1]);
    assert(tp_admit(&modules[0].dsp,&incoming,RUNTIME_METADATA_SWITCH)==RUNTIME_OK);
    uint32_t old_generation=tp_generation;add(0,2);modules[0].dsp=incoming;
    run(60);assert(tp_active && tp_generation!=old_generation && tp_program.member[0].generation==2);
    assert(control(0,1,3,0x21222324,0x25262728)==0); /* new owner gets no old ACK */
    run(40);assert(control(0,1,3,0x21222324,0x25262728)==1);
    /* Capacity pause retains latest intent but reactivation requires fresh ACKs. */
    engine_wait=1; /* real collector retains placed code during playback */
    fit=0;run(8);assert(!reserved && !tp_active);assert(control(0,1,4,0x31323334,0x35363738)==-2);
    fit=1;run(60);assert(control(0,1,4,0x31323334,0x35363738)==1);
    engine_wait=0;
    /* Unknown work closes the boot, keeps every resource and prevents removal. */
    assert(control(0,1,5,0x41424344,0x45464748)==0);run(1);unknown[0]=1;run(1);
    assert(tp_failed && reserved && tp_held()==16 && shut[0]);
    assert(tp_admit(&modules[0].dsp,0,RUNTIME_METADATA_SWITCH)==RUNTIME_CONFLICT);
    assert(release_count>=2);
    puts("PASS: actual chain-board source, sixteen members, scoped controls, updated controller, partial/unknown ACKs, intent and capacity pause; modelled transport/runtime facts only");
}
