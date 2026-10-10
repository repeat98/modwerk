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
#include "transfer.h"

/* manager.c's code descriptor, which it reads from dl_codes. */
struct code { const uint32_t *words; const uint16_t *relocations; uint16_t count, init, proc, relocation_count; };
/* Stock first: every slot without a module is charged the dearest stock effect
 * (MODWERK_DSP_RESERVE), and a module at least that, so eight stock slots always
 * fit a core and a stock pick never adds to what was admitted: a module is
 * refused, never a stock effect. */
typedef char stock_always_fits[8u * MODWERK_DSP_RESERVE <= MODWERK_DSP_ALLOWANCE ? 1 : -1];
/* An id with no package: what stock (or the null stub) runs there, free on both slots. */
#define STOCK {0, 1, MODWERK_DSP_RESERVE, 3, 1, 1, 0}
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
    /* One instance must fit beside seven stock slots on a core. */
    if (!to->kind || to->kind > RUNTIME_HARDWARE || to->cycles > MODWERK_DSP_ALLOWANCE - 7u * MODWERK_DSP_RESERVE)
        return RUNTIME_CYCLES;
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
        uint32_t cycles = to->cycles > MODWERK_DSP_RESERVE ? to->cycles : MODWERK_DSP_RESERVE;
        dl_catalog[to->id] = (struct dl_package){(uint16_t)to->count, 1, cycles, to->slots, 0, 1, to->buffer != 0};
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
/* A track naming a module effect that is not installed, or a stock effect this
 * base gave its code room to (modwerk_dsp_harvested), runs stock's null stub, dry,
 * its stored parameters untouched; the unit says so once per change. */
static uint32_t missing_shown;
volatile uint32_t modwerk_dsp_missing; /* times the unit said so, for diagnostics */
extern const uint32_t modwerk_dsp_harvested; /* identity.c */
uint32_t modwerk_dsp_dry(void)
{
    uint32_t dry = 0;
    for (unsigned i = 0; i < 16; ++i) {
        unsigned fx = LIVE_FX[i] & 31u;
        if ((dl_stub_at_boot >> fx & 1u && dl_catalog[fx].resident) || modwerk_dsp_harvested >> fx & 1u) dry |= 1u << fx;
    }
    return dry;
}
/* The host side of each core's HI08 (sdk/octabam/tools/emu/ot_emu/dsp.h): the
 * window at 0x20000000 shows the core the GPIO byte selects, one byte register
 * per 4-byte stride in the low byte of a 16-bit access. */
#define DSP_SELECT (*(volatile uint8_t *)0xfc0a400cu)
#define HOST_ISR (*(volatile uint16_t *)0x20000008u) /* bit 0 RXDF, 3 HF2, 4 HF3 */
#define HOST_RXL (*(volatile uint16_t *)0x2000001cu) /* a read takes the word */
#ifndef MODWERK_HOST
/* The receiver's answer (dsp_receiver.asm): HF2 toggles for each packet handled, HF3 says refused.
 * Read from the frame-transfer interrupt at its end, where core 0 is selected. */
volatile uint32_t modwerk_dsp_last_flags; /* the last read, core 0 in bits 0-1, core 1 in 8-9 */
unsigned modwerk_dsp_flags(unsigned core)
{
    DSP_SELECT = (uint8_t)core;
    unsigned isr = HOST_ISR;
    DSP_SELECT = 0;
    modwerk_dsp_last_flags = (modwerk_dsp_last_flags & ~(3u << 8 * core)) | (isr >> 3 & 3u) << 8 * core;
    return isr >> 3 & 3u;
}
#endif

/* Frames stop only when a DSP stops, so the sys task watches them, outside the
 * frame path: frames still for half a second while the loader has a transfer
 * in flight is a hang (counted, and the loader shut off until a reboot). */
#define STALL_TICKS 30u
static uint32_t seen_frames, still;
int modwerk_dsp_stalled(uint32_t frames, int busy)
{
    if (frames != seen_frames || !busy) { seen_frames = frames; still = 0; return 0; }
    return ++still == STALL_TICKS;
}
volatile uint32_t modwerk_dsp_stalls, modwerk_dsp_drained; /* hangs seen; words taken back from the DSPs */
#ifndef MODWERK_HOST
extern volatile uint32_t dl_frames, dl_phase, dl_rx_nbytes, dl_residency_enabled;
int dl_job_status(unsigned core);
void dl_abort(void);
/* Best effort: take whatever a core still offers the host (a DSP waiting to hand
 * over words waits at P:$97 for ever), put the transfer machine's channel 1 back,
 * forget the transfer and let the next frame interrupt in, as stock state 7 does. */
static void recover(void)
{
    uint32_t sr = modwerk_machine_mask();
    for (unsigned core = 0; core < 2; ++core) {
        DSP_SELECT = (uint8_t)core;
        for (unsigned n = 0; n < 1024u && HOST_ISR & 1u; ++n) { (void)HOST_RXL; modwerk_dsp_drained = modwerk_dsp_drained + 1; }
    }
    DSP_SELECT = 0;
    if (dl_phase && dl_rx_nbytes) *(volatile uint32_t *)0xfc045028u = dl_rx_nbytes; /* none saved with --dsp-hook usbin */
    dl_phase = 0;
    dl_abort();
    dl_residency_enabled = 0;
    *(volatile uint8_t *)0xfc04801du = 1; /* INTC0 CIMR: the frame interrupt */
    modwerk_machine_unmask(sr);
    modwerk_dsp_stalls = modwerk_dsp_stalls + 1;
    ((void (*)(const char *, unsigned))0x4005a2b8u)("DSP STOPPED", 0x30);
}
#endif
/* Development: one PROBE packet to a core (the dev PROBE request), for finding on
 * the unit which step stops a core: build_core.py --dsp-probe A (delivery only),
 * B (the receiver checks and answers) or neither (the whole receiver). */
volatile uint32_t modwerk_dsp_watch_ticks, modwerk_dsp_probes, modwerk_dsp_probes_ok, modwerk_dsp_probes_failed;
static int probing = -1;
int modwerk_dsp_probe(unsigned core)
{
#ifndef MODWERK_HOST
    if (core > 1 || probing >= 0 || !dl_publication_idle() || !dl_command_start(core, DL_PROBE, 0, 0, 0)) return 0;
#endif
    probing = (int)core;
    modwerk_dsp_probes = modwerk_dsp_probes + 1;
    return 1;
}
void modwerk_dsp_tick(void)
{
    modwerk_dsp_watch_ticks = modwerk_dsp_watch_ticks + 1; /* the watchdog's heartbeat */
#ifndef MODWERK_HOST
    if (probing >= 0 && dl_job_status((unsigned)probing) != 0) {
        if (dl_job_status((unsigned)probing) > 0) modwerk_dsp_probes_ok = modwerk_dsp_probes_ok + 1;
        else modwerk_dsp_probes_failed = modwerk_dsp_probes_failed + 1;
        dl_job_release((unsigned)probing);
        probing = -1;
    }
    if (modwerk_dsp_stalled(dl_frames, dl_phase || !dl_job_status(0) || !dl_job_status(1))) recover();
    uint32_t dry = modwerk_dsp_dry(), fresh = dry & ~missing_shown;
    if (fresh) {
        ((void (*)(const char *, unsigned))0x4005a2b8u)(fresh & modwerk_dsp_harvested ? "FX NOT IN BASE" : "MODULE MISSING", 0x30);
        modwerk_dsp_missing = modwerk_dsp_missing + 1;
    }
    missing_shown = dry;
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

/* What a hardware run reads (a development LOADER request): DSP_REPORT_WORDS
 * words, version first. Engine task; it reads counters only, never the host port. */
#ifndef MODWERK_HOST
extern volatile uint32_t dl_accepted[2], dl_rejected[2], dl_errors, dl_pool_base[2], dl_pool_words[2];
extern volatile uint32_t dl_selection_requested, dl_selection_completed, dl_selection_refused, dl_selection_cancelled;
extern volatile uint32_t dl_residency_commits, dl_residency_failures, dl_residency_rollbacks, dl_residency_words[2];
extern volatile uint32_t dl_early, dl_parked, dl_reinit;
uint32_t dl_manager_state(void);
#define R8(a) (*(volatile uint8_t *)(a))
#define R16(a) (*(volatile uint16_t *)(a))
#define R32(a) (*(volatile uint32_t *)(a))
unsigned modwerk_dsp_report(uint32_t *out)
{
    const uint32_t words[DSP_REPORT_WORDS] = {
        4, dl_frames, dl_phase, (uint32_t)dl_job_status(0), (uint32_t)dl_job_status(1), modwerk_dsp_last_flags,
        dl_accepted[0], dl_accepted[1], dl_rejected[0], dl_rejected[1], dl_errors, modwerk_dsp_stalls, modwerk_dsp_drained,
        dl_residency_enabled, dl_manager_state(), modwerk_dsp_watch_ticks, modwerk_dsp_probes, modwerk_dsp_probes_ok,
        modwerk_dsp_probes_failed,
        dl_selection_requested, dl_selection_completed, dl_selection_refused, dl_selection_cancelled,
        dl_residency_commits, dl_residency_failures, dl_residency_rollbacks, dl_residency_words[0], dl_residency_words[1],
        dl_early, dl_parked, dl_reinit, modwerk_dsp_missing, modwerk_dsp_used(), modwerk_dsp_dry(),
        /* Where stock's frame chain stands (reads without side effects): the transfer machine's state and the
         * frame interrupt's busy flag (stock RAM), INTC0 IPRL and IMRL, EPORT pin levels | edge flags | the
         * DSP select, eDMA INT | ERR, TCD0 CSR | TCD1 CSR, eDMA ES. */
        R32(0x46104d3eu), R32(0x46104d4eu), R32(0xfc048004u), R32(0xfc04800cu),
        (uint32_t)R8(0xfc094005u) << 16 | (uint32_t)R8(0xfc094006u) << 8 | R8(0xfc0a400cu),
        (uint32_t)R16(0xfc044026u) << 16 | R16(0xfc04402eu), (uint32_t)R16(0xfc04501eu) << 16 | R16(0xfc04503eu),
        R32(0xfc044004u)};
    for (unsigned i = 0; i < DSP_REPORT_WORDS; ++i) out[i] = words[i];
    return DSP_REPORT_WORDS;
}
#endif

/* shortcut: no publication guards yet (queued patterns, project loads, Part
 * edits); the manager's observer loads what those routes publish and parks
 * the slot dry until then. Port publication.c with the Part routes. */
void dl_publication_finish(void) {}
void dl_publication_tick(void) {}
