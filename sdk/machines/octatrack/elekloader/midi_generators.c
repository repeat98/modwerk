/* SPDX-License-Identifier: MIT
 * MIDI generators on the Octatrack's MIDI tracks (hooks.json ot_midi_generators). The base reads the table. A card
 * build compiles this file into its one generator module, with MG_FIXED naming that module's record, and patches
 * the same four sites itself (midi_generators.s); every private name here carries mg_ so it can share the module's
 * translation unit. MIDI NOTE SETUP lists OFF and the generators in its empty left half (UP/DOWN, YES); double-tap
 * TRACK in MIDI mode, which stock ignores, opens it. A track running a generator keeps 'M' and its id in the arp step
 * mask, which stock's validator never reads and only ARP SETUP edits, and shows the generator's pages on the MIDI pages
 * it takes (always the ARP page, whose note bytes hold its settings; FUNC+AMP, which would open ARP SETUP, turns that
 * page to its second). NOTE SETUP's two unused slots looked free but its encoders D and F edit them unseen. UI task only. Stock addresses: OS 1.40C (octabam docs/firmware/MIDI_TRACKS.md, PARAM_PAGES.md). */
#include <stdint.h>
#include "modwerk_hooks.h"
#ifndef MW_HOST /* test_midi_generators.c maps these onto a model of the unit's memory */
#define U8(a) (*(volatile uint8_t *)(uintptr_t)(a))
#define U32(a) (*(volatile uint32_t *)(uintptr_t)(a))
#define MG_CALL(type, a) ((type)(uintptr_t)(a))
#endif
#define MG_BANK 0x46c82456u
#define MG_PART(p) (0x8ed80u + (p) * 6322u)
#define MG_SRAM_PART 0x100a4eceu  /* the current bank's Parts, battery-backed */
#define MG_TRACK 0x100b14ccu
#define MG_CUR_PART 0x100b14cfu
#define MG_MIDI_MODE 0x80000012u
#define MG_PAGE 0x460d1684u       /* the page: on a MIDI track 0 NOTE (SRC), 1 LFO, 2 ARP (AMP), 3 CTRL1 (FX1), 4 CTRL2 (FX2) */
#define MG_ARP 2u
#define MG_NOTE_SETUP 0x400bc6c0u /* MIDI NOTE SETUP's window: 0 while closed */
#define MG_NOTE_LAYER 0x400bc6a4u /* its input layer; its first word links the layer pushed after it */
#define MG_LAYERS 0x460d165cu
#define MG_KEY_CACHE 0x46c7d8deu
#define MG_DIRTY_SCREEN 0x46c7c72cu
#define MG_MASK(t) (0x1822u + 2u * (t))  /* the arp step mask, high byte first: 'M' and the id; stock's default ffff */
#define MG_MARK 0x4du
#define MG_ROWS 5u                /* OFF and the table's room */
typedef struct modwerk_midi_generator MgGen;
#if defined(MODWERK_DEV) && !defined(MG_FIXED)
void modwerk_cost_stamp(unsigned k); /* diag.c: the development profile, [24]-[27] */
#define MG_STAMP(k) modwerk_cost_stamp(k)
#else
#define MG_STAMP(k) ((void)0)
#endif

#ifdef MG_FIXED
extern const MgGen MG_FIXED;
extern void mg_page_site(void);
/* Under the base its own registry owns the sites, and this copy stays out of the way. */
static unsigned mg_generators(const MgGen **out)
{
    out[0] = &MG_FIXED;
    return U32(0x4004e1ecu) == (uint32_t)(uintptr_t)mg_page_site;
}
#else
#include "loader.h"
#define MG_TABLE (MODWERK_OT_MIDI_GENERATORS - RUNTIME_EVENTS)
/* As machine_registry.c's machines(): masked, so a table change is never seen half-way. */
static unsigned mg_generators(const MgGen **out)
{
    unsigned n = 0;
    uint32_t mask = modwerk_machine_mask();
    for (uintptr_t volatile *row = modwerk_runtime_event_row[MG_TABLE]; *row && n < MG_ROWS - 1u; ++row) {
        const MgGen *g = (const MgGen *)*row;
        if (g->abi == MODWERK_MIDI_GENERATOR_ABI && g->id && g->id < 256u) out[n++] = g;
    }
    modwerk_machine_unmask(mask);
    return n;
}
#endif

static unsigned mg_valid_bank(void) { uint32_t b = U32(MG_BANK); return b >= 0x40000000u && b < 0x47f00000u; }
static uint32_t mg_part(void) { return U32(MG_BANK) + MG_PART(U8(MG_CUR_PART) & 3u); }
static unsigned mg_midi(void) { return U32(MG_MIDI_MODE) && mg_valid_bank() && U8(MG_TRACK) < 8u; }
/* The generator running MIDI track t of a Part and its list row (1 on); 0 for none or an absent one. The track and
 * Part numbers sit in battery RAM on the external bus, slow to read: callers read them once and pass them. */
static unsigned mg_running(const MgGen *const *g, unsigned n, uint32_t part, unsigned t, const MgGen **who)
{
    unsigned id = U8(part + MG_MASK(t) + 1u);
    *who = 0;
    for (unsigned k = 0; U8(part + MG_MASK(t)) == MG_MARK && k < n; ++k)
        if (g[k]->id == id) { *who = g[k]; return k + 1u; }
    return 0;
}
/* A byte of the current Part and its battery-backed mirror, as stock's MIDI setup writers store. */
static void mg_store(uint32_t off, uint8_t v)
{
    U8(mg_part() + off) = v;
    U8(MG_SRAM_PART + MG_PART(U8(MG_CUR_PART) & 3u) - MG_PART(0) + off) = v;
}
static void mg_dirty(void)
{
    unsigned p = U8(MG_CUR_PART) & 3u;
    U8(U32(MG_BANK) + 0x95048u) |= (uint8_t)(1u << p);
    U8(0x100b145eu) |= (uint8_t)(1u << p);
    U32(U32(MG_BANK) + 0x9b332u) = 1; U32(0x100f8598u) = 1;
    MG_CALL(void (*)(void), 0x40027e00u)();
}
/* Stock's defaults for a MIDI track's arpeggiator (a new project's): page 1 TRAN..NLEN, its setup slots, every arp
 * step on, every note 0. A generator's track starts from them and leaves them behind. */
static const uint8_t mg_arp_page[6] = {0x40, 0, 0, 5, 0, 6}, mg_arp_setup_slots[6] = {0, 0, 7, 0, 0, 0};
static void mg_reset_arp(unsigned t)
{
    unsigned live = U8(0x8000666eu + t) == U8(0x80000002u) && U8(0x80006676u + t) == U8(0x80000003u);
    for (unsigned k = 0; k < 6; ++k) {
        mg_store(0x3e2u + 32u * t + 12u + k, mg_arp_page[k]);
        mg_store(0x4e2u + 36u * t + 12u + k, mg_arp_setup_slots[k]);
        if (live) U8(0x46c76dc0u + 0x44u * t + 12u + k) = mg_arp_page[k];  /* page 1's live copy: only while it plays */
        U8(0x46c76de0u + 0x44u * t + 12u + k) = mg_arp_setup_slots[k];     /* the setup's: as the setup writers */
    }
    for (unsigned k = 0; k < 16; ++k) mg_store(0x1832u + 16u * t + k, 0);
}
/* A generator's page hides MODE, so a track that runs one keeps stock's arpeggiator off: it could have been turned on
 * while the generator's module was absent. Checked when the generators, the bank or the Part change, never per tick. */
static uint32_t mg_seen;
static void mg_guard(const MgGen *const *g, unsigned n)
{
    uint32_t seen = U32(MG_BANK) ^ U8(0x80000003u) << 28 ^ n;
    for (unsigned k = 0; k < n; ++k) seen ^= (uint32_t)(uintptr_t)g[k] << k;
    if (seen == mg_seen) return;
    mg_seen = seen; /* with none installed too, so the generator's return counts as a change */
    if (!n || !mg_valid_bank()) return;
    uint32_t part = mg_part();
    const MgGen *who;
    for (unsigned t = 0; t < 8u; ++t)
        if (mg_running(g, n, part, t, &who) && U8(part + 0x3e2u + 32u * t + 14u)) {
            mg_store(0x3e2u + 32u * t + 14u, 0);
            if (U8(0x8000666eu + t) == U8(0x80000002u) && U8(0x80006676u + t) == U8(0x80000003u))
                U8(0x46c76dc0u + 0x44u * t + 14u) = 0;
            mg_dirty();
        }
}
static void mg_choose(const MgGen *const *g, unsigned n, unsigned t, unsigned row)
{
    const MgGen *old, *now = row && row <= n ? g[row - 1u] : 0;
    unsigned id = now ? now->id : 0u;
    mg_running(g, n, mg_part(), t, &old);
    if (old == now && (now || U8(mg_part() + MG_MASK(t)) != MG_MARK)) return;
    if (old && old->assign) old->assign(t, 0);
    mg_reset_arp(t);
    mg_store(MG_MASK(t), (uint8_t)(now ? MG_MARK : 0xffu));
    mg_store(MG_MASK(t) + 1u, (uint8_t)(now ? id : 0xffu));
    mg_dirty();
    if (now && now->assign) now->assign(t, 1);
}

/* Input layers, pushed and taken off on the UI tick (VECTOR's st_ui_tick idiom): the list's while MIDI NOTE SETUP is
 * open, the page's on a generator's page. A key a layer does not use goes on to the handler stock had resolved
 * for it before the layer, as does the release of every press the layer did not take. */
extern uint32_t mg_list_layer[], mg_page_layer[];
static uint32_t *mg_active;
static uint32_t mg_saved[4][3];
static unsigned mg_mine, mg_second, mg_shown, mg_cursor, mg_opened;
static const uint8_t mg_keys[4] = {0x33, 0x20, 0x31, 0x32}; /* UP, DOWN, YES, NO */

/* A page a generator takes on its track while no trig, scene or popup is held, as VECTOR's audio page: a held trig
 * shows stock's page, so its locks stay stock's. The ARP page is always its own: the note bytes there are its settings. */
static const MgGen *mg_page_view(const MgGen *const *g, unsigned n, uint32_t part, unsigned track)
{
    const MgGen *who;
    uint32_t page = U32(MG_PAGE);
    if (page > 4u || U32(0x460d173au) || U32(0x460d1694u)) return 0;
    mg_running(g, n, part, track, &who);
    return who && ((who->pages | 1u << MG_ARP) >> page & 1u) ? who : 0;
}
static const MgGen *mg_view(const MgGen *const *g, unsigned n) { return mg_midi() ? mg_page_view(g, n, mg_part(), U8(MG_TRACK)) : 0; }
static void mg_redraw(void) { MG_CALL(void (*)(int), 0x4004d948u)(-1); U32(MG_DIRTY_SCREEN) = 1; }
uint32_t mg_page(uint32_t stock);
uint32_t mg_page(uint32_t stock)
{
    const MgGen *g[MG_ROWS - 1u], *who; unsigned n = mg_generators(g);
    /* Only with its layer on: without it the knobs would edit stock's ARP values under the generator's labels. */
    return mg_active == mg_page_layer && (who = mg_view(g, n)) && who->page ? who->page(stock, U32(MG_PAGE), mg_second) : stock;
}
/* FUNC+AMP, or a double-tap on AMP, on a generator's track turns its ARP page instead of opening ARP SETUP, which
 * would edit the generator's settings as arp notes. */
unsigned mg_arp_setup(void);
unsigned mg_arp_setup(void)
{
    const MgGen *g[MG_ROWS - 1u], *who; unsigned n = mg_generators(g);
    if (!mg_midi() || !mg_running(g, n, mg_part(), U8(MG_TRACK), &who)) return 0;
    mg_second ^= 1u;
    mg_redraw();
    return 1;
}
/* Double-tap on the current TRACK key in MIDI mode: MIDI NOTE SETUP, where the list is. */
void mg_track_tap(unsigned track);
void mg_track_tap(unsigned track)
{
    const MgGen *g[MG_ROWS - 1u];
    if (track < 8u && mg_generators(g) && !U32(MG_NOTE_SETUP)) MG_CALL(void (*)(unsigned), 0x40032228u)(0);
}

/* The list in MIDI NOTE SETUP's left half (window x 3-50; its knobs start past 52): OFF, then each generator. The
 * cursor opens on the track's own row. Every call of stock's drawer comes here (midi_generators.s). */
extern void mg_stock_note_draw(void);
void mg_note_setup_draw(void);
void mg_note_setup_draw(void)
{
    mg_stock_note_draw();
    const MgGen *g[MG_ROWS - 1u]; unsigned n = mg_generators(g);
    uint32_t window = U32(MG_NOTE_SETUP);
    if (!n || !window || !mg_midi()) return;
    uint32_t surface = window + 0x24u;
    int height = (int)U32(window + 0x28u);
    void (*rect)(uint32_t, int, int, int, int, int) = MG_CALL(void (*)(uint32_t, int, int, int, int, int), 0x40012254u);
    rect(surface, 3, 2, 50, height - 10, 0);
    for (unsigned row = 0; row <= n; ++row) {
        int y = height - 20 - 8 * (int)row;
        MG_CALL(void (*)(uint32_t, uint32_t, int, int, int, const char *), 0x40012bd8u)
            (0x400ba876u, surface, 5, y, -1, row ? g[row - 1u]->label : "OFF");
        if (row == mg_cursor) rect(surface, 3, y - 1, 50, y + 6, -1);
    }
    U32(MG_DIRTY_SCREEN) = 1;
}

static unsigned mg_slot(unsigned code) { for (unsigned k = 0; k < 4; ++k) if (mg_keys[k] == code) return k; return 4; }
static void mg_forward(unsigned code, unsigned edge)
{
    unsigned k = mg_slot(code);
    uint32_t h = k < 4 ? mg_saved[k][edge == 1 ? 0 : edge == 0 ? 1 : 2] : 0;
    if (h && h != 0xffffffffu) MG_CALL(void (*)(unsigned, unsigned), h)(code, edge);
}
void mg_key(unsigned code, unsigned edge);
void mg_key(unsigned code, unsigned edge)
{
    unsigned k = mg_slot(code), bit = 1u << k;
    if (k < 4 && edge != 1 && mg_mine & bit) { if (!edge) mg_mine &= ~bit; return; }
    const MgGen *g[MG_ROWS - 1u], *who; unsigned n = mg_generators(g);
    if (edge == 1 && mg_active == mg_list_layer && n && mg_midi()) {
        if (code == 0x31) {
            mg_forward(code, edge); /* stock's YES still confirms NOTE SETUP's own values */
            mg_choose(g, n, U8(MG_TRACK), mg_cursor);
            mg_note_setup_draw();
            return;
        }
        if (code == 0x33 || code == 0x20) {
            mg_mine |= bit;
            if (code == 0x33 && mg_cursor) --mg_cursor;
            if (code == 0x20 && mg_cursor < n) ++mg_cursor;
            mg_note_setup_draw();
            return;
        }
    }
    if (edge == 1 && mg_active == mg_page_layer && (who = mg_view(g, n))) {
        if (code == 0x31 && who->yes) { mg_mine |= bit; who->yes(U32(MG_PAGE)); mg_redraw(); return; }
        if (code == 0x32 && mg_second) { mg_mine |= bit; mg_second = 0; mg_redraw(); return; }
    }
    mg_forward(code, edge);
}
void mg_knob(unsigned index, int delta);
void mg_knob(unsigned index, int delta)
{
    const MgGen *g[MG_ROWS - 1u], *who; unsigned n = mg_generators(g);
    if (index < 6 && mg_active == mg_page_layer && (who = mg_view(g, n)) && who->knob) {
        MG_STAMP(26); who->knob(U32(MG_PAGE), index, delta, mg_second); MG_STAMP(27);
        mg_redraw();
    }
}
static void mg_put_on(uint32_t *layer)
{
    for (unsigned k = 0; k < 4; ++k)
        for (unsigned e = 0; e < 3; ++e) {
            uint32_t h = U32(MG_KEY_CACHE + 24u * mg_keys[k] + 4u * e);
            if (h != (uint32_t)(uintptr_t)mg_key) mg_saved[k][e] = h; /* a held key can keep the layer's own handler */
        }
    layer[0] = 0;
    MG_CALL(void (*)(uint32_t *), 0x40031494u)(layer);
    mg_active = layer;
}
/* Each UI tick: a few bytes read while nothing changes; the layers move only when the view does. */
void mg_tick(void);
void mg_tick(void)
{
    const MgGen *g[MG_ROWS - 1u], *who; unsigned n = mg_generators(g);
    for (unsigned k = 0; k < n; ++k) if (g[k]->ui_tick) g[k]->ui_tick();
    mg_guard(g, n);
    unsigned midi = n && U32(MG_MIDI_MODE) && mg_valid_bank();
    if (!midi && !mg_active) { mg_second = mg_opened = 0; return; } /* outside MIDI mode: nothing more to read */
    unsigned track = U8(MG_TRACK);
    uint32_t part = mg_part();
    midi = midi && track < 8u;
    unsigned list = midi && U32(MG_NOTE_SETUP);
    if (!list) mg_opened = 0;
    else if (!mg_opened) { mg_opened = 1; mg_cursor = mg_running(g, n, part, track, &who); mg_note_setup_draw(); }
    who = midi ? mg_page_view(g, n, part, track) : 0;
    if (track != mg_shown || !who || U32(MG_PAGE) != MG_ARP) mg_second = 0;
    mg_shown = track;
    uint32_t *want = list ? mg_list_layer : who ? mg_page_layer : 0;
    if (mg_active == want && (!mg_active || !mg_active[0])) return;
    if (mg_mine) return; /* a release reaches the handler that took its press */
    unsigned had = mg_active == mg_page_layer;
    if (mg_active) MG_CALL(void (*)(uint32_t *), 0x4003146cu)(mg_active);
    mg_active = 0;
    /* On top of NOTE SETUP's own layer, or of the main page's alone: never over a popup another layer brought. */
    uint32_t top = U32(MG_LAYERS);
    if (want == mg_list_layer ? !U32(MG_NOTE_LAYER) : want && top && !U32(top)) mg_put_on(want);
    if (had != (mg_active == mg_page_layer)) mg_redraw();
}
