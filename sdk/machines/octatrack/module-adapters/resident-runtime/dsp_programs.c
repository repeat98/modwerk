/* SPDX-License-Identifier: GPL-3.0-or-later
 * Program areas, the ColdFire side (events.json ot_dsp_effects; resident_engines.h MW_DSP_PROGRAMS). An FX effect whose
 * code changes with its program gives the base a record; for each slot running its effect id the base holds two areas
 * of the record's size, one span of the engines' region on that slot's core, writes the next program's code into the
 * area the slot does not run while the other plays, then names it in the slot's record (X:$7fb0 + 4 * ((r7 >> 8) & 15),
 * word 0) between two frames: the receiver's op 12. Only once the record names neither area does the span go back.
 *
 * The UI tick (ev_tick), under the stable lock. One job a core at a time on the loader's own channel, started only while
 * the manager publishes nothing, as dsp.c's meter reads wait: a pick or a Part change goes first. Nothing runs on the
 * frame path: the frames carry an ordinary WRITE, then one op 12 packet. */
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
#define RETRY 60u       /* ticks before a refused claim or code is asked again */

int dl_publication_idle(void);                     /* manager.c: no transaction */
extern volatile uint32_t dl_residency_enabled;     /* manager.c: 0 once a stall shut the loader off */
int modwerk_dsp_catalogue_handle(uint32_t module); /* dsp.c: the effect id a module owns, -1 none */

enum { IDLE, WRITING, SWITCHING, CLEARING, STUCK };
static struct slot {
    const struct modwerk_dsp_effect *row; /* the record it serves, 0 none */
    uint16_t at, words;                   /* its span (from DL_CODE_START): area k at at + k * words; words 0 none */
    int32_t held[2];                      /* the program each area holds, -1 none */
    uint8_t id, step, active, target;     /* active: the area its record names, 2 none */
    uint16_t wait;                        /* ticks before a refused claim or code is asked again */
} slots[SLOTS];
static uint32_t buffer[2][MOST];          /* the code being written: one job a core */
static int8_t owner_of[2] = {-1, -1};     /* the slot whose job holds core c's channel */
static unsigned first;                    /* where the walk starts: each slot gets its turn at a core */
/* Diagnostics, never an ABI: writes and switches done, refusals (no room, no code), jobs refused or lost. */
volatile uint32_t mw_programs_written, mw_programs_switched, mw_programs_refused, mw_programs_failed;

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
        if (e->abi != MODWERK_DSP_EFFECT_ABI || !e->program_words || e->program_words > MOST || !e->program || !e->code ||
            modwerk_runtime_owner_at((uintptr_t)e, &o) != 1 || (handle = modwerk_dsp_catalogue_handle(o.module)) < 0)
            continue;
        row[k] = e, id[k++] = (uint8_t)handle;
    }
    return k;
}

static void forget(unsigned s)
{
    mw_engines_area_free(core_of(s), slots[s].at);
    slots[s] = (struct slot){0};
}

/* Slot s's job ended: its next step. */
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

/* Start the job slot s's step needs on its core's channel: 1 started. */
static int step(unsigned s)
{
    struct slot *t = &slots[s];
    unsigned c = core_of(s);
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
    uint32_t v = t->step == SWITCHING ? area(s, t->target) : 0u;
    return (t->step == SWITCHING || t->step == CLEARING) && dl_command_start(c, 12u, record_of(s), v & 0xffffu, v >> 16 & 0xffu);
}

void mw_programs_tick(void)
{
    uint32_t irq = modwerk_machine_lock();
    const struct modwerk_dsp_effect *row[ROWS];
    uint8_t id[ROWS];
    unsigned n = dl_residency_enabled ? rows(row, id) : 0u;
    for (unsigned c = 0; c < 2u; ++c) {
        int s = owner_of[c], status = s >= 0 ? dl_job_status(c) : 0;
        if (s < 0 || !status) continue;
        if (status != -2) dl_job_release(c);
        owner_of[c] = -1;
        finished((unsigned)s, status > 0);
    }
    for (unsigned i = 0; dl_residency_enabled && i < SLOTS; ++i) {
        unsigned s = (first + i) % SLOTS, c = core_of(s), live = LIVE[s];
        struct slot *t = &slots[s];
        const struct modwerk_dsp_effect *want = 0;
        for (unsigned k = 0; k < n; ++k) if (id[k] == live) want = row[k];
        if (owner_of[c] == (int8_t)s || t->step == STUCK) continue;
        if (t->words && (want != t->row || live != t->id) && t->step != CLEARING) {
            /* Left the effect: its record goes to 0 before the span goes back; a record never written frees at once. */
            if (t->active > 1u) forget(s);
            else t->step = CLEARING;
        }
        if (t->wait) { --t->wait; continue; }
        if (want && !t->words) {
            unsigned at;
            int r = mw_engines_area_claim(c, 2u * want->program_words, &at);
            if (r < 0) mw_programs_refused = mw_programs_refused + 1, t->wait = RETRY;
            if (r <= 0) continue;
            *t = (struct slot){want, (uint16_t)at, (uint16_t)want->program_words, {-1, -1}, (uint8_t)live, IDLE, 2u, 0u, 0u};
        }
        if (t->words && owner_of[c] < 0 && dl_publication_idle() && dl_job_status(c) == -2 && step(s)) owner_of[c] = (int8_t)s;
    }
    first = (first + 1u) % SLOTS;
    modwerk_machine_unlock(irq);
}
#else
void mw_programs_tick(void) {}
#endif
