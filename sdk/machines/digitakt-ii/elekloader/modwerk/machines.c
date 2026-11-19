/* SPDX-License-Identifier: GPL-3.0-or-later */
#include <mk2/machines.h>

const struct dt2_machine *dt2_machine_at(
    uint32_t type, const struct dt2_machine *const machines[DT2_MACHINE_COUNT])
{
    if (type < DT2_MACHINE_FIRST || type > DT2_MACHINE_LAST) {
        return 0;
    }
    for (uint32_t i = 0; i < DT2_MACHINE_COUNT && machines[i]; ++i) {
        const struct dt2_machine *machine = machines[i];
        if (machine->type == type) {
            return machine->stands_for < DT2_MACHINE_FIRST ? machine : 0;
        }
    }
    return 0;
}

extern const struct dt2_machine *const core_machines[DT2_MACHINE_COUNT];

/* The stock type an added machine borrows, or -1 for a stock type or an empty entry. */
int32_t core_machine_stands_for(uint32_t type)
{
    const struct dt2_machine *machine = dt2_machine_at(type, core_machines);
    return machine ? (int32_t)machine->stands_for : -1;
}

/* The SRC page's per-type byte (the sample slot parameter's code, 0xcd for SAMPLE, 0 for none) from the stock table at
 * 0x401eda30, which the SRC page reads at seven places for types 0-6 only, answering 0 above. An added machine answers
 * as its stand-in, so its sample list scrolls and chooses (machines-entry.s, SLOT_ENTRY). */
#define SAMPLE_SLOT_CODES ((const volatile uint8_t *)0x401eda30u)

uint32_t core_machine_sample_slot(uint32_t type)
{
    if (type >= DT2_MACHINE_FIRST) {
        const int32_t stands_for = core_machine_stands_for(type);
        if (stands_for < 0) {
            return 0;
        }
        type = (uint32_t)stands_for;
    }
    return SAMPLE_SLOT_CODES[type];
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
    for (uint32_t type = DT2_MACHINE_FIRST; type <= DT2_MACHINE_LAST; ++type) {
        added += dt2_machine_at(type, core_machines) != 0;
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
    uint32_t next = count;
    for (uint32_t type = DT2_MACHINE_FIRST; type <= DT2_MACHINE_LAST; ++type) {
        if (dt2_machine_at(type, core_machines)) {
            types[next++] = type;
        }
    }
    list->begin = types;
    list->end = types + count + added;
    list->capacity = list->end;
}

/* A sound's stored machine type as a load keeps it: stock types and 0xff as stock does, an added type
 * whose machine is installed, and SAMPLE (0) for anything else, as the stock OS does. */
uint32_t core_machine_kit_type(uint32_t stored)
{
    uint32_t type = stored & 0xff;
    if ((uint8_t)(type + 1) < DT2_MACHINE_FIRST + 1) {
        return type;
    }
    return dt2_machine_at(type, core_machines) ? type : 0;
}

/* One of a machine's strings (DT2_MACHINE_NAME, _SHORT or _MENU); call only for a type
 * core_machine_stands_for answers. */
const char *core_machine_string(uint32_t type, uint32_t field)
{
    const struct dt2_machine *machine = dt2_machine_at(type, core_machines);
    return machine && field <= DT2_MACHINE_MENU ? machine->strings[field] : 0;
}
