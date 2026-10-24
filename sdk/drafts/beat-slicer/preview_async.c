/* SPDX-License-Identifier: MIT */
#include "preview_async.h"
static int owner(const struct bs_preview_async *a, uint32_t id, uint32_t generation) {
    return a && id && generation && a->owner == id && a->generation == generation;
}
static int current(const struct bs_preview_async *a) {
    return !a->revoked && !a->fault && !a->cancel && a->active && a->active == a->desired;
}
static int lock(struct bs_preview_async *a) { return a->backend->try_lock(a->context); }
static void unlock(struct bs_preview_async *a) { a->backend->unlock(a->context); }
static int gate_lock(void *context) {
    struct bs_preview_async *a = context;
    if (a->held || !lock(a)) return 0;
    if (!current(a)) { unlock(a); return 0; }
    a->held = 1;
    return 1;
}
static void gate_unlock(void *context) {
    struct bs_preview_async *a = context;
    a->held = 0;
    unlock(a);
}
static enum bs_provider_reply gate_capture(void *context, struct bs_source_snapshot *out) {
    struct bs_preview_async *a = context;
    if (!a->held || !current(a)) return BS_PROVIDER_FAILED;
    enum bs_provider_reply reply = a->backend->capture(a->context, out);
    if (reply == BS_PROVIDER_READY && (out->owner_id != a->owner || out->owner_generation != a->generation))
        return BS_PROVIDER_UNSUPPORTED;
    return reply;
}
static enum bs_provider_reply gate_copy(void *context, const struct bs_source_snapshot *source,
    const struct bs_pcm_read *read, uint8_t *out, uint32_t capacity, uint32_t *bytes) {
    struct bs_preview_async *a = context;
    if (!a->held || !current(a)) return BS_PROVIDER_FAILED;
    return a->backend->copy_ready(a->context, source, read, out, capacity, bytes);
}
static const struct bs_preview_backend gated = {gate_lock, gate_unlock, gate_capture, gate_copy};
static void copy_options(struct bs_preview_options *out, const struct bs_preview_options *in) {
    out->beats = in->beats; out->snap = in->snap; out->tempo_source = in->tempo_source;
}
static int valid_options(const struct bs_preview_options *o) {
    return o && o->snap <= 1 && o->tempo_source <= BS_PROJECT_BPM &&
        (o->beats == 1 || o->beats == 4 || o->beats == 16 || o->beats == 32 || o->beats == 64);
}
static void copy_result(struct bs_async_result *out, const struct bs_async_result *in) {
    out->request = in->request; out->existing = in->existing;
    out->plan.count = in->plan.count; out->plan.bpm24 = in->plan.bpm24;
    for (uint32_t i=0; i<BS_MAX_SLICES; ++i) {
        out->plan.starts[i] = in->plan.starts[i];
        out->plan.needs_fade[i] = in->plan.needs_fade[i];
    }
    out->plan.end_needs_fade = in->plan.end_needs_fade;
}
int bs_async_init(struct bs_preview_async *a, struct bs_preview_guard *guard,
    const struct bs_preview_backend *backend, void *context, uint32_t id, uint32_t generation) {
    if (!a || !guard || !backend || !backend->try_lock || !backend->unlock ||
        !backend->capture || !backend->copy_ready || !id || !generation) return 0;
    a->backend = backend; a->context = context; a->guard = guard;
    a->owner = id; a->generation = generation;
    a->desired = a->active = a->cancel = a->revoked = a->fault = a->busy = a->held = 0;
    a->published_request = 0; a->published_state = BS_SESSION_IDLE;
    a->last_begin = a->last_steps = 0;
    a->published_token.operation = a->published_token.revision = 0;
    a->desired_options.beats = 1; a->desired_options.snap = a->desired_options.tempo_source = 0;
    bs_session_init(&a->session, guard, &gated, a);
    return 1;
}
static uint32_t advance(struct bs_preview_async *a) {
    a->published_request = 0;
    if (a->desired == UINT32_MAX) {
        a->fault = 1; a->published_state = BS_SESSION_FAILED;
        return 0;
    }
    return ++a->desired;
}
uint32_t bs_async_request(struct bs_preview_async *a, uint32_t id, uint32_t generation,
    const struct bs_preview_options *options) {
    if (!owner(a,id,generation) || !valid_options(options) || !lock(a)) return 0;
    uint32_t sequence = 0;
    if (!a->revoked && !a->fault) sequence = advance(a);
    if (sequence) {
        copy_options(&a->desired_options, options); a->cancel = 0;
        a->published_state = BS_SESSION_RUNNING;
    }
    unlock(a);
    return sequence;
}
uint32_t bs_async_cancel(struct bs_preview_async *a, uint32_t id, uint32_t generation) {
    if (!owner(a,id,generation) || !lock(a)) return 0;
    uint32_t sequence = 0;
    if (!a->revoked && !a->fault) sequence = advance(a);
    if (sequence) { a->cancel = 1; a->published_state = BS_SESSION_CANCELLED; }
    unlock(a);
    return sequence;
}
int bs_async_revoke(struct bs_preview_async *a, uint32_t id, uint32_t generation) {
    if (!owner(a,id,generation) || !lock(a)) return 0;
    a->revoked = a->cancel = 1; a->published_request = 0;
    a->published_state = BS_SESSION_CANCELLED;
    unlock(a);
    return 1;
}
uint32_t bs_async_service(struct bs_preview_async *a, uint32_t budget) {
    if (!a || !budget || budget > 8) return BS_SESSION_FAILED;
    /* Only the single engine consumer touches busy; UI producers never read it.
     * Refuse nested service calls without touching the outer session. */
    if (a->busy) return BS_SESSION_FAILED;
    a->busy = 1; a->last_begin = a->last_steps = 0;
    if (!lock(a)) { a->busy = 0; return BS_SESSION_WAITING; }
    uint32_t sequence = a->desired, starting = sequence != a->active;
    uint32_t cancelled = a->cancel || a->revoked || a->fault || !sequence;
    struct bs_preview_options options;
    copy_options(&options, &a->desired_options);
    if (starting) a->active = sequence;
    unlock(a);
    uint32_t state, count = 0;
    if (cancelled) { bs_session_cancel(&a->session); state = BS_SESSION_CANCELLED; }
    else {
        a->last_begin = starting;
        state = starting ? bs_session_begin(&a->session, &options) : a->session.state;
        while (count < budget && state == BS_SESSION_RUNNING) {
            state = bs_session_work(&a->session, BS_ASYNC_PRIVATE_STEPS); ++count; ++a->last_steps;
            if (state == BS_SESSION_WAITING) break;
        }
        if (state == BS_SESSION_READY) {
            if (gate_lock(a)) {
                if (bs_session_result_locked(&a->session, &a->staging.plan)) {
                    a->staging.request = sequence;
                    a->staging.existing = a->session.snapshot.marker_count;
                    copy_result(&a->published, &a->staging);
                    a->published_request = sequence;
                    a->published_token.operation = a->session.token.operation;
                    a->published_token.revision = a->session.token.revision;
                } else { a->published_request = 0; state = a->session.state == BS_SESSION_READY ? BS_SESSION_WAITING : a->session.state; }
                gate_unlock(a);
            } else state = BS_SESSION_WAITING;
        }
    }
    /* Publication can retry on the next ordinary engine/readiness event. The
     * single consumer releases its private reentry flag even on lock refusal. */
    if (!lock(a)) { a->busy = 0; return BS_SESSION_WAITING; }
    if (a->fault) state = BS_SESSION_FAILED;
    else if (a->revoked || a->cancel) state = BS_SESSION_CANCELLED;
    else if (a->desired != sequence) state = BS_SESSION_RUNNING;
    if (a->desired == sequence || a->fault || a->revoked) a->published_state = state;
    if (state != BS_SESSION_READY) a->published_request = 0;
    unlock(a);
    a->busy = 0;
    return state;
}
int bs_async_result(struct bs_preview_async *a, uint32_t id, uint32_t generation,
    uint32_t request, struct bs_async_result *out) {
    if (!out || !request || !owner(a,id,generation) || !lock(a)) return 0;
    int ready = current(a) && a->published_state == BS_SESSION_READY &&
        request == a->desired && request == a->published_request &&
        bs_guard_valid(a->guard, &a->published_token);
    if (ready) copy_result(out, &a->published);
    unlock(a);
    return ready;
}

uint32_t bs_async_state(struct bs_preview_async *a, uint32_t id, uint32_t generation,
    uint32_t request) {
    if (!request || !owner(a,id,generation)) return BS_SESSION_FAILED;
    if (!lock(a)) return BS_SESSION_WAITING;
    uint32_t state = a->published_state;
    if (a->fault) state = BS_SESSION_FAILED;
    else if (a->revoked) state = BS_SESSION_CANCELLED;
    else if (request != a->desired) state = BS_SESSION_STALE;
    else if (state == BS_SESSION_READY &&
             (a->published_request != request || !bs_guard_valid(a->guard,&a->published_token)))
        state = BS_SESSION_STALE;
    unlock(a);
    return state;
}
