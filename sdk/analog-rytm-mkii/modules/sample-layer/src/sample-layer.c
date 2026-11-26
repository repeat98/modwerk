// SPDX-License-Identifier: GPL-3.0-or-later
// Sample Layer: a filter and a decay of its own for a track's sample, on a page after SMPL's
// waveform. The analog machine, the analog filter and the AMP envelope are left as they are: the
// sample is shaped before its DAC, so AMP still shapes the whole sound.
//
// The audio side (sample_layer_render, from the gate in sample-layer.s) works on stock's sample
// stream before stock's voice mixer reads it: 8 voices of 32 frames, Q31, at SAMPLE_STREAM. Probe
// SL01 on a unit (26 November 2026) showed that clearing it silences the sample alone. Each voice
// plays the track VOICE_TRACK_AT names, as stock's amp_env_commands reads it (0x4010996a).
//
// The UI side keeps each track's settings in one sound field, sample_layer_cfg, and turns them
// into coefficients in the UI task (ev_tick, and at once after a turn), so the audio interrupt
// only reads a table.
#include <stdint.h>
#include "analog-rytm-mk2/pages.h"
#include "analog-rytm-mk2/store.h"
#include "modwerk/dsp.h"
#include "tables.h"

// ---- stock OS 1.74 ----
#define PROJECT_AT 0x4017fa0a           // () -> the project
#define TRACK_INDEX_OF_AT 0x400b693e    // (project + 48) -> the selected track, 12 the FX track
#define KIT_TRACK_SOUND_AT 0x400a67ca   // (project + 352, track) -> the track's sound accessor
#define PROJ_TRACKSEL 48
#define PROJ_KIT 352
#define VT_LIVE_SOUND 0x28              // the accessor's live-sound getter
#define VT_CONFIG_CHANGED 16            // the accessor's change notice
#define SOUND_CONFIG_CHANGED 0x401cb88c // SoundConfigChangedInfo's vtable
#define SAMPLE_STREAM 0x800067f8        // 8 voices x 32 frames, Q31
#define VOICE_TRACK_AT 0x40291138       // the track each voice plays, a byte a voice
#define ID_STOCK_FRQ 47                 // FILTER FRQ: its value text

#define TRACKS 12
#define VOICES 8
#define FRAMES 32

#define PAGE_LAYER 14
#define ID_FRQ 447                      // hidden TEST ids, renamed in build.json
#define ID_RES 448
#define ID_TYP 449
#define ID_DEC 450

enum { TYP_OFF, TYP_LP, TYP_BP, TYP_HP, TYPES };
#define RES_MAX 15
#define DEC_OFF 127

// sample_layer_cfg, 20 bits, zero for stock's sound: TYP 2 | FRQ ^ 127 7 | RES 4 | DEC ^ 127 7
STORE_FIELD(sample_layer_cfg);
#define CFG_TYP(c) ((c) >> 18 & 3)
#define CFG_FRQ(c) (((c) >> 11 & 127) ^ 127)
#define CFG_RES(c) ((c) >> 7 & 15)
#define CFG_DEC(c) (((c) & 127) ^ 127)
#define CFG(typ, frq, res, dec) \
    ((unsigned)(typ) << 18 | ((unsigned)(frq) ^ 127) << 11 | (unsigned)(res) << 7 | ((unsigned)(dec) ^ 127))

typedef void *(*project_t)(void);
typedef int (*track_index_of_t)(void *);
typedef void *(*kit_track_sound_t)(void *, int);
typedef void *(*vfn1_t)(void *);
typedef void (*vfn2_t)(void *, void *);

struct sl_coef {
    int32_t a1, a2, a3, kh;     // the state-variable filter's, Q31; kh is k / 2
    int32_t dmul;               // the decay's gain a block, Q31
    uint8_t typ, dec;           // TYP; dec 1 while DEC is not OFF
};

static struct sl_coef sl_c[TRACKS];
static unsigned sl_cfg[TRACKS];
static uint8_t sl_known[TRACKS];
static int32_t sl_ic1[VOICES], sl_ic2[VOICES], sl_env[VOICES];
static int32_t sl_acc[4];       // the turns' fractions, by knob
volatile uint8_t sample_layer_trig;     // a bit a voice: an AMP attack this block (sample-layer.s)

// ---- the UI task ----

static void *project(void) { return ((project_t)PROJECT_AT)(); }

static void *accessor(int t)
{
    return ((kit_track_sound_t)KIT_TRACK_SOUND_AT)((char *)project() + PROJ_KIT, t);
}

static void *live_sound(void *acc)
{
    return acc ? ((vfn1_t)(*(void ***)acc)[VT_LIVE_SOUND / 4])(acc) : 0;
}

static int selected_track(void)
{
    return ((track_index_of_t)TRACK_INDEX_OF_AT)((char *)project() + PROJ_TRACKSEL);
}

// The change notice stock's sound settings setters send: without it a write to the live sound's
// mod storage is lost at a reboot unless the kit is saved.
static void notify(void *acc)
{
    struct { uint32_t vt; uint8_t kind; } info = { SOUND_CONFIG_CHANGED, 1 };

    ((vfn2_t)(*(void ***)acc)[VT_CONFIG_CHANGED / 4])(acc, &info);
}

// Zavalishin's and Simper's trapezoidal state-variable filter: g = tan(pi fc / fs), k = 1 / Q,
// a1 = 1 / (1 + g (g + k)), a2 = g a1, a3 = g a2. Fixed point, no 64-bit products: g and k are
// Q16, the coefficients Q31.
static void coef(struct sl_coef *c, unsigned cfg)
{
    uint32_t g = SL_G[CFG_FRQ(cfg)], k = SL_K[CFG_RES(cfg)];
    uint32_t den = 65536 + (((g >> 4) * ((g + k) >> 4)) >> 8);     // Q16, >= 1
    uint32_t q = 0x7fffffffu / (den >> 4);                          // 2^19 / den
    uint32_t a1 = q >= 0x80000u ? 0x7fffffffu : q << 12;
    uint32_t a2 = (a1 >> 16) * g;
    uint32_t a3 = (a2 >> 16) * g;
    struct sl_coef n;
    unsigned dec = CFG_DEC(cfg);

    n.a1 = (int32_t)a1;
    n.a2 = (int32_t)a2;
    n.a3 = (int32_t)(a3 > 0x7fffffffu ? 0x7fffffffu : a3);
    n.kh = (int32_t)(k >= 0x20000u ? 0x7fffffffu : k << 14);
    n.dmul = dec < DEC_OFF ? (int32_t)SL_DEC[dec] : MW_QMAX;
    n.dec = dec < DEC_OFF;
    n.typ = CFG_TYP(cfg);
    // The audio interrupt reads the entry between any two of these stores: TYP and the decay's
    // flag last, so a track turned on never runs on the previous coefficients.
    c->typ = 0;
    c->dec = 0;
    c->a1 = n.a1;
    c->a2 = n.a2;
    c->a3 = n.a3;
    c->kh = n.kh;
    c->dmul = n.dmul;
    c->dec = n.dec;
    c->typ = n.typ;
}

static void refresh(int t)
{
    void *s = live_sound(accessor(t));
    unsigned cfg = s ? core_store_get(STORE(sample_layer_cfg), s, 0) : 0;

    if (!sl_known[t] || cfg != sl_cfg[t]) {
        sl_cfg[t] = cfg;
        sl_known[t] = 1;
        coef(&sl_c[t], cfg);
    }
}

// ev_tick, about 20 Hz: every track's settings from its live sound, so a kit or sound load, a
// copy and paste and a reset reach the audio at the next tick.
void sample_layer_tick(void *ctrl)
{
    int t;

    (void)ctrl;
    for (t = 0; t < TRACKS; t++)
        refresh(t);
}

static unsigned cur_cfg(void)
{
    int t = selected_track();
    void *s = t < TRACKS ? live_sound(accessor(t)) : 0;

    return s ? core_store_get(STORE(sample_layer_cfg), s, 0) : 0;
}

static int knob(int32_t id)
{
    return id >= ID_FRQ && id <= ID_DEC ? (int)(id - ID_FRQ) : -1;
}

static int field(unsigned cfg, int k)
{
    switch (k) {
    case 0: return CFG_FRQ(cfg);
    case 1: return CFG_RES(cfg);
    case 2: return CFG_TYP(cfg);
    default: return CFG_DEC(cfg);
    }
}

static const int MAXES[4] = { 127, RES_MAX, TYPES - 1, DEC_OFF };

// get(id, *value): the dial, 8.8 on 0..127. RES and TYP spread their steps over the dial.
static int get(int32_t id, int32_t *value)
{
    int k = knob(id), v;

    if (k < 0)
        return 0;
    v = field(cur_cfg(), k);
    if (MAXES[k] != 127)
        v = (v * 127 + MAXES[k] / 2) / MAXES[k];
    *value = v << 8;
    return 1;
}

// delta(view, id, delta, func): whole steps of the 8.8 turn, the fraction carried, clamped to the
// knob's range, written to the selected track's sound. Taking the turn means stock makes no lock.
static int delta(void *view, int32_t id, int32_t d, int32_t func)
{
    int k = knob(id), t, steps, v[4], i;
    void *acc, *s;
    unsigned cfg;

    (void)view;
    (void)func;
    if (k < 0)
        return 0;
    t = selected_track();
    if (t >= TRACKS)
        return 1;
    acc = accessor(t);
    s = live_sound(acc);
    if (!s)
        return 1;
    sl_acc[k] += d;
    steps = sl_acc[k] / 256;
    sl_acc[k] -= steps * 256;
    if (!steps)
        return 1;
    cfg = core_store_get(STORE(sample_layer_cfg), s, 0);
    for (i = 0; i < 4; i++)
        v[i] = field(cfg, i);
    v[k] += steps;
    if (v[k] < 0)
        v[k] = 0;
    if (v[k] > MAXES[k])
        v[k] = MAXES[k];
    cfg = CFG(v[2], v[0], v[1], v[3]);
    core_store_set(STORE(sample_layer_cfg), s, 0, cfg);
    notify(acc);
    refresh(t);
    return 1;
}

static void put(char *b, const char *s)
{
    while ((*b++ = *s++))
        ;
}

static void put_u(char *b, unsigned v)
{
    char tmp[4];
    int n = 0;

    do
        tmp[n++] = (char)('0' + v % 10);
    while ((v /= 10) && n < 3);
    while (n)
        *b++ = tmp[--n];
    *b = 0;
}

static const char *const TYP_TEXT[TYPES] = { "OFF", "LP", "BP", "HP" };

static int text(struct core_text *t)
{
    int k = knob(t->id), v;

    if (k < 0)
        return CORE_TEXT_PASS;
    v = field(cur_cfg(), k);
    switch (k) {
    case 0:
        t->id = ID_STOCK_FRQ;           // stock's FRQ text: hertz where Filter Hz is in the set
        t->value = v << 8;
        return CORE_TEXT_STOCK;
    case 2:
        put(t->buf, TYP_TEXT[v]);
        return CORE_TEXT_DONE;
    case 3:
        if (v == DEC_OFF) {
            put(t->buf, "INF");
            return CORE_TEXT_DONE;
        }
        /* fall through */
    default:
        put_u(t->buf, (unsigned)v);
        return CORE_TEXT_DONE;
    }
}

static const char page_name[] = "SMPL LAYER";
const struct core_page sample_layer_page = { PAGE_LAYER, page_name, { ID_FRQ, ID_RES, ID_TYP, ID_DEC, 0, 0, 0, 0 } };
const struct core_param sample_layer_params = { ID_FRQ, ID_DEC, get, delta, text };
const struct core_view_page sample_layer_view_page = { CORE_VIEW_SAMPLE, PAGE_LAYER, 0 };

const char sample_layer_long_frq[] = "Layer Frequency";
const char sample_layer_short_frq[] = "FRQ";
const char sample_layer_long_res[] = "Layer Resonance";
const char sample_layer_short_res[] = "RES";
const char sample_layer_long_typ[] = "Layer Filter Type";
const char sample_layer_short_typ[] = "TYP";
const char sample_layer_long_dec[] = "Layer Decay";
const char sample_layer_short_dec[] = "DEC";

// ---- the audio interrupt ----

// Once a block, before stock's voice mixer (sample-layer.s). A voice whose track has TYP OFF and
// DEC INF is left as stock wrote it, bit for bit. Each frame: headroom of 3 bits into the filter,
// LP, BP or HP out, then the decay's gain, ramped across the block.
void sample_layer_render(void)
{
    int32_t *s = (int32_t *)SAMPLE_STREAM;
    const volatile uint8_t *map = (const volatile uint8_t *)VOICE_TRACK_AT;
    unsigned trig = sample_layer_trig;
    int v, n;

    sample_layer_trig = 0;
    for (v = 0; v < VOICES; v++, s += FRAMES) {
        unsigned t = map[v];
        const struct sl_coef *c;
        int32_t e0, e1, e, step, i1, i2;
        unsigned typ;

        if (t >= TRACKS)
            continue;
        c = &sl_c[t];
        typ = c->typ;
        e0 = trig & (1u << v) ? MW_QMAX : sl_env[v];
        e1 = c->dec ? qmul(e0, c->dmul) : MW_QMAX;
        sl_env[v] = e1;
        if (!typ) {
            sl_ic1[v] = sl_ic2[v] = 0;
            if (!c->dec)
                continue;
        }
        e = e0;
        step = (e1 >> 5) - (e0 >> 5);
        i1 = sl_ic1[v];
        i2 = sl_ic2[v];
        for (n = 0; n < FRAMES; n++) {
            int32_t y = s[n];

            if (typ) {
                int32_t x = y >> 3, v1, v2;

                v1 = qsum2(c->a1, i1, c->a2, x - i2);
                v2 = i2 + qsum2(c->a2, i1, c->a3, x - i2);
                i1 = sadd(v1, v1 - i1);
                i2 = sadd(v2, v2 - i2);
                y = typ == TYP_LP ? v2 : typ == TYP_BP ? v1 : x - v2 - 2 * qmul(c->kh, v1);
                y = sshl(y, 3);
            }
            if (c->dec) {
                y = qmul(y, e);
                e += step;
            }
            s[n] = y;
        }
        sl_ic1[v] = i1;
        sl_ic2[v] = i2;
    }
}
