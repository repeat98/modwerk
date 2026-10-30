/* SPDX-License-Identifier: MIT */
#include "engine_boundary.h"
#define CHECK(x) do { if (!(x)) return __LINE__; } while (0)
int bs_engine_selftest(void) {
    struct bs_preview_guard guard;
    struct bs_engine_boundary boundary;
    struct bs_preview_token before, after;
    bs_guard_init(&guard); CHECK(bs_guard_enable(&guard));
    CHECK(bs_guard_acquire(&guard, &before));
    bs_engine_boundary_init(&boundary, &guard);
    CHECK(!guard.enabled && !bs_guard_valid(&guard, &before));
    CHECK(!bs_engine_quiescent_locked(&boundary));
    bs_engine_job_locked(&boundary);
    CHECK(boundary.ticket && !bs_guard_enable(&guard));
    uint32_t other = bs_guard_writer_begin(&guard);
    CHECK(other && other != boundary.ticket);
    bs_engine_idle_locked(&boundary);
    CHECK(bs_engine_quiescent_locked(&boundary) && !guard.enabled);
    CHECK(!bs_guard_enable(&guard)); /* engine idle does not retire another writer */
    CHECK(bs_guard_writer_end(&guard, other) && bs_guard_enable(&guard));
    for (uint32_t i=0; i<120; ++i) {
        CHECK(bs_guard_acquire(&guard, &before));
        uint32_t serial = guard.serial;
        bs_engine_job_locked(&boundary);
        CHECK(boundary.ticket > serial && !bs_guard_valid(&guard, &before));
        CHECK(!bs_engine_quiescent_locked(&boundary) && !bs_guard_acquire(&guard, &after));
        bs_engine_idle_locked(&boundary);
        CHECK(bs_engine_quiescent_locked(&boundary) && bs_guard_acquire(&guard, &after));
        CHECK(after.operation > before.operation && !bs_guard_valid(&guard, &before));
        bs_engine_idle_locked(&boundary); /* an idle callback is not a new mutation */
        CHECK(bs_guard_valid(&guard, &after));
    }
    bs_engine_job_locked(&boundary);
    uint32_t ticket = boundary.ticket;
    bs_engine_job_locked(&boundary); /* reentry cannot forget the live ticket */
    CHECK(boundary.fault && boundary.ticket == ticket && !guard.enabled);
    bs_engine_idle_locked(&boundary);
    CHECK(!boundary.ticket && !bs_engine_quiescent_locked(&boundary));
    CHECK(!bs_guard_writer_end(&guard, ticket));
    for (uint32_t mode=0; mode<4; ++mode) {
        bs_guard_init(&guard); bs_engine_boundary_init(&boundary, &guard);
        bs_engine_idle_locked(&boundary);
        CHECK(bs_guard_enable(&guard));
        if (mode == 0) guard.serial = UINT32_MAX;
        if (mode == 1) guard.revision = UINT32_MAX;
        if (mode == 2) for (uint32_t i=0; i<BS_GUARD_WRITERS; ++i) CHECK(bs_guard_writer_begin(&guard));
        bs_engine_job_locked(&boundary);
        if (mode == 3) {
            CHECK(bs_guard_writer_end(&guard, boundary.ticket));
            bs_engine_idle_locked(&boundary); /* unexpected retirement fails closed */
        }
        CHECK(boundary.fault && !guard.enabled && !bs_engine_quiescent_locked(&boundary));
    }
    bs_engine_boundary_init(&boundary, 0);
    bs_engine_job_locked(&boundary); bs_engine_idle_locked(&boundary);
    CHECK(boundary.fault && !bs_engine_quiescent_locked(&boundary));
    bs_engine_boundary_init(0, &guard); bs_engine_job_locked(0); bs_engine_idle_locked(0);
    CHECK(!bs_engine_quiescent_locked(0));
    return 0;
}
