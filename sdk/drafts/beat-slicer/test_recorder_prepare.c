/* SPDX-License-Identifier: MIT */
/* Private native whole-preparation observer. No production source admission. */
#include "recorder_boundary.h"
extern struct bs_recorder_boundary bs_recorder_test_boundary;
uint32_t bs_recorder_prepare_entries,bs_recorder_prepare_exits;
uint32_t bs_recorder_prepare_enter_masks,bs_recorder_prepare_leave_masks;
static uint32_t lock(void) {
    uint32_t saved=0;
    __asm__ __volatile__("move.w %%sr,%0\n\tmove.w #0x2700,%%sr" : "+d"(saved) :: "memory", "cc");
    return saved;
}
static void unlock(uint32_t saved) {
    __asm__ __volatile__("move.w %0,%%sr" :: "d"(saved) : "memory", "cc");
}
void bs_recorder_prepare_enter(uint32_t *saved_frame) {
    const uint32_t sp=(uint32_t)(uintptr_t)saved_frame+64u;
    const uint32_t mask=lock();
    const uint32_t track=*(volatile uint32_t *)(uintptr_t)(sp+4u);
    bs_recorder_prepare_enter_masks |= 1u << ((*(const uint16_t *)((const uint8_t *)saved_frame+60u)>>8)&7u);
    ++bs_recorder_prepare_entries;
    bs_recorder_prepare_locked(&bs_recorder_test_boundary,sp,track);
    unlock(mask);
}
void bs_recorder_prepare_leave(uint32_t *saved_frame) {
    const uint32_t sp=(uint32_t)(uintptr_t)saved_frame+64u+48u;
    const uint32_t mask=lock();
    bs_recorder_prepare_leave_masks |= 1u << ((*(const uint16_t *)((const uint8_t *)saved_frame+60u)>>8)&7u);
    ++bs_recorder_prepare_exits;
    bs_recorder_leave_locked(&bs_recorder_test_boundary,sp);
    unlock(mask);
}
