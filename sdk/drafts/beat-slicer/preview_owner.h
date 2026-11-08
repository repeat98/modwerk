/* SPDX-License-Identifier: MIT */
#ifndef BS_PREVIEW_OWNER_H
#define BS_PREVIEW_OWNER_H
#include "menu_owner.h"
#include "preview_async.h"
#define BS_PREVIEW_OWNER_BINDINGS 4u
/* Proposed base-side association, not an exported source or loader ABI.
 * Registration and leases are base-owned. The initialized exchange and its
 * backend code/context must remain admitted and pinned until every queued/native
 * reference has retired. Tests keep them in the resident fixture; production
 * needs an independent package and reviewed handles, not module-specific
 * controller/planner code built into the base. No pointer admission is supplied.
 * Do not reset or reroute old intents into another activation's storage.
 * Hold the loader's stable lock across this operation and later publication.
 * The exchange's nonblocking source boundary must be safe to acquire within
 * that lock, without waiting, reentering the loader or mutating registrations;
 * this helper neither establishes nor widens native lock coverage. */
struct bs_preview_owner_binding {
    struct bs_menu_owner_lease *lease;
    struct bs_preview_async *preview;
};
/* Compose BEFORE menu activation retirement and all publication writes.
 * PREPARE and same-image switches do nothing. SWITCH cancels only exchanges
 * belonging to the exact outgoing owner through their normal public API.
 * Failure refuses publication. Earlier exchanges may already be cancelled if
 * a later source lock refuses; fresh activations are then required. No waits,
 * source capture/copy, engine-session mutation or callback reclamation occur.
 * Keep every other metadata/DSP/reference admission check in the board path. */
int bs_preview_owner_transition_locked(uint32_t,const struct bs_preview_owner_binding *,
    const struct runtime_dsp *,const struct runtime_dsp *,enum runtime_metadata_operation);
#endif
