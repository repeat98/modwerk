/* SPDX-License-Identifier: MIT
 * Measures each waveform's level through the drone at its defaults (DIRT 0, PNCH 0), so gen_tables.py
 * can trim them to one loudness (WAVE_TRIM_DB, printed in the order the waves are made, that tuple's order).
 * cc -O2 -std=c99 calib_waves.c engine.c -lm -o calib && ./calib */
#include <math.h>
#include <stdio.h>
#include "engine.h"
#include "tables.h"

int main(void)
{
    static Ungemach k;
    double level[UG_WAVES], mean = 0;
    for (unsigned w = 0; w < UG_WAVES; ++w) {
        double sum = 0; unsigned count = 0;
        for (unsigned ptch = 16; ptch <= 52; ptch += 12) {
            UgControls c = { .ptch = (uint16_t)(ptch << 8), .diss = 40, .tone = 80, .wave = (uint16_t)((w * 256u * 127u + UG_WAVES - 2u) / (UG_WAVES - 1u)),
                             .rate = 20, .move = 64, .sprd = 2, .dirt = 0 };
            ug_reset(&k);
            int16_t l[16], r[16];
            for (unsigned at = 0; at < 44100 * 4; at += 16) {
                ug_render(&k, &c, l, r, 16);
                if (at < 44100) continue;
                for (unsigned i = 0; i < 16; ++i) sum += (double)l[i] * l[i] + (double)r[i] * r[i], count += 2;
            }
        }
        level[w] = 10 * log10(sum / count / (32768.0 * 32768.0));
        mean += level[w] / UG_WAVES;
    }
    double made[UG_WAVES];
    for (unsigned w = 0; w < UG_WAVES; ++w) made[ug_wave_made[w]] = mean - level[w];
    printf("WAVE_TRIM_DB = (");
    for (unsigned w = 0; w < UG_WAVES; ++w) printf("%.2f%s", made[w], w < UG_WAVES - 1u ? ", " : ")\n");
    return 0;
}
