/* SPDX-License-Identifier: MIT */
#include "sample_editor_actions.h"
#include "modwerk_hooks.h"
#include <stdio.h>
#include <string.h>
#define CHECK(x) do {if(!(x)){printf("FAIL line %u\n",(unsigned)__LINE__);return 1;}}while(0)
static void word(uint8_t *p,uint32_t value)
{p[0]=(uint8_t)(value>>24);p[1]=(uint8_t)(value>>16);p[2]=(uint8_t)(value>>8);p[3]=(uint8_t)value;}
int main(void)
{
    uint8_t image[128]={0};
    struct mw_sample_action_view out,sentinel;
    const uint32_t base=0x48010000u,at=32;
    word(image+at,MODWERK_SAMPLE_EDITOR_ABI);word(image+at+4,64);
    word(image+at+8,123);word(image+at+16,0);
    memcpy(image+at+20,"BEAT SLICER",12);
    CHECK(mw_sample_action_decode(image,sizeof image,at,base,1,&out));
    CHECK(out.entry_offset==0 && out.action==123 && !strcmp(out.label,"BEAT SLICER"));
    word(image+at+16,base);
    CHECK(mw_sample_action_decode(image,sizeof image,at,base,0,&out));
    CHECK(out.entry_offset==0);
    sentinel=out;
    /* BSS, odd, aliased, overlapping and wrapped entries all refuse without
     * returning a partial binding. Offset zero above is real C package code. */
    const uint32_t entries[]={base+128,base+1,base-2,base+32,base+94,UINT32_MAX};
    for(unsigned i=0;i<sizeof entries/sizeof *entries;++i) {
        word(image+at+16,entries[i]);
        CHECK(!mw_sample_action_decode(image,sizeof image,at,base,0,&out));
        CHECK(!memcmp(&out,&sentinel,sizeof out));
    }
    word(image+at+16,base);
    CHECK(!mw_sample_action_decode(image,sizeof image,at,UINT32_MAX-32,0,&out));
    CHECK(!mw_sample_action_decode(image,sizeof image,at+1,base,0,&out));
    CHECK(!mw_sample_action_decode(image,at+63,at,base,0,&out));
    /* Every reserved byte, nonzero label padding and missing terminator. */
    for(unsigned i=0;i<64;++i) {
        if(!((i>=12 && i<16) || i>=52 || (i>=32 && i<52)))continue;
        image[at+i]=1;
        CHECK(!mw_sample_action_decode(image,sizeof image,at,base,0,&out));
        image[at+i]=0;
    }
    memset(image+at+20,'A',32);
    CHECK(!mw_sample_action_decode(image,sizeof image,at,base,0,&out));
    memset(image+at+20,0,32);
    CHECK(!mw_sample_action_decode(image,sizeof image,at,base,0,&out));
    /* Public/default base knows the appended hook but cannot admit it. */
    struct runtime_dsp from={0},to={0};
    for(unsigned i=0;i<RUNTIME_HOOKS;++i)from.hook_offset[i]=to.hook_offset[i]=RUNTIME_NONE;
    CHECK(mw_sample_action_admission(&from,&to,RUNTIME_METADATA_PREPARE)==RUNTIME_OK);
    to.present=1;to.hook_offset[MODWERK_OT_SAMPLE_EDITOR_ACTIONS]=at;
    CHECK(mw_sample_action_admission(&from,&to,RUNTIME_METADATA_PREPARE)==RUNTIME_FEATURE);
    CHECK(mw_sample_action_admission(&from,&to,RUNTIME_METADATA_SWITCH)==RUNTIME_FEATURE);
    CHECK(mw_sample_action_admission(&to,&from,RUNTIME_METADATA_SWITCH)==RUNTIME_FEATURE);
    puts("PASS: action bounds, immutable failure output and default feature refusal");return 0;
}
