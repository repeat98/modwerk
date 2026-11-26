/* SPDX-License-Identifier: GPL-3.0-or-later */
#include "spread.h"

// Where each slot sits, in eighths of the full width: neighbouring slots go to opposite sides and
// the first slots a chord takes land far apart, so two or three notes already spread wide.
static const int8_t place[VS_SLOTS] = {-8, 8, -4, 4, -6, 6, -2, 2, -7, 7, -3, 3, -5, 5, -1, 1};

// Pan: 100 % takes the outermost slots to hard left and right (63 of the 64 steps from the centre).
static const int16_t pan_step[VS_PAN_LEVELS] = {0, 504, 1008, 1512, 2016};
// Filter frequency: at most 4, 10 or 20 of the 127 steps up or down.
static const int16_t filter_step[VS_FILTER_LEVELS] = {0, 128, 320, 640};

int vs_pan_offset(unsigned int slot, unsigned int level)
{
    return level < VS_PAN_LEVELS ? place[slot & (VS_SLOTS - 1)] * pan_step[level] : 0;
}

// The filter takes the places in another order, so a slot's side and its brightness do not follow each other.
int vs_filter_offset(unsigned int slot, unsigned int level)
{
    return level < VS_FILTER_LEVELS ? place[(slot + 5) & (VS_SLOTS - 1)] * filter_step[level] : 0;
}

static int16_t held(int value)
{
    return (int16_t)(value < 0 ? 0 : value > VS_MAX ? VS_MAX : value);
}

void vs_apply(int16_t *values, int stride, unsigned int pan, unsigned int filter)
{
    for (unsigned int slot = 0; slot < VS_SLOTS; ++slot) {
        int16_t *v = values + stride * (int)slot;
        if (pan)
            v[VS_PAN] = held(v[VS_PAN] + vs_pan_offset(slot, pan));
        if (filter)
            v[VS_FILTER_FREQ] = held(v[VS_FILTER_FREQ] + vs_filter_offset(slot, filter));
    }
}
