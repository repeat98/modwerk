// SPDX-License-Identifier: GPL-3.0-or-later
// Modwerk's Analog Rytm MKII base: the sequencer's time for the send effects (mw_fx_clock, modwerk/fx.h).
//
// It is read as Retrig Grid reads it, never kept by a clock of its own: the sequencer's 24 PPQN pulse, whose
// next time on the musical clock moves on by one pulse each pulse whatever the pattern's speed, is counted from
// PLAY (the master step is 1 at PLAY); a jump of that time is a (re)start, and the count is set again from the
// master step and pulse. The place between two pulses comes from the musical clock itself, which the audio
// engine moves on by twice the tempo word each block. The pattern's speed and SWING come from the playing
// pattern. An odd step starts SWING - 50, over 50, of a step late, as stock times a step whose swing trig is on.
//
// mw_send_block works it out once a block, before the effect runs, then dates each render: the light block's
// input, rendered a block late, one block back. Only for an effect that asked (mw_fx_clock) the block before: one
// that never asks costs no divisions and no pattern reads, and one that just started asking is placed when it asks.

#include "modwerk/fx.h"

// A few dozen instructions a block: built for size, as the 128 KB the mods share is short.
#pragma GCC optimize ("Os")

#define MCLOCK (*(volatile int *)MCLOCK_AT)                    // the musical clock: + 2 x tempo a block
#define SEQ_PULSE (*(volatile int *)SEQ_PULSE_AT)              // the next pulse's time on it
#define SEQ_STEP (*(volatile unsigned short *)SEQ_STEP_AT)     // its master step, 1 at PLAY
#define SEQ_PULSE_N (*(volatile unsigned char *)SEQ_PULSE_N_AT) // its pulse in that step
#define SEQ_PLAYING (*(volatile int *)SEQ_PLAYING_AT)
#define SEQ_PATTERN (*(volatile signed char *)SEQ_PATTERN_AT)
#define PATTERN(p) ((const volatile signed char *)PATTERNS_AT + 85760 * (p))
#define PAT_SWING 85688                                        // SWING - 50: 0..30
#define PAT_SPEED 85690                                        // 0..6, as SPEED_PULSES
#define SPEED_PULSES ((const int *)SPEED_PULSES_AT)            // 3, 4, 6, 8, 12, 24, 48 pulses a step
#define PULSE 900000                                           // musical-clock units a pulse
#define WRAP (96 * 128)                                        // pulses counted: 128 bars, a multiple of them all
#define BLOCK 16                                               // 24 kHz samples a block

struct mw_fx_clock mw_clk;           // what mw_fx_clock gives: global, so that a debugger finds it
static int count;              // the next pulse's number since PLAY, within WRAP
static int last_pulse, was_playing, now, free_pos;
static char asked, used, dated;      // asked this block; the block before; a date not placed yet

static inline unsigned short irq_off(void)
{
    unsigned short sr;
    __asm__ volatile("move.w %%sr,%0\n\tmove.w #0x2700,%%sr" : "=d"(sr) : : "memory");
    return sr;
}

static inline void irq_restore(unsigned short sr) { __asm__ volatile("move.w %0,%%sr" : : "d"(sr) : "memory"); }

// The swung step and phase of a position (Q16 pulses): pairs of steps, the even one stretched by the swing.
static void place(int pos)
{
    int pps = mw_clk.pps, pair = (pps * 2) << 8, first = (pps * (50 + mw_clk.swing) << 8) / 50;
    int u = pos >> 8, n = u / pair;
    u -= n * pair;                                             // Q8 pulses into the pair
    if (u < first) {
        mw_clk.step = n * 2;
        mw_clk.phase = (u << 16) / first;
    } else {
        mw_clk.step = n * 2 + 1;
        mw_clk.phase = ((u - first) << 16) / (pair - first);
    }
    mw_clk.dphase[0] = mw_clk.inc / first;                     // Q24 pulses a sample over Q8 pulses: Q16
    mw_clk.dphase[1] = mw_clk.inc / (pair - first);
}

// Once a block, in the audio interrupt: the count, and where this block starts.
void mw_clock_block(void)
{
    unsigned short sr = irq_off();
    int pulse = SEQ_PULSE, clock = MCLOCK, step = SEQ_STEP, n = SEQ_PULSE_N, playing = SEQ_PLAYING != 0;
    int p = SEQ_PATTERN, speed = 2, swing = 0, d;
    irq_restore(sr);
    used = asked;
    asked = 0;
    if (!used) p = -1;                                         // the pattern's speed and swing: only if asked
    if (p >= 0 && p < 128) {
        const volatile signed char *pattern = PATTERN(p);
        speed = pattern[PAT_SPEED];
        swing = pattern[PAT_SWING];
    }
    if (speed < 0 || speed > 6) speed = 2;
    if (swing < 0 || swing > 30) swing = 0;
    mw_clk.pps = SPEED_PULSES[speed];
    mw_clk.swing = swing;
    mw_clk.inc = (mw_fx_tempo() * 2386) >> 10;                 // tempo / 8 clock units a sample over PULSE: Q24
    if (playing) {
        if (!was_playing || pulse - last_pulse != (pulse != last_pulse) * PULSE) {   // a (re)start, or a jump
            count = ((step - 1) * mw_clk.pps + n) % WRAP;
            if (count < 0) count += WRAP;
            if (!was_playing) mw_clk.starts++;
        } else if (pulse != last_pulse && ++count == WRAP) {
            count = 0;
        }
        last_pulse = pulse;
        d = pulse - clock;                                     // to the next pulse, in clock units
        if (d < 0) d = 0;
        if (d > PULSE) d = PULSE;
        now = (count << 16) - (int)(((unsigned)d * 4772u) >> 16);   // d / PULSE, Q16
        if (now < 0) now = 0;                                  // PLAY's first pulse still to come: at 0
    } else {
        now = free_pos;                                        // stopped: on at the tempo
    }
    was_playing = playing;
    mw_clk.playing = playing;
    free_pos = now + ((BLOCK * mw_clk.inc) >> 8);
    if (free_pos >= WRAP << 16) free_pos -= WRAP << 16;
}

// The block render is about to run on: 0 this one, 1 the block before (the light block's input).
void mw_clock_date(int back)
{
    int pos = now - back * ((BLOCK * mw_clk.inc) >> 8);
    if (pos < 0) pos = 0;
    mw_clk.pos = pos;
    dated = !used;
    if (used) place(pos);
}

// What the effect asks for. An effect that did not ask the block before is placed now (its pattern's speed and
// swing then read as the block began: at most a block late).
const struct mw_fx_clock *mw_fx_clock(void)
{
    asked = 1;
    if (dated) {
        int p = SEQ_PATTERN, speed = 2, swing = 0;
        if (p >= 0 && p < 128) {
            speed = PATTERN(p)[PAT_SPEED];
            swing = PATTERN(p)[PAT_SWING];
        }
        if (speed < 0 || speed > 6) speed = 2;
        if (swing < 0 || swing > 30) swing = 0;
        mw_clk.pps = SPEED_PULSES[speed];
        mw_clk.swing = swing;
        dated = 0;
        place(mw_clk.pos);
    }
    return &mw_clk;
}
