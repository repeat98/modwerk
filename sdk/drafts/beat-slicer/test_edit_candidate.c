/* SPDX-License-Identifier: MIT */
#include "edit_candidate.h"
#define CHECK(x) do { if (!(x)) return __LINE__; } while (0)
struct fixture {
    struct bs_preview_guard guard;
    struct bs_preview_session session;
    struct bs_edit_candidate candidate;
    struct bs_source_snapshot live;
    struct bs_marker_table table;
    struct bs_marker_edit out;
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
    if (!p->held || source != &p->session.snapshot) { p->bad = __LINE__; return BS_PROVIDER_FAILED; }
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
static int successful(void) {
    for (uint32_t kind = 0; kind < 2; ++kind)
    for (uint32_t tempo = 0; tempo < 2; ++tempo)
    for (uint32_t snap = 0; snap < 2; ++snap)
    for (uint32_t retained = 0; retained <= 4; ++retained) {
        setup(retained); f.live.kind = kind; f.live.slot = kind ? 127 : 0;
        CHECK(preview(tempo, snap));
        CHECK(bs_candidate_begin(&f.candidate, &f.session, table) == BS_CANDIDATE_READY);
        CHECK(f.candidate.token.operation != f.session.token.operation && f.candidate.token.operation);
        CHECK(bs_candidate_result(&f.candidate, f.candidate.token.operation, &f.out));
        CHECK(f.out.before.count == retained && f.out.after.count == 4 && f.out.added == 4-retained);
        CHECK(bs_marker_matches_before(&f.out, &f.table));
        for (uint32_t i = 0; i < 4; ++i)
            CHECK(f.out.after.records[i].start == i*4000 && f.out.after.records[i].end == (i+1)*4000 &&
                  f.out.after.records[i].loop == 0xffffffffu);
        for (uint32_t i = 4; i < 64; ++i)
            CHECK(f.out.after.records[i].start == 70000+i && f.out.after.records[i].end == 80000+i &&
                  f.out.after.records[i].loop == 90000+i);
        CHECK(!f.bad && !f.held && f.locks == f.unlocks);
    }
    return 0;
}
static int full_table_stale(void) {
    for (uint32_t n = 0; n < 193; ++n) {
        CHECK(ready(2));
        if (n == 192) ++f.table.count;
        else {
            struct bs_marker_record *r = &f.table.records[n/3];
            if (n%3 == 0) ++r->start;
            if (n%3 == 1) ++r->end;
            if (n%3 == 2) ++r->loop;
        }
        f.out.frames = 0x12345678;
        CHECK(!bs_candidate_result(&f.candidate, f.candidate.token.operation, &f.out));
        CHECK(f.candidate.state == BS_CANDIDATE_STALE && f.out.frames == 0x12345678);
        CHECK(!f.bad && !f.held && f.locks == f.unlocks);
    }
    return 0;
}
static int metadata_stale(void) {
    for (uint32_t n = 0; n < 21; ++n) {
        CHECK(ready(1));
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
        default: ++f.live.markers[0].loop; break;
        }
        f.out.frames = 0x12345678;
        CHECK(!bs_candidate_result(&f.candidate, f.candidate.token.operation, &f.out));
        CHECK(f.candidate.state == BS_CANDIDATE_STALE && f.out.frames == 0x12345678 && !f.bad);
    }
    CHECK(ready(1)); ++f.live.project_bpm24;
    CHECK(bs_candidate_result(&f.candidate, f.candidate.token.operation, &f.out));
    setup(1); CHECK(preview(BS_PROJECT_BPM, 0));
    CHECK(bs_candidate_begin(&f.candidate, &f.session, table) == BS_CANDIDATE_READY);
    ++f.live.sample_bpm24;
    CHECK(bs_candidate_result(&f.candidate, f.candidate.token.operation, &f.out));
    ++f.live.project_bpm24;
    CHECK(!bs_candidate_result(&f.candidate, f.candidate.token.operation, &f.out));
    return 0;
}
static int lifecycle(void) {
    uint32_t old, ticket;
    CHECK(ready(1)); old = f.candidate.token.operation;
    f.out.frames = 123;
    CHECK(!bs_candidate_result(&f.candidate, old+1, &f.out) && f.out.frames == 123);
    CHECK(!bs_candidate_result(&f.candidate, 0, &f.out));
    CHECK(!bs_candidate_result(&f.candidate, f.session.token.operation, &f.out));
    CHECK(f.candidate.state == BS_CANDIDATE_READY);
    bs_candidate_cancel(&f.candidate);
    CHECK(!bs_candidate_result(&f.candidate, old, &f.out) && f.out.frames == 123);
    CHECK(bs_candidate_step(&f.candidate) == BS_CANDIDATE_CANCELLED);
    CHECK(bs_candidate_begin(&f.candidate, &f.session, table) == BS_CANDIDATE_READY);
    CHECK(f.candidate.token.operation != old && !bs_candidate_result(&f.candidate, old, &f.out));
    CHECK(bs_candidate_result(&f.candidate, f.candidate.token.operation, &f.out));
    CHECK(ready(1)); old = f.candidate.token.operation;
    CHECK(preview(BS_SAMPLE_BPM, 0));
    CHECK(bs_candidate_step(&f.candidate) == BS_CANDIDATE_STALE);
    CHECK(!bs_candidate_result(&f.candidate, old, &f.out));
    CHECK(ready(1)); bs_session_cancel(&f.session);
    CHECK(bs_candidate_step(&f.candidate) == BS_CANDIDATE_STALE);
    CHECK(ready(1)); CHECK(lock(&f)); ticket = bs_guard_writer_begin(&f.guard);
    CHECK(ticket && bs_guard_writer_end(&f.guard, ticket)); unlock(&f);
    CHECK(bs_candidate_step(&f.candidate) == BS_CANDIDATE_STALE);
    CHECK(ready(1)); CHECK(lock(&f)); bs_guard_revoke(&f.guard); unlock(&f);
    CHECK(bs_candidate_step(&f.candidate) == BS_CANDIDATE_STALE);
    CHECK(ready(1)); f.denied = 1; f.out.frames = 123;
    CHECK(!bs_candidate_result(&f.candidate, f.candidate.token.operation, &f.out));
    CHECK(f.candidate.state == BS_CANDIDATE_WAITING && f.out.frames == 123);
    CHECK(bs_candidate_result(&f.candidate, f.candidate.token.operation, &f.out));
    CHECK(ready(1)); f.table_pending = 1; f.out.frames = 123;
    CHECK(!bs_candidate_result(&f.candidate, f.candidate.token.operation, &f.out) && f.out.frames == 123);
    CHECK(bs_candidate_result(&f.candidate, f.candidate.token.operation, &f.out));
    CHECK(ready(1)); f.capture_pending = 1;
    CHECK(bs_candidate_step(&f.candidate) == BS_CANDIDATE_WAITING);
    CHECK(bs_candidate_step(&f.candidate) == BS_CANDIDATE_READY);
    CHECK(!f.bad && !f.held && f.locks == f.unlocks);
    return 0;
}
static int preparation(void) {
    for (uint32_t n = 0; n < 8; ++n) {
        setup(1); CHECK(preview(BS_SAMPLE_BPM, 0));
        if (n == 0) f.denied = 1;
        if (n == 1) f.table_pending = 1;
        if (n == 2) f.pending_at = 2;
        if (n == 3) f.capture_pending = 1;
        if (n == 4) f.mutate_at = 2;
        if (n == 5) f.metadata_at = 1;
        if (n == 6) f.invalidate_at = 1;
        if (n == 7) f.guard.serial = 0xffffffffu;
        enum bs_candidate_state s = bs_candidate_begin(&f.candidate, &f.session, table);
        if (n < 4) {
            CHECK(s == BS_CANDIDATE_WAITING && !f.candidate.prepared);
            CHECK(bs_candidate_step(&f.candidate) == BS_CANDIDATE_READY);
            CHECK(bs_candidate_result(&f.candidate, f.candidate.token.operation, &f.out));
        } else CHECK(s == (n == 7 ? BS_CANDIDATE_FAILED : BS_CANDIDATE_STALE));
        CHECK(!f.bad && !f.held && f.locks == f.unlocks);
    }
    for (uint32_t error = 1; error <= 2; ++error) {
        setup(1); CHECK(preview(BS_SAMPLE_BPM, 0)); f.table_fail = error;
        CHECK(bs_candidate_begin(&f.candidate, &f.session, table) == BS_CANDIDATE_FAILED);
    }
    setup(1); f.live.markers[0].start = f.table.records[0].start = 100;
    CHECK(preview(BS_SAMPLE_BPM, 0));
    CHECK(bs_candidate_begin(&f.candidate, &f.session, table) == BS_CANDIDATE_REFUSED);
    CHECK(f.candidate.marker_status == BS_MARKERS_ORDINAL_CONFLICT);
    setup(1); CHECK(bs_candidate_begin(&f.candidate, &f.session, table) == BS_CANDIDATE_FAILED);
    CHECK(bs_candidate_begin(&f.candidate, 0, table) == BS_CANDIDATE_FAILED);
    CHECK(preview(BS_SAMPLE_BPM, 0));
    CHECK(bs_candidate_begin(&f.candidate, &f.session, 0) == BS_CANDIDATE_FAILED);
    return 0;
}
int bs_candidate_selftest(void) {
    int error;
    error = successful(); if (error) return error;
    error = full_table_stale(); if (error) return error;
    error = metadata_stale(); if (error) return error;
    error = lifecycle(); if (error) return error;
    return preparation();
}
