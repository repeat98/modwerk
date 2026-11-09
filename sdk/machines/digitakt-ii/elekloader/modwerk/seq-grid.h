/* SPDX-License-Identifier: GPL-2.0-or-later */
#ifndef MODWERK_DT2_SEQ_GRID_H
#define MODWERK_DT2_SEQ_GRID_H

#include <stdint.h>

#define DT2_SEQ_GRID_HANDLERS 4
#define DT2_SEQ_GRID_SWING_NOW 1u
#define DT2_SEQ_GRID_SWING_NEXT 2u
#define DT2_SEQ_GRID_SWING_PREVIOUS 4u
#define DT2_SEQ_GRID_SWING_FOLLOWING 8u

struct dt2_seq_grid_window {
    uint32_t nominal;
    uint32_t onset;
    uint32_t next;
    uint16_t pattern;
    uint8_t track;
    uint8_t step;
    uint8_t length;
    uint8_t pulses_per_step;
    uint32_t previous;
    uint32_t following;
};

/* Local prototype. All deadlines are in the wrapping stock musical time domain. */
typedef void (*dt2_seq_grid_handler)(const struct dt2_seq_grid_window *);
extern dt2_seq_grid_handler const ev_seq_grid[DT2_SEQ_GRID_HANDLERS];

int core_seq_grid_timing(struct dt2_seq_grid_window *window, uint32_t tick,
                         unsigned int lookahead, unsigned int swing, unsigned int flags);

#endif
