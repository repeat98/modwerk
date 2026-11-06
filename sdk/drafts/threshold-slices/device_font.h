/* SPDX-License-Identifier: MIT
 * Popup lettering adapted from Beat Slicer's device font (MIT, twwwy).
 */
#ifndef TS_DEVICE_FONT_H
#define TS_DEVICE_FONT_H
#include <stdint.h>
void ts_device_text_at(unsigned char *, uint32_t, uint32_t, const char *);
void ts_device_box(unsigned char *, uint32_t, uint32_t, uint32_t, uint32_t);
void ts_device_invert(unsigned char *, uint32_t, uint32_t, uint32_t, uint32_t);
void ts_device_small_text(unsigned char *, uint32_t, uint32_t, const char *);
void ts_device_clear(unsigned char *, uint32_t, uint32_t, uint32_t, uint32_t);
void ts_device_dashed_box(unsigned char *, uint32_t, uint32_t, uint32_t, uint32_t);
#endif
