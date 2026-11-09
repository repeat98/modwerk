// SPDX-License-Identifier: GPL-2.0-only
// Improved AMP's pre-fade for ENV RESET AMP (Nathaniel Pavel; from Env Reset Amp 1.1): fade a sounding voice out before a
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
// (the first after PLAY) are not seen in time: those play as stock. On external
// MIDI clock the clock restarts its estimate from each tick's arrival, so after
// a late tick the next one fires its trig early by the lateness: the fade is
// that much shorter, and none from about 6 ms late (EN05, measured on the unit).
//
// A queued trig is judged by the sound it will play, as stock picks it when it fires
// (0x401201f8..0x40120308): a sound lock (the slot's +0x18, 0..127) plays that pool sound;
// without one (-1) the slot's kit (+0x1c) plays its own sound for the track. ENV RESET is the
// sound's byte +0x6c, the one stock copies to ENV_RESET[track] when it applies the sound. A
// retrig keeps the sound of the trig that started it, ENV_RESET[track].

#include <stdint.h>

#define TRACKS 12
#define FADE_BLOCKS 10                  // the fade starts up to 11 blocks (7.3 ms) before the trig

#define CLOCK (*(volatile int32_t *)0x8000fe54)     // musical clock, + 2 x TEMPO a block
#define TEMPO (*(volatile int32_t *)0x40287ffc)     // BPM x 120
#define EVENT(t) (*(volatile int32_t *)(0x8000fd50 + 12 * (t)))    // next event's time
#define SLOT(t) (*(volatile int32_t *)(0x42ac5fb0 + 224 * (t)))    // 1: a trig queued
#define SLOT_LOCK(t) (*(volatile int32_t *)(0x42ac5fc8 + 224 * (t)))   // its sound lock, -1 none
#define SLOT_KIT(t) (*(volatile int8_t *)(0x42ac5fcc + 224 * (t)))     // its kit
#define POOL_SOUND(i) ((const volatile uint8_t *)0x41313c47 + 152 * (i))  // the live pool
#define KIT_SOUND(k, t) ((const volatile uint8_t *)0x4125590d + 2531 * (k) + 152 * (t))  // a live kit's
#define SOUND_ENV_RESET 0x6c                // a sound's ENV RESET byte
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

volatile uint32_t amp_prefade_mask;   // voices to fade this block
volatile uint32_t amp_prefade_first;  // of those, the voices whose fade starts now

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

// The ENV RESET the queued trig on track t will play with.
static int queued_env_reset(int t)
{
    int32_t lock = SLOT_LOCK(t);
    int kit = SLOT_KIT(t);

    if (lock >= 0 && lock < 128)
        return POOL_SOUND(lock)[SOUND_ENV_RESET];
    if (lock == -1 && kit >= 0 && kit < 128)
        return KIT_SOUND(kit, t)[SOUND_ENV_RESET];
    return ENV_RESET[t];
}

// Called by the amp writer for voice 0, once a block: the voices whose sound
// restarts its amp envelope on a scheduled trig or retrig within FADE_BLOCKS.
void amp_prefade_scan(void)
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

        if (muted >> t & 1)
            continue;
        ahead = -1;
        if (SLOT(t) == 1 && !TRACK_HELD(t) && (queued_env_reset(t) & 1))
            ahead = EVENT(t) - clock;
        if ((ahead < 0 || ahead >= window) && RT_TRIG(t) && (ENV_RESET[t] & 1))
            ahead = retrig_ahead(t, clock, window);
        if (ahead >= 0 && ahead < window)
            mask |= 1u << TRACK_VOICE[t];
    }
    amp_prefade_first = mask & ~amp_prefade_mask;
    amp_prefade_mask = mask;
}
