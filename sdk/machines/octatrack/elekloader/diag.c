/* SPDX-License-Identifier: GPL-3.0-or-later
 * The unit's diagnostics log (owner, 15 October 2026): what it did while no site watched, kept in battery RAM so
 * the power cycle a freeze needs keeps it. ep0.c's LOG request reads it; the site uploads it only with the member's
 * diagnostics consent (src/community/octatrack-diagnostics-contract.ts). Numbers and stock codes only: no names,
 * samples or audio.
 *
 * Loads: every five minutes, the CPU's and each DSP core's mean and peak (status.c's meters) and how long it played.
 * Incidents (diag.h): each start; the CPU at 90 % or more for a second; the UI tick standing still for five seconds
 * while audio frames run (a freeze, seen from the frame interrupt), with how long it lasted; the frame guard skipping
 * a module's render (machine_registry.c); a crash or a DSP stall recorded since the last start (crash.c, dsp.c). An incident keeps what the unit was doing. */
#include <stdint.h>
#include "diag.h"
#ifdef MODWERK_DEV
void modwerk_cost_stamp(unsigned k); /* diag.c: the development profile of the base's hooks */
#define MW_STAMP(k) modwerk_cost_stamp(k)
#else
#define MW_STAMP(k) ((void)0)
#endif

extern volatile uint32_t modwerk_status[];      /* status.c: CPU, core 0 mean, peak, core 1 mean, peak (per mille) */
extern volatile uint32_t modwerk_runtime_ticks; /* runtime.c: counts the UI tick */
extern volatile uint32_t dl_frames;
void modwerk_track_machines(volatile uint8_t *out); /* machine_registry.c */
extern volatile uint32_t mw_frame_sheds, mw_frame_shed_tracks; /* machine_registry.c: the frame guard's skips */
extern const uint8_t modwerk_base_digest[32];       /* the base's identity (build_core.py) */

#ifdef MODWERK_HOST /* test_diag.c models the unit's memory */
extern volatile struct diag_log modwerk_test_log;
extern volatile uint32_t modwerk_test_crash[DIAG_CRASH_BYTES / 4u], modwerk_test_stall[DIAG_STALL_BYTES / 4u], modwerk_test_playing, modwerk_test_tempo24,
    modwerk_test_screen, modwerk_test_timer;
extern volatile uint8_t modwerk_test_running[16];
#define LOG (&modwerk_test_log)
#define CRASH modwerk_test_crash
#define STALL modwerk_test_stall
#define PLAYING (modwerk_test_playing == 1u)
#define TEMPO24 modwerk_test_tempo24
#define SCREEN modwerk_test_screen
#define RUNNING(i) (modwerk_test_running[i])
#define DTCN3 modwerk_test_timer
extern uint32_t modwerk_test_modules[16]; /* the installed module ids, 0 past the end */
static unsigned installed(uint32_t *ids, unsigned most) { unsigned n = 0; for (unsigned i = 0; i < 16u && n < most; ++i) if (modwerk_test_modules[i]) ids[n++] = modwerk_test_modules[i]; return n; }
#else
/* Battery RAM nothing else uses: stock references nothing in 0x100f859c-0x100fff00, PLAY MODES and PLOCKS end at
 * 0x100f8f06 and fxmap.c's map starts at 0x100fe000. */
#define LOG ((volatile struct diag_log *)0x100fc000u)
typedef char diag_fits_battery_ram[0x100fc000u + sizeof(struct diag_log) <= 0x100fe000u ? 1 : -1];
#define CRASH ((const volatile uint32_t *)0x100ff800u) /* crash.c: "MWCR", count, frame, pc */
#define STALL ((const volatile uint32_t *)0x100ff900u) /* dsp.c: "MWST", count, reason */
#define PLAYING (*(volatile uint32_t *)0x800065b8u == 1u) /* dsp.c's PLAYING */
#define TEMPO24 (*(volatile uint32_t *)0x80001814u)        /* the tempo times 24, as Recorder Loop Fix reads it */
#define SCREEN (*(volatile uint32_t *)0x460d165cu)         /* stock's list of input layers, the top one (status.c) */
#define RUNNING(i) (((const volatile uint8_t *)0x80000ec4u)[i]) /* fxmap.c: FX1 T1-T8, then FX2 */
#define DTCN3 (*(volatile uint32_t *)0xfc07c00cu)
unsigned modwerk_runtime_list(uint8_t *out, unsigned first, unsigned most); /* loader.c: ep0.c's INVENTORY entries, 24 bytes each, the id at +4 */
static unsigned installed(uint32_t *ids, unsigned most)
{
    uint8_t list[4u + 24u * 14u];
    unsigned got = (modwerk_runtime_list(list, 0, most < 14u ? most : 14u) - 4u) / 24u;
    for (unsigned i = 0; i < got; ++i) ids[i] = (uint32_t)list[8u + 24u * i] << 24 | (uint32_t)list[9u + 24u * i] << 16 | (uint32_t)list[10u + 24u * i] << 8 | list[11u + 24u * i];
    return got;
}
#endif

#define FREEZE_FRAMES 13781u /* five seconds of frames (44,100 / 16 a second): longer than a project load */
#define WINDOW 600u          /* half-seconds in a load record: five minutes */
#define HOT 900u             /* per mille */
#define HOT_GAP 36000u       /* ticks between two HOT incidents: ten minutes, so they leave room for the rest */
#define SETTLED 3600u        /* no HOT in the first minute: the project load at the start runs the CPU near 95 % */

static volatile uint8_t keys[16];
static volatile uint32_t key_count;
static volatile uint32_t started, ticks;
static uint32_t n, cpu_sum, cpu_peak, d0_sum, d0_peak, d1_sum, d1_peak, played, hot_run, hot_count, hot_at, sheds, shed_at;
static volatile uint32_t frame_gap, tick_gap; /* the frame interrupt's window maxima: DTCN3 counts between frames, frames without a tick */

/* What the unit is doing; read from the tick or the frame interrupt, nothing locked: a snapshot. */
static void context(volatile struct diag_incident *r, unsigned kind)
{
    r->kind = (uint16_t)kind;
    r->cpu = (uint16_t)modwerk_status[0], r->dsp0 = (uint16_t)modwerk_status[1], r->dsp1 = (uint16_t)modwerk_status[3];
    modwerk_track_machines(r->machine);
    for (unsigned i = 0; i < 16u; ++i) r->fx[i] = RUNNING(i);
    uint32_t k = key_count;
    for (unsigned i = 0; i < 16u; ++i) r->keys[i] = k + i >= 16u ? keys[(k + i) % 16u] : 0xffu;
    r->screen = SCREEN, r->tempo24 = TEMPO24, r->playing = PLAYING;
}
/* A crash or stall found at the start: its moment is gone, so no context. */
static void bare(volatile struct diag_incident *r, unsigned kind)
{
    for (unsigned i = 0; i < sizeof *r; ++i) ((volatile uint8_t *)r)[i] = 0;
    r->kind = (uint16_t)kind;
    for (unsigned i = 0; i < 16u; ++i) r->keys[i] = 0xffu;
}
/* The next incident: its seq is 0 while it is written and set last, so a reader never takes half of one. */
static volatile struct diag_incident *slot(volatile struct diag_log *l)
{
    volatile struct diag_incident *r = &l->incident[l->incidents % DIAG_INCIDENTS];
    r->seq = 0;
    return r;
}
static void push(volatile struct diag_log *l, volatile struct diag_incident *r)
{
    l->seq = l->seq + 1u;
    r->seq = l->seq;
    l->incidents = l->incidents + 1u;
}
static void add(volatile struct diag_log *l, unsigned kind, uint32_t a, int with_context)
{
    volatile struct diag_incident *r = slot(l);
    if (with_context) context(r, kind); else bare(r, kind);
    r->boot = l->boot, r->second = ticks / 60u, r->a = a;
    push(l, r);
}
/* The frame interrupt's freeze, into the incidents (it keeps its own boot and second). */
static void add_freeze(volatile struct diag_log *l)
{
    volatile struct diag_incident *r = slot(l);
    const volatile uint8_t *from = (const volatile uint8_t *)&l->freeze;
    for (unsigned i = sizeof r->seq; i < sizeof *r; ++i) ((volatile uint8_t *)r)[i] = from[i];
    push(l, r);
}
static void start(volatile struct diag_log *l)
{
    uint32_t crashes = CRASH[0] == 0x4d574352u ? CRASH[1] : 0, stalls = STALL[0] == 0x4d575354u ? STALL[1] : 0;
    if (l->magic != DIAG_MAGIC || l->version != DIAG_VERSION) { /* a new log: earlier crashes and stalls aren't its */
        for (unsigned i = 0; i < sizeof *l; ++i) ((volatile uint8_t *)l)[i] = 0;
        l->nonce = DTCN3 ^ dl_frames * 2654435761u;
        l->crash_seen = crashes, l->stall_seen = stalls;
        l->version = DIAG_VERSION, l->magic = DIAG_MAGIC;
    }
    if (l->freeze_state) add_freeze(l), l->freeze_state = 0; /* the last session froze; a = 0 if it never came back */
    l->boot = l->boot + 1u;
    add(l, DIAG_START, crashes << 16 | (stalls & 0xffffu), 1);
    add(l, DIAG_BASE, (uint32_t)modwerk_base_digest[0] << 24 | (uint32_t)modwerk_base_digest[1] << 16 | (uint32_t)modwerk_base_digest[2] << 8 | modwerk_base_digest[3], 0);
    if (crashes != l->crash_seen) add(l, DIAG_CRASH, CRASH[3], 0);
    if (stalls != l->stall_seen) add(l, DIAG_STALL, STALL[2], 0);
    l->crash_seen = crashes, l->stall_seen = stalls;
}

#ifdef MODWERK_DEV
/* The hooks' cost (diag.h): each stamp closes the span the one before it opened. */
volatile uint32_t modwerk_cost[28];
static uint32_t cost_at[28];
void modwerk_cost_stamp(unsigned k)
{
    uint32_t now = DTCN3;
    cost_at[k] = now;
    if (k >= 2u && k <= 9u) modwerk_cost[k - 1u] += now - cost_at[k - 1u];
    if (k == 9u) modwerk_cost[0] += now - cost_at[1], ++modwerk_cost[15];
    if (k == 13u) modwerk_cost[12] += now - cost_at[12], ++modwerk_cost[13];
    if (k == 15u) modwerk_cost[14] += now - cost_at[14];
    if (k == 16u) modwerk_cost[16] += now - cost_at[4];   /* dl_selection_tick */
    if (k == 17u) modwerk_cost[17] += now - cost_at[16];  /* dl_residency_tick */
    if (k == 20u) modwerk_cost[20] += now - cost_at[12];  /* boot_draw */
    if (k == 21u) modwerk_cost[21] += now - cost_at[20];  /* the bus between boot_draw and runtime_draw */
    if (k == 22u) modwerk_cost[22] += now - cost_at[21];  /* runtime_draw */
    if (k == 13u) modwerk_cost[23] += now - cost_at[22];  /* status_draw */
    if (k == 25u) modwerk_cost[24] += now - cost_at[24];  /* mg_tick, the MIDI generators' (midi_generators.c) */
    if (k == 27u) {                                       /* a generator's knob turn with its regeneration */
        uint32_t d = now - cost_at[26];
        if (d > modwerk_cost[25]) modwerk_cost[25] = d;
        ++modwerk_cost[26]; modwerk_cost[27] += d;
    }
}
/* dev.c's FREEZE TEST: the UI tick stands still this many seconds (the timer runs at 132 MHz), audio and USB go on. */
volatile uint32_t modwerk_diag_test_freeze;
static void test_freeze(void)
{
    uint32_t seconds = modwerk_diag_test_freeze, from = DTCN3;
    modwerk_diag_test_freeze = 0;
    while (seconds && DTCN3 - from < seconds * 132000000u) {}
}
#else
static void test_freeze(void) {}
#endif

static void diag_tick(void);
void modwerk_diag_tick(void)
{
    MW_STAMP(8); diag_tick(); MW_STAMP(9);
}
static void diag_tick(void)
{
    volatile struct diag_log *l = LOG;
    if (!started) { start(l); started = 1; return; }
    test_freeze();
    ticks = ticks + 1u;
    if (l->freeze_state == 2u) add_freeze(l), l->freeze_state = 0;
    uint32_t skipped = mw_frame_sheds; /* the frame guard skipped a render: at most one incident in HOT_GAP */
    if (skipped != sheds && (!shed_at || ticks - shed_at >= HOT_GAP))
        add(l, DIAG_SHED, (mw_frame_shed_tracks & 0xffu) << 24 | (skipped & 0xffffffu), 1), shed_at = ticks, sheds = skipped;
    if (ticks % 30u) return; /* twice a second, as status.c's meter */
    uint32_t cpu = modwerk_status[0], d0p = modwerk_status[2], d1p = modwerk_status[4];
    ++n, cpu_sum += cpu, d0_sum += modwerk_status[1], d1_sum += modwerk_status[3], played += PLAYING;
    if (cpu > cpu_peak) cpu_peak = cpu;
    if (d0p > d0_peak) d0_peak = d0p;
    if (d1p > d1_peak) d1_peak = d1p;
    if (cpu < HOT || ticks < SETTLED) hot_run = 0;
    else {
        ++hot_count;
        if (++hot_run == 2u && (!hot_at || ticks - hot_at >= HOT_GAP)) add(l, DIAG_HOT, hot_count, 1), hot_at = ticks;
    }
    if (n < WINDOW) return;
    volatile struct diag_load *d = &l->load[l->loads % DIAG_LOADS];
    d->seq = 0;
    d->boot = l->boot, d->minute = ticks / 3600u;
    d->cpu_mean = (uint16_t)(cpu_sum / n), d->cpu_peak = (uint16_t)cpu_peak;
    d->dsp0_mean = (uint16_t)(d0_sum / n), d->dsp0_peak = (uint16_t)d0_peak;
    d->dsp1_mean = (uint16_t)(d1_sum / n), d->dsp1_peak = (uint16_t)d1_peak;
    d->samples = (uint16_t)n, d->playing = (uint16_t)played;
    uint32_t gap = frame_gap / 132u, still = tick_gap; /* µs; frames */
    d->frame_gap = (uint16_t)(gap < 65535u ? gap : 65535u), d->tick_gap = (uint16_t)(still < 65535u ? still : 65535u);
    frame_gap = tick_gap = 0;
    l->seq = l->seq + 1u;
    d->seq = l->seq;
    l->loads = l->loads + 1u;
    n = cpu_sum = cpu_peak = d0_sum = d0_peak = d1_sum = d1_peak = played = hot_count = 0;
}
/* modset.c, engine task: the installed set after a restore from the card and after each Keep, as ids. */
void modwerk_diag_set(void)
{
    if (!started) return;
    volatile struct diag_log *l = LOG;
    uint32_t ids[14];
    unsigned count = installed(ids, 14u);
    volatile struct diag_incident *r = slot(l);
    bare(r, DIAG_SET);
    r->boot = l->boot, r->second = ticks / 60u, r->a = count;
    volatile uint8_t *b = r->machine; /* machine, fx and keys: one run of 56 bytes */
    for (unsigned i = 0; i < 56u; ++i) b[i] = i < 4u * count ? (uint8_t)(ids[i / 4u] >> (24u - 8u * (i % 4u))) : 0;
    push(l, r);
}

int modwerk_diag_key(int code, int pressed)
{
    if (pressed) keys[key_count % 16u] = (uint8_t)code, key_count = key_count + 1u;
    return 0;
}

/* In the frame interrupt (level 5): a few compares a frame, and once a freeze the context, well under the 200 µs
 * the frame interrupt may be held (OCTATRACK_HARDWARE_TRAPS.md). It writes only the freeze slot. */
void modwerk_diag_frame(void)
{
    static uint32_t seen, still, last;
    if (!started) return;
    volatile struct diag_log *l = LOG;
    uint32_t t = modwerk_runtime_ticks, now = DTCN3;
    if (last && now - last > frame_gap) frame_gap = now - last; /* the longest gap between frames this window */
    last = now;
    if (still + 1u > tick_gap) tick_gap = still + 1u;          /* the longest run of frames without a tick */
    if (t != seen) {
        if (l->freeze_state == 1u) l->freeze.a = still, l->freeze_state = 2u;
        seen = t, still = 0;
        return;
    }
    if (++still == FREEZE_FRAMES && !l->freeze_state) {
        volatile struct diag_incident *r = &l->freeze;
        context(r, DIAG_FREEZE);
        r->seq = 0, r->boot = l->boot, r->second = ticks / 60u, r->a = 0;
        l->freeze_state = 1u;
    }
}

/* The log, then crash.c's and dsp.c's records (diag.h), then zeros. */
unsigned modwerk_diag_read(uint8_t *out, unsigned page)
{
    const volatile uint8_t *log = (const volatile uint8_t *)LOG, *crash = (const volatile uint8_t *)CRASH, *stall = (const volatile uint8_t *)STALL;
    for (unsigned i = 0, at = page * DIAG_PAGE; i < DIAG_PAGE; ++i, ++at)
        out[i] = at < sizeof(struct diag_log) ? log[at]
               : at < sizeof(struct diag_log) + DIAG_CRASH_BYTES ? crash[at - sizeof(struct diag_log)]
               : at < DIAG_IMAGE_BYTES ? stall[at - sizeof(struct diag_log) - DIAG_CRASH_BYTES] : 0;
    return DIAG_PAGE;
}
