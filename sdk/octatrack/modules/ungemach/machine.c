/* SPDX-License-Identifier: MIT
 * UNGEMACH as a track machine: one row of the base's machine chooser (the ot_machines table), its page and its render.
 * The page, the render glue and the sequencer clock follow the author's VA CLAP draft (not published),
 * which reads stock RAM and ROM the way SYNTIZ, Analog BD and FM Synth do.
 *
 * Not PROTECT: every byte UNGEMACH keeps is a valid FLEX value (PTCH in 4..124, B-F 0..127; on SRC SETUP SPRD has the
 * 4 steps FLEX's slot E has and PNCH F's 128; A-D are hidden at 0).
 *
 * The track's own AMP envelope shapes the drone on the DSP, as it does a sample: a trig opens it, HOLD at its top keeps
 * the drone sounding. UNGEMACH writes nothing into the DSP's voice records, so a frame the base's guard skips leaves the
 * envelope as it was. */
#include <stdint.h>
#include "engine.h"
#include "tables.h"
#include "../../../machines/octatrack/include/modwerk_events.h"

#define U8(a) (*(volatile uint8_t *)(uintptr_t)(a))
/* state the render reads every call goes into initialized data, not bss: the loader reaches a package's bss through
 * the uncached alias, about four times as slow (see voices) */
#define UG_DATA __attribute__((section(".data")))
#define U32(a) (*(volatile uint32_t *)(uintptr_t)(a))
#define CURSOR 0x80001c80u          /* the packer's source cursor */
#define FP_PTR 0x800062a8u          /* the rendered track's record: SRC A-F halfwords, locks, LFOs and scenes applied */
#define EVENTS 0x46104d0cu          /* a byte a track: bit 4, a voice starts this frame */
#define LANE 0x80000810u            /* the frame builder's current values, 72 bytes a track: SRC SETUP at +0x20 */
#define FLEX_DESC 0x400d3176u       /* stock's FLEX page record, 0x38 bytes before the page itself */
#define DESC_BYTES 0x1cau

/* ---- the page ----------------------------------------------------------------------------------------- */

static void text(uint8_t *p, const char *s, unsigned n)
{
    unsigned i = 0;
    for (; i + 1u < n && s[i]; ++i) p[i] = (uint8_t)s[i];
    for (; i < n; ++i) p[i] = 0;
}
static void put32(uint8_t *p, uint32_t v)
{
    p[0] = (uint8_t)(v >> 24), p[1] = (uint8_t)(v >> 16), p[2] = (uint8_t)(v >> 8), p[3] = (uint8_t)v;
}
static void number(char *out, int v)
{
    unsigned i = 0, a = (unsigned)(v < 0 ? 0 : v);
    if (a >= 100u) out[i++] = (char)('0' + a / 100u);
    if (a >= 10u) out[i++] = (char)('0' + a / 10u % 10u);
    out[i++] = (char)('0' + a % 10u);
    out[i] = 0;
}
static void word(char *out, const char *const *names, unsigned count, int v)
{
    text((uint8_t *)out, names[v >= 0 && (unsigned)v < count ? v : 0], 5);
}
/* Formatters, called with the stored value. */
void ungemach_fmt_ptch(char *out, int v) { number(out, v - 4); }     /* PTCH's byte 4..124 shows 0..120 */
void ungemach_fmt_num(char *out, int v) { number(out, v); }
void ungemach_fmt_rate(char *out, int v)
{
    /* 0..63 free; above, the synced cycle in steps */
    static const char *const s[] = { "16", "8", "6", "4", "3", "2" };    /* gen_tables.py's SYNC_STEPS */
    if (v < 64) { number(out, v); return; }
    unsigned i = (unsigned)(v - 64) * 6u / 64u;
    out[0] = 'S', out[1] = 0;
    text((uint8_t *)out + 1, s[i < 6u ? i : 5u], 4);
}
void ungemach_fmt_sprd(char *out, int v) { static const char *const n[] = { "MONO", "NARW", "WIDE", "FULL" }; word(out, n, 4, v); }

typedef struct { const char *label; uint8_t min, count, def, shown; void (*fmt)(char *, int); } Slot;
/* SRC A-F, then SRC SETUP A-F. SETUP C and D are hidden and stay 0: a control there blocks PLAY (C) or changes stock
 * playback (D). Every count is FLEX's own (SETUP: 4, 2, 2, 2, 4, 128). DIRT sits on SRC F, where the track's LFOs and
 * locks reach it: an LFO on it in a trig mode is UNGEMACH's hit. */
static const Slot slots[12] = {
    { "PTCH", 4, 121, 28, 1, ungemach_fmt_ptch },
    { "DISS", 0, 128, 40, 1, ungemach_fmt_num },
    { "TONE", 0, 128, 80, 1, ungemach_fmt_num },
    { "WAVE", 0, 128, 24, 1, ungemach_fmt_num },
    { "RATE", 0, 128, 20, 1, ungemach_fmt_rate },
    { "DIRT", 0, 128, 12, 1, ungemach_fmt_num },
    { "", 0, 4, 0, 0, ungemach_fmt_num },
    { "", 0, 2, 0, 0, ungemach_fmt_num },
    { "", 0, 2, 0, 0, ungemach_fmt_num },
    { "", 0, 2, 0, 0, ungemach_fmt_num },
    { "SPRD", 0, 4, 2, 1, ungemach_fmt_sprd },
    { "PNCH", 0, 128, 0, 1, ungemach_fmt_num },
};
/* The twelve bytes a track takes when it becomes UNGEMACH: PTCH 28 is the root at 55 Hz. */
const uint8_t ungemach_part_defaults[12] = { 28, 40, 80, 24, 20, 12, 0, 0, 0, 0, 2, 0 };   /* PNCH 0: no punch */

static uint8_t desc[DESC_BYTES];
static uint8_t built;
/* The page: stock's FLEX record copied at run time (never shipped), named, ranged and formatted here. Offsets from the
 * page P = record + 0x38: short name +4, full name +9, labels +0x16 + 6 i, defaults +0x5e + i, minimum +0x6a + 4 i,
 * count +0x9a + 4 i, formatter +0xca + 4 i, widget +0xfa + 4 i, knob handler +0x12a + 4 i, enable nibbles +0x18e
 * (slots 0-7) and +0x18a (slots 8-11). */
static uint32_t page(void)
{
    if (!built) {
        const volatile uint8_t *src = (const volatile uint8_t *)(uintptr_t)FLEX_DESC;
        uint8_t *p = desc + 0x38;
        for (unsigned i = 0; i < DESC_BYTES; ++i) desc[i] = src[i];
        text(p + 4, "UNGM", 5), text(p + 9, "SRC UNGEMACH", 13);
        uint32_t lo = 0, hi = 0;
        for (unsigned i = 0; i < 12u; ++i) {
            const Slot *s = &slots[i];
            text(p + 0x16 + 6 * i, s->label, 6);
            p[0x5e + i] = s->def;
            put32(p + 0x6a + 4 * i, s->min);
            put32(p + 0x9a + 4 * i, s->count);
            put32(p + 0xca + 4 * i, (uint32_t)(uintptr_t)s->fmt);
            put32(p + 0xfa + 4 * i, 0);
            put32(p + 0x12a + 4 * i, 0);
            if (s->shown) { if (i < 8u) lo |= 1u << (4 * i); else hi |= 1u << (4 * (i - 8)); }
        }
        put32(p + 0x18e, lo), put32(p + 0x18a, hi);
        built = 1;
    }
    return (uint32_t)(uintptr_t)(desc + 0x38);
}
uint32_t ungemach_track_page(const volatile uint8_t *slot) { (void)slot; return page(); }
uint32_t ungemach_setup_page(uint32_t stock) { (void)stock; return page(); }
unsigned ungemach_setup_knob(unsigned index, int delta) { (void)index, (void)delta; return 0; }

/* ---- the sequencer's time ------------------------------------------------------------------------------ */
/* No clock of its own: the sequencer's, read as Euclid does (sdk/octabam/modules/euclid/control.c, MIT, Sam Banks):
 * the frame clock, the transport, the tempo, and the pattern's and track's speed and length. It sets where a synced
 * RATE's cycle is. */
#define FRAME_CLOCK 0x46104cf0u
#define TRANSPORT 0x800065b8u
#define TEMPO24 0x8000181cu
#define SEQ_BANK 0x800065bdu
#define SEQ_PATTERN 0x800065beu
#define BANK_BLOB 0x400e21e0u
#define BANK_STRIDE 635712u
#define PATTERN_STRIDE 36568u
#define TRACK_STRIDE 2330u
#define QUANTUM 1323000u            /* a track step is 2 x scale of these */
#define PING_AT 0x800000e0u         /* the frame builder's ping: the DSP record set built this frame */

typedef struct { uint32_t step, scale; } Grid;   /* a step is 2 x scale quanta */
/* the track's speed alone (a step is 2 x scale quanta): the one figure of the grid RATE needs */
static uint32_t grid_scale(unsigned track)
{
    static const uint8_t scales[7] = { 3, 4, 6, 8, 12, 24, 48 };
    volatile uint8_t *pattern = (volatile uint8_t *)(uintptr_t)(BANK_BLOB + U8(SEQ_BANK) * BANK_STRIDE
                                                                 + U8(SEQ_PATTERN) * PATTERN_STRIDE);
    unsigned si = pattern[0x8e55u] ? pattern[track * TRACK_STRIDE + 0x51u] : pattern[0x8e54u];
    return scales[si < 7u ? si : 2u];
}

typedef struct { uint32_t last, quantum, remainder; uint8_t running; } Clock;
typedef struct { uint32_t free_phase; } Steps;
static Clock clock UG_DATA;
static Steps steps[8] UG_DATA;
static uint32_t clock_frame UG_DATA;

static void clock_update(void)
{
    uint32_t now = U32(FRAME_CLOCK);
    if (now == clock_frame) return;
    clock_frame = now;
    unsigned running = U32(TRANSPORT) == 1u;
    if (running && !clock.running) {
        clock.quantum = clock.remainder = 0, clock.last = now;
    } else if (running) {
        int32_t rem = (int32_t)clock.remainder + (int32_t)(now - clock.last);
        clock.last = now;
        while (rem < 0) --clock.quantum, rem += (int32_t)QUANTUM;
        while (rem >= (int32_t)QUANTUM) ++clock.quantum, rem -= (int32_t)QUANTUM;
        clock.remainder = (uint32_t)rem;
    }
    clock.running = (uint8_t)running;
}
/* A synced RATE's cycle, 0..65535: from the sequencer's position while it plays, from the tempo while it stands. */
static uint16_t sync_phase(unsigned track, unsigned rate, const Grid *g, uint32_t step_samples, unsigned n)
{
    uint32_t cycle_q8 = g->step * ug_sync_q8[(rate - 64u) & 63u];         /* the cycle in quanta, Q8 */
    Steps *s = &steps[track];
    if (clock.running) {
        uint32_t pos = (clock.quantum * 256u + clock.remainder / (QUANTUM / 256u)) % cycle_q8;
        s->free_phase = ((pos << 10) / cycle_q8) << 22;
    } else {
        uint32_t cycle = (step_samples >> 4) * (ug_sync_q8[(rate - 64u) & 63u] >> 4) + 1u;   /* samples */
        s->free_phase += (0xffffffffu / cycle) * n;
    }
    return (uint16_t)(s->free_phase >> 16);
}

/* ---- the render --------------------------------------------------------------------------------------- */

#ifdef UG_DIAG
/* DIAGNOSIS ONLY, never released: what the measurements in TESTING.md read. Each second, on the first track UNGEMACH
 * plays, in one word for `npm run device -- status` (DIAG value): bits 26-31 the mean render time a frame in us, less
 * 30 (to 63), timed as the base's guard times the callback (DTCN3, 132 MHz); 22-25 the frames not rendered against the
 * timer's count (the guard's skips, to 15); then the last settings, coarse: 17-21 PTCH's byte / 4, 13-16 DISS / 8,
 * 9-12 WAVE / 8, 5-8 RATE / 8, 2-4 PNCH / 16; bit 1 the sequencer plays; bit 0 PTCH, DISS or WAVE moved. */
#include "../../../runtime/loader/modwerk_module.h"
#define DIAG_TIMER (*(volatile uint32_t *)0xfc07c00cu)   /* 132 MHz */
static volatile uint32_t diag_ticks UG_DATA, diag_value UG_DATA, diag_t_last UG_DATA;
static volatile uint32_t diag_acc UG_DATA, diag_sum UG_DATA, diag_frames UG_DATA, diag_key UG_DATA, diag_snap UG_DATA;
static volatile uint8_t diag_track = 255u, diag_moved UG_DATA;
void module_tick(struct modwerk_runtime_api *api)
{
    if (diag_ticks % 60u == 59u) {
        uint32_t now = DIAG_TIMER, expect = (now - diag_t_last) / 47891u;
        uint32_t f = diag_frames ? diag_frames : 1u, a = diag_sum / f / 132u;
        uint32_t miss = diag_frames && expect > diag_frames ? expect - diag_frames : 0u;
        uint32_t us = a < 30u ? 0u : a - 30u > 63u ? 63u : a - 30u;
        diag_t_last = now;
        diag_value = us << 26 | (miss > 15u ? 15u : miss) << 22 | diag_snap | (U32(TRANSPORT) == 1u ? 2u : 0u) | diag_moved;
        diag_sum = diag_frames = 0, diag_moved = 0u, diag_track = 255u;
    }
    ++diag_ticks;
    api->value = diag_value;
}
#endif

/* The engines' state is initialized data, not bss: the loader reaches a package's own image through the cached alias,
 * its bss through the uncached one (measured on the Probe-Octa, 13 November 2026: a bss read about four times a cached
 * one), and the render reads its state thousands of times a frame. */
static Ungemach voices[8] = { { .rng = 1u } };
static uint8_t ready UG_DATA;
static uint32_t frame_at[8] = { 1u };   /* each track's frame clock at its last render call (data, not bss: see voices) */
static uint32_t timed_at[8] = { 1u };
/* each track's controls, read on a frame's first call (data, not bss: read every call) */
static UgControls ctls[8] = { { .move = 64u } };   /* each track's timer at its last frame's figures, in whole frames */
#define TIMER (*(volatile uint32_t *)0xfc07c00cu)   /* DTCN3, 132 MHz: 47,891 counts a frame */
static volatile uint8_t owned UG_DATA;      /* tracks UNGEMACH renders: bit t, set by the render, cleared when the track leaves */

/* Stock plays a track's rendered samples at the increment it builds from the FLEX record's PTCH and RATE: on
 * UNGEMACH's tracks those are its own controls, and an increment under unity read a fraction of each frame's fresh
 * samples, held across the frame: a bitcrusher at the drone's own pitch, from the first trig that rebuilt it. So
 * UNGEMACH takes its tracks' increment, at unity, as POLY8 does (ev_play_increment). */
int ungemach_play_increment(uint32_t *increment, unsigned track)
{
    if (track >= 8u || !(owned >> track & 1u)) return 0;
    *increment = 0x04000000u;
    return 1;
}
static void ungemach_leave(unsigned track)
{
    if (track < 8u) owned &= (uint8_t)~(1u << track), ready &= (uint8_t)~(1u << track);
}
/* Called twice a frame for each UNGEMACH track, before and after its event's sample offset (the second call has
 * end == 16). It writes the header stock's packer expects at the cursor and the samples as L and R longs. */
int ungemach_render_track(unsigned track, unsigned ping, unsigned start, unsigned end)
{
    (void)ping;
#ifdef UG_DIAG
    uint32_t diag_t0 = DIAG_TIMER;   /* the whole callback, as the base's guard times it */
#endif
    volatile uint32_t *h = (volatile uint32_t *)(uintptr_t)U32(CURSOR);
    unsigned n = end > start && end <= 16u ? end - start : 0u;
    h[0] = n, h[1] = start, h[2] = 0x04000000u, h[3] = start << 26;
    if (track < 8u) owned |= (uint8_t)(1u << track);

    if (n && track < 8u) {
        if (!(ready >> track & 1u)) ug_reset(&voices[track]), ready |= (uint8_t)(1u << track);
        const volatile uint16_t *fp = (const volatile uint16_t *)(uintptr_t)U32(FP_PTR);
        const volatile uint8_t *lane = (const volatile uint8_t *)(uintptr_t)(LANE + 72u * track);
        const volatile uint8_t *setup = lane + 0x20u;
        /* the frame's figures once a frame: on its first call that renders (the frame clock moved since this track's
         * last call), not again on the second call after the trig's offset */
        uint32_t now = U32(FRAME_CLOCK);
        int fresh = now != frame_at[track];
        frame_at[track] = now;
        static Grid grids[8] = { { .step = 1u } };   /* data, not bss */
        static uint32_t steps[8] = { 1u };
        Grid *gp = &grids[track];
        Ungemach *const v = &voices[track];
        /* RATE's timing (the track's speed, the tempo, the sequencer's clock and a synced cycle's phase) is read only on
         * the frames the engine works RATE's movement out: every UG_SLOW-th, a fresh call that finds vskip at 0. Read
         * every frame it cost about 2 µs a frame, free or synced (A/B on the live set, 21 November 2026), and the
         * pattern's bytes are slow to reach. */
        const int slow = fresh && (!v->fr.ready || v->vskip == 0u);
        if (slow) {
            gp->scale = grid_scale(track), gp->step = 2u * gp->scale;
            uint32_t tempo = U32(TEMPO24);
            steps[track] = tempo ? 2u * gp->scale * QUANTUM / tempo : 5512u;
        }
        const uint32_t step_samples = steps[track];
        /* all six from the parameter record, as FLEX reads them: locks, LFOs and scenes applied (measured on the live-set
         * Octa, 19 November 2026: E and F there are the knob << 8 as A-D are, and an LFO on F moves F there; the lane
         * holds the knob alone). An earlier reading of F as "26 with the knob at 0" was a Part's LFO on RTIM. */
        /* the controls once a frame, on its first call: the second call after a trig's offset takes them as they were
         * (a frame split by a trig read every knob, setup byte and the record twice) */
        UgControls *const kc = &ctls[track];
        if (fresh) {
        const unsigned rate = (fp[4] >> 8) & 127u;
        kc->ptch = fp[0], kc->diss = (uint8_t)(fp[1] >> 8), kc->diss_frac = (uint8_t)fp[1], kc->tone = (uint8_t)(fp[2] >> 8), kc->wave = fp[3];
        kc->rate = (uint8_t)rate, kc->move = 64u, kc->dirt = (uint8_t)((fp[5] >> 8) & 127u);   /* MOVE: no knob here, as designed */
        kc->sprd = setup[4] & 3u, kc->pnch = setup[5] & 127u;
        }
        kc->frames = 1u;
        const unsigned rate = kc->rate;
        if (slow) {
            clock_update();
            if (rate >= 64u) kc->sync_phase = sync_phase(track, rate, gp, step_samples, 16u * UG_SLOW);
        }
        /* The event byte's low nibble is where in the frame its event sits; the packer splits the frame's render there
         * and only clears bits 4-7 after it, so after one trig every later frame was split at the same place. The
         * frame guard then shed the short first part again and again (3 of every 16 samples gone: a bitcrusher). On a
         * frame with no event of its own, UNGEMACH clears that stale offset on its own track: the next frames render
         * in one call; a frame with a trig is still split where the trig is. */
        if (end == 16u) {
            const uint8_t ev = U8(EVENTS + track);   /* once: the event byte sits in slow memory */
            if (ev & 16u) ug_punch(v);              /* a trig: PNCH's punch (the AMP envelope is the track's) */
            else U8(EVENTS + track) = (uint8_t)(ev & 0xf0u);
        }
        if (fresh) {
            /* the frames that passed by the timer, a frame the base's guard skipped too, so PNCH's punch ends on time */
            uint32_t el = (TIMER - timed_at[track]) / 47891u;
            kc->frames = (uint8_t)(el < 1u ? 1u : el > 255u ? 255u : el);
            timed_at[track] += el * 47891u;
        }
        ug_render_out(v, kc, h + 4, n, fresh);   /* straight into the packer's buffer */
#ifdef UG_DIAG
        if (diag_track == 255u) diag_track = (uint8_t)track;
        if (track == diag_track) {
            const uint32_t key = (uint32_t)(kc->ptch >> 8) | (uint32_t)kc->diss << 8 | (uint32_t)(kc->wave >> 8) << 16;
            if (key != diag_key) diag_moved = 1u, diag_key = key;
            diag_snap = ((uint32_t)(kc->ptch >> 8) >> 2 & 31u) << 17 | ((uint32_t)kc->diss >> 3 & 15u) << 13
                      | ((uint32_t)(kc->wave >> 8) >> 3 & 15u) << 9 | ((uint32_t)kc->rate >> 3 & 15u) << 5 | ((uint32_t)kc->pnch >> 4 & 7u) << 2;
            diag_acc += DIAG_TIMER - diag_t0;
            if (end == 16u) diag_sum += diag_acc, diag_acc = 0, ++diag_frames;
        }
#endif
    }
    U32(CURSOR) = (uint32_t)(uintptr_t)(h + 4 + 2 * n);
    return 0;
}

/* ---- one track a Part --------------------------------------------------------------------------------- */
/* At most one UNGEMACH track in a Part: one track takes 37-60 us of the 363 us frame on an MKI while a busy pattern
 * plays, and a second would overrun the frame interrupt's share, so the base's guard drops renders, a crackle
 * (TESTING.md; issue #1790). Choosing UNGEMACH for a second track is refused, and that track stays what it was. The
 * track that is UNGEMACH already is admitted, and a Part that holds more (a copied Part) plays on: the base asks only
 * when a track is picked. The test reads the Part signature as SYNTIZ's wave_admit_track does. */
#define SIG 60u                     /* a track's signature at Part + 60 + 30 t: 'U', 'G', 1 */
static unsigned is_ungemach(const volatile uint8_t *part, unsigned t)
{
    const volatile uint8_t *s = part + SIG + 30u * t;
    return part[0x22u + t] == 1u && s[0] == 'U' && s[1] == 'G' && s[2] == 1u;
}
unsigned ungemach_admit_track(const volatile uint8_t *part, unsigned track)
{
    if (track >= 8u) return 0;
    if (is_ungemach(part, track)) return 1;
    for (unsigned t = 0; t < 8u; ++t)
        if (is_ungemach(part, t)) return 0;
    return 1;
}

/* ---- the row ------------------------------------------------------------------------------------------ */

const struct modwerk_machine_setup ungemach_machine = {
    .machine = {
        .abi = MODWERK_MACHINE_ABI,
        .sig = { 'U', 'G' }, .sig_lo = 1, .sig_hi = 1,
        .label = "UNGEMACH",
        .flags = MODWERK_MACHINE_LIST | MODWERK_MACHINE_SETUP_PAGE | MODWERK_MACHINE_SETUP_ALL,
        .defaults = ungemach_part_defaults,
        .admit_track = ungemach_admit_track,
        .track_page = ungemach_track_page,
        .render = ungemach_render_track,
        .leave = ungemach_leave,
        .reserved = {15},   /* the CPU price, % of a frame (resources.cpuPrice): 14.1 measured, rounded up */
    },
    .page = ungemach_setup_page,
    .knob = ungemach_setup_knob,
};
