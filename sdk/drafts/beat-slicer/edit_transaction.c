/* SPDX-License-Identifier: MIT */
#include "edit_transaction.h"

static void snapshot_copy(struct bs_source_snapshot *a, const struct bs_source_snapshot *b) {
    uint32_t i;
#define COPY(f) a->f = b->f
    COPY(owner_id); COPY(owner_generation); COPY(sample_id); COPY(sample_generation);
    COPY(editor_generation); COPY(kind); COPY(slot); COPY(frames); COPY(sample_rate);
    COPY(format.bits); COPY(format.channels); COPY(format.little_endian);
    COPY(trim_start); COPY(trim_end); COPY(loop); COPY(sample_bpm24); COPY(project_bpm24);
    COPY(playback_generation); COPY(marker_count);
    for (i = 0; i < b->marker_count; ++i) {
        COPY(markers[i].start); COPY(markers[i].end); COPY(markers[i].loop);
    }
#undef COPY
}
static int metadata_equal(const struct bs_edit_transaction *t) {
    const struct bs_source_snapshot *a = &t->snapshot, *b = &t->observed;
#define SAME(f) if (a->f != b->f) return 0
    SAME(owner_id); SAME(owner_generation); SAME(sample_id); SAME(sample_generation);
    SAME(editor_generation); SAME(kind); SAME(slot); SAME(frames); SAME(sample_rate);
    SAME(format.bits); SAME(format.channels); SAME(format.little_endian);
    SAME(trim_start); SAME(trim_end); SAME(loop); SAME(playback_generation);
    if (t->tempo_source == BS_SAMPLE_BPM) { SAME(sample_bpm24); } else { SAME(project_bpm24); }
#undef SAME
    return 1;
}
static int active_equal(const struct bs_source_snapshot *s, const struct bs_marker_table *table) {
    uint32_t i;
    if (s->marker_count > BS_MAX_SLICES || s->marker_count != table->count) return 0;
    for (i = 0; i < s->marker_count; ++i)
        if (s->markers[i].start != table->records[i].start ||
            s->markers[i].end != table->records[i].end ||
            s->markers[i].loop != table->records[i].loop) return 0;
    return 1;
}
static enum bs_transaction_reply inspect(struct bs_edit_transaction *t, int after) {
    enum bs_provider_reply r;
    const struct bs_marker_table *table = after ? &t->edit.after : &t->edit.before;
    r = t->source_backend->capture(t->context, &t->observed);
    if (r == BS_PROVIDER_PENDING) return BS_TRANSACTION_WAIT;
    if (r != BS_PROVIDER_READY || !metadata_equal(t) || !active_equal(&t->observed, table))
        return BS_TRANSACTION_STALE;
    r = t->capture(t->context, &t->observed, &t->observed_table);
    if (r == BS_PROVIDER_PENDING) return BS_TRANSACTION_WAIT;
    if (r != BS_PROVIDER_READY || !(after ? bs_marker_matches_after(&t->edit, &t->observed_table) :
                                          bs_marker_matches_before(&t->edit, &t->observed_table)))
        return BS_TRANSACTION_STALE;
    /* A backend must actually serialize these reads. The second capture is a
     * consistency check, not a substitute for safe ownership or writer hooks.
     */
    r = t->source_backend->capture(t->context, &t->observed);
    if (r == BS_PROVIDER_PENDING) return BS_TRANSACTION_WAIT;
    return r == BS_PROVIDER_READY && metadata_equal(t) && active_equal(&t->observed, table) ?
        BS_TRANSACTION_OK : BS_TRANSACTION_STALE;
}
void bs_transaction_init(struct bs_edit_transaction *t) {
    t->state = BS_TRANSACTION_EMPTY; t->undo.operation = t->undo.revision = 0;
    t->guard = 0; t->source_backend = 0; t->backend = 0; t->capture = 0; t->context = 0;
}
int bs_transaction_forget(struct bs_edit_transaction *t) {
    if (!t || t->state == BS_TRANSACTION_ACTIVE || t->state == BS_TRANSACTION_FAULT) return 0;
    bs_transaction_init(t); return 1;
}
static enum bs_transaction_reply fault(struct bs_edit_transaction *t) {
    t->state = BS_TRANSACTION_FAULT; t->undo.operation = t->undo.revision = 0;
    bs_guard_revoke(t->guard);
    t->backend->quarantine(t->context);
    return BS_TRANSACTION_BROKEN;
}
static enum bs_transaction_reply exchange(struct bs_edit_transaction *t, int undo, int retain_history) {
    uint32_t ticket, revision;
    enum bs_exchange_reply reply;
    enum bs_transaction_reply check;
    if (!undo && retain_history && !bs_guard_acquire(t->guard, &t->undo)) return BS_TRANSACTION_REJECTED;
    ticket = bs_guard_writer_begin(t->guard);
    if (!ticket) {
        t->undo.operation = 0; t->state = BS_TRANSACTION_RETIRED;
        return BS_TRANSACTION_REJECTED;
    }
    revision = t->guard->revision;
    reply = t->backend->exchange(t->context, &t->snapshot,
        undo ? &t->edit.after : &t->edit.before, undo ? &t->edit.before : &t->edit.after);
    if (reply != BS_EXCHANGE_COMMITTED && reply != BS_EXCHANGE_UNCHANGED) {
        (void)bs_guard_writer_end(t->guard, ticket);
        return fault(t);
    }
    check = inspect(t, reply == BS_EXCHANGE_COMMITTED ? !undo : undo);
    if (!bs_guard_writer_end(t->guard, ticket) || t->guard->revision != revision ||
        !bs_guard_revision(t->guard) || check != BS_TRANSACTION_OK ||
        (reply != BS_EXCHANGE_COMMITTED && reply != BS_EXCHANGE_UNCHANGED)) return fault(t);
    if (reply == BS_EXCHANGE_UNCHANGED) {
        /* The old confirmation was consumed, even when a backend rolled back.
         * A failed Undo retains the exact journal with a newly issued token.
         */
        if (undo) {
            if (!bs_guard_acquire(t->guard, &t->undo)) {
                t->state = BS_TRANSACTION_RETIRED; return BS_TRANSACTION_NO_CHANGE;
            }
            t->state = BS_TRANSACTION_APPLIED;
        } else { t->state = BS_TRANSACTION_RETIRED; t->undo.operation = 0; }
        return BS_TRANSACTION_NO_CHANGE;
    }
    if (undo) { t->state = BS_TRANSACTION_UNDONE; t->undo.operation = 0; }
    else if (retain_history) {
        t->undo.revision = bs_guard_revision(t->guard);
        snapshot_copy(&t->snapshot, &t->observed);
        t->state = BS_TRANSACTION_APPLIED;
    } else t->state = BS_TRANSACTION_RETIRED;
    return BS_TRANSACTION_OK;
}
static enum bs_transaction_reply apply(struct bs_edit_transaction *t,
        struct bs_edit_candidate *c, uint32_t confirmed, const struct bs_transaction_backend *b,
        int retain_history) {
    enum bs_transaction_reply result;
    enum bs_provider_reply policy;
    struct bs_preview_session *s;
    if (!t || !c || !b || !b->policy || !b->exchange || !b->quarantine)
        return BS_TRANSACTION_REJECTED;
    if (t->state == BS_TRANSACTION_FAULT) return BS_TRANSACTION_BROKEN;
    if (t->state != BS_TRANSACTION_EMPTY) return BS_TRANSACTION_BUSY;
    if (!confirmed || confirmed != c->token.operation || !c->prepared ||
        (c->state != BS_CANDIDATE_READY && c->state != BS_CANDIDATE_WAITING))
        return BS_TRANSACTION_REJECTED;
    s = c->session;
    if (!s->backend->try_lock(s->context)) return BS_TRANSACTION_WAIT;
    t->state = BS_TRANSACTION_ACTIVE;
    t->guard = s->guard; t->source_backend = s->backend; t->backend = b;
    t->capture = c->capture; t->context = s->context; t->tempo_source = s->options.tempo_source;
    result = BS_TRANSACTION_STALE;
    if (!bs_candidate_result_locked(c, confirmed, &t->edit)) {
        if (c->state == BS_CANDIDATE_WAITING) result = BS_TRANSACTION_WAIT;
    } else if (!t->edit.added) result = BS_TRANSACTION_NO_CHANGE;
    else {
        snapshot_copy(&t->snapshot, &s->snapshot);
        policy = b->policy(t->context, &t->snapshot, &t->edit.after, &c->plan);
        if (policy != BS_PROVIDER_READY)
            result = policy == BS_PROVIDER_PENDING ? BS_TRANSACTION_WAIT : BS_TRANSACTION_REJECTED;
        else if (bs_candidate_result_locked(c, confirmed, &t->edit)) {
            result = exchange(t, 0, retain_history);
            bs_candidate_cancel(c);
        } else result = c->state == BS_CANDIDATE_WAITING ? BS_TRANSACTION_WAIT : BS_TRANSACTION_STALE;
    }
    if (t->state == BS_TRANSACTION_ACTIVE) t->state = BS_TRANSACTION_EMPTY;
    if (!retain_history && t->state != BS_TRANSACTION_FAULT) bs_transaction_init(t);
    s->backend->unlock(s->context);
    return result;
}
enum bs_transaction_reply bs_transaction_apply(struct bs_edit_transaction *t,
        struct bs_edit_candidate *c, uint32_t confirmed, const struct bs_transaction_backend *b) {
    return apply(t, c, confirmed, b, 1);
}
enum bs_transaction_reply bs_transaction_commit(struct bs_edit_transaction *t,
        struct bs_edit_candidate *c, uint32_t confirmed, const struct bs_transaction_backend *b) {
    return apply(t, c, confirmed, b, 0);
}
enum bs_transaction_reply bs_transaction_undo(struct bs_edit_transaction *t, uint32_t confirmed) {
    enum bs_transaction_reply result;
    enum bs_provider_reply policy;
    /* Undo's playback check has no new grid plan. A null plan explicitly asks
     * the backend to qualify restoring the stored old markers in this context.
     */
    if (!t) return BS_TRANSACTION_REJECTED;
    if (t->state == BS_TRANSACTION_FAULT) return BS_TRANSACTION_BROKEN;
    if (t->state == BS_TRANSACTION_ACTIVE) return BS_TRANSACTION_BUSY;
    if (t->state != BS_TRANSACTION_APPLIED || !confirmed || confirmed != t->undo.operation)
        return BS_TRANSACTION_REJECTED;
    if (!t->source_backend->try_lock(t->context)) return BS_TRANSACTION_WAIT;
    t->state = BS_TRANSACTION_ACTIVE;
    result = bs_guard_valid(t->guard, &t->undo) ? inspect(t, 1) : BS_TRANSACTION_STALE;
    if (result == BS_TRANSACTION_OK) {
        policy = t->backend->policy(t->context, &t->snapshot, &t->edit.before, 0);
        if (policy != BS_PROVIDER_READY)
            result = policy == BS_PROVIDER_PENDING ? BS_TRANSACTION_WAIT : BS_TRANSACTION_REJECTED;
        else {
            result = bs_guard_valid(t->guard, &t->undo) ? inspect(t, 1) : BS_TRANSACTION_STALE;
            if (result == BS_TRANSACTION_OK)
                result = bs_guard_valid(t->guard, &t->undo) ? exchange(t, 1, 1) : BS_TRANSACTION_STALE;
        }
    }
    if (t->state == BS_TRANSACTION_ACTIVE)
        t->state = result == BS_TRANSACTION_STALE ? BS_TRANSACTION_RETIRED : BS_TRANSACTION_APPLIED;
    t->source_backend->unlock(t->context);
    return result;
}
