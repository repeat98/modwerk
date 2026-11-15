/* SPDX-License-Identifier: GPL-3.0-or-later
 * What status.c's MODULE LOAD page reads from dsp.c: each installed module effect and what it costs. */
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
#endif
