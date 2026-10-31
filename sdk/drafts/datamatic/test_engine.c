/* SPDX-License-Identifier: GPL-3.0-or-later
 * Firmware-free tests of the DATAMATIC engine (test_engine.py builds and runs them under the sanitizers). */
#include "engine.h"
#include <assert.h>
#include <stdio.h>
#include <string.h>

static unsigned popcount_table(unsigned t) { unsigned n = 0; for (unsigned k = 0; k < DM_TABLE_BITS / 8u; ++k) for (unsigned b = 0; b < 8; ++b) n += dm_tables[t][k] >> b & 1u; return n; }

/* The tables hold what they claim: pi's first bits, the Fibonacci word's rule, the primes, Thue-Morse; the constants
 * look like coin flips. */
static void tables(void)
{
    DmStream s; DmParams p = dm_defaults;
    p.source = DM_PI; assert(dm_stream(&s, &p));
    static const uint8_t pi16[2] = {0x24, 0x3f}; /* 0.0010 0100 0011 1111 */
    for (unsigned k = 0; k < 16; ++k) assert(dm_bit(&s, k) == ((pi16[k / 8] >> (7 - k % 8)) & 1u));
    for (unsigned t = 0; t < 4; ++t) { unsigned n = popcount_table(t); assert(n > 900 && n < 1150); }
    p.source = DM_PRIME; assert(dm_stream(&s, &p));
    for (unsigned n = 0; n < 200; ++n) {
        unsigned prime = n >= 2;
        for (unsigned d = 2; d * d <= n && prime; ++d) prime = n % d != 0;
        assert(dm_bit(&s, n) == prime);
    }
    p.source = DM_THUE; assert(dm_stream(&s, &p));
    for (unsigned n = 0; n < 2048; ++n) assert(dm_bit(&s, n) == (unsigned)(__builtin_popcount(n) & 1));
    p.source = DM_FIBO; assert(dm_stream(&s, &p));
    static const char *const fib = "0100101001001010010100100101001001";
    for (unsigned k = 0; fib[k]; ++k) assert(dm_bit(&s, k) == (unsigned)(fib[k] - '0'));
    for (unsigned k = 0; k + 1 < 2048; ++k) assert(!(dm_bit(&s, k) && dm_bit(&s, k + 1))); /* never two ones */
}

/* The automaton follows its rule from one cell, and the LFSR runs its full period. */
static void automaton_and_lfsr(void)
{
    DmStream s; DmParams p = dm_defaults;
    p.source = DM_CA;
    for (unsigned r = 0; r < DM_RULES; ++r) {
        p.rule = (uint8_t)r; p.seed = 0;
        assert(dm_stream(&s, &p));
        unsigned row0 = 0; for (unsigned c = 0; c < 32; ++c) row0 += dm_bit(&s, c);
        assert(row0 == 1 && dm_bit(&s, 15)); /* bit 16 of the ring is column 15, MSB first */
        for (unsigned row = 1; row < 64; ++row)
            for (unsigned c = 0; c < 32; ++c) {
                unsigned l = dm_bit(&s, 32 * (row - 1) + (c + 31) % 32), m = dm_bit(&s, 32 * (row - 1) + c), rt = dm_bit(&s, 32 * (row - 1) + (c + 1) % 32);
                assert(dm_bit(&s, 32 * row + c) == ((dm_rules[r] >> (l << 2 | m << 1 | rt)) & 1u));
            }
    }
    p.source = DM_LFSR;
    for (unsigned seed = 0; seed < 128; ++seed) {
        p.seed = (uint8_t)seed; assert(dm_stream(&s, &p));
        unsigned ones = 0; for (unsigned k = 0; k < 2048; ++k) ones += dm_bit(&s, k);
        assert(ones > 850 && ones < 1200);
    }
}

/* DENS 0 with BITS 1 and STEP 1 plays the stream itself; DENS 127 plays every step; lines are deterministic, notes
 * stay in the interval set within SPRD octaves, velocities in 1..VEL, micro-timing within JITR. */
static void lines(void)
{
    DmStream s; DmLine a, b;
    unsigned count = 0, notes = 0;
    for (unsigned src = 0; src < DM_SOURCES; ++src) {
        DmParams p = dm_defaults; p.source = (uint8_t)src; p.offset = 3;
        assert(dm_stream(&s, &p) && dm_generate(&a, &p, 64, 48, 100));
        for (unsigned i = 0; i < 64; ++i) assert(a.steps[i].trig == dm_bit(&s, 24 + i));
        p.dens = 127; assert(dm_generate(&a, &p, 64, 48, 100));
        for (unsigned i = 0; i < 64; ++i) assert(a.steps[i].trig);
    }
    for (unsigned n = 0; n < 20000; ++n) {
        uint32_t x = 0x9e3779b9u * (n + 1u); x ^= x >> 15; x *= 0x2c1b3c6du; x ^= x >> 12;
        DmParams p;
        p.source = (uint8_t)(n % DM_SOURCES); p.offset = (uint8_t)(x & 127); p.bits = (uint8_t)(1 + (x >> 7) % 8);
        p.dens = (uint8_t)(x >> 10 & 127); p.spread = (uint8_t)((x >> 17) % 5); p.intv = (uint8_t)((x >> 20) % DM_INTERVALS);
        p.vdat = (uint8_t)(x >> 3 & 127); p.jitter = (uint8_t)((x >> 23) % 24); p.rule = (uint8_t)(x >> 5 & 15);
        p.seed = (uint8_t)(x >> 24 & 127); p.stride = (uint8_t)(1 + (x >> 28) % 8);
        unsigned length = 1 + n % 64, base = 24 + n % 80, vel = 1 + n % 127;
        assert(dm_generate(&a, &p, length, base, vel) && dm_generate(&b, &p, length, base, vel) && !memcmp(&a, &b, sizeof a));
        for (unsigned i = 0; i < 64; ++i) {
            const DmStep *st = &a.steps[i];
            if (i >= length || !st->trig) { assert(!st->trig && !st->note && !st->vel && !st->micro); continue; }
            ++count;
            assert(st->note <= 127 && st->vel >= 1 && st->vel <= vel && st->micro <= p.jitter);
            if (!p.vdat) assert(st->vel == vel);
            int up = (int)st->note - (int)base;
            if (base + 12u * p.spread <= 127) { assert(up >= 0 && up <= 12 * (int)p.spread); notes += up != 0; }
            if (!p.spread) assert(st->note == base);
            if (p.intv == DM_OCT) assert(((st->note + 120 - base) % 12) == 0);
        }
    }
    DmParams bad = dm_defaults; bad.bits = 0; assert(!dm_generate(&a, &bad, 16, 48, 100));
    bad = dm_defaults; bad.stride = 9; assert(!dm_generate(&a, &bad, 16, 48, 100));
    assert(count && notes);
    printf("lines: %u notes over 20000 settings, %u off the base note\n", count, notes);
}

static unsigned on(const uint8_t *r, unsigned mask, unsigned step) { return (r[mask * 8 + 7 - step / 8] >> (step % 8)) & 1u; }
static void writes_the_record(void)
{
    static uint8_t r[DM_TRACK_BYTES], mirror[DM_TRACK_BYTES], before[DM_TRACK_BYTES];
    uint8_t locked[64];
    DmParams p = dm_defaults; DmLine a;
    p.jitter = 23; p.spread = 2; p.dens = 40;
    memset(r, 0, sizeof r);
    memset(r + DM_LOCKS, DM_NO_LOCK, 64 * 32);
    assert(dm_track_empty(r));
    r[0x28] = 32;
    r[DM_LOCKS + 32 * 5 + 2] = 30;   /* a user's LEN lock: kept */
    r[DM_LOCKS + 32 * 40 + 0] = 70;  /* a NOTE lock past the length: kept */
    for (unsigned k = 24; k < 32; ++k) r[k] = 0xaa; /* swing */
    assert(dm_generate(&a, &p, 32, 48, 100));
    unsigned trigs = dm_write(r, mirror, &a, locked), count = 0;
    for (unsigned i = 0; i < 64; ++i) {
        const DmStep *s = &a.steps[i]; const uint8_t *l = r + DM_LOCKS + 32 * i;
        unsigned word = (unsigned)r[DM_TIMING + 2 * i] << 8 | r[DM_TIMING + 2 * i + 1];
        if (i >= 32) { assert(!on(r, 0, i)); continue; }
        count += s->trig;
        assert(on(r, 0, i) == s->trig);
        assert(l[0] == (s->trig ? s->note : 255) && l[1] == (s->trig ? s->vel : 255));
        assert(l[2] == (i == 5 ? 30 : 255));
        assert(word == (s->trig ? (unsigned)s->micro << 7 : 0u));
        assert(on(r, 2, i) == (!s->trig && i == 5));
        assert(locked[i] == (s->trig || i == 5));
    }
    assert(trigs == count && trigs && r[DM_LOCKS + 32 * 40] == 70 && locked[40]);
    for (unsigned k = 24; k < 32; ++k) assert(r[k] == 0xaa);
    memcpy(before, r, sizeof r);
    dm_write(r, NULL, &a, locked);
    assert(!memcmp(r, before, sizeof r));
}
int main(void)
{
    tables();
    automaton_and_lfsr();
    lines();
    writes_the_record();
    puts("[PASS] datamatic engine");
    return 0;
}
