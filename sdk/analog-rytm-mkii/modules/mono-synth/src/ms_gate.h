/* SPDX-License-Identifier: GPL-3.0-or-later */
/* When a voice's analog AMP has closed, from the records stock sends it (modwerk/amp.h), so the
 * oscillator can go quiet and the base can end the hit. Pure C, host-tested. */
#ifndef MS_GATE_H
#define MS_GATE_H

#include <stdint.h>

struct ms_gate {
    uint32_t rate, level;           /* the last record that started a segment */
    uint32_t left;                  /* blocks until a fall to silence is surely over; 0 none */
    uint8_t falling;                /* a segment towards silence is running */
    uint8_t grace;                  /* blocks after a hit when the amp is not read */
};

/* A new hit on the voice. */
void ms_gate_hit(struct ms_gate *g);
/* One block: the amp's state and the record sent this block. 1 while the voice may still be
 * heard, 0 once its AMP has surely reached silence. */
int ms_gate_block(struct ms_gate *g, int32_t state, uint32_t rate, uint32_t level);
/* Blocks a segment with this rate word takes to cross the whole range, with margin. */
uint32_t ms_gate_blocks(uint32_t rate);

#endif
