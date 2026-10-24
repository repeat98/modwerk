/* SPDX-License-Identifier: MIT
 * Host check of the base machine registry (machine_registry.c) over a synthetic model of
 * the unit's memory: rows by table order, assign/admit/leave, absent machines read as stock,
 * the validator's PROTECT and wrapper chain, render routing, keyed SEQUENCER rows and the
 * chooser counts, through installs and removals in either order. No stock byte is used. */
#define MW_HOST
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
static unsigned failures;
#define CHECK(x) do { if (!(x)) { failures++; fprintf(stderr, "%s:%d: %s\n", __FILE__, __LINE__, #x); } } while (0)

/* Synthetic memory: a few segments at the addresses the registry reads. */
struct segment { uint32_t base, size; uint8_t *bytes; };
static uint8_t bank[0x8ed80u + 4u * 6322u + 64u], sram[4u * 6322u], misc[0x100], code[0x40], stocktab[0x80], ui[0x40], stockdef[12];
static struct segment segments[] = {
    {0x46000000u, sizeof bank, bank}, {0x100a4eceu, sizeof sram, sram}, {0x100b14c0u, 0x40, misc},
    {0x80000000u, 0x40, misc + 0x40}, {0x46c82450u, 0x10, misc + 0x80}, {0x400a78c8u, 20, stocktab},
    {0x400d5f38u, 20, stocktab + 20}, {0x400b27d0u, 12, stocktab + 40}, {0x400b27dcu, 12, stocktab + 52}, {0x400b282cu, 12, stocktab + 64},
    {0x460e7380u, 0x20, ui}, {0x460e70e0u, 4, ui + 0x20}, {0x400d320cu, 12, stockdef},
    {0x40079240u, 0x10, code}, {0x400585f0u, 0x10, code + 0x10}, {0x4003c950u, 4, code + 0x20}, {0x40078678u, 4, code + 0x24},
    {0x400786ccu, 4, code + 0x28}, {0x40079904u, 4, code + 0x2c}, {0x40065c7cu, 4, code + 0x30},
};
static uint8_t *host_at(uint32_t a)
{
    for (unsigned i = 0; i < sizeof segments / sizeof *segments; ++i)
        if (a - segments[i].base < segments[i].size) return segments[i].bytes + (a - segments[i].base);
    fprintf(stderr, "unmapped %#x\n", a); exit(2);
}
static uint32_t host_u32(uint32_t a) { uint32_t v; memcpy(&v, host_at(a), 4); return v; }
static void put_u32(uint32_t a, uint32_t v) { memcpy(host_at(a), &v, 4); }
static uint32_t host_addr(const volatile uint8_t *p)
{
    for (unsigned i = 0; i < sizeof segments / sizeof *segments; ++i)
        if ((uintptr_t)p - (uintptr_t)segments[i].bytes < segments[i].size) return segments[i].base + (uint32_t)((uintptr_t)p - (uintptr_t)segments[i].bytes);
    return 0xffffffffu;
}
static int stock_renders, stock_calls;
static int stock_render(unsigned t, unsigned p, unsigned s, unsigned e) { (void)t; (void)p; (void)s; (void)e; ++stock_renders; return -7; }
static void stock_any() { ++stock_calls; }
static int silent_renders;
static int stock_silent(unsigned t, unsigned p, unsigned s, unsigned e) { (void)t; (void)p; (void)s; (void)e; ++silent_renders; return -9; }
static void *host_stock(uint32_t a)
{ return a == 0x40004008u ? (void *)(uintptr_t)stock_render : a == 0x400047f0u ? (void *)(uintptr_t)stock_silent : (void *)(uintptr_t)stock_any; }
#define U8(a) (*(volatile uint8_t *)host_at(a))
#define U32(a) host_u32(a)
#define AT(a) ((volatile uint8_t *)host_at(a))
#define ADDR(p) host_addr(p)
#define STOCK(type, a) ((type)(uintptr_t)host_stock(a))

void mg_tick(void); /* midi_generators.c, checked by test_midi_generators.c */
void mg_tick(void) {}
/* The loader's side: the table rows and the machine glue. */
#include "loader.h"
#include "modwerk_events.h"
static uintptr_t volatile machine_row[5], sequencer_row[9];
static int masked;
uint32_t modwerk_machine_mask(void) { CHECK(!masked); masked = 1; return 7; }
void modwerk_machine_unmask(uint32_t s) { CHECK(masked && s == 7); masked = 0; }
/* Code is read unmasked and written masked (put() flushes each site just before writing it). */
void modwerk_machine_flush_data(uint32_t a, uint32_t n) { CHECK(masked); (void)a; (void)n; }
uint8_t *modwerk_machine_code(uint32_t a) { return host_at(a); }
void modwerk_machine_invalidate_code(void) {}
/* The asm side (machine_registry.s). */
static uint8_t seen[12], seen_keys[4]; static int stock_validations;
int mw_stock_validate(uint8_t *part)
{
    ++stock_validations; memcpy(seen, part + 0x2a + 30 * 3 + 6, 6); memcpy(seen + 6, part + 0x1da + 30 * 3 + 6, 6);
    memcpy(seen_keys, part + 0x2fe + 30 * 3 + 6 + 2, 4); /* T4 FX2's page-2 slots 8-11 */
    return 11;
}
void mw_stock_pool_open(void) { ++stock_calls; }
void mw_stock_list_draw(void) {}
const char mw_seq_none[1] = "";
void mw_seq_get_none(void) {}
void mw_seq_set_none(void) {}
#define modwerk_runtime_event_row host_rows
static uintptr_t volatile *const host_rows[RUNTIME_SITE_EVENTS] = {
    [MODWERK_OT_MACHINES - RUNTIME_EVENTS] = machine_row, [MODWERK_OT_SEQUENCER_ROWS - RUNTIME_EVENTS] = sequencer_row};
static volatile uint32_t host_timer; /* the frame timer (DTCN3): the synthetic renders advance it */
#define DTCN3 host_timer
#include "machine_registry.c"
#undef modwerk_runtime_event_row

/* The DSP budget's source stage (dsp.c, synthetic): a core carries `room` voices; a claim replaces the track's voice,
 * and an engine off frees its machine's engine and every voice it held. */
static unsigned room = 1, claims_made, releases, engine_offs; static uint8_t voices; static uint32_t voice_of[8], last_off;
int modwerk_dsp_source_claim(unsigned track, uint32_t module, uint32_t voice, uint32_t engine, uint8_t kind)
{
    CHECK(module && voice == 411 && engine == 3 && kind == 1 && track < 8); ++claims_made;
    unsigned used = 0; for (unsigned t = 0; t < 8; ++t) used += t != track && voices & 1u << t;
    if (used >= room) return 6; /* RUNTIME_CYCLES */
    voices |= (uint8_t)(1u << track); voice_of[track] = module; return 0;
}
void modwerk_dsp_source_release(unsigned track) { voices &= (uint8_t)~(1u << track); voice_of[track] = 0; ++releases; }
void modwerk_dsp_source_engine_off(uint32_t module)
{
    for (unsigned t = 0; t < 8; ++t) if (voice_of[t] == module) voices &= (uint8_t)~(1u << t), voice_of[t] = 0;
    ++engine_offs; last_off = module;
}

/* Synthetic machines (the descriptor ABI; no module code). */
static int a_admit = 1, a_renders, f_renders, left, v_wraps;
static const uint8_t a_defaults[12] = {1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12};
static unsigned admit_a(const volatile uint8_t *p, unsigned t) { (void)p; (void)t; return (unsigned)a_admit; }
static uint32_t page_a(const volatile uint8_t *s) { (void)s; return 0x1234u; }
static int render_a(unsigned t, unsigned p, unsigned s, unsigned e) { (void)t; (void)p; (void)s; (void)e; return ++a_renders; }
static uint32_t f_cost;
static int render_f(unsigned t, unsigned p, unsigned s, unsigned e) { (void)t; (void)p; (void)s; (void)e; host_timer += f_cost; return 100 + ++f_renders; }
static void leave_a(unsigned t) { left = (int)t + 1; }
static unsigned assign_v(volatile uint8_t *part, unsigned t, unsigned on)
{ unsigned s = 60 + 30 * t; part[s] = on ? 'S' : 0; part[s + 1] = on ? '2' : 0; part[s + 2] = on ? 2 : 0; return on ? 1 : 0; }
static int validate_v(uint8_t *part, int (*next)(uint8_t *)) { ++v_wraps; return next(part) + 1; }
static const struct modwerk_machine A = {MODWERK_MACHINE_ABI, {'A', 'B'}, 1, 1, "ANALOG BD", MODWERK_MACHINE_PROTECT | MODWERK_MACHINE_POOL, 0, a_defaults,
                                         0, admit_a, 0, page_a, 0, leave_a, 0, 0, 0, 0, render_a, 0, 0, 0, 0, {0}};
static const struct modwerk_machine V = {MODWERK_MACHINE_ABI, {'S', '2'}, 1, 2, "VECTOR", MODWERK_MACHINE_POOL | MODWERK_MACHINE_BACKING, 0, 0,
                                         assign_v, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, validate_v, 0, 0, 0, {0}};
static const struct modwerk_machine F = {MODWERK_MACHINE_ABI, {'F', 'M'}, 1, 1, "FM SYNTH", MODWERK_MACHINE_PROTECT | MODWERK_MACHINE_RENDER_FLEX, 0, a_defaults,
                                         0, 0, 0, 0, 0, 0, 0, 0, 0, 0, render_f, 0, 0, 0, 0, {0}};
static const struct modwerk_machine X = {2u, {'X', 'X'}, 1, 1, "FUTURE", 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, {0}};
static const struct modwerk_machine D = {MODWERK_MACHINE_ABI, {'D', 'V'}, 1, 1, "PRICED", MODWERK_MACHINE_PROTECT, 0, a_defaults,
                                         0, 0, 0, 0, 0, 0, 0, 0, 0, 0, render_a, 0, 411, 3, 1, {0}},
                             E = {MODWERK_MACHINE_ABI, {'E', '2'}, 1, 1, "PRICED 2", MODWERK_MACHINE_PROTECT, 0, a_defaults,
                                         0, 0, 0, 0, 0, 0, 0, 0, 0, 0, render_f, 0, 411, 3, 1, {0}};
static const struct { uint32_t count; struct modwerk_sequencer_row row[3]; } FMQ = {3, {{"SCALE", 0, 0}, {"ROOT", 0, 0}, {"GLIDE", 0, 0}}},
    QZ = {3, {{"SCALE", (void *)1, 0}, {"ROOT", (void *)1, 0}, {"GLIDE", (void *)1, 0}}}, MORE = {1, {{"SWING", 0, 0}}};
static void rows(const void *const *m, unsigned n, const void *const *s, unsigned k)
{
    for (unsigned i = 0; i < 5; ++i) machine_row[i] = i < n ? (uintptr_t)m[i] : 0;
    for (unsigned i = 0; i < 9; ++i) sequencer_row[i] = i < k ? (uintptr_t)s[i] : 0;
    masked = 1; modwerk_machine_tables_changed(); masked = 0;
}
static Part *part0(void) { return AT(0x46000000u + PART_OFF); }
static const Part *slot(unsigned t) { return part0() + 0x22 + t; }
/* The guard as at boot (machine_registry.c's statics: this file includes it). */
static void fresh(void)
{
    late = timed = 0; credit = 0; mw_frame_max = mw_frame_late_max = mw_frame_busy = mw_frame_count = 0;
    for (unsigned k = 0; k < 16u; ++k) cost[k] = after[k] = end_at[k] = 0, skipped[k] = 0;
}
/* One frame interrupt: its entry, `pre` counts of stock work, the track's render, `tail` counts more, its exit. */
static int frame(unsigned track, uint32_t pre, uint32_t tail)
{
    mw_frame_t0 = host_timer; host_timer += pre;
    int r = mw_source_render_impl(track, 0, 0, 1);
    host_timer += tail; mw_frame_exit();
    return r;
}
static unsigned counts_now(void) { return (unsigned)code[0x0b] << 24 | (unsigned)code[0x1d] << 16 | (unsigned)code[0x21] << 8 | code[0x33]; }

int main(void)
{
    put_u32(0x46c82456u, 0x46000000u);
    for (unsigned r = 0; r < 5; ++r) put_u32(0x400a78c8u + 4 * r, 0x1000u + r), put_u32(0x400d5f38u + 4 * r, 0x2000u + r);
    for (unsigned r = 0; r < 3; ++r) put_u32(0x400b27d0u + 4 * r, 0x3000u + r);
    memset(stockdef, 0x40, sizeof stockdef);
    for (unsigned t = 0; t < 8; ++t) part0()[0x22 + t] = 1; /* FLEX */

    /* No machine: stock rows, stock counts, stock renders, stock names. */
    rows(0, 0, 0, 0);
    CHECK(counts_now() == (5u << 24 | 5u << 16 | 4u << 8 | 3u));
    CHECK((uintptr_t)mw_name(5) == 0x1001u && mw_type(1, slot(2)) == 1 && mw_assign(part0(), 2, 1) == 1);
    CHECK(mw_source_render_impl(2, 0, 0, 1) == -7 && stock_renders == 1);

    /* A, V, F in row order 5, 6, 7: counts follow, names and pages by row. */
    const void *avf[] = {&A, &V, &F};
    rows(avf, 3, 0, 0);
    CHECK(counts_now() == (8u << 24 | 8u << 16 | 7u << 8 | 3u));
    CHECK(!strcmp(mw_name(5), "ANALOG BD") && !strcmp(mw_name(6), "VECTOR") && !strcmp(mw_name(7), "FM SYNTH") && (uintptr_t)mw_name(8) == 0x1001u);
    /* Assign: admission first, defaults and signature in the Part and its SRAM mirror; a refusal changes nothing. */
    a_admit = 0; CHECK(mw_assign(part0(), 2, 5) == (unsigned)-1 && part0()[60 + 60] == 0);
    a_admit = 1; CHECK(mw_assign(part0(), 2, 5) == 1);
    CHECK(part0()[60 + 60] == 'A' && part0()[61 + 60] == 'B' && part0()[62 + 60] == 1 && sram[60 + 60] == 'A');
    CHECK(part0()[0x2a + 60 + 6] == 1 && part0()[0x1da + 60 + 11] == 12 && sram[0x1da + 60 + 11] == 12);
    CHECK(mw_type(1, slot(2)) == 5 && mw_type(3, slot(2)) == 3 && mw_type(1, slot(3)) == 1);
    misc[0x0c] = 2; /* current track 3 */
    CHECK(mw_page(slot(2)) == 0x1234u && mw_page(slot(3)) == 0);
    /* Its own assign signs and unsigns the track; leaving A tells A. */
    CHECK(mw_assign(part0(), 2, 6) == 1 && part0()[60 + 60] == 'S' && left == 3 && mw_type(1, slot(2)) == 6);
    CHECK(mw_assign(part0(), 2, 1) == 1 && part0()[60 + 60] == 0 && mw_type(1, slot(2)) == 1);
    /* F on track 3 and A on track 2: renders route to their machine; an unowned track goes to RENDER_FLEX F. */
    CHECK(mw_assign(part0(), 3, 7) == 1 && mw_assign(part0(), 2, 5) == 1);
    CHECK(mw_source_render_impl(2, 0, 0, 1) == 1 && mw_source_render_impl(3, 0, 0, 1) == 101 && mw_source_render_impl(4, 0, 0, 1) == 102);
    /* The validator: F's and A's tracks keep their 12 bytes away from stock's; V wraps it once; all restored. */
    unsigned before = part0()[0x2a + 90 + 6];
    int result = mw_validate(part0());
    CHECK(result == 12 && v_wraps == 1 && stock_validations == 1 && seen[0] == 0x40 && seen[11] == 0x40 && part0()[0x2a + 90 + 6] == before);

    /* A leaves: its tracks read as stock (their bytes kept), its row goes, F takes unowned tracks' renders. A's track
     * holds A's bytes, not FLEX's: a known PROTECT signature without its machine renders stock's silent source. */
    const void *vf[] = {&V, &F};
    rows(vf, 2, 0, 0);
    CHECK(counts_now() == (7u << 24 | 7u << 16 | 6u << 8 | 3u) && part0()[60 + 60] == 'A');
    CHECK(mw_type(1, slot(2)) == 1 && !strcmp(mw_name(5), "VECTOR") && (uintptr_t)mw_name(7) == 0x1001u);
    CHECK(mw_source_render_impl(2, 0, 0, 1) == -9 && silent_renders == 1 && a_renders == 1);
    CHECK(mw_source_render_impl(4, 0, 0, 1) > 100);
    /* A back, in another install order: the same rows (order, module id), the same mapping. */
    rows(avf, 3, 0, 0);
    CHECK(mw_type(1, slot(2)) == 5 && mw_type(1, slot(3)) == 7);
    /* A descriptor of another ABI is no machine. */
    const void *xf[] = {&X, &F};
    rows(xf, 2, 0, 0);
    CHECK(counts_now() >> 24 == 6u && !strcmp(mw_name(5), "FM SYNTH") && mw_type(1, slot(3)) == 5);

    /* Leaving a PROTECT machine without its own assign: stock's FLEX defaults back in both copies, then no signature. */
    CHECK(part0()[0x2a + 90 + 6] == 1 && mw_assign(part0(), 3, 1) == 1);
    CHECK(part0()[0x2a + 90 + 6] == 0x40 && sram[0x1da + 90 + 11] == 0x40 && part0()[60 + 90] == 0 && sram[60 + 90] == 0);

    /* A priced machine: charged before the track becomes it, refused when its core is full (nothing changes);
     * an owned track without a charge renders stock's silent source; leaving releases. */
    const void *d[] = {&D};
    rows(d, 1, 0, 0);
    room = 1;
    CHECK(mw_assign(part0(), 4, 5) == 1 && voices == 1u << 4 && part0()[60 + 120] == 'D');
    CHECK(mw_assign(part0(), 5, 5) == (unsigned)-1 && part0()[60 + 150] == 0 && voices == 1u << 4);
    part0()[60 + 150] = 'D'; part0()[61 + 150] = 'V'; part0()[62 + 150] = 1; /* a project load signs track 5 */
    CHECK(mw_source_render_impl(5, 0, 0, 1) == -9 && silent_renders == 2);
    mw_ui_tick();
    CHECK(mw_source_render_impl(5, 0, 0, 1) == -9 && mw_source_render_impl(4, 0, 0, 1) == 2);
    room = 2; mw_ui_tick();
    CHECK(voices == (1u << 4 | 1u << 5) && mw_source_render_impl(5, 0, 0, 1) == 3);
    CHECK(mw_assign(part0(), 4, 1) == 1 && voices == 1u << 5 && releases == 1 && engine_offs == 0);
    CHECK(mw_assign(part0(), 5, 1) == 1 && !voices && releases == 2 && engine_offs == 1);
    /* Another priced machine takes a charged track: charged in place of the first, whose engine goes with its last
     * voice. A project load that signs the track as the other moves the charge; when the move is refused the track's
     * charge is freed and it renders silence. A machine that leaves frees its voice and engine. */
    const void *de[] = {&D, &E};
    rows(de, 2, 0, 0);
    room = 1;
    CHECK(mw_assign(part0(), 4, 5) == 1 && voice_of[4] == key(&D));
    CHECK(mw_assign(part0(), 4, 6) == 1 && voice_of[4] == key(&E) && engine_offs == 2 && last_off == key(&D) && releases == 2);
    CHECK(mw_source_render_impl(4, 0, 0, 1) > 100);
    part0()[60 + 120] = 'D'; part0()[61 + 120] = 'V'; mw_ui_tick();          /* a project load signs track 4 D */
    CHECK(voice_of[4] == key(&D) && engine_offs == 3 && last_off == key(&E) && mw_source_render_impl(4, 0, 0, 1) < 100);
    room = 0; part0()[60 + 120] = 'E'; part0()[61 + 120] = '2'; mw_ui_tick(); /* its core cannot carry E */
    CHECK(!voices && releases == 3 && engine_offs == 4 && last_off == key(&D));
    int silent = silent_renders;
    CHECK(mw_source_render_impl(4, 0, 0, 1) == -9 && silent_renders == silent + 1);
    room = 1; mw_ui_tick();
    CHECK(voice_of[4] == key(&E));
    const void *d_only[] = {&D};
    rows(d_only, 1, 0, 0);                                                    /* E leaves */
    CHECK(!voices && releases == 4 && engine_offs == 5 && last_off == key(&E));
    part0()[60 + 120] = part0()[61 + 120] = part0()[62 + 120] = 0; mw_ui_tick();
    CHECK(!voices && releases == 4);

    /* Beta finding 24: the boot's battery restore validates the battery-backed Parts before the saved set brings the
     * machines back. With no machine installed, a known PROTECT signature (Analog BD's) still keeps its 12 bytes from
     * stock's validator, and gets them back; an unknown signature does not (stock judges its bytes, as before). */
    rows(0, 0, 0, 0);
    for (unsigned k = 0; k < 12; ++k) part0()[(k < 6 ? 0x2a : 0x1da) + 90 + 6 + k % 6] = (uint8_t)(0x70 + k);
    part0()[0x22 + 3] = 1; part0()[60 + 90] = 'A'; part0()[61 + 90] = 'B'; part0()[62 + 90] = 1;
    int validations = stock_validations;
    CHECK(mw_validate(part0()) == 11 && stock_validations == validations + 1 && seen[0] == 0x40 && seen[11] == 0x40);
    CHECK(part0()[0x2a + 90 + 6] == 0x70 && part0()[0x1da + 90 + 11] == 0x7b && part0()[60 + 90] == 'A');
    part0()[0x22 + 3] = 0;                                                   /* STATIC with the signature: the same */
    CHECK(mw_validate(part0()) == 11 && seen[0] == 0x40 && part0()[0x2a + 90 + 6] == 0x70);
    part0()[0x22 + 3] = 2;                                                   /* THRU: not a machine track */
    CHECK(mw_validate(part0()) == 11 && seen[0] == 0x70);
    part0()[0x22 + 3] = 1; part0()[62 + 90] = 2;                             /* another revision: unknown */
    CHECK(mw_validate(part0()) == 11 && seen[0] == 0x70 && seen[11] == 0x7b);
    part0()[60 + 90] = 'D'; part0()[61 + 90] = 'V'; part0()[62 + 90] = 1;   /* a signature this base does not know */
    CHECK(mw_validate(part0()) == 11 && seen[0] == 0x70);
    /* Beta finding 47: a set-up Sidechain Compressor (KEY T2, KFLT and KGN 64) on T4 FX2 shows stock its own COMPRESSOR
     * defaults in slots 8-11 and keeps its bytes; stock's own KEY 127, another effect or a MON out of range reach stock. */
    uint8_t *keys = (uint8_t *)part0() + 0x2fe + 90 + 6 + 2, fx2 = part0()[8 + 3], was[4];
    memcpy(was, keys, 4); part0()[8 + 3] = 24; keys[0] = 2; keys[1] = 64; keys[2] = 64; keys[3] = 0;
    CHECK(mw_validate(part0()) == 11 && seen_keys[0] == 0x7f && !seen_keys[1] && !seen_keys[2] && !seen_keys[3]);
    CHECK(keys[0] == 2 && keys[1] == 64 && keys[2] == 64 && keys[3] == 0);
    keys[0] = 0x7f;
    CHECK(mw_validate(part0()) == 11 && seen_keys[0] == 0x7f && seen_keys[1] == 64);
    keys[0] = 2; keys[3] = 2;
    CHECK(mw_validate(part0()) == 11 && seen_keys[0] == 2 && seen_keys[3] == 2);
    keys[3] = 0; part0()[8 + 3] = 8;                                          /* DELAY */
    CHECK(mw_validate(part0()) == 11 && seen_keys[0] == 2 && seen_keys[1] == 64);
    part0()[8 + 3] = fx2; memcpy(keys, was, 4);
    /* Its track renders stock's silent source, an unsigned FLEX track stock's FLEX. */
    part0()[60 + 90] = 'A'; part0()[61 + 90] = 'B'; part0()[62 + 90] = 1;
    silent = silent_renders; int flex = stock_renders;
    CHECK(mw_source_render_impl(3, 0, 0, 1) == -9 && silent_renders == silent + 1);
    CHECK(mw_source_render_impl(6, 0, 0, 1) == -7 && stock_renders == flex + 1);
    CHECK(mw_type(1, slot(3)) == 1 && mw_page(slot(3)) == 0);                /* reads as stock FLEX */
    /* Choosing a stock machine leaves it as a present PROTECT machine is left: stock's FLEX defaults in both copies,
     * then no signature; the track is then an ordinary stock track. */
    for (unsigned k = 0; k < 6; ++k) sram[0x2a + 90 + 6 + k] = part0()[0x2a + 90 + 6 + k];
    sram[60 + 90] = 'A';
    CHECK(mw_assign(part0(), 3, 1) == 1 && part0()[0x2a + 90 + 6] == 0x40 && sram[0x2a + 90 + 6] == 0x40);
    CHECK(part0()[0x1da + 90 + 11] == 0x40 && part0()[60 + 90] == 0 && sram[60 + 90] == 0 && part0()[62 + 90] == 0);
    CHECK(mw_source_render_impl(3, 0, 0, 1) == -7);
    /* So does a machine taking it: its own defaults and signature, never the absent machine's bytes. */
    for (unsigned k = 0; k < 12; ++k) part0()[(k < 6 ? 0x2a : 0x1da) + 90 + 6 + k % 6] = (uint8_t)(0x70 + k);
    part0()[60 + 90] = 'A'; part0()[61 + 90] = 'B'; part0()[62 + 90] = 1;
    const void *v_only[] = {&V};
    rows(v_only, 1, 0, 0);
    CHECK(mw_assign(part0(), 3, 5) == 1 && part0()[60 + 90] == 'S' && part0()[0x2a + 90 + 6] == 0x40 && part0()[0x1da + 90 + 11] == 0x40);
    CHECK(mw_assign(part0(), 3, 1) == 1 && part0()[60 + 90] == 0);
    /* The type byte is stock's to change (the commit stores the returned row): the registry never writes it. */
    CHECK(part0()[0x22 + 3] == 1);
    rows(0, 0, 0, 0);

    /* The frame guard (a frame 47,891 counts; each earns 38,312, short ones save up to 23,945; the slack 4,789). F's
     * render on track 3 runs while the frame it predicts from the last frame's times stays within the budget, and
     * renders stock's silent source while it would overdraw. */
    const void *f_only[] = {&F};
    rows(f_only, 1, 0, 0);
    CHECK(mw_assign(part0(), 3, 5) == 1);
    fresh(); int s0 = silent_renders; f_cost = 10000;
    for (unsigned i = 0; i < 4u; ++i) CHECK(frame(3, 10000, 10000) > 100);
    CHECK(silent_renders == s0 && mw_frame_max == 30000 && !mw_frame_late_max && !mw_frame_sheds && credit == (int32_t)(FRAME / 2u));
    /* Saved credit lets one long frame run (65,000: its cost was 10,000); the next two would overdraw and skip, and the
     * slack keeps the next ones from running until a probe. */
    f_cost = 45000;
    CHECK(frame(3, 10000, 10000) > 100 && mw_frame_max == 65000 && mw_frame_late_max == 17109 && !mw_frame_sheds);
    CHECK(frame(3, 10000, 10000) == -9 && frame(3, 10000, 10000) == -9 && mw_frame_sheds == 2u && mw_frame_shed_tracks == 1u << 3);
    CHECK(frame(3, 10000, 10000) == -9 && silent_renders == s0 + 3);
    /* Sustained: each render's frame runs 87.6 % of a frame and the skipped ones 62.6 %. Renders and skips mix so the
     * frame interrupt's average stays at its share, and no frame starts late. */
    fresh(); f_cost = 11973; unsigned ran = 0; uint32_t from = host_timer;
    for (unsigned i = 0; i < 10000u; ++i) ran += frame(3, 0, 30000) > 100;
    CHECK(ran > 6000u && ran < 7000u && (host_timer - from) / 10000u <= FRAME / 5u * 4u + 50u && !mw_frame_late_max);
    /* Past the budget even with the credit full (64,000), within the slack: a probe about every 1,026 frames measures
     * it again; lighter, it comes back within one probe and stays. */
    fresh(); f_cost = 48000; ran = 0;
    for (unsigned i = 0; i < 3000u; ++i) ran += frame(3, 6000, 10000) > 100;
    CHECK(ran >= 3u && ran <= 4u);
    f_cost = 5000; ran = 0;
    for (unsigned i = 0; i < 1100u; ++i) ran += frame(3, 6000, 10000) > 100;
    unsigned stays = 0;
    for (unsigned i = 0; i < 10u; ++i) stays += frame(3, 6000, 10000) > 100;
    CHECK(ran >= 10u && stays == 10u);
    /* A track's second render in a frame has its own estimate: once measured, the heavy second render skips and the
     * light first one runs (the frame after the first long one skips both: it starts 25,109 late). */
    fresh(); f_cost = 1000;
    int one[4], two[4];
    for (unsigned i = 0; i < 4u; ++i) {
        mw_frame_t0 = host_timer; host_timer += 1000;
        one[i] = mw_source_render_impl(3, 0, 0, 1);
        f_cost = 70000; two[i] = mw_source_render_impl(3, 0, 0, 1); f_cost = 1000;
        host_timer += 1000; mw_frame_exit();
    }
    CHECK(one[0] > 100 && two[0] > 100 && one[1] == -9 && two[1] == -9);
    CHECK(one[2] > 100 && two[2] == -9 && one[3] > 100 && two[3] == -9);
    /* A track only stock renders always renders, however late the frame. */
    const void *v_only2[] = {&V};
    rows(v_only2, 1, 0, 0);
    uint32_t sheds = mw_frame_sheds;
    CHECK(frame(6, 90000, 10000) == -7 && mw_frame_sheds == sheds);
    rows(0, 0, 0, 0);

    /* SEQUENCER: FM's quantizer rows, then Scale Quantizer's with the same labels: one set, FM's; QZ alone: QZ's. */
    const void *both[] = {&FMQ, &QZ, &MORE};
    rows(0, 0, both, 3);
    CHECK(counts_now() == (5u << 24 | 5u << 16 | 4u << 8 | 7u));
    CHECK((uintptr_t)mw_seq_labels[0] == 0x3000u && !strcmp(mw_seq_labels[3], "SCALE") && mw_seq_getters[3] == 0 && !strcmp(mw_seq_labels[6], "SWING"));
    CHECK(mw_seq_labels[7] == (const void *)mw_seq_none && mw_seq_getters[10] == (const void *)mw_seq_get_none);
    const void *qz[] = {&QZ};
    rows(0, 0, qz, 1);
    CHECK((counts_now() & 0xff) == 6u && mw_seq_getters[3] == (void *)1 && mw_seq_labels[6] == (const void *)mw_seq_none);
    rows(0, 0, 0, 0);
    CHECK(counts_now() == (5u << 24 | 5u << 16 | 4u << 8 | 3u) && !masked);
    if (failures) { fprintf(stderr, "%u registry checks failed\n", failures); return 1; }
    puts("Machine registry: rows by table order, admission before mutation, signatures and defaults in both copies, absent "
         "machines as stock, the validator's protection and wrapper chain, render routing, keyed SEQUENCER rows and chooser "
         "counts and the frame guard passed.");
    return 0;
}
