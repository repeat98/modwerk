/* SPDX-License-Identifier: MIT */
/* Private USB smoke test. Fixed generated silence; no instrument source IO. */
#include "planner.h"
#include "../../runtime/loader/modwerk_module.h"
#define BS_PROBE_OK 0x42534f4bu
#define BS_PROBE_FAILED 0x42534600u
static uint32_t result;
static const uint32_t retained=1000;
static int silence(void *context,uint32_t frame,int32_t pcm[2]) {
    (void)context;
    if(frame>=16000)return 1;
    pcm[0]=pcm[1]=0;return 0;
}
static int check(uint32_t tempo) {
    static const uint32_t sample[5]={0,1000,4000,8000,12000};
    static const uint32_t project[3]={0,1000,8000};
    struct bs_request request={8000,0,16000,2880,1440,1,tempo,1,&retained,0,silence,0};
    struct bs_plan plan;
    const uint32_t *expected=tempo==BS_SAMPLE_BPM?sample:project;
    uint32_t count=tempo==BS_SAMPLE_BPM?5u:3u;
    if(bs_preview(&request,&plan)!=BS_OK || plan.count!=count ||
       plan.bpm24!=(tempo==BS_SAMPLE_BPM?2880u:1440u) || plan.end_needs_fade)return 0;
    for(uint32_t i=0;i<count;++i)
        if(plan.starts[i]!=expected[i] || plan.needs_fade[i])return 0;
    return retained==1000;
}
void module_tick(struct modwerk_runtime_api *api) {
    if(!result) {
        if(!check(BS_SAMPLE_BPM))result=BS_PROBE_FAILED|1u;
        else if(!check(BS_PROJECT_BPM))result=BS_PROBE_FAILED|2u;
        else result=BS_PROBE_OK;
    }
    api->value=result;
}
/* Original small block lettering. Frame layout follows the SDK hello example:
 * 128 columns, eight bytes per column; y=0 is bit zero of the last byte. */
static const unsigned char letters[26][7]={
 {14,17,17,31,17,17,17},{30,17,17,30,17,17,30},{14,17,16,16,16,17,14},
 {30,17,17,17,17,17,30},{31,16,16,30,16,16,31},{31,16,16,30,16,16,16},
 {14,17,16,23,17,17,14},{17,17,17,31,17,17,17},{31,4,4,4,4,4,31},
 {1,1,1,1,17,17,14},{17,18,20,24,20,18,17},{16,16,16,16,16,16,31},
 {17,27,21,21,17,17,17},{17,25,21,19,17,17,17},{14,17,17,17,17,17,14},
 {30,17,17,30,16,16,16},{14,17,17,17,21,18,13},{30,17,17,30,20,18,17},
 {15,16,16,14,1,1,30},{31,4,4,4,4,4,4},{17,17,17,17,17,17,14},
 {17,17,17,17,17,10,4},{17,17,17,21,21,21,10},{17,17,10,4,10,17,17},
 {17,17,10,4,4,4,4},{31,1,2,4,8,16,31}
};
static void text(unsigned char *frame,uint32_t y,const char *s) {
    for(uint32_t x=5;*s && x+5<=128;x+=6,++s) {
        if(*s<'A' || *s>'Z')continue;
        for(uint32_t row=0;row<7;++row)for(uint32_t column=0;column<5;++column)
            if(letters[(unsigned)*s-'A'][row]&(16u>>column))
                frame[(x+column)*8u+7u-(y+row)/8u]|=(unsigned char)(1u<<((y+row)%8u));
    }
}
void module_draw(unsigned char *frame) {
    for(uint32_t i=0;i<1024;++i)frame[i]=0;
    text(frame,3,"BEAT SLICER");text(frame,13,"USB PROBE");
    text(frame,23,result==BS_PROBE_OK?"PLANNER PASS":result?"PLANNER FAIL":"RUNNING");
    text(frame,33,"FIXED INPUTS");text(frame,43,"NO SAMPLE IO");text(frame,53,"UNDO TO EXIT");
}
