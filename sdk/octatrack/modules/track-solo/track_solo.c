/* SPDX-License-Identifier: MIT
 * Copyright (c) 2026 twwwy
 * UI state. gate.s lends the audio frame a temporary mute/solo view.
 * Canonical stock state and the raw physical key matrix are never replaced.
 */
#include <stdint.h>
#define TRACK_FIRST 0x10u
#define HOLD_TICKS 30u
#define NO_ANCHOR 8u
#define TRACK_LED 40u
struct ts_api { volatile uint32_t value; };
struct ts_state {
    uint16_t elapsed;
    uint8_t enabled, anchor, held, swallowed, hidden, blocked;
    uint32_t led_group;
    uint8_t led_original[16];
};
static struct ts_state ts = { .enabled = 1, .anchor = NO_ANCHOR };
static struct ts_state *volatile ts_at = &ts;
volatile uint32_t ts_overlay __attribute__((aligned(4))) = 0;
#ifdef TS_HOST
uint32_t ts_host_context = 1;
uint8_t ts_host_rows[8] = {0};
#define ROWS ts_host_rows
static int audio_context(void) { return ts_host_context != 0; }
static int can_arm(void) { return ts_host_context == 1; }
static void led_update(void) {}
void ts_test_reset(void) {
    struct ts_state fresh = { .enabled = 1, .anchor = NO_ANCHOR };
    ts=fresh; ts_overlay=0; ts_host_context=1;
    for (unsigned i=0; i<8; ++i) ts_host_rows[i]=0;
}
#else
#define ROWS ((volatile const uint8_t *)0x46100b18u)
static int audio_context(void) { return !*(volatile uint32_t *)0x80000012u; }
static int can_arm(void) {
    uint32_t popup=*(volatile uint32_t *)0x460d175cu;
    return audio_context() && !(popup>=0x46000000u && popup<0x47000000u &&
        !(popup&1u) && (*(volatile uint32_t *)(uintptr_t)(popup+32u)&0x20u));
}
void ts_native_led_level(int id, int level);
#define LED_LEVEL ((volatile uint8_t *)0x400b9714u)
#endif

void ts_cancel(void) {
    struct ts_state *s=ts_at;
    s->anchor=NO_ANCHOR; s->elapsed=0; s->blocked=1;
    __asm__ volatile ("" ::: "memory");
    ts_overlay=0;
    /* Keep hidden until physical release, even after PROJECT or MIDI. */
}
static int others(void) {
    for (unsigned row=0; row<8u; ++row)
        if (row!=2u && ROWS[row]) return 1;
    return 0;
}
unsigned ts_stock_row(unsigned row) {
    if (row>=8u) return 0;
    unsigned value=ROWS[row];
    return row==2u ? value&~(unsigned)ts_at->hidden : value;
}
int ts_stock_key(unsigned code) {
    return code<64u ? (int)((ts_stock_row(code>>3)>>(code&7u))&1u) : 0;
}
/* Filter the transmitted register only, never the shared on/blink bitmaps.
 * Preserve native colors; give an otherwise dark track channel A. */
unsigned ts_led_row(unsigned row, unsigned value) {
    if (!ts_overlay || row<5u || row>6u) return value;
    for (unsigned shift=0; shift<8u; shift+=2u)
        if (!(value&(3u<<shift))) value|=1u<<shift;
    return value;
}
#ifndef TS_HOST
static void led_update(void) {
    struct ts_state *s=ts_at;
    unsigned group=ts_overlay;
    if (group==s->led_group) return;
    if (!s->led_group)
        for (unsigned i=0; i<16u; ++i) s->led_original[i]=LED_LEVEL[TRACK_LED+i];
    s->led_group=group;
    for (unsigned i=0; i<16u; ++i)
        ts_native_led_level((int)(TRACK_LED+i),group ?
            (group&(1u<<(i>>1)) ? 15 : 3) : s->led_original[i]);
    /* Force these two rows once on a membership transition; a native
     * all-off row otherwise compares equal and never reaches our filter. */
    ((void (*)(int))0x40013634u)(5);
    ((void (*)(int))0x40013634u)(6);
}
int ts_led_value(int id, int level) {
    unsigned i=(unsigned)id-TRACK_LED;
    if (ts_overlay && i<16u) {
        /* Activation captured the baseline before retiring the stock layer.
         * This leaf filter needs no nested UI work or preserved state pointer. */
        ts_at->led_original[i]=(uint8_t)level;
        level=ts_overlay&(1u<<(i>>1)) ? 15 : 3;
    }
    return level;
}
#endif
void ts_set(int delta, int wrap) {
    struct ts_state *s=ts_at;
    if (wrap) s->enabled^=1u;
    else if (delta) s->enabled=delta>0;
    ts_cancel();
}
const char *ts_label(void) { return ts_at->enabled ? "HOLD" : "OFF"; }
int ts_key(int code, int pressed) {
    struct ts_state *s=ts_at;
    if ((unsigned)code>=64u) return 0;
    if ((unsigned)code>=TRACK_FIRST && (unsigned)code<TRACK_FIRST+8u) {
        unsigned track=(unsigned)code-TRACK_FIRST,bit=1u<<track;
        unsigned swallowed=s->swallowed&bit;
        if (!pressed) {
            s->held&=(uint8_t)~bit; s->swallowed&=(uint8_t)~bit;
            s->hidden&=(uint8_t)~bit;
            if (s->anchor==track) ts_cancel();
            return swallowed!=0; /* activation already retired the stock anchor */
        }
        if (s->hidden&bit) return 1;
        if (s->held&bit) return swallowed!=0;
        s->swallowed&=(uint8_t)~bit; s->held|=(uint8_t)bit;
        if (!s->enabled || !audio_context()) { ts_cancel(); return 0; }
        if (ts_overlay) {
            if (others()) return 0; /* deliberate native chord underneath */
            ts_overlay^=bit; s->swallowed|=(uint8_t)bit;
            return 1;
        }
        if (!can_arm() || others() || s->blocked || s->anchor!=NO_ANCHOR) {
            ts_cancel(); return 0;
        }
        s->anchor=(uint8_t)track; s->elapsed=0;
        return 0;
    }
    if (pressed && ((unsigned)code==0x1cu || (unsigned)code==0x35u)) ts_cancel();
    else if (pressed && !ts_overlay) ts_cancel();
    return 0;
}
int ts_enc(int encoder, int delta) {
    (void)encoder;
    if (delta && !ts_overlay) ts_cancel();
    return 0;
}
void ts_tick(struct ts_api *api) {
    struct ts_state *s=ts_at;
    unsigned physical=ROWS[2];
    s->held&=(uint8_t)physical; s->hidden&=(uint8_t)physical;
    if (!physical && !others()) s->blocked=0;
    if (s->anchor!=NO_ANCHOR) {
        unsigned bit=1u<<s->anchor;
        if (!s->enabled || !audio_context() || !(physical&bit)) ts_cancel();
        else if (!ts_overlay) {
            if (!can_arm() || others() || physical!=bit) ts_cancel();
            else if (++s->elapsed>=HOLD_TICKS) {
                s->hidden|=(uint8_t)bit;
                ts_overlay=bit;
                s->swallowed|=(uint8_t)bit;
                led_update();
#ifndef TS_HOST
                /* The original TRACK down installed a stock shortcut layer.
                 * Retire that layer once, with the held query already hidden.
                 * Consume the later physical up, keeping stock edges paired. */
                ((void (*)(int,int))0x40031734u)((int)(TRACK_FIRST+s->anchor),0);
#endif
            }
        }
    }
    led_update();
    api->value=(uint32_t)s->enabled<<16 | physical<<8 | ts_overlay;
}
uint32_t ts_effective_word(uint32_t original) {
    unsigned group=ts_overlay;
    return group ? (original&0xffff0000u)|group : original;
}
