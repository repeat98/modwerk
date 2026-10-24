/* SPDX-License-Identifier: MIT */
#include "preview_session.h"
static uint32_t private_budget=1;
#define bs_session_step(s) bs_session_work((s),private_budget)
#define bs_session_selftest bs_batch_original_selftest
#include "test_preview_session.c"
#undef bs_session_selftest
#undef bs_session_step

static int bounded_calls(void) {
    struct bs_preview_options options={1,1,BS_SAMPLE_BPM};
    struct bs_plan baseline,actual;
    uint32_t old_calls=0,old_captures=0,old_copies=0;
    for(uint32_t budget=1;budget<=BS_SESSION_WORK_MAX;budget*=2){
        setup();CHECK(bs_session_begin(&f.session,&options)==BS_SESSION_RUNNING);
        uint32_t state=BS_SESSION_RUNNING,calls=0;
        while(state==BS_SESSION_RUNNING && calls<20000){
            uint32_t copied_before=f.copies,captured_before=f.captures,locked_before=f.locks;
            state=bs_session_work(&f.session,budget);++calls;
            CHECK(f.copies-copied_before<=1 && f.captures-captured_before<=3 && f.locks-locked_before<=2);
            CHECK(!f.locked && !f.bad && f.locks==f.unlocks);
        }
        CHECK(state==BS_SESSION_READY && bs_session_result(&f.session,&actual));
        if(budget==1){copy(&baseline,&actual,sizeof(baseline));old_calls=calls;old_captures=f.captures;old_copies=f.copies;}
        else CHECK(plan_same(&baseline,&actual) && calls<old_calls && f.captures<old_captures && f.copies==old_copies);
    }
    return 0;
}
static int batch_boundaries(void) {
    struct bs_preview_options options={1,1,BS_SAMPLE_BPM};
    struct bs_plan out;
    for(uint32_t budget=1;budget<=BS_SESSION_WORK_MAX;budget*=2){
        private_budget=budget;
        for(uint32_t action=1;action<=2;++action){
            setup();CHECK(bs_session_begin(&f.session,&options)==BS_SESSION_RUNNING);
            /* Warm the owned cache using single transitions, then introduce a
             * writer at the next unlock before a private batch. */
            for(uint32_t i=0;i<1000 && !f.session.reader.cache_count;++i)(void)bs_session_step(&f.session);
            CHECK(f.session.reader.cache_count && f.copies);
            uint32_t before=f.copies;f.on_unlock=action;
            (void)bs_session_work(&f.session,budget);
            CHECK(f.injected && f.copies==before);
            CHECK(complete()==BS_SESSION_STALE && f.copies==before);
            out.count=123456;CHECK(!bs_session_result(&f.session,&out) && out.count==123456);
            CHECK(!f.bad && !f.locked && f.locks==f.unlocks);
        }
        for(uint32_t action=7;action<=9;action+=2){
            setup();CHECK(bs_session_begin(&f.session,&options)==BS_SESSION_RUNNING);
            for(uint32_t i=0;i<1000 && f.session.reader.job.state!=BS_JOB_NEED_FRAME;++i)
                CHECK(bs_session_step(&f.session)==BS_SESSION_RUNNING);
            CHECK(f.session.reader.job.state==BS_JOB_NEED_FRAME && !f.copies);
            f.on_unlock=action;
            CHECK(bs_session_work(&f.session,budget)==BS_SESSION_WAITING);
            CHECK(f.injected && !f.copies && f.session.reader.waiting);
            CHECK(complete()==BS_SESSION_READY && bs_session_result(&f.session,&out));
            CHECK(!f.bad && !f.locked && f.locks==f.unlocks);
        }
    }
    setup();CHECK(bs_session_begin(&f.session,&options)==BS_SESSION_RUNNING);
    struct bs_preview_session saved;copy(&saved,&f.session,sizeof(saved));
    CHECK(bs_session_work(&f.session,0)==BS_SESSION_FAILED);
    CHECK(bs_session_work(&f.session,BS_SESSION_WORK_MAX+1)==BS_SESSION_FAILED);
    CHECK(bs_session_work(0,1)==BS_SESSION_FAILED);
    for(uint32_t i=0;i<sizeof(saved);++i)CHECK(((uint8_t *)&saved)[i]==((uint8_t *)&f.session)[i]);
    return 0;
}
int bs_batch_selftest(void) {
    int error;
    for(private_budget=1;private_budget<=BS_SESSION_WORK_MAX;private_budget*=2){
        error=previews();if(error)return error;
        error=metadata();if(error)return error;
        error=lifecycle();if(error)return error;
        error=failures();if(error)return error;
    }
    error=bounded_calls();if(error)return error;
    return batch_boundaries();
}
