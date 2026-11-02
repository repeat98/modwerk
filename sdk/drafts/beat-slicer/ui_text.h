/* SPDX-License-Identifier: MIT */
#ifndef BEAT_SLICER_UI_TEXT_H
#define BEAT_SLICER_UI_TEXT_H
#include <stdint.h>
/* ASCII labels for the existing stock popup font. No locale, allocation or
 * source reads. Capacity includes NUL; failure leaves output unchanged. BPM
 * uses 1/24 units, displayed to the nearest hundredth (half rounds upward). */
#define BS_UI_LABEL_BYTES 32u
int bs_ui_plan_label(char *, uint32_t capacity, uint32_t count, uint32_t bpm24);
int bs_ui_counts_label(char *, uint32_t capacity, uint32_t existing, uint32_t added);
#endif
