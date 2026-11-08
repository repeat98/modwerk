/* SPDX-License-Identifier: MIT */
#include "sample_editor_actions.h"
#if RUNTIME_SITE_EVENTS
#include "modwerk_events.h"
#endif
static uint32_t word(const uint8_t *p)
{return (uint32_t)p[0]<<24 | (uint32_t)p[1]<<16 | (uint32_t)p[2]<<8 | p[3];}
int mw_sample_action_decode(const uint8_t *image,uint32_t bytes,uint32_t at,
    uint32_t address,unsigned encoded,struct mw_sample_action_view *out)
{
    uint8_t record[MODWERK_SAMPLE_ACTION_BYTES];
    if(!image || !out || encoded>1u || (at&3u) || at>bytes ||
       MODWERK_SAMPLE_ACTION_BYTES>bytes-at || (!encoded && bytes>UINT32_MAX-address))return 0;
    for(unsigned i=0;i<sizeof record;++i)record[i]=image[at+i];
    uint32_t entry=word(record+16),action=word(record+8);
    if(word(record)!=MODWERK_SAMPLE_EDITOR_ABI || word(record+4)!=sizeof record ||
       !action || word(record+12) || word(record+52) || word(record+56) || word(record+60))return 0;
    if(!encoded){if(entry<address)return 0;entry-=address;}
    if((entry&1u) || entry>bytes || bytes-entry<2u ||
       (entry<at+sizeof record && entry+2u>at))return 0;
    unsigned end=0;
    while(end<32u && record[20u+end]) {
        if(record[20u+end]<32u || record[20u+end]>126u)return 0;
        ++end;
    }
    if(!end || end==32u)return 0;
    for(unsigned i=end;i<32u;++i)if(record[20u+i])return 0;
    out->action=action;out->entry_offset=entry;
    for(unsigned i=0;i<32u;++i)out->label[i]=(char)record[20u+i];
    return 1;
}
int mw_sample_action_admission(const struct runtime_dsp *from,const struct runtime_dsp *to,
    enum runtime_metadata_operation operation)
{
    if(!from || !to || (operation!=RUNTIME_METADATA_PREPARE && operation!=RUNTIME_METADATA_SWITCH))
        return RUNTIME_MALFORMED;
#if RUNTIME_SITE_EVENTS
    int old=from->present && from->hook_offset[MODWERK_OT_SAMPLE_EDITOR_ACTIONS]!=RUNTIME_NONE;
    int next=to->present && to->hook_offset[MODWERK_OT_SAMPLE_EDITOR_ACTIONS]!=RUNTIME_NONE;
    if(!old && !next)return RUNTIME_OK;
#ifndef MODWERK_SAMPLE_EDITOR
    /* Registry knowledge alone is not a running service. Default/public bases
     * refuse the contribution until the complete board integration is enabled. */
    return RUNTIME_FEATURE;
#else
    if(next) {
        struct mw_sample_action_view view;
        uintptr_t address=(uintptr_t)to->image;
        if(operation==RUNTIME_METADATA_SWITCH && address>UINT32_MAX)return RUNTIME_MALFORMED;
        if(!mw_sample_action_decode(to->image,to->image_bytes,
            to->hook_offset[MODWERK_OT_SAMPLE_EDITOR_ACTIONS],(uint32_t)address,
            operation==RUNTIME_METADATA_PREPARE,&view))return RUNTIME_MALFORMED;
    }
    if(old && operation==RUNTIME_METADATA_SWITCH) {
        void mw_sample_owner_changing(const struct runtime_dsp *);
        mw_sample_owner_changing(from);
    }
    return RUNTIME_OK;
#endif
#else
    return RUNTIME_OK;
#endif
}
