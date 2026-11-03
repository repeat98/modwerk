/* SPDX-License-Identifier: MIT */
#ifndef BEAT_SLICER_EDIT_TRANSACTION_H
#define BEAT_SLICER_EDIT_TRANSACTION_H
#include "edit_candidate.h"

/* Proposed base-side orchestration, NOT a native transaction implementation.
 * The backend is trusted and must first prove whole-operation reader/writer
 * exclusion, rollback of ALL auxiliary state and playback safety. None of those
 * native callbacks exists in this draft. No lock, native pointer or IO escapes.
 */
enum bs_exchange_reply { BS_EXCHANGE_FAULT = -1, BS_EXCHANGE_UNCHANGED = 0,
                         BS_EXCHANGE_COMMITTED = 1 };
struct bs_transaction_backend {
    /* Same context and lock as the candidate's preview backend. Required even
     * for a quiet-boundary plan: silence alone is not playback qualification.
     * desired is the complete table being proposed, including Undo's old
     * endpoints/loops. A null plan requests Undo qualification; it does not
     * mean the current after-markers are the table being restored.
     * Read-only, bounded; PENDING yields before any write or token retirement.
     */
    enum bs_provider_reply (*policy)(void *, const struct bs_source_snapshot *,
                                     const struct bs_marker_table *desired, const struct bs_plan *);
    /* Atomic compare/exchange under the supplied ownership boundary. Expected
     * includes all inactive rows. COMMITTED means desired records AND native
     * refresh/publication are complete; UNCHANGED means exact before-state,
     * including auxiliary state, restored. Neither may change PCM/identity/
     * unrelated settings. FAULT means this guarantee could not be met.
     * Must never yield, allocate, wait for IO or reenter these APIs. Internal
     * partial writes/rollback are the backend's responsibility, not this API's.
     */
    enum bs_exchange_reply (*exchange)(void *, const struct bs_source_snapshot *,
        const struct bs_marker_table *expected, const struct bs_marker_table *desired);
    /* Required fault containment before unlock: make a possibly inconsistent
     * source inaccessible to native readers/writers and schedule recovery.
     * Revoking preview tokens alone cannot make a damaged source safe.
     * This callback must not fail, reenter, wait or retain input pointers.
     */
    void (*quarantine)(void *);
};
enum bs_transaction_state { BS_TRANSACTION_EMPTY, BS_TRANSACTION_ACTIVE,
    BS_TRANSACTION_APPLIED, BS_TRANSACTION_UNDONE, BS_TRANSACTION_RETIRED,
    BS_TRANSACTION_FAULT };
enum bs_transaction_reply { BS_TRANSACTION_OK, BS_TRANSACTION_WAIT,
    BS_TRANSACTION_REJECTED, BS_TRANSACTION_STALE, BS_TRANSACTION_NO_CHANGE,
    BS_TRANSACTION_BROKEN, BS_TRANSACTION_BUSY };
struct bs_edit_transaction {
    /* Private, except state. One fixed base-owned workspace. commit retains no
     * history and needs no forget step. The research apply/undo API exposes
     * undo.operation to its test caller and requires explicit forget; it is
     * not the planned player workflow. No module memory is retained by history.
     * Backend/context/guard must be base-owned and outlive the journal.
     */
    uint32_t state, tempo_source;
    struct bs_preview_guard *guard;
    const struct bs_preview_backend *source_backend;
    const struct bs_transaction_backend *backend;
    bs_capture_markers capture;
    void *context;
    struct bs_preview_token undo;
    struct bs_source_snapshot snapshot, observed;
    struct bs_marker_edit edit;
    struct bs_marker_table observed_table;
};
/* Init once before use. Never use init to clear FAULT or a running transaction. */
void bs_transaction_init(struct bs_edit_transaction *);
/* Discard journal only; no source change. FAULT is terminal for this lifetime. */
int bs_transaction_forget(struct bs_edit_transaction *);
/* Confirmation must name the exact READY candidate, not a preview or slot.
 * All calls are serialized by one background owner; ACTIVE also rejects
 * accidental callback reentry. Failure before exchange leaves source untouched.
 */
enum bs_transaction_reply bs_transaction_apply(struct bs_edit_transaction *,
    struct bs_edit_candidate *, uint32_t confirmed, const struct bs_transaction_backend *);
/* Planned stock-style workflow: commit a confirmed candidate and retain no
 * Undo history. On every non-fault result the workspace is EMPTY, permitting
 * the next candidate without a forget/history prompt. WAIT preserves the
 * candidate for retry; a publication attempt consumes it, even after rollback.
 * BROKEN remains terminal and quarantines as above. Existing research history
 * is refused as BUSY, never silently discarded. Backend atomicity/rollback and
 * native ownership are still prerequisites, not supplied by this helper.
 */
enum bs_transaction_reply bs_transaction_commit(struct bs_edit_transaction *,
    struct bs_edit_candidate *, uint32_t confirmed, const struct bs_transaction_backend *);
/* Exact post-Apply token, full metadata and all 64 rows must still match.
 * Intervening tracked edits retire Undo even if bytes later look identical.
 * Undo also requires the current playback policy to admit the restoration.
 */
enum bs_transaction_reply bs_transaction_undo(struct bs_edit_transaction *, uint32_t confirmed);
#endif
