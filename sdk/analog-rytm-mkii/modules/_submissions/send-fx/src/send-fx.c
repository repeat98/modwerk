// SPDX-License-Identifier: GPL-3.0-or-later
// Send FX for the Analog Rytm MKII: a send effect slot beside the delay and
// the reverb, with a choice of effects.
//
// Each sound track has a send (AMP pressed again), kept in the sound. Every
// audio block the eight voices, as the codec brings them back (the signal the
// delay and reverb sends take), are summed by their tracks' sends; the chosen
// effect turns that mono signal into a stereo return, which LEV scales and
// adds to the PRE FX return: it reaches the analog mixer with the delay and
// the reverb, before the distortion and the compressor (gate.s).
//
// The FX page (FX track, DELAY pressed again) shows the effect: FUNC + A
// chooses it, FUNC + E sets LEV, A-H its eight controls. The effect and its
// controls are kept in the kit, LEV in the project.
//
// With every send at 0 (the default) nothing is added: the unit sounds stock.
// Firmware routines and data are reached at fixed addresses given for each OS
// release by build.json's cflags. LFOs are free running, as a pedal's: nothing
// is tied to the tempo.

#include "analog-rytm-mk2/store.h"
#include "fx-tables.h"

STORE_FIELD(send_fx_send);            // sound, 7 bits: the track's send
STORE_FIELD(send_fx_a);               // kit, 32 bits: effect << 28 | controls 1-4
STORE_FIELD(send_fx_b);               // kit, 28 bits: controls 5-8
STORE_FIELD(send_fx_lev);             // project, 7 bits: LEV

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
#define TYPE_COUNTS 8              // encoder counts per effect step
#define SHOW_TICKS 25              // about 1.2 s of the ~20 Hz tick
#define SHOWN_LEV 8                // shown_knob: LEV

#define LEN 4096                   // the delay line, a power of two: 85 ms
#define VOICES 8
#define IDLE_BLOCKS 3000           // 2 s with no send before the effect is left silent
#define LEV_DEFAULT 100
#define MAX_STAGES 8

// ---------------------------------------------------------------- effects

enum { FX_CHORUS, FX_FLANGER, FX_PHASER, FX_TYPES };
enum { IC_EMPTY, IC_DIAL, IC_BIP, IC_DEPTH, IC_WIDTH, IC_FDBK, IC_HPF, IC_LPF, IC_STAGES, IC_TUNE, IC_COMB, IC_SKIP };

struct control { char label[5]; unsigned char icon, def; };
struct effect { const char *name; struct control c[8]; };

// The controls of each effect, A-D on the top row and E-H below. IC_COMB
// spans its column and the next, whose encoder sets the second value.
static const struct effect effects[FX_TYPES] = {
    { "CHORUS", { { "SPD", IC_DIAL, 64 }, { "DEP", IC_DEPTH, 64 }, { "TIME", IC_DIAL, 48 }, { "WDTH", IC_WIDTH, 127 },
                  { "FDBK", IC_FDBK, 0 }, { "HPF", IC_HPF, 0 }, { "LPF", IC_LPF, 127 }, { "", IC_EMPTY, 0 } } },
    { "FLANGER", { { "SPD", IC_BIP, 90 }, { "DEP", IC_DIAL, 64 }, { "TUNE", IC_TUNE, 16 }, { "FDBK", IC_FDBK, 96 },
                   { "LPF", IC_LPF, 127 }, { "", IC_EMPTY, 0 }, { "", IC_EMPTY, 0 }, { "", IC_EMPTY, 0 } } },
    { "PHASER", { { "SPD", IC_DIAL, 50 }, { "DEP", IC_DEPTH, 80 }, { "SHP", IC_DIAL, 0 }, { "LAG", IC_DIAL, 0 },
                  { "FREQ", IC_COMB, 80 }, { "FDBK", IC_SKIP, 96 }, { "STG", IC_STAGES, 50 }, { "WDTH", IC_WIDTH, 64 } } },
};

// Bipolar controls (64 is the centre) are shown -64..+63.
static int bipolar(int type, int k)
{
    return (type == FX_FLANGER && (k == 0 || k == 3)) || (type == FX_PHASER && k == 5);
}

// Written by the idle tick and the handlers, read by the audio block.
static unsigned char fx_type, par[8], lev = LEV_DEFAULT;
static unsigned char send[SOUND_TRACKS];
static int ready;

// The audio block's state.
static int line[LEN];
static unsigned wpos, phase;
static int g_voice[VOICES], g_lev;
static int run_type = -1, idle;
static int s_base, s_depth, s_fbk;               // chorus and flanger: smoothed delay (Q8) and feedback (Q15)
static int lp_l, lp_r, hp_l, hp_r, k_lp, k_hp;   // wet filters
static int ap_x[2][MAX_STAGES], ap_y[2][MAX_STAGES], ap_a[2], ph_lag[2], ph_last[2];

// UI state.
static int page;                   // 0 none, 1 FX, 2 SEND
static int last_page_key = -1;
static int acc_enc = -1, acc_cnt, acc_func;
static int shown_knob = -1, show_ticks, title_ticks;

// The effects run on 16-bit signals (about +-2^15, held within +-2^16), so a
// gain or a coefficient in Q15 takes one multiply that stays within 2^31: the
// build links no 64-bit arithmetic, and the audio block has little time left
// (rytm-emu: four Hermite taps a frame overran it with every voice sending).
#define SIG_MAX 65535
static int mul15(int q, int x) { return (q * x) >> 15; }

static int clamp(int v, int lim) { return v > lim ? lim : v < -lim ? -lim : v; }

// A triangle LFO bent towards a sine: phase -> -32768..32768, a cosine.
static int lfo(unsigned ph)
{
    int t = (int)(ph >> 15) - 65536;
    int tri = (t < 0 ? -t : t) - 32768;
    int a = tri < 0 ? -tri : tri;
    return (tri * (98304 - a)) >> 16;
}

// 4-point Hermite read of the line, d samples behind the newest (Q8).
static int tap(unsigned d)
{
    unsigned i = wpos - 1 - (d >> 8);
    int f = (int)(d & 255);
    int xm1 = line[(i + 1) & (LEN - 1)], x0 = line[i & (LEN - 1)];
    int x1 = line[(i - 1) & (LEN - 1)], x2 = line[(i - 2) & (LEN - 1)];
    int c = (x1 - xm1) >> 1, v = x0 - x1, w = c + v;
    int a = w + v + ((x2 - x0) >> 1), b = w + a;
    int r = ((a * f) >> 8) - b;
    r = ((r * f) >> 8) + c;
    return ((r * f) >> 8) + x0;
}

static void reset_state(void)
{
    int i, c;
    for (i = 0; i < LEN; i++) line[i] = 0;
    for (c = 0; c < 2; c++) {
        for (i = 0; i < MAX_STAGES; i++) ap_x[c][i] = ap_y[c][i] = 0;
        ph_lag[c] = ph_last[c] = ap_a[c] = 0;
    }
    lp_l = lp_r = hp_l = hp_r = 0;
    s_base = s_depth = s_fbk = 0;
}

// The wet filters of the chorus and the flanger: one-pole high- and low-pass.
static void wet_filters(int *l, int *r)
{
    if (k_hp) {
        hp_l += mul15(k_hp, *l - hp_l); hp_r += mul15(k_hp, *r - hp_r);
        *l -= hp_l; *r -= hp_r;
    }
    lp_l += mul15(k_lp, clamp(*l - lp_l, SIG_MAX)); lp_r += mul15(k_lp, clamp(*r - lp_r, SIG_MAX));
    *l = lp_l; *r = lp_r;
}

// CHORUS: two taps swept by one LFO, the right WDTH out of phase. The LFO is
// worked out at each end of the block and its delays stepped in between.
static void chorus(const int *x, int *L, int *R)
{
    int f, base = (48 + par[2] * 11) << 8, depth = (par[1] * 2) << 8, fb = par[4] * 220;
    unsigned inc = rate[par[0]] >> 1, wid = (unsigned)par[3] * (0x80000000u / 127);   // 0.01-5 Hz
    int dl, dr, sl, sr, sf;
    if (depth > base - (24 << 8)) depth = base - (24 << 8);
    if (depth < 0) depth = 0;
    dl = s_base + ((s_depth >> 8) * lfo(phase) >> 7);
    dr = s_base + ((s_depth >> 8) * lfo(phase + wid) >> 7);
    phase += inc * 32;
    sl = (base + ((depth >> 8) * lfo(phase) >> 7) - dl) / 32;
    sr = (base + ((depth >> 8) * lfo(phase + wid) >> 7) - dr) / 32;
    sf = (fb - s_fbk) / 32;
    k_hp = par[5] ? onepole_k[par[5]] : 0;
    k_lp = onepole_k[par[6]];
    for (f = 0; f < 32; f++) {
        int l, r;
        dl += sl; dr += sr; s_fbk += sf;
        l = tap((unsigned)dl);
        r = tap((unsigned)dr);
        line[wpos & (LEN - 1)] = clamp(x[f] + mul15(s_fbk, (l + r) >> 1), SIG_MAX);
        wpos++;
        wet_filters(&l, &r);
        L[f] = l; R[f] = r;
    }
    s_base = base; s_depth = depth; s_fbk = fb;
}

// FLANGER: a barber-pole sweep. Two taps glide the same way through the
// delay, half a cycle apart, each faded in and out (sin^2 windows that sum to
// one), so the sweep rises or falls without end; the right side crosses the
// fades, so its sweep runs against the left's. SPD sets the speed and the
// direction, DEP the span, TUNE the shortest delay, FDBK the (signed) resonance.
static void flanger(const int *x, int *L, int *R)
{
    int f, d = par[0] - 64, fb = (par[3] - 64) * 440;
    int lo = (6 + par[2] * 2) << 8, span = 2 + par[1] * 4;      // 0.1-5.4 ms, up to 10.6 ms
    unsigned inc = d ? rate[(d < 0 ? -d : d) * 2 - 1] >> 1 : 0;   // up to 5 Hz; index 1-127
    int ga, sg, sf = (fb - s_fbk) / 32, sb = (lo - s_base) / 32;
    unsigned step = d < 0 ? -inc : inc;
    ga = (32768 - lfo(phase)) >> 1;
    sg = (((32768 - lfo(phase + step * 32)) >> 1) - ga) / 32;   // the fade, stepped across the block
    k_lp = onepole_k[par[4]];
    k_hp = 0;
    for (f = 0; f < 32; f++) {
        unsigned pa, pb;
        int gb, ta, tb, out[2];
        s_fbk += sf; s_base += sb; ga += sg;
        phase += step;
        pa = phase; pb = pa + 0x80000000u;
        gb = 32768 - ga;                         // sin^2 and cos^2
        ta = tap((unsigned)(s_base + ((span * (int)(pa >> 16)) >> 8)));
        tb = tap((unsigned)(s_base + ((span * (int)(pb >> 16)) >> 8)));
        // The left fades the taps one way, the right the other: two taps in
        // all, the cost of the chorus.
        out[0] = mul15(ga, ta) + mul15(gb, tb);
        out[1] = mul15(gb, ta) + mul15(ga, tb);
        line[wpos & (LEN - 1)] = clamp(x[f] + mul15(s_fbk, out[0]), SIG_MAX);
        wpos++;
        wet_filters(&out[0], &out[1]);
        L[f] = out[0]; R[f] = out[1];
    }
    s_fbk = fb; s_base = lo;
    ga = (32768 - lfo(phase)) >> 1;              // no drift between blocks
}

// PHASER: 2-8 first-order all-pass stages per side; their centre frequency
// FREQ swept by an LFO (SPD, DEP; SHP squares it, LAG slows its moves), the
// right side WDTH out of phase; FDBK feeds the output back (signed). The
// return is input plus stages, which digs the notches. The stages run at a
// quarter of the level (|v| within 2^15), so a stage is one multiply with no
// clamp: twelve stages a side overran the audio block with every voice sending.
static void phaser(const int *x, int *L, int *R)
{
    int c, f, s, stages = 2 + 2 * (par[6] * 3 / 127), fb = (par[5] - 64) * 440;
    int range = par[1] * 102 / 127, centre = par[4] * 2, lag = 32767 - par[3] * 250;
    unsigned inc = rate[par[0]] >> 1, wid = (unsigned)par[7] * (0x80000000u / 127);
    int a_step[2];
    for (c = 0; c < 2; c++) {
        int m = lfo(phase + (c ? wid : 0)), idx;
        m = clamp(m + ((m * par[2]) >> 4), 32767);  // SHP: up to 8x, clipped towards a square
        ph_lag[c] += mul15(lag, m - ph_lag[c]);
        idx = centre + ((range * ph_lag[c]) >> 15);
        idx = idx < 0 ? 0 : idx > 255 ? 255 : idx;
        a_step[c] = (allpass_a[idx] - ap_a[c]) / 32;
    }
    phase += inc * 32;
    for (c = 0; c < 2; c++) {
        int *xs = ap_x[c], *ys = ap_y[c], a = ap_a[c], last = ph_last[c], *out = c ? R : L;
        for (f = 0; f < 32; f++) {
            int v = (x[f] >> 2) + mul15(fb, last);
            a += a_step[c];
            for (s = 0; s < stages; s++) {
                int y = mul15(a, v - ys[s]) + xs[s];
                xs[s] = v;
                ys[s] = y;
                v = y;
            }
            last = clamp(v, 16383);
            out[f] = (x[f] >> 1) + (last << 1);
        }
        ap_a[c] = a;
        ph_last[c] = last;
    }
}

// The audio block, from the FX returns' hook (gate.s).
void send_fx_block(int slot)
{
    int v, f, n = 0, type = fx_type < FX_TYPES ? fx_type : FX_CHORUS;
    int gain[VOICES], step[VOICES], wordof[VOICES], tlev, slev;
    int x[32], L[32], R[32];

    for (v = 0; v < VOICES; v++) {               // the voices that send, or still fade out
        int t = VOICE_TRACK(v), s = t < SOUND_TRACKS ? send[t] : 0, tgt = s * s * 2;   // Q15, squared as stock's sends
        if (tgt || g_voice[v]) {
            gain[n] = g_voice[v];
            step[n] = (tgt - g_voice[v]) / 32;
            wordof[n] = 2 + (VOICE_WORD(v) & 7);
            n++;
        }
        g_voice[v] = tgt;
    }
    if (n) idle = 0;
    else if (idle < IDLE_BLOCKS) idle++;
    if (type != run_type) {                      // a new effect starts clean
        reset_state();
        run_type = type;
    }
    if (idle >= IDLE_BLOCKS) {
        if (idle == IDLE_BLOCKS) {               // once: leave a clean state
            reset_state();
            idle++;
        }
        return;
    }
    for (f = 0; f < 32; f++) {
        int sum = 0, k;
        for (k = 0; k < n; k++) {
            gain[k] += step[k];
            sum += ((RX(f, wordof[k]) >> 16) * gain[k]) >> 15;   // 16-bit x Q15
        }
        x[f] = clamp(sum, SIG_MAX);
    }

    if (type == FX_FLANGER) flanger(x, L, R);
    else if (type == FX_PHASER) phaser(x, L, R);
    else chorus(x, L, R);

    tlev = lev * lev * 2;
    slev = (tlev - g_lev) / 32;
    for (f = 0; f < 32; f++) {
        volatile int *out = PRE(slot, f);
        int l, r;
        g_lev += slev;
        l = mul15(g_lev, clamp(L[f], SIG_MAX)) << 7;   // 16 bits -> 24, as the chorus was heard
        r = mul15(g_lev, clamp(R[f], SIG_MAX)) << 7;
        out[0] = clamp(((out[0] << 8) >> 8) + l, 0x7fffff) & 0xffffff;
        out[1] = clamp(((out[1] << 8) >> 8) + r, 0x7fffff) & 0xffffff;
    }
    g_lev = tlev;
}

// ---------------------------------------------------------------- storage

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

// Kit fields hold each control XOR its effect's default, so zero is the
// chorus at its defaults.
static void load_kit(void)
{
    unsigned a = core_store_get(STORE(send_fx_a), live_kit(), 0);
    unsigned b = core_store_get(STORE(send_fx_b), live_kit(), 0);
    int t = (int)(a >> 28), k;
    if (t >= FX_TYPES) t = FX_CHORUS;
    fx_type = (unsigned char)t;
    for (k = 0; k < 4; k++) {
        par[k] = (unsigned char)((a >> (21 - 7 * k) & 127) ^ effects[t].c[k].def);
        par[4 + k] = (unsigned char)((b >> (21 - 7 * k) & 127) ^ effects[t].c[4 + k].def);
    }
    lev = (unsigned char)((core_store_get(STORE(send_fx_lev), 0, 0) & 127) ^ LEV_DEFAULT);
}

static void save_kit(void)
{
    unsigned a = (unsigned)fx_type << 28, b = 0;
    int k;
    for (k = 0; k < 4; k++) {
        a |= (unsigned)(par[k] ^ effects[fx_type].c[k].def) << (21 - 7 * k);
        b |= (unsigned)(par[4 + k] ^ effects[fx_type].c[4 + k].def) << (21 - 7 * k);
    }
    core_store_set(STORE(send_fx_a), live_kit(), 0, a);
    core_store_set(STORE(send_fx_b), live_kit(), 0, b);
}

// A new effect starts from its own defaults.
static void set_type(int t)
{
    int k;
    fx_type = (unsigned char)t;
    for (k = 0; k < 8; k++) par[k] = effects[t].c[k].def;
    save_kit();
}

// ---------------------------------------------------------------- UI

static int selected_track(void)
{
    char *project = (char *)PROJECT_SINGLETON();
    return TRACK_INDEX_OF(project + PROJECT_TRACKSEL);
}

// ev_tick, about 20 Hz: copy each sound's send and the kit's values for the
// audio block, close a page whose track went away, and redraw an open page.
void send_fx_tick(char *ctrl)
{
    int track;
    if (!ready)
        return;
    for (track = 0; track < SOUND_TRACKS; track++) {
        void *live = live_sound(accessor(track));
        send[track] = (unsigned char)(live ? core_store_get(STORE(send_fx_send), live, 0) & 127 : 0);
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
int send_fx_key(void *brain, char *ev)
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

// ev_enc: while a page is up, A-H set its controls; on the FX page FUNC + A
// chooses the effect and FUNC + E sets LEV.
int send_fx_enc(void *brain, char *ev)
{
    int enc = *(int *)(ev + 12), delta = *(int *)(ev + 16), steps, func, per;
    (void)brain;
    if (!ready || !page || enc < 0 || enc > 7)
        return 0;
    func = IS_KEY_HELD(KEY_FUNC) != 0;
    if (enc != acc_enc || func != acc_func) { acc_enc = enc; acc_func = func; acc_cnt = 0; }
    per = func && enc == 0 ? TYPE_COUNTS : COUNTS;
    acc_cnt += delta;
    steps = acc_cnt / per;
    acc_cnt -= steps * per;
    shown_knob = func ? (enc == 4 ? SHOWN_LEV : -1) : enc;
    show_ticks = SHOW_TICKS;
    if (!steps)
        return 1;
    if (page == 1 && func) {
        if (enc == 0) {
            int t = fx_type + (steps > 0 ? 1 : -1);
            if (t >= 0 && t < FX_TYPES) set_type(t);
        } else if (enc == 4) {
            int v = lev + steps;
            lev = (unsigned char)(v < 0 ? 0 : v > 127 ? 127 : v);
            core_store_set(STORE(send_fx_lev), 0, 0, (unsigned)(lev ^ LEV_DEFAULT));
        }
    } else if (page == 1) {
        int v;
        if (effects[fx_type].c[enc].icon == IC_EMPTY)
            return 1;
        v = par[enc] + steps;
        par[enc] = (unsigned char)(v < 0 ? 0 : v > 127 ? 127 : v);
        save_kit();
    } else if (enc == 0) {
        int sel = selected_track(), v;
        void *acc, *live;
        if (sel < 0 || sel >= SOUND_TRACKS)
            return 1;
        acc = accessor(sel);
        live = live_sound(acc);
        if (!live)
            return 1;
        v = send[sel] + steps;
        v = v < 0 ? 0 : v > 127 ? 127 : v;
        send[sel] = (unsigned char)v;
        core_store_set(STORE(send_fx_send), live, 0, (unsigned)v);
        notify(acc);
    }
    return 1;
}

// ev_project: a loaded or new project starts clean. Until the first one the
// kit is not built, so nothing runs.
void send_fx_project(int how, unsigned dropped)
{
    (void)how;
    (void)dropped;
    page = 0;
    last_page_key = -1;
    idle = IDLE_BLOCKS;                          // cleared at once, then silent until a send
    ready = 1;
}

// ---------------------------------------------------------------- drawing
// In screen rows here: y counts down from the top (0) to the bottom (63).

static void *g_bmp;

static void px(int x, int y, int c)
{
    if (x >= 0 && x < 128 && y >= 0 && y < 64)
        FILLRECT(g_bmp, x, 63 - y, x, 63 - y, c);
}

static void rect(int x0, int y0, int x1, int y1, int c) { FILLRECT(g_bmp, x0, 63 - y1, x1, 63 - y0, c); }

// A box with its corners left out, as Elektron's widgets have them.
static void box(int x0, int y0, int x1, int y1)
{
    rect(x0 + 1, y0, x1 - 1, y0, 1); rect(x0 + 1, y1, x1 - 1, y1, 1);
    rect(x0, y0 + 1, x0, y1 - 1, 1); rect(x1, y0 + 1, x1, y1 - 1, 1);
}

static void line_to(int x0, int y0, int x1, int y1)
{
    int dx = x1 > x0 ? x1 - x0 : x0 - x1, dy = y1 > y0 ? y1 - y0 : y0 - y1;
    int sx = x1 > x0 ? 1 : -1, sy = y1 > y0 ? 1 : -1, err = dx - dy, i;
    for (i = 0; i < 160; i++) {                  // bounded: a draw handler must return
        int e2 = 2 * err;
        px(x0, y0, 1);
        if (x0 == x1 && y0 == y1) break;
        if (e2 > -dy) { err -= dy; x0 += sx; }
        if (e2 < dx) { err += dx; y0 += sy; }
    }
}

// 5 x 7 capitals and digits for the title bar, the effect number and SND.
static const unsigned char big_font[26][7] = {
    {14,17,17,31,17,17,17},{30,17,17,30,17,17,30},{14,17,16,16,16,17,14},{30,17,17,17,17,17,30},{31,16,16,30,16,16,31},
    {31,16,16,30,16,16,16},{14,17,16,23,17,17,15},{17,17,17,31,17,17,17},{14,4,4,4,4,4,14},{7,2,2,2,2,18,12},
    {17,18,20,24,20,18,17},{16,16,16,16,16,16,31},{17,27,21,21,17,17,17},{17,25,21,19,17,17,17},{14,17,17,17,17,17,14},
    {30,17,17,30,16,16,16},{14,17,17,17,21,18,13},{30,17,17,30,20,18,17},{15,16,16,14,1,1,30},{31,4,4,4,4,4,4},
    {17,17,17,17,17,17,14},{17,17,17,17,17,10,4},{17,17,17,21,21,21,10},{17,17,10,4,10,17,17},{17,17,10,4,4,4,4},
    {31,1,2,4,8,16,31},
};
static const unsigned char big_digits[10][7] = {
    {14,17,19,21,25,17,14},{4,12,4,4,4,4,14},{14,17,1,2,4,8,31},{30,1,1,14,1,1,30},{2,6,10,18,31,2,2},
    {31,16,30,1,1,17,14},{6,8,16,30,17,17,14},{31,1,2,4,8,8,8},{14,17,17,14,17,17,14},{14,17,17,15,1,2,12},
};

static void big_text(const char *t, int x, int y, int c)
{
    for (; *t; t++, x += 6) {
        const unsigned char *g = *t >= 'A' && *t <= 'Z' ? big_font[*t - 'A'] : *t >= '0' && *t <= '9' ? big_digits[*t - '0'] : 0;
        int r, k;
        if (!g) continue;
        for (r = 0; r < 7; r++)
            for (k = 0; k < 5; k++)
                if (g[r] & (16 >> k)) px(x + k, y + r, c);
    }
}

// v with digits figures (leading zeros), or as few as it needs (digits 0).
static void big_number(int v, int digits, int x, int y)
{
    char t[4];
    int n = digits ? digits : v >= 100 ? 3 : v >= 10 ? 2 : 1;
    t[n] = 0;
    while (n--) { t[n] = (char)('0' + v % 10); v /= 10; }
    big_text(t, x, y, 1);
}

static void *font(void) { return (void *)TEXT_FONT(TEXT_CTX); }

// A label in stock's font, centred on cx, its bottom row at screen row y.
static void label(int cx, int y, const char *t) { TEXT_DRAW(g_bmp, font(), cx, 63 - y, 1, 0, "XXXX", "%s", t); }
static void label_value(int cx, int y, int v) { TEXT_DRAW(g_bmp, font(), cx, 63 - y, 1, 0, "XXXX", "%d", v); }

static void dial(int cx, int cy, int v)
{
    unsigned i;
    for (i = 0; i < sizeof ring_dx; i++) px(cx + ring_dx[i], cy + ring_dy[i], 1);
    line_to(cx, cy, cx + ptr_dx[v & 127], cy + ptr_dy[v & 127]);
}

static void circle5(int cx, int cy)
{
    unsigned i;
    for (i = 0; i < sizeof c5_dx; i++) px(cx + c5_dx[i], cy + c5_dy[i], 1);
}

static void filter_curve(int x0, int y0, int x1, int y1, int kind, int v)
{
    // the corner stays inside the box at both ends, so the slope always shows
    int x, w = x1 - x0 - 12, fx = x0 + 6 + w * v / 127, top = y0 + 4, bot = y1 - 2, last = -1;
    box(x0, y0, x1, y1);
    for (x = x0 + 2; x <= x1 - 2; x++) {
        int d = kind == IC_LPF ? x - fx : fx - x;
        int y = d <= 0 ? top : top + d * 2;
        if (y > bot) y = bot;
        if (last >= 0 && (y - last > 1 || last - y > 1)) line_to(x - 1, last, x, y);
        else px(x, y, 1);
        last = y;
    }
}

static void tri_wave(int x0, int y, int w, int amp, int cycles, int dotted)
{
    int i, last = 0;
    for (i = 0; i < w; i++) {
        int p = i * cycles * 256 / w % 256, t = p < 64 ? p : p < 192 ? 128 - p : p - 256;   // -64..64
        int yy = y - amp * t / 64;
        if (dotted) { if (!(i & 1)) px(x0 + i, yy, 1); }
        else if (i && (yy - last > 1 || last - yy > 1)) line_to(x0 + i - 1, last, x0 + i, yy);
        else px(x0 + i, yy, 1);
        last = yy;
    }
}

static void widget(int k, int cx, int cy, int v, int next)
{
    int i;
    switch (effects[fx_type].c[k].icon) {
    case IC_DIAL: dial(cx, cy, v); break;
    case IC_BIP:                                 // a dial with - and + under it
        dial(cx, cy, v);
        rect(cx - 9, cy + 7, cx - 8, cy + 7, 1);
        rect(cx + 7, cy + 7, cx + 9, cy + 7, 1); rect(cx + 8, cy + 6, cx + 8, cy + 8, 1);
        break;
    case IC_DEPTH:
        tri_wave(cx - 10, cy - 1, 21, 1 + v / 32, 1, 0);
        tri_wave(cx - 10, cy + 3, 21, 1, 1, 1);
        break;
    case IC_WIDTH: i = 1 + v * 5 / 127; circle5(cx - i, cy); circle5(cx + i, cy); break;
    case IC_FDBK: {
        unsigned j;
        for (j = 0; j < sizeof fb_dx; j++) px(cx + fb_dx[j], cy + fb_dy[j], 1);
        line_to(cx + 5, cy - 5, cx + 8, cy - 2); line_to(cx + 5, cy - 5, cx + 2, cy - 5);
        break;
    }
    case IC_HPF: case IC_LPF:
        filter_curve(cx - 10, cy - 9, cx + 10, cy + 8, effects[fx_type].c[k].icon, v);
        break;
    case IC_STAGES: {
        int n = 1 + v * 3 / 127;                 // one box per stage pair: 2, 4, 6 or 8 stages
        for (i = 0; i < n; i++) box(cx - 11 + i * 4, cy - 6, cx - 9 + i * 4, cy + 6);
        break;
    }
    case IC_TUNE: {
        int x;
        for (x = cx - 9; x <= cx + 9; x++) {
            int y;
            for (y = cy - 8 + (x - cx + 9) / 2; y <= cy + 8; y++)
                if (!((x + y) % 3)) px(x, y, 1);
        }
        x = cx - 9 + v * 18 / 127;
        line_to(x, cy - 9, x, cy + 2); rect(x - 1, cy + 1, x + 1, cy + 3, 1);
        break;
    }
    case IC_COMB:                                // spans its column and the next
        box(cx - 11, cy - 9, cx + 37, cy + 8);
        tri_wave(cx - 9, cy, 45, 2 + (next > 64 ? next - 64 : 64 - next) / 16, 2 + v / 32, 0);
        break;
    case IC_EMPTY:
        for (i = -9; i <= 9; i += 2) { px(cx + i, cy - 8, 1); px(cx + i, cy + 8, 1); }
        for (i = -8; i <= 8; i += 2) { px(cx - 9, cy + i, 1); px(cx + 9, cy + i, 1); }
        break;
    }
}

static int sending(void)
{
    int t, n = 0;
    for (t = 0; t < SOUND_TRACKS; t++) n += send[t] != 0;
    return n;
}

static const char *const track_names[SOUND_TRACKS] = { "BD", "SD", "RS", "CP", "BT", "LT", "MT", "HT", "CH", "OH", "CY", "CB" };

// The FX page: the effect's number and name over the top, SND (the tracks
// that send) and LEV on the left, the eight controls in two rows.
static void draw_fx(void)
{
    static const unsigned char col[4] = { 33, 59, 85, 111 };
    int k, n;
    rect(0, 0, 127, 63, 0);
    box(0, 0, 17, 10);
    big_number(fx_type + 1, 2, 3, 2);
    rect(20, 0, 127, 10, 1);
    big_text(effects[fx_type].name, 23, 2, 0);
    box(0, 13, 17, 36);
    label(9, 21, "SND");
    n = sending();
    big_number(n, 0, n >= 10 ? 3 : 6, 26);
    box(4, 39, 13, 56);
    n = lev * 13 / 127;
    if (n) rect(7, 54 - n, 10, 54, 1);
    for (k = 41; k <= 55; k += 3) { rect(1, k, 2, k, 1); rect(15, k, 16, k, 1); }
    if (shown_knob == SHOWN_LEV) label_value(9, 63, lev); else label(9, 63, "LEV");
    for (k = 0; k < 8; k++) {
        const struct control *c = &effects[fx_type].c[k];
        int cx = col[k & 3], cy = k < 4 ? 21 : 47, ly = k < 4 ? 35 : 63;
        if (c->icon != IC_SKIP)
            widget(k, cx, cy, par[k], k < 7 ? par[k + 1] : 0);
        if (c->icon == IC_EMPTY)
            continue;
        if (shown_knob == k) label_value(cx, ly, bipolar(fx_type, k) ? par[k] - 64 : par[k]);
        else label(cx, ly, c->label);
    }
}

// The SEND page: one stock-style dial at A for the selected track's send,
// between stock's own top and bottom bars.
static void draw_send(void)
{
    int sel = selected_track();
    rect(0, 10, 127, 53, 0);
    if (sel < 0 || sel >= SOUND_TRACKS)
        return;
    dial(16, 18, send[sel]);
    if (shown_knob == 0) label_value(16, 30, send[sel]); else label(16, 30, "SND");
    if (title_ticks) {
        rect(0, 0, 70, 8, 0);
        TEXT_DRAW(g_bmp, font(), 2, 56, 0, 0, "SEND FX BD", "SEND FX %s", track_names[sel]);
    }
}

void send_fx_draw(void *bmp, void *ctrl)
{
    (void)ctrl;
    if (!page)
        return;
    g_bmp = bmp;
    if (page == 1) draw_fx(); else draw_send();
}
