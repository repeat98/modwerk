/* SPDX-License-Identifier: MIT */
#ifndef MODWERK_MACHINE_CONTRIBUTORS_H
#define MODWERK_MACHINE_CONTRIBUTORS_H
#include "loader.h"
#include "machine_lifetime.h"
/* A retirement's answers: the analog-bd lane's MW_AB_RESTORE_* values. */
enum { MACHINE_RETIRE_CLEAR = 0, MACHINE_RETIRE_PLANNED = 1, MACHINE_RETIRE_UNKNOWN = 2, MACHINE_RETIRE_PARTIAL = 3 };
/* A base-carried conversion of one machine's tracks in every known Part copy, by Part signature: check is
 * read-only (PREPARE), retire converts (SWITCH, no task running). */
struct machine_retirement { uint8_t sig[2], lo, hi; int (*check)(void); int (*retire)(void); };
/* The package's ot_machines record (struct modwerk_machine, raw bytes: its signature at +4..+7), or 0. */
const uint8_t *machine_contribution(const struct runtime_dsp *);
/* Validate incoming fixed records before the board's ordinary-package fast path. PREPARE sees image offsets;
 * SWITCH sees relocated pointers. START must belong to the same package's descriptor and initialized image.
 * The SDK separately checks ELF function/code provenance during building; this flat image has no section map. */
int machine_contributor_validate(const struct runtime_dsp *, unsigned operation);
const struct machine_retirement *machine_retirement(const uint8_t *record);
/* Machine lock held. RUNTIME_OK, RUNTIME_IN_USE while the leaving machine is still held; sets to->foreign_roots
 * for a contributor. */
int machine_contributor_admission(const struct runtime_dsp *from, struct runtime_dsp *to, machine_memory_read, void *,
                                  uint32_t bank, unsigned operation);
#endif
