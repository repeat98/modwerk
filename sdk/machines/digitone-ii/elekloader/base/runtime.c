/* SPDX-License-Identifier: GPL-3.0-or-later
 * The Digitone II's glue for the machine-neutral runtime loader (sdk/runtime/loader), OS 1.12, and the
 * trampolines from the core's hook bus to the live modules' hooks. Development only. The Octatrack's
 * (sdk/machines/octatrack/elekloader/runtime.c) with the Digitone II's addresses; how each was found is in
 * sdk/machines/digitone-ii/LOADER.md.
 *
 * Module code and data run from the uncached alias (DDR + 0x08000000: ACR0 caches 0x40000000-0x47ffffff only), so
 * no stale or dirty data-cache line reaches them; the loader invalidates the instruction and branch caches after it
 * writes code. The pool is DDR above what stock clears and uses (RUNTIME_POOL_AT, base.json).
 *
 * Patches to stock code: only the OS's code in RAM, never its vectors or the tables after it. The OS never writes
 * that RAM to flash (an update flashes the upload buffer). With interrupts masked, the loader checks every other
 * task's live stack and saved registers (the kernel's task records, the table below) for an address inside a
 * site before it writes. */
#include "loader.h"
#include "context.h"

#define U32(a) (*(volatile uint32_t *)(uintptr_t)(a))
#define ALIAS 0x08000000u
#define CODE_FROM 0x40000400u   /* the OS image in RAM; below it the vectors */
#define CODE_TO 0x401d0800u     /* the end of its code; tables and data follow */
#define PLAYING 0x42c5b918u     /* 1 while the sequencer plays, 0 stopped */

void *modwerk_machine_uncached(void *p) { return (void *)((uintptr_t)p + ALIAS); }
uint8_t *modwerk_machine_code(uint32_t address) { return (uint8_t *)(uintptr_t)(address + ALIAS); }
uint32_t modwerk_machine_reference(uint32_t value) { return value >= 0x48000000u && value < 0x50000000u ? value - ALIAS : value; }

/* Stock's boot value is 0xa50ce100, which also sets DCINVA: written now it would drop every dirty data-cache line.
 * Without it, the same configuration with ICINVA and BCINVA, the Octatrack's value. */
void modwerk_machine_invalidate_code(void) { __asm__ __volatile__("movec %0,%%cacr\n\tnop" :: "d"(0xa40ce100u) : "memory"); }

/* CPUSHL names a line by its set and way (An[1:0] the way): push every way of each set the range maps to. With
 * CACR's DPI clear, as stock leaves it, that pushes and invalidates them. The NOP waits for the pushes. */
void modwerk_machine_flush_data(uint32_t address, uint32_t length)
{
    for (uint32_t line = address & ~15u; line < address + length; line += 16u)
        for (uint32_t way = 0; way < 4u; ++way) __asm__ __volatile__("cpushl %%dc,(%0)" :: "a"(line | way) : "memory");
    __asm__ __volatile__("nop" ::: "memory");
}

uint32_t modwerk_machine_mask(void)
{
    uint32_t sr;
    __asm__ __volatile__("move.w %%sr,%0\n\tmove.w #0x2700,%%sr" : "=d"(sr) :: "memory");
    return sr;
}
void modwerk_machine_unmask(uint32_t sr) { __asm__ __volatile__("move.w %0,%%sr" :: "d"(sr) : "memory"); }

/* Level 4: the time slice (PIT0, level 1), USB and the UART wait; the frame interrupt (vector 191, level 5), the
 * kernel timers (5, 6) and DMA (6) run, so the sound goes on whatever the loader does. Never lowers. */
uint32_t modwerk_machine_lock(void)
{
    uint32_t sr;
    __asm__ __volatile__("move.w %%sr,%0" : "=d"(sr) :: "memory");
    if ((sr & 0x0700u) < 0x0400u) __asm__ __volatile__("move.w %0,%%sr" :: "d"((sr & ~0x0700u) | 0x0400u) : "memory");
    return sr;
}
void modwerk_machine_unlock(uint32_t sr) { __asm__ __volatile__("move.w %0,%%sr" :: "d"(sr) : "memory"); }

/* The sequencer does not play. Recording needs it to play; step entry while stopped runs no module hook. */
int modwerk_machine_stopped(void) { return U32(PLAYING) == 0u; }

int modwerk_machine_patchable(uint32_t address, uint32_t length)
{
    return address >= CODE_FROM && address < CODE_TO && length <= CODE_TO - address;
}

/* Every task stock creates (task_create 0x400012c8: its TCB, lowest stack address and stack size), read from each
 * call and checked on a unit. Two are created only on a condition and were not on the unit: a TCB whose list head
 * (+8) is 0 was never created. A TCB keeps d0-d7/a0-a7 at +0x0c and so its saved sp at +0x48, as the Octatrack's. */
static const struct { uint32_t tcb, stack, size; } tasks[] = {
    {0x4058cee4u, 0x4058cf38u, 0x1000u},  {0x4058e604u, 0x4058e658u, 0x800u},   {0x4059e1c0u, 0x4059ea34u, 0x28000u},
    {0x40386e48u, 0x40386e9cu, 0x4000u},  {0x4243d900u, 0x4243d954u, 0x4000u},  {0x424398acu, 0x42439900u, 0x4000u},
    {0x42c46624u, 0x42c42624u, 0x4000u},  {0x445e7764u, 0x445e77b8u, 0x8000u},  {0x445f0420u, 0x445f0474u, 0x8000u},
    {0x46679e7cu, 0x44618484u, 0x4000u},  {0x4461fb74u, 0x4461fbc8u, 0x4000u},  {0x446245f4u, 0x44636a68u, 0x8000u},
    {0x44624580u, 0x4462da68u, 0x8000u},  {0x4462450cu, 0x44624a68u, 0x8000u},  {0x42c6a1d0u, 0x42c6a224u, 0x4000u},
    {0x42c6e224u, 0x42c6e278u, 0x4000u},
};
#define TASKS (sizeof tasks / sizeof tasks[0])
#define CURRENT_TCB 0x4664bcdcu
#define READY_LISTS 0x4664bc9cu /* sixteen heads, one a priority */
#define PRIORITIES 16u
#define CREATED(i) (U32(tasks[i].tcb + 8u) != 0u)
static int known(uint32_t tcb)
{
    for (unsigned i = 0; i < TASKS; ++i) if (tasks[i].tcb == tcb && CREATED(i)) return 1;
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
    if (!context || !known(current) || !ready_tasks_known()) return max + 1u;
    span[n++] = (struct runtime_span){(const uint8_t *)context->registers, (const uint8_t *)(context->registers + 16)};
    for (unsigned i = 0; i < TASKS; ++i) {
        if (!CREATED(i)) continue;
        uint32_t top = tasks[i].stack + tasks[i].size, saved = tasks[i].tcb == current ? context->registers[15] : U32(tasks[i].tcb + 0x48u);
        if (saved < tasks[i].stack || saved > top || n + 2u > max) return max + 1u;
        span[n++] = (struct runtime_span){(const uint8_t *)(uintptr_t)saved, (const uint8_t *)(uintptr_t)top};
        if (tasks[i].tcb != current) /* saved d0-d7/a0-a7 */
            span[n++] = (struct runtime_span){(const uint8_t *)(uintptr_t)(tasks[i].tcb + 0x0cu), (const uint8_t *)(uintptr_t)(tasks[i].tcb + 0x4cu)};
    }
    return n;
}
int modwerk_machine_stack(uintptr_t *lo, uintptr_t *hi)
{
    uint32_t current = U32(CURRENT_TCB);
    for (unsigned i = 0; i < TASKS; ++i)
        if (tasks[i].tcb == current) { *lo = tasks[i].stack, *hi = tasks[i].stack + tasks[i].size; return 1; }
    return 0;
}

/* This base has no DSP loader: no module brings DSP code. */
int modwerk_machine_dsp_admit(const struct runtime_dsp *from, struct runtime_dsp *to) { (void)from; return to->count ? RUNTIME_MALFORMED : RUNTIME_OK; }
void modwerk_machine_dsp_switch(const struct runtime_dsp *from, const struct runtime_dsp *to) { (void)from; (void)to; }

/* The core's hooks, in the UI task, in position order: the first key or encoder hook that returns nonzero takes the
 * event. Reads each position once: memory a hook still runs in is not reclaimed while this task holds an address
 * inside it. */
static uintptr_t hook(unsigned position, enum runtime_event e)
{
    const struct runtime_module *m = modwerk_runtime_module(position);
    return m ? m->hook[e] : 0;
}
/* ev_tick: f(ctrl) at 30 Hz. */
void mw_runtime_tick(void *ctrl)
{
    (void)ctrl;
    for (unsigned i = 0; i < RUNTIME_MODULES; ++i) {
        uintptr_t f = hook(i, RUNTIME_TICK);
        if (f) ((void (*)(struct modwerk_runtime_api *))f)(&modwerk_runtime_api);
    }
    modwerk_runtime_ticks = modwerk_runtime_ticks + 1;
}
/* ev_draw: f(bmp, ctrl) over every composed frame. A module gets the frame's Bitmap object: the Digitone II's own. */
void mw_runtime_draw(void *bmp, void *ctrl)
{
    (void)ctrl;
    for (unsigned i = 0; i < RUNTIME_MODULES; ++i) {
        uintptr_t f = hook(i, RUNTIME_DRAW);
        if (f) ((void (*)(unsigned char *))f)((unsigned char *)bmp);
    }
}
/* ev_key, ev_enc: f(brain, event); the key or encoder at event + 12, a key's flags (1 press, 0x10 release) or an
 * encoder's delta (its top byte) at + 16. */
int mw_runtime_key(void *brain, char *event)
{
    int code = *(int32_t *)(event + 12), pressed = *(int32_t *)(event + 16) & 1;
    (void)brain;
    for (unsigned i = 0; i < RUNTIME_MODULES; ++i) {
        uintptr_t f = hook(i, RUNTIME_KEY);
        if (f && ((int (*)(int, int))f)(code, pressed)) return 1;
    }
    return 0;
}
int mw_runtime_enc(void *brain, char *event)
{
    int encoder = *(int32_t *)(event + 12), delta = *(int32_t *)(event + 16) >> 24;
    (void)brain;
    for (unsigned i = 0; i < RUNTIME_MODULES; ++i) {
        uintptr_t f = hook(i, RUNTIME_ENC);
        if (f && ((int (*)(int, int))f)(encoder, delta)) return 1;
    }
    return 0;
}
