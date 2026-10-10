/* SPDX-License-Identifier: GPL-3.0-or-later
 * Machine-neutral runtime module loader (README.md): parses and relocates a
 * package into the inactive of two slots, publishes by swapping one pointer,
 * restores by swapping back, and reuses old code only once the machine's
 * trampolines show nothing can still be running it. Engine task only.
 *
 * shortcut: fixed staging and two 16 KiB slots in the base's .bss; upgrade
 * to ledger allocation once real modules need the space. */
#include "loader.h"

static uint8_t slots[2][RUNTIME_SLOT_BYTES] __attribute__((aligned(16)));
uint8_t modwerk_runtime_staging[RUNTIME_HEADER_BYTES + 4u * RUNTIME_EVENTS + RUNTIME_SLOT_BYTES + 4u * RUNTIME_RELOCATIONS];
struct modwerk_runtime_api modwerk_runtime_api;
volatile uint32_t modwerk_runtime_ticks, modwerk_runtime_busy;
static struct runtime_module modules[2];
static const struct runtime_module *volatile active;
static const struct runtime_module *candidate, *previous;
static int active_slot = -1, candidate_slot = -1, previous_slot = -1, prepared, held;
static uint32_t swapped_at;

const struct runtime_module *modwerk_runtime_active(void) { return active; }
uint32_t modwerk_runtime_value(void) { return modwerk_runtime_api.value; }
uint32_t modwerk_runtime_calls(void) { return modwerk_runtime_ticks; }

static uint32_t be32(const uint8_t *p) { return (uint32_t)p[0] << 24 | (uint32_t)p[1] << 16 | (uint32_t)p[2] << 8 | p[3]; }
static int settled(void) { return modwerk_runtime_ticks - swapped_at >= 2u && !modwerk_runtime_busy; }

static int enter(void *u) { (void)u; if (!modwerk_machine_stopped()) return 0; held = 1; return 1; }
static int safe(void *u) { (void)u; return held && modwerk_machine_stopped(); }
static int leave(void *u) { (void)u; held = 0; return 1; }
static int prepare(void *u, const uint8_t *data, uint32_t length)
{
    (void)u;
    if (length < RUNTIME_HEADER_BYTES || data[0] != 'M' || data[1] != 'W' || data[2] != 'R' || data[3] != 'M' ||
        be32(data + 4) != 0x00020000u) return 0;
    uint32_t image = be32(data + 8), bss = be32(data + 12), count = be32(data + 16), hooks = be32(data + 20);
    if (image > RUNTIME_SLOT_BYTES || bss > RUNTIME_SLOT_BYTES - image || (!image && bss) || hooks > RUNTIME_EVENTS ||
        count > RUNTIME_RELOCATIONS || length != RUNTIME_HEADER_BYTES + 4u * hooks + image + 4u * count) return 0;
    const uint8_t *from = data + RUNTIME_HEADER_BYTES + 4u * hooks, *relocation = from + image;
    uint32_t hook[RUNTIME_EVENTS];
    for (uint32_t i = 0; i < RUNTIME_EVENTS; ++i) {
        hook[i] = i < hooks ? be32(data + RUNTIME_HEADER_BYTES + 4u * i) : RUNTIME_NONE;
        if (hook[i] != RUNTIME_NONE && (hook[i] >= image || hook[i] & 1u)) return 0;
    }
    /* A slot freed by rollback may still be running until the tick passes. */
    if (!settled()) return 0;
    candidate = 0; candidate_slot = -1;
    if (image) {
        int slot = active_slot == 0 ? 1 : 0;
        uint8_t *to = modwerk_machine_uncached(slots[slot]);
        for (uint32_t i = 0; i < image; ++i) to[i] = from[i];
        for (uint32_t i = 0; i < bss; ++i) to[image + i] = 0;
        /* Each word must point into the module; one applied twice no longer does. */
        for (uint32_t i = 0; i < count; ++i) {
            uint32_t r = be32(relocation + 4u * i), v;
            if (r & 1u || image < 4u || r > image - 4u || (v = be32(to + r)) >= image + bss) return 0;
            v += (uint32_t)(uintptr_t)to;
            to[r] = (uint8_t)(v >> 24); to[r + 1] = (uint8_t)(v >> 16); to[r + 2] = (uint8_t)(v >> 8); to[r + 3] = (uint8_t)v;
        }
        modwerk_machine_invalidate_code();
        for (uint32_t i = 0; i < RUNTIME_EVENTS; ++i)
            modules[slot].hook[i] = hook[i] == RUNTIME_NONE ? 0 : (uintptr_t)to + hook[i];
        candidate = &modules[slot]; candidate_slot = slot;
    }
    prepared = 1;
    return 1;
}
static int discard(void *u) { (void)u; prepared = 0; candidate = 0; candidate_slot = -1; return 1; }
static enum mu_publication publish(void *u)
{
    (void)u;
    if (!prepared) return MU_UNCERTAIN;
    previous = active; previous_slot = active_slot;
    active = candidate; active_slot = candidate_slot;
    swapped_at = modwerk_runtime_ticks; prepared = 0;
    return MU_APPLIED;
}
static int restore(void *u)
{
    (void)u;
    active = previous; active_slot = previous_slot;
    swapped_at = modwerk_runtime_ticks;
    return 1;
}
static int retire(void *u)
{
    (void)u;
    if (!settled()) return 0; /* The host retries ACCEPT. */
    previous = 0; previous_slot = -1;
    return 1;
}
const struct mu_backend modwerk_runtime_backend = {0, enter, safe, leave, prepare, discard, publish, restore, retire};
