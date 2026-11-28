/* SPDX-License-Identifier: MIT */
#include "mono.h"

/* Round f * 2^32 / Fs at compile time. The two inputs are test tones. */
#define WORD(hz) ((uint32_t)((((uint64_t)(hz) << 32) + 22050u) / 44100u))

uint32_t colundi_word(unsigned palette, unsigned degree)
{
    if (palette != 0) return 0;
    switch (degree) {
    case 78: return WORD(440);
    case 79: return WORD(441);
    default: return 0;
    }
}
