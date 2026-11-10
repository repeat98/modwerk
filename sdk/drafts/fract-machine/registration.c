/* Private source-machine declaration; the experimental base is required. */
#ifndef OG_MACHINE_PROTOTYPE
#error "FRACT machine requires the explicit experimental build profile"
#endif
#include "render.h"
#include "base_binding.h"
#include "modwerk_events.h"
#ifdef OG_MACHINE_SOURCE_STAGE
#include "loader.h"
#include "source_lifecycle.h"
#if !defined(OG_MACHINE_SOURCE_TRANSPORT) || !defined(OG_MACHINE_START_EXTENSION) || !defined(MODWERK_MACHINE_CF_RENDER)
#error "FRACT source stage requires transport, START and guarded paid rendering"
#endif
#endif
#if defined(OG_MACHINE_START_EXTENSION) && !defined(MODWERK_MACHINE_START)
#error "Experimental FRACT START requires the supporting base's generated event header"
#endif
#ifndef U8
#define U8(a) (*(volatile uint8_t *)(uintptr_t)(a))
#endif

/* The private builder already compiles this registration unit. Keeping the UI
 * here avoids widening its source list or changing any audio unit. */
static int fract_ui_pool_title_context(void);
#define FRACT_UI_POOL_TITLE_CONTEXT() fract_ui_pool_title_context()
#include "fract_ui.c"

#ifdef OG_MACHINE_GRAIN_ONLY
const uint8_t og_machine_defaults[12] = {18,86,127,0,64,64,0,64,0,127,0,OG_GRAIN_LAYOUT_MARKER};
#else
const uint8_t og_machine_defaults[12] = {18,86,127,0,0,64,0,64,0,127,0,0};
#endif
#include "sample_pool.h"
static int fract_ui_pool_title_context(void) {
    return og_pool_direct && og_pool_context() && U32(0x460e70e0u) &&
        U32(0x460e739au) && !U32(0x460e5e30u) && !U32(0x460d1e70u);
}
static uint8_t og_machine_page_data[0x1ca] __attribute__((aligned(4)));
static unsigned og_machine_page_ready;
static void page_word(unsigned offset, uint32_t value) {
    for (unsigned i = 0; i < 4; ++i)
        og_machine_page_data[offset + i] = (uint8_t)(value >> (24 - 8 * i));
}
static void page_text(unsigned offset, const char *s, unsigned count) {
    unsigned i = 0;
    for (; i + 1 < count && s[i]; ++i) og_machine_page_data[offset + i] = (uint8_t)s[i];
    for (; i < count; ++i) og_machine_page_data[offset + i] = 0;
}
static void range_text(char *out, int value) {
    const char *s = value == 1 ? "LOCAL" : "FULL";
    do {*out++ = *s;} while (*s++);
}
static uint32_t og_machine_page(const volatile uint8_t *slot) {
    (void)slot;
    if (!og_machine_base_ready()) return 0;
    if (!og_machine_page_ready) {
        static const char *const names[12] = {
#ifdef OG_MACHINE_GRAIN_ONLY
            "POS", "SIZE", "REVS", "SPRD", "SHPE", "PTCH",
            "PAN", "", "SRNG", "", "", ""
#else
            "POS", "SIZE", "REVS", "SPRD", "SPCE", "SHPE",
            "PAN", "", "SRNG", "", "", ""
#endif
        };
        /* Runtime clone of the stock FLEX page, as existing source machines
         * do. No extracted descriptor bytes are stored in the repository. */
        for (unsigned i = 0; i < sizeof og_machine_page_data; ++i)
            og_machine_page_data[i] = U8(0x400d3176u + i);
        page_text(0x3c, "FRCT", 5); page_text(0x41, "GRANULAR", 13);
        for (unsigned i = 0; i < 12; ++i) {
            page_text(0x4e + 6 * i, names[i], 6);
            og_machine_page_data[0x96 + i] = og_machine_defaults[i];
            page_word(0xa2 + 4 * i, 0);
            page_word(0xd2 + 4 * i, i == 8 ? 2 :
#ifdef OG_MACHINE_GRAIN_ONLY
                      i < 7 ? 128 : 0);
#else
                      i < 7 ? 128 : 0);
#endif
            page_word(0x102 + 4 * i, i == 8 ? (uint32_t)(uintptr_t)range_text : 0);
            page_word(0x132 + 4 * i, 0); /* ordinary stock knob/value widget */
            page_word(0x162 + 4 * i, 0); /* ordinary bounded parameter editor */
        }
        /* Main A-F; grain-only SETUP exposes SRNG in C. */
        page_word(0x1c2, 0x1);
#ifdef OG_MACHINE_GRAIN_ONLY
        page_word(0x1c6, 0x01111111u);
        /* Use the native FLEX pitch range, formatter, dial and editor on F. */
        static const unsigned pitch_fields[] = {0xa2,0xd2,0x102,0x132,0x162};
        for (unsigned i = 0; i < sizeof pitch_fields / sizeof *pitch_fields; ++i)
            page_word(pitch_fields[i] + 20u, U32(0x400d3176u + pitch_fields[i]));
#else
        page_word(0x1c6, 0x01111111u);
#endif
        og_machine_page_ready = 1;
    }
    return (uint32_t)(uintptr_t)(og_machine_page_data + 0x38);
}
static unsigned og_machine_admit(const volatile uint8_t *part, unsigned track) {
    if (!og_machine_base_ready()) return 0;
#if defined(OG_MACHINE_SOURCE_STAGE) || defined(OG_MACHINE_GRAIN_ONLY)
    if (track >= 4) return 0;
    for (unsigned t = 0; t < 8; ++t) {
        const volatile uint8_t *sig = part + 60u + 30u * t;
        if (t != track && part[0x22u + t] == 1 &&
            sig[0] == 'F' && sig[1] == 'R' && sig[2] == 1) return 0;
    }
    return 1;
#else
    (void)part;
    return track < 8;
#endif
}
const struct modwerk_machine og_machine_descriptor = {
    .abi = MODWERK_MACHINE_ABI, .sig = {'F', 'R'}, .sig_lo = 1, .sig_hi = 1,
    .label = "FRACT", .flags = MODWERK_MACHINE_PROTECT | MODWERK_MACHINE_POOL
#ifdef OG_MACHINE_START_EXTENSION
        | MODWERK_MACHINE_START
#ifdef OG_MACHINE_GRAIN_ONLY
        | MODWERK_MACHINE_NATIVE_FLEX
#endif
#endif
#ifdef OG_MACHINE_SOURCE_STAGE
        | MODWERK_MACHINE_CF_RENDER
#endif
    ,
    .defaults = og_machine_defaults, .admit_track = og_machine_admit,
    .assign = og_pool_assign, .chooser_type = og_pool_chooser,
    .pool_open = og_pool_open, .pool_left = og_pool_left,
    .ui_tick = og_machine_ui_tick,
    .track_page = og_machine_page, .leave = og_machine_leave, .render = og_machine_render,
#ifdef OG_MACHINE_SOURCE_STAGE
    /* Executed DSP instruction evidence, not a physical cycle claim. Shared
     * admission applies its existing markup and stock FX reserves unchanged. */
    .source_voice = 426, .source_engine = 15, .source_kind = RUNTIME_EXECUTED,
#endif
    /* The grain-only profile uses the base's guarded native FLEX callback. */
};
#ifdef OG_MACHINE_START_EXTENSION
/* Separate fixed record; the legacy 80-byte descriptor never grows. This is
 * linked only with the experimental base/header and runtime.experimental.json. */
const struct modwerk_machine_start og_machine_start_descriptor = {
    .abi = MODWERK_MACHINE_START_ABI,
    .bytes = sizeof(struct modwerk_machine_start),
    .machine = &og_machine_descriptor,
    .start = og_machine_start
};
#endif
