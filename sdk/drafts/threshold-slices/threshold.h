/* SPDX-License-Identifier: MIT */
#ifndef THRESHOLD_SLICES_H
#define THRESHOLD_SLICES_H
#include <stdint.h>
#define TS_MAX 64u
enum { TS_OK, TS_EMPTY, TS_TOO_MANY, TS_SHORT, TS_FAILED };
/* Two passes over absolute peaks, one frame each, from trim start.
 * Pass one keeps the peak. Pass two places a start a fixed pad before each
 * rise through peak * percent / 100, held off for the longer of 64 frames
 * and the gap. The first start is the trim start. A 65th hit refuses. */
struct ts_scan {
    uint32_t trim_start, trim_end, rate, percent, gap_ms, pad, minimum, level, peak;
    uint32_t phase, cursor, count, status, armed, have_prev;
    int32_t previous;
    uint32_t starts[TS_MAX];
};
void ts_scan_begin(struct ts_scan *, uint32_t trim_start, uint32_t trim_end,
    uint32_t rate, uint32_t percent, uint32_t gap_ms);
/* peaks[i] is frame `at + i`. `at` must be the cursor. Returns 1 when the
 * scan has finished. A zero count does nothing until the cursor is at the end. */
unsigned ts_scan_feed(struct ts_scan *, uint32_t at, const int32_t *peaks, uint32_t count);
#endif
