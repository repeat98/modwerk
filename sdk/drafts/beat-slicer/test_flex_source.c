/* SPDX-License-Identifier: MIT */
#include "test_flex_fixture.h"
#include "flex_source.h"
struct source_fixture {
    struct bs_flex_metadata_binding metadata;
    struct bs_source_lifetime id;
    struct bs_flex_source source;
    struct bs_preview_guard guard;
    struct bs_preview_session session;
    uint32_t settings[128*274], before[274], kind, slot, tempo;
    uint32_t locked, locks, unlocks, denied, bad;
};
static struct source_fixture sf;
static int source_lock(void *context) {
    struct source_fixture *p = context;
    if (p->locked) { p->bad = __LINE__; return 0; }
    if (p->denied) { --p->denied; return 0; }
    p->locked = 1; ++p->locks;
    return 1;
}
static void source_unlock(void *context) {
    struct source_fixture *p = context;
    if (!p->locked) p->bad = __LINE__;
    p->locked = 0; ++p->unlocks;
}
static void source_setup(uint32_t format, uint32_t slot) {
    setup(format, slot); clear(&sf, sizeof(sf));
    sf.metadata.ready = f.binding.ready; sf.metadata.controls = f.binding.controls;
    sf.metadata.control_words = 128*11;
    sf.metadata.settings = sf.settings; sf.metadata.setting_words = 128*274;
    sf.kind = 1; sf.slot = slot; sf.tempo = 2160;
    sf.metadata.editor_kind = &sf.kind; sf.metadata.editor_slot = &sf.slot;
    sf.metadata.project_bpm24 = &sf.tempo;
    sf.id.owner_id = 1; sf.id.owner_generation = 2;
    sf.id.sample_id = 3; sf.id.sample_generation = 4;
    sf.id.editor_generation = 5; sf.id.playback_generation = 6; sf.id.slot = slot;
    sf.source.metadata = &sf.metadata; sf.source.pcm = &f.binding; sf.source.identity = &sf.id;
    sf.source.try_lock = source_lock; sf.source.unlock = source_unlock; sf.source.context = &sf;
    uint32_t *s = sf.settings+274*slot;
    for (uint32_t i=0; i<274; ++i) s[i] = 1000+i;
    s[69] = 2880;
    s[75] = PAGE/(f.source.format.bits/8*f.source.format.channels)-1;
    s[76] = f.source.frames; s[77] = UINT32_MAX; s[273] = 0;
    for (uint32_t i=0; i<274; ++i) sf.before[i] = s[i];
    bs_guard_init(&sf.guard); (void)bs_guard_enable(&sf.guard);
    bs_session_init(&sf.session, &sf.guard, &bs_flex_source_backend, &sf.source);
}
static int source_oracle(void *context, uint32_t frame, int32_t out[2]) {
    uint8_t packed[6];
    (void)context;
    for (uint32_t i=0; i<6; ++i) packed[i] = value(frame, i);
    return bs_pcm_decode(&f.source.format, packed, 6, out) ? 0 : -1;
}
static enum bs_session_state source_complete(void) {
    enum bs_session_state state = BS_SESSION_RUNNING;
    for (uint32_t i=0; i<30000 && (state == BS_SESSION_RUNNING || state == BS_SESSION_WAITING); ++i)
        state = bs_session_step(&sf.session);
    return state;
}
int bs_source_selftest(void) {
    struct bs_preview_options options = {1, 0, BS_SAMPLE_BPM};
    struct bs_plan expected, actual;
    struct bs_marker_table table;
    for (uint32_t format=0; format<4; ++format)
    for (uint32_t slot=0; slot<=127; slot+=127)
    for (uint32_t snap=0; snap<2; ++snap)
    for (uint32_t tempo=0; tempo<2; ++tempo) {
        source_setup(format, slot);
        uint32_t *s = sf.settings+274*slot;
        struct bs_request request = {44100, s[75], s[76], s[69], sf.tempo, 1, tempo,
                                     0, 0, snap, source_oracle, 0};
        CHECK(bs_preview(&request, &expected) == BS_OK);
        options.snap = snap; options.tempo_source = tempo;
        CHECK(bs_session_begin(&sf.session, &options) == BS_SESSION_RUNNING);
        CHECK(source_complete() == BS_SESSION_READY && bs_session_result(&sf.session, &actual));
        CHECK(actual.count == expected.count && actual.bpm24 == expected.bpm24 &&
              actual.end_needs_fade == expected.end_needs_fade);
        for (uint32_t i=0; i<64; ++i)
            CHECK(actual.starts[i] == expected.starts[i] && actual.needs_fade[i] == expected.needs_fade[i]);
        CHECK(f.queries >= 2 && !sf.bad && !sf.locked && !sf.source.held && sf.locks == sf.unlocks);
        CHECK(bs_flex_source_backend.try_lock(&sf.source));
        CHECK(!bs_flex_source_backend.try_lock(&sf.source)); /* no recursive native lock */
        CHECK(bs_flex_source_markers_locked(&sf.source, &sf.session.snapshot, &table) == BS_PROVIDER_READY);
        CHECK(!table.count);
        for (uint32_t i=0; i<64; ++i) {
            CHECK(table.records[i].start == s[78+3*i]);
            CHECK(table.records[i].end == s[79+3*i] && table.records[i].loop == s[80+3*i]);
        }
        bs_flex_source_backend.unlock(&sf.source);
        for (uint32_t i=0; i<274; ++i) CHECK(s[i] == sf.before[i]);
        uint32_t width=f.source.format.bits/8*f.source.format.channels, per=PAGE/width;
        for (uint32_t frame=0; frame<f.source.frames; ++frame)
            for (uint32_t byte=0; byte<width; ++byte)
                CHECK(f.binding.pool[f.pages[frame/per]*PAGE+(frame%per)*width+byte] == value(frame,byte));
    }
    options.snap = 0; options.tempo_source = BS_SAMPLE_BPM;
    for (uint32_t mode=0; mode<10; ++mode) {
        source_setup(3, 0);
        CHECK(bs_session_begin(&sf.session, &options) == BS_SESSION_RUNNING);
        if (mode == 0) ++sf.id.owner_generation;
        if (mode == 1) ++sf.id.sample_generation;
        if (mode == 2) ++sf.id.editor_generation;
        if (mode == 3) ++sf.id.playback_generation;
        if (mode == 4) sf.kind = 0;
        if (mode == 5) sf.slot = 1;
        if (mode == 6) sf.metadata.ready = &sf.kind; /* mismatched readable binding */
        if (mode == 7) sf.metadata.controls = sf.settings;
        if (mode == 8) sf.metadata.setting_words = 273;
        if (mode == 9) bs_guard_invalidate(&sf.guard);
        enum bs_session_state end = source_complete();
        CHECK(end == (mode <= 3 || mode == 9 ? BS_SESSION_STALE : BS_SESSION_UNSUPPORTED));
        CHECK(!f.queries && !sf.bad && sf.locks == sf.unlocks);
    }
    source_setup(3, 0); sf.denied = 1;
    CHECK(bs_session_begin(&sf.session, &options) == BS_SESSION_WAITING && !sf.locks);
    CHECK(source_complete() == BS_SESSION_READY);
    table.count = 123456;
    CHECK(bs_flex_source_markers_locked(&sf.source, &sf.session.snapshot, &table) == BS_PROVIDER_FAILED);
    CHECK(table.count == 123456 && bs_flex_source_backend.try_lock(&sf.source));
    ++sf.id.sample_generation;
    CHECK(bs_flex_source_markers_locked(&sf.source, &sf.session.snapshot, &table) == BS_PROVIDER_UNSUPPORTED);
    CHECK(table.count == 123456);
    bs_flex_source_backend.unlock(&sf.source);
    return sf.bad;
}
