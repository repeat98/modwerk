/* SPDX-License-Identifier: MIT */
#include "ui_text.h"
struct label { char text[BS_UI_LABEL_BYTES]; uint32_t size, bad; };
static void character(struct label *b, char c) {
    if (b->size < BS_UI_LABEL_BYTES-1) b->text[b->size++] = c;
    else b->bad = 1;
}
static void text(struct label *b, const char *s) {
    while (*s) character(b, *s++);
}
static void number(struct label *b, uint32_t value) {
    if (value >= 100) character(b, (char)('0'+value/100));
    if (value >= 10) character(b, (char)('0'+value/10%10));
    character(b, (char)('0'+value%10));
}
static int valid_bpm(uint32_t bpm24) { return bpm24 >= 30*24 && bpm24 <= 300*24; }
static void bpm(struct label *b, uint32_t value) {
    uint32_t fraction = (value%24*100+12)/24;
    number(b, value/24);
    character(b, '.');
    character(b, (char)('0'+fraction/10));
    character(b, (char)('0'+fraction%10));
}
static int publish(const struct label *b, char *out, uint32_t capacity) {
    if (!out || b->bad || capacity <= b->size) return 0;
    for (uint32_t i=0; i<b->size; ++i) out[i] = b->text[i];
    out[b->size] = 0;
    return 1;
}
int bs_ui_plan_label(char *out, uint32_t capacity, uint32_t count, uint32_t bpm24) {
    struct label b; b.size = b.bad = 0;
    if (count > 64 || !valid_bpm(bpm24)) return 0;
    number(&b, count); text(&b, count == 1 ? " SLICE: " : " SLICES: ");
    bpm(&b, bpm24); text(&b, " BPM");
    return publish(&b, out, capacity);
}
int bs_ui_counts_label(char *out, uint32_t capacity, uint32_t existing, uint32_t added) {
    struct label b; b.size = b.bad = 0;
    if (existing > 64 || added > 64-existing) return 0;
    text(&b, "EXISTING: "); number(&b, existing);
    text(&b, " NEW: "); number(&b, added);
    return publish(&b, out, capacity);
}
