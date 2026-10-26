// Retrig Grid for the Analog Rytm MKII (OS 1.74): a Modwerk elemod module.
//
// Hold RTRG and play a pad: stock plays the pad at once, then retrigs it at the
// RETRIG rate, counted from the press. This module keeps the first hit and puts
// the series on the sequencer's grid while it plays: the retrigs fall where the
// rate's note values fall from PLAY, straight (no swing), as the metronome counts.
//
// Stock arms a pad's series in the audio block that plays the press: a tick
// counter (960 ticks a whole note, 240 PPQN) set to 960, and the next tick's
// deadline set one tick after the block on the musical clock (90000 units a
// tick at any tempo). Stock then fires a retrig on each tick where the counter
// is a multiple of the rate's period. ev_render_out runs after that, in the same
// block: it moves the deadline and the counter so the first tick it lets through
// is the first grid point at least half a period after the press. Stock does the
// rest, the RETRIG menu's LENGTH and VEL.CUR included.
//
// Each audio block it follows the sequencer's pulse; until a pad's series moves
// it reads nothing else but on-chip SRAM. The storage field is read in the UI
// (ev_project and the SETTINGS row).

#include <stdint.h>
#include "analog-rytm-mk2/store.h"

STORE_FIELD(retrig_grid_off);   // project, 1 bit: 0 = ON (the default)

extern void core_additem(void *menu, const void *row);
extern void retrig_grid_label(void);

#define TRACKS 12               // the twelve pad tracks
#define TICK 90000              // musical-clock units in one tick
#define PULSE_TICKS 10          // the sequencer's pulse, 24 PPQN
#define WHOLE 960               // ticks in a whole note: the counter's span
#define WHOLE_PULSES 96

// OS 1.74 locations (build.json release cflags)
#define RT_ACTIVE ((volatile uint8_t *)RT_ACTIVE_AT)        // [t] 1: a pad's series
#define RT_DEADLINE ((volatile int32_t *)RT_DEADLINE_AT)    // [t] its next tick
#define RT_COUNT ((volatile int32_t *)RT_COUNT_AT)          // [t] 960..1
#define RT_RATE(t) (*(volatile int32_t *)(RT_TEMPLATE_AT + 56 * (t) + 36))  // RETRIG 0..16
#define SEQ_PULSE (*(volatile int32_t *)SEQ_PULSE_AT)       // the next pulse's time
#define SEQ_STEP (*(volatile uint16_t *)SEQ_STEP_AT)        // its master step since PLAY
#define SEQ_PULSE_N (*(volatile uint8_t *)SEQ_PULSE_N_AT)   // its pulse in that step
#define SEQ_PLAYING (*(volatile int32_t *)SEQ_PLAYING_AT)
#define SEQ_PATTERN (*(volatile int8_t *)SEQ_PATTERN_AT)
#define PATTERN_SPEED(p) (((volatile int8_t *)PATTERNS_AT)[85760 * (p) + 85690])
#define SPEED_PULSES ((const int32_t *)SPEED_PULSES_AT)     // 3, 4, 6, 8, 12, 24, 48

// RETRIG 1/1 .. 1/80, in ticks
static const int16_t period[17] = { 960, 480, 320, 240, 192, 160, 120, 96, 80, 60, 48, 40, 30, 24, 20, 15, 12 };

volatile uint8_t retrig_grid_on = 1;
static int32_t seen_sum;
static int32_t seen_deadline[TRACKS];
static int32_t seen_count[TRACKS];

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

// On a (re)start: master step x pulses per step + pulse, exact at PLAY.
static void __attribute__((noinline)) resync(void)
{
    unsigned short sr = irq_off();
    int32_t pulse = SEQ_PULSE;
    unsigned step = SEQ_STEP, n = SEQ_PULSE_N;
    int pattern = SEQ_PATTERN, speed;

    irq_restore(sr);
    speed = pattern >= 0 && pattern < 128 ? PATTERN_SPEED(pattern) : 2;
    if (speed < 0 || speed > 6)
        speed = 2;
    bar_pulse = (step * (unsigned)SPEED_PULSES[speed] + n) % WHOLE_PULSES;
    last_pulse = pulse;
}

// The series was armed in this block, with its deadline one tick after the press.
static void __attribute__((noinline)) rephase(int t, int32_t deadline)
{
    int32_t press = deadline - TICK, a, q, h, ht;
    int rate = RT_RATE(t);

    if (rate < 0 || rate > 16)
        return;
    // the press's place in the whole note (bars from PLAY), in clock units
    a = (int32_t)bar_pulse * PULSE_TICKS * TICK - (last_pulse - press);
    a %= WHOLE * TICK;
    if (a < 0)
        a += WHOLE * TICK;
    // the first grid point at least half a period after the press
    q = period[rate] * TICK;
    h = (a + q / 2 + q - 1) / q * q;
    ht = h / TICK % WHOLE;
    RT_DEADLINE[t] = press + (h - a);
    RT_COUNT[t] = (WHOLE - ht) % WHOLE + 1;
}

// A pad series' deadline moved: a tick, or a press armed it in this block.
static void __attribute__((noinline)) moved(int t, int32_t d)
{
    int32_t c = RT_COUNT[t];

    // 960 after a tick that ran the counter out is the whole note's wrap, not a press
    if (c == WHOLE && !(seen_count[t] == 1 && d - seen_deadline[t] == TICK)
        && retrig_grid_on && SEQ_PLAYING) {
        rephase(t, d);
        d = RT_DEADLINE[t];
        c = RT_COUNT[t];
    }
    seen_deadline[t] = d;
    seen_count[t] = c;
}

// ev_render_out: after the audio block, stock's retrig state for this block in
// place. Every block: the pulse. Until a pad has retriggered: three SRAM reads.
// Then the twelve deadlines' sum, and the tracks only when it moved (a tick or
// a press).
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
        if (pulse - last_pulse == PULSE_TICKS * TICK) {
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

// The SETTINGS row: its label reads the state, a press turns it over. The text
// comes back as an integer, in d0, where label.s reads it (gcc returns pointers in a0).
uint32_t retrig_grid_text(void)
{
    return (uint32_t)(retrig_grid_on ? "RETRIG GRID ON" : "RETRIG GRID OFF");
}

static void retrig_grid_select(void)
{
    retrig_grid_on = !retrig_grid_on;
    core_store_set(STORE(retrig_grid_off), 0, 0, !retrig_grid_on);
}

static int retrig_grid_nothing(void)
{
    return 0;
}

static const void *const retrig_grid_row[4] = {
    (const void *)retrig_grid_label, (const void *)retrig_grid_select,
    (const void *)retrig_grid_nothing, (const void *)retrig_grid_nothing,
};

// ev_settings: building the SETTINGS menu
void retrig_grid_settings(void *menu)
{
    core_additem(menu, retrig_grid_row);
}
