/* SPDX-License-Identifier: GPL-3.0-or-later
 * Machine-neutral runtime module loader: the upload controller's backend
 * (README.md). A machine adds the glue declared at the end and trampolines
 * from its hook bus that call the active module's hooks. */
#ifndef MODWERK_LOADER_H
#define MODWERK_LOADER_H
#include <stdint.h>
#include "upload.h"
#include "modwerk_module.h"
#define RUNTIME_HEADER_BYTES 32u        /* ABI 4; ABI 3 packages have 28 and are module 0 */
#define RUNTIME_IMAGE_BYTES 32768u       /* one module's image and bss */
#define RUNTIME_RELOCATIONS 2048u
#define RUNTIME_SITES 64u
#define RUNTIME_SITE_BYTES 32u
#define RUNTIME_SITE_RELOCATIONS 8u
#define RUNTIME_POOL_BYTES 262144u       /* every module's memory, reclaimed once nothing can reach it */
#define RUNTIME_MODULES 32u              /* live at once: bounds the cost of each event, not memory */
#define RUNTIME_PAUSED 32u               /* memory spans the glue may report */
#define RUNTIME_NONE 0xffffffffu
/* Hook order in packages: the events every Elekloader core has. Later events
 * append; a base refuses a package with hooks it does not dispatch. */
enum runtime_event { RUNTIME_TICK, RUNTIME_DRAW, RUNTIME_KEY, RUNTIME_ENC, RUNTIME_EVENTS };
struct runtime_site { uint32_t address, length; uint8_t stock[RUNTIME_SITE_BYTES], code[RUNTIME_SITE_BYTES]; };
/* At the start of the module's pool extent, followed by its sites, code, data and bss. */
struct runtime_module { uint32_t id, size; uintptr_t hook[RUNTIME_EVENTS]; const struct runtime_site *site; uint32_t sites; }; /* hook 0: none */
/* Why the last package was refused, for diagnostics and the unit's own message. */
enum runtime_refusal { RUNTIME_OK, RUNTIME_MALFORMED, RUNTIME_MEMORY, RUNTIME_CONFLICT, RUNTIME_FULL, RUNTIME_BUSY };
#define RUNTIME_PACKAGE_BYTES (RUNTIME_HEADER_BYTES + 4u * RUNTIME_EVENTS + RUNTIME_IMAGE_BYTES + 4u * RUNTIME_RELOCATIONS + \
                               RUNTIME_SITES * (8u + 2u * RUNTIME_SITE_BYTES + 2u * RUNTIME_SITE_RELOCATIONS))

/* The controller's staging buffer is the machine's; it must hold RUNTIME_PACKAGE_BYTES. */
extern const struct mu_backend modwerk_runtime_backend;
extern struct modwerk_runtime_api modwerk_runtime_api;
/* A trampoline reads each position once, then calls its hook. Memory is
 * reclaimed only when no paused task holds an address inside it, so a hook
 * still running old code stays valid. */
const struct runtime_module *modwerk_runtime_module(unsigned position);
unsigned modwerk_runtime_active(void);               /* modules live */
uint32_t modwerk_runtime_free(uint32_t *largest);    /* pool bytes free, and the largest free run */
enum runtime_refusal modwerk_runtime_refusal(void);
extern volatile uint32_t modwerk_runtime_ticks; /* advanced by the glue's tick, for diagnostics */
uint32_t modwerk_runtime_value(void);
uint32_t modwerk_runtime_calls(void);

/* Machine glue. */
struct runtime_span { const uint8_t *from, *to; };
int modwerk_machine_stopped(void);                 /* nothing plays or records */
void *modwerk_machine_uncached(void *);            /* the alias module code and data run from */
void modwerk_machine_invalidate_code(void);        /* instruction and branch caches */
/* Stock code: whether [address, address + length) may be patched at all (RAM
 * only, never what the OS may write to flash), and an uncached view of it. */
int modwerk_machine_patchable(uint32_t address, uint32_t length);
uint8_t *modwerk_machine_code(uint32_t address);
void modwerk_machine_flush_data(uint32_t address, uint32_t length); /* push and invalidate data-cache lines */
uint32_t modwerk_machine_mask(void);               /* no other code runs until unmask */
void modwerk_machine_unmask(uint32_t);
/* With interrupts masked: the memory every other task would resume from or
 * return into (live stacks, saved registers). More than `max` means unknown. */
unsigned modwerk_machine_paused(struct runtime_span *, unsigned max);
#endif
