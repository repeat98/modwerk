/* SPDX-License-Identifier: MIT */
#ifndef BS_MENU_OWNER_H
#define BS_MENU_OWNER_H
#include "../../runtime/loader/loader.h"
/* Proposed base-side check, not an exported module ABI. Every operation requires
 * the real stable loader lock, held through any subsequent resolution/invocation.
 * Inputs/storage must already be admitted. Published is NOT typed contribution
 * admission, complete module-set readiness, source ownership or playback safety.
 */
enum bs_menu_owner_state { BS_MENU_OWNER_EMPTY, BS_MENU_OWNER_LIVE, BS_MENU_OWNER_RETIRED };
struct bs_menu_owner_lease { struct runtime_owner owner; uint32_t state; };
/* Exact intact ledger owner AND the currently published live position. Staged
 * candidates and retained rollback predecessors must not gain menu authority. */
int bs_menu_owner_published_locked(const struct runtime_owner *);
/* Zero-initialize once before publication. Never reset/rebind a used lease.
 * Failure leaves the lease unchanged. The full ledger record is copied. */
int bs_menu_owner_bind_locked(struct bs_menu_owner_lease *,const struct runtime_owner *);
/* Missing/currently-unpublished owner permanently retires this lease. An image
 * restored by USB Undo cannot revive an observed retired menu activation. */
int bs_menu_owner_current_locked(struct bs_menu_owner_lease *);
/* The native registry MUST call this before replacement/removal starts, even if
 * an old owner is later restored before any current() query can observe absence.
 * This prototype neither installs that hook nor guarantees reference retirement. */
void bs_menu_owner_retire_locked(struct bs_menu_owner_lease *);
#endif
