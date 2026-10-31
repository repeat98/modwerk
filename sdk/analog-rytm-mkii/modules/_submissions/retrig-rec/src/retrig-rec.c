// Retrig Rec for the Analog Rytm MKII (OS 1.74): a Modwerk elemod module.
//
// In LIVE RECORDING stock records a retrig hold as one trig, then tries to add a
// trigless lock on each later step, and its held-note wipe removes most of those.
// This module records what was played instead: every hit of a pad's retrig series
// becomes a real trig with the velocity it sounded at, at the time it sounded.
//
// Stock's series runs in the audio block: a tick counter, 960 ticks a whole note,
// fires on the ticks where the count is a multiple of the rate's period and reloads
// from 1 to 960. ev_render_out follows the count and, for each hit, closes the hit
// before it and starts this one by queueing the note events a pad would queue to the
// sequencer task. Stock's own recorder then writes the trig. The module's order is
// before Retrig Grid's, which rewrites the count in the same block.
//
// A step holds one trig. A rate faster than the track's step records a trig on the
// first hit of each whole block of steps, with the step retrig that plays the rest:
// two hits a step at 1/32, three hits in two steps at 1/24.
//
// The stock sites, in retrig-rec.s: the RETRIG menu's step writes off, a press at a rate
// that fits the steps records a plain trig, a recorded retrig takes the menu's VEL.CUR,
// and the note-off that sets its LEN cuts that curve to the trig's share. Quantize live
// rec applies to every note, retrig hits included, as stock has it.

#include <stdint.h>

#define TRACKS 12
#define WHOLE 960               // ticks in a whole note: the counter's span
#define EV_NOTE 0x0d

// OS 1.74 locations (build.json release cflags)
#define RT_ACTIVE ((volatile uint8_t *)RT_ACTIVE_AT)        // [t] 1: a pad's series
#define RT_COUNT ((volatile int32_t *)RT_COUNT_AT)          // [t] 960..1
#define RT_RATE(t) (*(volatile int32_t *)(RT_TEMPLATE_AT + 56 * (t) + 36))  // RETRIG 0..16
#define RT_LENGTHS ((const int32_t *)RT_LENGTHS_AT)        // [length + 1] the curve's speed
#define LENGTH_INF 127                                      // the last length: speed 0
#define KIT_RETRIG(t) (4 * (610 + (t)))                     // kit data: a track's RETRIG menu
#define KIT_LENGTH 4                                        // LENGTH; VEL.CUR is at 5
#define RT_VELOCITY ((volatile uint16_t *)RT_VELOCITY_AT)   // [t] the hit's, 8.8
#define RT_FIRES ((const uint16_t *)RT_FIRES_AT)            // [count] the rates firing there
#define CLOCK (*(volatile uint32_t *)CLOCK_AT)
#define NOTE_RING ((volatile uint8_t *)NOTE_RING_AT)        // 16 events of 32 bytes
#define NOTE_RING_NEXT (*(volatile uint32_t *)NOTE_RING_NEXT_AT)
#define NOTE_QUEUE (*(volatile uint32_t *)NOTE_QUEUE_AT)
#define QUEUED(q) (*(volatile uint32_t *)((q) + 4))      // events waiting
#define NOTE_START ((volatile uint32_t *)NOTE_START_AT)     // [t * 128 + note] clock / 2
#define WIPE_SKIP 251756        // recorder + track: 1 skips the next held-note wipe
#define HELD 251236             // recorder + 40 * track: its held notes, begin at +8, end at +24
#define REC_TRACK 64            // recorder: the track whose step the wipe runs on (index at +8)
#define SEQ_PATTERN (*(volatile int8_t *)SEQ_PATTERN_AT)
#define SPEED_PULSES ((const int32_t *)SPEED_PULSES_AT)     // 3, 4, 6, 8, 12, 24, 48

// The pattern in memory (85760 bytes), and a track in it (917 bytes)
#define PATTERN(p) ((const volatile int8_t *)PATTERNS_AT + 85760 * (p))
#define PAT_SCALE 85689         // 1: ADVANCED, each track its own length and speed
#define PAT_SPEED 85690         // 0..6, as SPEED_PULSES
#define TRK_SPEED 711
#define STEP_VELOCITY 192       // a track's data: velocity byte per step
#define PULSE_TICKS 10

// Stock routines (build.json defsym). They return pointers in d0, so these return integers.
extern uint32_t STOCK_APP(void);
extern uint32_t STOCK_LIVE_REC(uint32_t app);
extern void STOCK_QUEUE_POST(uint32_t queue, void *event);
extern void STOCK_STEP_PLACE(uint32_t clock, int32_t track, uint8_t *place);
extern void STOCK_STEP_SET_RATE(uint32_t track, int32_t step, int32_t rate);
extern void STOCK_STEP_SET_CURVE(uint32_t track, int32_t step, int32_t curve);
extern void STOCK_STEP_SET_LENGTH(uint32_t track, int32_t step, int32_t len);   // retrig LEN
extern uint32_t STOCK_RECORDER(void);
extern uint32_t STOCK_SEQ(void);
extern int32_t STOCK_SEQ_STEP(uint32_t seq, int32_t track);
extern uint32_t STOCK_KIT(uint32_t recorder);
extern int32_t STOCK_KIT_CURVE(uint32_t kit, int32_t track);
extern int32_t STOCK_KEY_DOWN(uint32_t event);                   // a byte: the key went down
extern int32_t STOCK_ALWAYS_ON(uint32_t kit, int32_t track);
extern void STOCK_SET_ALWAYS_ON(uint32_t kit, int32_t track, int32_t on);
extern void STOCK_VIEW_REDRAW(uint32_t view);

// RETRIG 1/1 .. 1/80, in ticks
static const int16_t period[17] = { 960, 480, 320, 240, 192, 160, 120, 96, 80, 60, 48, 40, 30, 24, 20, 15, 12 };

static int32_t seen[TRACKS];
static uint8_t press[TRACKS][32];   // the track's latest press: its note event
static uint8_t have[TRACKS];
static uint8_t open_note[TRACKS];   // the recorder holds a note of this track
static uint8_t rearmed[TRACKS];     // pressed again: the next 960 is not a hit
static uint8_t ahead[TRACKS];       // step + 1 of a hit the wipe's step has not reached
static int8_t rate_seen[TRACKS];    // -1: none yet this press
static uint16_t hits[TRACKS];
static uint32_t started[TRACKS];    // this hit's time, clock / 2
static uint8_t ring_seen;
static uint8_t running;             // a series has run since the last idle pass
static uint8_t guarding;            // some ahead[t] is set
static uint8_t last_velocity[TRACKS];  // the track's last recorded retrig's; 0: none

// The events this module queues: stock's own ring has no lock for the audio block.
static uint8_t events[32][32];
static uint8_t next_event;

static void queue(const uint8_t *event)
{
    uint8_t *e = events[next_event++ & 31];
    int i;

    for (i = 0; i < 32; i++)
        e[i] = event[i];
    STOCK_QUEUE_POST(NOTE_QUEUE, e);
}

// A press queues its note event before the audio block arms the series.
static void watch_presses(void)
{
    unsigned next = NOTE_RING_NEXT & 15;

    while (ring_seen != next) {
        volatile uint8_t *e = NOTE_RING + 32 * ring_seen;
        int t = e[8], i;

        ring_seen = (ring_seen + 1) & 15;
        if (e[0] != EV_NOTE || e[7] != 0 || t >= TRACKS)
            continue;
        for (i = 0; i < 32; i++)
            press[t][i] = e[i];
        started[t] = NOTE_START[(t << 7) + press[t][16]];
        open_note[t] = STOCK_LIVE_REC(STOCK_APP()) != 0;
        rearmed[t] = RT_ACTIVE[t];
        rate_seen[t] = -1;
        hits[t] = 0;
        last_velocity[t] = 0;
        have[t] = 1;
    }
}

// Ticks in a step of track t, at its speed.
static int step_ticks(int t)
{
    const volatile int8_t *pattern;
    int p = SEQ_PATTERN, speed;

    if (p < 0 || p >= 128)
        return 6 * PULSE_TICKS;
    pattern = PATTERN(p);
    speed = pattern[PAT_SCALE] == 1 ? pattern[917 * t + TRK_SPEED] : pattern[PAT_SPEED];
    if (speed < 0 || speed > 6)
        return 6 * PULSE_TICKS;
    return SPEED_PULSES[speed] * PULSE_TICKS;
}

// Hits in the shortest run of whole steps that holds whole hits.
static int hits_in_block(int ticks, int step)
{
    int a = ticks, b = step;

    if (ticks >= step)
        return 1;
    while (b) {
        int c = a % b;

        a = b;
        b = c;
    }
    return step / a;
}

// The step stock's held-note wipe runs on: its recorder track's, not the hit's track's.
static int wipe_step(void)
{
    uint32_t track = *(volatile uint32_t *)(STOCK_RECORDER() + REC_TRACK);

    return STOCK_SEQ_STEP(STOCK_SEQ(), track ? *(volatile int32_t *)(track + 8) : 0);
}

// Hit: close the one before it, as a release would, and start this one.
static void hit(int t)
{
    uint8_t on[32], off[32], place[4];   // the place is three bytes
    uint32_t now = CLOCK >> 1, held;
    int rate = RT_RATE(t), step, block, velocity, micro, i;

    if (!have[t] || rate < 0 || rate > 16)
        return;
    step = step_ticks(t);
    block = hits_in_block(period[rate], step);
    if (rate != rate_seen[t]) {
        if (rate_seen[t] >= 0)
            hits[t] = block - 1;        // a new rate starts a block at this hit
        rate_seen[t] = rate;
    }
    if (++hits[t] % block)
        return;
    if (QUEUED(NOTE_QUEUE) > 30)
        return;                         // the task is held up: every slot may be waiting
    STOCK_STEP_PLACE(CLOCK, t, place);
    velocity = RT_VELOCITY[t] >> 8;
    if (velocity < 1)
        velocity = 1;
    if (velocity > 127)
        velocity = 127;
    micro = (int8_t)place[1];
    held = now - started[t];

    if (open_note[t]) {
        for (i = 0; i < 32; i++)
            off[i] = 0;
        off[0] = EV_NOTE;
        off[7] = 1;
        off[8] = t;
        off[15] = press[t][15];
        off[16] = press[t][16];
        off[20] = held >> 24;
        off[21] = held >> 16;
        off[22] = held >> 8;
        off[23] = held;
        off[29] = place[0];
        off[30] = micro < 0 ? 0xff : 0;
        off[31] = place[1];
        queue(off);
    }

    for (i = 0; i < 32; i++)
        on[i] = press[t][i];
    on[17] = velocity;
    on[20] = period[rate] < step ? rate : 0xff;
    on[28] = 0;
    on[29] = place[0];
    on[30] = micro < 0 ? 0xff : 0;
    on[31] = micro;
    queue(on);

    open_note[t] = 1;
    started[t] = now;
    ahead[t] = place[0] != wipe_step() ? place[0] + 1 : 0;
    guarding |= ahead[t] != 0;
    // the release closes the last hit; -1 here means the release has come
    if ((int32_t)NOTE_START[(t << 7) + press[t][16]] >= 0)
        NOTE_START[(t << 7) + press[t][16]] = now;
}

// A hit placed on the next step is the recorder's held note before the wipe's step gets
// there. Until then any sequencer change runs the held-note wipe on that step, which
// holds the hit before it. Stock's note-off skips the wipe for the same case. The guard
// outlives the series: a release keeps the note held until its step, and ends once the
// recorder has let it go.
static void keep_steps(void)
{
    uint32_t recorder = STOCK_RECORDER();
    int step = wipe_step(), live = STOCK_LIVE_REC(STOCK_APP()) != 0, t;

    guarding = 0;
    for (t = 0; t < TRACKS; t++) {
        volatile uint32_t *held;

        if (!ahead[t])
            continue;
        held = (volatile uint32_t *)(recorder + HELD + 40 * t);
        if (!live || step == ahead[t] - 1 || held[2] == held[6]) {
            ahead[t] = 0;       // outside LIVE RECORDING nothing is wiped
            continue;
        }
        *(volatile uint8_t *)(recorder + WIPE_SKIP + t) = 1;
        guarding = 1;
    }
}

// ev_render_out: stock's series state for this block in place. Nothing but four
// reads a block until a pad is pressed.
void retrig_rec_render(void)
{
    const volatile uint32_t *active = (const volatile uint32_t *)RT_ACTIVE;
    int t;

    if (ring_seen != (NOTE_RING_NEXT & 15))
        watch_presses();
    if (!(active[0] | active[1] | active[2])) {
        if (running) {
            running = 0;
            for (t = 0; t < TRACKS; t++)
                seen[t] = -1;
        }
        if (guarding)
            keep_steps();
        return;
    }
    running = 1;
    for (t = 0; t < TRACKS; t++) {
        int32_t c;

        if (!RT_ACTIVE[t]) {
            seen[t] = -1;
            continue;
        }
        c = RT_COUNT[t];
        if (c == WHOLE && rearmed[t]) {
            rearmed[t] = 0;
        } else if (seen[t] >= 0 && c != seen[t]) {
            int fired = c == WHOLE && seen[t] == 1;
            int rate = RT_RATE(t);

            // a count that did not step down was set by another module
            if (c == seen[t] - 1 && rate >= 0 && rate <= 16)
                fired = ((RT_FIRES[c] * 2) >> rate) & 1;
            if (fired) {
                if (STOCK_LIVE_REC(STOCK_APP()))
                    hit(t);
                else
                    open_note[t] = 0;
            }
        }
        seen[t] = c;
    }
    if (guarding)
        keep_steps();
}

// The recorder, for a press with a retrig (retrig-rec.s): at a rate that fits the steps
// each hit gets its own trig, so the press is a plain one too.
int retrig_rec_press_rate(int rate, int t)
{
    if (rate > 16 || period[rate] >= step_ticks(t))
        return -1;
    return rate;
}

// The RETRIG menu's YES (retrig-rec.s): ALWAYS ON turned over for the menu's track, as
// the ALWAYS ON row's own action does it, whichever row is lit. Returns 0 so the menu
// takes its "not a press" exit and runs no row action.
#define MENU_TRACK 404          // the RETRIG menu: the track it edits

int retrig_rec_menu_yes(uint32_t event, uint32_t view)
{
    uint32_t kit;
    int track;

    if (!(STOCK_KEY_DOWN(event) & 0xff))
        return 0;
    kit = STOCK_KIT(STOCK_RECORDER());
    track = *(volatile int32_t *)(view + MENU_TRACK);
    STOCK_SET_ALWAYS_ON(kit, track, (STOCK_ALWAYS_ON(kit, track) & 1) ^ 1);
    STOCK_VIEW_REDRAW(view);
    return 0;
}

// The RETRIG menu's LENGTH for track t, read as stock's VEL.CUR getter reads its byte:
// the kit's data through its object's method, then the track's record. The series
// template is no use here: the recorded trigs playing back re-arm it with their own LEN.
static int kit_length(uint32_t kit, int t)
{
    uint32_t (**methods)(uint32_t) = *(uint32_t (***)(uint32_t))kit;
    uint32_t data = methods[13](kit);

    if (!data)
        return -1;
    if (t > 11)
        t = 11;
    return *(volatile uint8_t *)(data + KIT_RETRIG(t) + KIT_LENGTH);
}

// A step's recorded velocity, read as stock's step setters reach their bytes: the track's
// data through its object's method, then the step. -1 without data.
static int step_velocity(uint32_t track, int step)
{
    uint32_t (**methods)(uint32_t) = *(uint32_t (***)(uint32_t))track;
    uint32_t data = methods[10](track);

    if (!data || step < 0 || step > 63)
        return -1;
    return *(volatile uint8_t *)(data + STEP_VELOCITY + step);
}

// The recorder's call that sets a step's retrig rate (retrig-rec.s): also the menu's
// VEL.CUR, for now in full. The note-off below cuts it to the trig's share.
static uint8_t scale_curve[TRACKS];    // step + 1 of a trig whose curve awaits its LEN

void retrig_rec_step_rate(uint32_t track, int step, int rate, int t)
{
    STOCK_STEP_SET_RATE(track, step, rate);
    if (t >= TRACKS)
        return;
    STOCK_STEP_SET_CURVE(track, step, STOCK_KIT_CURVE(STOCK_KIT(STOCK_RECORDER()), t));
    scale_curve[t] = step + 1;
}

// The recorder's note-off call that sets a recorded retrig's LEN from the hold
// (retrig-rec.s). The live fade runs VEL.CUR over the menu's LENGTH from the press; each
// trig's velocity is the fade's value at its hit, and stock runs the trig's own curve over
// this LEN, about a step. The curve's speed is the engine's table at the length, so the
// slice that keeps the trigs on the live fade is VEL.CUR times the two speeds' ratio.
void retrig_rec_step_length(uint32_t track, int step, int len, int t)
{
    uint32_t kit;
    int curve, length;

    STOCK_STEP_SET_LENGTH(track, step, len);
    if (t >= TRACKS || scale_curve[t] != step + 1)
        return;
    scale_curve[t] = 0;
    kit = STOCK_KIT(STOCK_RECORDER());
    curve = STOCK_KIT_CURVE(kit, t);
    length = kit_length(kit, t);
    if (!curve || length < 0 || length > LENGTH_INF || len < 0 || len > LENGTH_INF)
        return;
    if (len == LENGTH_INF)
        return;                 // the trig's curve runs at speed 0: whatever it holds
    {
        int speed = RT_LENGTHS[len + 1];
        int end = press[t][17] + curve, velocity = step_velocity(track, step);

        // Past the fade's end the live roll stays level: the velocity has stopped moving
        // at the end's side. With pad pressure on it keeps moving, and the curve stays.
        if (end < 1)
            end = 1;
        if (end > 127)
            end = 127;
        if (velocity >= 0 && velocity == last_velocity[t] &&
            (curve < 0 ? velocity <= end : velocity >= end))
            curve = 0;
        if (velocity >= 0)
            last_velocity[t] = velocity;
        curve = curve * RT_LENGTHS[length + 1];     // 0 at LENGTH INF: no live fade
        curve = (curve + (curve < 0 ? -speed : speed) / 2) / speed;
        if (curve > 127)
            curve = 127;
        if (curve < -127)
            curve = -127;
    }
    STOCK_STEP_SET_CURVE(track, step, curve);
}
