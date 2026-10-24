/* SPDX-License-Identifier: MIT */
#include "marker_edit.h"
#define CHECK(x) do { if (!(x)) return __LINE__; } while (0)
static struct bs_marker_table before, current;
static struct bs_marker_edit edit, saved;
static struct bs_plan plan;
static void bytes(void *p, uint8_t value, uint32_t size) {
    uint8_t *v = (uint8_t *)p;
    uint32_t i;
    for (i = 0; i < size; ++i) v[i] = value;
}
static void copy(void *dst, const void *src, uint32_t size) {
    uint8_t *a = (uint8_t *)dst;
    const uint8_t *b = (const uint8_t *)src;
    uint32_t i;
    for (i = 0; i < size; ++i) a[i] = b[i];
}
static int same(const void *a, const void *b, uint32_t size) {
    const uint8_t *x = (const uint8_t *)a, *y = (const uint8_t *)b;
    uint32_t i;
    for (i = 0; i < size; ++i) if (x[i] != y[i]) return 0;
    return 1;
}
static void setup(uint32_t count, uint32_t keep) {
    uint32_t i;
    bytes(&plan, 0, sizeof(plan)); before.count = keep; plan.count = count;
    for (i = 0; i < BS_MAX_SLICES; ++i) {
        plan.starts[i] = i*128;
        before.records[i].start = i < keep ? i*128 : 0xf0000000u+i;
        before.records[i].end = i < keep ? i*128+64 : 0xe0000000u+i;
        before.records[i].loop = i < keep ? i*128 : 0xd0000000u+i;
    }
}
static int all_prefixes(void) {
    uint32_t n, k, i;
    for (n = 1; n <= 64; ++n) for (k = 0; k <= n; ++k) {
        setup(n, k);
        CHECK(bs_marker_prepare(&before, &plan, n*128, 0, n*128, &edit) == BS_MARKERS_OK);
        CHECK(edit.added == n-k && edit.before.count == k && edit.after.count == n);
        CHECK(same(&edit.before, &before, sizeof(before)));
        for (i = 0; i < k; ++i) CHECK(same(&edit.after.records[i], &before.records[i], sizeof(before.records[i])));
        for (i = k; i < n; ++i) {
            CHECK(edit.after.records[i].start == i*128 && edit.after.records[i].end == (i+1)*128);
            CHECK(edit.after.records[i].loop == 0xffffffffu);
        }
        for (i = n; i < 64; ++i) CHECK(same(&edit.after.records[i], &before.records[i], sizeof(before.records[i])));
        CHECK(bs_marker_matches_before(&edit, &before));
        copy(&current, &edit.after, sizeof(current)); CHECK(bs_marker_matches_after(&edit, &current));
        /* Only an in-memory model, not native publication or stock Undo. */
        copy(&current, &edit.before, sizeof(current)); CHECK(same(&current, &before, sizeof(current)));
    }
    return 0;
}
static int mismatches(void) {
    uint32_t i, field;
    setup(3, 1); CHECK(bs_marker_prepare(&before, &plan, 512, 0, 512, &edit) == BS_MARKERS_OK);
    for (i = 0; i < 64; ++i) for (field = 0; field < 3; ++field) {
        copy(&current, &edit.after, sizeof(current));
        if (!field) current.records[i].start ^= 1;
        if (field == 1) current.records[i].end ^= 1;
        if (field == 2) current.records[i].loop ^= 1;
        CHECK(!bs_marker_matches_after(&edit, &current));
        copy(&current, &edit.before, sizeof(current));
        if (!field) current.records[i].start ^= 1;
        if (field == 1) current.records[i].end ^= 1;
        if (field == 2) current.records[i].loop ^= 1;
        CHECK(!bs_marker_matches_before(&edit, &current));
    }
    copy(&current, &edit.after, sizeof(current)); ++current.count;
    CHECK(!bs_marker_matches_after(&edit, &current));
    copy(&current, &edit.before, sizeof(current)); ++current.count;
    CHECK(!bs_marker_matches_before(&edit, &current));
    return 0;
}
static int refusals(void) {
    uint32_t mode;
    for (mode = 0; mode < 14; ++mode) {
        enum bs_marker_status expected = BS_MARKERS_INVALID;
        uint32_t frames = 512, start = 0, end = 512;
        setup(3, 2); bytes(&edit, 0x5a, sizeof(edit)); copy(&saved, &edit, sizeof(edit));
        if (mode == 0) { plan.starts[0] = 1; expected = BS_MARKERS_MISSING_EXISTING; }
        if (mode == 1) {
            before.records[0].start = 64; before.records[0].end = 128; before.records[0].loop = 64;
            before.records[1].start = 256; before.records[1].end = 320; before.records[1].loop = 256;
            plan.starts[1] = 64; expected = BS_MARKERS_ORDINAL_CONFLICT;
        }
        if (mode == 2) { plan.count = 65; expected = BS_MARKERS_CAPACITY; }
        if (mode == 3) plan.starts[1] = 0;
        if (mode == 4) plan.starts[2] = 512;
        if (mode == 5) before.records[0].end = 513;
        if (mode == 6) { before.records[0].end = 63; expected = BS_MARKERS_SHORT_REGION; }
        if (mode == 7) before.records[0].loop = 1;
        if (mode == 8) { before.records[0].end = 129; expected = BS_MARKERS_OVERLAP; }
        if (mode == 9) { before.records[1].end = 257; expected = BS_MARKERS_OVERLAP; }
        if (mode == 10) { end = 300; expected = BS_MARKERS_SHORT_REGION; }
        if (mode == 11) { before.count = 65; expected = BS_MARKERS_CAPACITY; }
        if (mode == 12) frames = 0x80000000u;
        if (mode == 13) start = end;
        CHECK(bs_marker_prepare(&before, &plan, frames, start, end, &edit) == expected);
        CHECK(same(&edit, &saved, sizeof(edit)));
    }
    setup(1, 0); CHECK(bs_marker_prepare(&before, &plan, 32, 0, 32, &edit) == BS_MARKERS_OK);
    CHECK(edit.after.records[0].start == 0 && edit.after.records[0].end == 32);
    setup(2, 0); plan.starts[1] = 31;
    CHECK(bs_marker_prepare(&before, &plan, 32, 0, 32, &edit) == BS_MARKERS_SHORT_REGION);
    setup(1, 0); plan.starts[0] = 0x7fffff00u;
    CHECK(bs_marker_prepare(&before, &plan, 0x7fffffffu, 0x7fffff00u, 0x7fffffffu, &edit) == BS_MARKERS_OK);
    CHECK(edit.after.records[0].end == 0x7fffffffu);
    CHECK(bs_marker_prepare(0, &plan, 512, 0, 512, &edit) == BS_MARKERS_INVALID);
    CHECK(!bs_marker_matches_before(0, &before) && !bs_marker_matches_after(&edit, 0));
    return 0;
}
int bs_marker_selftest(void) {
    int error = all_prefixes();
    if (error) return error;
    error = mismatches(); if (error) return error;
    return refusals();
}
