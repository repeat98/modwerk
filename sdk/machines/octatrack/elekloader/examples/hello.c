/* SPDX-License-Identifier: GPL-2.0-or-later
 * Copyright (C) 2026 irpina and contributors; Modwerk contributors
 *
 * Elekloader's examples/hello-marker-ot as a runtime module
 * (sdk/runtime/loader): a 3x3 square in the top-right corner of every screen,
 * and DIAG's value counting key presses (low half) and encoder turns (high
 * half). It takes no events, so the unit works as usual.
 *
 *   python3 -B sdk/runtime/loader/build.py sdk/machines/octatrack/elekloader/examples/hello.c -o hello.mwrm
 *   npm run device -- try hello.mwrm --seconds 20
 *
 * The Octatrack's frame is 1024 bytes: 128 rows of 8 bytes, one per screen
 * column x (0 at the left); line y (0 at the top) is bit 63 - y of the row,
 * counting from its first byte's most significant bit. */
#include "modwerk_module.h"

static uint32_t presses, turns;

static void pixel(unsigned char *frame, int x, int y)
{
    int bit = 63 - y;
    frame[x * 8 + (bit >> 3)] |= (unsigned char)(0x80 >> (bit & 7));
}

void module_draw(unsigned char *frame)
{
    for (int x = 125; x < 128; x++)
        for (int y = 0; y < 3; y++)
            pixel(frame, x, y);
}

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
