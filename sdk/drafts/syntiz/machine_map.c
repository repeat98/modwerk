/* SPDX-License-Identifier: MIT
 * SYNTIZ's panel as the engine reads it (machine_map.h). */
#include "machine_map.h"

static uint8_t raw(uint8_t v) { return v > 127u ? 127u : v; }

void wave_controls_of(WaveControls *c, unsigned model, const uint8_t src[6], const uint8_t setup[6])
{
    if (model >= WAVE_MODELS) model = WAVE_SAW;
    const uint8_t *from = (const uint8_t *)&wave_defaults[model];
    for (unsigned i = 0; i < sizeof *c; ++i) ((uint8_t *)c)[i] = from[i]; /* no memcpy in a module */
    c->drive = raw(setup[2]);
    c->rtrg = setup[3] ? 127u : 0u;
    switch (model) {
    case WAVE_PULSE:
        c->pw = raw(src[1]), c->pwm = raw(src[2]), c->pws = raw(src[3]), c->sub = raw(src[4]), c->sub2 = raw(src[5]);
        c->det = raw(setup[4]), c->uni = raw(setup[5]);
        break;
    case WAVE_ENS:
        for (unsigned k = 0; k < 3u; ++k) c->note[k] = src[1 + k] <= 48u ? (uint8_t)(src[1 + k] + 40u) : 64u;
        c->pw = raw(src[4]), c->chor = raw(src[5]);
        c->sub = raw(setup[4]), c->sub2 = raw(setup[5]);
        break;
    case WAVE_TABLE:
        c->table = raw(src[1]), c->morph = raw(src[2]), c->msweep = raw(src[3]), c->sync = raw(src[4]), c->sub = raw(src[5]);
        c->sub2 = raw(setup[4]);
        break;
    case WAVE_MORPH:
        c->table = raw(src[1]), c->mix = raw(src[2]), c->wav2 = raw(src[3]), c->wid = raw(src[4]), c->fade = raw(src[5]);
        c->bit1 = raw(setup[4]), c->bit2 = raw(setup[5]);
        break;
    case WAVE_CHOIR:
        for (unsigned k = 0; k < 3u; ++k) c->note[k] = src[1 + k] <= 48u ? (uint8_t)(src[1 + k] + 40u) : 64u;
        c->table = raw(src[4]), c->chor = raw(src[5]);
        c->sub = raw(setup[4]), c->sub2 = raw(setup[5]);
        break;
    default:
        c->det = raw(src[1]), c->uni = raw(src[2]), c->wide = raw(src[3]), c->sub = raw(src[4]), c->sub2 = raw(src[5]);
        break;
    }
}

/* As stock's rate arithmetic (FM Synth's po_rate and po_rate_fold, poly.s): the word folded by octaves into
 * the curve's window 0x0400..0x7c00, the lower half read halved, the upper half 0x3c00 lower; between two
 * entries the 5-bit fraction interpolates. Then C3 times that rate, FINE (linear in cents: within 1.2 cents
 * at +/-64), OCT. */
uint32_t wave_increment(uint16_t ptch, uint8_t fine, uint8_t oct, const volatile uint32_t *curve)
{
    int32_t w = ptch, o = (int32_t)oct - 3;
    if (o > 3) o = 3; else if (o < -3) o = -3;
    while (w > 0x7c00) w -= 0x3c00, ++o;
    while (w < 0x0400) w += 0x3c00, --o;
    unsigned half = w <= 0x4000;
    if (!half) w -= 0x3c00;
    uint32_t t0 = curve[w >> 5], t1 = curve[(w >> 5) + 1];
    uint32_t r = (t0 + ((t1 - t0) >> 5) * (uint32_t)(w & 31)) >> half; /* Q26, 0.5..2.0 */
    uint32_t inc = ((WAVE_ROOT_INC >> 8) * (r >> 11)) >> 7;             /* both factors below 2^16 */
    int32_t cents = (int32_t)raw(fine) - 64;
    inc = (uint32_t)((int32_t)inc + (((int32_t)(inc >> 16) * cents * 606) >> 4));
    for (; o > 0; --o) {
        if (inc >= 0x80000000u) return 0xffffffffu;                     /* past Nyquist: the engine is silent */
        inc <<= 1;
    }
    return o < 0 ? inc >> -o : inc;
}
