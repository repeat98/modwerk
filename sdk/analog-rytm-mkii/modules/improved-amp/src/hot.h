// SPDX-License-Identifier: GPL-2.0-only
// Improved AMP: the words its two amp record entries read every block for every voice, kept
// together so an idle block touches one 16-byte cache line of the module's data, and a second
// one for voice 0. amp-write.s and pre-fade.s name the same offsets (HOT_*): keep them in step.
#ifndef IMPROVED_AMP_HOT_H
#define IMPROVED_AMP_HOT_H

#include <stdint.h>

extern volatile uint32_t improved_amp_hot[24];

// Line 0: a bit a voice.
#define amp_prefade_mask improved_amp_hot[0]     // voices to fade this block
#define amp_prefade_started improved_amp_hot[1]  // of those, the voices whose ramp has been started (pre-fade.s)
#define GATE_ZERO improved_amp_hot[2]            // of GATE_STILL, the voices whose record taken was 0/0 (idle)
#define GATE_STILL improved_amp_hot[3]           // voices the last record taken left as they were
// Line 1: the trig scan's own, read for voice 0.
#define SCAN_CLOCK improved_amp_hot[4]           // the clock at the last scan
#define SCAN_STOOD improved_amp_hot[5]           // blocks the clock has stood, to FADE_BLOCKS + 2
// Lines 2 to 5: the record taken, a voice.
#define GATE_RATE(v) improved_amp_hot[8 + (v)]
#define GATE_LW(v) improved_amp_hot[16 + (v)]

#endif
