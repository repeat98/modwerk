/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Development base only: one added machine (type 7) that stands for SAMPLE (type 0). */
#include <mk2/machines.h>

const struct dt2_machine dt2_test_machine = {
    .type = 7,
    .stands_for = 0,
    .strings = { "Testgrain", "TGR", 0 },
    /* Own knobs (MODE, POS, SIZE, DENS, SPRD) wait for the parameter table copy to work (MACHINES.md). */
};
