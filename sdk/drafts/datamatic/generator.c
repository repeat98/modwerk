/* SPDX-License-Identifier: GPL-3.0-or-later
 * DATAMATIC on the Octatrack's MIDI tracks: a MIDI generator (sdk/machines/octatrack/events.json ot_midi_generators),
 * the shape of VECTOR 0.3.0's midi.c and LOGACID's. The engine's line becomes the track's note trigs with NOTE and VEL
 * locks and micro-timing;
 * the stock MIDI sequencer plays them, so tempo, track speed, length, swing, conditions and every note-off are
 * stock's, and nothing here runs while the pattern plays. Its controls take the SRC page (stock's NOTE page) and the
 * AMP page (stock's ARP page; FUNC+AMP its second): layout A, the owner's choice of 24 October 2026. OCT and ROOT are
 * the track's own NOTE, LEN its LEN and VEL its VEL, so a trig placed by hand plays the base note at the line's
 * velocity and length; the generator's own controls live in the track's arpeggiator note bytes, which the base gives a
 * generator's track (Part 0x1832 + 16 t, value - 64: the -64..63 stock's validator keeps). The UI task only.
 * Stock addresses: OS 1.40C, as VECTOR's native.c and midi.c and octabam docs/MIDI_TRACKS.md name them. */
#include "engine.h"
/* The base's table contract: from sdk/octabam/modules/ once published, from sdk/drafts/ while a draft. */
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
#define MIDI_TRACKS 0x48d0u
#define MIDI_PAGE1(t) (0x3e2u + 32u * (t))  /* the NOTE page's values: NOTE, VEL, LEN, NOT2-4 */
#define MIDI_NOTES(t) (0x1832u + 16u * (t)) /* the arp note bytes: the generator's settings */
#define MIDI_MARK 12u                       /* a thirteenth byte: 'D' once DATAMATIC wrote its settings there */
#define MIDI_NOTE_FORMAT (0x400d3e3eu + 0xcau) /* the NOTE page descriptor's formatters: NOTE's, VEL's, LEN's */
#define LOCK_INDEX 0x46c7d2e4u              /* stock's per-step lock index of the MIDI tracks: bit t */
#define GENERATOR_ID 'D'

/* Controls: 0-10 live in the arp note bytes (engine order); the rest are the track's own. */
enum { C_SRCE, C_OFFS, C_BITS, C_DENS, C_SPRD, C_INTV, C_VDAT, C_JITR, C_RULE, C_SEED, C_STEP, C_OCT, C_ROOT, C_LEN, C_VEL, C_NONE };
static const char *const names[C_NONE + 1] = {"SRCE", "OFFS", "BITS", "DENS", "SPRD", "INTV", "VDAT", "JITR", "RULE",
                                               "SEED", "STEP", "OCT", "ROOT", "LEN", "VEL", ""};
static const uint8_t control_max[C_NONE] = {DM_SOURCES - 1u, 127, 8, 127, 4, DM_INTERVALS - 1u, 127, 23, DM_RULES - 1u, 127, 8, 9, 11, 127, 127};
static const uint8_t control_min[C_NONE] = {0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0};
static const uint8_t first[C_NONE] = {DM_PI, 0, 1, 0, 1, DM_OCT, 64, 0, 0, 0, 1, 4, 0, 0, 100}; /* dm_defaults; NOTE C4 (48) */
/* SRC; AMP; FUNC+AMP. */
static const uint8_t layout[3][6] = {
    {C_SRCE, C_OFFS, C_BITS, C_DENS, C_OCT, C_ROOT},
    {C_SPRD, C_INTV, C_VDAT, C_JITR, C_VEL, C_LEN},
    {C_RULE, C_SEED, C_STEP, C_NONE, C_NONE, C_NONE},
};

static unsigned valid_bank(void) { uint32_t b = U32(BANK_PTR); return b >= 0x40000000u && b < 0x47f00000u; }
static volatile uint8_t *current_part(void) { return (volatile uint8_t *)(uintptr_t)(U32(BANK_PTR) + PART_OFF + (U8(PART_IDX) & 3u) * PART_STRIDE); }
/* A byte of the current Part and its battery-backed copy, as stock's MIDI setup writers store. */
static void part_put(unsigned at, uint8_t v)
{
    current_part()[at] = v;
    U8(SRAM_PART + (U8(PART_IDX) & 3u) * PART_STRIDE + at) = v;
}
static void dirty_part(void)
{
    unsigned p = U8(PART_IDX) & 3u;
    U8(U32(BANK_PTR) + 0x95048u) |= (uint8_t)(1u << p);
    U8(0x100b145eu) |= (uint8_t)(1u << p);
    U32(U32(BANK_PTR) + 0x9b332u) = 1; U32(0x100f8598u) = 1;
    ((void (*)(void))0x40027e00u)();
}
static void notice(const char *message) { ((void (*)(const char *, unsigned))0x4005a2b8u)(message, 32); }
static unsigned setting(unsigned t, unsigned k) { return (uint8_t)((int8_t)current_part()[MIDI_NOTES(t) + k] + 64); }
static void put_setting(unsigned t, unsigned k, unsigned v) { part_put(MIDI_NOTES(t) + k, (uint8_t)(v - 64u)); }
/* A NOTE page value, and its live copy while the track plays this bank and Part (as the base's arp reset). */
static void page1_put(unsigned t, unsigned k, unsigned v)
{
    part_put(MIDI_PAGE1(t) + k, (uint8_t)v);
    if (U8(0x8000666eu + t) == U8(0x80000002u) && U8(0x80006676u + t) == U8(0x80000003u))
        U8(0x46c76dc0u + 0x44u * t + k) = (uint8_t)v;
}
static unsigned clamp(unsigned c, unsigned v) { return v < control_min[c] ? control_min[c] : v > control_max[c] ? control_max[c] : v; }
static unsigned control(unsigned t, unsigned c)
{
    const volatile uint8_t *page1 = current_part() + MIDI_PAGE1(t);
    unsigned v;
    if (c >= C_NONE) return 0;
    if (c == C_OCT) v = page1[0] / 12u;
    else if (c == C_ROOT) v = page1[0] % 12u;
    else if (c == C_VEL) v = page1[1];
    else if (c == C_LEN) v = page1[2];
    else if (setting(t, MIDI_MARK) != GENERATOR_ID) return first[c];
    else v = setting(t, c);
    return clamp(c, v);
}
/* OCT and ROOT both set NOTE: the root in that octave. The first setting kept writes every default and the mark. */
static void set_control(unsigned t, unsigned c, unsigned v)
{
    if (c == C_OCT || c == C_ROOT) { page1_put(t, 0, 12u * (c == C_OCT ? v : control(t, C_OCT)) + (c == C_ROOT ? v : control(t, C_ROOT))); return; }
    if (c == C_VEL) { page1_put(t, 1, v); return; }
    if (c == C_LEN) { page1_put(t, 2, v); return; }
    if (setting(t, MIDI_MARK) != GENERATOR_ID) {
        for (unsigned k = 0; k < C_OCT; ++k) put_setting(t, k, first[k]);
        put_setting(t, MIDI_MARK, GENERATOR_ID);
    }
    put_setting(t, c, v);
}
static void params(unsigned t, DmParams *p)
{
    p->source = (uint8_t)control(t, C_SRCE); p->offset = (uint8_t)control(t, C_OFFS); p->bits = (uint8_t)control(t, C_BITS);
    p->dens = (uint8_t)control(t, C_DENS); p->spread = (uint8_t)control(t, C_SPRD); p->intv = (uint8_t)control(t, C_INTV);
    p->vdat = (uint8_t)control(t, C_VDAT); p->jitter = (uint8_t)control(t, C_JITR); p->rule = (uint8_t)control(t, C_RULE);
    p->seed = (uint8_t)control(t, C_SEED); p->stride = (uint8_t)control(t, C_STEP);
}

static DmLine line;
/* On the UI task, into the current pattern's record and its battery-backed copy, then published through stock's
 * track update (MIDI tracks are 8-15 there). Only this track's bit of stock's lock index changes (bit t of each
 * step's byte), as VECTOR 0.3.0 does instead of stock's 3 ms rescan. YES (`fresh`) moves the window to the next byte
 * of the stream, kept only once its line is written. */
static int generate(unsigned t, int replace, int fresh)
{
    unsigned p = U8(PATTERN_IDX);
    if (!valid_bank() || t >= 8u || p >= 16u) return 0;
    uint32_t bank = U32(BANK_PTR), off = p * PATTERN_STRIDE + MIDI_TRACKS + t * DM_TRACK_BYTES;
    uint8_t *r = (uint8_t *)(uintptr_t)(bank + off), *mirror = (uint8_t *)(uintptr_t)(SRAM_PATTERNS + off);
    if (!replace && !dm_track_empty(r)) return 0;
    const volatile uint8_t *pat = (const volatile uint8_t *)(uintptr_t)(bank + p * PATTERN_STRIDE);
    unsigned length = pat[0x8e55u] ? r[0x28u] : pat[0x8e53u];
    const volatile uint8_t *page1 = current_part() + MIDI_PAGE1(t);
    DmParams params_;
    params(t, &params_);
    if (fresh) params_.offset = (uint8_t)((params_.offset + 1u) & 127u);
    if (!length || length > DM_STEPS || !dm_generate(&line, &params_, length, page1[0] & 127u, page1[1] & 127u)) return 0;
    static uint8_t locked[DM_STEPS];
    dm_write(r, mirror, &line, locked);
    if (fresh) set_control(t, C_OFFS, params_.offset);
    dirty_part();
    for (unsigned i = 0; i < DM_STEPS; ++i)
        U8(LOCK_INDEX + i) = (uint8_t)((U8(LOCK_INDEX + i) & ~(1u << t)) | (unsigned)locked[i] << t);
    ((void (*)(unsigned))0x4009da20u)(t + 8u);
    return 1;
}

/* The pages: stock's NOTE or ARP descriptor with DATAMATIC's names and formatters in value-text cells. */
static uint8_t page[0x192];
static uint32_t page_built;
static unsigned view;
static void copy_text(char *out, const char *text) { unsigned i = 0; do out[i] = text[i]; while (text[i++]); }
static void number(char *out, unsigned v)
{
    unsigned i = 0;
    if (v >= 100) out[i++] = (char)('0' + v / 100);
    if (v >= 10) out[i++] = (char)('0' + v / 10 % 10);
    out[i++] = (char)('0' + v % 10); out[i] = 0;
}
static void format(char *out, unsigned c)
{
    typedef void (*Format)(char *, int);
    static const char *const roots[12] = {"C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"};
    unsigned t = U8(TRACK_IDX), v = control(t, c);
    if (c == C_LEN) { ((Format)(uintptr_t)*(const uint32_t *)(uintptr_t)(MIDI_NOTE_FORMAT + 8u))(out, (int)v); return; }
    if (c == C_OCT) { ((Format)(uintptr_t)*(const uint32_t *)(uintptr_t)MIDI_NOTE_FORMAT)(out, (int)(12u * v + control(t, C_ROOT))); return; }
    if (c == C_ROOT) { copy_text(out, roots[v % 12u]); return; }
    if (c == C_SRCE) { copy_text(out, dm_source_names[v % DM_SOURCES]); return; }
    if (c == C_INTV) { copy_text(out, dm_interval_names[v % DM_INTERVALS]); return; }
    if (c == C_RULE) { number(out, dm_rules[v % DM_RULES]); return; }
    if ((c == C_VDAT || c == C_JITR) && !v) { copy_text(out, "OFF"); return; }
    if (c == C_NONE) { out[0] = 0; return; }
    number(out, v);
}
#define FORMATTER(n) static void format_##n(char *out, int value) { (void)value; format(out, layout[view][n]); }
FORMATTER(0) FORMATTER(1) FORMATTER(2) FORMATTER(3) FORMATTER(4) FORMATTER(5)
static unsigned view_of(unsigned p, unsigned second) { return p == 0u ? 0u : 1u + (second & 1u); }
static void put32(uint8_t *d, uint32_t value) { d[0] = (uint8_t)(value >> 24); d[1] = (uint8_t)(value >> 16); d[2] = (uint8_t)(value >> 8); d[3] = (uint8_t)value; }
static void label(uint8_t *out, const char *text) { unsigned i = 0; for (; i < 5 && text[i]; ++i) out[i] = (uint8_t)text[i]; for (; i < 6; ++i) out[i] = 0; }
static uint32_t generator_page(uint32_t stock, unsigned p, unsigned second)
{
    static void (*const formats[6])(char *, int) = {format_0, format_1, format_2, format_3, format_4, format_5};
    static const char titles[3][13] = {"DATAMAT SRC", "DATAMAT AMP1", "DATAMAT AMP2"}; /* 12 characters and a NUL */
    unsigned v = view_of(p, second);
    view = v;
    if (page_built != stock + v + 1u) {
        const volatile uint8_t *source = (const volatile uint8_t *)(uintptr_t)stock;
        for (unsigned i = 0; i < sizeof page; ++i) page[i] = source[i];
        label(page + 4, "DATA");
        for (unsigned i = 0; i < 13; ++i) page[9 + i] = (uint8_t)titles[v][i];
        for (unsigned i = 0; i < 6; ++i) {
            label(page + 0x16 + 6 * i, names[layout[v][i]]);
            put32(page + 0xca + 4 * i, (uint32_t)(uintptr_t)formats[i]);
            put32(page + 0xfa + 4 * i, 0x400467a4u); /* stock's value-text cell, as the NOTE page's */
        }
        put32(page + 0x18a, 0x00005555u);
        put32(page + 0x18e, 0x55555555u);
        page_built = stock + v + 1u;
    }
    return (uint32_t)(uintptr_t)page;
}
static void generator_knob(unsigned p, unsigned index, int delta, unsigned second)
{
    unsigned t = U8(TRACK_IDX), c = index < 6u ? layout[view_of(p, second)][index] : C_NONE;
    if (c >= C_NONE || t >= 8u) return;
    unsigned old = control(t, c);
    int value = (int)old + delta;
    if (value < (int)control_min[c]) value = control_min[c];
    if (value > (int)control_max[c]) value = control_max[c];
    if ((unsigned)value == old) return;
    set_control(t, c, (unsigned)value);
    if (!generate(t, 1, 0)) set_control(t, c, old);
}
static void generator_yes(unsigned p)
{
    static char text[16];
    unsigned t = U8(TRACK_IDX);
    (void)p;
    if (!generate(t, 1, 1)) { notice("NO CHANGE"); return; }
    copy_text(text, "DATA OFFS ");
    number(text + 10, control(t, C_OFFS));
    notice(text);
}
/* Chosen: the defaults, the track's NOTE on C4 (48), its chord notes off (NOT2-4 have no place on the SRC page), VEL
 * 100, and a first line on an empty track; a track with notes waits for a control. Left: nothing of its own to undo;
 * the settings bytes go with the base's arp reset. */
static void generator_assign(unsigned t, unsigned on)
{
    if (!on || t >= 8u) return;
    set_control(t, C_SRCE, first[C_SRCE]); /* writes every default and the mark */
    page1_put(t, 0, 12u * first[C_OCT] + first[C_ROOT]);
    page1_put(t, 1, first[C_VEL]);
    for (unsigned k = 3; k < 6; ++k) page1_put(t, k, 64);
    dirty_part();
    (void)generate(t, 0, 0);
}
const struct modwerk_midi_generator __attribute__((aligned(4))) datamatic_midi = { /* four-byte aligned, as the base reads it */
    MODWERK_MIDI_GENERATOR_ABI, "DATAMAT", GENERATOR_ID, 1u, generator_assign, generator_page, generator_knob, generator_yes, 0,
};
