// SPDX-License-Identifier: GPL-3.0-or-later
// Sample Layer: sample engines for the SMPL key. FUNC + SMPL opens a list of engines for the
// selected track's sample, a small window in the style of the machine list SRC opens:
//
//   SAMPLER      stock's sample playback, bit for bit
//   TRANSIENTS   a drum processor of the sample's own: PUNCH (a snap with a pitch blip to the
//                right, a fade-in rising in pitch to the left), a decay, a band (a base and a
//                width) and a shift of the sample after the analog voice
//
// The analog machine, the analog filter and the AMP envelope are left as they are: the sample is
// shaped before its DAC, so AMP still shapes the whole sound. While the track's engine is
// TRANSIENTS, SMPL shows one page (core_page_fns, pages 4 and 5) and stays there:
//
//   A PUNCH   B DEC   C BR (stock's)  D SMP (stock's)
//   E BAS     F WID   G SHF   H LEV (stock's)
//
// with BAS and WID drawn as one band over E and F. SAMPLER keeps stock's pages.
//
// The audio side (sample_layer_render, from the gate in sample-layer.s) works on stock's sample
// stream before stock's voice mixer reads it: 8 voices of 32 frames, Q31, at SAMPLE_STREAM. Probe
// SL01 on a unit (26 November 2026) showed that clearing it silences the sample alone. Each voice
// plays the track VOICE_TRACK_AT names, as stock's amp_env_commands reads it (0x4010996a).
//
// The UI side keeps each track's settings in two sound fields and turns them into coefficients
// in the UI task (ev_tick, and at once after a turn), so the audio interrupt only reads a table.
#include <stdint.h>
#include "analog-rytm-mk2/pages.h"
#include "analog-rytm-mk2/store.h"
#include "modwerk/dsp.h"
#include "tables.h"

// ---- stock OS 1.74 ----
#define PROJECT_AT 0x4017fa0a           // () -> the project
#define TRACK_INDEX_OF_AT 0x400b693e    // (project + 48) -> the selected track, 12 the FX track
#define KIT_TRACK_SOUND_AT 0x400a67ca   // (project + 352, track) -> the track's sound accessor
#define IS_KEY_HELD_AT 0x40081c28       // (key) -> held, from the panel scan
#define TEXT_DRAW_AT 0x4007154c         // stock's text in the parameter labels' font
#define TEXT_FONT_AT 0x40071be8
#define TEXT_CTX_AT 0x417e389c
#define PAGE_INFO_AT 0x400ff5e0         // (page) -> &entry->name, the ids A..H after it
#define PROJ_TRACKSEL 48
#define PROJ_KIT 352
#define VT_LIVE_SOUND 0x28              // the accessor's live-sound getter
#define VT_CONFIG_CHANGED 16            // the accessor's change notice
#define SOUND_CONFIG_CHANGED 0x401cb88c // SoundConfigChangedInfo's vtable
#define SAMPLE_STREAM 0x800067f8        // 8 voices x 32 frames, Q31
#define VOICE_TRACK_AT 0x40291138       // the track each voice plays, a byte a voice
#define ID_STOCK_FRQ 47                 // FILTER FRQ: its value text

// ev_key and ev_enc events, ev_tick's controller (as the other Rytm mods read them)
#define EV_KEY 12                       // key event + 12: the key
#define EV_FLAGS 16                     // + 16: bit 0 down (repeats too), bit 3 a repeat
#define FLAG_DOWN 1
#define FLAG_REPEAT 8
#define EV_ENCODER 12                   // encoder event + 12: 0-7 the knobs A-H
#define EV_COUNT 16                     // + 16: the count, signed
#define CTRL_REDRAW 0x20                // ev_tick's ctrl: asks for a redraw
#define KEY_SMPL 0x32
#define KEY_UP 0x42
#define KEY_DOWN 0x43
#define KEY_YES 0x44
#define KEY_NO 0x45
#define KEY_FUNC 0x80
#define KNOBS 8
#define KNOB_COUNTS 4                   // encoder counts a step of the list

#define TRACKS 12
#define VOICES 8
#define FRAMES 32

#define PAGE_SAMPLE 4                   // stock's SMPL page
#define PAGE_WAVE 5                     // stock's second SMPL page, with the waveform
#define ID_PUNCH 447                    // hidden TEST ids, renamed in build.json
#define ID_DEC 448
#define ID_BAS 449
#define ID_WID 450
#define ID_SHF 451
enum { K_PUNCH, K_DEC, K_BAS, K_WID, K_SHF, KS };

enum { ENG_SAMPLER, ENG_TRANSIENTS, ENGINES };
#define DEC_INF 63
#define PUNCH_MID 32
#define SHF_MAX_MS 30
#define DLY_MAX (SHF_MAX_MS * 48)        // frames
#define LEAD 80                         // frames the sample is held back while PUNCH is right of
                                        // centre, which its pitch blip reads ahead into
#define LAG_MAX 256                     // frames PUNCH's fade-in falls behind, at most
#define DLY_LEN (DLY_MAX + LEAD + LAG_MAX + 2 * FRAMES)
#define OFF_MAX ((DLY_LEN - FRAMES - 2) << 16)
#define BLIP_Q16 10187                  // PUNCH +62's pitch blip: 2^(2.5/12) - 1, 2.5 semitones
#define BLIP_DECAY 9                    // its fall, a frame: 1/512, 10.7 ms
#define FADE_MAX 1920                   // PUNCH -64's fade-in: 40 ms
#define DROP_Q16 13520                  // and the pitch it starts under: 1 - 2^(-4/12), 4 semitones
#define K_BUTTERWORTH 0x5a82799a        // k / 2 = 1 / (2 Q), Q = 0.707, in Q31
#define K_BUTTERWORTH_Q16 92682         // k = 1.414 in Q16
#define UNITY_Q28 0x10000000

// Two sound fields, zero for stock's sound (SAMPLER, every stage neutral, DEC INF):
//   sample_layer_eng  ENG 2 | PUNCH ^ 32 6 | DEC ^ 63 6 | SHF 6
//   sample_layer_flt  BAS 7 | WID ^ 127 7
// PUNCH, DEC and SHF keep 64 steps (the knob moves 2 at a time), BAS and WID 128.
STORE_FIELD(sample_layer_eng);
STORE_FIELD(sample_layer_flt);

struct sl_set { unsigned eng, k[KS]; };

static void decode(struct sl_set *s, unsigned e, unsigned f)
{
    s->eng = e >> 18 & 3;
    s->k[K_PUNCH] = (e >> 12 & 63) ^ PUNCH_MID;
    s->k[K_DEC] = (e >> 6 & 63) ^ DEC_INF;
    s->k[K_SHF] = e & 63;
    s->k[K_BAS] = f >> 7 & 127;
    s->k[K_WID] = (f & 127) ^ 127;
}

static unsigned encode_eng(const struct sl_set *s)
{
    return s->eng << 18 | (s->k[K_PUNCH] ^ PUNCH_MID) << 12 | (s->k[K_DEC] ^ DEC_INF) << 6
           | s->k[K_SHF];
}

static unsigned encode_flt(const struct sl_set *s)
{
    return s->k[K_BAS] << 7 | (s->k[K_WID] ^ 127);
}

typedef void *(*project_t)(void);
typedef int (*track_index_of_t)(void *);
typedef void *(*kit_track_sound_t)(void *, int);
typedef void *(*vfn1_t)(void *);
typedef void (*vfn2_t)(void *, void *);
typedef unsigned (*is_key_held_t)(int);
typedef unsigned long (*word1_t)(unsigned long);
typedef void (*text_draw_t)(void *bmp, void *font, int x, int y, int centred, int a5,
                            const char *width, const char *fmt, ...);
typedef const char *const *(*page_info_t)(int32_t);

struct svf { int32_t a1, a2, a3; };     // Q31

struct sl_coef {
    struct svf hp, lp;
    int32_t dmul;               // the decay's gain a block, Q31
    uint16_t dly;               // the shift, frames
    int32_t blip, drop;         // PUNCH's pitch blip over 1 and the pitch drop under it, Q16
    uint16_t fade;              // PUNCH's fade-in, frames
    int32_t pnorm;              // PUNCH's snap brought back under full scale, Q16
    int8_t punch;               // -64 .. 62, 0 none
    uint8_t on;                 // the track's engine is TRANSIENTS and something is set
    uint8_t hp_on, lp_on, dec;
};

static struct sl_coef sl_c[TRACKS];
static unsigned sl_raw[TRACKS][2];
static uint8_t sl_known[TRACKS];
static int32_t sl_h1[VOICES], sl_h2[VOICES], sl_l1[VOICES], sl_l2[VOICES];
static int32_t sl_env[VOICES];          // the decay, Q31
static uint16_t sl_hold[VOICES];
static int32_t sl_fast[VOICES], sl_slow[VOICES];        // the detectors, Q28
static int16_t sl_buf[VOICES][DLY_LEN];                 // the delay lines, the top 16 bits
static uint16_t sl_wr[VOICES];                          // the write index
static uint8_t sl_used[VOICES];                         // the delay line holds this voice
static int32_t sl_off[VOICES], sl_xoff[VOICES];         // the read's delay and the old one, Q16
static uint8_t sl_xf[VOICES];                           // frames left of the crossfade to it
static int32_t sl_pe[VOICES];                           // the pitch blip left, Q16
static int32_t sl_def[VOICES], sl_ddef[VOICES];         // the fade-in's pitch drop and its step, Q24
static int32_t sl_fg[VOICES], sl_fstep[VOICES];         // the fade-in's gain and its step, Q31
static uint16_t sl_ft[VOICES];                          // the fade-in's frames left
static int16_t sl_pend[VOICES];                         // frames to a delayed trig, -1 none
static int32_t sl_gain[VOICES];         // the last block's gain, Q28
static int32_t sl_acc[KS];              // the turns' fractions, by knob
volatile uint8_t sample_layer_trig;     // a bit a voice: an AMP attack this block (sample-layer.s)

// the engine list
static uint8_t list_open, list_cursor, list_track, list_redraw, swallow_key;
static int list_counts;
static uint8_t page_seen;       // TRANSIENTS' values were drawn in this compose
static uint8_t page_live;       // and in the last one: the page is on screen

static const char *const ENGINE_NAME[ENGINES] = { "SAMPLER", "TRANSIENTS" };

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

// Zavalishin's and Simper's trapezoidal state-variable filter, Butterworth (k = 1.414):
// g = tan(pi fc / fs), a1 = 1 / (1 + g (g + k)), a2 = g a1, a3 = g a2. Fixed point, no 64-bit
// products: g and k are Q16, the coefficients Q31.
static void svf_coef(struct svf *f, unsigned x)
{
    uint32_t g = SL_G[x], k = K_BUTTERWORTH_Q16;
    uint32_t den = 65536 + (((g >> 4) * ((g + k) >> 4)) >> 8);     // Q16, >= 1
    uint32_t q = 0x7fffffffu / (den >> 4);                          // 2^19 / den
    uint32_t a1 = q >= 0x80000u ? 0x7fffffffu : q << 12;
    uint32_t a2 = (a1 >> 16) * g;
    uint32_t a3 = (a2 >> 16) * g;

    f->a1 = (int32_t)a1;
    f->a2 = (int32_t)a2;
    f->a3 = (int32_t)(a3 > 0x7fffffffu ? 0x7fffffffu : a3);
}

static void coef(struct sl_coef *c, const struct sl_set *s)
{
    struct sl_coef n;
    unsigned dec = s->k[K_DEC], bas = s->k[K_BAS];
    int punch = ((int)s->k[K_PUNCH] - PUNCH_MID) * 2;
    unsigned top = bas + s->k[K_WID] * (127 - bas) / 127;  // WID 0: at BAS; 127: open

    svf_coef(&n.hp, bas);
    svf_coef(&n.lp, top);
    n.dmul = dec < DEC_INF ? (int32_t)SL_DEC[dec] : MW_QMAX;
    n.dly = (uint16_t)(s->k[K_SHF] * DLY_MAX / 63);
    n.punch = (int8_t)punch;
    n.blip = punch > 0 ? punch * BLIP_Q16 / 62 : 0;
    n.pnorm = (int32_t)(0xffffffffu / (uint32_t)(65536 + (punch > 0 ? punch * 3072 : 0)));
    n.drop = punch < 0 ? -punch * DROP_Q16 / 64 : 0;
    n.fade = (uint16_t)(punch < 0 ? -punch * FADE_MAX / 64 : 0);
    n.hp_on = bas > 0;
    n.lp_on = top < 127;
    n.dec = dec < DEC_INF;
    n.on = s->eng == ENG_TRANSIENTS && (n.hp_on || n.lp_on || n.dec || n.punch || n.dly);
    // The audio interrupt reads the entry between any two of these stores: off first and on
    // last, so it never runs on half the new coefficients (a voice off clears its state).
    c->on = 0;
    c->hp = n.hp;
    c->lp = n.lp;
    c->dmul = n.dmul;
    c->dly = n.dly;
    c->blip = n.blip;
    c->drop = n.drop;
    c->fade = n.fade;
    c->pnorm = n.pnorm;
    c->punch = n.punch;
    c->hp_on = n.hp_on;
    c->lp_on = n.lp_on;
    c->dec = n.dec;
    c->on = n.on;
}

static int read_raw(int t, unsigned raw[2])
{
    void *s = t >= 0 && t < TRACKS ? live_sound(accessor(t)) : 0;

    raw[0] = s ? core_store_get(STORE(sample_layer_eng), s, 0) : 0;
    raw[1] = s ? core_store_get(STORE(sample_layer_flt), s, 0) : 0;
    return s != 0;
}

static void read_set(int t, struct sl_set *s)
{
    unsigned raw[2];

    read_raw(t, raw);
    decode(s, raw[0], raw[1]);
}

static void refresh(int t)
{
    unsigned raw[2];
    struct sl_set s;

    read_raw(t, raw);
    if (!sl_known[t] || raw[0] != sl_raw[t][0] || raw[1] != sl_raw[t][1]) {
        sl_raw[t][0] = raw[0];
        sl_raw[t][1] = raw[1];
        sl_known[t] = 1;
        decode(&s, raw[0], raw[1]);
        coef(&sl_c[t], &s);
    }
}

static void write_set(int t, const struct sl_set *set)
{
    void *acc = accessor(t), *s = live_sound(acc);

    if (!s)
        return;
    core_store_set(STORE(sample_layer_eng), s, 0, encode_eng(set));
    core_store_set(STORE(sample_layer_flt), s, 0, encode_flt(set));
    notify(acc);
    refresh(t);
}

// ev_tick, about 20 Hz: every track's settings from its live sound, so a kit or sound load, a
// copy and paste and a reset reach the audio at the next tick.
void sample_layer_tick(void *ctrl)
{
    int t;

    for (t = 0; t < TRACKS; t++)
        refresh(t);
    if (list_open && selected_track() != list_track) {
        list_open = 0;
        list_redraw = 1;
    }
    if (list_redraw) {
        list_redraw = 0;
        ((char *)ctrl)[CTRL_REDRAW] = 1;
    }
}

// ---- TRANSIENTS' page ----

static int is_transients(void)
{
    struct sl_set s;

    read_set(selected_track(), &s);
    return s.eng == ENG_TRANSIENTS;
}

static int knob(int32_t id)
{
    return id >= ID_PUNCH && id <= ID_SHF ? (int)(id - ID_PUNCH) : -1;
}

static int fine(int k) { return k == K_BAS || k == K_WID; }  // 128 steps; the rest 64

// get(id, *value): the dial, 8.8 on 0..127.
static int get(int32_t id, int32_t *value)
{
    int k = knob(id);
    struct sl_set s;

    if (k < 0)
        return 0;
    read_set(selected_track(), &s);
    *value = (int32_t)(fine(k) ? s.k[k] : s.k[k] * 2) << 8;
    return 1;
}

// delta(view, id, delta, func): whole steps of the 8.8 turn, the fraction carried, clamped,
// written to the selected track's sound. Taking the turn means stock makes no lock.
static int delta(void *view, int32_t id, int32_t d, int32_t func)
{
    int k = knob(id), t, unit, steps, v, top;
    struct sl_set s;

    (void)view;
    (void)func;
    if (k < 0)
        return 0;
    t = selected_track();
    if (t >= TRACKS)
        return 1;
    unit = fine(k) ? 256 : 512;
    sl_acc[k] += d;
    steps = sl_acc[k] / unit;
    sl_acc[k] -= steps * unit;
    if (!steps)
        return 1;
    read_set(t, &s);
    top = fine(k) ? 127 : 63;
    v = (int)s.k[k] + steps;
    if (v < 0)
        v = 0;
    if (v > top)
        v = top;
    s.k[k] = (unsigned)v;
    write_set(t, &s);
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

static int text(struct core_text *t)
{
    int k = knob(t->id), v;
    struct sl_set s;

    if (k < 0)
        return CORE_TEXT_PASS;
    page_seen = 1;
    read_set(selected_track(), &s);
    v = (int)s.k[k];
    switch (k) {
    case K_BAS:
        t->id = ID_STOCK_FRQ;           // stock's FRQ text: hertz where Filter Hz is in the set
        t->value = v << 8;
        return CORE_TEXT_STOCK;
    case K_WID:
        put_u(t->buf, (unsigned)v);
        return CORE_TEXT_DONE;
    case K_SHF:                         // milliseconds
        put_u(t->buf, (unsigned)(v * SHF_MAX_MS + 31) / 63);
        return CORE_TEXT_DONE;
    case K_PUNCH:
        v = (v - PUNCH_MID) * 2;
        if (v > 0)
            t->buf[0] = '+';
        else if (v < 0)
            t->buf[0] = '-';
        put_u(t->buf + (v != 0), (unsigned)(v < 0 ? -v : v));
        return CORE_TEXT_DONE;
    case K_DEC:
        if (v == DEC_INF) {
            put(t->buf, "INF");
            return CORE_TEXT_DONE;
        }
        break;
    }
    put_u(t->buf, (unsigned)v * 2);
    return CORE_TEXT_DONE;
}

static const char page_name[] = "TRANSIENTS";
static struct core_page transients_page = {
    PAGE_SAMPLE, page_name, { ID_PUNCH, ID_DEC, 0, 0, ID_BAS, ID_WID, ID_SHF, 0 }
};
static uint8_t in_info;

// SMPL's pages while the selected track's engine is TRANSIENTS: both answer TRANSIENTS' page,
// with stock's BR, SMP and LEV (knobs C, D and H of stock's first page, read from page_info itself,
// which passes on to stock while in_info is set). Stock's pages otherwise.
static const struct core_page *sample_info(int32_t page)
{
    const char *const *e;
    const int32_t *ids;

    (void)page;
    if (in_info || !is_transients())
        return 0;
    in_info = 1;
    e = ((page_info_t)PAGE_INFO_AT)(PAGE_SAMPLE);
    in_info = 0;
    if (!e)
        return 0;
    ids = (const int32_t *)(e + 1);
    transients_page.ids[2] = ids[2];    // BR
    transients_page.ids[3] = ids[3];    // SMP
    transients_page.ids[7] = ids[7];    // LEV
    return &transients_page;
}

const struct core_page_fn sample_layer_page_fn = { PAGE_SAMPLE, sample_info };
const struct core_page_fn sample_layer_wave_fn = { PAGE_WAVE, sample_info };
const struct core_param sample_layer_params = { ID_PUNCH, ID_SHF, get, delta, text };

const char sample_layer_long_punch[] = "Punch";
const char sample_layer_short_punch[] = "PCH";
const char sample_layer_long_dec[] = "Sample Decay";
const char sample_layer_short_dec[] = "DEC";
const char sample_layer_long_bas[] = "Band Base";
const char sample_layer_short_bas[] = "BAS";
const char sample_layer_long_wid[] = "Band Width";
const char sample_layer_short_wid[] = "WID";
const char sample_layer_long_shf[] = "Sample Shift";
const char sample_layer_short_shf[] = "SHF";

// ---- the engine list (FUNC + SMPL) ----

static unsigned key_held(int key) { return ((is_key_held_t)IS_KEY_HELD_AT)(key); }

static void list_close(void)
{
    list_open = 0;
    list_redraw = 1;
}

// ev_key. FUNC + SMPL on a sound track opens the list with the cursor on the track's engine.
// While it is open: UP and DOWN move the cursor, YES sets the engine and closes, NO closes with
// nothing changed, FUNC passes, and any other key closes the list and goes on to stock. SMPL
// alone on TRANSIENTS' page is taken, so the page stays: it is the engine's only page.
int sample_layer_key(void *brain, char *ev)
{
    int key = *(int *)(ev + EV_KEY), flags = *(int *)(ev + EV_FLAGS);
    int down = flags & FLAG_DOWN, t;
    struct sl_set s;

    (void)brain;
    if (swallow_key && key == swallow_key) {
        if (!down)
            swallow_key = 0;            // its release: the last of it
        return 1;
    }
    if (!list_open) {
        if (key != KEY_SMPL || !down)
            return 0;
        t = selected_track();
        if (t >= TRACKS)
            return 0;                   // the FX track: stock's
        if (!key_held(KEY_FUNC)) {
            if (!page_live || !is_transients())
                return 0;
            swallow_key = KEY_SMPL;
            return 1;
        }
        read_set(t, &s);
        list_open = 1;
        list_track = (uint8_t)t;
        list_cursor = (uint8_t)(s.eng < ENGINES ? s.eng : 0);
        list_counts = 0;
        list_redraw = 1;
        swallow_key = KEY_SMPL;
        return 1;
    }
    switch (key) {
    case KEY_UP:
    case KEY_DOWN:
        if (down) {
            if (key == KEY_UP && list_cursor > 0)
                list_cursor--;
            if (key == KEY_DOWN && list_cursor < ENGINES - 1)
                list_cursor++;
            list_redraw = 1;
        }
        return 1;
    case KEY_YES:
    case KEY_NO:
        if (!down || (flags & FLAG_REPEAT))
            return 1;
        if (key == KEY_YES) {
            read_set(list_track, &s);
            if (s.eng != list_cursor) {
                s.eng = list_cursor;
                write_set(list_track, &s);
            }
        }
        list_close();
        swallow_key = (uint8_t)key;
        return 1;
    case KEY_FUNC:
        return 0;
    default:
        if (down)
            list_close();
        return 0;
    }
}

// ev_enc: while the list is open any knob A-H moves the cursor, a step every KNOB_COUNTS.
int sample_layer_enc(void *brain, char *ev)
{
    int enc = *(int *)(ev + EV_ENCODER), n = *(int *)(ev + EV_COUNT);

    (void)brain;
    if (!list_open || enc < 0 || enc >= KNOBS)
        return 0;
    list_counts += n;
    while (list_counts >= KNOB_COUNTS) {
        list_counts -= KNOB_COUNTS;
        if (list_cursor < ENGINES - 1)
            list_cursor++;
        list_redraw = 1;
    }
    while (list_counts <= -KNOB_COUNTS) {
        list_counts += KNOB_COUNTS;
        if (list_cursor > 0)
            list_cursor--;
        list_redraw = 1;
    }
    return 1;
}

// The bitmap, one bit a pixel, column by column; rows count from the top here, the bitmap keeps
// row 63 - y.
static unsigned *bm_words;
static int bm_w, bm_stride;

static void bm_put(int x, int y, int on)
{
    unsigned bit, *w;
    int r = 63 - y;

    if (x < 0 || x >= bm_w || y < 0 || y > 63)
        return;
    bit = 0x80000000u >> (r & 31);
    w = bm_words + x * bm_stride + (r >> 5);
    *w = on ? *w | bit : *w & ~bit;
}

static int bm_get(int x, int y)
{
    int r = 63 - y;

    return (bm_words[x * bm_stride + (r >> 5)] >> (31 - (r & 31))) & 1;
}

// A stock window over the page (a trig's micro timing, RETRIG and the like): its frame is a
// horizontal line far longer than anything the knob page draws between its header and its
// footer. The band is not drawn while one is open, so the window stays on top.
#define WIN_Y0 12
#define WIN_Y1 50
#define WIN_RUN 32

static int window_open(void)
{
    int x, y, run;

    for (y = WIN_Y0; y <= WIN_Y1; y++)
        for (x = 0, run = 0; x < 128; x++) {
            run = bm_get(x, y) ? run + 1 : 0;
            if (run >= WIN_RUN)
                return 1;
        }
    return 0;
}

static void bm_flip(int x0, int y0, int x1, int y1)
{
    int x, y;
    unsigned bit, *w;

    for (x = x0; x <= x1; x++)
        for (y = y0; y <= y1; y++) {
            int r = 63 - y;

            bit = 0x80000000u >> (r & 31);
            w = bm_words + x * bm_stride + (r >> 5);
            *w ^= bit;
        }
}

static void bm_fill(int x0, int y0, int x1, int y1, int on)
{
    int x, y;

    for (x = x0; x <= x1; x++)
        for (y = y0; y <= y1; y++)
            bm_put(x, y, on);
}

// Text whose last row is `bottom` (from the top), centred on x or from x.
static void label(void *bmp, int x, int bottom, int centred, const char *s)
{
    ((text_draw_t)TEXT_DRAW_AT)(bmp, (void *)((word1_t)TEXT_FONT_AT)(TEXT_CTX_AT), x, 63 - bottom,
                                centred, 0, s, "%s", s);
}

// The band over knobs E and F, in place of their dials and above their labels: a frame, the
// response rising to a dotted line at BAS, flat, and falling from a dotted line at the band's
// top, BAS + WID of what is left above it.
#define BAND_X0 4
#define BAND_X1 61
#define BAND_Y0 33
#define BAND_Y1 44
#define BAND_SLOPE 8                    // pixels from the floor to the top of a skirt

static int band_x(int v)
{
    return BAND_X0 + 2 + v * (BAND_X1 - BAND_X0 - 4) / 127;
}

static void draw_band(void)
{
    struct sl_set s;
    int hpf, lpf, xh, xl, top = BAND_Y0 + 2, bot = BAND_Y1 - 1, h, x, y, prev = -1;

    read_set(selected_track(), &s);
    hpf = (int)s.k[K_BAS];
    lpf = hpf + (int)s.k[K_WID] * (127 - hpf) / 127;
    xh = band_x(hpf);
    xl = band_x(lpf);
    h = bot - top;
    bm_fill(BAND_X0 - 2, BAND_Y0, BAND_X1 + 2, BAND_Y1 + 1, 0);
    bm_fill(BAND_X0, BAND_Y0, BAND_X1, BAND_Y1, 1);
    bm_fill(BAND_X0 + 1, BAND_Y0 + 1, BAND_X1 - 1, BAND_Y1 - 1, 0);
    for (x = BAND_X0 + 1; x < BAND_X1; x++) {
        int up = hpf ? (x - (xh - BAND_SLOPE)) * h / BAND_SLOPE : h;
        int dn = lpf < 127 ? ((xl + BAND_SLOPE) - x) * h / BAND_SLOPE : h;
        int lv = up < dn ? up : dn, yy, y0, y1;

        if (lv < 0)
            lv = 0;
        if (lv > h)
            lv = h;
        y = bot - lv;
        if (prev < 0)
            prev = y;
        y0 = prev < y ? prev : y;
        y1 = prev > y ? prev : y;
        for (yy = y0; yy <= y1; yy++)
            bm_put(x, yy, 1);
        prev = y;
    }
    for (y = BAND_Y0 + 2; y < BAND_Y1; y += 2) {
        if (hpf)
            bm_put(xh, y, 1);
        if (lpf < 127)
            bm_put(xl, y, 1);
    }
}

#define ROW_H 9
#define HEAD_H 9
#define BOX_X0 28                       // the window, centred over the page
#define BOX_X1 99
#define BOX_Y0 14
#define BOX_Y1 (BOX_Y0 + HEAD_H + 1 + ENGINES * ROW_H + 1)

// ev_draw: on TRANSIENTS' page the band over E and F; the list as a small window over the page
// while it is open: a frame, a title bar and a row an engine, the cursor's row inverted.
void sample_layer_draw(void *bmp, void *ctrl)
{
    int i, top;

    (void)ctrl;
    bm_w = *(int *)((char *)bmp + 4);
    bm_stride = *(int *)((char *)bmp + 12);
    bm_words = *(unsigned **)((char *)bmp + 16);
    if (bm_w < 128 || *(int *)((char *)bmp + 8) < 64) {
        page_seen = 0;
        return;
    }
    page_live = page_seen;
    if (page_seen && !list_open && !window_open())
        draw_band();
    page_seen = 0;
    if (list_open) {
        bm_fill(BOX_X0 - 1, BOX_Y0 - 1, BOX_X1 + 1, BOX_Y1 + 1, 0);  // a clear margin
        bm_fill(BOX_X0, BOX_Y0, BOX_X1, BOX_Y1, 1);                  // the frame
        bm_fill(BOX_X0 + 1, BOX_Y0 + HEAD_H, BOX_X1 - 1, BOX_Y1 - 1, 0);
        bm_fill(BOX_X0 + 1, BOX_Y0 + 1, BOX_X1 - 1, BOX_Y0 + HEAD_H - 1, 0);
        label(bmp, (BOX_X0 + BOX_X1 + 1) / 2, BOX_Y0 + HEAD_H - 2, 1, "SAMPLE ENGINE");
        bm_flip(BOX_X0 + 1, BOX_Y0 + 1, BOX_X1 - 1, BOX_Y0 + HEAD_H - 1); // the title, light on dark
        for (i = 0; i < ENGINES; i++) {
            top = BOX_Y0 + HEAD_H + 1 + i * ROW_H;
            label(bmp, BOX_X0 + 4, top + ROW_H - 2, 0, ENGINE_NAME[i]);
            if (i == list_cursor)
                bm_flip(BOX_X0 + 2, top, BOX_X1 - 2, top + ROW_H - 1);
        }
    }
}

// ---- the audio interrupt ----

static inline __attribute__((always_inline)) int32_t svf_tick(const struct svf *f, int32_t x,
                                                              int32_t *i1, int32_t *i2, int32_t *bp)
{
    int32_t v1 = qsum2(f->a1, *i1, f->a2, x - *i2);
    int32_t v2 = *i2 + qsum2(f->a2, *i1, f->a3, x - *i2);

    *i1 = sadd(v1, v1 - *i1);
    *i2 = sadd(v2, v2 - *i2);
    *bp = v1;
    return v2;
}

// A block's PUNCH gain, Q16, from how far the fast follower is over the slow one (the hit): up
// to 4 times (+12 dB) on the hit, over the rest, then all of it brought down by that most, so the
// hit keeps its level and never clips, and the body falls under it.
static int32_t punch_gain(const struct sl_coef *c, int v, int32_t peak)
{
    int32_t fast = sl_fast[v], slow = sl_slow[v], r;

    fast = peak > fast ? peak : qmul(fast, SL_REL);
    slow = peak > slow ? slow + qmul(peak - slow, SL_SLOW_ATK) : qmul(slow, SL_REL);
    if (slow > fast)
        slow = fast;
    sl_fast[v] = fast;
    sl_slow[v] = slow;
    r = (fast - slow) / ((fast >> 8) + 1);                      // the hit, Q8 0..256
    return ((65536 + c->punch * r * 12) >> 4) * (c->pnorm >> 4) >> 8;
}

// The delay line at `off` (Q16 frames) behind frame `at`, linearly between its two frames, Q31.
static inline __attribute__((always_inline)) int32_t tap(const int16_t *b, int at, int32_t off)
{
    int i = at - (off >> 16), f = off & 0xffff, b0, b1, j;
    int32_t half;

    if (f) {
        i--;
        f = 65536 - f;
    }
    if (i < 0)
        i += DLY_LEN;
    j = i + 1 == DLY_LEN ? 0 : i + 1;
    b0 = b[i];
    b1 = b[j];
    half = b0 * 32768 + (b1 - b0) * (f >> 1);
    return (int32_t)((uint32_t)half << 1);
}

// The delay line, in place: SHF's delay (taken at each trig, so turning SHF never jumps a
// sound that plays), PUNCH's lead and its pitch, a crossfade of a block from the old delay to the
// new at each trig, and the fade-in's gain.
static void delay_line(int v, int32_t *s)
{
    int16_t *b = sl_buf[v];
    int w = sl_wr[v], at, n;
    int32_t off = sl_off[v], pe = sl_pe[v], def = sl_def[v], fg = sl_fg[v];
    unsigned ft = sl_ft[v];

    for (n = 0; n < FRAMES; n++) {
        b[w + n < DLY_LEN ? w + n : w + n - DLY_LEN] = (int16_t)(s[n] >> 16);
    }
    for (n = 0; n < FRAMES; n++) {
        int32_t rate = 65536, y;

        at = w + n < DLY_LEN ? w + n : w + n - DLY_LEN;
        if (pe) {
            rate += pe;
            pe -= (pe >> BLIP_DECAY) + 1;
            if (pe < 0)
                pe = 0;
        }
        if (ft) {
            rate -= def >> 8;
            def -= sl_ddef[v];
            if (def < 0)
                def = 0;
        }
        off += 65536 - rate;
        if (off < 0)
            off = 0;
        if (off > OFF_MAX)
            off = OFF_MAX;
        y = tap(b, at, off);
        if (sl_xf[v]) {
            int32_t yo = tap(b, at, sl_xoff[v]), k = FRAMES + 1 - sl_xf[v];

            y = yo + (((y >> 1) - (yo >> 1)) / (FRAMES + 1)) * k * 2;
            sl_xf[v]--;
        }
        if (ft) {
            y = qmul(y, fg);
            fg += sl_fstep[v];
            if (fg < 0)
                fg = MW_QMAX;
            ft--;
        }
        s[n] = y;
    }
    sl_wr[v] = (uint16_t)(w + FRAMES < DLY_LEN ? w + FRAMES : w + FRAMES - DLY_LEN);
    sl_off[v] = off;
    sl_pe[v] = pe;
    sl_def[v] = def;
    sl_fg[v] = fg;
    sl_ft[v] = (uint16_t)ft;
}

// Once a block, before stock's voice mixer (sample-layer.s). A voice whose track's engine is
// SAMPLER, or TRANSIENTS with every stage neutral, is left as stock wrote it, bit for bit.
// First the delay line (SHF and PUNCH, the trig's marker delayed with it), then each frame, with
// 3 bits of headroom: the high-pass at BAS; the block's gain (PUNCH's snap and the decay, held at
// full for 10 ms after a trig), ramped across the block; the low-pass at the band's top.
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
        int32_t e0, e1, g0, g1, g, step, h1, h2, l1, l2, bp, peak = 0;
        int gain, hit = 0, dly;

        if (t >= TRACKS)
            continue;
        c = &sl_c[t];
        dly = c->on && (c->dly || c->punch);
        if (dly && !sl_used[v]) {               // a delay line taken up: cleared, no old hit
            for (n = 0; n < DLY_LEN; n++)
                sl_buf[v][n] = 0;
            sl_used[v] = 1;
            sl_off[v] = (c->dly + (c->punch > 0 ? LEAD : 0)) << 16;
            sl_xf[v] = 0;
            sl_pe[v] = sl_ft[v] = 0;
        }
        if (!dly)
            sl_used[v] = 0;
        if (trig & (1u << v)) {
            if (dly) {
                sl_xoff[v] = sl_off[v];
                sl_xf[v] = FRAMES;
                sl_off[v] = (c->dly + (c->punch > 0 ? LEAD : 0)) << 16;
                sl_pend[v] = (int16_t)(sl_off[v] >> 16);
            } else
                sl_pend[v] = 0;
        }
        if (sl_pend[v] >= 0 && (sl_pend[v] < FRAMES || !c->on)) {
            hit = 1;                    // the hit reaches this block
            sl_pend[v] = -1;
            sl_env[v] = MW_QMAX;
            sl_hold[v] = SL_HOLD_BLOCKS;
            sl_pe[v] = c->blip;
            sl_ft[v] = c->fade;
            if (c->fade) {
                sl_def[v] = c->drop << 8;
                sl_ddef[v] = (c->drop << 8) / c->fade;
                sl_fg[v] = 0;
                sl_fstep[v] = MW_QMAX / c->fade;
            }
        } else if (sl_pend[v] >= 0)
            sl_pend[v] = (int16_t)(sl_pend[v] - FRAMES);
        if (!c->on) {
            sl_h1[v] = sl_h2[v] = sl_l1[v] = sl_l2[v] = 0;
            sl_fast[v] = sl_slow[v] = 0;
            sl_gain[v] = UNITY_Q28;
            continue;
        }
        if (dly)
            delay_line(v, s);
        e0 = sl_env[v];
        if (!c->dec)
            e1 = MW_QMAX;
        else if (sl_hold[v]) {
            sl_hold[v]--;
            e1 = e0;
        } else
            e1 = qmul(e0, c->dmul);
        sl_env[v] = e1;
        if (!c->hp_on)
            sl_h1[v] = sl_h2[v] = 0;
        if (!c->lp_on)
            sl_l1[v] = sl_l2[v] = 0;
        gain = c->punch > 0 || c->dec;

        // the high-pass, into the stream at Q28, and the block's peak
        h1 = sl_h1[v];
        h2 = sl_h2[v];
        for (n = 0; n < FRAMES; n++) {
            int32_t x = s[n] >> 3, a;

            if (c->hp_on) {
                int32_t lo = svf_tick(&c->hp, x, &h1, &h2, &bp);

                x = x - lo - 2 * qmul(K_BUTTERWORTH, bp);
            }
            s[n] = x;
            a = x < 0 ? -x : x;
            if (a > peak)
                peak = a;
        }
        sl_h1[v] = h1;
        sl_h2[v] = h2;

        // the block's gain, Q28, ramped from the last block's (from this one's at a hit)
        g1 = UNITY_Q28;
        if (c->punch > 0)
            g1 = punch_gain(c, v, peak) << 12;
        if (c->dec)
            g1 = qmul(g1, e1);
        g0 = hit ? g1 : sl_gain[v];
        sl_gain[v] = g1;
        g = g0;
        step = (g1 - g0) / FRAMES;

        l1 = sl_l1[v];
        l2 = sl_l2[v];
        for (n = 0; n < FRAMES; n++) {
            int32_t x = s[n];

            if (gain) {
                x = sshl(qmul(x, g), 3);
                g += step;
            }
            if (c->lp_on)
                x = svf_tick(&c->lp, x, &l1, &l2, &bp);
            s[n] = sshl(x, 3);
        }
        sl_l1[v] = l1;
        sl_l2[v] = l2;
    }
}
