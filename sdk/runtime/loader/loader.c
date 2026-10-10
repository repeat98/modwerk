/* SPDX-License-Identifier: GPL-3.0-or-later
 * Machine-neutral runtime module loader (README.md). Prepare relocates a
 * package into fresh pool memory. Publish and restore switch hooks and
 * stock-code sites together with interrupts masked, only after checking
 * that no paused task could resume inside a site, and only over the exact
 * bytes expected there. Pool memory is never reused before a reboot, so code
 * a task may still be running is never overwritten. Engine task only.
 *
 * shortcut: a fixed pool in the base's .bss that only a reboot reclaims;
 * upgrade to ledger allocation once modules are loaded often. */
#include "loader.h"

static uint8_t pool[RUNTIME_POOL_BYTES] __attribute__((aligned(16)));
uint8_t modwerk_runtime_staging[RUNTIME_PACKAGE_BYTES];
struct modwerk_runtime_api modwerk_runtime_api;
volatile uint32_t modwerk_runtime_ticks;
static uint32_t used, mark;
static const struct runtime_module *volatile active;
static const struct runtime_module *candidate, *previous;
static int prepared, held;

const struct runtime_module *modwerk_runtime_active(void) { return active; }
uint32_t modwerk_runtime_value(void) { return modwerk_runtime_api.value; }
uint32_t modwerk_runtime_calls(void) { return modwerk_runtime_ticks; }

static uint32_t be16(const volatile uint8_t *p) { return (uint32_t)p[0] << 8 | p[1]; }
static uint32_t be32(const volatile uint8_t *p) { return be16(p) << 16 | be16(p + 2); }
static void put32(uint8_t *p, uint32_t v) { p[0] = (uint8_t)(v >> 24); p[1] = (uint8_t)(v >> 16); p[2] = (uint8_t)(v >> 8); p[3] = (uint8_t)v; }
/* Whole 16-byte cache lines, so nothing written through the data cache
 * shares a line with code written through the uncached alias. */
static void *take(uint32_t n)
{
    n = (n + 15u) & ~15u;
    if (n > RUNTIME_POOL_BYTES - used) return 0;
    used += n;
    return pool + used - n;
}
/* Memory taken since `to` was written through the data cache too (module
 * records); push those lines out before uncached code can reuse them. */
static void release(uint32_t to)
{
    modwerk_machine_flush_data((uint32_t)(uintptr_t)(pool + to), used - to);
    used = to;
}
/* A word holding an offset into the module becomes an address. */
static int relocate(uint8_t *word, uint32_t end, uint32_t base)
{
    uint32_t v = be32(word);
    if (v >= end) return 0;
    put32(word, v + base);
    return 1;
}

static int inside(const struct runtime_module *m, uint32_t v)
{
    for (uint32_t i = 0; m && i < m->sites; ++i)
        if (v > m->site[i].address && v < m->site[i].address + m->site[i].length) return 1;
    return 0;
}
/* Masked: could a paused task resume inside a site of a or b? Starting at a
 * site's first byte runs its whole new instruction; anywhere after it would
 * run the middle of one. Unknown counts as yes. */
static int in_flight(const struct runtime_module *a, const struct runtime_module *b)
{
    uint32_t lo = RUNTIME_NONE, hi = 0;
    for (int k = 0; k < 2; ++k)
        for (uint32_t i = 0; (k ? b : a) && i < (k ? b : a)->sites; ++i) {
            const struct runtime_site *s = &(k ? b : a)->site[i];
            if (s->address < lo) lo = s->address;
            if (s->address + s->length > hi) hi = s->address + s->length;
        }
    if (lo >= hi) return 0;
    struct runtime_span span[RUNTIME_PAUSED];
    unsigned n = modwerk_machine_paused(span, RUNTIME_PAUSED);
    if (n > RUNTIME_PAUSED) return 1;
    for (unsigned i = 0; i < n; ++i)
        for (const uint8_t *p = span[i].from; p + 4 <= span[i].to; p += 2) {
            uint32_t v = be32(p);
            if (v > lo && v < hi && (inside(a, v) || inside(b, v))) return 1;
        }
    return 0;
}
static int holds(const struct runtime_module *m, int patched)
{
    for (uint32_t i = 0; m && i < m->sites; ++i) {
        const struct runtime_site *s = &m->site[i];
        const volatile uint8_t *now = modwerk_machine_code(s->address);
        for (uint32_t j = 0; j < s->length; ++j) if (now[j] != (patched ? s->code : s->stock)[j]) return 0;
    }
    return 1;
}
static void put(const struct runtime_module *m, int patched)
{
    for (uint32_t i = 0; m && i < m->sites; ++i) {
        const struct runtime_site *s = &m->site[i];
        volatile uint8_t *to = modwerk_machine_code(s->address);
        modwerk_machine_flush_data(s->address, s->length);
        for (uint32_t j = 0; j < s->length; ++j) to[j] = (patched ? s->code : s->stock)[j];
    }
}
/* Hooks and sites change together, with nothing else running. On any
 * mismatch the active module's sites are put back and nothing changes. */
static int switch_to(const struct runtime_module *to)
{
    const struct runtime_module *from = active;
    uint32_t mask = modwerk_machine_mask();
    int ok = !in_flight(from, to) && holds(from, 1);
    if (ok) {
        put(from, 0);
        ok = holds(to, 0);
        if (ok) {
            put(to, 1);
            ok = holds(to, 1);
            if (!ok) put(to, 0);
        }
        if (!ok) put(from, 1);
        modwerk_machine_invalidate_code();
        if (ok) active = to;
    }
    modwerk_machine_unmask(mask);
    return ok;
}

static int enter(void *u) { (void)u; if (!modwerk_machine_stopped()) return 0; held = 1; return 1; }
static int safe(void *u) { (void)u; return held && modwerk_machine_stopped(); }
static int leave(void *u) { (void)u; held = 0; return 1; }
static int prepare(void *u, const uint8_t *data, uint32_t length)
{
    (void)u;
    if (length < RUNTIME_HEADER_BYTES || data[0] != 'M' || data[1] != 'W' || data[2] != 'R' || data[3] != 'M' ||
        be32(data + 4) != 0x00030000u) return 0;
    uint32_t image = be32(data + 8), bss = be32(data + 12), count = be32(data + 16), hooks = be32(data + 20),
             sites = be32(data + 24), end = image + bss, at = RUNTIME_HEADER_BYTES + 4u * hooks;
    if (image > RUNTIME_IMAGE_BYTES || bss > RUNTIME_IMAGE_BYTES - image || hooks > RUNTIME_EVENTS ||
        count > RUNTIME_RELOCATIONS || sites > RUNTIME_SITES || length < at + image + 4u * count) return 0;
    const uint8_t *from = data + at, *relocation = from + image, *record = relocation + 4u * count, *p = record;
    uint32_t hook[RUNTIME_EVENTS], left = length - (at + image + 4u * count), address[RUNTIME_SITES], size[RUNTIME_SITES];
    for (uint32_t i = 0; i < RUNTIME_EVENTS; ++i) {
        hook[i] = i < hooks ? be32(data + RUNTIME_HEADER_BYTES + 4u * i) : RUNTIME_NONE;
        if (hook[i] != RUNTIME_NONE && (hook[i] >= image || hook[i] & 1u)) return 0;
    }
    /* Sites: whole bounded records, patchable stock code, no overlaps. */
    for (uint32_t i = 0; i < sites; ++i) {
        if (left < 8u) return 0;
        uint32_t n = be16(p + 4), r = be16(p + 6);
        address[i] = be32(p); size[i] = n;
        if (!n || n > RUNTIME_SITE_BYTES || (address[i] | n) & 1u || r > RUNTIME_SITE_RELOCATIONS ||
            left - 8u < 2u * n + 2u * r || !modwerk_machine_patchable(address[i], n)) return 0;
        for (uint32_t j = 0; j < i; ++j)
            if (address[i] < address[j] + size[j] && address[j] < address[i] + n) return 0;
        p += 8u + 2u * n + 2u * r; left -= 8u + 2u * n + 2u * r;
    }
    if (left) return 0;
    candidate = 0; prepared = 0;
    uint32_t before = used;
    if (image || sites) {
        uint8_t *code = end ? take(end) : 0;
        struct runtime_module *m = take(sizeof *m);
        struct runtime_site *site = sites ? take(sites * (uint32_t)sizeof *site) : 0;
        if ((end && !code) || !m || (sites && !site)) { release(before); return 0; }
        uint8_t *to = end ? modwerk_machine_uncached(code) : 0;
        uint32_t base = (uint32_t)(uintptr_t)to;
        for (uint32_t i = 0; i < image; ++i) to[i] = from[i];
        for (uint32_t i = 0; i < bss; ++i) to[image + i] = 0;
        /* Each word must point into the module; one listed twice no longer does. */
        for (uint32_t i = 0; i < count; ++i) {
            uint32_t r = be32(relocation + 4u * i);
            if (r & 1u || image < 4u || r > image - 4u || !relocate(to + r, end, base)) { release(before); return 0; }
        }
        p = record;
        for (uint32_t i = 0; i < sites; ++i) {
            uint32_t n = size[i], r = be16(p + 6);
            site[i].address = address[i]; site[i].length = n;
            for (uint32_t j = 0; j < n; ++j) { site[i].stock[j] = p[8 + j]; site[i].code[j] = p[8 + n + j]; }
            for (uint32_t j = 0; j < r; ++j) {
                uint32_t o = be16(p + 8 + 2u * n + 2u * j);
                if (o & 1u || n < 4u || o > n - 4u || !relocate(site[i].code + o, end, base)) { release(before); return 0; }
            }
            p += 8u + 2u * n + 2u * r;
        }
        modwerk_machine_invalidate_code();
        for (uint32_t i = 0; i < RUNTIME_EVENTS; ++i) m->hook[i] = hook[i] == RUNTIME_NONE ? 0 : (uintptr_t)to + hook[i];
        m->site = site; m->sites = sites;
        candidate = m;
    }
    mark = before; prepared = 1;
    return 1;
}
static int discard(void *u) { (void)u; if (prepared) release(mark); prepared = 0; candidate = 0; return 1; }
static enum mu_publication publish(void *u)
{
    (void)u;
    if (!prepared) return MU_UNCERTAIN;
    const struct runtime_module *was = active;
    if (!switch_to(candidate)) return MU_UNCHANGED; /* the controller discards the candidate */
    previous = was; prepared = 0;
    return MU_APPLIED;
}
static int restore(void *u) { (void)u; return switch_to(previous); }
static int retire(void *u) { (void)u; previous = 0; return 1; }
const struct mu_backend modwerk_runtime_backend = {0, enter, safe, leave, prepare, discard, publish, restore, retire};
