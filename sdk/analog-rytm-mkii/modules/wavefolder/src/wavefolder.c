// SPDX-License-Identifier: GPL-3.0-or-later
// WAVEFOLDER, a send effect for the Modwerk base on the Analog Rytm MKII: one record in the base's FX list (mw_fx),
// a new design by its author. Past full level the sound is folded back in instead of clipped, and the harder it is
// pushed (DRV, FOLD) the more it folds: bright, moving harmonics, with no filter around them. DYN makes the folds
// follow the sound's strength, so a loud hit folds more than a ghost note. SHPE goes from a sine fold (soft) to a
// triangle one (hard), SYMM moves the fold's centre (even harmonics), WDTH folds the sides a little differently, TONE
// tilts the result and BLND mixes it with the send. The fold is anti-aliased through its antiderivative (a
// first-order mean over each sample, Parker, Zavalishin and Le Bivic, DAFx 2016; Esqueda et al. applied it to
// wavefolders, DAFx 2017).
#include "modwerk/fx.h"

#define N24 MW_FX_N24
#define SIG_MAX 65535
#define NEAR 64                    // inputs this close (Q13): the fold at their midpoint, no divide
#define PIVOT 7547                 // TONE's one-pole: about 1 kHz at 24 kHz (Q15)
#define DC_K 214                   // the DC blocker's one-pole: about 25 Hz at 24 kHz (Q15)

// Generated (TESTING.md), not stock data. A sine, 256 points and the first again, Q15; DRV: 0 to +18 dB, Q8.
static const short sine_q15[257] = {
    0, 804, 1608, 2410, 3212, 4011, 4808, 5602, 6393, 7179, 7962, 8739,
    9512, 10278, 11039, 11793, 12539, 13279, 14010, 14732, 15446, 16151, 16846, 17530,
    18204, 18868, 19519, 20159, 20787, 21403, 22005, 22594, 23170, 23731, 24279, 24811,
    25329, 25832, 26319, 26790, 27245, 27683, 28105, 28510, 28898, 29268, 29621, 29956,
    30273, 30571, 30852, 31113, 31356, 31580, 31785, 31971, 32137, 32285, 32412, 32521,
    32609, 32678, 32728, 32757, 32767, 32757, 32728, 32678, 32609, 32521, 32412, 32285,
    32137, 31971, 31785, 31580, 31356, 31113, 30852, 30571, 30273, 29956, 29621, 29268,
    28898, 28510, 28105, 27683, 27245, 26790, 26319, 25832, 25329, 24811, 24279, 23731,
    23170, 22594, 22005, 21403, 20787, 20159, 19519, 18868, 18204, 17530, 16846, 16151,
    15446, 14732, 14010, 13279, 12539, 11793, 11039, 10278, 9512, 8739, 7962, 7179,
    6393, 5602, 4808, 4011, 3212, 2410, 1608, 804, 0, -804, -1608, -2410,
    -3212, -4011, -4808, -5602, -6393, -7179, -7962, -8739, -9512, -10278, -11039, -11793,
    -12539, -13279, -14010, -14732, -15446, -16151, -16846, -17530, -18204, -18868, -19519, -20159,
    -20787, -21403, -22005, -22594, -23170, -23731, -24279, -24811, -25329, -25832, -26319, -26790,
    -27245, -27683, -28105, -28510, -28898, -29268, -29621, -29956, -30273, -30571, -30852, -31113,
    -31356, -31580, -31785, -31971, -32137, -32285, -32412, -32521, -32609, -32678, -32728, -32757,
    -32767, -32757, -32728, -32678, -32609, -32521, -32412, -32285, -32137, -31971, -31785, -31580,
    -31356, -31113, -30852, -30571, -30273, -29956, -29621, -29268, -28898, -28510, -28105, -27683,
    -27245, -26790, -26319, -25832, -25329, -24811, -24279, -23731, -23170, -22594, -22005, -21403,
    -20787, -20159, -19519, -18868, -18204, -17530, -16846, -16151, -15446, -14732, -14010, -13279,
    -12539, -11793, -11039, -10278, -9512, -8739, -7962, -7179, -6393, -5602, -4808, -4011,
    -3212, -2410, -1608, -804, 0
};
static const unsigned short drv_g[128] = {
    256, 260, 264, 269, 273, 278, 282, 287, 292, 296, 301, 306,
    311, 316, 322, 327, 332, 338, 343, 349, 355, 361, 367, 373,
    379, 385, 391, 398, 404, 411, 418, 425, 432, 439, 446, 453,
    461, 468, 476, 484, 492, 500, 508, 516, 525, 534, 542, 551,
    560, 569, 579, 588, 598, 608, 618, 628, 638, 649, 660, 670,
    681, 693, 704, 716, 727, 739, 752, 764, 776, 789, 802, 815,
    829, 842, 856, 870, 885, 899, 914, 929, 944, 960, 976, 992,
    1008, 1025, 1042, 1059, 1076, 1094, 1112, 1130, 1149, 1168, 1187, 1206,
    1226, 1246, 1267, 1288, 1309, 1330, 1352, 1375, 1397, 1420, 1444, 1467,
    1491, 1516, 1541, 1566, 1592, 1618, 1645, 1672, 1699, 1727, 1756, 1785,
    1814, 1844, 1874, 1905, 1936, 1968, 2001, 2033
};

// The level after the fold: the gain into it (FOLD x DRV, 1 to 64) ^ -0.5, Q12.
static const unsigned short fold_m[65] = {
    4096, 4096, 2896, 2365, 2048, 1832, 1672, 1548, 1448, 1365, 1295, 1235, 1182,
    1136, 1095, 1058, 1024, 993, 965, 940, 916, 894, 873, 854, 836, 819,
    803, 788, 774, 761, 748, 736, 724, 713, 702, 692, 683, 673, 664,
    656, 648, 640, 632, 625, 617, 611, 604, 597, 591, 585, 579, 574,
    568, 563, 557, 552, 547, 543, 538, 533, 529, 524, 520, 516, 512
};

struct side { int e1, dc, dr, sdc, sdr, tl; };   // last input (Q13); its DC, the side's (and remainders); TONE
static struct side sl;
static int env, g_now, t_now, m_now;

static int clamp(int v, int lim) { return v > lim ? lim : v < -lim ? -lim : v; }

static int sine(unsigned p)
{
    unsigned i = p >> 24;
    int a = sine_q15[i], b = sine_q15[i + 1];
    return a + (((b - a) * (int)((p >> 16) & 255)) >> 8);
}

static void reset(int *work)
{
    (void)work;
    sl.e1 = sl.dc = sl.dr = sl.sdc = sl.sdr = sl.tl = 0;
    env = g_now = t_now = m_now = 0;
}

// The fold's antiderivative at u (Q13; the fold repeats every 4), Q24: the triangle's, v^2/2 - 1/2 up to 1 and
// 2v - v^2/2 - 3/2 past it (v = u within one turn), and the sine's, -2/pi cos(pi u / 2), mixed by c (Q6: 0 sine).
// Also the fold's slope there (Q15), for WDTH.
static inline __attribute__((always_inline)) int antider(int u, int c, int *slope)
{
    int v = ((u + 8192) & 32767) - 8192, t = 0, s, co;
    if (c) t = v <= 8192 ? (v * v - 67108864) >> 3 : ((v * 16384) - ((v * v) >> 1) - 100663296) >> 2;
    if (c == 64) { *slope = v <= 8192 ? 32768 : -32768; return t; }
    co = sine((unsigned)u * 131072u + 0x40000000u);
    s = co * -326;
    co = (co * 51472) >> 15;                                                   // pi/2 cos
    if (!c) { *slope = co; return s; }
    *slope = co + ((((v <= 8192 ? 32768 : -32768) - co) * c) >> 6);
    return s + (((t - s) * c) >> 6);
}

// The fold itself at u (Q13 in, Q15 out), for inputs too close to divide.
static inline __attribute__((always_inline)) int fold_at(int u, int c)
{
    int v = ((u + 8192) & 32767) - 8192, t = (v <= 8192 ? v : 16384 - v) * 4, s;
    if (c == 64) return t;
    s = sine((unsigned)u * 131072u);
    return c ? s + (((t - s) * c) >> 6) : s;
}

// The fold over the block: gain into it (Q8 after the input's halving), b its centre (Q13), c SHPE, w WDTH (Q13).
// Each output is the fold's mean over the sample (its antiderivative's difference over the input's), without DC.
// WDTH folds the sides about centres w apart: to first order, the fold plus and minus w times its slope (side).
static void fold(const int *x, const int *gain, int b, int c, int w, int *out, int *side)
{
    struct side *z = &sl;
    int f, e1 = z->e1, sl1, f1 = antider(e1, c, &sl1), dc = z->dc, dr = z->dr, sdc = z->sdc, sdr = z->sdr;
    for (f = 0; f < N24; f++) {
        int e = (((x[f] >> 1) * gain[f]) >> 9) + b, d = e - e1, slope, fe = antider(e, c, &slope), y, q;
        if (d > NEAR || d < -NEAR) {
            int df = fe - f1;
            y = d > -32768 && d < 32768 ? (df * 16) / d : df / (d >> 4);
        } else {
            y = fold_at((e + e1) >> 1, c);
        }
        e1 = e; f1 = fe;
        // Without its DC (SYMM leaves some): a one-pole's low-pass taken away, its remainder kept.
        q = DC_K * (y - dc) + dr;
        dr = q & 32767;
        dc += q >> 15;
        out[f] = y - dc;
        if (w) {                                                               // the side without its DC too
            y = (w * slope) >> 13;
            q = DC_K * (y - sdc) + sdr;
            sdr = q & 32767;
            sdc += q >> 15;
            side[f] = y - sdc;
        } else {
            side[f] = 0;
        }
    }
    z->e1 = e1; z->dc = dc; z->dr = dr; z->sdc = sdc; z->sdr = sdr;
}

static void render(const int *x, int *L, int *R, const unsigned char *par, int *work)
{
    int gain[N24], yl[N24], yr[N24], f, k, c = (par[2] * 129) >> 8, dyn = par[3] * 2;
    int g = (drv_g[par[4]] * (256 + ((par[0] * 1792) >> 7))) >> 8, b = (par[1] - 64) * 64, w = par[6] * 12;
    int t = (par[5] - 64) * 64, m = par[7] * 258, dg, dt = (t - t_now) >> 4, dm = (m - m_now) >> 4;
    int mk = fold_m[(drv_g[par[4]] * (256 + ((par[0] * 1792) >> 7))) >> 16];
    int gn = g_now, tn = t_now, mn = m_now, e = env, lp;
    (void)work;
    // DYN: the gain into the fold follows the send's level, the block's peak (fast up, slower down); a hit at half
    // level folds as set. The gain steps across the block.
    for (f = 0, k = 0; f < N24; f++) {
        int a = x[f] < 0 ? -x[f] : x[f];
        if (a > k) k = a;
    }
    e += k > e ? (k - e) >> 1 : -((e - k) >> 5);
    env = e;
    k = 256 - ((dyn * (256 - (e >> 6 > 512 ? 512 : e >> 6))) >> 8);           // Q8: 1 - dyn + dyn env/16384
    g = (g * k) >> 8;
    dg = (g - g_now) >> 4;
    for (f = 0; f < N24; f++) gain[f] = gn += dg;
    fold(x, gain, b, c, w, yl, yr);
    // TONE, on the mid only: the sides' difference passes as it is. Then the level, and BLND with the send.
    lp = sl.tl;
    for (f = 0; f < N24; f++) {
        int mid = yl[f], side = yr[f], v;
        lp += ((mid - lp) * PIVOT) >> 15;
        tn += dt; mn += dm;
        mid += (tn * (mid - 2 * lp)) >> 13;
        v = x[f];
        mid = (mid * mk) >> 12;
        side = (side * mk) >> 12;
        L[f] = clamp(v + ((((mid + side) - v) >> 1) * (mn >> 1) >> 13), SIG_MAX);
        R[f] = clamp(v + ((((mid - side) - v) >> 1) * (mn >> 1) >> 13), SIG_MAX);
    }
    sl.tl = lp;
    g_now = g; t_now = t; m_now = m;
}

const struct mw_fx wavefolder_fx = {
    MW_FX_ABI, 4, 0, MW_FX_24K | MW_FX_LIFT, 256, 0, "WAVEFOLDER",
    { { "FOLD", MW_IC_FOLD, 48, 0 }, { "SYMM", MW_IC_BIP, 64, MW_FX_BIPOLAR }, { "SHPE", MW_IC_DIAL, 0, 0 },
      { "DYN", MW_IC_DIAL, 64, 0 }, { "DRV", MW_IC_DRIVE, 0, 0 }, { "TONE", MW_IC_TILT, 64, MW_FX_BIPOLAR },
      { "WDTH", MW_IC_WIDTH, 0, 0 }, { "BLND", MW_IC_BLEND, 127, 0 } },
    reset, render, 0
};
