/* SPDX-License-Identifier: MIT
 * machine_map on the host, against a curve built as stock's is read (machine_map.h): the played
 * frequency for PTCH, its LFO fractions, FINE and OCT, and every knob byte reaching its control. */
#include <math.h>
#include <stdio.h>
#include <string.h>
#include "machine_map.h"

static uint32_t curve[1024];
static int failures;
#define CHECK(c, ...) do { if (!(c)) { ++failures; printf("FAIL " __VA_ARGS__); printf("\n"); } } while (0)

static double hz(uint16_t ptch, uint8_t fine, uint8_t oct)
{
    return wave_increment(ptch, fine, oct, curve) * (double)WAVE_RATE / 4294967296.0;
}
static void near(const char *what, double got, double want)
{
    double cents = 1200 * log2(got / want);
    CHECK(fabs(cents) < 1.5, "%s: %.3f Hz, want %.3f (%.2f cents)", what, got, want, cents);
}

int main(void)
{
    for (unsigned i = 0; i < 1024; ++i) /* entry i: 2^((i*32 - 0x0400) / 0x500 / 12), Q26 */
        curve[i] = (uint32_t)llround(67108864.0 * pow(2.0, ((double)i * 32 - 0x0400) / 0x500 / 12.0));
    const double c3 = WAVE_ROOT_HZ;
    for (int s = -12; s <= 12; ++s) {
        char what[64]; snprintf(what, sizeof what, "PTCH %+d semitones", s);
        near(what, hz((uint16_t)(0x4000 + s * 0x500), 64, 3), c3 * pow(2.0, s / 12.0));
    }
    near("PTCH raw 0 (folded)", hz(0x0000, 64, 3), c3 * pow(2.0, (0x0000 - 0x4000) / 1280.0 / 12.0));
    near("PTCH raw 127 (folded)", hz(0x7f00, 64, 3), c3 * pow(2.0, (0x7f00 - 0x4000) / 1280.0 / 12.0));
    near("LFO fraction: half a semitone", hz(0x4000 + 0x280, 64, 3), c3 * pow(2.0, 0.5 / 12.0));
    near("LFO fraction: a tenth of a step", hz(0x4000 + 0x1a, 64, 3), c3 * pow(2.0, 0x1a / 1280.0 / 12.0));
    near("FINE +64", hz(0x4000, 127, 3), c3 * pow(2.0, 63 / 1200.0));
    near("FINE -64", hz(0x4000, 0, 3), c3 * pow(2.0, -64 / 1200.0));
    for (int o = -3; o <= 3; ++o) {
        char what[64]; snprintf(what, sizeof what, "OCT %+d", o);
        near(what, hz(0x4000, 64, (uint8_t)(3 + o)), c3 * pow(2.0, o));
    }
    near("OCT clamped at +3", hz(0x4000, 64, 127), c3 * 8);
    printf("C3 at PTCH 0: %.3f Hz; range at OCT -3..+3 with PTCH -64..+63: %.1f Hz to %.0f Hz\n",
           hz(0x4000, 64, 3), hz(0x0000, 64, 0), hz(0x7f00, 64, 6));

    const uint8_t src[6] = { 64, 11, 22, 33, 44, 55 }, setup[6] = { 60, 66, 77, 100, 88, 99 };
    WaveControls c;
    wave_controls_of(&c, WAVE_SAW, src, setup);
    CHECK(c.model == WAVE_SAW && c.det == 11 && c.uni == 22 && c.wide == 33 && c.sub == 44 && c.sub2 == 55 &&
          c.drive == 77 && c.rtrg == 127, "SAW mapping");
    wave_controls_of(&c, WAVE_PULSE, src, setup);
    CHECK(c.model == WAVE_PULSE && c.pw == 11 && c.pwm == 22 && c.pws == 33 && c.sub == 44 && c.sub2 == 55 &&
          c.drive == 77 && c.det == 88 && c.uni == 99, "PULSE mapping");
    wave_controls_of(&c, WAVE_ENS, src, setup);
    CHECK(c.model == WAVE_ENS && c.note[0] == 51 && c.note[1] == 62 && c.note[2] == 73 && c.pw == 44 &&
          c.chor == 55 && c.sub == 88 && c.sub2 == 99 && c.drive == 77, "ENS mapping");
    wave_controls_of(&c, WAVE_MORPH, src, setup);
    CHECK(c.model == WAVE_MORPH && c.table == 11 && c.mix == 22 && c.wav2 == 33 && c.wid == 44 && c.fade == 55 &&
          c.bit1 == 88 && c.bit2 == 99 && c.drive == 77 && c.sub == 0 && c.sub2 == 0, "MORPH mapping");
    wave_controls_of(&c, WAVE_CHOIR, src, setup);
    CHECK(c.model == WAVE_CHOIR && c.note[0] == 51 && c.note[1] == 62 && c.note[2] == 73 && c.table == 44 &&
          c.chor == 55 && c.sub == 88 && c.sub2 == 99 && c.drive == 77, "CHOIR mapping");
    /* A track just switched to a model holds its page's defaults (machine.c's slots): the engine's defaults. */
    const uint8_t morph_src[6] = { 64, 8, 64, 24, 0, 0 }, choir_src[6] = { 64, 24, 24, 24, 108, 64 }, plain[6] = { 64, 3, 64, 0, 0, 0 };
    wave_controls_of(&c, WAVE_MORPH, morph_src, plain);
    CHECK(!memcmp(&c, &wave_defaults[WAVE_MORPH], sizeof c), "MORPH's page defaults are not the engine's");
    wave_controls_of(&c, WAVE_CHOIR, choir_src, plain);
    CHECK(!memcmp(&c, &wave_defaults[WAVE_CHOIR], sizeof c), "CHOIR's page defaults are not the engine's");
    const uint8_t chord[6] = { 64, 24, 31, 48, 0, 0 };
    wave_controls_of(&c, WAVE_ENS, chord, setup);
    CHECK(c.note[0] == 64 && c.note[1] == 71 && c.note[2] == 88, "NOT 24 is off, 31 is +7, 48 is +24");
    const uint8_t off[6] = { 64, 3, 64, 0, 0, 0 }, on[6] = { 64, 3, 64, 1, 0, 0 };
    wave_controls_of(&c, WAVE_SAW, src, off);
    CHECK(c.rtrg == 0, "RTRG 0 is off");
    wave_controls_of(&c, WAVE_SAW, src, on);
    CHECK(c.rtrg == 127, "RTRG 1 is on");
    const uint8_t wild[6] = { 200, 200, 200, 200, 200, 200 };
    wave_controls_of(&c, 9, wild, wild);
    CHECK(c.model == WAVE_SAW && c.det == 127 && c.drive == 127, "out-of-range model and bytes");
    printf(failures ? "%d FAILED\n" : "all checks pass\n", failures);
    return failures != 0;
}
