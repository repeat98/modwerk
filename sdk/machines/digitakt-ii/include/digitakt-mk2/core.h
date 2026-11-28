/* SPDX-License-Identifier: GPL-2.0-or-later */
/* Modwerk's Digitakt II core (OS 1.17): the kit data, project data and value rows a module may use. */
#ifndef MODWERK_DIGITAKT_MK2_CORE_H
#define MODWERK_DIGITAKT_MK2_CORE_H

#include <stdint.h>

/* The project's kits; kit n is pattern n's kit. */
#define CORE_KITS 128

/* A module's per-kit block: data holds CORE_KITS blocks of size bytes, kit n's at data + n * size. The core saves
 * them after each kit record's end mark (143 bytes for every module together, core_kitdata_room()), loads them back
 * and follows the firmware's kit copies. changed(kit, found) runs after kit's block was replaced, in any task;
 * found is 0 when nothing saved for this module was there (the block is then zero). Contribute a pointer to one to
 * core_kitdata. */
typedef struct {
    char tag[4];
    uint32_t size;
    void *data;
    void (*changed)(int kit, int found);
} core_kitdata_t;

/* A module's project block, saved in the project file's header gap; loaded(found) runs after every project load.
 * Contribute a pointer to one to core_projdata. */
typedef struct {
    char tag[4];
    uint32_t size;
    void *data;
    void (*loaded)(int found);
} core_projdata_t;

/* A PERSONALIZE or SETTINGS row showing label and, on the right, values[get()]; LEFT and RIGHT step it through
 * 0 .. count - 1 and call set. Value strings are drawn as a format: no '%'. */
typedef struct {
    const char *label;
    const char *const *values;
    uint32_t count;
    uint32_t (*get)(void);
    void (*set)(uint32_t value);
} core_value_t;

/* The kit on (the pattern on's), or -1 for none. */
int core_kit_on(void);
/* Bytes a kit record holds for every module's kitdata block together. */
uint32_t core_kitdata_room(void);
/* How often a save or load met bytes in the modules' areas that were not the core's (left as they were). Read only. */
extern volatile uint32_t core_store_conflicts;
/* Add a value row from an ev_personalize or ev_settings handler. */
void core_addvalue(void *menu, const core_value_t *row);
/* Set a key LED from an ev_key_leds handler: layer 2 lights it with value (high nibble a colour), layer 1 turns
 * it off. The first setter of an LED wins. */
void fw_led_set(void *mgr, int logical, int layer, int value);

#endif
