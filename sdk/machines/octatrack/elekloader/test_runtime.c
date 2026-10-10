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
static void host_draw(unsigned char *frame) { draws++; CHECK(modwerk_runtime_busy == 1); frame[0] = 1; }
static void host_tick(struct modwerk_runtime_api *api) { api->value = (uint32_t)++ticks; }

int main(void)
{
    unsigned char frame[1024] = {0};
    /* Nothing loaded: every event goes on to the firmware. */
    CHECK(modwerk_runtime_key(0x31, 1) == 0 && modwerk_runtime_enc(3, -2) == 0);
    modwerk_runtime_draw(frame); modwerk_runtime_tick();
    CHECK(frame[0] == 0 && modwerk_runtime_calls() == 1 && modwerk_runtime_busy == 0);
    modules[0].hook[RUNTIME_TICK] = (uintptr_t)host_tick; modules[0].hook[RUNTIME_DRAW] = (uintptr_t)host_draw;
    modules[0].hook[RUNTIME_KEY] = (uintptr_t)host_key; modules[0].hook[RUNTIME_ENC] = (uintptr_t)host_enc;
    active = &modules[0];
    CHECK(modwerk_runtime_key(0x31, 1) == 1 && modwerk_runtime_key(0x28, 1) == 0 && modwerk_runtime_key(0x28, 0) == 0 && keys == 2);
    CHECK(modwerk_runtime_enc(3, -2) == 1 && modwerk_runtime_enc(0, 1) == 0);
    modwerk_runtime_draw(frame); CHECK(draws == 1 && frame[0] == 1 && modwerk_runtime_busy == 0);
    modwerk_runtime_tick(); CHECK(modwerk_runtime_value() == 1 && modwerk_runtime_calls() == 2);
    /* Activation only while nothing plays or records. */
    modwerk_test_stopped = 0;
    CHECK(!modwerk_runtime_backend.enter(0));
    if (failures) { fprintf(stderr, "%u trampoline checks failed\n", failures); return 1; }
    puts("Octatrack runtime glue: tick, draw, key and encoder trampolines passed.");
    return 0;
}
