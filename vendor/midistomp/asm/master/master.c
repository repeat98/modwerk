/* MASTER metering screen (MENU > MASTER): a port of the script in docs/dev/master-ui-mockup.html (v8),
 * and KALEIDO (MENU > KALEIDO), a full-screen visualizer on the same tap.
 * Six pages (SPECTRUM, SCOPE + tuner, STEREO, LOUDNESS, IN METER, OUT METER) that watch the pedal's output after
 * the limiter, and its input (IN METER). Four entry points (master_vec.asm): master_tap (audio, once per 8-frame block while
 * ms_on), master_poll (16 ms), master_key, master_draw.
 *
 * Audio side: master_tap packs the 8 frames into the int16 mid / side rings and keeps the limiter's lowest
 * gain. UI side: master_poll runs the loudness, level and stereo filters over the new frames and, every
 * 4th tick (15 fps), the analysis of the page on screen (advance); master_draw only draws the state.
 * No libc, no RTS (no / % by variables, float divide through _rcpsp), no B14: all state sits at fixed
 * addresses in the gaps of the master.h buffers. Fixed-point-free: floats like the mockup. */
#ifdef MS_HOST
#include "ms_host.h"
#else
#include "master.h"
#include "stock.h"
#endif

#ifndef MS_FRAME_MS
#define MS_FRAME_MS 64          /* the pedal draws at 15 fps; the mockup runs at 20 fps (50) */
#endif
#ifndef MS_ON
#define MS_ON (*(volatile int *)0xC010A020)
#endif
#ifndef MS_LOAD
#define MS_LOAD ((volatile int *)0xC010A024)  /* master_vec.asm +36: [0] MASTER, [1] KALEIDO */
extern __cregister volatile unsigned int TSCL;
#define CYC TSCL
#endif
#define P ((volatile unsigned char *)LCD0)

#define scols ds_scols
#define small ds_small
#define softw ds_softw
#define softtext ds_softtext
#include "../common/draw.h"
#undef scols
#undef small
#undef softw
#undef softtext

/* ---- state: the two gaps in the buffers (SIN ends at 0xC0111884, HIST at 0xC0115780) ---------------- */
typedef struct {
    volatile unsigned w;            /* frames written (master_tap) */
    volatile float gmin;            /* lowest limiter gain since the last poll (master_tap) */
    volatile int over;              /* bits 0/1 L/R: the output hit full scale; 2/3: the input did (master_tap) */
    volatile float ipk[2], ims[2];  /* input: peak since the last frame, mean square (300 ms) (master_tap) */
    unsigned rd;                    /* frames processed */
    int tick, patch, page, opt[3];
    float kw[2][8];                 /* K-weighting: two biquads per channel, x1 x2 y1 y2 */
    float sub, subs[30];
    int subN, nsubs;
    float gh[113];                  /* the 3 SEC graph: last 113 values */
    int ngh;
    float msL, msR, sLL, sRR, sLR, sMM, sSS;
    float pk[2], gr, peakMax, limMin;
    float dpk[2], hold[2], dgr;
    int grT;                        /* ms since the LIMIT bar's last new peak */
    int holdT[2], clip[2];
    float idpk[2], ihold[2], ipeakMax;
    int iholdT[2], iclip[2], icf, iprev, nclip;     /* input clip: ms left, bits since the last frame, last frame's, count */
    float per, scSt, scSpc, scSpan, scF;
    unsigned scS0;
    int scNN, scCents;              /* nearest note number, cents; scNN < 0: none */
    float scG;                      /* scope auto gain: a power of 2, 1/2 to 32 */
    int scGT;                       /* frames the signal has fit one step up */
    float scT[115], scTL;           /* the trace drawn last frame (one sample per column), its length; 0: none */
    unsigned char age[126];
    float kl[3], ke[5], kpk[3], ksl[3];     /* KALEIDO: filters, sums, band peaks, band slow means */
    float kb, km, kh, kra, kring, kt, krot;   /* bass mid high, kick, ring phase, time, turn */
    int ksi, ksh, kinv;             /* segments step, frames to the next change, inverted */
    int kzs, krs, kmi;              /* KALEIDO knobs: zoom -10..10, spin -10..10, mirrors 0 AUTO or 4 6 8 10 12 16 */
    volatile unsigned aud, own;     /* busy cycles: whole audio blocks, master_tap's part (master_tap) */
    unsigned ui;                    /* master_poll's cycles, audio taken out */
    int np, lk;                     /* polls in this CPU window, its menu entry */
    unsigned la, lt;                /* aud and CYC at the last poll */
    int full;                       /* the audio takes almost the whole core: analysis paused (#55) */
} St;

#ifndef MS_ST
#define MS_ST ((St *)0xC0115780)
#define MS_BARS ((float *)0xC0111884)   /* [126] bars, [126] peak dots */
#endif
#define ST MS_ST
typedef char st_fits[sizeof(St) <= 0x680 ? 1 : -1];   /* St ends before MS_INK (0xC0115E00) */
#define BAR MS_BARS
#define PKD (MS_BARS + 126)

static int inited;
#ifndef MS_INK
#define MS_INK ((unsigned *)0xC0115E00)  /* [128], after St (checked below), not in the code image */
#endif
#define ink MS_INK                   /* a 32-row window of the ink of the texts the marks keep clear of */
static int ibase;

#ifndef MS_HOST
#define F2I(x) _ftoi(x)
#define I2F(x) _itof(x)
#define MS_D8 double
#endif

/* ---- float helpers without RTS --------------------------------------------------------------------- */
static float rcp(float x) { float r = _rcpsp(x); r = r * (2.0f - x * r); return r * (2.0f - x * r); }

static float sqrtf_(float x)
{
    float r;
    if (x <= 0) return 0;
    r = _rsqrsp(x);
    r = r * (1.5f - 0.5f * x * r * r);
    r = r * (1.5f - 0.5f * x * r * r);
    return x * r;
}

static float log2f_(float x)        /* x > 0 */
{
    int i = F2I(x), e = (i >> 23) - 127;
    float m = I2F((i & 0x7FFFFF) | 0x3F800000), t, t2;
    if (m > 1.41421356f) { m *= 0.5f; e++; }
    t = (m - 1.0f) * rcp(m + 1.0f);
    t2 = t * t;
    return (float)e + 2.88539008f * t * (1.0f + t2 * (0.33333333f + t2 * (0.2f + t2 * 0.14285714f)));
}

static int ifl(float x) { int i = (int)x; return (float)i > x ? i - 1 : i; }
static int ir(float x) { return ifl(x + 0.5f); }                 /* Math.round */
static int fdiv(int a, int b) { return a >= 0 ? (int)udiv(a, b) : -(int)udiv(-a + b - 1, b); }
static float ab(float x) { return x < 0 ? -x : x; }
static float dbv(float v) { return v > 0 ? 6.02059991f * log2f_(v) : -99.0f; }      /* amplitude */
static float dbp(float p) { return p > 0 ? 3.01029996f * log2f_(p) : -99.0f; }      /* power */
static float lkf(float e) { return -0.691f + 3.01029996f * log2f_(e); }

/* sin(2 pi m / 1024) and cos from the 257-entry quarter table */
static float cs(int m)
{
    int q, r;
    m &= 1023;
    q = m >> 8;
    r = m & 255;
    return q == 0 ? MS_SIN[256 - r] : q == 1 ? -MS_SIN[r] : q == 2 ? -MS_SIN[256 - r] : MS_SIN[r];
}

/* ---- text ------------------------------------------------------------------------------------------ */
static const unsigned char SW_H[] = { 0x14, 0x3E, 0x14, 0x3E, 0x14, 0 };

static const unsigned char *scols(char ch, int *n)     /* the softkey font, plus the 6-px # */
{
    if (ch == '#') { *n = 6; return SW_H; }
    return ds_scols(ch, n);
}

static int softw(const char *s) { int n, t = 0; for (; *s; s++) { scols(*s, &n); t += n; } return t; }

static void softtext(const char *s, int x)       /* page 7, shifted down 1 (0xC009F6F0) */
{
    int n, j;
    const unsigned char *c;
    for (; *s; s++, x += n) {
        c = scols(*s, &n);
        for (j = 0; j < n; j++) if ((unsigned)(x + j) < 128u) P[7 * 128 + x + j] = (unsigned char)(c[j] << 1);
    }
}

static void inkset(int x, int y)
{
    int b = y - ibase;
    if ((unsigned)x < 128u && (unsigned)b < 32u) ink[x] |= 1u << b;
}

static int nr(int x, int y, int m)
{
    int i, j, b;
    for (i = -m; i <= m; i++) {
        if ((unsigned)(x + i) > 127u) continue;
        for (j = -m; j <= m; j++) {
            b = y + j - ibase;
            if ((unsigned)b < 32u && (ink[x + i] >> b & 1)) return 1;
        }
    }
    return 0;
}

static void inkclr(int base) { int i; ibase = base; for (i = 0; i < 128; i++) ink[i] = 0; }

static void inkxor(void)
{
    int x, b;
    for (x = 0; x < 128; x++)
        if (ink[x]) for (b = 0; b < 32; b++) if (ink[x] >> b & 1) px(x, ibase + b, 2);
}

static void gtext(const char *s, int x, int y, int mode)    /* 0 draw, 1 clear a 3 x 3 halo, 2 ink */
{
    int n, j, r, i, k;
    const unsigned char *c;
    for (; *s; s++, x += n) {
        c = scols(*s, &n);
        for (j = 0; j < n; j++)
            for (r = 0; r < 8; r++)
                if (c[j] >> r & 1) {
                    if (mode == 0) px(x + j, y + r - 1, 1);
                    else if (mode == 2) inkset(x + j, y + r - 1);
                    else for (i = -1; i <= 1; i++) for (k = -1; k <= 1; k++) px(x + j + i, y + r - 1 + k, 0);
                }
    }
}

static void small(const char *s, int x, int y) { gtext(s, x, y, 0); }
static void smallc(const char *s, int cx, int y) { small(s, cx - (softw(s) >> 1), y); }
static void halo(const char *s, int x, int y) { gtext(s, x, y, 1); gtext(s, x, y, 0); }
static void os6r(const char *s, int right, int y) { os6(s, right - 6 * slen(s), y); }
static void corners(int x0, int y0, int x1, int y1) { px(x0, y0, 0); px(x1, y0, 0); px(x0, y1, 0); px(x1, y1, 0); }

static char *icat(char *o, int n)
{
    if (n < 0) { *o++ = '-'; n = -n; }
    return ncat(o, n);
}

static char *fmt(char *o, float v, int dec, int plus)       /* toFixed(dec), "+" first when plus and v >= 0 */
{
    unsigned n, p = dec == 1 ? 10u : 100u;
    if (v < 0) { *o++ = '-'; v = -v; } else if (plus) *o++ = '+';
    n = (unsigned)(int)(v * (float)p + 0.5f);
    o = ncat(o, udiv(n, p));
    *o++ = '.';
    n = umod(n, p);
    if (dec == 2 && n < 10) *o++ = '0';
    return ncat(o, n);
}

/* ---- the pages' names and options ------------------------------------------------------------------ */
static const char *const PN[6] = { "SPECTRUM", "SCOPE", "STEREO", "LOUDNESS", "IN METER", "OUT METER" };
static const char *const PO[6] = { "FALL", "SPAN", "ZOOM", "RESET", "RESET", "RESET" };
static const char *const PV[3][9] = { { "SLOW", "MED", "FAST" }, { "AUTO", "1", "2", "3", "4", "6", "8", "12", "24" }, { "1X", "2X", "4X" } };
static const unsigned char PNV[3] = { 3, 9, 3 };
static const unsigned char SPAN[8] = { 1, 2, 3, 4, 6, 8, 12, 24 };
#define KI 0.00060450353f         /* the input's 300 ms mean square, one step per 8-frame block: 1 - exp(-8 / 13230) */

static void softkey(int k, const char *s)       /* softkey42: inverted box */
{
    softtext(s, 42 * k + 22 - (softw(s) >> 1));
    invert(42 * k + 2, 57, 42 * k + 41, 63);
}

static void title(const char *s) { font7c(s, 64, 1); invert(0, 0, 127, 8); }

/* ---- loudness (BS.1770 K-weighting, 100 ms steps) --------------------------------------------------- */
static const double KS[5] = { 1.524549751, -2.591006754, 1.126819074, -1.623706383, 0.6840684538 };
static const double KH[5] = { 0.9945921774, -1.989184355, 0.9945921774, -1.989169674, 0.9891990358 };

static float bq(float *s, const double *c, float x)
{
    double y = c[0] * x + c[1] * s[0] + c[2] * s[1] - c[3] * s[2] - c[4] * s[3];
    s[1] = s[0]; s[0] = x; s[3] = s[2]; s[2] = (float)y;
    return (float)y;
}

static void hist_add(int k, float e)
{
    float t;
    int b;
    if (e <= 0) return;
    t = lkf(e) + 70.0f;
    if (t <= 0) return;
    b = (int)(t * 10.0f);
    if (b > 703) b = 703;
    if (MS_HIST[k * 704 + b] < 65535) MS_HIST[k * 704 + b]++;
}

static void reset_loud(void)
{
    St *s = ST;
    int i;
    s->sub = 0; s->subN = 0; s->nsubs = 0; s->peakMax = 0; s->ngh = 0;
    for (i = 0; i < 2 * 704; i++) MS_HIST[i] = 0;
}

static void reset_stats(void)
{
    St *s = ST;
    reset_loud();
    s->limMin = 1.0f; s->hold[0] = s->hold[1] = -99.0f; s->clip[0] = s->clip[1] = 0;
    s->ipeakMax = 0; s->ihold[0] = s->ihold[1] = -99.0f; s->iclip[0] = s->iclip[1] = 0; s->nclip = 0;
}

static float mean_last(const St *s, int k) { float t = 0; int i; for (i = s->nsubs - k; i < s->nsubs; i++) t += s->subs[i]; return t * rcp((float)k); }

static void gate_step(St *s)
{
    float e = s->sub * (1.0f / 4410.0f), e30;
    int i;
    s->sub = 0; s->subN = 0;
    if (s->nsubs == 30) { for (i = 1; i < 30; i++) s->subs[i - 1] = s->subs[i]; s->nsubs = 29; }
    s->subs[s->nsubs++] = e;
    if (s->nsubs >= 4) hist_add(0, mean_last(s, 4));
    if (s->nsubs >= 30) {
        e30 = mean_last(s, 30);
        hist_add(1, e30);
        if (s->ngh == 113) { for (i = 1; i < 113; i++) s->gh[i - 1] = s->gh[i]; s->ngh = 112; }
        s->gh[s->ngh++] = e30 > 0 ? lkf(e30) : -999.0f;
    }
}

/* the frames since the last poll: loudness, levels, RMS, stereo sums */
static void consume(void)
{
    St *s = ST;
    unsigned w = s->w, rd = s->rd;
    float K = 1.0f / 32768.0f, A = 0.99992442f, KR = 0.000075582933f, m, d, l, r, zl, zr, g;
    if (w - rd > 2048u) rd = w - 1024u;
    for (; rd != w; rd++) {
        m = (float)MS_RING_M[rd & 4095] * K;
        d = (float)MS_RING_S[rd & 2047] * K;
        l = m + d; r = m - d;
        zl = bq(s->kw[0] + 4, KH, bq(s->kw[0], KS, l));
        zr = bq(s->kw[1] + 4, KH, bq(s->kw[1], KS, r));
        s->sub += zl * zl + zr * zr;
        if (++s->subN == 4410) gate_step(s);
        s->msL += KR * (l * l - s->msL);
        s->msR += KR * (r * r - s->msR);
        s->sLL = A * s->sLL + l * l; s->sRR = A * s->sRR + r * r; s->sLR = A * s->sLR + l * r;
        s->sMM = A * s->sMM + m * m; s->sSS = A * s->sSS + d * d;
        zl = ab(l); zr = ab(r);
        if (zl > s->pk[0]) s->pk[0] = zl;
        if (zr > s->pk[1]) s->pk[1] = zr;
        if (zl > s->peakMax) s->peakMax = zl;
        if (zr > s->peakMax) s->peakMax = zr;
    }
    s->rd = rd;
    g = s->gmin;
    s->gmin = 1.0f;
    if (s->over & 1) s->clip[0] = 2000;
    if (s->over & 2) s->clip[1] = 2000;
    if (s->over & 4) s->iclip[0] = 2000;
    if (s->over & 8) s->iclip[1] = 2000;
    s->icf |= s->over & 12;
    s->over = 0;
    if (g < s->gr) s->gr = g;
    if (g < s->limMin) s->limMin = g;
}

/* ---- page analysis, every 4th tick ------------------------------------------------------------------ */
static int rev9(int n) { int r = 0, i; for (i = 0; i < 9; i++) { r = r << 1 | (n & 1); n >>= 1; } return r; }

static void spec_adv(void)
{
    St *s = ST;
    float *F = MS_FFT, *bars = BAR, *pks = PKD;
    float K = 1.0f / 32768.0f, fall, ar, ai, br, bi, xr, xi, c, sn, wr, wi, tr, ti, m2, mx, d, xer, xei, xor_, xoi;
    unsigned base = s->rd - 1024u;
    int n, i, k, c0, len, half, step, u, v, lo, hi, kk, col;
    double f = 20.0, pos;
    for (n = 0; n < 512; n++) {
        i = rev9(n);
        F[2 * i] = (float)MS_RING_M[(base + 2 * n) & 4095] * K * (0.5f - 0.5f * cs(2 * n));
        F[2 * i + 1] = (float)MS_RING_M[(base + 2 * n + 1) & 4095] * K * (0.5f - 0.5f * cs(2 * n + 1));
    }
    for (len = 2, step = 512; len <= 512; len <<= 1, step >>= 1) {
        half = len >> 1;
        for (k = 0; k < half; k++) {
            wr = cs(k * step);
            wi = -cs(k * step + 768);
            for (u = k; u < 512; u += len) {
                v = u + half;
                tr = F[2 * v] * wr - F[2 * v + 1] * wi;
                ti = F[2 * v] * wi + F[2 * v + 1] * wr;
                F[2 * v] = F[2 * u] - tr; F[2 * v + 1] = F[2 * u + 1] - ti;
                F[2 * u] += tr; F[2 * u + 1] += ti;
            }
        }
    }
    fall = (s->opt[0] == 0 ? 1.0f : s->opt[0] == 1 ? 2.0f : 5.0f) * ((float)MS_FRAME_MS * 0.02f);   /* per frame, scaled from the mockup's 50 ms: 20 / 40 / 100 dB/s */
    pos = f * (1024.0 / 44100.0);
    c0 = (int)(pos + 0.5);
    for (col = 0; col < 126; col++) {
        lo = c0 < 1 ? 1 : c0;
        f *= 1.0563541037491873;
        pos = f * (1024.0 / 44100.0);
        c0 = (int)(pos + 0.5);
        hi = c0 < lo ? lo : c0;
        mx = 0;
        for (kk = lo; kk <= hi; kk++) {
            ar = F[2 * kk]; ai = F[2 * kk + 1];
            i = (512 - kk) & 511;
            br = F[2 * i]; bi = F[2 * i + 1];
            xer = (ar + br) * 0.5f; xei = (ai - bi) * 0.5f;
            xor_ = (ai + bi) * 0.5f; xoi = -(ar - br) * 0.5f;
            c = cs(kk); sn = cs(kk + 768);
            xr = xer + c * xor_ + sn * xoi;
            xi = xei + c * xoi - sn * xor_;
            m2 = xr * xr + xi * xi;
            if (m2 > mx) mx = m2;
        }
        d = (mx > 0 ? 3.01029996f * log2f_(mx) - 48.1647993f : -99.0f) + 3.0f * (-5.64385619f + ((float)col + 0.5f) * 0.079093526f);
        bars[col] = d > bars[col] - fall ? d : bars[col] - fall;
        if (bars[col] >= pks[col]) { pks[col] = bars[col]; s->age[col] = 0; }
        else if (++s->age[col] > 750 / MS_FRAME_MS) pks[col] -= fall;
    }
}

static const char *const NOTE[12] = { "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B" };
#define SC_N 3106                   /* the trigger search: 3107 samples ending at the newest */

static float mono(unsigned i) { return (float)MS_RING_M[i & 4095] * (1.0f / 32768.0f); }

/* The period: NSDF (McLeod) on the window decimated by 8, the first peak within 90% of the best, then refined at
 * full rate around it. The trigger: the start, within one period of the newest, that best matches the trace
 * drawn last frame, so the wave holds still even when it has several zero crossings per cycle. With no last
 * trace (first frame, or the span changed by more than 1/8), the last rising zero crossing of a low-passed copy. */
#define SC_W 193                    /* decimated lags 1..193 (5512 Hz rate): down to 28.6 Hz */
static float nsdf(float *x, int k, int w, int st)   /* x: decimated data, or 0 for the full-rate ring from S0 = st */
{
    float a = 0, b = 0, p, q;
    int i;
    for (i = 0; i < w; i++) {
        p = x ? x[i] : mono((unsigned)st + (unsigned)i);
        q = x ? x[i + k] : mono((unsigned)st + (unsigned)(i + k));
        a += p * q; b += p * p + q * q;
    }
    return b > 0 ? 2.0f * a * rcp(b) : 0;
}
static void scope_adv(void)
{
    St *s = ST;
    unsigned S0 = s->rd - 1u - SC_N;
    float *d = MS_FFT, *nf = MS_FFT + 392;   /* scratch: the FFT runs only on SPECTRUM */
    float z = 0, pk = 0, rp = 0, thr, v, u, len, span, pms, fl, st, t, gn, best, r0, r1, r2, c, step, pp;
    int i, j, k, n, L = 0, armed = 0;
    for (i = 0; i <= SC_N; i++) {
        v = mono(S0 + i); z += 0.1f * (v - z);
        if (ab(z) > pk) pk = ab(z);
        if (ab(v) > rp) rp = ab(v);
        if (i < 388 * 8) d[i >> 3] = ((i & 7) ? d[i >> 3] : 0) + v;
    }
    /* auto gain: the largest power of 2 (1/2 to 32) that keeps the peak within 3/4 of the half height;
     * down at once, up one step after 8 frames that fit */
    for (gn = 32.0f; gn > 0.5f && rp * gn > 0.75f; gn *= 0.5f) ;
    if (gn < s->scG) { s->scG = gn; s->scGT = 0; }
    else if (gn > s->scG && ++s->scGT >= 8) { s->scG *= 2.0f; s->scGT = 0; }
    for (nf[0] = 1.0f, k = 1; k <= SC_W; k++) nf[k] = nsdf(d, k, SC_W, 0);
    for (k = 1; k <= SC_W && nf[k] > 0; k++) ;           /* skip the lag-0 lobe */
    for (best = 0, j = k; j <= SC_W; j++) if (nf[j] > best) best = nf[j];
    if (best > 0.5f)
        for (j = k; j < SC_W; j++) if (nf[j] >= 0.9f * best && nf[j] >= nf[j - 1] && nf[j] >= nf[j + 1]) { L = j; break; }
    if (L > 1) {                                              /* refine: lags 8L-8..8L+8 at full rate, then a parabola */
        for (best = -2.0f, j = 8 * L - 8; j <= 8 * L + 8; j++) { v = nsdf(0, j, 1024, (int)S0); if (v > best) { best = v; k = j; } }
        r0 = nsdf(0, k - 1, 1024, (int)S0); r1 = best; r2 = nsdf(0, k + 1, 1024, (int)S0);
        t = r0 - 2.0f * r1 + r2;
        s->per = (float)k + (t < 0 ? 0.5f * (r0 - r2) * rcp(t) : 0);
    }
    pms = (s->per > 0 ? s->per : 441.0f) * (1000.0f / 44100.0f);
    if (s->opt[1] == 0) {
        fl = 3.0f * rcp(pms);
        n = (int)fl;
        if ((float)n < fl) n++;
        span = (float)(n < 2 ? 2 : n) * pms;
        if (span > 24.0f) span = 24.0f;
    } else span = (float)SPAN[s->opt[1] - 1];
    len = span * 44.1f;
    st = (float)SC_N - len;
    c = len * (1.0f / 115.0f);
    if (s->scTL > 0 && ab(len - s->scTL) * 8.0f < len) {
        pp = s->per > 0 ? s->per : len;
        if (pp > st) pp = st;
        step = c * 0.25f; if (step < 1.0f) step = 1.0f; if (step * 256.0f < pp) step = pp * (1.0f / 256.0f);
        /* under one period: the closest shape to the last trace (a product would pull to the loudest part); else the best product */
        for (best = -1e30f, u = st, t = st; t >= st - pp; t -= step) {
            for (v = 0, i = 0; i < 115; i++) { r1 = mono(S0 + (unsigned)(int)(t + c * (float)i)); v += len < pp ? -(s->scT[i] - r1) * (s->scT[i] - r1) : s->scT[i] * r1; }
            if (v > best) { best = v; u = t; }
        }
        st = u;
    } else {
        thr = 0.25f * pk; z = 0; u = st;
        for (i = 0; i <= SC_N; i++) {
            z += 0.1f * (mono(S0 + i) - z);
            if (i >= 64 && (float)i + len <= (float)SC_N) {
                if (z < -thr) armed = 1;
                else if (armed && z >= 0) { u = (float)i; armed = 0; }
            }
        }
        st = u;
    }
    for (i = 0; i < 115; i++) s->scT[i] = mono(S0 + (unsigned)(int)(st + c * (float)i));
    s->scTL = len;
    s->scS0 = S0; s->scSt = st; s->scSpc = len * (1.0f / 115.0f); s->scSpan = span;
    s->scF = s->per > 0 ? 44100.0f * rcp(s->per) : 0;
    s->scNN = -1; s->scCents = 0;
    if (s->scF > 0) {
        t = 12.0f * log2f_(s->scF * (1.0f / 440.0f)) + 69.0f;
        s->scNN = ir(t);
        s->scCents = ir(100.0f * (t - (float)s->scNN));
    }
}

static void lvl(float v, float *dpk, float *hold, int *holdT)     /* the peak falls 20 dB/s; the hold line stays 2 s */
{
    float dt = (float)MS_FRAME_MS * 0.001f, pk = dbv(v);
    *dpk = pk > *dpk - 20.0f * dt ? pk : *dpk - 20.0f * dt;
    if (pk >= *hold || (*holdT += MS_FRAME_MS) > 2000) { *hold = pk; *holdT = 0; }
}

static void meters_adv(void)
{
    St *s = ST;
    float dt = (float)MS_FRAME_MS * 0.001f, gr;
    int ch;
    for (ch = 0; ch < 2; ch++) lvl(s->pk[ch], s->dpk + ch, s->hold + ch, s->holdT + ch);
    gr = -dbv(s->gr);
    /* held 0.5 s like the chain's LIMIT tag, then falls 12 dB/s */
    if (gr >= s->dgr) { s->dgr = gr; s->grT = 0; }
    else if ((s->grT += MS_FRAME_MS) > 500) s->dgr -= 12.0f * dt;
}

static void advance(void)
{
    St *s = ST;
    int ch, c;
    for (ch = 0; ch < 2; ch++) {
        if (s->clip[ch] > 0) { s->clip[ch] -= MS_FRAME_MS; if (s->clip[ch] < 0) s->clip[ch] = 0; }
        if (s->iclip[ch] > 0) { s->iclip[ch] -= MS_FRAME_MS; if (s->iclip[ch] < 0) s->iclip[ch] = 0; }
        if (s->ipk[ch] > s->ipeakMax) s->ipeakMax = s->ipk[ch];
    }
    c = s->icf != 0;                /* CLIPS counts the frames where input clipping starts */
    if (c && !s->iprev) s->nclip++;
    s->iprev = c; s->icf = 0;
    if (s->page == 0) spec_adv();
    else if (s->page == 1) scope_adv();
    else if (s->page == 5) meters_adv();
    else if (s->page == 4) for (ch = 0; ch < 2; ch++) lvl(s->ipk[ch], s->idpk + ch, s->ihold + ch, s->iholdT + ch);
    s->pk[0] = s->pk[1] = 0; s->gr = 1.0f; s->ipk[0] = s->ipk[1] = 0;
}

/* ---- the bar of the looper's style (lbox.c bar()) ---------------------------------------------------- */
static void mbar(int x0, int y0, int x1, int y1, int f0, int f1, const char *left, const char *right,
                 const int *tk, int nt, int pa, int pb, int hold, const char *mid, int midx)
{
    int ty = y0 + 1 + ((y1 - y0 - 6) >> 1), x, y, i, rr;
    rect(x0, y0, x1, y1, 1);
    if (f1 >= f0) rect(f0, y0 + 1, f1, y1 - 1, 0);
    inkclr(y0 - 3);
    if (left) gtext(left, x0 + 3, ty, 2);
    if (right) gtext(right, x1 - 1 - softw(right), ty, 2);
    if (mid) gtext(mid, midx - (softw(mid) >> 1), ty, 2);
    for (x = pa; x <= pb; x++) for (rr = 1; rr <= 7; rr++) if ((rr == 4 || ((x + rr) & 1)) && !nr(x, y0 + rr, 1)) px(x, y0 + rr, 1);
    if (hold >= 0) for (rr = 1; rr <= 7; rr++) if (!nr(hold, y0 + rr, 1)) px(hold, y0 + rr, 1);
    for (i = 0; i < nt; i++) {
        x = tk[i];
        px(x, y0, 0); px(x, y1, 0);
        for (y = y0 + 2; y < y1 - 1; y += 2) if (!nr(x, y, 1)) px(x, y, 2);
    }
    inkxor();
    corners(x0, y0, x1, y1);
}

/* ---- the pages --------------------------------------------------------------------------------------- */
static const unsigned char OCTX[10] = { 9, 22, 34, 47, 60, 72, 85, 98, 110, 123 };   /* fx(31.25 Hz ... 16 kHz) */
static const unsigned char LABX[8] = { 18, 30, 43, 60, 72, 85, 102, 114 };
static const char *const LABT[8] = { "50", "100", "200", "500", "1K", "2K", "5K", "10K" };

static int dbY(float d) { return 11 + ir(-d * (1.0f / 72.0f) * 37.0f); }
static void gdot(int x, int y) { if (!nr(x, y, 2)) px(x, y, 2); }

static void draw_spec(void)
{
    float *bars = BAR, *pks = PKD;
    int c, y, i, k, n, a, b, top, py, ys[4], xs[12];
    char t[4];
    rect(0, 10, 127, 49, 3);
    inkclr(16);
    for (i = 0; i < 2; i++) {
        t[0] = '-'; t[1] = i ? '4' : '2'; t[2] = i ? '8' : '4'; t[3] = 0;
        gtext(t, 126 - softw(t), dbY(i ? -48.0f : -24.0f) - 2, 2);
    }
    for (c = 0; c < 126; c++) {
        top = dbY(bars[c]);
        if (bars[c] > -72.0f) for (y = top < 11 ? 11 : top; y <= 48; y++) px(1 + c, y, 1);
        py = dbY(pks[c]);
        if (py < 11) py = 11;
        if (pks[c] > -72.0f && !nr(1 + c, py, 1)) px(1 + c, py, 1);
    }
    ys[0] = 10; ys[1] = dbY(-24.0f); ys[2] = dbY(-48.0f); ys[3] = 49;
    for (i = 1; i < 4; i++) {
        a = ys[i - 1]; b = ys[i];
        n = ir((float)(b - a) * 0.25f);
        if (n < 1) n = 1;
        for (k = i == 1 ? 0 : 1; k <= n; k++) {
            y = a + (int)udiv(2 * k * (b - a) + n, 2 * n);
            if (y > 10 && y < 49) for (c = 0; c < 10; c++) gdot(OCTX[c], y);
        }
    }
    xs[0] = 0; xs[11] = 127;
    for (c = 0; c < 10; c++) xs[c + 1] = OCTX[c];
    for (i = 1; i < 12; i++) {
        n = (xs[i - 1] + xs[i]) >> 1;
        if (n > 0 && n < 127) { gdot(n, ys[1]); gdot(n, ys[2]); }
    }
    inkxor();
    corners(0, 10, 127, 49);
    small("20", 0, 51);
    for (c = 0; c < 8; c++) smallc(LABT[c], LABX[c], 51);
}

static void draw_scope(void)
{
    St *s = ST;
    float spc = s->scSpc, st = s->scSt, v, lo, hi, prev, gy = 30.0f * s->scG;
    char t[24], *o;
    int c, a, b, i, y, y0, y1, cy = 33, cb, f = s->scF > 0, cents = s->scCents, nn = s->scNN;
    rect(0, 10, 116, 55, 3);
    for (c = 2; c < 115; c += 2) px(c, 33, 1);
    prev = mono(s->scS0 + (unsigned)(int)st);
    for (c = 0; c < 115; c++) {
        a = (int)(st + (float)c * spc);
        b = (int)(st + (float)(c + 1) * spc);
        if (b < a + 1) b = a + 1;
        lo = hi = prev;
        for (i = a; i < b; i++) {
            v = mono(s->scS0 + (unsigned)i);
            if (v < lo) lo = v;
            if (v > hi) hi = v;
            prev = v;
        }
        y0 = cy - ir(hi * gy); y0 = y0 < 11 ? 11 : y0 > 54 ? 54 : y0;
        y1 = cy - ir(lo * gy); y1 = y1 < 11 ? 11 : y1 > 54 ? 54 : y1;
        for (y = y0; y <= y1 + 1; y++) px(1 + c, y > 54 ? 54 : y, 1);
    }
    if (s->scSpan < 10.0f) o = fmt(t, s->scSpan, 1, 0); else o = icat(t, ir(s->scSpan));
    o = scat(o, "MS");
    if (f) { o = scat(o, " "); o = icat(o, ir(s->scF)); scat(o, "HZ"); }
    halo(t, 115 - softw(t), 12);
    if (f && nn >= 0) {
        o = scat(t, NOTE[umod(nn, 12)]);
        o = icat(o, (int)udiv(nn, 12) - 1);
        o = scat(o, " ");
        if (cents > 0) *o++ = '+';
        icat(o, cents);
    } else scat(t, "--");
    halo(t, 115 - softw(t), 19);
    cb = cy - fdiv(42 * cents + 50, 100);
    rect(119, 10, 127, 55, 1);
    if (f && cb != cy) rect(120, cb < cy ? cb : cy, 126, cb < cy ? cy : cb, 0);
    px(119, cy, 0); px(127, cy, 0);
    for (c = 121; c < 126; c += 2) px(c, cy, 2);
    corners(119, 10, 127, 55);
    corners(0, 10, 116, 55);
}

static void draw_stereo(void)
{
    St *s = ST;
    float kz = 2.0f * 0.7071f * (float)(s->opt[2] == 0 ? 24 : s->opt[2] == 1 ? 48 : 96) * (1.0f / 32768.0f), corr, p, bal;
    int i, x, y, cx = 22, cy = 32, c0, c1, width;
    unsigned j;
    char t[16], *o;
    rect(0, 10, 45, 55, 3);
    inkclr(8);
    gtext("L", 3, 12, 2); gtext("R", 39, 12, 2);
    for (i = -20; i <= 20; i += 3) {
        if (!nr(cx + i, cy + i, 1)) px(cx + i, cy + i, 1);
        if (!nr(cx - i, cy + i, 1)) px(cx - i, cy + i, 1);
        if (!nr(cx, cy + i, 1)) px(cx, cy + i, 1);
    }
    small("L", 3, 12); small("R", 39, 12);
    corners(0, 10, 45, 55);
    for (j = s->rd - 1024u; j != s->rd; j++) {
        x = cx + ir(-(float)MS_RING_S[j & 2047] * kz);
        y = cy - ir((float)MS_RING_M[j & 4095] * kz);
        if (x > 0 && x < 45 && y > 10 && y < 55 && !nr(x, y, 1)) px(x, y, 1);
    }
    p = s->sLL * s->sRR;
    corr = p > 0 ? s->sLR * rcp(sqrtf_(p)) : 0;
    os6("PHASE", 50, 11);
    fmt(t, corr, 2, corr >= 0);
    os6r(t, 127, 11);
    c0 = 88; c1 = c0 + ir(corr * 37.0f);
    mbar(50, 19, 127, 27, c0 < c1 ? c0 : c1, c0 < c1 ? c1 : c0, "OUT", "MONO", 0, 0, 1, 0, -1, "WIDE", c0 + 1);
    width = s->sMM > 0 ? ir(100.0f * sqrtf_(s->sSS * rcp(s->sMM))) : 0;
    os6("WIDTH", 50, 36);
    o = icat(t, width); scat(o, "%");
    os6r(t, 127, 36);
    bal = s->sLL > 0 && s->sRR > 0 ? 3.01029996f * (log2f_(s->sLL) - log2f_(s->sRR)) : 0;
    os6("BALANCE", 50, 45);
    if (ab(bal) < 0.2f) scat(t, "C");
    else { t[0] = bal > 0 ? 'L' : 'R'; fmt(t + 1, ab(bal), 1, 0); }
    os6r(t, 127, 45);
}

/* the loudness values: -999 = none (the mockup's -Infinity) */
static float lv[6];

static float bin_c(int k) { return -69.95f + 0.1f * (float)k; }

static int gate_from(const unsigned short *h, int rel, double *sumE, int *cnt)   /* first bin kept by the relative gate; sumE, cnt of the bins above it. -1: none */
{
    double e = 1.1860418129480241e-7, E = 0;
    int k, C = 0, k0;
    float mean, t;
    for (k = 0; k < 704; k++, e *= 1.023292992280754) { E += e * h[k]; C += h[k]; }
    if (!C) return -1;
    mean = (float)E * rcp((float)C);
    t = lkf(mean) - (float)rel;
    k0 = ifl((t + 69.95f) * 10.0f) + 1;
    if (k0 < 0) k0 = 0;
    e = 1.1860418129480241e-7;
    for (k = 0; k < k0; k++) e *= 1.023292992280754;
    E = 0; C = 0;
    for (k = k0; k < 704; k++, e *= 1.023292992280754) { E += e * h[k]; C += h[k]; }
    *sumE = E; *cnt = C;
    return k0;
}

static float kth(const unsigned short *h, int k0, int idx)
{
    int k, c = 0;
    for (k = k0; k < 704; k++) { c += h[k]; if (c > idx) return bin_c(k); }
    return -999.0f;
}

static void loud(void)
{
    St *s = ST;
    double E;
    int C, k0, N, lo, hi;
    float pk;
    lv[0] = s->nsubs >= 4 && mean_last(s, 4) > 0 ? lkf(mean_last(s, 4)) : -999.0f;
    lv[1] = s->nsubs >= 30 && mean_last(s, 30) > 0 ? lkf(mean_last(s, 30)) : -999.0f;
    lv[2] = lv[3] = -999.0f;
    k0 = gate_from(MS_HIST, 10, &E, &C);
    if (k0 >= 0 && C) lv[2] = lkf((float)E * rcp((float)C));
    k0 = gate_from(MS_HIST + 704, 20, &E, &C);
    if (k0 >= 0 && C > 1) {
        N = C - 1;
        lo = (int)udiv(N, 10);
        hi = (int)udiv(19 * N, 20);
        lv[3] = kth(MS_HIST + 704, k0, hi) - kth(MS_HIST + 704, k0, lo);
    }
    pk = s->peakMax > 0 ? dbv(s->peakMax) : -999.0f;
    lv[4] = pk;
    lv[5] = pk > -999.0f && lv[2] > -999.0f ? pk - lv[2] : -999.0f;
}

static void draw_loud(void)
{
    St *s = ST;
    static const char *const LN[6] = { "NOW", "3 SEC", "AVERAGE", "RANGE", "PEAK", "DYNAMICS" };
    char t[16];
    int i, cx, y, x, n, yy;
    float x_;
    loud();
    for (i = 0; i < 6; i++) {
        cx = 21 + 43 * (int)umod(i, 3);
        y = i < 3 ? 11 : 27;
        x_ = lv[i];
        if (x_ < -70.0f) scat(t, "--.-"); else fmt(t, x_, 1, i < 3 && x_ > 0);
        smallc(LN[i], cx, y);
        os6(t, cx - 3 * slen(t), y + 6);
    }
    for (x = 42; x <= 85; x += 43) for (y = 11; y <= 39; y += 2) px(x, y, 1);
    rect(13, 42, 127, 55, 1);
    n = s->ngh;
    for (i = 0; i < n; i++) {
        x_ = s->gh[i];
        if (x_ > -900.0f) {
            yy = 49 + ir(-14.0f - x_);
            for (yy = yy < 43 ? 43 : yy; yy <= 54; yy++) px(127 - n + i, yy, 1);
        }
    }
    for (x = 15; x < 127; x += 2) px(x, 49, 2);
    small("-14", 0, 47);
    corners(13, 42, 127, 55);
}

static int XM(float d)          /* -48 to 0 dB over the 126 columns; -12 to 0 takes the right half */
{
    d = d < -48.0f ? -48.0f : d > 0 ? 0 : d;
    return 1 + ir((d >= -12.0f ? 0.5f + (d + 12.0f) * 0.0416666679f : (d + 48.0f) * 0.0138888890f) * 125.0f);
}

/* LIMIT: 0 to 12 dB on a log scale, so 0.2 dB fills 19 px */
static int GM(float d) { return 126 - ir(log2f_(1.0f + 4.0f * (d > 12.0f ? 12.0f : d)) * (125.0f / 5.61470984f)); }

static void lbars(float ml, float mr, const float *dpk, const float *hold, const int *clip)   /* L and R, and the scale */
{
    static const signed char TD[5] = { -24, -12, -6, -3, -1 };
    int tk[5], ch, y, i, h, rm;
    float rms;
    char t[16];
    const char *r;
    for (i = 0; i < 5; i++) tk[i] = XM((float)TD[i]);
    for (ch = 0; ch < 2; ch++) {
        y = ch ? 21 : 11;
        rms = dbp(ch ? mr : ml);
        h = hold[ch] > -48.0f ? XM(hold[ch]) : -1;
        rm = rms > -48.0f ? XM(rms) : 0;
        if (clip[ch]) r = "CLIP"; else if (hold[ch] > -48.0f) { fmt(t, hold[ch], 1, 0); r = t; } else r = "";
        mbar(0, y, 127, y + 8, 1, rm, ch ? "R" : "L", r, tk, 5, XM(rms) + 1, XM(dpk[ch]), h, 0, 0);
    }
    small("-48", 0, 31);
    for (i = 0; i < 4; i++) { t[0] = '-'; icat(t + 1, -TD[i]); smallc(t, tk[i], 31); }   /* -1: the gap only, "0" needs the room */
    small("0", 124, 31);
}

static void draw_meters(void)
{
    St *s = ST;
    static const float GT[5] = { 0.5f, 1.0f, 2.0f, 4.0f, 8.0f };
    int i, g3[5], c[2];
    float gm;
    char t[16];
    const char *r;
    c[0] = s->clip[0] > 0; c[1] = s->clip[1] > 0;
    lbars(s->msL, s->msR, s->dpk, s->hold, c);
    for (i = 0; i < 5; i++) g3[i] = GM(GT[i]);
    gm = s->dgr;
    if (gm > 0.01f) { t[0] = '-'; fmt(t + 1, gm, 1, 0); r = t; } else r = "0.0";
    mbar(0, 38, 127, 46, gm > 0.01f ? (GM(gm) < 122 ? GM(gm) : 122) : 127, 126, "LIMIT", r, g3, 5, 1, 0, -1, 0, 0);   /* any cut: 4 px at least */
    gm = s->peakMax > 0 ? dbv(s->peakMax) : -99.0f;
    os6("PEAK", 1, 49);
    if (gm > -70.0f) fmt(t, gm, 1, 0); else scat(t, "--.-");
    os6r(t, 61, 49);
    os6("LIMIT", 67, 49);
    gm = -dbv(s->limMin);
    if (gm > 0.01f) fmt(t, gm, 1, 0); else scat(t, "0.0");
    os6r(t, 127, 49);
}

static void draw_in(void)
{
    St *s = ST;
    int c[2], on;
    float pk;
    char t[16];
    const char *r;
    c[0] = s->iclip[0] > 0; c[1] = s->iclip[1] > 0; on = c[0] | c[1];
    lbars(s->ims[0], s->ims[1], s->idpk, s->ihold, c);
    r = on ? "INPUT CLIP" : "NO CLIP";
    os6(r, 64 - 3 * slen(r), 39);
    if (on) invert(0, 38, 127, 46);
    pk = s->ipeakMax > 0 ? dbv(s->ipeakMax) : -99.0f;
    os6("PEAK", 1, 49);
    if (pk > -70.0f) fmt(t, pk, 1, 0); else scat(t, "--.-");
    os6r(t, 61, 49);
    os6("CLIPS", 67, 49);
    icat(t, s->nclip);
    os6r(t, 127, 49);
}


/* ---- KALEIDO (MENU > KALEIDO): full screen, no text. Six mirrored segments of a warped sine field, Bayer
 * dithered, with the 1.5x tall pixels of the stretched LCD taken into account. Every band reacts to its level and
 * harder to its hits (a jump over its own slow mean): bass zooms it, kicks fire rings out and jolt the turn; mids
 * warp it and shift the shades, mid hits switch 6 / 8 / 12 segments; highs speed it up and add sparkle; the level
 * sets the contrast (grey haze in silence, hard black and white when loud); the L/R balance turns it. The frame inverts for 2 frames on each beat of a running
 * MIDI clock. The ring is read here, not by consume(): no meters run. --- */
#define KT 162.97466f                                       /* sine table steps per radian */
#define KS(x) T[(int)((x) + 65536.0f) & 1023]               /* sin of x table steps, x > -65536 */
#ifndef MS_ZT
#define MS_ZT ((volatile const unsigned *)0x1181FF00u)      /* MIDI transport block (docs/dev/transport-block.md) */
#endif

static void kal_poll(St *s)         /* every 16 ms: band levels and L/R balance of the new frames */
{
    unsigned w = s->w, i = s->rd;
    float x, y, b = 0, md = 0, h = 0, ms = 0, mm = 0, l0 = s->kl[0], l1 = s->kl[1], l2 = s->kl[2];
    if (w - i > 2048) i = w - 2048;
    for (; i != w; i++) {
        x = (float)MS_RING_M[i & 4095] * (1.0f / 32768.0f);
        y = (float)MS_RING_S[i & 2047] * (1.0f / 32768.0f);
        l1 += 0.02f * (x - l1); l0 += 0.02f * (l1 - l0); l2 += 0.25f * (x - l2);   /* 2-pole 140 Hz, 1-pole 2 kHz */
        b += ab(l0); md += ab(l2 - l1); h += ab(x - l2);
        ms += x * y; mm += x * x + y * y;
    }
    s->rd = w; s->kl[0] = l0; s->kl[1] = l1; s->kl[2] = l2;
    s->ke[0] += b; s->ke[1] += md; s->ke[2] += h; s->ke[3] += ms; s->ke[4] += mm;
}

static int kal_beat(void)           /* 1 on odd beats of a running MIDI clock: black and white swap each beat */
{
    volatile const unsigned *w = MS_ZT;
    unsigned q = w[1], c = w[4];
    if (w[0] != 0x5A4D5401u || !w[2] || !c) return 0;          /* no clock or stopped: normal */
    if ((q & 1) || w[1] != q) return ST->kinv;                  /* mid-write: keep */
    return (int)udiv(c - 1, 24) & 1;
}

static float mx2(float a, float b) { return a > b ? a : b; }

static void kal_frame(St *s)        /* every 4th tick, before the draw */
{
    float dt = (float)MS_FRAME_MS * 0.001f, *e = s->ke, v[3], o[3], bal;
    int k;
    for (k = 0; k < 3; k++) {       /* each band against its own peak (falls in about 2 s), and its hits over its slow mean */
        s->kpk[k] = mx2(e[k], s->kpk[k] * 0.97f);
        v[k] = e[k] * rcp(mx2(s->kpk[k], 2.0f));
        o[k] = mx2(v[k] - s->ksl[k], 0);
        s->ksl[k] += (v[k] - s->ksl[k]) * 0.15f;
        e[k] = 0;
    }
    bal = e[4] > 1e-3f ? 2.0f * e[3] * rcp(e[4]) : 0;
    e[3] = e[4] = 0;
    s->kb = mx2(v[0], s->kb * 0.7f);
    s->kra = mx2(2.0f * o[0], s->kra * 0.6f);
    s->kring += s->kra * 0.8f;
    if (s->kring > 6283.0f) s->kring -= 6283.18531f;
    s->km = mx2(v[1] + o[1], s->km * 0.7f);
    s->kh = mx2(v[2] + o[2], s->kh * 0.5f);
    if (o[1] > 0.2f && s->ksh <= 0) { s->ksi = (s->ksi + 1) & 3; s->ksh = 6; }   /* a mid hit: 6 > 8 > 12 > 8 segments */
    else s->ksh--;
    s->kt += dt * (0.12f + 0.6f * s->km + 1.4f * s->kh);   /* ponytail: float t, fine for about a day open */
    s->krot += dt * (0.06f + 0.12f * (float)s->krs + 0.8f * bal + 0.5f * s->kra) * KT;
    if (s->krot >= 1024.0f) s->krot -= 1024.0f;
    if (s->krot < 0) s->krot += 1024.0f;
    s->kinv = kal_beat();
}

static float ph(float x) { x *= KT; return x - 1024.0f * (float)ifl(x * (1.0f / 1024.0f)); }   /* a phase in [0, 1024) steps */

static void draw_kal(void)
{
    St *s = ST;
    static const float SG[10] = { 170.66667f, 128.0f, 85.333333f, 128.0f, 256.0f, 170.66667f, 128.0f, 102.4f, 85.333333f, 64.0f };   /* table steps per segment: AUTO 6 8 12 8, then 4 6 8 10 12 16 */
    float *T = MS_FFT, th[64], z = (1.15f - s->kb * 0.45f) * (1.0f - 0.07f * (float)s->kzs) * KT, t = s->kt, md = s->km;
    float p1 = ph(0.9f * t + 2.0f * md), p2 = ph(-1.1f * t), p3 = ph(t), p4 = ph(-0.8f * t), p5 = ph(0.4f * t);
    float p6 = ph(-2.5f * t - s->kring), p7 = ph(3.0f * md), rot = s->krot;
    float wa = 0.12f + 0.55f * md, wr = 1.0f + s->kra, sp = 0.2f * s->kh * 4.656613e-10f;
    float sg = SG[s->kmi ? s->kmi + 3 : s->ksi], isg = rcp(sg), hs = 0.5f * sg;
    float dx, dy, d2, rs, r, ax, ay, mn, mx, q, a, u, v, f;
    unsigned char *P8 = (unsigned char *)LCD0;
    unsigned rn = (unsigned)s->tick * 2654435761u;
    int i, k, x, j, b, bit, inv = s->kinv ? 0xFF : 0;
    for (i = 0; i < 1024; i++) T[i] = cs(i - 256);            /* sin: MS_FFT is scratch off SPECTRUM */
    for (i = 0; i < 64; i++) {                                  /* 8x8 Bayer, as thresholds of the sine */
        for (b = 0, k = 0; k < 3; k++) b = b << 2 | ((((i & 7) >> k) ^ (i >> (3 + k))) & 1) << 1 | ((i >> (3 + k)) & 1);
        th[i] = (((float)b + 0.5f) * (1.0f / 32.0f) - 1.0f) * 0.35f;   /* a thin dithered edge, solid inside */
    }
    for (j = 0; j < 8; j++)
        for (x = 0; x < 128; x++) {
            dx = ((float)x - 63.5f) * 0.025f;
            for (bit = 0, k = 0; k < 8; k++) {
                dy = ((float)(j * 8 + k) - 31.5f) * 0.0375f;    /* the pixels are 1.5x as tall as wide */
                d2 = dx * dx + dy * dy;
                rs = _rsqrsp(d2); rs = rs * (1.5f - 0.5f * d2 * rs * rs);
                r = d2 * rs;
                ax = ab(dx); ay = ab(dy);
                mn = ax < ay ? ax : ay; mx = ax < ay ? ay : ax;
                q = _rcpsp(mx); q = mn * q * (2.0f - mx * q);
                a = q * (158.48f - 31.275f * q * q);            /* atan2 in table steps */
                if (ay > ax) a = 256.0f - a;
                if (dx < 0) a = 512.0f - a;
                if (dy < 0) a = 1024.0f - a;
                a += rot;
                a -= sg * (float)(int)(a * isg);
                a = ab(a - hs);                                  /* fold into one mirrored segment */
                i = (int)(a + 0.5f);
                u = r * z * T[(i + 256) & 1023] * (1.0f / KT);
                v = r * z * T[i] * (1.0f / KT);
                u += wa * KS(3.1f * KT * v + p1);
                v += wa * KS(2.7f * KT * u + p2);
                f = KS(4.2f * KT * u + p3) + KS(5.3f * KT * v + p4) + KS(3.1f * KT * (u + v) + p5) + wr * KS(7.0f * KT * r + p6);
                rn = rn * 1664525u + 1013904223u;                /* sparkle: noise on the threshold */
                if (KS(1.4f * KT * f + p7) - sp * (float)(int)rn > th[k << 3 | (x & 7)]) bit |= 1 << k;
            }
            P8[j * 128 + x] = (unsigned char)(bit ^ inv);
        }
}

/* ---- entry points ---------------------------------------------------------------------------------- */
static void init(void)
{
    St *s = ST;
    unsigned *z;
    float x, t, sn;
    int i;
    z = (unsigned *)MS_RING_M; for (i = 0; i < RING_M_N / 2; i++) z[i] = 0;
    z = (unsigned *)MS_RING_S; for (i = 0; i < RING_S_N / 2; i++) z[i] = 0;
    z = (unsigned *)s; for (i = 0; i < (int)sizeof(St) / 4; i++) z[i] = 0;
    for (i = 0; i < 252; i++) BAR[i] = -99.0f;
    for (i = 0; i < 256; i++) {
        x = (float)i * 0.0061359232f;           /* 2 pi / 1024 */
        t = x * x;
        sn = x * (1.0f - t * 0.16666667f * (1.0f - t * 0.05f * (1.0f - t * 0.023809524f * (1.0f - t * 0.013888889f * (1.0f - t * 0.0090909091f)))));
        MS_SIN[i] = sn;
    }
    MS_SIN[256] = 1.0f;
    s->opt[0] = 1;
    s->gmin = 1.0f; s->gr = 1.0f; s->scG = 1.0f;
    s->dpk[0] = s->dpk[1] = s->hold[0] = s->hold[1] = s->idpk[0] = s->idpk[1] = -99.0f;
    s->patch = MS_CUR_PATCH;
    reset_stats();
}

#ifndef MS_HOST
#pragma FUNCTION_OPTIONS(master_tap, "-ms0 --opt_for_speed=5")
#endif
void master_tap(unsigned t0)        /* t0: TSCL at the block's start (engine.c) */
{
    St *s = ST;
    unsigned ta = CYC;
    unsigned w = s->w;
    unsigned *m = (unsigned *)(MS_RING_M + (w & 4095)), *d = (unsigned *)(MS_RING_S + (w & 2047));
    const float *f = (const float *)MS_F, *ac = (const float *)MS_ACC, *sn = (const float *)MS_SNAP;
    float g = MS_GLIM, g1 = MS_PMG[0], g2 = MS_PMG[1], g3 = MS_PMG[2], y[16], v, c, a, m0 = 0, m1 = 0, q0 = 0, q1 = 0;
    const float h = 16384.0f;
    int p[8], i, ov = 0;
    /* what out_to_int will get: the stock post mix, then its clamp to +-1 */
    for (i = 0; i < 16; i++) {
        v = ((f[i] + ac[i]) * g1 + sn[i] * g2) * g3;
        c = v > 1.0f ? 1.0f : v < -1.0f ? -1.0f : v;
        ov |= (c != v) << (i >> 3);
        y[i] = c;
    }
    for (i = 0; i < 8; i++) {      /* the input (the chain's own input copy): peak, mean square, full scale */
        a = sn[i]; q0 += a * a; a = ab(a); m0 = a > m0 ? a : m0;
        a = sn[i + 8]; q1 += a * a; a = ab(a); m1 = a > m1 ? a : m1;
    }
    ov |= (m0 >= 0.999f) << 2 | (m1 >= 0.999f) << 3;
    for (i = 0; i < 8; i += 2)
        p[i] = _spack2(_spint((y[i] + y[i + 8]) * h), _spint((y[i] - y[i + 8]) * h)),
        p[i + 1] = _spack2(_spint((y[i + 1] + y[i + 9]) * h), _spint((y[i + 1] - y[i + 9]) * h));
    _amem4(m) = _packh2(p[1], p[0]); _amem4(m + 1) = _packh2(p[3], p[2]);
    _amem4(m + 2) = _packh2(p[5], p[4]); _amem4(m + 3) = _packh2(p[7], p[6]);
    _amem4(d) = _pack2(p[1], p[0]); _amem4(d + 1) = _pack2(p[3], p[2]);
    _amem4(d + 2) = _pack2(p[5], p[4]); _amem4(d + 3) = _pack2(p[7], p[6]);
    if (g < s->gmin) s->gmin = g;
    if (m0 > s->ipk[0]) s->ipk[0] = m0;
    if (m1 > s->ipk[1]) s->ipk[1] = m1;
    s->ims[0] += KI * (q0 * 0.125f - s->ims[0]);
    s->ims[1] += KI * (q1 * 0.125f - s->ims[1]);
    s->over |= ov;
    s->w = w + 8;
    s->own += CYC - ta;
    s->aud += CYC - t0;
}

static void poll(St *s)
{
    unsigned now = CYC, da = s->aud - s->la, dt = now - s->lt;
    int f, post;
    if (MS_MODE != 11 || MS_SCREEN != 11 || (MS_MENU_ENTRY != 3 && MS_MENU_ENTRY != 6)) { MS_ON = 0; return; }
    /* The UI shares the core with the audio: near 100% DSP the 16 ms analysis never ends and starves the keys
     * and footswitches (#55). Pause it above 7/8 audio, resume below 3/4. */
    s->la = s->aud; s->lt = now;
    f = s->full ? da > dt - (dt >> 2) : da > dt - (dt >> 3);
    post = f != s->full;
    s->full = f;
    if (f) s->rd = s->w;
    else if (MS_MENU_ENTRY == 6) {
        kal_poll(s);
        if ((++s->tick & 3) == 0) { kal_frame(s); post = 1; }
    } else {
        if (MS_CUR_PATCH != s->patch) { s->patch = MS_CUR_PATCH; reset_stats(); }
        consume();
        if ((++s->tick & 3) == 0) { advance(); post = 1; }
    }
    if (post) EVENT_POST(MAILBOX, 0x40);       /* one call site: a second one makes -ms3 use __c6xabi_call_stub */
}

/* 16 ms while open: the poll, and every 64 polls (1.02 s) MASTER's or KALEIDO's CPU load (its polls with
 * the audio blocks that interrupted them taken out, plus master_tap) for the SYSTEM MODS page.
 * ponytail: the screen's draw (UI task) is not counted; small next to the poll's frame work. */
void master_poll(void)
{
    St *s = ST;
    unsigned a = s->aud, t = CYC;
    int k = MS_MENU_ENTRY == 6;
    poll(s);
    if (!MS_ON) return;
    if (k != s->lk) { s->lk = k; s->np = 0; s->ui = s->own = 0; }
    s->ui += CYC - t - (s->aud - a);
    if (++s->np == 64) {
        MS_LOAD[k] = (int)((float)(s->ui + s->own) * (1000.0f / 307.2e6f) + 0.5f);   /* 64 x 16 ms x 300 MHz */
        s->np = 0;
        s->ui = s->own = 0;
    }
}

void master_key(int ev, int steps)
{
    St *s = ST;
    int i, p = s->page;
    if (MS_MENU_ENTRY == 6) {       /* KALEIDO: knob 1 zoom, knob 2 spin, knob 3 mirrors, EXIT */
        int *k = ev == 160 ? &s->kzs : ev == 161 ? &s->krs : ev == 162 ? &s->kmi : 0, hi = ev == 162 ? 6 : 10;
        if (MS_IDLE_SHOWN) {        /* opened by IDLE KALEIDO: a knob turn or a key's release goes back to play */
            if (!k && !(ev & 1 && (unsigned)(ev - 33) <= 44))  /* not a knob turn or a key release */
                return;             /* presses and hold timers: nothing (the footswitch press is chain_keys.c idle_ev) */
            MS_IDLE_SHOWN = 0; MS_ON = 0; MS_MODE = 0;
            goto post;              /* share the EVENT_POST below: MASTER has no room for another call site */
        }
        if (ev == 65) { MS_ON = 0; SET_SCREEN(0, 6); }
        else if (k && steps) { i = *k + (steps > 0 ? 1 : -1); if (i >= (ev == 162 ? 0 : -10) && i <= hi) *k = i; }
        return;
    }
    if (ev == 65) { MS_ON = 0; SET_SCREEN(0, 3); return; }
    if (ev == 67 || (ev == 162 && steps > 0)) s->page = p == 5 ? 0 : p + 1;     /* knob 3 press or turn: next page */
    else if (ev == 162 && steps < 0) s->page = p == 0 ? 5 : p - 1;             /* knob 3 turn back */
    else if (ev == 34) {
        if (p >= 3) reset_stats();
        else s->opt[p] = s->opt[p] + 1 >= PNV[p] ? 0 : s->opt[p] + 1;
    }
    else if (ev == 160 && p < 3 && steps) {         /* knob 1 turn: one option step, stops at the ends */
        i = s->opt[p] + (steps > 0 ? 1 : -1);
        if (i >= 0 && i < PNV[p]) s->opt[p] = i;
    }
post:
    EVENT_POST(MAILBOX, 0x40);
}

void master_draw(void)
{
    St *s = ST;
    char t[16], *o;
    int i, p = s->page;
    volatile unsigned *l = LCD0;
    if (!inited) { init(); inited = 1; }
    if (!MS_ON) { s->rd = s->w; MS_ON = 1; }
    if (s->full) {
        for (i = 0; i < 256; i++) l[i] = 0;
        font7c("CPU FULL", 64, 28);           /* EXIT still works */
        LCD_DIRTY(0);
        return;
    }
    if (MS_MENU_ENTRY == 6) { draw_kal(); LCD_DIRTY(0); return; }
    for (i = 0; i < 256; i++) l[i] = 0;
    o = icat(t, p + 1); scat(o, "/6");
    font7r(t, 127, 1);
    title(PN[p]);
    if (p == 0) draw_spec(); else if (p == 1) draw_scope(); else if (p == 2) draw_stereo();
    else if (p == 3) draw_loud(); else if (p == 5) draw_meters(); else draw_in();
    if (p < 3) { o = scat(t, PO[p]); o = scat(o, ":"); scat(o, PV[p][s->opt[p]]); } else scat(t, "RESET");
    softkey(0, t);
    softkey(1, "EXIT");
    softkey(2, PN[p == 5 ? 0 : p + 1]);
    LCD_DIRTY(0);
}
