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
         * past each end, which wrap round the sample. A zero spread must leave
         * the first read at POS. */
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
            /* The sample is a ring (0.1.2): a grain scattered past either end is born on the other side. */
            int64_t ring = (int64_t)expected % (int64_t)count;
            if (ring < 0) ring += count;
            expected = (int32_t)ring;

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

/* The ring (0.1.2): a grain reading past an edge continues on the other side. One-frame pages make the
 * engine ask for every frame it reads, in order. */
static uint32_t ring_log[64];
static unsigned ring_n;
static uintptr_t log_frame(const void *ctx, uint32_t frame, uint32_t *first, uint32_t *count)
{
    static const uint8_t pcm[2] = {0x10, 0x00};
    (void)ctx;
    if (ring_n < 64u && (!ring_n || ring_log[ring_n - 1u] != frame))
        ring_log[ring_n++] = frame;
    *first = frame;
    *count = 1;
    return (uintptr_t)pcm;
}

static int check_ring(int reverse)
{
    /* 32768 frames: POS's word is the frame itself, so POS 127.255 starts on the last frame. */
    const uint32_t count = 32768;
    GranSample sample = {.count = count, .bytes = 2, .channels = 1, .locate = log_frame};
    GranParams params = {.pos = reverse ? 0 : 127, .posf = reverse ? 0 : 255, .size = 20, .dens = 0, .dir = reverse ? 127 : 0};
    GranEngine engine;
    gran_init(&engine);
    gran_params(&engine, 0, &params, &sample, 120 * 24);
    gran_trigger(&engine, 0);
    ring_n = 0;
    int32_t out[32];
    gran_render(&engine, 0, &params, &sample, 1, 0, out, 8);
    const uint32_t want[4] = {reverse ? 0u : count - 1u, reverse ? count - 1u : 0u, reverse ? count - 2u : 1u,
                              reverse ? count - 3u : 2u};
    for (unsigned i = 0; i < 4; ++i)
        if (ring_n <= i || ring_log[i] != want[i]) {
            fprintf(stderr, "ring %s: read %u was %" PRIu32 ", expected %" PRIu32 "\n", reverse ? "backwards" : "forwards",
                    i, ring_n > i ? ring_log[i] : 0u, want[i]);
            return 1;
        }
    return 0;
}

int main(void)
{
    if (check_ring(0) || check_ring(1)) return 1;
    puts("[PASS] A grain reading past the end continues at the beginning, and one reading back past the beginning at the end");
    /* One frame, partial pages, both sides of the former overflow, a
     * four-minute file at 44.1 kHz and the largest supported Flex sample. */
    const uint32_t lengths[] = {1, 88201, 7938000, 8388608, 8388672, 10584000, 44860416};
    for (unsigned i = 0; i < sizeof lengths / sizeof lengths[0]; ++i)
        if (check_sample(lengths[i])) return 1;
    puts("[PASS] 1792 position, spray width and first-read cases");
    return 0;
}
