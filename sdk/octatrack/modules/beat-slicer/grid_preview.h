/* SPDX-License-Identifier: MIT */
#ifndef BEAT_SLICER_GRID_PREVIEW_H
#define BEAT_SLICER_GRID_PREVIEW_H
#include "planner.h"

/* Geometry-only input copied by a future reviewed base service. No PCM pointer,
 * source lease or native address. All inputs remain stable during this call. */
struct bs_grid_request {
    uint32_t sample_rate, trim_start, trim_end;
    uint32_t sample_bpm24, project_bpm24, beats, tempo_source;
    uint32_t existing_count;
    const uint32_t *existing;
};
/* Deliberately distinct from bs_plan: amplitude/fade safety is UNKNOWN, not
 * zero. This result is informational and cannot authorize Apply or playback.
 * It preserves starts only; complete records and ordinals need their separate
 * preservation checks. No source identity/coherence is established here. */
struct bs_grid_plan {
    uint32_t count, bpm24;
    uint32_t starts[BS_MAX_SLICES];
};
/* Exact mathematical grid; no reads, callbacks, writes to inputs or snap search.
 * Failure leaves out unchanged. Input/output storage must not overlap. */
enum bs_status bs_grid_preview(const struct bs_grid_request *, struct bs_grid_plan *);
#endif
