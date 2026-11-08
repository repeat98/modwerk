/* SPDX-License-Identifier: MIT */
#ifndef BS_MENU_OWNER_BACKEND_H
#define BS_MENU_OWNER_BACKEND_H
#include "menu_owner.h"
#include "editor_menu.h"
/* Proposed base-side adapter, not a package format or exported ABI. Binding
 * inputs, leases, callback and context must already be admitted and base-owned.
 * Hold the stable loader/editor lock throughout every call and dispatch. This
 * adapter does not acquire locks, admit module metadata or resolve code offsets.
 * The trusted dispatch callback may not wait or reenter the menu/loader.
 * One copied binding allows one action ID for one fixed owner activation. */
struct bs_menu_owner_action {
    struct bs_menu_owner_lease *lease;
    uint32_t action;
};
typedef int (*bs_menu_owner_invoke)(void *,const struct runtime_owner *,uint32_t);
struct bs_menu_owner_backend {
    uint32_t bound,count;
    struct bs_menu_owner_action actions[BS_MENU_ACTIONS];
    bs_menu_owner_invoke invoke;
    void *context;
    bs_menu_backend backend;
};
/* Zero-initialize once; never move, reset or rebind after success. Leases and
 * all referenced base code/storage remain alive until native references retire.
 * The same owner may supply multiple actions, all through the same lease.
 * Duplicate owner/action pairs and distinct leases for one identity are refused.
 * Failure leaves this object unchanged, but may retire a now-invalid lease. */
int bs_menu_owner_backend_bind_locked(struct bs_menu_owner_backend *,uint32_t,
    const struct bs_menu_owner_action *,bs_menu_owner_invoke,void *);
/* NULL until bound. The returned backend rechecks full current publication and
 * permanent lease retirement before forwarding an explicitly bound action.
 * invoke is trusted base code, never an unchecked module-pool function pointer.
 * Production typed admission, module-set readiness and transition hooks remain
 * requirements of the caller, not capabilities supplied by this prototype. */
const bs_menu_backend *bs_menu_owner_backend_get_locked(struct bs_menu_owner_backend *);
/* Proposed composition point for the EXISTING loader metadata callback.
 * Call under its stable lock for every relevant registry, before SWITCH can
 * change publication. PREPARE is read-only. Retires only outgoing activation
 * leases, including before an attempted switch which later fails. Restoration
 * needs new activations; it never revives these leases. Same-image switches
 * leave activations intact. Return is a runtime_refusal; caller must preserve
 * all other metadata/DSP admission and reference checks.
 * This does not install a board hook, detach native menu references, revoke
 * source-reader lifetimes or authorize reclaiming callbacks/storage. */
int bs_menu_owner_backend_transition_locked(struct bs_menu_owner_backend *,
    const struct runtime_dsp *from,const struct runtime_dsp *to,
    enum runtime_metadata_operation);
#endif
