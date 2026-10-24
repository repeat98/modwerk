/* SPDX-License-Identifier: MIT
 * The base's machine registry: the reader of the ot_machines table (events.json). The
 * machine chooser, SRC SETUP, the page resolver, the Part validator, the UI tick, pool
 * navigation and the FLEX renderer ask the contributed machines (struct modwerk_machine),
 * in row order: chooser rows 5 on. Adapted from POLY8's shared machine controller
 * (sdk/octabam/modules/poly8/shared-machine.c, MIT, Sam Banks / repeat98), whose fixed
 * POLY/AB/VECTOR/FM participants become contributions; each machine keeps its own signed
 * FLEX state, defaults, pages and engine. Also the reader of ot_sequencer_rows. */
#include <stdint.h>
#include "loader.h"
#include "modwerk_events.h"
#ifndef MW_HOST /* test_machine_registry.c maps these onto a model of the unit's memory */
#define U8(a) (*(volatile uint8_t *)(uintptr_t)(a))
#define U32(a) (*(volatile uint32_t *)(uintptr_t)(a))
#define AT(a) ((volatile uint8_t *)(uintptr_t)(a))
#define ADDR(p) ((uint32_t)(uintptr_t)(p))
#define STOCK(type, a) ((type)(uintptr_t)(a))
#endif
#define BANK 0x46c82456u
#define PART_OFF 0x8ed80u
#define PART_STRIDE 6322u
#define SRAM_PART 0x100a4eceu
#define SIG 60u
#define FLEX_PAGE 0x400d31aeu
#define STATIC_PAGE 0x400d301cu
#define ROWS 9u                              /* five stock machines and up to four contributed */
typedef volatile uint8_t Part;
typedef struct modwerk_machine Machine;
#define MACHINES (MODWERK_OT_MACHINES - RUNTIME_EVENTS)
#define SEQUENCER (MODWERK_OT_SEQUENCER_ROWS - RUNTIME_EVENTS)
#ifdef MODWERK_DEV
void modwerk_cost_stamp(unsigned k); /* diag.c: the development profile of the base's hooks */
#define MW_STAMP(k) modwerk_cost_stamp(k)
#else
#define MW_STAMP(k) ((void)0)
#endif

/* The rows' machines, read from the table masked so a switch is never seen half-way; the
 * pointers stay on the reader's stack, so the loader keeps their modules until it returns. */
static unsigned machines(const Machine **out)
{
    unsigned n = 0;
    uint32_t mask = modwerk_machine_mask();
    for (uintptr_t volatile *row = modwerk_runtime_event_row[MACHINES]; *row && n < ROWS - 5u; ++row) {
        const Machine *m = (const Machine *)*row;
        if (m->abi == MODWERK_MACHINE_ABI) out[n++] = m; /* another ABI is no machine: its tracks read as stock */
    }
    modwerk_machine_unmask(mask);
    return n;
}
const char *mw_src_names[ROWS];
uint32_t mw_pb_table[ROWS];
extern int mw_stock_validate(uint8_t *);
/* The DSP budget's source stage (dsp.c): a machine whose voice replaces its track's stock source is charged on that
 * track's core, under its descriptor's address (a machine module contributes one). A base without it keeps these
 * defaults: a priced machine is never admitted, nor its voice rendered. */
int modwerk_dsp_source_claim(unsigned track, uint32_t module, uint32_t voice, uint32_t engine, uint8_t kind);
void modwerk_dsp_source_release(unsigned track);
void modwerk_dsp_source_engine_off(uint32_t module);
#ifndef MW_HOST
__attribute__((weak)) int modwerk_dsp_source_claim(unsigned track, uint32_t module, uint32_t voice, uint32_t engine, uint8_t kind)
{ (void)track; (void)module; (void)voice; (void)engine; (void)kind; return RUNTIME_CYCLES; }
__attribute__((weak)) void modwerk_dsp_source_release(unsigned track) { (void)track; }
__attribute__((weak)) void modwerk_dsp_source_engine_off(uint32_t module) { (void)module; }
#endif
/* Each track of the current Part: the priced machine its voice is charged to, or 0. A word each, so the render
 * reads it whole without a mask. */
static const Machine *volatile charged[8];
static uint32_t key(const Machine *m) { return (uint32_t)(uintptr_t)m; } /* dsp.c's module: the descriptor */
static unsigned charges(const Machine *m) { unsigned k = 0; for (unsigned t = 0; t < 8; ++t) k += charged[t] == m; return k; }
/* The track's voice is free; with no other track charged to its machine, so is the machine's engine. */
static void release(unsigned track)
{
    const Machine *old = charged[track];
    if (!old) return;
    charged[track] = 0; modwerk_dsp_source_release(track);
    if (!charges(old)) modwerk_dsp_source_engine_off(key(old));
}
/* Charge `who`'s voice on the track, replacing what was charged there; 0 when its core cannot carry it (nothing
 * changes). The machine the track was charged to keeps its engine only while another track still is. */
static int claim(unsigned track, const Machine *who)
{
    const Machine *old = charged[track];
    if (old == who) return 1;
    if (modwerk_dsp_source_claim(track, key(who), who->source_voice, who->source_engine, who->source_kind)) return 0;
    charged[track] = who;
    if (old && !charges(old)) modwerk_dsp_source_engine_off(key(old));
    return 1;
}
extern void mw_stock_pool_open(void), mw_stock_list_draw(void);

static unsigned valid_bank(void) { uint32_t b = U32(BANK); return b >= 0x40000000u && b < 0x47f00000u; }
static Part *current_part(void) { return AT(U32(BANK) + PART_OFF + (U8(0x100b14cfu) & 3u) * PART_STRIDE); }
/* diag.c: each track's machine type byte and machine signature (two bytes), as they stand. Unlocked, as the frame
 * interrupt reads it too: a snapshot. 0xff and 0, 0 without a bank. */
void modwerk_track_machines(volatile uint8_t *out);
void modwerk_track_machines(volatile uint8_t *out)
{
    const Part *part = valid_bank() ? current_part() : 0;
    for (unsigned t = 0; t < 8u; ++t) {
        out[3u * t] = part ? part[0x22 + t] : 0xffu;
        out[3u * t + 1u] = part ? part[SIG + 30u * t] : 0u;
        out[3u * t + 2u] = part ? part[SIG + 30u * t + 1u] : 0u;
    }
}
/* Track t's machine: its row (5 on) and descriptor, or 0 for a stock track or an absent machine's signature. */
static unsigned owner(const Machine *const *m, unsigned n, const Part *part, unsigned t, const Machine **who)
{
    *who = 0;
    if (t >= 8 || part[0x22 + t] > 1) return 0;
    const Part *s = part + SIG + 30 * t;
    for (unsigned k = 0; k < n; ++k)
        if (s[0] == m[k]->sig[0] && s[1] == m[k]->sig[1] && s[2] >= m[k]->sig_lo && s[2] <= m[k]->sig_hi) { *who = m[k]; return 5u + k; }
    return 0;
}
/* The PROTECT machines this base knows by signature (module-adapters/machine-ports.json; sdk/tests checks the list).
 * Their tracks keep their 12 bytes from stock's validator while the machine is absent too: the boot's battery
 * restore (0x40025770) validates the battery-backed Part copies seconds before the saved set reinstalls the machines
 * (modset.c), and refuses the whole restore at the first value it has to fix. The bank is then never filled nor
 * applied (0x40009094): every Part reads STATIC with stock defaults, no track is ever bound and the unit is silent
 * (beta finding 24). An absent machine's track renders stock's silent source, never stock FLEX reading its bytes. */
static const struct { uint8_t sig[2], lo, hi; } known[] = {{{'A', 'B'}, 1, 1}, {{'F', 'M'}, 1, 1}};
static unsigned orphan(const Part *part, unsigned t)
{
    if (t >= 8 || part[0x22 + t] > 1) return 0;
    const Part *s = part + SIG + 30 * t;
    for (unsigned k = 0; k < sizeof known / sizeof *known; ++k)
        if (s[0] == known[k].sig[0] && s[1] == known[k].sig[1] && s[2] >= known[k].lo && s[2] <= known[k].hi) return 1;
    return 0;
}
static unsigned current(const Machine *const *m, unsigned n, const Machine **who)
{
    *who = 0;
    return valid_bank() && !U8(0x80000015u) ? owner(m, n, current_part(), U8(0x100b14ccu), who) : 0;
}
static unsigned backing(void)
{
    if (!valid_bank() || U8(0x100b14ccu) >= 8) return 1;
    unsigned pool = current_part()[0x22 + U8(0x100b14ccu)]; return pool < 2 ? pool : 1;
}
/* Names and pages by row: stock's five from its own tables, then each machine's. */
static void tables(const Machine *const *m, unsigned n)
{
    const Machine *who;
    unsigned row = current(m, n, &who);
    const Part *slot = valid_bank() ? current_part() + 0x22 + U8(0x100b14ccu) : 0;
    for (unsigned r = 0; r < 5; ++r) mw_src_names[r] = (const char *)(uintptr_t)U32(0x400a78c8u + 4 * r), mw_pb_table[r] = U32(0x400d5f38u + 4 * r);
    for (unsigned k = 0; k < ROWS - 5u; ++k) {
        const Machine *x = k < n ? m[k] : 0;
        mw_src_names[5 + k] = x ? x->label : mw_src_names[1];
        mw_pb_table[5 + k] = !x ? FLEX_PAGE : x->track_page ? (slot ? x->track_page(slot) : FLEX_PAGE) :
                            x->flags & MODWERK_MACHINE_BACKING ? (row == 5 + k && !backing() ? STATIC_PAGE : FLEX_PAGE) :
                            x->page ? x->page : FLEX_PAGE;
    }
}
/* The chooser's counts are immediates in stock code the table owns: pea 5+n and moveq #4+n (stock: n = 0). */
static unsigned counted;
static void put8(uint32_t at, uint8_t v) { modwerk_machine_flush_data(at, 1); *modwerk_machine_code(at) = v; }
static void counts(unsigned n, unsigned rows)
{
    static const uint32_t pea[] = {0x4007924bu, 0x400585fdu}, moveq[] = {0x4003c951u, 0x40078679u, 0x400786cfu, 0x40079905u};
    if (counted == (n | rows << 8 | 1u << 16)) return;
    for (unsigned i = 0; i < 2; ++i) put8(pea[i], (uint8_t)(5u + n));
    for (unsigned i = 0; i < 4; ++i) put8(moveq[i], (uint8_t)(4u + n));
    put8(0x40065c7fu, (uint8_t)(3u + rows));
    modwerk_machine_invalidate_code();
    counted = n | rows << 8 | 1u << 16;
}

/* SEQUENCER: stock's three rows, then each contributed label once (the first contribution's). */
#define SEQ_ROWS 11u
const void *mw_seq_labels[SEQ_ROWS], *mw_seq_getters[SEQ_ROWS], *mw_seq_setters[SEQ_ROWS];
extern const char mw_seq_none[];
extern void mw_seq_get_none(void), mw_seq_set_none(void);
static int same(const char *a, const char *b) { while (*a && *a == *b) ++a, ++b; return *a == *b; }
static unsigned sequencer(void)
{
    unsigned n = 3;
    for (unsigned r = 0; r < 3; ++r)
        mw_seq_labels[r] = (const void *)(uintptr_t)U32(0x400b27d0u + 4 * r), mw_seq_getters[r] = (const void *)(uintptr_t)U32(0x400b27dcu + 4 * r),
        mw_seq_setters[r] = (const void *)(uintptr_t)U32(0x400b282cu + 4 * r);
    for (uintptr_t volatile *row = modwerk_runtime_event_row[SEQUENCER]; *row; ++row) {
        const struct modwerk_sequencer_rows *c = (const struct modwerk_sequencer_rows *)*row;
        for (uint32_t i = 0; i < c->count && n < SEQ_ROWS; ++i) {
            unsigned k = 3;
            while (k < n && !same(mw_seq_labels[k], c->row[i].label)) ++k;
            if (k < n) continue;
            mw_seq_labels[n] = c->row[i].label, mw_seq_getters[n] = c->row[i].get, mw_seq_setters[n] = c->row[i].set; ++n;
        }
    }
    for (unsigned k = n; k < SEQ_ROWS; ++k) mw_seq_labels[k] = mw_seq_none, mw_seq_getters[k] = (const void *)mw_seq_get_none,
                                         mw_seq_setters[k] = (const void *)mw_seq_set_none;
    return n - 3u;
}

/* Masked, right after the loader rewrote the rows (loader.h): nothing stock reads may still name a module that left. */
void modwerk_machine_tables_changed(void)
{
    unsigned n = 0;
    for (uintptr_t volatile *row = modwerk_runtime_event_row[MACHINES]; *row && n < ROWS - 5u; ++row)
        n += ((const Machine *)*row)->abi == MODWERK_MACHINE_ABI;
    for (unsigned t = 0; t < 8; ++t) { /* a machine that left frees its voices and engine before its memory goes */
        int kept = 0;
        for (uintptr_t volatile *row = modwerk_runtime_event_row[MACHINES]; charged[t] && *row; ++row) kept |= *row == (uintptr_t)charged[t];
        if (charged[t] && !kept) release(t);
    }
    for (unsigned k = 5; k < ROWS; ++k) mw_src_names[k] = (const char *)(uintptr_t)U32(0x400a78c8u + 4), mw_pb_table[k] = FLEX_PAGE;
    counts(n, sequencer());
}

const char *mw_name(unsigned row)
{
    const Machine *m[ROWS - 5u]; unsigned n = machines(m);
    tables(m, n);
    return row < ROWS && (row < 5 || row < 5 + n) ? mw_src_names[row] : mw_src_names[1];
}
unsigned mw_type(unsigned type, const Part *ptr)
{
    const Machine *m[ROWS - 5u], *who; unsigned n = machines(m);
    tables(m, n);
    if (!valid_bank()) return type;
    Part *part = current_part(); uintptr_t t = (uintptr_t)ptr - (uintptr_t)(part + 0x22);
    unsigned row = t < 8 ? owner(m, n, part, (unsigned)t, &who) : 0;
    return row && type < 2 ? row : type;
}
unsigned mw_chooser_type(unsigned type, const Part *ptr)
{
    const Machine *m[ROWS - 5u], *who; unsigned n = machines(m);
    if (valid_bank()) owner(m, n, current_part(), U8(0x100b14ccu), &who); else who = 0;
    if (who && who->chooser_type && who->chooser_type(type, ptr) != 5) return type;
    return mw_type(type, ptr);
}
/* A track leaves `old`: its own leave, stock's FLEX defaults back in both Part copies for a PROTECT machine that
 * signs its tracks through the registry (the 12 bytes held its parameters), and its DSP charge released. */
static void flex_defaults(Part *part, Part *mirror, unsigned track)
{
    for (unsigned k = 0; k < 12; ++k) {
        unsigned at = (k < 6 ? 0x2a : 0x1da) + 30 * track + 6 + k % 6;
        part[at] = mirror[at] = U8(0x400d320cu + k);
    }
}
static void leave(Part *part, Part *mirror, unsigned track, const Machine *old)
{
    if (old->leave) old->leave(track);
    if (!old->assign && old->flags & MODWERK_MACHINE_PROTECT) flex_defaults(part, mirror, track);
    if (charged[track] == old) release(track); /* a priced machine that took the track was charged in its place */
}
/* Tracks that became a priced machine without an assignment (a project load, a Part change, a paste) are charged
 * here, and tracks charged to another machine than their own move to it; tracks no longer one are released. A track
 * its core cannot carry stays uncharged and renders silence. */
static void charge(const Machine *const *m, unsigned n)
{
    if (!valid_bank()) return;
    const Part *part = current_part(); const Machine *who;
    for (unsigned t = 0; t < 8; ++t) {
        if (!owner(m, n, part, t, &who) || !who->source_kind) who = 0;
        if (who ? charged[t] != who && !claim(t, who) : charged[t] != 0) release(t);
    }
}
/* A machine's admission precedes every mutation; -1 refuses. */
unsigned mw_assign(Part *part, unsigned track, unsigned row)
{
    if (!valid_bank() || track >= 8) return row < 5 ? row : 1;
    uint32_t offset = ADDR(part) - U32(BANK) - PART_OFF;
    if (offset % PART_STRIDE || offset / PART_STRIDE >= 4) return (unsigned)-1;
    const Machine *m[ROWS - 5u], *old, *next = 0; unsigned n = machines(m);
    if (row >= 5 && row < 5 + n) next = m[row - 5];
    owner(m, n, part, track, &old);
    Part *mirror = AT(SRAM_PART + offset);
    /* A track of a known PROTECT machine that is absent leaves it as it would leave it present: stock's FLEX
     * defaults back in both copies before another machine or signature takes the track. */
    unsigned absent = !old && orphan(part, track);
    if (next) {
        if (next->admit_track && !next->admit_track(part, track)) return (unsigned)-1;
        if (next->source_kind && old != next && !claim(track, next)) return (unsigned)-1;
        if (old && old != next) leave(part, mirror, track, old);
        if (absent) flex_defaults(part, mirror, track);
        if (next->assign) return next->assign(part, track, 1);
        if (old != next && next->defaults)
            for (unsigned k = 0; k < 12; ++k) {
                unsigned at = (k < 6 ? 0x2a : 0x1da) + 30 * track + 6 + k % 6;
                part[at] = mirror[at] = next->defaults[k];
            }
        unsigned sig = SIG + 30 * track;
        part[sig] = mirror[sig] = next->sig[0]; part[sig + 1] = mirror[sig + 1] = next->sig[1]; part[sig + 2] = mirror[sig + 2] = next->sig_lo;
        return 1;
    }
    /* Browser YES keeps the signed owner; ordinary machine selection clears it. */
    if (old && old->assign) {
        unsigned pool = old->assign(part, track, 0);
        const Machine *still; owner(m, n, part, track, &still);
        if (still == old) return pool;
        leave(part, mirror, track, old);
    } else if (old || absent) {
        if (old) leave(part, mirror, track, old);
        else flex_defaults(part, mirror, track);
        unsigned sig = SIG + 30 * track; for (unsigned k = 0; k < 3; ++k) part[sig + k] = mirror[sig + k] = 0;
    }
    return row < 5 ? row : 1;
}
static void ui_tick(void);
void mg_tick(void); /* midi_generators.c: the MIDI tracks' generators */
void mw_ui_tick(void)
{
    MW_STAMP(14); ui_tick(); MW_STAMP(24); mg_tick(); MW_STAMP(25); MW_STAMP(15);
}
static void ui_tick(void)
{
    const Machine *m[ROWS - 5u]; unsigned n = machines(m);
    for (unsigned k = 0; k < n; ++k) if (m[k]->ui_tick) m[k]->ui_tick();
    charge(m, n);
    tables(m, n);
    uint32_t mask = modwerk_machine_mask();
    counts(n, sequencer());
    modwerk_machine_unmask(mask);
}
uint32_t mw_page(const Part *ptr)
{
    const Machine *m[ROWS - 5u], *who; unsigned n = machines(m);
    tables(m, n);
    if (!valid_bank()) return 0;
    uintptr_t t = (uintptr_t)ptr - (uintptr_t)(current_part() + 0x22);
    if (t < 8) owner(m, n, current_part(), (unsigned)t, &who); else who = 0;
    return who && who->track_page ? who->track_page(ptr) : 0;
}
/* Sidechain Compressor keeps KEY, KFLT, KGN and MON in stock COMPRESSOR's page-2 slots 8-11 (Part 0x2fe + 30 t + 6 fx
 * + 2..5), which stock's descriptor declares with its own ranges and defaults 0x7f/0/0/0. Before the saved set is
 * back, the boot's battery restore judged a set-up side-chain (KEY OFF..T8, KFLT and KGN 64) by those ranges and
 * refused the whole bank (beta finding 47, as finding 24 above). Stock judges its own defaults there instead, and the
 * side-chain's bytes come back; a KEY above T8 is stock's own value and goes to stock as it is. */
#define COMPRESSOR 24u
#define FX_SETUP 0x2feu
static const uint8_t compressor_slots[4] = {0x7f, 0, 0, 0};
static unsigned sidechain(const Part *part, unsigned t, unsigned fx)
{
    unsigned at = FX_SETUP + 30 * t + 6 * fx + 2;
    return part[8 * fx + t] == COMPRESSOR && part[at] <= 8 && part[at + 1] < 0x80 && part[at + 2] < 0x80 && part[at + 3] <= 1 ? at : 0;
}
/* The stock validator never sees a PROTECT machine's 12 FLEX bytes, nor a known absent one's (the boot's battery
 * restore, above), nor a side-chain's four; machines' validate wrap it in row order. */
static const Machine *wrapping[ROWS - 5u];
static unsigned wraps, depth;
static int next_validator(uint8_t *part)
{
    while (depth < wraps) { const Machine *x = wrapping[depth++]; if (x->validate) return x->validate(part, next_validator); }
    return mw_stock_validate(part);
}
int mw_validate(Part *part)
{
    const Machine *m[ROWS - 5u], *who; unsigned n = machines(m), mask = 0;
    uint8_t saved[8][12], keys[8][2][4];
    unsigned key_at[8][2];
    const Part *stock = AT(0x400d320cu);
    for (unsigned t = 0; t < 8; ++t) {
        owner(m, n, part, t, &who);
        if (who ? who->flags & MODWERK_MACHINE_PROTECT : orphan(part, t)) {
            mask |= 1u << t;
            for (unsigned k = 0; k < 12; ++k) { unsigned at = (k < 6 ? 0x2a : 0x1da) + 30 * t + 6 + k % 6; saved[t][k] = part[at]; part[at] = stock[k]; }
        }
        for (unsigned fx = 0; fx < 2; ++fx)
            if ((key_at[t][fx] = sidechain(part, t, fx)))
                for (unsigned k = 0; k < 4; ++k) keys[t][fx][k] = part[key_at[t][fx] + k], part[key_at[t][fx] + k] = compressor_slots[k];
    }
    for (unsigned k = 0; k < n; ++k) wrapping[k] = m[k];
    wraps = n; depth = 0;
    int result = next_validator((uint8_t *)part);
    wraps = depth = 0;
    for (unsigned t = 0; t < 8; ++t) {
        if (mask & 1u << t)
            for (unsigned k = 0; k < 12; ++k) { unsigned at = (k < 6 ? 0x2a : 0x1da) + 30 * t + 6 + k % 6; part[at] = saved[t][k]; }
        for (unsigned fx = 0; fx < 2; ++fx)
            if (key_at[t][fx]) for (unsigned k = 0; k < 4; ++k) part[key_at[t][fx] + k] = keys[t][fx][k];
    }
    return result;
}
static unsigned open_pool(const Machine *const *m, unsigned n)
{
    const Machine *who; unsigned row = current(m, n, &who);
    if (!who) return 0;
    if (who->pool_open) who->pool_open();
    else {
        mw_stock_pool_open();
        if (U32(0x460e70e0u) && U32(0x460e739au)) STOCK(void (*)(void), 0x4007893cu)();
        if (U32(0x460e70e0u)) STOCK(void (*)(unsigned, unsigned), 0x4007edb0u)(0x460e7386u, row);
    }
    return 1;
}
unsigned mw_open_pool(void) { const Machine *m[ROWS - 5u]; unsigned n = machines(m); return open_pool(m, n); }
/* Callbacks that return to row five restore the machine's own row. */
static void back_to_row(unsigned row) { if (row && U32(0x460e70e0u) && !U32(0x460e739au)) STOCK(void (*)(unsigned, unsigned), 0x4007edb0u)(0x460e7386u, row); }
void mw_pool_left(unsigned key, unsigned edge)
{
    unsigned returning = U32(0x460e739au);
    const Machine *m[ROWS - 5u], *who; unsigned n = machines(m), row = current(m, n, &who);
    if (who && who->pool_left) who->pool_left(key, edge);
    else STOCK(void (*)(unsigned, unsigned), 0x4007893cu)(key, edge);
    if (returning) back_to_row(row);
}
void mw_pool_right(unsigned key, unsigned edge)
{
    const Machine *m[ROWS - 5u], *who; unsigned n = machines(m), at = U32(0x460e738eu), row = current(m, n, &who);
    if (row && at == row && !U32(0x460e739au)) { STOCK(void (*)(void), 0x400789e4u)(); (void)open_pool(m, n); }
    else STOCK(void (*)(unsigned, unsigned), 0x4007909cu)(key, edge);
}
void mw_choice_left(unsigned key, unsigned edge)
{
    const Machine *m[ROWS - 5u], *who; unsigned n = machines(m), row = current(m, n, &who);
    if (who && who->choice_left) who->choice_left(key, edge);
    back_to_row(row);
}
uintptr_t mw_list_target(void)
{
    const Machine *m[ROWS - 5u], *who; unsigned n = machines(m);
    current(m, n, &who);
    return who && who->list_draw ? (uintptr_t)who->list_draw : (uintptr_t)mw_stock_list_draw;
}
unsigned mw_row_has_pool(unsigned row)
{
    const Machine *m[ROWS - 5u]; unsigned n = machines(m);
    return row >= 5 && row < 5 + n && m[row - 5]->flags & MODWERK_MACHINE_POOL;
}
/* The FLEX renderer, in the audio render: no mask. The row is read once, a word at a time; a module that left
 * stays in memory while the render holds it (the paused-task scan). */
int mw_source_render_impl(unsigned track, unsigned ping, unsigned start, unsigned end)
{
    const Machine *m[ROWS - 5u], *who = 0; unsigned n = 0;
    for (uintptr_t volatile *row = modwerk_runtime_event_row[MACHINES]; n < ROWS - 5u; ++row) {
        uintptr_t v = *row; if (!v) break;
        if (((const Machine *)v)->abi == MODWERK_MACHINE_ABI) m[n++] = (const Machine *)v;
    }
    if (valid_bank() && owner(m, n, current_part(), track, &who)) {
        if (who->source_kind && charged[track] != who) /* uncharged: stock's silent source, never an unpaid voice */
            return STOCK(int (*)(unsigned, unsigned, unsigned, unsigned), 0x400047f0u)(track, ping, start, end);
        if (who->render) return who->render(track, ping, start, end);
    } else if (valid_bank() && orphan(current_part(), track)) /* its bytes are the absent machine's, not FLEX's */
        return STOCK(int (*)(unsigned, unsigned, unsigned, unsigned), 0x400047f0u)(track, ping, start, end);
    else
        for (unsigned k = 0; k < n; ++k)
            if (m[k]->flags & MODWERK_MACHINE_RENDER_FLEX && m[k]->render) return m[k]->render(track, ping, start, end);
    return STOCK(int (*)(unsigned, unsigned, unsigned, unsigned), 0x40004008u)(track, ping, start, end);
}
