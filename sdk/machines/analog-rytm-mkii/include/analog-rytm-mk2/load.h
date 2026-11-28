/* SPDX-License-Identifier: GPL-2.0-or-later */
/* Analog Rytm MKII core (Modwerk): how busy the audio interrupt is. */
#ifndef ELEKLOADER_AR2_LOAD_H
#define ELEKLOADER_AR2_LOAD_H

#include <stdint.h>

/* The previous audio block's handler time, from the first ev_render_in handler to the last ev_render_out one, in
 * 256ths of the time between two blocks: 0..256, and 0 until two blocks have run. Work a module may skip is best
 * skipped while it reads above 243 (95 %). The core updates it from the audio interrupt. */
extern volatile uint32_t core_audio_load;

#endif
