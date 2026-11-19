/* SPDX-License-Identifier: GPL-3.0-or-later */
#ifndef MODWERK_DT2_MACHINES_H
#define MODWERK_DT2_MACHINES_H

#include <stdint.h>

/* Machines added after the seven stock types. Each record names its own machine type, a fixed number from
 * DT2_MACHINE_FIRST to DT2_MACHINE_LAST that kits save: claim it on the agent board (machine-id digitakt-ii/N) and
 * keep it once released. core_machines holds up to DT2_MACHINE_COUNT records and ends at its first null entry. */
enum {
    DT2_MACHINE_FIRST = 7,
    DT2_MACHINE_COUNT = 4,
    DT2_MACHINE_LAST = DT2_MACHINE_FIRST + DT2_MACHINE_COUNT - 1,
};

enum {
    DT2_MACHINE_NAME = 0,  /* shown in the SRC header and the machine menu, as "Oneshot" */
    DT2_MACHINE_SHORT = 1, /* up to four capitals, as "ONE" */
    DT2_MACHINE_MENU = 2,  /* a machine's own menu title, as "Slice Menu"; usually none */
};

/* Draft record. stands_for names the stock type (0-6) whose descriptor and parameter codes the machine
 * borrows until the base has its own parameter rows. strings[] follow the DT2_MACHINE_* order; a null
 * string is shown as none. */
struct dt2_machine {
    uint32_t type;
    uint32_t stands_for;
    const char *strings[3];
};

/* The record for a machine type, or 0 when the type is stock or no valid record names it. */
const struct dt2_machine *dt2_machine_at(
    uint32_t type, const struct dt2_machine *const machines[DT2_MACHINE_COUNT]);

#endif
