/* SPDX-License-Identifier: GPL-3.0-or-later
 * SCENE GEN on the Octatrack: four rows in PROJECT > CONTROL > SEQUENCER (sdk/machines/octatrack/events.json
 * ot_sequencer_rows), after stock's three. SCN TARGET (SCENE A, SCENE B, 16 RAND, 16 PATH), SCN PARAMS (the active
 * track's or every track's page 1 of SRC, LFO, AMP, FX1, FX2, both FX or all), SCN SPREAD (1-127) and SCENE GEN: YES
 * there generates, LEVEL to the left restores the scenes as they were before. The scenes are the active Part's own:
 * scene s's locks for track t at Part + 0x662 + (s x 8 + t) x 32, the scenes selected on the A and B sides at Part +
 * 0x10 and + 0x11, each parameter's range from its page's descriptor, as Apply Scene (Nathaniel Pavel, MIT) reads them.
 * Its settings live in the module, not in the project. The UI task only. Stock addresses: OS 1.40C. */
#include "engine.h"
#if __has_include("../../../machines/octatrack/include/modwerk_events.h")
#include "../../../machines/octatrack/include/modwerk_events.h"
#else
#include "../../machines/octatrack/include/modwerk_events.h"
#endif

#define U8(a) (*(volatile uint8_t *)(uintptr_t)(a))
#define U32(a) (*(volatile uint32_t *)(uintptr_t)(a))
#define S32(a) (*(volatile int32_t *)(uintptr_t)(a))
#define BANK_PTR 0x46c82456u
#define PART_IDX 0x100b14cfu
#define TRACK_IDX 0x100b14ccu
#define MIDI_MODE 0x80000012u
#define PART_OFF 0x8ed80u
#define PART_STRIDE 0x18b2u
#define SRAM_PART 0x100a4eceu
#define SCENES 0x662u                 /* 16 scenes x 8 tracks x 32 lock bytes */
#define SCENE_BYTES 4096u
#define SIDE_A 0x10u                  /* the scene selected on the A side; B at + 0x11 */
#define DESC 0x40031da4u              /* (track, page): the page's descriptor */
#define XF_LAST 0x400c0c44u           /* the fader value the STRT/LEN/RATE morph last sent */
#define XF_MORPH 0x4003f1b4u          /* that morph, as a fader move runs it */

static SgParams params = {SG_TO_B, SG_FX, 0, 32}; /* sg_defaults; a literal, so no struct copy needs the C library */
static uint32_t seed;
static uint8_t backup[SCENE_BYTES];
static uint32_t backup_bank, backup_part, backup_valid;
static const char *result;
static char spread_text[4], params_text[12];

static unsigned valid_bank(void) { uint32_t b = U32(BANK_PTR); return b >= 0x40000000u && b < 0x47f00000u; }
static volatile uint8_t *current_part(void) { return (volatile uint8_t *)(uintptr_t)(U32(BANK_PTR) + PART_OFF + (U8(PART_IDX) & 3u) * PART_STRIDE); }
static void notice(const char *message) { ((void (*)(const char *, unsigned))0x4005a2b8u)(message, 32); }
static void dirty_part(void)
{
    unsigned p = U8(PART_IDX) & 3u;
    U8(U32(BANK_PTR) + 0x95048u) |= (uint8_t)(1u << p);
    U8(0x100b145eu) |= (uint8_t)(1u << p);
    U32(U32(BANK_PTR) + 0x9b332u) = 1; U32(0x100f8598u) = 1;
    ((void (*)(void))0x40027e00u)();
}
/* The new scene values reach the voices as a fader move would send them (Apply Scene does the same). */
static void refresh(void) { U32(XF_LAST) = 0xffffffffu; ((void (*)(void))XF_MORPH)(); ((void (*)(int))0x4004d948u)(-1); }
static unsigned clamp7(int32_t v) { return v < 0 ? 0u : v > 127 ? 127u : (unsigned)v; }

static SgPart part;
/* The Part's values and ranges: PLAYBACK at Part + 0x2a + t x 30 + machine x 6, LFO/AMP/FX at Part + 0x114 + t x 24;
 * a slot the page does not draw has no range. */
static void read_part(const volatile uint8_t *w)
{
    for (unsigned t = 0; t < SG_TRACKS; ++t) {
        unsigned machine = w[0x22u + t] < 5u ? w[0x22u + t] : 1u;
        for (unsigned page = 0; page < 5u; ++page) {
            uint32_t d = ((uint32_t (*)(unsigned, unsigned))DESC)(t, page);
            uint32_t drawn = d ? U32(d + 0x18eu) : 0u;
            for (unsigned i = 0; i < 6u; ++i) {
                unsigned k = 6u * page + i;
                part.base[t][k] = page ? w[0x114u + 24u * t + k - 6u] : w[0x2au + 30u * t + 6u * machine + k];
                if (!d || !((drawn >> (4u * i)) & 1u)) { part.lo[t][k] = 1; part.hi[t][k] = 0; continue; }
                int32_t lowest = S32(d + 0x6au + 4u * i), count = S32(d + 0x9au + 4u * i);
                part.lo[t][k] = (uint8_t)clamp7(lowest);
                part.hi[t][k] = (uint8_t)clamp7(lowest + count - 1);
            }
        }
    }
}
static void mirror_scenes(const volatile uint8_t *w)
{
    uint32_t mirror = SRAM_PART + (U8(PART_IDX) & 3u) * PART_STRIDE + SCENES;
    for (unsigned i = 0; i < SCENE_BYTES; ++i) U8(mirror + i) = w[SCENES + i];
}
static void generate(void)
{
    if (!valid_bank()) return;
    unsigned track = U8(TRACK_IDX);
    if (!params.all && (U32(MIDI_MODE) || track >= SG_TRACKS)) { result = "AUDIO TRACK"; notice("SELECT AN AUDIO TRACK"); return; }
    volatile uint8_t *w = current_part();
    uint8_t (*scenes)[SG_TRACKS][32] = (uint8_t (*)[SG_TRACKS][32])(uintptr_t)(w + SCENES);
    for (unsigned i = 0; i < SCENE_BYTES; ++i) backup[i] = w[SCENES + i];
    read_part(w);
    int changed = sg_generate(scenes, &part, &params, track, w[SIDE_A] & 15u, w[SIDE_A + 1u] & 15u, ++seed);
    if (changed <= 0) { result = "NO CHANGE"; notice("NOTHING TO GENERATE"); return; }
    backup_bank = U32(BANK_PTR); backup_part = U8(PART_IDX); backup_valid = 1;
    mirror_scenes(w);
    dirty_part();
    refresh();
    result = "DONE";
    notice(params.target <= SG_TO_B ? "SCENE GENERATED" : "16 SCENES GENERATED");
}
static void undo(void)
{
    if (!backup_valid || !valid_bank() || backup_bank != U32(BANK_PTR) || backup_part != U8(PART_IDX)) { result = "NO UNDO"; return; }
    volatile uint8_t *w = current_part();
    for (unsigned i = 0; i < SCENE_BYTES; ++i) w[SCENES + i] = backup[i];
    backup_valid = 0;
    mirror_scenes(w);
    dirty_part();
    refresh();
    result = "UNDONE";
    notice("SCENES RESTORED");
}

/* The rows, in stock's convention: a getter returns its value's string in d0; a setter takes (delta, wrap), LEVEL's
 * detents with wrap 0 and YES as (1, 1). */
static unsigned step(unsigned v, int delta, int wrap, unsigned lo, unsigned hi)
{
    int n = (int)v + delta;
    if (wrap) return n > (int)hi ? lo : n < (int)lo ? hi : (unsigned)n;
    return n > (int)hi ? hi : n < (int)lo ? lo : (unsigned)n;
}
static void copy_text(char *out, const char *text) { unsigned i = 0; do out[i] = text[i]; while (text[i++]); }
static uint32_t get_target(void) { return (uint32_t)(uintptr_t)sg_target_names[params.target % SG_TARGETS]; }
static uint32_t get_params(void)
{
    copy_text(params_text, params.all ? "ALL " : "TRK ");
    copy_text(params_text + 4, sg_page_names[params.pages % SG_PAGES]);
    return (uint32_t)(uintptr_t)params_text;
}
static uint32_t get_spread(void)
{
    unsigned v = params.spread, i = 0;
    if (v >= 100) spread_text[i++] = (char)('0' + v / 100);
    if (v >= 10) spread_text[i++] = (char)('0' + v / 10 % 10);
    spread_text[i++] = (char)('0' + v % 10); spread_text[i] = 0;
    return (uint32_t)(uintptr_t)spread_text;
}
static uint32_t get_gen(void) { return (uint32_t)(uintptr_t)(result ? result : "YES"); }
static void set_target(int delta, int wrap) { params.target = (uint8_t)step(params.target, delta, wrap, 0, SG_TARGETS - 1u); result = 0; }
static void set_params(int delta, int wrap)
{
    unsigned v = step(params.all * SG_PAGES + params.pages, delta, wrap, 0, 2u * SG_PAGES - 1u);
    params.all = (uint8_t)(v / SG_PAGES); params.pages = (uint8_t)(v % SG_PAGES); result = 0;
}
static void set_spread(int delta, int wrap) { params.spread = (uint8_t)step(params.spread, delta, wrap, 1, 127); result = 0; }
static void set_gen(int delta, int wrap)
{
    if (wrap && delta > 0) generate();     /* YES */
    else if (delta < 0) undo();            /* LEVEL to the left */
}

const struct { uint32_t count; struct modwerk_sequencer_row row[4]; } __attribute__((aligned(4))) scenegen_rows = {4, {
    {"SCN TARGET", (const void *)get_target, (const void *)set_target},
    {"SCN PARAMS", (const void *)get_params, (const void *)set_params},
    {"SCN SPREAD", (const void *)get_spread, (const void *)set_spread},
    {"SCENE GEN", (const void *)get_gen, (const void *)set_gen},
}};
