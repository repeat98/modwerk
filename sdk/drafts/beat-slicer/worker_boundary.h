/* SPDX-License-Identifier: MIT */
#ifndef BEAT_SLICER_WORKER_BOUNDARY_H
#define BEAT_SLICER_WORKER_BOUNDARY_H
#include "preview_guard.h"

/* Research for a BASE-OWNED single-consumer worker boundary, NOT an admitted
 * hook. The caller proves that all command paths return through this receive,
 * that lock serializes guard users, and that the binding outlives the worker.
 * Other tasks/interrupt writers require their own coverage. Never enable live
 * source admission merely because this observer is installed.
 */
struct bs_worker_boundary {
    struct bs_preview_guard *guard;
    void *(*receive)(void *queue);
    uint32_t (*lock)(void *context);
    void (*unlock)(void *context, uint32_t saved);
    void *context;
    uint32_t ticket, receiving, fault;
};
/* Initialize storage to zero once, then bind callbacks before the worker runs.
 * Not a reset/removal API. An outstanding ticket survives revoke and remains
 * until the next verified receive boundary. A stopped/crashed worker stays
 * excluded; no timeout or optional UI notification retires it.
 * Queue waiting runs UNLOCKED. The previous command is retired before waiting;
 * the next command is tracked before its pointer reaches the dispatcher.
 * A valid receive callback is mandatory. Malformed binding returns zero without
 * accessing a guard whose lock may be missing; installation must reject it
 * before stock can call. Bindings are immutable while the worker can run.
 */
void *bs_worker_receive(struct bs_worker_boundary *, void *queue);
#endif
