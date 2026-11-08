/* SPDX-License-Identifier: MIT */
/* Private ColdFire fixture. No production package, source admission or device
 * qualification. Mask only the bounded observer, never the stock body. */
#include "recorder_boundary.h"
struct bs_preview_guard bs_recorder_test_guard;
struct bs_recorder_boundary bs_recorder_test_boundary;
uint32_t bs_recorder_test_entries, bs_recorder_test_exits;
uint32_t bs_recorder_test_enter_masks, bs_recorder_test_leave_masks;
int bs_recorder_selftest(void);
static uint32_t lock(void) {
    uint32_t saved=0;
    __asm__ __volatile__("move.w %%sr,%0\n\tmove.w #0x2700,%%sr" : "+d"(saved) :: "memory", "cc");
    return saved;
}
static void unlock(uint32_t saved) {
    __asm__ __volatile__("move.w %0,%%sr" :: "d"(saved) : "memory", "cc");
}
uint32_t bs_recorder_test_init(void) {
    uint32_t result=(uint32_t)bs_recorder_selftest();
    if(result)return result;
    bs_guard_init(&bs_recorder_test_guard);
    bs_recorder_boundary_init(&bs_recorder_test_boundary,&bs_recorder_test_guard);
    bs_recorder_test_entries=bs_recorder_test_exits=0;
    bs_recorder_test_enter_masks=bs_recorder_test_leave_masks=0;
    /* Synthetic fixture authority only; production coverage is not proved. */
    return !bs_guard_enable(&bs_recorder_test_guard);
}
void bs_recorder_test_enter(uint32_t *saved_frame) {
    const uint32_t sp=(uint32_t)(uintptr_t)saved_frame+64u;
    const uint32_t mask=lock();
    const uint32_t track=*(volatile uint32_t *)(uintptr_t)(sp+4u);
    uint32_t selected=0,other=0;
    if(track<8u) {
        uint32_t bank=(*(volatile uint32_t *)0x80004f18u>>track)&1u;
        selected=*(volatile uint8_t *)(uintptr_t)(0x80004f1eu+84u*track+672u*bank);
        other=*(volatile uint8_t *)(uintptr_t)(0x80004f1eu+84u*track+672u*(1u-bank));
    }
    bs_recorder_test_enter_masks |= 1u << ((*(const uint16_t *)((const uint8_t *)saved_frame+60u)>>8)&7u);
    ++bs_recorder_test_entries;
    bs_recorder_enter_locked(&bs_recorder_test_boundary,sp,track,selected,other);
    unlock(mask);
}
void bs_recorder_test_leave(uint32_t *saved_frame) {
    const uint32_t sp=(uint32_t)(uintptr_t)saved_frame+64u+132u;
    const uint32_t mask=lock();
    bs_recorder_test_leave_masks |= 1u << ((*(const uint16_t *)((const uint8_t *)saved_frame+60u)>>8)&7u);
    ++bs_recorder_test_exits;
    bs_recorder_leave_locked(&bs_recorder_test_boundary,sp);
    unlock(mask);
}
