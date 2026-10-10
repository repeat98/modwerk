/* SPDX-License-Identifier: GPL-3.0-or-later
 * One runtime module slot for the private base: the upload controller's
 * backend (engine task) and the slot's trampoline (core-ot's ev_tick, sys
 * task). Development only.
 *
 * Package, big-endian: "MWRM", ABI u16 = 1, flags u16 = 0, entry offset
 * u32, code length u32, then position-independent ColdFire code. A code
 * length of zero removes the module. The entry is called as
 * entry(struct modwerk_runtime_api *) on every tick.
 *
 * Code is written through the uncached alias, but instruction fetches there
 * are still cached (stock sets no instruction ACR and IDCM is cacheable), so
 * prepare invalidates the instruction and branch caches after copying.
 *
 * shortcut: fixed 16 KiB staging and two 16 KiB code slots in the base's
 * .bss; upgrade to ledger allocation once real modules need the space. */
#include "upload.h"
#include "runtime.h"

#ifdef MODWERK_HOST
#define UNCACHED(p) ((void *)(p))
int modwerk_test_stopped = 1;
static int stopped(void) { return modwerk_test_stopped; }
static void invalidate_code(void) {}
#else
#define UNCACHED(p) ((void *)((uintptr_t)(p) + 0x08000000u))
#define U8(a) (*(volatile uint8_t *)(a))
/* The logger's flush check (sdk/runtime/logging/stock_140c.c), minus its
 * card and engine-task conditions: no track running, no recorder active. */
static int stopped(void)
{
    for (unsigned i = 0; i < 16; ++i) if (U8(0x80006500u + i) || U8(0x80004f1eu + i * 84u)) return 0;
    return *(volatile uint32_t *)0x800065b8u == 0;
}
/* Every stock CACR write uses 0xa40ce000 (boot write guarded by usb_base.py),
 * which already sets BCINVA; bit 8 adds ICINVA. The data cache is untouched. */
static void invalidate_code(void) { __asm__ __volatile__("movec %0,%%cacr\n\tnop" :: "d"(0xa40ce100u) : "memory"); }
#endif

static uint8_t slots[2][RUNTIME_SLOT_BYTES] __attribute__((aligned(16)));
uint8_t modwerk_runtime_staging[RUNTIME_HEADER_BYTES + RUNTIME_SLOT_BYTES];
struct modwerk_runtime_api modwerk_runtime_api;
static runtime_entry volatile active;
static runtime_entry candidate, previous;
static int active_slot = -1, candidate_slot = -1, previous_slot = -1, prepared, held;
static volatile uint32_t calls;
static uint32_t swapped_at;

/* sys task. `calls` advancing past a swap proves no call into older code
 * is still running. */
void modwerk_runtime_tick(void)
{
    runtime_entry entry = active;
    if (entry) entry(&modwerk_runtime_api);
    calls = calls + 1;
}
uint32_t modwerk_runtime_value(void) { return modwerk_runtime_api.value; }
runtime_entry modwerk_runtime_active(void) { return active; }

static uint32_t be32(const uint8_t *p) { return (uint32_t)p[0] << 24 | (uint32_t)p[1] << 16 | (uint32_t)p[2] << 8 | p[3]; }
static int settled(void) { return calls - swapped_at >= 2u; }

static int enter(void *u) { (void)u; if (!stopped()) return 0; held = 1; return 1; }
static int safe(void *u) { (void)u; return held && stopped(); }
static int leave(void *u) { (void)u; held = 0; return 1; }
static int prepare(void *u, const uint8_t *data, uint32_t length)
{
    (void)u;
    if (length < RUNTIME_HEADER_BYTES || data[0] != 'M' || data[1] != 'W' || data[2] != 'R' || data[3] != 'M' ||
        be32(data + 4) != 0x00010000u) return 0;
    uint32_t entry = be32(data + 8), code = be32(data + 12);
    if (code != length - RUNTIME_HEADER_BYTES || code > RUNTIME_SLOT_BYTES || (code && entry >= code)) return 0;
    /* A slot freed by rollback may still be running until the tick passes. */
    if (!settled()) return 0;
    candidate = 0; candidate_slot = -1;
    if (code) {
        candidate_slot = active_slot == 0 ? 1 : 0;
        uint8_t *to = UNCACHED(slots[candidate_slot]);
        for (uint32_t i = 0; i < code; ++i) to[i] = data[RUNTIME_HEADER_BYTES + i];
        invalidate_code();
        candidate = (runtime_entry)(uintptr_t)(to + entry);
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
    swapped_at = calls; prepared = 0;
    return MU_APPLIED;
}
static int restore(void *u)
{
    (void)u;
    active = previous; active_slot = previous_slot;
    swapped_at = calls;
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
