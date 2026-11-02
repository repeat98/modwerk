/* SPDX-License-Identifier: MIT */
#include "worker_boundary.h"
#define CHECK(v) do { if (!(v)) return __LINE__; } while (0)
struct fixture {
    struct bs_preview_guard guard;
    struct bs_worker_boundary boundary;
    struct bs_preview_token waiting;
    uint32_t locked, calls, error, mode, nested;
};
static uint32_t lock(void *context) {
    struct fixture *f = context;
    if (f->locked) f->error = 1;
    f->locked = 1;
    return 0x2345;
}
static void unlock(void *context, uint32_t saved) {
    struct fixture *f = context;
    if (!f->locked || saved != 0x2345) f->error = 2;
    f->locked = 0;
}
static void *receive(void *queue) {
    struct fixture *f = queue;
    ++f->calls;
    if (f->locked || !f->boundary.receiving || f->boundary.ticket) f->error = 3;
    /* Simulate a separately serialized reader while receive is waiting. */
    if (!f->boundary.fault && !f->guard.poisoned && f->guard.enabled &&
        !bs_guard_acquire(&f->guard, &f->waiting)) f->error = 4;
    if (f->mode == 1) bs_guard_revoke(&f->guard);
    if (f->mode == 2 && !f->nested) {
        f->nested = 1;
        if (bs_worker_receive(&f->boundary, f) != f) f->error = 5;
    }
    return f->mode == 3 ? 0 : f;
}
static void init(struct fixture *f) {
    bs_guard_init(&f->guard);
    (void)bs_guard_enable(&f->guard);
    f->boundary.guard = &f->guard;
    f->boundary.receive = receive;
    f->boundary.lock = lock;
    f->boundary.unlock = unlock;
    f->boundary.context = f;
    f->boundary.ticket = f->boundary.receiving = f->boundary.fault = 0;
    f->locked = f->calls = f->error = f->mode = f->nested = 0;
}
int bs_worker_boundary_selftest(void) {
    struct fixture f;
    struct bs_preview_token old;
    uint32_t previous = 0, nested, i;
    init(&f);
    CHECK(bs_guard_acquire(&f.guard, &old));
    for (i = 0; i < 120; ++i) {
        CHECK(bs_worker_receive(&f.boundary, &f) == &f);
        CHECK(!f.error && !f.locked && !f.boundary.receiving && !f.boundary.fault);
        CHECK(f.boundary.ticket > previous && f.calls == i + 1);
        CHECK(!bs_guard_valid(&f.guard, &old) && !bs_guard_valid(&f.guard, &f.waiting));
        CHECK(!bs_guard_acquire(&f.guard, &old) && !bs_guard_revision(&f.guard));
        previous = f.boundary.ticket;
    }
    /* Separate nested writer remains active after the worker retires itself. */
    nested = bs_guard_writer_begin(&f.guard);
    CHECK(nested && bs_guard_writer_end(&f.guard, f.boundary.ticket));
    f.boundary.ticket = 0;
    CHECK(!bs_guard_revision(&f.guard));
    CHECK(bs_guard_writer_end(&f.guard, nested) && bs_guard_revision(&f.guard));
    init(&f); f.mode = 1;
    CHECK(bs_worker_receive(&f.boundary, &f) == &f && !f.error);
    CHECK(!f.guard.enabled && !bs_guard_revision(&f.guard) && f.boundary.ticket);
    init(&f); f.mode = 2;
    CHECK(bs_worker_receive(&f.boundary, &f) == &f && !f.error && f.calls == 2);
    CHECK(f.boundary.fault && !f.guard.enabled && !f.boundary.ticket);
    CHECK(bs_worker_receive(&f.boundary, &f) == &f && f.calls == 3 && !f.error);
    CHECK(f.boundary.fault && !f.guard.enabled && !f.boundary.ticket);
    init(&f); f.mode = 3;
    CHECK(!bs_worker_receive(&f.boundary, &f) && !f.error && f.boundary.ticket);
    CHECK(!bs_guard_valid(&f.guard, &f.waiting));
    init(&f); f.guard.serial = UINT32_MAX - 1;
    CHECK(bs_worker_receive(&f.boundary, &f) == &f && !f.error);
    CHECK(f.guard.poisoned && f.boundary.fault && !f.guard.enabled && !f.boundary.ticket);
    init(&f); f.guard.revision = UINT32_MAX;
    CHECK(bs_worker_receive(&f.boundary, &f) == &f && !f.error);
    CHECK(f.guard.poisoned && f.boundary.fault && !f.guard.enabled);
    init(&f); f.boundary.ticket = 123; /* Lost/corrupted ticket fails closed. */
    CHECK(bs_worker_receive(&f.boundary, &f) == &f && !f.error);
    CHECK(f.boundary.fault && !f.guard.enabled && !f.boundary.ticket);
    init(&f); CHECK(!bs_worker_receive(0, &f));
    f.boundary.receive = 0; CHECK(!bs_worker_receive(&f.boundary, &f));
    f.boundary.receive = receive; f.boundary.lock = 0;
    CHECK(!bs_worker_receive(&f.boundary, &f));
    f.boundary.lock = lock; f.boundary.unlock = 0;
    CHECK(!bs_worker_receive(&f.boundary, &f));
    f.boundary.unlock = unlock; f.boundary.guard = 0;
    CHECK(!bs_worker_receive(&f.boundary, &f) && !f.calls && !f.locked);
    return 0;
}
