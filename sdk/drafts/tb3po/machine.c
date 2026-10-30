/* SPDX-License-Identifier: GPL-3.0-or-later
 * TB-3PO on the Octatrack's sample tracks: a track machine (sdk/machines/octatrack/events.json ot_machines), the
 * shape of VECTOR's native.c over the Modwerk base. A BACKING machine: it makes no sound of its own, the track's
 * Flex or Static sample plays as stock, and TB-3PO writes the line as the track's trigs and PTCH, HOLD, VOL and
 * FILTER DEPTH locks; the stock sequencer plays them (tempo, speed, length, swing, conditions and slides stock's).
 * Its controls take the track's SRC page (twelve cells: six there, six on SRC SETUP, a double tap on SRC); a push
 * on LEVEL shows stock's sample controls; holding a trig or a scene shows stock's page, so locks stay stock's. Its
 * settings live in the Part's unused NEIGHBOR slots (0x3c + 30 t: 'T', '3', version, three bytes; 0x1ec + 30 t: six
 * bytes), as VECTOR keeps its own, seven bits a byte. The UI task only. Stock addresses: OS 1.40C, as VECTOR's
 * native.c and the base's machine_registry.c name them. */
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
#define AMP_VOL(t) (0x123u + 24u * (t))   /* the Part's AMP VOL of track t (VECTOR) */
#define FX1_ID(t) (0x000u + (t))          /* the Part's FX1 effect id of track t (ot_project.py FX1_OFF less the record header; TESTING.md) */
#define LOCK_INDEX 0x46c7d48cu            /* stock's per-step lock index of the audio tracks: bit t */
#define MACHINE_VERSION 1u
#define SLIDE_MASK 3u                     /* the slide-trig mask: read off the unit (TESTING.md) */

/* Controls: SRC A-F, then SRC SETUP A-F. */
enum { C_DENS, C_ACNT, C_SLID, C_ROOT, C_SCAL, C_GATE, C_SEED, C_VAR, C_AVEL, C_AFLT, C_DIR, C_MOTF, C_COUNT };
static const char *const names[C_COUNT] = {"DENS", "ACNT", "SLID", "ROOT", "SCAL", "GATE", "SEED", "VAR", "AVEL", "AFLT", "DIR", "MOTF"};
static const uint8_t control_max[C_COUNT] = {127, 127, 127, 11, 5, 63, 127, 31, 31, 7, 3, 32};

static unsigned valid_bank(void) { uint32_t b = U32(BANK_PTR); return b >= 0x40000000u && b < 0x47f00000u; }
static volatile uint8_t *current_part(void) { return (volatile uint8_t *)(uintptr_t)(U32(BANK_PTR) + PART_OFF + (U8(PART_IDX) & 3u) * PART_STRIDE); }
static unsigned signed_track(const volatile uint8_t *part, unsigned t)
{
    const volatile uint8_t *sig = part + SIGNATURE + 30u * t;
    return t < 8u && part[0x22u + t] < 2u && sig[0] == 'T' && sig[1] == '3' && sig[2] == MACHINE_VERSION;
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

/* The nine settings bytes: sig + 3..5, then SETTINGS2 + 0..5, in the Part and its battery-backed copy. */
static unsigned setting_at(unsigned t, unsigned k) { return (k < 3u ? SIGNATURE + 3u + k : SETTINGS2 + k - 3u) + 30u * t; }
static void settings(unsigned t, Tb3poAudioSettings *s)
{
    uint8_t packed[TB3PO_PACKED];
    const volatile uint8_t *part = current_part();
    for (unsigned k = 0; k < TB3PO_PACKED; ++k) packed[k] = part[setting_at(t, k)];
    tb3po_unpack(s, packed);
}
static void save_settings(unsigned t, const Tb3poAudioSettings *s)
{
    uint8_t packed[TB3PO_PACKED];
    volatile uint8_t *part = current_part();
    unsigned mirror = SRAM_PART + (U8(PART_IDX) & 3u) * PART_STRIDE;
    tb3po_pack(packed, s);
    for (unsigned k = 0; k < TB3PO_PACKED; ++k) { unsigned at = setting_at(t, k); part[at] = packed[k]; U8(mirror + at) = packed[k]; }
}
static unsigned control(const Tb3poAudioSettings *s, unsigned c)
{
    switch (c) {
    case C_DENS: return s->p.density; case C_ACNT: return s->p.accent; case C_SLID: return s->p.slide;
    case C_ROOT: return s->a.root; case C_SCAL: return s->p.scale; case C_GATE: return s->a.gate;
    case C_SEED: return s->p.seed; case C_VAR: return s->p.var; case C_AVEL: return s->a.avel;
    case C_AFLT: return s->a.aflt; case C_DIR: return s->p.dir; default: return s->p.motif;
    }
}
static void set_control(Tb3poAudioSettings *s, unsigned c, unsigned v)
{
    switch (c) {
    case C_DENS: s->p.density = (uint8_t)v; break; case C_ACNT: s->p.accent = (uint8_t)v; break; case C_SLID: s->p.slide = (uint8_t)v; break;
    case C_ROOT: s->a.root = (uint8_t)v; break; case C_SCAL: s->p.scale = (uint8_t)v; break; case C_GATE: s->a.gate = (uint8_t)v; break;
    case C_SEED: s->p.seed = (uint8_t)v; break; case C_VAR: s->p.var = (uint8_t)v; break; case C_AVEL: s->a.avel = (uint8_t)v; break;
    case C_AFLT: s->a.aflt = (uint8_t)v; break; case C_DIR: s->p.dir = (uint8_t)v; break; default: s->p.motif = (uint8_t)v; break;
    }
}

static Tb3poPattern pattern;
/* On the UI task, into the current pattern's record and its battery-backed copy; only this track's bit of stock's
 * lock index, then stock's track update, as VECTOR 0.3.0. A fresh seed is kept only once its line is written. */
static int generate(unsigned t, int replace, int fresh)
{
    unsigned p = U8(PATTERN_IDX);
    if (!valid_bank() || t >= 8u || p >= 16u || !signed_track(current_part(), t)) return 0;
    uint32_t bank = U32(BANK_PTR), off = p * PATTERN_STRIDE + t * TB3PO_AUDIO_TRACK_BYTES;
    uint8_t *r = (uint8_t *)(uintptr_t)(bank + off), *mirror = (uint8_t *)(uintptr_t)(SRAM_PATTERNS + off);
    if (!replace && !tb3po_audio_empty(r)) return 0;
    const volatile uint8_t *pat = (const volatile uint8_t *)(uintptr_t)(bank + p * PATTERN_STRIDE);
    unsigned length = pat[0x8e55u] ? r[0x50u] : pat[0x8e53u];
    Tb3poAudioSettings s;
    settings(t, &s);
    if (fresh) s.p.seed = (uint8_t)tb3po_next_seed(s.p.seed);
    s.p.octs = 2; /* two octaves: stock's PTCH range */
    s.a.base_vol = current_part()[AMP_VOL(t)];
    s.a.filter = current_part()[FX1_ID(t)] == TB3PO_FILTER_ID;
    s.a.slide_mask = SLIDE_MASK;
    if (!length || length > TB3PO_STEPS || s.a.base_vol > 127u || !tb3po_generate(&pattern, &s.p, length)) return 0;
    static uint8_t locked[TB3PO_STEPS];
    tb3po_write_audio(r, mirror, &pattern, &s.p, &s.a, locked);
    if (fresh) save_settings(t, &s);
    dirty_part();
    for (unsigned i = 0; i < TB3PO_STEPS; ++i)
        U8(LOCK_INDEX + i) = (uint8_t)((U8(LOCK_INDEX + i) & ~(1u << t)) | (unsigned)locked[i] << t);
    ((void (*)(unsigned))0x4009da20u)(t);
    return 1;
}

/* The page: stock's FLEX or STATIC descriptor with TB-3PO's twelve controls as dial cells (stock's dial renderer,
 * our angle and formatter), as VECTOR's generator page. Built once per source page. */
static uint8_t page[0x192];
static uint32_t page_source;
static uint32_t edit_view, active, layer_gen, shown_bank, shown_part, shown_track, mine;
static uint32_t saved[2][3];
static void copy_text(char *out, const char *text) { unsigned i = 0; do out[i] = text[i]; while (text[i++]); }
static void format_control(char *out, unsigned c)
{
    static const char *const roots[12] = {"C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"};
    static const char *const dirs[4] = {"FWD", "REV", "PING", "RND"};
    Tb3poAudioSettings s; settings(U8(TRACK_IDX), &s);
    unsigned v = control(&s, c), i = 0;
    if (c == C_ROOT) { copy_text(out, roots[v % 12u]); return; }
    if (c == C_SCAL) { copy_text(out, tb3po_scale_names[v % TB3PO_SCALES]); return; }
    if (c == C_DIR) { copy_text(out, dirs[v & 3u]); return; }
    if ((c == C_VAR || c == C_MOTF || c == C_AFLT || c == C_AVEL) && !v) { copy_text(out, "OFF"); return; }
    if (c == C_GATE) v *= 2u; /* shown in stock's HOLD units */
    if (v >= 100) out[i++] = (char)('0' + v / 100);
    if (v >= 10) out[i++] = (char)('0' + v / 10 % 10);
    out[i++] = (char)('0' + v % 10); out[i] = 0;
}
#define FORMATTER(n) static void format_##n(char *out, int value) { (void)value; format_control(out, n); }
FORMATTER(0) FORMATTER(1) FORMATTER(2) FORMATTER(3) FORMATTER(4) FORMATTER(5)
FORMATTER(6) FORMATTER(7) FORMATTER(8) FORMATTER(9) FORMATTER(10) FORMATTER(11)
/* Stock's dial and value renderer in the cell: the control's range sets the angle, its formatter the text. */
static void draw_widget(int x, int y, unsigned slot, unsigned c, unsigned flags, void (*format)(char *, int), uint32_t canvas)
{
    Tb3poAudioSettings s; settings(U8(TRACK_IDX), &s);
    unsigned raw = control(&s, c), max = control_max[c];
    if (raw > max) raw = max;
    ((void (*)(int, int, unsigned, int, unsigned, void (*)(char *, int), uint32_t))0x400479b4u)
        (x, y, slot, (int)(raw * 127u / max), flags & ~1u, format, canvas);
}
static void main_widget(int x, int y, unsigned slot, int value, unsigned flags, void (*format)(char *, int), uint32_t canvas)
{ (void)value; draw_widget(x, y, slot, slot, flags, format, canvas); }
static void setup_widget(int x, int y, unsigned slot, int value, unsigned flags, void (*format)(char *, int), uint32_t canvas)
{ (void)value; draw_widget(x, y, slot, slot + 6u, flags, format, canvas); }
static void put32(uint8_t *d, uint32_t value) { d[0] = (uint8_t)(value >> 24); d[1] = (uint8_t)(value >> 16); d[2] = (uint8_t)(value >> 8); d[3] = (uint8_t)value; }
static void label(uint8_t *out, const char *text) { unsigned i = 0; for (; i < 5 && text[i]; ++i) out[i] = (uint8_t)text[i]; for (; i < 6; ++i) out[i] = 0; }
static uint32_t generator_page(uint32_t stock)
{
    static void (*const formats[12])(char *, int) = {format_0, format_1, format_2, format_3, format_4, format_5,
                                                     format_6, format_7, format_8, format_9, format_10, format_11};
    if (page_source != stock) {
        const volatile uint8_t *source = (const volatile uint8_t *)(uintptr_t)stock;
        for (unsigned i = 0; i < sizeof page; ++i) page[i] = source[i];
        for (unsigned i = 0; i < 12; ++i) {
            label(page + 0x16 + 6 * i, names[i]);
            put32(page + 0xca + 4 * i, (uint32_t)(uintptr_t)formats[i]);
            put32(page + 0xfa + 4 * i, (uint32_t)(uintptr_t)(i < 6 ? main_widget : setup_widget));
        }
        put32(page + 0x18a, 0x00005555u); /* every cell drawn, both pages */
        put32(page + 0x18e, 0x55555555u);
        page_source = stock;
    }
    return (uint32_t)(uintptr_t)page;
}
static unsigned selected(void) { return valid_bank() && !U8(0x80000015u) && signed_track(current_part(), U8(TRACK_IDX)); }
/* The generator's own view of the SRC page: no trig or scene held, no popup, not the sample edit view. */
static unsigned generator_view(void) { return selected() && !edit_view && U8(PAGE_KIND) == 0 && !U32(0x460d173au) && !U32(0x460d1694u); }
static uint32_t stock_page(unsigned t) { return current_part()[0x22u + t] == 0u ? STATIC_PAGE : FLEX_PAGE; }
/* The base's page resolver asks for the machine track's parameter page: ours in the generator view, else stock's
 * backing page, so the lock editor, scenes and the sample edit view keep stock's PTCH and friends. */
static uint32_t machine_track_page(const volatile uint8_t *slot)
{
    unsigned t = (unsigned)(slot - (current_part() + 0x22u));
    if (t >= 8u || !valid_bank()) return FLEX_PAGE;
    return t == U8(TRACK_IDX) && generator_view() ? generator_page(stock_page(t)) : stock_page(t);
}
static uint32_t machine_setup_page(uint32_t stock) { return selected() && !edit_view ? generator_page(stock) : stock; }

static void change_control(unsigned c, int delta)
{
    unsigned t = U8(TRACK_IDX);
    Tb3poAudioSettings s, before;
    settings(t, &s); tb3po_copy_settings(&before, &s);
    unsigned old = control(&s, c);
    int value = (int)old + delta;
    if (c == C_MOTF && value == 1) value = delta > 0 ? 2 : 0; /* OFF, then 2-32 */
    if (value < 0) value = 0;
    if (value > (int)control_max[c]) value = control_max[c];
    if ((unsigned)value == old) return;
    set_control(&s, c, (unsigned)value);
    save_settings(t, &s);
    if (!generate(t, 1, 0)) save_settings(t, &before);
    redraw();
}
static unsigned machine_setup_knob(unsigned index, int delta)
{
    if (index >= 6u || !selected() || edit_view) return 0;
    change_control(index + 6u, delta);
    return 1;
}

/* The input layer, pushed on the UI tick as VECTOR's: encoders A-F on the generator view, YES (a new seed) and the
 * LEVEL push (the sample edit view) on both. Stock's layer records: a layer is seven longs (0, keys, encoders, 0, 0,
 * -1, -1); a key entry is its code, the press, release and repeat handlers and two zero words; an encoder entry its
 * number and the turn handler; 0xff ends a list. A key a layer does not take goes on to the handler stock had. */
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
            mine |= mask;
            notice(generate(U8(TRACK_IDX), 1, 1) ? "TB-3PO GENERATED" : "NO CHANGE");
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
/* Stock's handler for a key's press (0), release (1) or repeat (2), from its key cache. Kept out of line so the
 * compiler does not fold the cache's address into our own array's (a label less a constant is no self-reference to
 * the package builder). */
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
            if (handler != (uint32_t)(uintptr_t)(const void *)machine_key) saved[k][e] = handler; /* a held key can keep our own handler */
        }
        layer_gen = generator_view();
        layer = layer_gen ? gen_layer : edit_layer; layer[0] = 0;
        ((void (*)(const void **))0x40031494u)(layer); active = 1;
        redraw();
    }
}
/* The track becomes TB-3PO (on) with the defaults and a first line on an empty track, or leaves it (off). Returns the
 * backing pool stock commits (0 STATIC, 1 FLEX), as VECTOR's assign. */
static unsigned machine_assign(volatile uint8_t *part, unsigned t, unsigned on)
{
    if (!valid_bank() || t >= 8u) return 1;
    uint32_t offset = (uint32_t)(uintptr_t)part - U32(BANK_PTR) - PART_OFF;
    if (offset % PART_STRIDE || offset / PART_STRIDE >= 4u) return 1;
    volatile uint8_t *mirror = (volatile uint8_t *)(uintptr_t)(SRAM_PART + offset);
    unsigned pool = part[0x22u + t] < 2u ? part[0x22u + t] : 1u, sig = SIGNATURE + 30u * t, setup = SETTINGS2 + 30u * t;
    if (on && !signed_track(part, t)) {
        uint8_t packed[TB3PO_PACKED];
        Tb3poAudioSettings s;
        tb3po_copy_settings(&s, &tb3po_audio_defaults);
        s.p.seed = (uint8_t)(t + 1u);
        tb3po_pack(packed, &s);
        part[sig] = 'T'; part[sig + 1] = '3'; part[sig + 2] = MACHINE_VERSION;
        for (unsigned k = 0; k < TB3PO_PACKED; ++k) part[k < 3 ? sig + 3 + k : setup + k - 3] = packed[k];
    } else if (!on && signed_track(part, t)) {
        part[sig] = part[sig + 1] = part[sig + 2] = 0;
    }
    for (unsigned k = 0; k < 6; ++k) { mirror[sig + k] = part[sig + k]; mirror[setup + k] = part[setup + k]; }
    if (on && part == current_part()) (void)generate(t, 0, 0);
    return pool;
}
const struct modwerk_machine_setup __attribute__((aligned(4))) tb3po_machine = {
    {MODWERK_MACHINE_ABI, {'T', '3'}, MACHINE_VERSION, MACHINE_VERSION, "TB-3PO",
     MODWERK_MACHINE_BACKING | MODWERK_MACHINE_SETUP_PAGE, /* as VECTOR: stock checks the backing FLEX or STATIC bytes */
     0, 0, machine_assign, 0, 0, machine_track_page, machine_ui_tick, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, {0, 0, 0}},
    machine_setup_page, machine_setup_knob,
};
