/* SPDX-License-Identifier: GPL-2.0-or-later */
#include <assert.h>
#include "../seq-grid.h"

int main(void)
{
    struct dt2_seq_grid_window window = {.pulses_per_step = 6};
    assert(core_seq_grid_timing(&window, 451101600, 6, 20,
                               DT2_SEQ_GRID_SWING_NOW | DT2_SEQ_GRID_SWING_FOLLOWING));
    assert(window.nominal == 455601600);
    assert(window.previous == 450201600);
    assert(window.onset == 457761600);
    assert(window.next == 461001600);
    assert(window.following == 468561600);

    window.pulses_per_step = 3;
    assert(core_seq_grid_timing(&window, UINT32_MAX - 900000u, 2, 20,
                               DT2_SEQ_GRID_SWING_PREVIOUS | DT2_SEQ_GRID_SWING_NEXT));
    assert(window.nominal == UINT32_MAX && window.onset == UINT32_MAX);
    assert(window.previous == UINT32_MAX - 1620000u);
    assert(window.next == 3779999u && window.following == 5399999u);
    assert(!core_seq_grid_timing(&window, 0, 0, 20, 0));
    assert(!core_seq_grid_timing(&window, 0, 4, 20, 0));
    assert(!core_seq_grid_timing(&window, 0, 3, 31, 0));

    window.pulses_per_step = 0;
    assert(!core_seq_grid_timing(&window, 0, 1, 0, 0));
    return 0;
}
