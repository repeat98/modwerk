/* SPDX-License-Identifier: MIT
 * SYNTIZ's panel as the engine reads it: the track's twelve knob bytes per model, and the played pitch.
 * No stock address here; the machine glue passes the bytes and the stock pitch curve in. */
#ifndef WAVE_MACHINE_MAP_H
#define WAVE_MACHINE_MAP_H
#include <stdint.h>
#include "engine.h"

/* SRC A-F and SRC SETUP A-F, raw 0..127 as the Part and the live lane hold them.
 *            SRC  A     B     C     D     E     F        SETUP A     B    C     D     E     F
 *   SAW           PTCH  DET   UNI   WIDE  SUB   SUB2           FINE  OCT  DRIV  RTRG  -     -
 *   PULSE         PTCH  PW    PWM   PWS   SUB   SUB2           FINE  OCT  DRIV  RTRG  DET   UNI
 *   ENS           PTCH  NOT2  NOT3  NOT4  SHAP  CHOR           FINE  OCT  DRIV  RTRG  SUB   SUB2
 *   TABLE         PTCH  TABL  MORF  MSWP  SYNC  SUB            FINE  OCT  DRIV  RTRG  SUB2  -
 *   MORPH         PTCH  WAV1  MIX   WAV2  WID   TIME           FINE  OCT  DRIV  RTRG  BIT1  BIT2
 *   CHOIR         PTCH  NOT2  NOT3  NOT4  TABL  CHOR           FINE  OCT  DRIV  RTRG  SUB   SUB2
 * FINE: 64 = 0, +/-64 cents. OCT: 0..6, 3 = 0 (+/-3 octaves). RTRG: 0 off, else on (a two-state switch).
 * NOT2-4: 0..48, 24 = off, else -24..+24 semitones. */
void wave_controls_of(WaveControls *c, unsigned model, const uint8_t src[6], const uint8_t setup[6]);

/* The base increment (turns a sample, 2^32 = a cycle) for the PTCH word (the raw byte << 8 with locks,
 * LFOs and scenes applied, fractions in the low byte; FLEX's scale, five raw units a semitone, 0x4000
 * neutral), FINE and OCT bytes. curve is stock's 2^(x/12) table, longs Q26, indexed by the word >> 5
 * over 0x0400..0x4000 (one octave, 1.0 to 2.0). PTCH neutral at OCT 0 plays WAVE_ROOT_HZ. */
#define WAVE_ROOT_HZ 130.8128               /* C3 */
#define WAVE_ROOT_INC 12740059u             /* C3 / 44100 * 2^32 */
uint32_t wave_increment(uint16_t ptch, uint8_t fine, uint8_t oct, const volatile uint32_t *curve);
#endif
