// SPDX-License-Identifier: GPL-2.0-only
// Improved AMP's pre-fade for ENV RESET AMP (Nathaniel Pavel; from Env Reset Amp 1.1): fade a sounding voice out before a
// trig the Rytm schedules itself, so stock's attack, which ramps from the
// current level, restarts from silence without a click.
//
// The sequencer queues each track's next trig a step ahead, its probability
// already rolled, in the lowest free of the track's three event slots
// (0x4009b5f2), and keeps the time it will fire at in the track's event times. A
// trig queued while an earlier one still waits (micro timing, swing) sits in the
// second or third slot, so all three are read. Mutes are applied only when the
// trig fires, so they are read here the same way. Read in OS 1.74 and checked
// in rytm-emu: a queued trig always fired and an unqueued one never did, at 50 %
// and without a condition; a muted track's trig is queued all the same and dropped,
// unplayed, when its time comes (0x4012001e).
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
// retrig keeps the sound of the trig that started it, ENV_RESET[track]. A locked pool sound
// whose machine does not fit the track is not applied (0x40120212..0x4012023e): the kit's plays.
// The kit's sound is not applied again while the track still holds it: stock keeps the kit each
// track's sound came from (0x8000fc58, -1 after a sound lock) and skips the copy when the trig's
// kit is that one and the track's byte at 0x8000fe30 is not above 0 (0x40120298). Such a trig
// plays with ENV_RESET[track] as it stands. The byte counts the parameter locks stock has applied
// since the sound was loaded (0x40120a5a): an event that fires with locks, a lock trig without a
// note too, raises it, and the next trig of the same kit loads the kit's sound again. The byte is
// read as it stands, so a lock trig still queued ahead of a trig of the same kit is not counted:
// that trig is judged by ENV_RESET[track] where stock will play the kit's sound, which matters only
// when the two differ. The fade then comes late or not at all, as stock; a voice is never held.
// A sound lock that is neither -1 nor 0..127 takes stock's pool path without the machine check
// (0x40120292); such a trig, and one whose kit is below 0, is judged by ENV_RESET[track].
//
// Only an event that plays a note restarts the amp envelope: stock sets the trig's bit 17, the
// one amp_env_commands waits for, when the event's flags have a bit of 0x180 (0x401201d4 for a
// queued trig, 0x40120978 for a retrig). An event without one is left alone. A track whose held
// word is set drops its queued trig (0x40120018): it is not faded for. The byte stock tests
// before it steps a retrig series (0x40120892, 0x8000fc13 + track) is no switch: stock sets it
// each block from the series' deadline (0x4011fea4), so it only says a tick is due this block.
//
// Stock handles one queued event a track a block: the lowest slot of those due, an event being
// due from the block its time falls in (0x4011fe82, 0x4011ff54..0x401204fa). Two events due in
// one block take that block and the next, the lower slot first, so the blocks are worked out the
// same way here, and an event still waiting past its time fires in the next block. The first
// event that plays a note decides: its sound's ENV RESET, and nothing after it.
//
// A retrig series ends in two ways, and a hit after its end never comes, so it is not faded for
// (the voice would stay silent and lose its tail). A trig's series has a length: stock counts it
// down by TEMPO a block (0x40120c22) and ends the series when it runs out, after the block's
// retrigs. And the track's next trig that plays a note ends it in the block it fires in, before
// that block's retrig (0x401203ba), whatever its sound's ENV RESET. A pad let go ends its roll at
// once, which nothing announces: let go within the fade before a hit, its last hit's tail is cut.
// A queued event that fires (a lock trig too) takes its track's turn in the block it fires in
// (0x401200ca, 0x40120872): a retrig tick due in that block is stepped a block later, which can
// carry a series' last hit past its end. Stock steps one tick a block, firing or not, so above
// 187.5 BPM (a block longer than half a tick) a tick moved a block can move the next one too.
// A lock trig without a note whose RTRG is on gives the running series its own rate (0x401204ba):
// the ticks stepped after its block are counted at that rate. The rate is the pattern's byte,
// sign-extended (0x4009b01e), and stock shifts by its low six bits (0x401208c0), so a rate whose
// low six bits are 0 or above 16 fires on the counter's wrap only; it is counted the same way.
// A slot in state 2 is dropped when due (0x4011ff8a) and uses up its track's event for that block
// without taking the turn. The queue's writer stores 1 (0x4009b04e) and no writer of 2 into the
// three queued slots was found, so that case is not counted.
//
// The series' length is counted in blocks and the hits in clock units, 2 x TEMPO a block on the
// internal clock. On external MIDI clock a block moves the clock by what the master's ticks give
// (0x40121594), and stock holds the clock a block short of the next tick's time until the tick
// comes (0x40121612..0x40121670), so a block can move it less, or not at all. A last hit within
// a block of the series' end can then be judged wrong either way.
//
// Not read to the end: on a pattern change stock clears queued events from the change on
// (0x4009bc60, 0x4009b6e0). One cleared inside the fade leaves a dip of at most the fade.
//
// The clock stands still when an external master stops sending ticks. A trig queued inside the
// window would keep its voice faded for as long, so the fades end once the clock has stood for
// longer than a fade.

#include <stdint.h>
#include "hot.h"

#define TRACKS 12
#define FADE_BLOCKS 10                  // a voice fades from 10 blocks (6.7 ms) before its trig fires

#define CLOCK (*(volatile int32_t *)0x8000fe54)     // musical clock, + 2 x TEMPO a block
#define TEMPO (*(volatile int32_t *)0x40287ffc)     // BPM x 120
#define SLOTS 3                         // queued events a track; a fourth slot takes pads and MIDI at once
#define EVENT(t, s) (*(volatile int32_t *)(0x8000fd50 + 12 * (t) + 4 * (s)))   // a slot's event's time
#define EVENT_TIMES ((volatile int32_t *)0x8000fd50)    // the same, [SLOTS * track + slot]
#define SLOT(t, s) (*(volatile int32_t *)(0x42ac5fb0 + 224 * (t) + 56 * (s)))  // 0 free, 2 let go, else queued
#define SLOT_FLAGS(t, s) (*(volatile int32_t *)(0x42ac5fc4 + 224 * (t) + 56 * (s)))  // & PLAYS: restarts the amp
#define PLAYS 0x180
#define SLOT_LOCK(t, s) (*(volatile int32_t *)(0x42ac5fc8 + 224 * (t) + 56 * (s)))  // its sound lock, -1 none
#define SLOT_KIT(t, s) (*(volatile int8_t *)(0x42ac5fcc + 224 * (t) + 56 * (s)))    // its kit
#define SLOT_RATE(t, s) (*(volatile int32_t *)(0x42ac5fd4 + 224 * (t) + 56 * (s)))  // its RTRG rate, a signed byte
#define RTRG_ON 2                       // in a slot's flags: its RTRG is on
#define NO_RATE 0x100                   // in rates[]: the event leaves the series' rate alone
#define HORIZON (2 * (FADE_BLOCKS + 1)) // blocks looked ahead
// An event's time, from this block's start, outside what the scan counts: too far ahead, or past by more
// than the slots can hold it up.
#define NOT_NEAR(at, block) ((at) >= HORIZON * (block) || (at) < -(SLOTS + 1) * (block))
#define POOL_SOUND(i) ((const volatile uint8_t *)0x41313c47 + 152 * (i))  // the live pool
#define KIT_SOUND(k, t) ((const volatile uint8_t *)0x4125590d + 2531 * (k) + 152 * (t))  // a live kit's
#define SOUND_ENV_RESET 0x6c                // a sound's ENV RESET byte
#define SOUND_MACHINE 0x68                  // its machine, 0..52
#define MACHINE_FITS(m) (((const volatile uint8_t *)0x401bf42d)[2 * (m)])  // bit: a track type it fits
#define TRACK_TYPE ((const volatile int32_t *)0x401bf498)   // [track] 0..7
#define TRACK_KIT ((const volatile int32_t *)0x8000fc58)    // [track] the kit its sound came from, -1 a sound lock
#define TRACK_REAPPLY ((const volatile int8_t *)0x8000fe30) // [track] > 0: stock applies the kit's sound again
#define TRACK_HELD(t) (*(volatile int32_t *)(0x42ac7c30 + 6668 * (t) + 6664))  // nonzero: its trig is dropped
#define MUTES (*(volatile uint32_t *)0x8000ed98)
#define SOLOS (*(volatile uint32_t *)0x8000ed9c)
#define LIVE_MUTES (*(volatile uint16_t *)0x8000fc90)
#define ENV_RESET ((volatile uint8_t *)0x8000ea30)  // [track] bit 0 amp
#define ENV_RESET_WORDS ((volatile uint32_t *)0x8000ea30)   // the 12 bytes as three words
#define TRACK_VOICE ((const uint8_t *)0x4025a3a0)   // [track] physical voice
#define TICK 90000                      // clock units in a 240 PPQN tick
#define RT_TRIG(t) (*(volatile int32_t *)(0x42ac6b48 + 56 * (t)))    // nonzero: a series runs
#define RT_FLAGS(t) (*(volatile int32_t *)(0x42ac6b48 + 56 * (t) + 20))  // & PLAYS, as a slot's
#define RT_RATE(t) (*(volatile int32_t *)(0x42ac6b48 + 56 * (t) + 36))  // its rate, as a slot's
#define RT_COUNT ((volatile int32_t *)0x42adf5d0)   // [track] 960..1, -1 a tick
#define RT_LEFT ((volatile int32_t *)0x42ade0e4)    // [track] > 0: the series' length left, - TEMPO a block
#define RT_DEADLINE ((volatile int32_t *)0x8000fdec)    // [track] its next tick's time
#define RT_FIRES ((const volatile uint16_t *)0x402909b8)  // [count] bit RATE-1: fires

volatile uint32_t improved_amp_hot[24] __attribute__((aligned(16)));    // hot.h

// The block (this one 0) track t's next retrig fires in, as stock counts it, or -1
// when none fires within the fade. A series that fires again sooner than twice the
// fade gets half its spacing to fade in instead, so a fast roll still sounds. The
// series has ended from block until on: a hit there never comes. turns[] holds the
// blocks the track's n queued events without a note fire in, rising: a tick due in
// one is stepped a block later, and from then on the series runs at the event's
// rates[] when that is not NO_RATE.
static int32_t retrig_ahead(int t, int32_t clock, int32_t until, int32_t block,
                            const int32_t *turns, const int32_t *rates, int n)
{
    int32_t count = RT_COUNT[t], at = (int32_t)((uint32_t)RT_DEADLINE[t] - (uint32_t)clock);
    int32_t first = -1, first_in = -1, in, last = 0, hit, rate = RT_RATE(t);
    int i;

    // Stock steps a tick however long past its deadline, one a block. A running series falls
    // behind only by the blocks its track's events took: the queued ones, and the track's other
    // event record (0x42ade118), which takes the turn too (0x40120554) and is not seen ahead; its
    // writer was not read. Further behind is a state that was not read, and it plays as stock.
    if (at < -(SLOTS + 1) * block)
        return -1;
    for (; at < HORIZON * block; at += TICK) {
        // Stock steps a tick in the block its deadline falls in, one a block; a tick
        // still waiting past its deadline was passed over this block and is next.
        in = at < block ? 1 : at / block;
        if (in <= last)
            in = last + 1;
        for (i = 0; i < n && turns[i] <= in; i++) {
            if (turns[i] == in)
                in++;
            if (rates[i] != NO_RATE)
                rate = rates[i];
        }
        last = in;
        if (in >= until)
            break;
        if (first < 0 && in > FADE_BLOCKS)      // no hit within the fade
            return -1;
        // As stock (0x401208a4..0x401208c8): the wrap fires, else the table's bit for the rate.
        if (--count <= 0) {
            count = 960;
        } else if ((rate & 63) > 16 || !(RT_FIRES[count] * 2 >> (rate & 63) & 1)) {
            continue;
        }
        hit = in * block > at ? in * block : at;
        if (first < 0) {
            first = hit;
            first_in = in;
        } else {
            return first < (hit - first) / 2 ? first_in : -1;
        }
    }
    return first_in;
}

// The ENV RESET the trig queued in track t's slot s will play with.
static int queued_env_reset(int t, int s)
{
    int32_t lock = SLOT_LOCK(t, s);
    int kit = SLOT_KIT(t, s);

    if (lock >= 0 && lock < 128) {
        unsigned machine = POOL_SOUND(lock)[SOUND_MACHINE], type = (unsigned)TRACK_TYPE[t];

        if (machine <= 52 && type <= 7 && (MACHINE_FITS(machine) >> type & 1))
            return POOL_SOUND(lock)[SOUND_ENV_RESET];
        lock = -1;                      // stock plays the kit's sound instead
    }
    if (lock == -1 && kit >= 0 && kit < 128 && (kit != TRACK_KIT[t] || TRACK_REAPPLY[t] > 0))
        return KIT_SOUND(kit, t)[SOUND_ENV_RESET];
    return ENV_RESET[t];                // the track's sound as it stands
}

// The voices whose sound restarts its amp envelope on a scheduled trig or retrig within
// FADE_BLOCKS: every track's queued events and retrig series. An event fires in the block its
// time falls in; the clock is this block's start, and block its length on the clock.
__attribute__((noinline)) static void scan_tracks(int32_t clock, int32_t tempo, int32_t block)
{
    uint32_t mask = 0, muted;
    int t;

    // As stock decides at the trig (0x4011ffde): solo mutes every other track.
    muted = SOLOS ? ~SOLOS & ~0x1000u : MUTES;
    muted |= LIVE_MUTES;
    for (t = 0; t < TRACKS; t++) {
        int32_t ahead = -1, until = HORIZON, last = 0, due[SLOTS], turns[SLOTS], rates[SLOTS];
        int s, n = 0, pending = 0;

        if (muted >> t & 1)
            continue;
        // A slot counts when its time is inside the window, it is queued and the track is not
        // held. The three are read in that order, the cheapest first: the times are in the on-chip
        // RAM, and a slot's state and the track's held word, far apart in the DDR, are read only
        // for a time inside the window.
        for (s = 0; s < SLOTS; s++) {
            int32_t at = (int32_t)((uint32_t)EVENT(t, s) - (uint32_t)clock), state;

            // Stock fires an event past its time in the next block it has free; one left longer than
            // the slots can hold it up is a state that was not read, and is not waited for.
            if (NOT_NEAR(at, block))
                continue;
            state = SLOT(t, s);
            if (state == 0 || state == 2)       // as stock sorts them (0x4011ff6e, 0x4011ff90)
                continue;
            due[s] = at < block ? 1 : at / block;
            pending |= 1 << s;
        }
        if (pending && TRACK_HELD(t))           // a held track drops its queued trigs
            pending = 0;
        // The blocks stock handles them in: one a block, the lowest slot of those due.
        while (pending) {
            int32_t in = HORIZON;
            int pick;

            for (s = 0; s < SLOTS; s++)
                if ((pending >> s & 1) && due[s] < in)
                    in = due[s];
            if (in <= last)
                in = last + 1;
            for (pick = 0; !(pending >> pick & 1) || due[pick] > in; pick++)
                ;
            pending &= ~(1 << pick);
            last = in;
            if (SLOT_FLAGS(t, pick) & PLAYS) {  // the first that plays a note: it ends the series in its block
                if (queued_env_reset(t, pick) & 1)
                    ahead = in;
                until = in;
                break;
            }
            turns[n] = in;
            rates[n++] = SLOT_FLAGS(t, pick) & RTRG_ON ? SLOT_RATE(t, pick) : NO_RATE;
        }
        if ((ahead < 0 || ahead > FADE_BLOCKS) && (ENV_RESET[t] & 1) && RT_TRIG(t) && (RT_FLAGS(t) & PLAYS)) {
            int32_t left = RT_LEFT[t];

            // Stock steps the series in block k (this one 0) while left - (k - 1) x TEMPO > 0.
            if (left > 0 && (left - 1) / tempo + 2 < until)
                until = (left - 1) / tempo + 2;
            ahead = retrig_ahead(t, clock, until, block, turns, rates, n);
        }
        if (ahead >= 0 && ahead <= FADE_BLOCKS)
            mask |= 1u << TRACK_VOICE[t];
    }
    amp_prefade_started &= mask;
    amp_prefade_mask = mask;
}

// Called by the amp writer for voice 0, once a block (pre-fade.s).
void amp_prefade_scan(void)
{
    int32_t block, tempo = TEMPO, clock = CLOCK;
    int i;

    if ((uint32_t)clock != SCAN_CLOCK) {
        SCAN_CLOCK = (uint32_t)clock;
        SCAN_STOOD = 0;
    } else if (SCAN_STOOD > FADE_BLOCKS + 1) {  // the clock has stopped: let every voice go
        amp_prefade_mask = 0;
        amp_prefade_started = 0;
        return;
    } else {
        SCAN_STOOD = SCAN_STOOD + 1;
    }
    block = 2 * tempo;
    if (block <= 0) {                           // no tempo to count in
        amp_prefade_mask = 0;
        amp_prefade_started = 0;
        return;
    }
    // Nothing near: no slot's time inside the window, whatever its state, and no track with AMP
    // in its own ENV RESET, which a retrig series needs. scan_tracks would then mark no voice, so
    // it is not run. The clock runs while the sequencer is stopped, so with no track at AMP this
    // is every idle block: 36 times and 12 bytes, all in the on-chip RAM. With a track at AMP
    // scan_tracks runs, and reads the DDR only for that track's series and for a time inside
    // the window.
    if (!((ENV_RESET_WORDS[0] | ENV_RESET_WORDS[1] | ENV_RESET_WORDS[2]) & 0x01010101u)) {
        for (i = 0; i < TRACKS * SLOTS; i++) {
            int32_t at = (int32_t)((uint32_t)EVENT_TIMES[i] - (uint32_t)clock);

            if (!NOT_NEAR(at, block))
                break;
        }
        if (i == TRACKS * SLOTS) {
            amp_prefade_mask = 0;
            amp_prefade_started = 0;
            return;
        }
    }
    scan_tracks(clock, tempo, block);
}
