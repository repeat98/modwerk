/* SPDX-License-Identifier: MIT
 * Original Beat Slicer planning core by twwwy and contributors.
 * Host-tested draft, not a firmware adapter. No allocation, file or device IO.
 */
#ifndef BEAT_SLICER_PLANNER_H
#define BEAT_SLICER_PLANNER_H
#include <stdint.h>
#define BS_MAX_SLICES 64u
enum bs_tempo_source { BS_SAMPLE_BPM, BS_PROJECT_BPM };
enum bs_status { BS_OK, BS_INVALID, BS_TOO_MANY, BS_READ_ERROR };
/* Return 0 and signed, right-aligned 24-bit PCM for both channels. Mono
 * adapters duplicate the channel. Call from a background/UI job, never ISR.
 * The adapter owns decoding, caching and cancellation; no stock ABI assumed.
 */
typedef int (*bs_read_frame)(void *, uint32_t, int32_t [2]);
struct bs_request {
    uint32_t sample_rate, trim_start, trim_end; /* end exclusive, frames */
    uint32_t sample_bpm24, project_bpm24, beats, tempo_source;
    uint32_t existing_count;
    const uint32_t *existing; /* ascending starts; retained byte-for-byte */
    uint32_t snap; /* 0 = exact beat grid; 1 = search at most +/- 2 ms */
    bs_read_frame read;
    void *context;
};
struct bs_plan {
    uint32_t count, bpm24;
    uint32_t starts[BS_MAX_SLICES];
    /* Nonzero means marker placement alone is NOT safe enough: the adapter
     * must provide verified playback fades or refuse to apply the plan.
     * A low-amplitude boundary is still not proof of click-free playback.
     */
    uint32_t needs_fade[BS_MAX_SLICES];
    uint32_t end_needs_fade;
};
/* Pure preview: never alters existing markers or PCM; on failure out is
 * unchanged. Adapter must revalidate sample/trim/tempo/marker identity at
 * confirmed apply, preserve stock slice loop/end metadata, and roll back failed
 * writes internally. Later user edits use the stock slice-clearing workflow.
 */
enum bs_status bs_preview(const struct bs_request *, struct bs_plan *);
#endif
