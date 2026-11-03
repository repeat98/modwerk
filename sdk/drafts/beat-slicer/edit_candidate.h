/* SPDX-License-Identifier: MIT */
#ifndef BEAT_SLICER_EDIT_CANDIDATE_H
#define BEAT_SLICER_EDIT_CANDIDATE_H
#include "marker_edit.h"
/* Preparation only. No native write, commit permission, history installation
 * or exported SDK ABI. Session/guard/backend/context must outlive this object.
 * A single background owner calls it and the session, never concurrently.
 */
typedef enum bs_provider_reply (*bs_capture_markers)(void *,
    const struct bs_source_snapshot *, struct bs_marker_table *out);
enum bs_candidate_state { BS_CANDIDATE_EMPTY, BS_CANDIDATE_WAITING,
    BS_CANDIDATE_READY, BS_CANDIDATE_STALE, BS_CANDIDATE_REFUSED,
    BS_CANDIDATE_FAILED, BS_CANDIDATE_CANCELLED };
struct bs_edit_candidate {
    /* Private except state, marker_status and token for displaying the exact
     * prepared operation. Token is trusted bookkeeping, not authentication.
     */
    struct bs_preview_session *session;
    bs_capture_markers capture;
    struct bs_preview_token preview, token;
    uint32_t state, marker_status, prepared;
    struct bs_plan plan;
    struct bs_marker_table observed;
    struct bs_marker_edit edit;
};
void bs_candidate_init(struct bs_edit_candidate *);
/* Retire an older candidate, bind to an already-ready preview, then attempt
 * preparation. capture uses the SAME backend context and exclusive boundary,
 * fills all 64 rows/count for the supplied snapshot, and must not retain any
 * pointer, wait for IO, allocate, write native state or reenter these APIs.
 * An unavailable lock/capture yields WAITING; step retries this exact preview.
 */
enum bs_candidate_state bs_candidate_begin(struct bs_edit_candidate *,
    struct bs_preview_session *, bs_capture_markers);
enum bs_candidate_state bs_candidate_step(struct bs_edit_candidate *);
void bs_candidate_cancel(struct bs_edit_candidate *);
/* Revalidate the bound preview AND full before-table under ownership, then
 * copy the prepared edit. id must equal the issued candidate operation, not
 * the preview's operation. Wrong/stale/cancelled/pending requests leave out
 * unchanged. This is still a preview, never permission for a later unlocked
 * Apply. Native atomic publication/Undo/playback qualification remain absent.
 * out must not alias candidate/session/backend memory.
 */
int bs_candidate_result(struct bs_edit_candidate *, uint32_t id, struct bs_marker_edit *out);
/* Base-side composition: caller ALREADY holds the session backend lock and
 * retains it throughout validation/publication. Never permission to write after
 * unlocking. Same output/identity rules as result; callbacks cannot reenter.
 */
int bs_candidate_result_locked(struct bs_edit_candidate *, uint32_t id, struct bs_marker_edit *out);
#endif
