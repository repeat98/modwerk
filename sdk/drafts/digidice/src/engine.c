/* SPDX-License-Identifier: MIT */
/* digidice engine: see engine.h. No libc, no floating point, no 64-bit
 * arithmetic: it runs unchanged on the Digitakt's ColdFire and on a host. */
#include "engine.h"

/* Gap between rhythm slots, in steps: 1/16, 1/8, dotted 1/8, 1/4, dotted 1/4, 1/2. */
static const uint8_t spacings[DD_SPACINGS] = { 1, 2, 3, 4, 6, 8 };

typedef struct {
    const char *name;
    uint8_t count;
    uint8_t steps[12];  /* semitones above the root */
} scale_t;

static const scale_t scales[DD_SCALES] = {
    { "CHROM", 12, { 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11 } },
    { "MAJOR",  7, { 0, 2, 4, 5, 7, 9, 11 } },
    { "MINOR",  7, { 0, 2, 3, 5, 7, 8, 10 } },
    { "DORIAN", 7, { 0, 2, 3, 5, 7, 9, 10 } },
    { "MIXO",   7, { 0, 2, 4, 5, 7, 9, 10 } },
    { "HARMIN", 7, { 0, 2, 3, 5, 7, 8, 11 } },
    { "MAJPEN", 5, { 0, 2, 4, 7, 9 } },
    { "MINPEN", 5, { 0, 3, 5, 7, 10 } },
};

/* Salts keep each decision's random value independent of the others. */
enum { SALT_PLAY = 1, SALT_VARY, SALT_DIR, SALT_VEL, SALT_NOTE };

/* A 32-bit integer mix (Wellons' lowbias32). */
static uint32_t mix(uint32_t x)
{
    x ^= x >> 16;
    x *= 0x7feb352dU;
    x ^= x >> 15;
    x *= 0x846ca68bU;
    x ^= x >> 16;
    return x;
}

/* A random value for decision `salt` at index `i`, fixed by the seed. Keyed
 * by position, not drawn from a stream, so changing one control does not
 * reshuffle the decisions of the others. */
static uint32_t rnd(uint32_t seed, uint32_t i, uint32_t salt)
{
    return mix(seed ^ mix(i * 0x9e3779b9U + salt));
}

/* True with probability amount/127: 0 never, 127 always. */
static int chance(uint32_t r, uint8_t amount)
{
    return r % 127U < amount;
}

static uint8_t clamp8(int v, int lo, int hi)
{
    return (uint8_t)(v < lo ? lo : v > hi ? hi : v);
}

void dd_clamp(dd_settings *s)
{
    s->density = clamp8(s->density, 0, 127);
    s->spacing = clamp8(s->spacing, 0, DD_SPACINGS - 1);
    s->variation = clamp8(s->variation, 0, 127);
    s->legato = clamp8(s->legato, 0, 127);
    s->root = clamp8(s->root, 0, 11);
    s->scale = clamp8(s->scale, 0, DD_SCALES - 1);
    s->range = clamp8(s->range, 0, DD_RANGE_MAX);
    s->vel_spread = clamp8(s->vel_spread, 0, 127);
}

const char *dd_scale_name(int scale)
{
    return scale >= 0 && scale < DD_SCALES ? scales[scale].name : "";
}

int dd_spacing_steps(int spacing)
{
    return spacing >= 0 && spacing < DD_SPACINGS ? spacings[spacing] : 0;
}

uint32_t dd_next_seed(uint32_t seed)
{
    uint32_t next = mix(seed + 0x9e3779b9U);
    return next != seed ? next : next + 1;
}

/* The gap after rhythm slot i: the basic spacing, halved or doubled by VARIATION. */
static int slot_gap(const dd_settings *s, uint32_t seed, uint32_t i)
{
    int gap = spacings[s->spacing];
    if (!chance(rnd(seed, i, SALT_VARY), s->variation))
        return gap;
    if (rnd(seed, i, SALT_DIR) & 1)
        return gap * 2 > 16 ? gap : gap * 2;
    return gap > 1 ? gap / 2 : gap * 2;
}

/* The note at step t: a scale degree from 0 to RANGE above the root. */
static uint8_t step_note(const dd_settings *s, uint32_t seed, uint32_t t)
{
    const scale_t *sc = &scales[s->scale];
    uint32_t degree = rnd(seed, t, SALT_NOTE) % (uint32_t)(s->range + 1);
    return (uint8_t)(s->root + 12 * (degree / sc->count) + sc->steps[degree % sc->count]);
}

static uint8_t slot_vel(const dd_settings *s, uint32_t seed, uint32_t i, uint8_t base)
{
    int offset = (int)(rnd(seed, i, SALT_VEL) % 255U) - 127;   /* -127..127 */
    return clamp8(base + offset * s->vel_spread / 127, 1, 127);
}

int dd_generate(const dd_settings *settings, uint32_t rhythm_seed, uint32_t note_seed,
                int length, uint8_t vel_base, dd_step out[DD_STEPS])
{
    dd_settings s = *settings;
    int t, next, notes = 0;
    uint32_t i;

    dd_clamp(&s);
    if (length < 1)
        length = 1;
    if (length > DD_STEPS)
        length = DD_STEPS;
    for (t = 0; t < DD_STEPS; t++)
        out[t] = (dd_step){ 0, step_note(&s, note_seed, (uint32_t)t), 0, 0 };

    for (t = 0, i = 0; t < length; t = next, i++) {
        int gap = slot_gap(&s, rhythm_seed, i);
        next = t + gap;
        if (!chance(rnd(rhythm_seed, i, SALT_PLAY), s.density))
            continue;
        if (next > length)
            gap = length - t;
        out[t].on = 1;
        out[t].vel = slot_vel(&s, rhythm_seed, i, vel_base);
        out[t].len = (uint16_t)(gap * DD_LEN_UNIT * s.legato / 127);
        if (out[t].len < 1)
            out[t].len = 1;
        notes++;
    }
    return notes;
}
