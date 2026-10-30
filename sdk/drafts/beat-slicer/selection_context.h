/* SPDX-License-Identifier: MIT */
#ifndef BS_SELECTION_CONTEXT_H
#define BS_SELECTION_CONTEXT_H
#include "editor_menu.h"

/* Proposed resident selection adapter, not an exported ABI or loader lease.
 * Every call shares one verified UI/loader boundary. Inputs and callback/table
 * storage must already be admitted and remain alive through end. Output buffers
 * must not alias the context, input binding or callback tables. The native
 * adapter captures before stock closes a popup, arms only immediately before
 * its verified direct callback dispatch, and ends only after that call returns.
 * No other path may arm/end a context. An old no-argument callback alone grants
 * no authority. This contract does not establish those native boundaries.
 */
struct bs_selection_binding {
    uintptr_t window, task;
    const bs_menu_callback *table;
    bs_menu_callback callback;
    bs_menu_owner owner;
    uint32_t domain, epoch, count, row;
};
enum bs_selection_state { BS_SELECTION_IDLE, BS_SELECTION_CAPTURED,
    BS_SELECTION_ARMED, BS_SELECTION_CONSUMED, BS_SELECTION_BLOCKED };
struct bs_selection_context {
    uint32_t serial;
    enum bs_selection_state state;
    struct bs_selection_binding binding;
};
/* Zero-initialize once. Serial exhaustion is permanent; never reset for reuse.
 * Native nested selection must be refused before running a second callback;
 * returning BUSY here alone must not let the inner path borrow outer authority.
 * Failure leaves context and ticket unchanged. */
bs_menu_status bs_selection_capture_locked(struct bs_selection_context *,
    const struct bs_selection_binding *, uint32_t *ticket);
/* At the verified dispatch tail, compare the actual table, row, task and
 * callback argument with the capture. Popup closure alone is not authority. */
bs_menu_status bs_selection_arm_locked(struct bs_selection_context *, uint32_t ticket,
    uintptr_t task, const bs_menu_callback *table, uint32_t row, bs_menu_callback);
/* Called first by a resident callback. Consume once before any action. Owner,
 * generation, domain and epoch come from the caller's current admitted state.
 * A refused take leaves row unchanged. The native adapter, not this function,
 * must prove no unrelated callback can run between arm and the direct call. */
int bs_selection_take_locked(struct bs_selection_context *, uintptr_t task,
    bs_menu_callback, uint32_t domain, bs_menu_owner owner, uint32_t epoch,
    uint32_t *row);
bs_menu_status bs_selection_block_locked(struct bs_selection_context *, uint32_t ticket);
/* Trusted post-dispatch path only; never call from inside an active callback.
 * Ending clears authority, not native references. Detachment/reclamation and
 * later menu admission still require their own complete ownership proof. */
bs_menu_status bs_selection_end_locked(struct bs_selection_context *, uint32_t ticket);
#endif
