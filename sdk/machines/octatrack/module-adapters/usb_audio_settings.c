/* SPDX-License-Identifier: GPL-3.0-or-later
 * One saved word per USB AUDIO module, including four 1-based source choices.
 * The audio interrupt publishes one routing snapshot per block. Only the base
 * can change the active USB profile, with the controller detached. */
#include <stdint.h>
#include "modwerk_events.h"

enum { TRACKS_MIX, TRACKS, MAIN_CUE, MAIN, MASTER, LAYOUTS };
enum { USB20, USB16, USB4, USB2, OUTBOX8, PROFILES };
enum { DESTINATION, LAYOUT, TAP, MODE, OUT1, OUT2, OUT3, OUT4, IN_ORDER, FIELDS };
enum { SILENCE = 10, SUM = 11 };
#define SAVED 0x80000000u
#define DEFAULT (SAVED | 0x432100u)
static const unsigned counts[LAYOUTS] = {10, 8, 2, 1, 1};
static const unsigned first[LAYOUTS] = {0, 0, 8, 8, 7};
static const unsigned widths[PROFILES] = {10, 8, 2, 1, 4};
static const unsigned profiles[LAYOUTS] = {USB20, USB16, USB4, USB2, USB2};
static const char *const fields[FIELDS] = {"SEND TO", "LAYOUT", "TRACK TAP", "OUTPUT MODE",
    "OUT 1/2", "OUT 3/4", "OUT 5/6", "OUT 7/8", "ASSIGN IN ORDER"};
static const char *const sources[] = {"TRACK 1","TRACK 2","TRACK 3","TRACK 4","TRACK 5","TRACK 6","TRACK 7","TRACK 8","MAIN","CUE"};
static const char *const destinations[] = {"COMPUTER","OUTBOX 8"};
static const char *const layouts[] = {"TRACKS+MAIN+CUE","TRACKS","MAIN + CUE","MAIN","TRACK 8/MASTER"};
static const char *const taps[] = {"PRE LEVEL","POST LEVEL"};
static const char *const modes[] = {"ALL CHANNELS","OFF","MAIN + CUE ONLY"};
static const char *const order[] = {"CANCEL","ASSIGN"};

static unsigned layout(uint32_t w) { return (w >> 2) & 7u; }
static unsigned outbox(uint32_t w) { return (w >> 6) & 1u; }
static unsigned assignment(uint32_t w, unsigned pair) { return (w >> (8u + 4u * pair)) & 15u; }
static uint32_t assign(uint32_t w, unsigned pair, unsigned value)
{
    unsigned shift = 8u + 4u * pair;
    return (w & ~(15u << shift)) | (value << shift);
}
static uint32_t restore(uint32_t w)
{
    if (!(w & SAVED)) return DEFAULT | (w <= 2u ? w : 0u); /* previous single-choice module */
    if (layout(w) >= LAYOUTS || (w & 3u) > 2u) return DEFAULT;
    return w;
}
static unsigned field_list(uint32_t w, unsigned ids[FIELDS])
{
    unsigned n = 0;
    ids[n++] = DESTINATION;
    ids[n++] = LAYOUT;
    if (layout(w) <= TRACKS) ids[n++] = TAP;
    ids[n++] = MODE;
    if (outbox(w)) for (unsigned f = OUT1; f <= IN_ORDER; ++f) ids[n++] = f;
    return n;
}
static const char *field_value(uint32_t w, unsigned id)
{
    static const char *const layout_values[] = {"20 CH", "16 CH", "MAIN+CUE", "MAIN", "TRACK 8"};
    static const char *const mode_values[] = {"ALL", "OFF", "MAIN+CUE"};
    unsigned l = layout(w);
    switch (id) {
    case DESTINATION: return destinations[outbox(w)];
    case LAYOUT: return layout_values[l];
    case TAP: return taps[(w >> 5) & 1u];
    case MODE: return mode_values[w & 3u];
    case IN_ORDER: return 0;
    default: {
        unsigned source = assignment(w, id - OUT1);
        return source && source <= counts[l] ? sources[first[l] + source - 1] : "OFF";
    }
    }
}
static void audio_page(uint32_t saved, unsigned field, struct modwerk_choice_page *page)
{
    uint32_t w = restore(saved);
    unsigned ids[FIELDS], n = field_list(w, ids), l = layout(w);
    page->count = page->active = 0;
    if (field == MODWERK_SETTING_FIELDS) {
        page->count = n;
        for (unsigned i = 0; i < n; ++i) {
            page->names[i] = fields[ids[i]];
            page->values[i] = field_value(w, ids[i]);
        }
        return;
    }
    if (field >= n) return;
    unsigned id = ids[field];
    const char *const *names;
    page->label = fields[id];
    switch (id) {
    case DESTINATION: names = destinations; n = 2; page->active = outbox(w); break;
    case LAYOUT: names = layouts; n = LAYOUTS; page->active = l; break;
    case TAP: names = taps; n = 2; page->active = (w >> 5) & 1u; break;
    case MODE: names = modes; n = l == TRACKS_MIX ? 3 : 2; page->active = w & 3u; break;
    case IN_ORDER: names = order; n = 2; break;
    default:
        page->names[0] = "OFF";
        n = counts[l];
        for (unsigned i = 0; i < n; ++i) page->names[i+1] = sources[first[l]+i];
        page->count = n+1;
        page->active = assignment(w, id-OUT1);
        if (page->active > n) page->active = 0;
        return;
    }
    page->count = n;
    for (unsigned i = 0; i < n; ++i) page->names[i] = names[i];
}
static uint32_t audio_choose(uint32_t saved, unsigned field, unsigned choice)
{
    uint32_t w = restore(saved);
    unsigned ids[FIELDS], n = field_list(w, ids);
    if (field >= n) return w;
    switch (ids[field]) {
    case DESTINATION: w = (w & ~(1u << 6)) | (choice << 6); break;
    case LAYOUT:
        if (choice >= LAYOUTS) return w;
        w = (w & ~(7u<<2)) | (choice<<2);
        if (choice != TRACKS_MIX && (w & 3u) == 2u) w &= ~3u;
        for (unsigned i = 0; i < 4; ++i)
            if (assignment(w,i) > counts[choice]) w = assign(w,i,0);
        break;
    case TAP: w = (w & ~(1u << 5)) | (choice << 5); break;
    case MODE: w = (w & ~3u) | choice; break;
    case IN_ORDER:
        if (choice) for (unsigned i=0; i<4; ++i) w = assign(w,i,i<counts[layout(w)] ? i+1 : 0);
        break;
    default: w = assign(w, ids[field] - OUT1, choice); break;
    }
    /* With default routing, keep the original mode word so rolling back to
     * the single-choice package can still restore OFF or MAIN + CUE ONLY. */
    return (w & ~3u) == DEFAULT ? w & 3u : w;
}

extern volatile uint8_t mwua_requested, mwua_active;
static volatile uint32_t configuration[PROFILES];
static void audio_apply(unsigned saved)
{
    uint32_t w = restore(saved);
    unsigned profile = outbox(w) ? OUTBOX8 : profiles[layout(w)];
    configuration[profile] = w;
    mwua_requested = (uint8_t)profile;
}
static const struct modwerk_setting_pages pages = {audio_page, audio_choose};
const struct modwerk_setting mwua_setting = {MODWERK_SETTING_GROUP_ABI, "USB AUDIO", 0,
    (const char *const *)(const void *)&pages, audio_apply, 0};

uint8_t mwua_post, mwua_off, mwua_fs_sum = 1, mwua_fs_pair = SUM, mwua_pairs = 10, mwua_direct;
static uint8_t route[10];
static uint32_t last;
void mwua_begin_frame(void)
{
    unsigned profile = mwua_active;
    uint32_t w = restore(configuration[profile]);
    if (w == last) return;
    last = w;
    unsigned l = layout(w), mode = w & 3u;
    mwua_pairs = widths[profile];
    mwua_post = l <= TRACKS && ((w >> 5) & 1u);
    mwua_off = mode == 1u;
    for (unsigned i = 0; i < mwua_pairs; ++i) {
        unsigned pick = outbox(w) ? assignment(w,i) : i+1;
        unsigned source = pick && pick <= counts[l] ? first[l]+pick-1 : SILENCE;
        route[i] = mode == 2u && source < 8u ? SILENCE : source;
    }
    mwua_fs_pair = outbox(w) || l >= MAIN_CUE ? route[0] : SUM;
    mwua_fs_sum = mwua_fs_pair == SUM;
    mwua_direct = profile == USB20 && mode == 0;
}
/* Source words already have the UAC2 byte order. The assembly reader splits
 * a wrapped ring into two straight runs and calls this for each. */
void mwua_copy(uint32_t *dst, const uint32_t *src, unsigned frames, unsigned full_speed)
{
    unsigned pairs = full_speed ? 1u : mwua_pairs;
    for (unsigned frame=0; frame<frames; ++frame, src+=20) {
        for (unsigned i=0; i<pairs; ++i) {
            unsigned p = full_speed ? mwua_fs_pair : route[i];
            *dst++ = p < SILENCE ? src[2*p] : 0;
            *dst++ = p < SILENCE ? src[2*p+1] : 0;
        }
    }
}
