// Retrig Grid, by stigmagit, part of this module: Live Rec Retrig Fix records what
// it times. The recorder's press takes retrig_grid_snap() from live-rec-retrig-fix.s.
//
// Hold RTRG and play a pad: stock plays the pad at once, then retrigs it at the
// RETRIG rate, counted from the press. This module keeps the first hit and puts
// the series on the sequencer's grid while it plays: the retrigs fall where the
// rate's note values fall from PLAY, moved by the swing and micro timing of the
// pad's own track as the sequencer moves that track's trigs.
//
// Stock arms a pad's series in the audio block that plays the press: a tick
// counter (960 ticks a whole note, 240 PPQN) set to 960, and the next tick's
// deadline set one tick after the block on the musical clock (90000 units a
// tick at any tempo). Stock runs at most one tick a block: it counts down and
// fires a retrig on the ticks where the counter is a multiple of the rate's
// period; a count of 1 always fires and reloads 960. LENGTH and VEL.CUR run on
// time, not on ticks. ev_render_out runs after that, in the same block. For
// each retrig it sets the count to 1 and the deadline to the retrig's time: the
// next grid point of the rate in the bar, moved as the track's steps around it
// are (warp()). The first one comes at least half a period after the press.
// Stock does the rest, the RETRIG menu's LENGTH and VEL.CUR included.
//
// Each audio block it follows the sequencer's pulse; until a pad's series moves
// it reads nothing else but on-chip SRAM. The pattern is read once a retrig.
// The storage field is read in the UI (ev_project and the SEQUENCER CONFIG row).

#include <stdint.h>
#include "analog-rytm-mk2/store.h"
#include "grid-1.74.h"
#include "retrig-shared.h"

STORE_FIELD(retrig_grid_off);   // project, 1 bit: 0 = ON (the default)

extern void retrig_grid_label(void);
extern void STOCK_VIEW_REDRAW(uint32_t view);
extern void STOCK_BITMAP_DRAW(void *canvas, const void *glyph, int x, int y, int mode);

#define TICK 90000              // musical-clock units in one tick
#define PULSE (PULSE_TICKS * TICK)
#define WHOLE 960               // ticks in a whole note: the counter's span
#define WHOLE_PULSES 96

// OS 1.74 locations (build.json release cflags)
#define RT_DEADLINE ((volatile int32_t *)RT_DEADLINE_AT)    // [t] its next tick
#define SEQ_PULSE (*(volatile int32_t *)SEQ_PULSE_AT)       // the next pulse's time
#define SEQ_STEP (*(volatile uint16_t *)SEQ_STEP_AT)        // its master step since PLAY
#define SEQ_PULSE_N (*(volatile uint8_t *)SEQ_PULSE_N_AT)   // its pulse in that step
#define TRACK_STEP ((volatile int8_t *)TRACK_STEP_AT)       // [t] the next pulse's track step
#define TRACK_PULSE_N ((volatile int8_t *)TRACK_PULSE_N_AT) // [t] its pulse in that step
#define SEQ_PLAYING (*(volatile int32_t *)SEQ_PLAYING_AT)
#define CHECK_GLYPHS (*(const uint8_t *const *)CHECK_GLYPHS_AT)    // 28 bytes each

// The pattern in memory (85760 bytes), and a track in it (917 bytes)
#define TRACK_BYTES 917
#define PAT_LENGTH 85684        // NORMAL scale: the length word's low byte
#define PAT_SWING 85688         // SWING - 50: 0..30
#define TRK_FLAGS 1             // + 2 x step: bit 0 a trig, bit 4 the swing trig
#define TRK_MICRO 320           // + step: micro timing, 1/24 of a step a unit
#define TRK_LENGTH 709          // ADVANCED scale

volatile uint8_t retrig_grid_on = 1;
static int32_t seen_sum;
static int32_t seen_deadline[TRACKS];
static int32_t seen_count[TRACKS];

// The retrig each pad's next tick is set on: its time on the straight grid, its
// place in the whole note (ticks) and the deadline it was given.
static uint16_t driving;
static int32_t straight[TRACKS];
static int16_t place[TRACKS];
static int32_t written[TRACKS];

// The press has two readers, the series from the exact time and the recorder from
// the step and micro timing, and either may run first. The first decides which grid
// point starts the series, so the trig and the retrigs leave none out.
static uint16_t first_open;     // armed, the recorder has not read straight[t] yet
static uint16_t first_chosen;   // the recorder chose chosen[t]; the series is to come
static int32_t chosen[TRACKS];

static inline unsigned short irq_off(void)
{
    unsigned short sr;
    __asm__ volatile("move.w %%sr,%0\n\tmove.w #0x2700,%%sr" : "=d"(sr) : : "memory");
    return sr;
}

static inline void irq_restore(unsigned short sr)
{
    __asm__ volatile("move.w %0,%%sr" : : "d"(sr) : "memory");
}

// The sequencer's pulse as last seen, and its place in the bar from PLAY. The
// pulse moves on by one pulse's units whatever the pattern's speed, so counting
// it follows speed and pattern changes; any other jump is a (re)start.
static int32_t last_pulse;
static int16_t bar_pulse;

// On a (re)start: pulses since PLAY from the master step and pulse, exact at
// PLAY. The master step counts from 1: PLAY is step 1's first pulse.
static void __attribute__((noinline)) resync(void)
{
    unsigned short sr = irq_off();
    int32_t pulse = SEQ_PULSE;
    int step = SEQ_STEP, n = SEQ_PULSE_N;
    int pattern = SEQ_PATTERN, speed;

    irq_restore(sr);
    speed = pattern >= 0 && pattern < 128 ? PATTERN(pattern)[PAT_SPEED] : 2;
    if (speed < 0 || speed > 6)
        speed = 2;
    bar_pulse = ((step - 1) * SPEED_PULSES[speed] + n) % WHOLE_PULSES;
    if (bar_pulse < 0)
        bar_pulse += WHOLE_PULSES;
    last_pulse = pulse;
}

// A track step's offset from its straight start, as the sequencer times its
// trig: the swing on a step with its swing trig on, plus a trig's micro timing
// unless swing_only.
static int32_t offset(const volatile int8_t *track, int step, int swing, int pulses, int swing_only)
{
    int flags = track[TRK_FLAGS + 2 * step];
    int32_t o = 0;

    if (flags & 0x10)
        o = swing * pulses * (PULSE / 50);
    if (!swing_only && (flags & 1))
        o += track[TRK_MICRO + step] * pulses * (PULSE / 24);
    return o;
}

// Straight time x (on the tick grid) moved for pad t's track: by the offsets of
// the two step starts around x, interpolated between them, so that 1/16 at 1x
// lands on the swung steps and finer rates follow between them. While LIVE
// RECORDING it takes the swing alone: a roll writes micro timing as it goes, and
// its own trigs would move its retrigs on the next pass.
static int32_t __attribute__((noinline)) warp(int t, int32_t x)
{
    const volatile int8_t *pattern, *track;
    unsigned short sr = irq_off();
    int32_t pulse = SEQ_PULSE, span, d, o0, o1;
    int n = TRACK_PULSE_N[t], step = TRACK_STEP[t], p = SEQ_PATTERN;
    int adv, speed, len, swing, pulses, k, j, u, live;

    irq_restore(sr);
    if (p < 0 || p >= 128)
        return x;
    pattern = PATTERN(p);
    track = pattern + TRACK_BYTES * t;
    adv = pattern[PAT_SCALE] == 1;
    speed = adv ? track[TRK_SPEED] : pattern[PAT_SPEED];
    len = adv ? track[TRK_LENGTH] : pattern[PAT_LENGTH];
    swing = pattern[PAT_SWING];
    if (speed < 0 || speed > 6 || len < 1 || len > 64 || step < 0)
        return x;
    if (swing < 0 || swing > 30)
        swing = 0;
    pulses = SPEED_PULSES[speed];
    if (n < 0 || n >= pulses)
        return x;
    // The sequencer prepares each step a step ahead: from the next pulse on, the
    // track's step counter holds the step that starts after the one under way.
    // From that step's start to x: k whole steps and u ticks.
    span = pulses * PULSE;
    d = x - (pulse + (pulses - n) * PULSE);
    k = d >= 0 ? d / span : -((span - 1 - d) / span);
    u = (d - k * span) / TICK;
    j = (step + k) % len;
    if (j < 0)
        j += len;
    live = STOCK_LIVE_REC(STOCK_APP()) != 0;
    o0 = offset(track, j, swing, pulses, live);
    o1 = offset(track, (j + 1) % len, swing, pulses, live) - o0;
    pulses *= PULSE_TICKS;      // ticks in the step
    return x + o0 + o1 / pulses * u + o1 % pulses * u / pulses;
}

// Pad t's next tick: on its retrig's time, with a count that fires.
static void schedule(int t)
{
    int32_t d = warp(t, straight[t]);

    RT_DEADLINE[t] = d;
    RT_COUNT[t] = 1;
    written[t] = d;
    driving |= 1 << t;
}

// The first grid point the series plays after a press at time press: the first
// after it, or the next one if the press is nearer that point than the one before
// it, once moved. That is stock's own choice of step at the rates that fill a step,
// so the press and the first retrig never leave a step between them. Sets x to the
// point's straight time and returns its place in the whole note. ticks: the gap
// between points.
static int __attribute__((noinline)) first_point(int t, int32_t press, int ticks, int32_t *x)
{
    int32_t a, q = ticks * TICK, h;
    int at, i;
    unsigned short sr = irq_off();  // the recorder's task calls this too

    // the press's place in the whole note (bars from PLAY), in clock units
    a = (int32_t)bar_pulse * PULSE - (last_pulse - press);
    irq_restore(sr);
    a %= WHOLE * TICK;
    if (a < 0)
        a += WHOLE * TICK;
    h = (a + q) / q * q;
    *x = press + (h - a);
    at = h / TICK % WHOLE;
    for (i = 0; i < 24; i++) {
        int32_t w = warp(t, *x), v = warp(t, *x - q);

        if (w - press >= (w - v) / 2)
            break;
        *x += q;
        at = (at + ticks) % WHOLE;
    }
    return at;
}

// The series was armed in this block, with its deadline one tick after the press.
static void __attribute__((noinline)) rephase(int t, int32_t deadline)
{
    int rate = RT_RATE(t);

    if (rate < 0 || rate > 16)
        return;
    place[t] = first_point(t, deadline - TICK, retrig_period[rate], &straight[t]);
    if (first_chosen >> t & 1) {
        int32_t d = chosen[t] - straight[t], q = retrig_period[rate] * TICK;

        first_chosen &= ~(1 << t);
        if (d == q || d == -q) {
            straight[t] = chosen[t];
            place[t] = (place[t] + d / TICK + WHOLE) % WHOLE;
        }
    } else {
        first_open |= 1 << t;
    }
    schedule(t);
}

// The retrig this module set has fired: the next grid point of the rate, which
// may have changed while RTRG is held.
static void __attribute__((noinline)) next(int t)
{
    int rate = RT_RATE(t), q, n;

    first_open &= ~(1 << t);
    if (rate < 0 || rate > 16) {
        driving &= ~(1 << t);
        return;
    }
    q = retrig_period[rate];
    n = q - place[t] % q;
    place[t] = (place[t] + n) % WHOLE;
    straight[t] += n * TICK;
    schedule(t);
}

// A pad series' deadline moved: a retrig fired, stock ticked, or a press armed it.
static void __attribute__((noinline)) moved(int t, int32_t d)
{
    int32_t c = RT_COUNT[t];
    int on = retrig_grid_on && SEQ_PLAYING;

    if ((driving >> t & 1) && c == WHOLE && d == written[t] + TICK) {
        if (on)
            next(t);
        else
            driving &= ~(1 << t);   // stopped or OFF: stock goes on from this retrig
    } else if (c == WHOLE && on && !(seen_count[t] == 1 && d - seen_deadline[t] == TICK)) {
        // 960 after a tick that ran the counter out is the whole note's wrap, not a press
        rephase(t, d);
    } else {
        driving &= ~(1 << t);
    }
    seen_deadline[t] = RT_DEADLINE[t];
    seen_count[t] = RT_COUNT[t];
}

// ev_render_out: after the audio block, stock's retrig state for this block in
// place. Every block: the pulse. Until a pad has retriggered: three SRAM reads.
// Then the twelve deadlines' sum, and the tracks only when it moved (a retrig,
// a press, or a series stock runs on its own).
static int32_t deadline_sum(void)
{
    const volatile int32_t *p = RT_DEADLINE;
    int32_t sum;

    __asm__("" : "+a"(p));      // keep the pointer in a register: short loads
    sum = *p++; sum += *p++; sum += *p++; sum += *p++; sum += *p++; sum += *p++;
    sum += *p++; sum += *p++; sum += *p++; sum += *p++; sum += *p++; sum += *p;
    return sum;
}

void retrig_grid_render(void)
{
    const volatile uint32_t *active = (const volatile uint32_t *)RT_ACTIVE;
    int32_t pulse = SEQ_PULSE;
    int t;

    if (pulse != last_pulse) {
        if (pulse - last_pulse == PULSE) {
            last_pulse = pulse;
            if (++bar_pulse == WHOLE_PULSES)
                bar_pulse = 0;
        } else {
            resync();
        }
    }
    if (!(active[0] | active[1] | active[2]) || deadline_sum() == seen_sum)
        return;
    for (t = 0; t < TRACKS; t++)
        if (RT_ACTIVE[t] && RT_DEADLINE[t] != seen_deadline[t])
            moved(t, RT_DEADLINE[t]);
    seen_sum = deadline_sum();
}

// ev_project: after a project load (at boot too) or CREATE NEW
void retrig_grid_project(int how, unsigned dropped)
{
    (void)how;
    (void)dropped;
    retrig_grid_on = !core_store_get(STORE(retrig_grid_off), 0, 0);
}

// Whether pad t's series is on the grid now.
int retrig_grid_driving(int t)
{
    return retrig_grid_on && SEQ_PLAYING && (driving >> t & 1);
}

// Whether the hit that just fired, at a gap of ticks, starts one on the bar's grid.
int retrig_grid_on_gap(int t, int ticks)
{
    return place[t] % ticks == 0;
}

// The recorder, for a retrig press: *step and *micro, where the press sounded, become
// the grid point before the series' first retrig (gap: the ticks between the points the
// trigs sit on; each_hit: every hit gets one), as the track's own steps and micro timing write it, before the
// quantize. The sound stays at the press. A point more than a step away leaves the
// press as played: at the slowest rates that is another beat.
void retrig_grid_snap(int t, int gap, int each_hit, int32_t *step, int32_t *micro)
{
    const volatile int8_t *pattern, *track;
    unsigned short sr;
    int32_t pulse, anchor, span, unit, press, x, d, s0, s1, off, q, w;
    int n, now, p, adv, speed, len, swing, pulses, ticks, k, u, j;

    if (!retrig_grid_on || !SEQ_PLAYING || t >= TRACKS)
        return;
    sr = irq_off();
    pulse = SEQ_PULSE;
    n = TRACK_PULSE_N[t];
    now = TRACK_STEP[t];
    p = SEQ_PATTERN;
    irq_restore(sr);
    if (p < 0 || p >= 128)
        return;
    pattern = PATTERN(p);
    track = pattern + TRACK_BYTES * t;
    adv = pattern[PAT_SCALE] == 1;
    speed = adv ? track[TRK_SPEED] : pattern[PAT_SPEED];
    len = adv ? track[TRK_LENGTH] : pattern[PAT_LENGTH];
    swing = pattern[PAT_SWING];
    if (speed < 0 || speed > 6 || len < 1 || len > 64 || now < 0 || *step < 0 || *step >= len)
        return;
    if (swing < 0 || swing > 30)
        swing = 0;
    pulses = SPEED_PULSES[speed];
    if (n < 0 || n >= pulses)
        return;
    span = pulses * PULSE;
    unit = span / 24;
    ticks = pulses * PULSE_TICKS;
    q = gap * TICK;
    anchor = pulse + (pulses - n) * PULSE;  // the start of the track's step `now`, as warp()

    // the press, from its place: the nearest turn of the track to the step under way
    k = *step - now;
    while (2 * k >= len)
        k -= len;
    while (2 * k < -len)
        k += len;
    press = anchor + k * span + offset(track, *step, swing, pulses, 1) + *micro * unit;

    first_point(t, press, gap, &x);
    if (each_hit) {
        sr = irq_off();
        if (first_open >> t & 1) {
            x = straight[t];
            first_open &= ~(1 << t);
        } else {
            chosen[t] = x;
            first_chosen |= 1 << t;
        }
        irq_restore(sr);
    }
    x -= q;

    // that point on the steps: from its step's swung start, or the next step's if nearer
    d = x - anchor;
    k = d >= 0 ? d / span : -((span - 1 - d) / span);
    u = (d - k * span) / TICK;
    j = (now + k) % len;
    if (j < 0)
        j += len;
    s0 = offset(track, j, swing, pulses, 1);
    s1 = offset(track, (j + 1) % len, swing, pulses, 1) - s0;
    off = u * TICK + s1 / ticks * u + s1 % ticks * u / ticks;
    w = anchor + k * span + s0 + off;
    if (w - press > span || press - w > span)
        return;
    if (off * 2 > span + s1) {
        off -= span + s1;
        j = (j + 1) % len;
    }
    *step = j;
    *micro = (off + (off < 0 ? -unit : unit) / 2) / unit;
}

// The SEQUENCER CONFIG row: a checkbox as stock's rows. The label's text comes back as
// an integer, in d0, where grid-label.s reads it (gcc returns pointers in a0).
uint32_t retrig_grid_text(void)
{
    return (uint32_t)"RETRIG GRID";
}

static void retrig_grid_set(void **menu, int on)
{
    retrig_grid_on = on;
    core_store_set(STORE(retrig_grid_off), 0, 0, !on);
    STOCK_VIEW_REDRAW((uint32_t)*menu + 56);
}

static void retrig_grid_select(void **menu)
{
    retrig_grid_set(menu, !retrig_grid_on);
}

// LEFT unchecks, RIGHT checks.
static void retrig_grid_change(void **menu, int unused, int delta)
{
    (void)unused;
    if (delta)
        retrig_grid_set(menu, delta > 0);
}

static void retrig_grid_draw(void *function, int unused, void *canvas, int x, int y)
{
    (void)function;
    (void)unused;
    STOCK_BITMAP_DRAW(canvas, CHECK_GLYPHS + (retrig_grid_on ? 28 : 0), x + 11, y, 0);
}

const void *const retrig_grid_row[4] = {
    (const void *)retrig_grid_label, (const void *)retrig_grid_select,
    (const void *)retrig_grid_draw, (const void *)retrig_grid_change,
};
