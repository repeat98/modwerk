/* SPDX-License-Identifier: GPL-3.0-or-later
 * The shared status word (modwerk_runtime_api.value) across installs and removals, against the actual loader and the
 * Octatrack's tick dispatch (runtime.c, cc -DMODWERK_HOST). Host functions stand in for the modules' ticks: a removed
 * module's tick no longer runs, the remaining one's does, and once the live set changes the word holds only what a
 * module live since the change wrote, 0 when none writes it (#1314). */
#define MODWERK_RUNTIME_REFERENCE_EXTERNAL /* runtime.c defines the Octatrack's modwerk_machine_reference */
#include "loader.c"
#include "runtime.c"
#include "sha256.c"
#include <stdio.h>
#include <string.h>

static unsigned failures;
#define CHECK(x) do { if (!(x)) { failures++; fprintf(stderr, "%s:%d: %s\n", __FILE__, __LINE__, #x); } } while (0)
#define LOCKS 0x50534c00u  /* stands in for Pattern Sample Locks: installed first, the lower position */
#define SLICER 0x42534c00u /* for Beat Slicer: the higher position, so the last writer while both run */
static unsigned ran_locks, ran_slicer;
static void tick_locks(struct modwerk_runtime_api *api) { ++ran_locks; api->value = 0x01000000u; }
static void tick_slicer(struct modwerk_runtime_api *api) { ++ran_slicer; api->value = 0x42530000u; }

static const struct mu_backend *b = &modwerk_runtime_backend;
static uint8_t p[256];
static uint32_t n;
static void emit(uint32_t v) { put32(p + n, v); n += 4; }
/* ABI 8 package of module `id`: a 64-byte image with a tick hook at offset 16, no sites; or its removal (no image). */
static int offer(uint32_t id, int removal)
{
    memset(p, 0, sizeof p); memcpy(p, "MWRM\0\10", 6); n = 8;
    emit(removal ? 0 : 64); emit(0); emit(0); emit(removal ? 0 : RUNTIME_HOOKS); emit(0); emit(id);
    p[67] = 1; n = 76;
    if (!removal) {
        for (unsigned i = 0; i < RUNTIME_HOOKS; ++i) emit(i == RUNTIME_TICK ? 16u : RUNTIME_NONE);
        memset(p + n, 0x4e, 64); n += 64;
    }
    return b->enter(0) && b->prepare(0, p, n) && b->publish(0) == MU_APPLIED && b->retire(0) && b->leave(0);
}
static struct runtime_module *module(uint32_t id)
{
    for (unsigned i = 0; i < RUNTIME_MODULES; ++i) if (live[i] && live[i]->id == id) return live[i];
    return 0;
}
/* Installs `id` and points its tick at a host function (0: a module whose tick never writes the word). */
static void install(uint32_t id, void (*tick)(struct modwerk_runtime_api *))
{
    CHECK(offer(id, 0));
    struct runtime_module *m = module(id);
    CHECK(m && m->hook[RUNTIME_TICK]);
    if (m) m->hook[RUNTIME_TICK] = (uintptr_t)tick;
}

int main(void)
{
    /* Both live: both ticks run, the later position writes last (#1524). */
    install(LOCKS, tick_locks); install(SLICER, tick_slicer);
    modwerk_runtime_tick();
    CHECK(modwerk_runtime_active() == 2 && ran_locks == 1 && ran_slicer == 1 && modwerk_runtime_value() == 0x42530000u);
    /* Beat Slicer removed: its tick no longer runs, Sample Locks' does and its value is the word. */
    CHECK(offer(SLICER, 1) && !module(SLICER) && module(LOCKS));
    modwerk_runtime_tick(); modwerk_runtime_tick();
    CHECK(ran_slicer == 1 && ran_locks == 3 && modwerk_runtime_value() == 0x01000000u);
    /* The last module that wrote the word removed, one that never writes it installed: the word is 0, not the value of
     * a module that left. */
    install(SLICER, 0);
    CHECK(offer(LOCKS, 1) && !module(LOCKS) && module(SLICER));
    modwerk_runtime_tick();
    CHECK(ran_locks == 3 && modwerk_runtime_value() == 0);
    /* An install alone clears it too, until a live tick writes it again; nothing live: it stays 0. */
    install(LOCKS, tick_locks); modwerk_runtime_tick(); CHECK(ran_locks == 4 && modwerk_runtime_value() == 0x01000000u);
    CHECK(offer(LOCKS, 1) && offer(SLICER, 1) && !modwerk_runtime_active());
    modwerk_runtime_tick(); modwerk_runtime_tick();
    CHECK(ran_locks == 4 && ran_slicer == 1 && modwerk_runtime_value() == 0);
    /* Ticks with the set unchanged leave a written word alone (a tick that writes now and then keeps its value). */
    install(LOCKS, tick_locks); modwerk_runtime_tick();
    module(LOCKS)->hook[RUNTIME_TICK] = 0; modwerk_runtime_tick(); modwerk_runtime_tick();
    CHECK(ran_locks == 5 && modwerk_runtime_value() == 0x01000000u);
    if (failures) { fprintf(stderr, "%u status word checks failed\n", failures); return 1; }
    puts("Status word after removal: a removed module's tick no longer runs and its value does not outlive it.");
    return 0;
}
