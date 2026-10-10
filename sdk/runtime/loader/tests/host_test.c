/* SPDX-License-Identifier: GPL-3.0-or-later
 * Host check of the loader with stub machine glue: a fake stock-code region
 * at 0x1000, fake paused-task memory, and a mask the code accesses must hold.
 * Module code never runs. */
#include "../loader.c"
#include <stdio.h>
#include <string.h>

#define STOCK 0x1000u
static unsigned failures;
#define CHECK(x) do { if (!(x)) { failures++; fprintf(stderr, "%s:%d: %s\n", __FILE__, __LINE__, #x); } } while (0)
static uint8_t stock[256], paused[64];
static int stopped = 1, masked, flushed, unknown;
int modwerk_machine_stopped(void) { return stopped; }
void *modwerk_machine_uncached(void *p) { return p; }
void modwerk_machine_invalidate_code(void) {}
int modwerk_machine_patchable(uint32_t a, uint32_t n) { return a >= STOCK + 16u && n <= STOCK + sizeof stock - a; }
uint8_t *modwerk_machine_code(uint32_t a) { CHECK(masked); return stock + (a - STOCK); }
void modwerk_machine_flush_data(uint32_t a, uint32_t n) { (void)a; (void)n; flushed++; }
uint32_t modwerk_machine_mask(void) { CHECK(!masked); masked = 1; return 7; }
void modwerk_machine_unmask(uint32_t sr) { CHECK(masked && sr == 7); masked = 0; }
unsigned modwerk_machine_paused(struct runtime_span *span, unsigned max)
{
    if (unknown) return max + 1u;
    span[0] = (struct runtime_span){paused, paused + sizeof paused};
    return 1;
}

static const struct mu_backend *b = &modwerk_runtime_backend;
static uint8_t p[RUNTIME_PACKAGE_BYTES + 64];
static uint32_t n;
static void emit(uint32_t v) { put32(p + n, v); n += 4; }
static void emit16(uint32_t v) { p[n++] = (uint8_t)(v >> 8); p[n++] = (uint8_t)v; }
/* Header for `image` bytes of `fill`, a tick hook at `tick` (or none) and
 * relocations at `relocation[0..count)`, each word holding 6. */
static void begin(uint32_t image, uint32_t bss, uint32_t tick, const uint32_t *relocation, uint32_t count, uint32_t sites, uint8_t fill)
{
    n = 0; memcpy(p, "MWRM\0\3\0\0", 8); n = 8;
    emit(image); emit(bss); emit(count); emit(RUNTIME_EVENTS); emit(sites);
    emit(tick); emit(RUNTIME_NONE); emit(RUNTIME_NONE); emit(RUNTIME_NONE);
    memset(p + n, fill, image);
    for (uint32_t i = 0; i < count; ++i) if (relocation[i] + 4 <= image) put32(p + n + relocation[i], 6);
    n += image;
    for (uint32_t i = 0; i < count; ++i) emit(relocation[i]);
}
/* A site at `address` expecting stock's current bytes, becoming jmp module+2. */
static void site(uint32_t address, uint32_t length)
{
    emit(address); emit16(length); emit16(1);
    memcpy(p + n, stock + (address - STOCK), length); n += length;
    uint8_t code[RUNTIME_SITE_BYTES] = {0x4e, 0xf9, 0, 0, 0, 2};
    memcpy(p + n, code, length); n += length;
    emit16(2);
}
static int bytes_at(uint32_t address, const uint8_t *bytes, uint32_t length) { return !memcmp(stock + (address - STOCK), bytes, length); }
static uint32_t word(uint32_t address) { return be32(stock + (address - STOCK)); }

int main(void)
{
    const uint32_t four = 4, twice[2] = {4, 4};
    for (unsigned i = 0; i < sizeof stock; ++i) stock[i] = (uint8_t)(0x40 + i);
    uint8_t original[sizeof stock];
    memcpy(original, stock, sizeof stock);

    /* Refusals before any memory is taken. */
    for (uint32_t bad = 0; bad < 14; ++bad) {
        begin(8, 4, 2, &four, 1, 1, 0xa1); site(STOCK + 32, 6);
        if (bad == 0) p[0] = 'X';
        if (bad == 1) p[5] = 2;                                        /* ABI 2 */
        if (bad == 2) n -= 1;                                          /* length mismatch */
        if (bad == 3) { begin(8, 4, 8, 0, 0, 0, 0); }                  /* hook outside the image */
        if (bad == 4) { begin(RUNTIME_IMAGE_BYTES + 2, 0, 0, 0, 0, 0, 0); }
        if (bad == 5) { begin(8, 4, 2, 0, 0, 1, 0); site(STOCK + 8, 6); }     /* outside patchable code */
        if (bad == 6) { begin(8, 4, 2, 0, 0, 1, 0); site(STOCK + 33, 6); }    /* odd address */
        if (bad == 7) { begin(8, 4, 2, 0, 0, 1, 0); site(STOCK + 32, 5); }    /* odd length */
        if (bad == 8) { begin(8, 4, 2, 0, 0, 2, 0); site(STOCK + 32, 6); site(STOCK + 36, 6); } /* overlap */
        if (bad == 9) { begin(8, 4, 2, 0, 0, 1, 0); site(STOCK + 32, 6); put32(p + n - 2 - 6 + 2, 12); } /* jmp past the bss */
        if (bad == 10) { begin(8, 4, 2, 0, 0, 1, 0); site(STOCK + 32, 6); p[n - 1] = 4; }  /* site relocation past its bytes */
        if (bad == 11) { begin(8, 4, 2, twice, 2, 0, 0); }              /* the same word twice */
        if (bad == 12) { begin(8, 4, 2, 0, 0, 1, 0); site(STOCK + 32, 6); emit(0); } /* trailing bytes */
        if (bad == 13) n = RUNTIME_HEADER_BYTES - 1;
        uint32_t before = used;
        CHECK(!b->prepare(0, p, n) && used == before);
    }
    CHECK(!masked && memcmp(stock, original, sizeof stock) == 0);

    /* A: hooks, a relocated word, bss and one site, published while nothing is in flight. */
    begin(8, 4, 2, &four, 1, 1, 0xa1); site(STOCK + 32, 6);
    CHECK(b->prepare(0, p, n) && b->publish(0) == MU_APPLIED);
    const struct runtime_module *a = modwerk_runtime_active();
    uint8_t *code = (uint8_t *)(uintptr_t)(a->hook[RUNTIME_TICK] - 2);
    CHECK(a && a->sites == 1 && code[0] == 0xa1 && be32(code + 4) == (uint32_t)(uintptr_t)code + 6 && be32(code + 8) == 0);
    CHECK(stock[32] == 0x4e && stock[33] == 0xf9 && word(STOCK + 34) == (uint32_t)(uintptr_t)code + 2 && flushed > 0);
    CHECK(bytes_at(STOCK + 38, original + 38, sizeof stock - 38) && bytes_at(STOCK, original, 32));
    CHECK(b->retire(0));

    /* B patches the same place: A's bytes go back first. A paused task inside
     * a site, or unknown task state, refuses and changes nothing. */
    begin(4, 0, 0, 0, 0, 1, 0xb2); emit(STOCK + 30); emit16(8); emit16(0);
    memcpy(p + n, original + 30, 8); n += 8; memset(p + n, 0x71, 8); n += 8; /* eight nops */
    uint32_t b_size = n;
    put32(paused + 20, STOCK + 34);                              /* inside A's site */
    CHECK(b->prepare(0, p, b_size) && b->publish(0) == MU_UNCHANGED && b->discard(0) && modwerk_runtime_active() == a);
    put32(paused + 20, STOCK + 30);                              /* at B's first byte: fine */
    unknown = 1;
    CHECK(b->prepare(0, p, b_size) && b->publish(0) == MU_UNCHANGED && b->discard(0) && modwerk_runtime_active() == a);
    unknown = 0;
    CHECK(stock[32] == 0x4e);
    uint32_t before = used;
    CHECK(b->prepare(0, p, b_size) && b->discard(0) && used == before); /* discard reclaims */
    CHECK(b->prepare(0, p, b_size) && b->publish(0) == MU_APPLIED);
    CHECK(bytes_at(STOCK + 30, (const uint8_t *)"\x71\x71\x71\x71\x71\x71\x71\x71", 8) && bytes_at(STOCK + 38, original + 38, 2));
    /* Rollback puts A back exactly. */
    CHECK(b->restore(0) && modwerk_runtime_active() == a && stock[32] == 0x4e && bytes_at(STOCK + 30, original + 30, 2));

    /* Code changed under a module: switching away is refused and nothing moves. */
    stock[33] ^= 1;
    begin(0, 0, RUNTIME_NONE, 0, 0, 0, 0);
    CHECK(b->prepare(0, p, n) && b->publish(0) == MU_UNCHANGED && b->discard(0) && modwerk_runtime_active() == a);
    stock[33] ^= 1;
    /* A site whose stock bytes are not there is refused, and A stays applied. */
    begin(4, 0, 0, 0, 0, 1, 0); site(STOCK + 64, 6); stock[64] ^= 1;
    CHECK(b->prepare(0, p, n) && b->publish(0) == MU_UNCHANGED && b->discard(0) && stock[32] == 0x4e);
    stock[64] ^= 1;
    /* Removal restores stock everywhere. */
    begin(0, 0, RUNTIME_NONE, 0, 0, 0, 0);
    CHECK(b->prepare(0, p, n) && b->publish(0) == MU_APPLIED && !modwerk_runtime_active());
    CHECK(memcmp(stock, original, sizeof stock) == 0);

    /* Memory is never reused before a reboot; when the pool is full, loads are refused. */
    unsigned loads = 0;
    for (; loads < 64; ++loads) {
        begin(RUNTIME_IMAGE_BYTES - 16, 0, 0, 0, 0, 0, 0xc3);
        if (!b->prepare(0, p, n)) break;
        CHECK(b->publish(0) == MU_APPLIED && b->retire(0));
    }
    CHECK(loads == RUNTIME_POOL_BYTES / RUNTIME_IMAGE_BYTES - 1);
    begin(0, 0, RUNTIME_NONE, 0, 0, 0, 0);
    CHECK(b->prepare(0, p, n) && b->publish(0) == MU_APPLIED); /* removal needs no memory */

    /* Activation only while nothing plays or records. */
    stopped = 0;
    CHECK(!b->enter(0) && !b->safe(0));
    stopped = 1;
    CHECK(b->enter(0) && b->safe(0) && b->leave(0) && !b->safe(0) && !masked);
    if (failures) { fprintf(stderr, "%u loader checks failed\n", failures); return 1; }
    puts("Loader: refusals, relocation, bss, hooks, stock-code sites (in-flight, stock and changed-code refusals, "
         "replace, rollback, removal) and pool exhaustion passed.");
    return 0;
}
