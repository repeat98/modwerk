#ifndef BEAT_SLICER_TEST_CHAIN_FIXTURE_H
#define BEAT_SLICER_TEST_CHAIN_FIXTURE_H
/* SPDX-License-Identifier: MIT */
#include "test_flex_fixture.h"
#include "edit_candidate.h"
struct chain {
    struct bs_preview_guard guard;
    struct bs_preview_session session;
    struct bs_edit_candidate candidate;
    struct bs_source_snapshot identity;
    struct bs_plan expected, actual;
    struct bs_marker_edit edit;
    uint32_t settings[274], held, bad, copies, denied;
};
static struct chain c;
static volatile uint32_t *settings(void) {
#ifdef BS_FLEX_STOCK
    return VP(uint32_t,0x100b14f0+0x448*f.source.slot);
#else
    return c.settings;
#endif
}
static void copy_bytes(void *out,const void *in,uint32_t n) {
    for(uint32_t i=0;i<n;++i)((uint8_t *)out)[i]=((const uint8_t *)in)[i];
}
static int owned(void *ctx) {
    struct chain *p=(struct chain *)ctx;
    if(p->held){p->bad=__LINE__;return 0;}
    if(p->denied){--p->denied;return 0;}
    p->held=1;return 1;
}
static void release(void *ctx) {
    struct chain *p=(struct chain *)ctx;
    if(!p->held)p->bad=__LINE__;
    p->held=0;
}
static enum bs_provider_reply capture(void *ctx,struct bs_source_snapshot *out) {
    struct chain *p=(struct chain *)ctx;
    if(!p->held){p->bad=__LINE__;return BS_PROVIDER_FAILED;}
    copy_bytes(out,&p->identity,sizeof(*out));
    uint32_t format=f.binding.controls[f.source.slot*11];
    if(format>3)return BS_PROVIDER_UNSUPPORTED;
    out->frames=f.binding.controls[f.source.slot*11+4];
    out->format.bits=format&2?16:24;out->format.channels=format&1?2:1;
    volatile uint32_t *v=settings();
    out->trim_start=v[75];out->trim_end=v[76];out->loop=v[77];out->marker_count=v[273];
    if(out->marker_count>64)return BS_PROVIDER_UNSUPPORTED;
    for(uint32_t i=0;i<out->marker_count;++i){
        out->markers[i].start=v[78+3*i];out->markers[i].end=v[79+3*i];out->markers[i].loop=v[80+3*i];
    }
    return BS_PROVIDER_READY;
}
static enum bs_provider_reply copied(void *ctx,const struct bs_source_snapshot *source,
        const struct bs_pcm_read *request,uint8_t *out,uint32_t capacity,uint32_t *bytes) {
    struct chain *p=(struct chain *)ctx;
    if(!p->held || !bs_guard_valid(&p->guard,&p->session.token)){p->bad=__LINE__;return BS_PROVIDER_FAILED;}
    ++p->copies;
    return bs_flex_copy_locked(&f.binding,source,request,out,capacity,bytes);
}
static enum bs_provider_reply markers(void *ctx,const struct bs_source_snapshot *source,struct bs_marker_table *out) {
    struct chain *p=(struct chain *)ctx;
    if(!p->held || source->slot!=f.source.slot){p->bad=__LINE__;return BS_PROVIDER_FAILED;}
    volatile uint32_t *v=settings();out->count=v[273];
    for(uint32_t i=0;i<64;++i){
        out->records[i].start=v[78+3*i];out->records[i].end=v[79+3*i];out->records[i].loop=v[80+3*i];
    }
    return BS_PROVIDER_READY;
}
static const struct bs_preview_backend backend={owned,release,capture,copied};
static void chain_setup(uint32_t format,uint32_t slot,uint32_t retained) {
    setup(format,slot);clear(&c,sizeof(c));
    bs_guard_init(&c.guard);(void)bs_guard_enable(&c.guard);
    bs_session_init(&c.session,&c.guard,&backend,&c);bs_candidate_init(&c.candidate);
    c.identity.owner_id=7;c.identity.owner_generation=1;c.identity.sample_id=12;
    c.identity.sample_generation=1;c.identity.editor_generation=1;c.identity.playback_generation=1;
    c.identity.kind=BS_SOURCE_FLEX;c.identity.slot=slot;c.identity.sample_rate=8000;
    c.identity.sample_bpm24=7200;c.identity.project_bpm24=2880;
    volatile uint32_t *v=settings();
    for(uint32_t i=0;i<274;++i)v[i]=i*31+17;
    v[75]=0;v[76]=f.source.frames;v[77]=0;v[273]=retained;
    if(retained){v[78]=0;v[79]=800;v[80]=0xffffffffu;}
}
static int oracle(void *ctx,uint32_t frame,int32_t out[2]) {
    (void)ctx;
    uint32_t n=f.source.format.bits/8;
    for(uint32_t ch=0;ch<f.source.format.channels;++ch){
        uint32_t raw=0;
        for(uint32_t b=0;b<n;++b)raw=(raw<<8)|value(frame,ch*n+b);
        int32_t signed_value=(int32_t)raw-(raw&(1u<<(8*n-1))?(int32_t)(1u<<(8*n)):0);
        out[ch]=n==2?signed_value*256:signed_value;
    }
    if(f.source.format.channels==1)out[1]=out[0];
    return 0;
}
static int plan(uint32_t snap,uint32_t retained) {
    struct bs_request request;
    uint32_t start=0;
    clear(&request,sizeof(request));request.sample_rate=8000;request.trim_end=f.source.frames;
    request.sample_bpm24=7200;request.project_bpm24=2880;request.beats=1;request.snap=snap;
    request.tempo_source=BS_SAMPLE_BPM;request.existing_count=retained;request.existing=&start;
    request.read=oracle;
    return bs_preview(&request,&c.expected)==BS_OK;
}
static enum bs_session_state complete(uint32_t snap) {
    const struct bs_preview_options options={1,snap,BS_SAMPLE_BPM};
    enum bs_session_state s=bs_session_begin(&c.session,&options);
    uint32_t n=0;
    while((s==BS_SESSION_RUNNING||s==BS_SESSION_WAITING)&&++n<20000)s=bs_session_step(&c.session);
    return s;
}
static uint32_t pcm_hash(void) {
    uint32_t hash=2166136261u;
    for(uint32_t i=0;i<f.binding.pool_bytes;++i)hash=(hash^f.binding.pool[i])*16777619u;
    return hash;
}
static uint32_t settings_hash(void) {
    uint32_t hash=2166136261u;volatile uint32_t *v=settings();
    for(uint32_t i=0;i<274;++i)hash=(hash^v[i])*16777619u;
    return hash;
}
#endif
