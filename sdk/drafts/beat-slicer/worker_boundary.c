/* SPDX-License-Identifier: MIT */
#include "worker_boundary.h"

void *bs_worker_receive(struct bs_worker_boundary *b, void *queue) {
    uint32_t saved;
    void *message;
    if (!b || !b->guard || !b->receive || !b->lock || !b->unlock) return 0;
    saved = b->lock(b->context);
    /* A recursive/concurrent receive violates the single-consumer contract.
     * Preserve stock queue behavior, but never reopen preview admission.
     */
    if (b->receiving) b->fault = 1;
    if (b->ticket) {
        if (!bs_guard_writer_end(b->guard, b->ticket)) b->fault = 1;
        b->ticket = 0;
    }
    if (b->fault) bs_guard_revoke(b->guard);
    b->receiving = 1;
    b->unlock(b->context, saved);
    message = b->receive(queue);
    saved = b->lock(b->context);
    /* Even an unexpected null result invalidates the old preview. The stock
     * caller retains responsibility for handling its queue result.
     */
    if (!b->fault) {
        b->ticket = bs_guard_writer_begin(b->guard);
        if (!b->ticket) b->fault = 1;
    }
    if (b->fault) bs_guard_revoke(b->guard);
    b->receiving = 0;
    b->unlock(b->context, saved);
    return message;
}
