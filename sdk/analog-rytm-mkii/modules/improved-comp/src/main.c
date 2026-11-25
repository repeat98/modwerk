// SPDX-License-Identifier: GPL-3.0-or-later
// Improved Compressor for the Analog Rytm MKII (OS 1.74): THR and MUP read in dB on the COMP page.
// Written for Modwerk by Nathaniel Pavel (npp1993).
//
// The Rytm's compressor is analog, and stock shows THR and MUP as bare knob values. This module only
// changes those two value texts, by laws measured on a unit (TESTING.md):
// - THR reads where the compressor starts, in dBFS of a centred voice's own channel: about 0.97 dB a
//   step with THR 96 at -36 dBFS at RAT MAX, and 8, 15 and 18 dB later at 1:8, 1:4 and 1:2 (RAT moves
//   where the compressor starts more than how far it goes). Measured with SEQ OFF from THR 64 to 112;
//   below THR 64 the compressor already cuts the bus's own hiss, so the number there is the line
//   extended, not where it starts.
// - MUP reads the makeup over MUP 0, 0.645 dB a step (measured to MUP 48; from about MUP 56 the gain
//   measured stopped near +40 dB with MAIN's output near its ceiling, so above that the number is the
//   gain asked for, not shown to be reached).
// Nothing is drawn but the two texts, nothing runs on a tick or in the audio block, and no key or
// encoder is touched. In scene and performance mode stock hands the text routine a lock's offset, not
// the knob's value, so the texts are stock's there.

#include <stdint.h>
#include "analog-rytm-mk2/pages.h"

// ---- OS 1.74 (addresses only) ----
#define BRAIN_AT 0x419f28f8             // the UI's brain: +32 its view manager
#define BRAIN_VIEWS 32
#define MANAGER_LIST 20
#define MANAGER_LAST 24
#define NODE_PREV 4
#define NODE_VIEW 8
#define VT_SCENE_FX 0x401e2ee8          // scene and performance mode's views
#define VT_PERF_FX 0x401e2a54
#define VT_SCENE 0x401e305c
#define VT_PERF 0x401e26c4
#define RAT_AT 0x8000fbda               // RAT's live word (8.8): an option, 0..3 (1:2, 1:4, 1:8, MAX); the
                                        // fourth of the compressor's eight live words from 0x8000fbd4
#define VIEWS_MAX 32                    // more views than the stack ever holds: the walk's limit
#define VALUE_MAX (127 * 256)           // a knob's top value (8.8)

#define ID_THR 92                       // the COMP page's parameter ids
#define ID_MUP 93

typedef uint32_t word_t;                // the firmware keeps pointers in 32-bit words

// Against MAX, tenths of a dB later at 1:2, 1:4, 1:8 and MAX (a sine through the unit, where the
// reduction reaches 0.5 dB, the same within about 1 dB at THR 110, 90 and 70; TESTING.md)
static const uint8_t rat_late[4] = { 180, 150, 80, 0 };

// Where the compressor starts, in whole dBFS: THR's line at MAX (0.97 dB a step, THR 96 at -36), later
// by RAT's share; worked in hundredths and rounded once. thr and rat are 8.8 words.
static int onset_db(int thr, int rat)
{
    int h = -3600 + ((thr - 96 * 256) * 97) / 256 + 10 * rat_late[(rat >> 8) & 3];
    return h < 0 ? (h - 50) / 100 : (h + 50) / 100;
}

static char *put_int(char *p, int n)
{
    char tmp[6];
    int i = 0;
    do
        tmp[i++] = (char)('0' + n % 10);
    while ((n /= 10) && i < 6);
    while (i)
        *p++ = tmp[--i];
    return p;
}

// Scene or performance mode is up: one of their views is on the view stack.
static int scene_or_perf(char *brain)
{
    char *manager = *(char **)(brain + BRAIN_VIEWS), *list, *node;
    int left = VIEWS_MAX;
    if (!manager)
        return 0;
    list = manager + MANAGER_LIST;
    for (node = *(char **)(manager + MANAGER_LAST); node && node != list && left--; node = *(char **)(node + NODE_PREV)) {
        word_t *view = *(word_t **)(node + NODE_VIEW), vt;
        if (!view)
            continue;
        vt = *view;
        if (vt == VT_SCENE_FX || vt == VT_PERF_FX || vt == VT_SCENE || vt == VT_PERF)
            return 1;
    }
    return 0;
}

// The text is at most seven characters ("-129dB", "+81.9dB"), as stock's own value texts are.
static int comp_text(struct core_text *t)
{
    char *p = t->buf, *brain = *(char **)BRAIN_AT;
    int v = t->value, d;                        // 8.8

    if ((t->id != ID_THR && t->id != ID_MUP) || v < 0 || v > VALUE_MAX || !brain || scene_or_perf(brain))
        return CORE_TEXT_PASS;
    if (t->id == ID_THR) {
        d = onset_db(v, *(volatile uint16_t *)RAT_AT);   // the knob's THR, RAT as it is now
        if (d < 0) {
            *p++ = '-';
            d = -d;
        } else if (d > 0)
            *p++ = '+';
        p = put_int(p, d);
    } else {
        d = (v * 645 + 12800) / 25600;          // tenths of a dB: 6.45 a step of 256
        *p++ = '+';
        p = put_int(p, d / 10);
        *p++ = '.';
        *p++ = (char)('0' + d % 10);
    }
    *p++ = 'd';
    *p++ = 'B';
    *p = 0;
    return CORE_TEXT_DONE;
}

const struct core_param improved_comp_params = { ID_THR, ID_MUP, 0, 0, comp_text };
