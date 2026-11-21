/* Compare with wide reference arithmetic. The page callback observes the first
 * frame a triggered grain reads without allocating a Flex sample on the host. */
#include "gran.h"
#include <inttypes.h>
#include <stdio.h>

static uint32_t first_read;

static uintptr_t read_frame(const void *ctx, uint32_t frame, uint32_t *first, uint32_t *count)
{
    static const uint8_t silence[2];
    (void)ctx;
    if (first_read == UINT32_MAX)
        first_read = frame;
    *first = frame;
    *count = 1;
    return (uintptr_t)silence;
}

static int check_sample(uint32_t count)
{
    GranSample sample = {.count = count, .bytes = 2, .channels = 1, .locate = read_frame};
    GranEngine engine;
    for (unsigned dial = 0; dial < 128; ++dial) {
        /* Use different seeds across positions, including seeds that scatter
         * past each end. A zero spread must leave the first read at POS. */
        for (unsigned scattered = 0; scattered <= 1; ++scattered) {
            GranParams params = {.pos = dial, .posf = dial & 1 ? 255 : 0, .spray = scattered ? 127 - dial / 2 : 0};
            uint32_t pos_word = ((uint32_t)dial << 8) | params.posf;
            uint32_t pos = (uint64_t)(count >> 6) * pos_word >> 9;
            uint32_t width = (uint64_t)(count >> 6) * (params.spray << 8) >> 9;
            gran_init(&engine);
            engine.seed += dial * 7171u;
            uint32_t random = (engine.seed * 1664525u + 1013904223u) >> 16;
            int32_t expected = (int32_t)pos + (int32_t)((uint64_t)random * (width >> 5) >> 11)
                               - (int32_t)(width >> 1);
            if (expected < 0) expected = 0;
            if ((uint32_t)expected >= count) expected = (int32_t)count - 1;

            gran_params(&engine, 0, &params, &sample, 120 * 24);
            gran_trigger(&engine, 0);
            int32_t out[2];
            first_read = UINT32_MAX;
            gran_render(&engine, 0, &params, &sample, 1, 0, out, 1);
            if (engine.t[0].pos != pos || engine.t[0].spray != width || first_read != (uint32_t)expected) {
                fprintf(stderr, "%" PRIu32 " frames, POS %u.%u, SPRY %u: expected position/width/read "
                        "%" PRIu32 "/%" PRIu32 "/%" PRId32 ", got %" PRIu32 "/%" PRIu32 "/%" PRIu32 "\n",
                        count, dial, params.posf, params.spray, pos, width, expected,
                        engine.t[0].pos, engine.t[0].spray, first_read);
                return 1;
            }
        }
    }
    return 0;
}

int main(void)
{
    /* One frame, partial pages, both sides of the former overflow, a
     * four-minute file at 44.1 kHz and the largest supported Flex sample. */
    const uint32_t lengths[] = {1, 88201, 7938000, 8388608, 8388672, 10584000, 44860416};
    for (unsigned i = 0; i < sizeof lengths / sizeof lengths[0]; ++i)
        if (check_sample(lengths[i])) return 1;
    puts("[PASS] 1792 position, spray width and first-read cases");
    return 0;
}
