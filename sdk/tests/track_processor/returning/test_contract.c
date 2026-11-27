/* SPDX-License-Identifier: MIT */
#include "processor_contract.h"
#include <assert.h>
#include <stdio.h>
#include <string.h>
static struct tp_plan plan,sentinel;
static uint32_t words[TP_PACKAGE_HEADER+4+1+8];
static uint16_t p_reloc[]={TP_PACKAGE_HEADER+1};
static struct runtime_dsp_entry entry={0,0,0,3};
static struct runtime_dsp dsp;
static void fixture(void)
{
    memset(words,0,sizeof words);memset(&dsp,0,sizeof dsp);
    uint32_t h[]={TP_BRA,18,TP_PACKAGE_MAGIC,1,4,8,2,0,1,0x008040,0,0x100000,1,8,18,22,23,0};
    memcpy(words,h,sizeof h);words[18]=0;words[19]=18+3;words[20]=0x100004;words[21]=TP_RTS;
    words[22]=2;
    for(unsigned i=0;i<4;++i){words[23+2*i]=64;words[24+2*i]=1;}
    dsp.requires=16;dsp.engine=words;dsp.engine_count=sizeof words/sizeof words[0];
    dsp.engine_relocations=p_reloc;dsp.engine_relocation_count=1;
    dsp.entries=&entry;dsp.entry_count=1;dsp.cycles=10;dsp.kind=RUNTIME_EXECUTED;
}
int main(void)
{
    fixture();struct tp_view v;assert(tp_decode(&dsp,&v)==TP_VALID);
    struct tp_input in[TP_MEMBERS];
    for(unsigned i=0;i<TP_MEMBERS;++i)in[i]=(struct tp_input){v,100u+TP_MEMBERS-i,1,18};
    assert(tp_build(in,TP_MEMBERS,&plan)==TP_VALID && plan.count==TP_MEMBERS);
    assert(plan.charge==TP_MEMBERS*18u+8u+4u*TP_MEMBERS && plan.member[0].module==101u);
    unsigned body=6u+9u*TP_MEMBERS+1u;
    for(unsigned i=0;i<TP_MEMBERS;++i){
        assert(plan.member[i].y_base==0x800u+8u*i);
        assert(plan.words[body+1]==body+3);
        assert(plan.words[body+2]==plan.member[i].y_base+4u);
        assert(plan.initial[tp_state_offset(plan.member[i].y_base)]==64u);
        body+=4;
    }
    /* Changed controller identity/generation needs no compiled trust row. */
    in[0].generation=2;dsp.controller_sha256[0]=77;
    assert(tp_build(in,TP_MEMBERS,&plan)==TP_VALID);
    sentinel=plan;in[1].module=in[0].module;
    assert(tp_build(in,TP_MEMBERS,&plan)==TP_BAD && !memcmp(&plan,&sentinel,sizeof plan));
    assert(tp_build(in,TP_MEMBERS+1,&plan)==TP_FULL);
    fixture();assert(tp_decode(&dsp,&v)==TP_VALID);in[0]=(struct tp_input){v,10,1,1};
    in[1]=(struct tp_input){v,20,1,65535};
    assert(tp_build(in,2,0)==TP_FULL);
    for(unsigned k=0;k<18;++k){
        fixture();uint32_t before=words[k];words[k]=0xffffff;
        assert(tp_decode(&dsp,&v)==TP_BAD);words[k]=before;
    }
    fixture();words[22]=1;assert(tp_decode(&dsp,&v)==TP_BAD); /* P/Y overlap */
    fixture();words[20]=0x100008;assert(tp_decode(&dsp,&v)==TP_BAD);
    fixture();words[24]=0;assert(tp_decode(&dsp,&v)==TP_BAD);
    fixture();dsp.claim_count=1;assert(tp_decode(&dsp,&v)==TP_BAD);
    fixture();dsp.entries=0;assert(tp_decode(&dsp,&v)==TP_BAD);
    fixture();dsp.requires=0;assert(tp_decode(&dsp,&v)==TP_NONE);
    puts("PASS: real processor contract, sixteen independent ordered members, private state relocation, controller update, malformed metadata and no partial publication");
}
