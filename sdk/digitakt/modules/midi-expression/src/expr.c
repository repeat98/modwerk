// SPDX-License-Identifier: GPL-3.0-or-later
// MIDI Expression for the Digitakt mk1, OS 1.54, MIDI tracks: pitch bend,
// channel aftertouch, the mod wheel, breath (CC 2) and the velocity of the
// notes arriving at MIDI IN play the synth a MIDI track sends to, on the route
// the notes take. Live playing only: nothing is recorded into the sequencer.
//
// Input. Stock, the MIDI task hands each incoming message to one of sixteen
// handlers, chosen by its type, from a table at 0x401b8dd4: message, length
// and a flag (0x10 on the auto channel, 8 otherwise; 4 and 2 from USB). The
// entries for channel aftertouch (0xD) and pitch bend (0xE) are an empty
// function, and the control-change handler (0xB) does not forward CC 1 or 2.
// This mod points the D and E entries at its own handlers and wraps the B
// entry (the stock handler runs first, always). Routing is the stock note
// router's: on the auto channel, the active track only; otherwise every track
// whose TRACK CHANNEL matches. Of those, MIDI tracks A-H with CHAN on take it.
//
// What a MIDI track sends. Twelve values, the ones its LFO page can reach, go
// through send(track, channel, id, value, force) at 0x400e0ddc: id 21 pitch
// bend (14-bit), 22 aftertouch, 23 the mod wheel (CC 1), 24 breath (CC 2) and
// 25..32 the CC VAL slots 1-8 on the CC numbers their SEL picks (8.8, the
// MIDI value in the top byte). An 8-byte site at its entry (send.s) calls
// me_filter first, which keeps each value as "the track's own" (its knob,
// parameter locks and LFO) per output channel.
//
// Combining. On the track's EXPRESSION page:
//   THRU ON   the input's PB, AT, MW and BC are added to the track's own
//             PB, AT, MW and BC;
//   MW, AT and VEL each move a destination by a depth (-64.00..+64.00 in
//             the stock LFO's scale: +64 at full value is the whole range).
// Everything aimed at one value is summed with the track's own, capped to the
// MIDI range, and sent as one message. While anything live is aimed at a
// value, the track's own sends of it are taken over (stock must not send
// them too); with nothing live, they go out exactly as stock.
//
// Merging. Two values a track sends on the same CC number would fight (stock
// too): the mod wheel (CC 1) and a CC VAL slot whose SEL is 1, breath and a
// SEL of 2, or two slots with one SEL. While anything live is aimed at any of
// them, they go out as one CC: the track's own value is the one that changed
// last (what the synth would have heard last, stock), plus everything live
// aimed at any of them.
//
// Leaving. When the active track changes, what came in on the auto channel
// stops; the synth gets the track's own values back. A note's velocity stays
// (the sequencer's notes keep setting it). Changing a setting on the page
// takes effect at once.
//
// Sending. Each output keeps a pending flag; the value is computed when it
// goes out. Only the MIDI tracks' own task sends, the way it sends everything
// else: the mod never calls a MIDI driver itself (0.8 did, from the MIDI input
// and UI tasks, and that froze the unit on hardware). A change anywhere posts
// one wake record to the task's queue (queue_send 0x40001b7a, 0x421b51f0, a
// type the task does nothing else with); after every record the task makes its
// per-track pass and then sends its two buffers, the notes (0x421b6620) and
// the CCs (0x421b6a21), with midi_out (0x400e0992: DIN and/or USB, as OUTPUT TO
// says). A 6-byte jsr site just before that (task.s) calls me_task_pass, which
// appends what is pending to the CC buffer with the task's own CC append
// (0x400e0dac), so a mod that hooks it (FX Track) sees these CCs too. A velocity route goes into the
// notes buffer just before its note. Both buffers count their bytes in one
// byte, so the mod fills them only to ROOM bytes; what does not fit goes with
// the next pass.

// Small rather than fast, as page.c and store.c: control logic, not the audio
// render; the room is for Digi Slicer beside it (about 2 KB of code less).
#ifndef ME_HOST_TEST
#pragma GCC optimize ("Os", "no-tree-loop-distribute-patterns")   // and no memset, memmove or strlen calls: a mod has no C library
#endif
#include <stdint.h>

#ifdef ME_HOST_TEST
#include "host_stubs.h"
#else
// ---- OS 1.54 ----------------------------------------------------------------
#define AUTO_CHANNEL   (*(volatile int32_t *)0x4197c6fc)  // 0-15
#define ACTIVE_TRACK   (*(volatile int32_t *)0x4197c6b4)  // 0-7 audio, 8-15 MIDI A-H
#define TRACK_CHANNEL  ((volatile int32_t *)0x4197c700)   // 16 longs, as the router reads
#define RECEIVE_CC     (*(volatile int32_t *)0x4197c77c)  // PORT CONFIG > RECEIVE CC/NRPN
#define OUTPUT_TO      (*(volatile uint32_t *)0x421c9560) // bit 0 MIDI, bit 1 USB
// The MIDI tracks' parameters in use, 106 bytes a track (CC Recall's PARAMS):
// parameter p's word at + 2p, 8.8. The SEL of CC VAL slot k is parameter 33 + k.
#define PARAMS         ((volatile int8_t *)0x421c9188)

// The MIDI tracks' task: its queue, and the two buffers it sends each pass
// (a length byte, then the bytes).
#define TASK_QUEUE     ((void *)0x421b51f0)
#define NOTES_LEN      (*(volatile uint8_t *)0x421b6620)
#define NOTES_BUF      ((volatile uint8_t *)0x421b6621)
#define CCS_LEN        (*(volatile uint8_t *)0x421b6a21)
#define CCS_BUF        ((volatile uint8_t *)0x421b6a22)
// The task's own CC append, cc_append(len, bytes): FX Track hooks its entry.
#define CC_APPEND      ((void (*)(int32_t, const uint8_t *))0x400e0dac)

typedef int32_t (*channel_fn)(int32_t midi_track);
typedef void (*queue_send_fn)(void *queue, void *item);
typedef void (*handler_fn)(const uint8_t *msg, int32_t len, int32_t flag);

#define CHANNEL        ((channel_fn)0x400e09d8)   // a MIDI track's CHAN, -1 when off
// enabled(track, id): the parameter is switched on (FUNC + its knob on the
// SRC, FLTR or AMP page); off, the track sends nothing for it (CC Recall's ENABLED).
#define ENABLED        ((int32_t (*)(int32_t, int32_t))0x400e0966)
#define QUEUE_SEND     ((queue_send_fn)0x40001b7a)
#define STOCK_CC       ((handler_fn)0x400d4cb8)
#endif

#include "expr.h"

#define ID_FIRST       21                         // send() ids 21..32: outputs 0..11
#define TAKE_OVER      ((int32_t)0x80000000)      // me_filter: stock must not send
#define ROOM           128                        // of a buffer's 255, the mod fills up to
#define WAKE_TYPE      0x6d65                     // a record type the task only wakes for
#define SEL_PARAM      33

// Live sources.
enum { S_PB, S_AT, S_MW, S_BC, S_VEL, SOURCES };
#define BIT(s) (1u << (s))

struct chan {
    int8_t owner;               // the MIDI track whose settings apply, -1 none yet
    int16_t own[OUTPUTS];       // the track's own values: PB 0..16383, the rest 0..127
    uint16_t stamp[OUTPUTS];    // when each was last set (merging: the latest counts)
    int16_t in[SOURCES];        // live: PB offset -8192..8191, the rest 0..127
    uint8_t touched;            // sources live on this channel
    uint8_t via_auto;           // of those, the ones from the auto channel
    uint8_t pending[OUTPUTS];   // a value is due to go out
    uint8_t taken[OUTPUTS];     // the last message for it was this mod's
    uint8_t heard[OUTPUTS][3];  // the last message this mod sent for it ...
    uint8_t known[OUTPUTS];     // ... and that it is still what the synth has
    uint8_t seen[OUTPUTS];      // own[] came from the track's send(), not its parameter
};

static struct chan chans[16];
static uint16_t clock_stamp;
static volatile uint8_t posted;     // the wake record is in the task's queue
static struct { int32_t type, spare[4]; } wake_rec = { WAKE_TYPE, { 0, 0, 0, 0 } };
static volatile uint8_t initialised;
static int32_t last_active = -1;

// Counters for tests.
volatile uint32_t me_activity;
volatile uint32_t me_taken, me_sent, me_held, me_filtered, me_released, me_wakes, me_passes, me_skipped;

#ifdef ME_HOST_TEST
static inline uint16_t irq_off(void) { return 0; }
static inline void irq_restore(uint16_t sr) { (void)sr; }
#else
static inline uint16_t irq_off(void)
{
    uint16_t sr;
    __asm__ volatile("move.w %%sr,%0\n\tmove.w #0x2700,%%sr" : "=d"(sr) :: "memory");
    return sr;
}

static inline void irq_restore(uint16_t sr)
{
    __asm__ volatile("move.w %0,%%sr" :: "d"(sr) : "memory");
}
#endif

static inline int32_t clamp(int32_t v, int32_t lo, int32_t hi)
{
    return v < lo ? lo : v > hi ? hi : v;
}

static void init(void)
{
    if (initialised)
        return;
    for (int ch = 0; ch < 16; ch++) {
        struct chan *c = &chans[ch];
        c->owner = -1;
        for (int o = 0; o < OUTPUTS; o++) {
            c->own[o] = 0;
            c->stamp[o] = 0;
            c->pending[o] = c->taken[o] = c->known[o] = c->seen[o] = 0;
        }
        c->own[O_PB] = 8192;            // stock's centre until the track sends
        for (int s = 0; s < SOURCES; s++)
            c->in[s] = 0;
        c->touched = c->via_auto = 0;
    }
    initialised = 1;
}

int32_t me_midi_sel(int m, int k)
{
    if (m < 0 || m > 7 || k < 0 || k > 7)
        return -1;
    int32_t sel = PARAMS[106 * m + 2 * (SEL_PARAM + k)];
    return sel >= 0 && sel <= 127 ? sel : -1;
}

// The CC number an output goes out on, or -1 for pitch bend and aftertouch;
// a slot without a CC number gets a number of its own that matches nothing.
static int32_t cc_of(const struct chan *c, int o)
{
    if (o == O_PB || o == O_AT)
        return -1;
    if (o == O_MW)
        return 1;
    if (o == O_BC)
        return 2;
    int32_t sel = me_midi_sel(c->owner, o - O_VAL1);
    return sel >= 0 ? sel : 1000 + o;
}

static const struct me_cfg *cfg_of(const struct chan *c)
{
    static const struct me_cfg none;    // no owner yet: nothing passes, nothing routed
    return c->owner >= 0 && c->owner < 8 ? &me_midi_cfg[c->owner] : &none;
}

// What the input's own source passes straight to (THRU).
static int thru_source(int o)
{
    return o == O_PB ? S_PB : o == O_AT ? S_AT : o == O_MW ? S_MW : o == O_BC ? S_BC : -1;
}

// The live part aimed at one output, in 1/256 of the output's MIDI unit for
// routes (rt), and as whole units for THRU (th); 0 and not live when nothing is.
static int live_parts(const struct chan *c, int o, int32_t *th, int32_t *rt)
{
    const struct me_cfg *cfg = cfg_of(c);
    int live = 0;
    *th = *rt = 0;
    int s = thru_source(o);
    if (cfg->thru && s >= 0 && (c->touched & BIT(s))) {
        *th = c->in[s];
        live = 1;
    }
    const struct { int8_t dest; int16_t amount; int src; } r[3] = {
        { cfg->mw_dest, cfg->mw_amount, S_MW },
        { cfg->at_dest, cfg->at_amount, S_AT },
        { cfg->vel_dest, cfg->vel_amount, S_VEL },
    };
    for (int i = 0; i < 3; i++) {
        if (r[i].dest != o + 1 || !(c->touched & BIT(r[i].src)))
            continue;
        int32_t amount = clamp(r[i].amount, -AMOUNT_MAX, AMOUNT_MAX);
        *rt += c->in[r[i].src] * amount / 64;   // 127 x 64.00 = the whole 0..127 (x 256)
        live = 1;
    }
    return live;
}

static int live_on(const struct chan *c, int o)
{
    int32_t th, rt;
    return live_parts(c, o, &th, &rt);
}

// Anything live aimed at this output, or at another on its CC number.
static int group_live(const struct chan *c, int o)
{
    int32_t cc = cc_of(c, o);
    if (cc < 0)
        return live_on(c, o);
    for (int p = O_MW; p < OUTPUTS; p++)
        if (cc_of(c, p) == cc && live_on(c, p))
            return 1;
    return 0;
}

// The track's own value. Until its task has sent it (stock sends a value when
// it changes, and all of them only at a pattern change), it is the track's
// parameter in use: send()'s id is the parameter's index (21 PB, 22 AT, 23 MW,
// 24 BC, 25..32 the FLTR page's CC VAL 1-8; 0x400e16da passes the word). The
// words are 8.8 (the MIDI value in the high byte), PB's is 14-bit (0x2000 at
// its centre, measured in digiemu).
static int32_t own_of(const struct chan *c, int o)
{
    if (c->owner < 0 || c->owner > 7)
        return c->own[o];
    if (!ENABLED(c->owner, ID_FIRST + o))   // switched off on its page: the track has no value of its own
        return o == O_PB ? 8192 : 0;
    if (c->seen[o])
        return c->own[o];
    const volatile int8_t *w = &PARAMS[106 * c->owner + 2 * (ID_FIRST + o)];
    if (o == O_PB)
        return clamp(((uint8_t)w[0] << 8) | (uint8_t)w[1], 0, 16383);
    return clamp(w[0], 0, 127);
}

static int32_t round256(int32_t v)
{
    return v >= 0 ? (v + 128) >> 8 : -((-v + 128) >> 8);
}

// The message for one output (and every output on its CC number). Called
// with interrupts masked.
static uint8_t compose(const struct chan *c, int ch, int o, uint8_t *out)
{
    int32_t th, rt;
    if (o == O_PB) {
        live_parts(c, o, &th, &rt);
        int32_t v = clamp(own_of(c, O_PB) + th + rt * 16383 / 32512, 0, 16383);
        out[0] = (uint8_t)(0xE0 | ch);
        out[1] = (uint8_t)(v & 0x7F);
        out[2] = (uint8_t)(v >> 7);
        return 3;
    }
    if (o == O_AT) {
        live_parts(c, o, &th, &rt);
        out[0] = (uint8_t)(0xD0 | ch);
        out[1] = (uint8_t)clamp(own_of(c, O_AT) + th + round256(rt), 0, 127);
        return 2;
    }
    int32_t cc = cc_of(c, o), own = 0, sum_th = 0, sum_rt = 0, any = 0;
    uint16_t latest = 0;
    for (int p = O_MW; p < OUTPUTS; p++) {
        if (cc_of(c, p) != cc)
            continue;
        // the track's own value: the one that changed last, of those switched on
        int on = c->owner < 0 || c->owner > 7 || ENABLED(c->owner, ID_FIRST + p);
        if (on && (!any || (int16_t)(c->stamp[p] - latest) > 0)) {
            latest = c->stamp[p];
            own = own_of(c, p);
            any = 1;
        }
        live_parts(c, p, &th, &rt);
        sum_th += th;
        sum_rt += rt;
    }
    out[0] = (uint8_t)(0xB0 | ch);
    out[1] = (uint8_t)(cc < 128 ? cc : 0);
    out[2] = (uint8_t)clamp(own + sum_th + round256(sum_rt), 0, 127);
    return 3;
}

// Ask the MIDI tracks' task for a pass. Any task may call this; one record at
// most is in the queue (the pass clears `posted` before it looks).
static void wake(void)
{
    uint16_t sr = irq_off();
    if (posted) {
        irq_restore(sr);
        return;
    }
    posted = 1;
    irq_restore(sr);
    me_wakes++;
    QUEUE_SEND(TASK_QUEUE, &wake_rec);
}

// In the MIDI tracks' task only: append what is pending to a buffer, up to
// ROOM bytes in it. Returns 0 when something had to wait.
static int emit(volatile uint8_t *len, volatile uint8_t *buf, int via_append)
{
    for (int ch = 0; ch < 16; ch++) {
        struct chan *c = &chans[ch];
        for (int o = 0; o < OUTPUTS; o++) {
            uint8_t out[3];
            uint16_t sr = irq_off();
            if (!c->pending[o]) {
                irq_restore(sr);
                continue;
            }
            uint32_t at = *len;
            if (at + 3 > ROOM) {
                me_held++;
                irq_restore(sr);
                return 0;
            }
            uint8_t n = compose(c, ch, o, out);
            int live = group_live(c, o);
            int32_t cc = cc_of(c, o);
            // The track's task calls send() for a value again and again (its
            // LFO, every pass), stock leaves out what did not change: so does this.
            int same = c->known[o] && c->heard[o][0] == out[0] && c->heard[o][1] == out[1]
                       && (n < 3 || c->heard[o][2] == out[2]);
            for (int p = 0; p < OUTPUTS; p++) {
                if (p == o || (cc >= 0 && cc_of(c, p) == cc)) {
                    c->pending[p] = 0;  // one message for the CC number
                    c->taken[p] = (uint8_t)live;
                    c->known[p] = 1;
                    for (uint8_t i = 0; i < n; i++)
                        c->heard[p][i] = out[i];
                }
            }
            irq_restore(sr);
            if (same) {
                me_skipped++;
                continue;
            }
            if (via_append) {
                CC_APPEND(n, out);      // as stock appends its CCs: another mod's hook there sees them
            } else {
                for (uint8_t i = 0; i < n; i++)
                    buf[at + i] = out[i];
                *len = (uint8_t)(at + n);
            }
            me_sent++;
        }
    }
    return 1;
}

// task.s: the task's pass, just before it sends its buffers.
void me_task_pass(void)
{
    posted = 0;
    me_passes++;
    if (!initialised)
        return;
    if (!emit(&CCS_LEN, CCS_BUF, 1))
        wake();
}

static void flush(void)
{
    wake();
}

// After a change on a channel: every output that is live now, or was this
// mod's last time (it gets the track's own value back), goes out again.
// mask: only outputs a source in it reaches (0: all). Interrupts masked.
static void refresh(struct chan *c, uint32_t sources)
{
    const struct me_cfg *cfg = cfg_of(c);
    for (int o = 0; o < OUTPUTS; o++) {
        int reach = !sources;
        int s = thru_source(o);
        if (s >= 0 && (sources & BIT(s)) && cfg->thru)
            reach = 1;
        if ((sources & BIT(S_MW)) && cfg->mw_dest == o + 1)
            reach = 1;
        if ((sources & BIT(S_AT)) && cfg->at_dest == o + 1)
            reach = 1;
        if ((sources & BIT(S_VEL)) && cfg->vel_dest == o + 1)
            reach = 1;
        if (reach && (c->taken[o] || group_live(c, o)))
            c->pending[o] = 1;
    }
}

static void release_auto(void)
{
    me_audio_release_auto();
    uint16_t sr = irq_off();
    for (int ch = 0; ch < 16; ch++) {
        struct chan *c = &chans[ch];
        uint8_t gone = c->via_auto;
        if (!gone)
            continue;
        c->touched &= (uint8_t)~gone;
        for (int s = 0; s < SOURCES; s++)
            if (gone & BIT(s))
                c->in[s] = 0;
        c->via_auto = 0;
        refresh(c, 0);
        me_released++;
    }
    irq_restore(sr);
    flush();
}

void me_midi_changed(int m)
{
    if (m < 0 || m > 7 || !initialised)
        return;
    uint16_t sr = irq_off();
    for (int ch = 0; ch < 16; ch++)
        if (chans[ch].owner == m)
            refresh(&chans[ch], 0);
    irq_restore(sr);
    flush();
}

static void check_track(void)
{
    int32_t t = ACTIVE_TRACK;
    if (t != last_active) {
        if (last_active >= 0)
            release_auto();
        last_active = t;
    }
}

static void take(int src, int32_t live, int32_t in_ch, int32_t flag)
{
    me_activity++;
    init();
    check_track();
    uint32_t tracks = 0, audio = 0;
    int from_auto = (flag & 0x14) != 0; // the auto channel (DIN 0x10, USB 4)
    if (from_auto) {
        int32_t t = ACTIVE_TRACK;
        if (t >= 8 && t < 16)
            tracks = 1u << (t - 8);
        else if (t >= 0 && t < 8)
            audio = 1u << t;
    } else {
        for (int t = 0; t < 16; t++)
            if (TRACK_CHANNEL[t] == in_ch) {
                if (t >= 8)
                    tracks |= 1u << (t - 8);
                else
                    audio |= 1u << t;
            }
    }
    if (audio && src != S_BC)
        me_audio_take(src == S_PB ? PB : src == S_AT ? AT : MW, live, audio, from_auto);
    if (!tracks)
        return;
    me_taken++;
    for (int m = 0; m < 8; m++) {
        if (!(tracks & (1u << m)))
            continue;
        int32_t ch = CHANNEL(m);
        if (ch < 0 || ch > 15)
            continue;
        struct chan *c = &chans[ch];
        uint16_t sr = irq_off();
        if (c->owner != m) {            // another track on this channel now: its settings
            c->owner = (int8_t)m;
            refresh(c, 0);
        }
        c->in[src] = (int16_t)live;
        c->touched |= BIT(src);
        if (from_auto)
            c->via_auto |= BIT(src);
        else
            c->via_auto &= (uint8_t)~BIT(src);
        refresh(c, BIT(src));
        irq_restore(sr);
    }
    flush();
}

// ---- the dispatcher's table entries ----------------------------------------
void me_pitch_bend(const uint8_t *msg, int32_t len, int32_t flag)
{
    if (len == 3)
        take(S_PB, (int32_t)(msg[1] | (msg[2] << 7)) - 8192, msg[0] & 15, flag);
}

void me_aftertouch(const uint8_t *msg, int32_t len, int32_t flag)
{
    if (len == 2)
        take(S_AT, msg[1], msg[0] & 15, flag);
}

void me_control_change(const uint8_t *msg, int32_t len, int32_t flag)
{
    STOCK_CC(msg, len, flag);           // stock handling first, always
    if (RECEIVE_CC && len == 3 && (msg[1] == 1 || msg[1] == 2))
        take(msg[1] == 1 ? S_MW : S_BC, msg[2], msg[0] & 15, flag);
}

// ---- send(): what the MIDI tracks send themselves ---------------------------
// Called from send.s at the entry of the stock send(track, channel, id,
// value, force), in the MIDI tracks' task. Returns the value for stock to
// send, or TAKE_OVER when this mod sends the combined value itself.
int32_t me_filter(int32_t track, int32_t channel, int32_t id, int32_t value, int32_t force)
{
    int o = id - ID_FIRST;
    if (o < 0 || o >= OUTPUTS || channel < 0 || channel > 15)
        return value;
    init();
    me_filtered++;
    struct chan *c = &chans[channel];
    uint16_t sr = irq_off();
    if (c->owner < 0 && track >= 0 && track < 8)
        c->owner = (int8_t)track;       // whose SEL numbers apply
    c->own[o] = (int16_t)(o == O_PB ? clamp(value, 0, 16383) : clamp((int16_t)value >> 8, 0, 127));
    c->seen[o] = 1;
    c->stamp[o] = ++clock_stamp;
    int32_t cc = cc_of(c, o);
    if (!group_live(c, o)) {
        for (int p = 0; p < OUTPUTS; p++)   // stock sends it: what the synth has is stock's
            if (p == o || (cc >= 0 && cc_of(c, p) == cc))
                c->known[p] = 0;
        irq_restore(sr);
        return value;                   // nothing live here: stock, untouched
    }
    if (force)
        c->known[o] = 0;                // a forced send goes out, changed or not
    c->pending[o] = 1;
    irq_restore(sr);
    flush();
    return TAKE_OVER;
}

void me_page_tick(void *ctrl);

// ---- the MIDI tracks' LFO as a destination -----------------------------------
// The MIDI tracks' task runs each track's LFO with 0x400ed438(params, track,
// mask) (at 0x400e130a for all eight, 0x400e1886 for one), which reads the
// track's LFO parameters from its parameters in use (0x421c9188, 53 words a
// track: 1 SPD, 2 MULT, 3 FADE, 4 DEST, 5 WAVE, 6 SPH, 7 MODE, 8 DEP, 8.8;
// SPD, FADE and DEP centred on 0x4000; 9-16 a second set the page does not
// show). Those words are loaded from the pattern only at a trig, so a route
// cannot stay in them: an 8-byte site at the function's entry (midilfo.s)
// adds the live routes just before it runs and puts the words back just after.
// Both in the MIDI tracks' task, which is the only one that writes them.
static const int8_t lfo_param[5] = { 1, 2, 3, 6, 8 };
static struct {
    int8_t n;
    int8_t param[3];
    int16_t was[3], put[3];
} lfo_mod;

// For tests: a marker, then how often the LFO site ran and how often a route was in.
volatile uint32_t me_lfo_probe[3] = { 0x4d454c46, 0, 0 };   // "MELF"

void me_midi_lfo_pre(volatile int16_t *params, int32_t t)
{
    lfo_mod.n = 0;
    me_lfo_probe[1]++;
    if (!initialised || t < 0 || t > 7)
        return;
    int32_t ch = CHANNEL(t);
    if (ch < 0 || ch > 15)
        return;
    const struct chan *c = &chans[ch];
    if (c->owner != t)
        return;
    const struct me_cfg *cfg = &me_midi_cfg[t];
    const struct { int8_t dest; int16_t amount; int src; } r[3] = {
        { cfg->mw_dest, cfg->mw_amount, S_MW },
        { cfg->at_dest, cfg->at_amount, S_AT },
        { cfg->vel_dest, cfg->vel_amount, S_VEL },
    };
    int32_t add[5];                    // cleared by hand: -Os would call memset, which a mod lacks
    for (int k = 0; k < 5; k++)
        add[k] = 0;
    int any = 0;
    for (int i = 0; i < 3; i++) {
        int k = r[i].dest - MIDI_LFO_FIRST;
        if (k < 0 || k > 4 || !(c->touched & BIT(r[i].src)) || !c->in[r[i].src])
            continue;
        add[k] += c->in[r[i].src] * clamp(r[i].amount, -AMOUNT_MAX, AMOUNT_MAX) / 64;
        any = 1;
    }
    if (!any)
        return;
    volatile int16_t *w = params + 53 * t;
    for (int k = 0; k < 5 && lfo_mod.n < 3; k++) {
        if (!add[k])
            continue;
        int p = lfo_param[k];
        int16_t was = w[p], put = (int16_t)clamp(was + add[k], 0, 32512);
        lfo_mod.param[lfo_mod.n] = (int8_t)p;
        lfo_mod.was[lfo_mod.n] = was;
        lfo_mod.put[lfo_mod.n] = put;
        lfo_mod.n++;
        w[p] = put;
    }
    me_lfo_probe[2]++;
}

void me_midi_lfo_post(volatile int16_t *params, int32_t t)
{
    if (t < 0 || t > 7) {
        lfo_mod.n = 0;
        return;
    }
    volatile int16_t *w = params + 53 * t;
    for (int i = 0; i < lfo_mod.n; i++) {
        int p = lfo_mod.param[i];
        int16_t now = w[p];
        // the function itself may have written it (a second LFO aimed at it):
        // keep that change, without this mod's part
        w[p] = now == lfo_mod.put[i] ? lfo_mod.was[i] : (int16_t)(now - (lfo_mod.put[i] - lfo_mod.was[i]));
    }
    lfo_mod.n = 0;
}

// ---- the MIDI tracks' notes: V.SNS and VEL ---------------------------------
// The MIDI tracks' task collects the notes it sends, from the sequencer and
// from MIDI IN alike, with notes_append(len, bytes) at 0x400e1002 into the
// buffer at 0x421b6620, sent each pass. A 6-byte jmp site at its entry
// (vel.s) hands the bytes here first. For a note on, the MIDI track sending
// on its channel (the first, if several share one) takes its velocity as
// played as the VEL source (the route goes out at once, before the note),
// and the note goes on with its velocity through V.SNS. Recording is
// untouched: the sequencer keeps the velocity as played.
static uint8_t note_copy[16];

const uint8_t *me_note_out(int32_t len, const uint8_t *bytes)
{
    if (len < 3 || len > (int32_t)sizeof note_copy)
        return bytes;
    me_activity++;
    init();
    int changed = 0, routed = 0;
    for (int32_t i = 0; i < len; i++)
        note_copy[i] = bytes[i];
    for (int32_t i = 0; i + 2 < len; ) {
        uint8_t st = note_copy[i];
        if (st < 0x80 || st >= 0xF0) {
            i++;
            continue;
        }
        int n = (st & 0xE0) == 0xC0 ? 2 : 3;
        if ((st & 0xF0) == 0x90 && note_copy[i + 2]) {
            int ch = st & 15;
            for (int m = 0; m < 8; m++) {
                if (CHANNEL(m) != ch)
                    continue;
                struct chan *c = &chans[ch];
                uint16_t sr = irq_off();
                if (c->owner != m) {
                    c->owner = (int8_t)m;
                    refresh(c, 0);
                }
                c->in[S_VEL] = note_copy[i + 2];
                c->touched |= BIT(S_VEL);
                refresh(c, BIT(S_VEL));
                irq_restore(sr);
                if (me_midi_cfg[m].vel_dest)
                    routed = 1;
                int32_t sens = me_midi_cfg[m].vel_sens;
                if (sens < VEL_SENS_MAX) {
                    note_copy[i + 2] = (uint8_t)me_velocity_scaled(note_copy[i + 2], sens);
                    changed = 1;
                }
                break;
            }
        }
        i += n;
    }
    if (routed && !emit(&NOTES_LEN, NOTES_BUF, 0))  // the velocity's route before its note
        wake();
    return changed ? note_copy : bytes;
}

// ---- ev_tick: track changes, values that waited ------------------------------
void me_store_tick(void);

void me_tick(void *ctrl)
{
    me_page_tick(ctrl);
    me_store_tick();
    init();
    check_track();
    for (int ch = 0; ch < 16; ch++)
        for (int o = 0; o < OUTPUTS; o++)
            if (chans[ch].pending[o]) {
                wake();                 // a pass that did not happen yet: ask again
                return;
            }
}
