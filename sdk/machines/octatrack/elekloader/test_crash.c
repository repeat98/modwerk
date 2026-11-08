/* SPDX-License-Identifier: GPL-3.0-or-later
 * Host check of crash.c's owners: the module behind the PC and each stack long, asked in either SDRAM alias, for the
 * record's count; a lookup that faulted is skipped on the way back in. */
#include "crash.c"
#include <stdio.h>

static unsigned failures;
#define CHECK(x) do { if (!(x)) { failures++; fprintf(stderr, "%s:%d: %s\n", __FILE__, __LINE__, #x); } } while (0)
volatile uint32_t modwerk_test_crash[(sizeof(struct crash) + sizeof(struct crash_owners)) / 4u];
void mw_crash(void) {}
/* One module placed in the uncached alias at 0x48d30000, 0x1000 bytes. */
uint32_t modwerk_runtime_owner_module(uintptr_t address) { return address - 0x48d30000u < 0x1000u ? 0x95cff696u : 0; }

int main(void)
{
    CHECK(sizeof(struct crash) == 180u && 0x100ff800u + sizeof(struct crash) + sizeof(struct crash_owners) <= 0x100ff900u); /* below dsp.c's */
    REC->magic = MAGIC, REC->count = 3, REC->pc = 0x40d30010u; /* the cached alias of that module */
    REC->stack[0] = 0x48d30ffcu, REC->stack[1] = 0x40012345u, REC->stack[2] = 0x48d31000u, REC->stack[7] = 0x40d30000u;
    modwerk_crash_owners();
    CHECK(OWNERS->magic == OWNERS_MAGIC && OWNERS->count == 3u && OWNERS->pc == 0x95cff696u);
    CHECK(OWNERS->stack[0] == 0x95cff696u && !OWNERS->stack[1] && !OWNERS->stack[2] && OWNERS->stack[7] == 0x95cff696u);
    /* The lookup faulted: crash.s came back for the next count; the owners are dropped, no second lookup. */
    OWNERS->magic = OWNERS_BUSY, OWNERS->count = 3, REC->count = 4;
    modwerk_crash_owners();
    CHECK(OWNERS->magic == 0u);
    /* The next crash is named again. */
    REC->count = 5;
    modwerk_crash_owners();
    CHECK(OWNERS->magic == OWNERS_MAGIC && OWNERS->count == 5u && OWNERS->pc == 0x95cff696u);

    if (failures) fprintf(stderr, "%u failure(s)\n", failures);
    else puts("crash: owners in both aliases, for the record's count, re-entry skipped");
    return failures != 0;
}
