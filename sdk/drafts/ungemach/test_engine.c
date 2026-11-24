/* SPDX-License-Identifier: MIT
 * Host checks for UNGEMACH's engine: no clipping, silence or DC at any corner of its controls, a drone that stays at its
 * level for minutes and moves, DIRT that changes it at its level and may move fast (an LFO on it in a trig mode is the
 * hit), a synced RATE that pulses. cc -O2 -std=c99 -Wall -Wextra -Werror test_engine.c engine.c -lm -o test_engine &&
 * ./test_engine */
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include "engine.h"

static int failures;
#define CHECK(c, ...) do { if (!(c)) { ++failures; printf("FAIL %s:%d ", __FILE__, __LINE__); printf(__VA_ARGS__); printf("\n"); } } while (0)

static UgControls base(void)
{
    UgControls c = { .ptch = 28 << 8, .diss = 40, .tone = 80, .wave = 24 << 8, .rate = 20, .move = 64, .sprd = 2, .dirt = 12,
                     .sync_phase = 0 };
    return c;
}
typedef struct { double rms, peak, dc; } Stats;
static Stats run(UgControls c, double secs, double measure, Ungemach *k, int fresh)
{
    if (fresh) ug_reset(k);
    unsigned total = (unsigned)(secs * 44100), from = total - (unsigned)(measure * 44100), cycle = 0;
    double sum = 0, dc = 0, peak = 0; unsigned count = 0;
    int16_t l[16], r[16];
    for (unsigned at = 0; at < total; at += 16) {
        if (c.rate >= 64) c.sync_phase = (uint16_t)(cycle += 16u * 65536u / 11025u);
        ug_render(k, &c, l, r, 16);
        if (at < from) continue;
        for (unsigned i = 0; i < 16; ++i) {
            double a = l[i] / 32768.0, b = r[i] / 32768.0;
            sum += a * a + b * b, dc += a + b, count += 2;
            if (fabs(a) > peak) peak = fabs(a);
            if (fabs(b) > peak) peak = fabs(b);
        }
    }
    Stats s = { sqrt(sum / count), peak, dc / count };
    return s;
}
static double db(double x) { return 20 * log10(x > 1e-9 ? x : 1e-9); }

int main(void)
{
    static Ungemach k;
    UgControls c = base();
    Stats d = run(c, 4, 2, &k, 1);
    printf("default drone: rms %.1f dB peak %.1f dB dc %.4f\n", db(d.rms), db(d.peak), d.dc);
    CHECK(db(d.rms) > -30 && db(d.rms) < -8, "default drone level %.1f dB", db(d.rms));
    CHECK(fabs(d.dc) < 0.02, "dc %.4f", d.dc);

    /* DIRT from 0 to 127: the level stays within a few dB, never clipping */
    for (unsigned dirt = 0; dirt <= 127; dirt += 127) {
        UgControls x = base(); x.dirt = (uint8_t)dirt;
        Stats s = run(x, 3, 2, &k, 1);
        printf("DIRT %3u: rms %.1f dB, peak %.1f dB\n", dirt, db(s.rms), db(s.peak));
        CHECK(db(s.rms) > -30 && db(s.rms) < -6 && s.peak < 1.0, "DIRT %u: rms %.1f dB peak %.2f", dirt, db(s.rms), s.peak);
    }
    /* DIRT swept 0 -> 127 -> 0 in 30 ms every 0.2 s, as a fast LFO in a trig mode would: no clipping, no runaway, and the
     * drone back at its level after it */
    {
        UgControls x = base(); x.dirt = 0;
        Stats before = run(x, 2, 1, &k, 1);
        int16_t l[16], r[16];
        double peak = 0;
        for (unsigned b = 0; b < 2756u * 2u; ++b) {
            unsigned t = b % 551u;
            x.dirt = (uint8_t)(t < 42u ? t * 127u / 42u : t < 84u ? (84u - t) * 127u / 42u : 0u);
            ug_render(&k, &x, l, r, 16);
            for (unsigned i = 0; i < 16; ++i) if (fabs(l[i] / 32768.0) > peak) peak = fabs(l[i] / 32768.0);
        }
        x.dirt = 0;
        Stats after = run(x, 1, 0.5, &k, 0);
        printf("DIRT swept 0-127-0 every 0.2 s: peak %.1f dB, drone %.1f dB before, %.1f dB after\n", db(peak), db(before.rms),
               db(after.rms));
        CHECK(peak < 1.0 && fabs(db(after.rms) - db(before.rms)) < 3, "DIRT sweep: peak %.2f, %.1f against %.1f dB", peak,
              db(after.rms), db(before.rms));
    }
    /* WAVE: every waveform at about the same level */
    for (unsigned w = 0; w <= 127; w += 4) {
        UgControls x = base(); x.wave = (uint16_t)(w << 8), x.dirt = 0;
        Stats s = run(x, 1.5, 1, &k, 1);
        printf("WAVE %3u: rms %.1f dB\n", w, db(s.rms));
        CHECK(db(s.rms) > -32 && db(s.rms) < -10, "WAVE %u level %.1f dB", w, db(s.rms));
    }
    /* a DISS step glides (34 to 35, on a leg, about 200 cents): after one block the ratio has gone a little of the
     * way, after 0.5 s nearly all of it */
    {
        UgControls x = base(); x.diss = 34;
        ug_reset(&k); run(x, 0.2, 0.1, &k, 0);
        int32_t from = k.r2q;
        x.diss = 35;
        int16_t l[16], r[16];
        ug_render(&k, &x, l, r, 16);
        int32_t one = k.r2q;
        run(x, 0.5, 0.1, &k, 0);
        int32_t mid = k.r2q;
        run(x, 2.0, 0.1, &k, 0);
        int32_t to = k.r2q;                                    /* where it settles */
        double first = (double)(one - from) / (to - from), later = (double)(mid - from) / (to - from);
        printf("DISS step: %.3f of the way after a block, %.3f after 0.5 s\n", first, later);
        CHECK(first > 0 && first < 0.05 && later > 0.95, "DISS does not glide: %.3f, %.3f", first, later);
    }
    /* the voices (ten interpolated, six read at the nearest sample): clean at the corners */
    {
        unsigned bado = 0;
        static const uint8_t v3[] = { 0, 64, 127 };
        for (unsigned p = 0; p < 3; ++p) for (unsigned w = 0; w < 3; ++w) for (unsigned di = 0; di < 3; ++di) {
            UgControls y = base(); y.ptch = (uint16_t)((p == 0 ? 4 : p == 1 ? 28 : 124) << 8), y.wave = (uint16_t)(v3[w] << 8), y.diss = v3[di], y.tone = 127, y.dirt = 127;
            Stats st = run(y, 0.5, 0.3, &k, 1);
            if (st.rms < 1e-4 || st.peak >= 1.0 || fabs(st.dc) > 0.05) ++bado;
        }
        printf("voices: %u bad corners\n", bado);
        CHECK(bado == 0, "voices: %u bad corners", bado);
    }
    /* a frame split by a trig's offset (3 + 13, the frame's figures once) sounds as one call of 16 */
    {
        static Ungemach split;
        UgControls x = base();
        ug_reset(&k), ug_reset(&split);
        int16_t l[16], r[16], l2[16], r2[16];
        double diff = 0, sig = 0;
        for (unsigned b = 0; b < 2756; ++b) {
            ug_render(&k, &x, l, r, 16);
            ug_render_part(&split, &x, l2, r2, 3, 1);
            ug_render_part(&split, &x, l2 + 3, r2 + 3, 13, 0);
            for (unsigned i = 0; i < 16; ++i) { double e = l[i] - l2[i]; diff += e * e, sig += (double)l[i] * l[i]; }
        }
        printf("a split frame: differs by %.1f dB under the signal\n", 10 * log10(sig / (diff + 1e-9)));
        CHECK(diff < sig * 1e-4, "a split frame sounds otherwise: %.1f dB under the signal", 10 * log10(sig / (diff + 1e-9)));
    }
    /* every DISS value, at a high and a low root: no silence, clipping or DC */
    {
        unsigned bad_d = 0;
        for (unsigned dv = 0; dv < 128; ++dv) for (unsigned p = 0; p < 2; ++p) {
            UgControls x = base(); x.diss = (uint8_t)dv, x.ptch = (uint16_t)((p ? 100 : 10) << 8), x.tone = 127, x.dirt = 127;
            Stats s = run(x, 0.4, 0.2, &k, 1);
            if (s.rms < 1e-4 || s.peak >= 1.0 || fabs(s.dc) > 0.05) {
                if (++bad_d <= 4) printf("  DISS %u ptch %u: rms %.1f peak %.2f dc %.3f\n", dv, p ? 100 : 10, db(s.rms), s.peak, s.dc);
            }
        }
        CHECK(bad_d == 0, "%u DISS values silent, clipping or off centre", bad_d);
    }
    /* SPRD MONO: both sides alike */
    {
        UgControls x = base(); x.sprd = 0;
        ug_reset(&k); run(x, 0.5, 0.5, &k, 0);
        int16_t l[16], r[16]; int same = 1;
        for (unsigned b = 0; b < 100; ++b) { ug_render(&k, &x, l, r, 16); for (unsigned i = 0; i < 16; ++i) if (l[i] != r[i]) same = 0; }
        CHECK(same, "SPRD MONO leaves the sides apart");
    }
    static const uint8_t v7[] = { 0, 64, 127 };
    static const uint16_t pt[] = { 4 << 8, 28 << 8, 124 << 8 };
    unsigned corners = 0, bad = 0;
    for (unsigned p = 0; p < 3; ++p) for (unsigned di = 0; di < 3; ++di) for (unsigned t = 0; t < 3; ++t)
    for (unsigned m = 0; m < 3; ++m) for (unsigned ra = 0; ra < 3; ++ra) {
        UgControls x = base();
        x.ptch = pt[p], x.diss = v7[di], x.tone = v7[t], x.dirt = v7[m], x.wave = (uint16_t)(v7[(m + di) % 3] << 8), x.rate = v7[ra], x.sprd = (uint8_t)(ra + 1);
        Stats s = run(x, 1.0, 0.75, &k, 1);
        ++corners;
        if (s.rms < 1e-4 || s.peak >= 1.0 || fabs(s.dc) > 0.05) {
            if (++bad <= 8) printf("  corner ptch %u diss %u tone %u dirt %u rate %u: rms %.1f peak %.2f dc %.3f\n",
                                   pt[p] >> 8, v7[di], v7[t], v7[m], v7[ra], db(s.rms), s.peak, s.dc);
        }
    }
    CHECK(bad == 0, "%u of %u corners silent, clipping or off centre", bad, corners);

    /* PNCH: a trig's punch stands out of the drone for its first milliseconds, never clips, and is gone by 0.3 s (55 ms at its top);
     * at PNCH 0 a trig changes nothing */
    for (unsigned pn = 0; pn <= 127; pn += 127) {
        static Ungemach twin;
        UgControls x = base(); x.pnch = (uint8_t)pn;
        run(x, 2, 1, &k, 1);
        twin = k;
        ug_punch(&k);
        int16_t l[16], r[16], l2[16], r2[16];
        double first = 0, ref = 0, late = 0, lref = 0, peak = 0;
        for (unsigned b = 0; b < 276; ++b) {                   /* 0.1 s */
            ug_render(&k, &x, l, r, 16), ug_render(&twin, &x, l2, r2, 16);
            for (unsigned i = 0; i < 16; ++i) {
                double a = l[i] / 32768.0, o = l2[i] / 32768.0;
                if (b < 28) first += a * a, ref += o * o;       /* the first 10 ms */
                if (fabs(a) > peak) peak = fabs(a);
            }
        }
        for (unsigned b = 0; b < 552; ++b) ug_render(&k, &x, l, r, 16), ug_render(&twin, &x, l2, r2, 16);   /* to 0.3 s */
        for (unsigned b = 0; b < 276; ++b) {                   /* 0.3-0.4 s */
            ug_render(&k, &x, l, r, 16), ug_render(&twin, &x, l2, r2, 16);
            for (unsigned i = 0; i < 16; ++i) late += (double)l[i] * l[i], lref += (double)l2[i] * l2[i];
        }
        double lift = 10 * log10(first / ref), after = 10 * log10(late / lref);
        printf("PNCH %3u: first 10 ms %+.1f dB against no trig, 0.3-0.4 s later %+.2f dB, peak %.1f dB\n", pn, lift, after, db(peak));
        if (pn) CHECK(lift > 8 && fabs(after) < 1 && peak < 1.0, "PNCH 127: %+.1f dB, then %+.2f dB, peak %.2f", lift, after, peak);
        else CHECK(fabs(lift) < 0.2 && fabs(after) < 0.2, "PNCH 0 still punches: %+.1f dB", lift);
    }

    c = base();
    ug_reset(&k);
    double lo = 1e9, hi = 0;
    for (unsigned seg = 0; seg < 30; ++seg) {
        Stats s = run(c, 6, 6, &k, 0);
        if (seg) { if (s.rms < lo) lo = s.rms; if (s.rms > hi) hi = s.rms; }
    }
    printf("three minutes, 6 s windows: %.1f .. %.1f dB\n", db(lo), db(hi));
    CHECK(db(hi) - db(lo) < 6 && db(hi) - db(lo) > 0.05, "level over minutes %.1f .. %.1f dB", db(lo), db(hi));
    {
        UgControls x = base(); x.rate = 100;
        ug_reset(&k);
        run(x, 1.0, 0.1, &k, 0);
        double w[8] = { 0 };
        int16_t l[16], r[16];
        unsigned cycle = 0;
        for (unsigned at = 0; at < 44100; at += 16) {
            x.sync_phase = (uint16_t)(cycle += 16u * 65536u / 11025u);
            ug_render(&k, &x, l, r, 16);
            for (unsigned i = 0; i < 16; ++i) w[(x.sync_phase >> 13) & 7] += (double)l[i] * l[i];
        }
        printf("synced: first eighth %.1f dB against the last %.1f dB\n", db(sqrt(w[0])), db(sqrt(w[7])));
        CHECK(db(sqrt(w[0])) > db(sqrt(w[7])) + 3, "synced RATE does not pulse");
    }
    printf(failures ? "%d FAILED\n" : "all passed\n", failures);
    return failures != 0;
}
