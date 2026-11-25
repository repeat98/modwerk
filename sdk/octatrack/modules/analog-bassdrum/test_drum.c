/* SPDX-License-Identifier: MIT
 * Analog BD's engine on the host (test_drum.py builds it with sanitizers): levels, resting, FIXD, retriggers, every
 * control at its ends on both models, and the 909's sweep up to TDEP 127. Exit status 0 when every check holds. */
#include <stdio.h>
#include <stdlib.h>
#include "drum.h"

#define FRAME 16u
static int failed;
static void check(int ok, const char *what) { if (!ok) printf("FAIL %s\n", what), failed = 1; }

/* n samples of the left channel, as fractions of full scale; a trig at each multiple of `every` (0: only the first) */
static void render(const uint8_t *k, float *out, unsigned n, unsigned every)
{
    AbVoice v;
    uint32_t lr[2 * FRAME];
    ab_reset(&v);
    for (unsigned s = 0; s < n; s += FRAME) {
        int trig = s == 0 || (every && s % every == 0);
        ab_render(&v, k, trig, lr, FRAME);
        for (unsigned i = 0; i < FRAME && s + i < n; ++i) {
            if (lr[2 * i] != lr[2 * i + 1]) check(0, "left and right differ");
            out[s + i] = (float)(int32_t)lr[2 * i] / 2147483648.0f;
        }
    }
}
static float peak(const float *x, unsigned a, unsigned b)
{
    float p = 0;
    for (unsigned i = a; i < b; ++i) p = x[i] > p ? x[i] : -x[i] > p ? -x[i] : p;
    return p;
}
static unsigned crossings(const float *x, unsigned a, unsigned b)
{
    unsigned c = 0;
    for (unsigned i = a + 1; i < b; ++i) c += x[i - 1] < 0 && x[i] >= 0;
    return c;
}

int main(void)
{
    enum { N = 44100 * 4 };
    float *a = malloc(N * sizeof *a), *b = malloc(N * sizeof *b);
    uint8_t k[AB_PARAMS];
    for (unsigned i = 0; i < AB_PARAMS; ++i) k[i] = ab_defaults[i];

    /* the 909 at the recorded settings: a kick at a sane level that dies away and rests */
    k[AB_TYPE] = 1, k[AB_TUNE] = 0, k[AB_ACNT] = 72, k[AB_FIXD] = 1;
    render(k, a, N, 0);
    check(peak(a, 0, 4410) > 0.3f && peak(a, 0, 4410) < 0.9f, "909 peak at the recorded settings");
    check(peak(a, 0, 90) < 0.08f, "909 lead-in stays small before the body opens");
    check(peak(a, N - 22050, N) == 0.0f, "909 rests after its hit (DCAY 80: under -96 dB by 2.8 s)");
    /* FIXD ON: two renders are the same; OFF: hits differ a little */
    render(k, b, N, 0);
    unsigned same = 1;
    for (unsigned i = 0; i < N; ++i) same &= a[i] == b[i];
    check(same, "909 FIXD ON renders identically");
    k[AB_FIXD] = 0;
    render(k, a, 21008 * 3, 21008);
    float d = 0;
    for (unsigned i = 0; i < 2000; ++i) { float e = a[i] - a[21008 + i]; d += e * e; }
    check(d > 0, "909 FIXD OFF varies the next hit");
    /* retriggers every four steps at 126 BPM: no click at the trig or where the new body opens */
    float step = 0;
    for (unsigned h = 1; h < 3; ++h)
        for (unsigned i = h * 21008; i < h * 21008 + 112; ++i) {
            float s = a[i] - a[i - 1];
            step = s > step ? s : -s > step ? -s : step;
        }
    check(step < 0.02f, "909 retriggers without a jump");
    /* the sweep keeps deepening up to TDEP 127 (an overflow once froze it past 115) */
    k[AB_FIXD] = 1;
    unsigned last = 0;
    for (unsigned t = 100; t <= 127; t += 9) {
        k[AB_TDEP] = (uint8_t)t;
        render(k, a, 2000, 0);
        unsigned c = crossings(a, 96, 1400);
        check(c >= last, "909 sweep deepens with TDEP");
        last = c;
    }
    /* the 808 at defaults */
    for (unsigned i = 0; i < AB_PARAMS; ++i) k[i] = ab_defaults[i];
    k[AB_FIXD] = 1;
    render(k, a, N, 0);
    check(peak(a, 0, 4410) > 0.2f && peak(a, 0, 4410) <= 1.0f, "808 peak at defaults");
    check(peak(a, N - 22050, N) == 0.0f, "808 rests after its hit");
    /* every control at both ends, both models: renders, stays finite and in range (the sanitizers watch the rest) */
    for (unsigned model = 0; model < 2; ++model)
        for (unsigned c = 0; c < AB_PARAMS; ++c)
            for (unsigned end = 0; end < 2; ++end) {
                for (unsigned i = 0; i < AB_PARAMS; ++i) k[i] = ab_defaults[i];
                k[AB_TYPE] = (uint8_t)model;
                if (c != AB_TYPE) k[c] = c == AB_FIXD ? (uint8_t)end : end ? 127 : 0;
                render(k, a, 22050, 5000);
                check(peak(a, 0, 22050) <= 1.0f, "a control at its end stays in range");
            }
    free(a), free(b);
    if (!failed) printf("ok\n");
    return failed;
}
