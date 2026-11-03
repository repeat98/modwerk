// SPDX-License-Identifier: GPL-3.0-or-later
// PHASER, a send effect for the Modwerk base on the Analog Rytm MKII: one record in the base's FX list (mw_fx).
// 2-8 first-order all-pass stages per side; their centre frequency FREQ swept by an LFO (SPD, DEP; SHP squares
// it, LAG slows its moves), the right side WDTH out of phase; FDBK feeds the output back (signed). The return is
// input plus stages, which digs the notches. The stages run at a quarter of the level (|v| within 2^15), so a
// stage is one multiply with no clamp. It runs at 24 kHz: allpass_a (20 Hz-20 kHz at 48 kHz, 25.6 entries an
// octave) read 26 entries on, up to 10 kHz. The DSP is Send FX's phaser, unchanged.
#include "modwerk/fx.h"
#include "allpass.h"

#define MAX_STAGES 8
#define N24 MW_FX_N24

static int ap_x[2][MAX_STAGES], ap_y[2][MAX_STAGES], ap_a[2], ph_lag[2], ph_last[2];
static unsigned phase;

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

static void reset(int *work)
{
    int i, c;
    (void)work;
    for (c = 0; c < 2; c++) {
        for (i = 0; i < MAX_STAGES; i++) ap_x[c][i] = ap_y[c][i] = 0;
        ph_lag[c] = ph_last[c] = ap_a[c] = 0;
    }
}

static void render(const int *x, int *L, int *R, const unsigned char *par, int *work)
{
    int c, f, s, stages = 2 + 2 * (par[6] * 3 / 127), fb = (par[5] - 64) * 440;
    int range = par[1] * 102 / 127, centre = par[4] * 2, lag = 32767 - par[3] * 250;
    unsigned inc = mw_fx_rate[par[0]] >> 1, wid = (unsigned)par[7] * (0x80000000u / 127);
    int a_step[2];
    (void)work;
    for (c = 0; c < 2; c++) {
        int m = lfo(phase + (c ? wid : 0)), idx;
        m = clamp(m + ((m * par[2]) >> 4), 32767);  // SHP: up to 8x, clipped towards a square
        ph_lag[c] += mul15(lag, m - ph_lag[c]);
        idx = centre + ((range * ph_lag[c]) >> 15) + 26;
        idx = idx < 0 ? 0 : idx > 255 ? 255 : idx;
        a_step[c] = (allpass_a[idx] - ap_a[c]) / N24;
    }
    phase += inc * 32;
    for (c = 0; c < 2; c++) {
        int *xs = ap_x[c], *ys = ap_y[c], a = ap_a[c], last = ph_last[c], *out = c ? R : L;
        for (f = 0; f < N24; f++) {
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

const struct mw_fx phaser_fx = {
    MW_FX_ABI, 3, 0, MW_FX_24K | MW_FX_LIFT, 256, 0, "PHASER",
    { { "SPD", MW_IC_DIAL, 50, 0 }, { "DEP", MW_IC_DEPTH, 80, 0 }, { "SHP", MW_IC_DIAL, 0, 0 },
      { "LAG", MW_IC_DIAL, 0, 0 }, { "FREQ", MW_IC_COMB, 80, 0 }, { "FDBK", MW_IC_SKIP, 96, MW_FX_BIPOLAR },
      { "STG", MW_IC_STAGES, 50, 0 }, { "WDTH", MW_IC_WIDTH, 64, 0 } },
    reset, render, 0
};
