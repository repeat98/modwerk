// SPDX-License-Identifier: GPL-2.0-only
// Envelopes: ENV RESET pre-fade (Nathaniel Pavel, from Env Reset Amp 1.1): fade a sounding voice out before a
// trig the Rytm schedules itself, so stock's attack, which ramps from the
// current level, restarts from silence without a click.
//
// The sequencer queues each track's next trig a step ahead, its probability
// already rolled, in the track's first event slot (state 1), and keeps the time
// it will fire at in the track's event times. Mutes are applied only when the
// trig fires, so they are read here the same way. Read in OS 1.74 and checked
// in rytm-emu: a queued trig always fired and an unqueued one never did, at 50 %
// and without a condition; a muted track's trig stays queued but does not fire.
// A retrig series (a trig's RTRG, or a pad held with RTRG) fires on its own
// tick counter, which stock steps once a tick (0x4012089a); the next hits are
// worked out the same way. Pads, MIDI and a trig queued less than the fade ahead
// (the first after PLAY) are not seen in time: those play as stock.

#include <stdint.h>

#define TRACKS 12
#define FADE_BLOCKS 10                  // the fade starts up to 11 blocks (7.3 ms) before the trig

#define CLOCK (*(volatile int32_t *)0x8000fe54)     // musical clock, + 2 x TEMPO a block
#define TEMPO (*(volatile int32_t *)0x40287ffc)     // BPM x 120
#define EVENT(t) (*(volatile int32_t *)(0x8000fd50 + 12 * (t)))    // next event's time
#define SLOT(t) (*(volatile int32_t *)(0x42ac5fb0 + 224 * (t)))    // 1: a trig queued
#define TRACK_HELD(t) (*(volatile int32_t *)(0x42ad4c30 + 6668 * (t) + 6664))
#define MUTES (*(volatile uint32_t *)0x8000ed98)
#define SOLOS (*(volatile uint32_t *)0x8000ed9c)
#define LIVE_MUTES (*(volatile uint16_t *)0x8000fc90)
#define ENV_RESET ((volatile uint8_t *)0x8000ea30)  // [track] bit 0 amp
#define TRACK_VOICE ((const uint8_t *)0x4025a3a0)   // [track] physical voice
#define TICK 90000                      // clock units in a 240 PPQN tick
#define RT_TRIG(t) (*(volatile int32_t *)(0x42ac6b48 + 56 * (t)))    // nonzero: a series runs
#define RT_RATE(t) (*(volatile int32_t *)(0x42ac6b48 + 56 * (t) + 36))  // RETRIG 0..16
#define RT_COUNT ((volatile int32_t *)0x42adf5d0)   // [track] 960..1, -1 a tick
#define RT_DEADLINE ((volatile int32_t *)0x8000fdec)    // [track] its next tick's time
#define RT_FIRES ((const volatile uint16_t *)0x402909b8)  // [count] bit RATE-1: fires

// The amp writer's state (amp-write.s reads it for every voice every block), kept together so
// a voice with nothing to do touches three 16-byte lines: [0] the voices to fade this block, [1] of
// those, the voices whose fade starts now, [2] the voices whose last record left the level
// follower unchanged (envelopes.c), [4 + v] and [12 + v] that record's rate and level words.
volatile uint32_t envelopes_gate[20] __attribute__((aligned(16)));
#define envelopes_mask envelopes_gate[0]
#define envelopes_first envelopes_gate[1]

// Clock units from now to track t's next retrig, as stock counts it, or -1 when
// none falls within window. A series that fires again sooner than twice the
// window gets half its spacing to fade in instead, so a fast roll still sounds.
static int32_t retrig_ahead(int t, int32_t clock, int32_t window)
{
    int32_t count = RT_COUNT[t], at = RT_DEADLINE[t] - clock, first = -1;
    int rate = RT_RATE(t);

    // A deadline already past is a series stock no longer ticks.
    if (rate < 0 || rate > 16 || at < -TICK)
        return -1;
    for (; at < 2 * window; at += TICK) {
        if (--count <= 0) {
            count = 960;
        } else if (!(RT_FIRES[count] * 2 >> rate & 1)) {
            continue;
        }
        if (first < 0) {
            if (at >= window)
                return -1;
            first = at;
        } else {
            return first < (at - first) / 2 ? first : -1;
        }
    }
    return first;
}

// Called by the amp writer for voice 0, once a block, while a track's sound has AMP in its
// ENV RESET: the voices whose sound restarts its amp envelope on a scheduled trig or retrig
// within FADE_BLOCKS. With none, the writer clears the mask itself (as this finds).
void envelopes_scan(void)
{
    uint32_t mask = 0, muted;
    int32_t window, clock = CLOCK;
    int t;

    // As stock decides at the trig (0x4011ffde): solo mutes every other track.
    muted = SOLOS ? ~SOLOS & ~0x1000u : MUTES;
    muted |= LIVE_MUTES;
    // The trig fires in the block its time falls in; the clock is this block's start.
    window = (FADE_BLOCKS + 1) * 2 * TEMPO;
    for (t = 0; t < TRACKS; t++) {
        int32_t ahead;

        if ((muted >> t & 1) || !(ENV_RESET[t] & 1))
            continue;
        ahead = -1;
        if (SLOT(t) == 1 && !TRACK_HELD(t))
            ahead = EVENT(t) - clock;
        if ((ahead < 0 || ahead >= window) && RT_TRIG(t))
            ahead = retrig_ahead(t, clock, window);
        if (ahead >= 0 && ahead < window)
            mask |= 1u << TRACK_VOICE[t];
    }
    envelopes_first = mask & ~envelopes_mask;
    envelopes_mask = mask;
}
