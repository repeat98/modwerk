/* SPDX-License-Identifier: MIT
 * Reader of the ot_lfo_pmtr_dest table (events.json): audio LFO SETUP labels past
 * stock 0–29, the page PMTR count poke, the PMTR beq nop so SETUP uses WAVE's
 * descriptor-count clamp, destination resolve for the lea stub, and the store
 * stub in lfo_pmtr_dest.s. Owned sites: dest lea 0x4000d042 (pad_to=8), dest
 * store 0x4000d07a (MOP-70/71; optional contribute after_store), formatter
 * 0x4003bf64, count 0x400d38a8, encoder beq 0x4003923c (MOP-34 twin:
 * 6734→4e71). Dest lea stub is present but not claimed yet: published FM Synth still
 * overlaps 0x4000d03e; claim lea with companion migrate to 0x4000d03a. */
#include <stdint.h>
#include "loader.h"
#include "modwerk_events.h"

#define LFO_PMTR (MODWERK_OT_LFO_PMTR_DEST - RUNTIME_EVENTS)
#define STOCK_COUNT 30u
#define COUNT_ADDR 0x400d38a8u
#define BEQ_ADDR 0x4003923cu
#define BEQ_NOP 0x4e71u /* stock was 6734 beq.s → 0x40039272; fall-through 0x4003923e */
#define ROOM 16u

typedef struct modwerk_lfo_pmtr_dest Dest;

extern void modwerk_machine_flush_data(uint32_t at, uint32_t n);
extern uint8_t *modwerk_machine_code(uint32_t at);
extern void modwerk_machine_invalidate_code(void);

static unsigned published;

/* Stashed by resolve for the matching contrib words; store calls it once. */
modwerk_lfo_pmtr_after_store *mw_lfo_pmtr_after;

/* Caller must already hold the machine mask (tables_changed) or take it (resolve/label). */
static unsigned collect(const Dest **out, unsigned max)
{
    unsigned n = 0;
    for (uintptr_t volatile *row = modwerk_runtime_event_row[LFO_PMTR]; *row && n < max; ++row) {
        const Dest *d = (const Dest *)*row;
        if (!d->label || !d->words || d->index < STOCK_COUNT) continue;
        unsigned k = 0;
        while (k < n && out[k]->index != d->index) ++k;
        if (k < n) continue; /* first contribution for an index wins */
        out[n++] = d;
    }
    return n;
}

static uint32_t get32(uint32_t at)
{
    const uint8_t *p = modwerk_machine_code(at);
    return ((uint32_t)p[0] << 24) | ((uint32_t)p[1] << 16) | ((uint32_t)p[2] << 8) | p[3];
}

static void put32(uint32_t at, uint32_t v)
{
    modwerk_machine_flush_data(at, 4);
    uint8_t *p = modwerk_machine_code(at);
    p[0] = (uint8_t)(v >> 24);
    p[1] = (uint8_t)(v >> 16);
    p[2] = (uint8_t)(v >> 8);
    p[3] = (uint8_t)v;
}

static uint16_t get16(uint32_t at)
{
    const uint8_t *p = modwerk_machine_code(at);
    return (uint16_t)(((uint16_t)p[0] << 8) | p[1]);
}

static void put16(uint32_t at, uint16_t v)
{
    modwerk_machine_flush_data(at, 2);
    uint8_t *p = modwerk_machine_code(at);
    p[0] = (uint8_t)(v >> 8);
    p[1] = (uint8_t)v;
}

/* Masked, after the loader rewrote table rows (same moment as machine/sequencer). */
void modwerk_lfo_pmtr_tables_changed(void)
{
    const Dest *d[ROOM];
    unsigned n = collect(d, ROOM);
    uint32_t count = STOCK_COUNT + n;
    if (published == (n | 1u << 16) && get32(COUNT_ADDR) == count && get16(BEQ_ADDR) == BEQ_NOP) return;
    put32(COUNT_ADDR, count);
    put16(BEQ_ADDR, BEQ_NOP); /* PMTR falls into WAVE's clamp at 0x4003923e */
    modwerk_machine_invalidate_code();
    published = n | 1u << 16;
}

/* Halfword the LFO engine should store into for this PMTR index and track, or 0 for stock.
 * Also stashes the record's optional after_store for mw_lfo_pmtr_store (MOP-71). */
uint16_t *mw_lfo_pmtr_resolve(unsigned index, unsigned track)
{
    mw_lfo_pmtr_after = 0;
    if (index < STOCK_COUNT || track >= 8u) return 0;
    const Dest *d[ROOM];
    uint32_t mask = modwerk_machine_mask();
    unsigned n = collect(d, ROOM);
    uint16_t *word = 0;
    for (unsigned i = 0; i < n; ++i)
        if (d[i]->index == index) {
            word = d[i]->words + track;
            mw_lfo_pmtr_after = d[i]->after_store;
            break;
        }
    modwerk_machine_unmask(mask);
    return word;
}

/* SETUP label for an extended PMTR index, or 0 to keep stock formatting. */
const char *mw_lfo_pmtr_label(unsigned index)
{
    if (index < STOCK_COUNT) return 0;
    const Dest *d[ROOM];
    uint32_t mask = modwerk_machine_mask();
    unsigned n = collect(d, ROOM);
    const char *label = 0;
    for (unsigned i = 0; i < n; ++i)
        if (d[i]->index == index) { label = d[i]->label; break; }
    modwerk_machine_unmask(mask);
    return label;
}
