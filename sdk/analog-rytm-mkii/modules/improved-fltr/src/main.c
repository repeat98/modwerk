// SPDX-License-Identifier: GPL-3.0-or-later
// Improved FLTR for the Analog Rytm MKII (OS 1.74): a band type on the FILTER page.
// Written for Modwerk by Nathaniel Pavel (npp1993).
//
// TYP turns past PK to BND (7, linked) and BND (8, unlinked): stock's analog 2-pole band-pass with
// its high-pass edge at FRQ and its low-pass edge set by RES (band.s). This file is the page:
// - TYP's range: build.json opens its id record's maximum to 8, so stock's turn, setter, locks and
//   MIDI take the two band types as they take the others.
// - TYP's and RES's value text (core_params): TYP reads BND or BND+ (unlinked), RES the low-pass
//   edge in hertz, as band.s places it.
// - A tap of RES (knob F) on a band type flips linked and unlinked, keeping the low-pass edge where
//   it is: TYP 7 <-> 8, and RES converted from a distance to a cutoff or back.
// Stock with a band type in a kit plays it as PK (its own clamp) and draws a blank TYP knob.

#include <stdint.h>
#include "analog-rytm-mk2/pages.h"
#include "ar2-1.74.h"
#include "width-table.h"

#define FLTR_UI __attribute__((cold))

#define ID_FRQ 47                       // the FILTER page's stock ids (record indices)
#define ID_RES 48
#define ID_TYP 49
#define TYP_LINKED 7
#define TYP_FREE 8
#define WORD_MAX 0x7f00                 // 127.0 in 8.8
#define W_MIN 0x0100                    // as band.s
#define W_MAX 0x3c00

#define TARGETS 0x8000e5b0              // a track's parameter targets: 84 bytes a track, a word a sound index
#define TRACK_TARGETS 84
#define IDX_FRQ 30
#define IDX_RES 31
#define IDX_TYP 32

#define KEY_FUNC 0x80
#define KEY_NO 0x45
#define KEY_TRIG_LAST 0x0f
#define KEY_PUSH_A 0x70
#define KEY_PUSH_F 0x75
#define KEY_PUSH_H 0x77
#define KEY_PAD_FIRST 0x90
#define KEY_PAD_LAST 0x9b
#define KEY_INDEX 12                    // ev_key's event: the key, then its flags
#define KEY_FLAGS 16
#define KEY_PRESSED 1
#define KEY_REPEAT 8
#define ENC_INDEX 12                    // ev_enc's event: the encoder, 0..7 for A..H
#define KNOB_F 5
#define TAP_TICKS 8                     // about 0.4 s of the UI's 20 Hz
#define TAP_TURNS 3                     // encoder events in a press that make it a turn
#define CTRL_REDRAW 0x20
#define BRAIN_VIEWS 32
#define MANAGER_LIST 20
#define MANAGER_LAST 24
#define NODE_PREV 4
#define NODE_VIEW 8
#define VT_SCENE 0x401e305c
#define VT_PERF 0x401e26c4
#define VT_SCENE_EDIT 0x401e2ee8
#define VT_PERF_EDIT 0x401e2a54
#define REC_HELD_HI 0x158
#define REC_HELD_LO 0x15c
#define STEPS 64

typedef uint32_t word_t;                // the firmware returns pointers in d0
typedef unsigned (*is_key_held_t)(int key);
typedef word_t (*singleton_t)(void);
typedef word_t (*of_t)(void *);
typedef word_t (*param_target_t)(void *project, int track, int a);
typedef void (*param_set_t)(word_t target, int id, int value, int track, int notify, int redraw);
typedef int (*is_live_rec_t)(void *rec);
typedef void (*string_from_cstr_t)(void *string, const char *text, void *allocator);
typedef void (*string_dtor_t)(void *string);
typedef void (*show_header_t)(void *page_state, void *string);

// The band types' TYP picture: 21 columns, a word each, its rows from the top bit up the screen (stock's layout); build.json points
// stock's eighth type picture, blank in OS 1.74, at it. Original artwork.
const uint32_t improved_fltr_glyph[21] __attribute__((aligned(4))) = {
    0x00000000, 0x40000000, 0x30000000, 0x08000000, 0x06000000, 0x01800000,
    0x00400000, 0x00400000, 0x00400000, 0x00400000, 0x00400000, 0x00400000,
    0x00400000, 0x00400000, 0x00400000, 0x01800000, 0x06000000, 0x08000000,
    0x30000000, 0x40000000, 0x00000000,
};

static int asked, page_up, redraw;
static int tap_ticks = -1, tap_turns;

// ---- the band, as band.s places it ----

static int band_type(int typ_word) { return (typ_word >> 8) == TYP_LINKED || (typ_word >> 8) == TYP_FREE; }

// The low-pass edge (8.8 semitones on FRQ's scale) for a base and a RES word.
static int edge_of(int typ_word, int frq, int res)
{
    int w = (typ_word >> 8) == TYP_LINKED ? (res * 15) >> 5 : res - frq;
    if (w < W_MIN)
        w = W_MIN;
    if (w > W_MAX)
        w = W_MAX;
    return frq + w;
}

// ---- hertz ----

// 2^(i/12) in Q16, i = 0..12.
static const uint32_t semis[13] = {
    65536, 69433, 73562, 77936, 82570, 87480, 92682, 98193, 104032, 110218, 116772, 123715, 131072,
};

// f = 440 x 2^((v - 60) / 12), v in 8.8: hertz x 10, linear between semitones (under 0.2 % off).
FLTR_UI static uint32_t hz10(int v)
{
    int s = v - 60 * 256 + 12 * 256 * 8;    // 8 octaves up: always positive here
    int oct = s / (12 * 256), r = s - oct * 12 * 256, i = r >> 8, f = r & 255;
    uint32_t q = semis[i] + (((semis[i + 1] - semis[i]) * (uint32_t)f) >> 8);   // Q16, under 2^18
    uint32_t x = (4400u * q) >> 16;         // 440 Hz x 10 within the octave: 4400..8800, no 64-bit math
    oct -= 8;
    return oct >= 0 ? x << oct : x >> -oct;
}

FLTR_UI static char *put_uint(char *p, unsigned n)
{
    char t[10];
    int k = 0;
    do
        t[k++] = (char)('0' + n % 10);
    while ((n /= 10) && k < 10);
    while (k)
        *p++ = t[--k];
    return p;
}

// Three significant figures: 13.8Hz, 440Hz, 1.11kHz, 21.1kHz.
FLTR_UI static void put_hz(char *p, uint32_t f10)
{
    const char *unit = "Hz";
    unsigned whole, tenth, digits;

    if (f10 >= 10000) {                     // 1 kHz and up: in kHz, rounded to three figures
        uint32_t f = (f10 + 5) / 10;        // Hz
        unit = "kHz";
        if (f >= 10000) {
            f = (f + 50) / 100;             // tenths of a kHz
            whole = f / 10, tenth = f % 10, digits = 1;
        } else {
            f = (f + 5) / 10;               // hundredths of a kHz
            whole = f / 100, tenth = f % 100, digits = 2;
        }
    } else if (f10 >= 1000) {
        whole = (f10 + 5) / 10, tenth = 0, digits = 0;
    } else {
        whole = f10 / 10, tenth = f10 % 10, digits = 1;
    }
    p = put_uint(p, whole);
    if (digits) {
        *p++ = '.';
        if (digits == 2)
            *p++ = (char)('0' + tenth / 10), tenth %= 10;
        *p++ = (char)('0' + tenth);
    }
    while (*unit)
        *p++ = *unit++;
    *p = 0;
}

// ---- the selected track ----

FLTR_UI static int selected_track(void)
{
    word_t project = ((singleton_t)PROJECT_AT)();
    word_t seq = ((of_t)PROJECT_SEQ_AT)((void *)project);
    return (int)((of_t)SELECTED_TRACK_AT)((void *)seq);
}

FLTR_UI static volatile uint16_t *targets(int track)
{
    return (volatile uint16_t *)(TARGETS + TRACK_TARGETS * track);
}

// ---- core_params: the page asks for these ids while it is up ----

FLTR_UI static int fltr_get(int32_t id, int32_t *value)
{
    (void)id;
    (void)value;
    asked = 1;
    return 0;
}

FLTR_UI static int fltr_text(struct core_text *t)
{
    int track = selected_track();
    volatile uint16_t *tg;
    int typ;

    if (track < 0 || track > 11)
        return CORE_TEXT_PASS;
    tg = targets(track);
    if (t->id == ID_TYP) {
        int v = t->value >> 8;
        if (v != TYP_LINKED && v != TYP_FREE)
            return CORE_TEXT_PASS;
        t->buf[0] = 'B', t->buf[1] = 'N', t->buf[2] = 'D';
        t->buf[3] = v == TYP_FREE ? '+' : 0;
        t->buf[4] = 0;
        return CORE_TEXT_DONE;
    }
    typ = (int16_t)tg[IDX_TYP];
    if (t->id != ID_RES || !band_type(typ))
        return CORE_TEXT_PASS;
    put_hz(t->buf, hz10(edge_of(typ, (int16_t)tg[IDX_FRQ], t->value)));
    return CORE_TEXT_DONE;
}

const struct core_param improved_fltr_params = { ID_RES, ID_TYP, fltr_get, 0, fltr_text };

// ---- the tap ----

FLTR_UI static int scene_or_perf(void *brain)
{
    char *manager = *(char **)((char *)brain + BRAIN_VIEWS);
    char *list = manager + MANAGER_LIST, *node;

    for (node = *(char **)(manager + MANAGER_LAST); node && node != list; node = *(char **)(node + NODE_PREV)) {
        word_t vtable = **(word_t **)(node + NODE_VIEW);
        if (vtable == VT_SCENE || vtable == VT_PERF || vtable == VT_SCENE_EDIT || vtable == VT_PERF_EDIT)
            return 1;
    }
    return 0;
}

FLTR_UI static int held(int step)
{
    char *rec = (char *)((singleton_t)REC_STATE_AT)();
    unsigned lo = *(volatile unsigned *)(rec + REC_HELD_LO), hi = *(volatile unsigned *)(rec + REC_HELD_HI);
    return (step < 32 ? lo >> step : hi >> (step - 32)) & 1;
}

// A press with a trig, FUNC or NO down is stock's, and so is any press in live recording, scene or
// performance mode: the tap edits the sound only.
FLTR_UI static int plain_press(void *brain)
{
    is_key_held_t key_held = (is_key_held_t)IS_KEY_HELD_AT;
    int key;

    if (key_held(KEY_FUNC) || key_held(KEY_NO) || ((is_live_rec_t)IS_LIVE_REC_AT)((void *)((singleton_t)REC_STATE_AT)()))
        return 0;
    if (scene_or_perf(brain))
        return 0;
    for (key = 0; key <= KEY_TRIG_LAST; key++)
        if (key_held(key))
            return 0;
    for (key = 0; key < STEPS; key++)
        if (held(key))
            return 0;
    return 1;
}

FLTR_UI static void show_header(const char *text)
{
    uint32_t string[2];
    char allocator;

    ((string_from_cstr_t)STRING_FROM_CSTR_AT)(string, text, &allocator);
    ((show_header_t)SHOW_HEADER_AT)((void *)((singleton_t)REC_STATE_AT)(), string);
    ((string_dtor_t)STRING_DTOR_AT)(string);
}

// Linked <-> unlinked, the low-pass edge kept: RES becomes the edge itself, or the distance to it.
FLTR_UI static void flip_link(void)
{
    int track = selected_track(), typ, frq, res, edge, w;
    volatile uint16_t *tg;
    word_t target;

    if (track < 0 || track > 11)
        return;
    tg = targets(track);
    typ = (int16_t)tg[IDX_TYP];
    if (!band_type(typ))
        return;
    frq = (int16_t)tg[IDX_FRQ];
    res = (int16_t)tg[IDX_RES];
    edge = edge_of(typ, frq, res);
    if ((typ >> 8) == TYP_LINKED) {
        res = edge;
        typ = TYP_FREE << 8;
    } else {
        w = edge - frq;
        res = (w * 32 + 14) / 15;
        typ = TYP_LINKED << 8;
    }
    if (res < 0)
        res = 0;
    if (res > WORD_MAX)
        res = WORD_MAX;
    target = ((param_target_t)PARAM_TARGET_AT)((void *)((singleton_t)PROJECT_AT)(), track, 0);
    ((param_set_t)PARAM_SET_AT)(target, ID_RES, res, track, 1, 1);
    ((param_set_t)PARAM_SET_AT)(target, ID_TYP, typ, track, 1, 1);
    show_header((typ >> 8) == TYP_LINKED ? "LP LINKED" : "LP FREE");
}

// ev_draw: stock asks for the page's ids only while the FILTER page is drawn.
FLTR_UI void improved_fltr_draw(void *bmp, void *ctrl)
{
    (void)bmp;
    (void)ctrl;
    if (asked)
        page_up = 1;
    asked = 0;
}

FLTR_UI void improved_fltr_tick(char *ctrl)
{
    if (tap_ticks >= 0 && ++tap_ticks > TAP_TICKS)
        tap_ticks = -1;
    if (redraw) {
        redraw = 0;
        ctrl[CTRL_REDRAW] = 1;
    }
}

// ev_enc: a click of F's tap nudges the encoder, so the first turns of a press are not a turn.
FLTR_UI int improved_fltr_enc(void *brain, char *event)
{
    (void)brain;
    if (*(int *)(event + ENC_INDEX) != KNOB_F || !page_up || tap_ticks < 0)
        return 0;
    if (++tap_turns < TAP_TURNS)
        return 1;
    tap_ticks = -1;
    return 0;
}

// ev_key: a tap of F, pressed and let go inside TAP_TICKS as a plain press on a band type, flips the
// link. Stock's press only shows the parameter, so it goes on as ever.
FLTR_UI int improved_fltr_key(void *brain, char *event)
{
    int key = *(int *)(event + KEY_INDEX), flags = *(int *)(event + KEY_FLAGS);

    if (flags & KEY_REPEAT)
        return 0;
    if (key != KEY_FUNC && key > KEY_TRIG_LAST && (key < KEY_PUSH_A || key > KEY_PUSH_H)) {
        page_up = 0;
        asked = 0;
        redraw = 1;
    }
    if (key != KEY_PUSH_F || !page_up)
        return 0;
    if (flags & KEY_PRESSED) {
        tap_ticks = plain_press(brain) ? 0 : -1;
        tap_turns = 0;
        return 0;
    }
    if (tap_ticks >= 0 && plain_press(brain)) {
        flip_link();
        redraw = 1;
    }
    tap_ticks = -1;
    return 0;
}
