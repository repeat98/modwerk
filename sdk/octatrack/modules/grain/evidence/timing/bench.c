/* SPDX-License-Identifier: MIT
 * The private MKII timing probe. One render per UI tick, in module-owned RAM.
 * The portable build uses the same inputs and supplies the reference PCM digests.
 */
#include "gran.h"
#include "modwerk_module.h"

enum { CASES = 64, PAGES = 2, PAGE_FRAMES = 1024, ROUNDS = 8 };
static unsigned char audio[PAGES * PAGE_FRAMES * 6] __attribute__((aligned(4)));
static GranEngine engine;
static int32_t output[64];

struct result {
    uint32_t samples, least, worst, sum, digest;
};
struct evidence {
    uint32_t magic, version, completed, expected;
    struct result row[CASES];
};
struct evidence report = { .magic = 0x47524e54, .version = 1, .expected = CASES * ROUNDS };
static unsigned page_init;

static uintptr_t page(const void *ctx, uint32_t frame, uint32_t *first, uint32_t *count)
{
    *first = frame & ~(PAGE_FRAMES - 1u);
    *count = PAGE_FRAMES;
    return (uintptr_t)((const unsigned char *)ctx + 6u * (*first));
}

static uint32_t timer(void)
{
#ifdef HOST
    return 0;
#else
    return *(volatile uint32_t *)0xfc07c00cu; /* Read-only DTIM3, 132 MHz. */
#endif
}

static unsigned run(unsigned c)
{
    const unsigned track = (c & 1u) ? 4 : 0;
    const unsigned n = (c & 2u) ? 32 : 16;
    const unsigned cross = (c & 4u) != 0;
    GranSample sample = { 2048, 3, 2, page, audio };
    GranParams p = {
        .pos = 64, .size = 91, .dens = 127, .spray = 127, .shape = (c >> 3) & 3u,
        .dir = 64, .pan = 127, .sync = 1, .scan = (c & 32u) ? 64 : -64
    };
    GranTrack *t = &engine.t[track];
    t->pg.pcount = 0;
    t->trig = 1;
    t->sync_tempo24 = 0;
    for (unsigned i = 0; i < 6; ++i) {
        unsigned reverse = i % 2u;
        t->g[i] = (GranGrain){
            .idx = cross ? (reverse ? 1031u : 1015u) : 350u + 40u * i,
            .fr = 0xe713a3d1u, .left = 300, .ph = 0x152300u, .phs = 0x16331u,
            .start = 0, .rev = reverse, .pan = (reverse ? -1 : 1) * (int)(7001u + 2101u * i)
        };
    }

    const uint32_t start = timer();
    gran_params(&engine, track, &p, &sample, (c & 32u) ? 5760u : 3360u);
    gran_render(&engine, track, &p, &sample, (c & 32u) ? 1 : 3, 0x2175931fu, output, n);
    const uint32_t ticks = timer() - start;

    uint32_t digest = 2166136261u;
    for (unsigned i = 0; i < 2u * n; ++i)
        digest = (digest ^ (uint32_t)output[i]) * 16777619u;
    struct result *r = &report.row[c];
    if (!r->samples || ticks < r->least) r->least = ticks;
    if (ticks > r->worst) r->worst = ticks;
    r->sum += ticks;
    r->samples++;
    r->digest = digest;
    return c;
}

void module_tick(struct modwerk_runtime_api *api)
{
    if (page_init < sizeof audio) {
        unsigned end = page_init + 128;
        for (unsigned i = page_init; i < end; ++i)
            audio[i] = (unsigned char)(i * 59u + (i >> 3) * 97u);
        page_init = end;
    } else if (report.completed < report.expected) {
        run(report.completed % CASES);
        ++report.completed;
    }
    api->value = (uint32_t)(uintptr_t)&report;
}

#ifndef HOST
/* The freestanding compiler emits a call for the grain-state initializer. */
void *memcpy(void *dst, const void *src, __SIZE_TYPE__ n)
{
    unsigned char *d = dst;
    const unsigned char *s = src;
    for (__SIZE_TYPE__ i = 0; i < n; ++i) d[i] = s[i];
    return dst;
}
#endif
