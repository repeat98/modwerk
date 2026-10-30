/* SPDX-License-Identifier: MIT */
#ifndef BEAT_SLICER_ENGINE_BOUNDARY_H
#define BEAT_SLICER_ENGINE_BOUNDARY_H
#include "preview_guard.h"
/* Proposed adaptation for the base-owned idle/job hook pair, not a module
 * hook or assigned ABI. Every call requires the same native writer lock.
 * Init once with a fresh guard, before admission; it revokes existing tokens.
 * Idle MUST run before any shared idle service may acquire a source. Job MUST
 * run after receive and before command dispatch, on every command path.
 * No function here enables admission or establishes non-engine coverage. */
struct bs_engine_boundary {
    struct bs_preview_guard *guard;
    uint32_t ticket, idle_seen, fault;
};
void bs_engine_boundary_init(struct bs_engine_boundary *, struct bs_preview_guard *);
void bs_engine_job_locked(struct bs_engine_boundary *);
void bs_engine_idle_locked(struct bs_engine_boundary *);
/* Engine-only quiescence, NOT permission to read or enable the source guard.
 * Recorder, UI, allocation, owner, cache and hardware-time proof is separate. */
int bs_engine_quiescent_locked(const struct bs_engine_boundary *);
#endif
