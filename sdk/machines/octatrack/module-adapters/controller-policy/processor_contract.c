/* SPDX-License-Identifier: MIT */
#include "processor_contract.h"
static int word24(uint32_t x){return x<=0xffffffu;}
static int same_view(const struct tp_view *a,const struct tp_view *b)
{
    return a->dsp==b->dsp && a->code==b->code && a->y_relocations==b->y_relocations && a->initial==b->initial &&
        a->code_words==b->code_words && a->state_words==b->state_words && a->stride==b->stride &&
        a->control==b->control && a->reset==b->reset && a->y_count==b->y_count &&
        a->minimum==b->minimum && a->maximum==b->maximum && a->neutral==b->neutral &&
        a->order==b->order && a->y_origin==b->y_origin;
}
unsigned tp_state_offset(unsigned address)
{
    if(address>=0x800u && address<0xc00u)return address-0x800u;
    if(address>=0xcc1u && address<0xff0u)return 1024u+address-0xcc1u;
    return TP_STATE_WORDS;
}
int tp_decode(const struct runtime_dsp *d,struct tp_view *v)
{
    if(!d || !(d->requires&TP_FEATURE))return TP_NONE;
    if(!v || d->requires!=TP_FEATURE || d->count || d->slots || !d->engine ||
       d->engine_count<TP_PACKAGE_HEADER || d->engine_count>RUNTIME_DSP_WORDS ||
       !d->cycles || (d->kind!=RUNTIME_EXECUTED && d->kind!=RUNTIME_HARDWARE) ||
       d->claim_count || d->init_count || d->entry_count!=1u || !d->entries ||
       d->entries[0].site || d->entries[0].cores!=3u || d->entries[0].entry || d->entries[0].exit)
        return TP_BAD;
    const uint32_t *h=d->engine;
    for(unsigned i=0;i<d->engine_count;++i)if(!word24(h[i]))return TP_BAD;
    if(h[0]!=TP_BRA || h[1]!=TP_PACKAGE_HEADER || h[2]!=TP_PACKAGE_MAGIC || h[3]!=1u ||
       !h[4] || h[4]>TP_CODE_WORDS || !h[5] || h[5]>1024u ||
       h[6]<2u || h[6]>h[5]/4u || h[7]>=h[6] || h[8]>=h[6] || h[7]==h[8] ||
       h[10]>255u || h[12]>RUNTIME_DSP_RELOCATIONS || h[13]!=h[5] ||
       h[14]!=TP_PACKAGE_HEADER || h[15]!=h[14]+h[4] || h[16]!=h[15]+h[12] ||
       h[16]+h[13]!=d->engine_count || h[17] ||
       h[11]>0xffffffu-h[5])return TP_BAD;
    unsigned lo=(h[9]>>16)&255u,hi=(h[9]>>8)&255u,neutral=h[9]&255u;
    if(lo>hi || neutral<lo || neutral>hi)return TP_BAD;
    if(d->engine_relocation_count && !d->engine_relocations)return TP_BAD;
    unsigned previous=0;
    for(unsigned k=0;k<d->engine_relocation_count;++k){
        unsigned r=d->engine_relocations[k],at=r&0x7fffu;
        if(at<TP_PACKAGE_HEADER || at>=TP_PACKAGE_HEADER+h[4] || (k && at<=previous))return TP_BAD;
        if(!(r&0x8000u) && (h[at]<TP_PACKAGE_HEADER || h[at]>=TP_PACKAGE_HEADER+h[4]))return TP_BAD;
        previous=at;
    }
    previous=0;
    for(unsigned k=0;k<h[12];++k){
        unsigned at=h[h[15]+k];
        if(at>=h[4] || (k && at<=previous))return TP_BAD;
        uint32_t value=h[TP_PACKAGE_HEADER+at];
        if(value<h[11] || value-h[11]>=h[5])return TP_BAD;
        for(unsigned p=0;p<d->engine_relocation_count;++p)
            if((d->engine_relocations[p]&0x7fffu)==TP_PACKAGE_HEADER+at)return TP_BAD;
        previous=at;
    }
    for(unsigned t=0;t<4u;++t)
        if(h[h[16]+t*h[6]+h[7]]!=neutral || h[h[16]+t*h[6]+h[8]]!=1u)return TP_BAD;
    *v=(struct tp_view){d,h+TP_PACKAGE_HEADER,h+h[15],h+h[16],
        (uint16_t)h[4],(uint16_t)h[5],(uint16_t)h[6],(uint16_t)h[7],(uint16_t)h[8],(uint16_t)h[12],
        (uint8_t)lo,(uint8_t)hi,(uint8_t)neutral,(uint8_t)h[10],h[11]};
    return TP_VALID;
}
int tp_build(const struct tp_input *input,unsigned n,struct tp_plan *out)
{
    if(n>TP_MEMBERS || (n && !input))return TP_FULL;
    unsigned order[TP_MEMBERS],bases[TP_MEMBERS],cursor[2]={0x800u,0xcc1u};
    /* Conservative unmeasured wrapper allowance, per sample/core, in addition
       to each member's already converted hardware-cycle price. */
    unsigned code=6u+7u*n+2u*n+1u,relocations=0;uint32_t charge=n?8u+4u*n:0u;
    for(unsigned i=0;i<n;++i){
        if(!input[i].module || !input[i].generation || !input[i].charge || input[i].charge>65535u)return TP_BAD;
        struct tp_view checked;
        if(tp_decode(input[i].view.dsp,&checked)!=TP_VALID ||
           !same_view(&checked,&input[i].view))return TP_BAD;
        for(unsigned j=0;j<i;++j)if(input[j].module==input[i].module)return TP_BAD;
        order[i]=i;unsigned p=i;
        while(p && (input[order[p-1]].view.order>input[i].view.order ||
              (input[order[p-1]].view.order==input[i].view.order && input[order[p-1]].module>input[i].module))){
            order[p]=order[p-1];--p;
        }
        order[p]=i;
        if(input[i].view.code_words>TP_CODE_WORDS-code)return TP_FULL;
        code+=input[i].view.code_words;
        relocations+=input[i].view.dsp->engine_relocation_count;
        if(relocations>TP_CODE_WORDS || input[i].charge>65535u-charge)return TP_FULL;
        charge+=input[i].charge;
    }
    for(unsigned i=0;i<n;++i){
        unsigned words=input[order[i]].view.state_words,k;
        for(k=0;k<2;++k){unsigned end=k?0xff0u:0xc00u;if(words<=end-cursor[k])break;}
        if(k==2)return TP_FULL;
        bases[i]=cursor[k];cursor[k]+=words;
    }
    if(!out)return TP_VALID;
    tp_zero(out,sizeof *out);out->count=(uint16_t)n;out->charge=charge;
    out->word_count=(uint16_t)code;out->relocation_count=(uint16_t)relocations;
    unsigned calls=6u+7u*n,body=calls+2u*n+1u,rnext=0;
    out->words[0]=TP_BRA;out->words[1]=calls;out->words[2]=TP_CHAIN_MAGIC;
    out->words[3]=1;out->words[4]=n;out->words[5]=code;out->words[calls+2u*n]=TP_RTS;
    for(unsigned i=0;i<n;++i){
        const struct tp_input *item=&input[order[i]];const struct tp_view *v=&item->view;
        unsigned row=6u+7u*i,call=calls+2u*i;
        out->member[i]=(struct tp_member){item->module,item->generation,(uint16_t)bases[i],v->state_words,
             v->stride,v->control,v->reset,v->minimum,v->maximum,v->neutral,v->order};
        out->words[row]=bases[i];out->words[row+1]=v->state_words;out->words[row+2]=v->stride;
        out->words[row+3]=v->control;out->words[row+4]=v->reset;
        out->words[row+5]=(uint32_t)v->minimum<<16 | (uint32_t)v->maximum<<8 | v->neutral;
        out->words[row+6]=body;
        out->words[call]=TP_BSR;out->words[call+1]=body-call;
        tp_copy(out->words+body,v->code,v->code_words*sizeof(uint32_t));
        for(unsigned j=0;j<v->dsp->engine_relocation_count;++j){
            unsigned r=v->dsp->engine_relocations[j],at=(r&0x7fffu)-TP_PACKAGE_HEADER;
            uint32_t value=v->code[at];
            out->words[body+at]=(r&0x8000u?value+TP_PACKAGE_HEADER-body:value-TP_PACKAGE_HEADER+body)&0xffffffu;
            out->relocations[rnext++]=(uint16_t)((r&0x8000u)|(body+at));
        }
        for(unsigned j=0;j<v->y_count;++j){unsigned at=v->y_relocations[j];out->words[body+at]=bases[i]+v->code[at]-v->y_origin;}
        tp_copy(out->initial+tp_state_offset(bases[i]),v->initial,v->state_words*sizeof(uint32_t));
        body+=v->code_words;
    }
    return TP_VALID;
}
