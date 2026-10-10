/* SPDX-License-Identifier: GPL-3.0-or-later
 * Machine-neutral runtime module loader: the upload controller's backend
 * (README.md). A machine adds the glue declared at the end and trampolines
 * from its hook bus that call the active module's hooks. */
#ifndef MODWERK_LOADER_H
#define MODWERK_LOADER_H
#include <stdint.h>
#include "upload.h"
#include "modwerk_module.h"
#define RUNTIME_HEADER_BYTES 24u
#define RUNTIME_SLOT_BYTES 16384u
#define RUNTIME_RELOCATIONS 1024u
#define RUNTIME_NONE 0xffffffffu
/* Hook order in packages: the events every Elekloader core has. Later events
 * append; a base refuses a package with hooks it does not dispatch. */
enum runtime_event { RUNTIME_TICK, RUNTIME_DRAW, RUNTIME_KEY, RUNTIME_ENC, RUNTIME_EVENTS };
struct runtime_module { uintptr_t hook[RUNTIME_EVENTS]; }; /* 0: none */

extern const struct mu_backend modwerk_runtime_backend;
extern uint8_t modwerk_runtime_staging[RUNTIME_HEADER_BYTES + 4u * RUNTIME_EVENTS + RUNTIME_SLOT_BYTES + 4u * RUNTIME_RELOCATIONS];
extern struct modwerk_runtime_api modwerk_runtime_api;
/* A trampoline reads this once, then calls the hook. */
const struct runtime_module *modwerk_runtime_active(void);
/* The glue advances `ticks` from the task that runs its hooks one after
 * another, and holds `busy` nonzero around any hook that may run in another
 * task. Old code is reused only once the ticks have passed the swap and
 * nothing is busy. */
extern volatile uint32_t modwerk_runtime_ticks, modwerk_runtime_busy;
uint32_t modwerk_runtime_value(void);
uint32_t modwerk_runtime_calls(void);

/* Machine glue. */
int modwerk_machine_stopped(void);            /* nothing plays or records */
void *modwerk_machine_uncached(void *);       /* the alias module code and data run from */
void modwerk_machine_invalidate_code(void);   /* after code is copied */
#endif
