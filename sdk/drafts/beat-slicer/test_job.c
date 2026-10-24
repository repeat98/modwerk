/* SPDX-License-Identifier: MIT
 * Synthetic host/target tests. No firmware, filesystem, device or audio IO.
 * Nonzero return is the source line of the failing assertion.
 */
#include "planner_job.h"
#ifndef BS_JOB_VECTORS
#define BS_JOB_VECTORS 500
#endif
#define CHECK(x) do { if (!(x)) return __LINE__; } while (0)
static uint32_t seed, read_hash, reads;
static uint32_t random32(void) { seed = seed * 1664525u + 1013904223u; return seed; }
static int same(const void *a, const void *b, uint32_t n) {
    const unsigned char *x = a, *y = b;
    while (n--) if (*x++ != *y++) return 0;
    return 1;
}
static void fill(void *a, uint32_t n) {
    unsigned char *p = a;
    while (n--) *p++ = 0xa5;
}
static void copy(void *a, const void *b, uint32_t n) {
    unsigned char *x = a;
    const unsigned char *y = b;
    while (n--) *x++ = *y++;
}
static int pcm(void *ctx, uint32_t frame, int32_t out[2]) {
    uint32_t mode = *(const uint32_t *)ctx;
    uint32_t h = frame * 2654435761u;
    out[0] = mode == 0 ? 0 : (int32_t)(h % 20001u) - 10000;
    out[1] = mode == 0 ? 0 : (int32_t)((h >> 8) % 30001u) - 15000;
    read_hash = (read_hash ^ frame) * 16777619u;
    ++reads;
    return 0;
}
static void request(struct bs_request *r, uint32_t *mode) {
    r->sample_rate = 8000;
    r->trim_start = 0; r->trim_end = 4001;
    r->sample_bpm24 = 2880; r->project_bpm24 = 2160;
    r->beats = 1; r->tempo_source = 0; r->existing_count = 0;
    r->existing = 0; r->snap = 1; r->read = pcm; r->context = mode;
}
static int tick(struct bs_job *j) {
    if (j->state == BS_JOB_NEED_FRAME) {
        int32_t v[2]; uint32_t mode = 1;
        pcm(&mode, j->frame, v);
        if (!bs_job_supply(j, j->serial, j->frame, v, 0)) return 0;
    } else bs_job_step(j);
    return 1;
}
int bs_job_selftest(void) {
    struct bs_request r;
    struct bs_job j, saved;
    struct bs_plan oracle, result, sentinel;
    uint32_t mode = 0, markers[64], rates[] = {8000, 44100, 48000, 96000, 192000};
    uint32_t spacings[] = {1, 4, 16, 32, 64};
    seed = 0x51511ce;
    fill(&sentinel, sizeof sentinel);
    /* Independent synchronous implementation, full outputs AND read ordering.
     * High coordinates, both tempos, every spacing, arbitrary retained markers,
     * random stereo amplitudes, capacity refusals and fractional deadlines.
     */
    for (uint32_t trial = 0; trial < BS_JOB_VECTORS; ++trial) {
        request(&r, &mode);
        mode = trial % 2;
        r.sample_rate = rates[trial % 5];
        r.beats = spacings[(trial / 5) % 5];
        r.sample_bpm24 = 720 + random32() % 6481;
        r.project_bpm24 = 720 + random32() % 6481;
        r.tempo_source = (trial / 25) % 2;
        r.snap = (trial / 2) % 2;
        uint32_t length = trial % 11 ? r.sample_rate * (1 + random32() % 20) : 0x7fffffffu;
        r.trim_start = trial % 3 ? random32() % 10000 : UINT32_MAX - length;
        r.trim_end = r.trim_start + length;
        r.existing_count = random32() % 5;
        for (uint32_t i = 0; i < r.existing_count; ++i)
            markers[i] = r.trim_start + i * (length / 5);
        r.existing = markers;
        read_hash = reads = 0;
        enum bs_status status = bs_preview(&r, &oracle);
        uint32_t expected_hash = read_hash, expected_reads = reads;
        CHECK(bs_job_begin(&j, &r) == BS_JOB_RUNNING);
        read_hash = reads = 0;
        uint32_t steps = 0;
        while (j.state == BS_JOB_RUNNING || j.state == BS_JOB_NEED_FRAME) {
            CHECK(++steps < 300000);
            if (j.state == BS_JOB_NEED_FRAME) {
                int32_t v[2];
                CHECK(j.frame >= r.trim_start && j.frame < r.trim_end);
                pcm(&mode, j.frame, v);
                CHECK(bs_job_supply(&j, j.serial, j.frame, v, 0));
            } else bs_job_step(&j);
        }
        CHECK(read_hash == expected_hash && reads == expected_reads);
        if (status == BS_OK) {
            CHECK(j.state == BS_JOB_DONE && bs_job_result(&j, &result));
            CHECK(same(&oracle, &result, sizeof oracle));
        } else {
            CHECK(j.state == BS_JOB_FAILED && j.error == (uint32_t)status);
            fill(&result, sizeof result);
            CHECK(!bs_job_result(&j, &result) && same(&result, &sentinel, sizeof result));
        }
    }
    /* Request snapshot is owned by the job: no marker/config pointer retained. */
    request(&r, &mode); mode = 1;
    markers[0] = 0; r.existing = markers; r.existing_count = 1;
    CHECK(bs_preview(&r, &oracle) == BS_OK);
    CHECK(bs_job_begin(&j, &r) == BS_JOB_RUNNING);
    markers[0] = 999; r.trim_end = 0; r.sample_bpm24 = 0;
    while (j.state < BS_JOB_DONE) CHECK(tick(&j));
    CHECK(bs_job_result(&j, &result) && same(&oracle, &result, sizeof result));
    /* Pending reads, rejected stale replies and cancellation at EVERY transition
     * of a real search, including both halves of a boundary and ready state.
     */
    request(&r, &mode);
    CHECK(bs_job_begin(&j, &r) == BS_JOB_RUNNING);
    for (;;) {
        copy(&saved, &j, sizeof j);
        fill(&result, sizeof result);
        if (j.state != BS_JOB_DONE)
            CHECK(!bs_job_result(&j, &result) && same(&result, &sentinel, sizeof result));
        bs_job_cancel(&j);
        CHECK(bs_job_step(&j) == BS_JOB_CANCELLED);
        CHECK(!bs_job_supply(&j, j.serial, j.frame, 0, 1));
        CHECK(!bs_job_result(&j, &result));
        copy(&j, &saved, sizeof j);
        if (j.state == BS_JOB_DONE) break;
        if (j.state == BS_JOB_NEED_FRAME) {
            for (uint32_t repeat = 0; repeat < 3; ++repeat) {
                CHECK(bs_job_step(&j) == BS_JOB_NEED_FRAME);
                CHECK(same(&j, &saved, sizeof j));
            }
            CHECK(!bs_job_supply(&j, j.serial - 1, j.frame, 0, 1));
            CHECK(!bs_job_supply(&j, j.serial, j.frame + 1, 0, 1));
            CHECK(same(&j, &saved, sizeof j));
            /* A failed/invalid read at every possible read leaves output intact. */
            int32_t bad[2] = {8388608, 0};
            CHECK(bs_job_supply(&j, j.serial, j.frame, bad, 0));
            CHECK(j.state == BS_JOB_FAILED && j.error == BS_READ_ERROR);
            CHECK(!bs_job_result(&j, &result) && same(&result, &sentinel, sizeof result));
            copy(&j, &saved, sizeof j);
            CHECK(bs_job_supply(&j, j.serial, j.frame, 0, 1));
            CHECK(j.state == BS_JOB_FAILED && j.error == BS_READ_ERROR);
            copy(&j, &saved, sizeof j);
        }
        CHECK(tick(&j));
    }
    /* Selected missing BPM fails; no fallback. Invalid request cannot publish. */
    for (uint32_t invalid = 0; invalid < 9; ++invalid) {
        request(&r, &mode);
        switch (invalid) {
        case 0: r.sample_bpm24 = 0; break;
        case 1: r.tempo_source = 1; r.project_bpm24 = 0; break;
        case 2: r.beats = 2; break;
        case 3: r.sample_rate = 7999; break;
        case 4: r.snap = 2; break;
        case 5: r.trim_start = r.trim_end; break;
        case 6: r.existing_count = 65; break;
        case 7: r.existing_count = 1; break;
        case 8: markers[0] = r.trim_end; r.existing = markers; r.existing_count = 1; break;
        }
        CHECK(bs_job_begin(&j, &r) == BS_JOB_FAILED && j.error == BS_INVALID);
        fill(&result, sizeof result);
        CHECK(!bs_job_result(&j, &result) && same(&result, &sentinel, sizeof result));
    }
    CHECK(bs_job_begin(&j, 0) == BS_JOB_FAILED);
    CHECK(bs_job_begin(0, &r) == BS_JOB_FAILED);
    CHECK(bs_job_step(0) == BS_JOB_FAILED);
    CHECK(!bs_job_result(0, &result));
    bs_job_cancel(0);
    return 0;
}
