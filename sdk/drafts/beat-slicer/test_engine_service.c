/* SPDX-License-Identifier: MIT */
/* Private stopped-Flex emulator service. This is not a production base hook,
 * scheduler export or source-admission proof. Complete writer/cache ownership
 * and a physical latency budget remain required before any live service. */
#include "engine_boundary.h"
#include "preview_session.h"
extern struct bs_preview_guard bs_worker_test_guard;
extern struct bs_preview_session bs_boot_session;
extern uint32_t bs_boot_begin(uint32_t, uint32_t, uint32_t);
extern uint32_t bs_boot_step(void);
struct bs_engine_boundary bs_service_boundary;
uint32_t bs_service_state, bs_service_steps, bs_service_calls;
uint32_t bs_service_posted, bs_service_consumed, bs_service_ordinary;
uint32_t bs_service_cancelled, bs_service_max_steps, bs_service_ready;
static uint32_t requested, cancel_requested, wake_posted;
static uint32_t tempo, snap, beats;
static uint32_t blocked_ticket;
/* Only this exact immutable message is a non-mutating wake. Another message
 * with the same opcode is not exempted. Storage stays pinned for the boot. */
static const uint8_t wake_message[4] __attribute__((aligned(4))) = {255, 0, 0, 0};
static const uint8_t foreign_message[4] __attribute__((aligned(4))) = {255, 0, 0, 0};
static uint32_t lock(void) {
    uint32_t saved;
    __asm__ __volatile__("move.w %%sr,%0\n\tmove.w #0x2700,%%sr" : "=d"(saved) :: "memory");
    return saved;
}
static void unlock(uint32_t saved) {
    __asm__ __volatile__("move.w %0,%%sr" :: "d"(saved) : "memory");
}
static void post(const void *message) {
    ((void (*)(void *, const void *))0x40000c3cu)((void *)0x460d17ceu, message);
}
static void wake(void) {
    uint32_t saved = lock();
    if (!wake_posted) {
        wake_posted = 1;
        ++bs_service_posted;
        post(wake_message);
    }
    unlock(saved);
}
uint32_t bs_service_init(void) {
    if (bs_service_boundary.guard) return 1;
    bs_guard_init(&bs_worker_test_guard);
    bs_engine_boundary_init(&bs_service_boundary, &bs_worker_test_guard);
    bs_service_state = BS_SESSION_IDLE;
    return 0;
}
uint32_t bs_service_enable(void) {
    uint32_t saved = lock();
    uint32_t ok = bs_engine_quiescent_locked(&bs_service_boundary) && bs_guard_enable(&bs_worker_test_guard);
    unlock(saved);
    return !ok;
}
void bs_service_job(const void *message) {
    uint32_t saved = lock();
    if (message == wake_message && wake_posted) {
        wake_posted = 0;
        ++bs_service_consumed;
    } else {
        ++bs_service_ordinary;
        bs_engine_job_locked(&bs_service_boundary);
    }
    unlock(saved);
}
void bs_service_idle(void) {
    uint32_t saved = lock(), start, cancel, t, s, b;
    bs_engine_idle_locked(&bs_service_boundary);
    start = requested; cancel = cancel_requested;
    requested = cancel_requested = 0;
    t = tempo; s = snap; b = beats;
    unlock(saved);
    ++bs_service_calls;
    /* Only this engine task mutates the session. UI/main entry points publish
     * requests and return; they never plan or cancel the session themselves. */
    if (cancel) {
        bs_session_cancel(&bs_boot_session);
        bs_service_state = BS_SESSION_CANCELLED;
        ++bs_service_cancelled;
        return;
    }
    if (start) bs_service_state = bs_boot_begin(t, s, b);
    uint32_t count = 0;
    while (count < 8 && (bs_service_state == BS_SESSION_RUNNING || bs_service_state == BS_SESSION_WAITING)) {
        bs_service_state = bs_boot_step();
        ++count; ++bs_service_steps;
        /* A pending backend yields immediately; never spin on readiness. */
        if (bs_service_state == BS_SESSION_WAITING) break;
    }
    if (count > bs_service_max_steps) bs_service_max_steps = count;
    if (bs_service_state == BS_SESSION_READY && (start || count)) ++bs_service_ready;
    /* PENDING waits for a separate readiness/cancellation event. Reposting a
     * wake immediately would turn a bounded callback into an unbounded poll. */
    if (bs_service_state == BS_SESSION_RUNNING) wake();
}
uint32_t bs_service_request(uint32_t new_tempo, uint32_t new_snap, uint32_t new_beats) {
    uint32_t saved = lock();
    if (requested || cancel_requested || bs_service_state == BS_SESSION_RUNNING || bs_service_state == BS_SESSION_WAITING) {
        unlock(saved); return 1;
    }
    tempo = new_tempo; snap = new_snap; beats = new_beats; requested = 1;
    unlock(saved);
    wake();
    return 0;
}
uint32_t bs_service_cancel(void) {
    uint32_t saved = lock();
    cancel_requested = 1;
    unlock(saved);
    wake();
    return 0;
}
/* Synthetic request/cancel interleaving before the consumer can run. */
uint32_t bs_service_request_cancel(void) {
    uint32_t saved = lock();
    if (requested || cancel_requested || bs_service_state == BS_SESSION_RUNNING || bs_service_state == BS_SESSION_WAITING) {
        unlock(saved); return 1;
    }
    tempo = 0; snap = beats = 1;
    requested = cancel_requested = 1;
    wake();
    unlock(saved);
    return 0;
}
uint32_t bs_service_foreign_wake(void) {
    post(foreign_message);
    return 0;
}
/* Synthetic independent writer/readiness controls for the waiting regression. */
uint32_t bs_service_block_begin(void) {
    uint32_t saved = lock();
    if (!blocked_ticket) blocked_ticket = bs_guard_writer_begin(&bs_worker_test_guard);
    uint32_t ticket = blocked_ticket;
    unlock(saved);
    return ticket;
}
uint32_t bs_service_block_end(void) {
    uint32_t saved = lock();
    uint32_t ok = bs_guard_writer_end(&bs_worker_test_guard, blocked_ticket);
    blocked_ticket = 0;
    unlock(saved);
    if (ok) wake();
    return !ok;
}

/* Private driver mailbox: native C owns cdecl argument cleanup. The emulator's
 * borrowed-main call does not pop argument words supplied by its host driver. */
volatile uint32_t bs_service_request_fields[3];
uint32_t bs_service_request_mailbox(void) {
    uint32_t saved = lock();
    uint32_t t = bs_service_request_fields[0], s = bs_service_request_fields[1];
    uint32_t b = bs_service_request_fields[2];
    uint32_t result = bs_service_request(t, s, b);
    unlock(saved);
    return result;
}
uint32_t bs_service_main_sp(void) {
    uint32_t value;
    __asm__ __volatile__("move.l %%sp,%0" : "=d"(value));
    return value;
}
