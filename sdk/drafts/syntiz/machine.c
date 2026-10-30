/* SPDX-License-Identifier: MIT
 * SYNTIZ as a track machine: one row of the base's machine chooser (the ot_machines table), its three pages and
 * its render. The stock RAM and ROM it reads are the ones Analog BD (control.c) and FM Synth (poly.s) read the
 * same way; INTEGRATION.md cites them. The model is the signature's version byte: 1 SAW, 2 PULSE, 3 ENS, 4 TABLE,
 * 5 MORPH, 6 CHOIR. */
#include <stdint.h>
#include "engine.h"
#include "machine_map.h"
#include "../../machines/octatrack/include/modwerk_events.h"

#define U8(a) (*(volatile uint8_t *)(uintptr_t)(a))
#define U32(a) (*(volatile uint32_t *)(uintptr_t)(a))
#define BANK 0x46c82456u            /* the bank blob */
#define PART_OFF 0x8ed80u
#define PART_STRIDE 6322u
#define PART_IDX 0x100b14cfu        /* the current Part: its low two bits */
#define SIG 60u                     /* a track's signature at Part + 60 + 30 t: 'W', 'V', 1 + model */
#define CURSOR 0x80001c80u          /* the packer's source cursor */
#define FP_PTR 0x800062a8u          /* the rendered track's record: SRC A-F halfwords, locks, LFOs and scenes applied */
#define LANE 0x80000810u            /* the frame builder's current values, 72 bytes a track: SRC SETUP at +0x20 */
#define EVENTS 0x46104d0cu          /* a byte a track: bit 4, a voice starts this frame */
#define CURVE 0x400aa294u           /* stock's 2^(x/12) curve, longs Q26 */
#define FLEX_DESC 0x400d3176u       /* stock's FLEX page record, 0x38 bytes before the page itself */
#define DESC_BYTES 0x1cau
#define SETUP_ALL 16u               /* a base with #943 lets encoder E edit SRC SETUP's slot 10; older bases ignore it */

static uint8_t *part_base(void)
{
    return (uint8_t *)(uintptr_t)(U32(BANK) + PART_OFF + (U8(PART_IDX) & 3u) * PART_STRIDE);
}
static unsigned model_of(const volatile uint8_t *part, unsigned track)
{
    unsigned v = part[SIG + 30u * track + 2u];
    return v >= 1u && v <= WAVE_MODELS ? v - 1u : WAVE_SAW;
}

/* ---- the pages ---------------------------------------------------------------------------------------- */

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
static void signed_text(char *out, int v)
{
    unsigned i = 0, a = (unsigned)(v < 0 ? -v : v);
    out[i++] = v < 0 ? '-' : v > 0 ? '+' : ' ';
    if (a >= 10u) out[i++] = (char)('0' + a / 10u);
    out[i++] = (char)('0' + a % 10u);
    out[i] = 0;
}
/* Formatters, called with the stored value (every SYNTIZ slot's minimum is 0). */
void wave_fmt_fine(char *out, int v) { signed_text(out, v - 64); }
void wave_fmt_oct(char *out, int v) { signed_text(out, v - 3); }
void wave_fmt_switch(char *out, int v) { text((uint8_t *)out, v ? "ON" : "OFF", 4); }
void wave_fmt_table(char *out, int v) { text((uint8_t *)out, wave_table_name((unsigned)v >> 2), 5); }
void wave_fmt_note(char *out, int v)
{
    if (v == 24) text((uint8_t *)out, "OFF", 4);
    else signed_text(out, v - 24);
}

enum { F_NUM, F_FINE, F_OCT, F_SWITCH, F_NOTE, F_TABLE };
typedef struct { const char *label; uint8_t count, def, fmt; } Slot;
/* Slots 1-11 (slot 0 is stock's PTCH, kept as it is). A count of 0 hides the slot. */
static const Slot slots[WAVE_MODELS][11] = {
    [WAVE_SAW] = { { "DET", 128, 24, F_NUM }, { "UNI", 128, 0, F_NUM }, { "WIDE", 128, 0, F_NUM }, { "SUB", 128, 0, F_NUM },
                   { "SUB2", 128, 0, F_NUM }, { "FINE", 128, 64, F_FINE }, { "OCT", 7, 3, F_OCT }, { "DRIV", 128, 64, F_NUM },
                   { "RTRG", 2, 0, F_SWITCH }, { "", 0, 0, F_NUM }, { "", 0, 0, F_NUM } },
    [WAVE_PULSE] = { { "PW", 128, 64, F_NUM }, { "PWM", 128, 0, F_NUM }, { "PWS", 128, 0, F_NUM }, { "SUB", 128, 0, F_NUM },
                     { "SUB2", 128, 0, F_NUM }, { "FINE", 128, 64, F_FINE }, { "OCT", 7, 3, F_OCT }, { "DRIV", 128, 64, F_NUM },
                     { "RTRG", 2, 0, F_SWITCH }, { "DET", 128, 16, F_NUM }, { "UNI", 128, 0, F_NUM } },
    [WAVE_ENS] = { { "NOT2", 49, 24, F_NOTE }, { "NOT3", 49, 24, F_NOTE }, { "NOT4", 49, 24, F_NOTE }, { "SHAP", 128, 0, F_NUM },
                   { "CHOR", 128, 64, F_NUM }, { "FINE", 128, 64, F_FINE }, { "OCT", 7, 3, F_OCT }, { "DRIV", 128, 64, F_NUM },
                   { "RTRG", 2, 0, F_SWITCH }, { "SUB", 128, 0, F_NUM }, { "SUB2", 128, 0, F_NUM } },
    [WAVE_TABLE] = { { "TABL", 128, 0, F_TABLE }, { "MORF", 128, 0, F_NUM }, { "MSWP", 128, 0, F_NUM }, { "SYNC", 128, 0, F_NUM },
                     { "SUB", 128, 0, F_NUM }, { "FINE", 128, 64, F_FINE }, { "OCT", 7, 3, F_OCT }, { "DRIV", 128, 64, F_NUM },
                     { "RTRG", 2, 0, F_SWITCH }, { "SUB2", 128, 0, F_NUM }, { "", 0, 0, F_NUM } },
    [WAVE_MORPH] = { { "WAV1", 128, 8, F_TABLE }, { "MIX", 128, 64, F_NUM }, { "WAV2", 128, 24, F_TABLE }, { "WID", 128, 0, F_NUM },
                     { "TIME", 128, 0, F_NUM }, { "FINE", 128, 64, F_FINE }, { "OCT", 7, 3, F_OCT }, { "DRIV", 128, 64, F_NUM },
                     { "RTRG", 2, 0, F_SWITCH }, { "BIT1", 128, 0, F_NUM }, { "BIT2", 128, 0, F_NUM } },
    [WAVE_CHOIR] = { { "NOT2", 49, 24, F_NOTE }, { "NOT3", 49, 24, F_NOTE }, { "NOT4", 49, 24, F_NOTE }, { "TABL", 128, 108, F_TABLE },
                     { "CHOR", 128, 64, F_NUM }, { "FINE", 128, 64, F_FINE }, { "OCT", 7, 3, F_OCT }, { "DRIV", 128, 64, F_NUM },
                     { "RTRG", 2, 0, F_SWITCH }, { "SUB", 128, 0, F_NUM }, { "SUB2", 128, 0, F_NUM } },
};
/* The footer reads "<this> > <label>" in 18 characters, as stock's "SRC > FLEX": the model joins the page name. */
static const char *const full_names[WAVE_MODELS] = { "SRC SAW", "SRC PULSE", "SRC ENS", "SRC TABLE", "SRC MORPH",
                                                     "SRC CHOIR" };

/* The twelve bytes a track takes when it becomes SYNTIZ: SAW's, PTCH at stock's neutral 64. */
const uint8_t wave_part_defaults[12] = { 64, 24, 0, 0, 0, 0, 64, 3, 64, 0, 0, 0 };

static uint8_t desc[WAVE_MODELS][DESC_BYTES];
static uint8_t built;
/* Each model's page: stock's FLEX record copied at run time (never shipped), PTCH kept, the other eleven slots
 * named, ranged and formatted here. Offsets from the page P = record + 0x38: short name +4, full name +9,
 * labels +0x16 + 6 i, defaults +0x5e + i, minimum +0x6a + 4 i, count +0x9a + 4 i, formatter +0xca + 4 i,
 * widget +0xfa + 4 i, knob handler +0x12a + 4 i, enable nibbles +0x18e (slots 0-7) and +0x18a (slots 8-11). */
/* One model a call, from its number: a loop over the three pages lets the compiler run a pointer past the
 * module's end, which the builder refuses (it cannot relocate it). */
static __attribute__((noinline)) void build_page(unsigned m)
{
    static void (*const fmts[])(char *, int) = { 0, wave_fmt_fine, wave_fmt_oct, wave_fmt_switch, wave_fmt_note, wave_fmt_table };
    const volatile uint8_t *src = (const volatile uint8_t *)(uintptr_t)FLEX_DESC;
    uint8_t *d = desc[m], *p = d + 0x38;
    for (unsigned i = 0; i < DESC_BYTES; ++i) d[i] = src[i];
    text(p + 4, "SYNT", 5), text(p + 9, full_names[m], 13);
    uint32_t lo = 1u, hi = 0;           /* slot 0, PTCH, stays stock's and enabled */
    for (unsigned i = 1; i < 12u; ++i) {
        const Slot *s = &slots[m][i - 1];
        text(p + 0x16 + 6 * i, s->label, 6);
        p[0x5e + i] = s->def;
        put32(p + 0x6a + 4 * i, 0);
        put32(p + 0x9a + 4 * i, s->count);
        put32(p + 0xca + 4 * i, (uint32_t)(uintptr_t)fmts[s->fmt]);
        put32(p + 0xfa + 4 * i, 0);
        put32(p + 0x12a + 4 * i, 0);
        if (s->count) { if (i < 8u) lo |= 1u << (4 * i); else hi |= 1u << (4 * (i - 8)); }
    }
    put32(p + 0x18e, lo), put32(p + 0x18a, hi);
}
static uint32_t page_of(unsigned model)
{
    if (!built) build_page(0), build_page(1), build_page(2), build_page(3), build_page(4), build_page(5), built = 1;
    return (uint32_t)(uintptr_t)(desc[model < WAVE_MODELS ? model : 0] + 0x38);
}
/* slot is the track's type byte, Part + 0x22 + t, in the current Part; anything else shows SAW's page. */
uint32_t wave_track_page(const volatile uint8_t *slot)
{
    uint8_t *part = part_base();
    uintptr_t t = (uintptr_t)slot - (uintptr_t)(part + 0x22);
    return page_of(t < 8u ? model_of(part, (unsigned)t) : WAVE_SAW);
}

unsigned wave_admit_track(const volatile uint8_t *part, unsigned track)
{
    (void)part;
    return track < 8u;
}

/* ---- the render --------------------------------------------------------------------------------------- */

static Wave voices[8];
static uint8_t ready;                   /* a bit a track: its oscillators were reset */

/* Called twice a frame for each SYNTIZ track, before and after its event's sample offset (the second call has
 * end == 16). It writes the header stock's packer expects at the cursor (source count, ring write position,
 * rate 1.0 in Q26, read position) and the samples as L and R longs, the sample in the high half. */
int wave_render_track(unsigned track, unsigned ping, unsigned start, unsigned end)
{
    (void)ping;
    volatile uint32_t *h = (volatile uint32_t *)(uintptr_t)U32(CURSOR);
    unsigned n = end > start && end <= 16u ? end - start : 0u;
    h[0] = n, h[1] = start, h[2] = 0x04000000u, h[3] = start << 26;
    if (n && track < 8u) {
        if (!(ready >> track & 1u)) wave_reset(&voices[track]), ready |= (uint8_t)(1u << track);
        const volatile uint16_t *fp = (const volatile uint16_t *)(uintptr_t)U32(FP_PTR);
        const volatile uint8_t *lane = (const volatile uint8_t *)(uintptr_t)(LANE + 72u * track + 0x20u);
        uint8_t src[6], setup[6];
        for (unsigned k = 0; k < 6u; ++k) src[k] = (uint8_t)(fp[k] >> 8), setup[k] = lane[k];
        WaveControls c;
        wave_controls_of(&c, model_of(part_base(), track), src, setup);
        Wave *w = &voices[track];
        if (end == 16u && U8(EVENTS + track) & 16u) wave_note(w, &c);
        int16_t b[16];
        wave_render(w, &c, wave_increment(fp[0], setup[0], setup[1], (const volatile uint32_t *)(uintptr_t)CURVE), b, n);
        for (unsigned k = 0; k < n; ++k) h[4 + 2 * k] = h[5 + 2 * k] = (uint32_t)(uint16_t)b[k] << 16;
    }
    U32(CURSOR) = (uint32_t)(uintptr_t)(h + 4 + 2 * n);
    return 0;
}

/* ---- the model list ----------------------------------------------------------------------------------- */
/* RIGHT or a double tap of the track key on SYNTIZ's row opens the models in stock's sample-pool list
 * window, driven by stock's list controller (arrows, LEVEL, YES, NO); LEFT goes back to the machine column. Adapted from Analog BD's engine browser
 * (sdk/octabam/modules/analog-bassdrum/control.c, MIT, repeat98): the same stock window, list and redraw calls,
 * and the same dirty flags and bank notification as stock's SRC SETUP editor. */
#define TRACK_NOW 0x100b14ccu           /* the current track */
#define SRAM_PART 0x100a4eceu           /* the battery-backed Part copies, PART_STRIDE apart */
#define LIST 0x460e5e38u                /* stock's generic list: its controller state */
#define LIST_HANDLERS 0x460e5e28u       /* YES calls handlers[row] */
#define LIST_LABELS 0x460e5e2cu         /* the list's identity: our labels while it is ours */
#define LIST_WINDOW 0x460e5e30u
#define LIST_ROW 0x460e5e40u
#define DSP_WORDS 0x80000a50u           /* a track's DSP halfwords, 64 bytes a track: SRC A-F at +2 k, value << 8;
                                         * what the render reads, written beside the live lane as a lock is
                                         * (octabam's STEP_LOCKS.md) */
static const char *const model_labels[WAVE_MODELS] = { "001 SAW", "002 PULSE", "003 ENS", "004 TABLE", "005 MORPH",
                                                      "006 CHOIR" };
static uint32_t list_bank;
static unsigned list_part, list_track;

static void call0(uint32_t f) { ((void (*)(void))(uintptr_t)f)(); }

/* The new model: the signature's version byte, the model's own controls back to its defaults (PTCH and
 * SETUP A-D, which every model shares, stay), in both Part copies, the live lane and, for SRC, the DSP
 * halfwords: the lane alone left the render on the old model's values (PULSE played SAW's DET as PW). */
static void model_select(unsigned model)
{
    if (model >= WAVE_MODELS || U32(BANK) != list_bank || (U8(PART_IDX) & 3u) != list_part ||
        U8(TRACK_NOW) != list_track) return;
    uint8_t *part = part_base();
    volatile uint8_t *mirror = (volatile uint8_t *)(uintptr_t)(SRAM_PART + PART_STRIDE * list_part);
    unsigned t = list_track, sig = SIG + 30u * t + 2u;
    if (part[sig] < 1u || part[sig] > WAVE_MODELS) return;
    part[sig] = mirror[sig] = (uint8_t)(1u + model);
    for (unsigned k = 1; k < 12u; ++k) {
        if (k >= 6u && k < 10u) continue;
        unsigned at = (k < 6u ? 0x2au : 0x1dau) + 30u * t + 6u + k % 6u;
        uint8_t v = slots[model][k - 1u].def;
        part[at] = mirror[at] = v;
        U8(LANE + 72u * t + (k < 6u ? k : 0x20u + k - 6u)) = v;
        if (k < 6u) *(volatile uint16_t *)(uintptr_t)(DSP_WORDS + 64u * t + 2u * k) = (uint16_t)(v << 8);
    }
    U8(list_bank + 0x95048u) |= (uint8_t)(1u << list_part);
    U8(0x100b145eu) |= (uint8_t)(1u << list_part);
    U32(list_bank + 0x9b332u) = 1;
    U32(0x100f8598u) = 1;
    call0(0x40027e00u);
    call0(0x4004d948u);
}
static void model_saw(void) { model_select(WAVE_SAW); }
static void model_pulse(void) { model_select(WAVE_PULSE); }
static void model_ens(void) { model_select(WAVE_ENS); }
static void model_table(void) { model_select(WAVE_TABLE); }
static void model_morph(void) { model_select(WAVE_MORPH); }
static void model_choir(void) { model_select(WAVE_CHOIR); }

/* The rows, drawn into the window stock opened; 0 when the open list is not ours. */
unsigned wave_models_draw(void)
{
    uint32_t window = U32(LIST_WINDOW);
    if (!window || U32(LIST_LABELS) != (uint32_t)(uintptr_t)model_labels) return 0;
    void *surface = (void *)(uintptr_t)(window + 0x24);
    ((void (*)(void *))(uintptr_t)0x4003567cu)(surface);
    int height = (int)U32(window + 0x28);
    for (unsigned row = 0; row < WAVE_MODELS; ++row) {
        int y = height - 23 - 7 * (int)row;
        ((void (*)(uint32_t, void *, int, int, int, const char *))(uintptr_t)0x40012bd8u)
            (0x400ba876u, surface, 5, y, -1, model_labels[row]);
        if (row == U32(LIST_ROW))
            ((void (*)(void *, int, int, int, int, int))(uintptr_t)0x40012254u)
                (surface, 3, y - 1, (int)U32(window + 0x24) - 5, y + 5, -1);
    }
    U32(0x46c7c72cu) = 1;
    return 1;
}
void wave_pool_open(void)
{
    static void (*const handlers[WAVE_MODELS])(void) = { model_saw, model_pulse, model_ens, model_table, model_morph,
                                                          model_choir };
    if (U32(LIST_WINDOW) || U8(TRACK_NOW) >= 8u) return;
    list_bank = U32(BANK), list_part = U8(PART_IDX) & 3u, list_track = U8(TRACK_NOW);
    uint8_t *part = part_base();
    if (part[SIG + 30u * list_track] != 'W' || part[SIG + 30u * list_track + 1u] != 'V') return;
    ((void (*)(uint32_t, unsigned, unsigned))(uintptr_t)0x4007ec60u)(LIST, 6, WAVE_MODELS);
    ((void (*)(uint32_t, unsigned))(uintptr_t)0x4007edb0u)(LIST, model_of(part, list_track));
    U32(LIST_HANDLERS) = (uint32_t)(uintptr_t)handlers;
    U32(LIST_LABELS) = (uint32_t)(uintptr_t)model_labels;
    U32(0x460e5e34u) = 0;
    uint32_t window = ((uint32_t (*)(int, int, int, int, int, uint32_t))(uintptr_t)0x4005829cu)(110, 64, -1, 0, 1, 0x4006d754u);
    U32(LIST_WINDOW) = window;
    if (!window) return;
    ((void (*)(uint32_t, const char *, unsigned))(uintptr_t)0x400570b8u)(window, "\xab MACHINE:SYNTIZ", 0);
    ((void (*)(uint32_t))(uintptr_t)0x40031494u)(0x400ce0c4u);
    wave_models_draw();
}
/* LEFT in the model list (the base's choice_left): back to the machine column, as VECTOR's pool choice does
 * (sdk/octabam/modules/vector/native.c and hooks.s, MIT, repeat98): close the list, open stock's track window on
 * its pool (the two instructions the base displaced at 0x400791e4, then the rest), then stock's LEFT from the pool.
 * The base then puts the cursor back on SYNTIZ's row. */
void wave_stock_pool_open(void);
__asm__(
    "        .text\n"
    "        .globl  wave_stock_pool_open\n"
    "wave_stock_pool_open:\n"
    "        move.l  %a2,-(%sp)\n"
    "        tst.l   0x460e70e0\n"
    "        jmp     (0x400791ec).l\n");
void wave_choice_left(unsigned key, unsigned edge)
{
    (void)key, (void)edge;
    if (!U32(LIST_WINDOW) || U32(LIST_LABELS) != (uint32_t)(uintptr_t)model_labels) return;
    call0(0x4006d754u);
    wave_stock_pool_open();
    call0(0x4007893cu);
}

/* Entered as stock's list drawer (0x4006d784), registers and all, for any list while a SYNTIZ track is current:
 * ours draws ours, anything else goes on to stock's (its two displaced instructions, then the rest). */
void wave_list_draw(void);
__asm__(
    "        .text\n"
    "        .globl  wave_list_draw\n"
    "wave_list_draw:\n"
    "        lea     -16(%sp),%sp\n"
    "        movem.l %d0-%d1/%a0-%a1,(%sp)\n"
    "        jsr     wave_models_draw\n"
    "        tst.l   %d0\n"
    "        beq.s   1f\n"
    "        movem.l (%sp),%d0-%d1/%a0-%a1\n"
    "        lea     16(%sp),%sp\n"
    "        rts\n"
    "1:      movem.l (%sp),%d0-%d1/%a0-%a1\n"
    "        lea     16(%sp),%sp\n"
    "        lea     -24(%sp),%sp\n"
    "        movem.l %d2-%d3/%a2-%a5,(%sp)\n"
    "        jmp     (0x4006d78c).l\n");

/* ---- the row ------------------------------------------------------------------------------------------ */

const struct modwerk_machine wave_machine = {
    .abi = MODWERK_MACHINE_ABI,
    .sig = { 'W', 'V' }, .sig_lo = 1, .sig_hi = WAVE_MODELS,
    .label = "SYNTIZ",
    .flags = MODWERK_MACHINE_PROTECT | MODWERK_MACHINE_POOL | SETUP_ALL,
    .defaults = wave_part_defaults,
    .admit_track = wave_admit_track,
    .track_page = wave_track_page,
    .pool_open = wave_pool_open,
    .choice_left = wave_choice_left,
    .list_draw = wave_list_draw,
    .render = wave_render_track,
};
