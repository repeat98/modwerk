/* SPDX-License-Identifier: MIT */
/* Private full-boot fixture for the existing base-owned UI tick. No production
 * patch, package admission, pointer reclamation or physical-time qualification. */
#include "preview_guard.h"
#include "preview_session.h"
#include "engine_boundary.h"
extern uint32_t bs_grid_ui_service(void), bs_boot_menu_revoke(void);
extern uint32_t bs_grid_ui_state, bs_grid_ui_epoch;
extern uint32_t bs_grid_ui_reply;
extern uint32_t bs_boot_queries;
extern void bs_engine_test_job(void);
extern struct bs_engine_boundary bs_engine_test_boundary;
extern struct bs_preview_guard bs_worker_test_guard;
uint32_t bs_ui_tick_enabled, bs_ui_tick_calls, bs_ui_tick_steps;
uint32_t bs_ui_tick_max_steps, bs_ui_tick_reentry;
static uint32_t busy;
static uint32_t blocked;
/* Own diagnostic scalars only: never retain a borrowed command pointer. */
uint32_t bs_ui_job_count, bs_ui_job_trace[32][4];
uint32_t bs_ui_readonly_jobs, bs_ui_ordinary_jobs;
static const uint8_t foreign_message[4] __attribute__((aligned(4))) = {255, 0, 0, 0};
static uint32_t packed_word(const uint8_t *at) {
    return (uint32_t)at[0]<<24 | (uint32_t)at[1]<<16 | (uint32_t)at[2]<<8 | at[3];
}
void bs_ui_engine_job(const uint8_t *message) {
    uint32_t index = bs_ui_job_count++ % 32;
    bs_ui_job_trace[index][0] = message ? *message : 256;
    bs_ui_job_trace[index][1] = bs_grid_ui_state;
    bs_ui_job_trace[index][2] = bs_grid_ui_epoch;
    bs_ui_job_trace[index][3] = bs_boot_queries;
    /* Exact private 1.40C research classification, not a public opcode ABI:
     * ordinary Flex waveform rendering writes only display/progress state in
     * the audited path. Static, recorder, unknown and fault/reentry cases stay
     * conservative. The generic engine boundary itself is unchanged. */
    uint32_t saved;
    __asm__ __volatile__("move.w %%sr,%0\n\tmove.w #0x2700,%%sr" : "=d"(saved) :: "memory");
    if (message && *message == 16 && packed_word(message+2) == 1 && packed_word(message+6) < 128 &&
        bs_engine_test_boundary.guard && bs_engine_test_boundary.idle_seen &&
        !bs_engine_test_boundary.ticket && !bs_engine_test_boundary.fault) {
        ++bs_ui_readonly_jobs;
    } else {
        ++bs_ui_ordinary_jobs;
        bs_engine_test_job();
    }
    __asm__ __volatile__("move.w %0,%%sr" :: "d"(saved) : "memory");
}
void bs_ui_tick(void) {
    ++bs_ui_tick_calls;
    if (!bs_ui_tick_enabled) return;
    if (busy) {
        bs_ui_tick_reentry = 1; bs_ui_tick_enabled = 0;
        (void)bs_boot_menu_revoke();
        return;
    }
    busy = 1;
    uint32_t count = 0, state;
    do {
        state = bs_grid_ui_service();
        ++count; ++bs_ui_tick_steps;
        if (state == 3 && bs_grid_ui_reply == BS_SESSION_WAITING) break;
        /* UI_SCANNING only: configuration/result rendering happens once.
         * A pending source can retry on the next ordinary UI tick; this
         * fixture never posts its own event or adds another clock. */
    } while (state == 3 && count < 8);
    if (count > bs_ui_tick_max_steps) bs_ui_tick_max_steps = count;
    busy = 0;
}
uint32_t bs_ui_tick_enable(void) {
    if (busy || bs_ui_tick_enabled || bs_ui_tick_reentry) return 1;
    bs_ui_tick_enabled = 1;
    return 0;
}
/* A synthetic independent writer makes short-preview cancellation repeatable.
 * The normal UI tick, rather than an injected service call, handles waiting. */
uint32_t bs_ui_block(void) {
    uint32_t saved;
    __asm__ __volatile__("move.w %%sr,%0\n\tmove.w #0x2700,%%sr" : "=d"(saved) :: "memory");
    if (!blocked) blocked = bs_guard_writer_begin(&bs_worker_test_guard);
    __asm__ __volatile__("move.w %0,%%sr" :: "d"(saved) : "memory");
    return blocked;
}
uint32_t bs_ui_unblock(void) {
    uint32_t saved;
    __asm__ __volatile__("move.w %%sr,%0\n\tmove.w #0x2700,%%sr" : "=d"(saved) :: "memory");
    uint32_t ok = bs_guard_writer_end(&bs_worker_test_guard, blocked);
    blocked = 0;
    __asm__ __volatile__("move.w %0,%%sr" :: "d"(saved) : "memory");
    return !ok;
}
/* All borrowed fixture entrypoints take zero arguments: the pinned emulator's
 * callAsMain leaves cdecl arguments on main's stack. Check its baseline here. */
uint32_t bs_ui_main_sp(void) {
    uint32_t value;
    __asm__ __volatile__("move.l %%sp,%0" : "=d"(value));
    return value;
}
uint32_t bs_ui_foreign_event(void) {
    ((void (*)(void *, const void *))0x40000c3cu)((void *)0x460d17ceu, foreign_message);
    return 0;
}
