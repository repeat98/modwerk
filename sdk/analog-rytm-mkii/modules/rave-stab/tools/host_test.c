/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Host tests of SY RAVE's voice (src/ra_dsp.c), the same C as the unit runs, with dsp.h's
 * host model of the EMAC. tools/run_host_test.sh builds and runs it. Prints each
 * measurement and exits 1 on a failure. */
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "ra_dsp.h"

static int failed;
#define CHECK(cond, ...) do { printf("%s  ", (cond) ? "ok  " : "FAIL"); printf(__VA_ARGS__); printf("\n"); if (!(cond)) failed = 1; } while (0)

static const double FS = RA_RATE, Q31 = 2147483648.0;
#define LEN (RA_RATE * 4)
static double buf[LEN], buf2[LEN];

/* TUN 64, STR 0 (none), EURK, root voicing, DET 0, square, clean, the register T-1, velocity 100, note 60 */
static struct ra_knobs defaults(void)
{
    struct ra_knobs k = { 64, 0, 0, 0, 0, 64, 64, 0, 100, 1 << 28 };
    return k;
}

static void render(const struct ra_knobs *k, int n, double *out)
{
    struct ra_voice v;
    int32_t blk[RA_FRAMES];
    memset(&v, 0, sizeof v);
    ra_hit(&v, k);
    for (int i = 0; i < n; i += RA_FRAMES) {
        ra_render(&v, k, blk);
        for (int j = 0; j < RA_FRAMES && i + j < n; j++)
            out[i + j] = blk[j] / Q31;
    }
}

static double peak(const double *x, int a, int b)
{
    double p = 0;
    for (int i = a; i < b; i++)
        p = fmax(p, fabs(x[i]));
    return p;
}

static double rms(const double *x, int a, int b)
{
    double s = 0;
    for (int i = a; i < b; i++)
        s += x[i] * x[i];
    return sqrt(s / (b - a));
}

static double db(double x) { return 20 * log10(x + 1e-30); }

#define N 32768
static double re[N], im[N], pw[N / 2];
static void fft(int n)
{
    for (int i = 1, j = 0; i < n; i++) {
        int bit = n >> 1;
        for (; j & bit; bit >>= 1)
            j ^= bit;
        j ^= bit;
        if (i < j) {
            double t = re[i]; re[i] = re[j]; re[j] = t;
            t = im[i]; im[i] = im[j]; im[j] = t;
        }
    }
    for (int len = 2; len <= n; len <<= 1) {
        double a = -2 * M_PI / len;
        for (int i = 0; i < n; i += len)
            for (int j = 0; j < len / 2; j++) {
                double wr = cos(a * j), wi = sin(a * j);
                double xr = re[i + j + len / 2] * wr - im[i + j + len / 2] * wi;
                double xi = re[i + j + len / 2] * wi + im[i + j + len / 2] * wr;
                re[i + j + len / 2] = re[i + j] - xr; im[i + j + len / 2] = im[i + j] - xi;
                re[i + j] += xr; im[i + j] += xi;
            }
    }
}

/* the power spectrum of x[0..N), Hann windowed, and its centroid */
static double spectrum(const double *x)
{
    for (int i = 0; i < N; i++) {
        re[i] = x[i] * (0.5 - 0.5 * cos(2 * M_PI * i / N));
        im[i] = 0;
    }
    fft(N);
    double sw = 0, swf = 0;
    for (int i = 0; i < N / 2; i++) {
        pw[i] = re[i] * re[i] + im[i] * im[i];
        sw += pw[i];
        swf += pw[i] * i * FS / N;
    }
    return swf / sw;
}

/* the strongest bin within 1.5 % of f, in dB against the spectrum's strongest */
static double level_at(double f)
{
    double top = 0, best = 0;
    for (int i = 1; i < N / 2; i++)
        top = fmax(top, pw[i]);
    int lo = (int)(f * 0.985 * N / FS), hi = (int)(f * 1.015 * N / FS) + 1;
    for (int i = lo; i <= hi; i++)
        best = fmax(best, pw[i]);
    return 10 * log10(best / top + 1e-30);
}

static double f_at(double f)
{
    int lo = (int)(f * 0.985 * N / FS), hi = (int)(f * 1.015 * N / FS) + 1, b = lo;
    for (int i = lo; i <= hi; i++)
        if (pw[i] > pw[b])
            b = i;
    /* parabolic interpolation of the peak */
    double a = log(pw[b - 1] + 1e-30), m = log(pw[b] + 1e-30), c = log(pw[b + 1] + 1e-30);
    return (b + 0.5 * (a - c) / (a - 2 * m + c)) * FS / N;
}

int main(void)
{
    const double root = 261.6256 / 2;           /* note 60 at T-1 */

    {
        int sh;
        double worst = 0;
        for (int32_t o = -6 * RA_Q24; o <= 6 * RA_Q24; o += RA_Q24 / 97) {
            int32_t m = ra_exp2_q30(o, &sh);
            worst = fmax(worst, fabs(1200 * log2(m / 1073741824.0 * pow(2, sh)) - 1200.0 * o / RA_Q24));
        }
        CHECK(worst < 0.02, "2^x within %.4f cents over +-6 octaves", worst);
        double f[RA_OCTAVES];
        for (int t = 0; t < RA_OCTAVES; t++)
            f[t] = ra_inc(1 << 28, ra_tune(64, t)) * FS / 4294967296.0;
        CHECK(fabs(f[0] - root) < 0.05 && fabs(f[1] - root / 2) < 0.05 && fabs(f[2] - root * 2) < 0.05 && fabs(f[3] - root * 4) < 0.1,
              "the registers at note 60: T-1 %.2f, T-2 %.2f, T 0 %.2f, T+1 %.2f Hz", f[0], f[1], f[2], f[3]);
        double up = ra_inc(1 << 28, ra_tune(96, 0)) * FS / 4294967296.0;
        CHECK(fabs(1200 * log2(up / f[0]) - 1200) < 0.5, "TUN 96 is +12 semitones (%.2f cents)", 1200 * log2(up / f[0]));
        CHECK(fabs(ra_detune(127, 1) / 13981.0 - 30) < 0.1 && ra_detune(0, 1) == 0 && ra_detune(127, 0) == 0,
              "DET 127 moves the second note +%.1f cents, the root not at all", ra_detune(127, 1) / 13981.0);
    }

    /* every chord plays its six notes: a peak at each note's fundamental */
    {
        static const char *names[RA_CHORDS] = { "EURK", "MIN", "MIN7", "MIN9", "MIN11", "MAJ", "MAJ7", "DOM7", "SUS2", "SUS4", "5TH", "DIM", "OCT" };
        struct ra_knobs k = defaults();
        int ok = 1;
        double worst_db = 0, worst_c = 0;
        for (int c = 0; c < RA_CHORDS; c++) {
            k.chd = (uint8_t)c;
            render(&k, N, buf);
            spectrum(buf);
            for (int i = 0; i < RA_NOTES; i++) {
                double f = root * pow(2, ra_chord_cents[c][i] / 1200.0);
                double l = level_at(f), cents = 1200 * log2(f_at(f) / f);
                worst_db = fmin(worst_db, l);
                worst_c = fmax(worst_c, fabs(cents));
                if (l < -12 || fabs(cents) > 3) {
                    printf("      %s note %d (%.1f Hz): %.1f dB, %.1f cents\n", names[c], i, f, l, cents);
                    ok = 0;
                }
            }
        }
        CHECK(ok, "13 chords: every note's fundamental within 12 dB of the loudest line (worst %.1f dB) and 3 cents (worst %.2f)", worst_db, worst_c);
        CHECK(ra_chord_cents[0][1] == 610 && ra_chord_cents[0][5] == 2008, "EURK keeps HH Alloy CLSD's intervals (%d .. %d cents)", ra_chord_cents[0][1], ra_chord_cents[0][5]);
    }

    /* VOI: the root goes down, a higher note never comes to the bass */
    {
        struct ra_knobs k = defaults();
        k.chd = 1;                                  /* MIN: 0 3 7 12 15 19 */
        k.voi = 1;
        render(&k, N, buf);
        spectrum(buf);
        double at_sub = level_at(root / 2);
        CHECK(at_sub > -12, "VOI 1: the root an octave down (%.1f dB at %.1f Hz)", at_sub, root / 2);
        int32_t n[RA_NOTES];
        int bad = 0;
        for (int c = 0; c < RA_CHORDS; c++)
            for (int v = 0; v < RA_VOICINGS; v++) {
                ra_voicing(c, v, n);
                for (int i = 1; i < RA_NOTES; i++)
                    if (n[i] < n[0] && (n[0] - n[i]) % (1 << 24) != 0)
                        bad++;
            }
        CHECK(bad == 0, "no voicing puts another pitch class under the root (%d found)", bad);
        ra_voicing(1, 2, n);
        CHECK(n[0] == -(1 << 24) && n[2] == 700 * 13981 - (1 << 24), "VOI 2 takes the root and the fifth down an octave");
        ra_voicing(1, 7, n);
        CHECK(n[0] == -2 * (1 << 24), "VOI 7 puts the root two octaves down");
        ra_voicing(1, 8, n);
        CHECK(n[2] - n[0] == 2 * (1 << 24) + 700 * 13981, "VOI 8 (wide) puts the fifth two octaves up");
    }

    /* the chord is taken at the hit */
    {
        struct ra_knobs k = defaults();
        k.chd = 1;
        render(&k, N, buf);
        struct ra_voice v;
        int32_t blk[RA_FRAMES];
        memset(&v, 0, sizeof v);
        ra_hit(&v, &k);
        for (int i = 0; i < N; i += RA_FRAMES) {
            if (i == RA_FRAMES * 4) {
                k.chd = 5;                          /* the next step's chord, mid-note */
                k.voi = 3;
            }
            ra_render(&v, &k, blk);
            for (int j = 0; j < RA_FRAMES; j++)
                buf2[i + j] = blk[j] / Q31;
        }
        double e = 0;
        for (int i = 0; i < N; i++)
            e += fabs(buf[i] - buf2[i]);
        CHECK(e == 0, "a CHD or VOI change after the hit leaves the ringing chord as it was");
    }

    /* WAV: saw, square, narrow pulse; no DC */
    {
        struct ra_knobs k = defaults();
        double c[3];
        int w[3] = { 0, 64, 127 };
        double mean = 0;
        for (int i = 0; i < 3; i++) {
            k.wav = (uint8_t)w[i];
            render(&k, N, buf);
            c[i] = spectrum(buf);
            if (i == 2)
                for (int j = 0; j < N; j++)
                    mean += buf[j] / N;
        }
        CHECK(c[2] > c[1] * 1.3, "WAV 127 (12 %% pulse) is brighter than WAV 64 (square): centroid %.0f against %.0f Hz", c[2], c[1]);
        CHECK(fabs(c[0] - c[1]) > 50, "WAV 0 (saw) differs from the square: centroid %.0f against %.0f Hz", c[0], c[1]);
        CHECK(fabs(mean) < 2e-3, "WAV 127: mean %.5f, no DC from the narrow pulse", mean);
        double lo = 1e9, r0 = 0, r64 = 0;
        for (int w = 0; w <= 64; w += 4) {
            k.wav = (uint8_t)w;
            render(&k, 8192, buf);
            double r = rms(buf, 2048, 8192);
            lo = fmin(lo, r);
            if (w == 0) r0 = r;
            if (w == 64) r64 = r;
        }
        CHECK(fabs(db(r64 / r0)) < 1, "saw and square within 1 dB (%.2f dB)", db(r64 / r0));
        CHECK(lo > 0.85 * fmin(r0, r64), "WAV 0 to 64 never dips: lowest %.3f against saw %.3f and square %.3f", lo, r0, r64);
    }

    /* band-limited: a high saw chord's lines between the harmonics stay low */
    {
        struct ra_knobs k = defaults();
        k.chd = 12;                                 /* OCT: notes on one harmonic series */
        k.wav = 0;
        k.octave = 3;                               /* T+1 */
        k.ratio = 1 << 29;                          /* note 72: 1046.5 Hz */
        render(&k, N, buf);
        spectrum(buf);
        double f0 = 1046.5, top = 0, alias = 0;
        for (int i = 1; i < N / 2; i++) {
            double f = i * FS / N, h = f / f0, d = fabs(h - round(h)) * f0;
            top = fmax(top, pw[i]);
            if (d > 40 && f > 200 && f < 20000)
                alias = fmax(alias, pw[i]);
        }
        CHECK(10 * log10(alias / top) < -30, "a saw chord at 1046.5 Hz: its strongest alias under 20 kHz %.1f dB under its loudest line", 10 * log10(alias / top));
    }

    /* STR, and the level holding */
    {
        CHECK(ra_str_step(0) == 0 && ra_str_step(10) == 0 && ra_str_step(11) == 1 && ra_str_step(64) == 38 && ra_str_step(127) == 150, "STR 0 none, 11 one block (0.7 ms) a note, 64 38 blocks (25 ms), 127 150 (100 ms, 0.5 s for the chord)");
        int32_t n[RA_NOTES];
        uint16_t w[RA_NOTES];
        ra_voicing(1, 3, n);                        /* MIN, drop 2: the notes out of order */
        ra_strum(127, n, w);
        int up = 1, down = 1;
        for (int i = 0; i < RA_NOTES; i++)
            for (int j = 0; j < RA_NOTES; j++)
                if (n[i] < n[j] && w[i] >= w[j])
                    up = 0;
        ra_strum(0, n, w);
        for (int i = 0; i < RA_NOTES; i++)
            down &= w[i] == 0;
        CHECK(up && down, "STR opens the notes from the lowest up whatever the voicing; at 0 all at once");
        /* a strummed hit: silence before the second note's turn holds one note only, later all */
        struct ra_knobs k = defaults();
        k.str = 127;
        k.chd = 1;
        render(&k, LEN, buf);
        k.str = 0;
        render(&k, LEN, buf2);
        double early = rms(buf, 64, 150 * 32), full = rms(buf, (int)(0.8 * FS), (int)(2.8 * FS)), ref = rms(buf2, (int)(0.8 * FS), (int)(2.8 * FS));
        CHECK(early < 0.6 * ref && fabs(db(full / ref)) < 0.5, "STR 127: the first 100 ms at %.2f of the full chord, all six after (%.2f dB over 2 s)", early / ref, db(full / ref));
        double jump = 0;
        for (int i = 1; i < (int)FS; i++)
            jump = fmax(jump, fabs(buf[i] - buf[i - 1]));
        CHECK(jump < 0.5, "the notes open without a step (largest sample step %.3f)", jump);
        /* a strummed hit over a ringing one fades the waiting notes out, no click */
        struct ra_voice v;
        int32_t blk[RA_FRAMES];
        memset(&v, 0, sizeof v);
        k.str = 0;
        ra_hit(&v, &k);
        for (int b = 0; b < 200; b++)
            ra_render(&v, &k, blk);
        k.str = 127;
        ra_hit(&v, &k);
        double prev = blk[RA_FRAMES - 1] / Q31, worst = 0;
        for (int b = 0; b < 900; b++) {
            ra_render(&v, &k, blk);
            for (int i = 0; i < RA_FRAMES; i++) {
                worst = fmax(worst, fabs(blk[i] / Q31 - prev));
                prev = blk[i] / Q31;
            }
        }
        CHECK(worst < 0.5, "a strum over a ringing chord: largest sample step %.3f", worst);
        k = defaults();
        render(&k, LEN, buf);
        double a = rms(buf, (int)(0.5 * FS), (int)(0.6 * FS)), c = rms(buf, (int)(3.5 * FS), (int)(3.6 * FS));
        CHECK(fabs(db(c / a)) < 0.5, "the level holds (the AMP page shapes it): %.2f dB from 0.5 s to 3.5 s", db(c / a));
    }

    /* PCH */
    {
        double up = ra_pch(127) / (double)(1 << 24), down = ra_pch(0) / (double)(1 << 24), near = ra_pch(65) * 1200.0 / (1 << 24);
        CHECK(ra_pch(64) == 0 && fabs(down + 2) < 1e-6 && fabs(up - 1.938) < 0.01 && near < 1, "PCH 64 none, 0 starts %.3f octaves down, 127 %.3f up, 65 %.2f cents", down, up, near);
        struct ra_knobs k = defaults();
        struct ra_voice v;
        int32_t blk[RA_FRAMES];
        memset(&v, 0, sizeof v);
        k.pch = 127;
        ra_hit(&v, &k);
        double p0 = v.pitch / (double)(1 << 24), p20 = 0, p200 = 0;
        for (int b = 1; b <= 300; b++) {
            ra_render(&v, &k, blk);
            if (b == 30)
                p20 = v.pitch / (double)(1 << 24);
        }
        p200 = v.pitch * 1200.0 / (1 << 24);
        CHECK(fabs(p20 / p0 - exp(-1)) < 0.02 && fabs(p200) < 1, "PCH 127 falls to %.3f of its start in 20 ms and to %.3f cents in 200 ms", p20 / p0, p200);
        k.pch = 64;
        ra_hit(&v, &k);
        CHECK(v.pitch == 0, "a hit at PCH 64 plays at the note from its start");
    }

    /* levels, velocity */
    {
        struct ra_knobs k = defaults();
        k.velocity = 127;
        double worst = 0;
        int wraps = 0;
        for (int c = 0; c < RA_CHORDS; c++)
            for (int w = 0; w <= 127; w += 63)
                for (int pc = 0; pc <= 127; pc += 127) {
                    k.chd = (uint8_t)c;
                    k.wav = (uint8_t)w;
                    k.det = 127;
                    k.pch = (uint8_t)pc;
                    render(&k, 8192, buf);
                    worst = fmax(worst, peak(buf, 0, 8192));
                    for (int i = 1; i < 8192; i++)
                        wraps += fabs(buf[i] - buf[i - 1]) > 1.9;
                }
        CHECK(worst <= 1.0 && wraps == 0, "every chord, wave, PCH 0 and 127 and DET 127 at velocity 127: peak %.3f, no wraps (%d)", worst, wraps);
        k.pch = 64;
        k = defaults();
        render(&k, 8192, buf);
        double typical = peak(buf, 0, 8192);
        CHECK(typical > 0.3 && typical < 0.95, "EURK as a square at velocity 100 peaks at %.3f", typical);
        k.velocity = 30;
        render(&k, 8192, buf2);
        k.velocity = 127;
        render(&k, 8192, buf);
        CHECK(db(rms(buf, 0, 8192) / rms(buf2, 0, 8192)) > 8, "velocity 127 is %.1f dB over 30", db(rms(buf, 0, 8192) / rms(buf2, 0, 8192)));
    }

    /* smoothing: a TUN jump glides over blocks */
    {
        struct ra_knobs k = defaults();
        struct ra_voice v;
        int32_t blk[RA_FRAMES];
        memset(&v, 0, sizeof v);
        ra_hit(&v, &k);
        ra_render(&v, &k, blk);
        int32_t t0 = v.tune;
        k.tun = 127;
        ra_render(&v, &k, blk);
        int32_t t1 = v.tune, want = ra_tune(127, 0);
        for (int i = 0; i < 80; i++)
            ra_render(&v, &k, blk);
        CHECK((t1 - t0) < (want - t0) / 6 && abs(v.tune - want) < (1 << 16), "a TUN jump moves 1/8 of the way a block (%.3f) and settles",
              (t1 - t0) / (double)(want - t0));
    }

    printf(failed ? "FAILED\n" : "all passed\n");
    return failed;
}
