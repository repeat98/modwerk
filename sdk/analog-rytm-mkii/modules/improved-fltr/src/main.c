// SPDX-License-Identifier: GPL-3.0-or-later
// Improved FLTR for the Analog Rytm MKII (OS 1.74): a base-width type on the FILTER page.
// Written for Modwerk by Nathaniel Pavel (npp1993).
//
// TYP turns past PK to BW (7): stock's analog 2-pole band-pass with its high-pass edge at FRQ (the
// base) and its low-pass edge RES x 15/32 semitones above it (the width; the knob reads WID), so FRQ
// moves the whole band (band.s). This file is the page:
// - TYP's range: build.json opens its id record's maximum to 7, so stock's turn, setter, locks and
//   MIDI take BW as they take the others.
// - RES's names: build.json points them at res_short and res_long, which ev_tick sets to WID / Width
//   while the selected sound is BW and to stock's RES / Resonance otherwise.
// - TYP's and RES's value text (core_params): TYP reads BW, RES the low-pass edge in hertz, as band.s
//   places it, from FRQ and TYP as the page shows them (a held trig's locks included).
// - The FILTER graph: for BW, band.s's graph site calls improved_fltr_band_graph, which draws
//   the band as measured on a unit (tools/calibration.json): the edges, the 6 dB/oct slopes and the
//   level, 4 dB a row with +15 dB at the top (narrower bands' peaks clip there), FRQ's scale
//   (13.8 Hz .. 21.1 kHz) across.
// Stock with a band type in a kit plays it as PK (its own clamp) and draws a blank TYP knob.

#include <stdint.h>
#include "analog-rytm-mk2/pages.h"
#include "ar2-1.74.h"
#define FLTR_GRAPH_TABLES
#include "width-table.h"

#define FLTR_UI __attribute__((cold))

#define ID_RES 48                       // the FILTER page's stock ids (record indices)
#define ID_TYP 49
#define TYP_BW 7
#define WORD_MAX 0x7f00                 // 127.0 in 8.8
#define W_MIN 0x0100                    // as band.s
#define W_MAX 0x3c00

#define PROJECT_KIT 352                 // project + 352: the active kit
#define ACC_LIVE_SOUND 0x28             // a sound accessor's vtable: the live sound
#define LIVE_PARAMS 0x14                // the live sound: a word a sound index, as edited (no locks or LFO)
#define IDX_FRQ 30
#define IDX_TYP 32

#define KEY_FUNC 0x80
#define KEY_TRIG_LAST 0x0f
#define KEY_PUSH_A 0x70
#define KEY_PUSH_H 0x77
#define KEY_INDEX 12                    // ev_key's event: the key, then its flags
#define KEY_FLAGS 16
#define KEY_REPEAT 8
#define CTRL_REDRAW 0x20                // ev_tick's ctrl: asks for a redraw

// The graph's box (stock's, 0x40038e00..0x40038e12): x0 and y0 its left and bottom border, bottom-up.
#define GR_W 51                         // inside: x0 + 1 .. x0 + 51
#define GR_H 11                         //         y0 + 1 .. y0 + 11
#define GR_TOP_DB (15 * 8)              // the top row, dB x 8: a 4-semitone band's +13 dB fits
#define GR_ROW_DB (4 * 8)               // a row
#define S_MIN (-8 * 256)                // fltr_att's first s (8.8), sixteenths
#define S_MAX (4 * 256)

typedef uint32_t word_t;                // the firmware returns pointers in d0
typedef word_t (*singleton_t)(void);
typedef word_t (*of_t)(void *);
typedef word_t (*kit_track_sound_t)(void *kit, int track);
typedef void (*fillrect_t)(void *bmp, int x0, int y0, int x1, int y1, int color);

// The band types' TYP picture: 21 columns, a word each, its rows from the top bit up the screen
// (stock's layout); build.json points stock's eighth type picture, blank in OS 1.74, at it. Original
// artwork.
const uint32_t improved_fltr_glyph[21] __attribute__((aligned(4))) = {
    0x00000000, 0x40000000, 0x30000000, 0x08000000, 0x06000000, 0x01800000,
    0x00400000, 0x00400000, 0x00400000, 0x00400000, 0x00400000, 0x00400000,
    0x00400000, 0x00400000, 0x00400000, 0x01800000, 0x06000000, 0x08000000,
    0x30000000, 0x40000000, 0x00000000,
};

// Written by band.s's graph site each time stock draws the FILTER graph: FRQ (8.8) and TYP (whole)
// as the page shows them, a held trig's locks included, and a mark that it drew.
volatile int32_t improved_fltr_seen_frq, improved_fltr_seen_typ, improved_fltr_seen;

static int asked, page_up, page_track = -1;   // the track the noted values are from

// RES's names, which build.json points stock's id table at (record 48, +40 and +48). Stock reads them
// afresh each time it draws a label or a header.
char improved_fltr_res_short[4] = "RES";
char improved_fltr_res_long[10] = "Resonance";
static int named_width;                 // the names read WID / Width

// ---- the band, as band.s places it ----

static int band_type(int typ) { return typ == TYP_BW; }

// The band's width in 8.8 semitones, RES x 15/32, held as band.s holds it.
static int width_of(int res)
{
    int w = (res * 15) >> 5;
    if (w < W_MIN)
        w = W_MIN;
    if (w > W_MAX)
        w = W_MAX;
    return w;
}

// The analog cutoff band.s sends: the edges' midpoint, held to 0..0x7f00.
static int centre_of(int frq, int w)
{
    int c = frq + w / 2;
    return c > WORD_MAX ? WORD_MAX : c < 0 ? 0 : c;
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

// Three significant figures, rounded first: 13.8Hz, 440Hz, 999Hz, 1.00kHz, 9.99kHz, 10.0kHz, 21.1kHz;
// above 21.1 kHz (FRQ 127, stock's top) OPEN, as Filter Hz shows an open low-pass.
FLTR_UI static void put_hz(char *p, int v)
{
    uint32_t f10 = hz10(v), n;
    const char *unit = "Hz";
    unsigned digits;

    if (v > WORD_MAX) {
        const char *o = "OPEN";
        while (*o)
            *p++ = *o++;
        *p = 0;
        return;
    }
    if (f10 < 1000)                             // under 100 Hz: tenths
        n = f10, digits = 1;
    else if ((n = (f10 + 5) / 10) < 1000)       // whole hertz
        digits = 0;
    else if ((n = (f10 + 50) / 100) < 1000)     // hundredths of a kHz
        unit = "kHz", digits = 2;
    else                                        // tenths of a kHz
        n = (f10 + 500) / 1000, unit = "kHz", digits = 1;
    if (digits == 2) {
        p = put_uint(p, n / 100);
        *p++ = '.';
        *p++ = (char)('0' + n / 10 % 10);
        *p++ = (char)('0' + n % 10);
    } else if (digits == 1) {
        p = put_uint(p, n / 10);
        *p++ = '.';
        *p++ = (char)('0' + n % 10);
    } else
        p = put_uint(p, n);
    while (*unit)
        *p++ = *unit++;
    *p = 0;
}

// ---- the selected sound, away from the FILTER page ----

FLTR_UI static int selected_track(void)
{
    word_t project = ((singleton_t)PROJECT_AT)();
    word_t seq = ((of_t)PROJECT_SEQ_AT)((void *)project);
    return (int)((of_t)SELECTED_TRACK_AT)((void *)seq);
}

// The selected sound's parameter words as edited, or 0.
FLTR_UI static volatile int16_t *sound_words(int track)
{
    char *project = (char *)((singleton_t)PROJECT_AT)();
    void *acc, *live;

    if (track < 0 || track > 11)
        return 0;
    acc = (void *)((kit_track_sound_t)KIT_TRACK_SOUND_AT)(project + PROJECT_KIT, track);
    if (!acc)
        return 0;
    live = (void *)(*(word_t (***)(void *))acc)[ACC_LIVE_SOUND / 4](acc);
    return live ? (volatile int16_t *)((char *)live + LIVE_PARAMS) : 0;
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
    volatile int16_t *sw;
    int typ, frq, w;

    if (t->id == ID_TYP) {
        int v = t->value >> 8;
        if (!band_type(v))
            return CORE_TEXT_PASS;
        t->buf[0] = 'B', t->buf[1] = 'W', t->buf[2] = 0;
        return CORE_TEXT_DONE;
    }
    if (t->id != ID_RES)
        return CORE_TEXT_PASS;
    if (page_up && page_track == selected_track()) {   // the page's own FRQ and TYP, as its graph drew them
        typ = improved_fltr_seen_typ;
        frq = improved_fltr_seen_frq;
    } else if ((sw = sound_words(selected_track()))) {
        typ = sw[IDX_TYP] >> 8;
        frq = sw[IDX_FRQ];
    } else
        return CORE_TEXT_PASS;
    if (!band_type(typ))
        return CORE_TEXT_PASS;
    w = width_of(t->value);
    put_hz(t->buf, centre_of(frq, w) + w / 2);  // the low-pass edge as played
    return CORE_TEXT_DONE;
}

const struct core_param improved_fltr_params = { ID_RES, ID_TYP, fltr_get, 0, fltr_text };

// ---- the graph ----

// The band's level in dB x 8, d (8.8 semitones, >= 0) from its centre: the measured peak gain less
// 10 log10(1 + (Q u)^2), u = 2^(d/12) - 2^(-d/12).
FLTR_UI static int band_db(int wi, int d)
{
    int di = d >> 6, f = d & 63, s, a;           // fltr_log2u in quarter semitones

    if (di >= 512)
        di = 511, f = 63;
    s = fltr_log2u[di] + (((fltr_log2u[di + 1] - fltr_log2u[di]) * f) >> 6) + fltr_width_log2q[wi];
    if (s < S_MIN)
        a = 0;
    else if (s >= S_MAX)
        a = (s * 48) >> 8;                      // 20 log10 2 = 6.02 dB a step of log2, x 8
    else
        a = fltr_att[(s - S_MIN) >> 4];
    return fltr_width_gain[wi] - a;
}

// Called by band.s for BW in place of stock's curve: stock has cleared the box; its frame, which
// stock's curves draw themselves, is drawn here as theirs (corners open).
FLTR_UI void improved_fltr_band_graph(void *bmp, int x0, int y0, int frq, int res)
{
    fillrect_t fill = (fillrect_t)FILLRECT_AT;
    int w = width_of(res), c = centre_of(frq, w), wi = w >> 8, x, prev = 0;

    fill(bmp, x0 + 1, y0, x0 + GR_W, y0, 1);
    fill(bmp, x0 + 1, y0 + GR_H + 1, x0 + GR_W, y0 + GR_H + 1, 1);
    fill(bmp, x0, y0 + 1, x0, y0 + GR_H, 1);
    fill(bmp, x0 + GR_W + 1, y0 + 1, x0 + GR_W + 1, y0 + GR_H, 1);

    for (x = 0; x < GR_W; x++) {
        int v = x * WORD_MAX / (GR_W - 1), d = v > c ? v - c : c - v;
        int row = (GR_TOP_DB - band_db(wi, d) + GR_ROW_DB / 2) / GR_ROW_DB;   // 0: the top row
        int y = y0 + GR_H - (row < 0 ? 0 : row > GR_H - 1 ? GR_H - 1 : row);
        int lo = y, hi = y;

        if (x) {                                // join the last column's point
            if (prev > y + 1)
                hi = prev - 1;
            else if (prev < y - 1)
                lo = prev + 1;
        }
        fill(bmp, x0 + 1 + x, lo, x0 + 1 + x, hi, 1);
        prev = y;
    }
}

// ev_draw: the FILTER page is up when this compose both asked for RES or TYP and drew stock's
// FILTER graph (another view asking those ids draws no graph; Voice DAC's page draws the graph
// for ids of its own).
FLTR_UI void improved_fltr_draw(void *bmp, void *ctrl)
{
    (void)bmp;
    (void)ctrl;
    if (asked && improved_fltr_seen) {
        page_up = 1;
        page_track = selected_track();          // a track change with no key: the next text sees it
    }
    asked = 0;
    improved_fltr_seen = 0;
}

FLTR_UI static void set_name(char *to, const char *from)
{
    while ((*to++ = *from++))
        ;
}

// ev_tick, about 20 Hz: RES's names follow the selected sound's TYP: as the FILTER page shows it (a
// held trig's lock included) while that page is up, else as edited. A change redraws.
FLTR_UI void improved_fltr_tick(char *ctrl)
{
    int track = selected_track(), width;
    volatile int16_t *sw;

    if (page_up && page_track == track)         // the FILTER page: TYP as it shows it (a held trig's lock)
        width = band_type(improved_fltr_seen_typ);
    else
        width = (sw = sound_words(track)) && band_type(sw[IDX_TYP] >> 8);

    if (width == named_width)
        return;
    named_width = width;
    set_name(improved_fltr_res_short, width ? "WID" : "RES");
    set_name(improved_fltr_res_long, width ? "Width" : "Resonance");
    ctrl[CTRL_REDRAW] = 1;
}

// ev_key: a page key or any other key that can leave the page ends page_up until the FILTER page
// shows again; trig keys, FUNC and the knobs' presses stay on it.
FLTR_UI int improved_fltr_key(void *brain, char *event)
{
    int key = *(int *)(event + KEY_INDEX), flags = *(int *)(event + KEY_FLAGS);

    (void)brain;
    if (!(flags & KEY_REPEAT) && key != KEY_FUNC && key > KEY_TRIG_LAST && (key < KEY_PUSH_A || key > KEY_PUSH_H)) {
        page_up = 0;
        asked = 0;
    }
    return 0;
}
