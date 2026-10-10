/* SPDX-License-Identifier: GPL-3.0-or-later
 * The Octatrack's glue for the machine-neutral runtime loader
 * (sdk/runtime/loader): when activation is safe, the uncached alias, the
 * instruction-cache flush, and trampolines from core-ot's hook bus to the
 * active module's hooks. Development only.
 *
 * Module code and data run from the uncached alias. Data accesses there
 * bypass the data cache, so no stale or dirty lines of an earlier module
 * reach the slot; instruction fetches there are still cached (stock sets no
 * instruction ACR and IDCM is cacheable), so the loader invalidates the
 * instruction and branch caches after copying. */
#include "runtime.h"

#ifdef MODWERK_HOST
int modwerk_test_stopped = 1;
int modwerk_machine_stopped(void) { return modwerk_test_stopped; }
void *modwerk_machine_uncached(void *p) { return p; }
void modwerk_machine_invalidate_code(void) {}
#else
#define U8(a) (*(volatile uint8_t *)(a))
/* The logger's flush check (sdk/runtime/logging/stock_140c.c), minus its
 * card and engine-task conditions: no track running, no recorder active. */
int modwerk_machine_stopped(void)
{
    for (unsigned i = 0; i < 16; ++i) if (U8(0x80006500u + i) || U8(0x80004f1eu + i * 84u)) return 0;
    return *(volatile uint32_t *)0x800065b8u == 0;
}
void *modwerk_machine_uncached(void *p) { return (void *)((uintptr_t)p + 0x08000000u); }
/* Every stock CACR write uses 0xa40ce000 (boot write guarded by usb_base.py),
 * which already sets BCINVA; bit 8 adds ICINVA. The data cache is untouched. */
void modwerk_machine_invalidate_code(void) { __asm__ __volatile__("movec %0,%%cacr\n\tnop" :: "d"(0xa40ce100u) : "memory"); }
#endif

/* The sys task runs ev_tick, ev_key, ev_enc and nearly always ev_draw one
 * after another, so the tick passing a swap shows their hooks have returned;
 * draws also count as busy for the exceptions. */
void modwerk_runtime_tick(void)
{
    const struct runtime_module *m = modwerk_runtime_active();
    if (m && m->hook[RUNTIME_TICK]) ((void (*)(struct modwerk_runtime_api *))m->hook[RUNTIME_TICK])(&modwerk_runtime_api);
    modwerk_runtime_ticks = modwerk_runtime_ticks + 1;
}
void modwerk_runtime_draw(unsigned char *frame)
{
    modwerk_runtime_busy = modwerk_runtime_busy + 1;
    const struct runtime_module *m = modwerk_runtime_active();
    if (m && m->hook[RUNTIME_DRAW]) ((void (*)(unsigned char *))m->hook[RUNTIME_DRAW])(frame);
    modwerk_runtime_busy = modwerk_runtime_busy - 1;
}
int modwerk_runtime_key(int code, int pressed)
{
    const struct runtime_module *m = modwerk_runtime_active();
    return m && m->hook[RUNTIME_KEY] ? ((int (*)(int, int))m->hook[RUNTIME_KEY])(code, pressed) : 0;
}
int modwerk_runtime_enc(int encoder, int delta)
{
    const struct runtime_module *m = modwerk_runtime_active();
    return m && m->hook[RUNTIME_ENC] ? ((int (*)(int, int))m->hook[RUNTIME_ENC])(encoder, delta) : 0;
}
