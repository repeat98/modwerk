/* SPDX-License-Identifier: GPL-3.0-or-later
 * What status.c's MODULE COST page reads from dsp.c: each installed module effect and what it costs. */
#ifndef MODWERK_STATUS_H
#define MODWERK_STATUS_H
#include <stdint.h>
struct modwerk_module_load {
    char name[16];
    uint32_t cycles;  /* an instance's chip cycles a sample, of a frame's 4,532 */
    uint8_t id;       /* its handle (effect id) */
    uint8_t measured; /* 1: a hardware figure; 0: 7/4 of an emulator claim (an estimate) */
    uint8_t slots[2]; /* slots running it on core 0 (T5-T8) and core 1 (T1-T4) */
};
unsigned modwerk_dsp_module_loads(struct modwerk_module_load *out); /* dsp.c: how many, at most MODWERK_FX_IDS */
/* The box after a pick (owner, 14 October 2026: what the effect took and what is left): the slot's core, what its
 * slots and sources are charged against its allowance and the slot's own charge (chip cycles a sample), its code
 * words against its arena and the effect's own, and the effect's name. */
struct modwerk_dsp_budget { uint32_t charge, allowance, effect_cycles, words, arena; char name[16]; uint8_t core; };
int modwerk_dsp_budget(unsigned slot, struct modwerk_dsp_budget *out); /* dsp.c: 0 unless a module runs on the slot */
/* dsp.c: core c's DSP budget booked as admission counts it, per mille of its allowance; a pick past 1000 is DSP FULL. */
uint32_t modwerk_dsp_booked(unsigned core);
unsigned modwerk_dsp_reads_buffer(unsigned id); /* dsp.c: 0 for an effect that needs no delay memory */
unsigned modwerk_status_load(uint8_t *out); /* cached MWLD v1, no work scheduled by the read */
/* PROJ > MODWERK > MODULES: modset.c switches an installed module off or on at once and keeps the ones that are off
 * on its shelf. modwerk_modset_switch asks (0: the last one is not answered yet); modwerk_modset_switch_result then
 * goes from PENDING to SWITCHED or to why not: REFUSED plus the loader's refusal (loader.h's runtime_refusal). */
enum { MODSET_SWITCHED, MODSET_SWITCH_PENDING,
       MODSET_SWITCH_PLAYING, /* the unit plays or records: stop first */
       MODSET_SWITCH_BUSY,    /* a host session, a save or the card is in the way: again in a moment */
       MODSET_SWITCH_FULL,    /* the saved set has no room for it */
       MODSET_SWITCH_GONE,    /* a host changed it meanwhile */
       MODSET_SWITCH_PARTIAL, /* this start did not load the card's whole set (skipped, held, one left out): restart first */
       MODSET_SWITCH_SYNC,    /* the card's set is another base's or damaged, or a module of it failed to load: a sync first */
       MODSET_SWITCH_REFUSED = 0x100 };
int modwerk_modset_switch(uint32_t id, int on);
extern volatile uint32_t modwerk_modset_switch_result;
/* The modules that are off: "MWO", the entries here, the shelf's count (u16), 0, 0, then 56 bytes each: an INVENTORY
 * entry (0xff, 0, parameter layout, module id, name) and the package's SHA-256. 0 while the shelf moves: ask again. */
#define MODSET_OFF_ENTRY 56u
#define MODSET_OFF_PAGE 5u /* entries a USB reply holds (ep0.c's OFF request) */
unsigned modwerk_modset_off_list(uint8_t *out, unsigned first, unsigned most);
/* What this start's restore did with each package of the card's set, in the set's order: "MWR", the entries here, the
 * set's packages (u16, past the loader's rows too), the restore's result (modset.c's RESTORED to HELD, 0 before it ran)
 * and 1, then 32 bytes each: state (1 loaded, 2 left out), the loader's check that refused it (loader.h runtime_check),
 * why (u16: loader.h runtime_refusal, 0x100 the boot guard), module id, package bytes, the module pool's largest free
 * run when it was left out, and its name as the chooser shows it (15 and a zero). */
#define MODSET_RESTORE_ENTRY 32u
#define MODSET_RESTORE_PAGE 5u /* entries a USB reply holds (ep0.c's RESTORE request) */
unsigned modwerk_modset_restore_list(uint8_t *out, unsigned first, unsigned most);
/* 1 when the module is switched off (on the shelf), for status.c's MISSING page and dsp.c's track notice: such a module
 * is not missing (owner, 16 November 2026). 0 also while the shelf moves; any task. */
int modwerk_modset_is_off(uint32_t module);
/* machine_registry.c's map of the machines a project uses (owner, 16 November 2026), and their MISSING entries: handle
 * 0xff (a module without DSP code, as INVENTORY says it), byte 1 0x80 and the map entry. */
#define MODWERK_MACHINE_MAP 16u
#define MODWERK_MISSING_MAX (MODWERK_FX_IDS + MODWERK_MACHINE_MAP)
int modwerk_machine_absent(unsigned k, uint32_t *module, char *name);
int modwerk_machine_track_absent(unsigned track, uint32_t *module, char *name);
int modwerk_machine_where(unsigned k, unsigned *bank, unsigned *part, unsigned *track);
int modwerk_machine_where_module(uint32_t module, unsigned *bank, unsigned *part, unsigned *track);
void modwerk_machine_map_refresh(void);
void modwerk_machine_map_begin(void);
void modwerk_machine_map_stage(const uint8_t *sig, unsigned lo, unsigned hi, uint32_t module, const char *name);
void modwerk_machine_map_loaded(int ok);
int modwerk_machine_map_line(unsigned k, uint8_t *sig, unsigned *lo, unsigned *hi, uint32_t *module, char *name);
#endif
