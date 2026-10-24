/* SPDX-License-Identifier: MIT
 * Synthetic host/ColdFire fixtures; no stock calls, device or filesystem IO.
 */
#include "pcm_reader.h"
#define CHECK(x) do { if (!(x)) return __LINE__; } while (0)
static int same(const void *a, const void *b, uint32_t n) {
    const uint8_t *x = a, *y = b;
    while (n--) if (*x++ != *y++) return 0;
    return 1;
}
static void copy(void *a, const void *b, uint32_t n) {
    uint8_t *x = a;
    const uint8_t *y = b;
    while (n--) *x++ = *y++;
}
static void fill(void *a, uint32_t n) {
    uint8_t *p = a;
    while (n--) *p++ = 0xa5;
}
static void encode(const struct bs_pcm_format *f, const int32_t pcm[2], uint8_t *out) {
    for (uint32_t ch = 0; ch < f->channels; ++ch) {
        uint32_t v = (uint32_t)pcm[ch], n = f->bits / 8;
        if (f->bits == 16) v >>= 8;
        for (uint32_t b = 0; b < n; ++b)
            out[ch*n+b] = (uint8_t)(v >> (8*(f->little_endian ? b : n-1-b)));
    }
}
static int frame(void *ctx, uint32_t at, int32_t out[2]) {
    const struct bs_pcm_format *f = ctx;
    /* Positive, negative, quiet and unsafe values, exactly representable in 16 bits. */
    out[0] = ((int32_t)(at % 97) - 48) * 256;
    out[1] = f->channels == 1 ? out[0] : ((int32_t)(at % 67) - 33) * 256;
    return 0;
}
static void setup(struct bs_request *q, struct bs_pcm_source *s, uint32_t format) {
    s->operation = 10; s->revision = 20; s->frames = 8203;
    s->format.bits = format & 1 ? 24 : 16;
    s->format.channels = format & 2 ? 2 : 1;
    s->format.little_endian = (format >> 2) & 1;
    q->sample_rate = 8000; q->trim_start = 3; q->trim_end = s->frames;
    q->sample_bpm24 = 2881; q->project_bpm24 = 2160;
    q->beats = 1; q->tempo_source = BS_SAMPLE_BPM; q->snap = 1;
    q->existing_count = 0; q->existing = 0;
    q->read = frame; q->context = &s->format;
}
static int supply(struct bs_pcm_reader *r, uint32_t page_frames) {
    uint8_t bytes[BS_PCM_BLOCK_FRAMES * 6];
    int32_t pcm[2];
    uint32_t count = page_frames - r->pending.first % page_frames;
    uint32_t width = r->source.format.bits / 8 * r->source.format.channels;
    if (count > r->pending.count) count = r->pending.count;
    for (uint32_t i = 0; i < count; ++i) {
        frame(&r->source.format, r->pending.first + i, pcm);
        encode(&r->source.format, pcm, bytes + width*i);
    }
    int accepted = bs_reader_supply(r, &r->pending, bytes, width*count, 0);
    /* A provider's buffer may be reused immediately after supply returns. */
    fill(bytes, sizeof bytes);
    return accepted;
}
int bs_reader_selftest(void) {
    struct bs_request q;
    struct bs_pcm_source s;
    struct bs_pcm_reader r, saved;
    struct bs_plan expected, result, sentinel;
    uint8_t packed[8];
    int32_t actual[2], values[] = {0, 1, -1, 8388607, -8388608, 256, -256, 8388352};
    fill(&sentinel, sizeof sentinel);
    /* Known extrema and a seeded sweep of both encodings/channels/byte orders. */
    for (uint32_t format = 0; format < 8; ++format) {
        setup(&q, &s, format);
        uint32_t seed = 42, width = s.format.bits / 8 * s.format.channels;
        for (uint32_t i = 0; i < 520; ++i) {
            int32_t pcm[2];
            seed = seed * 1664525u + 1013904223u;
            pcm[0] = i < 8 ? values[i] : (int32_t)(seed & 0xffffff) - 8388608;
            pcm[1] = i < 8 ? values[7-i] : 8388607 - (int32_t)(seed & 0xffffff);
            if (s.format.bits == 16) for (uint32_t ch = 0; ch < 2; ++ch)
                pcm[ch] = (pcm[ch] / 256) * 256;
            encode(&s.format, pcm, packed + 1);
            CHECK(bs_pcm_decode(&s.format, packed + 1, width, actual));
            CHECK(actual[0] == pcm[0] && actual[1] == pcm[s.format.channels-1]);
            for (uint32_t short_n = 0; short_n < width; ++short_n) {
                actual[0] = 123; actual[1] = 456;
                CHECK(!bs_pcm_decode(&s.format, packed + 1, short_n, actual));
                CHECK(actual[0] == 123 && actual[1] == 456);
            }
        }
        for (uint32_t page = 1; page <= 33; page += 8) {
            CHECK(bs_preview(&q, &expected) == BS_OK);
            CHECK(bs_reader_begin(&r, &q, &s) == BS_READER_RUNNING);
            uint32_t ticks = 0;
            enum bs_reader_state st;
            while ((st = bs_reader_step(&r, s.revision)) < BS_READER_DONE) {
                CHECK(++ticks < 10000);
                if (st == BS_READER_NEED_BLOCK) {
                    CHECK(r.pending.first < s.frames && r.pending.count > 0);
                    CHECK(r.pending.count <= BS_PCM_BLOCK_FRAMES && r.pending.count <= s.frames-r.pending.first);
                    CHECK(supply(&r, page));
                }
            }
            CHECK(st == BS_READER_DONE && bs_reader_result(&r, s.revision, &result));
            CHECK(same(&result, &expected, sizeof result));
        }
    }
    /* Every transition, including READY and cache hits, can be invalidated or cancelled. */
    setup(&q, &s, 3);
    CHECK(bs_reader_begin(&r, &q, &s) == BS_READER_RUNNING);
    for (;;) {
        copy(&saved, &r, sizeof r);
        fill(&result, sizeof result);
        CHECK(!bs_reader_result(&r, s.revision + 1, &result));
        CHECK(r.job.state == BS_JOB_FAILED && same(&result, &sentinel, sizeof result));
        copy(&r, &saved, sizeof r);
        CHECK(bs_reader_step(&r, s.revision + 1) == BS_READER_FAILED);
        CHECK(!bs_reader_result(&r, s.revision, &result));
        copy(&r, &saved, sizeof r);
        bs_reader_cancel(&r);
        CHECK(bs_reader_step(&r, s.revision) == BS_READER_CANCELLED);
        CHECK(!bs_reader_supply(&r, &r.pending, 0, 0, 1));
        CHECK(!bs_reader_result(&r, s.revision, &result));
        copy(&r, &saved, sizeof r);
        if (r.job.state == BS_JOB_DONE) break;
        if (r.waiting) {
            struct bs_pcm_read reply;
            CHECK(bs_reader_step(&r, s.revision) == BS_READER_NEED_BLOCK);
            CHECK(same(&r, &saved, sizeof r));
            for (uint32_t wrong = 0; wrong < 5; ++wrong) {
                copy(&reply, &r.pending, sizeof reply);
                switch (wrong) {
                case 0: ++reply.operation; break;
                case 1: ++reply.revision; break;
                case 2: ++reply.serial; break;
                case 3: ++reply.first; break;
                default: ++reply.count; break;
                }
                CHECK(!bs_reader_supply(&r, &reply, 0, UINT32_MAX, 1));
                CHECK(same(&r, &saved, sizeof r));
            }
            for (uint32_t bad = 0; bad < 5; ++bad) {
                uint32_t size = bad == 0 ? 0 : bad == 1 ? 5 : (r.pending.count+1)*6;
                CHECK(bs_reader_supply(&r, &r.pending, bad == 3 ? 0 : packed,
                                        size, bad == 4));
                CHECK(r.job.state == BS_JOB_FAILED);
                CHECK(!bs_reader_result(&r, s.revision, &result));
                CHECK(same(&result, &sentinel, sizeof result));
                copy(&r, &saved, sizeof r);
            }
            CHECK(supply(&r, 7));
        } else bs_reader_step(&r, s.revision);
    }
    /* Storage reuse: same serial/frame/revision still cannot accept an old operation. */
    CHECK(bs_reader_begin(&r, &q, &s) == BS_READER_RUNNING);
    while (bs_reader_step(&r, s.revision) != BS_READER_NEED_BLOCK) {}
    struct bs_pcm_read old;
    copy(&old, &r.pending, sizeof old);
    ++s.operation;
    CHECK(bs_reader_begin(&r, &q, &s) == BS_READER_RUNNING);
    while (bs_reader_step(&r, s.revision) != BS_READER_NEED_BLOCK) {}
    CHECK(old.first == r.pending.first && old.serial == r.pending.serial);
    CHECK(!bs_reader_supply(&r, &old, 0, 0, 1));
    /* Highest coordinates never multiply absolute frame addresses into byte offsets. */
    q.trim_end = s.frames = UINT32_MAX; q.trim_start = UINT32_MAX - 3; q.snap = 0;
    CHECK(bs_preview(&q, &expected) == BS_OK);
    CHECK(bs_reader_begin(&r, &q, &s) == BS_READER_RUNNING);
    while (bs_reader_step(&r, s.revision) < BS_READER_DONE)
        if (r.waiting) CHECK(supply(&r, 7));
    CHECK(bs_reader_result(&r, s.revision, &result) && same(&result, &expected, sizeof result));
    for (uint32_t bad = 0; bad < 7; ++bad) {
        setup(&q, &s, 0);
        switch (bad) {
        case 0: s.operation = 0; break;
        case 1: s.revision = 0; break;
        case 2: --s.frames; break;
        case 3: s.format.bits = 32; break;
        case 4: s.format.channels = 0; break;
        case 5: s.format.little_endian = 2; break;
        default: q.sample_bpm24 = 0; break;
        }
        CHECK(bs_reader_begin(&r, &q, &s) == BS_READER_FAILED);
        CHECK(!bs_reader_result(&r, s.revision, &result));
    }
    CHECK(!bs_pcm_decode(0, packed, sizeof packed, actual));
    CHECK(!bs_pcm_decode(&s.format, 0, sizeof packed, actual));
    CHECK(!bs_pcm_decode(&s.format, packed, sizeof packed, 0));
    CHECK(bs_reader_begin(0, &q, &s) == BS_READER_FAILED);
    CHECK(bs_reader_begin(&r, 0, &s) == BS_READER_FAILED);
    CHECK(bs_reader_begin(&r, &q, 0) == BS_READER_FAILED);
    CHECK(bs_reader_step(0, 0) == BS_READER_FAILED);
    CHECK(!bs_reader_result(0, 0, &result));
    bs_reader_cancel(0);
    return 0;
}
