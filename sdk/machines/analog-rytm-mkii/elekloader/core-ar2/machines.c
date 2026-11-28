// SPDX-License-Identifier: GPL-2.0-or-later
// Analog Rytm core (Modwerk): machines modules add in the hidden slots 34..43 (analog-rytm-mk2/machines.h).
//
// The hook bus calls core_boot_init once at boot, after the image copy and the .bss clear and before the OS reads
// the machine tables. For each slot, the first core_machines entry naming it writes its engine, home track, voices
// and names into the machine tables, and its knobs into the slot's parameter records (sound indices 9..16). A
// record's id, sound index, MIDI CC and NRPN stay as stock has them. Addresses from base.json common.cflags.

#include <stdint.h>
#include "analog-rytm-mk2/machines.h"

#if !defined(CORE_NAMES_AT) || !defined(CORE_AVAIL_AT) || !defined(CORE_ENGINES_AT) || !defined(CORE_RECORDS_AT)
#error "machines.c: the machine tables' addresses (CORE_*_AT) come from base.json common.cflags"
#endif

#define FIRST_SLOT 34
#define LAST_SLOT 43
#define RECORDS 469
#define RECORD 0x34

extern const struct core_machine *const core_machines[];

void core_boot_init(void)
{
    volatile const char **names = (volatile const char **)(CORE_NAMES_AT);
    volatile int8_t *avail = (volatile int8_t *)(CORE_AVAIL_AT);
    volatile core_engine *engines = (volatile core_engine *)(CORE_ENGINES_AT);
    unsigned taken = 0;
    for (const struct core_machine *const *entry = core_machines; *entry; entry++) {
        const struct core_machine *m = *entry;
        int32_t slot = m->slot;
        if (slot < FIRST_SLOT || slot > LAST_SLOT || taken & 1u << (slot - FIRST_SLOT))
            continue;
        taken |= 1u << (slot - FIRST_SLOT);
        engines[slot] = m->engine;
        avail[2 * slot] = m->home;
        avail[2 * slot + 1] = (int8_t)m->voices;
        names[2 * slot] = m->name;
        names[2 * slot + 1] = m->label;
        for (int id = 0; id < RECORDS; id++) {
            volatile int32_t *rec = (volatile int32_t *)(CORE_RECORDS_AT + RECORD * id);
            int32_t index = rec[1];
            if (rec[0] != slot || index < 9 || index > 16)
                continue;
            const struct core_machine_knob *knob = &m->knobs[index - 9];
            if (!knob->name)
                continue;
            rec[2] = (int32_t)knob->min << 8;
            rec[3] = (int32_t)knob->max << 8;
            rec[4] = (int32_t)knob->def << 8;
            rec[5] = knob->centred;
            rec[10] = (int32_t)(uintptr_t)knob->name;
            rec[11] = (int32_t)(uintptr_t)m->name;
            rec[12] = (int32_t)(uintptr_t)knob->label;
        }
    }
}
