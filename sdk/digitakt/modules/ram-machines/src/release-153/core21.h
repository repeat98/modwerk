/* SPDX-License-Identifier: GPL-2.0-or-later */
/* Firmware locations for mods that run on Elekloader Core 2.1.
 *
 * Core 3.0 exports these as symbols (fw_*); Core 2.1 does not. Include this
 * after digitakt-mk1/core3.h: the names then become the firmware's own
 * addresses, so the module imports nothing beyond Core 2.1. Values are OS
 * 1.53's; the 1.54 port translates each literal through the binding profile
 * (tools/firmware/elemods/firmware-154.json), which matches Core 3.0's 1.54
 * port. Only the locations these mods use are listed. */
#ifndef DT_CORE21_H
#define DT_CORE21_H
#include <stdint.h>

#define fw_kit          (*(uint8_t *volatile *)0x4199dc44UL)
#define fw_voice_params ((volatile int16_t *)0x80002794UL)
#define fw_set_param    ((void (*)(int32_t, int32_t, int32_t))0x400771e8UL)
#define fw_fillrect     ((void (*)(void *, int32_t, int32_t, int32_t, int32_t, int32_t))0x400c19a6UL)
#define fw_textf        ((int32_t (*)(void *, const void *, int32_t, int32_t, int32_t, const char *, ...))0x400c257cUL)
#define fw_font5        ((const char *)0x40200b0cUL)
#define fw_op_new       ((uint32_t (*)(uint32_t))0x400d4180UL)

#endif
