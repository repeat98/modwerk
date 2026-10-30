/* SPDX-License-Identifier: MIT */
#ifndef BS_MENU_PACKAGE_H
#define BS_MENU_PACKAGE_H
#include "menu_owner.h"
#include "editor_menu.h"
/* Proposed base-owned contribution decoder, NOT an assigned table/event ABI.
 * Hold the stable loader/editor lock throughout admission, resolution and use.
 * The caller must additionally keep the descriptor stable during its 64-byte
 * copy. The loader's level-4 lock does not exclude real-time module writers.
 * It admits one already-published owner's initialized image, never BSS, another
 * owner, a raw module pointer or a staged/rollback-only image. It neither admits
 * the package to the loader nor establishes complete-set/source readiness.
 *
 * Proposed record: 64 bytes, big endian uint32 words at offsets 0 schema (1),
 * 4 size (64), 8 ordering key, 12 action ID, 16 image-relative entry offset,
 * 20 flags (0); bytes 24..55 inline printable ASCII label, NUL terminated with
 * zero padding; words 56 and 60 reserved (0). Entry is even, at least 8, has
 * two initialized bytes and is outside this descriptor. The eight-byte image
 * preamble is not code. Range checks do not prove that an entry is valid code.
 */
#define BS_MENU_PACKAGE_BYTES 64u
struct bs_menu_package_action {
    struct bs_menu_owner_lease lease;
    uint32_t key, action, entry_offset;
    char label[BS_MENU_LABEL_BYTES];
};
/* Zero-initialize once. Failure leaves out unchanged. No reset/rebind, moving
 * or reclamation while a menu retains its copied view. A successful binding
 * freezes the descriptor; later writes to module metadata cannot redirect it.
 */
int bs_menu_package_bind_locked(struct bs_menu_package_action *,
    const struct runtime_owner *, uint32_t record_offset);
/* Copy a menu view whose label points only into base-owned binding storage.
 * Failure leaves out unchanged; a stale owner permanently retires the lease.
 */
int bs_menu_package_view_locked(struct bs_menu_package_action *, bs_menu_action *);
/* Resolve only this binding's action under a still-current full owner lease.
 * Keep the lock through a nonblocking invocation by trusted base code. This
 * grants neither a source read nor an editor write. Caller still checks native
 * selection authority, complete-set readiness and transition-time retirement.
 * Failure leaves entry unchanged. No unchecked module function is invoked here.
 */
int bs_menu_package_entry_locked(struct bs_menu_package_action *, uint32_t action,
    uintptr_t *entry);
#endif
