/* SPDX-License-Identifier: MIT
 * Analog BD as a track machine: one row of the base's machine chooser (the ot_machines table), its two pages and its
 * render. The stock RAM and ROM it reads are the ones 0.1.x's control.c read (and SYNTIZ's machine.c reads the same
 * way). The model is the TYPE switch, SRC SETUP's first slot: 0 808, 1 909. */
#include <stdint.h>
#include "drum.h"
#include "../../../machines/octatrack/include/modwerk_events.h"

#define U8(a) (*(volatile uint8_t *)(uintptr_t)(a))
#define U32(a) (*(volatile uint32_t *)(uintptr_t)(a))
#define BANK 0x46c82456u            /* the bank blob */
#define PART_OFF 0x8ed80u
#define PART_STRIDE 0x18b2u
#define PART_IDX 0x100b14cfu        /* the current Part: its low two bits */
#define TRACK_NOW 0x100b14ccu       /* the current track */
#define SRAM_PART 0x100a4eceu       /* the battery-backed Part copies, PART_STRIDE apart */
#define SIG 60u                     /* a track's signature at Part + 60 + 30 t: 'A', 'B', 1 */
#define SETUP 0x1dau                /* a track's SRC SETUP bytes at Part + SETUP + 30 t + 6 */
#define CURSOR 0x80001c80u          /* the packer's source cursor */
#define FP_PTR 0x800062a8u          /* the rendered track's record: SRC A-F halfwords, locks, LFOs and scenes applied */
#define LANE 0x80000810u            /* the frame builder's current values, 72 bytes a track: SRC SETUP at +0x20 */
#define EVENTS 0x46104d0cu          /* a byte a track: bit 4, a voice starts this frame */
#define FLEX_DESC 0x400d3176u       /* stock's FLEX page record, 0x38 bytes before the page itself */
#define DESC_BYTES 0x1cau
#define SWITCH 0x40046f10u          /* stock's two-state switch widget (AMP SETUP's SYNC) */
#define OFF_ON 0x4003c14cu          /* ... and its OFF / ON words */
#define SILENT 0x400047f0u          /* stock's silent source */
#define DSP_WORDS 0x80000a50u       /* a track's DSP halfwords, 64 bytes a track: SRC A-F at +2 k, value << 8; what the
                                     * render reads, written beside the live lane as a lock is (SYNTIZ's machine.c) */

typedef int Render(unsigned track, unsigned ping, unsigned start, unsigned end);

/* The base's raised ev_trig_muted: which tracks' new trigs a mute module drops now (machines.md). The loader puts the
 * base's entry in this zero word at install; a base without the hook leaves it 0, and every trig plays, as stock. */
modwerk_ev_trig_muted *raise_ev_trig_muted __attribute__((section(".data"))) = 0;

static volatile uint8_t *part_base(void)
{
    return (volatile uint8_t *)(uintptr_t)(U32(BANK) + PART_OFF + (U8(PART_IDX) & 3u) * PART_STRIDE);
}
static unsigned signed_track(const volatile uint8_t *part, unsigned t)
{
    const volatile uint8_t *s = part + SIG + 30u * t;
    return t < 8u && part[0x22u + t] == 1u && s[0] == 'A' && s[1] == 'B' && s[2] == 1u;
}

/* ---- the pages ---------------------------------------------------------------------------------------------------- */

static void text(uint8_t *p, const char *s, unsigned n)
{
    unsigned i = 0;
    for (; i + 1u < n && s[i]; ++i) p[i] = (uint8_t)s[i];
    for (; i < n; ++i) p[i] = 0;
}
static void put32(uint8_t *p, uint32_t v)
{
    p[0] = (uint8_t)(v >> 24), p[1] = (uint8_t)(v >> 16), p[2] = (uint8_t)(v >> 8), p[3] = (uint8_t)v;
}
void ab_model_fmt(char *out, int value) { text((uint8_t *)out, value ? "909" : "808", 4); }

/* Slots 5 (SAT), 9-11 (LOW, HIGH, LPF) were 0.1.x's desk: 0.2.0 shows them not, and keeps their bytes. */
static const char *const names[2][12] = {
    {"PTCH", "DCAY", "TONE", "ATK", "SWEP", "", "TYPE", "FIXD", "ACNT", "", "", ""},
    {"PTCH", "DCAY", "TUNE", "ATK", "TDEP", "", "TYPE", "FIXD", "ACNT", "", "", ""},
};
static uint8_t desc[2][DESC_BYTES];
static uint8_t built;
/* Each model's page: stock's FLEX record copied at run time (never shipped), every slot named and ranged here.
 * Offsets from the page P = record + 0x38: short name +4, full name +9, labels +0x16 + 6 i, defaults +0x5e + i,
 * minimum +0x6a + 4 i, count +0x9a + 4 i, formatter +0xca + 4 i, widget +0xfa + 4 i, knob handler +0x12a + 4 i,
 * enable nibbles +0x18e (slots 0-7) and +0x18a (slots 8-11). One model a call (a loop over both pages lets the
 * compiler run a pointer past the module's end, which the builder refuses). */
static __attribute__((noinline)) void build_page(unsigned m)
{
    const volatile uint8_t *src = (const volatile uint8_t *)(uintptr_t)FLEX_DESC;
    uint8_t *d = desc[m], *p = d + 0x38;
    for (unsigned i = 0; i < DESC_BYTES; ++i) d[i] = src[i];
    text(p + 4, "SYN", 5), text(p + 9, "ANALOG BD", 13);
    uint32_t lo = 0, hi = 0;
    for (unsigned i = 0; i < 12u; ++i) {
        unsigned shown = names[m][i][0] != 0, two = i == AB_TYPE || i == AB_FIXD;
        text(p + 0x16 + 6 * i, names[m][i], 6);
        p[0x5e + i] = ab_defaults[i];
        put32(p + 0x6a + 4 * i, 0);
        put32(p + 0x9a + 4 * i, two ? 2u : 128u);
        put32(p + 0xca + 4 * i, i == AB_TYPE ? (uint32_t)(uintptr_t)ab_model_fmt : i == AB_FIXD ? OFF_ON : 0);
        put32(p + 0xfa + 4 * i, two ? SWITCH : 0);
        put32(p + 0x12a + 4 * i, 0);
        if (shown) { if (i < 8u) lo |= 1u << (4 * i); else hi |= 1u << (4 * (i - 8)); }
    }
    put32(p + 0x18e, lo), put32(p + 0x18a, hi);
}
static uint32_t page_of(unsigned model)
{
    if (!built) build_page(0), build_page(1), built = 1;
    return (uint32_t)(uintptr_t)(desc[model != 0] + 0x38);
}
/* slot is the track's type byte, Part + 0x22 + t. Until a track is Analog BD (SRC SETUP previews it on a FLEX
 * track), its TYPE slot holds FLEX's LOOP byte: preview the 808 page, the default the assignment gives. */
uint32_t ab_track_page(const volatile uint8_t *slot)
{
    volatile uint8_t *part = part_base();
    uintptr_t t = (uintptr_t)slot - (uintptr_t)(part + 0x22);
    return page_of(t < 8u && signed_track(part, (unsigned)t) ? part[SETUP + 30u * t + 6u] : 0);
}

/* A track that has just become Analog BD has its twelve bytes in the Part, but the live lane and the DSP halfwords the
 * render reads still hold the old machine's (FLEX's STRT as DCAY, its LEN as ACNT) until a knob moves: copy them over
 * once, on the tick after the track turns. A Part or bank change loads them from the Part itself. */
static void refresh(volatile uint8_t *part, unsigned t)
{
    for (unsigned k = 0; k < 12u; ++k) {
        uint8_t v = part[(k < 6u ? 0x2au : SETUP) + 30u * t + 6u + k % 6u];
        U8(LANE + 72u * t + (k < 6u ? k : 0x20u + k - 6u)) = v;
        if (k < 6u) *(volatile uint16_t *)(uintptr_t)(DSP_WORDS + 64u * t + 2u * k) = (uint16_t)(v << 8);
    }
}
static uint32_t seen_bank;
static uint8_t seen_part = 0xff, seen_mask;

/* TYPE (slot 6) and FIXD (slot 7) are two-state switches, which draw nothing for other values. A track set up with
 * 0.1.5 can hold one there (FIXD's slot was ACCNT's): put the current track's back in range, TYPE to 909 (0.1.5 played
 * any nonzero byte as 909) and FIXD to OFF, in both Part copies and the live controls, with the stock SRC SETUP
 * editor's dirty flags. */
void ab_ui_tick(void)
{
    if (U32(BANK) < 0x40000000u || U32(BANK) >= 0x48000000u) return;
    volatile uint8_t *part = part_base();
    unsigned track = U8(TRACK_NOW) & 7u, index = U8(PART_IDX) & 3u;
    uint8_t mask = 0;
    for (unsigned t = 0; t < 8u; ++t) mask |= (uint8_t)(signed_track(part, t) << t);
    if (U32(BANK) == seen_bank && index == seen_part)
        for (unsigned t = 0; t < 8u; ++t)
            if ((mask & ~seen_mask) >> t & 1u) refresh(part, t);
    seen_bank = U32(BANK), seen_part = (uint8_t)index, seen_mask = mask;
    if (!signed_track(part, track)) return;
    for (unsigned k = 0; k < 2u; ++k) {
        unsigned offset = SETUP + 30u * track + 6u + k;
        uint8_t value = part[offset];
        if (value <= 1u) continue;
        value = k ? 0 : 1;
        part[offset] = value;
        U8(SRAM_PART + PART_STRIDE * index + offset) = value;
        U8(LANE + 0x20u + 72u * track + k) = value;
        U8(U32(BANK) + 0x95048u) |= (uint8_t)(1u << index);
        U8(0x100b145eu) |= (uint8_t)(1u << index);
        U32(U32(BANK) + 0x9b332u) = 1;
        U32(0x100f8598u) = 1;
    }
}

/* ---- the render --------------------------------------------------------------------------------------------------- */

static AbVoice voices[8];
static uint8_t ready;                   /* a bit a track: its voice was reset */

/* Called twice a frame for each Analog BD track, before and after its event's sample offset (the second call has
 * end == 16). It writes the header stock's packer expects at the cursor (source count, ring write position, rate 1.0
 * in Q26, read position), then the samples as L and R longs. A voice whose hit is over hands the call to stock's
 * silent source, as the base does for a track it silences. */
int ab_render_track(unsigned track, unsigned ping, unsigned start, unsigned end)
{
    unsigned n = end > start && end <= 16u ? end - start : 0u;
    if (track >= 8u) return ((Render *)(uintptr_t)SILENT)(track, ping, start, end);
    AbVoice *v = &voices[track];
    if (!(ready >> track & 1u)) ab_reset(v), ready |= (uint8_t)(1u << track);
    int trig = end == 16u && U8(EVENTS + track) & 16u && !(raise_ev_trig_muted && raise_ev_trig_muted() >> track & 1u);
    if (!trig && v->state == AB_REST) return ((Render *)(uintptr_t)SILENT)(track, ping, start, end);
    volatile uint32_t *h = (volatile uint32_t *)(uintptr_t)U32(CURSOR);
    h[0] = n, h[1] = start, h[2] = 0x04000000u, h[3] = start << 26;
    if (n) {
        const volatile uint16_t *fp = (const volatile uint16_t *)(uintptr_t)U32(FP_PTR);
        const volatile uint8_t *lane = (const volatile uint8_t *)(uintptr_t)(LANE + 72u * track + 0x20u);
        uint8_t k[AB_PARAMS];
        for (unsigned i = 0; i < 6u; ++i) k[i] = (uint8_t)(fp[i] >> 8), k[6 + i] = lane[i];
        ab_render(v, k, trig, (uint32_t *)(uintptr_t)(h + 4), n);
    }
    U32(CURSOR) = (uint32_t)(uintptr_t)(h + 4 + 2 * n);
    return 0;
}

/* ---- the row ------------------------------------------------------------------------------------------------------ */

const struct modwerk_machine ab_machine = {
    .abi = MODWERK_MACHINE_ABI,
    .sig = {'A', 'B'}, .sig_lo = 1, .sig_hi = 1,
    .label = "ANALOG BD",
    .flags = MODWERK_MACHINE_PROTECT | MODWERK_MACHINE_LIST,
    .defaults = ab_defaults,
    .track_page = ab_track_page,
    .ui_tick = ab_ui_tick,
    .render = ab_render_track,
};
