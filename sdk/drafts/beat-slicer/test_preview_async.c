/* SPDX-License-Identifier: MIT */
#include "preview_async.h"
#define CHECK(x) do { if (!(x)) return __LINE__; } while (0)
struct fixture {
    struct bs_preview_guard guard;
    struct bs_preview_async async;
    struct bs_source_snapshot live;
    uint32_t locked, locks, unlocks, denied, captures, copies, bad;
    uint32_t pending, action, at_unlock, injected, accepted, queries_at_accept;
};
static struct fixture f;
static void clear(void *out, uint32_t size) {
    uint8_t *p=out; for(uint32_t i=0;i<size;++i)p[i]=0;
}
static void copy(void *out, const void *in, uint32_t size) {
    uint8_t *a=out; const uint8_t *b=in; for(uint32_t i=0;i<size;++i)a[i]=b[i];
}
static int equal(const void *a, const void *b, uint32_t size) {
    const uint8_t *x=a,*y=b; for(uint32_t i=0;i<size;++i)if(x[i]!=y[i])return 0; return 1;
}
static int acquire(void *context) {
    struct fixture *p=context;
    if(p->locked){p->bad=__LINE__;return 0;}
    if(p->denied){--p->denied;return 0;}
    p->locked=1;++p->locks;return 1;
}
static void release(void *context) {
    struct fixture *p=context;
    if(!p->locked)p->bad=__LINE__;
    p->locked=0;++p->unlocks;
    if(p->action && !p->injected && p->unlocks>=p->at_unlock &&
       (p->action<6 || p->async.published_state==BS_SESSION_READY)) {
        p->injected=1;
        p->queries_at_accept=p->copies;
        if(p->action==1 || p->action==7)p->accepted=bs_async_cancel(&p->async,7,8);
        if(p->action==2 || p->action==6){struct bs_preview_options o={4,0,BS_PROJECT_BPM};p->accepted=bs_async_request(&p->async,7,8,&o);}
        if(p->action==3)p->accepted=(uint32_t)bs_async_revoke(&p->async,7,8);
        if(p->action==4)p->accepted=bs_async_service(&p->async,1)==BS_SESSION_FAILED;
        if(p->action==5){p->denied=1;p->accepted=1;}
    }
}
static enum bs_provider_reply capture(void *context,struct bs_source_snapshot *out) {
    struct fixture *p=context;
    if(!p->locked){p->bad=__LINE__;return BS_PROVIDER_FAILED;}
    ++p->captures;
    if(p->pending)return BS_PROVIDER_PENDING;
    copy(out,&p->live,sizeof(*out));return BS_PROVIDER_READY;
}
static int32_t value(uint32_t frame,uint32_t channel) {
    return ((int32_t)((frame*(channel?53u:37u))%31)-15)*256;
}
static enum bs_provider_reply copied(void *context,const struct bs_source_snapshot *snapshot,
    const struct bs_pcm_read *read,uint8_t *out,uint32_t capacity,uint32_t *bytes) {
    struct fixture *p=context;
    if(!p->locked || snapshot!=&p->async.session.snapshot || !read->count ||
       read->count>BS_PCM_BLOCK_FRAMES || read->first>=p->live.frames ||
       read->count>p->live.frames-read->first){p->bad=__LINE__;return BS_PROVIDER_FAILED;}
    ++p->copies;
    uint32_t count=7-read->first%7, width=p->live.format.bits/8, channels=p->live.format.channels;
    if(count>read->count)count=read->count;
    if(capacity<count*width*channels){p->bad=__LINE__;return BS_PROVIDER_FAILED;}
    for(uint32_t i=0;i<count;++i)for(uint32_t ch=0;ch<channels;++ch){
        uint32_t v=(uint32_t)value(read->first+i,ch);
        if(width==2)v>>=8;
        for(uint32_t b=0;b<width;++b)out[(i*channels+ch)*width+b]=(uint8_t)(v>>(8*(p->live.format.little_endian?b:width-1-b)));
    }
    *bytes=count*width*channels;return BS_PROVIDER_READY;
}
static const struct bs_preview_backend backend={acquire,release,capture,copied};
static int setup(void) {
    clear(&f,sizeof(f));bs_guard_init(&f.guard);CHECK(bs_guard_enable(&f.guard));
    f.live.owner_id=7;f.live.owner_generation=8;f.live.sample_id=9;f.live.sample_generation=10;
    f.live.editor_generation=11;f.live.playback_generation=12;f.live.kind=BS_SOURCE_FLEX;f.live.slot=3;
    f.live.frames=f.live.trim_end=256;f.live.sample_rate=8000;f.live.loop=UINT32_MAX;
    f.live.format.bits=24;f.live.format.channels=2;
    f.live.sample_bpm24=2880;f.live.project_bpm24=2160;
    CHECK(bs_async_init(&f.async,&f.guard,&backend,&f,7,8));return 0;
}
static uint32_t finish(void) {
    uint32_t state=BS_SESSION_RUNNING;
    for(uint32_t i=0;i<20000 && (state==BS_SESSION_RUNNING || state==BS_SESSION_WAITING);++i)
        state=bs_async_service(&f.async,8);
    return state;
}
static int read_oracle(void *context,uint32_t frame,int32_t out[2]) {
    struct fixture *p=context;out[0]=value(frame,0);out[1]=value(frame,p->live.format.channels-1);return 0;
}
static int previews(void) {
    for(uint32_t bits=16;bits<=24;bits+=8)for(uint32_t channels=1;channels<=2;++channels)
    for(uint32_t little=0;little<2;++little)for(uint32_t snap=0;snap<2;++snap)for(uint32_t tempo=0;tempo<2;++tempo){
        CHECK(!setup());f.live.format.bits=bits;f.live.format.channels=channels;f.live.format.little_endian=little;
        struct bs_preview_options options={1,snap,tempo};
        struct bs_request request={8000,0,256,2880,2160,1,tempo,0,0,snap,read_oracle,&f};
        struct bs_plan expected;struct bs_async_result actual;
        CHECK(bs_preview(&request,&expected)==BS_OK);
        uint32_t sequence=bs_async_request(&f.async,7,8,&options);CHECK(sequence);
        CHECK(finish()==BS_SESSION_READY && f.async.last_steps<=8);
        CHECK(bs_async_state(&f.async,7,8,sequence)==BS_SESSION_READY);
        CHECK(bs_async_result(&f.async,7,8,sequence,&actual));
        CHECK(actual.request==sequence && !actual.existing && equal(&expected,&actual.plan,sizeof(expected)));
        CHECK(f.copies && f.locks==f.unlocks && !f.locked && !f.bad);
        struct bs_async_result unchanged;copy(&unchanged,&actual,sizeof(actual));
        bs_guard_invalidate(&f.guard);
        CHECK(bs_async_state(&f.async,7,8,sequence)==BS_SESSION_STALE);
        CHECK(!bs_async_result(&f.async,7,8,sequence,&actual) && equal(&actual,&unchanged,sizeof(actual)));
    }
    return 0;
}
static int interleavings(void) {
    for(uint32_t action=1;action<=5;++action)for(uint32_t at=1;at<=14;++at){
        CHECK(!setup());struct bs_preview_options options={1,1,0};
        uint32_t old=bs_async_request(&f.async,7,8,&options);CHECK(old);
        f.action=action;f.at_unlock=f.unlocks+at;
        uint32_t state=finish();
        /* Batching may finish before a later target unlock. Ordinary engine
         * events still revalidate READY, so exercise that boundary too. */
        for(uint32_t event=0;event<14 && !f.injected;++event)
            state=bs_async_service(&f.async,8);
        CHECK(f.injected && f.accepted && !f.bad && !f.locked);
        if(action==1 || action==3){
            /* A shorter batch can reach final publication at this unlock.
             * The accepted intent supersedes that already-chosen local return. */
            CHECK(state==BS_SESSION_CANCELLED || (state==BS_SESSION_READY && f.async.published_state==BS_SESSION_CANCELLED));
            CHECK(f.copies==f.queries_at_accept && !f.async.published_request);
            CHECK(bs_async_state(&f.async,7,8,action==1?f.accepted:old)==BS_SESSION_CANCELLED);
            struct bs_async_result out;out.request=UINT32_MAX;
            CHECK(!bs_async_result(&f.async,7,8,old,&out) && out.request==UINT32_MAX);
            CHECK(bs_async_service(&f.async,8)==BS_SESSION_CANCELLED && f.copies==f.queries_at_accept);
        }
        if(action==2){
            CHECK(state==BS_SESSION_READY || state==BS_SESSION_RUNNING);
            struct bs_async_result out;
            CHECK(!bs_async_result(&f.async,7,8,old,&out));
            /* A replacement at final unlock requires its independent wake. */
            CHECK(finish()==BS_SESSION_READY);
            CHECK(bs_async_result(&f.async,7,8,f.accepted,&out) && out.plan.bpm24==2160);
        }
        if(action==4)CHECK(state==BS_SESSION_READY);
        if(action==5){
            CHECK(state==BS_SESSION_READY || state==BS_SESSION_WAITING);
            CHECK(finish()==BS_SESSION_READY);
        }
        CHECK(f.locks==f.unlocks);
    }
    return 0;
}
static int late_publication(void) {
    for(uint32_t action=6;action<=7;++action){
        CHECK(!setup());struct bs_preview_options options={1,1,0};
        uint32_t old=bs_async_request(&f.async,7,8,&options);CHECK(old);
        f.action=action;f.at_unlock=f.unlocks+1;
        /* The UI runs as the consumer releases the completed publication.
         * Its new intent can supersede the local state returned by service. */
        CHECK(finish()==BS_SESSION_READY && f.injected && f.accepted);
        struct bs_async_result out;clear(&out,sizeof(out));out.request=UINT32_MAX;
        struct bs_async_result before;copy(&before,&out,sizeof(before));
        CHECK(!bs_async_result(&f.async,7,8,old,&out) && equal(&out,&before,sizeof(out)));
        CHECK(!bs_async_result(&f.async,7,8,f.accepted,&out) && equal(&out,&before,sizeof(out)));
        if(action==6){
            CHECK(bs_async_state(&f.async,7,8,f.accepted)==BS_SESSION_RUNNING);
            CHECK(finish()==BS_SESSION_READY);
            CHECK(bs_async_result(&f.async,7,8,f.accepted,&out) && out.plan.bpm24==2160);
        } else {
            CHECK(bs_async_state(&f.async,7,8,f.accepted)==BS_SESSION_CANCELLED);
            CHECK(bs_async_service(&f.async,8)==BS_SESSION_CANCELLED && f.copies==f.queries_at_accept);
        }
        CHECK(!f.bad && f.locks==f.unlocks);
    }
    return 0;
}
static int refusals(void) {
    CHECK(!setup());struct bs_preview_options options={1,1,0};
    CHECK(!bs_async_request(&f.async,7,9,&options));
    options.beats=3;CHECK(!bs_async_request(&f.async,7,8,&options));options.beats=1;
    f.denied=1;CHECK(!bs_async_request(&f.async,7,8,&options));
    uint32_t sequence=bs_async_request(&f.async,7,8,&options);CHECK(sequence);
    f.pending=1;CHECK(bs_async_service(&f.async,8)==BS_SESSION_WAITING);
    CHECK(f.async.last_begin==1 && f.async.last_steps==0 && !f.copies);
    CHECK(bs_async_service(&f.async,8)==BS_SESSION_WAITING && f.async.last_steps==1 && !f.copies);
    f.pending=0;CHECK(finish()==BS_SESSION_READY);
    struct bs_async_result out;clear(&out,sizeof(out));out.request=UINT32_MAX;
    f.pending=1;CHECK(bs_async_service(&f.async,8)==BS_SESSION_WAITING);
    CHECK(!bs_async_result(&f.async,7,8,sequence,&out) && out.request==UINT32_MAX);
    f.pending=0;CHECK(bs_async_service(&f.async,8)==BS_SESSION_READY);
    f.denied=1;CHECK(!bs_async_result(&f.async,7,8,sequence,&out) && out.request==UINT32_MAX);
    ++f.live.sample_bpm24;
    CHECK(bs_async_service(&f.async,8)==BS_SESSION_STALE);
    CHECK(!bs_async_result(&f.async,7,8,sequence,&out) && out.request==UINT32_MAX);
    f.async.desired=UINT32_MAX;CHECK(!bs_async_request(&f.async,7,8,&options) && f.async.fault);
    uint32_t before=f.copies;CHECK(bs_async_service(&f.async,8)==BS_SESSION_FAILED && f.copies==before);
    CHECK(!setup());CHECK(bs_async_revoke(&f.async,7,8));CHECK(!bs_async_request(&f.async,7,8,&options));
    CHECK(!f.bad && f.locks==f.unlocks);return 0;
}
int bs_async_selftest(void) {
    int line=previews();if(line)return line;line=interleavings();if(line)return line;line=late_publication();if(line)return line;return refusals();
}
