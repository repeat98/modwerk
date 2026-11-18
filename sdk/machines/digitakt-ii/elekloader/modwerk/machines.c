/* SPDX-License-Identifier: GPL-3.0-or-later */
#include <mk2/machines.h>

const struct dt2_machine *dt2_machine_at(
    uint32_t type, const struct dt2_machine *const machines[DT2_MACHINE_COUNT])
{
    uint32_t slot = type - DT2_MACHINE_FIRST;
    if (slot >= DT2_MACHINE_COUNT) {
        return 0;
    }
    for (uint32_t i = 0; i <= slot; ++i) {
        if (!machines[i]) {
            return 0;
        }
    }
    const struct dt2_machine *machine = machines[slot];
    return machine->stands_for < DT2_MACHINE_FIRST ? machine : 0;
}

extern const struct dt2_machine *const core_machines[DT2_MACHINE_COUNT];

/* The stock type an added machine borrows, or -1 for a stock type or an empty entry. */
int32_t core_machine_stands_for(uint32_t type)
{
    const struct dt2_machine *machine = dt2_machine_at(type, core_machines);
    return machine ? (int32_t)machine->stands_for : -1;
}

/* One of a machine's strings (DT2_MACHINE_NAME, _SHORT or _MENU); call only for a type
 * core_machine_stands_for answers. */
const char *core_machine_string(uint32_t type, uint32_t field)
{
    const struct dt2_machine *machine = dt2_machine_at(type, core_machines);
    return machine && field <= DT2_MACHINE_MENU ? machine->strings[field] : 0;
}
