/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Modwerk's Analog Rytm MKII base: the amp envelope's record (base/amp.s). Each audio block stock's
 * amp_env_commands works out every voice's amp record, a rate word and a level word; the base takes the four
 * stores that send it to the amp, so no module patches them. To rewrite or follow the record, subscribe an
 * assembly entry to ev_amp_record (build.json: "subscribe": [{"event": "ev_amp_record", "fn": "my_amp",
 * "order": 50}]). The base calls each entry once a voice a block, lowest order first, with
 *     d0 the rate word, in and out          d2 the level word, in and out
 *     d3 the voice, 0..7                    a2 its state: +0 state, +4 hold counter (the entry may write +0)
 *     a3 the frame at its record            a4 its track's sound slice: +0 ATK, +2 HLD, +4 DEC
 * It may use d1, d4 and a0, keeps every other register and returns with rts. Order bands: 10-39 entries that
 * rewrite the record (a pre-fade), 60-89 entries that follow it (a level follower sees the final record),
 * 40-59 either. Keep an entry short: it runs for each of the eight voices every block. */
#ifndef MODWERK_AMP_H
#define MODWERK_AMP_H

#define MW_AMP_VOICES 8

#endif
