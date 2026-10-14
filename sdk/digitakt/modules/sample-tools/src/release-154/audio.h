/* SPDX-License-Identifier: GPL-2.0-or-later */
#ifndef DT_SAMPLE_AUDIO_H
#define DT_SAMPLE_AUDIO_H
#include <stdint.h>
/* OS 1.53 PCM in cached or uncached DDR, without wrapping physical RAM. */
uint32_t se_pcm_valid(uint32_t, uint32_t);
/* Boundaries are [start,end), in samples. No padding is read. */
uint32_t se_snap(const int16_t *, uint32_t, uint32_t, int32_t,
                 uint32_t, uint32_t, uint32_t, uint32_t);
int16_t se_blend(int16_t, int16_t, uint32_t, uint32_t);
uint32_t se_crossfade(int16_t *, uint32_t, uint32_t, uint32_t);
#endif
