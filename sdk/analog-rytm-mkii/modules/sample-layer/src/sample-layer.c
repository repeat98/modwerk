// SPDX-License-Identifier: GPL-3.0-or-later
// Sample Layer: sample engines for the SMPL key. FUNC + SMPL opens a list of engines for the
// selected track's sample, a small window in the style of the machine list SRC opens:
//
//   SAMPLER      stock's sample playback, bit for bit
//   TRANSIENT   a drum processor of the sample's own: PUNCH (a snap with a pitch blip to the
//                right, a fade-in rising in pitch to the left), a decay, a band (a base and a
//                width) and a shift of the sample after the analog voice
//   GRANULAR     a grain cloud read from the sample itself: position, size, density, spray,
//                pitch and the speed the position moves at
//
// The analog machine, the analog filter and the AMP envelope are left as they are: the sample is
// shaped before its DAC, so AMP still shapes the whole sound. While the track's engine is
// TRANSIENT, SMPL shows one page (core_page_fns, pages 4 and 5) and stays there:
//
//   A PUNCH   B DEC   C BR (stock's)  D SMP (stock's)
//   E BAS     F WID   G SHF   H LEV (stock's)
//
// with BAS and WID drawn as one band over E and F. GRANULAR's page, the same way:
//
//   A POS     B SIZ   C DEN   D SMP (stock's)
//   E SPR     F PIT   G SPD   H LEV (stock's)
//
// SAMPLER keeps stock's pages.
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
#include "analog-rytm-mk2/load.h"
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
#define SAMPLE_SLOTS_AT 0x41329e70      // 131 slots of 16 bytes: +0 the data (16-bit mono), +4 the
                                        // rate in its high half, +8 frames (Loop Sync reads them)
#define PARAMS_EFF_AT 0x8000f7a8        // each track's 42 words (8.8) after locks, scenes and LFOs
#define IDX_SMP 19
#define IDX_LEV 24
#define SLOT_LAST 130
#define SLOT_DATA(i) (*(const volatile int16_t *const volatile *)(SAMPLE_SLOTS_AT + (i) * 16))
#define SLOT_RATE(i) (*(const volatile uint16_t *)(SAMPLE_SLOTS_AT + (i) * 16 + 4))
#define SLOT_FRAMES(i) (*(const volatile uint32_t *)(SAMPLE_SLOTS_AT + (i) * 16 + 8))
#define EFF(t, i) (((const volatile int16_t *)PARAMS_EFF_AT)[(t) * 42 + (i)])
#define VOICE_TRACK_AT 0x40291138       // the track each voice plays, a byte a voice
#define VOICE_REC_AT 0x80005b30         // stock's sample voices, 92 bytes each (as Pipo Loop reads
                                        // them): +4 the play position in frames, +20 the sample's
                                        // frames, +42 nonzero while it plays backward
#define VPOS(v) (*(volatile int32_t *)(VOICE_REC_AT + (v) * 92 + 4))
#define VFRAMES(v) (*(volatile uint32_t *)(VOICE_REC_AT + (v) * 92 + 20))
#define VDOWN(v) (*(volatile uint8_t *)(VOICE_REC_AT + (v) * 92 + 42))
#define WAVE_X0 2                       // stock's waveform: x 2 .. 124, rows 16 .. 47 from the top
#define WAVE_W 123
#define WAVE_TOP 16
#define WAVE_BOT 47
#define BRAIN_AT 0x419f28f8             // stock's UI brain: +32 its view manager (as Pipo Loop finds
#define VT_SAMPLE_AT 0x401e3420         // the SAMPLE view by its vtable)
#define VIEW_INVALIDATE_AT 0x40078580   // invalidate(view): the view draws again
#define LOAD_SPAWN 220                  // core_audio_load (256ths) above which no grain starts
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
#define ID_POS 452                      // GRANULAR's, hidden TEST ids too
#define ID_SIZ 453
#define ID_DEN 454
#define ID_SPR 455
#define ID_PIT 456
#define ID_SPD 458                      // 457 is stock's CB_OSC_SELECT: passed
enum { G_POS, G_SIZ, G_DEN, G_SPR, G_PIT, G_SPD, GS };
#define SIZ_DEF 69                      // 80 ms
#define DEN_DEF 36                      // 20 grains a second
#define PIT_MID 32                      // 0 semitones; PIT keeps to -24 .. +24
#define SPD_DEF 48                      // the position moves at 1x: (SPD - 32) / 16
#define GRAINS 3                        // a voice's grains at once, at most
#define GRAIN_BUDGET 6                 // all voices' grains at once, at most: stock takes about two
                                        // thirds of the audio block already (Analog BD's README)
#define GR_LIFE (10 * 48000)            // frames after a trig the cloud keeps making grains

enum { ENG_SAMPLER, ENG_TRANSIENTS, ENG_GRANULAR, ENG_SLICER, ENGINES };
// The engines this version offers: SAMPLER and TRANSIENT. GRANULAR and SLICER are prototypes,
// for test builds only (ENGINES there); a sound that names one plays as SAMPLER.
#ifndef LIST_ENGINES
#define LIST_ENGINES 2
#endif
// SLICER's knobs: the first SMPL page CUT, SNS (DIV on GRID), TUNE, THRU, FADE; the waveform
// page SLC (the slice shown, not saved), STRT, END, BANK. They take the hidden ids 447..456,
// renamed while the selected track plays SLICER (slicer_labels).
enum { C_CUT, C_SNS, C_TUNE, C_THRU, C_FADE, C_STRT, C_END, C_BANK, CS,
       C_SLC = CS, C_ZOOM, C_VIEW, C_HGT };   // the waveform page's view, not saved
#define SNS_DEF 70                      // AUTO's sensitivity; on GRID the slices, 2 << (SNS / 22):
                                        // 2, 4, 8, 16 (the default), 32, 64
#define TUNE_MID 24                     // TUNE -24 .. +24 semitones
#define SLICES 64                       // slices at most
#define IDX_TUN 17                      // the effective parameters' TUN, STA and END words (8.8)
#define IDX_STA 21
#define IDX_END 22
#define NOTE_AT 0x80006388              // each track's note, Q16 semitones, while the byte at
#define NOTE_ON_AT 0x8000ea18           // NOTE_ON_AT + track has bit 1 (else 60): stock's step loop
#define REGION_FULL (120 << 8)          // STA and END are 0 .. 120 of the sample, 8.8
#define SL_LIFE (10 * 48000)            // frames a repeating slice plays on after its trig
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

// Three sound fields, zero for stock's sound and for each engine's defaults. A sound plays one
// engine, so the engines share the bits; choosing another engine sets them back to zero.
//   sample_layer_eng  ENG 2 | a 6 | b 6 | c 6
//   sample_layer_flt  d 7 | e 7
//   sample_layer_gx   f 6
//   TRANSIENT  a PUNCH ^ 32, b DEC ^ 63, c SHF, d BAS, e WID ^ 127
//   GRANULAR    a DEN ^ 36, b SPR, c PIT ^ 32, d POS, e SIZ ^ 69, f SPD ^ 48
//   SLICER      sample_layer_eng's 18: CUT 1 | SNS ^ 70 7 | TUNE ^ 24 6 | THRU 1 | BANK 2 | 1,
//               d STRT, e END ^ 127, f FADE
// A 6-bit knob keeps 64 steps (it moves 2 at a time), a 7-bit one 128.
STORE_FIELD(sample_layer_eng);
STORE_FIELD(sample_layer_flt);
STORE_FIELD(sample_layer_gx);

struct sl_set { unsigned eng, k[KS], g[GS], c[CS]; };

static void decode(struct sl_set *s, unsigned e, unsigned f, unsigned x)
{
    s->eng = e >> 18 & 3;
    if (s->eng >= LIST_ENGINES)                 // an engine this version does not offer
        s->eng = ENG_SAMPLER;
    s->k[K_PUNCH] = (e >> 12 & 63) ^ PUNCH_MID;
    s->k[K_DEC] = (e >> 6 & 63) ^ DEC_INF;
    s->k[K_SHF] = e & 63;
    s->k[K_BAS] = f >> 7 & 127;
    s->k[K_WID] = (f & 127) ^ 127;
    s->g[G_DEN] = (e >> 12 & 63) ^ DEN_DEF;
    s->g[G_SPR] = e >> 6 & 63;
    s->g[G_PIT] = (e & 63) ^ PIT_MID;
    s->g[G_POS] = f >> 7 & 127;
    s->g[G_SIZ] = (f & 127) ^ SIZ_DEF;
    s->g[G_SPD] = (x & 63) ^ SPD_DEF;
    s->c[C_CUT] = e >> 17 & 1;
    s->c[C_SNS] = (e >> 10 & 127) ^ SNS_DEF;
    s->c[C_TUNE] = (e >> 4 & 63) ^ TUNE_MID;
    s->c[C_THRU] = e >> 3 & 1;
    s->c[C_BANK] = e >> 1 & 3;
    s->c[C_STRT] = f >> 7 & 127;
    s->c[C_END] = (f & 127) ^ 127;
    s->c[C_FADE] = x & 63;
    if (s->c[C_TUNE] > 2 * TUNE_MID)
        s->c[C_TUNE] = 2 * TUNE_MID;
}

static unsigned encode_eng(const struct sl_set *s)
{
    if (s->eng == ENG_SLICER)
        return s->eng << 18 | s->c[C_CUT] << 17 | (s->c[C_SNS] ^ SNS_DEF) << 10
               | (s->c[C_TUNE] ^ TUNE_MID) << 4 | s->c[C_THRU] << 3 | s->c[C_BANK] << 1;
    if (s->eng == ENG_GRANULAR)
        return s->eng << 18 | (s->g[G_DEN] ^ DEN_DEF) << 12 | s->g[G_SPR] << 6
               | (s->g[G_PIT] ^ PIT_MID);
    return s->eng << 18 | (s->k[K_PUNCH] ^ PUNCH_MID) << 12 | (s->k[K_DEC] ^ DEC_INF) << 6
           | s->k[K_SHF];
}

static unsigned encode_flt(const struct sl_set *s)
{
    if (s->eng == ENG_SLICER)
        return s->c[C_STRT] << 7 | (s->c[C_END] ^ 127);
    if (s->eng == ENG_GRANULAR)
        return s->g[G_POS] << 7 | (s->g[G_SIZ] ^ SIZ_DEF);
    return s->k[K_BAS] << 7 | (s->k[K_WID] ^ 127);
}

static unsigned encode_gx(const struct sl_set *s)
{
    if (s->eng == ENG_SLICER)
        return s->c[C_FADE];
    return s->eng == ENG_GRANULAR ? s->g[G_SPD] ^ SPD_DEF : 0;
}

// The engine's defaults: every field zero.
static void defaults(struct sl_set *s, unsigned eng)
{
    decode(s, eng << 18, 0, 0);
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
    uint8_t on;                 // the track's engine is TRANSIENT and something is set
    uint8_t hp_on, lp_on, dec;
    uint8_t eng;                // the track's engine
    uint8_t g_pos;              // GRANULAR: POS, 0..127 of the sample
    uint16_t g_spray;           // the most a grain's start strays, frames
    uint32_t g_size, g_phinc;   // a grain's frames, and its window's step a frame (Q16 of 256)
    uint32_t g_interval;        // frames between grains
    uint32_t g_ratio;           // a grain's speed, Q16, before the sample's own rate
    int32_t g_speed;            // the position's speed, Q16 frames a frame
    int32_t g_norm;             // the cloud's level, 1 / sqrt(grains at once), Q31
    uint8_t s_auto;             // SLICER: AUTO (else GRID)
    uint8_t s_div;              // GRID's slices
    uint8_t s_sns;              // AUTO's sensitivity
    uint8_t s_tune, s_thru, s_strt, s_end, s_bank;
    uint32_t s_fade;            // a slice's fades, frames
};

static struct sl_coef sl_c[TRACKS];
static unsigned sl_raw[TRACKS][3];
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
volatile uint8_t sample_layer_trig;     // a bit a voice: an AMP attack this block (sample-layer.s)

// the engine list
static uint8_t list_open, list_cursor, list_track, list_redraw, swallow_key;
static int list_counts;
static uint8_t page_seen;       // TRANSIENT's values were drawn in this compose
static uint8_t page_live;       // and in the last one: the band may be drawn
static uint8_t page_any;        // an engine's page was drawn in this compose
static uint8_t page_any_live;   // and in the last one: an engine's page is on screen
static uint8_t wave_seen;       // GRANULAR's page was asked as the waveform page this compose
static uint8_t wave_live;       // and in the last one: draw the grains over the waveform
static uint8_t gran_seen;       // GRANULAR's values were drawn in this compose
static uint8_t wave_page;       // the SMPL page GRANULAR was last asked for is the waveform
static uint32_t load_peak;      // the audio block's highest load since the tick took it
static uint32_t load_shown;     // the highest over the last second, for the waveform page
static uint8_t load_ticks;
static uint8_t wave_hold;       // composes left to draw the grains without a new sign of the page

static const char *const ENGINE_NAME[ENGINES] = { "SAMPLER", "TRANSIENT", "GRANULAR", "SLICER" };

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

static uint32_t isqrt(uint32_t v)
{
    uint32_t r = 0, b = 1u << 30;

    while (b > v)
        b >>= 2;
    while (b) {
        if (v >= r + b) {
            v -= r + b;
            r = (r >> 1) + b;
        } else
            r >>= 1;
        b >>= 2;
    }
    return r;
}

// GRANULAR's coefficients: a grain's frames and its window's step, the frames between grains,
// the spray, the pitch, the position's speed, and the level, 1 / sqrt of the grains that sound
// at once (at most GRAINS).
static void coef_granular(struct sl_coef *n, const struct sl_set *s)
{
    uint32_t size = GR_SIZE[s->g[G_SIZ]], interval = GR_INTERVAL[s->g[G_DEN]], ov, r;
    int pit = (int)s->g[G_PIT] - PIT_MID;

    if (pit < -24)
        pit = -24;
    if (pit > 24)
        pit = 24;
    n->g_pos = (uint8_t)s->g[G_POS];
    n->g_size = size;
    n->g_phinc = (256u << 16) / size;
    n->g_interval = interval;
    n->g_spray = GR_SPRAY[s->g[G_SPR]];
    n->g_ratio = GR_RATIO[pit + 24];
    n->g_speed = ((int32_t)s->g[G_SPD] - 32) * 4096;
    ov = (size << 8) / interval;                        // grains at once, Q8
    if (ov > GRAINS << 8)
        ov = GRAINS << 8;
    if (ov < 256)
        ov = 256;
    r = isqrt(ov);                                      // 16 .. 39
    n->g_norm = (int32_t)((0x7fffffffu / r) * 16 > 0x7fffffffu ? 0x7fffffffu : (0x7fffffffu / r) * 16);
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
    coef_granular(&n, s);
    n.s_auto = (uint8_t)s->c[C_CUT];
    n.s_div = (uint8_t)(2u << (s->c[C_SNS] / 22));
    n.s_sns = (uint8_t)s->c[C_SNS];
    n.s_tune = (uint8_t)s->c[C_TUNE];
    n.s_thru = (uint8_t)s->c[C_THRU];
    n.s_strt = (uint8_t)s->c[C_STRT];
    n.s_end = (uint8_t)s->c[C_END];
    n.s_bank = (uint8_t)s->c[C_BANK];
    n.s_fade = 48 + s->c[C_FADE] * s->c[C_FADE] * 18 / 5;  // 1 ms .. 300 ms
    // The audio interrupt reads the entry between any two of these stores: off first and on
    // last, so it never runs on half the new coefficients (a voice off clears its state).
    c->on = 0;
    c->eng = ENG_SAMPLER;
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
    c->g_pos = n.g_pos;
    c->g_size = n.g_size;
    c->g_phinc = n.g_phinc;
    c->g_interval = n.g_interval;
    c->g_spray = n.g_spray;
    c->g_ratio = n.g_ratio;
    c->g_speed = n.g_speed;
    c->g_norm = n.g_norm;
    c->s_auto = n.s_auto;
    c->s_div = n.s_div;
    c->s_sns = n.s_sns;
    c->s_tune = n.s_tune;
    c->s_thru = n.s_thru;
    c->s_strt = n.s_strt;
    c->s_end = n.s_end;
    c->s_bank = n.s_bank;
    c->s_fade = n.s_fade;
    c->on = n.on;
    c->eng = (uint8_t)s->eng;
}

static int read_raw(int t, unsigned raw[3])
{
    void *s = t >= 0 && t < TRACKS ? live_sound(accessor(t)) : 0;

    raw[0] = s ? core_store_get(STORE(sample_layer_eng), s, 0) : 0;
    raw[1] = s ? core_store_get(STORE(sample_layer_flt), s, 0) : 0;
    raw[2] = s ? core_store_get(STORE(sample_layer_gx), s, 0) : 0;
    return s != 0;
}

static void read_set(int t, struct sl_set *s)
{
    unsigned raw[3];

    read_raw(t, raw);
    decode(s, raw[0], raw[1], raw[2]);
}

static void refresh(int t)
{
    unsigned raw[3];
    struct sl_set s;

    read_raw(t, raw);
    if (!sl_known[t] || raw[0] != sl_raw[t][0] || raw[1] != sl_raw[t][1] || raw[2] != sl_raw[t][2]) {
        sl_raw[t][0] = raw[0];
        sl_raw[t][1] = raw[1];
        sl_raw[t][2] = raw[2];
        sl_known[t] = 1;
        decode(&s, raw[0], raw[1], raw[2]);
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
    core_store_set(STORE(sample_layer_gx), s, 0, encode_gx(set));
    notify(acc);
    refresh(t);
}

static unsigned engine(void);

// The SAMPLE view (SMPL's pages) in stock's view stack, or 0: the stack is a list from the top
// view's node (+24 of the manager) back to its sentinel (+20), each node's view at +8.
static char *sample_view(void)
{
    char *brain = *(char *volatile *)BRAIN_AT, *views, *node, *view;
    int n;

    views = brain ? *(char **)(brain + 32) : 0;
    if (!views)
        return 0;
    node = *(char **)(views + 24);
    for (n = 0; node && node != views + 20 && n < 32; n++) {
        view = *(char **)(node + 8);
        if (view && *(char **)view == (char *)VT_SAMPLE_AT)
            return view;
        node = *(char **)(node + 4);
    }
    return 0;
}

// TRANSIENT has one page: when the selected track plays it, the SAMPLE view goes back from
// the waveform (its second page) to the first, whichever way it got there (the engine list,
// another track). The view holds its pages' ids at +124 (begin, end) and the page shown at +140;
// a view that lists other than stock's two pages (another module's) is left alone.
static void transients_first_page(void)
{
    char *view;
    int *pages;

    if (selected_track() >= TRACKS || engine() != ENG_TRANSIENTS || !(view = sample_view()))
        return;
    pages = *(int **)(view + 124);
    if (*(int **)(view + 128) != pages + 2 || pages[0] != PAGE_SAMPLE || pages[1] != PAGE_WAVE)
        return;
    if (*(int *)(view + 140) != 1)
        return;
    *(int *)(view + 140) = 0;
    ((void (*)(void *))VIEW_INVALIDATE_AT)(view);
}

// ---- SLICER's slices ----

static void slicer_labels(int set);
static unsigned slc_view;               // SLICER's waveform page: the slice SLC shows,
static unsigned zoom_v, view_v = 64, hgt_v; // ZOOM 1x << zoom_v, POS of the view, HGT 1x << hgt_v

// AUTO's onsets in a track's sample, found in the UI task a few thousand frames a tick: the mean
// level of each 256-frame window against a follower of it that rises slowly and falls fast, so
// a hit's decay sets the level the next hit is measured from. SNS sets the jump and the floor.
struct det {
    const volatile int16_t *data;
    uint32_t frames, pos, last;
    int32_t slow, prev;
    uint8_t sns, done;
    volatile uint8_t n;                 // onsets found, pt[0 .. n-1], rising
    uint32_t pt[SLICES];
};
static struct det sl_det[TRACKS];
static uint8_t det_next;

static int track_slot(int t, const volatile int16_t **data, uint32_t *frames, uint32_t *rate)
{
    int slot = EFF(t, IDX_SMP) >> 8;

    if (slot < 1 || slot > SLOT_LAST)
        return 0;
    *data = SLOT_DATA(slot);
    *frames = SLOT_FRAMES(slot);
    if (rate)
        *rate = SLOT_RATE(slot);
    return *data && *frames >= 1024;
}

// One track's search, a step: 64 windows, 16384 frames. 1 when it did work.
static int detect(int t)
{
    struct det *d = &sl_det[t];
    const struct sl_coef *c = &sl_c[t];
    const volatile int16_t *data;
    uint32_t frames, thr, floor;
    int w, i;

    if (c->eng != ENG_SLICER || !c->s_auto || !track_slot(t, &data, &frames, 0)) {
        d->n = 0;
        d->data = 0;
        return 0;
    }
    if (data != d->data || frames != d->frames || c->s_sns != d->sns) {
        d->n = 0;
        d->data = data;
        d->frames = frames;
        d->sns = c->s_sns;
        d->pos = d->last = 0;
        d->slow = d->prev = 0;
        d->done = 0;
    }
    if (d->done)
        return 0;
    thr = 1024 - d->sns * 704u / 127;               // the jump, Q8: 4 .. 1.25 times the follower
    floor = 400 - d->sns * 3u;                      // the least mean level of a hit
    for (w = 0; w < 64 && d->pos + 256 <= frames; w++, d->pos += 256) {
        int32_t e = 0;

        for (i = 0; i < 256; i += 2) {
            int32_t x = data[d->pos + i];

            e += x < 0 ? -x : x;
        }
        e >>= 7;
        if (e > (int32_t)floor && (uint32_t)e * 256 > (uint32_t)d->slow * thr && e > d->prev
            && (d->n == 0 || d->pos - d->last >= 2400) && d->n < SLICES) {
            d->pt[d->n] = d->pos;
            d->n = (uint8_t)(d->n + 1);
            d->last = d->pos;
        }
        d->slow += e < d->slow ? (e - d->slow) / 2 : (e - d->slow) / 8;  // falls fast, rises slow
        d->prev = e;
    }
    if (d->pos + 256 > frames)
        d->done = 1;
    return 1;
}

// A share of the sample: v of 120 (8.8) of frames.
static uint32_t region_at(uint32_t frames, int v)
{
    if (v < 0)
        v = 0;
    if (v > REGION_FULL)
        v = REGION_FULL;
    return frames / REGION_FULL * (uint32_t)v + frames % REGION_FULL * (uint32_t)v / REGION_FULL;
}

// The track's slices in its sample now: the region STRT to END of stock's STA to END after locks
// (the whole sample when they are too close), its n + 1 edges, n returned. GRID cuts DIV equal slices; AUTO cuts at the
// onsets found so far, one slice until the first.
static unsigned slice_edges(int t, const struct sl_coef *c, uint32_t frames, uint32_t *edge)
{
    int sta = EFF(t, IDX_STA), end = EFF(t, IDX_END);
    uint32_t r0, r1, len, i, n;

    if (end < sta) {
        int x = sta;

        sta = end;
        end = x;
    }
    r0 = region_at(frames, sta);
    r1 = region_at(frames, end);
    if (r1 > frames)
        r1 = frames;
    if (r1 < r0 + 256) {
        r0 = 0;
        r1 = frames;
    }
    len = r1 - r0;
    r1 = r0 + len / 127 * c->s_end + len % 127 * c->s_end / 127;
    r0 += len / 128 * c->s_strt + len % 128 * c->s_strt / 128;
    if (r1 < r0 + 256)
        r1 = r0 + 256 <= frames ? r0 + 256 : frames;
    len = r1 - r0;
    if (!c->s_auto) {
        n = c->s_div;
        for (i = 0; i <= n; i++)
            edge[i] = r0 + len / n * i + len % n * i / n;
        return n;
    }
    n = 0;
    edge[n++] = r0;
    {
        const struct det *d = &sl_det[t];
        unsigned k, m = d->data ? d->n : 0;

        for (k = 0; k < m && n < SLICES; k++)
            if (d->pt[k] > edge[n - 1] + 480 && d->pt[k] + 480 < r1)
                edge[n++] = d->pt[k];
    }
    edge[n] = r1;
    return n;
}

static unsigned slice_count(int t)
{
    const volatile int16_t *data;
    uint32_t frames, edge[SLICES + 1];

    if (t < 0 || t >= TRACKS || !track_slot(t, &data, &frames, 0))
        return 1;
    return slice_edges(t, &sl_c[t], frames, edge);
}

// In the tick: two tracks' AUTO search at most, the names for the selected track, SLC in range.
static void slicer_tick(void)
{
    int k, t = selected_track(), done = 0;
    unsigned n;

    for (k = 0; k < TRACKS && done < 2; k++)
        if (detect((det_next + k) % TRACKS))
            done++;
    det_next = (uint8_t)((det_next + 1) % TRACKS);
    if (t >= 0 && t < TRACKS && sl_c[t].eng == ENG_SLICER) {
        slicer_labels(sl_c[t].s_auto ? 2 : 1);
        n = slice_count(t);
        if (slc_view >= n)
            slc_view = n - 1;
    } else
        slicer_labels(0);
}

// ev_tick, about 20 Hz: every track's settings from its live sound, so a kit or sound load, a
// copy and paste and a reset reach the audio at the next tick.
void sample_layer_tick(void *ctrl)
{
    int t;

    for (t = 0; t < TRACKS; t++)
        refresh(t);
    transients_first_page();
    slicer_tick();
    if (list_open && selected_track() != list_track) {
        list_open = 0;
        list_redraw = 1;
    }
    if (++load_ticks >= 20) {                   // about a second
        load_ticks = 0;
        load_shown = load_peak;
        load_peak = 0;
    }
    if (list_redraw || wave_live) {             // GRANULAR's waveform: its grains move
        list_redraw = 0;
        ((char *)ctrl)[CTRL_REDRAW] = 1;
    }
}

// ---- the engines' pages ----

static unsigned engine(void)
{
    struct sl_set s;

    read_set(selected_track(), &s);
    return s.eng;
}

// A knob of an engine's page: its engine, its index in that engine's values, its top value and
// the 8.8 turn a step takes. The hidden ids 447..456 are TRANSIENT's and GRANULAR's, and
// SLICER's while the selected track plays it.
struct knob_def { uint8_t eng, i, top; uint16_t unit; };
static const struct knob_def KNOBS_DEF[] = {
    { ENG_TRANSIENTS, K_PUNCH, 63, 512 }, { ENG_TRANSIENTS, K_DEC, 63, 512 },
    { ENG_TRANSIENTS, K_BAS, 127, 256 }, { ENG_TRANSIENTS, K_WID, 127, 256 },
    { ENG_TRANSIENTS, K_SHF, 63, 512 },
    { ENG_GRANULAR, G_POS, 127, 256 }, { ENG_GRANULAR, G_SIZ, 127, 256 },
    { ENG_GRANULAR, G_DEN, 63, 512 }, { ENG_GRANULAR, G_SPR, 63, 512 },
    { ENG_GRANULAR, G_PIT, 63, 512 }, { ENG_SAMPLER, 0, 0, 0 },
    { ENG_GRANULAR, G_SPD, 63, 512 },
};
static const struct knob_def SLICER_DEF[] = {
    { ENG_SLICER, C_CUT, 1, 512 }, { ENG_SLICER, C_SNS, 127, 256 },
    { ENG_SLICER, C_TUNE, 2 * TUNE_MID, 512 }, { ENG_SLICER, C_THRU, 1, 512 },
    { ENG_SLICER, C_FADE, 63, 512 }, { ENG_SLICER, C_ZOOM, 6, 1024 },
    { ENG_SLICER, C_SLC, SLICES - 1, 256 }, { ENG_SLICER, C_STRT, 127, 256 },
    { ENG_SLICER, C_END, 127, 256 }, { ENG_SLICER, C_VIEW, 127, 256 },
    { ENG_SAMPLER, 0, 0, 0 }, { ENG_SLICER, C_HGT, 3, 1024 },
};
static unsigned slice_count(int t);

static const struct knob_def *knob(int32_t id)
{
    const struct knob_def *k;

    if (id < ID_PUNCH || id > ID_SPD)
        return 0;
    if (engine() == ENG_SLICER) {
        k = &SLICER_DEF[id - ID_PUNCH];
        return k->eng == ENG_SAMPLER ? 0 : k;
    }
    k = &KNOBS_DEF[id - ID_PUNCH];
    return k->eng == ENG_SAMPLER ? 0 : k;
}

static unsigned *value(struct sl_set *s, const struct knob_def *k)
{
    if (k->eng == ENG_SLICER)
        return k->i == C_SLC ? &slc_view : k->i == C_ZOOM ? &zoom_v : k->i == C_VIEW ? &view_v
             : k->i == C_HGT ? &hgt_v : &s->c[k->i];
    return k->eng == ENG_GRANULAR ? &s->g[k->i] : &s->k[k->i];
}

// get(id, *value): the dial, 8.8 on 0..127.
static int get(int32_t id, int32_t *value_out)
{
    const struct knob_def *k = knob(id);
    struct sl_set s;
    unsigned v;

    if (!k)
        return 0;
    read_set(selected_track(), &s);
    v = *value(&s, k);
    if (k->eng == ENG_SLICER && k->i == C_SNS && !s.c[C_CUT]) {
        *value_out = (int32_t)(v / 22 * 127 / 5) << 8;      // DIV: six steps
        return 1;
    }
    *value_out = (int32_t)(v * 127 / k->top) << 8;
    return 1;
}

static int32_t sl_acc_k[ID_SPD - ID_PUNCH + 1];    // the turns' fractions, by knob

// delta(view, id, delta, func): whole steps of the 8.8 turn, the fraction carried, clamped,
// written to the selected track's sound. Taking the turn means stock makes no lock.
static int delta(void *view, int32_t id, int32_t d, int32_t func)
{
    const struct knob_def *k = knob(id);
    int t, steps, v, lo = 0, top, a;
    struct sl_set s;

    (void)view;
    (void)func;
    if (!k)
        return 0;
    t = selected_track();
    if (t >= TRACKS)
        return 1;
    a = id - ID_PUNCH;
    read_set(t, &s);
    if (k->eng == ENG_SLICER && k->i == C_SNS && !s.c[C_CUT]) {     // DIV: 2, 4 .. 64
        sl_acc_k[a] += d;
        steps = sl_acc_k[a] / 1024;
        sl_acc_k[a] -= steps * 1024;
        v = (int)s.c[C_SNS] / 22 + steps;
        v = v < 0 ? 0 : v > 5 ? 5 : v;
        s.c[C_SNS] = (unsigned)(v * 22 + 11);
        if (steps)
            write_set(t, &s);
        return 1;
    }
    sl_acc_k[a] += d;
    steps = sl_acc_k[a] / k->unit;
    sl_acc_k[a] -= steps * k->unit;
    if (!steps)
        return 1;
    top = k->top;
    if (k->eng == ENG_GRANULAR && k->i == G_PIT) {
        lo = PIT_MID - 24;
        top = PIT_MID + 24;
    }
    if (k->eng == ENG_SLICER && k->i == C_SLC)
        top = (int)slice_count(t) - 1;
    v = (int)*value(&s, k) + steps;
    if (v < lo)
        v = lo;
    if (v > top)
        v = top;
    *value(&s, k) = (unsigned)v;
    if (k->eng == ENG_SLICER && k->i >= C_SLC)
        return 1;                       // only the waveform page's view: nothing to save
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
    char tmp[6];
    int n = 0;

    do
        tmp[n++] = (char)('0' + v % 10);
    while ((v /= 10) && n < 5);
    while (n)
        *b++ = tmp[--n];
    *b = 0;
}

static void put_signed(char *b, int v)
{
    if (v > 0)
        *b++ = '+';
    else if (v < 0)
        *b++ = '-';
    put_u(b, (unsigned)(v < 0 ? -v : v));
}

static int text(struct core_text *t)
{
    const struct knob_def *k = knob(t->id);
    struct sl_set s;
    int v;

    if (!k)
        return CORE_TEXT_PASS;
    page_any = 1;
    read_set(selected_track(), &s);
    v = (int)*value(&s, k);
    if (k->eng == ENG_SLICER) {
        gran_seen = 1;                  // an engine with a waveform page of its own
        switch (k->i) {
        case C_CUT:
            put(t->buf, v ? "AUTO" : "GRID");
            return CORE_TEXT_DONE;
        case C_SNS:                     // AUTO's sensitivity, GRID's slices
            put_u(t->buf, s.c[C_CUT] ? (unsigned)v : 2u << (v / 22));
            return CORE_TEXT_DONE;
        case C_TUNE:                    // semitones
            put_signed(t->buf, v - TUNE_MID);
            return CORE_TEXT_DONE;
        case C_THRU:
            put(t->buf, v ? "ON" : "OFF");
            return CORE_TEXT_DONE;
        case C_FADE:                    // milliseconds
            put_u(t->buf, (48u + (unsigned)(v * v) * 18 / 5 + 24) / 48);
            return CORE_TEXT_DONE;
        case C_SLC:                     // 1 .. the slices
            put_u(t->buf, (unsigned)v + 1);
            return CORE_TEXT_DONE;
        case C_STRT:                    // percent of the sample
            put_u(t->buf, (unsigned)v * 100 / 128);
            return CORE_TEXT_DONE;
        case C_END:
            put_u(t->buf, (unsigned)v * 100 / 127);
            return CORE_TEXT_DONE;
        case C_ZOOM:                    // 1x .. 64x across
        case C_HGT:                     // 1x .. 8x up and down
            t->buf[0] = 'x';
            put_u(t->buf + 1, 1u << v);
            return CORE_TEXT_DONE;
        case C_VIEW:                    // percent of the way along
            put_u(t->buf, (unsigned)v * 100 / 127);
            return CORE_TEXT_DONE;
        }
    }
    if (k->eng == ENG_GRANULAR) {
        gran_seen = 1;
        switch (k->i) {
        case G_SIZ:                     // milliseconds
            put_u(t->buf, (GR_SIZE[v] + 24) / 48);
            return CORE_TEXT_DONE;
        case G_DEN:                     // grains a second
            put_u(t->buf, (48000u + GR_INTERVAL[v] / 2) / GR_INTERVAL[v]);
            return CORE_TEXT_DONE;
        case G_SPR:                     // milliseconds
            put_u(t->buf, (GR_SPRAY[v] + 24) / 48);
            return CORE_TEXT_DONE;
        case G_PIT:                     // semitones
            put_signed(t->buf, v - PIT_MID);
            return CORE_TEXT_DONE;
        case G_SPD:                     // percent of the sample's own speed
            put_signed(t->buf, (v - 32) * 100 / 16);
            return CORE_TEXT_DONE;
        }
        put_u(t->buf, (unsigned)v);     // POS
        return CORE_TEXT_DONE;
    }
    page_seen = 1;                      // TRANSIENT's: the band goes over E and F
    switch (k->i) {
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
        put_signed(t->buf, (v - PUNCH_MID) * 2);
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

static const char page_name[] = "TRANSIENT";
static struct core_page transients_page = {
    PAGE_SAMPLE, page_name, { ID_PUNCH, ID_DEC, 0, 0, ID_BAS, ID_WID, ID_SHF, 0 }
};
static const char granular_name[] = "GRANULAR";
static struct core_page granular_page = {
    PAGE_SAMPLE, granular_name, { ID_POS, ID_SIZ, ID_DEN, 0, ID_SPR, ID_PIT, ID_SPD, 0 }
};
static const char slicer_name[] = "SLICER";
static struct core_page slicer_page = {
    PAGE_SAMPLE, slicer_name, { ID_PUNCH, ID_DEC, ID_BAS, 0, 0, ID_WID, ID_SHF, 0 }
};
static const char slicer_edit_name[] = "SLICE EDIT";
static struct core_page slicer_wave_page = {
    PAGE_SAMPLE, slicer_edit_name, { ID_SIZ, ID_DEN, ID_SPR, 0, ID_POS, ID_PIT, ID_SPD, 0 }
};
static uint8_t in_info;

// SMPL's pages while the selected track's engine is TRANSIENT or GRANULAR: both answer that
// engine's page, with stock's SMP and LEV, and BR on TRANSIENT's (knobs D, H and C of stock's
// first page, read from page_info itself, which passes on to stock while in_info is set).
// Stock's pages otherwise.
static const struct core_page *sample_info(int32_t page)
{
    const char *const *e;
    const int32_t *ids;
    unsigned eng;

    if (in_info)
        return 0;
    eng = engine();
    if (eng != ENG_TRANSIENTS && eng != ENG_GRANULAR && eng != ENG_SLICER)
        return 0;
    in_info = 1;
    e = ((page_info_t)PAGE_INFO_AT)(PAGE_SAMPLE);
    in_info = 0;
    if (!e)
        return 0;
    ids = (const int32_t *)(e + 1);
    if (eng == ENG_SLICER) {            // the knobs, and on the waveform the slice editor
        struct core_page *p = page == PAGE_WAVE ? &slicer_wave_page : &slicer_page;

        wave_page = page == PAGE_WAVE;
        if (wave_page)
            wave_seen = 1;
        p->ids[3] = ids[3];             // SMP
        p->ids[7] = ids[7];             // LEV
        return p;
    }
    if (eng == ENG_GRANULAR) {
        wave_page = page == PAGE_WAVE;
        if (wave_page)
            wave_seen = 1;
        granular_page.ids[3] = ids[3];  // SMP
        granular_page.ids[7] = ids[7];  // LEV
        return &granular_page;
    }
    transients_page.ids[2] = ids[2];    // BR
    transients_page.ids[3] = ids[3];    // SMP
    transients_page.ids[7] = ids[7];    // LEV
    return &transients_page;
}

const struct core_page_fn sample_layer_page_fn = { PAGE_SAMPLE, sample_info };
const struct core_page_fn sample_layer_wave_fn = { PAGE_WAVE, sample_info };
const struct core_param sample_layer_params = { ID_PUNCH, ID_SPD, get, delta, text };

// Ids 447..456's names. They are SLICER's while the selected track plays it (slicer_labels,
// at every tick), and TRANSIENT's and GRANULAR's otherwise.
char sample_layer_long_punch[16] = "Punch";
char sample_layer_short_punch[6] = "PCH";
char sample_layer_long_dec[16] = "Sample Decay";
char sample_layer_short_dec[6] = "DEC";
char sample_layer_long_bas[16] = "Band Base";
char sample_layer_short_bas[6] = "BAS";
char sample_layer_long_wid[16] = "Band Width";
char sample_layer_short_wid[6] = "WID";
char sample_layer_long_shf[16] = "Sample Shift";
char sample_layer_short_shf[6] = "SHF";
char sample_layer_long_pos[16] = "Grain Position";
char sample_layer_short_pos[6] = "POS";
char sample_layer_long_siz[16] = "Grain Size";
char sample_layer_short_siz[6] = "SIZ";
char sample_layer_long_den[16] = "Grain Density";
char sample_layer_short_den[6] = "DEN";
char sample_layer_long_spr[16] = "Grain Spray";
char sample_layer_short_spr[6] = "SPR";
char sample_layer_long_pit[16] = "Grain Pitch";
char sample_layer_short_pit[6] = "PIT";
char sample_layer_long_spd[16] = "Grain Speed";
char sample_layer_short_spd[6] = "SPD";
static const char *const LABELS[2][11][2] = {
    {{ "Punch", "PCH" }, { "Sample Decay", "DEC" }, { "Band Base", "BAS" }, { "Band Width", "WID" }, { "Sample Shift", "SHF" }, { "Grain Position", "POS" }, { "Grain Size", "SIZ" }, { "Grain Density", "DEN" }, { "Grain Spray", "SPR" }, { "Grain Pitch", "PIT" }, { "Grain Speed", "SPD" } },
    {{ "Slice Cut", "CUT" }, { "Sensitivity", "SNS" }, { "Slice Tune", "TUNE" }, { "Slice Thru", "THRU" }, { "Slice Fade", "FADE" }, { "Zoom", "ZOOM" }, { "Slice", "SLC" }, { "Region Start", "STRT" }, { "Region End", "END" }, { "View Position", "POS" }, { "Wave Height", "HGT" } },
};
static char *const LABEL_AT[11][2] = {
    { sample_layer_long_punch, sample_layer_short_punch }, { sample_layer_long_dec, sample_layer_short_dec }, { sample_layer_long_bas, sample_layer_short_bas }, { sample_layer_long_wid, sample_layer_short_wid }, { sample_layer_long_shf, sample_layer_short_shf }, { sample_layer_long_pos, sample_layer_short_pos }, { sample_layer_long_siz, sample_layer_short_siz }, { sample_layer_long_den, sample_layer_short_den }, { sample_layer_long_spr, sample_layer_short_spr }, { sample_layer_long_pit, sample_layer_short_pit }, { sample_layer_long_spd, sample_layer_short_spd },
};
static int8_t labels_now = -1;          // the set the names hold: 0 stock's engines, 1 SLICER, 2 its AUTO

static void slicer_labels(int set)
{
    int i;

    if (set == labels_now)
        return;
    labels_now = (int8_t)set;
    for (i = 0; i < 11; i++) {
        put(LABEL_AT[i][0], LABELS[set != 0][i][0]);
        put(LABEL_AT[i][1], LABELS[set != 0][i][1]);
    }
    if (set == 1) {                     // GRID: SNS is the slices
        put(LABEL_AT[1][0], "Slices");
        put(LABEL_AT[1][1], "DIV");
    }
}

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
// alone on TRANSIENT's page is taken, so the page stays: it is that engine's only page.
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
            if (!page_any_live || engine() != ENG_TRANSIENTS)
                return 0;               // GRANULAR keeps the waveform page, SMPL's second press
            swallow_key = KEY_SMPL;
            return 1;
        }
        read_set(t, &s);
        list_open = 1;
        list_track = (uint8_t)t;
        list_cursor = (uint8_t)(s.eng < LIST_ENGINES ? s.eng : 0);
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
            if (key == KEY_DOWN && list_cursor < LIST_ENGINES - 1)
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
                defaults(&s, list_cursor);  // the new engine starts from its own defaults
                write_set(list_track, &s);
            }
        }
        list_close();
        swallow_key = (uint8_t)key;
        return 1;
    case KEY_FUNC:
        return 0;
    case KEY_SMPL:                      // FUNC + SMPL again, or SMPL: closes the list, and only that
        if (down) {
            list_close();
            swallow_key = KEY_SMPL;
        }
        return 1;
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
        if (list_cursor < LIST_ENGINES - 1)
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

// Stock blanks the whole screen while its screen saver is on, and still calls ev_draw: a screen
// with no pixel lit gets nothing of ours either. Every page stock draws lights its header.
static int screen_dark(void)
{
    int i, n = bm_stride * bm_w;

    for (i = 0; i < n; i++)
        if (bm_words[i])
            return 0;
    return 1;
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
#define BAND_Y0 34
#define BAND_Y1 45
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

static void draw_grains(void);
static void draw_slices(void *bmp);

// The list as stock's machine list (FUNC + SRC) draws it: a panel down the right from row 12,
// a line at its left; each engine a group, its icon at the left and its name at x 77, a dotted
// line between groups; the cursor a lit box over the name; the cursor's name in the title bar.
#define LIST_X 54
#define LIST_Y 12
#define GROUP_H 13
#define NAME_X 77

static const uint16_t ENGINE_ICON[ENGINES][9] = {     // 9 x 9, bit 8 the left column
    { 0x004, 0x014, 0x015, 0x055, 0x1ff, 0x055, 0x015, 0x014, 0x004 },   // a waveform
    { 0x100, 0x100, 0x180, 0x140, 0x130, 0x10e, 0x101, 0x100, 0x1ff },   // a hit and its decay
    { 0x111, 0x000, 0x044, 0x000, 0x111, 0x000, 0x044, 0x000, 0x111 },   // grains
    { 0x000, 0x1b6, 0x1b6, 0x1b6, 0x1b6, 0x1b6, 0x1b6, 0x1b6, 0x000 },   // slices
};

// ev_draw: on TRANSIENT's page the band over E and F; the list as a small window over the page
// while it is open: a frame, a title bar and a row an engine, the cursor's row inverted.
void sample_layer_draw(void *bmp, void *ctrl)
{
    int i, top;

    (void)ctrl;
    bm_w = *(int *)((char *)bmp + 4);
    bm_stride = *(int *)((char *)bmp + 12);
    bm_words = *(unsigned **)((char *)bmp + 16);
    if (bm_w < 128 || *(int *)((char *)bmp + 8) < 64) {
        page_seen = page_any = 0;
        return;
    }
    if (screen_dark()) {                // the screen saver: stock drew nothing, so draw nothing
        page_seen = page_any = wave_seen = gran_seen = 0;
        wave_hold = 0;
        return;
    }
    page_live = page_seen;
    page_any_live = page_any;
    page_any = 0;
    // The waveform page: page_info and the values' text need not both come every compose, so
    // either one keeps the grains for a few composes. The window test is skipped there: stock's
    // waveform and its frame hold long horizontal runs of their own.
    if (wave_seen || gran_seen)
        wave_hold = 4;
    else if (wave_hold)
        wave_hold--;
    wave_seen = gran_seen = 0;
    wave_live = wave_hold && wave_page;
    if (wave_live && !list_open && engine() == ENG_SLICER)
        draw_slices(bmp);
    else if (wave_live && !list_open) {
        char b[12] = "CPU ";

        draw_grains();
        // Test builds: the audio block's peak load over the last second, as a share of a block.
        put_u(b + 4, (load_shown * 100 + 128) >> 8);
        for (i = 4; b[i]; i++)
            ;
        b[i] = '%';
        b[i + 1] = 0;
        bm_fill(WAVE_X0 + 1, WAVE_TOP + 1, WAVE_X0 + 33, WAVE_TOP + 8, 0);
        label(bmp, WAVE_X0 + 2, WAVE_TOP + 7, 0, b);
    }
    if (page_seen && !window_open())     // under the list too, as stock's page stays under SRC's
        draw_band();
    page_seen = 0;
    if (list_open) {
        int r, x;

        bm_fill(0, 0, 69, 8, 0);                // the title bar: the cursor's engine
        label(bmp, 2, 6, 0, ENGINE_NAME[list_cursor]);
        bm_flip(0, 0, 69, 8);
        bm_fill(LIST_X, LIST_Y, 127, 63, 0);
        bm_fill(LIST_X, LIST_Y, LIST_X, 63, 1);
        for (i = 0; i < LIST_ENGINES; i++) {
            top = LIST_Y + i * GROUP_H;
            if (i)
                for (x = LIST_X + 4; x <= 121; x += 2)
                    bm_put(x, top - 1, 1);
            for (r = 0; r < 9; r++)
                for (x = 0; x < 9; x++)
                    if (ENGINE_ICON[i][r] >> (8 - x) & 1)
                        bm_put(LIST_X + 6 + x, top + 2 + r, 1);
            label(bmp, NAME_X, top + 7, 0, ENGINE_NAME[i]);
            if (i == list_cursor)
                bm_flip(NAME_X - 2, top + 2, 118, top + 8);
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

// ---- GRANULAR ----

#define WIN_END (256u << 16)

struct grain {
    uint32_t pos, inc;          // the frame it reads, and its step a frame (Q16)
    uint32_t ph, phinc;         // its window's phase, Q16 of 256
    uint16_t frac;              // pos's fraction, Q16
    uint8_t on;
    uint8_t start;              // the frame of this block it starts at (spawned mid-block)
};

static struct grain gr[VOICES][GRAINS];
static int32_t gr_trav[VOICES];         // how far the position has moved since the trig, frames
static uint16_t gr_tfrac[VOICES];       // and its fraction
static int32_t gr_next[VOICES];         // frames to the next grain
static uint32_t gr_age[VOICES];         // frames since the trig
static uint8_t gr_live[VOICES];         // the cloud makes grains
static uint32_t gr_rng[VOICES];
static const volatile int16_t *gr_data[VOICES];
static uint32_t gr_frames[VOICES];
static int32_t gr_lev[VOICES];          // the last block's LEV gain, Q31

static void grains_off(int v)
{
    int i;

    for (i = 0; i < GRAINS; i++)
        gr[v][i].on = 0;
}

static uint32_t rnd(int v)
{
    uint32_t x = gr_rng[v] ? gr_rng[v] : 0x9e3779b9u + (uint32_t)v;

    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    return gr_rng[v] = x;
}

// A new grain at the cloud's position: POS, plus how far SPD has moved it, plus SPR at random.
static void spawn(const struct sl_coef *c, int v, uint32_t frames, uint32_t inc, int start)
{
    struct grain *g = 0;
    int32_t head;
    int i, w, total = 0;

    for (w = 0; w < VOICES; w++)
        for (i = 0; i < GRAINS; i++)
            total += gr[w][i].on;
    if (total >= GRAIN_BUDGET || core_audio_load > LOAD_SPAWN)
        return;                                 // the CPU budget is spent: this one is skipped
    for (i = 0; i < GRAINS; i++)
        if (!gr[v][i].on) {
            g = &gr[v][i];
            break;
        }
    if (!g)
        return;                                 // GRAINS sound already: this one is skipped
    head = (int32_t)((frames >> 7) * c->g_pos + (((frames & 127) * c->g_pos) >> 7)) + gr_trav[v];
    if (c->g_spray)
        head += (int32_t)(rnd(v) % (2u * c->g_spray + 1)) - c->g_spray;
    head %= (int32_t)frames;
    if (head < 0)
        head += (int32_t)frames;
    g->pos = (uint32_t)head;
    g->frac = 0;
    g->inc = inc;
    g->ph = 0;
    g->phinc = c->g_phinc;
    g->start = (uint8_t)start;
    g->on = 1;
}

// Stock's own playback of the sample is not heard (GRANULAR's and SLICER's stream replaces it),
// but it still costs its render and draws its playhead from the start: past its end it stops, so
// after a trig it plays one block. Forward only; a backward sample (END below STA) plays on.
static void park_stock(int v)
{
    uint32_t vf = VFRAMES(v);

    if (vf > 1 && !VDOWN(v) && VPOS(v) < (int32_t)(vf - 1))
        VPOS(v) = (int32_t)(vf - 1);
}

// SLICER, a voice: one slice playing from its trig, read with linear interpolation, faded in and
// out over FADE (each repeat too), and the slice before it faded out over 2 ms under it.
struct slicer_voice {
    const volatile int16_t *data;
    uint32_t frames;
    uint32_t pos, frac, inc;    // the frame read, its fraction and the step a frame (Q16)
    uint32_t s0, s1;            // the part playing: from s0 up to s1, again from s0 on RPT
    uint32_t fade, finv;        // its fades' frames, and 32767 * 256 over them
    uint32_t age;
    uint8_t on, loop;
    uint32_t tpos, tfrac, tinc; // the slice before, fading out
    int32_t tg;
    uint8_t ton;
    int32_t lev;
};
static struct slicer_voice sl_sv[VOICES];
#define TAIL_STEP 341           // 32767 over 96 frames

static int32_t read_at(const int16_t *d, uint32_t frames, uint32_t pos, uint32_t frac)
{
    int32_t a = d[pos], b = d[pos + 1 < frames ? pos + 1 : pos];

    return a + (((b - a) * (int32_t)(frac >> 1)) >> 15);
}

static void slicer(const struct sl_coef *c, int v, int t, int32_t *s, unsigned hit)
{
    struct slicer_voice *sv = &sl_sv[v];
    const volatile int16_t *data;
    const int16_t *d;
    uint32_t frames, rate;
    int32_t l0, l1, lstep;
    int n, lev;

    park_stock(v);
    if (!track_slot(t, &data, &frames, &rate) || rate < 1000) {
        sv->on = sv->ton = 0;
        for (n = 0; n < FRAMES; n++)
            s[n] = 0;
        return;
    }
    if (data != sv->data || frames != sv->frames) {
        sv->on = sv->ton = 0;                   // another sample: what played reads it no more
        sv->data = data;
        sv->frames = frames;
    }
    d = (const int16_t *)data;
    if (hit) {
        static uint32_t edge[SLICES + 1];       // off the audio interrupt's stack
        uint32_t sa, sb, a, b, part;
        const volatile uint8_t *on = (const volatile uint8_t *)NOTE_ON_AT;
        int32_t q;
        int semi, i, cnt = (int)slice_edges(t, c, frames, edge);

        // The note (a CHRO pad's) and TUN (a lock's) in semitones: TUN 0 plays the first slice,
        // each semitone up the next one, down from the last.
        q = ((on[t] & 2) ? *(const volatile int32_t *)(NOTE_AT + t * 4) : 60 << 16) - (60 << 16)
            + (int32_t)((uint32_t)(EFF(t, IDX_TUN) - 0x4000) << 8);
        semi = (q + 0x8000) >> 16;
        i = semi % cnt;
        if (i < 0)
            i += cnt;
        sa = edge[i];
        sb = c->s_thru ? edge[cnt] : edge[i + 1];
        a = sa;
        b = sb;
        if (b > frames)
            b = frames;
        if (b < a + 64)
            b = a + 64 <= frames ? a + 64 : frames;
        if (sv->on) {                           // the slice before fades out under this one
            sv->tpos = sv->pos;
            sv->tfrac = sv->frac;
            sv->tinc = sv->inc;
            sv->tg = 32767;
            sv->ton = 1;
        }
        part = b - a;
        sv->loop = 0;
        sv->s0 = a;
        sv->s1 = a + part;
        sv->pos = a;
        sv->frac = 0;
        sv->fade = c->s_fade < part / 2 ? c->s_fade : part / 2;
        if (sv->fade < 1)
            sv->fade = 1;
        sv->finv = (32767u << 8) / sv->fade;
        // TUNE times the sample's own speed: the note and TUN choose the slice.
        sv->inc = GR_RATIO[c->s_tune <= 2 * TUNE_MID ? c->s_tune : TUNE_MID] * (rate >> 4) / 3000;
        sv->age = 0;
        sv->on = 1;
    }
    lev = EFF(t, IDX_LEV) >> 8;                 // SMPL LEV as it plays (see granular), squared
    if (lev < 0)                                // and 6 dB under full scale: LEV 100 is -10 dB
        lev = 0;
    if (lev > 127)
        lev = 127;
    l1 = lev * lev * 66572;
    l0 = hit ? l1 : sv->lev;
    sv->lev = l1;
    lstep = (l1 - l0) / FRAMES;
    for (n = 0; n < FRAMES; n++) {
        int32_t x = 0;

        if (sv->on) {
            uint32_t rel = sv->pos - sv->s0, rem = sv->s1 - sv->pos, g = 32767, f;

            if (rel < sv->fade)
                g = rel * sv->finv >> 8;
            if (rem < sv->fade && rem * sv->finv >> 8 < g)
                g = rem * sv->finv >> 8;
            x = read_at(d, frames, sv->pos, sv->frac) * (int32_t)g * 2;
            f = sv->frac + (sv->inc & 0xffff);
            sv->pos += (sv->inc >> 16) + (f >> 16);
            sv->frac = f & 0xffff;
            if (sv->pos >= sv->s1) {
                if (sv->loop)
                    sv->pos = sv->s0 + (sv->pos - sv->s1) % (sv->s1 - sv->s0);
                else
                    sv->on = 0;
            }
        }
        if (sv->ton) {
            uint32_t f;

            x = sadd(x, read_at(d, frames, sv->tpos, sv->tfrac) * sv->tg * 2);
            f = sv->tfrac + (sv->tinc & 0xffff);
            sv->tpos += (sv->tinc >> 16) + (f >> 16);
            sv->tfrac = f & 0xffff;
            sv->tg -= TAIL_STEP;
            if (sv->tg <= 0 || sv->tpos + 1 >= frames)
                sv->ton = 0;
        }
        s[n] = qmul(x, l0);
        l0 += lstep;
    }
    sv->age += FRAMES;
    if (sv->loop && sv->age > SL_LIFE)
        sv->on = 0;
}

// The voice's block, in place of stock's sample: the grains of the sample the track plays now
// (its SMP after locks and scenes), from its slot in memory, each read at PIT's speed through
// a Hann window, summed, at 1 / sqrt of the grains at once. A trig starts the cloud again; it
// stops making grains GR_LIFE after the last trig, and AMP shapes it all the while.
static void granular(const struct sl_coef *c, int v, int t, int32_t *s, unsigned hit)
{
    const volatile int16_t *data = 0;
    uint32_t frames = 0, rate = 0, inc;
    int slot = EFF(t, IDX_SMP) >> 8, n, i, any = 0, lev;
    int32_t q, tv, l0, l1, lstep, acc[FRAMES];
    const int16_t *d;

    park_stock(v);
    if (slot >= 1 && slot <= SLOT_LAST) {
        data = SLOT_DATA(slot);
        frames = SLOT_FRAMES(slot);
        rate = SLOT_RATE(slot);
    }
    if (!data || frames < 64 || rate < 1000) {
        grains_off(v);
        gr_live[v] = 0;
        for (n = 0; n < FRAMES; n++)
            s[n] = 0;
        return;
    }
    if (data != gr_data[v] || frames != gr_frames[v]) {
        grains_off(v);                          // another sample: the old grains read it no more
        gr_data[v] = data;
        gr_frames[v] = frames;
    }
    if (hit) {
        gr_live[v] = 1;
        gr_age[v] = 0;
        gr_trav[v] = 0;
        gr_tfrac[v] = 0;
        gr_next[v] = 0;
    }
    for (i = 0; i < GRAINS; i++)
        any |= gr[v][i].on;
    if (!gr_live[v] && !any) {
        for (n = 0; n < FRAMES; n++)
            s[n] = 0;
        return;
    }
    d = (const int16_t *)data;
    inc = (c->g_ratio * (rate >> 4)) / 3000;    // PIT times the sample's rate over 48 kHz, Q16
    // SMPL LEV as it plays (a lock, a scene), which stock applies in its own sample render: the
    // grains replace that render, so they take it here, ramped across the block.
    lev = EFF(t, IDX_LEV) >> 8;
    if (lev < 0)
        lev = 0;
    if (lev > 127)
        lev = 127;
    l1 = lev * 16909320;                        // Q31 of lev / 127
    l0 = hit ? l1 : gr_lev[v];
    gr_lev[v] = l1;
    lstep = (l1 - l0) / FRAMES;
    // The grains due this block start at their own frame; then each grain runs through the
    // block in one go, its state in registers, summed into acc (Q27).
    for (n = 0; n < FRAMES; n++) {
        acc[n] = 0;
        if (gr_live[v] && --gr_next[v] <= 0) {
            spawn(c, v, frames, inc, n);
            gr_next[v] += (int32_t)c->g_interval;
        }
    }
    for (i = 0; i < GRAINS; i++) {
        struct grain *g = &gr[v][i];
        uint32_t pos, frac, ph, phinc, step, fstep;

        if (!g->on)
            continue;
        pos = g->pos;
        frac = g->frac;
        ph = g->ph;
        phinc = g->phinc;
        step = g->inc >> 16;
        fstep = g->inc & 0xffff;
        for (n = g->start; n < FRAMES; n++) {
            int32_t a = d[pos], b = d[pos + 1 < frames ? pos + 1 : 0];

            acc[n] += ((a + (((b - a) * (int32_t)(frac >> 1)) >> 15)) * GR_WIN[ph >> 16]) >> 3;
            frac += fstep;
            pos += step + (frac >> 16);
            frac &= 0xffff;
            while (pos >= frames)
                pos -= frames;
            ph += phinc;
            if (ph >= WIN_END) {
                g->on = 0;
                break;
            }
        }
        g->pos = pos;
        g->frac = (uint16_t)frac;
        g->ph = ph;
        g->start = 0;
    }
    for (n = 0; n < FRAMES; n++) {
        s[n] = qmul(sshl(qmul(acc[n], c->g_norm), 4), l0);
        l0 += lstep;
    }
    q = c->g_speed * FRAMES + gr_tfrac[v];      // the position moves at SPD
    tv = gr_trav[v] + (q >> 16);
    gr_tfrac[v] = (uint16_t)(q & 0xffff);
    while (tv < 0)
        tv += (int32_t)frames;
    while (tv >= (int32_t)frames)
        tv -= (int32_t)frames;
    gr_trav[v] = tv;
    gr_age[v] += FRAMES;
    if (gr_age[v] > GR_LIFE)
        gr_live[v] = 0;
}

// GRANULAR's waveform page (SMPL's second press): each grain of the selected track's voices as
// a line at its place in the sample, as tall as its window is loud, and the cloud's position as a
// dotted line, over stock's waveform (x 2 .. 124, rows 16 .. 47 from the top, the whole sample).
// XORed, so the waveform shows through.

static int wave_x(uint32_t pos, uint32_t frames)
{
    return WAVE_X0 + (int)((pos >> 4) * WAVE_W / ((frames >> 4) + 1));
}

static void draw_grains(void)
{
    const volatile uint8_t *map = (const volatile uint8_t *)VOICE_TRACK_AT;
    int t = selected_track(), v, i, y, mid = (WAVE_TOP + WAVE_BOT) / 2;

    if (t < 0 || t >= TRACKS || sl_c[t].eng != ENG_GRANULAR)
        return;
    i = WAVE_X0 + sl_c[t].g_pos * (WAVE_W - 1) / 127;    // POS, playing or not
    bm_flip(i, WAVE_TOP, i, WAVE_BOT);
    for (v = 0; v < VOICES; v++) {
        uint32_t frames = gr_frames[v], head;

        if (map[v] != t || frames < 64)
            continue;
        head = (frames >> 7) * sl_c[t].g_pos + (((frames & 127) * sl_c[t].g_pos) >> 7) + (uint32_t)gr_trav[v];
        while (head >= frames)
            head -= frames;
        if (gr_live[v])
            for (y = WAVE_TOP; y <= WAVE_BOT; y += 3)
                bm_flip(wave_x(head, frames), y, wave_x(head, frames), y);
        for (i = 0; i < GRAINS; i++) {
            const struct grain *g = &gr[v][i];
            int x, hh;

            if (!g->on || g->pos >= frames)
                continue;
            x = wave_x(g->pos, frames);
            hh = GR_WIN[(g->ph >> 16) & 255] * ((WAVE_BOT - WAVE_TOP) / 2) / 32767;
            bm_flip(x, mid - hh, x, mid + hh);
        }
    }
}

// A letter in a small box, as stock marks STA and END: its left column x, its top row y.
static void boxed(void *bmp, int x, int y, const char *c)
{
    bm_fill(x, y, x + 7, y + 9, 1);
    bm_fill(x + 1, y + 1, x + 6, y + 8, 0);
    label(bmp, x + 2, y + 8, 0, c);
}

// SLICER's waveform page (SLICE EDIT), drawn in place of stock's waveform, rows 16 .. 45:
//   16 .. 19  a handle at every cut, a small block; the slice SLC's span lit between its two
//   20 .. 38  the sample, smaller than stock's so the cuts read: its peaks, HGT times taller,
//             a dotted line the height at every cut, a solid one where a voice plays
//   36 .. 45  the region STRT to END, a boxed S at its start and a boxed E at its end
// ZOOM shows 1/2^ZOOM of the sample, from POS of the way along; turning SLC moves POS so the
// slice stays in view.
#define VW_TOP 16
#define VW_BOT 45
#define VW_MID 29
#define VW_HALF 9

static uint32_t vw_start, vw_len;               // the frames the view shows
static const volatile int16_t *pk_data;         // the peaks below are for this
static uint32_t pk_start, pk_len;
static unsigned pk_hgt;
static int8_t pk_lo[WAVE_W], pk_hi[WAVE_W];

// A frame's column, or -1 off the view.
static int vw_x(uint32_t pos)
{
    uint32_t d;

    if (pos < vw_start)
        return -1;
    d = pos - vw_start;
    if (d > vw_len)
        return -1;
    return WAVE_X0 + (int)((d >> 4) * (WAVE_W - 1) / ((vw_len >> 4) + 1));
}

static void peaks(const volatile int16_t *data)
{
    int x, k, lo, hi, v;
    uint32_t a, step;

    if (data == pk_data && vw_start == pk_start && vw_len == pk_len && hgt_v == pk_hgt)
        return;
    pk_data = data;
    pk_start = vw_start;
    pk_len = vw_len;
    pk_hgt = hgt_v;
    for (x = 0; x < WAVE_W; x++) {
        a = vw_start + vw_len / WAVE_W * (uint32_t)x + vw_len % WAVE_W * (uint32_t)x / WAVE_W;
        step = vw_len / WAVE_W / 24 + 1;        // 24 reads a column at most
        lo = hi = 0;
        for (k = 0; k < 24 && a < vw_start + vw_len; k++, a += step) {
            v = data[a];
            lo = v < lo ? v : lo;
            hi = v > hi ? v : hi;
        }
        lo = (lo << hgt_v) * VW_HALF / 32768;
        hi = (hi << hgt_v) * VW_HALF / 32768;
        pk_lo[x] = (int8_t)(lo < -VW_HALF ? -VW_HALF : lo);
        pk_hi[x] = (int8_t)(hi > VW_HALF ? VW_HALF : hi);
    }
}

static void draw_slices(void *bmp)
{
    static unsigned slc_last = ~0u;
    const volatile uint8_t *map = (const volatile uint8_t *)VOICE_TRACK_AT;
    const volatile int16_t *data;
    uint32_t frames, edge[SLICES + 1], room;
    int t = selected_track(), v, x, x1, y;
    unsigned i, n;

    if (t < 0 || t >= TRACKS || sl_c[t].eng != ENG_SLICER || !track_slot(t, &data, &frames, 0))
        return;
    n = slice_edges(t, &sl_c[t], frames, edge);
    i = slc_view < n ? slc_view : n - 1;
    vw_len = frames >> zoom_v;
    if (vw_len < WAVE_W)
        vw_len = WAVE_W;
    room = frames - vw_len;
    if (i != slc_last) {                        // SLC turned: its slice into the middle
        uint32_t mid = edge[i] / 2 + edge[i + 1] / 2, want = mid > vw_len / 2 ? mid - vw_len / 2 : 0;

        slc_last = i;
        if (room)
            view_v = want >= room ? 127 : (unsigned)((want >> 8) * 127 / ((room >> 8) + 1));
    }
    vw_start = room / 127 * view_v + room % 127 * view_v / 127;
    bm_fill(WAVE_X0, VW_TOP, WAVE_X0 + WAVE_W - 1, VW_BOT, 0);
    peaks(data);
    for (x = 0; x < WAVE_W; x++)
        bm_fill(WAVE_X0 + x, VW_MID - pk_hi[x], WAVE_X0 + x, VW_MID - pk_lo[x], 1);
    for (v = 1; v < (int)n; v++) {              // the cuts: a dotted line and a handle
        x = vw_x(edge[v]);
        if (x < 0)
            continue;
        for (y = VW_TOP + 4; y <= VW_BOT - 8; y += 2)
            bm_flip(x, y, x, y);
        bm_fill(x - 1 < WAVE_X0 ? WAVE_X0 : x - 1, VW_TOP, x + 1, VW_TOP + 2, 1);
    }
    x = vw_x(edge[i]);                          // SLC's span, lit along the handles' row
    x1 = vw_x(edge[i + 1]);
    if (x < 0 && edge[i] < vw_start)
        x = WAVE_X0;
    if (x1 < 0 && edge[i + 1] > vw_start)
        x1 = WAVE_X0 + WAVE_W - 1;
    if (x >= 0 && x1 >= x)
        bm_fill(x, VW_TOP + 3, x1, VW_TOP + 3, 1);
    for (v = 0; v < VOICES; v++) {
        if (map[v] != t || !sl_sv[v].on || sl_sv[v].data != data)
            continue;
        x = vw_x(sl_sv[v].pos);
        if (x >= 0)
            bm_fill(x, VW_TOP + 4, x, VW_BOT - 8, 1);
    }
    x = vw_x(edge[0]);                          // the region
    if (x >= 0) {
        for (y = VW_TOP + 4; y <= VW_BOT; y += 2)
            bm_put(x, y, 1);
        boxed(bmp, x + 8 <= WAVE_X0 + WAVE_W - 1 ? x : WAVE_X0 + WAVE_W - 8, VW_BOT - 9, "S");
    }
    x = vw_x(edge[n]);
    if (x >= 0) {
        for (y = VW_TOP + 4; y <= VW_BOT; y += 2)
            bm_put(x, y, 1);
        boxed(bmp, x - 7 >= WAVE_X0 ? x - 7 : WAVE_X0, VW_BOT - 9, "E");
    }
}

// Once a block, before stock's voice mixer (sample-layer.s). A voice whose track's engine is
// SAMPLER, or TRANSIENT with every stage neutral, is left as stock wrote it, bit for bit.
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
    if (core_audio_load > load_peak)            // the last block's load, for the waveform page
        load_peak = core_audio_load;
    for (v = 0; v < VOICES; v++, s += FRAMES) {
        unsigned t = map[v];
        const struct sl_coef *c;
        int32_t e0, e1, g0, g1, g, step, h1, h2, l1, l2, bp, peak = 0;
        int gain, hit = 0, dly;

        if (t >= TRACKS)
            continue;
        c = &sl_c[t];
        if (c->eng == ENG_GRANULAR || c->eng == ENG_SLICER) {
            sl_used[v] = 0;
            sl_pend[v] = -1;
            if (c->eng == ENG_GRANULAR)
                granular(c, v, (int)t, s, trig & (1u << v));
            else
                slicer(c, v, (int)t, s, trig & (1u << v));
            continue;
        }
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
