/* SPDX-License-Identifier: GPL-3.0-or-later
 * Crash recovery (owner, 11 October 2026: an exception should not need a power cycle). crash.s takes the error
 * vectors, records the crash in battery RAM and restarts the unit; after the restart the base says so once, and
 * the record stays for a host to read. */
#include <stdint.h>
#ifdef MODWERK_DEV
void modwerk_cost_stamp(unsigned k); /* diag.c: the development profile of the base's hooks */
#define MW_STAMP(k) modwerk_cost_stamp(k)
#else
#define MW_STAMP(k) ((void)0)
#endif

struct crash { uint32_t magic, count, frame, pc, d[8], a[7], sp, stack[8], seen, code[8], memory[8]; }; /* code: 32 bytes at the PC, read cached; memory: the same through the uncached alias (crash.s) */
#define REC ((volatile struct crash *)0x100ff800u)
#define MAGIC 0x4d574352u /* "MWCR" */
#define VECTORS ((volatile uint32_t *)0x40000000u) /* the vector base (0x400b9668 holds it) */
#define POPUP ((void (*)(const char *, unsigned))0x4005a2b8u)

void mw_crash(void);
volatile uint32_t modwerk_crash_test; /* dev.c: crash on the next tick, to test this */

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
    if (modwerk_crash_test) {
        modwerk_crash_test = 0;
        __asm__ volatile("illegal");
    }
}
