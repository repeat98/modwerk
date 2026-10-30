/* SPDX-License-Identifier: MIT */
#ifndef BEAT_SLICER_RECORDER_BOUNDARY_H
#define BEAT_SLICER_RECORDER_BOUNDARY_H
#include "preview_guard.h"
#define BS_RECORDER_DEPTH 8u
/* Private base-owned proposal; no production detour, source ABI or admission.
 * Call under the same verified native lock used by ALL source users. Sample
 * both banks under that lock. Every entry (even idle) has a matching leave
 * with the original caller SP. State 0 is inactive, 1 pending, 2 active or
 * retained. Only an inactive selected bank plus an inactive/retained other
 * bank can avoid invalidation. Unknown state fails closed for this lifetime.
 * These observations do not prove Pickup, DMA, other writers or cache safety.
 * A fault is terminal: do not reinitialize or re-enable this lifetime. Stock
 * must still execute and return normally, including after bookkeeping fails.
 */
struct bs_recorder_frame { uint32_t caller_sp, ticket; };
struct bs_recorder_boundary {
    struct bs_preview_guard *guard;
    uint32_t depth, fault;
    struct bs_recorder_frame frames[BS_RECORDER_DEPTH];
};
void bs_recorder_boundary_init(struct bs_recorder_boundary *, struct bs_preview_guard *);
void bs_recorder_enter_locked(struct bs_recorder_boundary *, uint32_t caller_sp,
                              uint32_t track, uint32_t selected, uint32_t other);
/* Whole preparation call: always a writer, independent of current bank state. */
void bs_recorder_prepare_locked(struct bs_recorder_boundary *, uint32_t caller_sp, uint32_t track);
void bs_recorder_leave_locked(struct bs_recorder_boundary *, uint32_t caller_sp);
int bs_recorder_quiescent_locked(const struct bs_recorder_boundary *);
#endif
