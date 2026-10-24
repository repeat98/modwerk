/* SPDX-License-Identifier: MIT */
#include "pcm_reader.h"

static uint32_t width(const struct bs_pcm_format *f) {
    if (!f || (f->bits != 16 && f->bits != 24) ||
        (f->channels != 1 && f->channels != 2) || f->little_endian > 1) return 0;
    return (f->bits / 8) * f->channels;
}
int bs_pcm_decode(const struct bs_pcm_format *f, const uint8_t *data,
                  uint32_t bytes, int32_t out[2]) {
    uint32_t n = width(f);
    int32_t pcm[2];
    if (!n || !data || !out || bytes < n) return 0;
    for (uint32_t ch = 0; ch < f->channels; ++ch) {
        uint32_t v = 0, sample_bytes = f->bits / 8;
        for (uint32_t b = 0; b < sample_bytes; ++b)
            v = (v << 8) | data[ch * sample_bytes +
                (f->little_endian ? sample_bytes - 1 - b : b)];
        /* All casts/subtraction stay representable; no negative shifts or
         * implementation-defined unsigned-to-signed sign extension.
         */
        pcm[ch] = (int32_t)v - (v & (1u << (f->bits - 1)) ?
                                (int32_t)(1u << f->bits) : 0);
        if (f->bits == 16) pcm[ch] *= 256;
    }
    out[0] = pcm[0];
    out[1] = f->channels == 1 ? pcm[0] : pcm[1];
    return 1;
}
static enum bs_reader_state state(const struct bs_pcm_reader *r) {
    if (!r || r->job.state == BS_JOB_FAILED) return BS_READER_FAILED;
    if (r->job.state == BS_JOB_CANCELLED) return BS_READER_CANCELLED;
    if (r->job.state == BS_JOB_DONE) return BS_READER_DONE;
    return r->waiting ? BS_READER_NEED_BLOCK : BS_READER_RUNNING;
}
static enum bs_reader_state fail(struct bs_pcm_reader *r, enum bs_status error) {
    r->waiting = r->cache_count = 0;
    r->job.state = BS_JOB_FAILED;
    r->job.error = error;
    return BS_READER_FAILED;
}
enum bs_reader_state bs_reader_begin(struct bs_pcm_reader *r,
    const struct bs_request *request, const struct bs_pcm_source *source) {
    if (!r) return BS_READER_FAILED;
    r->waiting = r->cache_first = r->cache_count = 0;
    r->job.state = BS_JOB_FAILED;
    r->job.error = BS_INVALID;
    if (!request || !source || !source->operation || !source->revision ||
        !width(&source->format) || request->trim_end > source->frames)
        return BS_READER_FAILED;
    r->source.operation = source->operation;
    r->source.revision = source->revision;
    r->source.frames = source->frames;
    r->source.format.bits = source->format.bits;
    r->source.format.channels = source->format.channels;
    r->source.format.little_endian = source->format.little_endian;
    bs_job_begin(&r->job, request);
    return state(r);
}
static int current(struct bs_pcm_reader *r, uint32_t revision) {
    if (!r || r->job.state == BS_JOB_FAILED || r->job.state == BS_JOB_CANCELLED)
        return 0;
    if (revision != r->source.revision) { fail(r, BS_READ_ERROR); return 0; }
    return 1;
}
enum bs_reader_state bs_reader_step(struct bs_pcm_reader *r, uint32_t revision) {
    if (!current(r, revision) || r->waiting) return state(r);
    if (r->job.state == BS_JOB_NEED_FRAME) {
        uint32_t frame = r->job.frame;
        if (frame >= r->cache_first && frame - r->cache_first < r->cache_count)
            bs_job_supply(&r->job, r->job.serial, frame,
                          r->cache[frame - r->cache_first], 0);
        else {
            uint32_t count = r->source.frames - frame;
            if (count > BS_PCM_BLOCK_FRAMES) count = BS_PCM_BLOCK_FRAMES;
            r->pending.operation = r->source.operation;
            r->pending.revision = r->source.revision;
            r->pending.serial = r->job.serial;
            r->pending.first = frame;
            r->pending.count = count;
            r->waiting = 1;
        }
    } else bs_job_step(&r->job);
    return state(r);
}
int bs_reader_supply(struct bs_pcm_reader *r, const struct bs_pcm_read *reply,
                     const uint8_t *data, uint32_t bytes, int failed) {
    if (!r || !reply || !r->waiting || r->job.state != BS_JOB_NEED_FRAME ||
        reply->operation != r->pending.operation || reply->revision != r->pending.revision ||
        reply->serial != r->pending.serial || reply->first != r->pending.first ||
        reply->count != r->pending.count) return 0;
    uint32_t n = width(&r->source.format);
    if (failed || !data || !bytes || bytes % n || bytes / n > reply->count) {
        fail(r, BS_READ_ERROR);
        return 1;
    }
    r->cache_count = bytes / n;
    r->cache_first = reply->first;
    for (uint32_t i = 0; i < r->cache_count; ++i)
        bs_pcm_decode(&r->source.format, data + i*n, n, r->cache[i]);
    r->waiting = 0;
    return 1;
}
void bs_reader_cancel(struct bs_pcm_reader *r) {
    if (!r) return;
    r->waiting = r->cache_count = 0;
    bs_job_cancel(&r->job);
}
int bs_reader_result(struct bs_pcm_reader *r, uint32_t revision, struct bs_plan *out) {
    return current(r, revision) && bs_job_result(&r->job, out);
}
