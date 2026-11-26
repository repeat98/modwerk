/* SPDX-License-Identifier: GPL-3.0-or-later
 * Program areas and the stream's slot records, the ColdFire side (events.json ot_dsp_effects; resident_engines.h
 * MW_DSP_PROGRAMS). An FX effect gives the base a record; for each slot running its effect id:
 * - program areas: the base holds two areas of the record's size, one span of the engines' region on that slot's core,
 *   writes the next program's code into the area the slot does not run while the other plays, then names it in the
 *   slot's record (X:$7fb0 + 4 * ((r7 >> 8) & 15), word 0) between two frames: the receiver's op 12. Only once the record
 *   names neither area does the span go back;
 * - the stream (a build with the stream channel, stream_channel.c): the base opens a lane for the slot, and once its first
 *   blocks are filled names their offsets in words 2 (out) and 1 (in) of the record; it clears them, in, then out,
 *   before the lane closes.
 *
 * The UI tick (ev_tick), under the stable lock. One job a core at a time on the loader's own channel, started only while
 * the manager publishes nothing, as dsp.c's meter reads wait: a pick or a Part change goes first. Nothing runs on the
 * frame path here: the frames carry an ordinary WRITE, then op 12 packets. */
#include <stdint.h>
#include "resident_engines.h"
#ifdef MODWERK_RUNTIME_EVENTS /* the table needs the base's site events; without them nothing contributes */
#include "transfer.h"
#include "loader.h"
#include "modwerk_events.h"

#ifdef MW_PROGRAMS_TEST
extern volatile uint8_t mw_programs_test_live[16];
#define LIVE mw_programs_test_live
#else
#define LIVE ((const volatile uint8_t *)0x80000ec4u) /* the live FX arrays: FX1 of T1-T8, then FX2 */
#endif
#define TABLE (MODWERK_OT_DSP_EFFECTS - RUNTIME_EVENTS)
#define SLOTS 16u
#define ROWS 8u         /* the table's room */
#define MOST 2048u      /* the largest area a record may ask for */
#define RETRY 60u       /* ticks before a refused claim, code or lane is asked again */

int dl_publication_idle(void);                     /* manager.c: no transaction */
extern volatile uint32_t dl_residency_enabled;     /* manager.c: 0 once a stall shut the loader off */
int modwerk_dsp_catalogue_handle(uint32_t module); /* dsp.c: the effect id a module owns, -1 none */
/* The stream channel (stream_channel.c, in a build with --stream-channel); without it a slot gets no lane. */
__attribute__((weak)) int mw_stream_open(unsigned slot, const void *row, unsigned in_n, unsigned out_n)
{ (void)slot; (void)row; (void)in_n; (void)out_n; return -1; }
__attribute__((weak)) int mw_stream_ready(int lane, uint32_t *in_offset, uint32_t *out_offset)
{ (void)lane; (void)in_offset; (void)out_offset; return 0; }
__attribute__((weak)) void mw_stream_live(int lane, int on) { (void)lane; (void)on; }
__attribute__((weak)) void mw_stream_close(int lane) { (void)lane; }

enum { IDLE, WRITING, SWITCHING, CLEARING, STUCK };                              /* the areas */
enum { S_NONE, S_OPEN, S_NAME_OUT, S_NAME_IN, S_LIVE, S_DROP_IN, S_DROP_OUT, S_STUCK }; /* the stream's record words */
static struct slot {
    const struct modwerk_dsp_effect *row; /* the record its areas serve, 0 none */
    uint16_t at, words;                   /* its span (from DL_CODE_START): area k at at + k * words; words 0 none */
    int32_t held[2];                      /* the program each area holds, -1 none */
    uint8_t id, step, active, target;     /* active: the area its record names, 2 none */
    uint16_t wait;                        /* ticks before a refused claim or code is asked again */
    const struct modwerk_dsp_effect *srow; /* the record its stream serves */
    uint16_t in_offset, out_offset;       /* its blocks in a host bank (0 none) */
    int8_t lane;                          /* -1 none */
    uint8_t sid, sstep, pad;
    uint16_t swait;
} slots[SLOTS];
static uint32_t buffer[2][MOST];          /* the code being written: one job a core */
static int8_t owner_of[2] = {-1, -1};     /* the slot whose job holds core c's channel */
static uint8_t stream_job[2];             /* that job is the slot's stream's, not its areas' */
static unsigned first;                    /* where the walk starts: each slot gets its turn at a core */
/* Diagnostics, never an ABI: writes and switches done, refusals (no room, no code, no lane), jobs refused or lost,
 * streams named. */
#ifdef __m68k__
#define SEEN __attribute__((section(".data"))) /* inside a development base's MEM window */
#else
#define SEEN
#endif
volatile uint32_t mw_programs_written SEEN, mw_programs_switched SEEN, mw_programs_refused SEEN, mw_programs_failed SEEN,
    mw_programs_streams SEEN;

static unsigned core_of(unsigned s) { return (s & 7u) < 4u ? 1u : 0u; }
/* (r7 >> 8) & 15 is 1 + 3 * position for FX1 (r7 = $6100 + $300 * position on each core), 2 + 3 * position for FX2. */
static unsigned record_of(unsigned s) { return 4u * (1u + 3u * (s & 3u) + (s >= 8u)); }
static uint32_t area(unsigned s, unsigned k)
{
    return dl_pool_base[core_of(s)] + DL_CODE_START + slots[s].at + k * slots[s].words;
}

/* Each valid record and the effect id its module owns. The row pointers are read masked so a switch is never seen
 * half-way; the stable lock keeps their modules until the tick returns. */
static unsigned rows(const struct modwerk_dsp_effect **row, uint8_t *id)
{
    const struct modwerk_dsp_effect *seen[ROWS];
    unsigned n = 0, k = 0;
    uint32_t mask = modwerk_machine_mask();
    for (uintptr_t volatile *r = modwerk_runtime_event_row[TABLE]; *r && n < ROWS; ++r) seen[n++] = (const struct modwerk_dsp_effect *)*r;
    modwerk_machine_unmask(mask);
    for (unsigned i = 0; i < n; ++i) {
        const struct modwerk_dsp_effect *e = seen[i];
        struct runtime_owner o;
        int handle;
        if (e->abi != MODWERK_DSP_EFFECT_ABI || e->program_words > MOST || (e->program_words && (!e->program || !e->code)) ||
            (e->stream_in && !e->fill) || (e->stream_out && !e->take) ||
            modwerk_runtime_owner_at((uintptr_t)e, &o) != 1 || (handle = modwerk_dsp_catalogue_handle(o.module)) < 0)
            continue;
        row[k] = e, id[k++] = (uint8_t)handle;
    }
    return k;
}

static void forget(unsigned s)
{
    mw_engines_area_free(core_of(s), slots[s].at);
    slots[s].row = 0, slots[s].at = slots[s].words = 0, slots[s].held[0] = slots[s].held[1] = -1;
    slots[s].id = 0, slots[s].step = IDLE, slots[s].active = 2u, slots[s].wait = 0;
}
static void unstream(unsigned s)
{
    mw_stream_close(slots[s].lane);
    slots[s].srow = 0, slots[s].lane = -1, slots[s].sstep = S_NONE, slots[s].in_offset = slots[s].out_offset = 0;
}

/* Slot s's areas' job ended: their next step. */
static void finished(unsigned s, int ok)
{
    struct slot *t = &slots[s];
    if (!ok) mw_programs_failed = mw_programs_failed + 1;
    if (t->step == WRITING) {
        if (ok) mw_programs_written = mw_programs_written + 1, t->step = SWITCHING;
        else t->held[t->target] = -1, t->step = IDLE, t->wait = RETRY; /* never named: nothing runs those words */
    } else if (t->step == SWITCHING) {
        /* Unanswered, the record may name either area: neither is written nor given back this boot. */
        if (ok) t->active = t->target, t->step = IDLE, mw_programs_switched = mw_programs_switched + 1;
        else t->step = STUCK;
    } else if (t->step == CLEARING) {
        if (ok) forget(s);
        else t->step = STUCK;
    }
}
/* Slot s's stream's job ended. An unanswered one leaves its lane open for good: the record may still name it. */
static void streamed(unsigned s, int ok)
{
    struct slot *t = &slots[s];
    if (!ok) { mw_programs_failed = mw_programs_failed + 1, t->sstep = S_STUCK; return; }
    if (t->sstep == S_NAME_OUT) t->sstep = t->in_offset ? S_NAME_IN : S_LIVE;
    else if (t->sstep == S_NAME_IN) t->sstep = S_LIVE;
    else if (t->sstep == S_DROP_IN) t->sstep = t->out_offset ? S_DROP_OUT : S_NONE;
    else if (t->sstep == S_DROP_OUT) t->sstep = S_NONE;
    if (t->sstep == S_LIVE) mw_stream_live(t->lane, 1), mw_programs_streams = mw_programs_streams + 1;
    if (t->sstep == S_NONE) unstream(s);
}

static int record(unsigned s, unsigned word, uint32_t v)
{
    return dl_command_start(core_of(s), 12u, record_of(s) + word, v & 0xffffu, v >> 16 & 0xffu);
}

/* Start the job slot s's areas need on its core's channel: 1 started. */
static int step(unsigned s)
{
    struct slot *t = &slots[s];
    unsigned c = core_of(s);
    if (!t->words || t->step == STUCK || t->wait) return 0;
    if (t->step == IDLE) {
        int32_t p = t->row->program(s);
        if (p < 0 || p > 0x7fffff || (t->active < 2u && t->held[t->active] == p)) return 0;
        t->target = t->active < 2u ? (uint8_t)(t->active ^ 1u) : 0u;
        if (t->held[t->target] != p) {
            uint32_t n = t->row->code(s, p, area(s, t->target), buffer[c]);
            if (!n || n > t->words) { mw_programs_refused = mw_programs_refused + 1, t->wait = RETRY; return 0; }
            for (unsigned i = 0; i < n; ++i) buffer[c][i] &= 0xffffffu;
            struct dl_upload u = {buffer[c], 0, (uint16_t)n, 0, (uint16_t)(DL_CODE_START + t->at + t->target * t->words)};
            if (!dl_upload_start(c, &u)) return 0;
            t->held[t->target] = p, t->step = WRITING; /* -1 again if the write fails */
            return 1;
        }
        t->step = SWITCHING; /* that area still holds the program */
    }
    if (t->step == SWITCHING) return record(s, 0, area(s, t->target));
    return t->step == CLEARING && record(s, 0, 0);
}
/* ... and the job its stream's record words need. */
static int stream_step(unsigned s)
{
    struct slot *t = &slots[s];
    switch (t->sstep) {
    case S_NAME_OUT: return record(s, 2, t->out_offset);
    case S_NAME_IN: return record(s, 1, t->in_offset);
    case S_DROP_IN: return record(s, 1, 0);
    case S_DROP_OUT: return record(s, 2, 0);
    default: return 0;
    }
}

/* Slot s's stream for record `want` (0: none wanted), effect id `live`. */
static void stream_tick(unsigned s, const struct modwerk_dsp_effect *want, unsigned live)
{
    struct slot *t = &slots[s];
    if (!want || !(want->stream_in || want->stream_out)) want = 0;
    if (t->sstep != S_NONE && t->sstep != S_STUCK && t->sstep < S_DROP_IN && (want != t->srow || live != t->sid)) {
        /* Left the effect: the record's words back to 0, in then out, before the lane closes; none written closes at once. */
        if (t->sstep == S_OPEN || (t->sstep == S_NAME_OUT)) unstream(s);
        else mw_stream_live(t->lane, 0), t->sstep = t->sstep == S_NAME_IN ? S_DROP_OUT : t->in_offset ? S_DROP_IN : S_DROP_OUT;
    }
    if (t->swait) { --t->swait; return; }
    if (want && t->sstep == S_NONE) {
        int lane = mw_stream_open(s, want, want->stream_in, want->stream_out);
        if (lane < 0) { mw_programs_refused = mw_programs_refused + 1, t->swait = RETRY; return; }
        t->srow = want, t->sid = (uint8_t)live, t->lane = (int8_t)lane, t->sstep = S_OPEN;
    }
    uint32_t in, out;
    if (t->sstep == S_OPEN && mw_stream_ready(t->lane, &in, &out))
        t->in_offset = (uint16_t)in, t->out_offset = (uint16_t)out, t->sstep = out ? S_NAME_OUT : S_NAME_IN;
}

void mw_programs_tick(void)
{
    uint32_t irq = modwerk_machine_lock();
    const struct modwerk_dsp_effect *row[ROWS];
    uint8_t id[ROWS];
    unsigned n = dl_residency_enabled ? rows(row, id) : 0u;
    static unsigned initialized;
    if (!initialized) {
        for (unsigned s = 0; s < SLOTS; ++s) slots[s].active = 2u, slots[s].lane = -1, slots[s].held[0] = slots[s].held[1] = -1;
        initialized = 1;
    }
    for (unsigned c = 0; c < 2u; ++c) {
        int s = owner_of[c], status = s >= 0 ? dl_job_status(c) : 0;
        if (s < 0 || !status) continue;
        if (status != -2) dl_job_release(c);
        owner_of[c] = -1;
        if (stream_job[c]) streamed((unsigned)s, status > 0);
        else finished((unsigned)s, status > 0);
    }
    for (unsigned i = 0; dl_residency_enabled && i < SLOTS; ++i) {
        unsigned s = (first + i) % SLOTS, c = core_of(s), live = LIVE[s];
        struct slot *t = &slots[s];
        const struct modwerk_dsp_effect *want = 0;
        for (unsigned k = 0; k < n; ++k) if (id[k] == live) want = row[k];
        if (owner_of[c] == (int8_t)s) continue;
        stream_tick(s, want, live);
        const struct modwerk_dsp_effect *areas = want && want->program_words ? want : 0;
        if (t->step != STUCK) {
            if (t->words && (areas != t->row || live != t->id) && t->step != CLEARING) {
                /* Left the effect: its record goes to 0 before the span goes back; a record never written frees at once. */
                if (t->active > 1u) forget(s);
                else t->step = CLEARING;
            }
            if (t->wait) --t->wait;
            else if (areas && !t->words) {
                unsigned at;
                int r = mw_engines_area_claim(c, 2u * areas->program_words, &at);
                if (r < 0) mw_programs_refused = mw_programs_refused + 1, t->wait = RETRY;
                if (r > 0) t->row = areas, t->at = (uint16_t)at, t->words = (uint16_t)areas->program_words, t->id = (uint8_t)live,
                           t->step = IDLE, t->active = 2u, t->held[0] = t->held[1] = -1;
            }
        }
        if (owner_of[c] >= 0 || !dl_publication_idle() || dl_job_status(c) != -2) continue;
        if (step(s)) owner_of[c] = (int8_t)s, stream_job[c] = 0;
        else if (stream_step(s)) owner_of[c] = (int8_t)s, stream_job[c] = 1;
    }
    first = (first + 1u) % SLOTS;
    modwerk_machine_unlock(irq);
}
#else
void mw_programs_tick(void) {}
#endif
