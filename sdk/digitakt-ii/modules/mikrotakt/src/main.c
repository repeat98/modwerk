/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Mikrotakt: a grain sampler machine for the Digitakt II.
 *
 * Machine type 7 (claimed as machine-id digitakt-ii/7; kits save it). It stands for SAMPLE (type 0), so the stock
 * voice setup loads its sample and positions, and the base sends its voices to Mikrotakt's own sound-chip player
 * (the package's build.dt2_sharc part), which writes the grains into each voice's slot. The stock filter, amp
 * envelope, LFO and level then shape them as on any machine.
 *
 * Until the base's own knob rows work (sdk/machines/digitakt-ii/elekloader/modwerk/MACHINES.md), the SRC page shows
 * SAMPLE's knobs: their values are the ones the grain player reads.
 */
#include <mk2/machines.h>

const struct dt2_machine mikrotakt_machine = {
    .type = 7,
    .stands_for = 0,
    .strings = { "Mikrotakt", "MKT", 0 },
};
