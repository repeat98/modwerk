/* SPDX-License-Identifier: MIT
 * Instruction counts of wave_render on a ColdFire, without the Octatrack: a freestanding Linux binary
 * for qemu-m68k -cpu cfv4e (tools/count_cf.sh). It renders BLOCKS frames of 16 samples of one model,
 * then exits; the script counts the instructions executed inside wave_render. Counts, not cycles:
 * the unit's own timer (the base's frame guard) is the measure that qualifies. */
#include "engine.h"

#ifndef MODEL
#define MODEL WAVE_SAW
#endif
#define BLOCKS 64

static Wave w;
static int16_t out[16];

static WaveControls heavy(void)
{
    WaveControls c = wave_defaults[MODEL];
#ifdef LIGHT
    return c;                           /* one oscillator, no subs: the defaults */
#endif
    c.det = 40, c.uni = 127, c.wide = 90, c.sub = 90, c.sub2 = 90, c.pwm = 100, c.pws = 30, c.chor = 100;
    if (MODEL == WAVE_ENS) c.note[0] = 67, c.note[1] = 71, c.note[2] = 76, c.pw = 32;
    if (MODEL == WAVE_TABLE) c.table = 64, c.msweep = 30, c.sync = 80;
    if (MODEL == WAVE_MORPH) c.wav2 = 60, c.wid = 80, c.bit1 = 60, c.bit2 = 90, c.fade = 127;
    if (MODEL == WAVE_CHOIR) c.note[0] = 67, c.note[1] = 71, c.note[2] = 76, c.table = 52;
    return c;
}

void _start(void)
{
    WaveControls c = heavy();
    wave_reset(&w);
    for (unsigned b = 0; b < BLOCKS; ++b) {
#ifndef LIGHT
        if (MODEL == WAVE_MORPH) c.table = (uint8_t)(b & 1u ? 8 : 108); /* a crossfade always running: the worst case */
#endif
        wave_render(&w, &c, 0x01000000u + b * 4096u, out, 16); /* about 172 Hz */
    }
    __asm__ volatile("moveq #1,%%d0\n\tmoveq #0,%%d1\n\ttrap #0" ::: "d0", "d1");
    for (;;) {}
}
