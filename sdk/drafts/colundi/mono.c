/* SPDX-License-Identifier: MIT
 * Two sine partials in one monophonic voice. All increments assume 44100 Hz.
 * Phase survives retriggers. The second partial fades toward silence at the
 * upper edge and keeps its last in-band rate while fading after a large pitch jump.
 */
#include "mono.h"

static const int16_t sine_table[257] = {
#include "sine.inc"
};

static int32_t sine_at(uint32_t phase)
{
    unsigned index = phase >> 24;
    int32_t fraction = (int32_t)((phase >> 12) & 4095u);
    int32_t a = sine_table[index];
    return a + ((sine_table[index+1] - a) * fraction >> 12);
}

static int32_t approach(int32_t now, int32_t target, int32_t step)
{
    int32_t delta = target - now;
    if (delta > step) delta = step;
    if (delta < -step) delta = -step;
    return now + delta;
}

void colundi_off(ColundiVoice *v) { v->target = 0; }

void colundi_note(ColundiVoice *v, unsigned palette, unsigned degree, unsigned bright)
{
    uint32_t word = colundi_word(palette, degree);
    if (!word) {
        colundi_off(v);
        return;
    }
    int32_t level = (int32_t)(bright > 127 ? 127 : bright) * 64;
    /* Fade from Fs*3/16 to Fs/4; the second partial is then out of band. */
    if (word >= 0x40000000u) level = 0;
    else if (word > 0x30000000u)
        level = (level * (int32_t)((0x40000000u - word) >> 16)) >> 12;
    if (word < 0x40000000u) v->overtone_word = 2u * word;
    v->word = word;
    v->colour_target = level;
    v->target = 32767;
}

void colundi_render(ColundiVoice *v, int16_t *out, unsigned count)
{
    uint32_t second = v->overtone_word;
    if (!v->gain && !v->target && v->colour == v->colour_target) {
        for (unsigned i=0; i<count; ++i) out[i] = 0;
        v->phase += v->word * count;
        v->overtone_phase += second * count;
        return;
    }
    for (unsigned i=0; i<count; ++i) {
        v->gain = approach(v->gain, v->target, 256);
        v->colour = approach(v->colour, v->colour_target, 64);
        int32_t sample = (sine_at(v->phase) * 3) >> 2;
        if (v->colour)
            sample += (sine_at(v->overtone_phase) * v->colour) >> 15;
        out[i] = (int16_t)((sample * v->gain) >> 15);
        v->phase += v->word;
        v->overtone_phase += second;
    }
}
