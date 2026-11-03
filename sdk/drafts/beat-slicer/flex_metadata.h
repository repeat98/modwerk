/* SPDX-License-Identifier: MIT */
#ifndef BEAT_SLICER_FLEX_METADATA_H
#define BEAT_SLICER_FLEX_METADATA_H
#include "marker_edit.h"

/* Draft 1.40C Flex metadata decoder, not a live service or admitted binding.
 * The base must verify these readable, aligned regions against the exact build.
 * All calls require the SAME ownership boundary as PCM/map copying and every
 * metadata/content writer. Volatile reads do not supply that boundary.
 */
struct bs_flex_metadata_binding {
    const volatile uint32_t *ready, *controls, *settings;
    const volatile uint32_t *editor_kind, *editor_slot, *project_bpm24;
    uint32_t control_words, setting_words;
};
struct bs_source_lifetime {
    uint32_t owner_id, owner_generation, sample_id, sample_generation;
    uint32_t editor_generation, playback_generation, slot;
};
/* All lifetime fields except slot are nonzero, base-owned identities. This
 * helper does not mint, authenticate or update them. Filename/slot/counter
 * reuse cannot substitute for a lifetime. Capture is tied to Flex editor kind
 * 1 and the supplied slot; recorder/Static sources are refused.
 * The source clock is 44100, not the original WAV's header rate. Both observed
 * BPM values are copied without fallback; the planner validates the chosen one.
 * Refusal leaves output unchanged. Outputs/inputs must not overlap. Binding,
 * lifetime and source memory remain stable/readable throughout the call.
 */
enum bs_provider_reply bs_flex_snapshot_locked(const struct bs_flex_metadata_binding *,
    const struct bs_source_lifetime *, struct bs_source_snapshot *);
/* Copy all 64 records, including inactive rows, for preservation/rollback.
 * The caller must revalidate the matching source snapshot under this same lock
 * before/after capture; this table alone grants no commit permission or identity.
 */
enum bs_provider_reply bs_flex_markers_locked(const struct bs_flex_metadata_binding *,
    const struct bs_source_lifetime *, struct bs_marker_table *);
#endif
