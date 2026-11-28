/* SPDX-License-Identifier: MIT
 * Included by the real Octatrack controller board, under its stable lock.
 * The chain owns copied DSP words, not module pointers or a build-time list.
 */
#include "processor_contract.h"
#define TP_BUDGET_OWNER 0x54504348u
enum { TP_RESET=1,TP_ENABLE,TP_DISABLE,TP_CONTROL };
struct tp_request {
    uint32_t epoch,revision,ack_epoch[2],ack_revision[2];
    uint8_t values[8],ack_values[8],valid;
};
static struct tp_plan tp_program;
static struct runtime_owner tp_owners[TP_MEMBERS];
static uintptr_t tp_entries[TP_MEMBERS];
static unsigned tp_hints[TP_MEMBERS];
static struct tp_request tp_requests[TP_MEMBERS];
static struct {
    struct dl_owned_job job;
    uint32_t epoch,revision;
    uint8_t op,member,values[4];
    uint16_t count,desired;
} tp_lanes[2];
static uint32_t tp_generation,tp_seen_epoch,tp_notice_epoch,tp_quiesce_until,tp_changed_tick;
static uint16_t tp_reset[2];
static uint8_t tp_valid,tp_active,tp_stopping,tp_want,tp_reserved,tp_failed,tp_next[2];
static struct tp_input tp_inputs[TP_MEMBERS];
static struct runtime_owner tp_input_owners[TP_MEMBERS];
static uintptr_t tp_input_entries[TP_MEMBERS];
uint32_t modwerk_dsp_track_price(unsigned,unsigned);

static void tp_fault(unsigned core)
{
    tp_failed=1;tp_active=0;mask_known&=(uint8_t)~(1u<<core);
    dl_owned_fail_closed(core); /* unknown work retains budget, words and state */
}
static int tp_engine_free(void)
{
    unsigned k=MW_DSP_INDEX(TP_FEATURE);
    return mw_engines[0][k].state==MW_ENGINE_FREE && mw_engines[1][k].state==MW_ENGINE_FREE;
}
static int tp_engine_busy(void)
{
    unsigned k=MW_DSP_INDEX(TP_FEATURE);
    for(unsigned c=0;c<2u;++c){
        unsigned s=mw_engines[c][k].state;
        if(s==MW_ENGINE_STUCK){tp_fault(c);return 1;}
        if(s==MW_ENGINE_WRITING || s==MW_ENGINE_PLACING || s==MW_ENGINE_UNPLACING)return 1;
    }
    return 0;
}
static unsigned tp_wanted(void){return tp_want?TP_FEATURE:0u;}
static unsigned tp_busy(unsigned c){return c<2u && tp_lanes[c].op;}
static unsigned tp_held(void)
{return (tp_reserved || tp_failed || !tp_engine_free() || (mask[0]&TP_FEATURE) || (mask[1]&TP_FEATURE))?TP_FEATURE:0u;}
static void tp_poll(void)
{
    for(unsigned c=0;c<2u;++c)if(tp_lanes[c].op){
        int r=dl_owned_job_poll(&tp_lanes[c].job,0);
        if(!r)continue;
        if(r!=1 || tp_lanes[c].job.generation!=tp_generation || dl_owned_job_release(&tp_lanes[c].job)!=1){tp_fault(c);continue;}
        if(tp_lanes[c].op==TP_RESET)tp_reset[c]=(uint16_t)(tp_reset[c]+tp_lanes[c].count);
        else if(tp_lanes[c].op==TP_ENABLE || tp_lanes[c].op==TP_DISABLE)mask[c]=(uint8_t)tp_lanes[c].desired;
        else if(tp_lanes[c].op==TP_CONTROL){
            unsigned i=tp_lanes[c].member,first=c?0u:4u;
            if(i>=tp_program.count){tp_fault(c);continue;}
            tp_requests[i].ack_epoch[c]=tp_lanes[c].epoch;
            tp_requests[i].ack_revision[c]=tp_lanes[c].revision;
            for(unsigned k=0;k<4u;++k)tp_requests[i].ack_values[first+k]=tp_lanes[c].values[k];
        }
        tp_lanes[c].op=0;
    }
}
static int tp_start(unsigned c,unsigned op,unsigned member)
{
    if(c>1u || tp_failed || tp_lanes[c].op || transport.held[c] || kb_lane[c].op ||
       !(mask_known>>c&1u) || dl_owned_closed(c))return 0;
    struct dl_owned_job job;unsigned count=0,desired=mask[c];int okay=0;
    if(op==TP_RESET){
        unsigned offset=tp_reset[c],end=offset<1024u?1024u:TP_STATE_WORDS;
        if(offset>=TP_STATE_WORDS)return 0;
        count=end-offset;if(count>DL_RESET_DATA)count=DL_RESET_DATA;
        okay=dl_owned_reset_reserve(c,tp_generation,TP_FEATURE,offset,count,tp_program.initial+offset,&job);
    }else if(op==TP_ENABLE || op==TP_DISABLE){
        desired=op==TP_ENABLE?mask[c]|TP_FEATURE:mask[c]&~TP_FEATURE;
        okay=dl_owned_command_reserve(c,tp_generation,10u,mask[c],desired,0,&job);
    }else if(op==TP_CONTROL && member<tp_program.count){
        struct tp_request *r=&tp_requests[member];unsigned first=c?0u:4u;
        unsigned reset=r->ack_epoch[c]!=r->epoch;
        okay=dl_owned_command_reserve(c,tp_generation,13u,member|(reset?0x100u:0u),
            (unsigned)r->values[first]<<8|r->values[first+1],
            (unsigned)r->values[first+2]<<8|r->values[first+3],&job);
        if(okay){
            tp_lanes[c].epoch=r->epoch;tp_lanes[c].revision=r->revision;
            for(unsigned k=0;k<4u;++k)tp_lanes[c].values[k]=r->values[first+k];
        }
    }
    if(!okay)return 0;
    if(dl_owned_submit(&job)!=1){if(dl_owned_cancel(&job)!=1)tp_fault(c);return 0;}
    tp_lanes[c].job=job;tp_lanes[c].op=(uint8_t)op;tp_lanes[c].member=(uint8_t)member;
    tp_lanes[c].count=(uint16_t)count;tp_lanes[c].desired=(uint16_t)desired;
    return 1;
}
/* The inputs below live only until this locked call completes. A proposed
 * package is dry-run metadata, never an owned image or control entitlement. */
static int tp_gather(uint32_t except,const struct runtime_dsp *proposed,unsigned *count)
{
    uint32_t epoch=modwerk_runtime_owner_epoch();unsigned n=0;
    if(epoch&1u)return RUNTIME_BUSY;
    for(unsigned at=0;at<RUNTIME_MODULES;++at){
        const struct runtime_module *m=modwerk_runtime_module(at);struct tp_view v;
        if(!m || m->id==except || !(m->dsp.requires&TP_FEATURE))continue;
        if(n==TP_MEMBERS)return RUNTIME_MEMORY;
        if(tp_decode(&m->dsp,&v)!=TP_VALID)return RUNTIME_MALFORMED;
        if(modwerk_runtime_owner_snapshot(m->dsp.image,&tp_input_owners[n])!=1)return RUNTIME_BUSY;
        tp_inputs[n]=(struct tp_input){v,m->id,tp_input_owners[n].generation,modwerk_dsp_track_price(m->dsp.cycles,m->dsp.kind)};
        tp_input_entries[n]=m->hook[RUNTIME_TICK];++n;
    }
    if(proposed && proposed->present){
        struct tp_view v;if(tp_decode(proposed,&v)!=TP_VALID)return RUNTIME_MALFORMED;
        if(n==TP_MEMBERS)return RUNTIME_MEMORY;
        tp_inputs[n]=(struct tp_input){v,proposed->module,1u,modwerk_dsp_track_price(proposed->cycles,proposed->kind)};
        tp_zero(&tp_input_owners[n],sizeof tp_input_owners[n]);tp_input_entries[n]=0;++n;
    }
    if(epoch!=modwerk_runtime_owner_epoch())return RUNTIME_BUSY;
    *count=n;return RUNTIME_OK;
}
static int tp_admit(const struct runtime_dsp *from,const struct runtime_dsp *to,enum runtime_metadata_operation operation)
{
    int incoming=to && to->present && (to->requires&TP_FEATURE);
    int outgoing=from && from->present && (from->requires&TP_FEATURE);
    if(!incoming && !outgoing)return RUNTIME_OK;
    if(tp_failed || dl_owned_closed(0) || dl_owned_closed(1))return RUNTIME_CONFLICT;
    unsigned n=0;int r=tp_gather(from&&from->present?from->module:0,incoming?to:0,&n);
    if(r!=RUNTIME_OK)return r;
    int shape=tp_build(tp_inputs,n,0);
    if(shape!=TP_VALID)return shape==TP_FULL?RUNTIME_MEMORY:RUNTIME_MALFORMED;
    unsigned words=7u+9u*n;for(unsigned i=0;i<n;++i)words+=tp_inputs[i].view.code_words;
    if(n){
        int fits=mw_engines_admit(TP_FEATURE,modwerk_controller_held()|TP_FEATURE,words);
        if(fits==MW_ENGINE_STUCK_BOOT)return RUNTIME_CONFLICT;
        if(fits==MW_ENGINE_MEMORY)return RUNTIME_MEMORY;
    }
    if(operation==RUNTIME_METADATA_PREPARE)return RUNTIME_OK;
    tp_quiesce_until=ticks+180u;tp_stopping=1;tp_active=0;
    if((mask[0]&TP_FEATURE) || (mask[1]&TP_FEATURE) || tp_lanes[0].op || tp_lanes[1].op || tp_engine_busy())return RUNTIME_BUSY;
    return RUNTIME_OK;
}
static int tp_rebuild(void)
{
    unsigned n=0;uint32_t epoch=modwerk_runtime_owner_epoch();
    if(tp_gather(0,0,&n)!=RUNTIME_OK)return 0;
    if(tp_build(tp_inputs,n,0)!=TP_VALID)return 0;
    struct tp_request keep[TP_MEMBERS];uint32_t ids[TP_MEMBERS],generations[TP_MEMBERS];
    unsigned old=tp_program.count;
    for(unsigned i=0;i<old;++i){keep[i]=tp_requests[i];ids[i]=tp_program.member[i].module;generations[i]=tp_program.member[i].generation;}
    if(tp_build(tp_inputs,n,&tp_program)!=TP_VALID || epoch!=modwerk_runtime_owner_epoch())return 0;
    tp_zero(tp_requests,sizeof tp_requests);tp_zero(tp_owners,sizeof tp_owners);
    for(unsigned i=0;i<n;++i){
        const struct tp_member *m=&tp_program.member[i];
        for(unsigned j=0;j<n;++j)if(tp_inputs[j].module==m->module){tp_owners[i]=tp_input_owners[j];tp_entries[i]=tp_input_entries[j];tp_hints[i]=0;break;}
        for(unsigned j=0;j<old;++j)if(ids[j]==m->module && generations[j]==m->generation){tp_requests[i]=keep[j];break;}
        tp_zero(tp_requests[i].ack_epoch,sizeof tp_requests[i].ack_epoch);
        tp_zero(tp_requests[i].ack_revision,sizeof tp_requests[i].ack_revision);
        tp_zero(tp_requests[i].ack_values,sizeof tp_requests[i].ack_values);
    }
    if(n && tp_generation==0x5450ffffu){tp_fault(0);tp_fault(1);return 0;}
    if(n)tp_generation=tp_generation?tp_generation+1u:0x54500001u;
    tp_seen_epoch=epoch;tp_valid=1;tp_active=0;tp_reset[0]=tp_reset[1]=0;tp_next[0]=tp_next[1]=0;
    tp_quiesce_until=0;return 1;
}
static int tp_scoped_controls(uintptr_t entry,uintptr_t pc,uint32_t epoch,uint32_t revision,uint32_t lo,uint32_t hi)
{
    if(!epoch || tp_failed || !tp_valid)return -2;
    for(unsigned i=0;i<tp_program.count;++i){
        const struct runtime_owner *o=&tp_owners[i];const struct tp_member *m=&tp_program.member[i];
        uintptr_t image=o->owned_extent+o->image_offset;
        if(entry!=tp_entries[i])continue;
        if(pc<image || pc-image>=o->image_bytes || modwerk_runtime_owner_held(o,&tp_hints[i])!=1)return -2;
        uint8_t values[8];
        for(unsigned k=0;k<4u;++k){values[k]=(uint8_t)(lo>>(24u-8u*k));values[k+4]=(uint8_t)(hi>>(24u-8u*k));}
        for(unsigned k=0;k<8u;++k)if(values[k]<m->minimum || values[k]>m->maximum)return -1;
        struct tp_request *r=&tp_requests[i];r->epoch=epoch;r->revision=revision;r->valid=1;
        tp_copy(r->values,values,8);
        if(!tp_active || tp_stopping)return -2;
        if(r->ack_epoch[0]!=epoch || r->ack_epoch[1]!=epoch || r->ack_revision[0]!=revision || r->ack_revision[1]!=revision ||
           tp_different(r->ack_values,values,8))return 0;
        return 1;
    }
    return -2;
}
static void tp_tick(void)
{
    tp_poll();if(tp_failed || !started)return;
    if(tp_program.count || tp_want || tp_lanes[0].op || tp_lanes[1].op){
        for(unsigned c=0;c<2u;++c)if(dl_owned_closed(c)){tp_fault(c);return;}
    }
    uint32_t epoch=modwerk_runtime_owner_epoch();if(epoch&1u)return;
    if(epoch!=tp_notice_epoch){tp_notice_epoch=epoch;tp_changed_tick=ticks;}
    if(tp_seen_epoch!=epoch){
        tp_stopping=1;tp_active=0;
    }
    int capacity=tp_valid && tp_program.count &&
        !modwerk_dsp_track_fits(TP_BUDGET_OWNER,tp_program.charge,RUNTIME_HARDWARE);
    if(capacity){tp_stopping=1;tp_active=0;}
    if(tp_stopping){
        for(unsigned c=0;c<2u;++c)if(mask[c]&TP_FEATURE)(void)tp_start(c,TP_DISABLE,0);
        if((mask[0]&TP_FEATURE) || (mask[1]&TP_FEATURE) || tp_lanes[0].op || tp_lanes[1].op || tp_engine_busy())return;
        if(tp_reserved){modwerk_dsp_track_charge(TP_BUDGET_OWNER,0,0,0);tp_reserved=0;}
        tp_want=0;
        if(tp_seen_epoch==epoch){
            if(capacity || (int32_t)(tp_quiesce_until-ticks)>0)return;
            /* A budget pause changes no code or owner. A placed program may
               remain cached while playing; resume it without waiting for STOP.
               Every core still receives a full RESET and fresh control ACK. */
            tp_reset[0]=tp_reset[1]=0;tp_next[0]=tp_next[1]=0;
            for(unsigned i=0;i<tp_program.count;++i){
                tp_zero(tp_requests[i].ack_epoch,sizeof tp_requests[i].ack_epoch);
                tp_zero(tp_requests[i].ack_revision,sizeof tp_requests[i].ack_revision);
                tp_zero(tp_requests[i].ack_values,sizeof tp_requests[i].ack_values);
            }
            tp_quiesce_until=0;
        }else{
            if(!tp_engine_free() || ticks-tp_changed_tick<2u)return;
            if(!tp_rebuild())return;
        }
        tp_stopping=0;
    }
    if(!tp_valid){if(!tp_engine_free() || !tp_rebuild())return;}
    if(!tp_program.count)return;
    if(!tp_reserved){
        if(!modwerk_dsp_track_charge(TP_BUDGET_OWNER,tp_program.charge,RUNTIME_HARDWARE,1))return;
        tp_reserved=1;
    }
    tp_want=1;
    struct mw_engine_unit units[2];
    for(unsigned c=0;c<2u;++c)units[c]=(struct mw_engine_unit){tp_program.words,tp_program.relocations,
        tp_program.word_count,tp_program.relocation_count,0,0};
    mw_engines_package(TP_FEATURE,tp_generation,units);
    mw_engines_want(engine_features()|(kb_wanted?KEYBUS:0u)|TP_FEATURE);
    uint8_t busy[2]={(uint8_t)(transport.held[0]||kb_lane[0].op||tp_lanes[0].op),(uint8_t)(transport.held[1]||kb_lane[1].op||tp_lanes[1].op)};
    if(mw_engines_place(TP_FEATURE,3u,tp_generation,busy,mask,mask_known)<=0)return;
    for(unsigned c=0;c<2u;++c)if(!(mask[c]&TP_FEATURE)){
        if(tp_reset[c]<TP_STATE_WORDS)(void)tp_start(c,TP_RESET,0);
        else (void)tp_start(c,TP_ENABLE,0);
    }
    if(!(mask[0]&TP_FEATURE) || !(mask[1]&TP_FEATURE) || tp_lanes[0].op || tp_lanes[1].op)return;
    tp_active=1;
    for(unsigned c=0;c<2u;++c)for(unsigned k=0;k<tp_program.count;++k){
        unsigned i=(tp_next[c]+k)%tp_program.count,first=c?0u:4u;struct tp_request *r=&tp_requests[i];
        if(r->valid && (r->ack_epoch[c]!=r->epoch || r->ack_revision[c]!=r->revision || tp_different(r->values+first,r->ack_values+first,4))){
            if(tp_start(c,TP_CONTROL,i))tp_next[c]=(uint8_t)((i+1u)%tp_program.count);
            break;
        }
    }
}
static int tp_settling(void)
{return !tp_failed && tp_valid && tp_program.count && !tp_active && !tp_stopping;}
