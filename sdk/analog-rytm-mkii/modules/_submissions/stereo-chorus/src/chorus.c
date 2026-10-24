// SPDX-License-Identifier: GPL-3.0-or-later
// Stereo Chorus for the Analog Rytm MKII: a send effect beside the delay and
// the reverb.
//
// Each sound track has a CHO send (AMP page, AMP pressed again), kept in the
// sound. Every audio block the eight voices, as the codec brings them back
// (the same signal the delay and reverb sends take), are summed by their
// tracks' sends into a mono delay line. Two taps read it, each delayed by TIM
// and swept by its own LFO (SPD, DEP), the right one WID out of phase with
// the left, and FDB feeds their mean back into the line. The stereo result,
// at VOL, is added to the PRE FX return: it reaches the analog mixer with the
// delay and the reverb, before the distortion and the compressor (gate.s).
// The chorus page (FX track, DELAY pressed again) sets TIM SPD DEP WID / FDB
// VOL, kept in the kit.
//
// With every send at 0 (the default) nothing is added: the unit sounds stock.
// Firmware data is reached at fixed addresses given for each OS release by
// build.json's cflags. Timing comes from the audio block alone: the LFO is
// free running, as a stock chorus pedal's is, and keeps no clock of tempo.

#include "analog-rytm-mk2/store.h"

STORE_FIELD(stereo_chorus_send);      // sound, 7 bits: CHO
STORE_FIELD(stereo_chorus_a);         // kit, 28 bits: TIM SPD DEP WID
STORE_FIELD(stereo_chorus_b);         // kit, 14 bits: FDB VOL

typedef unsigned long word_t;
typedef unsigned (*is_key_held_t)(int key);
typedef word_t (*project_singleton_t)(void);
typedef int (*track_index_of_t)(void *selection);
typedef word_t (*kit_track_sound_t)(void *kit, int track);
typedef void (*fillrect_t)(void *bmp, int x0, int y0, int x1, int y1, int colour);
typedef void (*text_draw_t)(void *bmp, void *font, int x, int y, int centred, int a5, const char *width, const char *fmt, ...);
typedef word_t (*text_font_t)(void *ctx);

#define IS_KEY_HELD ((is_key_held_t)IS_KEY_HELD_AT)
#define PROJECT_SINGLETON ((project_singleton_t)PROJECT_SINGLETON_AT)
#define TRACK_INDEX_OF ((track_index_of_t)TRACK_INDEX_OF_AT)
#define KIT_TRACK_SOUND ((kit_track_sound_t)KIT_TRACK_SOUND_AT)
#define FILLRECT ((fillrect_t)FILLRECT_AT)
#define TEXT_DRAW ((text_draw_t)TEXT_DRAW_AT)
#define TEXT_FONT ((text_font_t)TEXT_FONT_AT)
#define TEXT_CTX ((void *)TEXT_CTX_AT)
// The codec's input for this block: 32 frames of 12 words (MAIN L/R, the
// eight voices, AUDIO IN L/R), each voice negated as stock reads it.
#define RX(frame, word) (((volatile int *)RX_BUFFER_AT)[(frame) * 12 + (word)])
// The voice -> receive word table (eight longwords, 0..7, add 2) and the
// voice -> playing track table (eight bytes) stock's FX sends use.
#define VOICE_WORD(v) (((volatile int *)VOICE_WORD_AT)[v])
#define VOICE_TRACK(v) (((volatile unsigned char *)VOICE_TRACK_AT)[v])
// The PRE return words of output slot s: 32 frames, 16 words a frame, the
// left and right words first; 24-bit values in the low bits.
#define PRE(s, frame) ((volatile int *)(TX_RING_AT + 0x30 + ((s) & 3) * 2048 + (frame) * 64))

#define KEY_FUNC 0x80
#define KEY_TRK 0x86
#define KEY_TRIG_LAST 0x0f
#define KEY_PAD_FIRST 0x90
#define KEY_PAD_LAST 0x9b
#define KEY_RECORD 0x50
#define KEY_STOP 0x52
#define KEY_PAGE_DELAY 0x31        // the second parameter key: DELAY on the FX track
#define KEY_PAGE_AMP 0x34          // AMP
#define KEY_PRESSED 1              // ev_key flags: 1 pressed
#define FX_TRACK 12
#define SOUND_TRACKS 12
#define PROJECT_KIT 352            // project + 352: the active kit
#define PROJECT_TRACKSEL 48        // project + 48: the track selection
#define ACC_LIVE_SOUND 0x28        // sound accessor vtable: the live sound
#define ACC_CONFIG_CHANGED 0x10    // sound accessor vtable: the change notice
#define COUNTS 2                   // encoder counts per step
#define SHOW_TICKS 25              // about 1.2 s of the ~20 Hz tick: a turned knob shows its value, a new page its name

#define LEN 4096                   // the delay line, a power of two: 85 ms
#define VOICES 8
#define IDLE_BLOCKS 3000           // 2 s with no send before the line is left silent

enum { P_TIM, P_SPD, P_DEP, P_WID, P_FDB, P_VOL, PARAMS };
static const unsigned char defaults[PARAMS] = { 48, 40, 64, 127, 0, 100 };
static const char *const labels[8] = { "TIM", "SPD", "DEP", "WID", "FDB", "", "", "VOL" };
static const signed char knob_param[8] = { P_TIM, P_SPD, P_DEP, P_WID, P_FDB, -1, -1, P_VOL };

// LFO increments a frame, 0.05 Hz to 5 Hz (exponential), 2^32 a cycle at 48 kHz.
static const unsigned rate[128] = {
    4474, 4639, 4810, 4988, 5172, 5363, 5561, 5767,
    5980, 6200, 6429, 6667, 6913, 7168, 7433, 7707,
    7992, 8287, 8593, 8910, 9240, 9581, 9934, 10301,
    10682, 11076, 11485, 11909, 12349, 12805, 13278, 13768,
    14277, 14804, 15350, 15917, 16505, 17115, 17747, 18402,
    19081, 19786, 20517, 21274, 22060, 22874, 23719, 24595,
    25503, 26445, 27421, 28434, 29484, 30573, 31702, 32872,
    34086, 35345, 36650, 38003, 39407, 40862, 42371, 43935,
    45558, 47240, 48985, 50793, 52669, 54614, 56631, 58722,
    60890, 63139, 65470, 67888, 70395, 72994, 75689, 78484,
    81383, 84388, 87504, 90735, 94086, 97560, 101162, 104898,
    108772, 112788, 116953, 121272, 125750, 130393, 135208, 140201,
    145378, 150747, 156313, 162085, 168071, 174277, 180712, 187385,
    194305, 201480, 208920, 216635, 224634, 232929, 241531, 250449,
    259698, 269287, 279231, 289542, 300234, 311321, 322817, 334738,
    347098, 359915, 373206, 386987, 401277, 416095, 431460, 447392
};

// Written by the idle tick and the handlers, read by the audio block.
static unsigned char par[PARAMS];
static unsigned char send[SOUND_TRACKS];
static int ready;

// The audio block's own state.
static int line[LEN];
static unsigned wpos, phase;
static int g_voice[VOICES];        // the gains reached, Q15
static int g_vol, d_base, d_depth, fbk;   // Q15, Q8 samples, Q8 samples, Q15
static int idle;

// UI state.
static int page;                   // 0 none, 1 CHORUS, 2 CHORUS SEND
static int last_page_key = -1;
static int acc_enc = -1, acc_cnt;
static int shown_knob = -1, show_ticks, title_ticks;

static void *accessor(int track)
{
    char *project = (char *)PROJECT_SINGLETON();
    return (void *)KIT_TRACK_SOUND(project + PROJECT_KIT, track);
}

static void *live_sound(void *acc)
{
    word_t (*get)(void *) = (*(word_t (***)(void *))acc)[ACC_LIVE_SOUND / 4];
    return (void *)get(acc);
}

// The notice stock's sound setters send, without which a sound field is lost
// at a reboot unless the kit is saved (rytm2_mods voice-dac).
static void notify(void *acc)
{
    struct { const void *vtable; unsigned char kind; } info = { (const void *)SOUND_CONFIG_CHANGED_VT, 1 };
    void (*changed)(void *, void *) = (*(void (***)(void *, void *))acc)[ACC_CONFIG_CHANGED / 4];
    changed(acc, &info);
}

static void *live_kit(void) { return (char *)PROJECT_SINGLETON() + PROJECT_KIT; }

// Kit fields hold each value XOR its default, so zero is the default.
static void load_kit(void)
{
    unsigned a = core_store_get(STORE(stereo_chorus_a), live_kit(), 0);
    unsigned b = core_store_get(STORE(stereo_chorus_b), live_kit(), 0);
    par[P_TIM] = (unsigned char)((a >> 21 & 127) ^ defaults[P_TIM]);
    par[P_SPD] = (unsigned char)((a >> 14 & 127) ^ defaults[P_SPD]);
    par[P_DEP] = (unsigned char)((a >> 7 & 127) ^ defaults[P_DEP]);
    par[P_WID] = (unsigned char)((a & 127) ^ defaults[P_WID]);
    par[P_FDB] = (unsigned char)((b >> 7 & 127) ^ defaults[P_FDB]);
    par[P_VOL] = (unsigned char)((b & 127) ^ defaults[P_VOL]);
}

static void save_kit(void)
{
    unsigned a = (unsigned)(par[P_TIM] ^ defaults[P_TIM]) << 21 | (unsigned)(par[P_SPD] ^ defaults[P_SPD]) << 14
                 | (unsigned)(par[P_DEP] ^ defaults[P_DEP]) << 7 | (unsigned)(par[P_WID] ^ defaults[P_WID]);
    unsigned b = (unsigned)(par[P_FDB] ^ defaults[P_FDB]) << 7 | (unsigned)(par[P_VOL] ^ defaults[P_VOL]);
    core_store_set(STORE(stereo_chorus_a), live_kit(), 0, a);
    core_store_set(STORE(stereo_chorus_b), live_kit(), 0, b);
}

// A triangle LFO bent towards a sine: phase -> -32767..32767.
static int lfo(unsigned ph)
{
    int t = (int)(ph >> 15) - 65536;             // -65536..65535: a saw
    int tri = (t < 0 ? -t : t) - 32768;          // -32768..32767
    int a = tri < 0 ? -tri : tri;
    return (tri * (98304 - a)) >> 16;            // tri * (1.5 - |tri|/2) scaled
}

// 4-point Hermite read of the line, d samples behind the newest (Q8).
static int tap(unsigned d)
{
    unsigned i = wpos - 1 - (d >> 8);
    int f = (int)(d & 255);                      // Q8
    int xm1 = line[(i + 1) & (LEN - 1)], x0 = line[i & (LEN - 1)];
    int x1 = line[(i - 1) & (LEN - 1)], x2 = line[(i - 2) & (LEN - 1)];
    int c = (x1 - xm1) >> 1;
    int v = x0 - x1;
    int w = c + v;
    int a = w + v + ((x2 - x0) >> 1);
    int b = w + a;
    // ((a f - b) f + c) f + x0, f in Q8, on values up to about 2^22: no
    // product passes 2^31 (the build links no 64-bit arithmetic)
    int r = ((a * f) >> 8) - b;
    r = ((r * f) >> 8) + c;
    return ((r * f) >> 8) + x0;
}

static int clamp(int v, int lim) { return v > lim ? lim : v < -lim ? -lim : v; }

// The audio block, from the FX returns' hook (gate.s).
void stereo_chorus_block(int slot)
{
    int v, f, any = 0;
    int tgt_voice[VOICES], vstep[VOICES], wordof[VOICES];
    int tgt_vol, tgt_base, tgt_depth, tgt_fbk, svol, sbase, sdepth, sfbk;
    unsigned inc, wid;

    for (v = 0; v < VOICES; v++) {
        int t = VOICE_TRACK(v), s = t < SOUND_TRACKS ? send[t] : 0;
        tgt_voice[v] = s * s * 2;                // Q15, a squared curve as stock's sends
        wordof[v] = 2 + (VOICE_WORD(v) & 7);
        if (s) any = 1;
    }
    if (any) idle = 0;
    else if (idle < IDLE_BLOCKS) idle++;
    if (idle >= IDLE_BLOCKS) {
        if (idle == IDLE_BLOCKS) {               // once: leave a clean line
            for (f = 0; f < LEN; f++) line[f] = 0;
            for (v = 0; v < VOICES; v++) g_voice[v] = 0;
            idle++;
        }
        return;
    }
    tgt_vol = par[P_VOL] * par[P_VOL] * 2;
    tgt_base = (48 + par[P_TIM] * 11) << 8;      // 1 ms .. 30 ms
    tgt_depth = (par[P_DEP] * 2) << 8;           // up to 5.3 ms each way
    if (tgt_depth > tgt_base - (24 << 8)) tgt_depth = tgt_base - (24 << 8);
    if (tgt_depth < 0) tgt_depth = 0;
    tgt_fbk = par[P_FDB] * 220;                  // up to 0.85
    inc = rate[par[P_SPD] & 127];
    wid = (unsigned)par[P_WID] * (0x80000000u / 127);   // 0..180 degrees
    for (v = 0; v < VOICES; v++) vstep[v] = (tgt_voice[v] - g_voice[v]) / 32;
    svol = (tgt_vol - g_vol) / 32;
    sbase = (tgt_base - d_base) / 32;
    sdepth = (tgt_depth - d_depth) / 32;
    sfbk = (tgt_fbk - fbk) / 32;

    for (f = 0; f < 32; f++) {
        int x = 0, l, r, ml, mr;
        volatile int *out = PRE(slot, f);
        for (v = 0; v < VOICES; v++) {
            g_voice[v] += vstep[v];
            if (g_voice[v])
                x += ((RX(f, wordof[v]) >> 16) * g_voice[v]) >> 11;   // 16-bit x Q15 -> about 20 bits
        }
        g_vol += svol; d_base += sbase; d_depth += sdepth; fbk += sfbk;
        phase += inc;
        ml = lfo(phase);
        mr = lfo(phase + wid);
        l = tap((unsigned)(d_base + ((d_depth >> 8) * ml >> 7)));
        r = tap((unsigned)(d_base + ((d_depth >> 8) * mr >> 7)));
        line[wpos & (LEN - 1)] = clamp(x + (((l + r) >> 8) * fbk >> 8), 1 << 22);    // (l+r)/2 x Q15, under 2^31
        wpos++;
        l = ((l >> 7) * g_vol >> 8) << 3;        // x Q15 under 2^31, about 20 bits -> 24
        r = ((r >> 7) * g_vol >> 8) << 3;
        out[0] = clamp(((out[0] << 8) >> 8) + l, 0x7fffff) & 0xffffff;
        out[1] = clamp(((out[1] << 8) >> 8) + r, 0x7fffff) & 0xffffff;
    }
    for (v = 0; v < VOICES; v++) g_voice[v] = tgt_voice[v];
    g_vol = tgt_vol; d_base = tgt_base; d_depth = tgt_depth; fbk = tgt_fbk;
}

static int selected_track(void)
{
    char *project = (char *)PROJECT_SINGLETON();
    return TRACK_INDEX_OF(project + PROJECT_TRACKSEL);
}

// ev_tick, about 20 Hz: copy each sound's send and the kit's values for the
// audio block, close a page whose track went away, and redraw an open page.
void stereo_chorus_tick(char *ctrl)
{
    int track;
    if (!ready)
        return;
    for (track = 0; track < SOUND_TRACKS; track++) {
        void *live = live_sound(accessor(track));
        send[track] = (unsigned char)(live ? core_store_get(STORE(stereo_chorus_send), live, 0) & 127 : 0);
    }
    load_kit();
    if (show_ticks && !--show_ticks) shown_knob = -1;
    if (title_ticks) title_ticks--;
    if (page) {
        int sel = selected_track();
        if ((page == 1) != (sel == FX_TRACK) || sel < 0 || sel > FX_TRACK)
            page = 0;
        ctrl[0x20] = 1;
    }
}

static int is_page_key(int key) { return key >= 0x30 && key <= 0x35; }

// ev_key: DELAY on the FX track or AMP on a sound track, pressed again while
// its page is up, opens the mod's page; pressed once more, it closes it. Any
// other page or menu key closes it and does what it does on stock.
int stereo_chorus_key(void *brain, char *ev)
{
    int key = *(int *)(ev + 12), flags = *(int *)(ev + 16), sel;
    (void)brain;
    if (!ready || !(flags & KEY_PRESSED))
        return 0;
    if (key == KEY_FUNC || key == KEY_TRK || key <= KEY_TRIG_LAST
        || (key >= KEY_PAD_FIRST && key <= KEY_PAD_LAST) || (key >= KEY_RECORD && key <= KEY_STOP))
        return 0;
    sel = selected_track();
    if (is_page_key(key) && !IS_KEY_HELD(KEY_FUNC)) {
        int want = sel == FX_TRACK && key == KEY_PAGE_DELAY ? 1
                   : sel >= 0 && sel < SOUND_TRACKS && key == KEY_PAGE_AMP ? 2 : 0;
        if (want && page == want) {              // the stock page again
            page = 0;
            last_page_key = key;
            return 1;
        }
        if (want && last_page_key == key && !page) {
            page = want;
            acc_enc = -1;
            shown_knob = -1;
            title_ticks = SHOW_TICKS;
            return 1;
        }
        page = 0;
        last_page_key = key;
        return 0;
    }
    page = 0;
    last_page_key = -1;
    return 0;
}

// ev_enc: while a page is up, encoders A-H set its values.
int stereo_chorus_enc(void *brain, char *ev)
{
    int enc = *(int *)(ev + 12), delta = *(int *)(ev + 16), steps, sel;
    (void)brain;
    if (!ready || !page || enc < 0 || enc > 7)
        return 0;
    if (enc != acc_enc) { acc_enc = enc; acc_cnt = 0; }
    acc_cnt += delta;
    steps = acc_cnt / COUNTS;
    acc_cnt -= steps * COUNTS;
    shown_knob = enc;
    show_ticks = SHOW_TICKS;
    if (!steps)
        return 1;
    if (page == 1) {
        int p = knob_param[enc], v;
        if (p < 0)
            return 1;
        v = par[p] + steps;
        par[p] = (unsigned char)(v < 0 ? 0 : v > 127 ? 127 : v);
        save_kit();
    } else if (enc == 0) {
        void *acc;
        void *live;
        int v;
        sel = selected_track();
        if (sel < 0 || sel >= SOUND_TRACKS)
            return 1;
        acc = accessor(sel);
        live = live_sound(acc);
        if (!live)
            return 1;
        v = send[sel] + steps;
        v = v < 0 ? 0 : v > 127 ? 127 : v;
        send[sel] = (unsigned char)v;
        core_store_set(STORE(stereo_chorus_send), live, 0, (unsigned)v);
        notify(acc);
    }
    return 1;
}

// ev_project: a loaded or new project starts with its kit's values and a
// clean line. Until the first one the kit is not built, so nothing runs.
void stereo_chorus_project(int how, unsigned dropped)
{
    (void)how;
    (void)dropped;
    page = 0;
    last_page_key = -1;
    idle = IDLE_BLOCKS;                          // cleared at once, then silent until a send
    ready = 1;
}

static const signed char dial_dx[128] = {
    -5, -5, -5, -5, -5, -5, -6, -6, -6, -6, -6, -6, -6, -6, -6, -6, -6, -7, -7, -7, -7, -7, -7, -7, -7, -7, -6, -6, -6, -6, -6, -6, -6, -6, -6, -6, -6, -5, -5, -5, -5, -5, -5, -5, -4, -4, -4, -4, -4, -3, -3, -3, -3, -3, -2, -2, -2, -2, -1, -1, -1, -1, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 7, 7, 7, 7, 7, 7, 7, 7, 7, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 5, 5, 5, 5, 5, 5
};
static const signed char dial_dy[128] = {
    -5, -4, -4, -4, -4, -4, -4, -3, -3, -3, -3, -2, -2, -2, -2, -1, -1, -1, -1, -1, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 5, 5, 5, 5, 5, 5, 4, 4, 4, 4, 4, 3, 3, 3, 3, 3, 2, 2, 2, 2, 1, 1, 1, 1, 0, 0, 0, 0, -1, -1, -1, -1, -1, -2, -2, -2, -2, -3, -3, -3, -3, -4, -4, -4, -4, -4, -4, -5
};
// The stock dial (rytm-emu captures of OS 1.74's pages): a 15-pixel circle open
// at the bottom, rows from 7 above the centre to 4 below, and a pointer from
// the centre. cx, cy the centre (y counts up from the bottom row).
static const signed char ring_half[12] = { 2, 4, 5, 6, 6, 7, 7, 7, 7, 7, 6, 6 };   // dy +7 .. -4

static void dial(void *bmp, int cx, int cy, int v)
{
    int i, x0 = 0, y0 = 0, x1 = dial_dx[v & 127], y1 = dial_dy[v & 127];
    int ax = x1 < 0 ? -x1 : x1, ay = y1 < 0 ? -y1 : y1, sx = x1 < 0 ? -1 : 1, sy = y1 < 0 ? -1 : 1, err;
    FILLRECT(bmp, cx - 2, cy + 7, cx + 2, cy + 7, 1);
    FILLRECT(bmp, cx - 4, cy + 6, cx - 3, cy + 6, 1);
    FILLRECT(bmp, cx + 3, cy + 6, cx + 4, cy + 6, 1);
    for (i = 2; i < 12; i++) {
        int dy = 7 - i, h = ring_half[i];
        FILLRECT(bmp, cx - h, cy + dy, cx - h, cy + dy, 1);
        FILLRECT(bmp, cx + h, cy + dy, cx + h, cy + dy, 1);
    }
    err = ax - ay;                               // Bresenham from the centre
    for (i = 0; i < 16; i++) {                   // at most 8 steps; the bound guards the UI task
        int e2 = 2 * err;
        FILLRECT(bmp, cx + x0, cy + y0, cx + x0, cy + y0, 1);
        if (x0 == x1 && y0 == y1) break;
        if (e2 > -ay) { err -= ay; x0 += sx; }
        if (e2 < ax) { err += ax; y0 += sy; }
    }
}

static void *font(void) { return (void *)TEXT_FONT(TEXT_CTX); }

// One knob as stock draws it: the dial, and under it the short name, or the
// value while it turns.
static void knob(void *bmp, int k, int cx, int cy, int v, const char *name)
{
    dial(bmp, cx, cy, v);
    if (k == shown_knob)
        TEXT_DRAW(bmp, font(), cx, cy - 13, 1, 0, "XXX", "%d", v);
    else
        TEXT_DRAW(bmp, font(), cx, cy - 13, 1, 0, "XXX", "%s", name);
}

// ev_draw: the open page between stock's top and bottom bars, knobs where
// stock puts them (x = 16 + 32 column, y = 46 and 24), and for a moment the
// page's name over the top bar, as stock shows a page's name.
void stereo_chorus_draw(void *bmp, void *ctrl)
{
    int k, sel;
    (void)ctrl;
    if (!page)
        return;
    FILLRECT(bmp, 0, 10, 127, 53, 0);
    sel = selected_track();
    if (page == 1) {
        for (k = 0; k < 8; k++)
            if (knob_param[k] >= 0)
                knob(bmp, k, 16 + 32 * (k & 3), k < 4 ? 46 : 24, par[knob_param[k]], labels[k]);
    } else if (sel >= 0 && sel < SOUND_TRACKS) {
        knob(bmp, 0, 16, 46, send[sel], "CHO");
    }
    if (title_ticks) {
        FILLRECT(bmp, 0, 55, 70, 63, 0);
        TEXT_DRAW(bmp, font(), 2, 56, 0, 0, "CHORUS SEND", "%s", page == 1 ? "CHORUS" : "CHORUS SEND");
    }
}
