/* SPDX-License-Identifier: GPL-3.0-or-later
 * A first test module for the Digitone II's runtime loader (../LOADER.md): while it is live, every composed frame
 * gets a 3x3 dot in its bottom-right corner. It takes no event and changes nothing else; Undo or a power cycle
 * removes it with the next redraw. Build and try it:
 *
 *   python3 -B sdk/runtime/loader/build.py sdk/machines/digitone-ii/examples/corner_dot.c -o corner_dot.mwrm
 *   python3 sdk/machines/digitone-ii/tools/dn2_link.py try corner_dot.mwrm --seconds 10
 *
 * OS 1.12: stock composes each frame into the frame its first frame pointer names (0x402a10c8), then sends it to
 * the display. A frame is 128x64 pixels, 1 bit each, column by column: pixel (x, y) is bit y % 8 of byte
 * 7 - y / 8 + 8 x (LINK.md, screen). */
#include "modwerk_module.h"

#define FRAME_DRAWN (*(unsigned char *volatile *)0x402a10c8u)

void module_draw(unsigned char *bitmap)
{
    unsigned char *frame = FRAME_DRAWN;
    (void)bitmap;
    if (!frame)
        return;
    for (unsigned x = 125; x < 128; ++x)
        frame[7 - 63 / 8 + 8 * x] |= 0xe0;   /* y 61-63: bits 5-7 of the bottom byte row */
}
