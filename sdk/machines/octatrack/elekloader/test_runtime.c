/* SPDX-License-Identifier: GPL-3.0-or-later
 * Host check of the Octatrack trampolines (cc -DMODWERK_HOST): hooks point at
 * host functions; the loader itself is checked in sdk/runtime/loader/tests. */
#include "loader.c"
#include "runtime.c"
#include <stdio.h>

static unsigned failures;
#define CHECK(x) do { if (!(x)) { failures++; fprintf(stderr, "%s:%d: %s\n", __FILE__, __LINE__, #x); } } while (0)
static int keys, draws, ticks;
static int host_key(int code, int pressed) { keys += pressed; return code == 0x31; }
static int host_enc(int encoder, int delta) { return encoder == 3 && delta == -2; }
static void host_draw(unsigned char *frame) { draws++; frame[0] = 1; }
static void host_tick(struct modwerk_runtime_api *api) { api->value = (uint32_t)++ticks; }

int main(void)
{
    unsigned char frame[1024] = {0};
    /* Nothing loaded: every event goes on to the firmware. */
    CHECK(modwerk_runtime_key(0x31, 1) == 0 && modwerk_runtime_enc(3, -2) == 0);
    modwerk_runtime_draw(frame); modwerk_runtime_tick();
    CHECK(frame[0] == 0 && modwerk_runtime_calls() == 1);
    static struct runtime_module module, other;
    module.hook[RUNTIME_TICK] = (uintptr_t)host_tick; module.hook[RUNTIME_DRAW] = (uintptr_t)host_draw;
    module.hook[RUNTIME_KEY] = (uintptr_t)host_key; module.hook[RUNTIME_ENC] = (uintptr_t)host_enc;
    live[3] = &module;
    CHECK(modwerk_runtime_key(0x31, 1) == 1 && modwerk_runtime_key(0x28, 1) == 0 && modwerk_runtime_key(0x28, 0) == 0 && keys == 2);
    CHECK(modwerk_runtime_enc(3, -2) == 1 && modwerk_runtime_enc(0, 1) == 0);
    modwerk_runtime_draw(frame); CHECK(draws == 1 && frame[0] == 1);
    modwerk_runtime_tick(); CHECK(modwerk_runtime_value() == 1 && modwerk_runtime_calls() == 2);
    /* Several modules: every tick and draw hook runs, in position order; the first key hook that takes a key ends it. */
    other.hook[RUNTIME_TICK] = (uintptr_t)host_tick; other.hook[RUNTIME_KEY] = (uintptr_t)host_key;
    live[1] = &other;
    modwerk_runtime_tick(); CHECK(modwerk_runtime_value() == 3 && ticks == 3 && modwerk_runtime_active() == 2);
    CHECK(modwerk_runtime_key(0x31, 1) == 1 && keys == 3); /* position 1 took it: position 3 never saw it */
    CHECK(modwerk_runtime_key(0x28, 1) == 0 && keys == 5);
    modwerk_runtime_draw(frame); CHECK(draws == 2);
    /* Activation only while nothing plays or records; stock code only, below the bootloader copy. */
    modwerk_test_stopped = 0;
    CHECK(!modwerk_runtime_backend.enter(0));
    CHECK(modwerk_machine_patchable(0x40094296u, 6) && !modwerk_machine_patchable(0x400003fcu, 6));
    CHECK(!modwerk_machine_patchable(0x4010fdecu, 6) && !modwerk_machine_patchable(0x40a955e0u, 4) && !modwerk_machine_patchable(0x0u, 4));
    CHECK(!modwerk_machine_patchable(0x400de1dcu, 6) && !modwerk_machine_patchable(0x400e21dcu, 6) && !modwerk_machine_patchable(0x400e21e0u, 6));
    CHECK(modwerk_machine_patchable(0x400de1d8u, 8) && !modwerk_machine_patchable(0x400f0000u, 6)); /* the bank's RAM after load */
    CHECK(!modwerk_machine_patchable(0xfffffffcu, 8));
    if (failures) { fprintf(stderr, "%u trampoline checks failed\n", failures); return 1; }
    puts("Octatrack runtime glue: trampolines for several modules and the patchable stock range passed.");
    return 0;
}
