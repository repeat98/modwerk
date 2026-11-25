/* SPDX-License-Identifier: MIT
 * The engine's output over a fixed matrix, as raw samples on stdout, for comparing two versions of engine.c
 * byte for byte (tools/cf_probe.py host). Only the public API: wave_reset, wave_note, wave_render.
 *   1. every model with every control at 0, 1, 63, 64, 65, 126, 127, every third note, blocks of 1 to 16;
 *   2. 3,000 random walks: a control, the model or the pitch moves between blocks, trigs with RTRG, any block size,
 *      increments from silent to past Nyquist. */
#include <math.h>
#include <stdio.h>
#include "engine.h"              /* -I the module folder: this tree's or an older one's */

static uint32_t seed = 0x2545f491u;
static uint32_t rnd(void) { seed ^= seed << 13, seed ^= seed >> 17, seed ^= seed << 5; return seed; }
static uint32_t inc_of(double note) { return (uint32_t)(440.0 * pow(2.0, (note - 69.0) / 12.0) / WAVE_RATE * 4294967296.0); }
static void block(Wave *w, const WaveControls *c, uint32_t inc, unsigned n)
{
    int16_t out[16];
    wave_render(w, c, inc, out, n);
    fwrite(out, sizeof out[0], n, stdout);
}

int main(void)
{
    static Wave w;
    static const uint8_t ends[] = { 0, 1, 63, 64, 65, 126, 127 };
    for (unsigned m = 0; m < WAVE_MODELS; ++m)
        for (unsigned e = 0; e < sizeof ends; ++e)
            for (unsigned note = 0; note < 128u; note += 3u) {
                WaveControls c = wave_defaults[m];
                uint8_t v = ends[e];
                c.det = c.uni = c.wide = c.sub = c.sub2 = c.pw = c.pwm = c.pws = c.chor = c.drive = c.rtrg = v;
                c.table = c.morph = c.msweep = c.sync = c.wav2 = c.mix = c.wid = c.fade = c.bit1 = c.bit2 = v;
                c.note[0] = v, c.note[1] = (uint8_t)(127 - v), c.note[2] = 88;
                wave_reset(&w);
                wave_note(&w, &c);
                for (unsigned b = 0; b < 48u; ++b) block(&w, &c, inc_of(note), 1u + (b * 7u + note) % 16u);
            }
    for (unsigned run = 0; run < 3000u; ++run) {
        WaveControls c = wave_defaults[rnd() % WAVE_MODELS];
        uint8_t *bytes = &c.det;           /* every control after the model */
        for (unsigned k = 0; k < sizeof c - 1u; ++k) bytes[k] = (uint8_t)(rnd() % 3u ? rnd() % 128u : ends[rnd() % sizeof ends]);
        uint32_t inc = rnd() % 4u ? inc_of((double)(rnd() % 1400u) / 10.0) : rnd();
        wave_reset(&w);
        for (unsigned b = 0; b < 200u; ++b) {
            uint32_t r = rnd() % 100u;
            if (r < 10u) bytes[rnd() % (sizeof c - 1u)] = (uint8_t)(rnd() % 128u);
            else if (r < 13u) c.model = (uint8_t)(rnd() % WAVE_MODELS);
            else if (r < 25u) inc = rnd() % 4u ? inc + (rnd() % 65536u) - 32768u : inc_of((double)(rnd() % 1400u) / 10.0);
            if (rnd() % 16u == 0) wave_note(&w, &c);
            block(&w, &c, inc, 1u + rnd() % 16u);
        }
    }
    return 0;
}
