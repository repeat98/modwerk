/* SPDX-License-Identifier: GPL-3.0-or-later
 * A runtime module for the Model:Cycles' development base (sdk/runtime/loader, base/runtime.c), after the Octatrack's
 * examples/hello.c: a 3x3 square in the top-right corner of every screen, and the shared status word counting key
 * presses (low half) and encoder turns (high half). It takes no events, so the unit works as usual.
 *
 *   python3 -B sdk/runtime/loader/build.py sdk/machines/model-cycles/elekloader/examples/hello.c -o hello.mwrm
 *   python3 sdk/machines/model-cycles/tools/mc_link.py try hello.mwrm --seconds 20
 *
 * The Model:Cycles' draw hook gets the core's bitmap: fill it with the OS's own fill (core-mc's fw_fill, OS 1.13),
 * 128 x 64 pixels, y = 0 the bottom row. */
#include "modwerk_module.h"

#define FW_FILL ((void (*)(void *, int32_t, int32_t, int32_t, int32_t, int32_t, int32_t))0x400710c6)

static uint32_t presses, turns;

void module_draw(unsigned char *bmp) { FW_FILL(bmp, 125, 61, 127, 63, 1, 1); }

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
