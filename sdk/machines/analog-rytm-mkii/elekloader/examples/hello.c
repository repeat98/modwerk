/* SPDX-License-Identifier: GPL-3.0-or-later
 * A runtime module for the Analog Rytm MKII's base (sdk/runtime/loader, base/runtime.c), after the Model:Cycles' and
 * the Octatrack's examples/hello.c: a 3x3 square in the top-right corner of every screen, and the shared status word
 * counting key presses (low half) and encoder turns (high half). It takes no events, so the unit works as usual.
 *
 *   python3 -B sdk/runtime/loader/build.py sdk/machines/analog-rytm-mkii/elekloader/examples/hello.c -o hello.mwrm
 *   python3 sdk/machines/analog-rytm-mkii/tools/rytm_link.py try hello.mwrm --seconds 20
 *
 * The Rytm's draw hook gets the core's bitmap: fill it with stock's own fillrect (FILLRECT_AT in base.json, OS 1.74:
 * bitmap, x0, y0, x1, y1, colour), 128 x 64 pixels, y = 0 the bottom row. */
#include "modwerk_module.h"

#define FILLRECT ((void (*)(void *, int, int, int, int, int))0x40070726)

static uint32_t presses, turns;

void module_draw(unsigned char *bmp) { FILLRECT(bmp, 125, 60, 127, 62, 1); }

int module_key(int code, int pressed)
{
    (void)code;
    if (pressed) presses++;
    return 0;
}

int module_enc(int encoder, int delta)
{
    (void)encoder; (void)delta;
    turns++;
    return 0;
}

void module_tick(struct modwerk_runtime_api *api) { api->value = turns << 16 | (presses & 0xffffu); }
