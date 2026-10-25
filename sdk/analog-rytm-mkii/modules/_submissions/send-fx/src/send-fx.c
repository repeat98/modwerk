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
// is tied to the tempo but the two delays' time, a note division of stock's
// tempo word, read every block.

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
// Stock's tempo, in 1/120 BPM (as Loop Sync reads it).
#define TEMPO_WORD (*(volatile int *)TEMPO_WORD_AT)

#define KEY_FUNC 0x80
#define KEY_TRK 0x86
#define KEY_TRIG_LAST 0x0f
#define KEY_PAD_FIRST 0x90
#define KEY_PAD_LAST 0x9b
#define KEY_RECORD 0x50
#define KEY_STOP 0x52
#define KEY_PAGE_DELAY 0x31        // the second parameter key: DELAY on the FX track
#define KEY_PAGE_AMP 0x34          // AMP
#define KEY_PUSH_FIRST 0x70        // the encoders A-H pressed
#define KEY_PUSH_LAST 0x77
#define KEY_PRESSED 1              // ev_key flags: 1 pressed
#define FX_TRACK 12
#define SOUND_TRACKS 12
#define PROJECT_KIT 352            // project + 352: the active kit
#define PROJECT_TRACKSEL 48        // project + 48: the track selection
#define ACC_LIVE_SOUND 0x28        // sound accessor vtable: the live sound
#define ACC_CONFIG_CHANGED 0x10    // sound accessor vtable: the change notice
#define COUNTS 2                   // encoder counts per step
#define TYPE_COUNTS 8              // encoder counts per effect step
#define SYNC_COUNTS 4              // encoder counts per note division
#define SHOW_TICKS 25              // about 1.2 s of the ~20 Hz tick
#define SHOWN_LEV 8                // shown_knob: LEV

#define LEN 4096                   // the modulation line, a power of two: 85 ms
#define POOL 16384                 // words: the memory the effects share, one running at a time
#define DLEN 16384                 // a delay side, 16-bit samples at 24 kHz: 0.68 s
#define CLEAR_STEP 1024            // pool words cleared a block, the effect silent until it is clean
#define UNITS_PER_BPM 120          // the tempo word's unit
#define DIVS 12                    // note divisions (div_q1000)
#define VOICES 8
#define IDLE_BLOCKS 3000           // 2 s with no send before the effect is left silent
#define LEV_DEFAULT 71             // as loud as 100 was before LEV went up to 2x
#define MAX_STAGES 8

// ---------------------------------------------------------------- effects

enum { FX_CHORUS, FX_FLANGER, FX_PHASER, FX_WOW, FX_COMB, FX_CRUSH, FX_LOWPASS, FX_MULTI, FX_DIRT, FX_SATDLY, FX_STDLY,
       FX_CHRONO, FX_FOLDER, FX_BANK, FX_WARPER, FX_TYPES };
enum { IC_EMPTY, IC_DIAL, IC_BIP, IC_DEPTH, IC_WIDTH, IC_FDBK, IC_HPF, IC_LPF, IC_STAGES, IC_TUNE, IC_COMB, IC_SKIP,
       IC_NOISE, IC_SLIDE, IC_BITS, IC_DRIVE, IC_STAR, IC_DROP, IC_BAND, IC_TYPE, IC_ENV, IC_RECT, IC_SYNC, IC_MOD,
       IC_SKEW, IC_TILT, IC_T128, IC_SWITCH, IC_VBAR, IC_FOLD, IC_TYPE8, IC_SHIFT, IC_BLEND };

struct control { char label[6]; unsigned char icon, def; };
struct effect { const char *name; struct control c[8]; };

// The controls of each effect, A-D on the top row and E-H below. IC_COMB and
// IC_BAND span their column and the next, whose encoder sets the second
// value. An IC_SYNC control is a note division, 0..DIVS-1.
static const struct effect effects[FX_TYPES] = {
    { "CHORUS", { { "SPD", IC_DIAL, 64 }, { "DEP", IC_DEPTH, 64 }, { "TIME", IC_DIAL, 48 }, { "WDTH", IC_WIDTH, 127 },
                  { "FDBK", IC_FDBK, 0 }, { "HPF", IC_HPF, 0 }, { "LPF", IC_LPF, 127 }, { "", IC_EMPTY, 0 } } },
    { "FLANGER", { { "SPD", IC_BIP, 90 }, { "DEP", IC_DIAL, 64 }, { "TUNE", IC_TUNE, 16 }, { "FDBK", IC_FDBK, 96 },
                   { "LPF", IC_LPF, 127 }, { "", IC_EMPTY, 0 }, { "", IC_EMPTY, 0 }, { "", IC_EMPTY, 0 } } },
    { "PHASER", { { "SPD", IC_DIAL, 50 }, { "DEP", IC_DEPTH, 80 }, { "SHP", IC_DIAL, 0 }, { "LAG", IC_DIAL, 0 },
                  { "FREQ", IC_COMB, 80 }, { "FDBK", IC_SKIP, 96 }, { "STG", IC_STAGES, 50 }, { "WDTH", IC_WIDTH, 64 } } },
    { "WOW AND FLUTTER", { { "SPD", IC_DIAL, 50 }, { "DEP", IC_DEPTH, 110 }, { "BASE", IC_DIAL, 20 }, { "WDTH", IC_WIDTH, 64 },
                           { "NOIS", IC_NOISE, 50 }, { "N.HPF", IC_HPF, 40 }, { "STER", IC_SLIDE, 64 }, { "", IC_EMPTY, 0 } } },
    { "COMB FILTER", { { "SPD", IC_DIAL, 8 }, { "DEP", IC_DEPTH, 32 }, { "SPH", IC_DIAL, 0 }, { "DTUN", IC_SLIDE, 16 },
                       { "FREQ", IC_COMB, 64 }, { "FDBK", IC_SKIP, 124 }, { "LPF", IC_LPF, 120 }, { "", IC_EMPTY, 0 } } },
    { "BITCRUSH", { { "BITS", IC_BITS, 100 }, { "OVER", IC_DRIVE, 60 }, { "SRR", IC_STAR, 70 }, { "DROP", IC_DROP, 0 },
                    { "RATE", IC_DIAL, 64 }, { "DEP", IC_DEPTH, 0 }, { "FREZ", IC_STAR, 0 }, { "F.TIM", IC_SLIDE, 16 } } },
    { "LOWPASS", { { "SPD", IC_DIAL, 16 }, { "DEP", IC_DEPTH, 100 }, { "SPH", IC_DIAL, 0 }, { "LAG", IC_DIAL, 32 },
                   { "FREQ", IC_BAND, 64 }, { "RESO", IC_SKIP, 115 }, { "SPRD", IC_WIDTH, 32 }, { "", IC_EMPTY, 0 } } },
    { "MULTIFILTER", { { "ATK", IC_ENV, 4 }, { "DEC", IC_SLIDE, 50 }, { "SUS", IC_SLIDE, 40 }, { "REL", IC_SLIDE, 40 },
                       { "FREQ", IC_BAND, 30 }, { "RESO", IC_SKIP, 115 }, { "TYPE", IC_TYPE, 0 }, { "ENV", IC_BIP, 127 } } },
    { "DIRT", { { "DRV", IC_DRIVE, 100 }, { "RECT", IC_RECT, 30 }, { "HPF", IC_BIP, 64 }, { "LPF", IC_LPF, 100 },
                { "NOIS", IC_NOISE, 40 }, { "N.FRQ", IC_BAND, 90 }, { "N.RES", IC_SKIP, 40 }, { "", IC_EMPTY, 0 } } },
    { "SAT DELAY", { { "TIME", IC_T128, 15 }, { "X", IC_SWITCH, 1 }, { "WDTH", IC_WIDTH, 127 }, { "FDBK", IC_FDBK, 90 },
                     { "HPF", IC_HPF, 16 }, { "LPF", IC_LPF, 96 }, { "DRV", IC_DRIVE, 80 }, { "", IC_EMPTY, 0 } } },
    { "STEREO DELAY", { { "DRV", IC_DRIVE, 20 }, { "TIME", IC_SYNC, 6 }, { "FDBK", IC_FDBK, 90 }, { "WDTH", IC_WIDTH, 110 },
                        { "MOD", IC_MOD, 40 }, { "SKEW", IC_SKEW, 80 }, { "FILT", IC_TILT, 64 }, { "", IC_EMPTY, 0 } } },
    { "CHRONO PITCH", { { "TUNE", IC_BIP, 96 }, { "WIN", IC_SLIDE, 60 }, { "FDBK", IC_FDBK, 40 }, { "DEP", IC_DEPTH, 16 },
                        { "HPF", IC_HPF, 16 }, { "LPF", IC_LPF, 110 }, { "SPD", IC_DIAL, 60 }, { "", IC_EMPTY, 0 } } },
    { "FILTER FOLDER", { { "ILEV", IC_SLIDE, 64 }, { "HP", IC_HPF, 16 }, { "FOLD", IC_FOLD, 64 }, { "OLEV", IC_SLIDE, 64 },
                         { "FREQ", IC_BAND, 80 }, { "RESO", IC_SKIP, 90 }, { "TYPE", IC_TYPE8, 0 }, { "DIST", IC_DRIVE, 40 } } },
    { "FILTERBANK", { { "90", IC_VBAR, 127 }, { "120", IC_VBAR, 0 }, { "225", IC_VBAR, 110 }, { "420", IC_VBAR, 0 },
                      { "780", IC_VBAR, 120 }, { "1.4K", IC_VBAR, 0 }, { "2.7K", IC_VBAR, 127 }, { "4K", IC_VBAR, 20 } } },
    { "FREQ WARPER", { { "SPD", IC_DIAL, 40 }, { "DEP", IC_DEPTH, 20 }, { "SPH", IC_DIAL, 0 }, { "LAG", IC_DIAL, 32 },
                       { "SHFT", IC_SHIFT, 80 }, { "SPRD", IC_WIDTH, 20 }, { "SBND", IC_BLEND, 0 }, { "", IC_EMPTY, 0 } } },
};

// Bipolar controls (64 is the centre) are shown -64..+63.
static int bipolar(int type, int k)
{
    return (type == FX_FLANGER && (k == 0 || k == 3)) || ((type == FX_PHASER || type == FX_COMB) && k == 5)
           || (type == FX_MULTI && k == 7) || (type == FX_DIRT && k == 2) || (type == FX_SATDLY && k == 2)
           || (type == FX_STDLY && k == 6) || (type == FX_WARPER && k == 4);
}

static int top_of(int type, int k)
{
    int icon = effects[type].c[k].icon;
    return icon == IC_SYNC ? DIVS - 1 : icon == IC_SWITCH ? 1 : 127;
}

// Written by the idle tick and the handlers, read by the audio block.
static unsigned char fx_type, par[8], lev = LEV_DEFAULT;
static unsigned char send[SOUND_TRACKS];
static int ready;

// The audio block's state.
// The memory the effects share: the modulation line, the comb's two lines,
// the delays' two sides or the freeze buffer.
static union { int line[LEN]; int comb[2][LEN]; short d[2][DLEN]; short frz[2 * DLEN]; int w[POOL]; } mem;
static int clear_at = POOL;
static unsigned wpos, phase, rnd = 0x2545f491u;
// The newer effects' state, cleared as a whole.
static struct {
    int env, dl, dr, nz, drift, drift2, lp[2], hp[2], lo[2], bp[2], lo2[2], bp2[2], sf[2], p[2], d[2], out[2];
    int acc[2], held[2], drop, g_drop, frz_left, frz_len, frz_pos, frz_start, stage, level, dc;
    int bank_lo[6], bank_bp[6], ap[2][4][4], apq;
    unsigned osc[2];
    unsigned ph2, fw, dw;
} ns;
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
    int xm1 = mem.line[(i + 1) & (LEN - 1)], x0 = mem.line[i & (LEN - 1)];
    int x1 = mem.line[(i - 1) & (LEN - 1)], x2 = mem.line[(i - 2) & (LEN - 1)];
    int c = (x1 - xm1) >> 1, v = x0 - x1, w = c + v;
    int a = w + v + ((x2 - x0) >> 1), b = w + a;
    int r = ((a * f) >> 8) - b;
    r = ((r * f) >> 8) + c;
    return ((r * f) >> 8) + x0;
}

// The pool is cleared a step a block (send_fx_block), the rest at once.
static void reset_state(void)
{
    int i, c, *p = (int *)&ns;
    clear_at = 0;
    for (i = 0; i < (int)(sizeof ns / sizeof(int)); i++) p[i] = 0;
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
        mem.line[wpos & (LEN - 1)] = clamp(x[f] + mul15(s_fbk, (l + r) >> 1), SIG_MAX);
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
        mem.line[wpos & (LEN - 1)] = clamp(x[f] + mul15(s_fbk, out[0]), SIG_MAX);
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

// ---------------------------------------------------------------- the newer effects
// They follow the same budget: at most two line reads a frame and a few
// one-multiply filters, mono where the effect is.

static int noise(void)
{
    rnd = rnd * 1664525u + 1013904223u;
    return (int)rnd >> 16;
}

static int peak(const int *x)
{
    int f, m = 0;
    for (f = 0; f < 32; f++) {
        int a = x[f] < 0 ? -x[f] : x[f];
        if (a > m) m = a;
    }
    return m;
}

// The input's level, at block rate: at once up, down in about 40 ms.
static void follow(const int *x)
{
    int p = peak(x);
    ns.env = p > ns.env ? p : ns.env - (ns.env >> 6);
}

// A soft clip, u - 4/27 u^3: unity near zero, flat at +-32767 from u = +-49151
// (1.5 x 2^15) on.
static int soft(int u)
{
    int u2, cube;
    u = clamp(u, 49151);
    u2 = ((u >> 1) * (u >> 1)) >> 13;            // u^2 / 2^15, kept within 2^31
    cube = ((u2 >> 1) * (u >> 1)) >> 13;
    return u - ((cube * 4855) >> 15);
}

// Drive g (Q8, 1x-4x) into the soft clip and back by 1/g: small signals pass
// at unity, loud ones flatten, so a loop through it stays stable.
static int sat(int v, int g, int ig) { return mul15(ig, soft((v * g) >> 8)); }

// One step of a Chamberlin state-variable filter on v (|v| within 2^15),
// f in Q15 (svf_f), damping q in Q14; returns the high-pass output.
static int svf(int *lo, int *bp, int v, int fq, int q)
{
    int hi;
    *lo = clamp(*lo + mul15(fq, *bp), 32767);
    hi = clamp(v - *lo - ((q * *bp) >> 14), 32767);
    *bp = clamp(*bp + mul15(fq, hi), 32767);
    return hi;
}

// The tempo, 1/120 BPM; 120 BPM if stock's word holds no plausible value.
static int tempo(void)
{
    int t = TEMPO_WORD;
    return t < 30 * UNITS_PER_BPM || t > 300 * UNITS_PER_BPM ? 120 * UNITS_PER_BPM : t;
}

// A tempo-synced LFO's step a frame: spd/16 cycles a bar (16: one a bar,
// 127: about eight).
static unsigned sync_inc(int spd) { return (unsigned)(spd * tempo() * 199) >> 10; }

// A hit: the input's peak half again above its level (which then follows it).
static int onset(const int *x)
{
    int p = peak(x), hit = p > 1024 && p > ns.env + (ns.env >> 1);
    ns.env = p > ns.env ? p : ns.env - (ns.env >> 6);
    return hit;
}

static int idx127(int i) { return i < 0 ? 0 : i > 127 ? 127 : i; }

// WOW AND FLUTTER: an old tape recorder's warble. Two taps (as the chorus)
// swept around 6 ms by a wow (SPD; 0 a random speed) DEP deep, with a 6 Hz
// flutter a quarter as deep; STER sets the right side apart (up to half a
// cycle). The return is band-limited from BASE up by WDTH; NOIS adds hiss,
// high-passed by N.HPF, as loud as the input is.
static void wow(const int *x, int *L, int *R)
{
    int f, base = 288 << 8, depth = par[1] * 2, ml, mr, sl, sr, ng, dl = ns.dl, drr = ns.dr;
    int k_n = onepole_k[par[5]], lo = par[2] * 90 / 127, k_h = lo ? onepole_k[lo] : 0;
    int k_l = onepole_k[idx127(lo + 37 + par[3] * 90 / 127)];
    unsigned inc, sep = (unsigned)par[6] << 24;
    ns.drift += (noise() - ns.drift) >> 5;
    ns.drift2 += (ns.drift - ns.drift2) >> 5;
    inc = rate[par[0] ? par[0] : idx127(64 + (ns.drift2 >> 6))] >> 1;
    phase += inc * 32;
    ns.ph2 += 536871u * 32;                      // 6 Hz
    ml = clamp(lfo(phase) + (lfo(ns.ph2) >> 2), 32767);
    mr = clamp(lfo(phase + sep) + (lfo(ns.ph2 + sep) >> 2), 32767);
    ml = base + (depth * ml >> 7);
    mr = base + (depth * mr >> 7);
    if (!dl) dl = ml, drr = mr;
    sl = (ml - dl) / 32;
    sr = (mr - drr) / 32;
    follow(x);
    ng = (((par[4] * par[4]) >> 3) * ((ns.env + 4096) >> 8)) >> 6;
    for (f = 0; f < 32; f++) {
        int v[2], c, n;
        dl += sl; drr += sr;
        v[0] = tap((unsigned)dl);
        v[1] = tap((unsigned)drr);
        mem.line[wpos & (LEN - 1)] = x[f];
        wpos++;
        n = noise();
        ns.nz += mul15(k_n, n - ns.nz);
        n = mul15(ng, n - ns.nz);
        for (c = 0; c < 2; c++) {
            if (k_h) { ns.hp[c] += mul15(k_h, clamp(v[c] - ns.hp[c], SIG_MAX)); v[c] -= ns.hp[c]; }
            ns.lp[c] += mul15(k_l, clamp(v[c] - ns.lp[c], SIG_MAX));
        }
        L[f] = ns.lp[0] + n; R[f] = ns.lp[1] + n;
    }
    ns.dl = ml; ns.dr = mr;
}

// COMB FILTER: metallic, pitch-tuned resonance. A feedback comb a side, its
// pitch FREQ (40 Hz-4 kHz) moved by a tempo-synced triangle LFO (SPD, DEP up
// to half the period) that SPH (0: free) restarts at its phase on each hit;
// DTUN sets the left lower and the right higher (up to 3 % each). FDBK is
// signed (+ string-like, - hollow), up to 0.99, through LPF in the loop,
// which runs through the soft clip so the ringing stays within the line.
static void comb(const int *x, int *L, int *R)
{
    int c, f, fb = clamp((par[5] - 64) * 520, 32440), k = onepole_k[par[6]], step[2];
    if (par[2] && onset(x)) phase = (unsigned)(par[2] - 1) << 25;
    for (c = 0; c < 2; c++) {
        int p = (int)comb_p[par[4]], m = (lfo(phase) * par[1]) >> 7;
        p += c ? -((p >> 12) * par[3]) : (p >> 12) * par[3];
        p += ((p >> 4) * (m >> 4)) >> 8;
        if (p < 512) p = 512;
        if (!ns.p[c]) ns.p[c] = p;
        step[c] = (p - ns.p[c]) / 32;
    }
    phase += sync_inc(par[0]) * 32;
    for (c = 0; c < 2; c++) {
        int *buf = mem.comb[c], d = ns.p[c], lp = ns.lp[c], *out = c ? R : L;
        for (f = 0; f < 32; f++) {
            unsigned i;
            int a, b, y;
            d += step[c];
            i = wpos + f - (unsigned)(d >> 8);
            a = buf[i & (LEN - 1)];
            b = buf[(i - 1) & (LEN - 1)];
            lp += mul15(k, clamp(a + (((b - a) * (d & 255)) >> 8) - lp, SIG_MAX));
            y = soft((x[f] + mul15(fb, lp)) >> 1) << 1;
            buf[(wpos + f) & (LEN - 1)] = y;
            out[f] = y;
        }
        ns.p[c] = d; ns.lp[c] = lp;
    }
    wpos += 32;
}

// BITCRUSH, a degrader: OVER drives a soft clip, BITS takes the bits away
// (16 down to 1), SRR holds each sample for up to 64 frames, DEP ring-
// modulates the result with a sine at RATE (30 Hz-8 kHz). DROP mutes it now
// and then, more often and longer the higher; FREZ repeats a slice now and
// then, F.TIM long (in sixteenths of a sequencer step at stock's tempo, 16 a
// step; 0: a random one to four steps).
static int crushed(int v, int g, int ig, int sh)
{
    v = mul15(ig, soft((v * g) >> 10));
    if (sh) v = ((v + (1 << (sh - 1))) >> sh) << sh;
    return v << 1;
}

static void crush(const int *x, int *L, int *R)
{
    int f, g = 512 + par[1] * par[1] / 2, ig = 32768 * 1024 / (g + 512), sh = par[0] * 15 / 127, gs, step;
    int h = 256 + par[2] * par[2], dep = par[5] * 258;
    unsigned rinc = (unsigned)svf_f[par[4]] * 20861u;
    noise();
    if (ns.drop) ns.drop--;
    else if (par[3] && rnd < (unsigned)par[3] * par[3] * 1800u) ns.drop = 4 + par[3] / 2 + (int)(rnd >> 27);
    noise();
    if (!ns.frz_left && par[6] && rnd < (unsigned)par[6] * par[6] * 1200u) {
        int t = tempo(), len = par[7] ? par[7] * 5400000 / t : (1 + (int)(rnd >> 30)) * (86400000 / t);
        ns.frz_len = len < 240 ? 240 : len > 32000 ? 32000 : len;
        ns.frz_start = (int)ns.fw - ns.frz_len;
        ns.frz_pos = 0;
        ns.frz_left = ns.frz_len * (2 + (int)((rnd >> 28) & 3));
    }
    gs = ns.g_drop;
    step = ((ns.drop ? 0 : 32768) - gs) / 32;
    for (f = 0; f < 32; f++) {
        int v, o;
        if (ns.frz_left) {
            v = mem.frz[(ns.frz_start + ns.frz_pos) & (2 * DLEN - 1)] << 1;
            if (++ns.frz_pos >= ns.frz_len) ns.frz_pos = 0;
            ns.frz_left--;
        } else {
            v = x[f];
            mem.frz[ns.fw & (2 * DLEN - 1)] = (short)clamp(v >> 1, 32767);
            ns.fw++;
        }
        gs += step;
        ns.acc[0] += 256;
        if (ns.acc[0] >= h) {
            ns.acc[0] -= h;
            ns.held[0] = clamp(crushed(v, g, ig, sh), SIG_MAX);
        }
        o = ns.held[0];
        if (dep) {
            ns.ph2 += rinc;
            o += mul15(dep, mul15(lfo(ns.ph2), o) - o);
        }
        L[f] = R[f] = mul15(gs, clamp(o, SIG_MAX));
    }
    ns.g_drop = gs;
}

// LOWPASS: a 4-pole (24 dB/octave) resonant low-pass a side, two state-
// variable stages (the resonance in the second), cutoff FREQ (30 Hz-7.5 kHz)
// moved by a tempo-synced LFO (SPD, DEP) that SPH (0: free) restarts at its
// phase on each hit; the right side LAG apart in phase (up to half a cycle)
// and the two SPRD apart in cutoff. RESO takes the input down a little.
static void lowpass(const int *x, int *L, int *R)
{
    int c, f, q = 32767 - par[5] * 250, ig = (q + 24576) * 16384 / 57343, step[2];
    unsigned lag = (unsigned)par[3] << 24;
    if (par[2] && onset(x)) phase = (unsigned)(par[2] - 1) << 25;
    for (c = 0; c < 2; c++) {
        int idx = idx127(par[4] + ((par[1] * lfo(phase + (c ? lag : 0))) >> 16) + (c ? par[6] >> 2 : -(par[6] >> 2)));
        if (!ns.sf[c]) ns.sf[c] = svf_f[idx];
        step[c] = (svf_f[idx] - ns.sf[c]) / 32;
    }
    phase += sync_inc(par[0]) * 32;
    for (c = 0; c < 2; c++) {
        int lo = ns.lo[c], bp = ns.bp[c], lo2 = ns.lo2[c], bp2 = ns.bp2[c], fq = ns.sf[c], *out = c ? R : L;
        for (f = 0; f < 32; f++) {
            fq += step[c];
            svf(&lo, &bp, mul15(ig, x[f]), fq, 23170);      // Q 0.7
            svf(&lo2, &bp2, lo, fq, q);
            out[f] = lo2 << 1;
        }
        ns.lo[c] = lo; ns.bp[c] = bp; ns.lo2[c] = lo2; ns.bp2[c] = bp2; ns.sf[c] = fq;
    }
}

// MULTIFILTER: one state-variable filter, TYPE morphing low-pass -> band-pass
// -> high-pass, cutoff FREQ moved by an ADSR (ENV, signed). Each hit (the
// input's peak half again above its level) starts the attack; it sustains
// while the input sounds and releases when it falls silent. The envelope
// runs at block rate (1.5 kHz): ATK up to 2 s, DEC and REL time constants
// up to 2 s.
static void multi(const int *x, int *L, int *R)
{
    int f, idx, step, q = 32767 - par[5] * 250, t = par[6], ig = (q + 24576) * 16384 / 57343;
    int lo = ns.lo[0], bp = ns.bp[0], fq;
    if (onset(x)) ns.stage = 1;
    if (ns.stage && ns.stage < 3 && ns.env < 1024) ns.stage = 3;
    if (ns.stage == 1) {
        ns.level += 32767 / (1 + par[0] * par[0] / 5);
        if (ns.level >= 32767) ns.level = 32767, ns.stage = 2;
    } else if (ns.stage == 2) {
        ns.level += mul15(32767 / (1 + par[1] * par[1] / 5), par[2] * 258 - ns.level);
    } else if (ns.stage == 3) {
        ns.level -= mul15(32767 / (1 + par[3] * par[3] / 5), ns.level);
        if (ns.level < 8) ns.level = 0, ns.stage = 0;
    }
    idx = par[4] + (((par[7] - 64) * ns.level) >> 14);
    idx = idx < 0 ? 0 : idx > 127 ? 127 : idx;
    if (!ns.sf[0]) ns.sf[0] = svf_f[idx];
    fq = ns.sf[0];
    step = (svf_f[idx] - fq) / 32;
    for (f = 0; f < 32; f++) {
        int hi, o;
        fq += step;
        hi = svf(&lo, &bp, mul15(ig, x[f]), fq, q);
        o = t < 64 ? lo + (((bp - lo) * t) >> 6) : bp + (((hi - bp) * (t - 64)) >> 6);
        L[f] = R[f] = o << 1;
    }
    ns.lo[0] = lo; ns.bp[0] = bp; ns.sf[0] = fq;
}

// DIRT, a dirtshaper: DRV into the soft clip, RECT blending in its full-wave
// rectified signal; HPF is signed: to the left a high-pass before the drive,
// to the right one after the rectifier. NOIS rings a low-passed noise (N.FRQ,
// N.RES) with the driven signal; then a DC blocker and LPF.
static void dirt(const int *x, int *L, int *R)
{
    int f, g = 256 + par[0] * par[0] / 2, ig = 32768 * 768 / (g + 512), h = par[2] - 64, k_l = onepole_k[par[3]];
    int k_pre = h < 0 ? onepole_k[idx127(-2 * h)] : 0, k_post = h > 0 ? onepole_k[idx127(2 * h)] : 0;
    int nf = svf_f[par[5]], nq = 32767 - par[6] * 250, ng = par[4] * 258;
    for (f = 0; f < 32; f++) {
        int v = x[f] >> 1;
        if (k_pre) { ns.hp[0] += mul15(k_pre, clamp(v - ns.hp[0], SIG_MAX)); v -= ns.hp[0]; }
        v = mul15(ig, soft((v * g) >> 8));
        v += (((v < 0 ? -v : v) - v) * par[1]) >> 7;
        if (k_post) { ns.hp[1] += mul15(k_post, clamp(v - ns.hp[1], SIG_MAX)); v -= ns.hp[1]; }
        if (ng) {
            svf(&ns.lo[0], &ns.bp[0], noise() >> 1, nf, nq);
            v += mul15(ng, mul15(ns.lo[0], clamp(v, 32767)));
        }
        ns.dc += (v - ns.dc) >> 10;
        v -= ns.dc;
        ns.lp[0] += mul15(k_l, clamp(v - ns.lp[0], SIG_MAX));
        L[f] = R[f] = ns.lp[0] << 1;
    }
}

// The delays run at 24 kHz: a pair of frames in, one sample a side, and back
// up by a linear step. Their time follows stock's tempo, halved until it
// fits the line, gliding to a new value (about 10 ms), so a tempo or time
// change bends the echoes as a tape would.
static int fit(int d)                            // Q8 samples at 24 kHz
{
    while (d > (DLEN - 64) << 8) d >>= 1;
    return d < 1024 ? 1024 : d;
}

// A note division (div_q1000, quarter notes).
static int delay_time(int div) { return fit((172800 * div_q1000[div < 0 ? 0 : div >= DIVS ? DIVS - 1 : div] / tempo()) << 8); }

static int dread(const short *buf, int d)
{
    unsigned i = ns.dw - (unsigned)(d >> 8);
    int a = buf[i & (DLEN - 1)], b = buf[(i - 1) & (DLEN - 1)];
    return a + (((b - a) * (d & 255)) >> 8);
}

// The two sides' times, gliding: their steps across the block's 16 samples.
static void glide(const int *t, int *step)
{
    int c;
    for (c = 0; c < 2; c++) {
        int o = ns.d[c] ? ns.d[c] : t[c], n = o + ((t[c] - o) >> 4);
        ns.d[c] = o;
        step[c] = (n - o) / 16;
    }
}

// SAT DELAY: TIME in 128th notes (1-128) at stock's tempo. X ON sends the
// repeats from side to side (the input into the left), WDTH setting how far
// they swing; X OFF keeps one delay, placed WDTH (signed) left or right. FDBK
// goes past unity, the repeats passing HPF, LPF and a saturation (DRV) in
// the loop, which holds swelling repeats within the line.
static void satdelay(const int *x, int *L, int *R)
{
    int f, c, fbg = par[3] * 271, wid = par[2] - 64, pp = par[1], g = 256 + par[6] * 6, ig = 8388608 / g, mk = (g + 256) >> 1;
    int amt = (wid < 0 ? -wid : wid) * 520, gl = wid > 0 ? 32767 - wid * 512 : 32767, gr = wid < 0 ? 32767 + wid * 512 : 32767;
    int k_h = par[4] ? onepole_k[par[4]] : 0, k_l = onepole_k[par[5]], t[2], step[2];
    t[0] = t[1] = fit(((par[0] + 1) * 5400000 / tempo()) << 8);
    glide(t, step);
    for (f = 0; f < 32; f += 2) {
        int in = (x[f] + x[f + 1]) >> 2, s[2], o[2];
        for (c = 0; c < 2; c++) {
            int v;
            ns.d[c] += step[c];
            v = dread(mem.d[c], ns.d[c]);
            if (k_h) { ns.hp[c] += mul15(k_h, v - ns.hp[c]); v -= ns.hp[c]; }
            ns.lp[c] += mul15(k_l, clamp(v - ns.lp[c], 32767));
            s[c] = sat(ns.lp[c], g, ig);
        }
        if (pp) {
            int m = (s[0] + s[1]) >> 1;
            mem.d[0][ns.dw & (DLEN - 1)] = (short)clamp(in + mul15(fbg, s[1]), 32767);
            mem.d[1][ns.dw & (DLEN - 1)] = (short)clamp(mul15(fbg, s[0]), 32767);
            o[0] = m + mul15(amt, s[0] - m);
            o[1] = m + mul15(amt, s[1] - m);
        } else {
            mem.d[0][ns.dw & (DLEN - 1)] = mem.d[1][ns.dw & (DLEN - 1)] = (short)clamp(in + mul15(fbg, s[0]), 32767);
            o[0] = mul15(gl, s[0]);
            o[1] = mul15(gr, s[0]);
        }
        ns.dw++;
        for (c = 0; c < 2; c++) {
            int *out = c ? R : L, v = (o[c] * mk) >> 7;
            out[f] = (ns.out[c] + v) >> 1;
            out[f + 1] = v;
            ns.out[c] = v;
        }
    }
}

// STEREO DELAY: TIME a division; DRV saturates the input; SKEW sets the
// right side's time against the left's in a rhythmic ratio (1:2 to 2:1);
// MOD wobbles both times (0.5 Hz, the right a quarter cycle on, up to
// 2.6 ms); FILT (signed) low-passes (left) or high-passes (right) the
// repeats; WDTH spreads the two sides from mono to full.
static const short skew_q8[7] = { 128, 171, 192, 256, 341, 384, 512 };
static const char skew_name[7][4] = { "1:2", "2:3", "3:4", "1:1", "4:3", "3:2", "2:1" };

static void stdelay(const int *x, int *L, int *R)
{
    int f, c, fbg = par[2] * 253, w = par[3] * 258, g = 256 + par[0] * 6, ig = 8388608 / g, mk = (g + 256) >> 1;
    int ft = par[6] - 64, d = delay_time(par[1]), r = skew_q8[par[5] * 7 / 128], t[2], step[2], k = 0;
    if (ft < 0) k = onepole_k[idx127(127 + 2 * ft)];
    else if (ft > 0) k = onepole_k[2 * ft];
    t[0] = d;
    t[1] = (d >> 8) * r;
    while (t[1] > (DLEN - 64) << 8) t[0] >>= 1, t[1] >>= 1;
    t[0] += (par[4] * lfo(phase)) >> 8;
    t[1] += (par[4] * lfo(phase + 0x40000000u)) >> 8;
    for (c = 0; c < 2; c++) t[c] = t[c] < 1024 ? 1024 : t[c] > (DLEN - 64) << 8 ? (DLEN - 64) << 8 : t[c];
    phase += (rate[82] >> 1) * 32;
    glide(t, step);
    for (f = 0; f < 32; f += 2) {
        int in = sat((x[f] + x[f + 1]) >> 2, g, ig), sv[2], m;
        for (c = 0; c < 2; c++) {
            int v;
            ns.d[c] += step[c];
            v = dread(mem.d[c], ns.d[c]);
            if (ft) {
                ns.lp[c] += mul15(k, clamp(v - ns.lp[c], 32767));
                v = ft < 0 ? ns.lp[c] : v - ns.lp[c];
            }
            sv[c] = v;
            mem.d[c][ns.dw & (DLEN - 1)] = (short)clamp(in + mul15(fbg, v), 32767);
        }
        ns.dw++;
        m = (sv[0] + sv[1]) >> 1;
        for (c = 0; c < 2; c++) {
            int *out = c ? R : L, o = ((m + mul15(w, sv[c] - m)) * mk) >> 7;
            out[f] = (ns.out[c] + o) >> 1;
            out[f + 1] = o;
            ns.out[c] = o;
        }
    }
}

// CHRONO PITCH: a granular pitch shifter. Two grains read the line, gliding
// at TUNE's ratio (+-24 semitones) through a WIN window (10-80 ms), half a
// window apart and faded in and out by triangles that sum to one; DEP adds a
// vibrato (SPD); FDBK sends the result back into the line; HPF and LPF on the
// return. Mono.
static void chrono(const int *x, int *L, int *R)
{
    int f, w = (480 + par[1] * 27) << 8, lo = 24 << 8, fb = par[2] * 250;
    int k_h = par[4] ? onepole_k[par[4]] : 0, k_l = onepole_k[par[5]];
    int ratio = (int)(pitch_q16[24 + (par[0] - 64) * 24 / 64] >> 8) + ((lfo(phase) * par[3]) >> 19);
    int d = ns.dl, step = 256 - ratio, inv = (1 << 24) / (w >> 8);
    phase += (rate[par[6]] >> 1) * 32;
    if (d < lo || d >= lo + w) d = lo + w / 2;
    for (f = 0; f < 32; f++) {
        int db, pa, ga, y;
        d += step;
        if (d < lo) d += w;
        else if (d >= lo + w) d -= w;
        db = d + w / 2;
        if (db >= lo + w) db -= w;
        pa = (((d - lo) >> 8) * inv) >> 8;       // 0..65535 across the window
        ga = 32768 - (pa > 32768 ? pa - 32768 : 32768 - pa);
        y = mul15(ga, tap((unsigned)d)) + mul15(32768 - ga, tap((unsigned)db));
        mem.line[wpos & (LEN - 1)] = clamp(x[f] + mul15(fb, y), SIG_MAX);
        wpos++;
        if (k_h) { ns.hp[0] += mul15(k_h, clamp(y - ns.hp[0], SIG_MAX)); y -= ns.hp[0]; }
        ns.lp[0] += mul15(k_l, clamp(y - ns.lp[0], SIG_MAX));
        L[f] = R[f] = ns.lp[0];
    }
    ns.dl = d;
}

// FILTER FOLDER: ILEV in, HP, a triangle wavefolder (FOLD, 1x-13x into it),
// a multimode filter (FREQ, RESO, TYPE: LP4, LP2, BP2, HP2, low-pass after a
// notch, NOTCH, a deeper notch, OFF), then a post distortion (DIST) and OLEV
// out. Mono.
static const char type8_name[8][5] = { "LP4", "LP2", "BP2", "HP2", "LPN", "NOT1", "NOT2", "OFF" };

static void folder(const int *x, int *L, int *R)
{
    int f, il = par[0] * 4, ol = par[3] * 4, g = 256 + par[2] * 24, t = par[6] >> 4, k_h = par[1] ? onepole_k[par[1]] : 0;
    int fq = svf_f[par[4]], q = 32767 - par[5] * 250, ig = (q + 24576) * 16384 / 57343, dg = 256 + par[7] * par[7] / 4;
    for (f = 0; f < 32; f++) {
        int v = (x[f] * il) >> 9, u, hi;
        if (k_h) { ns.hp[0] += mul15(k_h, clamp(v - ns.hp[0], SIG_MAX)); v -= ns.hp[0]; }
        u = (((v * g) >> 9) + 16384) & 65535;     // fold into +-16384
        v = clamp((16384 - (u > 32768 ? u - 32768 : 32768 - u)) << 1, 32767);
        if (t != 7) {
            hi = svf(&ns.lo[0], &ns.bp[0], mul15(ig, v), fq, q);
            switch (t) {
            case 0: svf(&ns.lo2[0], &ns.bp2[0], ns.lo[0], fq, 23170); v = ns.lo2[0]; break;
            case 1: v = ns.lo[0]; break;
            case 2: v = ns.bp[0]; break;
            case 3: v = hi; break;
            case 4: svf(&ns.lo2[0], &ns.bp2[0], clamp(ns.lo[0] + hi, 32767), fq, 23170); v = ns.lo2[0]; break;
            case 5: v = clamp(ns.lo[0] + hi, 32767); break;
            default: hi = svf(&ns.lo2[0], &ns.bp2[0], clamp(ns.lo[0] + hi, 32767), fq, q); v = clamp(ns.lo2[0] + hi, 32767); break;
            }
        }
        v = soft((v * dg) >> 8);
        L[f] = R[f] = (v * ol) >> 7;
    }
}

// FILTERBANK: eight fixed bands, each with its gain: a low-pass at 90 Hz,
// band-passes at 122, 225, 418, 777, 1446 and 2689 Hz (state-variable, at
// 24 kHz, about an octave wide) and a high-pass at 4 kHz. Mono.
static void bank(const int *x, int *L, int *R)
{
    int f, b, g[8];
    for (b = 0; b < 8; b++) g[b] = par[b] * 258;
    for (f = 0; f < 32; f += 2) {
        int in = (x[f] + x[f + 1]) >> 2, mid = 0, k;
        for (b = 0; b < 6; b++) {
            svf(&ns.bank_lo[b], &ns.bank_bp[b], in, bank_f[b], 11585);
            mid += mul15(g[b + 1], (ns.bank_bp[b] * 11585) >> 14);
        }
        for (k = 0; k < 2; k++) {
            int v = x[f + k] >> 1, o;
            ns.lp[0] += mul15(384, v - ns.lp[0]);        // 90 Hz
            ns.lp[1] += mul15(13372, v - ns.lp[1]);      // 4 kHz
            o = (k ? mid : (ns.out[0] + mid) >> 1) + mul15(g[0], ns.lp[0]) + mul15(g[7], v - ns.lp[1]);
            L[f + k] = R[f + k] = o << 1;
        }
        ns.out[0] = mid;
    }
}

// FREQ WARPER: a frequency shifter, at 24 kHz. Two chains of four all-pass
// stages (Olli Niemitalo's published coefficients) split the input into two
// signals 90 degrees apart, which a quadrature sine moves by SHFT (signed, up
// to 2 kHz); an LFO (SPD, DEP up to 500 Hz; SPH restarts it on each hit, LAG
// sets the right side apart) moves the shift, SPRD moves the right side's
// further; SBND blends towards the other sideband.
static const short hilbert_a[2][4] = { { 22688, 30673, 32382, 32727 }, { 13179, 28055, 31860, 32613 } };

static int sine(unsigned ph)
{
    unsigned i = ph >> 24;
    int a = sine_q15[i], b = sine_q15[i + 1];
    return a + (((b - a) * (int)((ph >> 16) & 255)) >> 8);
}

static void warper(const int *x, int *L, int *R)
{
    int f, c, s = par[4] - 64, hz = (s < 0 ? -1 : 1) * (s * s * 2000 / 4096), inc[2], sb = par[6] * 258;
    unsigned lag = (unsigned)par[3] << 24;
    if (par[2] && onset(x)) phase = (unsigned)(par[2] - 1) << 25;
    for (c = 0; c < 2; c++) {
        int h = hz + ((par[1] * lfo(phase + (c ? lag : 0))) >> 13) + (c ? par[5] * 4 : 0);
        inc[c] = h * 178957;                     // 2^32 / 24000 a hertz
    }
    phase += (rate[par[0]] >> 1) * 32;
    for (f = 0; f < 32; f += 2) {
        int v[2], k;
        v[0] = v[1] = (x[f] + x[f + 1]) >> 2;
        for (k = 0; k < 2; k++) {
            int st;
            for (st = 0; st < 4; st++) {
                int *a = ns.ap[k][st], y = mul15(hilbert_a[k][st], v[k] + a[3]) - a[1];
                a[1] = a[0]; a[0] = v[k]; a[3] = a[2]; a[2] = y;
                v[k] = clamp(y, 32767);
            }
        }
        k = ns.apq; ns.apq = v[1]; v[1] = k;     // the second chain a sample later
        for (c = 0; c < 2; c++) {
            int *out = c ? R : L, co, si, up, dn, o;
            ns.osc[c] += (unsigned)inc[c];
            co = sine(ns.osc[c] + 0x40000000u);
            si = sine(ns.osc[c]);
            up = mul15(co, v[0]) + mul15(si, v[1]);   // the shifted sideband (host test: 1 kHz + 1938 Hz -> 2.94 kHz)
            dn = mul15(co, v[0]) - mul15(si, v[1]);
            o = (up + mul15(sb, dn - up)) << 1;
            out[f] = (ns.out[c] + o) >> 1;
            out[f + 1] = o;
            ns.out[c] = o;
        }
    }
}

static void run_fx(int type, const int *x, int *L, int *R)
{
    switch (type) {
    case FX_FLANGER: flanger(x, L, R); break;
    case FX_PHASER: phaser(x, L, R); break;
    case FX_WOW: wow(x, L, R); break;
    case FX_COMB: comb(x, L, R); break;
    case FX_CRUSH: crush(x, L, R); break;
    case FX_LOWPASS: lowpass(x, L, R); break;
    case FX_MULTI: multi(x, L, R); break;
    case FX_DIRT: dirt(x, L, R); break;
    case FX_SATDLY: satdelay(x, L, R); break;
    case FX_STDLY: stdelay(x, L, R); break;
    case FX_CHRONO: chrono(x, L, R); break;
    case FX_FOLDER: folder(x, L, R); break;
    case FX_BANK: bank(x, L, R); break;
    case FX_WARPER: warper(x, L, R); break;
    default: chorus(x, L, R); break;
    }
}

// Each effect's return level against the chorus's, measured on a long snare
// (TESTING.md), Q8: the effects sound as loud as each other at one LEV.
static const unsigned short trim[FX_TYPES] = { 256, 256, 256, 359, 147, 139, 573, 350, 151, 183, 211, 352, 74, 375, 245 };

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
    if (clear_at < POOL) {                       // the pool clean first, a step a block
        for (f = 0; f < CLEAR_STEP; f++) mem.w[clear_at + f] = 0;
        clear_at += CLEAR_STEP;
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

    run_fx(type, x, L, R);

    tlev = (lev * lev * trim[type]) >> 8;        // Q13: LEV 127 is about 2x, 71 about 0.6x
    slev = (tlev - g_lev) / 32;
    for (f = 0; f < 32; f++) {
        volatile int *out = PRE(slot, f);
        int l, r;
        g_lev += slev;
        l = ((g_lev * (clamp(L[f], SIG_MAX) >> 1)) >> 12) << 7;   // 16 bits -> 24, as the chorus was heard
        r = ((g_lev * (clamp(R[f], SIG_MAX) >> 1)) >> 12) << 7;
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
    for (k = 0; k < 8; k++)
        if (par[k] > top_of(t, k)) par[k] = (unsigned char)top_of(t, k);
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
    if (page && key >= KEY_PUSH_FIRST && key <= KEY_PUSH_LAST)
        return 1;                                // an encoder pressed on a mod page: nothing, the page stays
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
    per = func && enc == 0 ? TYPE_COUNTS : !func && page == 1 && effects[fx_type].c[enc].icon == IC_SYNC ? SYNC_COUNTS : COUNTS;
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
        par[enc] = (unsigned char)(v < 0 ? 0 : v > top_of(fx_type, enc) ? top_of(fx_type, enc) : v);
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
static void label(int cx, int y, const char *t) { TEXT_DRAW(g_bmp, font(), cx, 63 - y, 1, 0, t[0] && t[1] && t[2] && t[3] && t[4] ? "XXXXX" : "XXXX", "%s", t); }
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

// kind IC_LPF, IC_HPF or IC_BAND (a peak, res 0..127 tall).
static void filter_curve(int x0, int y0, int x1, int y1, int kind, int v, int res)
{
    // the corner stays inside the box at both ends, so the slope always shows
    int x, w = x1 - x0 - 12, fx = x0 + 6 + w * v / 127, top = y0 + 4, bot = y1 - 2, last = -1;
    box(x0, y0, x1, y1);
    for (x = x0 + 2; x <= x1 - 2; x++) {
        int d = kind == IC_LPF ? x - fx : kind == IC_HPF ? fx - x : x > fx ? x - fx : fx - x;
        int y = d <= 0 ? top : top + d * 2;
        if (kind == IC_BAND && d < 3) y -= res / 32 - d > 0 ? res / 32 - d : 0;
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

// A sine-like wave (the LFO's shape), cycles across w pixels.
static void sine_wave(int x0, int y, int w, int amp, int cycles)
{
    int i, last = 0;
    unsigned step = 0xffffffffu / (unsigned)w * (unsigned)cycles;
    for (i = 0; i < w; i++) {
        int yy = y - ((amp * lfo(i * step + 0xc0000000u)) >> 15);
        if (i && (yy - last > 1 || last - yy > 1)) line_to(x0 + i - 1, last, x0 + i, yy);
        else px(x0 + i, yy, 1);
        last = yy;
    }
}

static void circle(int cx, int cy, int r)
{
    int x = r, y = 0, err = 1 - r, i;
    for (i = 0; i <= r && y <= x; i++, y++) {    // bounded: an octant
        px(cx + x, cy + y, 1); px(cx - x, cy + y, 1); px(cx + x, cy - y, 1); px(cx - x, cy - y, 1);
        px(cx + y, cy + x, 1); px(cx - y, cy + x, 1); px(cx + y, cy - x, 1); px(cx - y, cy - x, 1);
        if (err < 0) err += 2 * y + 3;
        else { x--; err += 2 * (y - x) + 3; }
    }
}

static void slider(int cx, int cy, int v)
{
    box(cx - 9, cy - 3, cx + 9, cy + 3);
    rect(cx - 7, cy - 1, cx - 7 + v * 14 / 127, cy + 1, 1);
}

static void widget(int k, int cx, int cy, int v, int next)
{
    static const signed char star_x[6] = { 6, 5, 3, 0, -3, -5 }, star_y[6] = { 0, 3, 5, 6, 5, 3 };
    static const signed char nz_x[10] = { -2, 1, -1, 2, 0, -2, 2, -3, 1, 3 }, nz_y[10] = { 3, 1, -1, 4, 5, -3, -5, 0, -3, 2 };
    int i;
    switch (effects[fx_type].c[k].icon) {
    case IC_NOISE:                               // a tall box, more grains the higher
        box(cx - 5, cy - 9, cx + 5, cy + 8);
        for (i = 0; i < 2 + v * 8 / 127; i++) px(cx + nz_x[i], cy + nz_y[i], 1);
        break;
    case IC_SLIDE: slider(cx, cy, v); break;
    case IC_BITS: {                              // stairs: fewer, taller steps the fewer bits
        int n = 2 + v * 5 / 127, x = cx - 9, y = cy + 6, sw = 18 / n, sh = 12 / n;
        for (i = 0; i < n; i++) {
            line_to(x, y, x + sw, y);
            line_to(x + sw, y, x + sw, y - sh);
            x += sw; y -= sh;
        }
        break;
    }
    case IC_DRIVE: {                             // a dotted dial
        unsigned j;
        for (j = 0; j < sizeof ring_dx; j += 3) px(cx + ring_dx[j], cy + ring_dy[j], 1);
        line_to(cx, cy, cx + ptr_dx[v & 127], cy + ptr_dy[v & 127]);
        break;
    }
    case IC_STAR: {
        int r = 5 + v * 2 / 127;
        for (i = 0; i < 6; i++)
            line_to(cx - star_x[i] * r / 6, cy - star_y[i] * r / 6, cx + star_x[i] * r / 6, cy + star_y[i] * r / 6);
        break;
    }
    case IC_DROP:                                // a face, sadder past the middle
        circle(cx, cy, 7);
        px(cx - 3, cy - 2, 1); px(cx + 3, cy - 2, 1);
        for (i = -3; i <= 3; i++) px(cx + i, v < 64 ? cy + 1 + (9 - i * i) / 3 : cy + 4 - (9 - i * i) / 3, 1);
        break;
    case IC_BAND:                                // spans its column and the next
        filter_curve(cx - 11, cy - 9, cx + 37, cy + 8, IC_BAND, v, next);
        break;
    case IC_TYPE:
        filter_curve(cx - 10, cy - 9, cx + 10, cy + 8, v < 43 ? IC_LPF : v < 86 ? IC_BAND : IC_HPF, 64, 0);
        break;
    case IC_TILT:                                // signed: low-pass, flat, high-pass
        if (v == 64) { box(cx - 10, cy - 9, cx + 10, cy + 8); rect(cx - 8, cy - 5, cx + 8, cy - 5, 1); }
        else filter_curve(cx - 10, cy - 9, cx + 10, cy + 8, v < 64 ? IC_LPF : IC_HPF, v < 64 ? v * 2 : (v - 64) * 2, 0);
        break;
    case IC_ENV: {                               // an ADSR, the attack as set
        int xa = cx - 10 + v * 6 / 127, xd = xa + 4, xs = cx + 5;
        line_to(cx - 11, cy + 7, xa, cy - 7); line_to(xa, cy - 7, xd, cy - 1);
        line_to(xd, cy - 1, xs, cy - 1); line_to(xs, cy - 1, cx + 11, cy + 7);
        rect(xa - 1, cy - 8, xa + 1, cy - 6, 1); rect(xd - 1, cy - 2, xd + 1, cy, 1); rect(xs - 1, cy - 2, xs + 1, cy, 1);
        break;
    }
    case IC_RECT: {                              // a sine, its lower half folded up as set
        int last = 0;
        unsigned step = 0xffffffffu / 21;
        for (i = 0; i < 21; i++) {
            int s = lfo(i * step + 0xc0000000u), yy;
            if (s < 0) s += (-2 * s) * v / 127;
            yy = cy + 2 - ((5 * s) >> 15);
            if (i && (yy - last > 1 || last - yy > 1)) line_to(cx - 11 + i, last, cx - 10 + i, yy);
            else px(cx - 10 + i, yy, 1);
            last = yy;
        }
        for (i = cy - 7; i <= cy + 7; i += 2) px(cx + 3, i, 1);
        break;
    }
    case IC_T128: {                              // 128th notes: a note's name where one fits, over a slider
        static const unsigned char n128[14] = { 1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64, 96, 128 };
        static const char name128[14][6] = { "1/128", "1/64", "1/64.", "1/32", "1/32.", "1/16", "1/16.", "1/8", "1/8.", "1/4", "1/4.", "1/2", "1/2.", "1" };
        int j, shown = 0;
        for (j = 0; j < 14; j++)
            if (n128[j] == v + 1) { label(cx, cy - 1, name128[j]); shown = 1; }
        if (!shown) label_value(cx, cy - 1, v + 1);
        rect(cx - 9, cy + 3, cx + 9, cy + 3, 1);
        i = cx - 9 + v * 18 / 127;
        rect(i - 1, cy + 1, i + 1, cy + 5, 1);
        break;
    }
    case IC_SWITCH:                              // OFF / ON
        box(cx - 10, cy - 7, cx + 10, cy + 5);
        if (v) box(cx - 8, cy - 5, cx + 8, cy + 3);
        TEXT_DRAW(g_bmp, font(), cx, 63 - (cy + 2), 1, 0, "OFF", v ? "ON" : "OFF");
        break;
    case IC_VBAR:                                // a band's gain: a tall slider
        box(cx - 4, cy - 9, cx + 4, cy + 8);
        i = v * 15 / 127;
        if (i) rect(cx - 2, cy + 6 - i, cx + 2, cy + 6, 1);
        break;
    case IC_FOLD: {                              // a sine folded back on itself, more the higher
        int last = 0, a = 4 + v / 12;
        unsigned st = 0xffffffffu / 21;
        for (i = 0; i < 21; i++) {
            int y = (a * lfo(i * st + 0xc0000000u)) >> 15, yy;   // -a..a over a height of 6
            while (y > 6 || y < -6) y = y > 0 ? 12 - y : -12 - y;
            yy = cy - y;
            if (i && (yy - last > 1 || last - yy > 1)) line_to(cx - 11 + i, last, cx - 10 + i, yy);
            else px(cx - 10 + i, yy, 1);
            last = yy;
        }
        break;
    }
    case IC_TYPE8:
        box(cx - 11, cy - 8, cx + 11, cy + 8);
        label(cx, cy + 3, type8_name[v >> 4]);
        break;
    case IC_SHIFT: {                             // three lines moved along by the shift
        int o = (v - 64) / 16;
        rect(cx - 10, cy + 6, cx + 10, cy + 6, 1);
        for (i = -8; i <= 2; i += 5) line_to(cx + i + o, cy + 6, cx + i + o, cy - 2);
        line_to(cx + 5, cy - 6, cx + 10, cy - 6);
        if (v >= 64) { line_to(cx + 8, cy - 8, cx + 10, cy - 6); line_to(cx + 8, cy - 4, cx + 10, cy - 6); }
        else { line_to(cx + 7, cy - 8, cx + 5, cy - 6); line_to(cx + 7, cy - 4, cx + 5, cy - 6); }
        break;
    }
    case IC_BLEND:                               // one sideband to the other
        sine_wave(cx - 10, cy, 21, 5, 1);
        tri_wave(cx - 10, cy, 21, 1 + v / 26, 1, 1);
        break;
    case IC_SYNC:                                // the division over a slider
        label(cx, cy - 1, div_name[v < DIVS ? v : DIVS - 1]);
        rect(cx - 9, cy + 3, cx + 9, cy + 3, 1);
        i = cx - 9 + v * 18 / (DIVS - 1);
        rect(i - 1, cy + 1, i + 1, cy + 5, 1);
        break;
    case IC_MOD:
        sine_wave(cx - 10, cy - 3, 21, 1 + v / 43, 3);
        tri_wave(cx - 10, cy + 4, 21, 1 + v / 43, 3, 0);
        break;
    case IC_SKEW: {                              // one line forking in two, the longer side as set
        int s = (v - 64) / 10;
        line_to(cx - 9, cy, cx - 4, cy);
        line_to(cx - 4, cy, cx + 4, cy - 5); line_to(cx + 4, cy - 5, cx + 9 - (s > 0 ? 0 : -s), cy - 5);
        line_to(cx - 4, cy, cx + 4, cy + 5); line_to(cx + 4, cy + 5, cx + 9 - (s < 0 ? 0 : s), cy + 5);
        break;
    }
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
        filter_curve(cx - 10, cy - 9, cx + 10, cy + 8, effects[fx_type].c[k].icon, v, 0);
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

// A value shown by name: OFF (a free LFO), RAND, a skew ratio.
static const char *special(int k)
{
    int v = par[k];
    if ((fx_type == FX_COMB || fx_type == FX_LOWPASS) && k == 2 && !v) return "OFF";
    if (((fx_type == FX_CRUSH && k == 7) || (fx_type == FX_WOW && k == 0)) && !v) return "RAND";
    if (fx_type == FX_STDLY && k == 5) return skew_name[v * 7 / 128];
    if (fx_type == FX_WARPER && k == 2 && !v) return "OFF";
    if (fx_type == FX_FOLDER && k == 6) return type8_name[v >> 4];
    return 0;
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
        if (shown_knob == k && special(k)) label(cx, ly, special(k));
        else if (shown_knob == k && c->icon == IC_BITS) label_value(cx, ly, 16 - par[k] * 15 / 127);   // the bits left
        else if (shown_knob == k && fx_type == FX_CHRONO && k == 0) label_value(cx, ly, (par[k] - 64) * 24 / 64);   // semitones
        else if (shown_knob == k && c->icon != IC_SYNC) label_value(cx, ly, bipolar(fx_type, k) ? par[k] - 64 : par[k]);
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
