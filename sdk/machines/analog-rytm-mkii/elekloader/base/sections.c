// SPDX-License-Identifier: GPL-3.0-or-later
// Modwerk's Analog Rytm MKII base: the machine list's sections (the table mw_machine_sections).
//
// Stock OS 1.74 files each machine in the list under a section, a byte per machine id from a 34-byte table
// (MACHINE_SECTION_AT: ids 0..33), read by 0x400df664, which gives 0 to any higher id. So every mod machine
// (slots 34..43) sorts above the BD machines. Two comparators (0x400bdc5e, 0x400bde1c: the same code for two
// sorts) order the list by section; two SY machines they order by a map that knows SY DUAL VCO, SY CHIP and
// SY RAW only and throws (map::at) for any other id. The base takes all three entries: a machine module names
// its slot's section in mw_machine_sections, and its SY machines sort after stock's.
//
// An entry is four bytes, contributed as data with no relocation:
//   {"to": "mw_machine_sections", "order": 50, "data": "290b0000"}     slot 41 (0x29), section 11 (SY)
// A slot with no entry, or an entry naming a section stock does not file machines under, keeps 0 (the top of
// the list), as without the base. The first entry for a slot is the only one.

#include <stdint.h>

#define STOCK_SECTION ((const uint8_t *)MACHINE_SECTION_AT)
#define STOCK_LAST 33
#define SLOT_FIRST 34               // the mod machines' slots (core_machines)
#define SLOT_LAST 43
#define SECTION_SY 11
// The sections stock files machines under: BD 1, SD 2, CP 4, BT 5, RS 6, HH 7, CY 8, CB 9, UT 10, SY 11.
// 14 (DISABLE) and the unused 3, 12 and 13 are not offered.
#define OFFERED (1u << 1 | 1u << 2 | 1u << 4 | 1u << 5 | 1u << 6 | 1u << 7 | 1u << 8 | 1u << 9 | 1u << 10 | 1u << 11)

struct mw_machine_section {
    uint8_t slot;                   // 34..43; 0 ends the table
    uint8_t section;
    uint8_t pad[2];
};

extern const struct mw_machine_section mw_machine_sections[];

// Replaces 0x400df664: a machine's section. The id comes as a long; stock tests it unsigned, as here.
uint32_t mw_section_of(uint32_t id)
{
    const struct mw_machine_section *e;
    if (id <= STOCK_LAST)
        return STOCK_SECTION[id];
    if (id < SLOT_FIRST || id > SLOT_LAST)
        return 0;
    for (e = mw_machine_sections; e->slot; e++)
        if (e->slot == id)
            return e->section < 32 && (OFFERED >> e->section & 1) ? e->section : 0;
    return 0;
}

// Stock's order of its SY machines (the comparators' map): SY DUAL VCO, SY CHIP, SY RAW, then any mod machine.
static uint32_t sy_rank(uint32_t id)
{
    return id == 28 ? 0 : id == 29 ? 1 : id == 32 ? 2 : 3;
}

// Replaces both comparators: 1 when machine a sorts before machine b. For stock's machines it answers as they do.
uint32_t mw_section_before(uint32_t a, uint32_t b)
{
    uint32_t sa = mw_section_of(a), sb = mw_section_of(b);
    if (sa == SECTION_SY && sb == SECTION_SY)
        return sy_rank(a) < sy_rank(b);
    return sa < sb;
}
