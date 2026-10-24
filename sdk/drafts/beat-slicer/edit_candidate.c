/* SPDX-License-Identifier: MIT */
#include "edit_candidate.h"
void bs_candidate_init(struct bs_edit_candidate *c) {
    c->session = 0; c->capture = 0; c->preview.operation = c->preview.revision = 0;
    c->token.operation = c->token.revision = 0;
    c->state = BS_CANDIDATE_EMPTY; c->marker_status = BS_MARKERS_INVALID; c->prepared = 0;
}
void bs_candidate_cancel(struct bs_edit_candidate *c) {
    c->state = BS_CANDIDATE_CANCELLED; c->prepared = 0;
}
static enum bs_candidate_state state(struct bs_edit_candidate *c, uint32_t value) {
    c->state = value;
    if (value != BS_CANDIDATE_READY && value != BS_CANDIDATE_WAITING) c->prepared = 0;
    return (enum bs_candidate_state)value;
}
static int same_preview(const struct bs_edit_candidate *c) {
    const struct bs_preview_session *s = c->session;
    return s->state == BS_SESSION_READY && s->captured &&
        s->token.operation == c->preview.operation && s->token.revision == c->preview.revision &&
        bs_guard_valid(s->guard, &c->preview);
}
static enum bs_candidate_state result_locked(struct bs_edit_candidate *c) {
    if (!same_preview(c)) return state(c, BS_CANDIDATE_STALE);
    if (!bs_session_result_locked(c->session, &c->plan))
        return state(c, same_preview(c) ? BS_CANDIDATE_WAITING : BS_CANDIDATE_STALE);
    return BS_CANDIDATE_READY;
}
static enum bs_candidate_state capture_locked(struct bs_edit_candidate *c) {
    uint32_t i;
    const struct bs_source_snapshot *v = &c->session->snapshot;
    enum bs_provider_reply reply = c->capture(c->session->context, v, &c->observed);
    if (!same_preview(c) || !bs_guard_valid(c->session->guard, &c->token))
        return state(c, BS_CANDIDATE_STALE);
    if (reply == BS_PROVIDER_PENDING) return state(c, BS_CANDIDATE_WAITING);
    if (reply != BS_PROVIDER_READY) return state(c, BS_CANDIDATE_FAILED);
    if (c->observed.count != v->marker_count) return state(c, BS_CANDIDATE_STALE);
    for (i = 0; i < v->marker_count; ++i) {
        const struct bs_marker_record *a = &c->observed.records[i], *b = &v->markers[i];
        if (a->start != b->start || a->end != b->end || a->loop != b->loop)
            return state(c, BS_CANDIDATE_STALE);
    }
    return BS_CANDIDATE_READY;
}
static enum bs_candidate_state step_locked(struct bs_edit_candidate *c) {
    const struct bs_source_snapshot *v = &c->session->snapshot;
    enum bs_candidate_state r;
    r = result_locked(c); if (r != BS_CANDIDATE_READY) return r;
    if (!c->token.operation && !bs_guard_acquire(c->session->guard, &c->token))
        return state(c, BS_CANDIDATE_FAILED);
    if (!bs_guard_valid(c->session->guard, &c->token)) return state(c, BS_CANDIDATE_STALE);
    r = capture_locked(c); if (r != BS_CANDIDATE_READY) return r;
    if (!c->prepared) {
        c->marker_status = bs_marker_prepare(&c->observed, &c->plan,
            v->frames, v->trim_start, v->trim_end, &c->edit);
        if (c->marker_status != BS_MARKERS_OK) return state(c, BS_CANDIDATE_REFUSED);
        /* Capture again before exposing a candidate. Private preparation can
         * be retried after PENDING; no native publication has taken place.
         */
        r = result_locked(c); if (r != BS_CANDIDATE_READY) return r;
        r = capture_locked(c); if (r != BS_CANDIDATE_READY) return r;
    }
    if (!bs_marker_matches_before(&c->edit, &c->observed)) return state(c, BS_CANDIDATE_STALE);
    r = result_locked(c); if (r != BS_CANDIDATE_READY) return r;
    c->prepared = 1;
    return state(c, BS_CANDIDATE_READY);
}
enum bs_candidate_state bs_candidate_step(struct bs_edit_candidate *c) {
    enum bs_candidate_state r;
    if (c->state != BS_CANDIDATE_READY && c->state != BS_CANDIDATE_WAITING)
        return (enum bs_candidate_state)c->state;
    if (!c->session->backend->try_lock(c->session->context)) return state(c, BS_CANDIDATE_WAITING);
    r = step_locked(c);
    c->session->backend->unlock(c->session->context);
    return r;
}
enum bs_candidate_state bs_candidate_begin(struct bs_edit_candidate *c,
        struct bs_preview_session *s, bs_capture_markers capture) {
    bs_candidate_init(c);
    if (!s || !capture || s->state != BS_SESSION_READY || !s->captured)
        return state(c, BS_CANDIDATE_FAILED);
    c->session = s; c->capture = capture;
    c->preview.operation = s->token.operation; c->preview.revision = s->token.revision;
    c->state = BS_CANDIDATE_WAITING;
    return bs_candidate_step(c);
}
int bs_candidate_result_locked(struct bs_edit_candidate *c, uint32_t id, struct bs_marker_edit *out) {
    uint32_t i;
    if (!c || !out || !id || id != c->token.operation || !c->prepared ||
        (c->state != BS_CANDIDATE_READY && c->state != BS_CANDIDATE_WAITING)) return 0;
    if (step_locked(c) != BS_CANDIDATE_READY) return 0;
    out->frames = c->edit.frames; out->trim_start = c->edit.trim_start;
    out->trim_end = c->edit.trim_end; out->added = c->edit.added;
    out->before.count = c->edit.before.count; out->after.count = c->edit.after.count;
    for (i = 0; i < BS_MAX_SLICES; ++i) {
        out->before.records[i].start = c->edit.before.records[i].start;
        out->before.records[i].end = c->edit.before.records[i].end;
        out->before.records[i].loop = c->edit.before.records[i].loop;
        out->after.records[i].start = c->edit.after.records[i].start;
        out->after.records[i].end = c->edit.after.records[i].end;
        out->after.records[i].loop = c->edit.after.records[i].loop;
    }
    return 1;
}
int bs_candidate_result(struct bs_edit_candidate *c, uint32_t id, struct bs_marker_edit *out) {
    int ready;
    if (!c || !out || !id || id != c->token.operation || !c->prepared ||
        (c->state != BS_CANDIDATE_READY && c->state != BS_CANDIDATE_WAITING)) return 0;
    if (!c->session->backend->try_lock(c->session->context)) {
        (void)state(c, BS_CANDIDATE_WAITING); return 0;
    }
    ready = bs_candidate_result_locked(c, id, out);
    c->session->backend->unlock(c->session->context);
    return ready;
}
