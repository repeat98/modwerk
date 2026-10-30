/* SPDX-License-Identifier: GPL-3.0-or-later
 * DRUMMAP engine. dm_level is DrumMap's ReadDrumMap (Benjamin Rosenbach, MIT) over Grids' nodes (grids.c, Émilie
 * Gillet, GPL-3.0); the hit, accent and chaos rules are the applet's Controller(); the pattern is laid on the track
 * once instead of clocked, so the stock sequencer plays it. Firmware-free. */
#include "engine.h"
#include "grids.h"

const DmParams dm_defaults = {DM_BD, 0, 0, 64, 0, 12, 1}; /* DrumMap's fill 128, x 0, y 0, chaos 0 */
const char *const dm_part_names[3] = {"BD", "SD", "HH"};

unsigned dm_level(unsigned step, unsigned part, unsigned x, unsigned y)
{
    unsigned i = (x & 255u) >> 6, j = (y & 255u) >> 6, offset = part * DM_GRID + (step % DM_GRID);
    unsigned a = grids_drum_map[i][j][offset], b = grids_drum_map[i + 1u][j][offset];
    unsigned c = grids_drum_map[i][j + 1u][offset], d = grids_drum_map[i + 1u][j + 1u][offset];
    unsigned qx = (x << 2) & 255u, qy = (y << 2) & 255u; /* the applet's uint8_t x << 2 */
    unsigned ab = (b * qx + a * (255u - qx)) >> 8, cd = (d * qx + c * (255u - qx)) >> 8;
    return (cd * qy + ab * (255u - qy)) >> 8;
}

static uint32_t rng_next(uint32_t *s) { uint32_t x = *s ? *s : 1u; x ^= x << 13; x ^= x >> 17; x ^= x << 5; return *s = x; }
unsigned dm_next_seed(unsigned seed) { return (seed + 1u) & 127u; }

int dm_generate(DmPattern *out, const DmParams *p, unsigned length)
{
    if (!out || !p || !length || length > DM_STEPS || p->part > DM_HH) return 0;
    unsigned x = 2u * p->x + (p->x >> 6), y = 2u * p->y + (p->y >> 6);              /* 0-127 onto 0-255 */
    unsigned fill = 2u * p->fill + (p->fill >> 6), chaos = 2u * p->chaos + (p->chaos >> 6);
    unsigned threshold = 255u - fill, lift = 0;
    uint32_t rng = 0x5eed0000u ^ ((uint32_t)p->seed * 0x9e3779b9u) ^ (uint32_t)p->part;
    for (unsigned s = 0; s < DM_STEPS; ++s) {
        if (s % DM_GRID == 0) lift = chaos >> 2 ? rng_next(&rng) % (chaos >> 2) : 0u; /* the applet's random(0, chaos >> 2) */
        unsigned level = s < length ? dm_level(s, p->part, x, y) + lift : 0u;
        if (level > 255u) level = 255u;
        out->steps[s].hit = (uint8_t)(s < length && level > threshold);
        out->steps[s].accent = (uint8_t)(out->steps[s].hit && level > 192u);
    }
    out->length = (uint8_t)length;
    return 1;
}

static unsigned bit(const uint8_t *r, unsigned mask, unsigned step) { return (r[mask * 8u + 7u - step / 8u] >> (step % 8u)) & 1u; }
static void setbit(uint8_t *r, unsigned mask, unsigned step, unsigned on)
{
    uint8_t *byte = r + mask * 8u + 7u - step / 8u, b = (uint8_t)(1u << (step % 8u));
    *byte = on ? (uint8_t)(*byte | b) : (uint8_t)(*byte & (uint8_t)~b);
}
static void put(uint8_t *r, uint8_t *mirror, unsigned at, uint8_t v) { if (r[at] != v) { r[at] = v; if (mirror) mirror[at] = v; } }
/* As VECTOR's: no trigs, marks or recorder events (masks 0-7 and 9; 8 is swing) and no lock at all. */
int dm_track_empty(const uint8_t *r)
{
    for (unsigned i = 0; i < 64; ++i) if (r[i]) return 0;
    for (unsigned i = 72; i < 80; ++i) if (r[i]) return 0;
    for (unsigned i = 0; i < DM_STEPS * 32u; ++i) if (r[DM_LOCKS + i] != DM_NO_LOCK) return 0;
    return 1;
}
unsigned dm_write(uint8_t *r, uint8_t *mirror, const DmPattern *pattern, unsigned avel, unsigned base_vol, uint8_t locked[DM_STEPS])
{
    uint8_t masks[80];
    unsigned hits = 0, length = pattern->length > DM_STEPS ? DM_STEPS : pattern->length;
    unsigned plain = avel && base_vol <= 127u ? (base_vol > 4u * avel ? base_vol - 4u * avel : 0u) : DM_NO_LOCK;
    for (unsigned k = 0; k < 80; ++k) masks[k] = r[k];
    for (unsigned i = 0; i < DM_STEPS; ++i) {
        unsigned at = DM_LOCKS + 32u * i, old = bit(masks, 0, i);
        if (i >= length) {
            unsigned any = 0;
            for (unsigned k = 0; !any && k < 32; ++k) any = r[at + k] != DM_NO_LOCK;
            locked[i] = (uint8_t)any;
            continue;
        }
        const DmStep *s = &pattern->steps[i];
        put(r, mirror, at + DM_LOCK_VOL, s->hit && !s->accent ? (uint8_t)plain : (uint8_t)DM_NO_LOCK);
        setbit(masks, 0, i, s->hit);
        if (old || s->hit) { /* a straight trig word; no stale one-shot, slide or recorder marks (masks 1, 3, 9) */
            put(r, mirror, DM_TIMING + 2u * i, 0);
            put(r, mirror, DM_TIMING + 2u * i + 1u, 0);
            setbit(masks, 1, i, 0); setbit(masks, 3, i, 0); setbit(masks, 9, i, 0);
        }
        unsigned any = 0;
        for (unsigned k = 0; !any && k < 32; ++k) any = r[at + k] != DM_NO_LOCK;
        locked[i] = (uint8_t)(any || s->hit);
        setbit(masks, 2, i, !s->hit && any);
        hits += s->hit;
    }
    for (unsigned k = 0; k < 80; ++k) put(r, mirror, k, masks[k]);
    return hits;
}

static unsigned field(const uint8_t *in, unsigned at, unsigned bits)
{
    unsigned v = 0;
    for (unsigned b = 0; b < bits; ++b, ++at) v |= (unsigned)((in[at / 7u] >> (at % 7u)) & 1u) << b;
    return v;
}
static void set_field(uint8_t *out, unsigned at, unsigned bits, unsigned v)
{
    for (unsigned b = 0; b < bits; ++b, ++at) {
        uint8_t m = (uint8_t)(1u << (at % 7u));
        out[at / 7u] = (uint8_t)(v >> b & 1u ? out[at / 7u] | m : out[at / 7u] & (uint8_t)~m);
    }
}
static const uint8_t widths[7] = {2, 7, 7, 7, 7, 5, 7};
void dm_pack(uint8_t out[DM_PACKED], const DmParams *p)
{
    unsigned v[7] = {p->part, p->x, p->y, p->fill, p->chaos, p->avel, p->seed};
    for (unsigned k = 0; k < DM_PACKED; ++k) out[k] = 0;
    for (unsigned k = 0, at = 0; k < 7; at += widths[k++]) set_field(out, at, widths[k], v[k] & ((1u << widths[k]) - 1u));
}
void dm_unpack(DmParams *p, const uint8_t in[DM_PACKED])
{
    unsigned v[7];
    for (unsigned k = 0, at = 0; k < 7; at += widths[k++]) v[k] = field(in, at, widths[k]);
    p->part = (uint8_t)(v[0] <= DM_HH ? v[0] : DM_BD); p->x = (uint8_t)v[1]; p->y = (uint8_t)v[2]; p->fill = (uint8_t)v[3];
    p->chaos = (uint8_t)v[4]; p->avel = (uint8_t)v[5]; p->seed = (uint8_t)v[6];
}
