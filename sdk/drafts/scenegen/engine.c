/* SPDX-License-Identifier: GPL-3.0-or-later
 * SCENE GEN engine. One scene: each selected parameter is locked at the Part's value moved by up to SPREAD/127 of its
 * range, either way. 16 RAND: all sixteen scenes so, each on its own draws. 16 PATH: a walk, as SEEDWALK's ball walks
 * between its nets: scene 1 starts from the Part's values and each next scene takes a step from the one before (half
 * the spread, reflecting at the range's ends), so the crossfader between neighbouring scenes is a short move and
 * between distant ones a long journey. Integers only. Firmware-free. */
#include "engine.h"

const SgParams sg_defaults = {SG_TO_B, SG_FX, 0, 32};
const char *const sg_target_names[SG_TARGETS] = {"SCENE A", "SCENE B", "16 RAND", "16 PATH"};
const char *const sg_page_names[SG_PAGES] = {"SRC", "LFO", "AMP", "FX1", "FX2", "FX1+FX2", "ALL"};

unsigned sg_selected(unsigned pages, unsigned k)
{
    if (k >= SG_SLOTS || k == SG_XVOL) return 0;
    unsigned page = k / 6u;
    switch (pages) {
    case SG_SRC: return page == 0; case SG_LFO: return page == 1; case SG_AMP: return page == 2;
    case SG_FX1: return page == 3; case SG_FX2: return page == 4; case SG_FX: return page >= 3;
    case SG_ALL: return 1; default: return 0;
    }
}
typedef struct { uint32_t s; } Rng;
static uint32_t next(Rng *r) { uint32_t x = r->s ? r->s : 1u; x ^= x << 13; x ^= x >> 17; x ^= x << 5; return r->s = x; }
/* A value in -reach..reach, the ends included. */
static int swing(Rng *r, int reach) { return reach > 0 ? (int)((next(r) >> 8) % (uint32_t)(2 * reach + 1)) - reach : 0; }
static int reflect(int v, int lo, int hi)
{
    if (hi <= lo) return lo;
    while (v < lo || v > hi) v = v < lo ? 2 * lo - v : 2 * hi - v;
    return v;
}
static int set_lock(uint8_t *row, unsigned k, int v)
{
    if (row[k] == (uint8_t)v) return 0;
    row[k] = (uint8_t)v;
    return 1;
}
int sg_generate(SgScenes scenes, const SgPart *part, const SgParams *p, unsigned track, unsigned scene_a,
                unsigned scene_b, uint32_t seed)
{
    if (!scenes || !part || !p || p->target >= SG_TARGETS || p->pages >= SG_PAGES || !p->spread || p->spread > 127u
        || track >= SG_TRACKS || scene_a >= SG_SCENES || scene_b >= SG_SCENES) return -1;
    Rng rng = {0x5cee0001u ^ seed * 0x9e3779b9u};
    int changed = 0;
    unsigned first = p->all ? 0u : track, last = p->all ? SG_TRACKS : track + 1u;
    for (unsigned t = first; t < last; ++t)
        for (unsigned k = 0; k < SG_SLOTS; ++k) {
            int lo = part->lo[t][k], hi = part->hi[t][k], base = part->base[t][k];
            if (!sg_selected(p->pages, k) || lo > hi) continue;
            if (base < lo) base = lo;
            if (base > hi) base = hi;
            int reach = (int)((unsigned)(hi - lo) * p->spread + 63u) / 127;
            if (p->target == SG_TO_A || p->target == SG_TO_B) {
                unsigned s = p->target == SG_TO_A ? scene_a : scene_b;
                changed += set_lock(scenes[s][t], k, reflect(base + swing(&rng, reach), lo, hi));
            } else if (p->target == SG_TO_RAND16) {
                for (unsigned s = 0; s < SG_SCENES; ++s) changed += set_lock(scenes[s][t], k, reflect(base + swing(&rng, reach), lo, hi));
            } else {
                int v = base;
                for (unsigned s = 0; s < SG_SCENES; ++s) {
                    v = reflect(v + swing(&rng, (reach + 1) / 2), lo, hi);
                    changed += set_lock(scenes[s][t], k, v);
                }
            }
        }
    return changed;
}
