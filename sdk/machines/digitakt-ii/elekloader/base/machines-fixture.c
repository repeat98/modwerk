/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Development base only: one added machine (type 7) that stands for SAMPLE (type 0), with its own knob names and, on
 * knob B, its own value names. */
#include <mk2/machines.h>

static const char *const test_modes[] = { "TREV", "TREVL", "TFWDL", "TFWD", 0 };

const struct dt2_machine dt2_test_machine = {
    .type = 7,
    .stands_for = 0,
    .strings = { "Testgrain", "TGR", 0 },
    .knobs = {
        { "Test Mode", "TMOD", test_modes },
        { "Test Size", "TSIZ", 0 },
        { "Test Position", "TPOS", 0 },
        { "Test Length", "TLEN", 0 },
        { "Test Spread", "TSPR", 0 },
    },
};
