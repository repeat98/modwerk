/* SPDX-License-Identifier: GPL-3.0-or-later */
// Voice Spread's arithmetic, apart from the hooks so the host test builds it.
#ifndef VOICE_SPREAD_H
#define VOICE_SPREAD_H
#include <stdint.h>

#define VS_VERSION 1
#define VS_PAN_LEVELS 5
#define VS_FILTER_LEVELS 4
#define VS_SLOTS 16

// OS 1.12's Sound parameter indices (the stock descriptor table's array index), values in 8.8.
#define VS_FILTER_FREQ 67
#define VS_PAN 89
#define VS_MAX 0x7f00                 // 127.0, the top of both parameters

struct vs_setting {
    uint8_t version, pan, filter, spare;
};

// The offset a slot takes at each level, in 8.8 parameter units.
int vs_pan_offset(unsigned int slot, unsigned int level);
int vs_filter_offset(unsigned int slot, unsigned int level);
void vs_apply(int16_t *values, int stride, unsigned int pan, unsigned int filter);

#endif
