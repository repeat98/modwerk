/* SPDX-License-Identifier: GPL-3.0-or-later
 * The Octatrack's glue for the machine-neutral runtime loader
 * (sdk/runtime/loader), and trampolines from core-ot's hook bus to the
 * live modules' hooks. Development only.
 *
 * Module code and data run from the uncached alias, so no stale or dirty
 * data-cache line reaches them; instruction fetches there are still cached
 * (stock sets no instruction ACR and IDCM is cacheable), so the loader
 * invalidates the instruction and branch caches after writing code. A base built
 * with --cached-modules (build_core.py) runs them from the pool's cached alias
 * instead, and pushes the data-cache lines of new code before it invalidates
 * (loader.c, fxpage.c).
 *
 * Patches to stock code: only the RAM copy of the stock OS image below the
 * copy of the bootloader inside it that the OS can write to flash. Past that
 * copy come the DSP payloads, whose RAM holds the current bank once the
 * project loads (the bank pointer reads 0x400e21e0 in the emulator). With
 * interrupts masked, the loader checks every other task's live stack and
 * saved registers (the kernel's tasks, Octabam docs/firmware/KERNEL.md) for
 * an address inside a site before it writes. */
#include "runtime.h"
#ifdef MODWERK_DEV
void modwerk_cost_stamp(unsigned k); /* diag.c: the development profile of the base's hooks */
#define MW_STAMP(k) modwerk_cost_stamp(k)
#else
#define MW_STAMP(k) ((void)0)
#endif

#define STOCK_FROM 0x40000400u      /* the OS image in RAM */
#define BOOTLOADER_FROM 0x400de1e0u /* what the OS re-flashes the bootloader from; bank data follows it */

/* Each slot holding `gone` takes `now`. */
void modwerk_machine_retarget(volatile uint32_t *slot, unsigned n, uint32_t gone, uint32_t now)
{
    for (unsigned k = 0; k < n; ++k) if (slot[k] == gone) slot[k] = now;
}
/* Stock binds a track in the frame builder (0x4000aad0, the DSP frame interrupt): on a trig that asks for it, it
 * copies the renderer of the track's machine type (0x400d6434[type]) into the track's next-renderer slot
 * (0x400d61f0[track], at 0x4000c004), and each frame copies that into the current-renderer slot (0x400d61d0[track],
 * 0x4000d514) and calls both (0x4000d43c, 0x4000d52c). Both slots hold renderers only: a start routine is called from
 * its table (0x400d6454[type], 0x4000d47e) and never copied. A module's site on a renderer entry leaves its routine
 * in the slots of tracks bound while it was live: when the entry goes back to stock, so do those slots, in the same
 * masked span, or the frame keeps calling a module that left (beta run 2, finding 30: FM Synth's sy_render, until an
 * install copied another module over it). */
#define MACHINE_TYPES 0x400d6434u /* the 8-entry renderer table */
#define MACHINE_SLOTS 0x400d61d0u /* 8 current renderers, then 8 next renderers (0x400d61f0) */
void modwerk_machine_types_restored(volatile uint32_t *slots, uint32_t address, uint32_t length, const uint8_t *patched,
                                    const uint8_t *stock)
{
    for (uint32_t at = (address + 3u) & ~3u; at + 4u <= address + length; at += 4u) {
        if (at < MACHINE_TYPES || at >= MACHINE_TYPES + 32u) continue; /* the renderer entries; starts are never copied */
        const uint8_t *g = patched + (at - address), *w = stock + (at - address);
        uint32_t gone = (uint32_t)g[0] << 24 | (uint32_t)g[1] << 16 | (uint32_t)g[2] << 8 | g[3];
        uint32_t now = (uint32_t)w[0] << 24 | (uint32_t)w[1] << 16 | (uint32_t)w[2] << 8 | w[3];
        if (gone != now) modwerk_machine_retarget(slots, 16u, gone, now);
    }
}
#ifndef MODWERK_HOST
void modwerk_machine_site_restored(uint32_t address, uint32_t length, const uint8_t *patched, const uint8_t *stock)
{
    modwerk_machine_types_restored((volatile uint32_t *)MACHINE_SLOTS, address, length, patched, stock);
}
#endif

/* Code/data references may retain either alias of the same physical DRAM. */
uint32_t modwerk_machine_reference(uint32_t value)
{
    return value >= STOCK_FROM && value < 0x47f00000u ? value + 0x08000000u : value;
}

#ifdef MODWERK_HOST
int modwerk_test_stopped = 1;
int modwerk_machine_stopped(void) { return modwerk_test_stopped; }
void *modwerk_machine_uncached(void *p) { return p; }
void modwerk_machine_invalidate_code(void) {}
uint8_t *modwerk_machine_code(uint32_t address) { (void)address; return 0; }
void modwerk_machine_flush_data(uint32_t address, uint32_t length) { (void)address; (void)length; }
uint32_t modwerk_machine_mask(void) { return 0; }
void modwerk_machine_unmask(uint32_t sr) { (void)sr; }
uint32_t modwerk_machine_lock(void) { return 0; }
void modwerk_machine_unlock(uint32_t sr) { (void)sr; }
unsigned modwerk_machine_paused(struct runtime_span *span, unsigned max, const struct runtime_context *context)
{ (void)span; (void)context; return max + 1u; }
#else
#define U8(a) (*(volatile uint8_t *)(a))
#define U32(a) (*(volatile uint32_t *)(a))
/* The logger's flush check (sdk/runtime/logging/stock_140c.c), minus its
 * card and engine-task conditions: no track running, no recorder active. */
int modwerk_machine_stopped(void)
{
    for (unsigned i = 0; i < 16; ++i) if (U8(0x80006500u + i) || U8(0x80004f1eu + i * 84u)) return 0;
    return U32(0x800065b8u) == 0;
}
void *modwerk_machine_uncached(void *p) { return (void *)((uintptr_t)p + 0x08000000u); }
/* Every stock CACR write uses 0xa40ce000 (boot write guarded by usb_base.py),
 * which already sets BCINVA; bit 8 adds ICINVA. The data cache is untouched. */
void modwerk_machine_invalidate_code(void) { __asm__ __volatile__("movec %0,%%cacr\n\tnop" :: "d"(0xa40ce100u) : "memory"); }
uint8_t *modwerk_machine_code(uint32_t address) { return (uint8_t *)(uintptr_t)(address + 0x08000000u); }
#ifdef MODWERK_CACHED_MODULES
/* build_core.py --cached-modules: module code runs from the cached alias, so whatever the data cache holds of an
 * extent must reach memory before the instruction cache fetches it (loader.c, fxpage.c). CPUSHL names a line by its
 * set and way (An[1:0] the way), not by its address: push every way of each set the range maps to. That pushes and,
 * with CACR's DPI clear as stock leaves it, invalidates the range's lines and any others in those sets. Every line
 * of the range, by its own address: a shortcut that pushed 0x2000 bytes of sets "once for the whole cache" left half
 * of a 17 KB extent (VECTOR) dirty on the owner's MKII (beta finding 60: memory still held the BSS zeros at the
 * module's ui_tick entry while the data cache held its code), so this cache has more sets than address bits 12:4
 * name. The NOP waits for the pushes to reach memory. */
void modwerk_machine_flush_data(uint32_t address, uint32_t length)
{
    uint32_t from = address & ~15u, to = address + length;
    for (uint32_t line = from; line < to; line += 16u)
        for (uint32_t way = 0; way < 4u; ++way) __asm__ __volatile__("cpushl %%dc,(%0)" :: "a"(line | way) : "memory");
    __asm__ __volatile__("nop" ::: "memory");
}
#else
/* CPUSHL pushes a dirty 16-byte line and, with CACR's DPI clear as stock
 * leaves it, invalidates it, so no cached copy overwrites the patch later. */
void modwerk_machine_flush_data(uint32_t address, uint32_t length)
{
    for (uint32_t line = address & ~15u; line < address + length; line += 16u)
        __asm__ __volatile__("cpushl %%dc,(%0)" :: "a"(line) : "memory");
}
#endif
/* How long interrupts stay masked here, outermost spans only, in counts of the frame timer DTCN3 (132 MHz; a frame,
 * 16 samples, is about 48,000). Core 0's DMA2 dies when its frame's bank word waits a ring half for the host. */
#define DTCN3 (*(volatile uint32_t *)0xfc07c00cu)
volatile uint32_t modwerk_masked_max, modwerk_masked_last, modwerk_masked_spans;
static uint32_t masked_at;
uint32_t modwerk_machine_mask(void)
{
    uint32_t sr;
    __asm__ __volatile__("move.w %%sr,%0\n\tmove.w #0x2700,%%sr" : "=d"(sr) :: "memory");
    if ((sr & 0x0700u) != 0x0700u) masked_at = DTCN3;
    return sr;
}
void modwerk_machine_unmask(uint32_t sr)
{
    if ((sr & 0x0700u) != 0x0700u) {
        uint32_t d = DTCN3 - masked_at;
        modwerk_masked_last = d, modwerk_masked_spans = modwerk_masked_spans + 1;
        if (d > modwerk_masked_max) modwerk_masked_max = d;
    }
    __asm__ __volatile__("move.w %0,%%sr" :: "d"(sr) : "memory");
}
/* Level 4 (KERNEL.md's ICR table): the time slice (1), the storage timer (2), ATA DMA (3) and USB (4) wait; the DSP
 * frame (5) and the eDMA frame transfer (6) run, so the frames go on whatever the loader does. Never lowers. */
uint32_t modwerk_machine_lock(void)
{
    uint32_t sr;
    __asm__ __volatile__("move.w %%sr,%0" : "=d"(sr) :: "memory");
    if ((sr & 0x0700u) < 0x0400u) __asm__ __volatile__("move.w %0,%%sr" :: "d"((sr & ~0x0700u) | 0x0400u) : "memory");
    return sr;
}
void modwerk_machine_unlock(uint32_t sr) { __asm__ __volatile__("move.w %0,%%sr" :: "d"(sr) : "memory"); }

/* TCB, lowest stack address, stack size (KERNEL.md). Main's stack is the boot
 * stack below 0x46c7becc; only the space above its TCB is assumed. */
static const struct { uint32_t tcb, stack, size; } tasks[] = {
    {0x46c7fb0cu, 0x46c7ea20u, 0x1000u}, {0x460bcc2cu, 0x460bc42cu, 0x800u}, {0x460d4f80u, 0x460d4780u, 0x800u},
    {0x460d59d4u, 0x460d51d4u, 0x800u}, {0x460fab80u, 0x460fabd4u, 0x2000u}, {0x460ffd44u, 0x460fdd44u, 0x2000u},
    {0x460e0e38u, 0x460dee38u, 0x2000u}, {0x460ddde4u, 0x460d9de4u, 0x4000u}, {0x46105508u, 0x4610555cu, 0x2000u},
    {0x46c7bed8u, 0x460d6de4u, 0x2000u}, {0x46c7ae84u, 0x46c7aed8u, 0xff4u},
};
#define TASKS (sizeof tasks / sizeof tasks[0])
#define CURRENT_TCB 0x800068fcu
#define READY_LISTS 0x800068dcu /* eight heads; higher index, higher priority */
static int known(uint32_t tcb)
{
    for (unsigned i = 0; i < TASKS; ++i) if (tasks[i].tcb == tcb) return 1;
    return 0;
}
/* A ready task outside the measured table would go unchecked: refuse instead. */
static int ready_tasks_known(void)
{
    for (unsigned prio = 0; prio < 8; ++prio) {
        uint32_t head = U32(READY_LISTS + 4u * prio), t = head;
        for (unsigned n = 0; t; ++n) {
            if (n > TASKS || !known(t)) return 0;
            t = U32(t);
            if (t == head) break;
        }
    }
    return 1;
}
unsigned modwerk_machine_paused(struct runtime_span *span, unsigned max, const struct runtime_context *context)
{
    uint32_t current = U32(CURRENT_TCB);
    unsigned n = 0;
    if (!context || !known(current) || !ready_tasks_known() || max < 2u * TASKS) return max + 1u;
    span[n++] = (struct runtime_span){(const uint8_t *)context->registers, (const uint8_t *)(context->registers + 16)};
    for (unsigned i = 0; i < TASKS; ++i) {
        uint32_t top = tasks[i].stack + tasks[i].size, saved = tasks[i].tcb == current ? context->registers[15] : U32(tasks[i].tcb + 0x48u);
        if (saved < tasks[i].stack || saved > top) return max + 1u;
        span[n++] = (struct runtime_span){(const uint8_t *)(uintptr_t)saved, (const uint8_t *)(uintptr_t)top};
        if (tasks[i].tcb != current) /* saved d0-d7/a0-a7 */
            span[n++] = (struct runtime_span){(const uint8_t *)(uintptr_t)(tasks[i].tcb + 0x0cu), (const uint8_t *)(uintptr_t)(tasks[i].tcb + 0x4cu)};
    }
    return n;
}
/* The running task's measured stack (the table above): 1 and its bounds, 0 when the task is unknown. */
int modwerk_machine_stack(uintptr_t *lo, uintptr_t *hi)
{
    uint32_t current = U32(CURRENT_TCB);
    for (unsigned i = 0; i < TASKS; ++i)
        if (tasks[i].tcb == current) { *lo = tasks[i].stack, *hi = tasks[i].stack + tasks[i].size; return 1; }
    return 0;
}
#endif

#ifndef MODWERK_DSP_LOADER
/* This base has no DSP loader (dsp.c, build_core.py --dsp-loader): no module brings DSP code. */
int modwerk_machine_dsp_admit(const struct runtime_dsp *from, struct runtime_dsp *to) { (void)from; return to->count ? RUNTIME_MALFORMED : RUNTIME_OK; }
void modwerk_machine_dsp_switch(const struct runtime_dsp *from, const struct runtime_dsp *to) { (void)from; (void)to; }
#endif

int modwerk_machine_patchable(uint32_t address, uint32_t length)
{
    return address >= STOCK_FROM && address < BOOTLOADER_FROM && length <= BOOTLOADER_FROM - address;
}

/* Hooks run in the sys task (core-ot's ev_tick, ev_key, ev_enc and nearly
 * always ev_draw), in position order: the first key or encoder hook that
 * returns nonzero takes the event. The tick also counts, for diagnostics. */
/* Reads the position once: memory a hook still runs in is not reclaimed while
 * this task holds an address inside it. */
static uintptr_t hook(unsigned position, enum runtime_event e)
{
    const struct runtime_module *m = modwerk_runtime_module(position);
    return m ? m->hook[e] : 0;
}
void modwerk_runtime_tick(void)
{
    MW_STAMP(1);
    for (unsigned i = 0; i < RUNTIME_MODULES; ++i) {
        uintptr_t f = hook(i, RUNTIME_TICK);
        if (f) ((void (*)(struct modwerk_runtime_api *))f)(&modwerk_runtime_api);
    }
    modwerk_runtime_ticks = modwerk_runtime_ticks + 1;
}
void modwerk_runtime_draw(unsigned char *frame)
{
    MW_STAMP(21);
    for (unsigned i = 0; i < RUNTIME_MODULES; ++i) {
        uintptr_t f = hook(i, RUNTIME_DRAW);
        if (f) ((void (*)(unsigned char *))f)(frame);
    }
}
int modwerk_runtime_key(int code, int pressed)
{
    for (unsigned i = 0; i < RUNTIME_MODULES; ++i) {
        uintptr_t f = hook(i, RUNTIME_KEY);
        if (f && ((int (*)(int, int))f)(code, pressed)) return 1;
    }
    return 0;
}
int modwerk_runtime_enc(int encoder, int delta)
{
    for (unsigned i = 0; i < RUNTIME_MODULES; ++i) {
        uintptr_t f = hook(i, RUNTIME_ENC);
        if (f && ((int (*)(int, int))f)(encoder, delta)) return 1;
    }
    return 0;
}
