/* SPDX-License-Identifier: MIT */
/* Host tests for the digidice engine. Build and run:
 *   cc -std=c99 -Wall -Wextra -Werror -fsanitize=address,undefined \
 *      engine.c test_engine.c -o test_engine && ./test_engine */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "../src/engine.h"

static int failures, checks;

#define CHECK(cond, ...) do { checks++; if (!(cond)) { failures++; \
    printf("FAIL %s:%d: ", __FILE__, __LINE__); printf(__VA_ARGS__); printf("\n"); } } while (0)

static const dd_settings defaults = { 80, 0, 0, 64, 0, 1, 7, 0 };

static int in_scale(int scale, int semis)
{
    /* Rebuild membership from the generator's own output range: intervals mod 12. */
    static const int masks[DD_SCALES] = {
        0xFFF,                                      /* chromatic */
        (1<<0)|(1<<2)|(1<<4)|(1<<5)|(1<<7)|(1<<9)|(1<<11),
        (1<<0)|(1<<2)|(1<<3)|(1<<5)|(1<<7)|(1<<8)|(1<<10),
        (1<<0)|(1<<2)|(1<<3)|(1<<5)|(1<<7)|(1<<9)|(1<<10),
        (1<<0)|(1<<2)|(1<<4)|(1<<5)|(1<<7)|(1<<9)|(1<<10),
        (1<<0)|(1<<2)|(1<<3)|(1<<5)|(1<<7)|(1<<8)|(1<<11),
        (1<<0)|(1<<2)|(1<<4)|(1<<7)|(1<<9),
        (1<<0)|(1<<3)|(1<<5)|(1<<7)|(1<<10),
    };
    return (masks[scale] >> (semis % 12)) & 1;
}

static int scale_size(int scale)
{
    return scale == 0 ? 12 : scale >= 6 ? 5 : 7;
}

static void test_determinism(void)
{
    dd_step a[DD_STEPS], b[DD_STEPS];
    dd_generate(&defaults, 1, 2, 64, 100, a);
    dd_generate(&defaults, 1, 2, 64, 100, b);
    CHECK(memcmp(a, b, sizeof a) == 0, "same seeds and settings differ");
    dd_generate(&defaults, 3, 2, 64, 100, b);
    CHECK(memcmp(a, b, sizeof a) != 0, "a new rhythm seed changed nothing");
}

static void test_ranges(void)
{
    dd_settings s;
    dd_step out[DD_STEPS];
    uint32_t seed = 7;
    int n, t, len, cases = 0;

    for (n = 0; n < 20000; n++) {
        seed = dd_next_seed(seed);
        s.density = seed & 127;
        s.spacing = (seed >> 7) % DD_SPACINGS;
        s.variation = (seed >> 10) & 127;
        s.legato = (seed >> 17) & 127;
        s.root = (seed >> 24) % 12;
        s.scale = (seed >> 4) % DD_SCALES;
        s.range = (seed >> 12) % (DD_RANGE_MAX + 1);
        s.vel_spread = (seed >> 20) & 127;
        len = 1 + (int)((seed >> 26) % 64);
        dd_generate(&s, seed, ~seed, len, (uint8_t)(1 + (seed % 127)), out);
        for (t = 0; t < DD_STEPS; t++) {
            int interval = out[t].note - s.root;
            int octaves = interval / 12, degree;
            CHECK(interval >= 0, "note below the root");
            CHECK(in_scale(s.scale, interval), "note %d outside scale %d", out[t].note, s.scale);
            degree = octaves * scale_size(s.scale);
            CHECK(degree <= s.range, "note beyond RANGE");
            if (!out[t].on)
                continue;
            CHECK(t < len, "trig at step %d past length %d", t, len);
            CHECK(out[t].vel >= 1 && out[t].vel <= 127, "velocity %d", out[t].vel);
            CHECK(out[t].len >= 1 && out[t].len <= 16 * DD_LEN_UNIT, "length %d", out[t].len);
            CHECK(t * DD_LEN_UNIT + out[t].len <= len * DD_LEN_UNIT || out[t].len == 1,
                  "note at %d overruns the pattern", t);
        }
        cases++;
    }
    CHECK(cases == 20000, "ran %d cases", cases);
}

static void test_density_edges(void)
{
    dd_settings s = defaults;
    dd_step out[DD_STEPS];
    int t;

    s.density = 0;
    CHECK(dd_generate(&s, 5, 6, 64, 100, out) == 0, "DENSITY 0 is not silent");
    s.density = 127;
    s.variation = 0;
    for (s.spacing = 0; s.spacing < DD_SPACINGS; s.spacing++) {
        int gap = dd_spacing_steps(s.spacing);
        dd_generate(&s, 5, 6, 64, 100, out);
        for (t = 0; t < 64; t++)
            CHECK(out[t].on == (t % gap == 0), "spacing %d, step %d", gap, t);
    }
}

/* VARIATION 127 replaces every gap by its half or its double, and both occur. */
static void test_variation(void)
{
    dd_settings s = defaults;
    dd_step out[DD_STEPS];
    uint32_t seed;
    int t, last, halves = 0, doubles = 0;

    s.density = 127;
    s.spacing = 1;      /* every 2 steps */
    s.variation = 127;
    for (seed = 1; seed < 100; seed++) {
        dd_generate(&s, seed, 1, 64, 100, out);
        for (t = 1, last = 0; t < 64; t++) {
            if (!out[t].on)
                continue;
            CHECK(t - last == 1 || t - last == 4, "gap %d with VARIATION 127", t - last);
            halves += t - last == 1;
            doubles += t - last == 4;
            last = t;
        }
    }
    CHECK(halves > 0 && doubles > 0, "halves %d, doubles %d", halves, doubles);
}

/* Raising DENSITY only adds notes: earlier notes keep their place, note,
 * velocity and length. */
static void test_density_monotonic(void)
{
    dd_settings s = defaults;
    dd_step lo[DD_STEPS], hi[DD_STEPS];
    uint32_t seed;
    int d, t;

    for (seed = 1; seed < 200; seed++) {
        s.variation = (uint8_t)(seed % 128);
        for (d = 0; d < 127; d++) {
            s.density = (uint8_t)d;
            dd_generate(&s, seed, seed * 3, 64, 90, lo);
            s.density = (uint8_t)(d + 1);
            dd_generate(&s, seed, seed * 3, 64, 90, hi);
            for (t = 0; t < 64; t++)
                if (lo[t].on)
                    CHECK(hi[t].on && hi[t].note == lo[t].note && hi[t].vel == lo[t].vel
                          && hi[t].len == lo[t].len, "seed %u density %d step %d", seed, d, t);
        }
    }
}

/* Rolling the notes keeps the rhythm; rolling the rhythm keeps each step's note. */
static void test_partial_rolls(void)
{
    dd_step a[DD_STEPS], b[DD_STEPS];
    uint32_t r = 11, n = 12;
    int t, k, moved = 0, renoted = 0;

    for (k = 0; k < 100; k++) {
        dd_generate(&defaults, r, n, 64, 100, a);
        dd_generate(&defaults, r, dd_next_seed(n), 64, 100, b);
        for (t = 0; t < 64; t++) {
            CHECK(a[t].on == b[t].on && a[t].vel == b[t].vel && a[t].len == b[t].len,
                  "a note roll changed the rhythm at %d", t);
            renoted += a[t].on && a[t].note != b[t].note;
        }
        dd_generate(&defaults, dd_next_seed(r), n, 64, 100, b);
        for (t = 0; t < 64; t++) {
            CHECK(a[t].note == b[t].note, "a rhythm roll changed the note at %d", t);
            moved += a[t].on != b[t].on;
        }
        r = dd_next_seed(r);
        n = dd_next_seed(n);
    }
    CHECK(renoted > 0, "note rolls never changed a note");
    CHECK(moved > 0, "rhythm rolls never moved a trig");
}

static void test_legato_and_velocity(void)
{
    dd_settings s = defaults;
    dd_step out[DD_STEPS];
    int t;

    s.density = 127;
    s.spacing = 3;      /* every 4 steps */
    s.legato = 127;
    dd_generate(&s, 1, 1, 64, 100, out);
    for (t = 0; t < 64; t += 4)
        CHECK(out[t].len == 4 * DD_LEN_UNIT, "LEGATO 127 does not tie: %d", out[t].len);
    s.legato = 0;
    dd_generate(&s, 1, 1, 64, 100, out);
    for (t = 0; t < 64; t += 4)
        CHECK(out[t].len == 1, "LEGATO 0 is not the shortest: %d", out[t].len);
    s.vel_spread = 0;
    dd_generate(&s, 1, 1, 64, 100, out);
    for (t = 0; t < 64; t += 4)
        CHECK(out[t].vel == 100, "VEL 0 moved the velocity: %d", out[t].vel);
}

static void test_clamp_and_seeds(void)
{
    dd_settings s = { 255, 200, 255, 255, 40, 99, 99, 255 };
    dd_step out[DD_STEPS];
    uint32_t seed = 0;
    int k;

    dd_clamp(&s);
    CHECK(s.density == 127 && s.spacing == DD_SPACINGS - 1 && s.root == 11
          && s.scale == DD_SCALES - 1 && s.range == DD_RANGE_MAX, "clamp");
    s = (dd_settings){ 255, 200, 255, 255, 40, 99, 99, 255 };
    CHECK(dd_generate(&s, 1, 2, 999, 100, out) >= 0, "out-of-range input");
    CHECK(dd_generate(&s, 1, 2, -5, 100, out) <= 1, "length below 1");
    for (k = 0; k < 100000; k++) {
        uint32_t next = dd_next_seed(seed);
        CHECK(next != seed, "seed did not advance");
        seed = next;
    }
}

int main(void)
{
    test_determinism();
    test_ranges();
    test_density_edges();
    test_variation();
    test_density_monotonic();
    test_partial_rolls();
    test_legato_and_velocity();
    test_clamp_and_seeds();
    printf("%d checks, %d failures\n", checks, failures);
    return failures != 0;
}
