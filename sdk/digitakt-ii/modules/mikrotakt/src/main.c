/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Mikrotakt: a grain sampler machine for the Digitakt II.
 *
 * Machine type 7 (claimed as machine-id digitakt-ii/7; kits save it). It stands for SAMPLE (type 0), so the stock
 * voice setup loads its sample and positions, and the base sends its voices to Mikrotakt's own sound-chip player
 * (src/player.sharc, the package's build.dt2_sharc part), which writes the grains into each voice's slot. The stock
 * filter, amp envelope, LFO and level then shape them as on any machine.
 *
 * Knobs are SAMPLE's parameters under Mikrotakt's names (the base's knob names), so they keep SAMPLE's job for the
 * play head as well: C SIZE (SAMPLE's crossfade, unused by a one-shot sample), E POS (where the play head starts),
 * F LEN (how long it runs), G SPRD (the grains' random spread; SAMPLE's loop position, which matters only when the
 * play mode loops). B stays SAMPLE's play mode until MODE is wired to it.
 */
#include <mk2/machines.h>

const struct dt2_machine mikrotakt_machine = {
    .type = 7,
    .stands_for = 0,
    .strings = { "Mikrotakt", "MKT", 0 },
    .knobs = {
        [1] = { "Grain Size", "SIZE" },
        [2] = { "Position", "POS" },
        [3] = { "Length", "LEN" },
        [4] = { "Spread", "SPRD" },
    },
};
