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

/* The five SRC knobs a machine names itself: B, C, E, F and G (A stays TUNE, D the sample slot, H the level).
 * Each is the stand-in machine's own parameter at that knob, shown under the machine's name while a track plays the
 * machine: its range, value, saving, trig locks, live recording, MIDI and the value the sound chip receives are the
 * stand-in's. Standing for SAMPLE: B play mode, C crossfade (slot 27, which SAMPLE does not show), E start,
 * F length, G loop position. */
enum {
    DT2_MACHINE_KNOBS = 5,
};

/* A knob: name as the popups show it, and label (up to four capitals) as the page shows it. A null name keeps the
 * stand-in machine's knob and name (for knob C on SAMPLE: no knob). */
struct dt2_machine_knob {
    const char *name;
    const char *label;
};

/* stands_for names the stock type (0-6) whose descriptor, voice setup and other knobs the machine borrows.
 * strings[] follow the DT2_MACHINE_* order; a null string is shown as none. */
struct dt2_machine {
    uint32_t type;
    uint32_t stands_for;
    const char *strings[3];
    struct dt2_machine_knob knobs[DT2_MACHINE_KNOBS];
};

/* The record for a machine type, or 0 when the type is stock or no valid record names it. */
const struct dt2_machine *dt2_machine_at(
    uint32_t type, const struct dt2_machine *const machines[DT2_MACHINE_COUNT]);

#endif
