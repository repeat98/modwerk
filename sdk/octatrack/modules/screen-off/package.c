/* SPDX-License-Identifier: MIT
 * Export the three core hook names used by the USB package builder.
 * The host tests keep using the names in screen_off.c.
 */
#define so_key module_key
#define so_draw module_draw
#define so_tick module_tick
#include "screen_off.c"
