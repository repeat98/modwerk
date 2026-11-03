/* SPDX-License-Identifier: MIT */
#include "planner.h"

/* -60 dBFS peak threshold. Tests measure boundary amplitude, not audibility. */
#define QUIET24 8388u
static uint32_t magnitude(int32_t v) { return v < 0 ? 0u - (uint32_t)v : (uint32_t)v; }
static int read_peak(const struct bs_request *r, uint32_t p, uint32_t *peak) {
    int32_t v[2];
    if (r->read(r->context, p, v)) return 0;
    for (unsigned ch = 0; ch < 2; ++ch) {
        if (v[ch] < -8388608 || v[ch] > 8388607) return 0;
        uint32_t a = magnitude(v[ch]);
        if (a > *peak) *peak = a;
    }
    return 1;
}
static int boundary_peak(const struct bs_request *r, uint32_t p, uint32_t *peak) {
    *peak = 0;
    return (p == r->trim_start || read_peak(r, p - 1, peak)) && read_peak(r, p, peak);
}
static enum bs_status insert(struct bs_plan *p, uint32_t frame) {
    uint32_t at = 0;
    while (at < p->count && p->starts[at] < frame) ++at;
    if (at < p->count && p->starts[at] == frame) return BS_OK;
    if (p->count == BS_MAX_SLICES) return BS_TOO_MANY;
    for (uint32_t j = p->count; j > at; --j) p->starts[j] = p->starts[j-1];
    p->starts[at] = frame;
    ++p->count;
    return BS_OK;
}
enum bs_status bs_preview(const struct bs_request *r, struct bs_plan *out) {
    if (!r || !out || !r->read || r->sample_rate < 8000 || r->sample_rate > 192000 ||
        r->trim_start >= r->trim_end || r->tempo_source > BS_PROJECT_BPM || r->snap > 1 ||
        (r->beats != 1 && r->beats != 2 && r->beats != 4 && r->beats != 16 && r->beats != 32 && r->beats != 64) ||
        r->existing_count > BS_MAX_SLICES || (r->existing_count && !r->existing)) return BS_INVALID;
    uint32_t bpm = r->tempo_source == BS_SAMPLE_BPM ? r->sample_bpm24 : r->project_bpm24;
    /* Refuse unavailable/implausible tempo, never silently change BPM source. */
    if (bpm < 30 * 24 || bpm > 300 * 24) return BS_INVALID;
    struct bs_plan p;
    p.count = 0;
    p.bpm24 = bpm;
    p.end_needs_fade = 0;
    for (uint32_t i = 0; i < BS_MAX_SLICES; ++i) {
        p.starts[i] = 0;
        p.needs_fade[i] = 0;
    }
    for (uint32_t i = 0; i < r->existing_count; ++i) {
        uint32_t f = r->existing[i];
        if (f < r->trim_start || f >= r->trim_end || (i && f <= r->existing[i-1])) return BS_INVALID;
        p.starts[p.count++] = f;
    }
    /* Divide one beat before multiplying by spacing, carrying the remainder.
     * rate*1440 <= 276480000, remainder*beats < 460800. The largest step
     * is 24576000 frames; 64 steps <= 1572864000. All fit uint32_t, so the
     * freestanding ColdFire object needs no 64-bit compiler runtime helpers.
     * Round every deadline from the origin, never a previously rounded step.
     * 65 iterations suffice to detect overflow of the 64-slice capacity.
     */
    uint32_t numerator = r->sample_rate * 1440u;
    uint32_t remainder = (numerator % bpm) * r->beats;
    uint32_t whole = (numerator / bpm) * r->beats + remainder / bpm;
    remainder %= bpm;
    for (uint32_t n = 0; n <= BS_MAX_SLICES; ++n) {
        uint32_t offset = n * whole + (n * remainder + bpm / 2u) / bpm;
        if (offset >= r->trim_end - r->trim_start) break;
        uint32_t frame = r->trim_start + offset;
        int duplicate = 0;
        for (uint32_t i = 0; i < p.count; ++i) if (p.starts[i] == frame) duplicate = 1;
        /* A retained marker already within the snap window covers this beat.
         * Avoid near-duplicate slices, including after applying a preview twice.
         */
        if (r->snap && n) {
            uint32_t radius = r->sample_rate / 500u;
            for (uint32_t i = 0; i < p.count; ++i) {
                uint32_t distance = p.starts[i] > frame ? p.starts[i] - frame : frame - p.starts[i];
                if (distance <= radius) duplicate = 1;
            }
        }
        if (duplicate) continue;
        if (r->snap && n && !duplicate) {
            uint32_t radius = r->sample_rate / 500u;
            uint32_t lo = frame > radius ? frame - radius : 0;
            if (lo <= r->trim_start) lo = r->trim_start + 1;
            uint32_t hi = r->trim_end - 1 - frame >= radius ? frame + radius : r->trim_end - 1;
            /* Never move a new marker across an existing marker. */
            for (uint32_t i = 0; i < p.count; ++i) {
                if (p.starts[i] < frame && p.starts[i] >= lo) lo = p.starts[i] + 1;
                if (p.starts[i] > frame && p.starts[i] <= hi) hi = p.starts[i] - 1;
            }
            uint32_t best = frame, best_peak = UINT32_MAX, best_distance = UINT32_MAX;
            for (uint32_t f = lo; f <= hi; ++f) {
                uint32_t peak, distance = f > frame ? f - frame : frame - f;
                if (!boundary_peak(r, f, &peak)) return BS_READ_ERROR;
                if (peak <= QUIET24 && (peak < best_peak || (peak == best_peak && distance < best_distance))) {
                    best = f; best_peak = peak; best_distance = distance;
                }
            }
            frame = best; /* No safe nearby candidate: keep exact grid and flag. */
        }
        enum bs_status s = insert(&p, frame);
        if (s != BS_OK) return s;
    }
    for (uint32_t i = 0; i < p.count; ++i) {
        uint32_t peak;
        if (!boundary_peak(r, p.starts[i], &peak)) return BS_READ_ERROR;
        p.needs_fade[i] = peak > QUIET24;
    }
    uint32_t end_peak = 0;
    if (!read_peak(r, r->trim_end - 1, &end_peak)) return BS_READ_ERROR;
    p.end_needs_fade = end_peak > QUIET24;
    /* Explicit fields avoid a compiler-generated aggregate memcpy. Native
     * builds disable loop-to-libcall conversion too (native_probe.py).
     * Nothing is published until every validation and PCM read has succeeded.
     */
    out->count = p.count;
    out->bpm24 = p.bpm24;
    out->end_needs_fade = p.end_needs_fade;
    for (uint32_t i = 0; i < BS_MAX_SLICES; ++i) {
        out->starts[i] = p.starts[i];
        out->needs_fade[i] = p.needs_fade[i];
    }
    return BS_OK;
}
