// SPDX-License-Identifier: GPL-3.0-or-later
// FLANGER, a send effect for the Modwerk base on the Analog Rytm MKII: one record in the base's FX list (mw_fx).
// A barber-pole sweep: two taps glide the same way through the delay, half a cycle apart, each faded in and out
// (sin^2 windows that sum to one), so the sweep rises or falls without end; the right side crosses the fades, so
// its sweep runs against the left's. SPD sets the speed and the direction, DEP the span, TUNE the shortest delay,
// FDBK the (signed) resonance. At 48 kHz. The DSP is Send FX's flanger, unchanged.
#include "modwerk/fx.h"

#define LEN 4096                   // the modulation line, a power of two: 85 ms
#define SIG_MAX 65535

static int s_base, s_fbk;                        // smoothed delay (Q8) and feedback (Q15)
static int lp_l, lp_r, k_lp;                     // the wet low-pass
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

static void reset(int *work)
{
    (void)work;
    lp_l = lp_r = 0;
    s_base = s_fbk = 0;
}

static void render(const int *x, int *L, int *R, const unsigned char *par, int *line)
{
    int f, d = par[0] - 64, fb = (par[3] - 64) * 440;
    int lo = (6 + par[2] * 2) << 8, span = 2 + par[1] * 4;      // 0.1-5.4 ms, up to 10.6 ms
    unsigned inc = d ? mw_fx_rate[(d < 0 ? -d : d) * 2 - 1] >> 1 : 0;   // up to 5 Hz; index 1-127
    int ga, sg, sf = (fb - s_fbk) / 32, sb = (lo - s_base) / 32;
    unsigned step = d < 0 ? -inc : inc, wp = wpos;
    ga = (32768 - lfo(phase)) >> 1;
    sg = (((32768 - lfo(phase + step * 32)) >> 1) - ga) / 32;   // the fade, stepped across the block
    k_lp = mw_fx_onepole[par[4]];
    for (f = 0; f < 32; f++) {
        unsigned pa, pb;
        int gb, ta, tb, out[2];
        s_fbk += sf; s_base += sb; ga += sg;
        phase += step;
        pa = phase; pb = pa + 0x80000000u;
        gb = 32768 - ga;                         // sin^2 and cos^2
        ta = tap(line, wp, (unsigned)(s_base + ((span * (int)(pa >> 16)) >> 8)));
        tb = tap(line, wp, (unsigned)(s_base + ((span * (int)(pb >> 16)) >> 8)));
        // The left fades the taps one way, the right the other: two taps in all, the cost of the chorus.
        out[0] = mul15(ga, ta) + mul15(gb, tb);
        out[1] = mul15(gb, ta) + mul15(ga, tb);
        line[wp & (LEN - 1)] = clamp(x[f] + mul15(s_fbk, out[0]), SIG_MAX);
        wp++;
        lp_l += mul15(k_lp, clamp(out[0] - lp_l, SIG_MAX)); lp_r += mul15(k_lp, clamp(out[1] - lp_r, SIG_MAX));
        L[f] = lp_l; R[f] = lp_r;
    }
    wpos = wp;
    s_fbk = fb; s_base = lo;
}

const struct mw_fx flanger_fx = {
    MW_FX_ABI, 2, 0, 0, 256, LEN, "FLANGER",
    { { "SPD", MW_IC_BIP, 90, MW_FX_BIPOLAR }, { "DEP", MW_IC_DIAL, 64, 0 }, { "TUNE", MW_IC_TUNE, 16, 0 },
      { "FDBK", MW_IC_FDBK, 96, MW_FX_BIPOLAR }, { "LPF", MW_IC_LPF, 127, 0 }, { "", MW_IC_EMPTY, 0, 0 },
      { "", MW_IC_EMPTY, 0, 0 }, { "", MW_IC_EMPTY, 0, 0 } },
    reset, render, 0
};
