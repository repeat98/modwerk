/* SPDX-License-Identifier: MIT */
/* PRIVATE EMULATOR FIXTURE ONLY. Synthetic admission and native masking do
 * not qualify these addresses, cache behavior or physical interrupt latency.
 * No production package links this file or enables this guard.
 */
#include "worker_boundary.h"
struct bs_preview_guard bs_worker_test_guard;
struct bs_worker_boundary bs_worker_test_boundary;
struct bs_preview_token bs_worker_test_before;
static uint32_t lock(void *context) {
    uint32_t saved;
    (void)context;
    __asm__ __volatile__("move.w %%sr,%0\n\tmove.w #0x2700,%%sr" : "=d"(saved) :: "memory");
    return saved;
}
static void unlock(void *context, uint32_t saved) {
    (void)context;
    __asm__ __volatile__("move.w %0,%%sr" :: "d"(saved) : "memory");
}
uint32_t bs_worker_test_init(void) {
    bs_guard_init(&bs_worker_test_guard);
    bs_worker_test_boundary.guard = &bs_worker_test_guard;
    bs_worker_test_boundary.receive = (void *(*)(void *))0x40000d00u;
    bs_worker_test_boundary.lock = lock;
    bs_worker_test_boundary.unlock = unlock;
    bs_worker_test_boundary.context = 0;
    bs_worker_test_boundary.ticket = bs_worker_test_boundary.receiving = bs_worker_test_boundary.fault = 0;
    if (!bs_guard_enable(&bs_worker_test_guard)) return 1;
    return !bs_guard_acquire(&bs_worker_test_guard, &bs_worker_test_before);
}
void *bs_worker_test_entry(void *queue) {
    return bs_worker_receive(&bs_worker_test_boundary, queue);
}
