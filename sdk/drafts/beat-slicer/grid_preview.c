/* SPDX-License-Identifier: MIT */
#include "grid_preview.h"

enum bs_status bs_grid_preview(const struct bs_grid_request *r, struct bs_grid_plan *out)
{
    struct bs_grid_plan p;
    uint32_t bpm, numerator, remainder, whole;
    if (!r || !out || r->sample_rate < 8000 || r->sample_rate > 192000 ||
        r->trim_start >= r->trim_end || r->tempo_source > BS_PROJECT_BPM ||
        (r->beats != 1 && r->beats != 4 && r->beats != 16 && r->beats != 32 && r->beats != 64) ||
        r->existing_count > BS_MAX_SLICES || (r->existing_count && !r->existing))
        return BS_INVALID;
    bpm = r->tempo_source == BS_SAMPLE_BPM ? r->sample_bpm24 : r->project_bpm24;
    if (bpm < 30u*24u || bpm > 300u*24u) return BS_INVALID;
    p.count = r->existing_count; p.bpm24 = bpm;
    for (uint32_t i=0; i<BS_MAX_SLICES; ++i) p.starts[i]=0;
    for (uint32_t i=0; i<p.count; ++i) {
        uint32_t f=r->existing[i];
        if (f < r->trim_start || f >= r->trim_end || (i && f <= r->existing[i-1]))
            return BS_INVALID;
        p.starts[i]=f;
    }
    /* Same rational deadlines as the audio planner, rounded from trim start.
     * All intermediates fit uint32_t at the validated rate/tempo/spacing limits.
     * The independent big-integer oracle checks this, including high offsets. */
    numerator=r->sample_rate*1440u;
    remainder=(numerator%bpm)*r->beats;
    whole=(numerator/bpm)*r->beats+remainder/bpm;
    remainder%=bpm;
    for (uint32_t n=0; n<=BS_MAX_SLICES; ++n) {
        uint32_t offset=n*whole+(n*remainder+bpm/2u)/bpm, at=0, frame;
        if (offset >= r->trim_end-r->trim_start) break;
        frame=r->trim_start+offset;
        while (at<p.count && p.starts[at]<frame) ++at;
        if (at<p.count && p.starts[at]==frame) continue;
        if (p.count==BS_MAX_SLICES) return BS_TOO_MANY;
        for (uint32_t i=p.count; i>at; --i) p.starts[i]=p.starts[i-1];
        p.starts[at]=frame; ++p.count;
    }
    out->count=p.count; out->bpm24=p.bpm24;
    for (uint32_t i=0; i<BS_MAX_SLICES; ++i) out->starts[i]=p.starts[i];
    return BS_OK;
}
