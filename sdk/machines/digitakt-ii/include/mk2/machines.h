/* SPDX-License-Identifier: GPL-3.0-or-later */
#ifndef MODWERK_DT2_MACHINES_H
#define MODWERK_DT2_MACHINES_H

#include <stdint.h>

/* Machines added after the seven stock types. The linker's collection index owns the type: entry n of
 * core_machines is machine type DT2_MACHINE_FIRST + n. The table ends at its first null entry. */
enum {
    DT2_MACHINE_FIRST = 7,
    DT2_MACHINE_COUNT = 4,
};

/* Draft record. stands_for names the stock type (0-6) whose descriptor and parameter codes the machine
 * borrows until the base has its own parameter rows. */
struct dt2_machine {
    uint32_t stands_for;
};

/* The record for a machine type, or 0 when the type is stock or has no complete record. */
const struct dt2_machine *dt2_machine_at(
    uint32_t type, const struct dt2_machine *const machines[DT2_MACHINE_COUNT]);

#endif
