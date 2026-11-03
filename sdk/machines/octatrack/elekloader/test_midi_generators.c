/* SPDX-License-Identifier: MIT
 * Host check of the MIDI generator registry (midi_generators.c) over a synthetic model of the unit's memory: nothing
 * changes without a generator; the list in MIDI NOTE SETUP chooses, stores 'M' and the id in the arp step mask and
 * resets the arpeggiator; the pages it takes (here NOTE, and ARP always) and FUNC+AMP dispatch to it with their page,
 * the others stay stock's; an unknown id reads as stock; the MODE guard after a generator returns; OFF restores stock's
 * defaults. No stock byte is used. */
#define MW_HOST
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
static unsigned failures;
#define CHECK(x) do { if (!(x)) { failures++; fprintf(stderr, "%s:%d: %s\n", __FILE__, __LINE__, #x); } } while (0)

struct segment { uint32_t base, size; uint8_t *bytes; };
static uint8_t bank[0x9b340u], sram[4u * 6322u], misc[0xa0], fast[0x40], play[0x20], pages[0x100], notesetup[0x30],
    keys[0x600], screen[4], live[0x240], window[0x40], bankptr[4], dirtyflag[4];
static struct segment segments[] = {
    {0x40100000u, sizeof bank, bank}, {0x100a4eceu, sizeof sram, sram}, {0x100b1440u, sizeof misc, misc},
    {0x80000000u, sizeof fast, fast}, {0x80006660u, sizeof play, play}, {0x460d1650u, sizeof pages, pages},
    {0x400bc6a0u, sizeof notesetup, notesetup}, {0x46c7d8d0u, sizeof keys, keys}, {0x46c7c72cu, 4, screen},
    {0x46c76dc0u, sizeof live, live}, {0x46c7d340u, sizeof window, window}, {0x46c82456u, 4, bankptr},
    {0x100f8598u, 4, dirtyflag},
};
/* Longs the unit reads at 2-aligned addresses (the ColdFire allows it, the host's sanitizer does not): each gets its
 * own aligned word, looked up before the segments. */
static struct { uint32_t addr; uint32_t word; } longs[16];
static unsigned nlongs;
static void unaligned(uint32_t a) { longs[nlongs++].addr = a; }
static uint8_t *host_at(uint32_t a)
{
    for (unsigned i = 0; i < nlongs; ++i)
        if (a - longs[i].addr < 4) return (uint8_t *)&longs[i].word + (a - longs[i].addr);
    for (unsigned i = 0; i < sizeof segments / sizeof *segments; ++i)
        if (a - segments[i].base < segments[i].size) return segments[i].bytes + (a - segments[i].base);
    fprintf(stderr, "unmapped %#x\n", a); exit(2);
}
static void put_u32(uint32_t a, uint32_t v) { memcpy(host_at(a), &v, 4); }
#define U8(a) (*(volatile uint8_t *)host_at(a))
#define U32(a) (*(volatile uint32_t *)host_at(a))

/* Stock routines the registry calls, by address. */
static int dirties, redraws, opens, pushes, pops, stock_draws, rects; static char drawn[5][8]; static unsigned drawn_n;
static uint32_t *pushed;
static void s_dirty(void) { ++dirties; }
static void s_redraw(int x) { (void)x; ++redraws; }
static void s_open(unsigned page) { CHECK(page == 0); ++opens; put_u32(0x400bc6c0u, 0x46c7d34cu); put_u32(0x400bc6a4u, 0); }
static void s_push(uint32_t *l) { ++pushes; pushed = l; }
static void s_pop(uint32_t *l) { ++pops; CHECK(l == pushed); pushed = 0; }
static void s_rect(uint32_t s, int a, int b, int c, int d, int col) { (void)s; (void)a; (void)b; (void)c; (void)d; (void)col; ++rects; CHECK(c <= 50); }
static void s_text(uint32_t f, uint32_t s, int x, int y, int c, const char *t) { (void)f; (void)s; (void)x; (void)y; (void)c; if (drawn_n < 5) snprintf(drawn[drawn_n++], 8, "%s", t); }
static void stock_key(unsigned code, unsigned edge);
static void *host_call(uint32_t a)
{
    switch (a) {
    case 0x7e57ce01u: return (void *)(uintptr_t)stock_key;  /* stock's YES handler, as the key cache holds it */
    case 0x40027e00u: return (void *)(uintptr_t)s_dirty;
    case 0x4004d948u: return (void *)(uintptr_t)s_redraw;
    case 0x40032228u: return (void *)(uintptr_t)s_open;
    case 0x40031494u: return (void *)(uintptr_t)s_push;
    case 0x4003146cu: return (void *)(uintptr_t)s_pop;
    case 0x40012254u: return (void *)(uintptr_t)s_rect;
    case 0x40012bd8u: return (void *)(uintptr_t)s_text;
    }
    fprintf(stderr, "uncalled %#x\n", a); exit(2);
}
#define MG_CALL(type, a) ((type)host_call(a))
void mg_stock_note_draw(void) { ++stock_draws; drawn_n = 0; }
uint32_t mg_list_layer[7], mg_page_layer[7];

#include "loader.h"
#include "modwerk_events.h"
static uintptr_t volatile generator_row[5];
static int masked;
uint32_t modwerk_machine_mask(void) { CHECK(!masked); masked = 1; return 7; }
void modwerk_machine_unmask(uint32_t s) { CHECK(masked && s == 7); masked = 0; }
#define modwerk_runtime_event_row host_rows
static uintptr_t volatile *const host_rows[RUNTIME_SITE_EVENTS] = {[MODWERK_OT_MIDI_GENERATORS - RUNTIME_EVENTS] = generator_row};
#include "midi_generators.c"
#undef modwerk_runtime_event_row

/* One synthetic generator. */
static unsigned on_track = 99, on_state = 9, knob_page, knob_index, knob_second, yeses, yes_page; static int knob_delta;
static void g_assign(unsigned t, unsigned on) { on_track = t; on_state = on; }
static uint32_t g_page(uint32_t stock, unsigned page, unsigned second) { return stock + 0x100u * (page + 1u) + second; }
static void g_knob(unsigned page, unsigned i, int d, unsigned second) { knob_page = page; knob_index = i; knob_delta = d; knob_second = second; }
static void g_yes(unsigned page) { ++yeses; yes_page = page; }
static const struct modwerk_midi_generator gen = {MODWERK_MIDI_GENERATOR_ABI, "VEC", 'V', 1u, g_assign, g_page, g_knob, g_yes, 0};

#define PART 0x40100000u + 0x8ed80u   /* bank 0x40100000, Part 0 */
#define T 2u
static void key(unsigned code) { mg_key(code, 1); mg_key(code, 0); }
static int yes_stock;
static void stock_key(unsigned code, unsigned edge) { if (code == 0x31 && edge == 1) ++yes_stock; }

int main(void)
{
    unaligned(0x80000012u); unaligned(0x460d173au); unaligned(0x40100000u + 0x9b332u);
    static const uint8_t cached[4] = {0x20, 0x31, 0x32, 0x33};
    for (unsigned k = 0; k < 4; ++k) for (unsigned e = 0; e < 3; ++e) unaligned(0x46c7d8deu + 24u * cached[k] + 4u * e);
    put_u32(0x46c82456u, 0x40100000u);
    put_u32(0x80000010u, 0); put_u32(0x80000012u, 1);  /* MIDI mode */
    U8(0x100b14ccu) = T; U8(0x100b14cfu) = 0;
    put_u32(0x460d165cu, 0x460d1700u);                 /* the main page's layer alone */
    for (unsigned k = 0; k < 3; ++k) put_u32(0x46c7d8deu + 24u * 0x31 + 4u * k, 0x7e57ce01u);
    memset(bank + 0x8ed80u + 0x1822u, 0xff, 16);        /* stock's arp step masks */

    /* No generator: stock everywhere. */
    mg_track_tap(T); CHECK(opens == 0);
    CHECK(mg_page(0x1234u) == 0x1234u);
    mg_tick(); CHECK(pushes == 0);

    /* Installed: double-tap opens MIDI NOTE SETUP, the list layer goes on and the cursor sits on OFF. */
    generator_row[0] = (uintptr_t)&gen;
    mg_track_tap(T); CHECK(opens == 1);
    mg_tick(); CHECK(pushed == mg_list_layer && mg_cursor == 0);
    mg_note_setup_draw(); CHECK(stock_draws && drawn_n == 2 && !strcmp(drawn[0], "OFF") && !strcmp(drawn[1], "VEC"));
    key(0x20); CHECK(mg_cursor == 1 && !mg_mine);
    U8(PART + 0x3e2u + 32u * T + 14u) = 3;             /* the arpeggiator was on */
    key(0x31);
    CHECK(yes_stock == 1 && on_track == T && on_state == 1 && dirties);
    CHECK(U8(PART + 0x1822u + 2u * T) == 'M' && U8(PART + 0x1823u + 2u * T) == 'V');
    CHECK(U8(0x100a4eceu + 0x1822u + 2u * T) == 'M' && U8(0x100a4eceu + 0x1823u + 2u * T) == 'V');
    CHECK(U8(PART + 0x3e2u + 32u * T + 12u) == 0x40 && U8(PART + 0x3e2u + 32u * T + 14u) == 0 && U8(PART + 0x4e2u + 36u * T + 14u) == 7);

    /* The ARP page: its layer, its pages, FUNC+AMP's second, NO back, the knobs and YES. */
    put_u32(0x460d1684u, 1); put_u32(0x400bc6c0u, 0); mg_tick(); CHECK(pushed == 0 && pops == 1);
    put_u32(0x460d1684u, 2); mg_tick(); CHECK(pushed == mg_page_layer);
    CHECK(mg_page(0x1000u) == 0x1300u);
    CHECK(mg_arp_setup() == 1 && mg_page(0x1000u) == 0x1301u);
    key(0x32); CHECK(mg_page(0x1000u) == 0x1300u);
    mg_knob(3, 2); CHECK(knob_page == 2 && knob_index == 3 && knob_delta == 2 && knob_second == 0);
    key(0x31); CHECK(yeses == 1 && yes_page == 2 && yes_stock == 1);
    put_u32(0x460d173au, 1); CHECK(mg_page(0x1000u) == 0x1000u); put_u32(0x460d173au, 0); /* a held trig: stock's page */

    /* NOTE, which it takes: its page and knobs; leaving the ARP page drops its second page. LFO, which it does not:
     * stock's, the layer off, the knobs and YES stock's. */
    CHECK(mg_arp_setup() == 1);
    put_u32(0x460d1684u, 0); mg_tick(); CHECK(pushed == mg_page_layer && mg_page(0x1000u) == 0x1100u);
    mg_knob(5, -1); CHECK(knob_page == 0 && knob_index == 5 && knob_delta == -1 && knob_second == 0);
    put_u32(0x460d1684u, 2); mg_tick(); CHECK(mg_page(0x1000u) == 0x1300u);
    put_u32(0x460d1684u, 1); mg_tick(); CHECK(pushed == 0 && mg_page(0x1000u) == 0x1000u);
    knob_index = 9; mg_knob(1, 1); CHECK(knob_index == 9);
    key(0x31); CHECK(yeses == 1 && yes_stock == 2);

    /* An id with no generator reads as stock. */
    U8(PART + 0x1823u + 2u * 5u) = 'Q'; U8(PART + 0x1822u + 2u * 5u) = 'M';
    { const MgGen *g[1] = {&gen}, *who; CHECK(!mg_running(g, 1, PART, 5, &who) && !who); }

    /* The guard: MODE turned on while the generator was away is off again once it returns. */
    generator_row[0] = 0; mg_tick();
    U8(PART + 0x3e2u + 32u * T + 14u) = 6;
    generator_row[0] = (uintptr_t)&gen; mg_tick();
    CHECK(U8(PART + 0x3e2u + 32u * T + 14u) == 0);

    /* OFF: the generator leaves and stock's arpeggiator defaults come back. */
    put_u32(0x460d1684u, 0); mg_tick();
    put_u32(0x400bc6c0u, 0x46c7d34cu); mg_tick(); CHECK(pushed == mg_list_layer && mg_cursor == 1);
    key(0x33); CHECK(mg_cursor == 0);
    key(0x31); CHECK(on_state == 0 && U8(PART + 0x1822u + 2u * T) == 0xff && U8(PART + 0x1823u + 2u * T) == 0xff);
    CHECK(!masked);

    if (failures) { fprintf(stderr, "%u failure(s)\n", failures); return 1; }
    puts("midi generators: ok");
    return 0;
}
