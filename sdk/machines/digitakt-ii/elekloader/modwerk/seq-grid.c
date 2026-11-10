/* SPDX-License-Identifier: GPL-2.0-or-later */
#include "seq-grid.h"

int core_seq_grid_timing(struct dt2_seq_grid_window *window, uint32_t tick,
                         unsigned int lookahead, unsigned int swing, unsigned int flags)
{
    const unsigned int pulses = window->pulses_per_step;
    if (!pulses || pulses > 48 || !lookahead || lookahead > pulses || swing > 30) {
        return 0;
    }

    const uint32_t period = pulses * UINT32_C(900000);
    const uint32_t delay = pulses * swing * UINT32_C(18000);
    window->nominal = tick + (lookahead - 1u) * UINT32_C(900000);
    window->onset = window->nominal + (flags & DT2_SEQ_GRID_SWING_NOW ? delay : 0);
    window->next = window->nominal + period + (flags & DT2_SEQ_GRID_SWING_NEXT ? delay : 0);
    window->previous = window->nominal - period + (flags & DT2_SEQ_GRID_SWING_PREVIOUS ? delay : 0);
    window->following = window->nominal + 2 * period + (flags & DT2_SEQ_GRID_SWING_FOLLOWING ? delay : 0);
    return 1;
}
