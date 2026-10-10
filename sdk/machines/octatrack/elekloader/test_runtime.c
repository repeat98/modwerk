/* SPDX-License-Identifier: GPL-3.0-or-later
 * Host check of runtime.c's bookkeeping (cc -DMODWERK_HOST; nothing runs
 * module code: ticks are advanced by hand). */
#include "runtime.c"
#include <stdio.h>
#include <string.h>

static unsigned failures;
#define CHECK(x) do { if (!(x)) { failures++; fprintf(stderr, "%s:%d: %s\n", __FILE__, __LINE__, #x); } } while (0)
static const struct mu_backend *b = &modwerk_runtime_backend;
static uint32_t package(uint8_t *p, uint32_t entry, uint32_t code, uint8_t fill)
{
    memcpy(p, "MWRM\0\1\0\0", 8);
    for (int i = 0; i < 4; ++i) { p[8+i] = (uint8_t)(entry >> (24-8*i)); p[12+i] = (uint8_t)(code >> (24-8*i)); }
    memset(p + 16, fill, code);
    return 16 + code;
}

int main(void)
{
    static uint8_t p[16 + RUNTIME_SLOT_BYTES + 1];
    uint32_t n = package(p, 2, 8, 0xa1);
    CHECK(!b->prepare(0, p, n)); /* No tick has passed since boot. */
    calls += 2;
    for (uint32_t bad = 0; bad < 6; ++bad) {
        uint32_t m = package(p, 2, 8, 0xa1);
        if (bad == 0) p[0] = 'X';
        if (bad == 1) p[5] = 2;            /* ABI */
        if (bad == 2) m -= 1;               /* code length mismatch */
        if (bad == 3) m = package(p, 8, 8, 0); /* entry outside code */
        if (bad == 4) m = package(p, 0, RUNTIME_SLOT_BYTES + 1, 0);
        if (bad == 5) m = 15;
        CHECK(!b->prepare(0, p, m));
    }
    n = package(p, 2, 8, 0xa1);
    CHECK(b->prepare(0, p, n) && b->publish(0) == MU_APPLIED);
    CHECK(modwerk_runtime_active() == (runtime_entry)(uintptr_t)(slots[0] + 2) && slots[0][7] == 0xa1);
    CHECK(!b->retire(0)); calls += 2; CHECK(b->retire(0));
    /* A replacement goes into the other slot; rollback returns to the first. */
    n = package(p, 0, 4, 0xb2);
    CHECK(b->prepare(0, p, n) && b->publish(0) == MU_APPLIED && modwerk_runtime_active() == (runtime_entry)(uintptr_t)slots[1]);
    CHECK(b->restore(0) && modwerk_runtime_active() == (runtime_entry)(uintptr_t)(slots[0] + 2));
    CHECK(!b->prepare(0, p, n)); calls += 2; CHECK(b->prepare(0, p, n) && b->discard(0));
    CHECK(b->publish(0) == MU_UNCERTAIN); /* Nothing prepared after discard. */
    /* Removal: an empty package leaves the slot unused. */
    n = package(p, 0, 0, 0);
    CHECK(b->prepare(0, p, n) && b->publish(0) == MU_APPLIED && !modwerk_runtime_active());
    /* Activation only while nothing plays or records. */
    modwerk_test_stopped = 0;
    CHECK(!b->enter(0) && !b->safe(0));
    modwerk_test_stopped = 1;
    CHECK(b->enter(0) && b->safe(0) && b->leave(0) && !b->safe(0));
    if (failures) { fprintf(stderr, "%u runtime checks failed\n", failures); return 1; }
    puts("Runtime slot: package refusals, alternation, rollback, removal and tick-gated reuse passed.");
    return 0;
}
