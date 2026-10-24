/* SPDX-License-Identifier: MIT */
#ifndef BEAT_SLICER_MARKER_EDIT_H
#define BEAT_SLICER_MARKER_EDIT_H
#include "preview_session.h"
/* Full table includes inactive records: new slices overwrite some of those
 * bytes, so restoring only previously active records is not an exact Undo.
 */
struct bs_marker_table { uint32_t count; struct bs_marker_record records[BS_MAX_SLICES]; };
struct bs_marker_edit {
    uint32_t frames, trim_start, trim_end, added;
    struct bs_marker_table before, after;
};
enum bs_marker_status { BS_MARKERS_OK, BS_MARKERS_INVALID, BS_MARKERS_CAPACITY,
    BS_MARKERS_MISSING_EXISTING, BS_MARKERS_ORDINAL_CONFLICT,
    BS_MARKERS_SHORT_REGION, BS_MARKERS_OVERLAP };
/* Pure candidate preparation; no native write or Apply authorization. The
 * caller must supply a fresh validated plan and full table under the shared
 * ownership boundary, then bind the candidate to source/owner/playback identity.
 * Existing complete records retain their ordinal; otherwise refuse. New records
 * end at the next new start or trim end, with looping disabled. This conservative
 * proposal refuses overlap, out-of-trim records and regions below min(frames,64).
 * Stock endpoint/persistence/audio qualification remains separate.
 * Failure leaves out untouched. Inputs and output must not overlap.
 */
enum bs_marker_status bs_marker_prepare(const struct bs_marker_table *, const struct bs_plan *,
    uint32_t frames, uint32_t trim_start, uint32_t trim_end, struct bs_marker_edit *out);
/* Exact full-table comparisons, including inactive rows. These are useful to a
 * future Apply/Undo service but are NOT locks, content identities or permission
 * to write. Revalidate the complete session snapshot separately under ownership.
 */
int bs_marker_matches_before(const struct bs_marker_edit *, const struct bs_marker_table *);
int bs_marker_matches_after(const struct bs_marker_edit *, const struct bs_marker_table *);
#endif
