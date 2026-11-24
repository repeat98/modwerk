/* SPDX-License-Identifier: GPL-3.0-or-later
 * A runtime module with a stock-code site, for the Model:Cycles' development base: the call that ends each composed
 * frame (OS 1.13, 0x40007678: jsr to 0x400700a4 with the frame's bitmap) goes through frames_end, which counts the
 * frames and makes the same call; the draw hook shows the count at the top right ("F1 n"). frames2.c is the same
 * module's next version ("F2 n"), to try a replacement.
 *
 *   python3 -B sdk/machines/model-cycles/tools/build_sites.py sdk/machines/model-cycles/elekloader/examples/frames.c \
 *       --sites sdk/machines/model-cycles/elekloader/examples/frames.sites.json -o frames.mwrm
 *
 * The package carries the six stock bytes' SHA-256, not the bytes; the base checks the running code before it
 * patches, and puts the stock bytes back at an undo or a removal. */
#include "modwerk_module.h"

#ifndef FRAMES_LABEL
#define FRAMES_LABEL "F1 %d"
#endif
#define FRAME_END ((void (*)(void *))0x400700a4)
#define FW_TEXT ((void (*)(void *, const void *, int32_t, int32_t, int32_t, const char *, ...))0x40071a04)
#define FW_FONT_MAKE ((void (*)(void *, const void *))0x40072260)
#define FW_FONT_DROP ((void (*)(void *))0x40072080)
#define FW_FONT_SMALL ((const void *)0x40140ab0)

static int32_t frames;

void frames_end(void *bmp)
{
    frames++;
    FRAME_END(bmp);
}

void module_draw(unsigned char *bmp)
{
    uint32_t font[2];
    FW_FONT_MAKE(font, FW_FONT_SMALL);
    FW_TEXT(bmp, font, 84, 52, 0, FRAMES_LABEL, frames);
    FW_FONT_DROP(font);
}
