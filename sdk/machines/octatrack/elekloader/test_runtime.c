/* SPDX-License-Identifier: GPL-3.0-or-later
 * Host check of the Octatrack trampolines (cc -DMODWERK_HOST): hooks point at
 * host functions; the loader itself is checked in sdk/runtime/loader/tests. */
#define MODWERK_RUNTIME_REFERENCE_EXTERNAL /* runtime.c defines the Octatrack's modwerk_machine_reference */
#ifndef RUNTIME_MODULES
#define RUNTIME_MODULES 128u /* build_core.py's Octatrack size */
#endif
#include "loader.c"
#include "runtime.c"
#include "sha256.c" /* the loader checks ABI 7 sites against stock hashes */
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
    /* A machine's renderer entry back to stock: the per-track slots (8 current, then 8 next renderers) still holding
     * its routine take stock's (beta run 2, finding 30); other slots, and sites outside the renderer table, stay. */
    uint32_t slots[16] = {0x40004008u, 0x48c45ad0u, 0x48c45ad0u, 0x400047f0u, [9] = 0x48c45ad0u, [10] = 0x400047d0u};
    const uint8_t fm[8] = {0x48, 0xc4, 0x5a, 0xd0, 0x48, 0xc4, 0xa4, 0x0c}, stock[8] = {0x40, 0x00, 0x40, 0x08, 0x40, 0x00, 0x47, 0xf0};
    modwerk_machine_types_restored(slots, 0x400d6400u, 4, fm, stock);
    CHECK(slots[1] == 0x48c45ad0u);                                   /* not a type entry: nothing changes */
    modwerk_machine_types_restored(slots, 0x400d6434u, 4, fm, stock);
    CHECK(slots[0] == 0x40004008u && slots[1] == 0x40004008u && slots[2] == 0x40004008u && slots[3] == 0x400047f0u &&
          slots[9] == 0x40004008u && slots[10] == 0x400047d0u);
    modwerk_machine_types_restored(slots, 0x400d6452u, 8, fm, stock); /* straddles the renderer table's end */
    CHECK(slots[10] == 0x400047d0u);                                  /* only whole entries inside it count */
    /* A start entry (0x400d6454 on) is called from its table, never copied into a slot: its restore moves no slot, even
     * one that holds the same word as a renderer (stock's start 0x400047d0 here). */
    const uint8_t start_gone[4] = {0x40, 0x00, 0x47, 0xd0}, start_now[4] = {0x40, 0x00, 0xf4, 0x50};
    modwerk_machine_types_restored(slots, 0x400d6454u + 24u, 4, start_gone, start_now);
    CHECK(slots[10] == 0x400047d0u);
    /* Nothing loaded: every event goes on to the firmware. */
    CHECK(modwerk_runtime_key(0x31, 1) == 0 && modwerk_runtime_enc(3, -2) == 0);
    modwerk_runtime_draw(frame); modwerk_runtime_tick();
    CHECK(frame[0] == 0 && modwerk_runtime_calls() == 1);
    static struct runtime_module module, other;
    module.hook[RUNTIME_TICK] = (uintptr_t)host_tick; module.hook[RUNTIME_DRAW] = (uintptr_t)host_draw;
    module.hook[RUNTIME_KEY] = (uintptr_t)host_key; module.hook[RUNTIME_ENC] = (uintptr_t)host_enc;
    set_live(3, &module);
    CHECK(modwerk_runtime_key(0x31, 1) == 1 && modwerk_runtime_key(0x28, 1) == 0 && modwerk_runtime_key(0x28, 0) == 0 && keys == 2);
    CHECK(modwerk_runtime_enc(3, -2) == 1 && modwerk_runtime_enc(0, 1) == 0);
    modwerk_runtime_draw(frame); CHECK(draws == 1 && frame[0] == 1);
    modwerk_runtime_tick(); CHECK(modwerk_runtime_value() == 1 && modwerk_runtime_calls() == 2);
    /* Several modules: every tick and draw hook runs, in position order; the first key hook that takes a key ends it. */
    other.hook[RUNTIME_TICK] = (uintptr_t)host_tick; other.hook[RUNTIME_KEY] = (uintptr_t)host_key;
    set_live(1, &other);
    modwerk_runtime_tick(); CHECK(modwerk_runtime_value() == 3 && ticks == 3 && modwerk_runtime_active() == 2);
    CHECK(modwerk_runtime_key(0x31, 1) == 1 && keys == 3); /* position 1 took it: position 3 never saw it */
    CHECK(modwerk_runtime_key(0x28, 1) == 0 && keys == 5);
    modwerk_runtime_draw(frame); CHECK(draws == 2);
    /* The track screen is redrawn, once, on the UI tick after the live modules change (a restore after a boot, an
     * install, a removal, a Keep or an Undo), read only when the owner epoch moved and is even. */
    CHECK(modwerk_test_redraws == 0);                    /* the epoch never moved: the set was not read */
    owner_epoch += 2; modwerk_runtime_tick(); CHECK(modwerk_test_redraws == 1);
    modwerk_runtime_tick(); CHECK(modwerk_test_redraws == 1);
    owner_epoch += 2; modwerk_runtime_tick(); CHECK(modwerk_test_redraws == 1); /* a prepare or discard: same set */
    set_live(1, 0); owner_epoch += 1; modwerk_runtime_tick(); CHECK(modwerk_test_redraws == 1); /* under way: wait */
    owner_epoch += 1; modwerk_runtime_tick(); CHECK(modwerk_test_redraws == 2);
    set_live(1, &module); set_live(3, 0); owner_epoch += 2; modwerk_runtime_tick(); CHECK(modwerk_test_redraws == 3); /* moved */
    set_live(1, 0); owner_epoch += 2; modwerk_runtime_tick(); CHECK(modwerk_test_redraws == 4); /* none left */
    owner_epoch += 2; modwerk_runtime_tick(); CHECK(modwerk_test_redraws == 4);
    /* The controller board wrote or put back a stock effect's page (#882): one redraw on the next tick, set unchanged. */
    modwerk_runtime_redraw_wanted = 1; modwerk_runtime_tick(); CHECK(modwerk_test_redraws == 5 && !modwerk_runtime_redraw_wanted);
    CHECK(modwerk_test_headers == modwerk_test_redraws); /* every redraw draws the header too (SRC's machine name) */
    modwerk_runtime_tick(); CHECK(modwerk_test_redraws == 5);
    /* A dispatch paused in its first callback resumes at the following position. An install, removal or
     * replacement there must be visible even in the same mask word. Check both ends of a word and the last slot. */
    unsigned next = 0;
    set_live(30, &module); set_live(31, &other); set_live(127, &module);
    CHECK(modwerk_runtime_next_hook(RUNTIME_KEY, &next) == (uintptr_t)host_key && next == 31);
    set_live(31, 0); set_live(32, &other);
    CHECK(modwerk_runtime_next_hook(RUNTIME_KEY, &next) == (uintptr_t)host_key && next == 33);
    CHECK(modwerk_runtime_next_hook(RUNTIME_KEY, &next) == (uintptr_t)host_key && next == 128);
    CHECK(!modwerk_runtime_next_hook(RUNTIME_KEY, &next));
    set_live(127, &other); /* no draw hook */
    next = 31;
    CHECK(!modwerk_runtime_next_hook(RUNTIME_DRAW, &next));
    set_live(30, 0); set_live(32, 0); set_live(127, 0);
    /* The transport long and the track bytes as the owner's MKII left them (23 November 2026): 0 after a panel STOP, 2
     * after a MIDI STOP or a pause, every track byte the same; 1 playing. Both stopped states are stopped, playing is
     * not, nor a value never seen. Before the fix only all zeros was, so a unit a host had stopped read as playing: a
     * braked Part stayed silent and the CPU guard judged stopped readings as played ones
     * (docs/verification/2026-11-23-octatrack-transport-word.md). */
    { uint8_t tracks[16] = {0};
      CHECK(modwerk_machine_transport_stopped(0u, tracks));
      for (unsigned i = 0; i < 16u; ++i) tracks[i] = 2u;
      CHECK(modwerk_machine_transport_stopped(2u, tracks));
      for (unsigned i = 0; i < 16u; ++i) tracks[i] = 1u;
      CHECK(!modwerk_machine_transport_stopped(1u, tracks));
      tracks[0] = 2u;
      CHECK(!modwerk_machine_transport_stopped(2u, tracks)); /* one track still running */
      for (unsigned i = 0; i < 16u; ++i) tracks[i] = 0u;
      CHECK(!modwerk_machine_transport_stopped(1u, tracks) && !modwerk_machine_transport_stopped(3u, tracks));
      tracks[15] = 3u;
      CHECK(!modwerk_machine_transport_stopped(0u, tracks)); }
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
