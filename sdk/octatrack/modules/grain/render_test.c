/* Compare both renderers on the same paged sample, six voices and moving controls. */
#include "gran.h"
#include <stdio.h>
#include <string.h>

void plain_render(GranEngine *, unsigned, const GranParams *, const GranSample *,
                  int32_t, uint32_t, int32_t *, unsigned);

enum { FRAMES = 1024 };
typedef struct { uint8_t data[6 * FRAMES]; unsigned stride; } Fixture;

static uintptr_t page(const void *ctx, uint32_t frame, uint32_t *first, uint32_t *count)
{
    const Fixture *fixture = ctx;
    *first = frame / 97u * 97u;
    *count = FRAMES - *first < 97u ? FRAMES - *first : 97u;
    return (uintptr_t)(fixture->data + *first * fixture->stride);
}

static int compare(Fixture *fixture, unsigned bytes, unsigned channels, unsigned shape)
{
    static const int32_t pans[] = {-32768, -1, 0, 1, 32767, -9831};
    static const unsigned spans[] = {1, 7, 16, 31, 32};
    GranSample sample = {.bytes = bytes, .channels = channels, .count = FRAMES, .locate = page, .ctx = fixture};
    GranParams p = {.shape = shape};
    fixture->stride = bytes * channels;
    GranEngine fast, plain;
    gran_init(&fast);
    for (unsigned g = 0; g < GRAN_MAX; ++g) {
        fast.t[0].g[g] = (GranGrain){
            .idx = 90 + 97 * g, .fr = 0xff123456u, .left = 9000, .start = g,
            .ph = g * 0x28907u, .phs = g & 1 ? 85013u : 419u, .rev = g & 1, .pan = pans[g]
        };
    }
    plain = fast;
    for (unsigned b = 0; b < 100; ++b) {
        int32_t expected[64], got[64];
        unsigned n = spans[b % 5];
        int32_t whole = b % 3 == 2 ? -1 : 1;
        uint32_t fraction = b % 3 == 0 ? 0 : 0xbcce0567u;
        gran_render(&fast, 0, &p, &sample, whole, fraction, got, n);
        plain_render(&plain, 0, &p, &sample, whole, fraction, expected, n);
        if (memcmp(got, expected, n * 2 * sizeof(*got)) || memcmp(fast.t[0].g, plain.t[0].g, sizeof(fast.t[0].g))) {
            fprintf(stderr, "render mismatch at block %u (%u channels, %u bytes, shape %u)\n", b, channels, bytes, shape);
            return 1;
        }
    }
    return 0;
}

int main(void)
{
    Fixture fixture;
    uint32_t seed = 1;
    for (unsigned i = 0; i < sizeof(fixture.data); ++i) {
        seed = seed * 1664525u + 1013904223u;
        fixture.data[i] = (uint8_t)(seed >> 24);
    }
    for (unsigned bytes = 2; bytes <= 3; ++bytes)
        for (unsigned channels = 1; channels <= 2; ++channels)
            for (unsigned shape = 0; shape < 4; ++shape)
                if (compare(&fixture, bytes, channels, shape)) return 1;

    GranEngine engine;
    GranSample sample = {.count = FRAMES};
    GranParams p = {.size = 127, .dens = 127, .sync = 1};
    gran_init(&engine);
    for (unsigned i = 0; i < 5; ++i) {
        static const unsigned tempos[] = {3360, 3360, 3480, 3480, 3480};
        p.sync = i != 3;
        if (i == 1) p.dens = 0;
        gran_params(&engine, 2, &p, &sample, tempos[i]);
        if (p.sync && engine.t[2].spacing != 254016000u / tempos[i] / (p.dens ? 64u : 1u)) return 1;
    }
    /* Changing from a long running sample to one frame must immediately wrap the old head.
     * Continue in both directions with the maximum 32-frame block. */
    sample.count = 1;
    sample.bytes = 2;
    sample.channels = 1;
    sample.ctx = fixture.data;
    for (int scan = -64; scan <= 63; scan += 127) {
        int32_t out[64];
        engine.t[2].scan = 44860415u;
        engine.t[2].on = 1;
        p.scan = (int8_t)scan;
        gran_params(&engine, 2, &p, &sample, 3360);
        if (engine.t[2].scan != 0) return 1;
        gran_render(&engine, 2, &p, &sample, 1, 0, out, 32);
        if (engine.t[2].scan != 0) return 1;
    }
    puts("[PASS] Six-voice audio and cursors match on 1,600 paged blocks; SYNC follows division, tempo and mode changes");
    return 0;
}
