/* SPDX-License-Identifier: MIT */
#include "preview_session.h"

static enum bs_session_state finish(struct bs_preview_session *s, uint32_t state) {
    if (s->captured) bs_reader_cancel(&s->reader);
    s->captured = 0;
    s->state = state;
    return (enum bs_session_state)state;
}
void bs_session_init(struct bs_preview_session *s, struct bs_preview_guard *guard,
                     const struct bs_preview_backend *backend, void *context) {
    s->guard = guard; s->backend = backend; s->context = context;
    s->token.operation = 0; s->token.revision = 0;
    s->state = BS_SESSION_IDLE; s->captured = 0;
    s->options.beats = 1; s->options.snap = 0; s->options.tempo_source = BS_SAMPLE_BPM;
}
void bs_session_cancel(struct bs_preview_session *s) { (void)finish(s, BS_SESSION_CANCELLED); }
static int usable(const struct bs_source_snapshot *v) {
    return v->owner_id && v->owner_generation && v->sample_id && v->sample_generation &&
        v->editor_generation && v->playback_generation && v->kind <= BS_SOURCE_STATIC && v->slot < 128 &&
        v->frames && v->trim_start < v->trim_end && v->trim_end <= v->frames &&
        v->sample_rate >= 8000 && v->sample_rate <= 192000 && v->marker_count <= BS_MAX_SLICES &&
        (v->format.bits == 16 || v->format.bits == 24) &&
        (v->format.channels == 1 || v->format.channels == 2) && v->format.little_endian <= 1;
}
static int same(const struct bs_source_snapshot *a, const struct bs_source_snapshot *b,
                uint32_t source) {
    uint32_t i;
#define SAME(field) if (a->field != b->field) return 0
    SAME(owner_id); SAME(owner_generation); SAME(sample_id); SAME(sample_generation);
    SAME(editor_generation); SAME(kind); SAME(slot); SAME(frames); SAME(sample_rate);
    SAME(format.bits); SAME(format.channels); SAME(format.little_endian);
    SAME(trim_start); SAME(trim_end); SAME(loop); SAME(playback_generation); SAME(marker_count);
    if (source == BS_SAMPLE_BPM) { SAME(sample_bpm24); } else { SAME(project_bpm24); }
    for (i = 0; i < a->marker_count; ++i) {
        SAME(markers[i].start); SAME(markers[i].end); SAME(markers[i].loop);
    }
#undef SAME
    return 1;
}
static void copy_snapshot(struct bs_source_snapshot *a, const struct bs_source_snapshot *b) {
    uint32_t i;
#define COPY(field) a->field = b->field
    COPY(owner_id); COPY(owner_generation); COPY(sample_id); COPY(sample_generation);
    COPY(editor_generation); COPY(kind); COPY(slot); COPY(frames); COPY(sample_rate);
    COPY(format.bits); COPY(format.channels); COPY(format.little_endian);
    COPY(trim_start); COPY(trim_end); COPY(loop); COPY(playback_generation);
    COPY(sample_bpm24); COPY(project_bpm24); COPY(marker_count);
    for (i = 0; i < b->marker_count; ++i) {
        COPY(markers[i].start); COPY(markers[i].end); COPY(markers[i].loop);
    }
#undef COPY
}
static enum bs_session_state capture_reply(struct bs_preview_session *s, enum bs_provider_reply reply) {
    if (!bs_guard_valid(s->guard, &s->token)) return finish(s, BS_SESSION_STALE);
    if (reply == BS_PROVIDER_PENDING) return BS_SESSION_WAITING;
    if (reply == BS_PROVIDER_UNSUPPORTED) return finish(s, BS_SESSION_UNSUPPORTED);
    if (reply != BS_PROVIDER_READY) return finish(s, BS_SESSION_FAILED);
    if (!usable(&s->observed)) return finish(s, BS_SESSION_UNSUPPORTED);
    return BS_SESSION_RUNNING;
}
/* Caller holds backend ownership throughout capture/validation and copying. */
static enum bs_session_state revalidate(struct bs_preview_session *s) {
    enum bs_session_state state;
    enum bs_provider_reply reply;
    if (!bs_guard_valid(s->guard, &s->token)) return finish(s, BS_SESSION_STALE);
    reply = s->backend->capture(s->context, &s->observed);
    state = capture_reply(s, reply);
    if (state != BS_SESSION_RUNNING) return state;
    if (!same(&s->snapshot, &s->observed, s->options.tempo_source)) return finish(s, BS_SESSION_STALE);
    return BS_SESSION_RUNNING;
}
static enum bs_session_state start_locked(struct bs_preview_session *s) {
    enum bs_provider_reply reply;
    if (!bs_guard_acquire(s->guard, &s->token)) return BS_SESSION_WAITING;
    reply = s->backend->capture(s->context, &s->observed);
    return capture_reply(s, reply);
}
/* All inputs below are session-owned copies. No native source lock is needed
 * for planner initialization or arithmetic; result/copy access revalidates. */
static enum bs_session_state start_reader(struct bs_preview_session *s) {
    struct bs_request request;
    struct bs_pcm_source source;
    uint32_t i;
    copy_snapshot(&s->snapshot, &s->observed);
    for (i = 0; i < s->snapshot.marker_count; ++i) s->starts[i] = s->snapshot.markers[i].start;
    request.sample_rate = s->snapshot.sample_rate;
    request.trim_start = s->snapshot.trim_start; request.trim_end = s->snapshot.trim_end;
    request.sample_bpm24 = s->snapshot.sample_bpm24; request.project_bpm24 = s->snapshot.project_bpm24;
    request.beats = s->options.beats; request.snap = s->options.snap;
    request.tempo_source = s->options.tempo_source;
    request.existing_count = s->snapshot.marker_count; request.existing = s->starts;
    request.read = 0; request.context = 0;
    source.operation = s->token.operation; source.revision = s->token.revision;
    source.frames = s->snapshot.frames;
    source.format.bits = s->snapshot.format.bits; source.format.channels = s->snapshot.format.channels;
    source.format.little_endian = s->snapshot.format.little_endian;
    s->captured = 1;
    if (bs_reader_begin(&s->reader, &request, &source) != BS_READER_RUNNING)
        return finish(s, BS_SESSION_FAILED);
    return BS_SESSION_RUNNING;
}
static enum bs_session_state copy_locked(struct bs_preview_session *s, uint32_t *bytes) {
    enum bs_session_state state;
    enum bs_provider_reply reply;
    /* The planner ran unlocked. Revalidate again before touching live PCM,
     * even when the first validation in this step was successful. */
    state = revalidate(s);
    if (state != BS_SESSION_RUNNING) return state;
    reply = s->backend->copy_ready(s->context, &s->snapshot, &s->reader.pending,
                                  s->packed, BS_SESSION_BYTES, bytes);
    state = revalidate(s);
    if (state != BS_SESSION_RUNNING) return state;
    if (reply == BS_PROVIDER_PENDING) return BS_SESSION_WAITING;
    if (reply == BS_PROVIDER_UNSUPPORTED) return finish(s, BS_SESSION_UNSUPPORTED);
    if (reply != BS_PROVIDER_READY || *bytes > BS_SESSION_BYTES) return finish(s, BS_SESSION_FAILED);
    return BS_SESSION_RUNNING;
}
enum bs_session_state bs_session_work(struct bs_preview_session *s, uint32_t private_steps) {
    enum bs_session_state state;
    enum bs_reader_state reader;
    uint32_t bytes = 0, starting;
    if (!s || !private_steps || private_steps > BS_SESSION_WORK_MAX) return BS_SESSION_FAILED;
    if (s->state != BS_SESSION_RUNNING && s->state != BS_SESSION_READY)
        return (enum bs_session_state)s->state;
    if (!s->guard || !s->backend || !s->backend->try_lock || !s->backend->unlock ||
        !s->backend->capture || !s->backend->copy_ready) return finish(s, BS_SESSION_FAILED);
    if (!s->backend->try_lock(s->context)) return BS_SESSION_WAITING;
    starting = !s->captured;
    state = starting ? start_locked(s) : revalidate(s);
    s->backend->unlock(s->context);
    if (state != BS_SESSION_RUNNING) return state;
    if (starting) return start_reader(s);
    /* Only session-owned state is touched by this bounded batch. Stop at the
     * first live-read request; reacquisition below validates before any copy.
     * A cancellation may leave bounded private work to finish, never a read. */
    reader = BS_READER_RUNNING;
    for (uint32_t i = 0; i < private_steps && reader == BS_READER_RUNNING; ++i)
        reader = bs_reader_step(&s->reader, s->token.revision);
    if (reader == BS_READER_DONE) { s->state = BS_SESSION_READY; return BS_SESSION_READY; }
    if (reader == BS_READER_RUNNING) return BS_SESSION_RUNNING;
    if (reader != BS_READER_NEED_BLOCK) return finish(s, BS_SESSION_FAILED);
    if (!s->backend->try_lock(s->context)) return BS_SESSION_WAITING;
    state = copy_locked(s, &bytes);
    s->backend->unlock(s->context);
    if (state != BS_SESSION_RUNNING) return state;
    /* Decode only the owned packed block, after releasing native ownership.
     * A writer starting now retires the token; the next step/result refuses it.
     * No callbacks or concurrent callers may reenter/mutate this session. */
    if (!bs_reader_supply(&s->reader, &s->reader.pending, s->packed, bytes, 0) ||
        s->reader.job.state == BS_JOB_FAILED) return finish(s, BS_SESSION_FAILED);
    return BS_SESSION_RUNNING;
}
enum bs_session_state bs_session_step(struct bs_preview_session *s) {
    return bs_session_work(s, 1);
}
enum bs_session_state bs_session_begin(struct bs_preview_session *s, const struct bs_preview_options *options) {
    (void)finish(s, BS_SESSION_CANCELLED);
    if (!options || options->tempo_source > BS_PROJECT_BPM || options->snap > 1 ||
        (options->beats != 1 && options->beats != 2 && options->beats != 4 && options->beats != 16 &&
         options->beats != 32 && options->beats != 64)) return finish(s, BS_SESSION_FAILED);
    s->options.beats = options->beats; s->options.snap = options->snap;
    s->options.tempo_source = options->tempo_source;
    s->state = BS_SESSION_RUNNING;
    return bs_session_step(s);
}
int bs_session_result_locked(struct bs_preview_session *s, struct bs_plan *out) {
    enum bs_session_state state;
    if (!s || !out || s->state != BS_SESSION_READY || !s->captured) return 0;
    state = revalidate(s);
    return state == BS_SESSION_RUNNING && bs_reader_result(&s->reader, s->token.revision, out);
}
int bs_session_result(struct bs_preview_session *s, struct bs_plan *out) {
    int result;
    if (!s || !out || s->state != BS_SESSION_READY || !s->captured) return 0;
    if (!s->backend->try_lock(s->context)) return 0;
    result = bs_session_result_locked(s, out);
    s->backend->unlock(s->context);
    return result;
}
