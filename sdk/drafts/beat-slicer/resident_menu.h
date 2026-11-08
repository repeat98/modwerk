/* SPDX-License-Identifier: MIT */
#ifndef BS_RESIDENT_MENU_H
#define BS_RESIDENT_MENU_H
#include "selection_context.h"
/* Fixed-owner, fixed-layout prototype. Materialize once; NEVER mutate or free
 * its label/callback/action arrays, backend or trampoline afterwards. All are
 * resident for the whole lifetime, including after owner retirement. This is
 * not mutable-menu detachment, a loader lease, or an installed base ABI.
 * Input and output buffers must not alias the resident object or its context. */
struct bs_resident_menu {
    bs_editor_menu menu;
    uint32_t enrolled, layout_generation, domain;
    bs_menu_callback trampoline;
};
/* Zero-initialize once before publication, with native UI/loader ownership.
 * On success the first menu is OPEN. No later call may reset or rematerialize
 * this object. Native display/selection and all buffers remain caller-owned. */
bs_menu_status bs_resident_menu_materialize_locked(struct bs_resident_menu *,
    uint32_t stock_count,const char *const *,const bs_menu_callback *,
    uint32_t action_count,const bs_menu_action *,bs_menu_callback,
    const bs_menu_backend *,uint32_t layout_generation,uint32_t domain,uint32_t *token);
/* Native adapter must report completed ordinary dismissal AND return from the
 * entire dispatcher, not just a zero window or an idle copied context. Existing
 * references remain readable because tables stay immutable and pinned; every
 * contributed callback must use the selection-context path below. No native
 * reference retirement/reclamation is asserted. Output must not alias inputs. */
bs_menu_status bs_resident_menu_reopen_locked(struct bs_resident_menu *,
    const struct bs_selection_context *,int native_idle,uint32_t layout_generation,uint32_t *token);
bs_menu_status bs_resident_menu_retire_locked(struct bs_resident_menu *,uint32_t token);
/* Exact context table/row/callback/owner/domain/epoch must authorize this action.
 * Native arm-to-direct-call and stable owner guarantees remain prerequisites. */
bs_menu_status bs_resident_menu_dispatch_locked(struct bs_resident_menu *,
    struct bs_selection_context *,uintptr_t task);
#endif
