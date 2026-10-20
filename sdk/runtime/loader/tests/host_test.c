/* SPDX-License-Identifier: GPL-3.0-or-later
 * Host check of the loader with stub machine glue: a fake stock-code region
 * at 0x1000, fake paused-task memory, and a mask the code accesses must hold.
 * Module code never runs. */
#define MODWERK_RUNTIME_REFERENCE_EXTERNAL
#define MODWERK_RUNTIME_METADATA_EXTERNAL
#define MODWERK_RUNTIME_JOURNAL_EXTERNAL
#include "../loader.c"
#include "../../upload/sha256.c"
#include <stdio.h>
#include <string.h>

#define STOCK 0x1000u
static unsigned failures;
#define CHECK(x) do { if (!(x)) { failures++; fprintf(stderr, "%s:%d: %s\n", __FILE__, __LINE__, #x); } } while (0)
static uint8_t stock[256], original[256], paused[64], saved_registers[64];
static int stopped = 1, masked, locked, flushed, unknown;
int modwerk_machine_stopped(void) { return stopped; }
/* Pool pushes (MODWERK_CACHED_MODULES): how many, the last range, and how many an instruction-cache invalidation
 * followed before the next one. Host addresses are truncated to 32 bits, as the loader passes them. */
static unsigned uncached_calls, pool_flushes, pool_flushes_invalidated;
static uint32_t pushed_at, pushed_bytes;
static int push_pending;
static int in_pool(uint32_t a, uint32_t n) { uint32_t lo = (uint32_t)(uintptr_t)pool; return a >= lo && n <= RUNTIME_POOL_BYTES - (a - lo); }
void *modwerk_machine_uncached(void *p) { ++uncached_calls; return p; }
void modwerk_machine_invalidate_code(void) { if (push_pending) push_pending = 0, ++pool_flushes_invalidated; }
int modwerk_machine_patchable(uint32_t a, uint32_t n) { return a >= STOCK + 16u && n <= STOCK + sizeof stock - a; }
/* Code is read under the lock (the checks before a switch run unmasked) and written masked: put() flushes each
 * site just before writing it. A pool extent is pushed off-line, before anything runs there (cached modules). */
uint8_t *modwerk_machine_code(uint32_t a) { CHECK(locked); return stock + (a - STOCK); }
void modwerk_machine_flush_data(uint32_t a, uint32_t n)
{
    flushed++;
    if (!in_pool(a, n)) { CHECK(masked); return; }
    CHECK(!push_pending && !locked && !masked && !(a & 15u) && !(n & 15u)); /* whole lines, off-line: nothing runs there yet */
    ++pool_flushes, pushed_at = a, pushed_bytes = n, push_pending = 1;
}
#ifdef MODWERK_CACHED_MODULES
/* The last push covered exactly m's extent, and an instruction-cache invalidation followed it. */
static int pushed(const struct runtime_module *m)
{ return m && !push_pending && pushed_at == (uint32_t)(uintptr_t)m && pushed_bytes == m->size; }
#endif
uint32_t modwerk_machine_mask(void) { CHECK(!masked && locked); masked = 1; return 7; }
void modwerk_machine_unmask(uint32_t sr) { CHECK(masked && sr == 7); masked = 0; }
uint32_t modwerk_machine_lock(void) { CHECK(!locked && !masked); locked = 1; return 4; }
void modwerk_machine_unlock(uint32_t sr) { CHECK(locked && !masked && sr == 4); locked = 0; }
unsigned modwerk_machine_paused(struct runtime_span *span, unsigned max, const struct runtime_context *context)
{
    (void)context;
    CHECK(locked);
    if (unknown) return max + 1u;
    span[0] = (struct runtime_span){paused, paused + sizeof paused};
    span[1] = (struct runtime_span){saved_registers, saved_registers + sizeof saved_registers};
    return 2;
}

/* DSP glue: refuses with `dsp_why` (masked or not) and records the last switch. */
static int dsp_why, dsp_switches;
static struct runtime_dsp dsp_from, dsp_to;
static int dsp_handle = -1; /* the effect id the machine gives, -1: the preferred one */
int modwerk_machine_dsp_admit(const struct runtime_dsp *from, struct runtime_dsp *to)
{
    (void)from;
    if (dsp_handle >= 0 && to->count) to->id = (uint8_t)dsp_handle;
    return dsp_why;
}
void modwerk_machine_dsp_switch(const struct runtime_dsp *from, const struct runtime_dsp *to)
{
    CHECK(locked && !masked); dsp_from = *from; dsp_to = *to; ++dsp_switches; /* no task runs; frames may */
}

static uint32_t alias_image;
uint32_t modwerk_machine_reference(uint32_t value)
{
    if (alias_image && value >= 0x48010000u && value < 0x48010040u) return alias_image + value - 0x48010000u;
    if (value >= 0x40010000u && value < 0x40010040u) return alias_image ? alias_image + value - 0x40010000u : value + 0x08000000u;
    return value;
}
static int metadata_allow, metadata_why;
int modwerk_machine_metadata_admit(const struct runtime_dsp *from, struct runtime_dsp *to,
    const struct runtime_context *context,enum runtime_metadata_operation operation)
{
    (void)context;(void)operation;
    return (from->flags | to->flags) & RUNTIME_GROUP_METADATA ? (metadata_allow ? metadata_why : RUNTIME_MALFORMED) : RUNTIME_OK;
}

/* Trusted synthetic adapter: exercises the actual loader journal; it is not
 * a DSP driver, resource census or physical ACK qualification. */
static int journal_enabled,journal_begin_safe,journal_admitted,journal_roots=1,journal_commit=1,journal_switch_safe=1;
static enum runtime_journal_observation journal_observed=RJ_READY;
static uint8_t journal_masks[3];
static unsigned journal_jobs;
int modwerk_machine_journal_enabled(void) { CHECK(locked);return journal_enabled; }
int modwerk_machine_journal_begin_safe(void) { CHECK(locked);return journal_begin_safe; }
int modwerk_machine_journal_admit(const struct runtime_journal_view *rows,unsigned count)
{
    CHECK(locked && count && count<=RUNTIME_JOURNAL_ROWS);
    for(unsigned i=0;i<count;i++) {
        CHECK(!rows[i].before.generation || modwerk_runtime_owner_valid(&rows[i].before));
        CHECK(!rows[i].after.generation || modwerk_runtime_owner_valid(&rows[i].after));
        for(unsigned j=0;j<i;j++) CHECK(rows[i].position!=rows[j].position);
    }
    return journal_admitted;
}
enum runtime_journal_observation modwerk_machine_journal_transition(const struct runtime_journal_view *row,int reverse,uint8_t masks[3])
{
    (void)reverse;CHECK(locked);
    CHECK(!row->before.generation || modwerk_runtime_owner_valid(&row->before));
    CHECK(!row->after.generation || modwerk_runtime_owner_valid(&row->after));
    memcpy(masks,journal_masks,3);++journal_jobs;return journal_observed;
}
int modwerk_machine_journal_committed(const struct runtime_journal_view *row,int reverse)
{
    CHECK(locked && !masked && row->position<RUNTIME_MODULES);
    const struct runtime_dsp *actual=dsp_of(live[row->position]);
    const struct runtime_dsp *expected=reverse?row->from:row->to;
    CHECK(actual==expected); /* final live pointer, after the site writes */
    if(live[row->position]) {
        for(unsigned i=0;i<live[row->position]->sites;i++) {
            const struct runtime_site *site=&live[row->position]->site[i];
            CHECK(!memcmp(stock+(site->address-STOCK),site->code,site->length));
        }
    }
    return journal_commit;
}
int modwerk_machine_journal_switch_safe(const struct runtime_journal_view *row,int reverse)
{
    (void)reverse;CHECK(locked && !masked);
    CHECK(!row->before.generation || modwerk_runtime_owner_valid(&row->before));
    CHECK(!row->after.generation || modwerk_runtime_owner_valid(&row->after));
    return journal_switch_safe;
}
int modwerk_machine_journal_roots_clear(const struct runtime_journal_view *row)
{ (void)row;CHECK(locked);return journal_roots; }
/* Synthetic Keep answer; the loader must offer only exact published fresh installs. */
static int journal_accept=1;
static unsigned journal_accepts;
int modwerk_machine_journal_accept(const struct runtime_journal_view *rows,unsigned count)
{
    CHECK(locked && !masked && journal.progress.phase==RJ_TRIAL && count==journal.progress.records);
    for(unsigned i=0;i<count;i++)
        CHECK(!rows[i].before.generation && rows[i].from==&no_dsp && modwerk_runtime_owner_valid(&rows[i].after) &&
              live[rows[i].position] && rows[i].to==&live[rows[i].position]->dsp && rows[i].position==journal.row[i].position);
    ++journal_accepts;return journal_accept;
}
static unsigned journal_idles;
void modwerk_machine_journal_idle(uint32_t generation)
{ CHECK(locked && generation==journal.progress.generation && journal.progress.phase==RJ_IDLE);++journal_idles; }
static const struct mu_backend *b = &modwerk_runtime_backend;
static uint8_t p[RUNTIME_PACKAGE_BYTES + 64];
static uint32_t n;
static void emit(uint32_t v) { put32(p + n, v); n += 4; }
static void emit16(uint32_t v) { p[n++] = (uint8_t)(v >> 8); p[n++] = (uint8_t)v; }
/* ABI 4 header of module `id` for `image` bytes of `fill`, a tick hook at
 * `tick` (or none) and relocations at `relocation[0..count)`, each word holding 6. */
static uint32_t id = 7;
static void begin(uint32_t image, uint32_t bss, uint32_t tick, const uint32_t *relocation, uint32_t count, uint32_t sites, uint8_t fill)
{
    n = 0; memcpy(p, "MWRM\0\4\0\0", 8); n = 8;
    emit(image); emit(bss); emit(count); emit(RUNTIME_EVENTS); emit(sites); emit(id);
    emit(tick); emit(RUNTIME_NONE); emit(RUNTIME_NONE); emit(RUNTIME_NONE);
    memset(p + n, fill, image);
    for (uint32_t i = 0; i < count; ++i) if (relocation[i] + 4 <= image) put32(p + n + relocation[i], 6);
    n += image;
    for (uint32_t i = 0; i < count; ++i) emit(relocation[i]);
}
/* A site at `address` expecting stock's original bytes, becoming jmp module+2. */
static void site(uint32_t address, uint32_t length)
{
    emit(address); emit16(length); emit16(1);
    memcpy(p + n, original + (address - STOCK), length); n += length;
    uint8_t code[RUNTIME_SITE_BYTES] = {0x4e, 0xf9, 0, 0, 0, 2};
    memcpy(p + n, code, length); n += length;
    emit16(2);
}
/* ABI 5: the same header with a DSP descriptor, then after the sites its
 * words (a relocation word holds 1) and relocations. */
static void begin5(uint32_t image, uint32_t effect, uint32_t words, uint32_t relocs)
{
    begin(image, 0, image ? 0 : RUNTIME_NONE, 0, 0, 0, 0xe1);
    memmove(p + 50, p + 32, n - 32); n += 18; p[5] = 5; p[48] = 0x40; p[49] = 0;
    put32(p + 32, words); p[36] = (uint8_t)(relocs >> 8); p[37] = (uint8_t)relocs; p[38] = (uint8_t)effect; p[39] = 1;
    p[40] = 0; p[41] = 1; p[42] = 0; p[43] = 2; p[44] = 0; p[45] = 244; p[46] = RUNTIME_MODELED; p[47] = 70;
}
static void dsp_words(uint32_t words, const uint16_t *reloc, uint32_t relocs)
{
    for (uint32_t i = 0; i < words; ++i) emit(0x0c0000u + i);
    for (uint32_t i = 0; i < relocs; ++i) put32(p + n - 4u * words + 4u * reloc[i], 1);
    for (uint32_t i = 0; i < relocs; ++i) emit16(reloc[i]);
}
/* ABI 7: the ABI 4 header grown to 72 bytes (no DSP code, a display name, `copies` stock copies). */
static void begin7(uint32_t image, uint32_t tick, uint32_t sites, uint8_t fill)
{
    begin(image, 0, tick, 0, 0, sites, fill);
    memmove(p + 72, p + 32, n - 32); n += 40; p[5] = 7;
    memset(p + 32, 0, 40); memcpy(p + 50, "Tape Echo", 9); p[67] = 1;
}
/* ABI 8 adds the explicit fill count, without changing legacy header 7. */
static void begin8(uint32_t image, uint32_t tick, uint32_t sites)
{
    begin7(image, tick, sites, 0);
    memmove(p + 76, p + 72, n - 72); n += 4; p[5] = 8; memset(p + 72, 0, 4);
}
static void fill8(uint32_t offset, uint32_t length, uint8_t value)
{
    put32(p + 72, be32(p + 72) + 1u);
    emit(offset); emit(length); p[n++] = value; p[n++] = 0; p[n++] = 0; p[n++] = 0;
}
/* An ABI 7 stock copy (after the sites): `length` stock bytes from `address` into the image at `offset`. */
static void copy7(uint32_t offset, uint32_t address, uint32_t length)
{
    put32(p + 68, be32(p + 68) + 1u);
    emit(offset); emit(address); emit16(length); emit16(0);
    mu_sha256(original + (address - STOCK), length, p + n); n += 32;
}
/* An ABI 7 site: the SHA-256 of stock's first `checked` bytes instead of the bytes, the first `keep` new bytes
 * taken from stock, jmp module+2. */
static void site7(uint32_t address, uint32_t length, uint32_t keep, uint32_t checked)
{
    emit(address); p[n++] = (uint8_t)length; p[n++] = (uint8_t)keep; p[n++] = (uint8_t)checked; p[n++] = 1;
    mu_sha256(original + (address - STOCK), checked, p + n); n += 32;
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
    memcpy(original, stock, sizeof stock);

    uint8_t capabilities[14]; memset(capabilities, 0xa5, sizeof capabilities);
    CHECK(modwerk_runtime_capabilities(capabilities) == 12u);
    CHECK(!memcmp(capabilities, "MWCP", 4) && capabilities[4] == 1 && capabilities[5] == 8);
    CHECK(be16(capabilities + 6) == 7 && be16(capabilities + 8) == 128 && be16(capabilities + 10) == 128);
    CHECK(capabilities[12] == 0xa5 && capabilities[13] == 0xa5);

    struct runtime_module alias_group; memset(&alias_group, 0, sizeof alias_group);
    alias_group.dsp.flags = RUNTIME_GROUP_METADATA; alias_group.dsp.image = (const uint8_t *)(uintptr_t)0x48010000u;
    alias_group.dsp.image_bytes = 64;
    CHECK(retiring(&alias_group, 0x48010020u) && retiring(&alias_group, 0x40010020u));
    CHECK(retiring(&alias_group, 0x40010008u) && retiring(&alias_group, 0x48010008u));
    CHECK(retiring(&alias_group, 0x4001003fu) && retiring(&alias_group, 0x4801003fu));
    CHECK(!retiring(&alias_group, 0x40010007u) && !retiring(&alias_group, 0x48010040u));

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
        if (bad == 13) n = 71u;
        CHECK(!b->prepare(0, p, n) && modwerk_runtime_free(0) == RUNTIME_POOL_BYTES && modwerk_runtime_refusal() == RUNTIME_MALFORMED);
    }
    CHECK(!masked && !locked && memcmp(stock, original, sizeof stock) == 0);

    /* A: hooks, a relocated word, bss and one site, published while nothing is in flight. */
    begin(8, 4, 2, &four, 1, 1, 0xa1); site(STOCK + 32, 6);
    CHECK(b->prepare(0, p, n) && b->publish(0) == MU_APPLIED);
    const struct runtime_module *a = modwerk_runtime_module(0);
    uint8_t *code = (uint8_t *)(uintptr_t)(a->hook[RUNTIME_TICK] - 2);
    CHECK(a && a->sites == 1 && code[0] == 0xa1 && be32(code + 4) == (uint32_t)(uintptr_t)code + 6 && be32(code + 8) == 0);
    CHECK(stock[32] == 0x4e && stock[33] == 0xf9 && word(STOCK + 34) == (uint32_t)(uintptr_t)code + 2 && flushed > 0);
    CHECK(bytes_at(STOCK + 38, original + 38, sizeof stock - 38) && bytes_at(STOCK, original, 32));
#ifdef MODWERK_CACHED_MODULES
    /* Cached modules: the record, its hooks and its relocated words are in the pool's own alias, and its extent was
     * pushed once, then the instruction caches invalidated. */
    CHECK(in_pool((uint32_t)(uintptr_t)a, a->size) && in_pool((uint32_t)a->hook[RUNTIME_TICK], 2) &&
          in_pool(be32(code + 4), 4) && word(STOCK + 34) == (uint32_t)a->hook[RUNTIME_TICK]);
    CHECK(pool_flushes == 1 && pushed(a));
#endif
    CHECK(b->retire(0));

    /* B patches the same place: A's bytes go back first. A paused task inside
     * a site, or unknown task state, refuses and changes nothing. */
    begin(4, 0, 0, 0, 0, 1, 0xb2); emit(STOCK + 30); emit16(8); emit16(0);
    memcpy(p + n, original + 30, 8); n += 8; memset(p + n, 0x71, 8); n += 8; /* eight nops */
    uint32_t b_size = n;
    put32(paused + 20, STOCK + 34);                              /* inside A's site */
    CHECK(b->prepare(0, p, b_size) && b->publish(0) == MU_UNCHANGED && b->discard(0) && modwerk_runtime_module(0) == a);
    /* The browser cancels a positively unchanged commit before restaging. Discard and leave must not erase the
     * busy diagnostic it reads between those steps; only the next prepare clears it. */
    CHECK(modwerk_runtime_refusal() == RUNTIME_BUSY);
    CHECK(b->leave(0) && modwerk_runtime_refusal() == RUNTIME_BUSY);
    CHECK(b->enter(0) && modwerk_runtime_refusal() == RUNTIME_BUSY);
    put32(paused + 20, STOCK + 30);                              /* at B's first byte: fine */
    unknown = 1;
    CHECK(b->prepare(0, p, b_size) && b->publish(0) == MU_UNCHANGED && b->discard(0) && modwerk_runtime_module(0) == a);
    unknown = 0;
    CHECK(stock[32] == 0x4e);
    uint32_t before = modwerk_runtime_free(0);
    CHECK(b->prepare(0, p, b_size) && modwerk_runtime_free(0) < before && b->discard(0) && modwerk_runtime_free(0) == before); /* discard frees */
    CHECK(b->prepare(0, p, b_size) && b->publish(0) == MU_APPLIED);
    CHECK(bytes_at(STOCK + 30, (const uint8_t *)"\x71\x71\x71\x71\x71\x71\x71\x71", 8) && bytes_at(STOCK + 38, original + 38, 2));
    /* Rollback puts A back exactly. */
    CHECK(b->restore(0) && modwerk_runtime_module(0) == a && stock[32] == 0x4e && bytes_at(STOCK + 30, original + 30, 2));

    /* Code changed under a module: switching away is refused and nothing moves. */
    stock[33] ^= 1;
    begin(0, 0, RUNTIME_NONE, 0, 0, 0, 0);
    CHECK(b->prepare(0, p, n) && b->publish(0) == MU_UNCHANGED && b->discard(0) && modwerk_runtime_module(0) == a);
    stock[33] ^= 1;
    /* A site whose stock bytes are not there is refused, and A stays applied. */
    begin(4, 0, 0, 0, 0, 1, 0); site(STOCK + 64, 6); stock[64] ^= 1;
    CHECK(b->prepare(0, p, n) && b->publish(0) == MU_UNCHANGED && b->discard(0) && stock[32] == 0x4e);
    stock[64] ^= 1;
    /* Removal restores stock everywhere. */
    begin(0, 0, RUNTIME_NONE, 0, 0, 0, 0);
    CHECK(b->prepare(0, p, n) && b->publish(0) == MU_APPLIED && !modwerk_runtime_module(0));
    CHECK(memcmp(stock, original, sizeof stock) == 0);

    /* Reclaimed: a module no position reaches is freed once no paused task
     * holds an address inside it, so loads never run out by repetition. */
    CHECK(b->retire(0) && modwerk_runtime_free(0) == RUNTIME_POOL_BYTES);
    unsigned loads = 0;
    for (; loads < 64; ++loads) {
        begin(RUNTIME_POOL_BYTES / 8u, 0, 0, 0, 0, 0, 0xc3); /* a replacement holds old and new at once */
        if (!b->prepare(0, p, n)) break;
        CHECK(b->publish(0) == MU_APPLIED && b->retire(0));
    }
    CHECK(loads == 64 && modwerk_runtime_active() == 1);
    const struct runtime_module *old = modwerk_runtime_module(0);
    put32(paused + 40, (uint32_t)(uintptr_t)old + 40u);          /* a paused task inside it */
    begin(16, 0, 0, 0, 0, 0, 0xc4);
    CHECK(b->prepare(0, p, n) && b->publish(0) == MU_APPLIED && b->retire(0));
    uint32_t small = modwerk_runtime_module(0)->size, free = modwerk_runtime_free(0);
    CHECK(free == RUNTIME_POOL_BYTES - old->size - small);         /* kept */
    unknown = 1;
    CHECK(b->retire(0) && modwerk_runtime_free(0) == free);        /* unknown task state frees nothing */
    unknown = 0;
    put32(paused + 40, 0);
    CHECK(b->retire(0) && modwerk_runtime_free(0) == RUNTIME_POOL_BYTES - small);

    /* Several modules at once, each at its own position with its own memory. */
    begin(0, 0, RUNTIME_NONE, 0, 0, 0, 0);
    CHECK(b->prepare(0, p, n) && b->publish(0) == MU_APPLIED && b->retire(0) && !modwerk_runtime_active());
    id = 1; begin(8, 4, 2, &four, 1, 1, 0xd1); site(STOCK + 32, 6);
    CHECK(b->prepare(0, p, n) && b->publish(0) == MU_APPLIED && b->retire(0));
    id = 2; begin(8, 0, 2, 0, 0, 1, 0xd2); site(STOCK + 64, 6);
    CHECK(b->prepare(0, p, n) && b->publish(0) == MU_APPLIED && b->retire(0));
    const struct runtime_module *one = modwerk_runtime_module(0), *two = modwerk_runtime_module(1);
    const uint32_t one_size = one->size;
    CHECK(modwerk_runtime_active() == 2 && one->id == 1 && two->id == 2 && stock[32] == 0x4e && stock[64] == 0x4e);
    CHECK(word(STOCK + 34) == (uint32_t)(uintptr_t)one->hook[RUNTIME_TICK] && word(STOCK + 66) == (uint32_t)(uintptr_t)two->hook[RUNTIME_TICK]);
    /* A third patching bytes module 1 patches is refused before anything changes. */
    id = 3; begin(8, 0, 0, 0, 0, 1, 0xd3); site(STOCK + 34, 6);
    free = modwerk_runtime_free(0);
    CHECK(!b->prepare(0, p, n) && modwerk_runtime_refusal() == RUNTIME_CONFLICT && modwerk_runtime_free(0) == free);
    CHECK(modwerk_runtime_module(0) == one && modwerk_runtime_module(1) == two && !modwerk_runtime_module(2) && stock[32] == 0x4e);
    /* Module 1 may move its own site; module 2 is untouched. */
    id = 1; begin(8, 0, 0, 0, 0, 1, 0xd4); site(STOCK + 34, 6);
    CHECK(b->prepare(0, p, n) && b->publish(0) == MU_APPLIED);
    CHECK(bytes_at(STOCK + 32, original + 32, 2) && stock[34] == 0x4e && modwerk_runtime_module(1) == two && stock[64] == 0x4e);
    CHECK(b->restore(0) && modwerk_runtime_module(0) == one && stock[32] == 0x4e && bytes_at(STOCK + 38, original + 38, 2));
    /* Removing module 1 leaves module 2 live; a new module takes the free position. */
    begin(0, 0, RUNTIME_NONE, 0, 0, 0, 0);
    CHECK(b->prepare(0, p, n) && b->publish(0) == MU_APPLIED && b->retire(0));
    CHECK(!modwerk_runtime_module(0) && modwerk_runtime_module(1) == two && bytes_at(STOCK + 30, original + 30, 10) && stock[64] == 0x4e);
    uint32_t largest;
    CHECK(modwerk_runtime_free(&largest) == RUNTIME_POOL_BYTES - two->size && largest == RUNTIME_POOL_BYTES - two->size - one_size); /* module 1 left a hole below 2 */
    id = 4; begin(8, 0, 0, 0, 0, 0, 0xd5);
    CHECK(b->prepare(0, p, n) && b->publish(0) == MU_APPLIED && b->retire(0) && modwerk_runtime_module(0)->id == 4);
    /* INVENTORY: the live modules in position order, a page from `first`, no DSP code is effect 0xff. */
    uint8_t list[4 + 24 * 13];
    CHECK(modwerk_runtime_list(list, 0, 13) == 52 && !memcmp(list, "MWI\2", 4) && list[4] == 0xff && list[5] == 0 &&
          be32(list + 8) == 4 && be32(list + 32) == two->id && !list[12] && !memcmp(list + 36, two->dsp.name, 16));
    CHECK(modwerk_runtime_list(list, 1, 13) == 28 && list[3] == 1 && be32(list + 8) == two->id);
    CHECK(modwerk_runtime_list(list, 2, 13) == 4 && !memcmp(list, "MWI\0", 4) && modwerk_runtime_list(list, 0, 1) == 28);
    /* Genuine exhaustion refuses before activation and keeps the live set. */
    unsigned fitted = 0;
    for (id = 100; id < 100 + RUNTIME_MODULES; ++id) {
        begin(RUNTIME_IMAGE_BYTES - 16, 0, 0, 0, 0, 0, 0xd6);
        if (!b->prepare(0, p, n)) break;
        CHECK(b->publish(0) == MU_APPLIED && b->retire(0));
        ++fitted;
    }
    CHECK(fitted > 0 && modwerk_runtime_refusal() == RUNTIME_MEMORY && modwerk_runtime_active() == 2 + fitted);
    CHECK(modwerk_runtime_module(1) == two && stock[64] == 0x4e);
    /* Small modules fill every position; one more is refused. */
    for (; id < 1000 && modwerk_runtime_active() < RUNTIME_MODULES; ++id) {
        begin(4, 0, 0, 0, 0, 0, 0xd7);
        CHECK(b->prepare(0, p, n) && b->publish(0) == MU_APPLIED && b->retire(0));
    }
    begin(4, 0, 0, 0, 0, 0, 0xd8);
    CHECK(!b->prepare(0, p, n) && modwerk_runtime_refusal() == RUNTIME_FULL && modwerk_runtime_active() == RUNTIME_MODULES);
    /* An ABI 3 package is module 0: it replaces module 0, not another. */
    for (id = 100; id < 100 + fitted; ++id) {
        begin(0, 0, RUNTIME_NONE, 0, 0, 0, 0);
        CHECK(b->prepare(0, p, n) && b->publish(0) == MU_APPLIED && b->retire(0));
    }
    begin(4, 0, 0, 0, 0, 0, 0xd9);
    memmove(p + 28, p + 32, n - 32); n -= 4; p[5] = 3;
    CHECK(b->prepare(0, p, n) && b->publish(0) == MU_APPLIED && b->retire(0) && modwerk_runtime_module(1) == two);
    unsigned zero = 0;
    for (unsigned i = 0; i < RUNTIME_MODULES; ++i) zero += modwerk_runtime_module(i) && modwerk_runtime_module(i)->id == 0;
    CHECK(zero == 1);

    /* Every module removed: the table is empty again. */
    for (unsigned i = 0; i < RUNTIME_MODULES; ++i) {
        if (!modwerk_runtime_module(i)) continue;
        id = modwerk_runtime_module(i)->id; begin(0, 0, RUNTIME_NONE, 0, 0, 0, 0);
        if (!id) { memmove(p + 28, p + 32, n - 32); n -= 4; p[5] = 3; }
        CHECK(b->prepare(0, p, n) && b->publish(0) == MU_APPLIED && b->retire(0));
    }
    CHECK(!modwerk_runtime_active() && modwerk_runtime_free(0) == RUNTIME_POOL_BYTES);
    dsp_switches = 0; /* every switch tells the machine, with or without DSP code */

    /* DSP effects (ABI 5): the code and its needs are kept in the module's extent and handed to the machine at the switch. */
    const uint16_t reloc[2] = {1, 3}, unordered[2] = {3, 1};
    id = 40; begin5(0, 26, 5, 2); dsp_words(5, reloc, 2);
    CHECK(b->prepare(0, p, n) && b->publish(0) == MU_APPLIED && b->retire(0) && dsp_switches == 1);
    const struct runtime_module *fx = modwerk_runtime_module(0);
#ifdef MODWERK_CACHED_MODULES
    CHECK(pushed(fx) && in_pool((uint32_t)(uintptr_t)fx->dsp.words, 20)); /* the push covers the DSP words, the extent's tail */
#endif
    CHECK(fx && fx->id == 40 && !fx->hook[RUNTIME_TICK] && dsp_to.count == 5 && dsp_to.id == 26 && dsp_to.module == 40 && dsp_to.slots == 1 && dsp_to.init == 1 &&
          dsp_to.proc == 2 && dsp_to.cycles == 244 && dsp_to.kind == RUNTIME_MODELED && dsp_to.state == 70 && dsp_to.buffer == 0x4000 && !dsp_from.count);
    CHECK(dsp_to.words == fx->dsp.words && dsp_to.words[0] == 0x0c0000u && dsp_to.words[1] == 1 && dsp_to.words[4] == 0x0c0004u &&
          dsp_to.relocation_count == 2 && dsp_to.relocations[0] == 1 && dsp_to.relocations[1] == 3);
    CHECK(!fx->dsp.name[0] && !fx->dsp.layout); /* ABI 5: no name, layout 0 */
    /* ABI 6: the DSP descriptor adds the display name (16 bytes, NUL-ended) and the parameter-layout number. */
    id = 40; begin5(0, 26, 5, 2);
    memmove(p + 68, p + 50, n - 50); n += 18; p[5] = 6;
    memcpy(p + 50, "E-Verb\0\0\0\0\0\0\0\0\0X", 16); p[66] = 0; p[67] = 3; /* an unterminated name is cut at 15 */
    dsp_words(5, reloc, 2);
    CHECK(b->prepare(0, p, n) && b->publish(0) == MU_APPLIED && b->retire(0) && dsp_switches == 2);
    fx = modwerk_runtime_module(0);
    CHECK(!strcmp(fx->dsp.name, "E-Verb") && fx->dsp.layout == 3 && dsp_to.layout == 3 && !strcmp(dsp_to.name, "E-Verb"));
    CHECK(!fx->dsp.page);                                                          /* no page recipe flagged */
    /* Flag 1 (ABI 6 only): the image starts with the machine's page recipe; other flags are refused. */
    id = 40; begin5(4, 26, 5, 2);
    memmove(p + 68, p + 50, n - 50); n += 18; p[5] = 6; p[7] = 1;
    memcpy(p + 50, "E-Verb\0\0\0\0\0\0\0\0\0\0", 16); p[66] = 0; p[67] = 3;
    dsp_words(5, reloc, 2);
    CHECK(b->prepare(0, p, n) && b->publish(0) == MU_APPLIED && b->retire(0));
    fx = modwerk_runtime_module(0);
    CHECK(fx->dsp.page && fx->dsp.page == (const uint8_t *)fx + ((sizeof(struct runtime_module) + 15u) & ~15u) && dsp_to.page == fx->dsp.page &&
          fx->dsp.page_bytes == 4);
    /* Flag 2: the effect id is pinned (its ColdFire code names it); flag 4 is not defined. */
    p[7] = 3; CHECK(b->prepare(0, p, n) && b->publish(0) == MU_APPLIED && b->retire(0) && modwerk_runtime_module(0)->dsp.pinned);
    fx = modwerk_runtime_module(0);
    p[7] = 4; CHECK(!b->prepare(0, p, n) && modwerk_runtime_refusal() == RUNTIME_MALFORMED);
    dsp_switches = 1;
    /* Malformed DSP sections change nothing. */
    for (unsigned bad = 0; bad < 6; ++bad) {
        id = 41; begin5(0, 27, 5, 2); dsp_words(5, bad == 2 ? unordered : reloc, 2);
        if (bad == 0) put32(p + n - 4 - 4 * 5, 0x1000000u);             /* a word wider than 24 bits */
        if (bad == 1) put32(p + n - 4 - 4 * 4, 5);                      /* a relocated word pointing past the code */
        if (bad == 3) p[41] = 5;                                         /* init past the code */
        if (bad == 4) p[39] = 0;                                         /* no slot */
        if (bad == 5) emit16(0);                                         /* trailing bytes */
        free = modwerk_runtime_free(0);
        CHECK(!b->prepare(0, p, n) && modwerk_runtime_refusal() == RUNTIME_MALFORMED && modwerk_runtime_free(0) == free && dsp_switches == 1);
    }
    /* Another module preferring effect 26 loads beside it with the effect id the machine gives (a handle), and keeps it. */
    id = 41; begin5(0, 26, 5, 2); dsp_words(5, reloc, 2); dsp_handle = 30;
    CHECK(b->prepare(0, p, n) && b->publish(0) == MU_APPLIED && b->retire(0) && dsp_switches == 2 && dsp_to.id == 30 && dsp_to.module == 41);
    CHECK(modwerk_runtime_module(1)->dsp.id == 30 && modwerk_runtime_module(0)->dsp.id == 26);
    dsp_handle = -1; begin(0, 0, RUNTIME_NONE, 0, 0, 0, 0);
    CHECK(b->prepare(0, p, n) && b->publish(0) == MU_APPLIED && b->retire(0) && dsp_switches == 3 && dsp_from.id == 30);
    dsp_switches = 1;
    /* What the machine refuses (the DSP's memory, cycles, an effect in use) is the refusal, before or at the switch. */
    id = 41; begin5(0, 27, 5, 2); dsp_words(5, reloc, 2);
    dsp_why = RUNTIME_CYCLES;
    CHECK(!b->prepare(0, p, n) && modwerk_runtime_refusal() == RUNTIME_CYCLES && dsp_switches == 1);
    dsp_why = 0; id = 40; begin(0, 0, RUNTIME_NONE, 0, 0, 0, 0);
    CHECK(b->prepare(0, p, n));
    dsp_why = RUNTIME_BUSY;
    CHECK(b->publish(0) == MU_UNCHANGED && b->discard(0) && modwerk_runtime_module(0) == fx && dsp_switches == 1);
    dsp_why = 0;
    CHECK(b->prepare(0, p, n) && b->publish(0) == MU_APPLIED && b->retire(0) && !modwerk_runtime_module(0));
    CHECK(dsp_switches == 2 && dsp_from.id == 26 && !dsp_to.count);

    /* ABI 7: a site names its stock bytes by their SHA-256, and the loader reads them from the running code. */
    CHECK(!modwerk_runtime_active());
    id = 70; begin7(8, 2, 1, 0xe7); site7(STOCK + 32, 6, 0, 6);
    CHECK(b->prepare(0, p, n) && b->publish(0) == MU_APPLIED && b->retire(0));
    const struct runtime_module *seven = modwerk_runtime_module(0);
    CHECK(seven && seven->id == 70 && !strcmp(seven->dsp.name, "Tape Echo") && seven->dsp.layout == 1 && !seven->dsp.count);
    CHECK(stock[32] == 0x4e && stock[33] == 0xf9 && word(STOCK + 34) == (uint32_t)(uintptr_t)seven->hook[RUNTIME_TICK] &&
          bytes_at(STOCK + 38, original + 38, 2) && !memcmp(seven->site[0].stock, original + 32, 6));
    /* Replaced by itself over its own patch (the hash is checked against the bytes it would put back), keeping two
     * stock bytes in front (an instruction that keeps its opcode). */
    begin7(8, 2, 1, 0xe8); site7(STOCK + 30, 8, 2, 6);
    CHECK(b->prepare(0, p, n) && b->publish(0) == MU_APPLIED);
    const struct runtime_module *kept = modwerk_runtime_module(0);
    CHECK(kept != seven && bytes_at(STOCK + 30, original + 30, 2) && word(STOCK + 32) == (uint32_t)(uintptr_t)kept->hook[RUNTIME_TICK] &&
          stock[36] == 0 && stock[37] == 0 && bytes_at(STOCK + 38, original + 38, 2));
    CHECK(b->restore(0) && modwerk_runtime_module(0) == seven && stock[32] == 0x4e && bytes_at(STOCK + 30, original + 30, 2));
    /* A hash that does not match, or stock bytes that changed (another OS, another base), refuse before anything changes. */
    CHECK(b->retire(0));                                         /* the replacement's memory is reclaimed */
    id = 71; free = modwerk_runtime_free(0);
    for (unsigned bad = 0; bad < 2; ++bad) {
        begin7(8, 2, 1, 0xe9); site7(STOCK + 64, 6, 0, 6);
        if (bad == 0) p[n - 2 - 6 - 1] ^= 1;
        if (bad == 1) stock[66] ^= 1;
        CHECK(!b->prepare(0, p, n) && modwerk_runtime_refusal() == RUNTIME_STOCK && modwerk_runtime_free(0) == free);
        if (bad == 1) stock[66] ^= 1;
        CHECK(bytes_at(STOCK + 64, original + 64, 6) && modwerk_runtime_active() == 1);
    }
    /* Malformed: more kept bytes than the hash covers, a relocation inside the kept bytes, a site past 32 bytes, a
     * hash over nothing or past the site. */
    for (unsigned bad = 0; bad < 5; ++bad) {
        begin7(8, 2, 1, 0xea); site7(STOCK + 64, 6, bad == 0 ? 6 : bad == 1 ? 4 : 0, bad == 0 ? 4 : 6);
        if (bad == 3) p[72 + 16 + 8 + 6] = 0;
        if (bad == 4) p[72 + 16 + 8 + 6] = 34;
        if (bad == 2) p[72 + 16 + 8 + 4] = 34;
        CHECK(!b->prepare(0, p, n) && modwerk_runtime_refusal() == RUNTIME_MALFORMED && modwerk_runtime_free(0) == free);
    }
    /* A hash over the first four bytes only (a manifest guards what the module expects; the jmp also takes the next
     * two): those two are read as they are and put back on removal. */
    stock[68] = 0x99;
    id = 74; begin7(8, 2, 1, 0xeb); site7(STOCK + 64, 6, 0, 4);
    CHECK(b->prepare(0, p, n) && b->publish(0) == MU_APPLIED && b->retire(0) && stock[64] == 0x4e && stock[68] != 0x99);
    begin(0, 0, RUNTIME_NONE, 0, 0, 0, 0);
    CHECK(b->prepare(0, p, n) && b->publish(0) == MU_APPLIED && b->retire(0) && bytes_at(STOCK + 64, original + 64, 4) && stock[68] == 0x99);
    stock[68] = original[68];
    /* A guard past the site (over the instruction its module returns to): checked, never written. */
    begin7(8, 2, 1, 0xec); site7(STOCK + 64, 6, 0, 8);
    CHECK(b->prepare(0, p, n) && b->publish(0) == MU_APPLIED && b->retire(0) && stock[64] == 0x4e && bytes_at(STOCK + 70, original + 70, 2));
    stock[71] ^= 1;
    begin7(8, 2, 1, 0xed); site7(STOCK + 64, 6, 0, 8);
    CHECK(!b->prepare(0, p, n) && modwerk_runtime_refusal() == RUNTIME_STOCK);
    stock[71] ^= 1;
    begin(0, 0, RUNTIME_NONE, 0, 0, 0, 0);
    CHECK(b->prepare(0, p, n) && b->publish(0) == MU_APPLIED && b->retire(0) && bytes_at(STOCK + 64, original + 64, 8));
    /* Stock copies: bytes a module replays, read from the running code into its image once their hash holds. */
    id = 72; begin7(16, 2, 0, 0); copy7(8, STOCK + 100, 6);
    CHECK(b->prepare(0, p, n) && b->publish(0) == MU_APPLIED && b->retire(0));
    const struct runtime_module *copier = modwerk_runtime_module(1);
    CHECK(copier && copier->id == 72 && !memcmp((const uint8_t *)(uintptr_t)copier->hook[RUNTIME_TICK] + 6, original + 100, 6));
    free = modwerk_runtime_free(0);
    for (unsigned bad = 0; bad < 4; ++bad) {
        begin7(16, 2, 0, 0); copy7(bad == 2 ? 12 : 8, bad == 3 ? STOCK + 8 : STOCK + 100, 6);
        if (bad == 0) p[n - 1] ^= 1;                 /* a hash that does not match */
        if (bad == 1) stock[101] ^= 1;               /* stock that changed */
        CHECK(!b->prepare(0, p, n) && modwerk_runtime_refusal() == (bad < 2 ? RUNTIME_STOCK : RUNTIME_MALFORMED)); /* past the image; not stock code */
        if (bad == 1) stock[101] ^= 1;
        CHECK(modwerk_runtime_free(0) == free && modwerk_runtime_module(1) == copier);
    }
    /* ABI 7 relocations: rising, and a word may hold address arithmetic (an offset past the module, or below it). */
    const uint32_t arithmetic[2] = {4, 8}, falling[2] = {8, 4};
    id = 73; begin(12, 0, 0, arithmetic, 2, 0, 0); put32(p + 48 + 4, 0xfffffff0u); put32(p + 48 + 8, 0x10015e4du);
    memmove(p + 72, p + 32, n - 32); n += 40; memset(p + 32, 0, 40); p[5] = 7; memcpy(p + 50, "Arith", 5); p[67] = 1;
    CHECK(b->prepare(0, p, n) && b->publish(0) == MU_APPLIED && b->retire(0));
    const struct runtime_module *arith = modwerk_runtime_module(2);
    const uint8_t *arith_code = (const uint8_t *)(uintptr_t)arith->hook[RUNTIME_TICK];
    uint32_t at = (uint32_t)(uintptr_t)arith_code;
    CHECK(be32(arith_code + 4) == at - 16u && be32(arith_code + 8) == at + 0x10015e4du);
    begin(12, 0, 0, falling, 2, 0, 0);
    memmove(p + 72, p + 32, n - 32); n += 40; memset(p + 32, 0, 40); p[5] = 7; memcpy(p + 50, "Arith", 5); p[67] = 1;
    CHECK(!b->prepare(0, p, n) && modwerk_runtime_refusal() == RUNTIME_MALFORMED);
    for (id = 72; id <= 73; ++id) {
        begin(0, 0, RUNTIME_NONE, 0, 0, 0, 0);
        CHECK(b->prepare(0, p, n) && b->publish(0) == MU_APPLIED && b->retire(0));
    }
    /* Removal puts back the bytes it read. */
    id = 70; begin(0, 0, RUNTIME_NONE, 0, 0, 0, 0);
    CHECK(b->prepare(0, p, n) && b->publish(0) == MU_APPLIED && b->retire(0) && !modwerk_runtime_active());
    CHECK(memcmp(stock, original, sizeof stock) == 0 && modwerk_runtime_free(0) == RUNTIME_POOL_BYTES);

    /* Explicit authored initializers reconstruct exactly; malformed or
     * intersecting copies/fills/relocations leave memory and stock unchanged. */
    id = 80; begin8(544, 0, 0); copy7(8, STOCK + 100, 6); fill8(32, 512, 255);
    CHECK(b->prepare(0, p, n) && b->publish(0) == MU_APPLIED && b->retire(0));
    const struct runtime_module *filled = modwerk_runtime_module(0);
    const uint8_t *filled_code = (const uint8_t *)(uintptr_t)filled->hook[RUNTIME_TICK];
    CHECK(filled->dsp.module == 80 && !memcmp(filled_code + 8, original + 100, 6));
    for (unsigned i = 32; i < 544; ++i) CHECK(filled_code[i] == 255);
    free = modwerk_runtime_free(0);
    for (unsigned bad = 0; bad < 12; ++bad) {
        begin8(64, 0, 0); copy7(8, STOCK + 100, 6); fill8(32, 32, 255);
        if (bad == 0) n--;                          /* truncated descriptor */
        if (bad == 1) put32(p + n - 12, 40);         /* outside image */
        if (bad == 2) p[n - 4] = 0;                 /* zero value */
        if (bad == 3) p[n - 1] = 1;                 /* reserved bits */
        if (bad == 4) p[76 + 16 + 32] = 1;          /* nonzero placeholder */
        if (bad == 5) put32(p + n - 12, 8);         /* intersects stock copy */
        if (bad == 6) fill8(40, 8, 1);              /* overlapping fills */
        if (bad == 7) put32(p + 72, RUNTIME_FILLS + 1u);
        if (bad == 8) p[n - 12 - 34] = 1;           /* copy reserved field */
        if (bad == 9) p[76 + 16 + 8] = 1;           /* nonzero copy placeholder */
        if (bad == 10) {
            memmove(p + 76 + 16 + 64 + 4, p + 76 + 16 + 64, n - (76 + 16 + 64)); n += 4;
            put32(p + 16, 1); put32(p + 76 + 16 + 64, 32); /* fill/relocation overlap */
        }
        if (bad == 11) {
            memmove(p + 76 + 16 + 64 + 4, p + 76 + 16 + 64, n - (76 + 16 + 64)); n += 4;
            put32(p + 16, 1); put32(p + 76 + 16 + 64, 8); /* copy/relocation overlap */
        }
        CHECK(!b->prepare(0, p, n) && modwerk_runtime_refusal() == RUNTIME_MALFORMED);
        CHECK(modwerk_runtime_free(0) == free && modwerk_runtime_module(0) == filled);
    }
    begin(0, 0, RUNTIME_NONE, 0, 0, 0, 0);
    CHECK(b->prepare(0, p, n) && b->publish(0) == MU_APPLIED && b->retire(0));
    CHECK(dsp_from.module == 80 && dsp_to.module == 0 && !modwerk_runtime_active());
    CHECK(modwerk_runtime_free(0) == RUNTIME_POOL_BYTES && !memcmp(stock, original, sizeof stock));

    /* Machine metadata needs explicit board admission. An old group cannot
     * resume and rewrite persistent data after replacement, even without sites. */
    id = 81; begin8(32, RUNTIME_NONE, 0); p[7] = RUNTIME_GROUP_METADATA;
    memmove(p + 76, p + 92, n - 92); n -= 16; put32(p + 20, 0);
    memcpy(p + 76, "MWMG\1\2\0\0", 8);
    CHECK(!b->prepare(0, p, n) && modwerk_runtime_refusal() == RUNTIME_MALFORMED);
    metadata_allow = 1;
    CHECK(b->prepare(0, p, n) && b->publish(0) == MU_APPLIED && b->retire(0));
    const struct runtime_module *group = modwerk_runtime_module(0);
    CHECK(group && group->dsp.flags == RUNTIME_GROUP_METADATA && group->dsp.present && group->dsp.image_bytes == 32);
    free = modwerk_runtime_free(0); metadata_why = RUNTIME_IN_USE;
    begin(0, 0, RUNTIME_NONE, 0, 0, 0, 0);
    CHECK(!b->prepare(0, p, n) && modwerk_runtime_refusal() == RUNTIME_IN_USE && modwerk_runtime_module(0) == group);
    metadata_why = 0;
    alias_image = (uint32_t)(uintptr_t)group->dsp.image;
    /* Include the first byte after metadata, the private builder's padded
     * code entry, the last data byte and an interior pointer in stack/register
     * spans, through each RAM alias and the host's actual image address. */
    const uint32_t group_offsets[] = {8u, 16u, 20u, 31u};
    for (unsigned context = 0; context < 2; ++context)
        for (unsigned alias = 0; alias < 3; ++alias)
            for (unsigned offset = 0; offset < sizeof group_offsets / sizeof group_offsets[0]; ++offset) {
                uint8_t *held = context ? saved_registers : paused;
                uint32_t base = alias == 0 ? alias_image : alias == 1 ? 0x40010000u : 0x48010000u;
                put32(held + 2u, base + group_offsets[offset]); /* packed, only two-byte aligned */
                CHECK(b->prepare(0, p, n) && b->publish(0) == MU_UNCHANGED);
                CHECK(modwerk_runtime_refusal() == RUNTIME_BUSY && modwerk_runtime_module(0) == group);
                CHECK(modwerk_runtime_free(0) == free && !memcmp(stock, original, sizeof stock));
                CHECK(b->discard(0)); memset(held, 0, 64);
            }
    unknown = 1;
    CHECK(b->prepare(0, p, n) && b->publish(0) == MU_UNCHANGED && b->discard(0));
    CHECK(modwerk_runtime_module(0) == group && modwerk_runtime_free(0) == free);
    unknown = 0; alias_image = 0;
    CHECK(b->prepare(0, p, n) && b->publish(0) == MU_APPLIED && b->retire(0));
    CHECK(!modwerk_runtime_active() && modwerk_runtime_free(0) == RUNTIME_POOL_BYTES);
    metadata_allow = 0;

    /* Real reconstruction issues a board generation in a separate immutable
     * ledger. Snapshots confer no publication/readiness; reused addresses and
     * changed pool metadata cannot manufacture an old association. */
    id = 91; begin(32, 16, 0, 0, 0, 0, 0x91);
    CHECK(b->prepare(0, p, n) && !modwerk_runtime_active());
    struct runtime_owner old_owner, current_owner, untouched_owner;
    memset(&untouched_owner, 0xa5, sizeof untouched_owner);
    current_owner = untouched_owner;
    CHECK(!modwerk_runtime_owner_snapshot(p, &current_owner) && !memcmp(&current_owner, &untouched_owner, sizeof current_owner));
    CHECK(modwerk_runtime_owner_snapshot(candidate->dsp.image, &old_owner));
    CHECK(old_owner.generation && old_owner.module == 91 && old_owner.owned_extent == (uintptr_t)candidate);
    CHECK(old_owner.extent_bytes == candidate->size && old_owner.image_bytes == 32 && modwerk_runtime_owner_valid(&old_owner));
    CHECK(b->discard(0) && !modwerk_runtime_owner_valid(&old_owner));
    id = 92; begin(32, 16, 0, 0, 0, 0, 0x92);
    CHECK(b->prepare(0, p, n) && modwerk_runtime_owner_snapshot(candidate->dsp.image, &current_owner));
    CHECK(current_owner.owned_extent == old_owner.owned_extent && current_owner.generation > old_owner.generation);
    CHECK(!modwerk_runtime_owner_valid(&old_owner) && modwerk_runtime_owner_valid(&current_owner));
    for (unsigned bad = 0; bad < 7; ++bad) {
        struct runtime_owner wrong = current_owner;
        if (bad == 0) wrong.generation = old_owner.generation;
        if (bad == 1) ++wrong.module;
        if (bad == 2) ++wrong.owned_extent;
        if (bad == 3) ++wrong.extent_bytes;
        if (bad == 4) ++wrong.image_offset;
        if (bad == 5) ++wrong.image_bytes;
        if (bad == 6) wrong.package_sha256[0] ^= 1;
        CHECK(!modwerk_runtime_owner_valid(&wrong));
    }
    candidate->dsp.package_sha256[0] ^= 1;
    old_owner = untouched_owner;
    CHECK(!modwerk_runtime_owner_valid(&current_owner) && !modwerk_runtime_owner_snapshot(candidate->dsp.image, &old_owner));
    CHECK(!memcmp(&old_owner, &untouched_owner, sizeof old_owner));
    candidate->dsp.package_sha256[0] ^= 1;
    CHECK(modwerk_runtime_owner_valid(&current_owner));
    CHECK(b->publish(0) == MU_APPLIED && b->retire(0) && modwerk_runtime_owner_valid(&current_owner));
    uint32_t saved_generation = owner_generation;
    owner_generation = UINT32_MAX; id = 93; begin(32, 0, 0, 0, 0, 0, 0x93);
    free = modwerk_runtime_free(0);
    CHECK(!b->prepare(0, p, n) && modwerk_runtime_refusal() == RUNTIME_FULL);
    CHECK(owner_generation == UINT32_MAX && modwerk_runtime_free(0) == free && modwerk_runtime_active() == 1);
    id = 92; begin(0, 0, RUNTIME_NONE, 0, 0, 0, 0);
    CHECK(b->prepare(0, p, n) && b->publish(0) == MU_APPLIED && b->retire(0));
    CHECK(!modwerk_runtime_owner_valid(&current_owner) && !modwerk_runtime_active() && modwerk_runtime_free(0) == RUNTIME_POOL_BYTES);
    owner_generation = saved_generation;

    /* Activation only while nothing plays or records. */
    stopped = 0;
    CHECK(!b->enter(0) && !b->safe(0));
    stopped = 1;
    CHECK(b->enter(0) && b->safe(0) && b->leave(0) && !b->safe(0) && !masked && !locked);
    /* The real pool keeps the whole baseline and staged candidates while
     * a synthetic adapter pauses, partially ACKs, quarantines and reverses. */
    id=111;begin(32,0,0,0,0,1,0x11);site(STOCK+32,6);
    CHECK(b->enter(0) && b->prepare(0,p,n) && b->publish(0)==MU_APPLIED && b->retire(0) && b->leave(0));
    id=112;begin(32,0,0,0,0,1,0x12);site(STOCK+64,6);
    CHECK(b->enter(0) && b->prepare(0,p,n) && b->publish(0)==MU_APPLIED && b->retire(0) && b->leave(0));
    uint32_t baseline_free=modwerk_runtime_free(0);const struct runtime_module *baseline0=live[0],*baseline1=live[1];
    uint8_t baseline_stock[sizeof stock];memcpy(baseline_stock,stock,sizeof stock);
    CHECK(modwerk_runtime_journal_begin()==RJ_REFUSED && !modwerk_runtime_volatile_busy());
    journal_enabled=1;
    CHECK(modwerk_runtime_journal_begin()==RJ_REFUSED && !modwerk_runtime_volatile_busy());
    journal_begin_safe=-1;CHECK(modwerk_runtime_journal_begin()==RJ_REFUSED && !modwerk_runtime_volatile_busy());
    journal_begin_safe=2;CHECK(modwerk_runtime_journal_begin()==RJ_REFUSED && !modwerk_runtime_volatile_busy());
    journal_begin_safe=1;CHECK(modwerk_runtime_journal_begin()==RJ_OK && modwerk_runtime_volatile_busy());
    int baseline_switches=dsp_switches;
    CHECK(!b->enter(0) && !b->leave(0) && !b->discard(0) && !b->retire(0));
    id=111;begin(64,0,0,0,0,1,0x21);site(STOCK+32,6);
    CHECK(modwerk_runtime_journal_prepare(p,n,0)==RJ_OK);
    uint32_t staged_free=modwerk_runtime_free(0);
    CHECK(modwerk_runtime_journal_prepare(p,n,0)==RJ_REFUSED && modwerk_runtime_free(0)==staged_free);
    id=113;begin(64,0,0,0,0,1,0x23);site(STOCK+96,6);
    CHECK(modwerk_runtime_journal_prepare(p,n,0)==RJ_OK && journal.row[0].position!=journal.row[1].position);
    struct runtime_owner staged_owner;CHECK(modwerk_runtime_owner_snapshot(journal.row[0].after->dsp.image,&staged_owner));
    id=114;begin(64,0,0,0,0,1,0x24);site(STOCK+96,6);
    CHECK(modwerk_runtime_journal_prepare(p,n,0)==RJ_REFUSED && refusal==RUNTIME_CONFLICT && journal.progress.records==2);
    reclaim(0);CHECK(modwerk_runtime_owner_valid(&staged_owner) && live[0]==baseline0 && live[1]==baseline1);
    CHECK(modwerk_runtime_journal_verify()==RJ_REFUSED);
    journal_admitted=1;CHECK(modwerk_runtime_journal_verify()==RJ_OK && modwerk_runtime_journal_activate()==RJ_PENDING);
    journal_observed=RJ_WAIT;journal_masks[0]=3;journal_masks[1]=1;journal_masks[2]=1;
    CHECK(modwerk_runtime_journal_step(0)==RJ_PENDING && !journal.progress.published && live[0]==baseline0 && !memcmp(stock,baseline_stock,sizeof stock));
    staged_free=modwerk_runtime_free(0);CHECK(modwerk_runtime_journal_abort()==RJ_PENDING);
    journal_masks[0]=1;journal_masks[2]=0;CHECK(modwerk_runtime_journal_step(0)==RJ_PENDING && modwerk_runtime_free(0)==staged_free);
    journal_observed=RJ_READY;journal_masks[2]=1;CHECK(modwerk_runtime_journal_step(0)==RJ_PENDING);
    journal_roots=0;CHECK(modwerk_runtime_journal_step(0)==RJ_PENDING && modwerk_runtime_free(0)==staged_free);
    journal_roots=1;CHECK(modwerk_runtime_journal_step(0)==RJ_OK && !modwerk_runtime_volatile_busy() && !modwerk_runtime_owner_valid(&staged_owner) && journal_idles==1);
    CHECK(modwerk_runtime_free(0)==baseline_free && live[0]==baseline0 && live[1]==baseline1 && !memcmp(stock,baseline_stock,sizeof stock));
    /* Two actual CF publications, then reverse order and exact rollback. */
    CHECK(modwerk_runtime_journal_begin()==RJ_OK);
    id=111;begin(64,0,0,0,0,1,0x31);site(STOCK+32,6);CHECK(modwerk_runtime_journal_prepare(p,n,0)==RJ_OK);
    id=113;begin(64,0,0,0,0,1,0x33);site(STOCK+96,6);CHECK(modwerk_runtime_journal_prepare(p,n,0)==RJ_OK);
    CHECK(modwerk_runtime_journal_verify()==RJ_OK && modwerk_runtime_journal_activate()==RJ_PENDING);
    journal_masks[0]=journal_masks[1]=journal_masks[2]=3;
    /* Even a completed DSP transition cannot publish CF through an absent,
     * stale or unknown exact preflight. Preserve both images and site bytes. */
    for(int missing=-1;missing<=2;++missing) if(missing!=1) {
        journal_switch_safe=missing;
        CHECK(modwerk_runtime_journal_step(0)==RJ_PENDING && !journal.progress.published &&
            live[0]==baseline0 && !memcmp(stock,baseline_stock,sizeof stock));
    }
    journal_switch_safe=1;
    /* A journal-owned ready plan is not the legacy manager's idle state.
     * Its independent exact preflight replaces legacy DSP admission only. */
    dsp_why=RUNTIME_BUSY;
    CHECK(modwerk_runtime_journal_step(0)==RJ_PENDING && journal.progress.published==1);
    CHECK(modwerk_runtime_journal_step(0)==RJ_PENDING && journal.progress.published==2);
    CHECK(modwerk_runtime_journal_step(0)==RJ_OK && journal.progress.phase==RJ_TRIAL && modwerk_runtime_active()==3);
    reclaim(0);CHECK(modwerk_runtime_owner_valid(&owner_identity[0]) && reachable(baseline0));
    CHECK(modwerk_runtime_journal_abort()==RJ_PENDING && modwerk_runtime_journal_step(0)==RJ_PENDING && journal.progress.published==1);
    CHECK(modwerk_runtime_journal_step(0)==RJ_PENDING && modwerk_runtime_journal_step(0)==RJ_OK);
    dsp_why=RUNTIME_OK;
    CHECK(modwerk_runtime_free(0)==baseline_free && live[0]==baseline0 && live[1]==baseline1 && !memcmp(stock,baseline_stock,sizeof stock));
    /* A missing CF commit observation keeps both actual generations after
     * publication; it cannot become a successful trial or reclaim either. */
    CHECK(modwerk_runtime_journal_begin()==RJ_OK);
    id=111;begin(64,0,0,0,0,1,0x39);site(STOCK+32,6);CHECK(modwerk_runtime_journal_prepare(p,n,0)==RJ_OK);
    CHECK(modwerk_runtime_owner_snapshot(journal.row[0].after->dsp.image,&staged_owner));
    CHECK(modwerk_runtime_journal_verify()==RJ_OK && modwerk_runtime_journal_activate()==RJ_PENDING);
    journal_commit=0;CHECK(modwerk_runtime_journal_step(0)==RJ_UNCERTAIN && journal.progress.published==1 && journal.progress.phase==RJ_QUARANTINE);
    staged_free=modwerk_runtime_free(0);reclaim(0);
    CHECK(live[0]==journal.row[0].after && reachable(baseline0) && modwerk_runtime_owner_valid(&staged_owner));
    CHECK(modwerk_runtime_free(0)==staged_free && !b->discard(0) && !b->retire(0));
    journal_commit=1;CHECK(modwerk_runtime_journal_abort()==RJ_PENDING);
    CHECK(modwerk_runtime_journal_step(0)==RJ_PENDING && modwerk_runtime_journal_step(0)==RJ_OK);
    CHECK(modwerk_runtime_free(0)==baseline_free && !modwerk_runtime_owner_valid(&staged_owner) && !memcmp(stock,baseline_stock,sizeof stock));
    /* Unknown work cannot discard/reclaim; stale generation never calls the
     * backend. Exact reverse and roots proof are required for recovery. */
    CHECK(modwerk_runtime_journal_begin()==RJ_OK);
    id=111;begin(64,0,0,0,0,1,0x41);site(STOCK+32,6);CHECK(modwerk_runtime_journal_prepare(p,n,0)==RJ_OK);
    CHECK(modwerk_runtime_journal_verify()==RJ_OK && modwerk_runtime_journal_activate()==RJ_PENDING);
    journal_observed=RJ_UNKNOWN;journal_masks[0]=3;journal_masks[1]=1;journal_masks[2]=0;
    CHECK(modwerk_runtime_journal_step(0)==RJ_UNCERTAIN && journal.progress.phase==RJ_QUARANTINE);
    staged_free=modwerk_runtime_free(0);reclaim(0);CHECK(!b->discard(0) && !b->retire(0) && modwerk_runtime_free(0)==staged_free);
    CHECK(modwerk_runtime_journal_abort()==RJ_PENDING);
    uint32_t real_generation=journal.row[0].after_generation;--journal.row[0].after_generation;
    unsigned calls=journal_jobs;CHECK(modwerk_runtime_journal_step(0)==RJ_UNCERTAIN && journal_jobs==calls && modwerk_runtime_free(0)==staged_free);
    journal.row[0].after_generation=real_generation;CHECK(modwerk_runtime_journal_abort()==RJ_PENDING);
    journal_observed=RJ_READY;journal_masks[0]=journal_masks[1]=journal_masks[2]=3;
    CHECK(modwerk_runtime_journal_step(0)==RJ_PENDING && modwerk_runtime_journal_step(0)==RJ_OK);
    CHECK(modwerk_runtime_free(0)==baseline_free && !memcmp(stock,baseline_stock,sizeof stock));
    CHECK(modwerk_runtime_journal_abort()==RJ_STALE);
    CHECK(dsp_switches==baseline_switches); /* owned journal ACKs never start legacy DSP work */
    /* Keep (synthetic board answer): only a published fresh-install set ends the
     * journal, once, as the new baseline. A replace or removal row refuses before
     * the board with nothing changed; reverse still works before Keep. */
    uint8_t trial_digest[MU_DIGEST_BYTES],digest[MU_DIGEST_BYTES];unsigned idles=journal_idles;
    CHECK(modwerk_runtime_journal_accept()==RJ_REFUSED && !journal_accepts);
    for(unsigned set=0;set<5;++set) {
        CHECK(modwerk_runtime_journal_begin()==RJ_OK);
        if(set==0) { id=111;begin(64,0,0,0,0,1,0x61);site(STOCK+32,6); }    /* replaces live 111 */
        else if(set==1) { id=112;begin(0,0,RUNTIME_NONE,0,0,0,0); }       /* removes live 112 */
        else { id=116;begin(64,0,0,0,0,1,0x66);site(STOCK+160,6); }
        CHECK(modwerk_runtime_journal_prepare(p,n,0)==RJ_OK);
        id=115;begin(64,0,0,0,0,1,0x65);site(STOCK+128,6);CHECK(modwerk_runtime_journal_prepare(p,n,0)==RJ_OK);
        CHECK(modwerk_runtime_journal_verify()==RJ_OK && modwerk_runtime_journal_accept()==RJ_REFUSED);
        CHECK(modwerk_runtime_journal_activate()==RJ_PENDING && modwerk_runtime_journal_accept()==RJ_REFUSED);
        CHECK(modwerk_runtime_journal_step(0)==RJ_PENDING && modwerk_runtime_journal_step(0)==RJ_PENDING);
        CHECK(journal.progress.published==2 && modwerk_runtime_journal_accept()==RJ_REFUSED); /* published, not yet the trial */
        CHECK(modwerk_runtime_journal_step(0)==RJ_OK);
        CHECK(journal.progress.phase==RJ_TRIAL && journal.progress.published==2 && journal_accepts==(set>2?set-2u:0u));
        uint32_t lock=modwerk_machine_lock();CHECK(modwerk_runtime_journal_digest(trial_digest));modwerk_machine_unlock(lock);
        const struct runtime_module *trial0=live[0],*trial1=live[1];uint32_t trial_free=modwerk_runtime_free(0);
        if(set<2) CHECK(modwerk_runtime_journal_accept()==RJ_REFUSED && !journal_accepts);
        else if(set==2) { journal_accept=0;CHECK(modwerk_runtime_journal_accept()==RJ_REFUSED && journal_accepts==1); }
        else if(set==3) { journal_accept=-1;CHECK(modwerk_runtime_journal_accept()==RJ_UNCERTAIN && journal_accepts==2 && journal.progress.phase==RJ_QUARANTINE); }
        if(set<4) {
            /* Unchanged by the refusal (or held by the unknown answer); exact reverse recovers. */
            CHECK(journal.progress.published==2 && live[0]==trial0 && live[1]==trial1 && modwerk_runtime_free(0)==trial_free);
            CHECK(set==3 || journal.progress.phase==RJ_TRIAL);
            CHECK(modwerk_runtime_journal_abort()==RJ_PENDING);
            for(unsigned i=0;i<4 && journal.progress.phase==RJ_ROLLBACK;++i) modwerk_runtime_journal_step(0);
            CHECK(!modwerk_runtime_volatile_busy() && modwerk_runtime_free(0)==baseline_free && !memcmp(stock,baseline_stock,sizeof stock));
            continue;
        }
        journal_accept=1;CHECK(modwerk_runtime_journal_accept()==RJ_OK && journal_accepts==3 && journal_idles==idles+5);
        CHECK(!modwerk_runtime_volatile_busy() && !journal.progress.records && modwerk_runtime_active()==4);
        lock=modwerk_machine_lock();CHECK(modwerk_runtime_journal_digest(digest));modwerk_machine_unlock(lock);
        CHECK(!memcmp(digest,trial_digest,sizeof digest) && modwerk_runtime_journal_accept()==RJ_REFUSED && journal_accepts==3);
        CHECK(modwerk_runtime_journal_abort()==RJ_STALE);
    }
    /* The kept set is ordinary live state: the legacy path is open again and removes it. */
    for(id=115;id<=116;++id) {
        begin(0,0,RUNTIME_NONE,0,0,0,0);
        CHECK(b->enter(0) && b->prepare(0,p,n) && b->publish(0)==MU_APPLIED && b->retire(0) && b->leave(0));
    }
    CHECK(modwerk_runtime_active()==2 && live[0]==baseline0 && live[1]==baseline1);
    CHECK(modwerk_runtime_free(0)==baseline_free && !memcmp(stock,baseline_stock,sizeof stock));
#ifdef MODWERK_CACHED_MODULES
    /* Every install pushed its extent exactly once (each one takes an owner generation, and nothing refuses after the
     * push), followed by an invalidation; frees, discards, rollbacks and removals pushed nothing; nothing used the
     * uncached alias. */
    CHECK(pool_flushes == owner_generation && pool_flushes_invalidated == pool_flushes && !push_pending && !uncached_calls);
#else
    CHECK(!pool_flushes);
#endif
    if (failures) { fprintf(stderr, "%u loader checks failed\n", failures); return 1; }
    puts("Loader: refusals, relocation, bss, hooks, stock-code sites (in-flight, stock and changed-code refusals, "
         "replace, rollback, removal), reclamation, several modules (conflicts, positions), exhaustion, DSP sections and ABI 7's "
         "hashed stock bytes (kept bytes, stock copies, address arithmetic, replacement over its own patch, mismatch refusals) passed.");
    return 0;
}
