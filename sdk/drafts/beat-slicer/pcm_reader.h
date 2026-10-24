/* SPDX-License-Identifier: MIT */
#ifndef BEAT_SLICER_PCM_READER_H
#define BEAT_SLICER_PCM_READER_H
#include "planner_job.h"
#define BS_PCM_BLOCK_FRAMES 32u

struct bs_pcm_format { uint32_t bits, channels, little_endian; };
/* Decode exactly one packed, interleaved signed 16/24-bit frame. No padding,
 * alignment or native byte order required. Mono is duplicated; output is
 * signed right-aligned 24-bit. Invalid/truncated input leaves out untouched.
 * Input and output must not overlap. No retained pointer or allocation.
 */
int bs_pcm_decode(const struct bs_pcm_format *, const uint8_t *, uint32_t bytes,
                  int32_t out[2]);

struct bs_pcm_source {
    /* Nonzero operation is unique across lifetimes, including reused storage.
     * revision covers content AND relevant metadata/tempo/owner state. The
     * adapter must establish it, serialize access and refuse wrap/reuse while
     * replies may exist. These integers do not discover native mutations.
     */
    uint32_t operation, revision, frames;
    struct bs_pcm_format format;
};
struct bs_pcm_read {
    uint32_t operation, revision, serial, first, count;
};
enum bs_reader_state { BS_READER_RUNNING, BS_READER_NEED_BLOCK, BS_READER_DONE,
                       BS_READER_CANCELLED, BS_READER_FAILED };
struct bs_pcm_reader {
    struct bs_job job;
    struct bs_pcm_source source;
    struct bs_pcm_read pending;
    uint32_t waiting, cache_first, cache_count;
    int32_t cache[BS_PCM_BLOCK_FRAMES][2];
};
/* Caller-owned initialized state, single background/UI owner, never ISR.
 * This is a portable staging adapter, not a stock pool/filesystem reader.
 * No IO callbacks, native pointers, sample writes or Apply service.
 */
enum bs_reader_state bs_reader_begin(struct bs_pcm_reader *,
    const struct bs_request *, const struct bs_pcm_source *);
/* One bounded planner/cache transition. While NEED_BLOCK, copy pending and
 * obtain 1..pending.count contiguous frames starting at pending.first.
 * A page boundary may shorten that reply. Pending polls perform no IO.
 * Pass the current revision even after DONE; a mismatch invalidates results.
 */
enum bs_reader_state bs_reader_step(struct bs_pcm_reader *, uint32_t revision);
/* Reply echoes the ENTIRE request, not a newly relabelled current request.
 * bytes is the actual readable extent, an exact whole-frame prefix. At most
 * 192 bytes are decoded/copied before return. No input pointer survives.
 * Stale replies are ignored without dereferencing data. A matching failed or
 * malformed reply fails the preview. Return 1 if consumed, 0 if stale.
 * The provider must pin/revalidate content around its copy; raw live pool
 * pointers and a generation checked only before asynchronous IO are unsafe.
 */
int bs_reader_supply(struct bs_pcm_reader *, const struct bs_pcm_read *,
                     const uint8_t *data, uint32_t bytes, int failed);
void bs_reader_cancel(struct bs_pcm_reader *);
int bs_reader_result(struct bs_pcm_reader *, uint32_t revision, struct bs_plan *);
#endif
