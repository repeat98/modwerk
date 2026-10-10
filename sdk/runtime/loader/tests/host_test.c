/* SPDX-License-Identifier: GPL-3.0-or-later
 * Host check of the loader (cc, with stub machine glue; module code never
 * runs and ticks are advanced by hand). */
#include "../loader.c"
#include <stdio.h>
#include <string.h>

int stopped = 1;
int modwerk_machine_stopped(void) { return stopped; }
void *modwerk_machine_uncached(void *p) { return p; }
void modwerk_machine_invalidate_code(void) {}

static unsigned failures;
#define CHECK(x) do { if (!(x)) { failures++; fprintf(stderr, "%s:%d: %s\n", __FILE__, __LINE__, #x); } } while (0)
static const struct mu_backend *b = &modwerk_runtime_backend;
#define HEAD (RUNTIME_HEADER_BYTES + 4 * RUNTIME_EVENTS)
static uint8_t p[HEAD + RUNTIME_SLOT_BYTES + 4 * (RUNTIME_RELOCATIONS + 1)];
static void put(uint8_t *at, uint32_t v) { at[0] = (uint8_t)(v >> 24); at[1] = (uint8_t)(v >> 16); at[2] = (uint8_t)(v >> 8); at[3] = (uint8_t)v; }
/* An image of `image` bytes of `fill`, a tick hook at `tick` and no others,
 * and relocations at `relocation[0..count)`, each word holding 6. */
static uint32_t package(uint32_t image, uint32_t bss, uint32_t tick, const uint32_t *relocation, uint32_t count, uint8_t fill)
{
    memcpy(p, "MWRM\0\2\0\0", 8);
    put(p + 8, image); put(p + 12, bss); put(p + 16, count); put(p + 20, RUNTIME_EVENTS);
    put(p + 24, tick); for (int i = 1; i < RUNTIME_EVENTS; ++i) put(p + 24 + 4 * i, RUNTIME_NONE);
    memset(p + HEAD, fill, image);
    for (uint32_t i = 0; i < count; ++i) {
        put(p + HEAD + image + 4 * i, relocation[i]);
        if (relocation[i] + 4 <= image) put(p + HEAD + relocation[i], 6);
    }
    return HEAD + image + 4 * count;
}

int main(void)
{
    const uint32_t four = 4, twice[2] = {4, 4}, odd = 3, past = 6;
    uint32_t n = package(8, 4, 2, &four, 1, 0xa1);
    CHECK(!b->prepare(0, p, n)); /* No tick has passed since boot. */
    modwerk_runtime_ticks += 2;
    for (uint32_t bad = 0; bad < 16; ++bad) {
        uint32_t m = package(8, 4, 2, &four, 1, 0xa1);
        if (bad == 0) p[0] = 'X';
        if (bad == 1) p[5] = 1;                                   /* ABI 1 */
        if (bad == 2) m -= 1;                                     /* length mismatch */
        if (bad == 3) m = package(8, 4, 8, 0, 0, 0);              /* hook outside the image */
        if (bad == 4) m = package(8, 4, 3, 0, 0, 0);              /* odd hook */
        if (bad == 5) m = package(RUNTIME_SLOT_BYTES + 2, 0, 0, 0, 0, 0);
        if (bad == 6) m = package(8, RUNTIME_SLOT_BYTES - 7, 0, 0, 0, 0); /* bss past the slot */
        if (bad == 7) m = package(0, 4, RUNTIME_NONE, 0, 0, 0);   /* bss without an image */
        if (bad == 8) m = package(8, 4, 2, &odd, 1, 0);           /* odd relocation */
        if (bad == 9) m = package(8, 4, 2, &past, 1, 0);          /* relocation past the image */
        if (bad == 10) { m = package(8, 4, 2, &four, 1, 0); put(p + HEAD + 4, 12); } /* points past bss */
        if (bad == 11) m = package(8, 4, 2, twice, 2, 0);         /* the same word twice */
        if (bad == 12) { m = package(8, 0, 0, 0, 0, 0); put(p + 16, RUNTIME_RELOCATIONS + 1);
                         m += 4 * (RUNTIME_RELOCATIONS + 1); }
        if (bad == 13) { m = package(8, 0, 0, 0, 0, 0); put(p + 20, RUNTIME_EVENTS + 1); m += 4; } /* hooks the base lacks */
        if (bad == 14) { m = package(8, 0, 0, 0, 0, 0); put(p + 20, 0); }  /* count no longer matches */
        if (bad == 15) m = RUNTIME_HEADER_BYTES - 1;
        CHECK(!b->prepare(0, p, m));
    }
    /* A package naming fewer hooks than the base dispatches leaves the rest empty. */
    package(8, 0, 2, 0, 0, 0); put(p + 20, 1); memmove(p + RUNTIME_HEADER_BYTES + 4, p + HEAD, 8);
    CHECK(b->prepare(0, p, RUNTIME_HEADER_BYTES + 4 + 8) && b->discard(0));
    CHECK(modules[0].hook[RUNTIME_TICK] == (uintptr_t)slots[0] + 2 && !modules[0].hook[RUNTIME_KEY]);
    memset(slots, 0xee, sizeof slots);
    n = package(8, 4, 2, &four, 1, 0xa1);
    CHECK(b->prepare(0, p, n) && b->publish(0) == MU_APPLIED);
    const struct runtime_module *m = modwerk_runtime_active();
    CHECK(m == &modules[0] && m->hook[RUNTIME_TICK] == (uintptr_t)slots[0] + 2);
    CHECK(!m->hook[RUNTIME_DRAW] && !m->hook[RUNTIME_KEY] && !m->hook[RUNTIME_ENC] && slots[0][0] == 0xa1 && slots[0][3] == 0xa1);
    CHECK(be32(slots[0] + 4) == (uint32_t)(uintptr_t)slots[0] + 6);      /* relocated */
    CHECK(be32(slots[0] + 8) == 0 && slots[0][12] == 0xee);             /* bss cleared, nothing past it */
    CHECK(!b->retire(0)); modwerk_runtime_ticks += 2; CHECK(b->retire(0));
    /* A replacement goes into the other slot; rollback returns to the first. */
    n = package(4, 0, 0, 0, 0, 0xb2);
    CHECK(b->prepare(0, p, n) && b->publish(0) == MU_APPLIED && modwerk_runtime_active() == &modules[1]);
    CHECK(slots[1][0] == 0xb2 && modules[1].hook[RUNTIME_TICK] == (uintptr_t)slots[1]);
    CHECK(b->restore(0) && modwerk_runtime_active() == &modules[0]);
    CHECK(!b->prepare(0, p, n)); modwerk_runtime_ticks += 2;
    modwerk_runtime_busy = 1; CHECK(!b->prepare(0, p, n)); modwerk_runtime_busy = 0; /* a hook may still be in the old code */
    CHECK(b->prepare(0, p, n) && b->discard(0));
    CHECK(b->publish(0) == MU_UNCERTAIN); /* Nothing prepared after discard. */
    /* Removal: an empty package leaves the slot unused. */
    n = package(0, 0, RUNTIME_NONE, 0, 0, 0);
    CHECK(b->prepare(0, p, n) && b->publish(0) == MU_APPLIED && !modwerk_runtime_active());
    /* Activation only while nothing plays or records. */
    stopped = 0;
    CHECK(!b->enter(0) && !b->safe(0));
    stopped = 1;
    CHECK(b->enter(0) && b->safe(0) && b->leave(0) && !b->safe(0));
    if (failures) { fprintf(stderr, "%u loader checks failed\n", failures); return 1; }
    puts("Loader: package refusals, relocation, bss, hooks, alternation, rollback, removal and gated reuse passed.");
    return 0;
}
