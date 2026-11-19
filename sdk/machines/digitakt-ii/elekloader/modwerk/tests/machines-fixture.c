/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Development base only: one added machine (type 7) that stands for SAMPLE (type 0), with its own knob names. */
#include <mk2/machines.h>

const struct dt2_machine dt2_test_machine = {
    .type = 7,
    .stands_for = 0,
    .strings = { "Testgrain", "TGR", 0 },
    .knobs = {
        { "Test Mode", "TMOD" },
        { "Test Size", "TSIZ" },
        { "Test Position", "TPOS" },
        { "Test Length", "TLEN" },
        { "Test Spread", "TSPR" },
    },
};
