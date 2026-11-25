// SPDX-License-Identifier: GPL-3.0-or-later
// Every base (base.json's common): the audio load for the link's LOAD and the diagnostics log (diag.c). The core
// measures each audio block (32 frames, 1,500 a second) from its ev_render_in to its ev_render_out as a share of the
// time between two blocks: core_audio_load, 256 = the whole period (analog-rytm-mk2/load.h). This handler runs after
// the core's own ev_render_out (order 100), so it reads this block's figure, and sums it over a window of 750 blocks
// (half a second): the window's mean, its dearest block and the dearest since boot, in tenths of a percent, as the
// Model:Cycles' load.c reports them. A single block's figure is less sure than the mean: the core divides by the time
// since the block before began, so a block after a late one reads high (perf-cpu-mark.c). It also hands diag.c each
// block's end on DMA timer 0 (the core's clock, DTCN0), for the gaps between blocks. About 25 instructions a block.
#include <stdint.h>
#include "analog-rytm-mk2/load.h"
#include "diag.h"

#ifdef MODWERK_HOST
extern volatile uint32_t mw_test_timer;
#define DTCN0 mw_test_timer
#else
#define DTCN0 (*(volatile uint32_t *)0xfc07000c)
#endif
#define WINDOW 750u                 // blocks in a window: 0.5 s
#define FULL 256u                   // core_audio_load's whole period

uint32_t mw_load_avg, mw_load_wmax, mw_load_peak, mw_load_windows, mw_load_blocks;
static uint32_t sum, count, wmax;

/** A block's figure (256ths of the period) as tenths of a percent. */
uint32_t mw_load_tenths(uint32_t l)
{
    return l * 1000u / FULL;
}

void mw_load_out(void)
{
    uint32_t l = core_audio_load;
    if (l > FULL)
        l = FULL;
    mw_diag_block(DTCN0);
    mw_load_blocks++;
    sum += l;
    if (l > wmax)
        wmax = l;
    if (l > mw_load_peak)
        mw_load_peak = l;
    if (++count == WINDOW) {
        mw_load_avg = sum * 1000u / (WINDOW * FULL);
        mw_load_wmax = wmax;
        mw_load_windows++;
        mw_diag_window(mw_load_avg, mw_load_tenths(wmax));
        sum = count = wmax = 0;
    }
}
