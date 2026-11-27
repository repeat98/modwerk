/* SPDX-License-Identifier: GPL-2.0-or-later */
/* MUTINY's hook-bus entries on the Digitone mk1 OS 1.44 core: core-dn1's dispatcher ABI (arguments
 * on the stack, d0-d1/a0-a1 free, result in d0). mut_site_len is not here: it is the assembly
 * entry in len.s. */
#ifndef MUTINY_HOOKS_H
#define MUTINY_HOOKS_H

#include "digitone-mk1/seq.h"
#include <stdint.h>

/* core's events, subscribed in mod.json. */
int mut_key(void *brain, void *ev);
int mut_enc(void *brain, void *ev);
void mut_tick(void *ctrl);
void mut_draw(void *bmp, void *ctrl);
void mut_leds(void *mgr);

/* seq-events' step-fire stages, in the order mod.json subscribes them. */
void mut_gen_trig(int32_t track, int32_t step, int32_t first, uint32_t *trig);
void mut_fire_cond(int32_t track, int32_t step, int32_t *pass);
void mut_gen_notes(int32_t track, int32_t step, int32_t generated, int8_t notes[SQ_NOTES]);
void mut_fire_vel(int32_t track, int32_t step, int32_t *vel);
int32_t mut_fire_locks(int32_t track, int32_t step, struct sq_lock *out, int32_t room);

/* The C entry len.s calls from the LEN site (interrupt level, step fire). */
int32_t mut_on_len(int32_t track, int32_t step, int32_t len, const uint8_t *trk_data);

#endif
