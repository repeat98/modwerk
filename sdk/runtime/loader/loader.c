/* SPDX-License-Identifier: GPL-3.0-or-later
 * Machine-neutral runtime module loader (README.md). Several modules are
 * live at once, each at its own dispatch position with its own pool extent.
 * Prepare admits a package (memory, a position, and sites no other live
 * module patches) and relocates it into free pool memory; a refusal changes
 * nothing. Publish and restore switch one module's hooks and stock-code
 * sites together with interrupts masked, only after checking that no paused
 * task could resume inside a site, and only over the exact bytes expected
 * there. A module that is no longer live keeps its memory until no paused
 * task holds an address inside it. Engine task only.
 *
 * shortcut: a fixed pool in the base's .bss; take arena pages on demand once
 * the OS's page allocator is audited. */
#include "loader.h"
#include "context.h"
#include "journal.h"
#include "set_package.h"

#define OWNERS (2u * RUNTIME_MODULES) /* live, the transaction's two and those waiting to be reclaimed */
static uint8_t pool[RUNTIME_POOL_BYTES] __attribute__((aligned(16)));
struct modwerk_runtime_api modwerk_runtime_api;
volatile uint32_t modwerk_runtime_ticks;
static struct runtime_module *volatile live[RUNTIME_MODULES];
static struct runtime_module *owned[OWNERS]; /* every module holding pool memory */
static struct runtime_owner owner_identity[OWNERS]; /* never stored in uploaded/mutable module memory */
static uint32_t owner_generation; /* nonzero, monotonic for this boot; exhaustion refuses */
/* Changes whenever owned[], owner_identity[] or a position (live[]) changes: odd while a change is under way, so a
 * reader that interrupts one (the frame interrupt, a task holding the stable lock) never keeps what it saw. */
static volatile uint32_t owner_epoch;
static void owners_changing(void) { owner_epoch = owner_epoch + 1u; __asm__ __volatile__("" ::: "memory"); }
static void owners_changed(void) { __asm__ __volatile__("" ::: "memory"); owner_epoch = owner_epoch + 1u; }
uint32_t modwerk_runtime_owner_epoch(void) { return owner_epoch; }
static unsigned owners, slot;                /* slot: the transaction's position */
static struct runtime_module *candidate, *previous;
static int prepared, held;
static enum runtime_refusal refusal;
struct journal_row { struct runtime_module *before,*after; uint32_t before_generation,after_generation,module; uint16_t position; uint8_t published,touched,needs_restore; uint8_t package_sha256[MU_DIGEST_BYTES]; };
struct runtime_journal { struct journal_row row[RUNTIME_JOURNAL_ROWS]; struct runtime_journal_progress progress; uint8_t preparing; };
static struct runtime_journal journal;
#ifdef MODWERK_RUNTIME_SETS
/* The production lifecycle's whole-set owner. Its rows pin both images even
 * while the manager runs the trial. The private DSP journal is exclusive. */
static struct {
    struct journal_row row[RUNTIME_SET_CHANGES];
    unsigned count, published;
    int preparing, complete;
} change_set;
#define SET_ROWS change_set.count
#define SET_CAPABILITY 512u
#else
#define SET_ROWS 0u
#define SET_CAPABILITY 0u
#endif
int modwerk_runtime_set_busy(void) { return SET_ROWS != 0; }
#ifndef MODWERK_RUNTIME_JOURNAL_EXTERNAL
__attribute__((weak)) int modwerk_machine_journal_enabled(void) { return 0; }
__attribute__((weak)) int modwerk_machine_journal_begin_safe(void) { return 0; }
__attribute__((weak)) int modwerk_machine_journal_admit(const struct runtime_journal_view *rows,unsigned n)
{ (void)rows;(void)n;return 0; }
__attribute__((weak)) enum runtime_journal_observation modwerk_machine_journal_transition(const struct runtime_journal_view *row,int reverse,uint8_t masks[3])
{ (void)row;(void)reverse;(void)masks;return RJ_REJECTED; }
__attribute__((weak)) int modwerk_machine_journal_switch_safe(const struct runtime_journal_view *row,int reverse)
{ (void)row;(void)reverse;return 0; }
__attribute__((weak)) int modwerk_machine_journal_committed(const struct runtime_journal_view *row,int reverse)
{ (void)row;(void)reverse;return 0; }
__attribute__((weak)) int modwerk_machine_journal_roots_clear(const struct runtime_journal_view *row) { (void)row;return 0; }
__attribute__((weak)) int modwerk_machine_journal_accept(const struct runtime_journal_view *rows,unsigned n)
{ (void)rows;(void)n;return 0; }
__attribute__((weak)) void modwerk_machine_journal_idle(uint32_t generation) { (void)generation; }
__attribute__((weak)) int modwerk_machine_journal_association(uint32_t module,const uint8_t digest[MU_DIGEST_BYTES],const uint32_t *participants,unsigned count)
{ (void)module;(void)digest;(void)participants;(void)count;return 0; }
__attribute__((weak)) int modwerk_machine_journal_trial(int running) { (void)running;return 0; }
#endif
__attribute__((weak)) void modwerk_machine_site_restored(uint32_t a, uint32_t n, const uint8_t *patched, const uint8_t *stock)
{ (void)a; (void)n; (void)patched; (void)stock; }
int modwerk_runtime_volatile_busy(void) { return journal.progress.phase != RJ_IDLE; }


/* Masked, right after a switch rewrote the rows: base code that keeps state derived from a table drops what
 * named a module that left (the Octatrack's machine registry). */
#ifndef MODWERK_RUNTIME_TABLES_EXTERNAL
__attribute__((weak)) void modwerk_machine_tables_changed(void) {}
#endif

#ifndef MODWERK_RUNTIME_REFERENCE_EXTERNAL
__attribute__((weak)) uint32_t modwerk_machine_reference(uint32_t value) { return value; }
#endif

#ifndef MODWERK_RUNTIME_METADATA_EXTERNAL
__attribute__((weak)) int modwerk_machine_metadata_admit(const struct runtime_dsp *from, struct runtime_dsp *to,
    const struct runtime_context *context,enum runtime_metadata_operation operation)
{ (void)context;(void)operation;to->foreign_roots=0;return (from->flags | to->flags) & RUNTIME_GROUP_METADATA ? RUNTIME_MALFORMED : RUNTIME_OK; }
#endif

const struct runtime_module *modwerk_runtime_module(unsigned i) { return i < RUNTIME_MODULES ? live[i] : 0; }
unsigned modwerk_runtime_active(void)
{
    unsigned n = 0;
    for (unsigned i = 0; i < RUNTIME_MODULES; ++i) n += live[i] != 0;
    return n;
}
enum runtime_refusal modwerk_runtime_refusal(void) { return refusal; }
uint32_t modwerk_runtime_value(void) { return modwerk_runtime_api.value; }
uint32_t modwerk_runtime_calls(void) { return modwerk_runtime_ticks; }

static uint32_t be16(const volatile uint8_t *p) { return (uint32_t)p[0] << 8 | p[1]; }
static uint32_t be32(const volatile uint8_t *p) { return be16(p) << 16 | be16(p + 2); }
static void put32(uint8_t *p, uint32_t v) { p[0] = (uint8_t)(v >> 24); p[1] = (uint8_t)(v >> 16); p[2] = (uint8_t)(v >> 8); p[3] = (uint8_t)v; }
/* Vendor capability record, independent of identity/canSubmit. A host must
 * check the package ABI/features/counts before staging a transaction. */
unsigned modwerk_runtime_capabilities(uint8_t *out)
{
    out[0] = 'M'; out[1] = 'W'; out[2] = 'C'; out[3] = 'P';
    out[4] = 1; out[5] = RUNTIME_ABI;
    unsigned flags = RUNTIME_CAPABILITY_FLAGS | (RUNTIME_SITE_EVENTS ? 128u : 0u) | SET_CAPABILITY;
    out[6] = (uint8_t)(flags >> 8); out[7] = (uint8_t)flags;
    out[8] = (uint8_t)(RUNTIME_SITES >> 8); out[9] = (uint8_t)RUNTIME_SITES;
    out[10] = (uint8_t)(RUNTIME_COPIES >> 8); out[11] = (uint8_t)RUNTIME_COPIES;
    return 12u;
}
static int refuse(enum runtime_refusal why) { refusal = why; return 0; }
/* ABI 9: the base features a package may require (loader.h). None unless the machine says so. */
#ifndef MODWERK_RUNTIME_FEATURES_EXTERNAL
__attribute__((weak)) unsigned modwerk_machine_dsp_features(void) { return 0; }
/* A machine with no DSP ledger cannot tell what a claim would meet: it refuses every claim. */
__attribute__((weak)) int modwerk_machine_dsp_claims_admit(unsigned requires, const struct runtime_dsp_claim *claims, unsigned n)
{ (void)requires; (void)claims; return n ? RUNTIME_CONFLICT : RUNTIME_OK; }
/* ABI 10: a machine without hook sites admits no engine. */
__attribute__((weak)) int modwerk_machine_dsp_engine_admit(const struct runtime_dsp *d) { (void)d; return RUNTIME_CONFLICT; }
#endif
/* Two claims meet: the same core (an ABI 10 claim on both cores meets either) and space, or both in the window both
 * cores see (any space: the window is one memory on the Octatrack, whatever the bus), with a word in common. */
static int claims_meet(const struct runtime_dsp_claim *a, const struct runtime_dsp_claim *b)
{
    int shared = a->address >= 0x30000u && b->address >= 0x30000u;
    int core = a->core == b->core || a->core == RUNTIME_CLAIM_BOTH_CORES || b->core == RUNTIME_CLAIM_BOTH_CORES;
    return (shared || (core && a->space == b->space)) &&
           a->address < b->address + b->words && b->address < a->address + a->words;
}
/* Does a claim of another live module (or a journal's pending one) meet one of these, either of the two writing? */
static int claims_taken(unsigned position, const struct runtime_dsp_claim *c, unsigned n)
{
    for (unsigned k = 0; n && k < RUNTIME_MODULES + RUNTIME_JOURNAL_ROWS; ++k) {
        const struct runtime_module *m = k < RUNTIME_MODULES ? (k != position ? live[k] : 0) :
            k - RUNTIME_MODULES < journal.progress.records && journal.row[k - RUNTIME_MODULES].position != position ?
            journal.row[k - RUNTIME_MODULES].after : 0;
        for (unsigned i = 0; m && i < m->dsp.claim_count; ++i)
            for (unsigned j = 0; j < n; ++j)
                if (((m->dsp.claims[i].access | c[j].access) & RUNTIME_CLAIM_WRITE) && claims_meet(&m->dsp.claims[i], &c[j])) return 1;
    }
    return 0;
}

/* Events at stock sites the base owns (loader.h): no package patches or copies those bytes; a module
 * subscribes, and each event's row lists its handlers by (order, module id). Rows change masked, with
 * the switch's sites, only while no paused task is inside the base's dispatch. */
static unsigned refused_event;
unsigned modwerk_runtime_refused_event(void) { return refused_event; }
#if RUNTIME_SITE_EVENTS
static const uint32_t event_span[RUNTIME_SITE_EVENTS][2] = RUNTIME_SITE_EVENT_SPANS;
/* A table (no site) holds contributed records, not handlers; its sites, which the base's reader patches, are owned
 * spans. Each event or table holds at most its room of subscribers; rows share one store. */
static const uint32_t event_room[RUNTIME_SITE_EVENTS] = RUNTIME_SITE_EVENT_ROOM;
static const uint8_t event_table[RUNTIME_SITE_EVENTS] = RUNTIME_SITE_EVENT_TABLES;
#if RUNTIME_OWNED_SITES
static const uint32_t owned_span[RUNTIME_OWNED_SITES][3] = RUNTIME_OWNED_SPANS;
#endif
static uintptr_t volatile event_words[RUNTIME_SITE_EVENT_WORDS];
uintptr_t volatile *const modwerk_runtime_event_row[RUNTIME_SITE_EVENTS] = RUNTIME_SITE_EVENT_ROWS(event_words);
static uintptr_t staged_words[RUNTIME_SITE_EVENT_WORDS];
static uintptr_t *const staged_row[RUNTIME_SITE_EVENTS] = RUNTIME_SITE_EVENT_ROWS(staged_words);
static const struct runtime_module *by_order[RUNTIME_MODULES];
static int evented(uint32_t address, uint32_t n)
{
    for (unsigned e = 0; e < RUNTIME_SITE_EVENTS; ++e)
        if (address < event_span[e][0] + event_span[e][1] && event_span[e][0] < address + n) { refused_event = RUNTIME_EVENTS + e; return 1; }
#if RUNTIME_OWNED_SITES
    for (unsigned k = 0; k < RUNTIME_OWNED_SITES; ++k)
        if (address < owned_span[k][0] + owned_span[k][1] && owned_span[k][0] < address + n) { refused_event = RUNTIME_EVENTS + owned_span[k][2]; return 1; }
#endif
    return 0;
}
/* Would `hook` past each event's room once `position` holds the candidate? Other positions' live modules and the
 * journal's pending ones count, as claimed() counts their sites. */
static int roomless(unsigned position, const uint32_t *hook)
{
    for (unsigned e = RUNTIME_EVENTS; e < RUNTIME_HOOKS; ++e) {
        if (hook[e] == RUNTIME_NONE) continue;
        uint32_t n = 1;
        for (unsigned k = 0; k < RUNTIME_MODULES; ++k) n += k != position && live[k] && live[k]->hook[e];
        for (unsigned k = 0; k < journal.progress.records; ++k)
            n += journal.row[k].position != position && journal.row[k].after && journal.row[k].after->hook[e];
#ifdef MODWERK_RUNTIME_SETS
        for (unsigned k=0;k<change_set.count;++k) {
            const struct journal_row *r=&change_set.row[k];
            n += r->position!=position && r->after && r->after->hook[e] && (!live[r->position] || !live[r->position]->hook[e]);
        }
#endif
        if (n > event_room[e - RUNTIME_EVENTS]) { refused_event = e; return 1; }
    }
    return 0;
}
static uint8_t contributes(const uint32_t *hook)
{
    for (unsigned e = RUNTIME_EVENTS; e < RUNTIME_HOOKS; ++e) if (hook[e] != RUNTIME_NONE && event_table[e - RUNTIME_EVENTS]) return 1;
    return 0;
}
static int subscribes(const struct runtime_module *m)
{
    for (unsigned e = RUNTIME_EVENTS; m && e < RUNTIME_HOOKS; ++e) if (m->hook[e]) return 1;
    return 0;
}
/* A raised event (no site, span 0): the base's entry, which a package's hook word with order RUNTIME_RAISE asks the
 * loader to write into a zero word of its image. The hook index is the stable ABI: nothing is bound to a base build. */
#ifndef RUNTIME_SITE_EVENT_RAISES
#define RUNTIME_SITE_EVENT_RAISES { 0 }
#endif
static const uintptr_t raise_entry[RUNTIME_SITE_EVENTS] = RUNTIME_SITE_EVENT_RAISES;
static uintptr_t raise_of(uint32_t hook) { return hook >= RUNTIME_EVENTS && hook < RUNTIME_HOOKS && !event_span[hook - RUNTIME_EVENTS][1] ? raise_entry[hook - RUNTIME_EVENTS] : 0; }
static int in_dispatch(uint32_t v)
{
    v = modwerk_machine_reference(v);
    return v >= modwerk_machine_reference((uint32_t)(uintptr_t)modwerk_events_code) &&
           v < modwerk_machine_reference((uint32_t)(uintptr_t)modwerk_events_code_end);
}
#else
static int evented(uint32_t address, uint32_t n) { (void)address; (void)n; return 0; }
static int roomless(unsigned position, const uint32_t *hook) { (void)position; (void)hook; return 0; }
static uint8_t contributes(const uint32_t *hook) { (void)hook; return 0; }
static int subscribes(const struct runtime_module *m) { (void)m; return 0; }
static int in_dispatch(uint32_t v) { (void)v; return 0; }
static uintptr_t raise_of(uint32_t hook) { (void)hook; return 0; }
#endif

#ifdef MODWERK_CACHED_MODULES
/* build_core.py --cached-modules (prototype, README.md "Cached modules"): the ledger and the modules use the pool's
 * own, cached alias and never the uncached one, so neither alias can hold a stale copy of the other. Extents are
 * whole 16-byte lines, so no cache line is shared by two. What the data cache holds must still reach memory before
 * the instruction cache fetches it: prepare pushes the extent it wrote, then invalidates the instruction caches. */
static uint8_t *first(void) { return pool; }
#define CACHED_MODULES 1
#else
/* The ledger. Extents are whole 16-byte lines, written and read only through
 * the uncached alias, so no cache line outlives the memory it came from. */
static uint8_t *first(void) { return modwerk_machine_uncached(pool); }
#define CACHED_MODULES 0
#endif
static uint8_t *end_of(const struct runtime_module *m) { return (uint8_t *)(uintptr_t)m + m->size; }
/* Free bytes from `from` to the next owned extent or the end of the pool. */
static uint32_t run(const uint8_t *from)
{
    const uint8_t *to = first() + RUNTIME_POOL_BYTES;
    for (unsigned j = 0; j < owners; ++j)
        if ((const uint8_t *)owned[j] >= from && (const uint8_t *)owned[j] < to) to = (const uint8_t *)owned[j];
    return (uint32_t)(to - from);
}
/* The lowest free run that holds n bytes: every run starts at the pool or at an extent's end. */
static struct runtime_module *take(uint32_t n)
{
    uint8_t *best = 0;
    for (unsigned i = 0; owners < OWNERS && i <= owners; ++i) {
        uint8_t *from = i < owners ? end_of(owned[i]) : first();
        if ((!best || from < best) && run(from) >= n) best = from;
    }
    return (struct runtime_module *)(void *)best;
}
uint32_t modwerk_runtime_free(uint32_t *largest)
{
    uint32_t used = 0, big = run(first());
    for (unsigned i = 0; i < owners; ++i) {
        used += owned[i]->size;
        if (run(end_of(owned[i])) > big) big = run(end_of(owned[i]));
    }
    if (largest) *largest = big;
    return RUNTIME_POOL_BYTES - used;
}
static void forget(const struct runtime_module *m)
{
    for (unsigned i = 0; i < owners; ++i) if (owned[i] == m) {
        owners_changing();
        --owners; owned[i] = owned[owners]; owner_identity[i] = owner_identity[owners];
        owner_identity[owners] = (struct runtime_owner){0};
        owners_changed(); return;
    }
}
/* Whole words where both digests are word aligned (every struct here holds them so). */
typedef uint32_t __attribute__((__may_alias__)) digest_word;
static int same_digest(const uint8_t *a, const uint8_t *b)
{
    if (!(((uintptr_t)a | (uintptr_t)b) & 3u)) {
        const digest_word *x = (const digest_word *)(const void *)a, *y = (const digest_word *)(const void *)b;
        for (unsigned n = 0; n < MU_DIGEST_BYTES / 4u; ++n) if (x[n] != y[n]) return 0;
        return 1;
    }
    for (unsigned n = 0; n < MU_DIGEST_BYTES; ++n) if (a[n] != b[n]) return 0;
    return 1;
}
static int owner_intact(unsigned i)
{
    const struct runtime_module *m = owned[i]; const struct runtime_owner *o = &owner_identity[i];
    uintptr_t lo = (uintptr_t)first(), at = (uintptr_t)m;
    if (!o->generation || o->generation > owner_generation || at < lo || at - lo > RUNTIME_POOL_BYTES ||
        o->owned_extent != at || o->extent_bytes > RUNTIME_POOL_BYTES - (at-lo) ||
        o->extent_bytes < sizeof *m || o->extent_bytes & 15u ||
        o->image_offset > o->extent_bytes || o->image_bytes > o->extent_bytes - o->image_offset ||
        o->module != m->id || o->extent_bytes != m->size ||
        (uintptr_t)m->dsp.image != at + o->image_offset || o->image_bytes != m->dsp.image_bytes) return 0;
    /* The package digest proves the header; the controller digest is read from the owner record only (the board and
     * the write lease compare that copy), so it costs the lease no uncached reads here. */
    return same_digest(o->package_sha256, m->dsp.package_sha256);
}
int modwerk_runtime_owner_snapshot(const uint8_t *image,struct runtime_owner *out)
{
    if (!image || !out) return 0;
    for (unsigned i = 0; i < owners; ++i) if (owned[i]->dsp.image == image && owner_intact(i)) {
        *out = owner_identity[i]; return 1;
    }
    return 0;
}
static int owner_is(unsigned i, const struct runtime_owner *value)
{
    const struct runtime_owner *o = &owner_identity[i];
    return value->generation == o->generation && value->module == o->module &&
        value->owned_extent == o->owned_extent && value->extent_bytes == o->extent_bytes &&
        value->image_offset == o->image_offset && value->image_bytes == o->image_bytes &&
        same_digest(value->package_sha256, o->package_sha256) && same_digest(value->controller_sha256, o->controller_sha256) &&
        owner_intact(i);
}
/* Generations are unique, so at most one entry is `value`; *hint, where it was last, is tried first. */
int modwerk_runtime_owner_held(const struct runtime_owner *value, unsigned *hint)
{
    if (!value || !value->generation || !hint) return 0;
    if (*hint < owners && owner_is(*hint, value)) return 1;
    for (unsigned i = 0; i < owners; ++i) if (i != *hint && owner_is(i, value)) { *hint = i; return 1; }
    return 0;
}
int modwerk_runtime_owner_valid(const struct runtime_owner *value)
{
    unsigned hint = OWNERS;
    return modwerk_runtime_owner_held(value, &hint);
}
int modwerk_runtime_owner_at(uintptr_t address,struct runtime_owner *out)
{
    for (unsigned i = 0; out && i < owners; ++i) {
        const struct runtime_owner *o = &owner_identity[i];
        uintptr_t image = o->owned_extent + o->image_offset;
        if (address >= image && address - image < o->image_bytes && owner_intact(i)) { *out = *o; return 1; }
    }
    return 0;
}
int modwerk_runtime_owner_canonical(const struct runtime_owner *o,uintptr_t *extent)
{
    uintptr_t lo = (uintptr_t)first();
    if (!extent || modwerk_runtime_owner_valid(o) != 1 || o->owned_extent < lo ||
        o->owned_extent - lo > RUNTIME_POOL_BYTES - o->extent_bytes) return 0;
    *extent = (uintptr_t)pool + (o->owned_extent - lo);
    return 1;
}
static int reachable(const struct runtime_module *m)
{
    for (unsigned i = 0; i < RUNTIME_MODULES; ++i) if (live[i] == m) return 1;
    for (unsigned i=0; i<journal.progress.records; ++i)
        if (journal.row[i].before==m || journal.row[i].after==m) return 1;
#ifdef MODWERK_RUNTIME_SETS
    for (unsigned i=0; i<change_set.count; ++i)
        if (change_set.row[i].before==m || change_set.row[i].after==m) return 1;
#endif
    return m == candidate || m == previous;
}
/* Locked: free every extent that no position, the transaction or a paused
 * task's stack or saved registers can reach. Unknown task state frees nothing. */
static void reclaim(const struct runtime_context *context)
{
    struct runtime_span span[RUNTIME_PAUSED];
    uint32_t lock = modwerk_machine_lock();
    unsigned n = modwerk_machine_paused(span, RUNTIME_PAUSED, context);
    for (unsigned i = owners; n <= RUNTIME_PAUSED && i--;) {
        uint32_t lo = (uint32_t)(uintptr_t)owned[i], hi = lo + owned[i]->size;
#if CACHED_MODULES /* code runs from the cached alias, which is not the canonical one: compare canonical addresses */
        lo = modwerk_machine_reference(lo), hi = lo + owned[i]->size;
#endif
        int reached = reachable(owned[i]);
        for (unsigned k = 0; k < n && !reached; ++k)
            for (const uint8_t *p = span[k].from; p + 4 <= span[k].to && !reached; p += 2) {
                uint32_t v = be32(p);
                if (CACHED_MODULES || (owned[i]->dsp.flags & RUNTIME_GROUP_METADATA) || owned[i]->dsp.foreign_roots) v = modwerk_machine_reference(v);
                reached = v >= lo && v < hi;
            }
        if (!reached) forget(owned[i]);
    }
    modwerk_machine_unlock(lock);
}
/* A word holding an offset into the module becomes an address. */
static int relocate(uint8_t *word, uint32_t end, uint32_t base)
{
    uint32_t v = be32(word);
    if (v >= end) return 0;
    put32(word, v + base);
    return 1;
}

/* Group controllers may write foreign mutable pointers when old code resumes.
 * Retirement therefore waits for every old executable/data reference, not
 * just site interiors. The first eight bytes are nonexecutable metadata. */
static int retiring(const struct runtime_module *m, uint32_t v)
{
    if (!m || (!(m->dsp.flags & RUNTIME_GROUP_METADATA) && !m->dsp.foreign_roots)) return 0;
    uint32_t base = modwerk_machine_reference((uint32_t)(uintptr_t)m->dsp.image);
    v = modwerk_machine_reference(v);
    uint32_t metadata = m->dsp.flags & RUNTIME_GROUP_METADATA ? 8u : 0u;
    return v >= base + metadata && v < base + m->dsp.image_bytes;
}
static int inside(const struct runtime_module *m, uint32_t v)
{
    for (uint32_t i = 0; m && i < m->sites; ++i)
        if (v > m->site[i].address && v < m->site[i].address + m->site[i].length) return 1;
    return 0;
}
/* Locked: could a paused task resume inside a site of a or b? Starting at a
 * site's first byte runs its whole new instruction; anywhere after it would
 * run the middle of one. When a or b subscribes to a site event, could one
 * resume in the base's dispatch, part way through a row? Unknown counts as yes. */
static int in_flight(const struct runtime_module *a, const struct runtime_module *b, const struct runtime_context *context)
{
    uint32_t lo = RUNTIME_NONE, hi = 0;
    int rows = subscribes(a) || subscribes(b);
    for (int k = 0; k < 2; ++k)
        for (uint32_t i = 0; (k ? b : a) && i < (k ? b : a)->sites; ++i) {
            const struct runtime_site *s = &(k ? b : a)->site[i];
            if (s->address < lo) lo = s->address;
            if (s->address + s->length > hi) hi = s->address + s->length;
        }
    if (a && ((a->dsp.flags & RUNTIME_GROUP_METADATA) || a->dsp.foreign_roots)) {
        uint32_t base = (uint32_t)(uintptr_t)a->dsp.image;
        uint32_t metadata = a->dsp.flags & RUNTIME_GROUP_METADATA ? 8u : 0u;
        if (base + metadata < lo) lo = base + metadata;
        if (base + a->dsp.image_bytes > hi) hi = base + a->dsp.image_bytes;
    }
    if (lo >= hi && !rows) return 0;
    struct runtime_span span[RUNTIME_PAUSED];
    unsigned n = modwerk_machine_paused(span, RUNTIME_PAUSED, context);
    if (n > RUNTIME_PAUSED) return 1;
    for (unsigned i = 0; i < n; ++i)
        for (const uint8_t *p = span[i].from; p + 4 <= span[i].to; p += 2) {
            uint32_t v = be32(p);
            if (retiring(a, v) || (v > lo && v < hi && (inside(a, v) || inside(b, v))) || (rows && in_dispatch(v))) return 1;
        }
    return 0;
}
/* Code bytes through the machine's code alias, a word at a time where the alias is aligned: every access there is
 * a bus cycle, and these run masked (byte by byte, Play Modes' 35 sites held frames 229 µs; beta finding 46). The
 * union keeps memory order on either endianness. */
union code_word { uint32_t w; uint8_t b[4]; };
static int code_equal(const volatile uint8_t *now, const uint8_t *want, uint32_t n)
{
    uint32_t j = 0;
    for (; j < n && ((uintptr_t)(now + j) & 3u); ++j) if (now[j] != want[j]) return 0;
    for (; j + 4u <= n; j += 4u) {
        union code_word u = {*(const volatile uint32_t *)(now + j)};
        if (u.b[0] != want[j] || u.b[1] != want[j + 1] || u.b[2] != want[j + 2] || u.b[3] != want[j + 3]) return 0;
    }
    for (; j < n; ++j) if (now[j] != want[j]) return 0;
    return 1;
}
static void code_write(volatile uint8_t *to, const uint8_t *from, uint32_t n)
{
    uint32_t j = 0;
    for (; j < n && ((uintptr_t)(to + j) & 3u); ++j) to[j] = from[j];
    for (; j + 4u <= n; j += 4u) {
        union code_word u;
        u.b[0] = from[j], u.b[1] = from[j + 1], u.b[2] = from[j + 2], u.b[3] = from[j + 3];
        *(volatile uint32_t *)(to + j) = u.w;
    }
    for (; j < n; ++j) to[j] = from[j];
}
static int holds(const struct runtime_module *m, int patched)
{
    for (uint32_t i = 0; m && i < m->sites; ++i) {
        const struct runtime_site *s = &m->site[i];
        if (!code_equal(modwerk_machine_code(s->address), patched ? s->code : s->stock, s->length)) return 0;
    }
    return 1;
}
/* Does `to` find its stock bytes once `from`'s sites are put back (what holds(to, 0) would read after
 * put(from, 0))? Read only, so it runs unmasked under the caller's lock, which keeps it the only code writer. */
static int holds_stock_after(const struct runtime_module *from, const struct runtime_module *to)
{
    for (uint32_t i = 0; to && i < to->sites; ++i) {
        const struct runtime_site *s = &to->site[i];
        const volatile uint8_t *now = modwerk_machine_code(s->address);
        for (uint32_t j = 0; j < s->length; ++j) {
            uint32_t a = s->address + j;
            uint8_t b = now[j];
            for (uint32_t k = 0; from && k < from->sites; ++k)
                if (a >= from->site[k].address && a < from->site[k].address + from->site[k].length)
                    b = from->site[k].stock[a - from->site[k].address];
            if (b != s->stock[j]) return 0;
        }
    }
    return 1;
}
/* The live modules whose stock-code sites still hold their patches (a self-test's configuration check). */
unsigned modwerk_runtime_intact(void)
{
    unsigned n = 0;
    uint32_t lock = modwerk_machine_lock();
    for (unsigned i = 0; i < RUNTIME_MODULES; ++i) { /* masked a module at a time: many modules, short spans */
        uint32_t mask = modwerk_machine_mask();
        n += live[i] && holds(live[i], 1);
        modwerk_machine_unmask(mask);
    }
    modwerk_machine_unlock(lock);
    return n;
}
/* The first live module whose stock-code sites no longer hold its patches: its id, 0 none. */
uint32_t modwerk_runtime_broken(void)
{
    uint32_t id = 0;
    uint32_t lock = modwerk_machine_lock();
    for (unsigned i = 0; !id && i < RUNTIME_MODULES; ++i) {
        uint32_t mask = modwerk_machine_mask();
        if (live[i] && !holds(live[i], 1)) id = live[i]->id;
        modwerk_machine_unmask(mask);
    }
    modwerk_machine_unlock(lock);
    return id;
}
/* What the unit has (a machine's INVENTORY request, so the host can make it match a module set): "MWI" and a
 * count, then per live module in position order 24 bytes: its effect id (0xff without DSP code), 0, its parameter
 * layout and module id (big-endian) and its name (16 bytes), the form of the Octatrack's MISSING entries. Entries
 * `first` on, at most `most`. Read-only, and from an interrupt: positions switch with interrupts masked. */
unsigned modwerk_runtime_list(uint8_t *out, unsigned first, unsigned most)
{
    unsigned n = 0, seen = 0;
    for (unsigned i = 0; i < RUNTIME_MODULES && n < most; ++i) {
        const struct runtime_module *m = live[i];
        if (!m || seen++ < first) continue;
        uint8_t *e = out + 4u + 24u * n++;
        e[0] = m->dsp.count ? m->dsp.id : 0xffu, e[1] = 0, e[2] = (uint8_t)(m->dsp.layout >> 8), e[3] = (uint8_t)m->dsp.layout;
        put32(e + 4, m->id);
        for (unsigned k = 0; k < 16u; ++k) e[8 + k] = (uint8_t)m->dsp.name[k];
    }
    out[0] = 'M', out[1] = 'W', out[2] = 'I', out[3] = (uint8_t)n;
    return 4u + 24u * n;
}
static void put(const struct runtime_module *m, int patched)
{
    for (uint32_t i = 0; m && i < m->sites; ++i) {
        const struct runtime_site *s = &m->site[i];
        volatile uint8_t *to = modwerk_machine_code(s->address);
        modwerk_machine_flush_data(s->address, s->length);
        code_write(to, patched ? s->code : s->stock, s->length);
        if (!patched) modwerk_machine_site_restored(s->address, s->length, s->code, s->stock);
    }
}
static const struct runtime_dsp no_dsp;
static const struct runtime_dsp *dsp_of(const struct runtime_module *m) { return m ? &m->dsp : &no_dsp; }
#if RUNTIME_SITE_EVENTS
/* Locked: each site event's row once `position` holds `to`, by (order, module id). */
static int events_stage(unsigned position, const struct runtime_module *to)
{
    for (unsigned e = RUNTIME_EVENTS; e < RUNTIME_HOOKS; ++e) {
        unsigned n = 0;
        for (unsigned i = 0; i < RUNTIME_MODULES; ++i) {
            const struct runtime_module *m = i == position ? to : live[i];
            if (!m || !m->hook[e]) continue;
            unsigned k = n++;
            for (; k && (m->order[e] < by_order[k - 1]->order[e] || (m->order[e] == by_order[k - 1]->order[e] && m->id < by_order[k - 1]->id)); --k)
                by_order[k] = by_order[k - 1];
            by_order[k] = m;
        }
        if (n > event_room[e - RUNTIME_EVENTS]) return 0; /* admission counted the room: never past a row */
        for (unsigned k = 0; k < n; ++k) staged_row[e - RUNTIME_EVENTS][k] = by_order[k]->hook[e];
        staged_row[e - RUNTIME_EVENTS][n] = 0;
    }
    return 1;
}
/* Masked: a word per handler. */
static void events_commit(void)
{
    for (unsigned e = 0; e < RUNTIME_SITE_EVENTS; ++e) {
        unsigned k = 0;
        do modwerk_runtime_event_row[e][k] = staged_row[e][k]; while (staged_row[e][k++]);
    }
}
#else
static int events_stage(unsigned position, const struct runtime_module *to) { (void)position; (void)to; return 1; }
static void events_commit(void) {}
#endif
/* One position's hooks, sites and DSP effect change together, with no other task running (locked) and the
 * stock-code bytes written masked. On any mismatch its module's sites are put back and nothing changes. */
static int switch_locked(unsigned position, struct runtime_module *to, const struct runtime_context *context,int legacy_dsp)
{
    if (!modwerk_machine_stopped()) return 0;
    const struct runtime_module *from = live[position];
    struct runtime_dsp want = *dsp_of(to); /* the machine keeps the effect id it gave at admission */
    int ok = !in_flight(from, to, context) && !modwerk_machine_metadata_admit(dsp_of(from), &want, context, RUNTIME_METADATA_SWITCH) &&
        want.foreign_roots == dsp_of(to)->foreign_roots &&
        (!legacy_dsp || !modwerk_machine_dsp_admit(dsp_of(from), &want)) && want.id == dsp_of(to)->id;
    int rows = subscribes(from) || subscribes(to);
    if (ok && rows) ok = events_stage(position, to);
    /* Only the writes run masked. The checks before and after them only read code, which the caller's lock keeps
     * this the only writer of: masked as well, a module with many sites held the frame interrupt past 200 µs (Play
     * Modes' 35, 229 µs) and could stop the DSPs (beta finding 46). */
    if (ok) ok = holds(from, 1) && holds_stock_after(from, to);
    if (ok) {
        uint32_t mask = modwerk_machine_mask(); /* the machine's real-time interrupts may run these bytes */
        put(from, 0);
        put(to, 1);
        modwerk_machine_invalidate_code();
        if (rows) events_commit(), modwerk_machine_tables_changed();
        modwerk_machine_unmask(mask);
        ok = holds(to, 1);
        if (!ok) { /* a write that did not land: put back the sites and the rows `from` had */
            mask = modwerk_machine_mask();
            put(to, 0);
            put(from, 1);
            modwerk_machine_invalidate_code();
            if (rows && events_stage(position, from)) events_commit(), modwerk_machine_tables_changed();
            modwerk_machine_unmask(mask);
        }
        if (ok) {
            owners_changing();
            live[position] = to;
            owners_changed();
            /* The journal's adapter already owns all DSP jobs and ACKs. Its
             * CF commit observation must not start a second legacy job. */
            if(legacy_dsp) modwerk_machine_dsp_switch(dsp_of(from), dsp_of(to));
        }
    }
    return ok;
}
static int switch_to(unsigned position,struct runtime_module *to,const struct runtime_context *context)
{
    uint32_t lock=modwerk_machine_lock();
    int ok=switch_locked(position,to,context,1);
    modwerk_machine_unlock(lock);return ok;
}
/* A restore's switch (loader.h modwerk_runtime_restoring): the position goes back to what it held before. */
static uint8_t restoring;
int modwerk_runtime_restoring(void) { return restoring; }
static int restore_to(unsigned position,struct runtime_module *to,const struct runtime_context *context)
{
    restoring=1;int ok=switch_to(position,to,context);restoring=0;return ok;
}
/* The position of the live module `id`, else the first free one. */
static unsigned position_of(uint32_t id)
{
    unsigned free = RUNTIME_MODULES;
    for (unsigned i = 0; i < RUNTIME_MODULES; ++i) {
        if (live[i] && live[i]->id == id) return i;
        unsigned reserved=0;
        for(unsigned k=0;k<journal.progress.records;k++) reserved |= journal.row[k].position==i;
#ifdef MODWERK_RUNTIME_SETS
        for(unsigned k=0;k<change_set.count;k++) reserved |= change_set.row[k].position==i;
#endif
        if (!live[i] && !reserved && free == RUNTIME_MODULES) free = i;
    }
    return free;
}
/* Does a site of another live module share a byte with [address, address + n)? */
static int claimed(unsigned position, uint32_t address, uint32_t n)
{
    for (unsigned k = 0; k < RUNTIME_MODULES; ++k)
        for (uint32_t i = 0; k != position && live[k] && i < live[k]->sites; ++i)
            if (address < live[k]->site[i].address + live[k]->site[i].length && live[k]->site[i].address < address + n) return 1;
    for(unsigned k=0;k<journal.progress.records;k++) {
        const struct runtime_module *m=journal.row[k].after;
        for(uint32_t i=0;m && journal.row[k].position!=position && i<m->sites;i++)
            if(address<m->site[i].address+m->site[i].length && m->site[i].address<address+n) return 1;
    }
#ifdef MODWERK_RUNTIME_SETS
    for(unsigned k=0;k<change_set.count;k++) {
        const struct runtime_module *m=change_set.row[k].after;
        for(uint32_t i=0;m && change_set.row[k].position!=position && i<m->sites;i++)
            if(address<m->site[i].address+m->site[i].length && m->site[i].address<address+n) return 1;
    }
#endif
    return 0;
}

/* ABI 7: the `n` stock bytes at `address`, read from the running code (where the module this one replaces patches
 * them, the bytes that module would put back), and whether the first `checked` stock bytes there (its guard, which
 * may end before or after the n) hash to `digest`. No other live module patches the n. */
static int stock_of(unsigned position, uint32_t address, uint32_t n, uint32_t checked, uint8_t *stock, const uint8_t *digest)
{
    const struct runtime_module *was = live[position];
    uint8_t view[RUNTIME_SITE_BYTES], got[MU_DIGEST_BYTES];
    uint32_t span = n > checked ? n : checked, lock = modwerk_machine_lock(), mask = modwerk_machine_mask();
    const volatile uint8_t *now = modwerk_machine_code(address);
    for (uint32_t j = 0; j < span; ++j) view[j] = now[j];
    modwerk_machine_unmask(mask);
    modwerk_machine_unlock(lock);
    for (uint32_t k = 0; was && k < was->sites; ++k)
        for (uint32_t j = 0, a; j < span; ++j)
            if ((a = address + j) >= was->site[k].address && a < was->site[k].address + was->site[k].length)
                view[j] = was->site[k].stock[a - was->site[k].address];
    mu_sha256(view, checked, got);
    for (uint32_t j = 0; j < n; ++j) stock[j] = view[j];
    for (unsigned j = 0; j < MU_DIGEST_BYTES; ++j) if (got[j] != digest[j]) return 0;
    return 1;
}
/* A site record's bytes: ABI 7 holds a SHA-256 of the stock bytes where earlier ABIs hold the bytes. */
static uint32_t site_bytes(uint32_t abi, uint32_t n, uint32_t r) { return 8u + (abi >= 7u ? MU_DIGEST_BYTES : n) + n + 2u * r; }

static int enter(void *u) { (void)u; if (modwerk_runtime_volatile_busy() || !modwerk_machine_stopped()) return 0; held = 1; return 1; }
static int safe(void *u) { (void)u; return held && modwerk_machine_stopped(); }
static int leave(void *u) { (void)u; if(modwerk_runtime_volatile_busy()) return 0; held = 0; return 1; }
/* Admission and relocation, off-line: nothing live changes, refused or not. */
static int __attribute__((used)) prepare_context(void *u, const uint8_t *data, uint32_t length, const struct runtime_context *context)
{
    (void)u;
    if(modwerk_runtime_volatile_busy() && !journal.preparing) return refuse(RUNTIME_BUSY);
#ifdef MODWERK_RUNTIME_SETS
    if(change_set.count && !change_set.preparing) return refuse(RUNTIME_BUSY);
#endif
    candidate = 0; prepared = 0; refusal = RUNTIME_OK;
    if (length < 28u || data[0] != 'M' || data[1] != 'W' || data[2] != 'R' || data[3] != 'M' || be16(data + 4) < 3u ||
        be16(data + 4) > RUNTIME_ABI || be16(data + 6) & ~(be16(data + 4) >= 8u ? 7u : be16(data + 4) >= 6u ? 3u : 0u)) return refuse(RUNTIME_MALFORMED);
    uint32_t abi = be16(data + 4), header = abi >= 9 ? RUNTIME_HEADER_BYTES : abi == 8 ? 76u : abi == 7 ? 72u : abi == 6 ? 68u : abi == 5 ? 50u : abi == 4 ? 32u : 28u;
    if (length < header) return refuse(RUNTIME_MALFORMED);
    uint32_t image = be32(data + 8), bss = be32(data + 12), count = be32(data + 16), hooks = be32(data + 20),
             sites = be32(data + 24), id = abi > 3 ? be32(data + 28) : 0, end = image + bss, at = header + 4u * hooks,
             copies = abi >= 7 ? be32(data + 68) : 0, fills = abi >= 8 ? be32(data + 72) : 0,
             claims = abi >= 9 ? data[78] : 0, entries = abi >= 9 ? data[79] : 0;
    struct runtime_dsp dsp = no_dsp;
    dsp.flags = (uint8_t)be16(data + 6); dsp.module = id; dsp.image = data + at; dsp.image_bytes = image;
    dsp.present = (uint8_t)!!(image || sites);
    if (abi >= 5) {
        dsp.count = be32(data + 32); dsp.relocation_count = (uint16_t)be16(data + 36); dsp.id = data[38]; dsp.slots = data[39];
        dsp.init = (uint16_t)be16(data + 40); dsp.proc = (uint16_t)be16(data + 42); dsp.cycles = (uint16_t)be16(data + 44);
        dsp.kind = data[46]; dsp.state = data[47]; dsp.buffer = (uint16_t)be16(data + 48); dsp.module = id;
        if (abi >= 6) {
            for (unsigned i = 0; i < 15u; ++i) dsp.name[i] = (char)data[50 + i];
            dsp.layout = (uint16_t)be16(data + 66);
            dsp.pinned = (uint8_t)(be16(data + 6) >> 1 & 1u);
        }
    }
    if (abi >= 9) dsp.requires = (uint16_t)be16(data + 76), dsp.claim_count = (uint8_t)claims;
    /* ABI 10: DSP words with no slot are an engine for the base's hook sites, not an effect. */
    const int engine = abi >= 10u && dsp.count && !dsp.slots;
    if (image > RUNTIME_IMAGE_BYTES || bss > RUNTIME_IMAGE_BYTES - image || hooks > (abi >= 8u ? RUNTIME_HOOKS : RUNTIME_EVENTS) ||
        count > RUNTIME_RELOCATIONS || sites > RUNTIME_SITES || copies > RUNTIME_COPIES || fills > RUNTIME_FILLS ||
        claims > RUNTIME_DSP_CLAIMS || entries > RUNTIME_DSP_HOOK_ENTRIES || length < at + image + 4u * count)
        return refuse(RUNTIME_MALFORMED);
    const uint8_t *from = data + at, *relocation = from + image, *record = relocation + 4u * count, *p = record;
    uint32_t hook[RUNTIME_HOOKS], left = length - (at + image + 4u * count), address[RUNTIME_SITES], size[RUNTIME_SITES], legacy = 0;
    uint8_t order[RUNTIME_HOOKS] = {0};
    /* ABI 8: a site event's hook word holds its order in the top byte, the handler's offset below. */
    for (uint32_t i = 0; i < RUNTIME_HOOKS; ++i) {
        hook[i] = i < hooks ? be32(data + header + 4u * i) : RUNTIME_NONE;
        if (i >= RUNTIME_EVENTS && hook[i] != RUNTIME_NONE) order[i] = (uint8_t)(hook[i] >> 24), hook[i] &= 0xffffffu;
        if (hook[i] != RUNTIME_NONE && (hook[i] >= image || hook[i] & 1u)) return refuse(RUNTIME_MALFORMED);
        /* RUNTIME_RAISE on a raised event: a zero slot of 4 bytes for the base's entry, never a handler. */
        if (hook[i] != RUNTIME_NONE && order[i] == RUNTIME_RAISE && raise_of(i) &&
            (image < 4u || hook[i] > image - 4u || be32(from + hook[i]))) return refuse(RUNTIME_MALFORMED);
        legacy |= i < RUNTIME_EVENTS && hook[i] != RUNTIME_NONE;
    }
    if ((dsp.flags & RUNTIME_GROUP_METADATA) && (dsp.flags != RUNTIME_GROUP_METADATA || dsp.count || bss || legacy || image < 16u || data[at] != 'M' || data[at + 1] != 'W' ||
        data[at + 2] != 'M' || data[at + 3] != 'G' || data[at + 4] != 1u || !data[at + 5] || (data[at + 5] & ~7u) ||
        data[at + 6] || data[at + 7])) return refuse(RUNTIME_MALFORMED);
    /* Sites: whole bounded records, patchable stock code, no overlaps. ABI 7: length u8; how many leading new bytes
     * are the stock bytes (copied once the hash holds: an instruction keeping its opcode); how many stock bytes from
     * the address the hash covers (the module's guard: bytes past it are read and put back as they are, and a guard
     * may reach past the site, over an instruction the module returns to); relocations u8; the SHA-256. */
    for (uint32_t i = 0; i < sites; ++i) {
        if (left < 8u) return refuse(RUNTIME_MALFORMED);
        uint32_t n = abi >= 7u ? p[4] : be16(p + 4), keep = abi >= 7u ? p[5] : 0u, checked = abi >= 7u ? p[6] : n,
                 r = abi >= 7u ? p[7] : be16(p + 6);
        address[i] = be32(p); size[i] = n;
        if (!n || n > RUNTIME_SITE_BYTES || (address[i] | n) & 1u || !checked || checked > RUNTIME_SITE_BYTES || keep > n || keep > checked ||
            r > RUNTIME_SITE_RELOCATIONS || left < site_bytes(abi, n, r) || !modwerk_machine_patchable(address[i], n > checked ? n : checked))
            return refuse(RUNTIME_MALFORMED);
        if (evented(address[i], n > checked ? n : checked)) return refuse(RUNTIME_EVENT);
        for (uint32_t j = 0; j < i; ++j)
            if (address[i] < address[j] + size[j] && address[j] < address[i] + n) return refuse(RUNTIME_MALFORMED);
        left -= site_bytes(abi, n, r); p += site_bytes(abi, n, r);
    }
    /* ABI 7 stock copies: image offset u32, stock address u32, length u16, 0 u16, the bytes' SHA-256. The base reads
     * them from its running stock code (a displaced instruction a module replays) and checks the hash. */
    const uint8_t *copy = p;
    for (uint32_t i = 0; i < copies; ++i, p += 12u + MU_DIGEST_BYTES, left -= 12u + MU_DIGEST_BYTES) {
        if (left < 12u + MU_DIGEST_BYTES) return refuse(RUNTIME_MALFORMED);
        uint32_t offset = be32(p), n = be16(p + 8);
        if (!n || n > RUNTIME_SITE_BYTES || offset > image || n > image - offset || be16(p + 10) ||
            !modwerk_machine_patchable(be32(p + 4), n)) return refuse(RUNTIME_MALFORMED);
        if (evented(be32(p + 4), n)) return refuse(RUNTIME_EVENT);
        if (abi >= 8u) {
            for (uint32_t j = 0; j < n; ++j) if (from[offset + j]) return refuse(RUNTIME_MALFORMED);
            for (uint32_t j = 0; j < i; ++j) {
                const uint8_t *c = copy + j * (12u + MU_DIGEST_BYTES);
                if (offset < be32(c) + be16(c + 8) && be32(c) < offset + n) return refuse(RUNTIME_MALFORMED);
            }
            for (uint32_t j = 0; j < count; ++j) {
                uint32_t r = be32(relocation + 4u * j);
                if (offset < r + 4u && r < offset + n) return refuse(RUNTIME_MALFORMED);
            }
        }
    }
    /* ABI 8 fills: offset u32, length u32, nonzero byte, three zero bytes.
     * Only zero placeholders may be reconstructed, disjoint from copies and
     * relocation words. This represents declared authored initializers; it
     * does not encode a stock span or waive the package's stock-free scan. */
    const uint8_t *fill = p;
    for (uint32_t i = 0; i < fills; ++i, p += 12u, left -= 12u) {
        if (left < 12u) return refuse(RUNTIME_MALFORMED);
        uint32_t offset = be32(p), n = be32(p + 4);
        if (!n || offset > image || n > image - offset || !p[8] || p[9] || p[10] || p[11]) return refuse(RUNTIME_MALFORMED);
        for (uint32_t j = 0; j < n; ++j) if (from[offset + j]) return refuse(RUNTIME_MALFORMED);
        for (uint32_t j = 0; j < i; ++j) {
            const uint8_t *f = fill + j * 12u;
            if (offset < be32(f) + be32(f + 4) && be32(f) < offset + n) return refuse(RUNTIME_MALFORMED);
        }
        for (uint32_t j = 0; j < copies; ++j) {
            const uint8_t *c = copy + j * (12u + MU_DIGEST_BYTES);
            if (offset < be32(c) + be16(c + 8) && be32(c) < offset + n) return refuse(RUNTIME_MALFORMED);
        }
        for (uint32_t j = 0; j < count; ++j) {
            uint32_t r = be32(relocation + 4u * j);
            if (offset < r + 4u && r < offset + n) return refuse(RUNTIME_MALFORMED);
        }
    }
    /* What is not DSP ends here: the controller digest (loader.h) covers the header, its DSP fields zeroed, and this. */
    {
        uint8_t head[RUNTIME_HEADER_BYTES], parts[2u * MU_DIGEST_BYTES];
        for (uint32_t i = 0; i < header; ++i) head[i] = (abi >= 5u && i >= 32u && i < 50u) || (abi >= 9u && i >= 76u) ? 0u : data[i];
        mu_sha256(head, header, parts);
        mu_sha256(data + header, (uint32_t)(p - data) - header, parts + MU_DIGEST_BYTES);
        mu_sha256(parts, sizeof parts, dsp.controller_sha256);
    }
    /* ABI 9 claims: space u8 (1 X, 2 Y), core u8 (0, 1), access u8 (1 read, 2 write, 3 both), 0 u8, address u32,
     * words u32. Whole spans of one core's memory or of the window both cores see (at or past 0x30000), never both, and
     * no two of the package's own meeting. ABI 10, an engine's only: core 2 (both cores) and access 4 (initial words). */
    struct runtime_dsp_claim claim[RUNTIME_DSP_CLAIMS];
    uint32_t init_words = 0;
    for (uint32_t i = 0; i < claims; ++i, p += 12u, left -= 12u) {
        if (left < 12u) return refuse(RUNTIME_MALFORMED);
        claim[i] = (struct runtime_dsp_claim){be32(p + 4), be32(p + 8), p[0], p[1], p[2], 0};
        const struct runtime_dsp_claim *c = &claim[i];
        if (!dsp.count || (c->space != 1u && c->space != 2u) || c->core > (engine ? 2u : 1u) || !(c->access & 3u) ||
            c->access & ~(engine ? 7u : 3u) || p[3] || !c->words ||
            c->address >= 0x40000u || c->words > 0x40000u - c->address || (c->address < 0x30000u && c->address + c->words > 0x30000u))
            return refuse(RUNTIME_MALFORMED);
        for (uint32_t j = 0; j < i; ++j) if (claims_meet(&claim[j], c)) return refuse(RUNTIME_MALFORMED);
        if (c->access & RUNTIME_CLAIM_INIT) {
            if (c->words > RUNTIME_DSP_INIT_WORDS - init_words) return refuse(RUNTIME_MALFORMED);
            init_words += c->words;
        }
    }
    /* ABI 9 hook entries: site u8 (the base's catalogue index), cores u8 (bit 0 core 0, bit 1 core 1), 0 u16, entry u32 (a
     * DSP word). Checked whole, one per site; ABI 9's are refused below. ABI 10, an engine's: the u16 is its exit (loader.h). */
    struct runtime_dsp_entry entry[RUNTIME_DSP_HOOK_ENTRIES];
    for (uint32_t i = 0; i < entries; ++i, p += 8u, left -= 8u) {
        if (left < 8u) return refuse(RUNTIME_MALFORMED);
        entry[i] = (struct runtime_dsp_entry){be32(p + 4), (uint16_t)be16(p + 2), p[0], p[1]};
        if (!p[1] || p[1] > 3u || (abi >= 10u && !engine) || entry[i].entry >= dsp.count ||
            (entry[i].exit && (!engine || entry[i].exit >= dsp.count))) return refuse(RUNTIME_MALFORMED);
        for (uint32_t j = 0; j < i; ++j) if (entry[j].site == p[0]) return refuse(RUNTIME_MALFORMED);
    }
    /* DSP code: 24-bit words; each relocation names a word holding an offset into them, in rising order. An engine's may
     * also name a word holding a fixed P address (index | 0x8000), and its exits are no relocation's. Then, ABI 10, the
     * init claims' words. */
    const uint8_t *words = p, *dsp_relocation = p + 4u * dsp.count, *init = dsp_relocation + 2u * dsp.relocation_count;
    if (dsp.count > RUNTIME_DSP_WORDS || dsp.relocation_count > RUNTIME_DSP_RELOCATIONS ||
        left != 4u * dsp.count + 2u * dsp.relocation_count + 4u * init_words || (!dsp.count && dsp.relocation_count) ||
        (dsp.count && !engine && (dsp.init >= dsp.count || dsp.proc >= dsp.count || !dsp.slots || dsp.slots > 3u)) ||
        (engine && (dsp.init || dsp.proc || dsp.cycles || dsp.kind || dsp.state || dsp.buffer || dsp.id || !entries)))
        return refuse(RUNTIME_MALFORMED);
    for (uint32_t i = 0; i < dsp.count; ++i) if (be32(words + 4u * i) > 0xffffffu) return refuse(RUNTIME_MALFORMED);
    for (uint32_t i = 0; i < init_words; ++i) if (be32(init + 4u * i) > 0xffffffu) return refuse(RUNTIME_MALFORMED);
    for (uint32_t i = 0; i < dsp.relocation_count; ++i) {
        uint32_t r = be16(dsp_relocation + 2u * i), at = engine ? r & 0x7fffu : r;
        if (at >= dsp.count || (!(engine && r & 0x8000u) && be32(words + 4u * at) >= dsp.count) ||
            (i && at <= (be16(dsp_relocation + 2u * i - 2u) & (engine ? 0x7fffu : 0xffffu))))
            return refuse(RUNTIME_MALFORMED);
        for (uint32_t j = 0; j < entries; ++j) if (entry[j].exit && entry[j].exit == at) return refuse(RUNTIME_MALFORMED);
    }
    uint32_t dsp_words_n = dsp.count, dsp_relocations_n = dsp.relocation_count;
    if (engine) {
        dsp.engine_count = dsp.count, dsp.engine_relocation_count = dsp.relocation_count, dsp.count = 0, dsp.relocation_count = 0;
        dsp.entry_count = (uint8_t)entries, dsp.init_count = init_words, dsp.claims = claim, dsp.entries = entry;
    }
    dsp.present = (uint8_t)!!(image || sites || dsp.count || engine);
    mu_sha256(data, length, dsp.package_sha256);
    /* ABI 9: a stock-DSP hook needs a hook slot no ABI 9 base has; a feature this base lacks. */
    if ((entries && !engine) || (dsp.requires & ~modwerk_machine_dsp_features())) return refuse(RUNTIME_CONFLICT);
    /* Admission: a position, bytes no other live module owns, an effect id and what the machine's DSPs take, memory. */
    slot = position_of(id);
    if (slot == RUNTIME_MODULES || roomless(slot, hook)) return refuse(RUNTIME_FULL);
    dsp.contributes = contributes(hook);
    for (unsigned i = 0; i < RUNTIME_HOOKS; ++i) dsp.hook_offset[i] = hook[i];
    for (uint32_t i = 0; i < sites; ++i) if (claimed(slot, address[i], size[i])) return refuse(RUNTIME_CONFLICT);
    if (claims_taken(slot, claim, claims)) return refuse(RUNTIME_CONFLICT); /* another live module's claim */
    uint32_t admission_lock = modwerk_machine_lock();
    int why = engine ? modwerk_machine_dsp_engine_admit(&dsp) : modwerk_machine_dsp_claims_admit(dsp.requires, claim, claims);
    if (!why) why = modwerk_machine_metadata_admit(dsp_of(live[slot]), &dsp, context, RUNTIME_METADATA_PREPARE);
    if (!why) why = modwerk_machine_dsp_admit(dsp_of(live[slot]), &dsp);
    modwerk_machine_unlock(admission_lock);
    if (why) return refuse((enum runtime_refusal)why);
    if (image || sites || dsp.count || engine) {
        if (owner_generation == UINT32_MAX) return refuse(RUNTIME_FULL);
        reclaim(context);
        uint32_t head = ((uint32_t)sizeof(struct runtime_module) + sites * (uint32_t)sizeof(struct runtime_site) + 15u) & ~15u,
                 code = (end + 15u) & ~15u, words_end = (4u * dsp_words_n + 2u * dsp_relocations_n + 3u) & ~3u,
                 entries_at = words_end + (uint32_t)sizeof(struct runtime_dsp_claim) * claims,
                 init_at = entries_at + (uint32_t)sizeof(struct runtime_dsp_entry) * entries,
                 tail = (init_at + 4u * init_words + 15u) & ~15u;
        struct runtime_module *m = take(head + code + tail);
        if (!m) return refuse(RUNTIME_MEMORY);
        struct runtime_site *site = (struct runtime_site *)(void *)(m + 1);
        uint8_t *to = (uint8_t *)m + head;
        uint32_t base = (uint32_t)(uintptr_t)to;
        for (uint32_t i = 0; i < image; ++i) to[i] = from[i];
        for (uint32_t i = 0; i < bss; ++i) to[image + i] = 0;
        /* Each word must point into the module; one listed twice no longer does. ABI 7: rising and apart, and a word
         * may hold any offset (address arithmetic, such as a label less a constant). */
        for (uint32_t i = 0; i < count; ++i) {
            uint32_t r = be32(relocation + 4u * i);
            if (r & 1u || image < 4u || r > image - 4u || (abi >= 7u ? i && r < be32(relocation + 4u * i - 4u) + 4u : !relocate(to + r, end, base)))
                return refuse(RUNTIME_MALFORMED);
            if (abi >= 7u) put32(to + r, be32(to + r) + base);
        }
        for (uint32_t i = 0; i < copies; ++i) {
            const uint8_t *c = copy + i * (12u + MU_DIGEST_BYTES);
            if (!stock_of(slot, be32(c + 4), be16(c + 8), be16(c + 8), to + be32(c), c + 12)) return refuse(RUNTIME_STOCK);
        }
        for (uint32_t i = 0; i < fills; ++i) {
            const uint8_t *f = fill + i * 12u;
            for (uint32_t j = 0; j < be32(f + 4); ++j) to[be32(f) + j] = f[8];
        }
        for (uint32_t i = RUNTIME_EVENTS; i < RUNTIME_HOOKS; ++i)  /* last: nothing above may have written the slot */
            if (hook[i] != RUNTIME_NONE && order[i] == RUNTIME_RAISE && raise_of(i)) {
                if (be32(to + hook[i])) return refuse(RUNTIME_MALFORMED);
                put32(to + hook[i], (uint32_t)raise_of(i)); hook[i] = RUNTIME_NONE; order[i] = 0;
            }
        p = record;
        for (uint32_t i = 0; i < sites; ++i) {
            uint32_t n = size[i], r = abi >= 7u ? p[7] : be16(p + 6), held = abi >= 7u ? MU_DIGEST_BYTES : n, keep = abi >= 7u ? p[5] : 0u;
            site[i].address = address[i]; site[i].length = n;
            for (uint32_t j = 0; j < n; ++j) site[i].code[j] = p[8 + held + j];
            if (abi < 7u) for (uint32_t j = 0; j < n; ++j) site[i].stock[j] = p[8 + j];
            else if (!stock_of(slot, address[i], n, p[6], site[i].stock, p + 8)) return refuse(RUNTIME_STOCK);
            for (uint32_t j = 0; j < keep; ++j) site[i].code[j] = site[i].stock[j];
            for (uint32_t j = 0; j < r; ++j) {
                uint32_t o = be16(p + 8 + held + n + 2u * j);
                if (o & 1u || n < 4u || o > n - 4u || o < keep || !relocate(site[i].code + o, end, base)) return refuse(RUNTIME_MALFORMED);
            }
            p += site_bytes(abi, n, r);
        }
#if CACHED_MODULES /* instruction fetches read memory, not the data cache: the extent's lines reach memory first */
        modwerk_machine_flush_data((uint32_t)(uintptr_t)m, head + code + tail);
#endif
        modwerk_machine_invalidate_code();
        uint32_t *dsp_words = (uint32_t *)(void *)((uint8_t *)m + head + code);
        uint16_t *dsp_relocations = (uint16_t *)(void *)(dsp_words + dsp_words_n);
        for (uint32_t i = 0; i < dsp_words_n; ++i) dsp_words[i] = be32(words + 4u * i);
        for (uint32_t i = 0; i < dsp_relocations_n; ++i) dsp_relocations[i] = (uint16_t)be16(dsp_relocation + 2u * i);
        struct runtime_dsp_claim *kept = (struct runtime_dsp_claim *)(void *)((uint8_t *)dsp_words + words_end);
        for (uint32_t i = 0; i < claims; ++i) kept[i] = claim[i];
        struct runtime_dsp_entry *kept_entries = (struct runtime_dsp_entry *)(void *)((uint8_t *)dsp_words + entries_at);
        for (uint32_t i = 0; i < entries; ++i) kept_entries[i] = entry[i];
        uint32_t *kept_init = (uint32_t *)(void *)((uint8_t *)dsp_words + init_at);
        for (uint32_t i = 0; i < init_words; ++i) kept_init[i] = be32(init + 4u * i);
        if (engine) dsp.engine = dsp_words, dsp.engine_relocations = dsp_relocations, dsp.words = 0, dsp.relocations = 0,
                    dsp.entries = kept_entries, dsp.initial = init_words ? kept_init : 0;
        else dsp.words = dsp_words, dsp.relocations = dsp_relocations;
        dsp.claims = claims ? kept : 0;
        dsp.image = to;
        if (be16(data + 6) & 1u) dsp.page = to, dsp.page_bytes = image; /* a page recipe heads the image; the machine checks it */
        m->id = id; m->size = head + code + tail; m->dsp = dsp;
        for (uint32_t i = 0; i < RUNTIME_HOOKS; ++i) m->hook[i] = hook[i] == RUNTIME_NONE ? 0 : (uintptr_t)to + hook[i], m->order[i] = order[i];
        m->site = site; m->sites = sites;
        /* Only complete, source-checked reconstruction receives a generation.
         * Address reuse cannot recreate an old immutable owner identity. */
        struct runtime_owner identity = {++owner_generation, id, (uintptr_t)m,
            m->size, head, image, {0}, {0}};
        for (unsigned i = 0; i < MU_DIGEST_BYTES; ++i)
            identity.package_sha256[i] = dsp.package_sha256[i], identity.controller_sha256[i] = dsp.controller_sha256[i];
        owners_changing();
        owner_identity[owners] = identity;
        owned[owners++] = candidate = m;
        owners_changed();
    }
    prepared = 1;
    return 1;
}
/* Never dispatched, so nothing can be running it. */
static int discard(void *u) { (void)u; if(modwerk_runtime_volatile_busy()) return 0; if (prepared && candidate) forget(candidate); prepared = 0; candidate = 0; return 1; }
static enum mu_publication __attribute__((used)) publish_context(void *u, const struct runtime_context *context)
{
    (void)u;
    if (modwerk_runtime_volatile_busy() || !prepared) return MU_UNCERTAIN;
    struct runtime_module *was = live[slot];
    if (!switch_to(slot, candidate, context)) { refusal = RUNTIME_BUSY; return MU_UNCHANGED; } /* the controller discards the candidate */
    previous = was; candidate = 0; prepared = 0;
    return MU_APPLIED;
}
/* The trial module is no longer reachable from a position; reclaim frees it once no task holds it. */
static int __attribute__((used)) restore_context(void *u, const struct runtime_context *context)
{ (void)u; if (modwerk_runtime_volatile_busy() || !restore_to(slot, previous, context)) return 0; previous = 0; return 1; }
static int __attribute__((used)) retire_context(void *u, const struct runtime_context *context)
{ (void)u; if(modwerk_runtime_volatile_busy()) return 0; previous = 0; reclaim(context); return 1; }
#ifdef __m68k__
extern int modwerk_backend_prepare(void *, const uint8_t *, uint32_t);
extern enum mu_publication modwerk_backend_publish(void *);
extern int modwerk_backend_restore(void *), modwerk_backend_retire(void *);
RUNTIME_CONTEXT_WRAPPER(modwerk_backend_prepare, prepare_context, RUNTIME_CONTEXT_THREE, 80);
RUNTIME_CONTEXT_WRAPPER(modwerk_backend_publish, publish_context, RUNTIME_CONTEXT_ONE, 72);
RUNTIME_CONTEXT_WRAPPER(modwerk_backend_restore, restore_context, RUNTIME_CONTEXT_ONE, 72);
RUNTIME_CONTEXT_WRAPPER(modwerk_backend_retire, retire_context, RUNTIME_CONTEXT_ONE, 72);
#else
/* Host glue supplies its own synthetic task contexts. */
static int modwerk_backend_prepare(void *u, const uint8_t *data, uint32_t length) { return prepare_context(u, data, length, 0); }
static enum mu_publication modwerk_backend_publish(void *u) { return publish_context(u, 0); }
static int modwerk_backend_restore(void *u) { return restore_context(u, 0); }
static int modwerk_backend_retire(void *u) { return retire_context(u, 0); }
#endif
const struct mu_backend modwerk_runtime_backend = {0, enter, safe, leave, modwerk_backend_prepare, discard, modwerk_backend_publish, modwerk_backend_restore, modwerk_backend_retire};

/* Journal-held pointers are allocation roots independent of the legacy MU
 * candidate. Every asynchronous use validates the immutable generation first. */
static int journal_view(const struct journal_row *r,struct runtime_journal_view *out)
{
    struct runtime_journal_view v={0};v.module=r->module;v.position=r->position;
    if(r->position>=RUNTIME_MODULES) return 0;
    if(r->before && (!modwerk_runtime_owner_snapshot(r->before->dsp.image,&v.before) || v.before.generation!=r->before_generation)) return 0;
    if(r->after && (!modwerk_runtime_owner_snapshot(r->after->dsp.image,&v.after) || v.after.generation!=r->after_generation)) return 0;
    for(unsigned k=0;k<MU_DIGEST_BYTES;++k) v.package_sha256[k]=r->package_sha256[k];
    v.from=dsp_of(r->before);v.to=dsp_of(r->after);*out=v;return 1;
}
int modwerk_runtime_journal_digest(uint8_t out[MU_DIGEST_BYTES])
{
    uint32_t ids[RUNTIME_JOURNAL_ROWS];uint8_t sha[MU_DIGEST_BYTES*RUNTIME_JOURNAL_ROWS];unsigned n=0;
    if(!out) return 0;
    for(unsigned i=0;i<RUNTIME_MODULES;++i) if(live[i]) {
        struct runtime_owner o;
        if(n==RUNTIME_JOURNAL_ROWS || !modwerk_runtime_owner_snapshot(live[i]->dsp.image,&o) ||
           !o.module) return 0;
        /* Match the existing intact-site check: the stable lock prevents task
         * mutation, and only this module's short site spans mask frames. */
        uint32_t mask=modwerk_machine_mask();int intact=holds(live[i],1);
        modwerk_machine_unmask(mask);if(!intact) return 0;
        ids[n]=o.module;
        for(unsigned k=0;k<MU_DIGEST_BYTES;++k) sha[MU_DIGEST_BYTES*n+k]=o.package_sha256[k];
        ++n;
    }
    return runtime_journal_set_digest(ids,sha,n,out);
}
void modwerk_runtime_journal_snapshot(struct runtime_journal_progress *out)
{ if(out) { uint32_t lock=modwerk_machine_lock();*out=journal.progress;modwerk_machine_unlock(lock); } }
enum runtime_journal_result modwerk_runtime_journal_begin(void)
{
    uint32_t lock=modwerk_machine_lock();
    int ok=!modwerk_runtime_volatile_busy() && !modwerk_runtime_set_busy() && !held && !prepared && !candidate && !previous &&
        journal.progress.generation!=UINT32_MAX && modwerk_machine_stopped() && modwerk_machine_journal_enabled()==1 &&
        modwerk_machine_journal_begin_safe()==1;
    if(ok) {
        uint32_t generation=journal.progress.generation+1u;
        journal=(struct runtime_journal){0};journal.progress.generation=generation;
        journal.progress.phase=RJ_RECEIVING;held=1;
    }
    modwerk_machine_unlock(lock);return ok?RJ_OK:RJ_REFUSED;
}
enum runtime_journal_result modwerk_runtime_journal_prepare(const uint8_t *data,uint32_t bytes,const struct runtime_context *context)
{
    if(journal.progress.phase!=RJ_RECEIVING || journal.progress.records==RUNTIME_JOURNAL_ROWS || !data || bytes<32u) return RJ_REFUSED;
    uint32_t module=be32(data+28);
    for(unsigned i=0;i<journal.progress.records;i++) if(journal.row[i].module==module) return RJ_REFUSED;
    journal.preparing=1;int ok=prepare_context(0,data,bytes,context);journal.preparing=0;
    if(!ok) return RJ_REFUSED;
    struct journal_row row={live[slot],candidate,0,0,module,(uint16_t)slot,0,0,0,{0}};
    if(candidate) for(unsigned k=0;k<MU_DIGEST_BYTES;++k) row.package_sha256[k]=candidate->dsp.package_sha256[k];
    else mu_sha256(data,bytes,row.package_sha256);
    struct runtime_owner owner={0};
    uint32_t lock=modwerk_machine_lock();
    if(row.before) { ok=modwerk_runtime_owner_snapshot(row.before->dsp.image,&owner);row.before_generation=owner.generation; }
    if(ok && row.after) { ok=modwerk_runtime_owner_snapshot(row.after->dsp.image,&owner);row.after_generation=owner.generation; }
    if(ok) { journal.row[journal.progress.records++]=row;candidate=0;prepared=0; }
    else journal.progress.phase=RJ_QUARANTINE; /* candidate remains a root */
    modwerk_machine_unlock(lock);return ok?RJ_OK:RJ_UNCERTAIN;
}
enum runtime_journal_result modwerk_runtime_journal_verify(void)
{
    if(journal.progress.phase!=RJ_RECEIVING || !journal.progress.records) return RJ_REFUSED;
    struct runtime_journal_view rows[RUNTIME_JOURNAL_ROWS];
    uint32_t lock=modwerk_machine_lock();int ok=1;
    for(unsigned i=0;i<journal.progress.records && ok;i++) ok=journal_view(&journal.row[i],&rows[i]);
    if(ok) ok=modwerk_machine_journal_admit(rows,journal.progress.records)==1;
    if(ok) journal.progress.phase=RJ_VERIFIED;
    modwerk_machine_unlock(lock);return ok?RJ_OK:RJ_REFUSED;
}
enum runtime_journal_result modwerk_runtime_journal_activate(void)
{
    if(journal.progress.phase!=RJ_VERIFIED) return RJ_REFUSED;
    journal.progress.phase=RJ_PUBLISHING;return RJ_PENDING;
}
enum runtime_journal_result modwerk_runtime_journal_abort(void)
{
    if(!modwerk_runtime_volatile_busy()) return RJ_STALE;
    journal.progress.phase=RJ_ROLLBACK;return RJ_PENDING;
}
/* Locked: the journal ends; its generation stays consumed and the board drops its holds. */
static void journal_end(void)
{
    uint32_t generation=journal.progress.generation;
    journal=(struct runtime_journal){0};journal.progress.generation=generation;
    candidate=previous=0;prepared=held=0;
    modwerk_machine_journal_idle(generation);
}
/* Keep (journal.h): only fresh installs retire nothing, so no PC/stack/Part/UI
 * roots proof is needed. Replace/removal waits for one: refused, unchanged. */
enum runtime_journal_result modwerk_runtime_journal_accept(void)
{
    struct runtime_journal_view rows[RUNTIME_JOURNAL_ROWS];
    uint32_t lock=modwerk_machine_lock();unsigned n=journal.progress.records,i=0;
    const struct journal_row *r=journal.row; /* each published, live, and no predecessor */
    if(journal.progress.phase==RJ_TRIAL && !candidate && !prepared)
        while(i<n && !r[i].before && r[i].after && r[i].published && live[r[i].position]==r[i].after && journal_view(&r[i],&rows[i])) ++i;
    int s=n && i==n?modwerk_machine_journal_accept(rows,n):0;
    if(s==1) journal_end();
    else if(s) journal.progress.phase=RJ_QUARANTINE;
    modwerk_machine_unlock(lock);
    return s==1?RJ_OK:s?RJ_UNCERTAIN:RJ_REFUSED;
}
enum runtime_journal_result modwerk_runtime_journal_step(const struct runtime_context *context)
{
    int reverse=journal.progress.phase==RJ_ROLLBACK;
    if(journal.progress.phase!=RJ_PUBLISHING && !reverse) return RJ_REFUSED;
    uint32_t lock=modwerk_machine_lock();
    unsigned at=0,complete=0;
    if(reverse) {
        at=journal.progress.records;
        while(at && !journal.row[at-1].published && !journal.row[at-1].needs_restore) --at;
        complete=!at;if(at) --at;
    } else at=journal.progress.published;
    if((reverse && complete) || (!reverse && at==journal.progress.records)) {
        int ok=!candidate && !prepared;
        if(reverse) for(unsigned i=0;i<journal.progress.records && ok;i++) {
            struct runtime_journal_view v;
            ok=journal_view(&journal.row[i],&v) && live[v.position]==journal.row[i].before && modwerk_machine_journal_roots_clear(&v)==1;
        }
        if(ok && reverse) journal_end();
        else if(ok) journal.progress.phase=RJ_TRIAL;
        modwerk_machine_unlock(lock);
        if(ok && reverse) reclaim(context);
        return ok?RJ_OK:RJ_PENDING;
    }
    struct journal_row *row=&journal.row[at];struct runtime_journal_view view;
    if(!journal_view(row,&view) || live[row->position]!=(row->published?row->after:row->before)) {
        journal.progress.phase=RJ_QUARANTINE;modwerk_machine_unlock(lock);return RJ_UNCERTAIN;
    }
    uint8_t masks[3]={0};
    enum runtime_journal_observation observed=modwerk_machine_journal_transition(&view,reverse,masks);
    int valid=masks[0]<=3 && masks[1]<=3 && masks[2]<=3 && !(masks[2]&~masks[0]) && !(masks[2]&~masks[1]);
    if(!valid || observed<RJ_WAIT || observed>RJ_UNKNOWN) observed=RJ_UNKNOWN;
    if(valid) {
        journal.progress.required=masks[0];journal.progress.confirmed=masks[2];
        journal.progress.touched|=masks[1];row->touched|=masks[1];
    } else journal.progress.required=journal.progress.confirmed=0;
    if(observed!=RJ_REJECTED || masks[1]) row->needs_restore=1;
    if(observed==RJ_UNKNOWN) journal.progress.phase=RJ_QUARANTINE;
    if(observed==RJ_READY && masks[2]!=masks[0]) observed=RJ_UNKNOWN,journal.progress.phase=RJ_QUARANTINE;
    if(observed==RJ_READY) {
        struct runtime_module *to=reverse?row->before:row->after;
        int ok=modwerk_machine_journal_switch_safe(&view,reverse)==1 &&
            ((!reverse || row->published)?switch_locked(row->position,to,context,0):1);
        if(!ok) observed=RJ_WAIT;
        else {
            if(row->published!=(uint8_t)!reverse) {
                row->published=(uint8_t)!reverse;
                if(reverse) --journal.progress.published; else ++journal.progress.published;
            }
            if(modwerk_machine_journal_committed(&view,reverse)!=1) observed=RJ_UNKNOWN,journal.progress.phase=RJ_QUARANTINE;
            else row->needs_restore=(uint8_t)!reverse;
            journal.progress.required=journal.progress.confirmed=0;
        }
    }
    modwerk_machine_unlock(lock);
    return observed==RJ_UNKNOWN?RJ_UNCERTAIN:observed==RJ_REJECTED?RJ_REFUSED:RJ_PENDING;
}

#ifdef MODWERK_RUNTIME_SETS
/* Whole-set transactions use the same production per-module lifecycle as a
 * one-package upload. Publication is stopped and bounded to one row per host
 * command, so DSP/controller work can advance between commands. No earlier
 * row is accepted, persisted, or released while another row is being tried. */
int modwerk_runtime_handle_reserved(uint32_t module, unsigned handle)
{
    for (unsigned i=0; i<change_set.count; ++i) {
        const struct journal_row *r=&change_set.row[i];
        if (r->module!=module && ((r->before && r->before->dsp.count && r->before->dsp.id==handle) ||
            (r->after && r->after->dsp.count && r->after->dsp.id==handle))) return 1;
    }
    return 0;
}
static uint8_t set_identity_cache[40];
static uint32_t set_identity_epoch;
unsigned modwerk_runtime_set_identity(uint8_t *out)
{
    if(!set_identity_cache[5] || set_identity_epoch!=owner_epoch ||
       modwerk_runtime_set_busy() || modwerk_runtime_volatile_busy()) return 0;
    for(unsigned i=0;i<40u;++i) out[i]=set_identity_cache[i];
    return 40u;
}
/* Engine task only. EP0 copies these cached facts and never hashes or scans. */
void modwerk_runtime_set_refresh(void)
{
    if(set_identity_cache[5] && set_identity_epoch==owner_epoch) return;
    uint8_t digest[32];uint32_t lock=modwerk_machine_lock();
    if(!modwerk_runtime_set_busy() && !modwerk_runtime_volatile_busy() && modwerk_runtime_journal_digest(digest)) {
        uint8_t *out=set_identity_cache;unsigned count=modwerk_runtime_active();
        out[5]=0;out[0]='M';out[1]='W';out[2]='S';out[3]='D';out[4]=1;
        out[6]=(uint8_t)(count>>8);out[7]=(uint8_t)count;
        for(unsigned i=0;i<32u;++i) out[8+i]=digest[i];
        set_identity_epoch=owner_epoch;
        __asm__ __volatile__("" ::: "memory");out[5]=1;
    }
    modwerk_machine_unlock(lock);
}
static int set_row_valid(const struct journal_row *r, int published)
{
    struct runtime_journal_view v;
    return journal_view(r,&v) && live[r->position]==(published?r->after:r->before);
}
static void set_end(const struct runtime_context *context)
{
    change_set.count=change_set.published=0;change_set.preparing=change_set.complete=0;
    candidate=previous=0;prepared=0;
    reclaim(context);
}
static int __attribute__((used)) set_prepare_context(void *u,const uint8_t *data,uint32_t bytes,const struct runtime_context *context)
{
    const uint8_t *packages[RUNTIME_SET_CHANGES];uint32_t lengths[RUNTIME_SET_CHANGES];
    if(change_set.count || candidate || prepared || previous || modwerk_runtime_volatile_busy()) return refuse(RUNTIME_BUSY);
    int count=runtime_set_parse(data,bytes,packages,lengths);
    if(!count) return refuse(RUNTIME_MALFORMED);
    uint8_t digest[MU_DIGEST_BYTES];uint32_t lock=modwerk_machine_lock();
    int ok=modwerk_runtime_journal_digest(digest) && same_digest(digest,data+48);
    modwerk_machine_unlock(lock);
    if(!ok) return refuse(RUNTIME_STOCK); /* the reviewed baseline has changed */
    for(int i=0;i<count;++i) {
        change_set.preparing=1;ok=prepare_context(u,packages[i],lengths[i],context);change_set.preparing=0;
        if(!ok) return 0; /* discard owns every already-prepared image */
        struct journal_row r={live[slot],candidate,0,0,be32(packages[i]+28),(uint16_t)slot,0,0,0,{0}};
        struct runtime_owner o;
        lock=modwerk_machine_lock();
        if(r.before) { ok=modwerk_runtime_owner_snapshot(r.before->dsp.image,&o);r.before_generation=o.generation; }
        if(ok && r.after) { ok=modwerk_runtime_owner_snapshot(r.after->dsp.image,&o);r.after_generation=o.generation; }
        if(ok) { change_set.row[change_set.count++]=r;candidate=0;prepared=0; }
        modwerk_machine_unlock(lock);
        if(!ok) return refuse(RUNTIME_BUSY);
    }
    /* Every candidate now has its own position, memory and immutable owner.
     * A set cannot exceed the identity/persistence census, even if each row fits. */
    unsigned target=modwerk_runtime_active();
    for(unsigned i=0;i<change_set.count;++i) target+=!!change_set.row[i].after-!!change_set.row[i].before;
    if(target>RUNTIME_JOURNAL_ROWS) return refuse(RUNTIME_FULL);
    return 1;
}
static int set_discard(void *u)
{
    (void)u;
    if(change_set.published) return 0;
    if(candidate) forget(candidate);
    for(unsigned i=0;i<change_set.count;++i) if(change_set.row[i].after) forget(change_set.row[i].after);
    change_set.count=0;change_set.complete=0;candidate=0;prepared=0;
    return 1;
}
static enum mu_publication __attribute__((used)) set_publish_context(void *u,const struct runtime_context *context)
{
    (void)u;
    if(!change_set.count || change_set.complete) return MU_UNCERTAIN;
    unsigned i=change_set.published;
    if(i>=change_set.count) return MU_UNCERTAIN;
    struct journal_row *r=&change_set.row[i];
    uint32_t lock=modwerk_machine_lock();int valid=set_row_valid(r,0);modwerk_machine_unlock(lock);
    if(!valid) return MU_UNCERTAIN;
    if(!switch_to(r->position,r->after,context)) { refusal=RUNTIME_BUSY;return MU_PUBLISHING_MORE; }
    r->published=1;++change_set.published;
    if(change_set.published<change_set.count) return MU_PUBLISHING_MORE;
    change_set.complete=1;return MU_APPLIED;
}
static int __attribute__((used)) set_restore_context(void *u,const struct runtime_context *context)
{
    (void)u;
    if(change_set.published) {
        struct journal_row *r=&change_set.row[change_set.published-1u];
        uint32_t lock=modwerk_machine_lock();int valid=set_row_valid(r,1);modwerk_machine_unlock(lock);
        if(!valid || !restore_to(r->position,r->before,context)) return 0;
        r->published=0;--change_set.published;
        if(change_set.published) return 0; /* recovery retains every image until the last row is restored */
    }
    set_end(context);return 1;
}
static int __attribute__((used)) set_retire_context(void *u,const struct runtime_context *context)
{
    (void)u;
    if(!change_set.complete || change_set.published!=change_set.count) return 0;
    uint32_t lock=modwerk_machine_lock();int valid=1;
    for(unsigned i=0;i<change_set.count && valid;++i) valid=set_row_valid(&change_set.row[i],1);
    modwerk_machine_unlock(lock);
    if(!valid) return 0;
    set_end(context);return 1;
}
#ifdef __m68k__
extern int modwerk_set_prepare(void *,const uint8_t *,uint32_t);
extern enum mu_publication modwerk_set_publish(void *);
extern int modwerk_set_restore(void *),modwerk_set_retire(void *);
RUNTIME_CONTEXT_WRAPPER(modwerk_set_prepare,set_prepare_context,RUNTIME_CONTEXT_THREE,80);
RUNTIME_CONTEXT_WRAPPER(modwerk_set_publish,set_publish_context,RUNTIME_CONTEXT_ONE,72);
RUNTIME_CONTEXT_WRAPPER(modwerk_set_restore,set_restore_context,RUNTIME_CONTEXT_ONE,72);
RUNTIME_CONTEXT_WRAPPER(modwerk_set_retire,set_retire_context,RUNTIME_CONTEXT_ONE,72);
#else
static int modwerk_set_prepare(void *u,const uint8_t *data,uint32_t n) { return set_prepare_context(u,data,n,0); }
static enum mu_publication modwerk_set_publish(void *u) { return set_publish_context(u,0); }
static int modwerk_set_restore(void *u) { return set_restore_context(u,0); }
static int modwerk_set_retire(void *u) { return set_retire_context(u,0); }
#endif
const struct mu_backend modwerk_runtime_set_backend={0,enter,safe,leave,modwerk_set_prepare,set_discard,
    modwerk_set_publish,modwerk_set_restore,modwerk_set_retire};
#endif
