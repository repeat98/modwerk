/* SPDX-License-Identifier: MIT */
#include "marker_edit.h"
static void copy_record(struct bs_marker_record *dst, const struct bs_marker_record *src) {
    dst->start = src->start; dst->end = src->end; dst->loop = src->loop;
}
enum bs_marker_status bs_marker_prepare(const struct bs_marker_table *before,
        const struct bs_plan *plan, uint32_t frames, uint32_t trim_start,
        uint32_t trim_end, struct bs_marker_edit *out) {
    uint32_t i, j, minimum, end, found;
    if (!before || !plan || !out || !frames || frames > 0x7fffffffu ||
        trim_start >= trim_end || trim_end > frames || !plan->count) return BS_MARKERS_INVALID;
    if (before->count > BS_MAX_SLICES || plan->count > BS_MAX_SLICES) return BS_MARKERS_CAPACITY;
    minimum = frames < 64 ? frames : 64;
    for (i = 0; i < before->count; ++i) {
        const struct bs_marker_record *r = &before->records[i];
        if (r->start < trim_start || r->start >= trim_end || r->end > trim_end || r->end <= r->start ||
            (i && before->records[i-1].start >= r->start)) return BS_MARKERS_INVALID;
        if (r->end-r->start < minimum) return BS_MARKERS_SHORT_REGION;
        if (r->loop != 0xffffffffu && (r->loop < r->start || r->loop > r->end-minimum))
            return BS_MARKERS_INVALID;
        if (i && before->records[i-1].end > r->start) return BS_MARKERS_OVERLAP;
    }
    for (i = 0; i < plan->count; ++i)
        if (plan->starts[i] < trim_start || plan->starts[i] >= trim_end ||
            (i && plan->starts[i-1] >= plan->starts[i])) return BS_MARKERS_INVALID;
    if (plan->count < before->count) return BS_MARKERS_MISSING_EXISTING;
    for (i = 0; i < before->count; ++i) {
        found = 0;
        for (j = 0; j < plan->count; ++j) if (plan->starts[j] == before->records[i].start) { found = 1; break; }
        if (!found) return BS_MARKERS_MISSING_EXISTING;
    }
    for (i = 0; i < before->count; ++i)
        if (plan->starts[i] != before->records[i].start) return BS_MARKERS_ORDINAL_CONFLICT;
    for (i = before->count; i < plan->count; ++i) {
        end = i+1 < plan->count ? plan->starts[i+1] : trim_end;
        if (end-plan->starts[i] < minimum) return BS_MARKERS_SHORT_REGION;
        if (i == before->count && i && before->records[i-1].end > plan->starts[i]) return BS_MARKERS_OVERLAP;
    }
    /* All refusals precede the first output write. No stock sanitation or
     * partial publication is needed to find out whether old records survive.
     */
    out->frames = frames; out->trim_start = trim_start; out->trim_end = trim_end;
    out->added = plan->count-before->count;
    out->before.count = before->count; out->after.count = plan->count;
    for (i = 0; i < BS_MAX_SLICES; ++i) {
        copy_record(&out->before.records[i], &before->records[i]);
        copy_record(&out->after.records[i], &before->records[i]);
    }
    for (i = before->count; i < plan->count; ++i) {
        out->after.records[i].start = plan->starts[i];
        out->after.records[i].end = i+1 < plan->count ? plan->starts[i+1] : trim_end;
        out->after.records[i].loop = 0xffffffffu;
    }
    return BS_MARKERS_OK;
}
static int same_table(const struct bs_marker_table *a, const struct bs_marker_table *b) {
    uint32_t i;
    if (!a || !b || a->count > BS_MAX_SLICES || a->count != b->count) return 0;
    for (i = 0; i < BS_MAX_SLICES; ++i)
        if (a->records[i].start != b->records[i].start || a->records[i].end != b->records[i].end ||
            a->records[i].loop != b->records[i].loop) return 0;
    return 1;
}
int bs_marker_matches_before(const struct bs_marker_edit *edit, const struct bs_marker_table *table) {
    return edit && same_table(&edit->before, table);
}
int bs_marker_matches_after(const struct bs_marker_edit *edit, const struct bs_marker_table *table) {
    return edit && same_table(&edit->after, table);
}
