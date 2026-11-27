/* SPDX-License-Identifier: GPL-3.0-or-later
 * The Analog Rytm MKII's glue for the machine-neutral runtime loader (sdk/runtime/loader, README.md "Porting to another
 * machine"), after the Model:Cycles' (sdk/machines/model-cycles/elekloader/base/runtime.c, durchgemacht) and the
 * Octatrack's, and the trampolines from core-ar2's hook bus to the live modules' hooks. Every base (base.json's common).
 *
 * What it rests on (OS 1.74, read from the code; the kernel and caches are the Model:Cycles' and the Octatrack's design):
 * - Caches: the OS entry sets CACR 0xa50ce100 and data ACR0 0x4007e020 (0x400008de): 0x40000000-0x47ffffff copyback,
 *   no instruction ACR. Anything else is cache-inhibited, so DDR's mirror at +0x08000000 is the uncached alias stock
 *   itself uses for its DMA buffers and heap (0x48000000 up, README "Memory and budgets"). Module code and data run
 *   from it; instruction fetches there are still cached, so the loader invalidates the instruction and branch caches
 *   after writing code.
 * - Stock code: the OS image from 0x40000400; its .data image starts at 0x402ce000 (copied to SRAM at boot, 0x400007e4,
 *   and the start of stock's .bss, cleared at 0x4000083a), so sites go below it only.
 * - Tasks: init(tcb, entry, priority, stack, size) at 0x40000de4 sets the first saved SP (tcb + 0x48) and the ready
 *   list head (tcb + 8, 0x42f678e4 + 4 x priority). The switch (0x40000410) saves d0-d7/a0-a7 at tcb + 0x0c; the
 *   running task is 0x42f67924. Its sixteen calls, each with constant arguments (one through a task class's
 *   constructor, 0x40032ee0 from 0x400333a4), give the table below; two are the factory test console's, created only
 *   behind a boot flag (0x40100b04).
 * - Interrupts: the audio interrupt (vector 191, 0x4011fb66) runs at level 5 (ICR 0xfc04c07f, 0x4011fb10): a lock at
 *   level 4 keeps the audio going, as on the Octatrack and the Model:Cycles.
 * - Playing: the sequencer's word SEQ_PLAYING_AT (0x405c8cf8, the base's cflags). The Rytm records no audio.
 *
 * Idle, it costs nothing on the audio side and next to nothing on the UI side: no render hook, and each trampoline
 * returns as soon as it finds no live module (MACHINE_RECIPE.md: a hook costs nothing while no module uses it). */
#include <stdint.h>
#include "loader.h"

#define STOCK_FROM 0x40000400u
#define STOCK_DATA 0x402ce000u      /* the .data image: stock code and constants end here */
#define ALIAS 0x08000000u           /* DDR's uncached mirror */
#define DDR_END 0x48000000u

volatile uint32_t mw_runtime_ticks;

uint32_t modwerk_machine_reference(uint32_t value)
{
    return value >= 0x40000000u && value < DDR_END ? value + ALIAS : value;
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
/* GCC calls these for struct copies and clears; there is no C library. Kept from turning into calls of themselves. */
__attribute__((optimize("no-tree-loop-distribute-patterns"))) void *memcpy(void *to, const void *from, unsigned long n)
{
    uint8_t *t = to;
    const uint8_t *f = from;
    while (n--) *t++ = *f++;
    return to;
}
__attribute__((optimize("no-tree-loop-distribute-patterns"))) void *memset(void *to, int v, unsigned long n)
{
    uint8_t *t = to;
    while (n--) *t++ = (uint8_t)v;
    return to;
}
#define U32(a) (*(volatile uint32_t *)(a))
int modwerk_machine_stopped(void) { return !U32(SEQ_PLAYING_AT); }
void *modwerk_machine_uncached(void *p) { return (void *)((uintptr_t)p + ALIAS); }
/* Stock's CACR without the invalidate-all bits, plus ICINVA (bit 8): the instruction and branch caches. */
void modwerk_machine_invalidate_code(void) { __asm__ __volatile__("movec %0,%%cacr\n\tnop" :: "d"(0xa40ce100u) : "memory"); }
uint8_t *modwerk_machine_code(uint32_t address) { return (uint8_t *)(uintptr_t)(address + ALIAS); }
/* CPUSHL names a line by its set and way (An[1:0] the way, link.s's RAM boot), not by its address: push every way of
 * each set the range maps to, as the Octatrack's cached path does. With CACR's DPI clear as stock leaves it, that
 * pushes and invalidates the range's lines and any others in those sets, so no cached copy overwrites the patch
 * later. The NOP waits for the pushes to reach memory. */
void modwerk_machine_flush_data(uint32_t address, uint32_t length)
{
    for (uint32_t line = address & ~15u; line < address + length; line += 16u)
        for (uint32_t way = 0; way < 4u; ++way)
            __asm__ __volatile__("cpushl %%dc,(%0)" :: "a"(line | way) : "memory");
    __asm__ __volatile__("nop" ::: "memory");
}
/* How long interrupts stay masked, outermost spans only, in DMA timer 0 counts (132 MHz, 0x40100ae2; an audio block,
 * 667 us, is 88,000): read back with the link's MEM, so only development bases report them. */
#define DTCN0 U32(0xfc07000cu)
volatile uint32_t mw_masked_max, mw_masked_last, mw_masked_spans;
static uint32_t masked_at;
uint32_t modwerk_machine_mask(void)
{
    uint32_t sr;
    __asm__ __volatile__("move.w %%sr,%0\n\tmove.w #0x2700,%%sr" : "=d"(sr) :: "memory");
    if ((sr & 0x0700u) != 0x0700u) masked_at = DTCN0;
    return sr;
}
void modwerk_machine_unmask(uint32_t sr)
{
    if ((sr & 0x0700u) != 0x0700u) {
        uint32_t d = DTCN0 - masked_at;
        mw_masked_last = d, mw_masked_spans = mw_masked_spans + 1u;
        if (d > mw_masked_max) mw_masked_max = d;
    }
    __asm__ __volatile__("move.w %0,%%sr" :: "d"(sr) : "memory");
}
/* Level 4: the time slice, the sequencer and USB wait; the audio (5) runs on. Never lowers. */
uint32_t modwerk_machine_lock(void)
{
    uint32_t sr;
    __asm__ __volatile__("move.w %%sr,%0" : "=d"(sr) :: "memory");
    if ((sr & 0x0700u) < 0x0400u) __asm__ __volatile__("move.w %0,%%sr" :: "d"((sr & ~0x0700u) | 0x0400u) : "memory");
    return sr;
}
void modwerk_machine_unlock(uint32_t sr) { __asm__ __volatile__("move.w %0,%%sr" :: "d"(sr) : "memory"); }

/* The sixteen tasks the OS creates (0x40000de4's callers): TCB, lowest stack address, stack size. */
static const struct { uint32_t tcb, stack, size; } tasks[] = {
    {0x413d93d4u, 0x413d9428u, 0x1000u}, {0x413da6e8u, 0x413da73cu, 0x800u}, {0x413dfc20u, 0x413dfc74u, 0x4000u},
    {0x418f4c20u, 0x418f4c74u, 0x8000u}, {0x418fd8dcu, 0x418fd930u, 0x8000u}, {0x4190a604u, 0x41909604u, 0x1000u},
    {0x4191bb74u, 0x4191bbc8u, 0x4000u}, {0x419209a0u, 0x41932e14u, 0x8000u}, {0x4192092cu, 0x41929e14u, 0x8000u},
    {0x419208b8u, 0x41920e14u, 0x8000u}, {0x4193c058u, 0x4193cac4u, 0x4000u}, {0x41943f00u, 0x4194477cu, 0x28000u},
    {0x419b2324u, 0x419b2378u, 0x4000u}, {0x419ae2d0u, 0x419ae324u, 0x4000u}, {0x419b6798u, 0x419b67ecu, 0x4000u},
    {0x413d2f48u, 0x413d2f9cu, 0x4000u},
};
#define TASKS (sizeof tasks / sizeof tasks[0])
/* The most spans paused() reports: the trap's registers, every task's stack, and the saved registers of every task but
 * the running one: 1 + TASKS + (TASKS - 1) = 2 x TASKS. The loader's array holds RUNTIME_PAUSED; a guard one span too
 * strict answered "unknown" every time with sixteen tasks, so the loader refused every switch with sites and freed no
 * pool (owner's review of #1934, 26 November 2026). */
_Static_assert(2u * TASKS <= RUNTIME_PAUSED, "paused() needs room for 2 x TASKS spans");
#define CURRENT_TCB 0x42f67924u
#define READY_LISTS 0x42f678e4u     /* one head a priority; the OS creates tasks at 0 to 10 */
#define PRIORITIES 11u
static int known(uint32_t tcb)
{
    for (unsigned i = 0; i < TASKS; ++i) if (tasks[i].tcb == tcb) return 1;
    return 0;
}
/* A ready task outside the table would go unchecked: refuse instead. */
static int ready_tasks_known(void)
{
    for (unsigned prio = 0; prio < PRIORITIES; ++prio) {
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
        uint32_t top = tasks[i].stack + tasks[i].size, saved;
        if (tasks[i].tcb != current && !U32(tasks[i].tcb + 8u)) continue; /* never created: it cannot run */
        saved = tasks[i].tcb == current ? context->registers[15] : U32(tasks[i].tcb + 0x48u);
        if (saved < tasks[i].stack || saved > top) return max + 1u;
        span[n++] = (struct runtime_span){(const uint8_t *)(uintptr_t)saved, (const uint8_t *)(uintptr_t)top};
        if (tasks[i].tcb != current) /* saved d0-d7/a0-a7 */
            span[n++] = (struct runtime_span){(const uint8_t *)(uintptr_t)(tasks[i].tcb + 0x0cu), (const uint8_t *)(uintptr_t)(tasks[i].tcb + 0x4cu)};
    }
    return n;
}
#endif

/* This base has no DSP: no module brings DSP code. */
int modwerk_machine_dsp_admit(const struct runtime_dsp *from, struct runtime_dsp *to) { (void)from; return to->count ? RUNTIME_MALFORMED : RUNTIME_OK; }
void modwerk_machine_dsp_switch(const struct runtime_dsp *from, const struct runtime_dsp *to) { (void)from; (void)to; }

/* The base's own sites (held-sites.h, written by machine:base from the core's and base.json's): a module site over one
 * would replace the base's code with what the hash thought stock, and one running into the lean engine's jsr would
 * stop the audio interrupt (owner's review of #1934, 26 November 2026). The Octatrack keeps them in its event list. */
#ifdef MODWERK_HOST
#if __has_include("held-sites.h")
#include "held-sites.h"
#else
#define MW_HELD_SITES 1u
static const uint32_t mw_held_sites[MW_HELD_SITES][2] = {{0x400008c0u, 0x400008c6u}};
#endif
#else
#include "held-sites.h"
#endif
int modwerk_machine_patchable(uint32_t address, uint32_t length)
{
    if (!(address >= STOCK_FROM && address < STOCK_DATA && length <= STOCK_DATA - address))
        return 0;
    for (unsigned i = 0; i < MW_HELD_SITES; ++i)
        if (address < mw_held_sites[i][1] && mw_held_sites[i][0] < address + length)
            return 0;
    return 1;
}

/* core-ar2's hooks to the live modules', in position order (README.md "Package"). A module's draw gets the core's
 * bitmap, its key the panel's key code and whether it went down, its turn the encoder (0-7 A-H, 8 LEVEL) and the
 * count. The shared status word starts at 0 again whenever the live set changes, before the ticks run. Each returns
 * at once while no module is live; the tick also runs on the call that finds the last one gone, for its redraw. */
static unsigned was_live;           /* the live modules at the last tick: draw, key and turn test it, nothing more */
static uint32_t drawn_epoch, drawn_set;
static int set_changed(void)
{
    uint32_t epoch = modwerk_runtime_owner_epoch(), set = 0;
    if (epoch == drawn_epoch || (epoch & 1u)) return 0;
    for (unsigned i = 0; i < RUNTIME_MODULES; ++i) {
        const struct runtime_module *m = modwerk_runtime_module(i);
        if (m) set = (set ^ (uint32_t)(uintptr_t)m ^ m->id ^ (uint32_t)i << 24) * 0x01000193u;
    }
    if (modwerk_runtime_owner_epoch() != epoch) return 0;
    drawn_epoch = epoch;
    if (set == drawn_set) return 0;
    drawn_set = set;
    return 1;
}
void mw_runtime_tick(void *ctrl)
{
    unsigned next = 0, live = modwerk_runtime_active();
    uintptr_t f;
    if (!live && !was_live)
        return;
    was_live = live;
    if (set_changed()) {
        modwerk_runtime_api.value = 0;
        if (ctrl) ((volatile uint8_t *)ctrl)[0x20] = 1;   /* a redraw: a module that left takes its marks along */
    }
    while ((f = modwerk_runtime_next_hook(RUNTIME_TICK, &next)))
        ((void (*)(struct modwerk_runtime_api *))f)(&modwerk_runtime_api);
    mw_runtime_ticks = mw_runtime_ticks + 1u;
}
void mw_runtime_draw(void *bmp, void *ctrl)
{
    unsigned next = 0;
    uintptr_t f;
    (void)ctrl;
    if (!was_live)
        return;
    while ((f = modwerk_runtime_next_hook(RUNTIME_DRAW, &next)))
        ((void (*)(unsigned char *))f)((unsigned char *)bmp);
}
int mw_runtime_key(void *brain, char *event)
{
    int code = *(int32_t *)(event + 12), pressed = *(int32_t *)(event + 16) & 1;
    unsigned next = 0;
    uintptr_t f;
    (void)brain;
    if (!was_live)
        return 0;
    while ((f = modwerk_runtime_next_hook(RUNTIME_KEY, &next)))
        if (((int (*)(int, int))f)(code, pressed)) return 1;
    return 0;
}
int mw_runtime_enc(void *brain, char *event)
{
    int encoder = *(int32_t *)(event + 12), delta = *(int32_t *)(event + 16);
    unsigned next = 0;
    uintptr_t f;
    (void)brain;
    if (!was_live)
        return 0;
    while ((f = modwerk_runtime_next_hook(RUNTIME_ENC, &next)))
        if (((int (*)(int, int))f)(encoder, delta)) return 1;
    return 0;
}
