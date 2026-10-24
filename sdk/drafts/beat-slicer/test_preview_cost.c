/* SPDX-License-Identifier: MIT */
/* Original synthetic cost fixture. No stock layout, scheduler, cache or timing. */
#include "preview_async.h"
#ifndef BS_COST_BUDGET
#define BS_COST_BUDGET 2
#endif
#if BS_COST_BUDGET < 1 || BS_COST_BUDGET > 8
#error Invalid benchmark service budget
#endif
#define CHECK(x) do { if (!(x)) return __LINE__; } while (0)
uint32_t bs_cost_input[4]; /* frames, snap, beats, tempo source */
uint32_t bs_cost_output[8]; /* engine calls/steps/begins, captures/copies/locks, markers, state */
struct bs_cost_fixture {
    struct bs_preview_guard guard;
    struct bs_preview_async async;
    struct bs_source_snapshot live;
    uint32_t held, locks, unlocks, captures, copies, bad;
};
static struct bs_cost_fixture fixture;
static void clear(void *out,uint32_t size) {
    uint8_t *p=out;for(uint32_t i=0;i<size;++i)p[i]=0;
}
int bs_cost_lock(void *context) {
    struct bs_cost_fixture *p=context;
    if(p->held){p->bad=1;return 0;}
    p->held=1;++p->locks;return 1;
}
void bs_cost_unlock(void *context) {
    struct bs_cost_fixture *p=context;
    if(!p->held)p->bad=1;
    p->held=0;++p->unlocks;
}
static enum bs_provider_reply capture(void *context,struct bs_source_snapshot *out) {
    struct bs_cost_fixture *p=context;
    if(!p->held){p->bad=1;return BS_PROVIDER_FAILED;}
    ++p->captures;
    /* The benchmark has no existing markers; copy the admitted scalar fields.
     * This is a synthetic provider, not native metadata-capture cost. */
#define COPY(field) out->field=p->live.field
    COPY(owner_id);COPY(owner_generation);COPY(sample_id);COPY(sample_generation);
    COPY(editor_generation);COPY(kind);COPY(slot);COPY(frames);COPY(sample_rate);
    COPY(format.bits);COPY(format.channels);COPY(format.little_endian);
    COPY(trim_start);COPY(trim_end);COPY(loop);COPY(sample_bpm24);COPY(project_bpm24);
    COPY(playback_generation);COPY(marker_count);
#undef COPY
    return BS_PROVIDER_READY;
}
static int32_t value(uint32_t frame,uint32_t channel) {
    return ((int32_t)((frame*(channel?53u:37u))%10000)-5000)*256;
}
static enum bs_provider_reply copied(void *context,const struct bs_source_snapshot *snapshot,
    const struct bs_pcm_read *read,uint8_t *out,uint32_t capacity,uint32_t *bytes) {
    struct bs_cost_fixture *p=context;
    if(!p->held || snapshot!=&p->async.session.snapshot || !read->count ||
       read->count>BS_PCM_BLOCK_FRAMES || read->first>=p->live.frames ||
       read->count>p->live.frames-read->first){p->bad=1;return BS_PROVIDER_FAILED;}
    ++p->copies;
    /* Model 1,536-frame page breaks with an owned packed 16-bit stereo prefix. */
    uint32_t count=1536-read->first%1536;
    if(count>read->count)count=read->count;
    if(count*4>capacity){p->bad=1;return BS_PROVIDER_FAILED;}
    for(uint32_t i=0;i<count;++i)for(uint32_t ch=0;ch<2;++ch){
        uint32_t v=(uint32_t)value(read->first+i,ch)>>8;
        out[i*4+ch*2]=(uint8_t)(v>>8);out[i*4+ch*2+1]=(uint8_t)v;
    }
    *bytes=count*4;return BS_PROVIDER_READY;
}
static const struct bs_preview_backend backend={bs_cost_lock,bs_cost_unlock,capture,copied};
static int oracle_read(void *context,uint32_t frame,int32_t out[2]) {
    (void)context;out[0]=value(frame,0);out[1]=value(frame,1);return 0;
}
int bs_cost_run(void) {
    struct bs_cost_fixture *p=&fixture;
    clear(p,sizeof(*p));clear(bs_cost_output,sizeof(bs_cost_output));
    CHECK(bs_cost_input[0]==44100 || bs_cost_input[0]==1323000);
    CHECK(bs_cost_input[1]<=1 && bs_cost_input[3]<=1);
    bs_guard_init(&p->guard);CHECK(bs_guard_enable(&p->guard));
    p->live.owner_id=1;p->live.owner_generation=2;p->live.sample_id=3;p->live.sample_generation=4;
    p->live.editor_generation=5;p->live.playback_generation=6;p->live.kind=BS_SOURCE_FLEX;
    p->live.frames=p->live.trim_end=bs_cost_input[0];p->live.sample_rate=44100;
    p->live.format.bits=16;p->live.format.channels=2;
    p->live.sample_bpm24=2886;p->live.project_bpm24=2880;
    CHECK(bs_async_init(&p->async,&p->guard,&backend,p,1,2));
    struct bs_preview_options options={bs_cost_input[2],bs_cost_input[1],bs_cost_input[3]};
    uint32_t request=bs_async_request(&p->async,1,2,&options);CHECK(request);
    uint32_t state=BS_SESSION_RUNNING;
    for(uint32_t i=0;i<100000 && state==BS_SESSION_RUNNING;++i){
        state=bs_async_service(&p->async,BS_COST_BUDGET);
        ++bs_cost_output[0];bs_cost_output[1]+=p->async.last_steps;
        bs_cost_output[2]+=p->async.last_begin;
        CHECK(p->async.last_steps<=BS_COST_BUDGET);
    }
    CHECK(state==BS_SESSION_READY);
    struct bs_async_result actual;
    CHECK(bs_async_result(&p->async,1,2,request,&actual));
    bs_cost_output[3]=p->captures;bs_cost_output[4]=p->copies;bs_cost_output[5]=p->locks;
    bs_cost_output[6]=actual.plan.count;bs_cost_output[7]=state;
    struct bs_request input={44100,0,bs_cost_input[0],2886,2880,bs_cost_input[2],bs_cost_input[3],0,0,bs_cost_input[1],oracle_read,0};
    struct bs_plan expected;CHECK(bs_preview(&input,&expected)==BS_OK);
    CHECK(expected.count==actual.plan.count && expected.bpm24==actual.plan.bpm24 && expected.end_needs_fade==actual.plan.end_needs_fade);
    for(uint32_t i=0;i<BS_MAX_SLICES;++i){
        CHECK(expected.starts[i]==actual.plan.starts[i]);
        CHECK(expected.needs_fade[i]==actual.plan.needs_fade[i]);
    }
    CHECK(!p->bad && !p->held && p->locks==p->unlocks);
    return 0;
}
