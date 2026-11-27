// SPDX-License-Identifier: GPL-3.0-or-later
// Every base (base.json's common): the audio load for the link's LOAD and the diagnostics log (diag.c), at no cost to
// the audio interrupt. The core measures each audio block (32 frames, 1,500 a second) from its ev_render_in to its
// ev_render_out as a share of the time between two blocks: core_audio_load, 256 = the whole period
// (analog-rytm-mk2/load.h). The lean engine's CPU mark (perf-cpu-mark.c) already adds every block's figure up in the
// interrupt for its own mark, and keeps the look's dearest; each look (every tenth UI tick, about half a second) it
// hands the sums here, on the UI task. So this file adds no code to the interrupt, and the mark three instructions
// (13 a block instead of 10).
// LOAD reports the last look's mean, its dearest block and the dearest since boot, in tenths of a percent, as the
// Model:Cycles' load.c does. A single block's figure is less sure than the mean: the core divides by the time since
// the block before began, so a block after a late one reads high (perf-cpu-mark.c).
#include <stdint.h>
#include "diag.h"

#define FULL 256u                   // core_audio_load's whole period

uint32_t mw_load_avg, mw_load_wmax, mw_load_peak, mw_load_windows, mw_load_blocks;

/** A block's figure (256ths of the period) as tenths of a percent. */
uint32_t mw_load_tenths(uint32_t l)
{
    return (l > FULL ? FULL : l) * 1000u / FULL;
}

// From the CPU mark's tick: one look's sum of block figures, its blocks and its dearest block. No look without
// blocks (a stopped interrupt) changes the readings.
void mw_load_look(uint32_t sum, uint32_t blocks, uint32_t peak)
{
    if (!blocks) {
        mw_diag_window(0, 0, 0);    // the log still marks the look's time, so its next block length is one look's
        return;
    }
    if (peak > FULL)
        peak = FULL;
    // sum is at most 256 a block, so sum * 1000 fits 32 bits up to 16,777 blocks (11 s); a longer look (a stalled UI)
    // takes the mean first, to 4 tenths
    mw_load_avg = blocks <= 16000u ? sum * 1000u / (blocks * FULL) : sum / blocks * 1000u / FULL;
    mw_load_wmax = peak;
    if (peak > mw_load_peak)
        mw_load_peak = peak;
    mw_load_windows++;
    mw_load_blocks += blocks;
    mw_diag_window(mw_load_avg, mw_load_tenths(peak), blocks);
}
