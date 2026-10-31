/* SPDX-License-Identifier: GPL-3.0-or-later
 * BREAKCUT on the Octatrack's Flex tracks: a track machine (sdk/machines/octatrack/events.json ot_machines), the
 * shape of VECTOR's native.c over the Modwerk base. A BACKING machine: the track's sliced break plays
 * as stock (SRC SETUP's SLIC on), and BREAKCUT writes Livecut's cuts as the track's trigs and PTCH, STRT, RATE, RTRG
 * and RTIM locks, with micro-timing; the stock sequencer plays them. Its six controls take the SRC page; SRC SETUP
 * stays the backing pool's own; a push on LEVEL shows stock's sample controls; holding a trig or a scene shows stock's
 * page. Its settings live in the Part's unused NEIGHBOR slots (0x3c + 30 t: 'B', 'C', version, three bytes; 0x1ec +
 * 30 t: six bytes), seven bits a byte. The UI task only. Stock addresses: OS 1.40C, as VECTOR's native.c and the
 * base's machine_registry.c name them. */
#include "engine.h"
#if __has_include("../../../machines/octatrack/include/modwerk_events.h")
#include "../../../machines/octatrack/include/modwerk_events.h"
#else
#include "../../machines/octatrack/include/modwerk_events.h"
#endif

#define U8(a) (*(volatile uint8_t *)(uintptr_t)(a))
#define U32(a) (*(volatile uint32_t *)(uintptr_t)(a))
#define BANK_PTR 0x46c82456u
#define PART_IDX 0x100b14cfu
#define TRACK_IDX 0x100b14ccu
#define PATTERN_IDX 0x100b14d0u
#define PART_OFF 0x8ed80u
#define PART_STRIDE 0x18b2u
#define PATTERN_STRIDE 0x8ed8u
#define SRAM_PART 0x100a4eceu
#define SRAM_PATTERNS 0x1001614eu
#define KEY_CACHE 0x46c7d8deu
#define LAYERS 0x460d165cu
#define PAGE_KIND 0x46c7d8d8u
#define SCREEN_DIRTY 0x46c7c72cu
#define FLEX_PAGE 0x400d31aeu
#define STATIC_PAGE 0x400d301cu
#define SIGNATURE 0x3cu
#define SETTINGS2 0x1ecu
#define LOCK_INDEX 0x46c7d48cu            /* stock's per-step lock index of the audio tracks: bit t */
#define MACHINE_VERSION 1u

enum { C_ALGO, C_SLCS, C_ACTV, C_ROLL, C_RAMP, C_REV, C_COUNT };
static const char *const names[C_COUNT] = {"ALGO", "SLCS", "ACTV", "ROLL", "RAMP", "REV"};
static const uint8_t control_min[C_COUNT] = {0, 1, 0, 0, 0, 0}, control_max[C_COUNT] = {3, 64, 127, 127, 24, 127};

static unsigned valid_bank(void) { uint32_t b = U32(BANK_PTR); return b >= 0x40000000u && b < 0x47f00000u; }
static volatile uint8_t *current_part(void) { return (volatile uint8_t *)(uintptr_t)(U32(BANK_PTR) + PART_OFF + (U8(PART_IDX) & 3u) * PART_STRIDE); }
static unsigned signed_track(const volatile uint8_t *part, unsigned t)
{
    const volatile uint8_t *sig = part + SIGNATURE + 30u * t;
    return t < 8u && part[0x22u + t] < 2u && sig[0] == 'B' && sig[1] == 'C' && sig[2] == MACHINE_VERSION;
}
static void dirty_part(void)
{
    unsigned p = U8(PART_IDX) & 3u;
    U8(U32(BANK_PTR) + 0x95048u) |= (uint8_t)(1u << p);
    U8(0x100b145eu) |= (uint8_t)(1u << p);
    U32(U32(BANK_PTR) + 0x9b332u) = 1; U32(0x100f8598u) = 1;
    ((void (*)(void))0x40027e00u)();
}
static void redraw(void) { ((void (*)(int))0x4004d948u)(-1); U32(SCREEN_DIRTY) = 1; }
static void notice(const char *message) { ((void (*)(const char *, unsigned))0x4005a2b8u)(message, 32); }
static unsigned key_held(unsigned key) { return (U8(0x46100b18u + (key >> 3)) >> (key & 7u)) & 1u; }

static unsigned setting_at(unsigned t, unsigned k) { return (k < 3u ? SIGNATURE + 3u + k : SETTINGS2 + k - 3u) + 30u * t; }
static void settings(unsigned t, BcParams *p)
{
    uint8_t packed[BC_PACKED];
    const volatile uint8_t *part = current_part();
    for (unsigned k = 0; k < BC_PACKED; ++k) packed[k] = part[setting_at(t, k)];
    bc_unpack(p, packed);
}
static void save_settings(unsigned t, const BcParams *p)
{
    uint8_t packed[BC_PACKED];
    volatile uint8_t *part = current_part();
    unsigned mirror = SRAM_PART + (U8(PART_IDX) & 3u) * PART_STRIDE;
    bc_pack(packed, p);
    for (unsigned k = 0; k < BC_PACKED; ++k) { unsigned at = setting_at(t, k); part[at] = packed[k]; U8(mirror + at) = packed[k]; }
}
static unsigned control(const BcParams *p, unsigned c)
{
    switch (c) {
    case C_ALGO: return p->algo; case C_SLCS: return p->slices; case C_ACTV: return p->actv;
    case C_ROLL: return p->roll; case C_RAMP: return p->ramp; default: return p->rev;
    }
}
static void set_control(BcParams *p, unsigned c, unsigned v)
{
    switch (c) {
    case C_ALGO: p->algo = (uint8_t)v; break; case C_SLCS: p->slices = (uint8_t)v; break; case C_ACTV: p->actv = (uint8_t)v; break;
    case C_ROLL: p->roll = (uint8_t)v; break; case C_RAMP: p->ramp = (uint8_t)v; break; default: p->rev = (uint8_t)v; break;
    }
}
static void copy_params(BcParams *to, const BcParams *from)
{
    const uint8_t *f = (const uint8_t *)from; uint8_t *t = (uint8_t *)to;
    for (unsigned k = 0; k < sizeof *to; ++k) t[k] = f[k];
}

static BcLine line;
/* On the UI task, into the current pattern's record and its battery-backed copy; only this track's bit of stock's
 * lock index, then stock's track update, as VECTOR 0.3.0. A fresh seed is kept only once its pattern is written. */
static int generate(unsigned t, int replace, int fresh)
{
    unsigned p = U8(PATTERN_IDX);
    if (!valid_bank() || t >= 8u || p >= 16u || !signed_track(current_part(), t)) return 0;
    uint32_t bank = U32(BANK_PTR), off = p * PATTERN_STRIDE + t * BC_TRACK_BYTES;
    uint8_t *r = (uint8_t *)(uintptr_t)(bank + off), *mirror = (uint8_t *)(uintptr_t)(SRAM_PATTERNS + off);
    if (!replace && !bc_track_empty(r)) return 0;
    const volatile uint8_t *pat = (const volatile uint8_t *)(uintptr_t)(bank + p * PATTERN_STRIDE);
    unsigned length = pat[0x8e55u] ? r[0x50u] : pat[0x8e53u];
    BcParams params;
    settings(t, &params);
    if (fresh) params.seed = (uint8_t)bc_next_seed(params.seed);
    if (!length || length > BC_STEPS || !bc_generate(&line, &params, length)) return 0;
    static uint8_t locked[BC_STEPS];
    bc_write(r, mirror, &line, locked);
    if (fresh) save_settings(t, &params);
    dirty_part();
    for (unsigned i = 0; i < BC_STEPS; ++i)
        U8(LOCK_INDEX + i) = (uint8_t)((U8(LOCK_INDEX + i) & ~(1u << t)) | (unsigned)locked[i] << t);
    ((void (*)(unsigned))0x4009da20u)(t);
    return 1;
}

/* The page: stock's FLEX or STATIC descriptor with BREAKCUT's six controls in the SRC cells (stock's dial renderer,
 * our angle and formatter), as VECTOR's generator page; SRC SETUP's cells stay stock's. */
static uint8_t page[0x192];
static uint32_t page_source;
static uint32_t edit_view, active, layer_gen, shown_bank, shown_part, shown_track, mine;
static uint32_t saved[2][3];
static void copy_text(char *out, const char *text) { unsigned i = 0; do out[i] = text[i]; while (text[i++]); }
static unsigned put_number(char *out, unsigned v)
{
    unsigned i = 0;
    if (v >= 100) out[i++] = (char)('0' + v / 100);
    if (v >= 10) out[i++] = (char)('0' + v / 10 % 10);
    out[i++] = (char)('0' + v % 10); out[i] = 0;
    return i;
}
static void format_control(char *out, unsigned c)
{
    BcParams p; settings(U8(TRACK_IDX), &p);
    unsigned v = control(&p, c);
    if (c == C_ALGO) { copy_text(out, bc_algo_names[v & 3u]); return; }
    if (c == C_REV && !v) { copy_text(out, "OFF"); return; }
    if (c == C_RAMP) { /* -12..+12 semitones */
        if (v == 12u) { copy_text(out, "0"); return; }
        out[0] = v < 12u ? '-' : '+';
        put_number(out + 1, v < 12u ? 12u - v : v - 12u);
        return;
    }
    put_number(out, v);
}
#define FORMATTER(n) static void format_##n(char *out, int value) { (void)value; format_control(out, n); }
FORMATTER(0) FORMATTER(1) FORMATTER(2) FORMATTER(3) FORMATTER(4) FORMATTER(5)
static void main_widget(int x, int y, unsigned slot, int value, unsigned flags, void (*format)(char *, int), uint32_t canvas)
{
    (void)value;
    BcParams p; settings(U8(TRACK_IDX), &p);
    unsigned raw = control(&p, slot), max = control_max[slot];
    if (raw > max) raw = max;
    if (slot == C_SLCS) { raw -= 1u; max -= 1u; } /* 1-64 on the dial's full arc */
    ((void (*)(int, int, unsigned, int, unsigned, void (*)(char *, int), uint32_t))0x400479b4u)
        (x, y, slot, (int)(raw * 127u / max), flags & ~1u, format, canvas);
}
static void put32(uint8_t *d, uint32_t value) { d[0] = (uint8_t)(value >> 24); d[1] = (uint8_t)(value >> 16); d[2] = (uint8_t)(value >> 8); d[3] = (uint8_t)value; }
static void label(uint8_t *out, const char *text) { unsigned i = 0; for (; i < 5 && text[i]; ++i) out[i] = (uint8_t)text[i]; for (; i < 6; ++i) out[i] = 0; }
static uint32_t generator_page(uint32_t stock)
{
    static void (*const formats[6])(char *, int) = {format_0, format_1, format_2, format_3, format_4, format_5};
    if (page_source != stock) {
        const volatile uint8_t *source = (const volatile uint8_t *)(uintptr_t)stock;
        for (unsigned i = 0; i < sizeof page; ++i) page[i] = source[i];
        for (unsigned i = 0; i < 6; ++i) {
            label(page + 0x16 + 6 * i, names[i]);
            put32(page + 0xca + 4 * i, (uint32_t)(uintptr_t)formats[i]);
            put32(page + 0xfa + 4 * i, (uint32_t)(uintptr_t)main_widget);
        }
        put32(page + 0x18a, 0x00005555u); /* every cell drawn, as VECTOR's page */
        put32(page + 0x18e, 0x55555555u);
        page_source = stock;
    }
    return (uint32_t)(uintptr_t)page;
}
static unsigned selected(void) { return valid_bank() && !U8(0x80000015u) && signed_track(current_part(), U8(TRACK_IDX)); }
static unsigned generator_view(void) { return selected() && !edit_view && U8(PAGE_KIND) == 0 && !U32(0x460d173au) && !U32(0x460d1694u); }
static uint32_t stock_page(unsigned t) { return current_part()[0x22u + t] == 0u ? STATIC_PAGE : FLEX_PAGE; }
static uint32_t machine_track_page(const volatile uint8_t *slot)
{
    unsigned t = (unsigned)(slot - (current_part() + 0x22u));
    if (t >= 8u || !valid_bank()) return FLEX_PAGE;
    return t == U8(TRACK_IDX) && generator_view() ? generator_page(stock_page(t)) : stock_page(t);
}

static void change_control(unsigned c, int delta)
{
    unsigned t = U8(TRACK_IDX);
    BcParams p, before;
    settings(t, &p); copy_params(&before, &p);
    unsigned old = control(&p, c);
    int value = (int)old + delta;
    if (value < (int)control_min[c]) value = control_min[c];
    if (value > (int)control_max[c]) value = control_max[c];
    if ((unsigned)value == old) return;
    set_control(&p, c, (unsigned)value);
    save_settings(t, &p);
    if (!generate(t, 1, 0)) save_settings(t, &before);
    redraw();
}

/* The input layer, as TB-3PO's: encoders A-F on the generator view, YES (a new seed) and the LEVEL push (the
 * sample edit view) on both. */
static void machine_key(unsigned code, unsigned edge);
static void machine_knob(unsigned index, int delta);
struct key_entry { uint8_t code, pad; const void *press, *release, *repeat, *zero[2]; uint16_t tail[2]; } __attribute__((packed));
struct enc_entry { uint8_t index, pad; const void *turn, *zero[4]; } __attribute__((packed));
static const struct key_entry keys[3] = {
    {0x31, 0, machine_key, machine_key, machine_key, {0, 0}, {0, 0}},
    {0x3e, 0, machine_key, machine_key, machine_key, {0, 0}, {0, 0}},
    {0xff, 0, 0, 0, 0, {0, 0}, {0, 0}},
};
static const struct enc_entry encs[7] = {
    {0, 0, machine_knob, {0, 0, 0, 0}}, {1, 0, machine_knob, {0, 0, 0, 0}}, {2, 0, machine_knob, {0, 0, 0, 0}},
    {3, 0, machine_knob, {0, 0, 0, 0}}, {4, 0, machine_knob, {0, 0, 0, 0}}, {5, 0, machine_knob, {0, 0, 0, 0}},
    {0xff, 0, 0, {0, 0, 0, 0}},
};
#if UINTPTR_MAX == 0xffffffffu /* the unit's layout: 26- and 22-byte entries */
typedef char key_entry_is_26[sizeof(struct key_entry) == 26 ? 1 : -1], enc_entry_is_22[sizeof(struct enc_entry) == 22 ? 1 : -1];
#endif
static const void *gen_layer[7] = {0, keys, encs, 0, 0, (const void *)-1, (const void *)-1};
static const void *edit_layer[7] = {0, keys, 0, 0, 0, (const void *)-1, (const void *)-1};
static void forward(unsigned which, unsigned code, unsigned edge)
{
    uint32_t h = saved[which][edge == 1 ? 0 : edge == 0 ? 1 : 2];
    if (h && h != 0xffffffffu) ((void (*)(unsigned, unsigned))(uintptr_t)h)(code, edge);
}
static void machine_key(unsigned code, unsigned edge)
{
    unsigned which = code == 0x31 ? 0 : 1, mask = 1u << which;
    if (edge != 1 && (mine & mask)) { if (!edge) mine &= ~mask; return; }
    if (edge == 1 && selected() && !key_held(0x2d)) {
        if (code == 0x3e && U8(PAGE_KIND) == 0) { mine |= mask; edit_view = !edit_view; page_source = 0; redraw(); return; }
        if (code == 0x31 && generator_view()) {
            static char text[24];
            unsigned t = U8(TRACK_IDX);
            mine |= mask;
            if (generate(t, 1, 1)) {
                BcParams p; settings(t, &p);
                copy_text(text, "BREAKCUT SEED ");
                put_number(text + 14, p.seed);
                notice(text);
            } else notice("NO CHANGE");
            redraw(); return;
        }
    }
    forward(which, code, edge);
}
static void machine_knob(unsigned index, int delta)
{
    if (index >= 6u || !generator_view() || gen_layer[0]) return;
    change_control(index, delta);
}
/* Stock's handler for a key's press (0), release (1) or repeat (2), from its key cache; out of line so the address
 * is never folded into one of ours (the package builder takes such a word for a reference outside the module). */
static __attribute__((noinline)) uint32_t stock_handler(unsigned code, unsigned e) { return U32(KEY_CACHE + 24u * code + 4u * e); }
static void machine_ui_tick(void)
{
    unsigned want = 0;
    if (valid_bank()) for (unsigned t = 0; t < 8; ++t) want |= signed_track(current_part(), t);
    uint32_t bank = U32(BANK_PTR), part = U8(PART_IDX), track = U8(TRACK_IDX);
    unsigned changed = bank != shown_bank || part != shown_part || track != shown_track;
    const void **layer = layer_gen ? gen_layer : edit_layer;
    if (active && (!want || layer[0] || changed || layer_gen != generator_view())) {
        if (mine) return; /* a release always reaches the handler that took its press */
        ((void (*)(const void **))0x4003146cu)(layer); active = 0;
    }
    if (changed) { edit_view = 0; page_source = 0; }
    shown_bank = bank; shown_part = part; shown_track = track;
    if (!active) {
        volatile uint32_t *base = (volatile uint32_t *)(uintptr_t)U32(LAYERS);
        if (!want || !base || base[0]) return;
        for (unsigned k = 0; k < 2; ++k) for (unsigned e = 0; e < 3; ++e) {
            uint32_t handler = stock_handler(k ? 0x3e : 0x31, e);
            if (handler != (uint32_t)(uintptr_t)(const void *)machine_key) saved[k][e] = handler;
        }
        layer_gen = generator_view();
        layer = layer_gen ? gen_layer : edit_layer; layer[0] = 0;
        ((void (*)(const void **))0x40031494u)(layer); active = 1;
        redraw();
    }
}
/* The track becomes BREAKCUT (on) with the defaults and a first line on an empty track, or leaves it (off). Returns
 * the backing pool stock commits. */
static unsigned machine_assign(volatile uint8_t *part, unsigned t, unsigned on)
{
    if (!valid_bank() || t >= 8u) return 1;
    uint32_t offset = (uint32_t)(uintptr_t)part - U32(BANK_PTR) - PART_OFF;
    if (offset % PART_STRIDE || offset / PART_STRIDE >= 4u) return 1;
    volatile uint8_t *mirror = (volatile uint8_t *)(uintptr_t)(SRAM_PART + offset);
    unsigned pool = part[0x22u + t] < 2u ? part[0x22u + t] : 1u, sig = SIGNATURE + 30u * t, setup = SETTINGS2 + 30u * t;
    if (on && !signed_track(part, t)) {
        uint8_t packed[BC_PACKED];
        BcParams p;
        copy_params(&p, &bc_defaults);
        p.seed = (uint8_t)(t + 1u);
        bc_pack(packed, &p);
        part[sig] = 'B'; part[sig + 1] = 'C'; part[sig + 2] = MACHINE_VERSION;
        for (unsigned k = 0; k < BC_PACKED; ++k) part[k < 3 ? sig + 3 + k : setup + k - 3] = packed[k];
    } else if (!on && signed_track(part, t)) {
        part[sig] = part[sig + 1] = part[sig + 2] = 0;
    }
    for (unsigned k = 0; k < 6; ++k) { mirror[sig + k] = part[sig + k]; mirror[setup + k] = part[setup + k]; }
    if (on && part == current_part()) (void)generate(t, 0, 0);
    return pool;
}
const struct modwerk_machine __attribute__((aligned(4))) breakcut_machine = {
    MODWERK_MACHINE_ABI, {'B', 'C'}, MACHINE_VERSION, MACHINE_VERSION, "BREAKCUT",
    MODWERK_MACHINE_BACKING, /* as VECTOR: the sample plays as stock and stock checks its FLEX or STATIC bytes */
    0, 0, machine_assign, 0, 0, machine_track_page, machine_ui_tick, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, {0, 0, 0},
};
