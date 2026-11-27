/* SPDX-License-Identifier: MIT
 * modules:check reads cx_machine.reserved[0] here. The shipped descriptor is cx_registration.s.
 * Set CX_CPU_RENDER_PERCENT from npm run device -- guard after measuring on a unit.
 */
#include <stdint.h>
#include "../../../machines/octatrack/include/modwerk_events.h"

#ifndef CX_CPU_RENDER_PERCENT
#define CX_CPU_RENDER_PERCENT 6
#endif

const struct modwerk_machine cx_machine = {
    .abi = MODWERK_MACHINE_ABI,
    .sig = { 'C', 'X' },
    .sig_lo = 1,
    .sig_hi = 1,
    .flags = MODWERK_MACHINE_PROTECT | MODWERK_MACHINE_SETUP_ALL |
        MODWERK_MACHINE_START | MODWERK_MACHINE_NATIVE_FLEX,
    .reserved = { CX_CPU_RENDER_PERCENT, 0 },
};