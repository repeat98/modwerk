/* Stand-in for chain_draw.c (scripts/build_mixer_ui.py --stub): a blank screen. */
#include "chain.h"

void chain_draw(const Chain *c, unsigned char fb[64][16])
{
    int i;
    (void)c;
    for (i = 0; i < 64 * 16; i++) fb[i >> 4][i & 15] = 0;
}
