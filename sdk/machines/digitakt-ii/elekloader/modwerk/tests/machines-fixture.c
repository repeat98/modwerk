/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Development base only: one added machine (type 7) that stands for SAMPLE (type 0) with five knobs of its own. */
#include <mk2/machines.h>

const struct dt2_machine dt2_test_machine = {
    .type = 7,
    .stands_for = 0,
    .strings = { "Testgrain", "TGR", 0 },
    .knobs = {
        { "Grain Mode", "MODE", 0, 3, 0, 0 },
        { "Position", "POS", 0, 127, 0, 0 },
        { "Grain Size", "SIZE", 0, 127, 64, 0 },
        { "Density", "DENS", 0, 127, 32, 0 },
        { "Spread", "SPRD", 0, 127, 0, 0 },
    },
};
