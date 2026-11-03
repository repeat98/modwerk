/* SPDX-License-Identifier: MIT */
/* Private full-boot composition only; no production source admission. */
#include "recorder_boundary.h"
#include "engine_boundary.h"
extern struct bs_preview_guard bs_recorder_test_guard;
extern struct bs_recorder_boundary bs_recorder_test_boundary;
uint32_t bs_recorder_test_init(void);
struct bs_engine_boundary bs_recorder_engine_boundary;
static uint32_t lock(void) {
    uint32_t saved=0;
    __asm__ __volatile__("move.w %%sr,%0\n\tmove.w #0x2700,%%sr" : "+d"(saved) :: "memory", "cc");
    return saved;
}
static void unlock(uint32_t saved) {
    __asm__ __volatile__("move.w %0,%%sr" :: "d"(saved) : "memory", "cc");
}
uint32_t bs_recorder_engine_init(void) {
    if(bs_recorder_engine_boundary.guard)return 1;
    uint32_t result=bs_recorder_test_init();
    if(result)return result;
    bs_engine_boundary_init(&bs_recorder_engine_boundary,&bs_recorder_test_guard);
    return 0;
}
void bs_recorder_engine_idle(uint32_t *saved_frame) {
    (void)saved_frame;
    const uint32_t mask=lock();
    bs_engine_idle_locked(&bs_recorder_engine_boundary);
    unlock(mask);
}
void bs_recorder_engine_job(uint32_t *saved_frame) {
    (void)saved_frame;
    const uint32_t mask=lock();
    bs_engine_job_locked(&bs_recorder_engine_boundary);
    unlock(mask);
}
uint32_t bs_recorder_engine_enable(void) {
    const uint32_t mask=lock();
    const uint32_t ready=bs_engine_quiescent_locked(&bs_recorder_engine_boundary) &&
        bs_recorder_quiescent_locked(&bs_recorder_test_boundary) &&
        bs_guard_enable(&bs_recorder_test_guard);
    unlock(mask);
    /* Explicit fixed-fixture authority, not evidence of other writer coverage. */
    return !ready;
}
