/* SPDX-License-Identifier: GPL-2.0-or-later */
/* Analog Rytm MKII core (Modwerk): machines a module adds in the hidden slots 34..43.
 *
 * A module contributes a pointer to a struct core_machine to the table core_machines (build.json). At boot the core
 * takes the first entry for each slot and writes its engine, voices and names into the machine table, and its knobs
 * into the slot's parameter records. */
#ifndef ELEKLOADER_AR2_MACHINES_H
#define ELEKLOADER_AR2_MACHINES_H

#include <stdint.h>

/* Called from the audio interrupt once per 32-frame block for each physical voice that runs the machine. frame is
 * the analog control frame; blk the track's parameter block, word k holding sound index 9 + k. */
typedef void (*core_engine)(int32_t voice, void *frame, uint16_t *blk, int32_t pitch);

/* One of the eight knobs (sound indices 9..16, LEV first). name 0 leaves the stock record as it is. */
struct core_machine_knob {
    const char *name;
    const char *label;
    uint8_t min, max;
    uint8_t def;
    uint8_t centred;
};

struct core_machine {
    int32_t slot;                         /* 34..43 */
    core_engine engine;
    int8_t home;                          /* home track: 0 BD, 1 SD, 4 BT, -1 none */
    uint8_t voices;                       /* CORE_VOICE_* bits: the physical voices that may run it */
    uint16_t pad;
    const char *name;
    const char *label;                    /* four letters */
    struct core_machine_knob knobs[8];
};

/* Physical voices, bit v for voice v. */
#define CORE_VOICE_BD 0x01
#define CORE_VOICE_BT 0x02
#define CORE_VOICE_SD 0x04
#define CORE_VOICE_LT 0x08
#define CORE_VOICE_HH 0x10
#define CORE_VOICE_MT 0x20
#define CORE_VOICE_CY 0x40
#define CORE_VOICE_RS 0x80

/* Stock engines, OS 1.74 MKII. */
#define CORE_ENGINE_BD_CLASSIC ((core_engine)0x401105c8)
#define CORE_ENGINE_SD_CLASSIC ((core_engine)0x401179bc)
#define CORE_ENGINE_BT_CLASSIC ((core_engine)0x4011b5a0)
#define CORE_ENGINE_XT_CLASSIC ((core_engine)0x4011b850)
#define CORE_ENGINE_DISABLE ((core_engine)0x40113f68)

#endif
