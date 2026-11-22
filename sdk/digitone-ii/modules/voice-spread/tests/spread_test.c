/* SPDX-License-Identifier: GPL-3.0-or-later */
// Host test of Voice Spread's arithmetic: cc -std=c11 -Wall -Wextra -Werror src/spread.c tests/spread_test.c
#include <assert.h>
#include <stdio.h>
#include "../src/spread.h"

#define STRIDE 101

static int16_t voices[VS_SLOTS * STRIDE];

static void fill(int16_t pan, int16_t freq)
{
    for (int k = 0; k < VS_SLOTS; ++k) {
        for (int j = 0; j < STRIDE; ++j)
            voices[k * STRIDE + j] = (int16_t)(j * 3);
        voices[k * STRIDE + VS_PAN] = pan;
        voices[k * STRIDE + VS_FILTER_FREQ] = freq;
    }
}

int main(void)
{
    // OFF adds nothing, at every slot.
    for (unsigned int k = 0; k < VS_SLOTS; ++k)
        assert(vs_pan_offset(k, 0) == 0 && vs_filter_offset(k, 0) == 0);

    // The offsets are symmetric: every level's slots sum to zero, so the chord's centre stays where the track is.
    for (unsigned int level = 0; level < VS_PAN_LEVELS; ++level) {
        int sum = 0;
        for (unsigned int k = 0; k < VS_SLOTS; ++k) sum += vs_pan_offset(k, level);
        assert(sum == 0);
    }
    // Neighbouring slots go to opposite sides; at 100 % the first two reach 63 steps from the centre.
    assert(vs_pan_offset(0, 4) == -63 * 256 && vs_pan_offset(1, 4) == 63 * 256);
    for (unsigned int k = 0; k < VS_SLOTS; k += 2)
        assert(vs_pan_offset(k, 2) == -vs_pan_offset(k + 1, 2));
    // Filter: at most 20 steps.
    for (unsigned int k = 0; k < VS_SLOTS; ++k) {
        const int f = vs_filter_offset(k, 3);
        assert(f >= -20 * 256 && f <= 20 * 256);
    }
    // Out-of-range levels add nothing.
    assert(vs_pan_offset(3, VS_PAN_LEVELS) == 0 && vs_filter_offset(3, VS_FILTER_LEVELS) == 0);

    // Centred pan at 100 %: hard left and right are held in range (0 and 127.0), the rest untouched.
    fill(0x4000, 0x7f00);
    vs_apply(voices, STRIDE, 4, 3);
    assert(voices[0 * STRIDE + VS_PAN] == 0x0100);
    assert(voices[1 * STRIDE + VS_PAN] == 0x7f00);
    for (int k = 0; k < VS_SLOTS; ++k) {
        const int16_t p = voices[k * STRIDE + VS_PAN], f = voices[k * STRIDE + VS_FILTER_FREQ];
        assert(p >= 0 && p <= VS_MAX && f >= 0 && f <= VS_MAX);
        for (int j = 0; j < STRIDE; ++j)
            if (j != VS_PAN && j != VS_FILTER_FREQ) assert(voices[k * STRIDE + j] == j * 3);
    }
    // A track panned hard left: the spread stops at 0, never wraps.
    fill(0x0000, 0x0000);
    vs_apply(voices, STRIDE, 4, 3);
    for (int k = 0; k < VS_SLOTS; ++k)
        assert(voices[k * STRIDE + VS_PAN] >= 0 && voices[k * STRIDE + VS_FILTER_FREQ] >= 0);
    // Pan only: the filter stays.
    fill(0x4000, 0x3000);
    vs_apply(voices, STRIDE, 2, 0);
    for (int k = 0; k < VS_SLOTS; ++k) assert(voices[k * STRIDE + VS_FILTER_FREQ] == 0x3000);
    puts("voice-spread: ok");
    return 0;
}
