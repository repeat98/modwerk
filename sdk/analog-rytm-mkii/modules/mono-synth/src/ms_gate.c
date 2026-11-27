/* SPDX-License-Identifier: GPL-3.0-or-later */
/* ms_gate.h. The amp's record, as the base's README and modwerk/amp.h describe it: a level
 * word whose low byte is the segment's target (a signed level, -128 silence, 127 full) and a
 * rate word, mode [31:28], flags [23:20] (bit 20: a one-pole segment, else linear) and a
 * 20-bit coefficient, exponent [19:16] and mantissa [15:0]. A rate and level of 0 send
 * nothing: the running segment goes on. Stock repeats a decay's record every block, so a
 * segment starts when the record changes.
 *
 * Per tick of two samples a linear segment moves step / 2^23 levels and a one-pole one keeps
 * (2^31 - step) / 2^31 of its distance. So a linear fall over the whole range takes
 * 256 x 2^23 / step ticks, 2^27 / step blocks of 16 ticks; a one-pole fall to within half a
 * level of 256 takes ln 512 x 2^31 / step ticks, about 0.78 x 2^30 / step blocks. Both are
 * taken with margin (the unit's amp decays faster than that, never slower), and a voice goes
 * quiet only once the whole time has passed with no new record. */
#include "ms_gate.h"

#define SILENCE 0x80u               /* the target byte of a fall to silence */
#define GRACE 4                     /* blocks after a hit: the trig's attack record may come later */
#define MARGIN 16                   /* blocks added to every estimate */

static uint32_t step_of(uint32_t rate)
{
    uint32_t e = rate >> 16 & 15, m = rate & 0xffff;
    uint32_t s = (0x7fffffffu - (m << 14)) >> e;
    return s > 32768u ? s - 32768u : 1;
}

uint32_t ms_gate_blocks(uint32_t rate)
{
    uint32_t step = step_of(rate);
    uint32_t n = rate >> 20 & 1 ? 0x40000000u / step       /* one-pole: 2^30, 1.28 x ln 512 */
                                : 0x0a000000u / step;      /* linear: 1.25 x 2^27 */
    return n + MARGIN;
}

void ms_gate_hit(struct ms_gate *g)
{
    g->falling = 0;
    g->left = 0;
    g->rate = g->level = 0;
    g->grace = GRACE;
}

int ms_gate_block(struct ms_gate *g, int32_t state, uint32_t rate, uint32_t level)
{
    if (g->grace) {
        g->grace--;
        return 1;
    }
    if (rate || level) {
        if ((level & 0xff) != SILENCE || (state != 3 && state != 4)) {
            g->falling = 0;                         /* an attack, a hold, a level kept */
            return 1;
        }
        if (!g->falling || rate != g->rate || level != g->level) {
            g->falling = 1;                         /* a fall to silence starts */
            g->rate = rate;
            g->level = level;
            g->left = ms_gate_blocks(rate);
        }
    }
    if (!g->falling)
        return 1;                                   /* 0/0 with nothing falling: INF, held */
    if (g->left) {
        g->left--;
        return 1;
    }
    return 0;
}
