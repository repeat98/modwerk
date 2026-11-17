// SPDX-License-Identifier: GPL-3.0-or-later
// Digi Expression: the EXPRESSION page, opened from SETTINGS > EXPRESSION for
// the active track. Each track's own settings, laid out like the stock FLTR
// and LFO pages: eight cells on knobs A-H, beside a track box like stock's.
//
//   audio track  A BEND   B V.SNS  C MW    D M.DEP
//                E VEL    F V.DEP  G AT    H A.DEP
//   MIDI track   A PB     B AT     C MW    D V.SNS
//                E -      F -      G MW>   H AT>
//
//   BEND   OFF, 1..12 semitones of TUNE (default OFF)
//   V.SNS  0..100 %: how much the played velocity counts (default 100 %)
//   MW, VEL, AT        the parameter each source moves (default none);
//                      turning opens the list, as the LFO page's DEST does,
//                      and pushing that knob closes it
//   M.DEP, V.DEP, A.DEP  -64.00..+64.00, how far (default 0), as finely as
//                      the LFO page's DEP
//   PB, AT, MW         a MIDI track passes them or not (default OFF)
//   MW>    CC 1 (adds to the track's own MW, default) or CC 2..119 alone
//   AT>    channel aftertouch (default) or CC 1..119 alone
//
// Opening it. SETTINGS > EXPRESSION, YES (a row added through the core's
// ev_settings, as Digi Matrix's MOD MATRIX). The page shows the active track,
// and follows it: TRK + trig picks another track with the page up, as on the
// stock pages. NO goes back to SETTINGS; a page key or another menu key closes
// it and does its stock job. FUNC, TRK, the trig keys and the transport keep
// their stock jobs; the LEVEL knob does nothing here (the menu under the page
// would move).
//
// Knobs. A turn goes through the firmware's own encoder accelerator with the
// step size of a stock parameter of the same kind (as Digi Perform does), so
// the page feels like the stock pages; pushed, the stock push multiplier.
// FUNC + turn jumps between useful values, as FUNC + TUNE jumps octaves:
// depths -64, -48 .. +48, +64; BEND OFF, 1, 2, 3, 5, 7, 12; V.SNS 0, 25, 50,
// 75, 100 %; a destination to the next page's first (SRC, FLTR, AMP, LFO1,
// LFO2); a CC to the next ten. After each jump the knob rests 0.4 s, as the
// firmware does.
//
// The settings are kept on the +Drive by store.c, with the project; a
// 1-second push of knob A opens the preset menu (below).

// Small rather than fast: the page and the files are not on a hot path, and
// RAM is shared with the other mods (it saves about 10 KB beside Digi Slicer).
#ifndef ME_HOST_TEST
#pragma GCC optimize ("Os", "no-tree-loop-distribute-patterns")   // and no memset, memmove or strlen calls: a mod has no C library
#endif

#include "expr.h"

#define D_RANGE   0                         // BEND OFF: nothing changes until it is set
#define D_AMOUNT  0
#define D_SENS    100

struct me_cfg me_audio_cfg[8] = {
#define A0 { { D_RANGE }, 0, 0, 0, D_SENS, D_AMOUNT, D_AMOUNT, D_AMOUNT }
    A0, A0, A0, A0, A0, A0, A0, A0,
#undef A0
};

struct me_cfg me_midi_cfg[8] = {
#define M0 { { 0 }, 0, 0, 0, D_SENS, D_AMOUNT, D_AMOUNT, D_AMOUNT }   /* THRU off */
    M0, M0, M0, M0, M0, M0, M0, M0,
#undef M0
};

#ifdef ME_HOST_TEST
#include "host_page.h"
#else
#define ACTIVE_TRACK_P (*(volatile int32_t *)0x4197c6b4)
#define TEXT        ((void (*)(void *, const void *, int, int, int, const char *, ...))0x400c27a4)
#define FILLRECT    ((void (*)(void *, int, int, int, int, int))0x400c1bce)
#define FONT5       ((const void *)0x40200ebc)
#define LABEL_FONT  ((const void *)0x401fe44c)  // the stock pages' labels, about 4 px a character
#define TITLE_FONT  ((const void *)0x401fd57c)  // the header's and the lists' font, 4 x 6, lower case
#define KEYHELD(k)  (((uint32_t (*)(int))0x400d399c)(k))
// The stock round knob (the SRC page's parameter object method, as Digi
// Perform documents it): (obj, id, value 8.8 0..0x7f00, 0, 0, bmp, x, y);
// id 148 is the plain knob. It spans x + 1..x + 17, y..y + 16.
#define KNOB_GFX    ((void (*)(void *, int, int, int, int, void *, int, int))0x4000f2bc)
// The firmware's name for a parameter id ("Frequency", ...).
#define STOCK_NAME  ((const char *(*)(int, int))0x4000feac)
// The firmware's encoder accelerator (as Digi Perform documents it): a
// parameter id's UI record, and accelerate(state, encoder, raw x multiplier,
// the record's curve, pushed) -> the change in 8.8 words; the state decays
// ten times a second.
#define ENC_DESC    ((const int *(*)(int))0x40065794)
#define ENC_ACC     ((int (*)(void *, int, int, const void *, int))0x400c06ae)
#define ENC_DECAY   ((void (*)(void *, void *))0x400c05f4)
#define LETTER_FONT ((const void *)0x401f9510)  // 5 x 9: the big letter in the stock track box
#define ICON_FONT   ((const void *)0x401fce60)  // the track box's small bold name
#define PATTERN_P   (*(volatile uint8_t *)0x4197c6c7)   // the pattern played: bank * 16 + pattern
#define INVALIDATE  ((void (*)(void *))0x400c9a3a)

static int enc_state[64];               // the accelerator's state, 0x14 bytes an encoder from 0x20

static void enc_reset(void)
{
    for (int i = 0; i < 64; i++)
        enc_state[i] = 0;
    for (int i = 0; i < 10; i++)
        enc_state[(0x20 + 0x14 * i + 0x10) / 4] = 0x30;   // as the firmware clears it
}

// A turn of n raw counts on knob k (0..7) with the feel of stock parameter
// id sid: the change in 8.8 words (256 a step).
static int enc_words(int k, int sid, int n, int pushed)
{
    const int *d = ENC_DESC(sid);
    char curve[28];
    const char *src = (const char *)d[4];
    for (int i = 0; i < 28; i++)
        curve[i] = src[i];
    return ENC_ACC(enc_state, k, n * (pushed ? d[2] : d[1]), curve, pushed);
}

static void enc_decay(void)
{
    ENC_DECAY(enc_state, 0);
}
#endif

#define KEYID(ev)    (*(int *)((char *)(ev) + 12))
#define KEYDOWN(ev)  (*(int *)((char *)(ev) + 16) & 1)
#define KEYPRESS(ev) ((*(int *)((char *)(ev) + 16) & 9) == 1)   // down, not a repeat

enum {
    K_FUNC = 1, K_TRK = 2, K_YES = 12, K_NO = 13, K_UP = 14, K_DOWN = 15, K_LEFT = 16, K_RIGHT = 17,
    K_TRIG = 19, K_PUSH_A = 40,
};
#define SHOW_TICKS 30                   // a turned cell shows its value for a second
#define LIST_TICKS 60                   // the destination list stays two seconds after the last turn
#define CELLS      8

// Stock parameter ids whose knob feel each kind of cell borrows.
#define SID_VOL    51                   // AMP VOL: 0..127
#define SID_DEPTH  59                   // LFO1 DEP: -64..+63
#define SID_LIST   111                  // the SAMP selector: a list, as Digi Perform's choosers

int me_page_open;                       // read by the tests
static int no_up;                       // NO closed the page: its release must not reach SETTINGS
static int recompose;                   // the page just closed: one more frame for the stock page
static int ticks;
static uint8_t shown[CELLS];            // ticks left showing the value instead of the label
static int list_cell = -1, list_t;      // the destination list: its cell, ticks left
static int acc[CELLS];                  // words turned that have not made a whole step yet
static int acc_track = -1;
static int idle_counts[CELLS];
static uint8_t snap_rest[CELLS];        // UI ticks a knob rests after a FUNC jump
#define SNAP_REST 12                    // 0.4 s, as the firmware locks a knob after a snap          // raw counts the accelerator has turned into nothing
#define RAW_DETENT 4                    // raw counts a detent (measured in digiemu)
#define IDLE_LIMIT (6 * RAW_DETENT)

static void close_page(void)
{
    extern int me_menu;
    me_menu = 0;
    if (me_page_open)
        recompose = 1;
    me_page_open = 0;
    list_cell = -1;
}

// ---- destinations ------------------------------------------------------------
// The sound's slots a source can move, in the order the list steps, as the
// LFO page lists them: SRC, FILTER, AMP, then the LFOs. Left out: the
// choices (PLAY, SAMP, LOOP, FLT TYPE, LFO DEST/WAVE/MODE) and slot 37,
// which the render never reads (scripts/probe-reads.py).
static const int8_t dest_order[] = {
    0,
    17, 19, 21, 22, 24,                         /* SRC: TUNE, BITR, STRT, LEN, LEV */
    26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, /* FLTR: FREQ .. REL, page 2 */
    38, 39, 40, 41, 42, 43, 44, 45,             /* AMP */
    1, 2, 3, 6, 8,                              /* LFO1: SPD, MULT, FADE, PHAS, DEP */
    9, 10, 11, 14, 16,                          /* LFO2 */
};
#define DEST_COUNT ((int)(sizeof dest_order / sizeof dest_order[0]))

// A MIDI track's destinations are its LFO page's: None, SRC Pitch Bend,
// Aftertouch, Mod Wheel, BC, then CC VAL 1-8 (on the CC numbers their SEL
// picks); then its own LFO's SPD, MULT, FADE, PHAS, DEP. Value = list position.
#define MIDI_DEST_COUNT MIDI_DESTS

static int dest_count(int mid)
{
    return mid ? MIDI_DEST_COUNT : DEST_COUNT;
}

static int dest_at(int mid, int i)
{
    return mid ? i : dest_order[i];
}

static int dest_index(int mid, int v)
{
    if (mid)
        return v >= 0 && v < MIDI_DEST_COUNT ? v : 0;
    for (int i = 0; i < DEST_COUNT; i++)
        if (dest_order[i] == v)
            return i;
    return 0;
}

// Short names, for the cell's box.
static const char *dest_short(int mid, int s)
{
    static const char *const n[46] = {
        "---",
        "SPD", "MULT", "FADE", "", "", "PHAS", "", "DEP",
        "SPD", "MULT", "FADE", "", "", "PHAS", "", "DEP",
        "TUNE", "", "BITR", "", "STRT", "LEN", "", "LEV",
        "", "FREQ", "RESO", "ENV", "ATK", "DEC", "SUS", "REL",
        "BASE", "WDTH", "DEL", "SRR", "",
        "ATK", "HOLD", "DEC", "OVER", "DEL", "REV", "PAN", "VOL",
    };
    static const char *const m[MIDI_DEST_COUNT] = {
        "---", "PB", "AT", "MW", "BC", "VAL1", "VAL2", "VAL3", "VAL4", "VAL5", "VAL6", "VAL7", "VAL8",
        "SPD", "MULT", "FADE", "PHAS", "DEP",
    };
    if (mid)
        return s >= 0 && s < MIDI_DEST_COUNT ? m[s] : "---";
    return s >= 0 && s <= 45 ? n[s] : "---";
}

// The page the destination is on, for the box's first line and the list.
static const char *dest_page(int mid, int s)
{
    if (mid)
        return s <= 0 ? "" : s <= 4 ? "SRC" : s < MIDI_LFO_FIRST ? "CC" : "LFO";
    return s <= 0 ? "" : s <= 8 ? "LFO1" : s <= 16 ? "LFO2" : s <= 24 ? "SRC" : s <= 37 ? "FLTR" : "AMP";
}

// Which page: audio 0 none, 1 SRC, 2 FLTR, 3 AMP, 4 LFO1, 5 LFO2; MIDI 0 none, 1 SRC, 2 CC.
static int dest_group(int mid, int s)
{
    if (mid)
        return s <= 0 ? 0 : s <= 4 ? 1 : s < MIDI_LFO_FIRST ? 2 : 3;
    return s <= 0 ? 0 : s <= 8 ? 4 : s <= 16 ? 5 : s <= 24 ? 1 : s <= 37 ? 2 : 3;
}

// The firmware's parameter id of a sound slot (Digi Perform's measured map).
static int slot_id(int s)
{
    if (s <= 8)
        return s + 51;
    if (s <= 16)
        return s + 52;
    if (s <= 24)
        return s + 91;
    if (s >= 29 && s <= 32)
        return s + 5;
    if (s <= 28)
        return s == 25 ? 33 : s == 26 ? 30 : s == 27 ? 32 : 38;
    if (s <= 35)
        return s == 33 ? 40 : s == 34 ? 41 : 39;
    return s + 6;
}

// The list's line for a destination: "FLTR:Frequency", "SRC:Mod Wheel",
// "CC:CC3 VAL #74" (the CC number its SEL picks on this track; "Value" left
// no room for a two-digit number).
static void dest_line(char *line, int size, int mid, int m, int s)
{
    static const char *const src[4] = { "Pitch Bend", "Aftertouch", "Mod Wheel", "BC" };
    int n = 0;
    const char *p = s ? dest_page(mid, s) : "None", *name = "";
    static const int8_t lfo_slot[5] = { 1, 2, 3, 6, 8 };   // the audio LFO's slots: the same names
    if (s && !mid)
        name = STOCK_NAME(0, slot_id(s));
    else if (s >= MIDI_LFO_FIRST)
        name = STOCK_NAME(0, slot_id(lfo_slot[s - MIDI_LFO_FIRST]));
    else if (s && s <= 4)
        name = src[s - 1];
    if (!name)
        name = dest_short(mid, s);
    while (*p && n < size - 1)
        line[n++] = *p++;
    if (s && n < size - 1)
        line[n++] = ':';
    while (*name && n < size - 1)
        line[n++] = *name++;
    if (mid && s > 4 && s < MIDI_LFO_FIRST && n < size - 12) {
        int k = s - 5, sel = me_midi_sel(m, k);
        const char *t = "CC";
        while (*t)
            line[n++] = *t++;
        line[n++] = (char)('1' + k);
        t = " VAL";
        while (*t)
            line[n++] = *t++;
        if (sel >= 0) {
            line[n++] = ' ';
            line[n++] = '#';
            if (sel >= 100) line[n++] = (char)('0' + sel / 100);
            if (sel >= 10) line[n++] = (char)('0' + sel / 10 % 10);
            line[n++] = (char)('0' + sel % 10);
        }
    }
    line[n] = 0;
}

// For the files (store.c): a destination's list line, and whether a value is one the list offers.
void me_dest_name(char *line, int size, int mid, int track, int value)
{
    dest_line(line, size, mid, track, value);
}

int me_dest_valid(int mid, int value)
{
    if (mid)
        return value >= 0 && value < MIDI_DEST_COUNT;
    for (int i = 0; i < DEST_COUNT; i++)
        if (dest_order[i] == value)
            return 1;
    return 0;
}

// ---- the cells ------------------------------------------------------------------
enum kind { C_NONE, C_RANGE, C_SENS, C_DEST, C_AMOUNT, C_ONOFF };

struct cell {
    uint8_t kind;
    const char *label;
};

static const struct cell audio_cells[CELLS] = {
    { C_RANGE, "BEND" }, { C_SENS, "V.SNS" }, { C_DEST, "MW" },  { C_AMOUNT, "M.DEP" },
    { C_DEST, "VEL" },   { C_AMOUNT, "V.DEP" }, { C_DEST, "AT" }, { C_AMOUNT, "A.DEP" },
};

static const struct cell midi_cells[CELLS] = {
    { C_ONOFF, "THRU" }, { C_SENS, "V.SNS" }, { C_DEST, "MW" }, { C_AMOUNT, "M.DEP" },
    { C_DEST, "VEL" },   { C_AMOUNT, "V.DEP" }, { C_DEST, "AT" }, { C_AMOUNT, "A.DEP" },
};

static int track(void)
{
    int t = ACTIVE_TRACK_P;
    return t >= 0 && t < 16 ? t : 0;
}

static const struct cell *cell_of(int t, int k)
{
    return t < 8 ? &audio_cells[k] : &midi_cells[k];
}

static int within(int v, int lo, int hi)
{
    return v < lo ? lo : v > hi ? hi : v;
}

static struct me_cfg *cfg_track(int t)
{
    return t < 8 ? &me_audio_cfg[t] : &me_midi_cfg[t - 8];
}

// The setting behind cell k of track t (knob A: BEND or THRU).
int me_page_value(int t, int k)
{
    struct me_cfg *a = cfg_track(t);
    switch (k) {
    case 0: return a->range;
    case 1: return a->vel_sens;
    case 2: return a->mw_dest;
    case 3: return a->mw_amount;
    case 4: return a->vel_dest;
    case 5: return a->vel_amount;
    case 6: return a->at_dest;
    default: return a->at_amount;
    }
}

int me_page_default(int t, int k)
{
    switch (cell_of(t, k)->kind) {
    case C_RANGE:  return D_RANGE;
    case C_SENS:   return D_SENS;
    case C_AMOUNT: return D_AMOUNT;
    case C_ONOFF:  return 0;
    default:       return 0;            // C_DEST: none
    }
}

static void set_value(int t, int k, int v)
{
    struct me_cfg *a = cfg_track(t);
    int before = me_page_value(t, k);
    switch (k) {
    case 0: a->range = (int16_t)v; break;
    case 1: a->vel_sens = (int8_t)v; break;
    case 2: a->mw_dest = (int8_t)v; break;
    case 3: a->mw_amount = (int16_t)v; break;
    case 4: a->vel_dest = (int8_t)v; break;
    case 5: a->vel_amount = (int16_t)v; break;
    case 6: a->at_dest = (int8_t)v; break;
    default: a->at_amount = (int16_t)v; break;
    }
    if (t >= 8 && k != 1 && before != v)
        me_midi_changed(t - 8);         // what the synth gets follows at once
}

static int sid_of(int kind)
{
    switch (kind) {
    case C_SENS:   return SID_VOL;
    case C_RANGE:                       // BEND turns as finely as a depth: words are 1/256 semitone
    case C_AMOUNT: return SID_DEPTH;
    default:       return SID_LIST;     // C_DEST, C_ONOFF
    }
}

// The next of a list of useful values from v, in the direction of d.
static int next_of(const int *list, int count, int v, int d)
{
    if (d > 0) {
        for (int i = 0; i < count; i++)
            if (list[i] > v)
                return list[i];
        return list[count - 1];
    }
    for (int i = count - 1; i >= 0; i--)
        if (list[i] < v)
            return list[i];
    return list[0];
}

// FUNC + turn: the next useful value of cell k from v, in the direction of d.
static int snap(int kind, int mid, int v, int d)
{
    static const int sens[] = { 0, 25, 50, 75, 100 };
    switch (kind) {
    case C_RANGE: {                     // whole semitones: OFF, 1, 2 ... 12
        int s = d > 0 ? v / 256 + 1 : (v + 255) / 256 - 1;
        return within(s, 0, PB_RANGE_MAX) * 256;
    }
    case C_SENS:  return next_of(sens, 5, v, d);
    case C_AMOUNT: {
        int step = 16 * 256, q = v >= 0 ? v / step : -((-v + step - 1) / step);   // floor
        int lo = q * step;
        v = d > 0 ? lo + step : (lo == v ? v - step : lo);
        return within(v, -AMOUNT_MAX, AMOUNT_MAX);
    }
    case C_DEST: {                      // the first of the next page, or of this one going back
        int i = dest_index(mid, v), g = dest_group(mid, v), n = dest_count(mid);
        if (d > 0) {
            while (i + 1 < n && dest_group(mid, dest_at(mid, i)) == g)
                i++;
        } else if (i > 0) {
            if (dest_group(mid, dest_at(mid, i - 1)) != g)
                g = dest_group(mid, dest_at(mid, --i));     // already the first: the page before
            while (i > 0 && dest_group(mid, dest_at(mid, i - 1)) == g)
                i--;
        }
        return dest_at(mid, i);
    }
    default:
        return v;
    }
}

// Move cell k of track t by delta (whole steps; for a depth, 1/256 steps);
// snap: FUNC + turn, the next useful value in delta's direction.
void me_page_change(int t, int k, int delta, int snapping)
{
    const struct cell *c = cell_of(t, k);
    int v = me_page_value(t, k);
    if (c->kind == C_NONE || !delta)
        return;
    if (snapping && c->kind != C_ONOFF) {
        set_value(t, k, snap(c->kind, t >= 8, v, delta));
        return;
    }
    switch (c->kind) {
    case C_RANGE:  v = within(v + delta, 0, BEND_MAX); break;
    case C_SENS:   v = within(v + delta, 0, VEL_SENS_MAX); break;
    case C_AMOUNT: v = within(v + delta, -AMOUNT_MAX, AMOUNT_MAX); break;
    case C_DEST: {
        int mid = t >= 8;
        v = dest_at(mid, within(dest_index(mid, v) + delta, 0, dest_count(mid) - 1));
        break;
    }
    case C_ONOFF:  v = delta > 0; break;
    }
    set_value(t, k, v);
}

// ---- drawing --------------------------------------------------------------------
// y grows upwards: 0 is the bottom row of pixels, 63 the top. Measured off
// the stock LFO page: the cells' columns start at x = 24 + 26 * column, the
// top row's graphics at y 34..50 with the labels at 27, the bottom row's at
// 7..23 with the labels at 0; the header's white bar runs x 17..127, y 54..63.
#define CELL_X(k)   (24 + 26 * ((k) & 3))
#define CELL_Y(k)   ((k) < 4 ? 34 : 7)

static int text_width(const void *font, const char *s)
{
#ifdef ME_HOST_TEST
    (void)font;
    int n = 0;
    while (s[n])
        n++;
    return n ? 4 * n - 1 : 0;
#else
    if (font == FONT5) {                // fixed width: 3-pixel glyphs and a gap
        int n = 0;
        while (s[n])
            n++;
        return n ? 4 * n - 1 : 0;
    }
    const unsigned char *w = ((const unsigned char *const *)font)[2];
    int a = 0;
    for (; *s; s++)
        a += w[(unsigned char)*s] + 1;
    return a ? a - 1 : 0;
#endif
}

static void centred(void *bmp, const void *font, int cx, int y, const char *s)
{
    TEXT(bmp, font, cx - text_width(font, s) / 2, y, -1, "%s", s);
}

// A box like the LFO page's MULT and DEST cells: corners left open.
static void box(void *bmp, int x0, int y0, int x1, int y1)
{
    FILLRECT(bmp, x0 + 1, y1, x1 - 1, y1, 1);
    FILLRECT(bmp, x0 + 1, y0, x1 - 1, y0, 1);
    FILLRECT(bmp, x0, y0 + 1, x0, y1 - 1, 1);
    FILLRECT(bmp, x1, y0 + 1, x1, y1 - 1, 1);
}

// The stock TRIG page's empty cell: a dotted box.
static void dotted(void *bmp, int x, int y)
{
    for (int i = 0; i < 8; i++) {
        FILLRECT(bmp, x + 2 + 2 * i, y + 16, x + 2 + 2 * i, y + 16, 1);
        FILLRECT(bmp, x + 2 + 2 * i, y, x + 2 + 2 * i, y, 1);
        FILLRECT(bmp, x + 1, y + 1 + 2 * i, x + 1, y + 1 + 2 * i, 1);
        FILLRECT(bmp, x + 17, y + 1 + 2 * i, x + 17, y + 1 + 2 * i, 1);
    }
}

static void knob(void *bmp, int x, int y, int pos127, int bipolar)
{
    KNOB_GFX(0, 148, within(pos127, 0, 127) << 8, 0, 0, bmp, x, y);
    if (bipolar) {                      // the stock pages' - and + under a bipolar knob
        FILLRECT(bmp, x - 1, y + 1, x + 1, y + 1, 1);
        FILLRECT(bmp, x + 17, y + 1, x + 19, y + 1, 1);
        FILLRECT(bmp, x + 18, y, x + 18, y + 2, 1);
    }
}

static void format_value(char *b, int t, int k)
{
    int v = me_page_value(t, k);
    const char *s = 0;
    switch (cell_of(t, k)->kind) {
    case C_RANGE:                       // BEND: 2.50 semitones, no sign
        if (v <= 0) { s = "OFF"; break; }
        /* fall through */
    case C_AMOUNT: {                    // as the LFO page's DEP: +12.50
        int a = v < 0 ? -v : v, w = a >> 8, f = ((a & 255) * 100 + 128) >> 8, i = 0;
        if (f > 99)
            f = 99;
        b[i++] = v < 0 ? '-' : v > 0 && cell_of(t, k)->kind == C_AMOUNT ? '+' : ' ';
        if (w >= 10)
            b[i++] = (char)('0' + w / 10);
        b[i++] = (char)('0' + w % 10);
        b[i++] = '.';
        b[i++] = (char)('0' + f / 10);
        b[i++] = (char)('0' + f % 10);
        b[i] = 0;
        if (b[0] == ' ')
            for (int j = 0; j <= i; j++)
                b[j] = b[j + 1];
        break;
    }
    case C_SENS: {
        char d[6];
        int n = 0, a = v < 0 ? -v : v, i = 0;
        if (v < 0) b[i++] = '-';
        do { d[n++] = (char)('0' + a % 10); a /= 10; } while (a);
        while (n) b[i++] = d[--n];
        if (cell_of(t, k)->kind == C_SENS) b[i++] = '%';
        b[i] = 0;
        break;
    }
    case C_ONOFF:  s = v ? "ON" : "OFF"; break;
    default:       s = dest_short(t >= 8, v); break;
    }
    if (s) {
        int i = 0;
        for (; s[i] && i < 7; i++)
            b[i] = s[i];
        b[i] = 0;
    }
}

static void draw_cell(void *bmp, int t, int k)
{
    const struct cell *c = cell_of(t, k);
    int x = CELL_X(k), y = CELL_Y(k), v = me_page_value(t, k);
    char val[8];
    format_value(val, t, k);
    switch (c->kind) {
    case C_NONE:
        dotted(bmp, x, y);
        break;
    case C_RANGE:                       // the semitones in a box as wide as the destinations'
        box(bmp, x - 1, y, x + 19, y + 16);
        centred(bmp, LABEL_FONT, x + 9, y + 9, "ST");
        {                               // in the box: tenths (2.5, 12.0), the label shows 2.50
            char bx[8];
            int i = 0;
            for (; val[i]; i++)
                bx[i] = val[i];
            bx[i - (v > 0)] = 0;
            centred(bmp, LABEL_FONT, x + 9, y + 2, bx);
        }
        break;
    case C_SENS:
        knob(bmp, x, y, v * 127 / VEL_SENS_MAX, 0);
        break;
    case C_AMOUNT:
        knob(bmp, x, y, (v + AMOUNT_MAX) * 127 / (2 * AMOUNT_MAX), 1);
        break;
    case C_ONOFF:
        box(bmp, x + 1, y + 4, x + 17, y + 12);
        if (v) {                        // ON: the box filled, the word dark
            centred(bmp, FONT5, x + 9, y + 6, "ON");
            FILLRECT(bmp, x + 2, y + 5, x + 16, y + 11, -1);
        } else {
            centred(bmp, FONT5, x + 9, y + 6, "OFF");
        }
        break;
    case C_DEST: {                      // a wide box like the LFO page's DEST
        int mid = t >= 8;
        char top[6];
        const char *pg = dest_page(mid, v);
        int i = 0;
        if (mid && v > 4 && v < MIDI_LFO_FIRST) {   // a CC VAL slot: its CC number on top
            int sel = me_midi_sel(t - 8, v - 5);
            top[i++] = '#';
            if (sel < 0) {
                top[i++] = '-';
            } else {
                if (sel >= 100) top[i++] = (char)('0' + sel / 100);
                if (sel >= 10) top[i++] = (char)('0' + sel / 10 % 10);
                top[i++] = (char)('0' + sel % 10);
            }
        } else {
            while (*pg && i < 5)
                top[i++] = *pg++;
        }
        top[i] = 0;
        box(bmp, x - 1, y, x + 19, y + 16);
        if (*top) {
            centred(bmp, LABEL_FONT, x + 9, y + 9, top);
            centred(bmp, LABEL_FONT, x + 9, y + 2, dest_short(mid, v));
        } else {
            centred(bmp, LABEL_FONT, x + 9, y + 6, dest_short(mid, v));
        }
        break;
    }
    }
    // the label under it, or the value for a moment after a turn
    int value = (shown[k] && c->kind != C_DEST && c->kind != C_NONE)
                ;
    centred(bmp, LABEL_FONT, x + 9, y - 7, value ? val : c->label);
}

// The LFO page's destination list: the right of the page, seven rows, the
// chosen one inverted, a scroll bar (measured off the stock list).
static void draw_list(void *bmp, int t, int k)
{
    int mid = t >= 8, count = dest_count(mid);
    int cur = dest_index(mid, me_page_value(t, k));
    int first = within(cur - 3, 0, count > 7 ? count - 7 : 0);
    FILLRECT(bmp, 50, 0, 127, 53, 0);
    for (int r = 0; r < 7 && first + r < count; r++) {
        int y = 45 - 7 * r, n;
        char line[28];
        dest_line(line, sizeof line, mid, t - 8, dest_at(mid, first + r));
        for (n = 0; line[n]; n++)
            ;
        while (n > 1 && text_width(LABEL_FONT, line) > 70)
            line[--n] = 0;              // what does not fit before the scroll bar
        TEXT(bmp, LABEL_FONT, 52, y, -1, "%s", line);
        if (first + r == cur)
            FILLRECT(bmp, 51, y - 1, 122, y + 5, -1);
    }
    for (int y = 0; y < 52; y += 2)     // the bar's track
        FILLRECT(bmp, 125 + (y >> 1 & 1), y, 125 + (y >> 1 & 1), y, 1);
    int len = 52 * 7 / count, top = 52 - (52 - len) * first / (count - 7);
    FILLRECT(bmp, 124, top - len, 127, top, 0);
    box(bmp, 124, top - len, 127, top);
}

// ---- the preset menu (a 1-second push of knob A) --------------------------------------
// As the stock menus: UP/DOWN or the LEVEL knob move, YES chooses, NO goes
// back. LOAD, SAVE and DEFAULT list the 64 preset slots of this kind of track
// (audio or MIDI); SAVE then names it as SAVE PROJECT AS does (UP/DOWN the
// character, LEFT/RIGHT the cursor, FUNC + YES inserts, FUNC + NO deletes,
// YES saves, NO aborts); RESET puts the track back to the default preset;
// DEFAULT picks the preset new projects and RESET start from (Factory: the
// mod's own defaults). The files are store.c's.
enum { M_OFF, M_MAIN, M_LOAD, M_SAVE, M_NAME, M_DEFAULT, M_RESET, M_OVERWRITE };
#define LONG_PUSH  30                   // ticks: a second
#define MSG_TICKS  30
static const char *const main_items[4] = { "LOAD", "SAVE", "RESET TO DEFAULT", "SELECT DEFAULT" };
// FUNC held on the naming screen: the stock one's character grid (FUNC + arrows pick, letting go of FUNC writes it).
static const char grid_chars[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.&+!# ";
#define GRID_COLS 15
static int grid_cur, grid_on;
static int level_acc;                  // the LEVEL knob's raw counts towards a detent, in the menu
static const char name_chars[] = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.&+!#";
int me_menu;                            // read by the tests (0: no menu)
static int menu_cur[8], menu_top, push_a, push_twist, msg_t, edit_pos, edit_slot;
static const char *msg;
static char edit_name[ME_NAME_LEN + 1];

static int menu_count(int m)
{
    return m == M_MAIN ? 4 : m == M_DEFAULT ? ME_PRESETS + 1 : ME_PRESETS;
}

static void menu_open(int m)
{
    me_menu = m;
    menu_top = 0;
    if (m == M_LOAD || m == M_SAVE || m == M_DEFAULT)
        me_presets_rescan(track() >= 8);
    if (m == M_DEFAULT)
        menu_cur[m] = me_default_preset(track() >= 8) + 1;
    recompose = 1;
}

static void say(const char *m)
{
    msg = m;
    msg_t = MSG_TICKS;
}

static void two_digits(char *b, int v)
{
    b[0] = (char)('0' + v / 10 % 10);
    b[1] = (char)('0' + v % 10);
}

// The line for row i of a list menu.
static void menu_line(char *line, int m, int i, int mid)
{
    int n = 0;
    const char *nm;
    if (m == M_MAIN) {
        for (nm = main_items[i]; *nm; nm++)
            line[n++] = *nm;
        line[n] = 0;
        return;
    }
    if (m == M_DEFAULT) {
        if (i == 0) {
            for (nm = "00 FACTORY"; *nm; nm++) line[n++] = *nm;
        } else {
            two_digits(line, i);
            n = 2;
            line[n++] = ' ';
            nm = me_preset_name(mid, i - 1);
            if (!*nm) nm = "----";
            while (*nm && n < 20) line[n++] = *nm++;
        }
        if (i - 1 == me_default_preset(mid))
            line[n++] = ' ', line[n++] = '*';
        line[n] = 0;
        return;
    }
    two_digits(line, i + 1);
    n = 2;
    line[n++] = ' ';
    nm = me_preset_name(mid, i);
    if (!*nm) nm = "----";
    while (*nm && n < 20) line[n++] = *nm++;
    line[n] = 0;
}

static void draw_menu(void *bmp, int t)
{
    int mid = t >= 8, m = me_menu;
    FILLRECT(bmp, 16, 0, 127, 53, 0);
    if (m == M_NAME) {                  // the naming screen: "05:LEAD", the character inverted
        char line[24], pre[24];
        two_digits(line, edit_slot + 1);
        line[2] = ':';
        int n = 3, len = 0;
        for (int i = 0; edit_name[i]; i++) line[n++] = edit_name[i], len++;
        line[n] = 0;
        box(bmp, 20, 30, 122, 43);
        TEXT(bmp, TITLE_FONT, 23, 34, -1, "%s", line);
        for (int i = 0; i < 3 + edit_pos; i++) pre[i] = i < n ? line[i] : ' ';   // past the end: spaces
        pre[3 + edit_pos] = 0;
        char c[2] = { edit_pos < len ? edit_name[edit_pos] : ' ', 0 };
        int x0 = 23 + text_width(TITLE_FONT, pre) + 1, w = c[0] == ' ' ? 3 : text_width(TITLE_FONT, c);
        FILLRECT(bmp, x0 - 1, 33, x0 + w, 40, -1);   // proportional letters: measured, not counted
        if (grid_on && KEYHELD(K_FUNC)) {   // the character grid, as the stock naming screen
            for (int i = 0; grid_chars[i]; i++) {
                int gx = 22 + 7 * (i % GRID_COLS), gy = 21 - 8 * (i / GRID_COLS);
                char g[2] = { grid_chars[i], 0 };
                TEXT(bmp, TITLE_FONT, gx, gy, -1, "%s", g[0] == ' ' ? "_" : g);
                if (i == grid_cur)
                    FILLRECT(bmp, gx - 1, gy - 1, gx + 5, gy + 6, -1);
            }
            return;
        }
        TEXT(bmp, LABEL_FONT, 22, 21, -1, "%s", "U/D:CHAR  L/R:CURSOR");
        TEXT(bmp, LABEL_FONT, 22, 14, -1, "%s", "FUNC:LETTERS");
        TEXT(bmp, LABEL_FONT, 22, 7, -1, "%s", "FUNC+YES/NO:INS/DEL");
        TEXT(bmp, LABEL_FONT, 22, 0, -1, "%s", "YES:SAVE  NO:ABORT");
        return;
    }
    if (m == M_RESET || m == M_OVERWRITE) {
        box(bmp, 24, 14, 120, 40);
        TEXT(bmp, LABEL_FONT, 30, 30, -1, "%s", m == M_RESET ? "RESET TO DEFAULT?" : "OVERWRITE PRESET?");
        TEXT(bmp, LABEL_FONT, 30, 19, -1, "%s", "YES / NO");
        return;
    }
    if (m != M_MAIN && !me_presets_ready(mid)) {
        TEXT(bmp, LABEL_FONT, 30, 26, -1, "%s", "READING PRESETS...");
        return;
    }
    int count = menu_count(m), cur = menu_cur[m];
    if (cur < menu_top) menu_top = cur;
    if (cur > menu_top + 6) menu_top = cur - 6;
    for (int r = 0; r < 7 && menu_top + r < count; r++) {
        int y = 45 - 7 * r;
        char line[28];
        menu_line(line, m, menu_top + r, mid);
        TEXT(bmp, LABEL_FONT, 22, y, -1, "%s", line);
        if (menu_top + r == cur)
            FILLRECT(bmp, 21, y - 1, 122, y + 5, -1);
    }
    if (count > 7) {
        for (int y = 0; y < 52; y += 2)
            FILLRECT(bmp, 125 + (y >> 1 & 1), y, 125 + (y >> 1 & 1), y, 1);
        int len = 52 * 7 / count, top = 52 - (52 - len) * menu_top / (count - 7);
        FILLRECT(bmp, 124, top - len, 127, top, 0);
        box(bmp, 124, top - len, 127, top);
    }
}

static int char_index(char c)
{
    for (int i = 0; name_chars[i]; i++)
        if (name_chars[i] == c)
            return i;
    return 0;
}

// The cursor may stand past the name's end, as on the stock naming screen:
// writing there fills the gap with spaces (trimmed again when saved).
static int name_pad(void)
{
    int len = 0;
    while (edit_name[len]) len++;
    while (len <= edit_pos && len < ME_NAME_LEN)
        edit_name[len++] = ' ';
    edit_name[len] = 0;
    return edit_pos < len;
}

static void name_change(int d)
{
    int n = (int)sizeof name_chars - 1;
    if (!name_pad())
        return;
    int i = (char_index(edit_name[edit_pos]) + d % n + n) % n;
    edit_name[edit_pos] = name_chars[i];
}

static void name_trim(void)
{
    int len = 0;
    while (edit_name[len]) len++;
    while (len > 0 && edit_name[len - 1] == ' ')
        edit_name[--len] = 0;
}

static void menu_move(int d)
{
    int m = me_menu;
    if (m == M_NAME) {
        name_change(d);
        return;
    }
    if (m == M_RESET || m == M_OVERWRITE)
        return;
    menu_cur[m] += d;
    if (menu_cur[m] < 0) menu_cur[m] = 0;
    if (menu_cur[m] >= menu_count(m)) menu_cur[m] = menu_count(m) - 1;
}

static void do_save(int mid, int t)
{
    name_trim();
    if (me_preset_save(mid, edit_slot, edit_name[0] ? edit_name : "-", t))
        say("SAVED");
    me_menu = M_MAIN;
}

static void menu_yes(int t)
{
    int mid = t >= 8, tr = mid ? t - 8 : t, m = me_menu, cur = menu_cur[m];
    if (me_store_busy())
        return;
    switch (m) {
    case M_MAIN:
        menu_open(cur == 0 ? M_LOAD : cur == 1 ? M_SAVE : cur == 2 ? M_RESET : M_DEFAULT);
        break;
    case M_LOAD:
        if (!me_presets_ready(mid)) break;
        if (!*me_preset_name(mid, cur)) { say("EMPTY"); break; }
        if (me_preset_load(mid, cur, tr)) say("LOADED");
        me_menu = M_MAIN;
        break;
    case M_SAVE: {
        if (!me_presets_ready(mid)) break;
        const char *nm = me_preset_name(mid, cur);
        int i = 0;
        edit_slot = cur;
        if (!*nm || (nm[0] == '-' && !nm[1])) nm = "NEW";
        for (; nm[i] && i < ME_NAME_LEN; i++) edit_name[i] = nm[i];
        edit_name[i] = 0;
        edit_pos = 0;
        me_menu = M_NAME;
        break;
    }
    case M_NAME:
        if (KEYHELD(K_FUNC)) {          // FUNC + YES: insert a space; the cursor stays on its letter, as stock
            grid_on = 0;                // and letting go of FUNC then writes nothing
            int len = 0;
            while (edit_name[len]) len++;
            if (len < ME_NAME_LEN && edit_pos < len) {
                for (int i = len; i >= edit_pos; i--) edit_name[i + 1] = edit_name[i];
                edit_name[edit_pos] = ' ';
                if (edit_pos < ME_NAME_LEN - 1) edit_pos++;
            }
            break;
        }
        if (*me_preset_name(mid, edit_slot)) me_menu = M_OVERWRITE;
        else do_save(mid, tr);
        break;
    case M_OVERWRITE:
        do_save(mid, tr);
        break;
    case M_RESET:
        if (me_track_reset(mid, tr)) say("RESET");
        me_menu = M_MAIN;
        break;
    case M_DEFAULT:
        if (!me_presets_ready(mid)) break;
        if (cur > 0 && !*me_preset_name(mid, cur - 1)) { say("EMPTY"); break; }
        if (me_default_set(mid, cur - 1)) say(cur ? "DEFAULT SET" : "DEFAULT: FACTORY");
        me_menu = M_MAIN;
        break;
    }
    recompose = 1;
}

static void menu_no(void)
{
    int m = me_menu;
    if (m == M_NAME && KEYHELD(K_FUNC)) {   // FUNC + NO: delete as stock: the letter before the cursor
        grid_on = 0;                    // and letting go of FUNC then writes nothing
        int len = 0, at = edit_pos > 0 ? edit_pos - 1 : 0;   // (at the first place, the one under it)
        while (edit_name[len]) len++;
        if (at < len)
            for (int i = at; edit_name[i]; i++) edit_name[i] = edit_name[i + 1];
        if (edit_pos > 0) edit_pos--;
        return;
    }
    me_menu = m == M_MAIN ? M_OFF : m == M_NAME ? M_SAVE : m == M_OVERWRITE ? M_NAME : M_MAIN;
    recompose = 1;
}

static int grid_index(char c)
{
    for (int i = 0; grid_chars[i]; i++)
        if (grid_chars[i] == c)
            return i;
    return 0;
}

static int menu_key(void *ev, int t)
{
    int id = KEYID(ev), press = KEYPRESS(ev);
    if (id == 1) {                      // FUNC: always stock's too (a swallowed release sticks it)
        if (me_menu == M_NAME) {
            if (press) {
                int len = 0;
                while (edit_name[len]) len++;
                grid_cur = grid_index(edit_pos < len ? edit_name[edit_pos] : ' ');
                grid_on = 1;
            } else if (!KEYDOWN(ev) && grid_on) {   // letting go: the picked character
                grid_on = 0;
                if (name_pad())
                    edit_name[edit_pos] = grid_chars[grid_cur];
                if (edit_pos < ME_NAME_LEN - 1)
                    edit_pos++;         // on to the next place, as the stock naming screen
            }
            recompose = 1;
        }
        return 0;
    }
    if ((id >= 24 && id <= 39) || id == 9 || id == 10 || id == 11 || id == 2)
        return 0;                       // the trig keys, REC, PLAY, STOP and TRK, as stock
    int ours = id == K_UP || id == K_DOWN || id == K_LEFT || id == K_RIGHT || id == K_YES || id == K_NO
               || (id >= K_PUSH_A && id <= K_PUSH_A + 8);
    if (!ours) {                        // another page or menu key: the page goes, stock does its job
        if (press)
            close_page();
        return 0;
    }
    int arrow = id == K_UP || id == K_DOWN || id == K_LEFT || id == K_RIGHT;
    int repeat = (*(int *)((char *)(ev) + 16) & 9) == 9;   // held: the firmware's own repeat, as stock
    if (!press && !(arrow && repeat))
        return 1;
    int grid = me_menu == M_NAME && grid_on && KEYHELD(K_FUNC);
    switch (id) {
    case K_UP:
        if (grid) grid_cur = (grid_cur - GRID_COLS + (int)sizeof grid_chars - 1) % ((int)sizeof grid_chars - 1);
        else menu_move(me_menu == M_NAME ? 1 : -1);
        break;
    case K_DOWN:
        if (grid) grid_cur = (grid_cur + GRID_COLS) % ((int)sizeof grid_chars - 1);
        else menu_move(me_menu == M_NAME ? -1 : 1);
        break;
    case K_LEFT:
        if (grid) grid_cur = (grid_cur + (int)sizeof grid_chars - 2) % ((int)sizeof grid_chars - 1);
        else if (me_menu == M_NAME && edit_pos > 0) edit_pos--;
        break;
    case K_RIGHT:
        if (grid) {
            grid_cur = (grid_cur + 1) % ((int)sizeof grid_chars - 1);
        } else if (me_menu == M_NAME && edit_pos < ME_NAME_LEN - 1) {
            edit_pos++;                 // past the end too, as stock
        }
        break;
    case K_NO:    menu_no(); break;
    default:      menu_yes(t); break;     // YES, or a push of a knob: into the item, as YES
    }
    recompose = 1;
    return 1;
}

// Over the header's title ("Trig Parameters"): ours, in the same font.
static void draw_title(void *bmp)
{
    FILLRECT(bmp, 18, 54, 126, 63, 0);
    FILLRECT(bmp, 17, 55, 127, 62, 0);
    const char *what = me_menu == M_LOAD ? "Load preset" : me_menu == M_SAVE || me_menu == M_NAME
                       || me_menu == M_OVERWRITE ? "Save preset" : me_menu == M_DEFAULT ? "Select default" : "Expr. presets";   // the bar holds about 22 characters
    if (me_menu == M_OFF)
        TEXT(bmp, TITLE_FONT, 19, 56, -1, "%s", "Expression");
    else                                // which kind of track's presets, as in the stock sound menus
        TEXT(bmp, TITLE_FONT, 19, 56, -1, "%s %s", track() >= 8 ? "[MIDI]" : "[SND]", what);
    FILLRECT(bmp, 18, 54, 126, 63, -1);
    FILLRECT(bmp, 17, 55, 17, 62, -1);
    FILLRECT(bmp, 127, 55, 127, 62, -1);
}

// The track box, as the stock pages draw it at the left: the pattern in the
// header's corner, then SMP 1-8 or MID A-H in a box.
static void draw_track_box(void *bmp, int t)
{
    char b[4];
    int p = PATTERN_P;
    b[0] = (char)('A' + (p >> 4 & 7));
    b[1] = (char)('0' + ((p & 15) + 1) / 10);
    b[2] = (char)('0' + ((p & 15) + 1) % 10);
    b[3] = 0;
    FILLRECT(bmp, 0, 54, 15, 63, 0);    // as the title bar: drawn white, then inverted
    TEXT(bmp, ICON_FONT, 1, 56, -1, "%s", b);
    FILLRECT(bmp, 0, 54, 15, 63, -1);
    box(bmp, 0, 28, 15, 52);
    centred(bmp, ICON_FONT, 8, 45, t >= 8 ? "MID" : "SMP");
    b[0] = (char)(t >= 8 ? 'A' + t - 8 : '1' + t);
    b[1] = 0;
    centred(bmp, LETTER_FONT, 8, 31, b);
}

void me_page_draw(void *bmp, void *ctrl)
{
    (void)ctrl;
    if (!me_page_open || !bmp)
        return;
    int t = track();
    FILLRECT(bmp, 0, 0, 127, 63, 0);    // over SETTINGS: the whole screen is the page's
    draw_track_box(bmp, t);
    draw_title(bmp);
    if (me_menu) {
        draw_menu(bmp, t);
    } else {
        for (int k = 0; k < CELLS; k++)
            draw_cell(bmp, t, k);
        if (list_cell >= 0 && cell_of(t, list_cell)->kind == C_DEST)
            draw_list(bmp, t, list_cell);
    }
    if (msg_t && msg) {                 // a short message, as the stock "SAVE OK"
        FILLRECT(bmp, 40, 18, 112, 34, 0);
        box(bmp, 40, 18, 112, 34);
        centred(bmp, LABEL_FONT, 76, 23, msg);
    }
}

// ---- ev_tick (from me_tick) -----------------------------------------------------
void me_page_tick(void *ctrl)
{
    if (++ticks >= 3) {                 // the firmware decays its accelerators ten times a second
        ticks = 0;
        enc_decay();
    }
    for (int k = 0; k < CELLS; k++) {
        if (shown[k])
            shown[k]--;
        if (snap_rest[k])
            snap_rest[k]--;
    }
    if (list_t && !--list_t)
        list_cell = -1;
    if (msg_t && !--msg_t)
        recompose = 1;
    if (push_a) {                       // knob A held down: a second opens the preset menu
        if (!me_page_open || !KEYHELD(K_PUSH_A))
            push_a = 0;
        else if (++push_a > LONG_PUSH) {
            push_a = 0;
            list_cell = -1;
            menu_cur[M_MAIN] = 0;
            menu_open(M_MAIN);
        }
    }
    if ((me_page_open || recompose) && ctrl) {
        *((volatile char *)ctrl + 0x20) = 1;           // keep the frames coming
        recompose = 0;
    }
}

// ---- ev_key -----------------------------------------------------------------------
static void open_page(void)
{
    me_page_open = 1;
    list_cell = -1;
    enc_reset();
    for (int k = 0; k < CELLS; k++)
        acc[k] = shown[k] = 0;
}

// SETTINGS > EXPRESSION, YES: the page opens over the menu (a row added from
// ev_settings in settings.s, as Digi Matrix's).
void me_settings_select(void **payload)
{
    open_page();
    INVALIDATE((char *)*payload + 0x38);
}

void me_settings_change(void **payload, int unused, int delta)
{
    (void)unused;
    (void)delta;
    INVALIDATE((char *)*payload + 0x38);
}

void me_settings_rowdraw(void *a, void *b, void *bmp, int x, int y)
{
    (void)a; (void)b; (void)bmp; (void)x; (void)y;
}

int me_page_key(void *brain, void *ev)
{
    int id = KEYID(ev);
    (void)brain;
    if (!me_page_open) {
        if (no_up && id == K_NO) {      // the NO that closed the page: its release would close SETTINGS too
            no_up = 0;
            if (!KEYDOWN(ev))
                return 1;
        }
        return 0;
    }
    if (me_menu)
        return menu_key(ev, track());
    if (id == K_PUSH_A && KEYPRESS(ev))
        push_a = 1, push_twist = 0;
    if (KEYPRESS(ev) && (!(id >= K_PUSH_A && id < K_PUSH_A + CELLS) || id - K_PUSH_A == list_cell))
        list_cell = -1;                 // any key, or a push of its own knob, closes the list
    switch (id) {
    case K_NO:
        if (KEYPRESS(ev)) {
            close_page();               // back to SETTINGS
            no_up = 1;
        }
        return 1;
    case K_YES: case K_UP: case K_DOWN: case K_LEFT: case K_RIGHT:
        return 1;                       // nothing here; not passed to the page underneath
    case 1:                             // FUNC
    case 2:                             // TRK: TRK + trig picks another track
    case 9: case 10: case 11:           // REC, PLAY, STOP
        return 0;
    default:
        if (id >= 24 && id <= 39)       // the trig keys
            return 0;
        if (id >= K_PUSH_A && id < K_PUSH_A + CELLS)
            return 1;                   // the knobs' pushes: the push multiplier (and the list above)
        if (KEYPRESS(ev))
            close_page();               // another page or a menu: stock takes it from here
        return 0;
    }
}

// ---- ev_enc -----------------------------------------------------------------------
int me_page_enc(void *brain, void *ev)
{
    (void)brain;
    if (!me_page_open)
        return 0;
    int id = *(int *)((char *)ev + 12);
    int n = *(int *)((char *)ev + 16);
    if (me_menu) {                      // the LEVEL knob moves, as in the stock menus
        if (id == 9 && n) {              // one step a detent, as the stock SETTINGS lists (no acceleration)
            level_acc += n;
            while (level_acc >= RAW_DETENT || level_acc <= -RAW_DETENT) {
                int d = level_acc > 0 ? 1 : -1;
                level_acc -= d * RAW_DETENT;
                menu_move(d);
            }
            recompose = 1;
        }
        return 1;
    }
    if (id == 1 && push_a) {            // a twist while A is held: a real turn (the push
        push_twist += n < 0 ? -n : n;   // multiplier) cancels the menu; a nudge does not
        if (push_twist > 3 * RAW_DETENT)
            push_a = 0;
    }
    if (id < 1 || id > CELLS)
        return 1;                       // LEVEL: nothing (SETTINGS' list is under the page)
    if (!n)
        return 1;
    int k = id - 1, t = track();
    const struct cell *c = cell_of(t, k);
    if (t != acc_track) {
        for (int i = 0; i < CELLS; i++)
            acc[i] = 0;
        acc_track = t;
    }
    if (list_cell != k)
        list_cell = -1;
    if (c->kind == C_NONE)
        return 1;
    if (KEYHELD(K_FUNC)) {              // FUNC + turn: the next useful value, then a rest
        if (!snap_rest[k]) {
            me_page_change(t, k, n, 1);
            snap_rest[k] = SNAP_REST;
        }
        acc[k] = 0;
    } else {
        int w = enc_words(k, sid_of(c->kind), n, KEYHELD(K_PUSH_A + k) != 0);
        if (w) {
            idle_counts[k] = 0;
        } else {                        // a safety net: six detents and still nothing,
            idle_counts[k] += n < 0 ? -n : n;   // as the firmware never does: a step a detent
            if (idle_counts[k] >= IDLE_LIMIT)
                w = n * 256 / RAW_DETENT;
        }
        if (c->kind == C_AMOUNT || c->kind == C_RANGE) {    // a depth or BEND takes the words as they are: 1/256 steps
            me_page_change(t, k, w, 0);
        } else {
            acc[k] += w;
            int steps = acc[k] / 256;
            acc[k] -= steps * 256;
            if (c->kind == C_ONOFF && !steps && n)
                steps = n > 0 ? 1 : -1; // a switch follows the first detent
            me_page_change(t, k, steps, 0);
        }
    }
    shown[k] = SHOW_TICKS;
    if (c->kind == C_DEST) {
        list_cell = k;
        list_t = LIST_TICKS;
    }
    return 1;                           // the cells' knobs are the page's while it is up
}
