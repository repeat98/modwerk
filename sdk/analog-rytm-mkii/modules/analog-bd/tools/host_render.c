/* SPDX-License-Identifier: MIT */
/* Host render of src/ab_dsp.c for tools/compare.py:
 *   host_render MODEL PTCH DCAY TONE ATK SWEP ACNT LOW HIGH BLOCKS [RETRIG_BLOCK]
 * writes BLOCKS x 32 int32 samples (Q31) to stdout, a hit at frame 0. */
#include <stdio.h>
#include <stdlib.h>
#include "../src/ab_dsp.h"

int main(int argc, char **argv)
{
    if (argc < 11)
        return 2;
    struct ab_voice v;
    struct ab_knobs k = { atoi(argv[2]), atoi(argv[3]), atoi(argv[4]), atoi(argv[5]),
                          atoi(argv[6]), atoi(argv[7]), atoi(argv[8]), atoi(argv[9]), 1 << 28 };
    int blocks = atoi(argv[10]), retrig = argc > 11 ? atoi(argv[11]) : -1;
    int32_t out[AB_FRAMES];
    ab_init(&v, atoi(argv[1]));
    for (int b = 0; b < blocks; b++) {
        if (b == 0 || b == retrig)
            ab_trig(&v);
        ab_render(&v, &k, out);
        fwrite(out, sizeof out, 1, stdout);
    }
    return 0;
}
