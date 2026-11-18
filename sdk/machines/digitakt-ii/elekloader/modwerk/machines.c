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

/* The machine menu's list: the stock getter fills a vector of machine types ({begin, end, capacity});
 * the base appends the added types after the stock ones. The OS builds the list at start-up; the stock
 * buffer it replaces is a few words and is not freed. */
struct type_vector {
    uint32_t *begin, *end, *capacity;
};

extern void *OP_NEW(uint32_t size);

void core_machine_list_extend(struct type_vector *list)
{
    uint32_t added = 0;
    while (added < DT2_MACHINE_COUNT && dt2_machine_at(DT2_MACHINE_FIRST + added, core_machines)) {
        ++added;
    }
    if (!added || !list || !list->begin) {
        return;
    }
    uint32_t count = (uint32_t)(list->end - list->begin);
    uint32_t *types = OP_NEW((count + added) * sizeof(uint32_t));
    if (!types) {
        return;
    }
    for (uint32_t i = 0; i < count; ++i) {
        types[i] = list->begin[i];
    }
    for (uint32_t i = 0; i < added; ++i) {
        types[count + i] = DT2_MACHINE_FIRST + i;
    }
    list->begin = types;
    list->end = types + count + added;
    list->capacity = list->end;
}

/* One of a machine's strings (DT2_MACHINE_NAME, _SHORT or _MENU); call only for a type
 * core_machine_stands_for answers. */
const char *core_machine_string(uint32_t type, uint32_t field)
{
    const struct dt2_machine *machine = dt2_machine_at(type, core_machines);
    return machine && field <= DT2_MACHINE_MENU ? machine->strings[field] : 0;
}
