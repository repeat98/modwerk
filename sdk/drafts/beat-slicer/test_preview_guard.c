/* SPDX-License-Identifier: MIT */
#include "preview_guard.h"
#include "pcm_reader.h"
#define CHECK(x) do { if (!(x)) return __LINE__; } while (0)

static int lifecycle(void) {
    struct bs_preview_guard g;
    struct bs_preview_token old, next, untouched = {123, 456};
    uint32_t a, b;
    bs_guard_init(&g);
    CHECK(!bs_guard_acquire(&g, &untouched) && untouched.operation == 123 && untouched.revision == 456);
    CHECK(bs_guard_enable(&g) && bs_guard_acquire(&g, &old) && bs_guard_valid(&g, &old));
    a = bs_guard_writer_begin(&g); b = bs_guard_writer_begin(&g);
    CHECK(a && b && a != b && !bs_guard_revision(&g) && !bs_guard_valid(&g, &old));
    CHECK(!bs_guard_acquire(&g, &untouched));
    CHECK(!bs_guard_writer_end(&g, old.operation) && !bs_guard_writer_end(&g, 0));
    CHECK(bs_guard_writer_end(&g, a) && !bs_guard_writer_end(&g, a));
    CHECK(!bs_guard_revision(&g) && !bs_guard_enable(&g));
    bs_guard_revoke(&g);
    CHECK(bs_guard_writer_end(&g, b) && !bs_guard_revision(&g));
    CHECK(bs_guard_enable(&g) && bs_guard_acquire(&g, &next));
    CHECK(next.operation > b && next.revision != old.revision && !bs_guard_valid(&g, &old));
    bs_guard_invalidate(&g);
    CHECK(!bs_guard_valid(&g, &next));
    CHECK(bs_guard_acquire(&g, &next) && bs_guard_valid(&g, &next));
    bs_guard_revoke(&g);
    CHECK(!bs_guard_valid(&g, &next));
    CHECK(bs_guard_enable(&g) && !bs_guard_valid(&g, &next));
    return 0;
}
static int exhaustion(void) {
    struct bs_preview_guard g;
    struct bs_preview_token token = {111, 222};
    uint32_t tickets[BS_GUARD_WRITERS];
    bs_guard_init(&g); CHECK(bs_guard_enable(&g));
    for (uint32_t i = 0; i < BS_GUARD_WRITERS; ++i) {
        tickets[i] = bs_guard_writer_begin(&g); CHECK(tickets[i]);
    }
    CHECK(!bs_guard_writer_begin(&g));
    for (uint32_t i = 0; i < BS_GUARD_WRITERS; ++i) CHECK(bs_guard_writer_end(&g, tickets[i]));
    CHECK(!bs_guard_enable(&g) && !bs_guard_acquire(&g, &token));
    CHECK(token.operation == 111 && token.revision == 222);
    /* Fresh, separate lifetimes for artificial exhaustion fault injection. */
    for (uint32_t mode = 0; mode < 3; ++mode) {
        bs_guard_init(&g); CHECK(bs_guard_enable(&g));
        if (mode == 0) g.serial = UINT32_MAX;
        else g.revision = UINT32_MAX;
        if (mode == 0) CHECK(!bs_guard_acquire(&g, &token));
        else if (mode == 1) CHECK(!bs_guard_writer_begin(&g));
        else bs_guard_invalidate(&g);
        CHECK(!bs_guard_revision(&g) && !bs_guard_enable(&g));
        CHECK(token.operation == 111 && token.revision == 222);
    }
    bs_guard_init(&g); CHECK(bs_guard_enable(&g));
    g.serial = UINT32_MAX-1;
    tickets[0] = bs_guard_writer_begin(&g); CHECK(tickets[0] == UINT32_MAX);
    CHECK(bs_guard_writer_end(&g, tickets[0]) && !bs_guard_acquire(&g, &token));
    CHECK(!bs_guard_enable(&g));
    return 0;
}
/* Exhaust all 24 permutations of four distinct events (two starts/ends)
 * separated by metadata invalidation at five possible positions. Observe the
 * public contract with an independent active-set model, including premature
 * ends that have no ticket and must be refused; do not inspect private fields.
 */
static int interleavings(void) {
    for (uint32_t encoded = 0; encoded < 256; ++encoded) {
        uint32_t order[4], used = 0, encodedCopy = encoded, legal = 1;
        for (uint32_t i = 0; i < 4; ++i) {
            order[i] = encodedCopy & 3; encodedCopy >>= 2;
            if (used & (1u << order[i])) legal = 0;
            used |= 1u << order[i];
        }
        if (!legal) continue;
        for (uint32_t gap = 0; gap < 5; ++gap) {
            struct bs_preview_guard g;
            struct bs_preview_token before, probe;
            uint32_t tickets[2] = {0, 0}, active = 0, retired = 0;
            bs_guard_init(&g); CHECK(bs_guard_enable(&g) && bs_guard_acquire(&g, &before));
            for (uint32_t i = 0; i < 5; ++i) {
                if (i == gap) { bs_guard_invalidate(&g); retired = 1; }
                CHECK(bs_guard_valid(&g, &before) == (!active && !retired));
                CHECK(bs_guard_acquire(&g, &probe) == !active);
                if (i == 4) break;
                uint32_t which = order[i] / 2;
                if (!(order[i] & 1)) {
                    tickets[which] = bs_guard_writer_begin(&g); CHECK(tickets[which]);
                    active |= 1u << which; retired = 1;
                } else if (tickets[which]) {
                    CHECK(bs_guard_writer_end(&g, tickets[which]));
                    CHECK(!bs_guard_writer_end(&g, tickets[which]));
                    active &= ~(1u << which);
                } else CHECK(!bs_guard_writer_end(&g, 0));
            }
        }
    }
    return 0;
}
static int readerIntegration(void) {
    for (uint32_t when = 0; when < 3; ++when) {
        struct bs_preview_guard g;
        struct bs_preview_token token;
        struct bs_pcm_reader reader;
        struct bs_request q = {8000, 0, 100, 2880, 2160, 1, 0, 0, 0, 0, 0, 0};
        struct bs_plan result;
        uint8_t pcm[BS_PCM_BLOCK_FRAMES*3];
        for (uint32_t i = 0; i < sizeof(pcm); ++i) pcm[i] = 0;
        bs_guard_init(&g); CHECK(bs_guard_enable(&g) && bs_guard_acquire(&g, &token));
        struct bs_pcm_source source = {token.operation, token.revision, 100, {24, 1, 0}};
        CHECK(bs_reader_begin(&reader, &q, &source) == BS_READER_RUNNING);
        while (bs_reader_step(&reader, bs_guard_revision(&g)) != BS_READER_NEED_BLOCK) {}
        struct bs_pcm_read pending = reader.pending;
        if (when == 2) {
            enum bs_reader_state s;
            while ((s = bs_reader_step(&reader, bs_guard_revision(&g))) != BS_READER_DONE) {
                CHECK(s != BS_READER_FAILED);
                if (s == BS_READER_NEED_BLOCK)
                    CHECK(bs_reader_supply(&reader, &reader.pending, pcm, reader.pending.count*3, 0));
            }
            CHECK(bs_reader_result(&reader, bs_guard_revision(&g), &result));
        }
        uint32_t writer = bs_guard_writer_begin(&g); CHECK(writer);
        /* Matching late bytes may arrive before the next step. They must never
         * produce an exposed result; all consumers consult current admission. */
        if (when == 1) CHECK(bs_reader_supply(&reader, &pending, pcm, pending.count*3, 0));
        CHECK(bs_reader_step(&reader, bs_guard_revision(&g)) == BS_READER_FAILED);
        CHECK(!bs_reader_result(&reader, bs_guard_revision(&g), &result));
        CHECK(bs_guard_writer_end(&g, writer));
        CHECK(!bs_reader_result(&reader, bs_guard_revision(&g), &result));
        CHECK(bs_guard_acquire(&g, &token));
        source.operation = token.operation; source.revision = token.revision;
        CHECK(bs_reader_begin(&reader, &q, &source) == BS_READER_RUNNING);
        while (bs_reader_step(&reader, bs_guard_revision(&g)) != BS_READER_NEED_BLOCK) {}
        CHECK(!bs_reader_supply(&reader, &pending, (const uint8_t *)0, 1, 0));
        bs_reader_cancel(&reader);
    }
    return 0;
}
int bs_guard_selftest(void) {
    int line = lifecycle(); if (line) return line;
    line = exhaustion(); if (line) return line;
    line = interleavings(); if (line) return line;
    return readerIntegration();
}
