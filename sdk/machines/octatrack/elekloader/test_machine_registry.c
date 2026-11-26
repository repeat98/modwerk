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
static uint8_t stock_voices[8 * 168]; /* stock's voice records (0x800049d8 + 168 * track): byte 0 is "playing" */
static uint32_t render_states[8 * 10]; /* stock's render states (0x80004898 + 40 * track): +4 the RTRG count */
static uint8_t live_fx[16]; /* what each slot runs (0x80000ec4): FX1 T1-T8, then FX2 */
static uint8_t playing[16];  /* 0x800065b8: +5 the current bank, +6 its pattern, +7 and +8 the queued ones */

/* Synthetic memory: a few segments at the addresses the registry reads. */
struct segment { uint32_t base, size; uint8_t *bytes; };
static uint8_t bank[0x9504au + 4u * 6322u + 64u], sram[4u * 6322u], misc[0x100], code[0x40], stocktab[0x80], ui[0x40], stockdef[12],
    clamps[0x270];
static struct segment segments[] = {
    {0x46000000u, sizeof bank, bank}, {0x100a4eceu, sizeof sram, sram}, {0x100b14c0u, 0x40, misc},
    {0x80000000u, 0x40, misc + 0x40}, {0x46c82450u, 0x10, misc + 0x80}, {0x400a78c8u, 20, stocktab},
    {0x400d5f38u, 20, stocktab + 20}, {0x400b27d0u, 12, stocktab + 40}, {0x400b27dcu, 12, stocktab + 52}, {0x400b282cu, 12, stocktab + 64},
    {0x460e7380u, 0x20, ui}, {0x460e70e0u, 4, ui + 0x20}, {0x400d320cu, 12, stockdef},
    {0x40079240u, 0x10, code}, {0x400585f0u, 0x10, code + 0x10}, {0x4003c950u, 4, code + 0x20}, {0x40078678u, 4, code + 0x24},
    {0x400786ccu, 4, code + 0x28}, {0x40079904u, 4, code + 0x2c}, {0x40065c7cu, 4, code + 0x30}, {0x40078c20u, sizeof clamps, clamps},
    {0x800049d8u, sizeof stock_voices, stock_voices}, {0x80004898u, sizeof render_states, (uint8_t *)render_states},
    {0x80000ec4u, sizeof live_fx, live_fx}, {0x800065b8u, sizeof playing, playing},
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
static unsigned relives, relive_args[3];
static void stock_relive(unsigned bank_index, unsigned part_index, unsigned track) { ++relives, relive_args[0] = bank_index, relive_args[1] = part_index, relive_args[2] = track; }
static void *host_stock(uint32_t a)
{
    return a == 0x40004008u ? (void *)(uintptr_t)stock_render : a == 0x400047f0u ? (void *)(uintptr_t)stock_silent
         : a == 0x40001f18u ? (void *)(uintptr_t)stock_relive : (void *)(uintptr_t)stock_any;
}
#define U8(a) (*(volatile uint8_t *)host_at(a))
#define U32(a) host_u32(a)
#define AT(a) ((volatile uint8_t *)host_at(a))
#define ADDR(p) host_addr(p)
#define STOCK(type, a) ((type)(uintptr_t)host_stock(a))

void mg_tick(void); /* midi_generators.c, checked by test_midi_generators.c */
void mg_tick(void) {}
static unsigned rest_polls; /* the loader's resting poll, checked by sdk/runtime/loader/tests/events_test.c; modelled below */
static int project_loading; /* fxmap.c's: a project load runs */
int modwerk_fxmap_loading(void);
int modwerk_fxmap_loading(void) { return project_loading; }
/* fxmap.c's effect ids: the ids the project names (bit id of project_fx), and module 700 + id holds id. */
#include "fxids.h"
static uint32_t project_fx;
fx_set modwerk_fxmap_used(void);
fx_set modwerk_fxmap_used(void) { fx_set s = {{0}}; for (unsigned id = 0; id < 32u; ++id) if (project_fx >> id & 1u) s = fx_with(s, id); return s; }
int modwerk_fxmap_handle(uint32_t module);
int modwerk_fxmap_handle(uint32_t module) { return module >= 700u && module < 732u ? (int)(module - 700u) : -1; }
uint32_t modwerk_fxmap_generation(void) { return 1; } /* fxmap.c's: the handle map never changes here */
/* The loader's side: the table rows and the machine glue. */
#include "loader.h"
volatile uint32_t modwerk_machine_assigned; /* controller_board.c's, not linked here */
#include "modwerk_events.h"
/* The loader's owner of an address: here the module id is the machine's first letter. */
int modwerk_runtime_owner_at(uintptr_t address, struct runtime_owner *o)
{ const struct modwerk_machine *m = (const void *)address; memset(o, 0, sizeof *o); o->module = m->sig[0]; return 1; }
/* The loader's live modules: none, unless a check installs one whose package carries an engine (ABI 10). */
static struct runtime_module engine_module; static int engine_installed;
const struct runtime_module *modwerk_runtime_module(unsigned position)
{ return engine_installed && position == 3u ? &engine_module : 0; }
static uintptr_t volatile machine_row[10], sequencer_row[9], start_row[10];
static uintptr_t volatile deadline_row[2]; /* ev_frame_deadline's subscribers */
static int masked;
uint32_t modwerk_machine_mask(void) { CHECK(!masked); masked = 1; return 7; }
void modwerk_machine_unmask(uint32_t s) { CHECK(masked && s == 7); masked = 0; }
/* Code is read unmasked and written masked (put() flushes each site just before writing it). */
void modwerk_machine_flush_data(uint32_t a, uint32_t n) { CHECK(masked); (void)a; (void)n; }
uint8_t *modwerk_machine_code(uint32_t a) { return host_at(a); }
void modwerk_machine_invalidate_code(void) {}
/* The asm side (machine_registry.s). */
static uint8_t seen[12], seen_keys[5]; static int stock_validations;
int mw_stock_validate(uint8_t *part)
{
    ++stock_validations; memcpy(seen, part + 0x2a + 30 * 3 + 6, 6); memcpy(seen + 6, part + 0x1da + 30 * 3 + 6, 6);
    memcpy(seen_keys, part + 0x2fe + 30 * 3 + 6 + 1, 5); /* T4 FX2's page-2 slots 7-11 */
    return 11;
}
void mw_stock_pool_open(void) { ++stock_calls; }
void mw_stock_list_draw(void) {}
const char mw_seq_none[1] = "";
void mw_seq_get_none(void) {}
void mw_seq_set_none(void) {}
#define modwerk_runtime_event_row host_rows
static uintptr_t volatile *const host_rows[RUNTIME_SITE_EVENTS] = {
    [MODWERK_OT_MACHINES - RUNTIME_EVENTS] = machine_row, [MODWERK_OT_SEQUENCER_ROWS - RUNTIME_EVENTS] = sequencer_row,
    [MODWERK_OT_MACHINE_STARTS - RUNTIME_EVENTS] = start_row, [MODWERK_EV_FRAME_DEADLINE - RUNTIME_EVENTS] = deadline_row};
static volatile uint32_t host_timer; /* the frame timer (DTCN3): the synthetic renders advance it */
static uint32_t host_tick;           /* and each read of it by this much: a wait on it ends (check_late_entry) */
static uint32_t host_dtcn3(void) { uint32_t now = host_timer; host_timer = now + host_tick; return now; }
#define DTCN3 host_dtcn3()
/* The loader's count of owner changes: the machine map notes a newly installed set's machines when it moves. */
static uint32_t owner_epoch;
uint32_t modwerk_runtime_owner_epoch(void) { return owner_epoch; }
static int test_stopped; /* runtime.c: the transport */
int modwerk_machine_stopped(void) { return test_stopped; }
#include "machine_registry.c"
#undef modwerk_runtime_event_row

/* The loader's resting, modelled (loader.c rest_poll and judged; the rows and sites are events_test.c's): each judged
 * module is a runtime_module whose ot_machines hook is its machine; at each poll it rests or wakes as
 * modwerk_machine_in_use answers, and a change calls modwerk_machine_tables_changed masked, as the loader does. Off
 * (model_rests 0) every machine stays awake and the poll only counts. */
static struct runtime_module judged_mod[3]; static unsigned judged_n, rest_changes; static int model_rests;
static uintptr_t resting_rec[3];
int modwerk_runtime_resting_at(uintptr_t a)
{
    for (unsigned i = 0; i < judged_n; ++i) if (a && resting_rec[i] == a) return 1;
    return 0;
}
int modwerk_runtime_rest_poll(void)
{
    ++rest_polls;
    if (!model_rests) return 0;
    int changed = 0;
    for (unsigned i = 0; i < judged_n; ++i) {
        uintptr_t record = judged_mod[i].hook[MODWERK_OT_MACHINES] ? judged_mod[i].hook[MODWERK_OT_MACHINES] : (uintptr_t)&judged_mod[i];
        int rest = !modwerk_machine_in_use(&judged_mod[i]);
        if ((resting_rec[i] != 0) != rest) resting_rec[i] = rest ? record : 0, changed = 1;
    }
    if (changed) { masked = 1; modwerk_machine_tables_changed(); masked = 0; ++rest_changes; }
    return changed;
}
static void judge(unsigned i, const struct modwerk_machine *m)
{
    memset(&judged_mod[i], 0, sizeof judged_mod[i]);
    judged_mod[i].id = 900u + i, judged_mod[i].hook[MODWERK_OT_MACHINES] = (uintptr_t)m, resting_rec[i] = 0;
}
static int resting(unsigned i) { return resting_rec[i] != 0; }
/* One machine-map scan (twice a second on the unit, a whole scan at once after a change), then a UI tick. */
static void scan_tick(void) { mc_stale = 1; modwerk_machine_map_refresh(); mw_ui_tick(); }

/* The DSP budget's source stage (dsp.c, synthetic): a core carries `room` voices; a claim replaces the track's voice,
 * and an engine off frees its machine's engine and every voice it held. */
static unsigned room = 1, claims_made, releases, engine_offs; static uint8_t voices; static uint32_t voice_of[8], last_off;
static uint32_t want_voice = 411, want_engine = 3; static uint8_t want_kind = 1; /* the price a claim must carry */
int modwerk_dsp_source_claim(unsigned track, uint32_t module, uint32_t voice, uint32_t engine, uint8_t kind)
{
    CHECK(module && voice == want_voice && engine == want_engine && kind == want_kind && track < 8); ++claims_made;
    unsigned used = 0; for (unsigned t = 0; t < 8; ++t) used += t != track && voices & 1u << t;
    if (used >= room) return 6; /* RUNTIME_CYCLES */
    voices |= (uint8_t)(1u << track); voice_of[track] = module; return 0;
}
static unsigned box_calls, box_track = 99; static const char *box_label;
void modwerk_status_machine_refused(unsigned track, const char *label) { ++box_calls, box_track = track, box_label = label; }
static unsigned cpu_boxes, cpu_box_track = 99; static uint32_t cpu_box_booked, cpu_box_add;
static uint32_t cpu_box_allowed;
void modwerk_status_cpu_refused(unsigned track, const char *label, uint32_t booked, uint32_t add, uint32_t allowed)
{ (void)label; ++cpu_boxes, cpu_box_track = track, cpu_box_booked = booked, cpu_box_add = add, cpu_box_allowed = allowed; }
/* status.c's frame judge: the share now (cpu_now) with the pick on top and what it replaces off, against the line. */
static uint32_t cpu_now, hot_line = 500u; static unsigned hot_boxes, hot_box_track = 99; static uint32_t hot_box_cpu, hot_box_add, hot_box_gone;
int modwerk_status_pick_busy(unsigned slot, unsigned machine, const char *label, uint32_t add, uint32_t gone, uint32_t dsp)
{
    (void)label; (void)dsp; CHECK(machine == 1u || machine == 2u); /* 2: a further instance of a machine the Part runs */
    extern volatile uint32_t mw_cpu_refusals;
    if (cpu_now + add < hot_line + gone) return 0;
    mw_cpu_refusals = mw_cpu_refusals + 1u, ++hot_boxes, hot_box_track = slot, hot_box_cpu = cpu_now, hot_box_add = add, hot_box_gone = gone; return 1;
}
/* The site's measured costs: module 'L' (LIGHT) one track 2 % of a frame, 1 % to wake, while costs_listed. */
static int costs_listed;
int modwerk_status_module_cost(uint32_t module, uint32_t *use, uint32_t *wake)
{ if (!costs_listed || module != 'L') return 0; *use = 20u, *wake = 10u; return 1; }
uint32_t modwerk_status_module_rest(uint32_t module) { return costs_listed && module == 'L' ? 15u : 0u; } /* 1.5 % at rest */
uint32_t modwerk_status_costs_key(void) { return costs_listed ? 2u : 1u; } /* status.c's: another table, another key */
static uint32_t test_hush; /* status.c's predicted brake */
uint32_t modwerk_status_hush(fx_set fx[2], uint16_t id[2])
{ fx[0] = fx[1] = (fx_set){{0}}; id[0] = (uint16_t)(test_hush >> 24), id[1] = 0xffffu; return test_hush; }
static uint32_t cpu_in, cpu_out; /* what picks reported adding to the meter and exits taking away (status.c counts them) */
void modwerk_status_cpu_entered(uint32_t mille) { cpu_in += mille; }
void modwerk_status_cpu_left(uint32_t mille) { cpu_out += mille; }
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
static const struct modwerk_machine A = {MODWERK_MACHINE_ABI, {'A', 'B'}, 1, 1, "ANALOG BD", MODWERK_MACHINE_PROTECT | MODWERK_MACHINE_POOL | MODWERK_MACHINE_SETUP_ALL, 0, a_defaults,
                                         0, admit_a, 0, page_a, 0, leave_a, 0, 0, 0, 0, render_a, 0, 0, 0, 0, {0}};
static const struct modwerk_machine V = {MODWERK_MACHINE_ABI, {'S', '2'}, 1, 2, "VECTOR", MODWERK_MACHINE_POOL | MODWERK_MACHINE_BACKING, 0, 0,
                                         assign_v, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, validate_v, 0, 0, 0, {0}};
static const struct modwerk_machine F = {MODWERK_MACHINE_ABI, {'F', 'M'}, 1, 1, "FM SYNTH", MODWERK_MACHINE_PROTECT | MODWERK_MACHINE_RENDER_FLEX | MODWERK_MACHINE_LIST, 0, a_defaults,
                                         0, 0, 0, 0, 0, 0, 0, 0, 0, 0, render_f, 0, 0, 0, 0, {0}};
static const struct modwerk_machine X = {2u, {'X', 'X'}, 1, 1, "FUTURE", 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, {0}};
static const struct modwerk_machine D = {MODWERK_MACHINE_ABI, {'D', 'V'}, 1, 1, "PRICED", MODWERK_MACHINE_PROTECT, 0, a_defaults,
                                         0, 0, 0, 0, 0, 0, 0, 0, 0, 0, render_a, 0, 411, 3, 1, {0}},
                             E = {MODWERK_MACHINE_ABI, {'E', '2'}, 1, 1, "PRICED 2", MODWERK_MACHINE_PROTECT, 0, a_defaults,
                                         0, 0, 0, 0, 0, 0, 0, 0, 0, 0, render_f, 0, 411, 3, 1, {0}};
/* A SETUP_PAGE machine (its record 88 bytes) and one that leaves the flag clear: the base reads the two setup words
 * only with the flag, so the second's are never called. */
static unsigned setup_pages, setup_knobs, knob_index = 99, knob_takes = 1; static int knob_delta;
static uint32_t setup_page_s(uint32_t stock) { ++setup_pages; return stock + 0x100u; }
static unsigned setup_knob_s(unsigned index, int delta) { ++setup_knobs, knob_index = index, knob_delta = delta; return knob_takes; }
static const struct modwerk_machine_setup S = {{MODWERK_MACHINE_ABI, {'S', '2'}, 1, 2, "VECTOR", MODWERK_MACHINE_POOL | MODWERK_MACHINE_BACKING
                                               | MODWERK_MACHINE_SETUP_PAGE, 0, 0, assign_v, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, validate_v,
                                               0, 0, 0, {0}}, setup_page_s, setup_knob_s},
                                   N = {{MODWERK_MACHINE_ABI, {'N', 'S'}, 1, 1, "NO FLAG", MODWERK_MACHINE_PROTECT, 0, a_defaults,
                                               0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, {0}}, setup_page_s, setup_knob_s};
static const struct { uint32_t count; struct modwerk_sequencer_row row[3]; } FMQ = {3, {{"SCALE", 0, 0}, {"ROOT", 0, 0}, {"GLIDE", 0, 0}}},
    QZ = {3, {{"SCALE", (void *)1, 0}, {"ROOT", (void *)1, 0}, {"GLIDE", (void *)1, 0}}}, MORE = {1, {{"SWING", 0, 0}}};
static void rows(const void *const *m, unsigned n, const void *const *s, unsigned k)
{
    for (unsigned i = 0; i < 10; ++i) machine_row[i] = i < n ? (uintptr_t)m[i] : 0;
    for (unsigned i = 0; i < 9; ++i) sequencer_row[i] = i < k ? (uintptr_t)s[i] : 0;
    masked = 1; modwerk_machine_tables_changed(); masked = 0;
}
static Part *part0(void) { return AT(0x46000000u + PART_OFF); }
static const Part *slot(unsigned t) { return part0() + 0x22 + t; }
/* The guard as at boot (machine_registry.c's statics: this file includes it). */
static void fresh(void)
{
    late = timed = before = 0; made = 0; credit = 0; frame_seen = 0; mw_frame_max = mw_frame_late_max = mw_frame_busy = mw_frame_count = 0;
    starting = start_prev = 0;
    for (unsigned k = 0; k < 16u; ++k) cost[k] = after[k] = end_at[k] = start_cost[k] = start_after[k] = 0, skipped[k] = 0, place[k] = next[k] = 0;
}
/* The track's render in a later frame than the last one: the lookup reads the Part again (mw_frame_exit ends a frame). */
static int later(unsigned track) { frame_seen = 0; return mw_source_render_impl(track, 0, 0, 1); }
/* One frame interrupt: its entry, `pre` counts of stock work, the track's render, `tail` counts more, its exit. */
static int frame(unsigned track, uint32_t pre, uint32_t tail)
{
    mw_frame_t0 = host_timer; host_timer += pre;
    int r = mw_source_render_impl(track, 0, 0, 1);
    host_timer += tail; mw_frame_exit();
    return r;
}
static unsigned counts_now(void) { return (unsigned)code[0x0b] << 24 | (unsigned)code[0x1d] << 16 | (unsigned)code[0x21] << 8 | code[0x33]; }
/* The chooser's ten UP/DOWN cursor clamps (moveq #k at each handler and 6 bytes on): all k, or 0 if they differ. */
static unsigned clamp_now(void)
{
    static const uint32_t at[] = {0x40078c23u, 0x40078cb1u, 0x40078d2fu, 0x40078defu, 0x40078e7du};
    unsigned k = clamps[at[0] - 0x40078c20u];
    for (unsigned i = 0; i < 5; ++i) if (clamps[at[i] - 0x40078c20u] != k || clamps[at[i] + 6u - 0x40078c20u] != k) return 0;
    return k;
}
static unsigned start_calls, fallback_calls, fm_calls;
static int source_start(unsigned t, unsigned s, unsigned f)
{ CHECK(!masked); ++start_calls; return (int)(1000u + t + s + f); }
static int fallback_start(unsigned t, unsigned s, unsigned f)
{ CHECK(!masked); ++fallback_calls; return (int)(2000u + t + s + f); }
static int fm_start(unsigned t, unsigned s, unsigned f)
{ CHECK(!masked); ++fm_calls; return (int)(3000u + t + s + f); }
static int selected_start(unsigned t, unsigned s, unsigned f, SourceStart *fallback)
{
    SourceStart *call = mw_source_start_select(t, fallback);
    return call ? call(t, s, f) : 0;
}
static void check_source_starts(void)
{
    struct modwerk_machine custom = A;
    custom.sig[0] = 'S'; custom.sig[1] = 'T';
    custom.flags |= MODWERK_MACHINE_START;
    const void *one[] = {&custom};
    struct modwerk_machine_start record = {MODWERK_MACHINE_START_ABI, sizeof record, &custom, source_start};
    rows(one, 1, 0, 0);
    start_row[0] = (uintptr_t)&record;
    for (unsigned t = 0; t < 8u; ++t) {
        part0()[0x22 + t] = 1;
        memcpy((void *)(part0() + SIG + 30u * t), "ST\1", 3);
        for (unsigned f = 0xc0u; f <= 0xe0u; f += 0x20u)
            CHECK(selected_start(t, 127u, f, fallback_start) == (int)(1127u + t + f));
    }
    CHECK(start_calls == 16u && !fallback_calls && !fm_calls);
    /* A trig gate can skip the selected call: selection has no START effects. */
    CHECK(mw_source_start_select(0, fallback_start) != fallback_start);
    CHECK(start_calls == 16u && !fallback_calls && !fm_calls);
    CHECK(!selected_start(8, 127, 0xc0, fallback_start));
    unsigned calls = start_calls;
    /* No callback means no stock interpretation of custom controls, and no
     * continuation of a previously sounding voice under that owner. */
    start_row[0] = 0;
    CHECK(!selected_start(0, 127, 0xc0, fallback_start));
    /* Refusing START still retires stock's stale voice/retrig before the silent render (#1051). */
    stock_voices[0] = 1; render_states[1] = 0x4000;
    CHECK(mw_source_render_impl(0, 0, 0, 16) == -9);
    CHECK(stock_voices[0] == 0 && render_states[1] == 0);
    start_row[0] = (uintptr_t)&record;
    record.abi = 2;
    CHECK(!selected_start(0, 127, 0xc0, fallback_start));
    record.abi = MODWERK_MACHINE_START_ABI; record.bytes--;
    CHECK(!selected_start(0, 127, 0xc0, fallback_start));
    record.bytes = sizeof record; record.start = 0;
    CHECK(!selected_start(0, 127, 0xc0, fallback_start));
    record.start = source_start; record.machine = 0;
    CHECK(!selected_start(0, 127, 0xc0, fallback_start));
    record.machine = &V;
    CHECK(!selected_start(0, 127, 0xc0, fallback_start));
    record.machine = &custom; start_row[1] = (uintptr_t)&record;
    CHECK(!selected_start(0, 127, 0xc0, fallback_start));
    start_row[1] = 0;
    CHECK(start_calls == calls && !fallback_calls);
    CHECK(selected_start(0, 127, 0xc0, fallback_start) == 1319);
    /* Enter a new frame: a stale timestamp from the guard overload tests is
     * otherwise allowed to shed this render before the callback is reached. */
    fresh(); CHECK(frame(0, 0, 0) > 0);
    /* A source price is mandatory before START as well as before render. */
    custom.source_kind = 1; custom.source_voice = 411; custom.source_engine = 3;
    room = 0; CHECK(!claim(0, &custom));
    CHECK(!selected_start(0, 1, 0xe0, fallback_start));
    CHECK(mw_source_render_impl(0, 0, 0, 16) == -9);
    room = 1; CHECK(claim(0, &custom));
    CHECK(selected_start(0, 1, 0xe0, fallback_start) == 1225);
    release(0);
    /* Unowned tracks and legacy machines keep the exact selected fallback,
     * including FM. Extension rows do not claim a legacy machine implicitly. */
    const void *legacy[] = {&F}; rows(legacy, 1, 0, 0);
    memcpy((void *)(part0() + SIG), "FM\1", 3);
    CHECK(mw_source_start_select(0, fm_start) == fm_start);
    CHECK(mw_source_start_select(0, 0) == 0);
    CHECK(selected_start(0, 7, 0xe0, fm_start) == 3231 && fm_calls == 1u);
    memset((void *)(part0() + SIG), 0, 3);
    CHECK(selected_start(0, 7, 0xc0, fallback_start) == 2199 && fallback_calls == 1u);
    CHECK(!selected_start(0, 7, 0xc0, 0));
    put_u32(BANK, 0);
    CHECK(mw_source_start_select(0, fm_start) == fm_start);
    put_u32(BANK, 0x46000000u);
    /* Known PROTECT signatures remain fail-closed without the module. */
    rows(0, 0, 0, 0); memcpy((void *)(part0() + SIG), "FM\1", 3);
    CHECK(!selected_start(0, 7, 0xc0, fm_start) && fm_calls == 1u);
    start_row[0] = 0;
    for (unsigned t = 0; t < 8u; ++t) memset((void *)(part0() + SIG + 30u * t), 0, 3);

    /* All eight admitted machines may own START records. Reverse table order so the first track's
     * callback is the last record, exercising the full table and its terminator. */
    struct modwerk_machine all[8];
    struct modwerk_machine_start starts[8];
    const void *eight[8];
    for (unsigned t = 0; t < 8u; ++t) {
        all[t] = A; all[t].sig[0] = 'S'; all[t].sig[1] = (uint8_t)('0' + t);
        all[t].flags |= MODWERK_MACHINE_START; all[t].source_kind = 0;
        starts[t] = (struct modwerk_machine_start){MODWERK_MACHINE_START_ABI, sizeof starts[t], &all[t], source_start};
        eight[t] = &all[t]; start_row[7u - t] = (uintptr_t)&starts[t];
        part0()[0x22 + t] = 1;
        part0()[SIG + 30u * t] = all[t].sig[0]; part0()[SIG + 30u * t + 1u] = all[t].sig[1];
        part0()[SIG + 30u * t + 2u] = 1;
    }
    rows(eight, 8, 0, 0);
    calls = start_calls;
    for (unsigned t = 0; t < 8u; ++t)
        CHECK(selected_start(t, 11, 0xc0, fallback_start) == (int)(1203u + t));
    CHECK(start_calls == calls + 8u && fallback_calls == 1u && fm_calls == 1u);
    /* A non-terminated overfull table refuses, without invoking a callback; restoring it recovers. */
    start_row[8] = (uintptr_t)&starts[0];
    CHECK(!selected_start(0, 11, 0xc0, fallback_start) && start_calls == calls + 8u);
    start_row[8] = 0;
    CHECK(selected_start(0, 11, 0xc0, fallback_start) == 1203 && start_calls == calls + 9u);
    /* Unrelated table updates retain a live owner's refusal; removal clears it on every track, before the
     * descriptor address can be reused by a machine that has not accepted its first START. */
    start_row[0] = 0;
    for (unsigned t = 0; t < 8u; ++t) CHECK(!selected_start(t, 11, 0xc0, fallback_start));
    rows(eight, 8, 0, 0);
    for (unsigned t = 0; t < 8u; ++t) CHECK(start_refused[t] == &all[t]);
    const void *survivor[] = {&all[1]};
    rows(survivor, 1, 0, 0);
    for (unsigned t = 0; t < 8u; ++t) CHECK(start_refused[t] == (t == 1u ? &all[1] : 0));
    rows(0, 0, 0, 0);
    for (unsigned t = 0; t < 8u; ++t) CHECK(!start_refused[t]);
    all[0].flags &= ~MODWERK_MACHINE_START;
    rows(eight, 1, 0, 0); /* the replacement occupies exactly the removed descriptor's address */
    fresh(); CHECK(frame(0, 0, 0) > 0); /* its render works before any accepted START */
    rows(0, 0, 0, 0);
    for (unsigned t = 0; t < 10u; ++t) start_row[t] = 0;
    for (unsigned t = 0; t < 8u; ++t) memset((void *)(part0() + SIG + 30u * t), 0, 3);
}

/* A synthetic native sample reader, using the exact voice byte stop_stock writes.
 * An inactive voice emits no PCM; a second fake voice array would hide this regression. */
static unsigned native_reads, native_pcm;
static int render_native(unsigned t, unsigned p, unsigned s, unsigned e)
{
    (void)p; ++native_reads;
    if (!U8(VOICE + VOICE_STRIDE * t)) return 0;
    native_pcm += e - s;
    return (int)(e - s);
}
static int start_native(unsigned t, unsigned sample, unsigned flags)
{
    (void)sample; (void)flags;
    U8(VOICE + VOICE_STRIDE * t) = 255;
    return 1;
}
static void check_native_flex_voice(void)
{
    struct modwerk_machine native = A;
    native.flags |= MODWERK_MACHINE_NATIVE_FLEX | MODWERK_MACHINE_START;
    native.render = render_native;
    const struct modwerk_machine_start entry = {MODWERK_MACHINE_START_ABI, sizeof entry, &native, start_native};
    const void *one[] = {&native};
    rows(one, 1, 0, 0); start_row[0] = (uintptr_t)&entry; start_row[1] = 0;
    for (unsigned t = 0; t < 8u; ++t) {
        part0()[0x22u + t] = 1;
        memcpy((void *)(part0() + SIG + 30u * t), "AB\1", 3);
        stock_voices[168u * t] = 0;
        CHECK(selected_start(t, 0, 0, fallback_start) == 1);
        CHECK(stock_voices[168u * t] == 255);
        /* Both segments of a frame consume the active native voice. */
        fresh(); mw_frame_t0 = host_timer;
        unsigned before = native_pcm;
        for (unsigned segment = 0; segment < 2; ++segment) {
            render_states[10u * t + 1u] = 77;
            CHECK(mw_source_render_impl(t, 0, segment * 8u, segment * 8u + 8u) == 8);
            CHECK(stock_voices[168u * t] == 255 && !render_states[10u * t + 1u]);
        }
        CHECK(native_pcm == before + 16u);

        start_refused[t] = &native;
        stock_voices[168u * t] = 255; render_states[10u * t + 1u] = 77;
        before = native_reads;
        CHECK(mw_source_render_impl(t, 0, 0, 1) == -9 && native_reads == before);
        CHECK(!stock_voices[168u * t] && !render_states[10u * t + 1u]);
        CHECK(selected_start(t, 0, 0, fallback_start) == 1); /* accepted START releases the refusal */
        CHECK(!start_refused[t]);

        native.source_kind = 1; native.source_voice = 411; charged[t] = 0;
        stock_voices[168u * t] = 255; render_states[10u * t + 1u] = 77;
        CHECK(mw_source_render_impl(t, 0, 0, 1) == -9 && native_reads == before);
        CHECK(!stock_voices[168u * t] && !render_states[10u * t + 1u]);
        native.source_kind = 0; native.source_voice = 0;

        /* Default own-render machines, and malformed direct tables without
         * START, still stop the native voice before their renderer is called. */
        native.flags &= ~MODWERK_MACHINE_NATIVE_FLEX;
        for (unsigned invalid = 0; invalid < 2; ++invalid) {
            stock_voices[168u * t] = 255; render_states[10u * t + 1u] = 77;
            fresh(); mw_frame_t0 = host_timer;
            CHECK(mw_source_render_impl(t, 0, 0, 1) == 0);
            CHECK(!stock_voices[168u * t] && !render_states[10u * t + 1u]);
            native.flags |= MODWERK_MACHINE_NATIVE_FLEX;
            native.flags &= ~MODWERK_MACHINE_START;
        }
        native.flags |= MODWERK_MACHINE_START;
    }
    start_row[0] = 0; rows(0, 0, 0, 0);
}

/* The CPU budget: a Part carries mw_cpu_allowance percent of a frame in machine renders. An unpriced machine costs
 * CPU_DEFAULT a track, a priced one its reserved[0]; a DSP voice that names none costs nothing. */
static const struct modwerk_machine P = {MODWERK_MACHINE_ABI, {'P', 'C'}, 1, 1, "DEAR", MODWERK_MACHINE_PROTECT, 0, a_defaults,
                                         0, 0, 0, 0, 0, 0, 0, 0, 0, 0, render_a, 0, 0, 0, 0, {30}};
/* Priced 30, measured at 5 points of the meter (reserved[1]). */
static const struct modwerk_machine L = {MODWERK_MACHINE_ABI, {'L', 'T'}, 1, 1, "LIGHT", MODWERK_MACHINE_PROTECT, 0, a_defaults,
                                         0, 0, 0, 0, 0, 0, 0, 0, 0, 0, render_a, 0, 0, 0, 0, {30, 5}};
static void check_cpu_budget(void)
{
    const void *both[] = {&A, &P};
    rows(both, 2, 0, 0);
    for (unsigned t = 0; t < 8; ++t) { part0()[0x22 + t] = 1; for (unsigned k = 0; k < 3; ++k) part0()[60 + 30 * t + k] = 0; }
    fresh(); a_admit = 1; mw_cpu_allowance = 45; { unsigned polls = rest_polls; mw_ui_tick(); CHECK(rest_polls == polls + 1u); }
    CHECK(!mw_cpu_refused && !mw_cpu_booked);
    /* A unit at the frame line (status.c) takes no further machine, with its own box and the share it plays at; the
     * same machine on its own track asks nothing, and the pick passes once the share and its cost are under the line. */
    extern volatile uint32_t mw_cpu_refusals;
    { uint32_t refusals = mw_cpu_refusals; unsigned was = cpu_boxes;
      cpu_now = hot_line;
      CHECK(mw_assign(part0(), 7, 5) == (unsigned)-1 && hot_boxes == 1 && hot_box_track == 7 && hot_box_cpu == hot_line);
      CHECK(mw_cpu_refusals == refusals + 1 && cpu_boxes == was && !mw_cpu_booked);
      cpu_now = hot_line - 120u; /* its price (12 % of a frame, unpriced) would take the share to the line */
      CHECK(mw_assign(part0(), 7, 5) == (unsigned)-1 && hot_boxes == 2 && hot_box_cpu == hot_line - 120u && hot_box_add == 120u);
      CHECK(mw_assign(part0(), 7, 6) == (unsigned)-1 && hot_boxes == 3);         /* nor the dear one (30) */
      cpu_now = hot_line - 121u;
      CHECK(mw_assign(part0(), 7, 6) == (unsigned)-1 && hot_boxes == 4);
      CHECK(mw_assign(part0(), 7, 5) == 1 && hot_boxes == 4);
      cpu_now = 1000u;
      CHECK(mw_assign(part0(), 7, 5) == 1 && hot_boxes == 4);                    /* already this machine's track */
      CHECK(mw_assign(part0(), 7, 1) == 1 && hot_boxes == 4);                    /* back to stock: never refused */
      cpu_now = 0; mw_ui_tick(); }
    /* A pick adds what the site measured one track of the machine to add to the frame, else its measured meter cost
     * (reserved[1]), else its price; it reports what it adds and an exit what it takes away (owner's MKII, 21 November
     * 2026: Grain priced 35 added 8.9). A swap is judged with the one it replaces gone. */
    { const void *three[] = {&A, &P, &L}; rows(three, 3, 0, 0); fresh(); a_admit = 1; cpu_in = cpu_out = 0;
      cpu_now = hot_line - 100u;
      CHECK(mw_assign(part0(), 7, 6) == (unsigned)-1 && !cpu_in);               /* the dear one by its price: 30 */
      CHECK(mw_assign(part0(), 7, 7) == 1 && cpu_in == 50u);                    /* priced 30, adds 5: admitted */
      CHECK(mw_assign(part0(), 7, 1) == 1 && cpu_out == 50u);                   /* back to stock: its cost comes off */
      cpu_now = 0;
      CHECK(mw_assign(part0(), 6, 5) == 1 && cpu_in == 170u);                   /* unmeasured: its price, 12 */
      CHECK(mw_assign(part0(), 6, 6) == 1 && cpu_out == 170u && cpu_in == 470u); /* a swap: one out, one in */
      CHECK(mw_assign(part0(), 6, 6) == 1 && cpu_in == 470u);                   /* its own track again: nothing */
      CHECK(mw_assign(part0(), 6, 1) == 1 && cpu_out == 470u);
      /* Measured by the site: the first track of the Part by its first (2 % + 1 %), a further one by its each (2 %), and
       * the reserve's booking of the Part's machines the same way. */
      costs_listed = 1, cpu_in = cpu_out = 0, mw_cpu_allowance = 100; /* room for two LIGHTs at 30 */
      CHECK(mw_assign(part0(), 7, 7) == 1 && cpu_in == 30u);
      CHECK(mw_assign(part0(), 6, 7) == 1 && cpu_in == 50u);                    /* a second LIGHT: each */
      uint32_t modwerk_machine_frame_booked(unsigned skip, uint32_t net);
      CHECK(modwerk_machine_frame_booked(8, 0) == 50u && modwerk_machine_frame_booked(7, 0) == 30u && modwerk_machine_frame_booked(6, 0) == 30u);
      CHECK(modwerk_machine_frame_booked(8, 25u) == 25u);                        /* the first less a sample's share, a further one whole */
      CHECK(mw_assign(part0(), 6, 1) == 1 && cpu_out == 20u);                   /* one of two leaves: each */
      cpu_now = hot_line - 89u;
      CHECK(mw_assign(part0(), 7, 5) == (unsigned)-1 && hot_box_gone == 30u);  /* the last LIGHT out, unpriced A in: 120 */
      cpu_now = hot_line - 91u;
      CHECK(mw_assign(part0(), 7, 5) == 1 && cpu_out == 50u && cpu_in == 170u);
      CHECK(mw_assign(part0(), 7, 1) == 1); costs_listed = 0, cpu_now = 0, mw_cpu_allowance = 45;
      rows(both, 2, 0, 0); fresh(); a_admit = 1; mw_ui_tick(); }
    unsigned boxes = cpu_boxes;
    CHECK(mw_assign(part0(), 0, 5) == 1 && mw_assign(part0(), 1, 5) == 1 && mw_assign(part0(), 2, 5) == 1 && cpu_boxes == boxes);
    CHECK(mw_assign(part0(), 3, 5) == (unsigned)-1 && part0()[60 + 90] == 0);  /* a fourth at 12: 48 of 45, nothing written */
    CHECK(cpu_boxes == boxes + 1 && cpu_box_track == 3 && cpu_box_booked == 360 && cpu_box_add == 120 && cpu_box_allowed == 450); /* per mille of a frame */
    CHECK(mw_assign(part0(), 3, 6) == (unsigned)-1);                           /* nor the dear one */
    CHECK(mw_assign(part0(), 2, 5) == 1 && cpu_boxes == boxes + 2);            /* the same machine again asks nothing */
    CHECK(mw_assign(part0(), 2, 6) == (unsigned)-1);                           /* its own 12 back, 30 more: 54 */
    CHECK(mw_assign(part0(), 1, 1) == 1 && mw_assign(part0(), 2, 6) == 1);     /* a track freed: 12 + 30 */
    mw_ui_tick();
    CHECK(mw_cpu_booked == 42 && !mw_cpu_refused);
    /* Tracks that became machines without a pick (a load, a Part change, a paste): past the allowance they render
     * stock's silent source, and the box says so once; they play when room is made. */
    part0()[60 + 150] = part0()[60 + 180] = 'A', part0()[61 + 150] = part0()[61 + 180] = 'B', part0()[62 + 150] = part0()[62 + 180] = 1;
    boxes = cpu_boxes; mw_ui_tick(); mw_ui_tick();
    CHECK(mw_cpu_refused == (1u << 5 | 1u << 6) && mw_cpu_booked == 42 && cpu_boxes == boxes + 1 && cpu_box_track == 5);
    int silent = silent_renders, played = a_renders;
    CHECK(later(5) == -9 && silent_renders == silent + 1 && later(0) == played + 1);
    CHECK(mw_assign(part0(), 2, 1) == 1);
    mw_ui_tick();
    CHECK(!mw_cpu_refused && mw_cpu_booked == 36 && cpu_boxes == boxes + 1 && later(5) == played + 2);
    mw_cpu_allowance = 10; mw_ui_tick();                                        /* a development base's smaller allowance */
    CHECK(mw_cpu_refused == (1u << 0 | 1u << 5 | 1u << 6) && !mw_cpu_booked);
    mw_cpu_allowance = 45;
    for (unsigned t = 0; t < 8; ++t) for (unsigned k = 0; k < 3; ++k) part0()[60 + 30 * t + k] = 0;
    mw_ui_tick(); rows(0, 0, 0, 0);
    CHECK(!mw_cpu_refused);
}
/* ABI 10: a machine whose package carries an engine is charged at the engine header's price per voice (cycles and
 * kind, outside the controller digest), not its record's; its record keeps 0 there. A record still priced beside such
 * an engine, a per-core cost of another kind, or no price at all is refused, never admitted free. */
static void check_engine_price(void)
{
    struct modwerk_machine ab = A;
    ab.source_voice = 0, ab.source_engine = 0, ab.source_kind = 1;
    engine_module.dsp.module = ab.sig[0], engine_module.dsp.engine_count = 1, engine_module.dsp.cycles = 414,
    engine_module.dsp.kind = 1;
    fresh(); room = 1; voices = 0;
    unsigned made = claims_made;
    CHECK(!claim(0, &ab) && claims_made == made);                  /* no engine installed: unpriced, refused */
    engine_installed = 1; want_voice = 414, want_engine = 0, want_kind = 1;
    CHECK(claim(0, &ab) && claims_made == made + 1); release(0);   /* the engine's price */
    engine_module.dsp.cycles = 191; want_voice = 191;
    CHECK(claim(0, &ab) && claims_made == made + 2); release(0);   /* a new package's price, the same record */
    engine_module.dsp.kind = 3; want_kind = 3;
    CHECK(claim(0, &ab)); release(0);                              /* hardware evidence */
    ab.source_engine = 2;                                          /* a per-core cost of another kind */
    made = claims_made; CHECK(!claim(0, &ab) && claims_made == made);
    ab.source_kind = 3; want_engine = 2;
    CHECK(claim(0, &ab)); release(0);                              /* of the engine's kind */
    ab.source_engine = 0; ab.source_voice = 411;                   /* still priced in its record too */
    made = claims_made; CHECK(!claim(0, &ab) && claims_made == made);
    engine_installed = 0; want_voice = 411, want_engine = 3, want_kind = 1;
}
/* The machines a project uses (owner, 16 November 2026: machines in the project map): noted when a track takes one,
 * written as the project's lines, read back from them, and absent, named, once the machine's module is gone. The bank
 * and its SRAM mirror come back as they were. */
static uint8_t bank_copy[sizeof bank], sram_copy[sizeof sram];
static void check_machine_map(void)
{
    memcpy(bank_copy, bank, sizeof bank), memcpy(sram_copy, sram, sizeof sram);
    memset(&host_mc_map, 0, sizeof host_mc_map), mc_stale = 1, mc_epoch_seen = 0;
    uint32_t m; char name[16]; uint8_t sig[2]; unsigned lo, hi, b, p, t;
    const void *a_only[] = {&A};
    rows(a_only, 1, 0, 0);
    a_admit = 1; CHECK(mw_assign(part0(), 4, 5) == 1);                     /* T5 takes ANALOG BD: noted */
    CHECK(host_mc_map.magic == MC_MAGIC && host_mc_map.e[0].module == 'A' && !strcmp(host_mc_map.e[0].name, "ANALOG BD"));
    CHECK(host_mc_map.e[0].sig[0] == 'A' && host_mc_map.e[0].sig[1] == 'B' && host_mc_map.e[0].lo == 1 && host_mc_map.e[0].hi == 1);
    modwerk_machine_map_refresh();
    CHECK(!modwerk_machine_absent(0, &m, name) && !modwerk_machine_track_absent(4, &m, name)); /* installed: not absent */
    CHECK(modwerk_machine_where(0, &b, &p, &t) == 1 && b == 0 && p == 0 && t == 4);
    CHECK(modwerk_machine_map_line(0, sig, &lo, &hi, &m, name) == 1 && sig[0] == 'A' && sig[1] == 'B' && lo == 1 && hi == 1);
    CHECK(m == 'A' && !strcmp(name, "ANALOG BD") && !modwerk_machine_map_line(1, sig, &lo, &hi, &m, name));
    /* Its module gone (switched off, removed): absent, by name, in MISSING and on its track. */
    rows(0, 0, 0, 0); ++owner_epoch; modwerk_machine_map_refresh();
    CHECK(modwerk_machine_absent(0, &m, name) && m == 'A' && !strcmp(name, "ANALOG BD") && !modwerk_machine_absent(1, &m, name));
    CHECK(modwerk_machine_track_absent(4, &m, name) && m == 'A' && !modwerk_machine_track_absent(3, &m, name));
    memset(host_at(0x46000000u + PART_OFF + SIG + 30u * 4u), 0, 3); mc_stale = 1; modwerk_machine_map_refresh();
    CHECK(!modwerk_machine_absent(0, &m, name) && !modwerk_machine_track_absent(4, &m, name)); /* named nowhere now */
    /* A project load with lines: the map takes them (a repeat once); one without keeps the map; a failed one too. */
    const uint8_t pl[2] = {'P', 'L'};
    modwerk_machine_map_begin(); modwerk_machine_map_stage(pl, 1, 1, 0x9fa85eefu, "POLY8"); modwerk_machine_map_stage(pl, 1, 1, 0x9fa85eefu, "AGAIN");
    modwerk_machine_map_loaded(1);
    CHECK(host_mc_map.e[0].module == 0x9fa85eefu && !strcmp(host_mc_map.e[0].name, "POLY8") && !host_mc_map.e[1].module);
    memcpy(host_at(0x46000000u + PART_OFF + SIG + 30u * 6u), "PL\1", 3); mc_stale = 1; modwerk_machine_map_refresh(); /* T7 signed POLY8, none installed */
    CHECK(modwerk_machine_absent(0, &m, name) && m == 0x9fa85eefu && modwerk_machine_track_absent(6, &m, name));
    CHECK(modwerk_machine_where(0, &b, &p, &t) == 1 && t == 6);
    CHECK(modwerk_machine_where_module(0x9fa85eefu, &b, &p, &t) == 1 && t == 6 && !modwerk_machine_where_module(0x1234u, &b, &p, &t));
    memcpy(host_at(0x46000000u + 0x9504au + 2u * 6322u + SIG + 30u * 5u), "PL\1", 3); /* also in a saved Part 3's T6 */
    bank[0x9504au + 2u * 6322u + 0x22 + 5] = 1;
    memset(host_at(0x46000000u + PART_OFF + SIG + 30u * 6u), 0, 3); mc_stale = 1; modwerk_machine_map_refresh();
    CHECK(modwerk_machine_absent(0, &m, name) && modwerk_machine_where(0, &b, &p, &t) == 2 && p == 2 && t == 5);
    modwerk_machine_map_begin(); modwerk_machine_map_loaded(1); CHECK(host_mc_map.e[0].module == 0x9fa85eefu);
    modwerk_machine_map_begin(); modwerk_machine_map_stage(pl, 1, 1, 0x1234u, "OTHER"); modwerk_machine_map_loaded(0);
    CHECK(host_mc_map.e[0].module == 0x9fa85eefu);
    /* Damage: the whole check gives an empty map. */
    host_mc_map.e[0].name[0] ^= 1; mc_valid(); CHECK(!host_mc_map.e[0].module && host_mc_map.magic == MC_MAGIC);
    /* A machine installed while the project already names it: noted when the installed set changes. */
    memcpy(host_at(0x46000000u + PART_OFF + SIG + 30u * 4u), "AB\1", 3); rows(a_only, 1, 0, 0); ++owner_epoch; modwerk_machine_map_refresh();
    CHECK(host_mc_map.e[0].module == 'A' && !modwerk_machine_absent(0, &m, name));
    rows(0, 0, 0, 0);
    memcpy(bank, bank_copy, sizeof bank), memcpy(sram, sram_copy, sizeof sram);
}
/* Machines that rest (machine_registry.c, HOOKS.md): a machine's module no track of the project uses rests after two
 * scans and costs the frame nothing; it wakes before its pick commits, at the next tick when a track names it without a
 * pick (a paste, a load, a pattern while playing), and after any set change until two scans of the new set. */
static void clear_sigs(void)
{
    for (unsigned p = 0; p < 4u; ++p)
        for (unsigned t = 0; t < 8u; ++t) {
            memset(host_at(0x46000000u + PART_OFF + p * PART_STRIDE + SIG + 30u * t), 0, 3);
            memset(host_at(0x46000000u + SAVED_OFF + p * PART_STRIDE + SIG + 30u * t), 0, 3);
            *host_at(0x46000000u + PART_OFF + p * PART_STRIDE + 0x22 + t) = 1;
            *host_at(0x46000000u + SAVED_OFF + p * PART_STRIDE + 0x22 + t) = 1;
        }
}
/* The brake: a frame interrupt fallen two frames behind silences every module machine track, as one past the CPU budget
 * renders, until STOP or a Part change (owner's MKII, 22 November 2026: past about 135 % the unit hung, twice). */
/* The adaptive reserve's input: the most tracks that trig on one step of any of the bank's 16 patterns (each track
 * record's first eight bytes, the last eight steps first). */
static void check_busiest_step(void)
{
    uint8_t *base = (uint8_t *)AT(U32(BANK)), most[2], tracks[2]; uint16_t id[2];
    playing[5] = playing[7] = 2u, playing[6] = playing[8] = 0;                                   /* C01, nothing queued */
    CHECK(modwerk_machine_pattern_trigs(most, tracks, id) == 1u && !most[0] && !tracks[0]);
    for (unsigned t = 0; t < 5u; ++t) base[PATTERN_TRACK * t + 7u] |= 1u;                      /* pattern 1, step 1 */
    for (unsigned t = 0; t < 8u; ++t) base[PATTERN_STRIDE + PATTERN_TRACK * t + 7u] |= (uint8_t)(1u << t); /* pattern 2: Tn on step n */
    CHECK(modwerk_machine_pattern_trigs(most, tracks, id) == 1u && most[0] == 5u && tracks[0] == 5u);
    playing[8] = 1u;                                                                             /* C02 queued */
    CHECK(modwerk_machine_pattern_trigs(most, tracks, id) == 2u && most[0] == 5u && most[1] == 1u && tracks[1] == 8u && id[0] == 32u && id[1] == 33u);
    CHECK(modwerk_machine_trigging() == 0x1fu);                                                   /* C01: T1-T5 trig */
    playing[7] = 3u;                                                                             /* queued in bank D */
    CHECK(modwerk_machine_pattern_trigs(most, tracks, id) == 1u && most[0] == 5u);
    playing[6] = 1u, playing[7] = 2u;                                                            /* C02 plays */
    CHECK(modwerk_machine_pattern_trigs(most, tracks, id) == 1u && most[0] == 1u && tracks[0] == 8u && modwerk_machine_pattern() == 33u);
    playing[6] = playing[8] = 40u;                                                               /* no pattern: the safe side */
    CHECK(modwerk_machine_pattern_trigs(most, tracks, id) == 1u && most[0] == 8u && tracks[0] == 8u);
    for (unsigned t = 0; t < 8u; ++t) base[PATTERN_TRACK * t + 7u] &= (uint8_t)~1u, base[PATTERN_STRIDE + PATTERN_TRACK * t + 7u] = 0;
    /* The counts from each mask byte read once equal a step-by-step count (the earlier code's), on random patterns with
     * every density, the first and last step of each half included. */
    playing[5] = playing[7] = 2u, playing[6] = 0, playing[8] = 0;
    uint32_t seed = 0x2468aceu;
    for (unsigned run = 0; run < 2000u; ++run) {
        unsigned density = run % 9u;
        for (unsigned t = 0; t < 8u; ++t)
            for (unsigned b = 0; b < 8u; ++b) {
                uint8_t v = 0;
                for (unsigned bit = 0; bit < 8u; ++bit) seed = seed * 1103515245u + 12345u, v |= (uint8_t)(((seed >> 16) % 8u < density) << bit);
                base[PATTERN_TRACK * t + b] = v;
            }
        unsigned want_top = 0, want_any = 0;
        for (unsigned s = 0; s < 64u; ++s) {
            unsigned n = 0;
            for (unsigned t = 0; t < 8u; ++t) { unsigned on = base[PATTERN_TRACK * t + 7u - s / 8u] >> (s % 8u) & 1u; n += on, want_any |= on << t; }
            if (n > want_top) want_top = n;
        }
        unsigned want_tracks = 0;
        for (; want_any; want_any &= want_any - 1u) ++want_tracks;
        CHECK(modwerk_machine_pattern_trigs(most, tracks, id) == 1u && most[0] == want_top && tracks[0] == want_tracks);
    }
    for (unsigned t = 0; t < 8u; ++t) for (unsigned b = 0; b < 8u; ++b) base[PATTERN_TRACK * t + b] = 0;
    memset(playing, 0, sizeof playing);
}
/* The reserve books each installed module's cost at rest, whether or not a track or slot uses it. */
static void check_rest_booked(void)
{
    CHECK(!modwerk_machine_rest_booked());
    engine_installed = 1, engine_module.id = 'L', owner_epoch += 2u; /* an install moves the owner epoch */
    CHECK(!modwerk_machine_rest_booked());                 /* not in the table: nothing */
    costs_listed = 1;                                      /* another cost table: booked again */
    CHECK(modwerk_machine_rest_booked() == 15u);
    CHECK(modwerk_machine_rest_booked() == 15u);           /* kept */
    costs_listed = 0, engine_installed = 0, engine_module.id = 0, owner_epoch += 2u;
    CHECK(!modwerk_machine_rest_booked());
}
static void check_brake(void)
{
    const void *one[] = {&A};
    clear_sigs(); misc[0x0f] = 0; /* Part 1 */
    fresh(); a_admit = 1; cpu_now = 0; mw_cpu_allowance = 45; mw_cpu_refused = 0;
    rows(one, 1, 0, 0); mw_ui_tick();
    CHECK(mw_assign(part0(), 2, 5) == 1);
    mw_ui_tick();
    int a0 = a_renders; CHECK(later(2) == a0 + 1);
    uint32_t brakes = mw_frame_brakes;
    frame(0, FRAME / 2u * 3u, 0), frame(0, FRAME / 2u * 3u, 0), frame(0, FRAME / 2u * 3u, 0), frame(0, FRAME / 2u * 3u, 0);
    CHECK(!mw_frame_brake);                                              /* two frames behind: not past it yet */
    frame(0, FRAME / 2u * 3u, 0);
    CHECK(mw_frame_brake && mw_frame_brakes == brakes + 1u);
    a0 = a_renders; later(2); CHECK(a_renders == a0);                   /* the module's track renders silence */
    mw_ui_tick(); CHECK(mw_frame_brake);                                 /* the same Part, still playing */
    frame(0, FRAME / 2u * 3u, 0); CHECK(mw_frame_brakes == brakes + 1u); /* braked once */
    for (unsigned k = 0; k < 8u; ++k) frame(0, 0, 0);                    /* short frames: it catches up */
    test_stopped = 1; mw_ui_tick(); test_stopped = 0;
    CHECK(!mw_frame_brake);                                              /* STOP releases it */
    a0 = a_renders; frame(2, 0, 0), frame(2, 0, 0), frame(2, 0, 0);
    CHECK(a_renders > a0);                                               /* renders again (the guard re-times it first) */
    /* The predicted brake: on a pattern status.c names (C01 here), the module's track renders silence from the first
     * frame; on any other, it renders. */
    playing[5] = 2u, playing[6] = 0;
    test_hush = 32u << 24 | 1u << 2 << 16, mw_ui_tick();                /* C01: T3 silent */
    a0 = a_renders; frame(2, 0, 0), frame(2, 0, 0); CHECK(a_renders == a0 && mw_hush == test_hush);
    test_hush = 32u << 24 | 1u << 3 << 16, mw_ui_tick();                /* C01: only T4 */
    a0 = a_renders; frame(2, 0, 0); CHECK(a_renders > a0);
    test_hush = 32u << 24 | 1u << 2 << 16, mw_ui_tick();
    playing[6] = 1u;                                                     /* C02 plays */
    a0 = a_renders; frame(2, 0, 0); CHECK(a_renders > a0);
    test_hush = 0, mw_ui_tick(); memset(playing, 0, sizeof playing);
    /* The ceiling: a render that would end the frame past 122 % does not run, however much credit there is; the next
     * frame under it renders it again. */
    for (unsigned k = 0; k < 4u; ++k) frame(0, 0, 0);                    /* full credit */
    { uint32_t sheds = mw_frame_sheds; a0 = a_renders;
      frame(2, FRAME_CEILING + 1u, 0);
      CHECK(a_renders == a0 && mw_frame_sheds == sheds + 1u);
      frame(2, FRAME / 4u, 0), frame(2, FRAME / 4u, 0);
      CHECK(a_renders > a0); }
    CHECK(mw_assign(part0(), 2, 1) == 1);
}
static void check_resting_machines(void)
{
    static const struct modwerk_machine Q = {MODWERK_MACHINE_ABI, {'Q', '8'}, 1, 1, "POLY", 0, 0, a_defaults,
                                             0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, {0}}; /* renders inside stock's */
    extern volatile uint32_t mw_wake_mille;
    const void *aq[] = {&A, &Q};
    clear_sigs(); misc[0x0f] = 0; /* Part 1 */
    fresh(); a_admit = 1; cpu_now = 0; mw_cpu_allowance = 45; mw_cpu_refused = 0;
    rows(0, 0, 0, 0);
    int flex0 = stock_renders, a0 = a_renders;
    for (unsigned t = 0; t < 8u; ++t) CHECK(later(t) == -7);
    int flex_none = stock_renders - flex0; CHECK(flex_none == 8 && a_renders == a0);

    /* Installed, used nowhere: awake until two scans of the new set have found no track on them, then resting. */
    judged_n = 2; judge(0, &A); judge(1, &Q); model_rests = 1;
    rows(aq, 2, 0, 0); ++owner_epoch;
    mw_ui_tick(); CHECK(!resting(0) && !resting(1));                     /* a new set: not scanned yet */
    scan_tick(); CHECK(!resting(0) && !resting(1));                      /* one idle scan */
    scan_tick(); CHECK(resting(0) && resting(1) && asleep_n == 2);       /* two: both rest */
    /* Resting, they cost the frame what no machine costs: every unowned FLEX track straight to stock's render. */
    flex0 = stock_renders, a0 = a_renders;
    for (unsigned t = 0; t < 8u; ++t) CHECK(later(t) == -7);
    CHECK(stock_renders - flex0 == flex_none && a_renders == a0);
    for (unsigned t = 0; t < 8u; ++t) CHECK(!wake_who[t]);
    scan_tick(); CHECK(resting(0) && resting(1) && !pick_who);           /* stays so */

    /* A pick wakes its module before it commits; the other stays at rest. */
    unsigned polls = rest_polls;
    CHECK(mw_assign(part0(), 2, 5) == 1 && rest_polls == polls + 1u && !resting(0) && resting(1) && pick_who == &A);
    a0 = a_renders; CHECK(later(2) == a0 + 1);                           /* A renders its own track at once */
    scan_tick(); CHECK(!resting(0) && resting(1) && !pick_who);          /* the scan finds it used */
    scan_tick(); scan_tick(); CHECK(!resting(0) && resting(1));

    /* A busy unit: a pick that would wake a module is judged with its hooks back on top (mw_wake_mille). */
    { unsigned boxes = hot_boxes;
      cpu_now = hot_line - 10u * CPU_DEFAULT - mw_wake_mille;
      CHECK(mw_assign(part0(), 3, 6) == (unsigned)-1 && hot_boxes == boxes + 1 && resting(1) && !pick_who);
      CHECK(hot_box_add == 10u * CPU_DEFAULT + mw_wake_mille);
      cpu_now = hot_line - 10u * CPU_DEFAULT - mw_wake_mille - 1u;
      CHECK(mw_assign(part0(), 3, 6) == 1 && hot_boxes == boxes + 1 && !resting(1));
      CHECK(mw_assign(part0(), 3, 1) == 1); cpu_now = 0; }               /* back to FLEX */

    /* The last track leaves: two scans later it rests again. */
    CHECK(mw_assign(part0(), 2, 1) == 1);
    scan_tick(); CHECK(!resting(0));
    scan_tick(); CHECK(resting(0) && resting(1));

    /* A track that names a resting machine without a pick (a paste, a Part or bank change while playing, a load):
     * stock's silent source and no START until the next tick wakes it; then the machine plays it. */
    memcpy((void *)(part0() + SIG + 30u * 4u), "AB\1", 3);
    stock_voices[4 * 168] = 1;
    { int silent = silent_renders; a0 = a_renders;
      CHECK(later(4) == -9 && silent_renders == silent + 1 && a_renders == a0 && stock_voices[4 * 168] == 0 && wake_who[4] == &A);
      unsigned calls = fallback_calls;
      CHECK(mw_source_start_select(4, fallback_start) != fallback_start && !selected_start(4, 127, 0xc0, fallback_start) && fallback_calls == calls);
      mw_ui_tick(); CHECK(!resting(0) && resting(1));                    /* one tick */
      CHECK(later(4) == a0 + 1);
      scan_tick(); CHECK(!resting(0) && !wake_who[4]);                   /* the scan finds it: awake while it is used */
    }
    memset((void *)(part0() + SIG + 30u * 4u), 0, 3);
    /* A saved copy alone keeps it awake (RELOAD brings it back), and so does another Part (a pattern change). */
    memcpy(host_at(0x46000000u + SAVED_OFF + 2u * PART_STRIDE + SIG + 30u * 6u), "AB\1", 3);
    scan_tick(); scan_tick(); scan_tick(); CHECK(!resting(0));
    memset(host_at(0x46000000u + SAVED_OFF + 2u * PART_STRIDE + SIG + 30u * 6u), 0, 3);
    memcpy(host_at(0x46000000u + PART_OFF + 3u * PART_STRIDE + SIG + 30u * 1u), "Q8\1", 3);
    scan_tick(); CHECK(!resting(1));                                     /* Q woken by the scan, before any frame */
    memset(host_at(0x46000000u + PART_OFF + 3u * PART_STRIDE + SIG + 30u * 1u), 0, 3);
    scan_tick(); scan_tick(); CHECK(resting(0) && resting(1));
    /* A project load: scans while it runs count no idle scan, so a machine used before it does not rest on a
     * half-written bank; it still wakes for what the scans see used. */
    memcpy((void *)(part0() + SIG + 30u * 5u), "AB\1", 3);
    scan_tick(); CHECK(!resting(0));
    memset((void *)(part0() + SIG + 30u * 5u), 0, 3); project_loading = 1;
    scan_tick(); scan_tick(); scan_tick(); CHECK(!resting(0) && resting(1));
    project_loading = 0; scan_tick(); CHECK(!resting(0)); scan_tick(); CHECK(resting(0));

    /* A set change (install, removal, Undo or a rolled-back trial) wakes every machine until two scans of the new set;
     * a module that registers late is awake until then too. A RENDER_FLEX machine never rests. */
    judged_n = 3; judge(2, &F);
    const void *aqf[] = {&A, &Q, &F};
    rows(aqf, 3, 0, 0); ++owner_epoch;                                   /* F's position switched; A and Q still rest */
    CHECK(asleep_n == 2);
    mw_ui_tick(); CHECK(!resting(0) && !resting(1) && !resting(2) && !asleep_n);
    scan_tick(); CHECK(!resting(0) && !resting(1) && !resting(2));
    scan_tick(); CHECK(resting(0) && resting(1) && !resting(2));
    /* Removed while resting (Undo of the trial that brought it): no resting machine left in the frame's list. */
    rows(aq, 2, 0, 0); ++owner_epoch; judged_n = 2;
    CHECK(asleep_n == 2);
    const void *q_only[] = {&Q};
    resting_rec[0] = 0; rows(q_only, 1, 0, 0); ++owner_epoch;
    CHECK(asleep_n == 1 && asleep_who[0] == &Q);
    mw_ui_tick(); CHECK(!resting(1));                                    /* the set changed: Q awake again */

    /* An effect module (DSP code, no machine): in use while any slot of the project names its id or a live slot runs
     * it; it rests after two idle scans, wakes within a tick of a slot running it, and at once for a pick. */
    rows(0, 0, 0, 0); judged_n = 1; memset(&judged_mod[0], 0, sizeof judged_mod[0]);
    judged_mod[0].id = 705u, judged_mod[0].dsp.count = 64u, judged_mod[0].dsp.id = 9u, resting_rec[0] = 0;  /* its handle is 5 */
    memset(live_fx, 0, sizeof live_fx); project_fx = 0; ++owner_epoch;
    mw_ui_tick(); CHECK(!resting(0));                                    /* a new set: awake until scanned */
    scan_tick(); CHECK(!resting(0));
    scan_tick(); CHECK(resting(0));                                      /* two idle scans: rests */
    live_fx[11] = 5; mw_ui_tick(); CHECK(!resting(0));                   /* T4 FX2 runs it (a paste, a load): one tick */
    live_fx[11] = 0; project_fx = 1u << 5; scan_tick(); CHECK(!resting(0)); /* another Part names it */
    scan_tick(); scan_tick(); CHECK(!resting(0));
    project_fx = 0; scan_tick(); CHECK(!resting(0)); scan_tick(); CHECK(resting(0));
    project_loading = 1; project_fx = 0; scan_tick(); CHECK(resting(0)); project_loading = 0;
    modwerk_machine_effect_wake(5); CHECK(!resting(0) && fx_wanted == 5); /* a pick: awake before stock writes it */
    scan_tick(); scan_tick(); CHECK(resting(0) && fx_wanted < 0);        /* the pick never landed: rests again */
    project_fx = 1u << 9; live_fx[0] = 9; scan_tick(); CHECK(resting(0)); /* another id: not this module */
    live_fx[0] = 0; project_fx = 0;

    model_rests = 0; judged_n = 0; rows(0, 0, 0, 0); clear_sigs();
    CHECK(!asleep_n && !masked);
}
/* The late-entry wait (machine_registry.c) against a model of the timer: a read costs TICK counts, so a wait ends
 * within one TICK of its time. It shows the decision and the wait's length; that an entry in the window stops the
 * DSP's frame exchange, and that one LATE_HI late makes the DSP skip a frame, are measurements on a unit, not this
 * test's. */
#define US 132u
#define TICK 12u
static uint32_t entered;
static void late_fresh(uint32_t at)
{
    entry_at = entry_late = wait_run = 0, entered = at, host_tick = TICK;
    mw_late_max = mw_late_hits = mw_late_waits = mw_late_wait_max = 0, mw_late_wait_on = 1;
}
/* The frame interrupt enters `interval` counts after its last entry: whether it waited. An entry that did leaves
 * LATE_HI late; one that did not leaves at once; either way the frame's stamp is taken as it leaves. */
static unsigned entry(uint32_t interval)
{
    uint32_t waits = mw_late_waits, longest = mw_late_wait_max;
    host_timer = entered += interval;
    mw_frame_enter();
    uint32_t kept = mw_frame_t0 - entered;
    CHECK(mw_frame_t0 == host_timer - TICK && entry_at == entered && mw_late_waits - waits <= 1u);
    if (mw_late_waits == waits) { CHECK(!kept && mw_late_wait_max == longest); return 0; }
    CHECK(entry_late + kept >= LATE_HI && entry_late + kept < LATE_HI + TICK && kept <= LATE_HI - LATE_LO);
    CHECK(mw_late_wait_max == (kept > longest ? kept : longest));
    return 1;
}
/* A quiet start, an entry on the grid, then one `us` µs late: whether that one waited. */
static unsigned late_by(uint32_t us)
{
    late_fresh(5000000u);
    CHECK(!entry(FRAME) && !entry(FRAME) && !entry_late);
    return entry(FRAME + us * US);
}
static uint32_t deadline_seen; static unsigned deadline_calls;
static unsigned deadline_rest;
static unsigned take_deadline(uint32_t deadline, unsigned rest) { deadline_seen = deadline, deadline_rest = rest, ++deadline_calls; return 0; }
static void check_late_entry(void)
{
    /* On the grid nothing waits and nothing counts as late; the first entry after the start is on time. */
    late_fresh(5000000u);
    for (unsigned i = 0; i < 6u; ++i) CHECK(!entry(FRAME));
    CHECK(!mw_late_max && !mw_late_hits && !mw_late_waits && !mw_late_wait_max);
    /* Below the window (70, 75 and 80 µs) and past it (190, 195, 200 and 250 µs) an entry goes straight on. The
     * lateness is 0.5 µs under the interval's excess: GRID. */
    static const uint16_t outside[] = {1, 60, 70, 75, 80, 191, 195, 200, 250, 340};
    for (unsigned i = 0; i < sizeof outside / sizeof *outside; ++i) {
        uint32_t over = mw_late_over;
        CHECK(!late_by(outside[i]) && entry_late == outside[i] * US - 66u && mw_late_max == entry_late);
        CHECK(!mw_late_hits && !mw_late_waits);
        /* Past the window it is counted since boot (octabam's two such entries, 205 and 209 µs, both stalled); below, not. */
        CHECK(mw_late_over - over == (outside[i] > 190u ? 1u : 0u));
    }
    CHECK(!late_by(75) && !entry(FRAME - 75u * US) && !entry_late && !entry(FRAME));
    /* In it (81 µs; stall 56's entry, under 110 µs by this clock; the two logged stalls' 149 and 155 µs; 189 µs) it waits
     * until it is 190 µs late: 110 µs at most. */
    static const uint16_t inside[] = {81, 105, 111, 120, 149, 155, 189, 190};
    for (unsigned i = 0; i < sizeof inside / sizeof *inside; ++i) {
        uint32_t over = mw_late_over;
        CHECK(late_by(inside[i]) && entry_late == inside[i] * US - 66u && mw_late_max == entry_late);
        CHECK(mw_late_hits == 1u && mw_late_waits == 1u && mw_late_wait_max >= LATE_HI - entry_late && mw_late_over == over);
    }
    /* A held entry's next one, two frames on, is on the grid: not counted. One past the window after a skipped frame
     * (two frames and 250 µs) is; four frames or more without an entry start again at 0 and are not. */
    { uint32_t over = mw_late_over;
      CHECK(late_by(149) && !entry(2u * FRAME - 149u * US) && mw_late_over == over);
      late_fresh(5000000u);
      CHECK(!entry(FRAME) && !entry(2u * FRAME + 250u * US) && mw_late_over == over + 1u);
      CHECK(!entry(5u * FRAME + 250u * US) && !entry_late && mw_late_over == over + 1u);
      /* Switched off, the wait counts the window's entries as before and still only later ones as past it. */
      late_fresh(5000000u); mw_late_wait_on = 0;
      CHECK(!entry(FRAME) && !entry(FRAME + 149u * US) && mw_late_over == over + 1u);
      late_fresh(5000000u); }
    /* The DSP skips the frame after a waited entry: the next comes two frames less the lateness later, on the grid. */
    CHECK(late_by(149) && !entry(2u * FRAME - 149u * US) && !entry_late && !entry(FRAME) && mw_late_waits == 1u);
    /* A chain of held entries, each frame ending in the window again: WAIT_RUN in a row brake the module machines. */
    { uint32_t brakes = mw_frame_brakes;
      late_fresh(5000000u); mw_frame_brake = 0;
      CHECK(!entry(FRAME) && entry(FRAME + 149u * US));
      for (unsigned i = 2; i < WAIT_RUN; ++i) CHECK(entry(GRID));
      CHECK(!mw_frame_brake && entry(GRID) && mw_frame_brake && mw_frame_brakes == brakes + 1u);
      mw_frame_brake = 0;
      late_fresh(5000000u);
      CHECK(!entry(FRAME) && entry(FRAME + 149u * US) && !entry(2u * FRAME - 149u * US) && !wait_run && !mw_frame_brake); }
    /* Lateness carries from one entry to the next: 60 µs twice is 120 µs. A frame that came early takes it back. */
    late_fresh(5000000u);
    CHECK(!entry(FRAME) && !entry(FRAME + 60u * US) && entry(FRAME + 60u * US) && entry_late == 120u * US - 132u);
    CHECK(mw_late_ring[(mw_late_count - 1u) & 7u] == entry_late && !mw_late_ring[(mw_late_count - 3u) & 7u]); /* kept for a stall */
    late_fresh(5000000u);
    CHECK(!entry(FRAME) && !entry(FRAME + 60u * US) && !entry(FRAME - 60u * US) && !entry(FRAME + 60u * US));
    /* It is taken modulo a frame (three frames and 150 µs: the DSP skipped two), and four frames or more without an
     * entry start it again at 0, whatever it was. */
    late_fresh(5000000u);
    CHECK(!entry(FRAME) && entry(3u * FRAME + 150u * US) && entry_late == 150u * US + 2u * FRAME - 2u * GRID - 66u);
    late_fresh(5000000u);
    CHECK(!entry(FRAME) && !entry(5u * FRAME + 150u * US) && !entry_late && !entry(FRAME));
    late_fresh(5000000u);
    CHECK(!entry(FRAME) && !entry(FRAME + 70u * US) && entry_late && !entry(IDLE) && !entry_late && !mw_late_hits);
    /* After a skipped frame the sum is a frame less 0.5 µs: it counts as that frame. Left standing it decays 0.5 µs a
     * frame into the window, and about 150 entries on the grid wait:
     * 800 entries after a waited entry and its skipped frame, and after one 250 µs late and its skipped frame. */
    late_fresh(5000000u);
    CHECK(!entry(FRAME) && entry(FRAME + 149u * US) && !entry(2u * FRAME - 149u * US) && !entry_late);
    for (unsigned i = 0; i < 800u; ++i) CHECK(!entry(FRAME));
    CHECK(mw_late_waits == 1u && mw_late_hits == 1u && mw_late_max == 149u * US - 66u);
    late_fresh(5000000u);
    CHECK(!entry(FRAME) && !entry(FRAME + 250u * US) && !entry(2u * FRAME - 250u * US) && !entry_late);
    for (unsigned i = 0; i < 800u; ++i) CHECK(!entry(FRAME));
    CHECK(!mw_late_waits && !mw_late_hits && mw_late_max == 250u * US - 66u);
    /* The same with the unit's frame a little off the nominal one, either way: no entry on its grid waits. */
    for (uint32_t off = 0; off < 3u; ++off) {
        late_fresh(5000000u);
        CHECK(!entry(FRAME) && entry(FRAME + 149u * US) && !entry(2u * (FRAME + off - 1u) - 149u * US));
        for (unsigned i = 0; i < 800u; ++i) CHECK(!entry(FRAME + off - 1u));
        CHECK(mw_late_waits == 1u);
    }
    /* The 32-bit timer wraps every 32.5 s: across it the intervals, the decision and a wait that spans it hold. */
    late_fresh(0u - 3u * FRAME);
    CHECK(!entry(FRAME) && !entry(FRAME) && entered == 0u - FRAME && !entry(FRAME + 70u * US) && entered < FRAME);
    CHECK(!entry(FRAME - 70u * US) && !entry_late && !mw_late_hits);
    late_fresh(0u - 2u * FRAME - 149u * US - 40u * US);
    CHECK(!entry(FRAME) && entry(FRAME + 149u * US) && entered == 0u - 40u * US && mw_frame_t0 < 2u * US);
    CHECK(!entry(2u * FRAME - 149u * US) && !entry(FRAME) && mw_late_waits == 1u);
    /* Switched off (development bases) it counts the entry and does not wait; the lateness is kept the same way. */
    CHECK(late_by(149) && mw_late_hits == 1u);
    late_fresh(5000000u); mw_late_wait_on = 0;
    CHECK(!entry(FRAME) && !entry(FRAME + 149u * US) && entry_late == 149u * US - 66u && mw_late_max == entry_late);
    CHECK(mw_late_hits == 1u && !mw_late_waits && !mw_late_wait_max && !entry(2u * FRAME - 149u * US) && !entry_late);
    /* The budget times the frame from the wait's end: a waited frame is charged what it ran, not the wait. */
    fresh(); CHECK(late_by(149));
    host_timer += 30000u; mw_frame_exit();
    CHECK(mw_frame_last == 30000u + TICK && mw_frame_max == mw_frame_last && !mw_frame_late_max);
    /* ev_frame_deadline: each entry tells its subscribers by when work at IPL 5 must end, the next frame's grid time
     * 80 µs late less a 20 µs margin; a late entry's grid time is its arrival less its lateness. */
    deadline_row[0] = (uintptr_t)take_deadline, deadline_calls = 0;
    late_fresh(7000000u);
    CHECK(!entry(FRAME) && deadline_calls == 1u && deadline_seen == entered + GRID + 7920u);
    CHECK(!late_by(60) && deadline_calls == 4u && deadline_seen == entered - entry_late + GRID + 7920u && !deadline_rest);
    /* On a pattern the predicted brake names, its row's subscriber is told to bypass dry, from that frame; on another,
     * not. */
    playing[5] = 2u, playing[6] = 0, mw_hush_fx[1] = 32u << 24 | 1u;    /* C01 queued: row 0 */
    CHECK(!entry(FRAME) && deadline_rest == 1u);
    playing[6] = 1u;
    CHECK(!entry(FRAME) && !deadline_rest);
    mw_hush_fx[1] = 0, memset(playing, 0, sizeof playing);
    deadline_row[0] = 0;
    fresh(); late_fresh(0); host_tick = 0;
}
int main(void)
{
    put_u32(0x46c82456u, 0x46000000u);
    for (unsigned r = 0; r < 5; ++r) put_u32(0x400a78c8u + 4 * r, 0x1000u + r), put_u32(0x400d5f38u + 4 * r, 0x2000u + r);
    for (unsigned r = 0; r < 3; ++r) put_u32(0x400b27d0u + 4 * r, 0x3000u + r);
    memset(stockdef, 0x40, sizeof stockdef);
    for (unsigned t = 0; t < 8; ++t) part0()[0x22 + t] = 1; /* FLEX */

    /* No machine: stock rows, stock counts, stock renders, stock names. */
    rows(0, 0, 0, 0);
    CHECK(counts_now() == (5u << 24 | 5u << 16 | 4u << 8 | 3u) && clamp_now() == 5);
    CHECK((uintptr_t)mw_name(5) == 0x1001u && mw_type(1, slot(2)) == 1 && mw_assign(part0(), 2, 1) == 1);
    CHECK(mw_source_render_impl(2, 0, 0, 1) == -7 && stock_renders == 1);

    /* Eight machines fill rows 5-12, the last row the cursor reaches; a ninth in the table is not read (ROWS 13). */
    static const char *const many_names[9] = {"M1", "M2", "M3", "M4", "M5", "M6", "M7", "M8", "M9"};
    static struct modwerk_machine many[9]; const void *many_rows[9];
    for (unsigned i = 0; i < 9; ++i)
        many[i] = (struct modwerk_machine){.abi = MODWERK_MACHINE_ABI, .sig = {'M', (uint8_t)('1' + i)}, .sig_lo = 1, .sig_hi = 1,
                                           .label = many_names[i]}, many_rows[i] = &many[i];
    rows(many_rows, 9, 0, 0);
    CHECK(counts_now() == (13u << 24 | 13u << 16 | 12u << 8 | 3u) && clamp_now() == 12);
    CHECK(!strcmp(mw_name(5), "M1") && !strcmp(mw_name(12), "M8") && (uintptr_t)mw_name(13) == 0x1001u);

    /* A, V, F in row order 5, 6, 7: counts follow, names and pages by row. */
    const void *avf[] = {&A, &V, &F};
    rows(avf, 3, 0, 0);
    CHECK(counts_now() == (8u << 24 | 8u << 16 | 7u << 8 | 3u));
    /* The cursor reaches the last row, 4+n (row 7 with three machines). */
    CHECK(clamp_now() == 7);
    CHECK(!strcmp(mw_name(5), "ANALOG BD") && !strcmp(mw_name(6), "VECTOR") && !strcmp(mw_name(7), "FM SYNTH") && (uintptr_t)mw_name(8) == 0x1001u);
    /* Assign: admission first, defaults and signature in the Part and its SRAM mirror; a refusal changes nothing. */
    a_admit = 0; CHECK(mw_assign(part0(), 2, 5) == (unsigned)-1 && part0()[60 + 60] == 0);
    uint32_t mods[4];
    CHECK(modwerk_machine_bank_modules(mods, 4) == 0);
    a_admit = 1; CHECK(mw_assign(part0(), 2, 5) == 1);
    /* The bank's Parts sign a track for A: its module's engine is used (controller_board.c), a saved Part's too. */
    CHECK(modwerk_machine_bank_modules(mods, 4) == 1 && mods[0] == 'A');
    memcpy(host_at(0x46000000u + 0x9504au + 2u * 6322u + SIG + 30u * 5u), "FM\1", 3);
    bank[0x9504au + 2u * 6322u + 0x22 + 5] = 1;
    CHECK(modwerk_machine_bank_modules(mods, 4) == 2 && mods[0] == 'A' && mods[1] == 'F');
    memset(host_at(0x46000000u + 0x9504au + 2u * 6322u + SIG + 30u * 5u), 0, 3);
    CHECK(part0()[60 + 60] == 'A' && part0()[61 + 60] == 'B' && part0()[62 + 60] == 1 && sram[60 + 60] == 'A');
    CHECK(part0()[0x2a + 60 + 6] == 1 && part0()[0x1da + 60 + 11] == 12 && sram[0x1da + 60 + 11] == 12);
    CHECK(mw_type(1, slot(2)) == 5 && mw_type(3, slot(2)) == 3 && mw_type(1, slot(3)) == 1);
    misc[0x0c] = 2; /* current track 3 */
    CHECK(mw_page(slot(2)) == 0x1234u && mw_page(slot(3)) == 0);
    /* SRC SETUP encoder E edits only a SETUP_ALL machine's slot (Analog BD at row 5, not VECTOR at 6 or a stock row). */
    CHECK(mw_row_setup_all(5) && !mw_row_setup_all(6) && !mw_row_setup_all(4));
    /* Its own assign signs and unsigns the track; leaving A tells A. */
    CHECK(mw_assign(part0(), 2, 6) == 1 && part0()[60 + 60] == 'S' && left == 3 && mw_type(1, slot(2)) == 6);
    CHECK(mw_assign(part0(), 2, 1) == 1 && part0()[60 + 60] == 0 && mw_type(1, slot(2)) == 1);
    /* F on track 3 and A on track 2: renders route to their machine; an unowned track goes to RENDER_FLEX F. */
    CHECK(mw_assign(part0(), 3, 7) == 1 && mw_assign(part0(), 2, 5) == 1);
    CHECK(mw_source_render_impl(2, 0, 0, 1) == 1 && mw_source_render_impl(3, 0, 0, 1) == 101 && mw_source_render_impl(4, 0, 0, 1) == 102);
    /* The track window's column: F (LIST in this fixture) opens on the machine list, A and a stock FLEX track on the pool,
     * a stock non-sample type on the list. */
    *(uint8_t *)host_at(0x100b14ccu) = 3; CHECK(mw_window_column(slot(3)) == 0);
    *(uint8_t *)host_at(0x100b14ccu) = 2; CHECK(mw_window_column(slot(2)) == 1);
    *(uint8_t *)host_at(0x100b14ccu) = 4; CHECK(mw_window_column(slot(4)) == 1);
    { const Part thru = 2; CHECK(mw_window_column(&thru) == 0); }
    *(uint8_t *)host_at(0x100b14ccu) = 0;
    /* The validator: F's and A's tracks keep their 12 bytes away from stock's; V wraps it once; all restored. */
    unsigned before = part0()[0x2a + 90 + 6];
    int result = mw_validate(part0());
    CHECK(result == 12 && v_wraps == 1 && stock_validations == 1 && seen[0] == 0x40 && seen[11] == 0x40 && part0()[0x2a + 90 + 6] == before);

    /* A leaves: its tracks read as stock (their bytes kept), its row goes, F takes unowned tracks' renders. A's track
     * holds A's bytes, not FLEX's: a known PROTECT signature without its machine renders stock's silent source. */
    const void *vf[] = {&V, &F};
    rows(vf, 2, 0, 0);
    CHECK(counts_now() == (7u << 24 | 7u << 16 | 6u << 8 | 3u) && part0()[60 + 60] == 'A' && clamp_now() == 6);
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
    CHECK(box_calls >= 1 && box_track == 4 && box_label == E.label);        /* the refusal reaches the DSP FULL box */
    { unsigned shown = box_calls; mw_ui_tick(); mw_ui_tick(); CHECK(box_calls == shown); } /* retried every tick, shown once */
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
    /* Beta finding 47 (#712): a set-up Sidechain Compressor on T4 FX2 shows stock its own COMPRESSOR defaults in
     * slots 7-11 (1, 0x7f, 0, 0, 0) and keeps its bytes; 0.2.0's MON OFF (slot 7 = 2), KEY T2, KGN 64, KBAS 30, KWID
     * OFF (127). seen_keys[] is slots 7-11 as stock sees them. */
    uint8_t *keys = (uint8_t *)part0() + 0x2fe + 90 + 6 + 2, *mon = keys - 1, fx2 = part0()[8 + 3], was[5];
    memcpy(was, mon, 5); part0()[8 + 3] = 24;
    *mon = 2; keys[0] = 2; keys[1] = 64; keys[2] = 30; keys[3] = 127;
    CHECK(mw_validate(part0()) == 11 && seen_keys[0] == 1 && seen_keys[1] == 0x7f && !seen_keys[2] && !seen_keys[3]
          && !seen_keys[4]);
    CHECK(*mon == 2 && keys[0] == 2 && keys[1] == 64 && keys[2] == 30 && keys[3] == 127);
    *mon = 3;                                                                  /* MON on */
    CHECK(mw_validate(part0()) == 11 && seen_keys[0] == 1 && seen_keys[1] == 0x7f && *mon == 3 && keys[3] == 127);
    *mon = 0;                                                                  /* saved before 0.2.0: 0 or 1 */
    CHECK(mw_validate(part0()) == 11 && seen_keys[1] == 0x7f && *mon == 0);
    /* A set saved with 0.1.x (KEY, KFLT 64, KGN 64, MON 0 in slots 8-11; slot 7 still stock's 1) matches too. */
    *mon = 1; keys[1] = 64; keys[2] = 64; keys[3] = 0;
    CHECK(mw_validate(part0()) == 11 && seen_keys[1] == 0x7f && keys[1] == 64 && keys[2] == 64);
    /* Stock's own KEY 127, a slot 7 or a slot 9-11 out of range, or another effect reach stock as they are. */
    keys[0] = 0x7f;
    CHECK(mw_validate(part0()) == 11 && seen_keys[1] == 0x7f && seen_keys[2] == 64);
    keys[0] = 2; *mon = 4;
    CHECK(mw_validate(part0()) == 11 && seen_keys[0] == 4 && seen_keys[1] == 2 && seen_keys[2] == 64);
    *mon = 2; keys[3] = 0x80;
    CHECK(mw_validate(part0()) == 11 && seen_keys[1] == 2 && seen_keys[4] == 0x80);
    keys[3] = 127; part0()[8 + 3] = 8;                                        /* DELAY */
    CHECK(mw_validate(part0()) == 11 && seen_keys[0] == 2 && seen_keys[1] == 2 && seen_keys[2] == 64);
    part0()[8 + 3] = fx2; memcpy(mon, was, 5);
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
    CHECK(later(3) == -7);
    /* So does a machine taking it: its own defaults and signature, never the absent machine's bytes. */
    for (unsigned k = 0; k < 12; ++k) part0()[(k < 6 ? 0x2a : 0x1da) + 90 + 6 + k % 6] = (uint8_t)(0x70 + k);
    part0()[60 + 90] = 'A'; part0()[61 + 90] = 'B'; part0()[62 + 90] = 1;
    const void *v_only[] = {&V};
    rows(v_only, 1, 0, 0);
    CHECK(clamp_now() == 5); /* one machine: row 5, stock's clamp */
    CHECK(mw_assign(part0(), 3, 5) == 1 && part0()[60 + 90] == 'S' && part0()[0x2a + 90 + 6] == 0x40 && part0()[0x1da + 90 + 11] == 0x40);
    CHECK(mw_assign(part0(), 3, 1) == 1 && part0()[60 + 90] == 0);
    /* The type byte is stock's to change (the commit stores the returned row): the registry never writes it. */
    CHECK(part0()[0x22 + 3] == 1);
    /* FLEX <-> a machine keeps the stored type, so the registry loads the track's live parameters from its Part
     * (stock's 0x40001f18, which a type change runs); a commit that changes the type, from or to STATIC, is stock's. */
    const void *a_only[] = {&A};
    rows(a_only, 1, 0, 0);
    misc[0x0e] = 3; relives = 0;                                       /* bank 4 */
    CHECK(mw_assign(part0(), 3, 5) == 1 && relives == 1 && relive_args[0] == 3 && relive_args[1] == 0 && relive_args[2] == 3);
    CHECK(mw_assign(part0(), 3, 5) == 1 && relives == 1);             /* the same machine again */
    CHECK(mw_assign(part0(), 3, 1) == 1 && relives == 2 && relive_args[2] == 3); /* back to FLEX */
    CHECK(mw_assign(part0(), 3, 1) == 1 && relives == 2);             /* FLEX to FLEX */
    part0()[0x22 + 3] = 0;                                              /* STATIC */
    CHECK(mw_assign(part0(), 3, 5) == 1 && relives == 2);
    part0()[0x22 + 3] = 1;                                              /* the commit stores FLEX */
    CHECK(mw_assign(part0(), 3, 0) == 0 && relives == 2);             /* and STATIC again */
    misc[0x0e] = 0;
    rows(0, 0, 0, 0);

    /* A switch that keeps the stored type stops the track's stock voice (byte 0 of its record) before its parameters
     * change: every trig on a machine track also started stock's FLEX voice, which the machine's render never
     * advances, and it would play a short wrong burst after a switch to FLEX. Only that track's, only of the playing
     * Part; a type change (from or to STATIC) is stock's. */
    {
        const void *a_only[] = {&A};
        rows(a_only, 1, 0, 0);
        uint8_t *t3 = stock_voices + 168u * 3u, *t2 = stock_voices + 168u * 2u;
        CHECK(mw_assign(part0(), 3, 5) == 1 && part0()[60 + 90] == 'A');
        *t3 = 1; *t2 = 1; t3[1] = 7;
        CHECK(mw_assign(part0(), 3, 1) == 1 && part0()[60 + 90] == 0);      /* ANALOG BD -> FLEX */
        CHECK(*t3 == 0 && t3[1] == 7 && *t2 == 1);
        *t3 = 1;
        CHECK(mw_assign(part0(), 3, 1) == 1 && *t3 == 1);                    /* FLEX -> FLEX */
        CHECK(mw_assign(part0(), 3, 5) == 1 && *t3 == 0 && *t2 == 1);        /* FLEX -> ANALOG BD */
        *t3 = 1;
        CHECK(mw_assign(part0(), 3, 5) == 1 && *t3 == 1);                    /* the same machine again */
        CHECK(mw_assign(part0(), 3, 0) == 0 && *t3 == 1);                    /* ANALOG BD -> STATIC: stock's */
        part0()[0x22 + 3] = 0;                                               /* the commit stored STATIC */
        CHECK(mw_assign(part0(), 3, 5) == 1 && *t3 == 1);                    /* STATIC -> ANALOG BD: stock's */
        part0()[0x22 + 3] = 1;
        CHECK(mw_assign(part0(), 3, 1) == 1 && *t3 == 0);
        /* An absent machine's track is left as a present one is. */
        rows(0, 0, 0, 0);
        part0()[60 + 90] = 'A'; part0()[61 + 90] = 'B'; part0()[62 + 90] = 1; *t3 = 1;
        CHECK(mw_assign(part0(), 3, 1) == 1 && part0()[60 + 90] == 0 && *t3 == 0);
        /* Another Part than the playing one: its tracks' voices are not playing it. */
        rows(a_only, 1, 0, 0);
        part0()[PART_STRIDE + 0x22 + 3] = 1; *t3 = 1;                          /* Part 2's T4 is FLEX */
        CHECK(mw_assign(part0() + PART_STRIDE, 3, 5) == 1 && part0()[PART_STRIDE + 60 + 90] == 'A' && *t3 == 1);
        CHECK(mw_assign(part0() + PART_STRIDE, 3, 1) == 1 && part0()[PART_STRIDE + 60 + 90] == 0 && *t3 == 1);
        memset(stock_voices, 0, sizeof stock_voices);
        rows(0, 0, 0, 0);
    }

    /* A track a machine renders keeps stock's FLEX voice and retrig stopped, every render: its trigs start that voice
     * and latch RTRG (render state +4) from the machine's bytes, and a bank or Part change that makes the track FLEX
     * again never passes mw_assign (#1051). A FLEX track's, and those of a machine without its own render (VECTOR,
     * POLY8), are stock's. */
    {
        const void *a_v[] = {&A, &V};
        rows(a_v, 2, 0, 0);
        uint8_t *t3 = stock_voices + 168u * 3u, *t2 = stock_voices + 168u * 2u, *t4 = stock_voices + 168u * 4u;
        uint32_t *r3 = render_states + 10u * 3u, *r2 = render_states + 10u * 2u, *r4 = render_states + 10u * 4u;
        CHECK(mw_assign(part0(), 2, 1) == 1 && mw_assign(part0(), 3, 5) == 1 && mw_assign(part0(), 4, 6) == 1);
        *t3 = 1; *t2 = 1; *t4 = 1; t3[1] = 7; r3[1] = r2[1] = r4[1] = 0x4000; r3[6] = 9;
        int a_before = a_renders;
        CHECK(mw_source_render_impl(3, 0, 0, 1) == a_renders && a_renders == a_before + 1);
        CHECK(*t3 == 0 && t3[1] == 7 && r3[1] == 0 && r3[6] == 9 && *t2 == 1 && r2[1] == 0x4000); /* A's track only */
        *t3 = 1; r3[1] = 0x4000;                                             /* a trig between the two renders */
        CHECK(mw_source_render_impl(3, 0, 0, 16) > 0 && *t3 == 0 && r3[1] == 0);
        int flex = stock_renders;
        CHECK(mw_source_render_impl(2, 0, 0, 1) == -7 && stock_renders == flex + 1 && *t2 == 1 && r2[1] == 0x4000); /* FLEX */
        CHECK(mw_source_render_impl(4, 0, 0, 1) == -7 && *t4 == 1 && r4[1] == 0x4000); /* VECTOR renders inside stock's */
        /* The Part changes under the track (no mw_assign): FLEX again, its voice and retrig as the machine left them. */
        part0()[60 + 90] = 0; part0()[61 + 90] = 0; part0()[62 + 90] = 0;
        CHECK(later(3) == -7 && *t3 == 0 && r3[1] == 0);
        *t3 = 1; r3[1] = 3; CHECK(mw_source_render_impl(3, 0, 0, 1) == -7 && *t3 == 1 && r3[1] == 3); /* its FLEX trig */
        /* An absent machine's track renders stock's silent source and keeps both stopped, too. */
        rows(0, 0, 0, 0);
        part0()[60 + 90] = 'A'; part0()[61 + 90] = 'B'; part0()[62 + 90] = 1;
        int silent = silent_renders;
        CHECK(mw_source_render_impl(3, 0, 0, 1) == -9 && silent_renders == silent + 1 && *t3 == 0 && r3[1] == 0);
        part0()[60 + 90] = 0; part0()[61 + 90] = 0; part0()[62 + 90] = 0;
        part0()[60 + 120] = 0; part0()[61 + 120] = 0; part0()[62 + 120] = 0;
        memset(render_states, 0, sizeof render_states);
        memset(stock_voices, 0, sizeof stock_voices);
    }

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
    /* Past the ceiling (64,000 of 58,451): once measured it never runs again, no probe (a frame that long stopped the
     * DSP, owner's MKII, 22 November 2026); lighter, it is timed afresh at STOP or a Part change and stays. */
    fresh(); f_cost = 48000; ran = 0;
    for (unsigned i = 0; i < 3000u; ++i) ran += frame(3, 6000, 10000) > 100;
    CHECK(ran == 1u);                                                    /* the first, before its cost was known */
    f_cost = 5000; ran = 0;
    for (unsigned i = 0; i < 1100u; ++i) ran += frame(3, 6000, 10000) > 100;
    CHECK(!ran);
    test_stopped = 1; mw_ui_tick(); test_stopped = 0; mw_ui_tick();
    unsigned stays = 0;
    for (unsigned i = 0; i < 10u; ++i) stays += frame(3, 6000, 10000) > 100;
    CHECK(stays == 10u);
    /* One slow render (90,000, as at a pattern change) is no sentence: held while its cost says it would pass the
     * ceiling, it is timed afresh at STOP or a Part change, and stays. */
    fresh(); f_cost = 10000;
    for (unsigned i = 0; i < 4u; ++i) CHECK(frame(3, 10000, 10000) > 100);
    f_cost = 90000; CHECK(frame(3, 10000, 10000) > 100);
    f_cost = 10000; ran = 0;
    for (unsigned i = 0; i < 1023u; ++i) ran += frame(3, 10000, 10000) > 100;
    CHECK(!ran && cost[3] == 90000);
    CHECK(frame(3, 10000, 10000) == -9);                                 /* no probe past the ceiling */
    test_stopped = 1; mw_ui_tick(); test_stopped = 0; mw_ui_tick();      /* STOP: timed afresh */
    CHECK(frame(3, 10000, 10000) > 100 && cost[3] == 10000);
    stays = 0;
    for (unsigned i = 0; i < 10u; ++i) stays += frame(3, 10000, 10000) > 100;
    CHECK(stays == 10u);
    /* A note start costs a render far more than its steady frames: at the ceiling a starting track is judged by what
     * its last start cost (FM Synth on T8 at C01's step 1, owner's MKII, 22 November 2026); the first start has no
     * figure yet, and a frame without a start goes by the steady cost. */
    fresh(); f_cost = 2000;
    for (unsigned i = 0; i < 4u; ++i) CHECK(frame(3, 10000, 0) > 100);
    mw_frame_t0 = host_timer; host_timer += 10000; mw_source_start_select(3, 0); f_cost = 30000;
    CHECK(mw_source_render_impl(3, 0, 0, 1) > 100); mw_frame_exit();     /* the first start: runs, and is measured */
    f_cost = 2000;
    for (unsigned i = 0; i < 12u; ++i) CHECK(frame(3, 10000, 0) > 100);
    mw_frame_t0 = host_timer; host_timer += 30000; mw_source_start_select(3, 0); f_cost = 30000;
    CHECK(mw_source_render_impl(3, 0, 0, 1) == -9); mw_frame_exit();     /* 30,000 + its start's 30,000: held */
    CHECK(skipped[3] && start_cost[3] >= 30000u);
    test_stopped = 1; mw_ui_tick(); test_stopped = 0; mw_ui_tick();      /* STOP: its step figures afresh too */
    CHECK(!cost[3] && !start_cost[3] && !start_after[3]);
    f_cost = 2000; frame(3, 0, 0), frame(3, 0, 0);
    CHECK(frame(3, 30000, 0) > 100);                                     /* no start: the steady cost fits */
    /* A machine that starts its own notes past the base (FM Synth): a step's frame is one where any track started, so
     * T3 learns its step cost from T1's START and is held at the next step all the same. */
    for (unsigned i = 0; i < 12u; ++i) frame(3, 10000, 0);
    mw_frame_t0 = host_timer; host_timer += 10000; mw_source_start_select(0, 0); f_cost = 30000;
    CHECK(mw_source_render_impl(3, 0, 0, 1) > 100); mw_frame_exit();
    f_cost = 2000;
    for (unsigned i = 0; i < 12u; ++i) CHECK(frame(3, 10000, 0) > 100);
    mw_frame_t0 = host_timer; host_timer += 30000; mw_source_start_select(0, 0); f_cost = 30000;
    CHECK(mw_source_render_impl(3, 0, 0, 1) == -9); mw_frame_exit();
    f_cost = 2000; frame(3, 0, 0), frame(3, 0, 0);
    /* Two machine tracks, T3 (3,000) before T4 (20,000). When the frame would overdraw and skipping T4 alone makes
     * the room, T3 runs and T4 is skipped when it comes; when T4's cost would not make it, T3 is skipped at once. */
    CHECK(mw_assign(part0(), 2, 5) == 1);
    fresh();
    for (unsigned i = 0; i < 7u; ++i) {
        uint32_t pre = i < 4u ? 10000u : i < 6u ? 20000u + 25000u * (i - 4u) : 70000u;
        mw_frame_t0 = host_timer; host_timer += pre;
        f_cost = 3000; int light = mw_source_render_impl(2, 0, 0, 1);
        f_cost = 20000; int dear = mw_source_render_impl(3, 0, 0, 1);
        host_timer += 5000; mw_frame_exit();
        CHECK(i < 4u ? light > 100 && dear > 100 : i < 6u ? light > 100 && dear == -9 : light == -9 && dear == -9);
    }
    CHECK(mw_frame_shed_tracks == (1u << 2 | 1u << 3) && cost[2] == 3000 && cost[3] == 20000);
    start_cost[3] = start_after[11] = 7u, skipped[11] = 3u;
    guard_forget(3);                                                     /* another machine on T4: timed afresh */
    CHECK(!cost[3] && !start_cost[3] && !start_after[11] && !skipped[11] && cost[2] == 3000);
    CHECK(mw_assign(part0(), 2, 1) == 1);
    /* A track's second render in a frame has its own estimate: once measured, the heavy second render skips and the
     * light first one runs (also in the frame after the first long one, which starts 25,109 late: skipping the heavy
     * render makes the room, so the light one is not skipped in its place). */
    fresh(); f_cost = 1000;
    int one[4], two[4];
    for (unsigned i = 0; i < 4u; ++i) {
        mw_frame_t0 = host_timer; host_timer += 1000;
        one[i] = mw_source_render_impl(3, 0, 0, 1);
        f_cost = 70000; two[i] = mw_source_render_impl(3, 0, 0, 1); f_cost = 1000;
        host_timer += 1000; mw_frame_exit();
    }
    CHECK(one[0] > 100 && two[0] > 100 && one[1] > 100 && two[1] == -9);
    CHECK(one[2] > 100 && two[2] == -9 && one[3] > 100 && two[3] == -9);
    /* A FLEX track no machine owns goes to F's RENDER_FLEX render while the frame has room; when F's share would
     * overdraw it, stock's FLEX render takes the track instead, never the silent source (#999: the guard dropped such
     * tracks as it skips F's own), and F's comes back when there is room. */
    fresh(); f_cost = 5000;
    int unowned_silent = silent_renders, unowned_flex = stock_renders;
    for (unsigned i = 0; i < 3u; ++i) CHECK(frame(6, 20000, 5000) > 100);
    uint32_t unowned_sheds = mw_frame_sheds;
    f_cost = 70000; CHECK(frame(6, 20000, 5000) > 100);                        /* its cost rises: seen once */
    for (unsigned i = 0; i < 3u; ++i) CHECK(frame(6, 20000, 5000) == -7);
    CHECK(mw_frame_sheds == unowned_sheds + 3u && mw_frame_shed_tracks & 1u << 6);
    CHECK(silent_renders == unowned_silent && stock_renders == unowned_flex + 3);
    /* A renderer a module put into the slots itself (mw_foreign_render): its machine's track is guarded with the
     * silent source and refused past the CPU budget; a track nobody owns falls back to stock's render. */
    mw_foreign_fn = render_f;
    for (unsigned t = 3; t <= 6u; t += 3u) {
        fresh(); f_cost = 70000;
        mw_frame_t0 = host_timer; CHECK(mw_foreign_render(t, 0, 0, 1) > 100); mw_frame_exit();
        mw_frame_t0 = host_timer; CHECK(mw_foreign_render(t, 0, 0, 1) == (t == 3u ? -9 : -7)); mw_frame_exit();
    }
    fresh(); f_cost = 1000;
    mw_cpu_refused = 1u << 3; CHECK(mw_foreign_render(3, 0, 0, 1) == -9 && mw_foreign_render(6, 0, 0, 1) > 100);
    mw_cpu_refused = 0; CHECK(mw_foreign_render(3, 0, 0, 1) > 100);
    f_cost = 1000;
    /* A track only stock renders always renders, however late the frame. */
    const void *v_only2[] = {&V};
    rows(v_only2, 1, 0, 0);
    uint32_t sheds = mw_frame_sheds;
    CHECK(frame(6, 90000, 10000) == -7 && mw_frame_sheds == sheds);
    rows(0, 0, 0, 0);

    /* The render keeps what it worked out for a track while the Part, the type byte and the signature it read stand,
     * and works it out again when one of them changes or the rows do. It reads them once a frame: a change shows in the
     * next frame, and nothing below the interrupt can make one inside a frame. (Rows never change without
     * modwerk_machine_tables_changed on a unit; emptying one behind its back here shows the table is not walked.) */
    {
        const void *a_only[] = {&A};
        rows(a_only, 1, 0, 0);
        CHECK(mw_assign(part0(), 3, 5) == 1);
        fresh(); mw_frame_t0 = host_timer;
        int a0 = a_renders, flex = stock_renders, silent = silent_renders;
        CHECK(mw_source_render_impl(3, 0, 0, 1) == a0 + 1);
        machine_row[0] = 0;
        CHECK(later(3) == a0 + 2 && mw_source_render_impl(6, 0, 0, 1) == -7);
        part0()[62 + 90] = 2;                                                  /* another revision: nobody's */
        CHECK(mw_source_render_impl(3, 0, 0, 1) == a0 + 3);                    /* the same frame: not read again */
        mw_frame_exit(); mw_frame_t0 = host_timer;                             /* the frame's exit ends it */
        CHECK(mw_source_render_impl(3, 0, 0, 1) == -7 && stock_renders == flex + 2);
        part0()[62 + 90] = 1;                                                  /* A's again, and A's row is empty */
        CHECK(later(3) == -9 && silent_renders == silent + 1);
        rows(a_only, 1, 0, 0);                                                 /* the rows changed: at once */
        CHECK(mw_source_render_impl(3, 0, 0, 1) == a0 + 4);
        part0()[PART_STRIDE + 0x22 + 3] = 1; misc[0x0f] = 1;                   /* Part 2: T4 is plain FLEX there */
        CHECK(later(3) == -7);
        misc[0x0f] = 0;
        CHECK(later(3) == a0 + 5);
        part0()[0x22 + 3] = 2;                                                 /* THRU: no machine track */
        CHECK(later(3) == -7);
        part0()[0x22 + 3] = 1;
        put_u32(BANK, 0);                                                      /* no bank: stock's render */
        CHECK(later(3) == -7);
        put_u32(BANK, 0x46000000u);
        CHECK(later(3) == a0 + 6);
        /* An unowned FLEX track goes to the RENDER_FLEX machine the rows name now, not the one they named before. */
        const void *f_only2[] = {&F};
        rows(f_only2, 1, 0, 0); f_cost = 0;
        CHECK(mw_source_render_impl(6, 0, 0, 1) > 100);
        rows(a_only, 1, 0, 0);
        CHECK(mw_source_render_impl(6, 0, 0, 1) == -7 && mw_source_render_impl(3, 0, 0, 1) == a0 + 7);
        CHECK(mw_assign(part0(), 3, 1) == 1);
        rows(0, 0, 0, 0);
    }

    /* SRC SETUP: the SETUP_PAGE machine S (row 6, after A) draws and edits its own rows while the cursor is on its row and
     * the current track is its own; N (row 7, no flag), A and stock rows keep stock's page and editor. */
    const void *asn[] = {&A, &S, &N};
    rows(asn, 3, 0, 0);
    CHECK(mw_assign(part0(), 2, 6) == 1 && mw_assign(part0(), 4, 7) == 1 && mw_assign(part0(), 5, 5) == 1);
    misc[0x0c] = 2; /* current track 3: S's */
    CHECK(mw_setup_page(6, 0x400d31aeu) == 0x400d32aeu && setup_pages == 1);
    CHECK(mw_setup_knob(6, 4, -3) == 1 && setup_knobs == 1 && knob_index == 4 && knob_delta == -3);
    knob_takes = 0; CHECK(mw_setup_knob(6, 0, 1) == 0 && setup_knobs == 2); knob_takes = 1;
    CHECK(mw_setup_knob(6, 6, 1) == 0 && setup_knobs == 2); /* only encoders A-F */
    /* Another row under the cursor (a stock row, A's, N's) or another track's machine: stock's. */
    CHECK(mw_setup_page(1, 7) == 7 && mw_setup_page(5, 7) == 7 && mw_setup_page(7, 7) == 7 && mw_setup_knob(5, 0, 1) == 0);
    misc[0x0c] = 4; CHECK(mw_setup_page(7, 7) == 7 && mw_setup_knob(7, 1, 1) == 0 && mw_setup_page(6, 7) == 7);
    misc[0x0c] = 3; CHECK(mw_setup_page(6, 7) == 7 && mw_setup_knob(6, 1, 1) == 0);
    misc[0x0c] = 2; misc[0x55] = 1; CHECK(mw_setup_page(6, 7) == 7 && mw_setup_knob(6, 1, 1) == 0); misc[0x55] = 0;
    CHECK(setup_pages == 1 && setup_knobs == 2);
    /* S alone (row 5) and S gone: its track reads as stock and so does its SETUP. */
    const void *s_only[] = {&S};
    rows(s_only, 1, 0, 0);
    CHECK(mw_setup_page(5, 7) == 0x107u && setup_pages == 2);
    rows(0, 0, 0, 0);
    CHECK(mw_setup_page(5, 7) == 7 && mw_setup_knob(5, 0, 1) == 0 && setup_pages == 2 && setup_knobs == 2);
    misc[0x0c] = 0;
    for (unsigned t = 0; t < 8; ++t) for (unsigned k = 0; k < 3; ++k) part0()[60 + 30 * t + k] = 0;

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
    CHECK(counts_now() == (5u << 24 | 5u << 16 | 4u << 8 | 3u) && !masked && clamp_now() == 5);
    check_machine_map();
    check_source_starts();
    check_native_flex_voice();
    check_cpu_budget();
    check_engine_price();
    check_busiest_step(); check_rest_booked();
    check_brake();
    check_resting_machines();
    check_late_entry();
    if (failures) { fprintf(stderr, "%u registry checks failed\n", failures); return 1; }
    puts("Machine registry: rows by table order, admission before mutation, signatures and defaults in both copies, absent "
         "machines as stock, the validator's protection and wrapper chain, render routing, keyed SEQUENCER rows, chooser "
         "counts and cursor clamps, SETUP_PAGE machines' own SRC SETUP, the frame guard, the late-entry wait, the CPU budget and resting "
         "machines (rest when unused, wake on pick, on a track and after a set change) passed.");
    return 0;
}
