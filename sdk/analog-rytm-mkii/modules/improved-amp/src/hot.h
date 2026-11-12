// SPDX-License-Identifier: GPL-2.0-only
// Improved AMP: the words its amp record entries and its OVR reader use every block for every
// voice, kept together so an idle block touches few 16-byte cache lines of the module's data:
// line 0 for the two entries, line 1 for voice 0's scan, lines 6 and 7 for the OVR reader.
// amp-write.s, pre-fade.s and ovr.s name the same offsets (HOT_*): keep them in step.
#ifndef IMPROVED_AMP_HOT_H
#define IMPROVED_AMP_HOT_H

#include <stdint.h>

extern volatile uint32_t improved_amp_hot[40];

// Line 0: a bit a voice.
#define amp_prefade_mask improved_amp_hot[0]     // voices to fade this block
#define amp_prefade_started improved_amp_hot[1]  // of those, the voices whose ramp has been started (pre-fade.s)
#define GATE_ZERO improved_amp_hot[2]            // of GATE_STILL, the voices whose record taken was 0/0 (idle)
#define GATE_STILL improved_amp_hot[3]           // voices the last record taken left as they were
// Line 1: the trig scan's own, read for voice 0; SCAN_DELTA is read for every holding voice too.
#define SCAN_CLOCK improved_amp_hot[4]           // the clock at the last scan
#define SCAN_STOOD improved_amp_hot[5]           // blocks the clock has stood, to FADE_BLOCKS + 2
#define SCAN_DELTA improved_amp_hot[6]           // what the clock moved this block, for the hold (improved-amp.c)
// Lines 2 to 5: the record taken, a voice.
#define GATE_RATE(v) improved_amp_hot[8 + (v)]
#define GATE_LW(v) improved_amp_hot[16 + (v)]
// Lines 6 and 7: the OVR reader's last answer, a voice (ovr.s): the live word in the high half, its
// CV in the low half. Zero at boot, which is a true pair: OVR 0 gives CV 0.
#define OVR_MEMO(v) improved_amp_hot[24 + (v)]
// Lines 8 and 9: a holding voice's count on the musical clock (improved-amp.c).
#define HOLD_ACC(v) improved_amp_hot[32 + (v)]

#endif
