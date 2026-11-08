/* SPDX-License-Identifier: GPL-3.0-or-later
 * Crash recovery (owner, 11 October 2026: an exception should not need a power cycle). crash.s takes the error
 * vectors, records the crash in battery RAM, names the modules behind it and restarts the unit; after the restart
 * the base says so once, and the record stays for a host to read. */
#include <stdint.h>
#ifdef MODWERK_DEV
void modwerk_cost_stamp(unsigned k); /* diag.c: the development profile of the base's hooks */
#define MW_STAMP(k) modwerk_cost_stamp(k)
#else
#define MW_STAMP(k) ((void)0)
#endif

struct crash { uint32_t magic, count, frame, pc, d[8], a[7], sp, stack[8], seen, code[8], memory[8]; }; /* code: 32 bytes at the PC, read cached; memory: the same through the uncached alias (crash.s) */
/* Right after the record, below dsp.c's at 0x100ff900: the installed modules whose memory holds the PC and each of
 * the eight stack longs (0: stock code or none), for the record of that count. diag.c puts them in the CRASH incident. */
struct crash_owners { uint32_t magic, count, pc, stack[8]; };
#ifdef MODWERK_HOST /* test_crash.c models battery RAM */
extern volatile uint32_t modwerk_test_crash[(sizeof(struct crash) + sizeof(struct crash_owners)) / 4u];
#define REC ((volatile struct crash *)modwerk_test_crash)
#else
#define REC ((volatile struct crash *)0x100ff800u)
#endif
#define OWNERS ((volatile struct crash_owners *)(REC + 1))
#define MAGIC 0x4d574352u /* "MWCR" */
#define OWNERS_MAGIC 0x4d57434fu /* "MWCO" */
#define OWNERS_BUSY 0x4d574342u  /* "MWCB": set while the lookup runs */
#define VECTORS ((volatile uint32_t *)0x40000000u) /* the vector base (0x400b9668 holds it) */
#define POPUP ((void (*)(const char *, unsigned))0x4005a2b8u)

void mw_crash(void);
uint32_t modwerk_runtime_owner_module(uintptr_t address); /* loader.c */
volatile uint32_t modwerk_crash_test; /* dev.c: crash on the next tick, to test this */
uint32_t mw_crash_stack[64]; /* crash.s runs modwerk_crash_owners on it: the stack that faulted may be what broke */

/* A module's code may run from either SDRAM alias (runtime.c), so the other one is asked too. */
static uint32_t owner_of(uint32_t address)
{
    uint32_t id = modwerk_runtime_owner_module(address);
    if (!id && address - 0x40000000u < 0x01000000u) id = modwerk_runtime_owner_module(address + 0x08000000u);
    if (!id && address - 0x48000000u < 0x01000000u) id = modwerk_runtime_owner_module(address - 0x08000000u);
    return id;
}
/* crash.s, interrupts masked, after the record: reads only the base's owner records. Should the lookup itself fault,
 * crash.s comes back here for the next count and restarts without it, instead of faulting again. */
void modwerk_crash_owners(void);
void modwerk_crash_owners(void)
{
    if (OWNERS->magic == OWNERS_BUSY && OWNERS->count + 1u == REC->count) { OWNERS->magic = 0; return; }
    OWNERS->magic = OWNERS_BUSY, OWNERS->count = REC->count;
    OWNERS->pc = owner_of(REC->pc);
    for (unsigned i = 0; i < 8u; ++i) OWNERS->stack[i] = owner_of(REC->stack[i]);
    OWNERS->magic = OWNERS_MAGIC;
}

/* Sys task, ev_tick (60 Hz). Access and address errors, illegal, unimplemented (line F) and unsupported
 * instructions, privilege and format errors: the exceptions stock code never takes on purpose. */
void modwerk_crash_tick(void);
void modwerk_crash_tick(void)
{
    MW_STAMP(7);
    static const uint8_t vectors[] = {2, 3, 4, 8, 11, 14, 61};
    static uint32_t ticks;
    if (!ticks)
        for (unsigned i = 0; i < sizeof vectors; ++i) VECTORS[vectors[i]] = (uint32_t)(uintptr_t)mw_crash;
    if (ticks < 240u && ++ticks == 240u && REC->magic == MAGIC && REC->seen != REC->count) {
        REC->seen = REC->count; /* once a crash, 4 s after the start, once the UI runs */
        POPUP("CRASH RECOVERED", 0xa0);
    }
#ifndef MODWERK_HOST
    if (modwerk_crash_test) {
        modwerk_crash_test = 0;
        __asm__ volatile("illegal");
    }
#endif
}
