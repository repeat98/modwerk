/* SPDX-License-Identifier: MIT */
/* Private emulator shim target; production integration belongs inside the
 * existing base-owned hooks, never in a separately hooked module. */
#include "engine_boundary.h"
extern struct bs_preview_guard bs_worker_test_guard;
struct bs_engine_boundary bs_engine_test_boundary;
static uint32_t lock(void) {
    uint32_t saved;
    __asm__ __volatile__("move.w %%sr,%0\n\tmove.w #0x2700,%%sr" : "=d"(saved) :: "memory");
    return saved;
}
static void unlock(uint32_t saved) {
    __asm__ __volatile__("move.w %0,%%sr" :: "d"(saved) : "memory");
}
uint32_t bs_engine_test_init(void) {
    if (bs_engine_test_boundary.guard) return 1;
    bs_guard_init(&bs_worker_test_guard);
    bs_engine_boundary_init(&bs_engine_test_boundary, &bs_worker_test_guard);
    return 0;
}
void bs_engine_test_idle(void) {
    uint32_t saved = lock();
    bs_engine_idle_locked(&bs_engine_test_boundary);
    unlock(saved);
}
void bs_engine_test_job(void) {
    uint32_t saved = lock();
    bs_engine_job_locked(&bs_engine_test_boundary);
    unlock(saved);
}
/* Synthetic admission for this fixed stopped-source fixture ONLY. Observing
 * engine quiescence never proves recorder/UI/cache ownership in production. */
uint32_t bs_engine_test_enable(void) {
    uint32_t saved = lock();
    uint32_t ok = bs_engine_quiescent_locked(&bs_engine_test_boundary) && bs_guard_enable(&bs_worker_test_guard);
    unlock(saved);
    return !ok;
}
