/* SPDX-License-Identifier: MIT */
#include "test_chain_fixture.h"
static int chains(void) {
    for(uint32_t format=0;format<4;++format)for(uint32_t slot=0;slot<2;++slot)
    for(uint32_t snap=0;snap<2;++snap)for(uint32_t retained=0;retained<2;++retained){
        chain_setup(format,slot?127:0,retained);
        uint32_t audio_before=pcm_hash(),settings_before=settings_hash();
        CHECK(plan(snap,retained));c.denied=1;
        CHECK(complete(snap)==BS_SESSION_READY && c.copies && !c.bad && !c.held);
        CHECK(bs_session_result(&c.session,&c.actual));
        CHECK(c.expected.count==c.actual.count && c.expected.bpm24==c.actual.bpm24 &&
              c.expected.end_needs_fade==c.actual.end_needs_fade);
        for(uint32_t i=0;i<64;++i)CHECK(c.expected.starts[i]==c.actual.starts[i] &&
                                      c.expected.needs_fade[i]==c.actual.needs_fade[i]);
        c.denied=1;
        CHECK(bs_candidate_begin(&c.candidate,&c.session,markers)==BS_CANDIDATE_WAITING);
        CHECK(bs_candidate_step(&c.candidate)==BS_CANDIDATE_READY);
        CHECK(bs_candidate_result(&c.candidate,c.candidate.token.operation,&c.edit));
        CHECK(c.edit.before.count==retained && c.edit.after.count==c.actual.count);
        if(retained)CHECK(c.edit.after.records[0].start==0 && c.edit.after.records[0].end==800 &&
                          c.edit.after.records[0].loop==0xffffffffu);
        for(uint32_t i=retained;i<c.actual.count;++i) {
            CHECK(c.edit.after.records[i].start==c.actual.starts[i]);
            CHECK(c.edit.after.records[i].end==(i+1<c.actual.count?c.actual.starts[i+1]:f.source.frames));
            CHECK(c.edit.after.records[i].loop==0xffffffffu);
        }
        CHECK(audio_before==pcm_hash() && settings_before==settings_hash() && !c.bad && !c.held);
    }
    return 0;
}
static int mutate_pcm(void) {
    CHECK(owned(&c));uint32_t ticket=bs_guard_writer_begin(&c.guard);CHECK(ticket);
    uint32_t old=pcm_hash();
#ifdef BS_FLEX_STOCK
    uint32_t (*gain)(uint32_t,uint32_t,uint32_t,uint32_t)=
        (uint32_t (*)(uint32_t,uint32_t,uint32_t,uint32_t))(uintptr_t)0x40095560;
    CHECK(gain(f.source.slot,0,4,0)==1);
#else
    ((uint8_t *)(uintptr_t)f.binding.pool)[f.pages[0]*PAGE]^=1;
#endif
    CHECK(old!=pcm_hash() && bs_guard_writer_end(&c.guard,ticket));release(&c);
    return 0;
}
static int staleness(void) {
    for(uint32_t mode=0;mode<4;++mode){
        chain_setup(3,0,0);
        if(mode==3){
            const struct bs_preview_options options={1,1,BS_SAMPLE_BPM};
            CHECK(bs_session_begin(&c.session,&options)==BS_SESSION_RUNNING);
            uint32_t n=0;
            while(!c.copies && ++n<20000)CHECK(bs_session_step(&c.session)==BS_SESSION_RUNNING);
            CHECK(c.copies);uint32_t calls=c.copies;
            int error=mutate_pcm();if(error)return error;
            CHECK(bs_session_step(&c.session)==BS_SESSION_STALE && c.copies==calls);
        }else{
            CHECK(complete(0)==BS_SESSION_READY);
            CHECK(bs_candidate_begin(&c.candidate,&c.session,markers)==BS_CANDIDATE_READY);
            if(mode==0)++c.identity.sample_generation;
            if(mode==1)++settings()[268];
            if(mode==2){int error=mutate_pcm();if(error)return error;}
            c.edit.frames=0x12345678;
            CHECK(!bs_candidate_result(&c.candidate,c.candidate.token.operation,&c.edit));
            CHECK(c.candidate.state==BS_CANDIDATE_STALE && c.edit.frames==0x12345678);
        }
        CHECK(!c.bad && !c.held);
    }
    return 0;
}
int bs_flex_selftest(void);
int bs_flex_chain_selftest(void) {
    int error=bs_flex_selftest();if(error)return error;
    error=chains();if(error)return error;
    return staleness();
}
