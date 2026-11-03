/* SPDX-License-Identifier: MIT */
#include "preview_session.h"
#define CHECK(x) do { if (!(x)) return __LINE__; } while (0)
struct fixture {
    struct bs_preview_guard guard;
    struct bs_preview_session session;
    struct bs_source_snapshot live;
    uint32_t locked, locks, unlocks, denied, captures, copies, bad;
    uint32_t capture_pending, copy_pending, capture_error, copy_error;
    uint32_t malformed, change_during_copy, invalidate_during_copy, pending_after_copy;
    uint32_t on_unlock, injected;
};
static struct fixture f;
static void clear(void *p, uint32_t n) {
    uint8_t *b = (uint8_t *)p;
    uint32_t i;
    for (i = 0; i < n; ++i) b[i] = 0;
}
static void copy(void *dst, const void *src, uint32_t n) {
    uint8_t *a = (uint8_t *)dst;
    const uint8_t *b = (const uint8_t *)src;
    uint32_t i;
    for (i = 0; i < n; ++i) a[i] = b[i];
}
static int lock(void *ctx) {
    struct fixture *p = (struct fixture *)ctx;
    if (p->locked) { p->bad = __LINE__; return 0; }
    if (p->denied) { --p->denied; return 0; }
    p->locked = 1; ++p->locks; return 1;
}
static void unlock(void *ctx) {
    struct fixture *p = (struct fixture *)ctx;
    if (!p->locked) p->bad = __LINE__;
    p->locked = 0; ++p->unlocks;
    /* Model an independent writer becoming runnable at a lock release. It
     * changes source/guard state only, never reenters the session itself. */
    if (p->on_unlock && !p->injected) {
        uint32_t mode = p->on_unlock;
        int before_copy = p->session.captured &&
            p->session.reader.job.state == BS_JOB_NEED_FRAME && !p->session.reader.waiting;
        int after_copy = p->copies && p->session.reader.waiting;
        if ((mode <= 2 || mode == 8) ||
            ((mode == 3 || mode == 4 || mode == 7 || mode == 9) && before_copy) ||
            ((mode == 5 || mode == 6) && after_copy)) {
            p->injected = 1;
            if (mode == 1 || mode == 3 || mode == 5) bs_guard_invalidate(&p->guard);
            if (mode == 2) ++p->live.markers[0].end;
            if (mode == 4) ++p->live.frames;
            if (mode == 6) p->live.format.bits = 16;
            if (mode == 7) p->denied = 1;
            if (mode == 8) ++p->live.project_bpm24; /* SAMPLE was selected. */
            if (mode == 9) p->capture_pending = 1;
        }
    }
}
static enum bs_provider_reply capture(void *ctx, struct bs_source_snapshot *out) {
    struct fixture *p = (struct fixture *)ctx;
    if (!p->locked) { p->bad = __LINE__; return BS_PROVIDER_FAILED; }
    ++p->captures;
    if (p->capture_pending) { --p->capture_pending; return BS_PROVIDER_PENDING; }
    if (p->capture_error) return p->capture_error == 1 ? BS_PROVIDER_FAILED : BS_PROVIDER_UNSUPPORTED;
    copy(out, &p->live, sizeof(*out));
    return BS_PROVIDER_READY;
}
static int32_t value(uint32_t frame, uint32_t channel) {
    return channel ? ((int32_t)(frame % 17)-8)*512 : ((int32_t)(frame % 31)-15)*256;
}
static enum bs_provider_reply read_ready(void *ctx, const struct bs_source_snapshot *snapshot,
        const struct bs_pcm_read *read, uint8_t *out, uint32_t capacity, uint32_t *bytes) {
    struct fixture *p = (struct fixture *)ctx;
    uint32_t frames, width, sample_bytes, i, ch, b, v;
    if (!p->locked || capacity != BS_SESSION_BYTES || snapshot != &p->session.snapshot ||
        read->operation != p->session.token.operation || read->revision != p->session.token.revision ||
        !read->count || read->count > BS_PCM_BLOCK_FRAMES || read->first >= p->live.frames ||
        read->count > p->live.frames-read->first) { p->bad = __LINE__; return BS_PROVIDER_FAILED; }
    ++p->copies;
    if (p->copy_pending) { --p->copy_pending; return BS_PROVIDER_PENDING; }
    if (p->copy_error) return p->copy_error == 1 ? BS_PROVIDER_FAILED : BS_PROVIDER_UNSUPPORTED;
    sample_bytes = p->live.format.bits/8; width = sample_bytes*p->live.format.channels;
    frames = 13-read->first%13; /* Authored small pages force short replies. */
    if (frames > read->count) frames = read->count;
    for (i = 0; i < frames; ++i) for (ch = 0; ch < p->live.format.channels; ++ch) {
        v = (uint32_t)value(read->first+i, ch);
        if (sample_bytes == 2) v >>= 8;
        for (b = 0; b < sample_bytes; ++b)
            out[i*width+ch*sample_bytes+b] = (uint8_t)(v >> (8*(p->live.format.little_endian ? b : sample_bytes-1-b)));
    }
    *bytes = frames*width;
    if (p->malformed == 1) *bytes = 0;
    if (p->malformed == 2) *bytes = width-1;
    if (p->malformed == 3) *bytes = (read->count+1)*width;
    if (p->malformed == 4) *bytes = capacity+1;
    if (p->change_during_copy) ++p->live.markers[0].loop;
    if (p->invalidate_during_copy) bs_guard_invalidate(&p->guard);
    if (p->pending_after_copy) { p->capture_pending = 1; p->pending_after_copy = 0; }
    return BS_PROVIDER_READY;
}
static const struct bs_preview_backend backend = {lock, unlock, capture, read_ready};
static void setup(void) {
    clear(&f, sizeof(f));
    bs_guard_init(&f.guard); (void)bs_guard_enable(&f.guard);
    f.live.owner_id = 7; f.live.owner_generation = 8;
    f.live.sample_id = 9; f.live.sample_generation = 10; f.live.editor_generation = 11;
    f.live.kind = BS_SOURCE_FLEX; f.live.slot = 3;
    f.live.frames = 10000; f.live.sample_rate = 8000;
    f.live.format.bits = 24; f.live.format.channels = 2; f.live.format.little_endian = 0;
    f.live.trim_start = 0; f.live.trim_end = 10000; f.live.loop = 0xffffffffu;
    f.live.sample_bpm24 = 2880; f.live.project_bpm24 = 2160; f.live.playback_generation = 12;
    f.live.marker_count = 2;
    f.live.markers[0].start = 2000; f.live.markers[0].end = 3000; f.live.markers[0].loop = 2100;
    f.live.markers[1].start = 7000; f.live.markers[1].end = 8000; f.live.markers[1].loop = 0xffffffffu;
    bs_session_init(&f.session, &f.guard, &backend, &f);
}
static enum bs_session_state complete(void) {
    uint32_t i;
    enum bs_session_state state = BS_SESSION_RUNNING;
    for (i = 0; i < 20000 && (state == BS_SESSION_RUNNING || state == BS_SESSION_WAITING); ++i)
        state = bs_session_step(&f.session);
    return state;
}
static int oracle(void *ctx, uint32_t frame, int32_t out[2]) {
    const struct fixture *p = (const struct fixture *)ctx;
    out[0] = value(frame, 0); out[1] = p->live.format.channels == 1 ? out[0] : value(frame, 1);
    return 0;
}
static int plan_same(const struct bs_plan *a, const struct bs_plan *b) {
    uint32_t i;
    if (a->count != b->count || a->bpm24 != b->bpm24 || a->end_needs_fade != b->end_needs_fade) return 0;
    for (i = 0; i < BS_MAX_SLICES; ++i)
        if (a->starts[i] != b->starts[i] || a->needs_fade[i] != b->needs_fade[i]) return 0;
    return 1;
}
static int previews(void) {
    uint32_t bits, channels, little, snap, tempo;
    for (bits = 16; bits <= 24; bits += 8) for (channels = 1; channels <= 2; ++channels)
    for (little = 0; little < 2; ++little) for (snap = 0; snap < 2; ++snap) for (tempo = 0; tempo < 2; ++tempo) {
        struct bs_preview_options options;
        struct bs_request request;
        struct bs_plan expected, actual;
        uint32_t starts[2];
        setup(); options.beats = 1; options.snap = snap; options.tempo_source = tempo;
        f.live.format.bits = bits; f.live.format.channels = channels; f.live.format.little_endian = little;
        starts[0] = 2000; starts[1] = 7000;
        request.sample_rate = 8000; request.trim_start = 0; request.trim_end = 10000;
        request.sample_bpm24 = 2880; request.project_bpm24 = 2160;
        request.beats = 1; request.snap = snap; request.tempo_source = tempo;
        request.existing_count = 2; request.existing = starts; request.read = oracle; request.context = &f;
        CHECK(bs_preview(&request, &expected) == BS_OK);
        CHECK(bs_session_begin(&f.session, &options) == BS_SESSION_RUNNING);
        CHECK(complete() == BS_SESSION_READY && bs_session_result(&f.session, &actual));
        CHECK(plan_same(&expected, &actual) && f.copies && f.locks == f.unlocks && !f.locked && !f.bad);
        CHECK(f.live.markers[0].end == 3000 && f.live.markers[1].loop == 0xffffffffu);
    }
    return 0;
}
static void mutate(uint32_t mode) {
    switch (mode) {
    case 0: ++f.live.owner_id; break;
    case 1: ++f.live.owner_generation; break;
    case 2: ++f.live.sample_id; break;
    case 3: ++f.live.sample_generation; break;
    case 4: ++f.live.editor_generation; break;
    case 5: f.live.kind = BS_SOURCE_STATIC; break;
    case 6: ++f.live.slot; break;
    case 7: ++f.live.frames; break;
    case 8: ++f.live.sample_rate; break;
    case 9: f.live.format.bits = 16; break;
    case 10: f.live.format.channels = 1; break;
    case 11: f.live.format.little_endian = 1; break;
    case 12: ++f.live.trim_start; break;
    case 13: --f.live.trim_end; break;
    case 14: f.live.loop = 0; break;
    case 15: ++f.live.sample_bpm24; break;
    case 16: ++f.live.playback_generation; break;
    case 17: --f.live.marker_count; break;
    case 18: ++f.live.markers[0].start; break;
    case 19: ++f.live.markers[0].end; break;
    case 20: ++f.live.markers[0].loop; break;
    default: bs_guard_invalidate(&f.guard); break;
    }
}
static int metadata(void) {
    uint32_t mode;
    struct bs_preview_options options = {1, 0, BS_SAMPLE_BPM};
    struct bs_plan out;
    for (mode = 0; mode < 22; ++mode) {
        setup(); CHECK(bs_session_begin(&f.session, &options) == BS_SESSION_RUNNING);
        CHECK(complete() == BS_SESSION_READY); mutate(mode); out.count = 123456;
        CHECK(!bs_session_result(&f.session, &out) && out.count == 123456);
        CHECK(f.session.state == BS_SESSION_STALE && f.locks == f.unlocks && !f.bad);
    }
    setup(); CHECK(bs_session_begin(&f.session, &options) == BS_SESSION_RUNNING);
    ++f.live.project_bpm24; CHECK(complete() == BS_SESSION_READY && bs_session_result(&f.session, &out));
    setup(); options.tempo_source = BS_PROJECT_BPM;
    CHECK(bs_session_begin(&f.session, &options) == BS_SESSION_RUNNING);
    ++f.live.sample_bpm24; CHECK(complete() == BS_SESSION_READY && bs_session_result(&f.session, &out));
    ++f.live.project_bpm24; CHECK(bs_session_step(&f.session) == BS_SESSION_STALE);
    return 0;
}
static int lifecycle(void) {
    struct bs_preview_options options = {1, 0, BS_SAMPLE_BPM};
    struct bs_plan out;
    uint32_t before, old, ticket, i;
    setup(); f.denied = 2;
    CHECK(bs_session_begin(&f.session, &options) == BS_SESSION_WAITING && !f.captures);
    CHECK(bs_session_step(&f.session) == BS_SESSION_WAITING && !f.captures);
    f.capture_pending = 1; CHECK(bs_session_step(&f.session) == BS_SESSION_WAITING);
    CHECK(bs_session_step(&f.session) == BS_SESSION_RUNNING);
    old = f.session.token.operation; f.copy_pending = 100;
    for (i = 0; i < 100 && !f.copies; ++i) (void)bs_session_step(&f.session);
    CHECK(f.copies == 1 && f.session.reader.waiting);
    before = f.captures; bs_session_cancel(&f.session);
    CHECK(bs_session_step(&f.session) == BS_SESSION_CANCELLED && f.captures == before);
    CHECK(!bs_session_result(&f.session, &out)); f.copy_pending = 0;
    CHECK(bs_session_begin(&f.session, &options) == BS_SESSION_RUNNING && f.session.token.operation > old);
    CHECK(complete() == BS_SESSION_READY); out.count = 123456; f.denied = 1;
    CHECK(!bs_session_result(&f.session, &out) && out.count == 123456);
    CHECK(bs_session_result(&f.session, &out) && f.locks == f.unlocks && !f.bad);
    setup(); ticket = bs_guard_writer_begin(&f.guard);
    CHECK(bs_session_begin(&f.session, &options) == BS_SESSION_WAITING && !f.captures);
    CHECK(bs_guard_writer_end(&f.guard, ticket)); CHECK(bs_session_step(&f.session) == BS_SESSION_RUNNING);
    ticket = bs_guard_writer_begin(&f.guard); before = f.copies;
    CHECK(bs_session_step(&f.session) == BS_SESSION_STALE && f.copies == before);
    CHECK(bs_guard_writer_end(&f.guard, ticket));
    CHECK(bs_session_begin(&f.session, &options) == BS_SESSION_RUNNING);
    bs_guard_revoke(&f.guard); CHECK(bs_session_step(&f.session) == BS_SESSION_STALE);
    setup(); f.pending_after_copy = 1;
    CHECK(bs_session_begin(&f.session, &options) == BS_SESSION_RUNNING);
    for (i = 0; i < 100 && !f.copies; ++i) (void)bs_session_step(&f.session);
    CHECK(f.copies == 1 && f.session.reader.waiting && !f.session.reader.cache_count);
    CHECK(complete() == BS_SESSION_READY && f.locks == f.unlocks && !f.bad);
    return 0;
}
static int failures(void) {
    struct bs_preview_options options = {1, 0, BS_SAMPLE_BPM};
    uint32_t mode;
    for (mode = 0; mode < 10; ++mode) {
        enum bs_session_state expected = BS_SESSION_FAILED;
        setup();
        if (mode < 4) f.malformed = mode+1;
        if (mode == 4) f.copy_error = 1;
        if (mode == 5) { f.copy_error = 2; expected = BS_SESSION_UNSUPPORTED; }
        if (mode == 6) { f.change_during_copy = 1; expected = BS_SESSION_STALE; }
        if (mode == 7) { f.invalidate_during_copy = 1; expected = BS_SESSION_STALE; }
        if (mode == 8) f.capture_error = 1;
        if (mode == 9) { f.capture_error = 2; expected = BS_SESSION_UNSUPPORTED; }
        (void)bs_session_begin(&f.session, &options);
        CHECK(complete() == expected && f.locks == f.unlocks && !f.locked && !f.bad);
        CHECK(!f.session.captured && !f.session.reader.cache_count);
    }
    for (mode = 0; mode < 6; ++mode) {
        setup();
        if (mode == 0) f.live.slot = 128;
        if (mode == 1) f.live.marker_count = 65;
        if (mode == 2) f.live.owner_generation = 0;
        if (mode == 3) f.live.format.bits = 8;
        if (mode == 4) f.live.trim_end = f.live.frames+1;
        if (mode == 5) f.live.sample_rate = 0;
        CHECK(bs_session_begin(&f.session, &options) == BS_SESSION_UNSUPPORTED && !f.copies && !f.bad);
    }
    setup(); options.beats = 3;
    CHECK(bs_session_begin(&f.session, &options) == BS_SESSION_FAILED && !f.locks);
    return 0;
}
static int unlocked_writers(void) {
    struct bs_preview_options options = {1, 0, BS_SAMPLE_BPM};
    struct bs_plan out;
    uint32_t mode, i;
    for (mode = 1; mode <= 9; ++mode) {
        enum bs_session_state state;
        setup(); f.on_unlock = mode;
        state = bs_session_begin(&f.session, &options);
        for (i = 0; i < 100 && !f.injected; ++i) state = bs_session_step(&f.session);
        CHECK(f.injected && !f.locked && !f.bad && f.locks == f.unlocks);
        if (mode <= 4) CHECK(!f.copies); /* A changed source must not be read. */
        if (mode == 5 || mode == 6) CHECK(f.copies == 1);
        if (mode == 7 || mode == 9) {
            CHECK(state == BS_SESSION_WAITING && !f.copies && f.session.reader.waiting);
            CHECK(complete() == BS_SESSION_READY && bs_session_result(&f.session, &out));
        } else if (mode == 8) {
            CHECK(complete() == BS_SESSION_READY && bs_session_result(&f.session, &out));
        } else {
            CHECK(complete() == BS_SESSION_STALE);
            out.count = 123456;
            CHECK(!bs_session_result(&f.session, &out) && out.count == 123456);
            CHECK(!f.session.captured && !f.session.reader.cache_count);
        }
        CHECK(!f.bad && !f.locked && f.locks == f.unlocks);
    }
    return 0;
}
int bs_session_selftest(void) {
    int error;
    error = previews(); if (error) return error;
    error = metadata(); if (error) return error;
    error = lifecycle(); if (error) return error;
    error = failures(); if (error) return error;
    return unlocked_writers();
}
