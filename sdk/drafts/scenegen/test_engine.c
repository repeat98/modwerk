/* SPDX-License-Identifier: GPL-3.0-or-later
 * Firmware-free tests of the SCENE GEN engine (test_engine.py builds and runs them under the sanitizers). */
#include "engine.h"
#include <assert.h>
#include <stdio.h>
#include <string.h>

static uint32_t mix(uint32_t x) { x ^= x >> 16; x *= 0x7feb352du; x ^= x >> 15; x *= 0x846ca68bu; x ^= x >> 16; return x; }
static void random_part(SgPart *part, uint32_t salt)
{
    for (unsigned t = 0; t < SG_TRACKS; ++t)
        for (unsigned k = 0; k < SG_SLOTS; ++k) {
            uint32_t x = mix(salt * 977u + t * 31u + k);
            unsigned kind = x % 7u;
            if (kind == 0) { part->lo[t][k] = 1; part->hi[t][k] = 0; }            /* no knob there */
            else if (kind == 1) { part->lo[t][k] = 0; part->hi[t][k] = 3; }      /* a small select */
            else if (kind == 2) { part->lo[t][k] = 1; part->hi[t][k] = 16; }
            else { part->lo[t][k] = 0; part->hi[t][k] = 127; }
            part->base[t][k] = (uint8_t)(x >> 8 & 127);
        }
}
static int absdiff(int a, int b) { return a > b ? a - b : b - a; }
static void generates_inside_the_lines(void)
{
    static SgScenes before, after, again;
    SgPart part;
    unsigned runs = 0, locks = 0;
    for (unsigned n = 0; n < 4000; ++n) {
        SgParams p;
        uint32_t x = mix(n + 1u);
        p.target = (uint8_t)(x % SG_TARGETS); p.pages = (uint8_t)((x >> 3) % SG_PAGES); p.all = (uint8_t)(x >> 6 & 1);
        p.spread = (uint8_t)(1 + (x >> 8) % 127);
        unsigned track = (x >> 16) % 8, a = (x >> 20) % 16, b = (x >> 24) % 16;
        random_part(&part, n);
        for (unsigned s = 0; s < SG_SCENES; ++s) for (unsigned t = 0; t < SG_TRACKS; ++t) for (unsigned k = 0; k < 32; ++k)
            before[s][t][k] = (uint8_t)(mix(n * 7919u + s * 256u + t * 32u + k) % 3 ? SG_NO_LOCK : mix(k + n) & 127);
        memcpy(after, before, sizeof after);
        memcpy(again, before, sizeof again);
        int changed = sg_generate(after, &part, &p, track, a, b, n);
        assert(changed >= 0 && sg_generate(again, &part, &p, track, a, b, n) == changed && !memcmp(after, again, sizeof after));
        ++runs;
        int counted = 0;
        for (unsigned s = 0; s < SG_SCENES; ++s) for (unsigned t = 0; t < SG_TRACKS; ++t) for (unsigned k = 0; k < 32; ++k) {
            uint8_t v = after[s][t][k], was = before[s][t][k];
            unsigned target = p.target == SG_TO_A ? s == a : p.target == SG_TO_B ? s == b : 1;
            unsigned mine = target && (p.all || t == track) && sg_selected(p.pages, k) && part.lo[t][k] <= part.hi[t][k];
            counted += v != was;
            if (!mine) { assert(v == was); continue; }
            ++locks;
            assert(k != SG_XVOL && v >= part.lo[t][k] && v <= part.hi[t][k]);
            int lo = part.lo[t][k], hi = part.hi[t][k], base = part.base[t][k] < lo ? lo : part.base[t][k] > hi ? hi : part.base[t][k];
            int reach = (int)((unsigned)(hi - lo) * p.spread + 63u) / 127;
            if (p.target != SG_TO_PATH16) assert(absdiff(v, base) <= reach);
            else {
                int prev = s ? after[s - 1][t][k] : base;
                assert(absdiff(v, prev) <= (reach + 1) / 2);
            }
        }
        assert(counted == changed);
    }
    printf("generation: %u runs, %u generated locks inside their ranges and reach\n", runs, locks);
}
static void spread_and_walk(void)
{
    /* SPREAD 127 reaches across a 0-127 knob; a 16 PATH moves step by step and does not stand still */
    static SgScenes sc;
    SgPart part;
    for (unsigned t = 0; t < 8; ++t) for (unsigned k = 0; k < SG_SLOTS; ++k) { part.lo[t][k] = 0; part.hi[t][k] = 127; part.base[t][k] = 64; }
    SgParams p = sg_defaults;
    p.target = SG_TO_RAND16; p.pages = SG_FX1; p.spread = 127;
    memset(sc, SG_NO_LOCK, sizeof sc);
    assert(sg_generate(sc, &part, &p, 0, 0, 1, 7) > 0);
    unsigned low = 0, high = 0;
    for (unsigned s = 0; s < 16; ++s) for (unsigned k = 18; k < 24; ++k) { low += sc[s][0][k] < 16; high += sc[s][0][k] > 111; }
    assert(low && high);
    p.target = SG_TO_PATH16; p.spread = 40;
    memset(sc, SG_NO_LOCK, sizeof sc);
    assert(sg_generate(sc, &part, &p, 2, 0, 1, 9) > 0);
    unsigned moves = 0;
    for (unsigned s = 1; s < 16; ++s) for (unsigned k = 18; k < 24; ++k) moves += sc[s][2][k] != sc[s - 1][2][k];
    assert(moves > 60);
    for (unsigned k = 0; k < 32; ++k) assert(sc[0][1][k] == SG_NO_LOCK); /* another track untouched */
    SgParams bad = sg_defaults; bad.spread = 0; assert(sg_generate(sc, &part, &bad, 0, 0, 1, 1) == -1);
    bad = sg_defaults; assert(sg_generate(sc, &part, &bad, 8, 0, 1, 1) == -1);
    assert(!sg_selected(SG_ALL, SG_XVOL) && sg_selected(SG_AMP, 12) && !sg_selected(SG_FX, 12) && sg_selected(SG_FX, 29));
}
int main(void)
{
    generates_inside_the_lines();
    spread_and_walk();
    puts("[PASS] scenegen engine");
    return 0;
}
