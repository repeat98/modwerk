/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Modwerk's Analog Rytm MKII base: digital voices. A machine module that makes its sound
 * in software (as stock's CP CLASSIC does) declares one struct mw_voice and gives the
 * base its sound, a block at a time; the base does the rest on every physical voice:
 *
 *   - the trig: a new hit (state and timer reset together), the voice's analog circuit
 *     silenced with stock's own routine, the hit's velocity and the note's pitch ratio;
 *   - the knobs: the eight live words, read signed and held to 0..127;
 *   - the stream: LEV (squared, as stock's levels) into the voice's digital stream, which
 *     the mixer sends through the voice's own filter, amp and overdrive; cleared after the
 *     mixer each block, so a voice another machine takes over plays no stale block;
 *   - the end of a hit: after 64 blocks below -102 dB (before LEV) render stops;
 *   - the type: up to eight variants of the machine (808 / 909, say), a 3-bit field of
 *     the sound. A tap of one encoder on the machine's SYNTH page steps it, that knob's
 *     label follows it, the type's name shows in the page's bottom bar, and the base
 *     keeps each track's type exact through ev_sound_applied (kit and sound loads, a
 *     trig's sound lock);
 *   - the page: the slot's hidden records keep stock's widgets (a waveform switch, a
 *     transient picker); the base gives every knob but LEV a plain or centred dial
 *     (core_machine_knob.centred) and a number for its value;
 *   - a CPU meter per machine (mw_voice_meter), on the unit's own clock.
 *
 * In the module:
 *
 *     static void my_engine(int32_t v, void *frame, uint16_t *blk, int32_t pitch)
 *     { mw_voice_run(&my_voice, v, frame, blk, pitch); }
 *     const struct core_machine my_machine = { SLOT, my_engine, ... };     (machines.h)
 *     const struct mw_voice my_voice = { MW_VOICE_ABI, SLOT, ... };
 *
 * and in build.json contribute both: {"to": "core_machines", ...my_machine} and
 * {"to": "mw_voices", ...my_voice}. hit and render run in the audio interrupt, with the
 * EMAC in fractional mode (MACSR 0x20) and all four accumulators clear; the base saves stock's EMAC state
 * around them. Keep them short and free of calls that can block. Helpers: modwerk/dsp.h. */
#ifndef MODWERK_VOICE_H
#define MODWERK_VOICE_H

#include <stdint.h>

#define MW_VOICE_ABI 1
#define MW_VOICE_FRAMES 32      /* a block, at 48 kHz */
#define MW_VOICE_TYPES 8        /* at most, in the sound's 3-bit field */

/* What a hit and a block play with. */
struct mw_voice_play {
    uint8_t knob[8];            /* sound indices 9..16 (knob[0] is LEV), 0..127 */
    uint8_t velocity;           /* the hit's, 1..127 */
    uint8_t type;               /* 0..types - 1 */
    uint8_t track;              /* 0..11 */
    uint8_t pad;
    int32_t ratio;              /* the note's pitch against 60, Q28 (1.0 = 1 << 28), 1/16 to about 7.6 (-48 to +35 semitones) */
};

struct mw_voice {
    uint16_t abi;               /* MW_VOICE_ABI */
    uint8_t slot;               /* the core_machines slot, 34..43 */
    uint8_t types;              /* 0 or 1: one sound; 2..8: variants, stepped by a tap */
    uint8_t tap_encoder;        /* the encoder whose tap steps the type, 0..7 (A..H as the page shows them) */
    uint8_t tap_index;          /* the sound index that encoder shows, 9..16: its label follows the type */
    uint16_t pad;
    const char *const *labels;  /* types x {short, long}: the tapped knob's names for each type */
    const char *const *names;   /* types: each type's name, shown in the SYNTH page's bottom bar ("808") */
    /* A new hit on voice v (0..7), before its first block. */
    void (*hit)(int v, const struct mw_voice_play *p);
    /* One block of voice v: 32 samples into out, Q31 at full scale, before LEV. */
    void (*render)(int v, const struct mw_voice_play *p, int32_t *out);
};

/* The engine's whole body: call it from the machine's core_machines engine. */
void mw_voice_run(const struct mw_voice *mv, int32_t v, void *frame, uint16_t *blk, int32_t pitch);

/* The render's cost per machine slot (34..43 at [slot - 34]): blocks, DTIM0 ticks (88000
 * a block) and the dearest block, since boot. marker is 0xab0cc0de. */
struct mw_voice_meter { uint32_t blocks, ticks, max; };
struct mw_voice_meters { uint32_t marker; struct mw_voice_meter m[10]; };
extern volatile struct mw_voice_meters mw_voice_meter;

#endif
