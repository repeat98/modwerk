/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Host tests of Mono Synth's voice (src/ms_dsp.c), the same C as the unit runs, with
 * dsp.h's host model of the EMAC:
 *
 *   cc -std=c11 -O1 -g -fsanitize=undefined -DMW_DSP_HOST \
 *      -I src -I ../../../machines/analog-rytm-mkii/include \
 *      tools/host_test.c src/ms_dsp.c -lm -o /tmp/ms_test && /tmp/ms_test
 *
 * (tools/run_host_test.sh does that.) Prints each measurement and exits 1 on a failure. */
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "ms_dsp.h"
#include "ms_gate.h"

static int failed;
#define CHECK(cond, ...) do { printf("%s  ", (cond) ? "ok  " : "FAIL"); printf(__VA_ARGS__); printf("\n"); if (!(cond)) failed = 1; } while (0)

static const double FS = MS_RATE, Q31 = 2147483648.0;

static double hz(uint32_t inc) { return inc * FS / 4294967296.0; }
static double cents(double a, double b) { return 1200.0 * log2(a / b); }

static struct ms_knobs knobs(int tun, int range, int saw, int pls, int sub, int nse, int lfo, int mod, double ratio)
{
    struct ms_knobs k = { (uint8_t)tun, (uint8_t)lfo, (uint8_t)mod, (uint8_t)pls, (uint8_t)saw, (uint8_t)sub, (uint8_t)nse,
                          (uint8_t)range, (int32_t)(ratio * (1 << 28)) };
    return k;
}

/* blocks of the voice, from a fresh one, as doubles at full scale 1 */
static void render(const struct ms_knobs *k, int frames, double *out)
{
    struct ms_voice v;
    int32_t blk[MS_FRAMES];
    ms_init(&v, k);
    for (int i = 0; i < frames; i += MS_FRAMES) {
        ms_render(&v, k, blk);
        for (int j = 0; j < MS_FRAMES && i + j < frames; j++)
            out[i + j] = blk[j] / Q31;
    }
}

/* ---- a small FFT for the spectra ---- */
#define N 16384
static void fft(double *re, double *im, int n)
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

/* power spectrum of x (N samples, after a settling skip), Hann windowed */
static void spectrum(const double *x, double *p)
{
    static double re[N], im[N];
    for (int i = 0; i < N; i++) {
        double w = 0.5 - 0.5 * cos(2 * M_PI * i / N);
        re[i] = x[i] * w;
        im[i] = 0;
    }
    fft(re, im, N);
    for (int i = 0; i <= N / 2; i++)
        p[i] = re[i] * re[i] + im[i] * im[i];
}

/* the energy at harmonics of f0 (within 4 bins) against the rest, in dB below the harmonics */
static double alias_db(const double *p, double f0, double fmax)
{
    double bin = FS / N, harm = 0, rest = 0;
    for (int i = 2; i <= N / 2; i++) {
        double f = i * bin;
        if (f > fmax)
            break;
        double k = round(f / f0);
        if (k >= 1 && fabs(f - k * f0) <= 4 * bin)
            harm += p[i];
        else
            rest += p[i];
    }
    return 10 * log10(rest / harm);
}

static int peak_bin(const double *p, int lo)
{
    int best = lo;
    for (int i = lo; i <= N / 2; i++)
        if (p[i] > p[best])
            best = i;
    return best;
}

static double *buf(int n) { double *b = calloc((size_t)n, sizeof *b); if (!b) exit(2); return b; }

int main(void)
{
    setvbuf(stdout, NULL, _IONBF, 0);
    /* 2^x */
    double worst = 0;
    for (int32_t o = -6 * MS_Q24; o <= 6 * MS_Q24; o += 4099) {
        int e;
        double m = ms_exp2_q30(o, &e) / 1073741824.0 * pow(2, e);
        double c = fabs(cents(m, pow(2, o / (double)MS_Q24)));
        if (c > worst)
            worst = c;
    }
    CHECK(worst < 0.02, "2^x within %.4f cents over -6..+6 octaves", worst);

    /* pitch: the note, the range, TUN */
    double f = hz(ms_osc_inc(1 << 28, ms_tune(64, 1)));
    CHECK(fabs(cents(f, 261.6256)) < 0.1, "note 60 at 8': %.3f Hz", f);
    static const char *const rn[4] = { "16'", "8'", "4'", "2'" };
    for (int r = 0; r < 4; r++) {
        f = hz(ms_osc_inc(1 << 28, ms_tune(64, r)));
        CHECK(fabs(cents(f, 261.6256 * pow(2, r - 1))) < 0.1, "range %s: %.3f Hz", rn[r], f);
    }
    f = hz(ms_osc_inc(1 << 28, ms_tune(96, 1)));
    CHECK(fabs(cents(f, 523.2511)) < 0.1, "TUN 96 (+12 semitones): %.3f Hz", f);
    f = hz(ms_osc_inc(1 << 28, ms_tune(0, 1)));
    CHECK(fabs(cents(f, 65.4064)) < 0.1, "TUN 0 (-24 semitones): %.3f Hz", f);
    f = hz(ms_osc_inc(1 << 28, ms_tune(72, 1)));
    CHECK(fabs(cents(f, 261.6256 * pow(2, 3 / 12.0))) < 0.1, "TUN 72 (+3 semitones): %.3f Hz", f);
    f = hz(ms_osc_inc((int32_t)(0.5 * (1 << 28)), ms_tune(64, 1)));
    CHECK(fabs(cents(f, 130.8128)) < 0.1, "note 48 (ratio 1/2): %.3f Hz", f);
    f = hz(ms_osc_inc((int32_t)(7.5 * (1 << 28)), ms_tune(127, 3)));
    CHECK(f > 11000 && f < 12100, "the top is held at 12 kHz: %.0f Hz", f);

    double *x = buf(48000 + N), *p = buf(N / 2 + 1);

    /* the rendered saw is at its pitch: rising zero crossings over a second */
    struct ms_knobs k = knobs(64, 1, 127, 0, 0, 0, 64, 0, 1.0);
    render(&k, 48000, x);
    int up = 0;
    for (int i = 1; i < 48000; i++)
        if (x[i - 1] < 0 && x[i] >= 0)
            up++;
    CHECK(abs(up - 262) <= 1, "saw at note 60 crosses zero %d times a second", up);
    double peak = 0;
    for (int i = 0; i < 48000; i++)
        peak = fmax(peak, fabs(x[i]));
    CHECK(peak > 0.45 && peak < 0.55, "saw alone at full level peaks at %.3f", peak);

    /* band-limiting: the saw and the pulse at a high note keep their aliases low */
    double f0 = 261.6256 * 4 * 4;    /* 4186 Hz: 2' and two octaves up */
    k = knobs(64, 3, 127, 0, 0, 0, 64, 0, 4.0);
    render(&k, 4096 + N, x);
    spectrum(x + 4096, p);
    double a_saw = alias_db(p, f0, 20000);
    /* the same saw without its BLEP, for comparison */
    {
        uint32_t inc = ms_osc_inc(4 << 28, ms_tune(64, 3)), ph = 0;
        double *y = buf(N);
        for (int i = 0; i < N; i++) {
            ph += inc;
            y[i] = (int32_t)(ph ^ 0x80000000u) / Q31;
        }
        double *q = buf(N / 2 + 1);
        spectrum(y, q);
        double a_naive = alias_db(q, f0, 20000);
        CHECK(a_saw < -30 && a_saw < a_naive - 12, "saw at %.0f Hz: aliases %.1f dB (naive saw %.1f dB)", f0, a_saw, a_naive);
        free(y);
        free(q);
    }
    k = knobs(64, 3, 0, 127, 0, 0, 64, 0, 4.0);
    render(&k, 4096 + N, x);
    spectrum(x + 4096, p);
    double a_pls = alias_db(p, f0, 20000);
    CHECK(a_pls < -30, "pulse at %.0f Hz: aliases %.1f dB", f0, a_pls);

    /* the sub: -1 octave at 1..63, -2 at 64..127, nothing at 0 */
    f0 = 261.6256;
    k = knobs(64, 1, 0, 0, 63, 0, 64, 0, 1.0);
    render(&k, 4096 + N, x);
    spectrum(x + 4096, p);
    double fs1 = peak_bin(p, 3) * FS / N;
    CHECK(fabs(fs1 - f0 / 2) < 4, "SUB 63: strongest at %.1f Hz (-1 octave: %.1f)", fs1, f0 / 2);
    k = knobs(64, 1, 0, 0, 127, 0, 64, 0, 1.0);
    render(&k, 4096 + N, x);
    spectrum(x + 4096, p);
    double fs2 = peak_bin(p, 3) * FS / N;
    CHECK(fabs(fs2 - f0 / 4) < 4, "SUB 127: strongest at %.1f Hz (-2 octaves: %.1f)", fs2, f0 / 4);
    k = knobs(64, 1, 0, 0, 0, 0, 64, 0, 1.0);
    render(&k, 4096, x);
    peak = 0;
    for (int i = 0; i < 4096; i++)
        peak = fmax(peak, fabs(x[i]));
    CHECK(peak == 0, "SUB 0 alone is silent (peak %.6f)", peak);
    k = knobs(64, 3, 0, 0, 63, 0, 64, 0, 4.0);     /* a high sub keeps its edges smooth too */
    render(&k, 4096 + N, x);
    spectrum(x + 4096, p);
    double a_sub = alias_db(p, 261.6256 * 16 / 2, 20000);
    CHECK(a_sub < -30, "sub at %.0f Hz: aliases %.1f dB", 261.6256 * 8, a_sub);

    /* noise: centred, and about as strong in the top half of the band as the bottom */
    k = knobs(64, 1, 0, 0, 0, 127, 64, 0, 1.0);
    render(&k, 4096 + N, x);
    double mean = 0, rms = 0;
    for (int i = 0; i < N; i++) {
        mean += x[4096 + i];
        rms += x[4096 + i] * x[4096 + i];
    }
    mean /= N;
    rms = sqrt(rms / N);
    spectrum(x + 4096, p);
    double lo = 0, hi = 0;
    for (int i = 1; i < N / 4; i++)
        lo += p[i];
    for (int i = N / 4; i < N / 2; i++)
        hi += p[i];
    CHECK(fabs(mean) < 0.01 && rms > 0.25 && fabs(10 * log10(hi / lo)) < 0.5,
          "noise: mean %.4f, rms %.3f, top half against bottom %.2f dB", mean, rms, 10 * log10(hi / lo));

    /* the LFO: its rate, its shape and its depth on pitch */
    double blocks_s = FS / MS_FRAMES;
    double r0 = ms_lfo_inc(0) * blocks_s / 4294967296.0, r1 = ms_lfo_inc(127) * blocks_s / 4294967296.0;
    double r64 = ms_lfo_inc(64) * blocks_s / 4294967296.0;
    CHECK(fabs(r0 - 0.1) < 0.001 && fabs(r1 - 30) < 0.1, "LFO 0: %.4f Hz, LFO 64: %.3f Hz, LFO 127: %.3f Hz", r0, r64, r1);
    int mono = 1;
    for (int kk = 1; kk < 128; kk++)
        if (ms_lfo_inc(kk) <= ms_lfo_inc(kk - 1))
            mono = 0;
    CHECK(mono, "LFO rate rises with every step of the knob");
    CHECK(ms_tri(0) == (int32_t)0x80000000 && abs(ms_tri(0x40000000u)) < 4 && ms_tri(0x7fffffffu) > 0x7ffffff0
          && abs(ms_tri(0xc0000000u)) < 4, "triangle: -1 at 0, 0 at a quarter, +1 at half, 0 at three quarters");
    for (int c = 0; c < 3; c++) {
        /* at 30 Hz a block-rate triangle is sampled 50 times a period, so its blocks miss up
         * to 4 % of its peaks: the samples between them ramp there */
        static const int mods[3] = { 20, 127, 127 }, rates[3] = { 64, 64, 127 };
        static const double tol[3] = { 0.03, 0.03, 0.05 };
        int mod = mods[c];
        struct ms_voice v;
        int32_t blk[MS_FRAMES];
        k = knobs(64, 0, 127, 0, 0, 0, rates[c], mod, 1.0);
        ms_init(&v, &k);
        double fmin = 1e9, fmax = 0;
        for (int b = 0; b < 3000; b++) {
            ms_render(&v, &k, blk);
            if (b > 100) {
                fmin = fmin < hz(v.inc) ? fmin : hz(v.inc);
                fmax = fmax > hz(v.inc) ? fmax : hz(v.inc);
            }
        }
        double want = 3.0 * (mod / 127.0) * (mod / 127.0) * 12;    /* semitones each way */
        double got = cents(fmax, fmin) / 200;
        CHECK(fabs(got - want) < tol[c] * want + 0.05, "MOD %d, LFO %d: +-%.2f semitones (want +-%.2f), centred on %.2f Hz",
              mod, rates[c], got, want, sqrt(fmin * fmax));
    }
    /* the LFO's period, in the pitch it makes: LFO 64 */
    {
        struct ms_voice v;
        int32_t blk[MS_FRAMES];
        k = knobs(64, 1, 127, 0, 0, 0, 64, 60, 1.0);
        ms_init(&v, &k);
        uint32_t prev = 0;
        int rises = 0, first = -1, last = -1, was_up = 0;
        for (int b = 0; b < 15000; b++) {
            ms_render(&v, &k, blk);
            int is_up = v.inc > prev;
            if (b > 100 && is_up && !was_up) {
                if (first < 0)
                    first = b;
                last = b;
                rises++;
            }
            was_up = is_up;
            prev = v.inc;
        }
        double rate = (rises - 1) / ((last - first) / blocks_s);
        CHECK(fabs(rate - r64) < 0.02 * r64, "MOD follows the LFO: %.3f Hz of pitch swing (LFO %.3f Hz)", rate, r64);
    }

    /* smoothing: a SAW lock from 0 to 127 and a TUN lock of an octave ramp in, no click */
    {
        struct ms_voice v;
        int32_t blk[MS_FRAMES];
        k = knobs(64, 0, 0, 0, 0, 0, 64, 0, 1.0 / 16);     /* an 8 Hz saw: its slope is tiny */
        ms_init(&v, &k);
        double jump = 0, prevs = 0;
        int wraps = 0;
        for (int b = 0; b < 200; b++) {
            if (b == 50)
                k.saw = 127;
            ms_render(&v, &k, blk);
            for (int j = 0; j < MS_FRAMES; j++) {
                double s = blk[j] / Q31, d = fabs(s - prevs);
                if (d > 0.3)
                    wraps++;
                else if (d > jump)
                    jump = d;
                prevs = s;
            }
        }
        CHECK(jump < 0.004 && wraps <= 2, "SAW 0 to 127 at once: largest step between samples %.5f of full scale", jump);

        k = knobs(64, 1, 127, 0, 0, 0, 64, 0, 1.0);
        ms_init(&v, &k);
        double worst_step = 0;
        uint32_t prev = v.inc;
        for (int b = 0; b < 200; b++) {
            if (b == 50)
                k.tun = 96;
            ms_render(&v, &k, blk);
            worst_step = fmax(worst_step, fabs(cents(hz(v.inc), hz(prev))));
            prev = v.inc;
        }
        CHECK(worst_step < 160 && fabs(cents(hz(v.inc), 523.2511)) < 0.5,
              "TUN 64 to 96 at once: at most %.0f cents a block, then %.2f Hz", worst_step, hz(v.inc));
    }

    /* every source at full: the sum saturates and never wraps */
    {
        k = knobs(64, 1, 127, 127, 63, 127, 64, 0, 1.0);
        render(&k, 48000, x);
        int flips = 0;
        double top = 0;
        for (int i = 1; i < 48000; i++) {
            top = fmax(top, fabs(x[i]));
            if (fabs(x[i] - x[i - 1]) > 1.9)
                flips++;
        }
        CHECK(flips == 0 && top <= 1.0, "all four at full: peak %.3f, no wrap-around", top);
    }

    /* the type out of range plays as 16' and nothing reads past the voice */
    k = knobs(64, 0, 127, 127, 127, 127, 127, 127, 7.5);
    render(&k, 48000, x);
    CHECK(1, "every knob at its top, note +35: renders");

    /* the AMP gate: quiet only once a fall to silence has surely ended */
    {
        struct ms_gate g;
        ms_gate_hit(&g);
        int on = 0;
        for (int i = 0; i < 4; i++)
            on += ms_gate_block(&g, 3, 0xb01a7b2du, 0x80u);
        CHECK(on == 4, "the first 4 blocks after a hit play whatever the amp says");
        on = 0;
        for (int i = 0; i < 20000; i++)
            on += ms_gate_block(&g, 0, 0xb0000123u, 0x4000007fu);
        CHECK(on == 20000, "an attack record keeps it playing");
        ms_gate_hit(&g);
        on = 0;
        for (int i = 0; i < 100000; i++)
            on += ms_gate_block(&g, 3, 0, 0);
        CHECK(on == 100000, "rate and level 0 with nothing falling (DEC INF) keep it playing");

        /* the decays a unit sent at rest: each lasts its estimate, then stops; the estimate
         * covers a one-pole fall from 127 to within half a level of -128 */
        static const uint32_t rates[] = { 0xb01a7b2du, 0xb0184147u, 0xb01acd76u, 0xb0100000u, 0xb018e5a9u,
                                          0xb01d15e6u, 0xb01f0001u, 0xb010ffffu };
        int ok = 1;
        for (unsigned r = 0; r < sizeof rates / sizeof *rates; r++) {
            uint32_t e = rates[r] >> 16 & 15, m = rates[r] & 0xffff;
            double step = (double)((0x7fffffffu - (m << 14)) >> e) - 32768.0;
            double d = 255.0;
            long ticks = 0;
            while (d > 0.5) {
                d *= 1.0 - step / 2147483648.0;
                ticks++;
            }
            long real = (ticks + 15) / 16;
            uint32_t want = ms_gate_blocks(rates[r]);
            ms_gate_hit(&g);
            for (int i = 0; i < 4; i++)
                ms_gate_block(&g, 0, 0xb0000123u, 0x4000007fu);
            uint32_t n = 0;
            while (ms_gate_block(&g, 3, rates[r], 0x80u) && n < 0x7fffffffu)
                n++;
            if (n != want || (long)want < real)
                ok = 0;
            printf("    decay %08x: %ld blocks to silence, plays %u (%.2f s)\n", rates[r], real, n, n * 32.0 / FS);
        }
        CHECK(ok, "each decay plays its estimate, never less than its fall to silence");

        /* a linear fall (bit 20 clear) */
        ms_gate_hit(&g);
        for (int i = 0; i < 4; i++)
            ms_gate_block(&g, 0, 0xb0000123u, 0x4000007fu);
        uint32_t n = 0;
        while (ms_gate_block(&g, 4, 0xb00a0000u, 0x80u) && n < 0x7fffffffu)
            n++;
        uint32_t e = 10, m = 0;
        double step = (double)((0x7fffffffu - (m << 14)) >> e) - 32768.0;
        double real = 256.0 * 8388608.0 / step / 16.0;
        CHECK(n >= real, "a linear fall: plays %u blocks, its fall takes %.0f", n, real);

        /* a fall interrupted: a new attack, then 0/0 while falling counts on */
        ms_gate_hit(&g);
        for (int i = 0; i < 4; i++)
            ms_gate_block(&g, 0, 0xb0000123u, 0x4000007fu);
        for (int i = 0; i < 10; i++)
            ms_gate_block(&g, 3, 0xb01a7b2du, 0x80u);
        on = ms_gate_block(&g, 0, 0xb0000123u, 0x4000007fu);
        for (int i = 0; i < 10; i++)
            ms_gate_block(&g, 3, 0xb01a7b2du, 0x80u);
        n = 0;
        while (ms_gate_block(&g, 3, 0, 0) && n < 0x7fffffffu)
            n++;
        CHECK(on && n == ms_gate_blocks(0xb01a7b2du) - 10, "a retrig restarts the count; 0/0 while falling counts on (%u)", n);
    }

    free(x);
    free(p);
    printf(failed ? "\nFAILED\n" : "\nall passed\n");
    return failed;
}
