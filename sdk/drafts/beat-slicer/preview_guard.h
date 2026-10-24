/* SPDX-License-Identifier: MIT */
#ifndef BEAT_SLICER_PREVIEW_GUARD_H
#define BEAT_SLICER_PREVIEW_GUARD_H
#include <stdint.h>
#define BS_GUARD_WRITERS 8u

/* Draft of BASE-OWNED admission bookkeeping, not a native lock or exported ABI.
 * All calls, snapshot capture, map lookup and bounded PCM copies must share a
 * verified external serialization boundary. No pointer is pinned by this API.
 * Every relevant writer must enter before its first mutation and leave on its
 * real return/cleanup path, regardless of UI notification or success/failure.
 * Coarse policy: ANY tracked edit/map/metadata change retires ALL previews.
 */
struct bs_preview_token { uint32_t operation, revision; };
struct bs_preview_guard {
    /* Private implementation state; public layout permits freestanding storage. */
    uint32_t revision, serial, enabled, poisoned;
    uint32_t writers[BS_GUARD_WRITERS];
};
/* Initialize ONCE for a fresh base lifetime, before any tokens/writers exist.
 * Never reset/reinitialize for module reload, sample switch or counter wrap.
 * Cross-guard/lifetime tokens are invalid; transport must drain them first.
 */
void bs_guard_init(struct bs_preview_guard *);
/* Caller must first prove writer coverage and source ownership. Disabled by
 * default; this prototype does not discover whether that proof exists.
 */
int bs_guard_enable(struct bs_preview_guard *);
/* Revoke owner/source admission and old tokens without forgetting live writers.
 * Re-enable only after retirement and revalidation; IDs are never reset.
 */
void bs_guard_revoke(struct bs_preview_guard *);
void bs_guard_invalidate(struct bs_preview_guard *);
/* Entry records observations, not permission to run stock. Zero means tracking
 * failed closed: previews stay disabled, stock must still perform its normal
 * cleanup. Saturation/exhaustion is terminal for this guard lifetime.
 */
uint32_t bs_guard_writer_begin(struct bs_preview_guard *);
int bs_guard_writer_end(struct bs_preview_guard *, uint32_t ticket);
/* Failure leaves out untouched. IDs are owned serials, never command pointers.
 * Token is a trusted internal record, not a security/authentication credential.
 */
int bs_guard_acquire(struct bs_preview_guard *, struct bs_preview_token *out);
int bs_guard_valid(const struct bs_preview_guard *, const struct bs_preview_token *);
/* Pass zero to the staged reader to invalidate it while closed/busy/poisoned.
 * A nonzero revision alone never authorizes a raw native memory access.
 */
uint32_t bs_guard_revision(const struct bs_preview_guard *);
#endif
