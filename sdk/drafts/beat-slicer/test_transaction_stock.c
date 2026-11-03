/* SPDX-License-Identifier: MIT */
/* Original end-to-end fixture: compiled stock-backed Flex preview/candidate,
 * transaction orchestration, original stores into synthetic settings and actual
 * stock editor pointer/selection refresh. No live lock, publisher or device.
 */
#include "test_chain_fixture.h"
#include "edit_transaction.h"
static struct bs_edit_transaction transaction;
static struct {
    uint32_t exchanges, denied, quarantined, wrong, fail_after;
    struct bs_marker_table captured;
} publication;
#ifdef BS_FLEX_STOCK
static uint32_t read_unaligned(uint32_t address) {
    volatile uint8_t *p = VP(uint8_t,address);
    return (uint32_t)p[0]<<24 | (uint32_t)p[1]<<16 | (uint32_t)p[2]<<8 | p[3];
}
static void stock_refresh(void) {
    /* Selection must retire BEFORE new bindings can leave its old row null.
     * This is tested publication order, not reader/ISR exclusion.
     */
    *VP(uint32_t,0x400ceb3c)=0xffffffffu;
    ((void (*)(void))(uintptr_t)0x40070cbc)();
    ((void (*)(void))(uintptr_t)0x400718f8)();
    ((void (*)(void))(uintptr_t)0x4006dbdc)();
}
#endif
static void store_table(const struct bs_marker_table *table) {
    volatile uint32_t *v=settings();
    for(uint32_t i=0;i<64;++i) {
        v[78+3*i]=table->records[i].start;
        v[79+3*i]=table->records[i].end;
        v[80+3*i]=table->records[i].loop;
    }
    v[273]=table->count;
#ifdef BS_FLEX_STOCK
    stock_refresh();
#endif
}
static enum bs_provider_reply playback(void *ctx,const struct bs_source_snapshot *source,
                                     const struct bs_marker_table *desired,const struct bs_plan *grid) {
    if(ctx!=&c || !c.held || source->sample_id!=c.identity.sample_id ||
       desired!=(grid?&transaction.edit.after:&transaction.edit.before))publication.wrong=__LINE__;
    /* Deliberate fixture opt-in, not a tested click-free playback policy. */
    return publication.denied?BS_PROVIDER_UNSUPPORTED:BS_PROVIDER_READY;
}
static enum bs_exchange_reply publish(void *ctx,const struct bs_source_snapshot *source,
        const struct bs_marker_table *expected,const struct bs_marker_table *desired) {
    if(ctx!=&c || !c.held || bs_guard_revision(&c.guard))publication.wrong=__LINE__;
    if(markers(ctx,source,&publication.captured)!=BS_PROVIDER_READY)return BS_EXCHANGE_FAULT;
    for(uint32_t i=0;i<sizeof(*expected);++i)
        if(((const uint8_t *)expected)[i]!=((const uint8_t *)&publication.captured)[i])
            return BS_EXCHANGE_FAULT;
    ++publication.exchanges;
    store_table(desired);
    if(publication.fail_after) {
        store_table(expected);
        return BS_EXCHANGE_UNCHANGED;
    }
    return BS_EXCHANGE_COMMITTED;
}
static void quarantine(void *ctx) {
    if(ctx!=&c || !c.held)publication.wrong=__LINE__;
    ++publication.quarantined;
}
static const struct bs_transaction_backend publication_backend={playback,publish,quarantine};
static void setup_publication(uint32_t format,uint32_t slot,uint32_t retained) {
    chain_setup(format,slot,retained);
    clear(&publication,sizeof(publication));bs_transaction_init(&transaction);
#ifdef BS_FLEX_STOCK
    *VP(uint32_t,0x46c8d1a0)=1;*VP(uint32_t,0x46c8d19c)=slot;
    *VP(uint32_t,0x460e5e5c)=2;
    *VP(uint32_t,0x400ceb3c)=0xffffffffu;
    *VP(uint32_t,0x400ceb40)=0x47210000;
    *VP(uint32_t,0x47210000)=1;
    *VP(uint32_t,0x460e5e64)=0;
    stock_refresh();
#endif
}
static int check_bindings(uint32_t count) {
#ifdef BS_FLEX_STOCK
    uint32_t base=0x100b14f0+0x448*f.source.slot;
    for(uint32_t i=0;i<64;++i) {
        uint32_t expected=i<count?base+312+12*i:0;
        CHECK(read_unaligned(0x460e5fe4+14*i)==expected);
        CHECK(read_unaligned(0x460e6372+14*i)==(expected?expected+4:0));
        CHECK(read_unaligned(0x460e6700+14*i)==(expected?expected+8:0));
    }
    CHECK(*VP(uint32_t,0x460e5e64)==1);
#else
    (void)count;
#endif
    return 0;
}
static int publications(void) {
    for(uint32_t format=0;format<4;++format)for(uint32_t slot=0;slot<2;++slot)
    for(uint32_t snap=0;snap<2;++snap)for(uint32_t retained=0;retained<2;++retained) {
        setup_publication(format,slot?127:0,retained);
        uint32_t audio_before=pcm_hash(),before=settings_hash();
        CHECK(plan(snap,retained));
        CHECK(complete(snap)==BS_SESSION_READY);
        CHECK(bs_candidate_begin(&c.candidate,&c.session,markers)==BS_CANDIDATE_READY);
        CHECK(bs_candidate_result(&c.candidate,c.candidate.token.operation,&c.edit));
        CHECK(c.edit.added>0);
        publication.denied=1;
        CHECK(bs_transaction_apply(&transaction,&c.candidate,c.candidate.token.operation,
                                   &publication_backend)==BS_TRANSACTION_REJECTED);
        CHECK(!publication.exchanges && settings_hash()==before);
        publication.denied=0;
        CHECK(bs_transaction_apply(&transaction,&c.candidate,c.candidate.token.operation,
                                   &publication_backend)==BS_TRANSACTION_OK);
        CHECK(c.copies && f.queries && publication.exchanges==1);
        CHECK(owned(&c));
        CHECK(markers(&c,&c.identity,&publication.captured)==BS_PROVIDER_READY);
        CHECK(bs_marker_matches_after(&c.edit,&publication.captured));release(&c);
        int error=check_bindings(c.edit.after.count);if(error)return error;
        /* A valid current selection can name a new row that Undo removes. */
#ifdef BS_FLEX_STOCK
        *VP(uint32_t,0x400ceb3c)=c.edit.after.count-1;
        *VP(uint32_t,0x47210000)=c.edit.after.records[c.edit.after.count-1].start+1;
#endif
        CHECK(bs_transaction_undo(&transaction,transaction.undo.operation)==BS_TRANSACTION_OK);
        CHECK(transaction.state==BS_TRANSACTION_UNDONE && publication.exchanges==2);
        CHECK(audio_before==pcm_hash() && settings_hash()==before);
        error=check_bindings(retained);if(error)return error;
        CHECK(!publication.wrong && !publication.quarantined && !c.bad && !c.held);
    }
    return 0;
}
static int rollback_cases(void) {
    for(uint32_t format=0;format<4;++format)for(uint32_t undo=0;undo<2;++undo) {
        setup_publication(format,127,0);
        uint32_t original=settings_hash(),audio=pcm_hash();
        CHECK(complete(0)==BS_SESSION_READY);
        CHECK(bs_candidate_begin(&c.candidate,&c.session,markers)==BS_CANDIDATE_READY);
        if(undo)CHECK(bs_transaction_apply(&transaction,&c.candidate,c.candidate.token.operation,
                                          &publication_backend)==BS_TRANSACTION_OK);
        uint32_t before=settings_hash(),expected_count=settings()[273];
        publication.fail_after=1;
        CHECK((undo?bs_transaction_undo(&transaction,transaction.undo.operation):
               bs_transaction_apply(&transaction,&c.candidate,c.candidate.token.operation,&publication_backend))
              ==BS_TRANSACTION_NO_CHANGE);
        CHECK(settings_hash()==before && pcm_hash()==audio);
        int error=check_bindings(expected_count);if(error)return error;
        if(undo) {
            publication.fail_after=0;
            CHECK(bs_transaction_undo(&transaction,transaction.undo.operation)==BS_TRANSACTION_OK);
            CHECK(settings_hash()==original && pcm_hash()==audio);
        }
        CHECK(!publication.wrong && !publication.quarantined && !c.bad && !c.held);
    }
    return 0;
}
int bs_flex_chain_selftest(void);
static int commit_and_clear(void) {
    for(uint32_t format=0;format<4;++format)for(uint32_t slot=0;slot<2;++slot)
    for(uint32_t snap=0;snap<2;++snap)for(uint32_t retained=0;retained<2;++retained) {
        setup_publication(format,slot?127:0,retained);
        uint32_t audio=pcm_hash();
        for(uint32_t pass=0;pass<2;++pass) {
            CHECK(complete(snap)==BS_SESSION_READY);
            CHECK(bs_candidate_begin(&c.candidate,&c.session,markers)==BS_CANDIDATE_READY);
            CHECK(bs_candidate_result(&c.candidate,c.candidate.token.operation,&c.edit));
            uint32_t old=c.candidate.token.operation;
            CHECK(bs_transaction_commit(&transaction,&c.candidate,old,&publication_backend)==BS_TRANSACTION_OK);
            CHECK(transaction.state==BS_TRANSACTION_EMPTY && !transaction.undo.operation);
            CHECK(bs_transaction_undo(&transaction,old)==BS_TRANSACTION_REJECTED);
            CHECK(owned(&c));
            CHECK(markers(&c,&c.identity,&publication.captured)==BS_PROVIDER_READY);
            CHECK(bs_marker_matches_after(&c.edit,&publication.captured));release(&c);
            int error=check_bindings(c.edit.after.count);if(error)return error;
            CHECK(pcm_hash()==audio);
            /* Keep a new preview pending while stock-style clearing occurs.
             * This models clear's metadata effect; the full stock callback is
             * exercised separately, not called by this publication fixture.
             */
            CHECK(complete(snap)==BS_SESSION_READY);
            CHECK(bs_candidate_begin(&c.candidate,&c.session,markers)==BS_CANDIDATE_READY);
            CHECK(owned(&c));
            CHECK(markers(&c,&c.identity,&publication.captured)==BS_PROVIDER_READY);
            uint32_t ticket=bs_guard_writer_begin(&c.guard);CHECK(ticket);
            publication.captured.count=0;store_table(&publication.captured);
            CHECK(bs_guard_writer_end(&c.guard,ticket));release(&c);
            uint32_t cleared=settings_hash(),exchanges=publication.exchanges;
            CHECK(bs_transaction_commit(&transaction,&c.candidate,c.candidate.token.operation,
                                         &publication_backend)==BS_TRANSACTION_STALE);
            CHECK(settings_hash()==cleared && settings()[273]==0 && publication.exchanges==exchanges);
            CHECK(transaction.state==BS_TRANSACTION_EMPTY && pcm_hash()==audio);
            error=check_bindings(0);if(error)return error;
            CHECK(!publication.wrong && !publication.quarantined && !c.bad && !c.held);
        }
    }
    for(uint32_t format=0;format<4;++format) {
        setup_publication(format,127,0);
        uint32_t before=settings_hash(),audio=pcm_hash();
        CHECK(complete(0)==BS_SESSION_READY);
        CHECK(bs_candidate_begin(&c.candidate,&c.session,markers)==BS_CANDIDATE_READY);
        publication.fail_after=1;
        CHECK(bs_transaction_commit(&transaction,&c.candidate,c.candidate.token.operation,
                                     &publication_backend)==BS_TRANSACTION_NO_CHANGE);
        CHECK(transaction.state==BS_TRANSACTION_EMPTY && !transaction.undo.operation);
        CHECK(settings_hash()==before && pcm_hash()==audio);
        int error=check_bindings(0);if(error)return error;
        CHECK(!publication.wrong && !publication.quarantined && !c.bad && !c.held);
    }
    return 0;
}
int bs_transaction_stock_selftest(void) {
    int error=bs_flex_chain_selftest();if(error)return error;
    error=publications();if(error)return error;
    error=rollback_cases();if(error)return error;
    return commit_and_clear();
}
