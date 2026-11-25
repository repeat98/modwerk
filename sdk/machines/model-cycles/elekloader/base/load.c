// SPDX-License-Identifier: GPL-3.0-or-later
// Every base (base.json's add): the audio load, from the probe in load.s. Each codec block's busy time
// (the audio function, in DMA timer 0 ticks) is summed over a window of 750 blocks (half a second): the window's share
// of the CPU is the sum over 750 nominal blocks, in tenths of a percent. The link's LOAD reports it, the window's
// dearest block and the dearest block since boot. About 25 instructions a block.
#include <stdint.h>
#include "diag.h"

#define BLOCK_TICKS 90112u          // DMA timer 0 ticks in one codec block (135.168 MHz)
#define WINDOW 750u                 // blocks in a window: 0.5 s
#define BLOCK_MAX 0x400000u         // a busy time over 46 blocks is a timer wrap, not a block

uint32_t mw_load_tenths(uint32_t ticks);
uint32_t mw_load_ret, mw_load_t0;   // load.s: the probe's saved return address and start time
uint32_t mw_load_avg, mw_load_wmax, mw_load_peak, mw_load_windows, mw_load_blocks;
static uint32_t sum, count, wmax;

void mw_load_block(uint32_t busy)
{
    if (busy > BLOCK_MAX)
        busy = BLOCK_MAX;
    mw_diag_block(mw_load_t0);
    mw_load_blocks++;
    sum += busy;
    if (busy > wmax)
        wmax = busy;
    if (busy > mw_load_peak)
        mw_load_peak = busy;
    if (++count == WINDOW) {
        mw_load_avg = sum / (WINDOW * BLOCK_TICKS / 1000);
        mw_load_wmax = wmax;
        mw_load_windows++;
        mw_diag_window(mw_load_avg, mw_load_tenths(wmax));
        sum = count = wmax = 0;
    }
}

/** A block's busy ticks as tenths of a percent of a nominal block. */
uint32_t mw_load_tenths(uint32_t ticks)
{
    return ticks * 1000u / BLOCK_TICKS;
}
