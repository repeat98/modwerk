/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Modwerk's Analog Rytm MKII base: the amp envelope's record (base/amp.s). Each audio block stock's
 * amp_env_commands works out every voice's amp record, a rate word and a level word; the base takes the four
 * stores that send it to the amp, so no module patches them. Two ways in:
 *
 * - Hold a track silent: set its mw_amp_silence byte. Its voice fades to -128 (a ramp of about 4 ms) and stays
 *   there while stock's envelope keeps running underneath; with the byte 0 again the voice takes stock's record
 *   (an attack ramps up from where it is, a decay stays low). Write the bytes from the audio interrupt
 *   (ev_render_in or ev_render_out), the context the base reads them in; two modules holding one track each
 *   own a bit of its byte. mw_amp_silenced shows the voices held this block, a bit each.
 *
 * - Rewrite or follow the record: subscribe an assembly entry to ev_amp_record
 *   (build.json: "subscribe": [{"event": "ev_amp_record", "fn": "my_amp", "order": 50}]). The base calls each
 *   entry once a voice a block, after the silence, lowest order first, with
 *     d0 the rate word, in and out          d2 the level word, in and out
 *     d3 the voice, 0..7                    a2 its state: +0 state, +4 hold counter (the entry may write +0)
 *     a3 the frame at its record            a4 its track's sound slice: +0 ATK, +2 HLD, +4 DEC
 *   It may use d1, d4 and a0, keeps every other register and returns with rts. Order bands: 10-39 entries
 *   that rewrite the record (a pre-fade), 60-89 entries that follow it (a level follower sees the final
 *   record), 40-59 either. A rewriter leaves a voice whose bit is set in mw_amp_silenced held at -128.
 *   Keep an entry short: it runs for each of the eight voices every block. */
#ifndef MODWERK_AMP_H
#define MODWERK_AMP_H

#include <stdint.h>

#define MW_AMP_TRACKS 12
#define MW_AMP_VOICES 8

extern volatile uint8_t mw_amp_silence[MW_AMP_TRACKS];
extern volatile const uint8_t mw_amp_silenced;

#endif
