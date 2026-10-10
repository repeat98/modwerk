/* SPDX-License-Identifier: GPL-3.0-or-later
 * DSP effects from runtime modules (build_core.py --dsp-loader). Octabam's
 * DSP dynamic loading (sdk/octabam/platform/dsp-dynload-transport, built
 * into this base) loads an effect's code into a DSP when a track picks it,
 * shares it per core and frees it when nothing uses it; its allocator admits
 * each target against both cores' arenas and cycle allowances before
 * anything changes. Here its catalog is filled from module packages instead
 * of the build: a module's effect is registered when the loader publishes
 * the module and unregistered when it goes. Development only. */
#include "runtime.h"
#include "allocator.h"

/* manager.c's code descriptor, which it reads from dl_codes. */
struct code { const uint32_t *words; const uint16_t *relocations; uint16_t count, init, proc, relocation_count; };
/* An id with no package: what stock (or the null stub) runs there, free on both slots. */
#define STOCK {0, 1, 0, 3, 1, 1, 0}
#define STOCK4 STOCK, STOCK, STOCK, STOCK
struct dl_package dl_catalog[32] = {STOCK4, STOCK4, STOCK4, STOCK4, STOCK4, STOCK4, STOCK4, STOCK4};
struct code dl_codes[2][32];
extern const uint32_t dl_stub_at_boot;     /* the module effect ids (identity.c): stock's null stub at boot */
extern const uint16_t modwerk_dsp_arena[2]; /* each core's code arena past the saved entries, words (identity.c) */
int dl_publication_idle(void);
void dl_residency_nudge(void);
#define SLOT_WORDS 132u /* an instance's r7 block: $00-$83; $84+ hung the unit (Octabam AGENTS.md) */
/* The Y block stock gives each slot (X:0x255): FX1 3K words, FX2 16K. On T3 and T7 stock keeps its own
 * words at the head of the FX2 block (Octabam dsp_ranges.py); a module there shares them as stock's reverbs do. */
#define FX1_BUFFER 3072u
#define FX2_BUFFER 16384u

#ifdef MODWERK_HOST
uint8_t modwerk_test_live_fx[16], *modwerk_test_bank;
#define LIVE_FX modwerk_test_live_fx
#define BANK ((uintptr_t)modwerk_test_bank)
#else
#define LIVE_FX ((const volatile uint8_t *)0x80000ec4u) /* the FX ids each track runs: FX1 T1-T8, then FX2 */
#define BANK (*(volatile uint32_t *)0x46c82456u)         /* the current bank (selection.c), 0 before a project */
#endif
#define PART(bank, i) ((const volatile uint8_t *)((bank) + ((i) < 4 ? 0x8ed80u : 0x9504au - 4u * 6322u) + (i) * 6322u))
static volatile int nudge;

static int in_use(unsigned id)
{
    for (unsigned i = 0; i < 16; ++i) if (LIVE_FX[i] == id) return 1;
    return 0;
}
int modwerk_machine_dsp_admit(const struct runtime_dsp *from, const struct runtime_dsp *to)
{
    /* An effect a track runs, or one a transaction may hold between prepare and retirement, stays.
     * A new one may register at any time: no transaction names an effect nobody has picked. */
    if (from->count && (!dl_publication_idle() || in_use(from->id))) return RUNTIME_BUSY;
    if (!to->count) return RUNTIME_OK;
    if (to->id > 31 || !(dl_stub_at_boot >> to->id & 1u)) return RUNTIME_CONFLICT;
    unsigned arena = modwerk_dsp_arena[0] < modwerk_dsp_arena[1] ? modwerk_dsp_arena[0] : modwerk_dsp_arena[1];
    if (to->count > arena || to->state > SLOT_WORDS || to->buffer > (to->slots & 1u ? FX1_BUFFER : FX2_BUFFER)) return RUNTIME_MEMORY;
    /* shortcut: modeled cycles and executed instructions admit in this development base;
     * a release base admits hardware-timed figures only (owner, 10 October 2026). */
    if (!to->kind || to->kind > RUNTIME_HARDWARE || to->cycles > MODWERK_DSP_ALLOWANCE) return RUNTIME_CYCLES;
    return RUNTIME_OK;
}
/* Masked, by the loader's switch: the manager sees the catalog change between two of its steps. */
void modwerk_machine_dsp_switch(const struct runtime_dsp *from, const struct runtime_dsp *to)
{
    static const struct dl_package stock = STOCK;
    if (from->count) {
        dl_catalog[from->id] = stock;
        dl_codes[0][from->id] = dl_codes[1][from->id] = (struct code){0, 0, 0, 0, 0, 0};
    }
    if (to->count) {
        dl_catalog[to->id] = (struct dl_package){(uint16_t)to->count, 1, to->cycles, to->slots, 0, 1, to->buffer != 0};
        dl_codes[0][to->id] = dl_codes[1][to->id] =
            (struct code){to->words, to->relocations, (uint16_t)to->count, to->init, to->proc, to->relocation_count};
        nudge = 1; /* tracks may already name it (a saved project): load it there now */
    }
}
/* The module effects the current bank names: what each track runs, and its four Parts, working and saved.
 * Other banks stay on the card. A bit per effect id, for an update to warn before removing one. */
uint32_t modwerk_dsp_used(void)
{
    uint32_t used = 0;
    uintptr_t bank = BANK;
    for (unsigned i = 0; i < 16; ++i) used |= 1u << (LIVE_FX[i] & 31u);
    for (unsigned part = 0; bank && part < 8; ++part)
        for (unsigned i = 0; i < 16; ++i) if (PART(bank, part)[i] < 32u) used |= 1u << PART(bank, part)[i];
    return used & dl_stub_at_boot;
}

/* Development only: a chooser pick or Part change replayed as the panel makes
 * it, for scripted hardware runs (a USB test command calls modwerk_dsp_pick
 * from the engine task; the sys task's tick runs it, with the selectors'
 * own guards). slot: 0 FX1, 1 FX2 (track 0-7, chooser row), 2 Part (row = Part 0-3). */
static volatile uint32_t pick;
int modwerk_dsp_pick(unsigned slot, unsigned track, unsigned row)
{
    if (pick || slot > 2 || track > 7 || row > (slot == 2 ? 3u : 31u)) return 0;
    pick = 0x80000000u | slot << 16 | track << 8 | row;
    return 1;
}
/* A track naming a module effect that is not installed runs stock's null stub, dry, its
 * stored parameters untouched; the unit says so once per change. */
static uint32_t missing_shown;
volatile uint32_t modwerk_dsp_missing; /* times the unit said so, for diagnostics */
void modwerk_dsp_tick(void)
{
#ifndef MODWERK_HOST
    uint32_t missing = 0;
    for (unsigned i = 0; i < 16; ++i)
        if (LIVE_FX[i] < 32u && dl_stub_at_boot >> LIVE_FX[i] & 1u && dl_catalog[LIVE_FX[i]].resident) missing |= 1u << LIVE_FX[i];
    if (missing & ~missing_shown) {
        ((void (*)(const char *, unsigned))0x4005a2b8u)("MODULE MISSING", 0x30);
        modwerk_dsp_missing = modwerk_dsp_missing + 1;
    }
    missing_shown = missing;
    if (nudge) { nudge = 0; dl_residency_nudge(); }
    uint32_t p = pick;
    if (!p) return;
    pick = 0;
    unsigned slot = p >> 16 & 0xffu, row = p & 0xffu;
    if (slot == 2) { ((void (*)(unsigned))0x4004a8a4u)(row); return; } /* the manual Part change */
    *(volatile uint8_t *)0x80000000u = (uint8_t)(p >> 8);              /* the current track, as the selectors read it */
    *(volatile uint32_t *)(slot ? 0x460d5ca8u : 0x460d5c94u) = row;   /* the chooser's cursor */
    ((void (*)(void))(slot ? 0x40052474u : 0x400526e4u))();
#endif
}

/* shortcut: no publication guards yet (queued patterns, project loads, Part
 * edits); the manager's observer loads what those routes publish and parks
 * the slot dry until then. Port publication.c with the Part routes. */
void dl_publication_finish(void) {}
void dl_publication_tick(void) {}
