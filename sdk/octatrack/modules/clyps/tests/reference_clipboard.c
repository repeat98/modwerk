/* SPDX-License-Identifier: GPL-3.0-or-later */
#include <assert.h>
#include <string.h>
#include "../reference_clipboard.h"

int main(void)
{
    struct clyps_clipboard clip = {0};
    uint32_t rows[16] = {0x08421630, [7] = 0x76543210};
    uint16_t defined = 0x81;
    struct clyps_location row1 = {CLYPS_ROW, 0, 0, 0};
    struct clyps_location row5 = {CLYPS_ROW, 0, 4, 0};
    assert(!clyps_clip_paste(&clip, rows, &defined, row5, 1));
    assert(clyps_clip_copy(&clip, rows, defined, row1));
    assert(clyps_clip_paste(&clip, rows, &defined, row5, 0));
    assert(defined == 0x91 && rows[4] == 0x08421630);
    struct clyps_location cell = {CLYPS_CELL, 0, 7, 2};
    assert(clyps_clip_copy(&clip, rows, defined, cell));
    cell.row = 4;
    assert(clyps_clip_paste(&clip, rows, &defined, cell, 1));
    assert(rows[0] == 0x08421630 && rows[4] == 0x08421230);

    cell.row = 0;
    assert(clyps_clip_copy(&clip, rows, defined, cell));
    cell.row = 7;
    assert(clyps_clip_paste(&clip, rows, &defined, cell, 1));
    assert(rows[7] == 0x76543610 && rows[0] == 0x08421630);

    uint32_t before[16];
    memcpy(before, rows, sizeof rows);
    assert(!clyps_clip_paste(&clip, rows, &defined, cell, 0));
    assert(!clyps_clip_paste(&clip, rows, &defined, row5, 1));
    struct clyps_location invalid[] = {
        {CLYPS_CELL, 0, 3, 2}, {CLYPS_CELL, 0, 4, 1}, {CLYPS_CELL, 7, 4, 2},
        {CLYPS_CELL, 16, 4, 2}, {CLYPS_CELL, 0, 16, 2}, {CLYPS_CELL, 0, 4, 8}
    };
    for (unsigned i = 0; i < sizeof invalid / sizeof invalid[0]; ++i)
        assert(!clyps_clip_paste(&clip, rows, &defined, invalid[i], 1));
    clyps_clip_clear(&clip);
    assert(!clyps_clip_paste(&clip, rows, &defined, cell, 1));
    assert(defined == 0x91 && !memcmp(rows, before, sizeof rows));

    /* Source is a snapshot; a later edit must not change repeated pastes. */
    assert(clyps_clip_copy(&clip, rows, defined, row1));
    rows[0] = 0;
    assert(!clyps_clip_paste(&clip, rows, &defined, row5, 0));
    assert(rows[4] == 0x08421230);
    assert(clyps_clip_paste(&clip, rows, &defined, row5, 1));
    assert(rows[4] == 0x08421630 && rows[0] == 0);
    row1.row = 15;
    assert(!clyps_clip_copy(&clip, rows, defined, row1));
    assert(!clyps_clip_paste(&clip, rows, &defined, row5, 1));
}
