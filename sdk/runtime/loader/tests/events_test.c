/* SPDX-License-Identifier: GPL-3.0-or-later
 * Host check of site events (loader.h): ordered rows from subscribers' hook
 * words, both install orders, removal, MU and journal rollback, the paused-task
 * fence on the base's dispatch, and refusals of raw sites/copies on an event
 * site. Machine glue is a stub (tests/events/runtime_events.h); module code never runs. */
#define MODWERK_RUNTIME_EVENTS
#define MODWERK_RUNTIME_METADATA_EXTERNAL
#define MODWERK_RUNTIME_JOURNAL_EXTERNAL
#define MODWERK_RUNTIME_TABLES_EXTERNAL
#include "../loader.c"
#include "../../upload/sha256.c"
#include <stdio.h>
#include <string.h>

#define STOCK 0x1000u
static unsigned failures;
#define CHECK(x) do { if (!(x)) { failures++; fprintf(stderr, "%s:%d: %s\n", __FILE__, __LINE__, #x); } } while (0)
static uint8_t stock[256], original[256], paused[64];
static int masked, locked, unknown, rows_written_unmasked;
static uintptr_t row_copy[RUNTIME_SITE_EVENTS][4];
#define WORDS(e) (event_room[e] + 1u < 4u ? event_room[e] + 1u : 4u) /* the words of row e compared */
/* The base's dispatch, as far as the loader knows it: an address range. */
const uint8_t modwerk_events_code[64] = {0}, modwerk_events_code_end[1] = {0};
const unsigned char modwerk_raise_test[4] = {0}; /* the base's entry for the raised event */
static void snapshot(void) { for (unsigned e = 0; e < RUNTIME_SITE_EVENTS; ++e) for (unsigned k = 0; k < WORDS(e); ++k) row_copy[e][k] = modwerk_runtime_event_row[e][k]; }
static int rows_same(void)
{
    for (unsigned e = 0; e < RUNTIME_SITE_EVENTS; ++e) for (unsigned k = 0; k < WORDS(e); ++k) if (row_copy[e][k] != modwerk_runtime_event_row[e][k]) return 0;
    return 1;
}
static uintptr_t mark[RUNTIME_SITE_EVENTS][4];
static void keep(void) { for (unsigned e = 0; e < RUNTIME_SITE_EVENTS; ++e) for (unsigned k = 0; k < WORDS(e); ++k) mark[e][k] = modwerk_runtime_event_row[e][k]; }
static int kept(void)
{
    for (unsigned e = 0; e < RUNTIME_SITE_EVENTS; ++e) for (unsigned k = 0; k < WORDS(e); ++k) if (mark[e][k] != modwerk_runtime_event_row[e][k]) return 0;
    return 1;
}
int modwerk_machine_stopped(void) { return 1; }
void *modwerk_machine_uncached(void *p) { return p; }
static int lose_write; /* the next switch's writes: one byte does not land (invalidate runs right after them) */
void modwerk_machine_invalidate_code(void) { if (lose_write) stock[0x40] ^= 1, lose_write = 0; }
int modwerk_machine_patchable(uint32_t a, uint32_t n) { return a >= STOCK + 16u && n <= STOCK + sizeof stock - a; }
/* Code is read under the lock and written masked (put() flushes each site just before writing it). */
uint8_t *modwerk_machine_code(uint32_t a) { CHECK(locked); return stock + (a - STOCK); }
void modwerk_machine_flush_data(uint32_t a, uint32_t n) { CHECK(masked); (void)a; (void)n; }
/* Rows may change only while masked: compare them at each mask boundary. */
uint32_t modwerk_machine_mask(void) { CHECK(!masked && locked); rows_written_unmasked += !rows_same(); masked = 1; return 7; }
void modwerk_machine_unmask(uint32_t sr) { CHECK(masked && sr == 7); masked = 0; snapshot(); }
uint32_t modwerk_machine_lock(void) { CHECK(!locked && !masked); rows_written_unmasked += !rows_same(); locked = 1; return 4; }
void modwerk_machine_unlock(uint32_t sr) { CHECK(locked && !masked && sr == 4); locked = 0; rows_written_unmasked += !rows_same(); }
unsigned modwerk_machine_paused(struct runtime_span *span, unsigned max, const struct runtime_context *context)
{
    (void)context; CHECK(locked);
    if (unknown) return max + 1u;
    span[0] = (struct runtime_span){paused, paused + sizeof paused};
    return 1;
}
int modwerk_machine_dsp_admit(const struct runtime_dsp *from, struct runtime_dsp *to) { (void)from; (void)to; return RUNTIME_OK; }
void modwerk_machine_dsp_switch(const struct runtime_dsp *from, const struct runtime_dsp *to) { (void)from; (void)to; }
static unsigned seen_contributor, tables_changed;
int modwerk_machine_metadata_admit(const struct runtime_dsp *from, struct runtime_dsp *to,
    const struct runtime_context *context, enum runtime_metadata_operation operation)
{ (void)from; (void)context; seen_contributor |= operation == RUNTIME_METADATA_PREPARE && to->contributes; to->foreign_roots = 0; return RUNTIME_OK; } /* synthetic: groups admitted */
void modwerk_machine_tables_changed(void) { CHECK(masked); ++tables_changed; }
/* Synthetic journal adapter: every job READY at once (no DSP work). */
int modwerk_machine_journal_enabled(void) { return 1; }
int modwerk_machine_journal_begin_safe(void) { return 1; }
int modwerk_machine_journal_admit(const struct runtime_journal_view *rows, unsigned count) { (void)rows; (void)count; return 1; }
enum runtime_journal_observation modwerk_machine_journal_transition(const struct runtime_journal_view *row, int reverse, uint8_t masks[3])
{ (void)row; (void)reverse; masks[0] = masks[1] = masks[2] = 1; return RJ_READY; }
int modwerk_machine_journal_switch_safe(const struct runtime_journal_view *row, int reverse) { (void)row; (void)reverse; return 1; }
int modwerk_machine_journal_committed(const struct runtime_journal_view *row, int reverse) { (void)row; (void)reverse; return 1; }
int modwerk_machine_journal_roots_clear(const struct runtime_journal_view *row) { (void)row; return 1; }
int modwerk_machine_journal_accept(const struct runtime_journal_view *rows, unsigned count) { (void)rows; (void)count; return 1; }
void modwerk_machine_journal_idle(uint32_t generation) { (void)generation; }
int modwerk_machine_journal_association(uint32_t module, const uint8_t digest[MU_DIGEST_BYTES], const uint32_t *participants, unsigned count)
{ (void)module; (void)digest; (void)participants; (void)count; return 1; }
int modwerk_machine_journal_trial(int running) { (void)running; return 1; }

static const struct mu_backend *b = &modwerk_runtime_backend;
static uint8_t p[RUNTIME_PACKAGE_BYTES + 64];
static uint32_t n;
static void emit(uint32_t v) { put32(p + n, v); n += 4; }
/* ABI 8 package of module `id`: a 64-byte image, `hooks` hook words, `sites` sites to add. */
static void pkg(uint32_t id, const uint32_t *hooks, unsigned count, unsigned sites, uint16_t flags)
{
    memset(p, 0, 76); memcpy(p, "MWRM\0\10", 6); p[6] = (uint8_t)(flags >> 8); p[7] = (uint8_t)flags; n = 8;
    emit(64); emit(0); emit(0); emit(count); emit(sites); emit(id);
    memcpy(p + 50, "EV", 2); p[67] = 1; n = 76;
    for (unsigned i = 0; i < count; ++i) emit(hooks[i]);
    memset(p + n, 0x4e, 64); if (flags & RUNTIME_GROUP_METADATA) memcpy(p + n, "MWMG\1\1\0\0", 8);
    n += 64;
}
/* A subscriber of `event` (RUNTIME_EVENTS...) with `order`, its handler at image offset `at`. */
static void subscriber(uint32_t id, unsigned event, uint8_t order, uint32_t at)
{
    uint32_t hooks[RUNTIME_HOOKS];
    for (unsigned i = 0; i < RUNTIME_HOOKS; ++i) hooks[i] = RUNTIME_NONE;
    hooks[event] = (uint32_t)order << 24 | at;
    pkg(id, hooks, RUNTIME_HOOKS, 0, 0);
}
/* ABI 8 site: jmp image+0 over stock's first `length` bytes at `address`, guard `checked` bytes. */
static void site8(uint32_t address, uint32_t length, uint32_t checked)
{
    emit(address); p[n++] = (uint8_t)length; p[n++] = 0; p[n++] = (uint8_t)checked; p[n++] = 1;
    mu_sha256(original + (address - STOCK), checked, p + n); n += 32;
    memset(p + n, 0x71, length); p[n] = 0x4e; p[n + 1] = 0xf9; memset(p + n + 2, 0, 4); n += length;
    p[n++] = 0; p[n++] = 2;
}
static void copy8(uint32_t address, uint32_t length) /* image offset 8 must be zero */
{
    put32(p + 68, be32(p + 68) + 1u); memset(p + 76 + 4u * be32(p + 20) + 8, 0, length);
    emit(8); emit(address); p[n++] = 0; p[n++] = (uint8_t)length; p[n++] = 0; p[n++] = 0;
    mu_sha256(original + (address - STOCK), length, p + n); n += 32;
}
static int install(void) { return b->prepare(0, p, n) && b->publish(0) == MU_APPLIED && b->retire(0); }
static void empty(uint32_t id) { pkg(id, 0, 0, 0, 0); put32(p + 8, 0); n = 76; }
static int removal(uint32_t id) { empty(id); return install(); }
static const struct runtime_module *live_id(uint32_t id)
{
    for (unsigned i = 0; i < RUNTIME_MODULES; ++i) if (live[i] && live[i]->id == id) return live[i];
    return 0;
}
/* Row `e` is exactly these modules' handlers for that event, then 0. */
static int row_is(unsigned e, const uint32_t *ids, unsigned count)
{
    for (unsigned k = 0; k < count; ++k) {
        const struct runtime_module *m = live_id(ids[k]);
        if (!m || modwerk_runtime_event_row[e][k] != m->hook[RUNTIME_EVENTS + e] || !m->hook[RUNTIME_EVENTS + e]) return 0;
    }
    return modwerk_runtime_event_row[e][count] == 0;
}

int main(void)
{
    for (unsigned i = 0; i < sizeof stock; ++i) stock[i] = (uint8_t)(0x40 + i);
    memcpy(original, stock, sizeof stock);
    snapshot();
    uint8_t capabilities[12];
    CHECK(modwerk_runtime_capabilities(capabilities) == 12u && be16(capabilities + 6) == (7u | 128u));

    /* Raw patches on an event's bytes are refused, naming the event, before memory is taken. */
    uint32_t none[RUNTIME_HOOKS];
    for (unsigned i = 0; i < RUNTIME_HOOKS; ++i) none[i] = RUNTIME_NONE;
    pkg(40, none, RUNTIME_HOOKS, 1, 0); site8(0x1080u, 8, 8);
    CHECK(!b->prepare(0, p, n) && modwerk_runtime_refusal() == RUNTIME_EVENT && modwerk_runtime_refused_event() == RUNTIME_EVENTS);
    pkg(40, none, RUNTIME_HOOKS, 1, 0); site8(0x109cu, 6, 6);        /* its jmp reaches the bind site */
    CHECK(!b->prepare(0, p, n) && modwerk_runtime_refusal() == RUNTIME_EVENT && modwerk_runtime_refused_event() == RUNTIME_EVENTS + 1u);
    pkg(40, none, RUNTIME_HOOKS, 1, 0); site8(0x1078u, 6, 10);       /* only its guard reaches it */
    CHECK(!b->prepare(0, p, n) && modwerk_runtime_refusal() == RUNTIME_EVENT);
    pkg(40, none, RUNTIME_HOOKS, 0, 0); copy8(0x1084u, 4);            /* a stock copy of its bytes */
    CHECK(!b->prepare(0, p, n) && modwerk_runtime_refusal() == RUNTIME_EVENT);
    pkg(40, none, RUNTIME_HOOKS, 1, 0); site8(0x1070u, 6, 6);        /* beside it: fine */
    CHECK(b->prepare(0, p, n) && b->discard(0));
    CHECK(modwerk_runtime_free(0) == RUNTIME_POOL_BYTES && !memcmp(stock, original, sizeof stock));
    /* Malformed hook words: ABI 7 cannot carry site events; offsets inside the image, even. */
    subscriber(41, RUNTIME_EVENTS, 10, 4); p[5] = 7;
    CHECK(!b->prepare(0, p, n) && modwerk_runtime_refusal() == RUNTIME_MALFORMED);
    subscriber(41, RUNTIME_EVENTS, 10, 64);
    CHECK(!b->prepare(0, p, n) && modwerk_runtime_refusal() == RUNTIME_MALFORMED);
    subscriber(41, RUNTIME_EVENTS, 10, 5);
    CHECK(!b->prepare(0, p, n) && modwerk_runtime_refusal() == RUNTIME_MALFORMED);
    uint32_t extra[RUNTIME_HOOKS + 1]; for (unsigned i = 0; i <= RUNTIME_HOOKS; ++i) extra[i] = RUNTIME_NONE;
    pkg(41, extra, RUNTIME_HOOKS + 1u, 0, 0);
    CHECK(!b->prepare(0, p, n) && modwerk_runtime_refusal() == RUNTIME_MALFORMED);

    /* Rows by (order, module id) whatever the install order; removal and replacement exact. */
    static const uint32_t ids[3] = {30, 20, 10};
    static const uint8_t orders[3] = {50, 20, 50};
    static const uint32_t sorted[3] = {20, 10, 30};
    for (unsigned perm = 0; perm < 6; ++perm) {
        static const unsigned seq[6][3] = {{0,1,2},{0,2,1},{1,0,2},{1,2,0},{2,0,1},{2,1,0}};
        for (unsigned k = 0; k < 3; ++k) { subscriber(ids[seq[perm][k]], RUNTIME_EVENTS, orders[seq[perm][k]], 4u * (k + 1u)); CHECK(install()); }
        CHECK(row_is(0, sorted, 3) && row_is(1, 0, 0) && row_is(2, 0, 0));
        CHECK(removal(20) && row_is(0, (const uint32_t[]){10, 30}, 2));
        CHECK(removal(30) && row_is(0, (const uint32_t[]){10}, 1));
        CHECK(removal(10) && row_is(0, 0, 0) && !modwerk_runtime_active() && modwerk_runtime_free(0) == RUNTIME_POOL_BYTES);
    }
    subscriber(30, RUNTIME_EVENTS, 50, 4); CHECK(install());
    subscriber(20, RUNTIME_EVENTS, 20, 4); CHECK(install());
    subscriber(30, RUNTIME_EVENTS, 10, 8);                            /* replaced, now first */
    CHECK(b->prepare(0, p, n) && b->publish(0) == MU_APPLIED && row_is(0, (const uint32_t[]){30, 20}, 2));
    CHECK(b->restore(0) && row_is(0, (const uint32_t[]){20, 30}, 2) && live_id(30)->order[RUNTIME_EVENTS] == 50);
    CHECK(b->retire(0));
    /* Two events at one site, and a module on two events. */
    uint32_t two[RUNTIME_HOOKS]; memcpy(two, none, sizeof two);
    two[RUNTIME_EVENTS + 1] = 20u << 24 | 8u; two[RUNTIME_EVENTS + 2] = 50u << 24 | 12u;
    pkg(50, two, RUNTIME_HOOKS, 0, 0); CHECK(install());
    subscriber(60, RUNTIME_EVENTS + 1, 50, 16); CHECK(install());
    CHECK(row_is(1, (const uint32_t[]){50, 60}, 2) && row_is(2, (const uint32_t[]){50}, 1) && row_is(0, (const uint32_t[]){20, 30}, 2));

    /* A paused task inside the dispatch (its return address or PC): a switch that changes a row waits,
     * changing nothing; one that changes no row goes ahead. Unknown task state counts as inside. */
    keep();
    put32(paused + 8, (uint32_t)(uintptr_t)(modwerk_events_code + 20));
    subscriber(70, RUNTIME_EVENTS + 2, 10, 4);
    CHECK(b->prepare(0, p, n) && b->publish(0) == MU_UNCHANGED && modwerk_runtime_refusal() == RUNTIME_BUSY && b->discard(0));
    CHECK(kept() && !live_id(70));
    CHECK(!removal(50) && kept() && live_id(50) && b->discard(0));
    pkg(71, none, RUNTIME_HOOKS, 1, 0); site8(0x1040u, 6, 6); CHECK(install() && kept()); /* no row changes */
    CHECK(removal(71) && kept());
    put32(paused + 8, (uint32_t)(uintptr_t)modwerk_events_code_end);  /* just past it: fine */
    unknown = 1; subscriber(70, RUNTIME_EVENTS + 2, 10, 4);
    CHECK(b->prepare(0, p, n) && b->publish(0) == MU_UNCHANGED && b->discard(0) && kept());
    unknown = 0; CHECK(install() && row_is(2, (const uint32_t[]){70, 50}, 2));
    /* A failed switch (code changed under the module's site) changes no row. */
    pkg(72, two, RUNTIME_HOOKS, 1, 0); site8(0x1040u, 6, 6); keep();
    CHECK(b->prepare(0, p, n)); stock[0x40] ^= 1;
    CHECK(b->publish(0) == MU_UNCHANGED && b->discard(0) && kept() && !live_id(72));
    stock[0x40] ^= 1;
    /* A write that did not land, found by the check after the unmask: its sites and rows are put back, masked. */
    pkg(72, two, RUNTIME_HOOKS, 1, 0); site8(0x1040u, 6, 6); keep();
    CHECK(b->prepare(0, p, n)); lose_write = 1;
    CHECK(b->publish(0) == MU_UNCHANGED && b->discard(0) && kept() && !live_id(72) && !lose_write);
    CHECK(!memcmp(stock, original, sizeof stock) && !rows_written_unmasked);

    /* Groups may subscribe; a group's legacy hook stays malformed. */
    uint32_t group[RUNTIME_HOOKS]; memcpy(group, none, sizeof group); group[RUNTIME_EVENTS] = 15u << 24 | 16u;
    pkg(0xdb769930u, group, RUNTIME_HOOKS, 0, RUNTIME_GROUP_METADATA); CHECK(install());
    CHECK(row_is(0, (const uint32_t[]){0xdb769930u, 20, 30}, 3));
    group[RUNTIME_TICK] = 16u; pkg(0xdb769930u, group, RUNTIME_HOOKS, 0, RUNTIME_GROUP_METADATA);
    CHECK(!b->prepare(0, p, n) && modwerk_runtime_refusal() == RUNTIME_MALFORMED);

    /* Journal: a whole set in either order, rollback mid-way and at the end, exact rows each time. */
    keep();
    for (unsigned order = 0; order < 2; ++order) {
        CHECK(modwerk_runtime_journal_begin() == RJ_OK);
        for (unsigned k = 0; k < 3; ++k) {
            unsigned which = order ? 2u - k : k;
            if (which == 0) subscriber(80, RUNTIME_EVENTS, 30, 4);
            else if (which == 1) subscriber(81, RUNTIME_EVENTS, 30, 8);
            else empty(20);                                             /* removes 20 */
            CHECK(modwerk_runtime_journal_prepare(p, n, 0) == RJ_OK);
        }
        CHECK(modwerk_runtime_journal_verify() == RJ_OK && modwerk_runtime_journal_activate() == RJ_PENDING);
        CHECK(modwerk_runtime_journal_step(0) == RJ_PENDING);
        if (order) {                                                    /* rollback after one row */
            CHECK(modwerk_runtime_journal_abort() == RJ_PENDING);
            for (unsigned i = 0; i < 6 && journal.progress.phase == RJ_ROLLBACK; ++i) modwerk_runtime_journal_step(0);
            CHECK(!modwerk_runtime_volatile_busy() && kept());
            continue;
        }
        CHECK(modwerk_runtime_journal_step(0) == RJ_PENDING && modwerk_runtime_journal_step(0) == RJ_PENDING);
        CHECK(modwerk_runtime_journal_step(0) == RJ_OK && journal.progress.phase == RJ_TRIAL);
        CHECK(row_is(0, (const uint32_t[]){0xdb769930u, 80, 81, 30}, 4));
        CHECK(modwerk_runtime_journal_abort() == RJ_PENDING);
        for (unsigned i = 0; i < 6 && journal.progress.phase == RJ_ROLLBACK; ++i) modwerk_runtime_journal_step(0);
        CHECK(!modwerk_runtime_volatile_busy() && kept());
    }
    CHECK(row_is(0, (const uint32_t[]){0xdb769930u, 20, 30}, 3) && row_is(1, (const uint32_t[]){50, 60}, 2));
    /* A take event and a table hold their room of subscribers; the next is refused before memory is taken, and a
     * removal makes room again. A contributor is marked for the board; the base hears of every row change masked. */
    unsigned changed = tables_changed;
    subscriber(90, RUNTIME_EVENTS + 3, 40, 4); CHECK(install());
    subscriber(91, RUNTIME_EVENTS + 3, 50, 4); CHECK(install() && row_is(3, (const uint32_t[]){90, 91}, 2) && tables_changed > changed);
    subscriber(92, RUNTIME_EVENTS + 3, 10, 4);
    CHECK(!b->prepare(0, p, n) && modwerk_runtime_refusal() == RUNTIME_FULL && modwerk_runtime_refused_event() == RUNTIME_EVENTS + 3u);
    subscriber(90, RUNTIME_EVENTS + 3, 45, 8); CHECK(install() && row_is(3, (const uint32_t[]){90, 91}, 2)); /* a replacement fits */
    CHECK(removal(91)); subscriber(92, RUNTIME_EVENTS + 3, 10, 4); CHECK(install() && row_is(3, (const uint32_t[]){92, 90}, 2));
    seen_contributor = 0;
    subscriber(93, RUNTIME_EVENTS + 4, 30, 8); CHECK(install() && seen_contributor && live_id(93)->dsp.contributes);
    CHECK(!live_id(92)->dsp.contributes);
    subscriber(94, RUNTIME_EVENTS + 4, 20, 8); CHECK(install() && row_is(4, (const uint32_t[]){94, 93}, 2));
    subscriber(95, RUNTIME_EVENTS + 4, 20, 8); CHECK(!b->prepare(0, p, n) && modwerk_runtime_refusal() == RUNTIME_FULL);
    /* A table's owned site refuses raw patches and copies, naming the table. */
    pkg(96, none, RUNTIME_HOOKS, 1, 0); site8(0x10ceu, 6, 6);
    CHECK(!b->prepare(0, p, n) && modwerk_runtime_refusal() == RUNTIME_EVENT && modwerk_runtime_refused_event() == RUNTIME_EVENTS + 4u);
    pkg(96, none, RUNTIME_HOOKS, 0, 0); copy8(0x10d2u, 2);
    CHECK(!b->prepare(0, p, n) && modwerk_runtime_refusal() == RUNTIME_EVENT);
    pkg(96, none, RUNTIME_HOOKS, 1, 0); site8(0x10c0u, 6, 6);        /* the take event's site */
    CHECK(!b->prepare(0, p, n) && modwerk_runtime_refusal() == RUNTIME_EVENT && modwerk_runtime_refused_event() == RUNTIME_EVENTS + 3u);
    for (const uint32_t *id = (const uint32_t[]){90, 92, 93, 94, 0}; *id; ++id) CHECK(removal(*id));
    CHECK(row_is(3, 0, 0) && row_is(4, 0, 0));
    /* A raised event (no site): RUNTIME_RAISE asks for the base's entry in a zero word of the image; it is no
     * handler. A plain order subscribes as at a site; a slot that is not zero, or reaches past the image, is refused. */
    uint32_t raise[RUNTIME_HOOKS]; memcpy(raise, none, sizeof raise);
    raise[RUNTIME_EVENTS + 5] = RUNTIME_RAISE << 24 | 8u;
    pkg(90, raise, RUNTIME_HOOKS, 0, 0); CHECK(!b->prepare(0, p, n) && modwerk_runtime_refusal() == RUNTIME_MALFORMED);
    pkg(90, raise, RUNTIME_HOOKS, 0, 0); memset(p + n - 64 + 8, 0, 4); CHECK(install());
    CHECK(be32(live_id(90)->dsp.image + 8) == (uint32_t)(uintptr_t)modwerk_raise_test && !live_id(90)->hook[RUNTIME_EVENTS + 5]);
    CHECK(row_is(5, 0, 0));
    raise[RUNTIME_EVENTS + 5] = RUNTIME_RAISE << 24 | 62u;
    pkg(91, raise, RUNTIME_HOOKS, 0, 0); memset(p + n - 2, 0, 2); CHECK(!b->prepare(0, p, n) && modwerk_runtime_refusal() == RUNTIME_MALFORMED);
    subscriber(92, RUNTIME_EVENTS + 5, 50, 4); CHECK(install() && row_is(5, (const uint32_t[]){92}, 1));
    CHECK(removal(90) && removal(92) && row_is(5, 0, 0));
    /* Removing every subscriber empties every row and frees the pool. */
    for (const uint32_t *id = (const uint32_t[]){0xdb769930u, 20, 30, 50, 60, 70, 0}; *id; ++id) CHECK(removal(*id));
    CHECK(row_is(0, 0, 0) && row_is(1, 0, 0) && row_is(2, 0, 0) && !modwerk_runtime_active() && modwerk_runtime_free(0) == RUNTIME_POOL_BYTES);
    CHECK(!memcmp(stock, original, sizeof stock) && !rows_written_unmasked && !masked && !locked);
    if (failures) { fprintf(stderr, "%u event checks failed\n", failures); return 1; }
    puts("Site events: refusals naming the event, ordered rows in every install order, removal, replacement and "
         "restore, two events at one site, the paused-dispatch fence, groups, journal commit/rollback, take and table rooms, owned"
         " table sites, contributor marks and a raised event's entry slot passed.");
    return 0;
}
