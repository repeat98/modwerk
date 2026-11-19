/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Parameter rows for added machines' knobs (OS 1.17).
 *
 * The OS describes every knob with a 0x3c-byte row of a table of 275 rows at 0x4020f59c, reached by 56 absolute
 * references and bounded by 56 checks against 275 or 274. The table has no spare rows for new machines, so the base
 * keeps its own copy, core_params: at boot, before the OS reads it (core_boot_init, from core.s's .boot), it copies
 * the stock rows from the running image and appends DT2_MACHINE_KNOBS rows per added machine type. base.json points
 * every reference at the copy and raises every bound by the rows added, except the three loops that walk every row
 * (0x4003d98e, 0x4004ffc2, 0x400dab7a): they stay at the stock 275, so the per-type and MIDI tables they build never
 * take an added row (the MIDI-map builder would file it under its owner and replace the stand-in's own knob). A row
 * is built from the stock SAMPLE level row (a plain 0-127 knob): the knob's own name, label and range, the sound slot
 * it edits, the stand-in machine as its owner (the value path dispatches on the owner; an unknown owner faults) and
 * no MIDI CC or NRPN.
 */
#include <stdint.h>
#include <mk2/machines.h>

#define STOCK_PARAMS ((const uint32_t *)0x4020f59c)
#define PARAM_ROWS 275
#define ROW_WORDS 15                       /* 0x3c bytes */
#define TEMPLATE_ROW 0xd1                  /* SAMPLE's Sample Level: 0-127, default 100 */
#define ADDED_OWNER 0x40

enum { ADDED_ROWS = DT2_MACHINE_COUNT * DT2_MACHINE_KNOBS };

uint32_t core_params[(PARAM_ROWS + ADDED_ROWS) * ROW_WORDS];

static const uint8_t KNOB_SLOT[DT2_MACHINE_KNOBS] = { 26, 27, 31, 32, 33 };
/* Knob positions A-H in a descriptor's eight codes for the five knobs: B, C, E, F, G. */
static const uint8_t KNOB_POSITION[DT2_MACHINE_KNOBS] = { 1, 2, 4, 5, 6 };

extern const struct dt2_machine *const core_machines[DT2_MACHINE_COUNT];

static uint32_t added_code(uint32_t type, uint32_t knob)
{
    return PARAM_ROWS + (type - DT2_MACHINE_FIRST) * DT2_MACHINE_KNOBS + knob;
}

void core_boot_init(void)
{
    for (uint32_t i = 0; i < PARAM_ROWS * ROW_WORDS; ++i) {
        core_params[i] = STOCK_PARAMS[i];
    }
    for (uint32_t type = DT2_MACHINE_FIRST; type <= DT2_MACHINE_LAST; ++type) {
        const struct dt2_machine *machine = dt2_machine_at(type, core_machines);
        for (uint32_t knob = 0; knob < DT2_MACHINE_KNOBS; ++knob) {
            uint32_t *row = &core_params[added_code(type, knob) * ROW_WORDS];
            const uint32_t *template = &STOCK_PARAMS[TEMPLATE_ROW * ROW_WORDS];
            for (uint32_t w = 0; w < ROW_WORDS; ++w) {
                row[w] = template[w];
            }
            row[0] = machine ? machine->stands_for : 0;
            row[1] = KNOB_SLOT[knob];
            row[6] = 0xffffffff;           /* +0x18 CC and +0x1a: none */
            row[7] = 0xffffffff;           /* +0x1c NRPN: none */
            const struct dt2_machine_knob *k = machine ? &machine->knobs[knob] : 0;
            if (k && k->name) {
                row[2] = (uint32_t)k->min << 8;
                row[3] = (uint32_t)k->max << 8;
                row[4] = (uint32_t)k->def << 8;
                row[10] = (uint32_t)k->name;
                row[12] = (uint32_t)(k->label ? k->label : k->name);
            }
        }
    }
}

/* The parameter code an added machine's knob at sound slot `slot` uses, or -1 to answer as the stand-in. */
int32_t core_machine_slot_code(uint32_t slot, uint32_t type)
{
    const struct dt2_machine *machine = dt2_machine_at(type, core_machines);
    if (!machine) {
        return -1;
    }
    for (uint32_t knob = 0; knob < DT2_MACHINE_KNOBS; ++knob) {
        if (KNOB_SLOT[knob] == slot && machine->knobs[knob].name) {
            return (int32_t)added_code(type, knob);
        }
    }
    return -1;
}

/* An added machine's descriptor: the stand-in's 44-byte descriptor with the five knobs' codes replaced, built on
 * first use (after the OS has built its own descriptors). */
extern const uint32_t *core_stock_descriptor(uint32_t type);
static uint32_t descriptors[DT2_MACHINE_COUNT][11];
static uint8_t built[DT2_MACHINE_COUNT];

const uint32_t *core_machine_descriptor(uint32_t type)
{
    const struct dt2_machine *machine = dt2_machine_at(type, core_machines);
    if (!machine) {
        return 0;
    }
    uint32_t n = type - DT2_MACHINE_FIRST;
    if (!built[n]) {
        const uint32_t *stock = core_stock_descriptor(machine->stands_for);
        for (uint32_t w = 0; w < 11; ++w) {
            descriptors[n][w] = stock[w];
        }
        for (uint32_t knob = 0; knob < DT2_MACHINE_KNOBS; ++knob) {
            if (machine->knobs[knob].name) {
                descriptors[n][2 + KNOB_POSITION[knob]] = added_code(type, knob);
            }
        }
        built[n] = 1;
    }
    return descriptors[n];
}
