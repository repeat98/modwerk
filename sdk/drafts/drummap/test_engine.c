/* SPDX-License-Identifier: GPL-3.0-or-later
 * Firmware-free tests of the DRUMMAP engine (test_engine.py builds and runs them under the sanitizers). */
#include "engine.h"
#include "grids.h"
#include <assert.h>
#include <stdio.h>
#include <string.h>

/* DrumMap's ReadDrumMap as the applet writes it, with uint8_t arithmetic. */
static uint8_t reference_level(uint8_t step, uint8_t part, uint8_t x, uint8_t y)
{
    uint8_t i = x >> 6, j = y >> 6;
    const uint8_t *a_map = grids_drum_map[i][j], *b_map = grids_drum_map[i + 1][j];
    const uint8_t *c_map = grids_drum_map[i][j + 1], *d_map = grids_drum_map[i + 1][j + 1];
    uint8_t offset = (uint8_t)((part * 32) + step);
    uint8_t a = a_map[offset], b = b_map[offset], c = c_map[offset], d = d_map[offset];
    uint8_t quad_x = (uint8_t)(x << 2), quad_y = (uint8_t)(y << 2);
    uint8_t ab_fade = (uint8_t)((b * quad_x + a * (255 - quad_x)) >> 8);
    uint8_t cd_fade = (uint8_t)((d * quad_x + c * (255 - quad_x)) >> 8);
    return (uint8_t)((cd_fade * quad_y + ab_fade * (255 - quad_y)) >> 8);
}
static void level_matches_the_applet(void)
{
    unsigned cases = 0;
    for (unsigned x = 0; x < 256; ++x) for (unsigned y = 0; y < 256; y += 3) for (unsigned part = 0; part < 3; ++part)
        for (unsigned step = 0; step < 32; ++step, ++cases)
            assert(dm_level(step, part, x, y) == reference_level((uint8_t)step, (uint8_t)part, (uint8_t)x, (uint8_t)y));
    printf("level: %u cases match DrumMap's ReadDrumMap\n", cases);
    /* At x = y = 0 the level is the corner node's (node 10's BD opens on 255), through the applet's two >> 8 fades. */
    assert(dm_level(0, DM_BD, 0, 0) == ((grids_drum_map[0][0][0] * 255u >> 8) * 255u >> 8));
}
static void hits_follow_the_rules(void)
{
    for (unsigned part = 0; part < 3; ++part) for (unsigned x = 0; x < 128; x += 9) for (unsigned y = 0; y < 128; y += 11)
    for (unsigned fill = 0; fill < 128; fill += 13) for (unsigned length = 1; length <= 64; length += 7) {
        DmParams p = dm_defaults; DmPattern a, b;
        p.part = (uint8_t)part; p.x = (uint8_t)x; p.y = (uint8_t)y; p.fill = (uint8_t)fill;
        assert(dm_generate(&a, &p, length) && dm_generate(&b, &p, length) && !memcmp(&a, &b, sizeof a));
        unsigned X = 2 * x + (x >> 6), Y = 2 * y + (y >> 6), F = 2 * fill + (fill >> 6);
        for (unsigned s = 0; s < 64; ++s) {
            unsigned level = dm_level(s % 32, part, X, Y);
            if (s >= length) { assert(!a.steps[s].hit); continue; }
            assert(a.steps[s].hit == (level > 255 - F)); /* no chaos: exactly the applet's threshold */
            assert(a.steps[s].accent == (a.steps[s].hit && level > 192));
            if (s >= 32) assert(a.steps[s].hit == a.steps[s - 32].hit); /* the 32-step map repeats */
        }
    }
    DmParams p = dm_defaults; DmPattern a, b;
    p.fill = 0; assert(dm_generate(&a, &p, 32));
    for (unsigned s = 0; s < 32; ++s) assert(!a.steps[s].hit); /* FILL 0: nothing */
    p.fill = 127; assert(dm_generate(&a, &p, 32));
    for (unsigned s = 0; s < 32; ++s) assert(a.steps[s].hit == (dm_level(s, DM_BD, 0, 0) > 0));
    /* Chaos lifts every pass by its own amount: more hits, never fewer, and the two passes of 64 may differ. */
    p = dm_defaults; p.chaos = 127; p.fill = 40;
    assert(dm_generate(&a, &p, 64));
    p.chaos = 0; assert(dm_generate(&b, &p, 64));
    for (unsigned s = 0; s < 64; ++s) assert(a.steps[s].hit >= b.steps[s].hit);
    unsigned differ = 0;
    for (p.seed = 0; p.seed < 128; ++p.seed) {
        p.chaos = 127; assert(dm_generate(&a, &p, 64));
        for (unsigned s = 0; s < 32; ++s) differ += a.steps[s].hit != a.steps[s + 32].hit;
    }
    assert(differ > 0);
    assert(!dm_generate(&a, &p, 0) && !dm_generate(&a, &p, 65));
    p.part = 3; assert(!dm_generate(&a, &p, 16));
    assert(dm_next_seed(127) == 0);
}
static unsigned on(const uint8_t *r, unsigned m, unsigned i) { return (r[m * 8 + 7 - i / 8] >> (i % 8)) & 1u; }
static void writes_the_record(void)
{
    static uint8_t r[DM_TRACK_BYTES], mirror[DM_TRACK_BYTES], before[DM_TRACK_BYTES];
    uint8_t locked[DM_STEPS]; DmPattern a; DmParams p = dm_defaults;
    memset(r, 0, sizeof r); memset(r + DM_LOCKS, 255, 64 * 32); memset(r + 0x40, 0xaa, 8); r[0x50] = 32;
    assert(dm_track_empty(r));
    r[DM_LOCKS + 32 * 1 + 0] = 70;   /* a user's PTCH lock on step 1 stays */
    r[DM_LOCKS + 32 * 40 + 18] = 9;  /* an FX1 lock past the length stays */
    memcpy(mirror, r, sizeof r);
    p.fill = 100;
    assert(dm_generate(&a, &p, 32));
    unsigned hits = dm_write(r, mirror, &a, 8, 100, locked), count = 0;
    assert(!memcmp(r, mirror, sizeof r));
    for (unsigned i = 0; i < 64; ++i) {
        const uint8_t *l = r + DM_LOCKS + 32 * i;
        if (i >= 32) { assert(!on(r, 0, i)); continue; }
        count += a.steps[i].hit;
        assert(on(r, 0, i) == a.steps[i].hit);
        assert(l[DM_LOCK_VOL] == (a.steps[i].hit && !a.steps[i].accent ? 68 : 255));
        assert(on(r, 2, i) == (!a.steps[i].hit && i == 1));
        assert(locked[i] == (a.steps[i].hit || i == 1));
    }
    assert(hits == count && r[DM_LOCKS + 32 + 0] == 70 && r[DM_LOCKS + 32 * 40 + 18] == 9 && locked[40]);
    for (unsigned k = 0x40; k < 0x48; ++k) assert(r[k] == 0xaa);
    memcpy(before, r, sizeof r);
    dm_write(r, NULL, &a, 8, 100, locked);
    assert(!memcmp(r, before, sizeof r));
    dm_write(r, NULL, &a, 0, 100, locked); /* AVEL OFF: no VOL locks */
    for (unsigned i = 0; i < 32; ++i) assert(r[DM_LOCKS + 32 * i + DM_LOCK_VOL] == 255);
}
static void settings_round_trip(void)
{
    uint8_t packed[DM_PACKED];
    for (unsigned n = 0; n < 4000; ++n) {
        DmParams p = dm_defaults, back;
        uint32_t x = 0x9e3779b9u * (n + 1u);
        p.part = (uint8_t)(n % 3); p.x = (uint8_t)(x & 127); p.y = (uint8_t)(x >> 7 & 127); p.fill = (uint8_t)(x >> 14 & 127);
        p.chaos = (uint8_t)(x >> 21 & 127); p.avel = (uint8_t)(n % 32); p.seed = (uint8_t)(n % 128);
        dm_pack(packed, &p);
        for (unsigned k = 0; k < DM_PACKED; ++k) assert(packed[k] < 128);
        dm_unpack(&back, packed);
        assert(!memcmp(&p, &back, sizeof p));
    }
    memset(packed, 0x7f, sizeof packed);
    DmParams p; dm_unpack(&p, packed);
    assert(p.part <= DM_HH);
}
int main(void)
{
    level_matches_the_applet();
    hits_follow_the_rules();
    writes_the_record();
    settings_round_trip();
    puts("[PASS] drummap engine");
    return 0;
}
