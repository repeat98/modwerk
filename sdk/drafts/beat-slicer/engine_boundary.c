/* SPDX-License-Identifier: MIT */
#include "engine_boundary.h"
static void failed(struct bs_engine_boundary *b) {
    b->fault = 1;
    bs_guard_revoke(b->guard);
}
void bs_engine_boundary_init(struct bs_engine_boundary *b, struct bs_preview_guard *g) {
    if (!b) return;
    b->guard = g; b->ticket = b->idle_seen = 0; b->fault = !g;
    bs_guard_revoke(g);
}
void bs_engine_job_locked(struct bs_engine_boundary *b) {
    if (!b) return;
    if (!b->guard || b->fault || b->ticket) { failed(b); return; }
    /* A hook installed during an older receive/command cannot admit readers
     * until an actual idle boundary has been observed. Still track this job. */
    if (!b->idle_seen) bs_guard_revoke(b->guard);
    b->ticket = bs_guard_writer_begin(b->guard);
    if (!b->ticket) failed(b);
}
void bs_engine_idle_locked(struct bs_engine_boundary *b) {
    if (!b) return;
    if (!b->guard) { failed(b); return; }
    if (b->ticket && !bs_guard_writer_end(b->guard, b->ticket)) failed(b);
    b->ticket = 0;
    b->idle_seen = 1;
    if (b->fault) bs_guard_revoke(b->guard);
}
int bs_engine_quiescent_locked(const struct bs_engine_boundary *b) {
    return b && b->guard && b->idle_seen && !b->ticket && !b->fault && !b->guard->poisoned;
}
