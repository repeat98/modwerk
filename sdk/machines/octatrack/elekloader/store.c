/* SPDX-License-Identifier: GPL-3.0-or-later
 * The module store, per project (owner, 8 November 2026: the base's own). A module that keeps state contributes one
 * ot_store record naming a block in its own memory (HOOKS.md). The base keeps every module's block in project.work,
 * as '#MWS=' (module:version:bytes), '#MWD=' (module:offset:hex, 16 bytes a line) and '#MWE=' (module:sum) lines that
 * stock's loader skips like any '#' line (fxmap.c calls in from fxmap.s's seams), and in battery RAM, because a power
 * cycle reads no project file. A module that is not installed keeps its block: its lines go back out as read.
 * One task changes the store, the UI tick. The loader's pass only stages lines; the tick commits them, calls the
 * modules and copies changed blocks to battery RAM once a second. The writer only reads. */
#include <stdint.h>
#include "store.h"
#include "loader.h"
#include "modwerk_events.h"

#define MAGIC 0x4d575342u    /* "MWSB" */
#define CAPACITY 10232u      /* what every kept block shares: the image fills 0x100f9800-0x100fc000 */
#define HEAD 12u             /* an entry: module, bytes, version, sum; then its bytes, padded to 4 */
#define MOST 4096u           /* a block's largest */
#define ROOM 32u             /* ot_store's room (events.json) */
#define PER_LINE 16u         /* data bytes per '#MWD=' line: 53 characters with CR LF */
#define NONE 0xffffffffu

struct image { uint32_t magic, used; uint8_t data[CAPACITY]; };
struct seen { const struct modwerk_store *r; uint32_t module; };

#ifdef MODWERK_HOST /* test_store.c models battery RAM, the table, its owners and the writer */
struct image modwerk_test_battery;
const struct modwerk_store *modwerk_test_rows[ROOM + 1u];
uint32_t modwerk_test_owner(const void *record);
int (*modwerk_test_write)(uint32_t file, const void *data, unsigned length);
#define BAT (&modwerk_test_battery)
#define WRITE modwerk_test_write
#define MASK() 0u
#define UNMASK(m) ((void)(m))
#else
/* Battery RAM stock never uses (fxmap.c): after the Micro Timing draft's table (0x100f8ffc-0x100f97ff, which follows
 * PLAY MODES's 0x100f8600-0x100f8f06), below diag.c's log at 0x100fc000. */
#define BAT ((volatile struct image *)0x100f9800u)
typedef char store_fits[0x100f9800u + sizeof(struct image) <= 0x100fc000u ? 1 : -1];
#define WRITE ((int (*)(uint32_t, const void *, unsigned))0x400166b8u) /* write(file, data, n), the writer's own */
#define MASK() modwerk_machine_mask()
#define UNMASK(m) modwerk_machine_unmask(m)
#endif

volatile uint32_t modwerk_store_refused;
static struct image staged;            /* the storing pass's entries, complete ones only */
static unsigned at_open, filled;       /* the entry being read: where it starts, its bytes so far */
static uint32_t open_module;           /* its module, 0 when none is open */
static int staging;
static volatile int pending;           /* staged holds a loaded project's store for the tick to commit */
static struct seen seen[ROOM];         /* the records the last tick saw; the writer takes a copy, masked */
static unsigned seen_n;

static uint32_t sum_of(const volatile uint8_t *p, unsigned n)
{
    uint32_t h = 2166136261u; /* FNV-1a */
    for (unsigned i = 0; i < n; ++i) h = (h ^ p[i]) * 16777619u;
    return h;
}
static unsigned padded(unsigned n) { return (n + 3u) & ~3u; }
static uint32_t u32(const volatile uint8_t *p) { return (uint32_t)p[0] << 24 | (uint32_t)p[1] << 16 | (uint32_t)p[2] << 8 | p[3]; }
static unsigned u16(const volatile uint8_t *p) { return (unsigned)p[0] << 8 | p[1]; }
static void put32(volatile uint8_t *p, uint32_t v) { p[0] = (uint8_t)(v >> 24), p[1] = (uint8_t)(v >> 16), p[2] = (uint8_t)(v >> 8), p[3] = (uint8_t)v; }
static void put16(volatile uint8_t *p, unsigned v) { p[0] = (uint8_t)(v >> 8), p[1] = (uint8_t)v; }

/* The next entry after `at`, or NONE past the end or at a malformed one (the rest is not read). */
static uint32_t next_entry(const volatile struct image *m, uint32_t at)
{
    uint32_t used = m->used;
    if (used > CAPACITY || at + HEAD > used) return NONE;
    unsigned bytes = u16(m->data + at + 4u);
    return bytes && bytes <= MOST && at + HEAD + padded(bytes) <= used ? at + HEAD + padded(bytes) : NONE;
}
static uint32_t find(const volatile struct image *m, uint32_t module)
{
    for (uint32_t at = 0, next; (next = next_entry(m, at)) != NONE; at = next)
        if (u32(m->data + at) == module) return at;
    return NONE;
}

/* The table's records now, masked so a change is never seen half-way (as machine_registry.c's machines()). */
static unsigned records(const struct modwerk_store **out)
{
    unsigned n = 0;
    uint32_t mask = MASK();
#ifdef MODWERK_HOST
    for (const struct modwerk_store *const *row = modwerk_test_rows; *row && n < ROOM; ++row) {
        const struct modwerk_store *r = *row;
#elif RUNTIME_SITE_EVENTS
    for (uintptr_t volatile *row = modwerk_runtime_event_row[MODWERK_OT_STORE - RUNTIME_EVENTS]; *row && n < ROOM; ++row) {
        const struct modwerk_store *r = (const struct modwerk_store *)*row;
#else
    for (const struct modwerk_store *r = 0; r; ) {
#endif
        if (r->abi == MODWERK_STORE_ABI && r->block && r->bytes && r->bytes <= MOST) out[n++] = r;
    }
    UNMASK(mask);
    return n;
}
static uint32_t owner(const struct modwerk_store *r)
{
#ifdef MODWERK_HOST
    return modwerk_test_owner(r);
#else
    struct runtime_owner o;
    return modwerk_runtime_owner_at((uintptr_t)r, &o) == 1 ? o.module : 0;
#endif
}

/* ---- The loader's storing pass (fxmap.c): complete entries whose sum holds go into `staged`. */
void modwerk_store_begin(uint32_t storing)
{
    if (!storing) return;
    pending = 0, staged.used = 0, open_module = 0, staging = 1;
}
static const char *hex(const char *s, uint32_t *out, char end)
{
    uint32_t v = 0;
    unsigned digits = 0;
    for (;; ++s, ++digits) {
        unsigned c = (unsigned char)*s, d = c - '0' < 10u ? c - '0' : (c | 0x20u) - 'a' < 6u ? (c | 0x20u) - 'a' + 10u : 16u;
        if (d > 15u) break;
        v = v << 4 | d;
    }
    *out = v;
    return digits && digits <= 8u && *s == end ? s + 1 : 0;
}
void modwerk_store_line(const char *line)
{
    if (!staging || line[0] != '#' || line[1] != 'M' || line[2] != 'W' || line[4] != '=') return;
    const char *s = line + 5;
    uint32_t module, a, b;
    if (line[3] == 'S') { /* a new entry: an open one that never ended is dropped */
        open_module = 0;
        if (!(s = hex(s, &module, ':')) || !(s = hex(s, &a, ':')) || !hex(s, &b, 0)) return;
        if (!module || !b || b > MOST || a > 0xffffu || find(&staged, module) != NONE || staged.used + HEAD + padded(b) > CAPACITY) return;
        at_open = staged.used, filled = 0, open_module = module;
        put32(staged.data + at_open, module), put16(staged.data + at_open + 4u, b), put16(staged.data + at_open + 6u, a);
        for (unsigned i = b; i < padded(b); ++i) staged.data[at_open + HEAD + i] = 0;
    } else if (line[3] == 'D') { /* its next bytes, in order */
        if (!open_module || !(s = hex(s, &module, ':')) || !(s = hex(s, &a, ':')) || module != open_module || a != filled) { open_module = 0; return; }
        unsigned bytes = u16(staged.data + at_open + 4u);
        for (; s[0] && s[1]; s += 2) {
            uint32_t v;
            char pair[3] = {s[0], s[1], 0};
            if (!hex(pair, &v, 0) || filled >= bytes) { open_module = 0; return; }
            staged.data[at_open + HEAD + filled++] = (uint8_t)v;
        }
        if (s[0]) open_module = 0; /* an odd digit */
    } else if (line[3] == 'E') { /* its end: complete and its sum holds, or it is dropped */
        uint32_t sum;
        int whole = open_module && (s = hex(s, &module, ':')) && hex(s, &sum, 0) && module == open_module &&
            filled == u16(staged.data + at_open + 4u) && sum_of(staged.data + at_open + HEAD, filled) == sum;
        if (whole) put32(staged.data + at_open + 8u, sum), staged.used = at_open + HEAD + padded(filled);
        open_module = 0;
    }
}
void modwerk_store_loaded(int32_t result)
{
    if (!staging) return;
    staging = 0, open_module = 0;
    if (result >= 0) pending = 1; /* a failed load keeps the project that is still there */
}

/* ---- The writer (fxmap.c): installed modules' blocks as they are now, then the kept blocks of the others. */
static unsigned put_hex(char *p, uint32_t v, unsigned digits)
{
    for (unsigned i = 0; i < digits; ++i) p[i] = "0123456789abcdef"[v >> 4u * (digits - 1u - i) & 15u];
    return digits;
}
static void emit(uint32_t file, char *line, unsigned n) { line[n++] = '\r', line[n++] = '\n'; WRITE(file, line, n); }
static unsigned start(char *line, char kind, uint32_t module)
{
    line[0] = '#', line[1] = 'M', line[2] = 'W', line[3] = kind, line[4] = '=';
    unsigned n = 5 + put_hex(line + 5, module, 8);
    line[n++] = ':';
    return n;
}
static void write_block(uint32_t file, uint32_t module, unsigned version, unsigned bytes, const volatile uint8_t *block)
{
    char line[64];
    unsigned n = start(line, 'S', module);
    n += put_hex(line + n, version, 4), line[n++] = ':', n += put_hex(line + n, bytes, 4);
    emit(file, line, n);
    uint32_t h = 2166136261u; /* the sum of the bytes as written, read once */
    for (unsigned at = 0; at < bytes; at += PER_LINE) {
        n = start(line, 'D', module);
        n += put_hex(line + n, at, 4), line[n++] = ':';
        for (unsigned i = at; i < bytes && i < at + PER_LINE; ++i) {
            uint8_t v = block[i];
            h = (h ^ v) * 16777619u;
            n += put_hex(line + n, v, 2);
        }
        emit(file, line, n);
    }
    n = start(line, 'E', module);
    n += put_hex(line + n, h, 8);
    emit(file, line, n);
}
void modwerk_store_write(uint32_t file)
{
    struct seen live[ROOM];
    uint32_t mask = MASK();
    unsigned n = seen_n;
    for (unsigned k = 0; k < n; ++k) live[k] = seen[k];
    UNMASK(mask);
    for (unsigned k = 0; k < n; ++k)
        write_block(file, live[k].module, live[k].r->version, live[k].r->bytes, (const volatile uint8_t *)live[k].r->block);
    for (uint32_t at = 0, next; (next = next_entry(BAT, at)) != NONE; at = next) {
        uint32_t module = u32(BAT->data + at);
        unsigned k = 0;
        while (k < n && live[k].module != module) ++k;
        if (module && k == n) write_block(file, module, u16(BAT->data + at + 6u), u16(BAT->data + at + 4u), BAT->data + at + HEAD);
    }
}

/* ---- The UI tick: the only code that changes the store. */
/* Copy a kept block in, or none: then the module puts its defaults in. */
static void apply(const struct modwerk_store *r, uint32_t module, unsigned how)
{
    uint32_t at = find(BAT, module);
    unsigned bytes = at == NONE ? 0 : u16(BAT->data + at + 4u), version = at == NONE ? 0 : u16(BAT->data + at + 6u);
    if (bytes && sum_of(BAT->data + at + HEAD, bytes) != u32(BAT->data + at + 8u)) bytes = 0; /* torn by a power cut */
    volatile uint8_t *block = (volatile uint8_t *)r->block;
    for (unsigned i = 0; i < bytes && i < r->bytes; ++i) block[i] = BAT->data[at + HEAD + i];
    if (r->loaded) r->loaded(bytes ? how : MODWERK_STORE_NEW, bytes ? version : 0u, bytes);
}
/* Keep a module's block in battery RAM when it changed: in place at the same size, else appended (the old one
 * dropped). The writer may read meanwhile: an entry is whole before `used` names it. */
static void keep(const struct modwerk_store *r, uint32_t module)
{
    const volatile uint8_t *block = (const volatile uint8_t *)r->block;
    unsigned bytes = r->bytes;
    uint32_t sum = sum_of(block, bytes), at = find(BAT, module);
    if (at != NONE && u16(BAT->data + at + 4u) == bytes) {
        if (u16(BAT->data + at + 6u) == r->version && u32(BAT->data + at + 8u) == sum) return;
        for (unsigned i = 0; i < bytes; ++i) BAT->data[at + HEAD + i] = block[i];
        put16(BAT->data + at + 6u, r->version), put32(BAT->data + at + 8u, sum);
        return;
    }
    uint32_t used = BAT->used;
    if (used + HEAD + padded(bytes) > CAPACITY) { modwerk_store_refused = modwerk_store_refused + 1u; return; }
    if (at != NONE) put32(BAT->data + at, 0); /* its block at another size: dropped, the space comes back at the next load */
    put32(BAT->data + used, 0), put16(BAT->data + used + 4u, bytes), put16(BAT->data + used + 6u, r->version);
    for (unsigned i = 0; i < padded(bytes); ++i) BAT->data[used + HEAD + i] = i < bytes ? block[i] : 0;
    put32(BAT->data + used + 8u, sum), put32(BAT->data + used, module);
    BAT->used = used + HEAD + padded(bytes);
}
void modwerk_store_tick(void)
{
    static uint32_t ticks;
    if (BAT->magic != MAGIC || BAT->used > CAPACITY) BAT->used = 0, BAT->magic = MAGIC; /* the first start */
    int loaded = pending;
    if (loaded) { /* the loaded project's store replaces the last one: empty first, so the writer never reads half */
        BAT->used = 0;
        for (unsigned i = 0; i < staged.used; ++i) BAT->data[i] = staged.data[i];
        BAT->used = staged.used;
        pending = 0;
    }
    const struct modwerk_store *now[ROOM];
    struct seen next[ROOM];
    unsigned n = records(now), m = 0;
    for (unsigned k = 0; k < n; ++k) {
        uint32_t module = owner(now[k]);
        unsigned dup = 0, known = 0;
        for (unsigned j = 0; j < m; ++j) dup |= next[j].module == module;
        for (unsigned j = 0; j < seen_n; ++j) known |= seen[j].r == now[k] && seen[j].module == module;
        if (!module || dup) continue; /* one record a module */
        if (loaded || !known) apply(now[k], module, loaded ? MODWERK_STORE_LOADED : MODWERK_STORE_RESTORED);
        next[m].r = now[k], next[m].module = module, ++m;
    }
    uint32_t mask = MASK();
    for (unsigned k = 0; k < m; ++k) seen[k] = next[k];
    seen_n = m;
    UNMASK(mask);
    if (++ticks % 60u == 0)
        for (unsigned k = 0; k < m; ++k) keep(next[k].r, next[k].module);
}
