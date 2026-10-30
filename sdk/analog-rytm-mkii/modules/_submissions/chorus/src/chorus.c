// SPDX-License-Identifier: GPL-3.0-or-later
// CHORUS, a send effect for the Modwerk base on the Analog Rytm MKII: one record in the base's FX list (mw_fx).
// At 24 kHz: two taps swept by one LFO, the right WDTH out of phase, through a feedback line and one-pole
// high- and low-pass filters. The DSP is Send FX's chorus, unchanged.
#include "modwerk/fx.h"

#define LEN 4096                   // the modulation line, a power of two: 170 ms at 24 kHz
#define SIG_MAX 65535
#define N24 MW_FX_N24

static int s_base, s_depth, s_fbk;               // smoothed delay (Q8) and feedback (Q15)
static int lp_l, lp_r, hp_l, hp_r, k_lp, k_hp;   // the wet filters
static unsigned wpos, phase;

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

// 4-point Hermite read of the line, d samples behind the newest (Q8), the newest written at wp - 1.
static inline __attribute__((always_inline)) int tap(const int *line, unsigned wp, unsigned d)
{
    unsigned i = (wp - 1 - (d >> 8)) & (LEN - 1);
    const int *p = &line[i];
    int f = (int)(d & 255), xm1, x0 = p[0], x1, x2, c, v, w, a, b, r;
    if (i - 2 <= LEN - 4) {
        xm1 = p[1]; x1 = p[-1]; x2 = p[-2];
    } else {
        xm1 = line[(i + 1) & (LEN - 1)]; x1 = line[(i - 1) & (LEN - 1)]; x2 = line[(i - 2) & (LEN - 1)];
    }
    c = (x1 - xm1) >> 1; v = x0 - x1; w = c + v;
    a = w + v + ((x2 - x0) >> 1); b = w + a;
    r = ((a * f) >> 8) - b;
    r = ((r * f) >> 8) + c;
    return ((r * f) >> 8) + x0;
}

// A one-pole coefficient for 48 kHz at 24 kHz: 1 - (1 - k)^2.
static int k24(int k) { return 2 * k - ((k * k) >> 15); }

static inline __attribute__((always_inline)) void wet_filters(int *l, int *r)
{
    if (k_hp) {
        hp_l += mul15(k_hp, *l - hp_l); hp_r += mul15(k_hp, *r - hp_r);
        *l -= hp_l; *r -= hp_r;
    }
    lp_l += mul15(k_lp, clamp(*l - lp_l, SIG_MAX)); lp_r += mul15(k_lp, clamp(*r - lp_r, SIG_MAX));
    *l = lp_l; *r = lp_r;
}

static void reset(int *work)
{
    (void)work;
    lp_l = lp_r = hp_l = hp_r = 0;
    s_base = s_depth = s_fbk = 0;
}

// The LFO is worked out at each end of the block and its delays stepped in between.
static void render(const int *x, int *L, int *R, const unsigned char *par, int *line)
{
    int f, base = (48 + par[2] * 11) << 7, depth = par[1] << 8, fb = par[4] * 220;   // 1-30 ms, DEP up to 5.3 ms
    unsigned inc = mw_fx_rate[par[0]] >> 1, wid = (unsigned)par[3] * (0x80000000u / 127), wp = wpos;   // 0.01-5 Hz
    int dl, dr, sl, sr, sf;
    if (depth > base - (12 << 8)) depth = base - (12 << 8);
    if (depth < 0) depth = 0;
    dl = s_base + ((s_depth >> 8) * lfo(phase) >> 7);
    dr = s_base + ((s_depth >> 8) * lfo(phase + wid) >> 7);
    phase += inc * 32;
    sl = (base + ((depth >> 8) * lfo(phase) >> 7) - dl) / N24;
    sr = (base + ((depth >> 8) * lfo(phase + wid) >> 7) - dr) / N24;
    sf = (fb - s_fbk) / N24;
    k_hp = par[5] ? k24(mw_fx_onepole[par[5]]) : 0;
    k_lp = k24(mw_fx_onepole[par[6]]);
    for (f = 0; f < N24; f++) {
        int l, r;
        dl += sl; dr += sr; s_fbk += sf;
        l = tap(line, wp, (unsigned)dl);
        r = tap(line, wp, (unsigned)dr);
        line[wp & (LEN - 1)] = clamp(x[f] + mul15(s_fbk, (l + r) >> 1), SIG_MAX);
        wp++;
        wet_filters(&l, &r);
        L[f] = l; R[f] = r;
    }
    wpos = wp;
    s_base = base; s_depth = depth; s_fbk = fb;
}

const struct mw_fx chorus_fx = {
    MW_FX_ABI, 1, 0, MW_FX_24K | MW_FX_LIFT, 256, LEN, "CHORUS",
    { { "SPD", MW_IC_DIAL, 64, 0 }, { "DEP", MW_IC_DEPTH, 64, 0 }, { "TIME", MW_IC_DIAL, 48, 0 },
      { "WDTH", MW_IC_WIDTH, 127, 0 }, { "FDBK", MW_IC_FDBK, 0, 0 }, { "HPF", MW_IC_HPF, 0, 0 },
      { "LPF", MW_IC_LPF, 127, 0 }, { "", MW_IC_EMPTY, 0, 0 } },
    reset, render, 0
};
