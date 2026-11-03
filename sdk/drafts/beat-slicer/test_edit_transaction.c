/* SPDX-License-Identifier: MIT */
#include "edit_transaction.h"
#define CHECK(x) do { if (!(x)) return __LINE__; } while (0)
struct fixture {
    struct bs_preview_guard guard;
    struct bs_preview_session session;
    struct bs_edit_candidate candidate;
    struct bs_source_snapshot live;
    struct bs_marker_table table;
    struct bs_marker_edit out;
    struct bs_edit_transaction transaction;
    uint32_t exchanges, quarantined, policy_calls, policy_reply, fail_word, fault_mode;
    uint32_t refresh, auxiliary, rollback_auxiliary, exchange_guard, reenter, reentry_bad;
    uint32_t quarantine_locked, post_pending, policy_invalidate, policy_mutate;
    uint32_t held, bad, locks, unlocks, denied, table_calls, table_pending, table_fail;
    uint32_t pending_at, mutate_at, metadata_at, invalidate_at, capture_pending;
};
static struct fixture f;
static void clear(void *v, uint32_t n) {
    uint8_t *p = (uint8_t *)v;
    for (uint32_t i = 0; i < n; ++i) p[i] = 0;
}
static void bytes(void *v, const void *s, uint32_t n) {
    uint8_t *p = (uint8_t *)v; const uint8_t *q = (const uint8_t *)s;
    for (uint32_t i = 0; i < n; ++i) p[i] = q[i];
}
static int lock(void *ctx) {
    struct fixture *p = (struct fixture *)ctx;
    if (p->held) { p->bad = __LINE__; return 0; }
    if (p->denied) { --p->denied; return 0; }
    p->held = 1; ++p->locks; return 1;
}
static void unlock(void *ctx) {
    struct fixture *p = (struct fixture *)ctx;
    if (!p->held) p->bad = __LINE__;
    p->held = 0; ++p->unlocks;
}
static enum bs_provider_reply snapshot(void *ctx, struct bs_source_snapshot *out) {
    struct fixture *p = (struct fixture *)ctx;
    if (!p->held) { p->bad = __LINE__; return BS_PROVIDER_FAILED; }
    if (p->capture_pending) { --p->capture_pending; return BS_PROVIDER_PENDING; }
    bytes(out, &p->live, sizeof(*out)); return BS_PROVIDER_READY;
}
static enum bs_provider_reply pcm(void *ctx, const struct bs_source_snapshot *source,
        const struct bs_pcm_read *request, uint8_t *out, uint32_t capacity, uint32_t *count) {
    struct fixture *p = (struct fixture *)ctx;
    uint32_t n = request->count * source->format.channels * (source->format.bits/8);
    if (!p->held || n > capacity || request->first >= source->frames ||
        request->count > source->frames-request->first) { p->bad = __LINE__; return BS_PROVIDER_FAILED; }
    clear(out, n); *count = n; return BS_PROVIDER_READY;
}
static const struct bs_preview_backend backend = {lock, unlock, snapshot, pcm};
static enum bs_provider_reply table(void *ctx, const struct bs_source_snapshot *source,
                                    struct bs_marker_table *out) {
    struct fixture *p = (struct fixture *)ctx;
    if (!p->held || source->sample_id != p->live.sample_id) { p->bad = __LINE__; return BS_PROVIDER_FAILED; }
    ++p->table_calls;
    if (p->table_pending || p->table_calls == p->pending_at) {
        if (p->table_pending) --p->table_pending;
        return BS_PROVIDER_PENDING;
    }
    if (p->table_fail) return p->table_fail == 1 ? BS_PROVIDER_FAILED : BS_PROVIDER_UNSUPPORTED;
    if (p->table_calls == p->mutate_at) ++p->table.records[63].end;
    bytes(out, &p->table, sizeof(*out));
    if (p->table_calls == p->metadata_at) ++p->live.loop;
    if (p->table_calls == p->invalidate_at) bs_guard_invalidate(&p->guard);
    return BS_PROVIDER_READY;
}
static void setup(uint32_t retained) {
    clear(&f, sizeof(f));
    bs_guard_init(&f.guard); (void)bs_guard_enable(&f.guard);
    bs_session_init(&f.session, &f.guard, &backend, &f);
    bs_candidate_init(&f.candidate);
    bs_transaction_init(&f.transaction);
    f.policy_reply = BS_PROVIDER_READY; f.fail_word = 0xffffffffu;
    f.auxiliary = 12345;
    f.live.owner_id = 1; f.live.owner_generation = 1; f.live.sample_id = 2;
    f.live.sample_generation = 1; f.live.editor_generation = 1; f.live.playback_generation = 1;
    f.live.kind = BS_SOURCE_FLEX; f.live.slot = 0; f.live.frames = 16000;
    f.live.sample_rate = 8000; f.live.format.bits = 24; f.live.format.channels = 2;
    f.live.trim_end = 16000; f.live.sample_bpm24 = f.live.project_bpm24 = 2880;
    f.table.count = f.live.marker_count = retained;
    for (uint32_t i = 0; i < BS_MAX_SLICES; ++i) {
        f.table.records[i].start = i < retained ? i*4000 : 70000+i;
        f.table.records[i].end = i < retained ? (i+1)*4000 : 80000+i;
        f.table.records[i].loop = i < retained ? 0xffffffffu : 90000+i;
        if (i < retained) bytes(&f.live.markers[i], &f.table.records[i], sizeof(f.live.markers[i]));
    }
}
static int preview(uint32_t tempo, uint32_t snap) {
    const struct bs_preview_options options = {1, snap, tempo};
    enum bs_session_state s = bs_session_begin(&f.session, &options);
    uint32_t n = 0;
    while ((s == BS_SESSION_RUNNING || s == BS_SESSION_WAITING) && ++n < 20000)
        s = bs_session_step(&f.session);
    return s == BS_SESSION_READY && !f.held && !f.bad;
}
static int ready(uint32_t retained) {
    setup(retained);
    return preview(BS_SAMPLE_BPM, 0) &&
        bs_candidate_begin(&f.candidate, &f.session, table) == BS_CANDIDATE_READY;
}
static enum bs_provider_reply policy(void *ctx, const struct bs_source_snapshot *source,
                                    const struct bs_marker_table *desired, const struct bs_plan *plan) {
    struct fixture *p = (struct fixture *)ctx;
    if (!p->held || p->transaction.state != BS_TRANSACTION_ACTIVE ||
        source->sample_id != p->live.sample_id ||
        desired != (plan ? &p->transaction.edit.after : &p->transaction.edit.before)) p->bad = __LINE__;
    ++p->policy_calls;
    if (p->policy_invalidate) bs_guard_invalidate(&p->guard);
    if (p->policy_mutate) ++p->table.records[63].start;
    return (enum bs_provider_reply)(int32_t)p->policy_reply;
}
static void publish_active(struct fixture *p) {
    p->live.marker_count = p->table.count;
    for (uint32_t i = 0; i < p->table.count; ++i)
        bytes(&p->live.markers[i], &p->table.records[i], sizeof(p->live.markers[i]));
}
static const struct bs_transaction_backend transaction_backend;
static enum bs_exchange_reply exchange(void *ctx, const struct bs_source_snapshot *source,
        const struct bs_marker_table *expected, const struct bs_marker_table *desired) {
    struct fixture *p = (struct fixture *)ctx;
    uint32_t old_auxiliary = p->auxiliary;
    if (!p->held || source->sample_id != p->live.sample_id ||
        bs_guard_revision(&p->guard) || p->transaction.state != BS_TRANSACTION_ACTIVE)
        p->bad = __LINE__;
    for (uint32_t i = 0; i < sizeof(*expected); ++i)
        if (((const uint8_t *)expected)[i] != ((const uint8_t *)&p->table)[i]) p->bad = __LINE__;
    ++p->exchanges;
    if (p->reenter) {
        if (bs_transaction_apply(&p->transaction, &p->candidate, p->candidate.token.operation,
                                 &transaction_backend) != BS_TRANSACTION_BUSY ||
            bs_transaction_commit(&p->transaction, &p->candidate, p->candidate.token.operation,
                                  &transaction_backend) != BS_TRANSACTION_BUSY ||
            bs_transaction_undo(&p->transaction, p->transaction.undo.operation) != BS_TRANSACTION_BUSY ||
            bs_transaction_forget(&p->transaction)) p->reentry_bad = 1;
    }
    /* Original model of a fallible publication backend. Every scalar boundary
     * can fail after its write; rollback restores the full table AND auxiliary
     * refresh state before returning UNCHANGED. This is not stock code.
     */
    for (uint32_t i = 0; i < 193; ++i) {
        if (i == 192) p->table.count = desired->count;
        else {
            struct bs_marker_record *a = &p->table.records[i/3];
            const struct bs_marker_record *b = &desired->records[i/3];
            if (i%3 == 0) a->start = b->start;
            if (i%3 == 1) a->end = b->end;
            if (i%3 == 2) a->loop = b->loop;
        }
        if (i == p->fail_word) goto rollback;
    }
    ++p->auxiliary; ++p->refresh;
    if (p->fail_word == 193) goto rollback;
    publish_active(p);
    if (p->exchange_guard) bs_guard_invalidate(&p->guard);
    if (p->post_pending) p->capture_pending = 1;
    if (p->fault_mode == 1) return BS_EXCHANGE_FAULT;
    if (p->fault_mode == 2) ++p->table.records[63].loop;
    if (p->fault_mode == 3) ++p->live.sample_generation;
    if (p->fault_mode == 4) return (enum bs_exchange_reply)99;
    if (p->fault_mode == 5) return BS_EXCHANGE_UNCHANGED;
    return BS_EXCHANGE_COMMITTED;
rollback:
    bytes(&p->table, expected, sizeof(*expected));
    p->auxiliary = old_auxiliary; ++p->rollback_auxiliary;
    publish_active(p);
    return BS_EXCHANGE_UNCHANGED;
}
static void quarantine(void *ctx) {
    struct fixture *p = (struct fixture *)ctx;
    ++p->quarantined;
    p->quarantine_locked = p->held && !bs_guard_revision(&p->guard) &&
        p->transaction.state == BS_TRANSACTION_FAULT;
}
static const struct bs_transaction_backend transaction_backend = {policy, exchange, quarantine};
static enum bs_transaction_reply apply(void) {
    return bs_transaction_apply(&f.transaction, &f.candidate, f.candidate.token.operation,
                                 &transaction_backend);
}
static int balanced(void) { return !f.bad && !f.held && f.locks == f.unlocks && !f.reentry_bad; }
static enum bs_transaction_reply commit(void) {
    return bs_transaction_commit(&f.transaction, &f.candidate, f.candidate.token.operation,
                                  &transaction_backend);
}
static int empty_workspace(void) {
    return f.transaction.state == BS_TRANSACTION_EMPTY && !f.transaction.undo.operation &&
        !f.transaction.guard && !f.transaction.backend && !f.transaction.source_backend &&
        !f.transaction.context && !f.transaction.capture;
}
static int commit_workflow(void) {
    /* No user Undo or forget step: successive commits and stock-style clears
     * reuse one workspace. These clears model metadata only, not native stock.
     */
    for (uint32_t kind = 0; kind < 2; ++kind)
    for (uint32_t tempo = 0; tempo < 2; ++tempo)
    for (uint32_t snap = 0; snap < 2; ++snap)
    for (uint32_t retained = 0; retained <= 4; ++retained) {
        setup(retained); f.live.kind = kind;
        for (uint32_t pass = 0; pass < 3; ++pass) {
            CHECK(preview(tempo, snap));
            CHECK(bs_candidate_begin(&f.candidate, &f.session, table) == BS_CANDIDATE_READY);
            bytes(&f.out, &f.candidate.edit, sizeof(f.out));
            uint32_t old = f.candidate.token.operation, before = f.exchanges;
            CHECK(commit() == (f.out.added ? BS_TRANSACTION_OK : BS_TRANSACTION_NO_CHANGE));
            CHECK(empty_workspace() && balanced() && !f.quarantined);
            CHECK(bs_marker_matches_after(&f.out, &f.table));
            CHECK(f.exchanges == before + (f.out.added != 0));
            CHECK(bs_transaction_undo(&f.transaction, old) == BS_TRANSACTION_REJECTED);
            if (f.out.added) CHECK(commit() == BS_TRANSACTION_REJECTED && f.exchanges == before+1);
            /* A fresh no-op preview must not create history or invoke exchange. */
            CHECK(preview(tempo, snap));
            CHECK(bs_candidate_begin(&f.candidate, &f.session, table) == BS_CANDIDATE_READY);
            before = f.exchanges;
            CHECK(commit() == BS_TRANSACTION_NO_CHANGE && f.exchanges == before && empty_workspace());
            /* Clearing retires that outstanding preview; it cannot recreate
             * deleted slices unless a new preview is explicitly prepared.
             */
            uint32_t ticket = bs_guard_writer_begin(&f.guard);
            CHECK(ticket); f.table.count = 0; publish_active(&f);
            CHECK(bs_guard_writer_end(&f.guard, ticket));
            CHECK(commit() == BS_TRANSACTION_STALE && !f.table.count && f.exchanges == before);
            CHECK(empty_workspace() && balanced());
        }
    }
    return 0;
}
static int commit_failures(void) {
    for (uint32_t word = 0; word < 194; ++word) {
        CHECK(ready(1)); bytes(&f.out, &f.candidate.edit, sizeof(f.out));
        uint32_t aux = f.auxiliary;
        f.fail_word = word;
        CHECK(commit() == BS_TRANSACTION_NO_CHANGE && empty_workspace());
        CHECK(bs_marker_matches_before(&f.out, &f.table) && f.auxiliary == aux && f.rollback_auxiliary == 1);
        CHECK(f.candidate.state == BS_CANDIDATE_CANCELLED && !f.quarantined && balanced());
        CHECK(commit() == BS_TRANSACTION_REJECTED && f.exchanges == 1);
    }
    CHECK(ready(1));
    f.denied = 1; CHECK(commit() == BS_TRANSACTION_WAIT && empty_workspace());
    f.capture_pending = 1; CHECK(commit() == BS_TRANSACTION_WAIT && empty_workspace());
    f.table_pending = 1; CHECK(commit() == BS_TRANSACTION_WAIT && empty_workspace());
    f.policy_reply = BS_PROVIDER_PENDING; CHECK(commit() == BS_TRANSACTION_WAIT && empty_workspace());
    f.policy_reply = (uint32_t)BS_PROVIDER_FAILED;
    CHECK(commit() == BS_TRANSACTION_REJECTED && empty_workspace() && !f.exchanges);
    f.policy_reply = BS_PROVIDER_READY; f.reenter = 1;
    CHECK(commit() == BS_TRANSACTION_OK && empty_workspace() && balanced());
    for (uint32_t mode = 1; mode <= 7; ++mode) {
        CHECK(ready(1));
        if (mode <= 5) f.fault_mode = mode;
        if (mode == 6) f.exchange_guard = 1;
        if (mode == 7) f.post_pending = 1;
        CHECK(commit() == BS_TRANSACTION_BROKEN && f.transaction.state == BS_TRANSACTION_FAULT);
        CHECK(f.quarantined == 1 && f.quarantine_locked && !bs_transaction_forget(&f.transaction));
        CHECK(commit() == BS_TRANSACTION_BROKEN && f.quarantined == 1 && balanced());
    }
    /* The new API must not erase history left by a research caller. */
    CHECK(ready(1)); CHECK(apply() == BS_TRANSACTION_OK);
    uint32_t old = f.transaction.undo.operation;
    CHECK(commit() == BS_TRANSACTION_BUSY && f.transaction.undo.operation == old && f.exchanges == 1);
    CHECK(bs_transaction_undo(&f.transaction, old) == BS_TRANSACTION_OK && balanced());
    CHECK(ready(1)); f.guard.serial = UINT32_MAX;
    CHECK(commit() == BS_TRANSACTION_REJECTED && empty_workspace() && f.guard.poisoned && !f.exchanges);
    CHECK(balanced());
    return 0;
}
static int successful(void) {
    for (uint32_t kind = 0; kind < 2; ++kind)
    for (uint32_t tempo = 0; tempo < 2; ++tempo)
    for (uint32_t snap = 0; snap < 2; ++snap)
    for (uint32_t retained = 0; retained <= 4; ++retained) {
        setup(retained); f.live.kind = kind; f.live.slot = kind ? 127 : 0;
        CHECK(preview(tempo, snap));
        CHECK(bs_candidate_begin(&f.candidate, &f.session, table) == BS_CANDIDATE_READY);
        bytes(&f.out, &f.candidate.edit, sizeof(f.out));
        uint32_t old = f.candidate.token.operation;
        CHECK(apply() == (retained == 4 ? BS_TRANSACTION_NO_CHANGE : BS_TRANSACTION_OK));
        if (retained == 4) {
            CHECK(!f.exchanges && !f.policy_calls && f.transaction.state == BS_TRANSACTION_EMPTY);
        } else {
            CHECK(f.transaction.state == BS_TRANSACTION_APPLIED && f.transaction.undo.operation != old);
            CHECK(bs_marker_matches_after(&f.out, &f.table) && f.exchanges == 1 && f.refresh == 1);
            CHECK(f.policy_calls == 1 && f.candidate.state == BS_CANDIDATE_CANCELLED);
            CHECK(!bs_guard_valid(&f.guard, &f.session.token));
            CHECK(bs_transaction_undo(&f.transaction, old) == BS_TRANSACTION_REJECTED);
            old = f.transaction.undo.operation;
            CHECK(bs_transaction_undo(&f.transaction, old) == BS_TRANSACTION_OK);
            CHECK(f.transaction.state == BS_TRANSACTION_UNDONE && !f.transaction.undo.operation);
            CHECK(bs_marker_matches_before(&f.out, &f.table) && f.exchanges == 2 && f.refresh == 2);
            CHECK(f.policy_calls == 2 && bs_transaction_undo(&f.transaction, old) == BS_TRANSACTION_REJECTED);
        }
        CHECK(!f.quarantined && balanced());
    }
    return 0;
}
static int rollback(void) {
    for (uint32_t undo = 0; undo < 2; ++undo)
    for (uint32_t word = 0; word < 194; ++word) {
        CHECK(ready(1)); bytes(&f.out, &f.candidate.edit, sizeof(f.out));
        if (undo) CHECK(apply() == BS_TRANSACTION_OK);
        uint32_t old = f.transaction.undo.operation, aux = f.auxiliary;
        f.fail_word = word;
        CHECK((undo ? bs_transaction_undo(&f.transaction, old) : apply()) == BS_TRANSACTION_NO_CHANGE);
        CHECK(f.auxiliary == aux && f.rollback_auxiliary == 1 && !f.quarantined);
        if (undo) {
            CHECK(bs_marker_matches_after(&f.out, &f.table) && f.transaction.state == BS_TRANSACTION_APPLIED);
            CHECK(old != f.transaction.undo.operation && f.transaction.undo.operation);
            CHECK(bs_transaction_undo(&f.transaction, old) == BS_TRANSACTION_REJECTED);
            f.fail_word = 0xffffffffu;
            CHECK(bs_transaction_undo(&f.transaction, f.transaction.undo.operation) == BS_TRANSACTION_OK);
            CHECK(bs_marker_matches_before(&f.out, &f.table));
        } else {
            CHECK(bs_marker_matches_before(&f.out, &f.table) && f.transaction.state == BS_TRANSACTION_RETIRED);
            CHECK(f.candidate.state == BS_CANDIDATE_CANCELLED && !f.transaction.undo.operation);
        }
        CHECK(balanced());
    }
    return 0;
}
static void mutate_table(uint32_t n) {
    if (n == 192) ++f.table.count;
    else {
        struct bs_marker_record *r = &f.table.records[n/3];
        if (n%3 == 0) ++r->start;
        if (n%3 == 1) ++r->end;
        if (n%3 == 2) ++r->loop;
    }
}
static int stale_tables(void) {
    for (uint32_t undo = 0; undo < 2; ++undo)
    for (uint32_t word = 0; word < 193; ++word) {
        CHECK(ready(1)); if (undo) CHECK(apply() == BS_TRANSACTION_OK);
        mutate_table(word);
        bytes(&f.out.before, &f.table, sizeof(f.table));
        CHECK((undo ? bs_transaction_undo(&f.transaction, f.transaction.undo.operation) : apply())
              == BS_TRANSACTION_STALE);
        CHECK(f.exchanges == undo && bs_marker_matches_before(&f.out, &f.table));
        CHECK(!f.quarantined && balanced());
    }
    return 0;
}
static int stale_metadata(void) {
    for (uint32_t n = 0; n < 23; ++n) {
        CHECK(ready(1)); CHECK(apply() == BS_TRANSACTION_OK);
        switch (n) {
        case 0: ++f.live.owner_id; break;
        case 1: ++f.live.owner_generation; break;
        case 2: ++f.live.sample_id; break;
        case 3: ++f.live.sample_generation; break;
        case 4: ++f.live.editor_generation; break;
        case 5: ++f.live.playback_generation; break;
        case 6: ++f.live.kind; break;
        case 7: ++f.live.slot; break;
        case 8: ++f.live.frames; break;
        case 9: ++f.live.sample_rate; break;
        case 10: f.live.format.bits = 16; break;
        case 11: f.live.format.channels = 1; break;
        case 12: f.live.format.little_endian = 1; break;
        case 13: ++f.live.trim_start; break;
        case 14: --f.live.trim_end; break;
        case 15: ++f.live.loop; break;
        case 16: ++f.live.sample_bpm24; break;
        case 17: ++f.live.marker_count; break;
        case 18: ++f.live.markers[0].start; break;
        case 19: ++f.live.markers[0].end; break;
        case 20: ++f.live.markers[0].loop; break;
        case 21: bs_guard_invalidate(&f.guard); break;
        default: bs_guard_revoke(&f.guard); break;
        }
        CHECK(bs_transaction_undo(&f.transaction, f.transaction.undo.operation) == BS_TRANSACTION_STALE);
        CHECK(f.exchanges == 1 && f.transaction.state == BS_TRANSACTION_RETIRED && balanced());
    }
    CHECK(ready(1)); CHECK(apply() == BS_TRANSACTION_OK); ++f.live.project_bpm24;
    CHECK(bs_transaction_undo(&f.transaction, f.transaction.undo.operation) == BS_TRANSACTION_OK);
    setup(1); CHECK(preview(BS_PROJECT_BPM, 0));
    CHECK(bs_candidate_begin(&f.candidate, &f.session, table) == BS_CANDIDATE_READY);
    CHECK(apply() == BS_TRANSACTION_OK); ++f.live.sample_bpm24;
    CHECK(bs_transaction_undo(&f.transaction, f.transaction.undo.operation) == BS_TRANSACTION_OK);
    return 0;
}
static int faults(void) {
    for (uint32_t undo = 0; undo < 2; ++undo)
    for (uint32_t mode = 1; mode <= 7; ++mode) {
        CHECK(ready(1)); if (undo) CHECK(apply() == BS_TRANSACTION_OK);
        if (mode <= 5) f.fault_mode = mode;
        if (mode == 6) f.exchange_guard = 1;
        if (mode == 7) f.post_pending = 1;
        CHECK((undo ? bs_transaction_undo(&f.transaction, f.transaction.undo.operation) : apply())
              == BS_TRANSACTION_BROKEN);
        CHECK(f.transaction.state == BS_TRANSACTION_FAULT && f.quarantined == 1 && f.quarantine_locked);
        CHECK(!f.guard.enabled && !f.transaction.undo.operation && !bs_transaction_forget(&f.transaction));
        CHECK(apply() == BS_TRANSACTION_BROKEN && bs_transaction_undo(&f.transaction, 1) == BS_TRANSACTION_BROKEN);
        CHECK(f.quarantined == 1 && balanced());
    }
    return 0;
}
static int lifecycle(void) {
    uint32_t old;
    CHECK(ready(1)); old = f.candidate.token.operation;
    CHECK(bs_transaction_apply(&f.transaction, &f.candidate, 0, &transaction_backend) == BS_TRANSACTION_REJECTED);
    CHECK(bs_transaction_apply(&f.transaction, &f.candidate, old+1, &transaction_backend) == BS_TRANSACTION_REJECTED);
    CHECK(!f.exchanges && f.transaction.state == BS_TRANSACTION_EMPTY);
    f.denied = 1; CHECK(apply() == BS_TRANSACTION_WAIT && !f.exchanges);
    f.capture_pending = 1; CHECK(apply() == BS_TRANSACTION_WAIT && !f.exchanges);
    f.table_pending = 1; CHECK(apply() == BS_TRANSACTION_WAIT && !f.exchanges);
    f.policy_reply = BS_PROVIDER_PENDING; CHECK(apply() == BS_TRANSACTION_WAIT && !f.exchanges);
    f.policy_reply = (uint32_t)BS_PROVIDER_UNSUPPORTED; CHECK(apply() == BS_TRANSACTION_REJECTED && !f.exchanges);
    f.policy_reply = BS_PROVIDER_READY; f.reenter = 1;
    CHECK(apply() == BS_TRANSACTION_OK && balanced());
    CHECK(apply() == BS_TRANSACTION_BUSY);
    old = f.transaction.undo.operation;
    f.denied = 1; CHECK(bs_transaction_undo(&f.transaction, old) == BS_TRANSACTION_WAIT);
    f.table_pending = 1; CHECK(bs_transaction_undo(&f.transaction, old) == BS_TRANSACTION_WAIT);
    f.policy_reply = BS_PROVIDER_PENDING; CHECK(bs_transaction_undo(&f.transaction, old) == BS_TRANSACTION_WAIT);
    f.policy_reply = (uint32_t)BS_PROVIDER_FAILED;
    CHECK(bs_transaction_undo(&f.transaction, old) == BS_TRANSACTION_REJECTED);
    f.policy_reply = BS_PROVIDER_READY;
    CHECK(bs_transaction_undo(&f.transaction, old) == BS_TRANSACTION_OK && balanced());
    CHECK(bs_transaction_forget(&f.transaction));
    CHECK(preview(BS_SAMPLE_BPM, 0));
    CHECK(bs_candidate_begin(&f.candidate, &f.session, table) == BS_CANDIDATE_READY);
    CHECK(apply() == BS_TRANSACTION_OK && f.transaction.undo.operation != old);
    CHECK(bs_transaction_undo(&f.transaction, old) == BS_TRANSACTION_REJECTED);
    CHECK(bs_transaction_forget(&f.transaction));
    CHECK(bs_transaction_undo(&f.transaction, old) == BS_TRANSACTION_REJECTED && f.exchanges == 3);
    for (uint32_t n = 0; n < 2; ++n) {
        CHECK(ready(1)); f.guard.serial = UINT32_MAX-n;
        CHECK(apply() == BS_TRANSACTION_REJECTED && !f.exchanges && balanced());
        CHECK(f.guard.poisoned && !f.quarantined);
    }
    CHECK(ready(1)); CHECK(apply() == BS_TRANSACTION_OK); f.guard.serial = UINT32_MAX;
    CHECK(bs_transaction_undo(&f.transaction, f.transaction.undo.operation) == BS_TRANSACTION_REJECTED);
    CHECK(f.transaction.state == BS_TRANSACTION_RETIRED && f.exchanges == 1 && balanced());
    return 0;
}
static int boundary_changes(void) {
    for (uint32_t undo = 0; undo < 2; ++undo)
    for (uint32_t boundary = 0; boundary < 4; ++boundary) {
        CHECK(ready(1)); if (undo) CHECK(apply() == BS_TRANSACTION_OK);
        if (boundary == 0) f.policy_invalidate = 1;
        if (boundary == 1) f.policy_mutate = 1;
        if (boundary == 2) f.metadata_at = f.table_calls+1;
        if (boundary == 3) f.invalidate_at = f.table_calls+(undo ? 2 : 1);
        CHECK((undo ? bs_transaction_undo(&f.transaction, f.transaction.undo.operation) : apply())
              == BS_TRANSACTION_STALE);
        CHECK(f.exchanges == undo && !f.quarantined && balanced());
    }
    CHECK(ready(1)); CHECK(apply() == BS_TRANSACTION_OK);
    uint32_t old = f.transaction.undo.operation;
    /* Session/candidate storage may be reused: the journal owns its snapshot,
     * complete records and source callback binding, not a pointer to either.
     */
    CHECK(preview(BS_SAMPLE_BPM, 0));
    CHECK(bs_candidate_begin(&f.candidate, &f.session, table) == BS_CANDIDATE_READY);
    CHECK(bs_transaction_undo(&f.transaction, old) == BS_TRANSACTION_OK);
    CHECK(bs_candidate_step(&f.candidate) == BS_CANDIDATE_STALE && balanced());
    CHECK(ready(1)); CHECK(apply() == BS_TRANSACTION_OK); old = f.transaction.undo.operation;
    uint32_t ticket = bs_guard_writer_begin(&f.guard);
    CHECK(ticket && bs_guard_writer_end(&f.guard, ticket));
    /* Even an intervening edit that restores identical bytes retires history. */
    CHECK(bs_transaction_undo(&f.transaction, old) == BS_TRANSACTION_STALE);
    CHECK(f.exchanges == 1 && balanced());
    CHECK(ready(1)); CHECK(apply() == BS_TRANSACTION_OK);
    f.fail_word = 193; f.guard.serial = UINT32_MAX-1;
    CHECK(bs_transaction_undo(&f.transaction, f.transaction.undo.operation) == BS_TRANSACTION_NO_CHANGE);
    CHECK(f.transaction.state == BS_TRANSACTION_RETIRED && f.guard.poisoned && balanced());
    return 0;
}
int bs_transaction_selftest(void) {
    int error;
    error = successful(); if (error) return error;
    error = rollback(); if (error) return error;
    error = stale_tables(); if (error) return error;
    error = stale_metadata(); if (error) return error;
    error = faults(); if (error) return error;
    error = lifecycle(); if (error) return error;
    error = boundary_changes(); if (error) return error;
    error = commit_workflow(); if (error) return error;
    return commit_failures();
}
