// SPDX-License-Identifier: GPL-3.0-or-later
// MIDI Engine for the Analog Rytm MKII: a machine that plays an external synth.
//
// A track whose sound runs the MIDI machine (hidden machine slot 42, no
// internal sound) sends its trigs to MIDI: the trig's note, velocity and
// length, two chord notes (N2, N3), pitch bend, mod wheel, channel pressure
// and six CC lanes. Every value is a parameter of the sound, so it p-locks,
// takes the LFO and travels with kits as any stock parameter does:
//
//   SYNTH (the machine's knobs)  N2  N3  PB  MW  AT  CC1 CC2 CC3
//   FILTER ATK DEC SUS           CC4 CC5 CC6 values
//   AMP ATK HLD DEC OVR DEL REV PAN VOL
//                                CHN C1# C2# C3# C4# C5# C6# SND
//
// The AMP records a MIDI sound leaves unused hold its setup: the channel and
// the six CC numbers (0-119). Stock turns and saves them as it does any knob;
// the engine only stops a turn past the range. Which lanes are on (six bits)
// and which of PB, MW and AT send (SND, three bits) are mod storage, so a
// sound that becomes MIDI starts with every lane OFF, whatever its AMP
// values were. A lane sends nothing while it is OFF, which is not the same
// as sending 0.
//
// How a note travels. The sequencer queues each track's trig events ahead
// of time and the audio interrupt plays them at their time, microtiming and
// swing in; there, at the note branch, notes_gate (hooks.s) hands the event
// to midi_engine_trig, which keeps it. At the end of the same audio block
// (ev_render_out) the track's effective parameters (after locks, scenes and
// the LFO) are fresh: the engine queues the lanes that changed, then the
// notes, and schedules each note's off on the musical clock. Lanes also send
// between trigs when a value changes (a lock-only step, the LFO), at most
// once per lane every CC_GAP blocks. Nothing is sent from the interrupt: the
// queue is drained by the stock MIDI note task (wait_gate, hooks.s), woken
// with a message kind it ignores, so this output and TRK SEND MIDI's share
// one sender in one task. Note-offs go first, then controllers, then notes.
//
// Timing comes only from the stock clock and the sequencer's own events
// (docs/module-guides/sequencing.md). Firmware routines and data are reached
// at fixed addresses given for each OS release by build.json's cflags.

#include <stdint.h>

#include "analog-rytm-mk2/machines.h"
#include "analog-rytm-mk2/pages.h"
#include "analog-rytm-mk2/store.h"

STORE_FIELD(midi_engine_send);    // sound, 3 bits: PB, MW, AT on
STORE_FIELD(midi_engine_lanes);   // sound, 6 bits: lane i on

// Stock returns every result in d0, pointers too, so pointer results are
// typed as numbers (loop-sync.c).
typedef unsigned long word_t;
typedef void (*midi_send_t)(int len, const uint8_t *bytes);
typedef word_t (*msg_alloc_t)(void);
typedef int (*mbox_post_t)(word_t box, word_t msg);
typedef word_t (*project_singleton_t)(void);
typedef int (*track_index_of_t)(void *selection);
typedef word_t (*edits_t)(void);
typedef void (*edit_t)(word_t edits, int track, int id, int value);
typedef void (*engine_set_t)(int value, int track, int slot);

#define MIDI_SEND ((midi_send_t)MIDI_SEND_AT)            // (len, bytes): OUTPUT TO's port
#define MSG_ALLOC ((msg_alloc_t)MSG_ALLOC_AT)            // the note task's next message
#define MBOX_POST ((mbox_post_t)MBOX_POST_AT)            // (mailbox, message)
#define PROJECT_SINGLETON ((project_singleton_t)PROJECT_SINGLETON_AT)
#define TRACK_INDEX_OF ((track_index_of_t)TRACK_INDEX_OF_AT)
#define EDITS ((edits_t)EDITS_AT)                     // stock's queue of sound edits
#define EDIT ((edit_t)EDIT_AT)                        // (queue, track, id, value): as a knob turn
#define ENGINE_SET ((engine_set_t)ENGINE_SET_AT)      // (value, track, slot): the engine's copy
#define CLOCK (*(volatile int32_t *)CLOCK_AT)            // the musical clock
#define PLAYING (*(volatile int32_t *)PLAYING_AT)
// The effective parameters: per track 42 words in 8.8, after locks, scenes,
// slides and the LFO, rebuilt every audio block (loop-sync.c).
#define EFF(track, slot) (((volatile int16_t *)PARAMS_EFF_AT)[(track) * 42 + (slot)])
// The audio engine's copy of each sound: a turned knob's value lands here at
// once (0x4011f466), while the kit takes it only every few hundred ms; each
// trig overwrites it with the values the trig was prepared with, a step or
// two earlier. The effective values are this copy, smoothed (16.16, here),
// plus the modulation (the LFO).
#define ENGINE(track, slot) (((volatile int16_t *)PARAMS_ENGINE_AT)[(track) * 42 + (slot)])
#define SMOOTHED(track, slot) \
    ((int16_t)((((volatile int32_t *)PARAMS_SMOOTH_AT)[(track) * 42 + (slot)] + 0x8000) >> 16))
// The kits as edited: 12 sounds of 152 bytes from +42, a parameter slot's
// value at +20 + 2 slot (8.8; slot 41 ends at +104), the machine at +104
// (core-ar2's lock.c).
#define LIVE_KITS 0x412558e3u
#define LIVE_KIT_SIZE 2531
#define WORKING_KIT_INDEX ((const volatile uint8_t *)WORKING_KIT_INDEX_AT)
#define SOUND_SLOT(s, slot) (*(volatile int16_t *)((s) + 20 + 2 * (slot)))
#define SOUND_MACHINE(s) ((s)[104])
#define PROJECT_TRACKSEL 48

#define MACHINE 42
#define TRACKS 12
#define MSG_WAKE 7            // a note task message kind it does nothing with

// Sound parameter slots.
enum {
    // The machine's knobs, by sound slot. Stock lays out slot 42's SYNTH page
    // as slots 10 12 13 11 / 16 14 15 9 on knobs A-D / E-H (rytm-emu, OS
    // 1.74), so each slot takes the meaning of the knob stock shows it on.
    S_CC3 = 9, S_N2 = 10, S_MW = 11, S_N3 = 12, S_PB = 13, S_CC1 = 14, S_CC2 = 15, S_AT = 16,
    S_CC4 = 26, S_CC5 = 27, S_CC6 = 28,                      // FILTER ATK DEC SUS
    S_CHN = 33, S_C1N = 34, S_C2N = 35, S_C3N = 36,          // AMP ATK HLD DEC OVR
    S_VOL = 37, S_C6N = 38, S_C4N = 40, S_C5N = 41,          // AMP VOL PAN DEL REV
    S_SMP = 19,                                              // SAMPLE SMP
};
#define LANES 6
static const uint8_t lane_val[LANES] = { S_CC1, S_CC2, S_CC3, S_CC4, S_CC5, S_CC6 };
static const uint8_t lane_num[LANES] = { S_C1N, S_C2N, S_C3N, S_C4N, S_C5N, S_C6N };
#define CC_MIN 1              // 0 is Bank Select
#define CC_MAX 119            // 120-127 are channel mode messages
#define SEND_PB 1
#define SEND_MW 2
#define SEND_AT 4
#define N_OFF 0               // N2/N3: 0 OFF, 1..49 = -24..+24 semitones
#define N_ZERO 25

// Controllers: the six lanes, then PB, MW, AT.
#define CTRLS (LANES + 3)
#define CC_GAP 6              // blocks between a lane's sends (about 4 ms)
#define UNSENT 0xffff

// Stock parameter ids (page knobs) the engine answers for.
#define ID_KNOB_FIRST 390     // slot 42's records: 390..397
#define ID_KNOB_LAST 397
#define ID_FLT_ATK 50
#define ID_FLT_SUS 52
#define ID_AMP_ATK 56
#define ID_AMP_VOL 63

// ---- the machine ----

const struct core_machine midi_engine_machine = {
    MACHINE, CORE_ENGINE_DISABLE, -1, 0xff, 0, "MIDI", "MIDI",  // filed with DISABLE
    {
        { "CC 3 Value", "CC3", 0, 127, 0, 0 },     // slot 9: knob H
        { "Note 2", "N2", 0, 49, N_OFF, 0 },        // slot 10: knob A
        { "Mod Wheel", "MW", 0, 127, 0, 0 },        // slot 11: knob D
        { "Note 3", "N3", 0, 49, N_OFF, 0 },        // slot 12: knob B
        { "Pitch Bend", "PB", 0, 127, 64, 1 },      // slot 13: knob C
        { "CC 1 Value", "CC1", 0, 127, 0, 0 },      // slot 14: knob F
        { "CC 2 Value", "CC2", 0, 127, 0, 0 },      // slot 15: knob G
        { "Aftertouch", "AT", 0, 127, 0, 0 },       // slot 16: knob E
    },
};

// ---- sounds ----

// The current kit's index is a 32-bit big-endian word, as core-ar2 reads it.
static volatile uint8_t *sound_of(int track)
{
    unsigned k = (unsigned)WORKING_KIT_INDEX[0] << 24 | (unsigned)WORKING_KIT_INDEX[1] << 16 |
                 (unsigned)WORKING_KIT_INDEX[2] << 8 | WORKING_KIT_INDEX[3];
    if (k >= 128)
        return 0;
    return (volatile uint8_t *)(LIVE_KITS + LIVE_KIT_SIZE * k + 42 + 152 * track);
}

static int is_midi(volatile uint8_t *s)
{
    return s && SOUND_MACHINE(s) == MACHINE;
}

static int setup_of(volatile uint8_t *s, int slot)
{
    return SOUND_SLOT(s, slot) >> 8;
}

static int channel_of(volatile uint8_t *s)
{
    int ch = setup_of(s, S_CHN);
    return ch < 0 ? 0 : ch > 15 ? 15 : ch;
}

// The slots the track's last trig locks (one bit a slot), from its lock list.
static uint32_t locked[TRACKS][2];

// Each sent slot's knob value, followed per track: a change of the engine's
// copy outside a trig is a turn, and is taken at once; one in a trig is the
// trig's older snapshot, and is not. A change of the kit's value (a kit or
// sound load, an undo) is taken once no knob has turned for a second.
#define FOLLOWED 11
#define QUIET 1500                            // audio blocks, about 1 s
static const uint8_t followed[FOLLOWED] = {
    S_CC1, S_CC2, S_CC3, S_CC4, S_CC5, S_CC6, S_PB, S_MW, S_AT, S_N2, S_N3
};
static int16_t knob[TRACKS][FOLLOWED], seen_engine[TRACKS][FOLLOWED], seen_kit[TRACKS][FOLLOWED];
static uint16_t quiet[TRACKS];
static volatile uint8_t trigged[TRACKS], primed[TRACKS];

static void follow(int t, volatile uint8_t *s)
{
    int i, e, k, prime = !primed[t];
    if (quiet[t] < QUIET)
        quiet[t]++;
    for (i = 0; i < FOLLOWED; i++) {
        e = ENGINE(t, followed[i]);
        k = SOUND_SLOT(s, followed[i]);
        if (prime) {
            knob[t][i] = seen_kit[t][i] = (int16_t)k;
            seen_engine[t][i] = (int16_t)e;
            continue;
        }
        if (e != seen_engine[t][i]) {
            seen_engine[t][i] = (int16_t)e;
            if (!trigged[t]) {
                knob[t][i] = (int16_t)e;
                quiet[t] = 0;
            }
        }
        if (k != seen_kit[t][i]) {
            seen_kit[t][i] = (int16_t)k;
            if (quiet[t] >= QUIET)
                knob[t][i] = (int16_t)k;
        }
    }
    primed[t] = 1;
    trigged[t] = 0;
}

// A slot's value to send, in 8.8: a slot the last trig locks is the effective
// value (the lock, with the LFO); any other is the knob's value now, with the
// modulation the effective value adds, so a trig's older snapshot of the
// knob never goes out.
static int live(int track, volatile uint8_t *s, int slot)
{
    int i, v = SOUND_SLOT(s, slot);
    if (locked[track][slot >> 5] >> (slot & 31) & 1)
        return EFF(track, slot);
    for (i = 0; i < FOLLOWED; i++)
        if (followed[i] == slot)
            v = knob[track][i];
    return v + (int16_t)(EFF(track, slot) - SMOOTHED(track, slot));
}

static int current_track(void)
{
    return TRACK_INDEX_OF((void *)(PROJECT_SINGLETON() + PROJECT_TRACKSEL));
}

// ---- the output queue: written in the audio interrupt, drained by the
// note task (one producer, one consumer) ----

#define QSIZE 1024
#define QMASK (QSIZE - 1)
#define Q_NOTE_ROOM 48        // bytes kept free for notes: a controller never takes them
static uint8_t q[QSIZE];
static volatile unsigned q_head, q_tail;
static volatile int wake_sent;

static unsigned q_free(void)
{
    return QSIZE - 1 - ((q_head - q_tail) & QMASK);
}

static int put(int len, uint8_t a, uint8_t b, uint8_t c, unsigned keep)
{
    unsigned h = q_head;
    if (q_free() < (unsigned)len + 1 + keep)
        return 0;
    q[h] = (uint8_t)len;
    q[(h + 1) & QMASK] = a;
    q[(h + 2) & QMASK] = b;
    if (len == 3)
        q[(h + 3) & QMASK] = c;
    q_head = (h + 1 + len) & QMASK;
    return 1;
}

// ---- notes it owns: (channel, note), the track, when it ends ----

#define NOTES 64
struct note {
    uint8_t used, ch, note, track;
    int32_t end;               // the clock it ends at
    uint8_t held;              // 1: no length, ends with a new note or STOP
};
static struct note notes[NOTES];

static void off_now(struct note *n)
{
    put(3, 0x80 | n->ch, n->note, 0, 0);
    n->used = 0;
}

static void note_on(int track, int ch, int note, int vel, int len, int32_t now)
{
    int i, free = -1;
    if (note < 0 || note > 127)
        return;
    for (i = 0; i < NOTES; i++) {
        if (notes[i].used && notes[i].ch == ch && notes[i].note == note)
            off_now(&notes[i]);             // the same note again: off first
        if (!notes[i].used && free < 0)
            free = i;
    }
    if (free < 0)
        return;                             // all 64 held: the note is dropped
    if (!put(3, 0x90 | ch, note, vel < 1 ? 1 : vel > 127 ? 127 : vel, 0))
        return;
    notes[free].used = 1;
    notes[free].ch = ch;
    notes[free].note = note;
    notes[free].track = track;
    notes[free].held = len <= 0;
    notes[free].end = now + 2 * len;        // the note task's own length scale
}

static void all_off(void)
{
    int i;
    for (i = 0; i < NOTES; i++)
        if (notes[i].used)
            off_now(&notes[i]);
}

// ---- controllers ----

static uint16_t sent[TRACKS][CTRLS];   // last value sent, UNSENT before
static uint8_t gap[TRACKS][CTRLS];     // blocks until the lane may send again
static uint8_t last_ch[TRACKS];

static void forget(int track)
{
    int i;
    for (i = 0; i < CTRLS; i++)
        sent[track][i] = UNSENT;
}

// Queue the controllers whose value changed. At a trig (now != 0) every
// changed one goes, whatever its gap, before the trig's notes.
static void controllers(int track, volatile uint8_t *s, int ch, int at_trig)
{
    unsigned on = core_store_get(STORE(midi_engine_send), (void *)s, 0);
    unsigned lanes = core_store_get(STORE(midi_engine_lanes), (void *)s, 0);
    int i;
    for (i = 0; i < CTRLS; i++) {
        int v, num = -1;
        if (gap[track][i])
            gap[track][i]--;
        if (i < LANES) {
            if (!(lanes >> i & 1))
                continue;
            num = setup_of(s, lane_num[i]);
            if (num < CC_MIN)                 // an older lane left at 0: OFF
                continue;
            num = num > CC_MAX ? CC_MAX : num;
            v = live(track, s, lane_val[i]) >> 8;
        } else if (i == LANES) {
            if (!(on & SEND_PB))
                continue;
            v = live(track, s, S_PB);                 // 8.8: 64.0 is the centre
            v = (v * 128) >> 8;                       // 14 bits, 8192 the centre
        } else {
            if (!(on & (i == LANES + 1 ? SEND_MW : SEND_AT)))
                continue;
            v = live(track, s, i == LANES + 1 ? S_MW : S_AT) >> 8;
        }
        if (v < 0)
            v = 0;
        if (v > (i == LANES ? 16383 : 127))
            v = i == LANES ? 16383 : 127;
        if (sent[track][i] == v || (gap[track][i] && !at_trig))
            continue;
        if (i < LANES)
            v = put(3, 0xb0 | ch, num, v, Q_NOTE_ROOM) ? v : -1;
        else if (i == LANES)
            v = put(3, 0xe0 | ch, v & 127, v >> 7, Q_NOTE_ROOM) ? v : -1;
        else if (i == LANES + 1)
            v = put(3, 0xb0 | ch, 1, v, Q_NOTE_ROOM) ? v : -1;
        else
            v = put(2, 0xd0 | ch, v, 0, Q_NOTE_ROOM) ? v : -1;
        if (v >= 0) {
            sent[track][i] = v;
            gap[track][i] = CC_GAP;
        }
    }
}

// ---- trigs, from the audio interrupt (hooks.s) ----

#define PENDING 16
struct pending {
    uint8_t track, vel;
    int16_t pitch;
    int32_t len;
};
static struct pending pend[PENDING];
static volatile int npend;

// The trig event: +4 the velocity (8.8), +8 the pitch, +0x14 its flags,
// +0x20 the length, +0x34 its lock list. A lock trig reaches this branch
// too: as stock's own MIDI note does, only an event with a flag of 0x180 and
// a pitch plays a note. A lock trig's values still go out as the lanes'
// changes (midi_engine_block).
#define EV_NOTE 0x180

// The lock list (0x4009a954 builds it): +4 the number of locks, then 8 bytes
// a lock from +12, its slot at +2.
static void note_locks(int track, const uint8_t *list)
{
    unsigned n, k, slot;
    locked[track][0] = locked[track][1] = 0;
    if ((uintptr_t)list < 0x40000000u)
        return;
    n = *(const uint32_t *)(list + 4);
    for (k = 0; k < n && k < 42; k++) {
        slot = *(const uint16_t *)(list + 14 + 8 * k);
        if (slot < 42)
            locked[track][slot >> 5] |= 1u << (slot & 31);
    }
}

void midi_engine_trig(int track, const uint8_t *ev)
{
    if ((unsigned)track >= TRACKS)
        return;
    note_locks(track, *(const uint8_t *const *)(ev + 0x34));
    trigged[track] = 1;
    if (npend >= PENDING)
        return;
    if (!(*(const uint32_t *)(ev + 0x14) & EV_NOTE) || *(const int32_t *)(ev + 8) < 0)
        return;
    if (!is_midi(sound_of(track)))
        return;
    pend[npend].track = track;
    pend[npend].vel = *(const uint16_t *)(ev + 4) >> 8;
    pend[npend].pitch = *(const int32_t *)(ev + 8);
    pend[npend].len = *(const int32_t *)(ev + 0x20);
    npend++;
}

static int offset_of(int v)
{
    return v == N_OFF ? -1000 : v - N_ZERO;
}

// ev_render_out: the end of each audio block.
static int was_playing, started;

void midi_engine_block(void)
{
    int32_t now = CLOCK;
    int i, t;

    if (!started) {                           // nothing sent yet on any track
        for (t = 0; t < TRACKS; t++)
            forget(t);
        started = 1;
    }
    for (t = 0; t < TRACKS; t++) {
        volatile uint8_t *s = sound_of(t);
        if (is_midi(s))
            follow(t, s);
        else
            trigged[t] = 0;
    }

    for (i = 0; i < NOTES; i++)               // offs first
        if (notes[i].used && !notes[i].held && now - notes[i].end >= 0)
            off_now(&notes[i]);
    if (!was_playing && PLAYING)               // PLAY: every value goes out again
        for (t = 0; t < TRACKS; t++)
            forget(t);
    if (was_playing && !PLAYING) {
        all_off();
        for (t = 0; t < TRACKS; t++)           // stopped, every knob is live
            locked[t][0] = locked[t][1] = 0;
    }
    was_playing = PLAYING != 0;

    for (i = 0; i < npend; i++) {             // then each trig's lanes and notes
        struct pending *p = &pend[i];
        volatile uint8_t *s = sound_of(p->track);
        int ch, base, n2, n3;
        if (!is_midi(s))
            continue;
        ch = channel_of(s);
        if (ch != last_ch[p->track]) {
            forget(p->track);
            last_ch[p->track] = ch;
        }
        controllers(p->track, s, ch, 1);
        base = p->pitch - 24;
        n2 = offset_of(live(p->track, s, S_N2) >> 8);
        n3 = offset_of(live(p->track, s, S_N3) >> 8);
        note_on(p->track, ch, base, p->vel, p->len, now);
        if (n2 > -1000 && n2 != 0)
            note_on(p->track, ch, base + n2, p->vel, p->len, now);
        if (n3 > -1000 && n3 != 0 && n3 != n2)
            note_on(p->track, ch, base + n3, p->vel, p->len, now);
    }
    npend = 0;

    if (PLAYING)                               // lanes between trigs
        for (t = 0; t < TRACKS; t++) {
            volatile uint8_t *s = sound_of(t);
            if (is_midi(s))
                controllers(t, s, channel_of(s), 0);
        }

    if (q_head != q_tail && !wake_sent) {
        word_t m = MSG_ALLOC();
        if (m) {
            *(volatile uint8_t *)m = MSG_WAKE;
            wake_sent = 1;
            MBOX_POST(MAILBOX_AT, m);
        }
    }
}

// ---- the note task (hooks.s): send what the queue holds ----

void midi_engine_drain(void)
{
    uint8_t b[3];
    wake_sent = 0;
    while (q_tail != q_head) {
        unsigned t = q_tail;
        int len = q[t], k;
        for (k = 0; k < len; k++)
            b[k] = q[(t + 1 + k) & QMASK];
        q_tail = (t + 1 + len) & QMASK;
        MIDI_SEND(len, b);
    }
}

// ---- a MIDI sound stays silent ----

static uint8_t was_midi[TRACKS];

// A sound switched from the MIDI machine to another machine gets plain values on
// the pages that held the setup and the lanes (a fresh kit's BD has them),
// set as a knob turn sets them, so stock saves them, and its lanes and SND
// go OFF, so a lane's number never comes back as one of those values (PAN's
// 64 is the sustain pedal). A sound loaded over it brings its own, and is
// left alone: only a VOL still held at 0 is reset.
static const struct { uint8_t id, slot, value; } plain[] = {
    { 56, S_CHN, 0 },   { 57, S_C1N, 0 },   { 58, S_C2N, 127 }, { 59, S_C3N, 0 },
    { 60, S_C4N, 0 },   { 61, S_C5N, 0 },   { 62, S_C6N, 64 },  { 63, S_VOL, 110 },
    { 50, S_CC4, 0 },   { 51, S_CC5, 64 },  { 52, S_CC6, 0 },
};

static void leave_midi(int t, volatile uint8_t *s)
{
    unsigned i;
    word_t edits = EDITS();
    core_store_set(STORE(midi_engine_lanes), (void *)s, 0, 0);
    core_store_set(STORE(midi_engine_send), (void *)s, 0, 0);
    for (i = 0; i < sizeof plain / sizeof plain[0]; i++) {
        int v = plain[i].value << 8;
        SOUND_SLOT(s, plain[i].slot) = (int16_t)v;
        ENGINE_SET(v, t, plain[i].slot);
        EDIT(edits, t, plain[i].id, v);
    }
}

// ev_tick. A MIDI sound's machine runs the DISABLE engine, and its VOL (whose
// knob is SND here, so nothing turns or locks it) stays 0 and its sample OFF,
// so a sample the sound had before does not play either. These are written
// again every tick, as a kit or sound load brings back the saved values. A
// sound that just became MIDI starts with nothing sent.
void midi_engine_tick(void *ctrl)
{
    int t;
    (void)ctrl;
    for (t = 0; t < TRACKS; t++) {
        volatile uint8_t *s = sound_of(t);
        int midi = is_midi(s);
        if (midi) {
            if (SOUND_SLOT(s, S_VOL))
                SOUND_SLOT(s, S_VOL) = 0;
            if (SOUND_SLOT(s, S_SMP))
                SOUND_SLOT(s, S_SMP) = 0;
            if (!was_midi[t]) {
                forget(t);
                primed[t] = 0;
            }
        } else if (was_midi[t] && s && !SOUND_SLOT(s, S_VOL)) {
            leave_midi(t, s);
        }
        was_midi[t] = (uint8_t)midi;
    }
}

// ---- page knobs: texts and the setup's turns ----

static int setup_slot(int id)
{
    static const uint8_t slot[8] = { S_CHN, S_C1N, S_C2N, S_C3N, S_C4N, S_C5N, S_C6N, S_VOL };
    return slot[id - ID_AMP_ATK];
}

static int lane_of(int slot)
{
    int i;
    for (i = 0; i < LANES - 1 && lane_num[i] != slot; i++)
        ;
    return i;
}

static volatile uint8_t *midi_sound(void)
{
    int t = current_track();
    volatile uint8_t *s;
    if ((unsigned)t >= TRACKS)
        return 0;
    s = sound_of(t);
    return is_midi(s) ? s : 0;
}

static void put_num(char *b, int v)
{
    char tmp[6];
    int n = 0, neg = v < 0;
    if (neg)
        v = -v;
    do {
        tmp[n++] = (char)('0' + v % 10);
        v /= 10;
    } while (v && n < 5);
    if (neg)
        *b++ = '-';
    while (n)
        *b++ = tmp[--n];
    *b = 0;
}

static void put_str(char *b, const char *s)
{
    while ((*b++ = *s++) != 0)
        ;
}

static const char *const send_names[8] = { "OFF", "P", "M", "PM", "A", "PA", "MA", "PMA" };

int midi_engine_text(struct core_text *t)
{
    volatile uint8_t *s = midi_sound();
    int v = t->value >> 8;
    if (!s)
        return CORE_TEXT_PASS;
    if (t->id >= ID_KNOB_FIRST && t->id <= ID_KNOB_LAST) {
        int slot = 9;
        static const int16_t ids[8] = { 397, 390, 393, 392, 395, 394, 396, 391 };
        while (slot < 17 && ids[slot - 9] != t->id)
            slot++;
        if (slot == S_N2 || slot == S_N3) {
            if (v == N_OFF)
                put_str(t->buf, "OFF");
            else {
                if (v - N_ZERO > 0)
                    *t->buf++ = '+';
                put_num(t->buf, v - N_ZERO);
            }
            return CORE_TEXT_DONE;
        }
        if (slot == S_PB) {
            put_num(t->buf, v - 64);
            return CORE_TEXT_DONE;
        }
        return CORE_TEXT_PASS;              // MW, AT and the lanes' values: numbers
    }
    if (t->id >= ID_FLT_ATK && t->id <= ID_FLT_SUS) {   // CC4..CC6: the value
        put_num(t->buf, v);
        return CORE_TEXT_DONE;
    }
    if (t->id >= ID_AMP_ATK && t->id <= ID_AMP_VOL) {
        int slot = setup_slot(t->id);
        if (slot == S_VOL)
            put_str(t->buf, send_names[core_store_get(STORE(midi_engine_send), (void *)s, 0) & 7]);
        else if (slot == S_CHN)
            put_num(t->buf, (v < 0 ? 0 : v > 15 ? 15 : v) + 1);
        else if (!(core_store_get(STORE(midi_engine_lanes), (void *)s, 0) >> lane_of(slot) & 1) ||
                 v < CC_MIN)
            put_str(t->buf, "OFF");
        else
            put_num(t->buf, v > CC_MAX ? CC_MAX : v);
        return CORE_TEXT_DONE;
    }
    return CORE_TEXT_PASS;
}

int midi_engine_get(int32_t id, int32_t *value)
{
    volatile uint8_t *s = midi_sound();
    if (!s || id != ID_AMP_VOL)
        return 0;
    *value = (int32_t)(core_store_get(STORE(midi_engine_send), (void *)s, 0) & 7) << 8;
    return 1;
}

static int steps(int32_t delta)
{
    return delta > 0 ? (delta + 255) >> 8 : -((-delta + 255) >> 8);
}

int midi_engine_delta(void *view, int32_t id, int32_t delta, int32_t func)
{
    volatile uint8_t *s = midi_sound();
    int slot, v;
    (void)view;
    (void)func;
    if (!s || id < ID_AMP_ATK || id > ID_AMP_VOL)
        return 0;
    slot = setup_slot(id);
    if (slot == S_VOL) {
        v = (int)(core_store_get(STORE(midi_engine_send), (void *)s, 0) & 7) + steps(delta);
        core_store_set(STORE(midi_engine_send), (void *)s, 0, v < 0 ? 0 : v > 7 ? 7 : v);
        return 1;
    }
    v = setup_of(s, slot) + steps(delta);
    if (slot == S_CHN)                        // stock turns it, toward 1..16
        return (v < 0 && delta < 0) || (v > 15 && delta > 0);
    {
        unsigned lanes = core_store_get(STORE(midi_engine_lanes), (void *)s, 0);
        unsigned bit = 1u << lane_of(slot);
        if (!(lanes & bit) || v - steps(delta) < CC_MIN) {   // OFF: a turn up switches it on
            if (delta <= 0)
                return 1;
            core_store_set(STORE(midi_engine_lanes), (void *)s, 0, lanes | bit);
            return v - steps(delta) >= CC_MIN; // from 0, stock turns it up to 1 or more
        }
        if (v < CC_MIN) {                     // below 1: OFF again
            core_store_set(STORE(midi_engine_lanes), (void *)s, 0, lanes & ~bit);
            return 1;
        }
        return v > CC_MAX && delta > 0;       // stock turns it, toward 1..119
    }
}

const struct core_param midi_engine_knob_params = {
    ID_KNOB_FIRST, ID_KNOB_LAST, 0, 0, midi_engine_text
};
const struct core_param midi_engine_filter_params = {
    ID_FLT_ATK, ID_FLT_SUS, 0, 0, midi_engine_text
};
const struct core_param midi_engine_amp_params = {
    ID_AMP_ATK, ID_AMP_VOL, midi_engine_get, midi_engine_delta, midi_engine_text
};
