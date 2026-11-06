/* FRACT uses native FLEX sample slots without changing its signed owner.
 * Follows POLY8's native browser convention (MIT, Sam Banks / repeat98).
 * Only the sample browser sees FLEX; machine selection still sees FRACT. */
#ifndef FRACT_SAMPLE_POOL_H
#define FRACT_SAMPLE_POOL_H
#ifndef U32
#define U32(a) (*(volatile uint32_t *)(uintptr_t)(a))
#endif
#ifndef OG_POOL_AT
#define OG_POOL_AT(a) ((volatile uint8_t *)(uintptr_t)(a))
#endif
#ifndef OG_POOL_OPEN
extern void mw_stock_pool_open(void); /* exact experimental base import */
#define OG_POOL_OPEN() mw_stock_pool_open()
#endif
#ifndef OG_POOL_LEFT
#define OG_POOL_LEFT(k,e) ((void (*)(unsigned,unsigned))0x4007893cu)(k,e)
#endif
#ifndef OG_POOL_REDRAW
#define OG_POOL_REDRAW() ((void (*)(int))0x4004d948u)(-1)
#endif
#ifndef OG_POOL_MAIN_CONTROL
#define OG_POOL_MAIN_CONTROL(t,k,v) \
    ((int (*)(unsigned,unsigned,unsigned))0x40054cd8u)(t,k,v)
#endif
static uint32_t og_pool_bank;
static unsigned og_pool_part, og_pool_track, og_pool_direct;
static uint32_t og_controls_bank;
static unsigned og_controls_part, og_controls_tracks;
static int og_pool_valid_bank(void) {
    uint32_t b = U32(0x46c82456u);
    return b >= 0x40000000u && b < 0x47f00000u;
}
static volatile uint8_t *og_pool_part_at(unsigned index) {
    return OG_POOL_AT(U32(0x46c82456u) + 0x8ed80u + index * 6322u);
}
static int og_pool_signed(const volatile uint8_t *p, unsigned t) {
    if (t >= 8) return 0;
    const volatile uint8_t *s = p + 60u + 30u * t;
    return p[0x22u + t] == 1 &&
        s[0] == 'F' && s[1] == 'R' && s[2] == 1;
}
static int og_pool_context(void) {
    return og_pool_valid_bank() && U32(0x46c82456u) == og_pool_bank &&
        (U8(0x100b14cfu) & 3u) == og_pool_part &&
        U8(0x100b14ccu) == og_pool_track && !U8(0x80000015u) &&
        og_pool_signed(og_pool_part_at(og_pool_part), og_pool_track);
}
static void og_pool_tick(void) {
    if (og_pool_direct && (!U32(0x460e70e0u) || !og_pool_context()))
        og_pool_direct = 0;
}
static void og_pool_controls_changed(unsigned part, unsigned track) {
    uint32_t bank = U32(0x46c82456u);
    if (og_controls_bank != bank || og_controls_part != part)
        og_controls_tracks = 0;
    og_controls_bank = bank; og_controls_part = part;
    og_controls_tracks |= 1u << track;
}
static void og_pool_publish_controls(void) {
    unsigned tracks = og_controls_tracks;
    og_controls_tracks = 0;
    /* Assignment has returned and stock has committed the backing type before
     * this UI tick. A context switch applies its own Part; never replay an
     * earlier selection into the newly current bank/Part. */
    if (!tracks || !og_pool_valid_bank() || U32(0x46c82456u) != og_controls_bank ||
        (U8(0x100b14cfu) & 3u) != og_controls_part || U8(0x80000015u)) return;
    volatile uint8_t *part = og_pool_part_at(og_controls_part);
    for (unsigned t = 0; t < 8; ++t) if (tracks & (1u << t)) {
        for (unsigned k = 0; k < 6; ++k)
            (void)OG_POOL_MAIN_CONTROL(t, k, part[0x30u + 30u * t + k]);
        /* SRC SETUP's native editor publishes to this six-byte cache
         * (1.40C: 0x4003a600..0x4003a610). Part and battery mirror already
         * contain our values; MAIN's absolute writer marks the edit above.
         * 0x40055008 is a selected-page knob DELTA handler, not an absolute
         * SETUP writer. Calling it here would edit unrelated controls. */
        volatile uint8_t *setup = OG_POOL_AT(0x80000830u + 72u * t);
        for (unsigned k = 0; k < 6; ++k)
            setup[k] = part[0x1e0u + 30u * t + k];
        }
}
#ifdef OG_MACHINE_GRAIN_ONLY
static void og_pool_upgrade_current(void) {
    if (!og_pool_valid_bank() || U8(0x80000015u)) return;
    unsigned index = U8(0x100b14cfu) & 3u;
    volatile uint8_t *part = og_pool_part_at(index);
    volatile uint8_t *mirror = OG_POOL_AT(0x100a4eceu + index * 6322u);
    for (unsigned t = 0; t < 8; ++t)
        if (og_pool_signed(part, t) && og_grain_layout_upgrade(part, mirror, t))
            og_pool_controls_changed(index, t);
}
#endif
static unsigned og_pool_chooser(unsigned type, const volatile uint8_t *slot) {
    return og_pool_direct && og_pool_context() &&
        slot == og_pool_part_at(og_pool_part) + 0x22u + og_pool_track ? type : 5;
}
static unsigned og_pool_assign(volatile uint8_t *part, unsigned t, unsigned on) {
    if (!og_pool_valid_bank() || t >= 8) return (unsigned)-1;
    unsigned index;
    for (index = 0; index < 4; ++index)
        if (part == og_pool_part_at(index)) break;
    if (index == 4) return (unsigned)-1;
    volatile uint8_t *mirror = OG_POOL_AT(0x100a4eceu + index * 6322u);
    unsigned sig = 60u + 30u * t;
    int was = og_pool_signed(part, t);
    /* Native browser YES commits FLEX. Retain FRACT and every custom byte. */
    if (og_pool_direct && og_pool_context() &&
        part == og_pool_part_at(og_pool_part) && t == og_pool_track) on = 2;
    if (on) {
        if (on == 1 && !was) {
            for (unsigned k = 0; k < 12; ++k) {
                unsigned at = (k < 6 ? 0x2a : 0x1da) + 30u * t + 6u + k % 6;
                part[at] = mirror[at] = og_machine_defaults[k];
            }
            og_pool_controls_changed(index, t);
        }
#ifdef OG_MACHINE_GRAIN_ONLY
        else if (was && og_grain_layout_upgrade(part, mirror, t))
            og_pool_controls_changed(index, t);
#endif
        part[sig] = mirror[sig] = 'F'; part[sig + 1] = mirror[sig + 1] = 'R';
        part[sig + 2] = mirror[sig + 2] = 1;
    } else if (was) {
        /* An explicit stock-machine selection leaves FRACT with native defaults. */
        for (unsigned k = 0; k < 12; ++k) {
            unsigned at = (k < 6 ? 0x2a : 0x1da) + 30u * t + 6u + k % 6;
            part[at] = mirror[at] = U8(0x400d320cu + k);
        }
        for (unsigned k = 0; k < 3; ++k) part[sig + k] = mirror[sig + k] = 0;
        og_pool_controls_changed(index, t);
    }
    return 1;
}
static void og_pool_open(void) {
    if (!og_machine_base_ready() || !og_pool_valid_bank() ||
        U8(0x80000015u) || U32(0x460e5e30u) || U32(0x460e70e0u)) return;
    unsigned part = U8(0x100b14cfu) & 3u, t = U8(0x100b14ccu);
    if (!og_pool_signed(og_pool_part_at(part), t)) return;
    og_pool_bank = U32(0x46c82456u); og_pool_part = part; og_pool_track = t;
    og_pool_direct = 1;
    OG_POOL_OPEN();
    if (!U32(0x460e70e0u)) og_pool_direct = 0;
    OG_POOL_REDRAW();
}
static void og_pool_left(unsigned key, unsigned edge) {
    og_pool_direct = 0;
    OG_POOL_LEFT(key, edge); /* shared registry restores our actual chooser row */
}
static void og_machine_ui_tick(void) {
    og_pool_tick();
#ifdef OG_MACHINE_GRAIN_ONLY
    og_pool_upgrade_current();
#endif
    og_pool_publish_controls();
#ifdef OG_MACHINE_SOURCE_STAGE
    og_source_ui_tick();
#endif
}
#endif
