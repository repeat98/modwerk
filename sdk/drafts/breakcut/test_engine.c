/* SPDX-License-Identifier: GPL-3.0-or-later
 * Firmware-free tests of the BREAKCUT engine (test_engine.py builds and runs them under the sanitizers). */
#include "engine.h"
#include <assert.h>
#include <stdio.h>
#include <string.h>

static void straight_when_nothing_cuts(void)
{
    /* WarpCut with ACTV 0 is all straight blocks, and CutProc11 with ACTV 0 and ROLL 0 one occurrence a block: both
     * play the break as it lies, a trig a step on its own slice. */
    for (unsigned algo = 0; algo < 2; ++algo) for (unsigned slices = 1; slices <= 64; slices += 5)
    for (unsigned length = 1; length <= 64; length += 3) for (unsigned seed = 0; seed < 8; ++seed) {
        BcParams p = bc_defaults; BcLine a;
        p.algo = (uint8_t)algo; p.actv = 0; p.roll = 0; p.rev = 0; p.slices = (uint8_t)slices; p.seed = (uint8_t)seed;
        assert(bc_generate(&a, &p, length));
        for (unsigned s = 0; s < 64; ++s) {
            const BcStep *o = &a.steps[s];
            if (s >= length) { assert(!o->trig); continue; }
            assert(o->trig && !o->micro && !o->retrigs && !o->rev && !o->semis && o->slice == s % slices);
        }
    }
}
static unsigned counts[4];
static void lines_are_well_formed(void)
{
    unsigned retrig_steps = 0, micro_steps = 0, rev_steps = 0, ramp_steps = 0, lines = 0;
    for (unsigned algo = 0; algo < 4; ++algo) for (unsigned seed = 0; seed < 128; seed += 3)
    for (unsigned actv = 0; actv < 128; actv += 42) for (unsigned roll = 0; roll < 128; roll += 42)
    for (unsigned length = 1; length <= 64; length += 9) {
        BcParams p = bc_defaults; BcLine a, b;
        p.algo = (uint8_t)algo; p.seed = (uint8_t)seed; p.actv = (uint8_t)actv; p.roll = (uint8_t)roll;
        p.rev = (uint8_t)(seed % 3 ? 0 : 60); p.ramp = (uint8_t)(seed % 25); p.slices = (uint8_t)(1 + seed % 32);
        assert(bc_generate(&a, &p, length) && bc_generate(&b, &p, length) && !memcmp(&a, &b, sizeof a));
        assert(a.steps[0].trig); /* the first block starts on step 0 */
        ++lines;
        for (unsigned s = 0; s < 64; ++s) {
            const BcStep *o = &a.steps[s];
            if (s >= length) { assert(!o->trig); continue; }
            if (!o->trig) { assert(!o->retrigs && !o->micro); continue; }
            assert(o->micro < 24 && o->slice < p.slices && o->retrigs <= 15);
            assert(o->semis >= -12 && o->semis <= 12);
            if ((int)p.ramp == 12) assert(!o->semis);
            if (o->semis) assert((o->semis > 0) == (p.ramp > 12));
            if (!p.rev) assert(!o->rev);
            if (o->retrigs) { assert(o->period >= 1 && o->period <= 24); ++retrig_steps; }
            micro_steps += o->micro != 0; rev_steps += o->rev; ramp_steps += o->semis != 0;
        }
        counts[algo] += 1;
    }
    printf("lines: %u; steps with retrigs %u, micro-timing %u, reversed %u, pitched %u\n", lines, retrig_steps, micro_steps, rev_steps, ramp_steps);
    assert(retrig_steps && micro_steps && rev_steps && ramp_steps);
    BcParams p = bc_defaults; BcLine a;
    assert(!bc_generate(&a, &p, 0) && !bc_generate(&a, &p, 65));
    p.slices = 0; assert(!bc_generate(&a, &p, 16)); p = bc_defaults; p.algo = 4; assert(!bc_generate(&a, &p, 16));
    p = bc_defaults; p.ramp = 25; assert(!bc_generate(&a, &p, 16));
    assert(bc_next_seed(127) == 0);
}
static void rolls_and_fills(void)
{
    /* CutProc11's stutter: ROLL 127 rolls the end of every phrase shorter than half a bar's left; with a 64-step
     * track some seed must end a phrase in a sub-step stutter (retrigs) or a slice repeated on consecutive steps. */
    unsigned stutters = 0, fills = 0;
    for (unsigned seed = 0; seed < 128; ++seed) {
        BcParams p = bc_defaults; BcLine a;
        p.seed = (uint8_t)seed; p.roll = 127; p.algo = BC_CUT;
        assert(bc_generate(&a, &p, 64));
        for (unsigned s = 1; s < 64; ++s) stutters += a.steps[s].retrigs || (a.steps[s].trig && a.steps[s].slice == a.steps[s - 1].slice);
        p.algo = BC_SQP; /* a one-bar phrase at ROLL 127 is all fill */
        assert(bc_generate(&a, &p, 16));
        for (unsigned s = 0; s < 16; ++s) fills += a.steps[s].micro != 0 || a.steps[s].retrigs;
    }
    printf("stutter steps %u, off-grid or retrigged fill steps %u\n", stutters, fills);
    assert(stutters && fills);
}
static void rtim_scale(void)
{
    assert(bc_rtim(24) == 79 && bc_rtim(12) == 95 && bc_rtim(6) == 111 && bc_rtim(3) == 127 && bc_rtim(48) == 63);
    for (unsigned t = 1; t < 48; ++t) assert(bc_rtim(t) >= bc_rtim(t + 1)); /* shorter periods, higher values */
}
static unsigned on(const uint8_t *r, unsigned m, unsigned i) { return (r[m * 8 + 7 - i / 8] >> (i % 8)) & 1u; }
static void writes_the_record(void)
{
    static uint8_t r[BC_TRACK_BYTES], mirror[BC_TRACK_BYTES], before[BC_TRACK_BYTES];
    uint8_t locked[BC_STEPS]; BcLine a; BcParams p = bc_defaults;
    memset(r, 0, sizeof r); memset(r + BC_LOCKS, 255, 64 * 32); memset(r + 0x40, 0xaa, 8); r[0x50] = 32;
    assert(bc_track_empty(r));
    r[BC_LOCKS + 32 * 2 + 15] = 90;  /* a user's VOL lock stays */
    r[BC_LOCKS + 32 * 40 + 1] = 7;   /* a STRT lock past the length stays */
    memcpy(mirror, r, sizeof r);
    p.seed = 9; p.rev = 80; p.ramp = 20; p.algo = BC_MIX;
    assert(bc_generate(&a, &p, 32));
    unsigned trigs = bc_write(r, mirror, &a, locked), count = 0;
    assert(!memcmp(r, mirror, sizeof r));
    for (unsigned i = 0; i < 64; ++i) {
        const BcStep *s = &a.steps[i]; const uint8_t *l = r + BC_LOCKS + 32 * i;
        unsigned word = (unsigned)r[BC_TIMING + 2 * i] << 8 | r[BC_TIMING + 2 * i + 1];
        if (i >= 32) { assert(!on(r, 0, i)); continue; }
        count += s->trig;
        assert(on(r, 0, i) == s->trig);
        assert(l[1] == (s->trig ? s->slice * BC_STRT_PER_SLICE : 255));
        assert(l[0] == (s->trig && s->semis ? 64 + 5 * s->semis : 255));
        assert(l[3] == (s->trig && s->rev ? BC_RATE_REVERSE : 255));
        assert(l[4] == (s->trig && s->retrigs ? s->retrigs : 255));
        assert(l[5] == (s->trig && s->retrigs ? bc_rtim(s->period) : 255));
        assert(word == (s->trig ? (unsigned)s->micro << 7 : 0u));
        assert(l[15] == (i == 2 ? 90 : 255));
        assert(on(r, 2, i) == (!s->trig && i == 2));
    }
    assert(trigs == count && r[BC_LOCKS + 32 * 40 + 1] == 7 && locked[40]);
    for (unsigned k = 0x40; k < 0x48; ++k) assert(r[k] == 0xaa);
    memcpy(before, r, sizeof r);
    bc_write(r, NULL, &a, locked);
    assert(!memcmp(r, before, sizeof r));
}
static void settings_round_trip(void)
{
    uint8_t packed[BC_PACKED];
    for (unsigned n = 0; n < 4000; ++n) {
        BcParams p = bc_defaults, back;
        uint32_t x = 0x9e3779b9u * (n + 1u);
        p.algo = (uint8_t)(n % 4); p.slices = (uint8_t)(1 + n % 64); p.actv = (uint8_t)(x & 127); p.roll = (uint8_t)(x >> 7 & 127);
        p.ramp = (uint8_t)(n % 25); p.rev = (uint8_t)(x >> 14 & 127); p.seed = (uint8_t)(x >> 21 & 127);
        bc_pack(packed, &p);
        for (unsigned k = 0; k < BC_PACKED; ++k) assert(packed[k] < 128);
        bc_unpack(&back, packed);
        assert(!memcmp(&p, &back, sizeof p));
    }
    memset(packed, 0x7f, sizeof packed);
    BcParams p; bc_unpack(&p, packed);
    assert(p.algo <= BC_MIX && p.slices >= 1 && p.slices <= 64 && p.ramp <= 24);
}
int main(void)
{
    straight_when_nothing_cuts();
    lines_are_well_formed();
    rolls_and_fills();
    rtim_scale();
    writes_the_record();
    settings_round_trip();
    puts("[PASS] breakcut engine");
    return 0;
}
