/* SPDX-License-Identifier: GPL-3.0-or-later
 * Octatrack controller board (controller_board.h). Every entry runs under the
 * stable lock; the providers are also reached from the frame interrupt through
 * the write lease, so they only read. */
#include "controller_board.h"
#include "journal.h"
#include "machine_lifetime.h"
#ifdef MODWERK_RESIDENT_ON_DEMAND
#include "resident_engines.h" /* engines on demand: placed before the first RESET, collected once nobody holds them */
#endif

int modwerk_saved_set_busy(void);
int dl_hook_buffer_ranges_idle(unsigned);
unsigned modwerk_controller_policy_entries(void);

#define MATRIX_MODE 0x80000037u     /* CUE CFG, 2 is MATRIX (output-matrix/matrix.s) */
#define MATRIX_MODE_CS1 0x100b1497u /* its power-cycle mirror */
#define QUIESCE_TICKS 600u          /* a disable for a removal nobody completes: ~10 s of UI ticks */
#define PAGE_BYTES 0x192u           /* a stock effect descriptor (fxpage.c) */
#define PAGE_LOW 0x40000400u        /* stock descriptors live in the OS image's RAM copy */
#define PAGE_HIGH 0x400de1e0u
#ifdef MW_CONTROLLER_BOARD_TEST
uint8_t mw_controller_board_test_read8(uint32_t);
int mw_controller_board_test_ui(uintptr_t lo, uintptr_t hi);
uint8_t *mw_controller_board_test_donor(uint32_t);
const uint8_t *mw_controller_board_test_ab(unsigned core, const uint8_t **end);
#define READ8(a) mw_controller_board_test_read8(a)
#define AB_RECORDS(c, end) mw_controller_board_test_ab(c, end)
#define UI_CLEAR(lo, hi) mw_controller_board_test_ui(lo, hi)
#define DONOR(a) mw_controller_board_test_donor(a)
#else
#define READ8(a) (*(volatile const uint8_t *)(uintptr_t)(a))
#define DONOR(a) ((uint8_t *)(uintptr_t)(a))
/* Analog BD's engine records, as the resident boot uploads them (resident_boot.py). */
extern const uint8_t mw_resident_ab_x_A[], mw_resident_ab_x_A_end[], mw_resident_ab_x_B[], mw_resident_ab_x_B_end[];
static const uint8_t *AB_RECORDS(unsigned c, const uint8_t **end)
{ *end = c ? mw_resident_ab_x_B_end : mw_resident_ab_x_A_end; return c ? mw_resident_ab_x_B : mw_resident_ab_x_A; }
static int board_read(void *context, uint32_t address, void *out, uint32_t length)
{
    (void)context;
    uint32_t physical = address >= 0x48000400u && address < 0x4ff00000u ? address - 0x08000000u : address;
    if (!(physical >= 0x40000400u && physical < 0x47f00000u && length <= 0x47f00000u - physical)) return 0;
    const volatile uint8_t *from = (const volatile uint8_t *)(uintptr_t)address; uint8_t *to = out;
    for (uint32_t i = 0; i < length; i++) to[i] = from[i];
    return 1;
}
static int UI_CLEAR(uintptr_t lo, uintptr_t hi)
{ return hi <= UINT32_MAX && machine_ui_lifetime(board_read, 0, (uint32_t)lo, (uint32_t)hi) == MACHINE_CLEAR; }
#endif

static struct mw_controller_transport transport;
static uint32_t ticks, verified[MW_CONTROLLER_SLOTS]; /* verified: the generation whose ENABLE checked resources */
static struct { uint32_t generation, since; uint8_t quiesce; } want[MW_CONTROLLER_SLOTS];
static uint8_t started, closed, mask[2], mask_known;
/* In-place page extensions: the stock descriptor's bytes before, the SHA-256 of what was written. */
static struct { uint32_t generation, donor; uint8_t slot, applied; uint8_t saved[PAGE_BYTES], digest[32]; } pages[2];
static uint32_t page_refused[MW_CONTROLLER_SLOTS];
static uint8_t staged[PAGE_BYTES];
#define REGISTRY modwerk_controller_registry

static int same(const void *a, const void *b, unsigned n)
{ const uint8_t *x = a, *y = b; while (n--) if (*x++ != *y++) return 0; return 1; }
static int nonzero(const uint8_t *p, unsigned n) { while (n--) if (*p++) return 1; return 0; }
static unsigned cores(unsigned feature) { return feature == 1u || feature == 4u ? 3u : feature == 2u ? 1u : 0u; }
/* stock_hooks reset totals: SC Y $7f0+$210 and the shared tail $202; Matrix Y $c00+$c1 on core A; Analog BD X
 * $2840-$36ff on both cores (resident_dsp.resource_ranges, resident_driver.py). */
#define AB_WORDS 3776u
static unsigned total(unsigned feature, unsigned c)
{ return !(cores(feature) >> c & 1u) ? 0u : feature == 1u ? 1042u : feature == 2u ? 193u : AB_WORDS; }
/* Sidechain's and Matrix's authored initialization is zero; Analog BD's engine is not (its tables). Its reset
 * restores what the resident boot uploaded, from the same authored record: [space, address, count] and then each
 * word, three bytes little-endian, packed as zero and literal runs (resident_boot.pack_zeros). Decoded once per core;
 * a record that is not exactly x:$2840 with AB_WORDS words never resets (the slot cannot become ready). */
static uint32_t ab_init[2][AB_WORDS];
static uint8_t ab_state[2]; /* 0 not decoded, 1 ready, 2 refused */
static int ab_decode(unsigned c)
{
    static const uint8_t head[9] = {1, 0, 0, 0x40, 0x28, 0, (uint8_t)AB_WORDS, (uint8_t)(AB_WORDS >> 8), 0};
    const uint8_t *end, *p = AB_RECORDS(c, &end);
    uint32_t at = 0, need = 9u + 3u * AB_WORDS;
    if (ab_state[c]) return ab_state[c] == 1u;
    ab_state[c] = 2u;
    while (p < end) {
        unsigned token = *p++, n = (token & 127u) + 1u;
        if (n > need - at || (!(token & 128u) && n > (uint32_t)(end - p))) return 0;
        for (unsigned i = 0; i < n; ++i, ++at) {
            unsigned byte = token & 128u ? 0u : *p++;
            if (at < 9u) { if (byte != head[at]) return 0; }
            else ab_init[c][(at - 9u) / 3u] |= (uint32_t)byte << (8u * ((at - 9u) % 3u));
        }
    }
    if (at != need) return 0;
    ab_state[c] = 1u;
    return 1;
}
static int same_identity(const struct mw_controller_identity *a, const struct mw_controller_identity *b)
{
    return same(a->package_sha256, b->package_sha256, 32) && same(a->source_policy_sha256, b->source_policy_sha256, 32) &&
        a->module == b->module && a->feature == b->feature && a->required_cores == b->required_cores &&
        a->policy_revision == b->policy_revision && a->state_revision == b->state_revision &&
        a->parameter_revision == b->parameter_revision;
}
static int held(const struct mw_controller_slot *s) { return s->state != MW_CTL_EMPTY && s->state != MW_CTL_RELEASED; }
static int jobs(const struct mw_controller_slot *s) { return s->job_state[0] || s->job_state[1]; }

/* The compiled rows, whole: one identity and image per package, valid entries. */
static int rows_valid(void)
{
    unsigned n = modwerk_controller_write_policy_count;
    if (n > MW_CONTROLLER_WRITE_POLICY_CAPACITY) return 0;
    for (unsigned i = 0; i < n; ++i) {
        const struct mw_controller_write_policy *p = &modwerk_controller_write_policies[i];
        const struct mw_controller_identity *a = &p->identity;
        if (p->version != 1u || !cores(a->feature) || a->required_cores != cores(a->feature) || !a->module ||
            !nonzero(a->package_sha256, 32) || !nonzero(a->source_policy_sha256, 32) || !a->policy_revision ||
            !a->state_revision || !a->parameter_revision || !p->image_bytes || p->entry >= p->image_bytes ||
            p->begin_return >= p->image_bytes || p->end_return >= p->image_bytes ||
            ((p->entry | p->begin_return | p->end_return) & 1u) || p->begin_return == p->end_return) return 0;
        for (unsigned j = 0; j < i; ++j) {
            const struct mw_controller_write_policy *q = &modwerk_controller_write_policies[j];
            if (same(q->identity.package_sha256, a->package_sha256, 32) &&
                (!same_identity(&q->identity, a) || q->image_bytes != p->image_bytes || q->entry == p->entry)) return 0;
        }
    }
    return 1;
}
static const struct mw_controller_write_policy *row_for(const uint8_t *sha, uint32_t module, uint32_t image_bytes)
{
    for (unsigned i = 0; !closed && sha && i < modwerk_controller_write_policy_count; ++i) {
        const struct mw_controller_write_policy *p = &modwerk_controller_write_policies[i];
        if (p->identity.module == module && p->image_bytes == image_bytes && same(p->identity.package_sha256, sha, 32)) return p;
    }
    return 0;
}
static int binding_of(const struct runtime_owner *o, const struct mw_controller_write_policy *p, struct mw_controller_binding *b)
{
    uintptr_t canonical;
    if (modwerk_runtime_owner_canonical(o, &canonical) != 1) return 0;
    *b = (struct mw_controller_binding){p->identity, o->generation, canonical, o->extent_bytes, o->image_offset, o->image_bytes};
    return 1;
}
static unsigned slot_of(const struct mw_controller_binding *b)
{
    for (unsigned i = 0; i < MW_CONTROLLER_SLOTS; ++i) {
        const struct mw_controller_binding *s = &REGISTRY.slots[i].binding;
        if (REGISTRY.slots[i].state != MW_CTL_EMPTY && same_identity(&s->identity, &b->identity) &&
            s->generation == b->generation && s->canonical_extent == b->canonical_extent && s->extent_bytes == b->extent_bytes &&
            s->image_offset == b->image_offset && s->image_bytes == b->image_bytes) return i;
    }
    return MW_CONTROLLER_SLOTS;
}
/* Published at a position, as this exact owner generation. */
static int live(const struct mw_controller_binding *b)
{
    for (unsigned i = 0; i < RUNTIME_MODULES; ++i) {
        const struct runtime_module *m = modwerk_runtime_module(i);
        struct runtime_owner o; uintptr_t canonical;
        if (m && modwerk_runtime_owner_snapshot(m->dsp.image, &o) == 1 && o.generation == b->generation &&
            o.module == b->identity.module && modwerk_runtime_owner_canonical(&o, &canonical) == 1 &&
            canonical == b->canonical_extent) return 1;
    }
    return 0;
}

/* The alias a module's code runs from: the canonical (cached) one itself in a base built with --cached-modules. */
#ifdef MODWERK_CACHED_MODULES
#define EXEC_ALIAS(canonical) (canonical)
#else
#define EXEC_ALIAS(canonical) modwerk_machine_uncached((void *)canonical)
#endif
/* A trusted image may begin with an MWPP record (stock_hook_controllers.page_record):
 * its page extends a stock effect's own descriptor in place. Staged from the
 * descriptor as it is now, checked against the record's stock SHA-256, into
 * `staged`; `saved` gets the bytes before. An integer entry whose fourth byte is
 * 1 is an inherit: its value is a mask, and the descriptor's own bits under it
 * come back over what the integers before it wrote (the stock enable nibbles of
 * the slots the page keeps). Returns the descriptor's address. */
static uint32_t be16(const uint8_t *p) { return (uint32_t)p[0] << 8 | p[1]; }
static uint32_t be32(const uint8_t *p) { return be16(p) << 16 | be16(p + 2); }
static uint32_t page_stage(const struct mw_controller_binding *b, uint8_t saved[PAGE_BYTES])
{
    uintptr_t exec = (uintptr_t)EXEC_ALIAS(b->canonical_extent) + b->image_offset;
    const uint8_t *r = (const uint8_t *)exec; uint32_t n = b->image_bytes, at = 44u;
    if (n < at || r[0] != 'M' || r[1] != 'W' || r[2] != 'P' || r[3] != 'P' || r[4] != 1u ||
        r[5] > 64u || r[6] > 16u || r[7] > 8u) return 0;
    uint32_t donor = be32(r + 8); uint8_t digest[MU_DIGEST_BYTES];
    if (donor < PAGE_LOW || donor > PAGE_HIGH - PAGE_BYTES || (donor & 1u)) return 0;
    const volatile uint8_t *d = DONOR(donor);
    for (unsigned i = 0; i < PAGE_BYTES; ++i) staged[i] = saved[i] = d[i];
    mu_sha256(staged, PAGE_BYTES, digest);
    if (!same(digest, r + 12, 32)) return 0;
    for (unsigned i = 0; i < r[5]; ++i, at += 8u) {
        uint32_t off = at + 8u <= n ? be16(r + at) : PAGE_BYTES, w = at + 8u <= n ? r[at + 2] : 0, v = at + 8u <= n ? be32(r + at + 4) : 0;
        unsigned inherit = at + 8u <= n ? r[at + 3] : 2u;
        if ((w != 1u && w != 2u && w != 4u) || inherit > 1u || off + w > PAGE_BYTES) return 0;
        for (unsigned k = 0; k < w; ++k) {
            uint8_t byte = (uint8_t)(v >> (8u * (w - 1u - k)));
            staged[off + k] = inherit ? (uint8_t)((staged[off + k] & ~byte) | (saved[off + k] & byte)) : byte;
        }
    }
    for (unsigned i = 0; i < r[6]; ++i) {
        if (at + 4u > n) return 0;
        uint32_t off = be16(r + at), w = r[at + 2], len = r[at + 3], step = 4u + ((len + 3u) & ~3u);
        if (!w || len >= w || off + w > PAGE_BYTES || step > n - at) return 0;
        for (unsigned k = 0; k < w; ++k) staged[off + k] = k < len ? r[at + 4u + k] : 0;
        at += step;
    }
    for (unsigned i = 0; i < r[7]; ++i, at += 8u) {
        if (at + 8u > n) return 0;
        uint32_t off = be16(r + at), o = be32(r + at + 4), v = (uint32_t)(exec + o);
        if (be16(r + at + 2) || off + 4u > PAGE_BYTES || o >= n || (o & 1u)) return 0;
        for (unsigned k = 0; k < 4u; ++k) staged[off + k] = (uint8_t)(v >> (24u - 8u * k));
    }
    return donor;
}
/* Masked only for the byte copy: the descriptor never changes under a reader. */
static void page_write(uint32_t donor, const uint8_t *from)
{
    volatile uint8_t *d = DONOR(donor);
    uint32_t irq = modwerk_machine_mask();
    for (unsigned i = 0; i < PAGE_BYTES; ++i) d[i] = from[i];
    modwerk_machine_unmask(irq);
}
static unsigned page_of(unsigned at, uint32_t generation)
{
    for (unsigned k = 0; k < 2u; ++k) if (pages[k].applied && pages[k].slot == at && pages[k].generation == generation) return k;
    return 2u;
}
static void page_apply(unsigned at)
{
    const struct mw_controller_binding *b = &REGISTRY.slots[at].binding;
    unsigned k = 0;
    if (page_refused[at] == b->generation || page_of(at, b->generation) < 2u) return;
    while (k < 2u && pages[k].applied) ++k;
    uint32_t donor = k < 2u ? page_stage(b, pages[k].saved) : 0;
    for (unsigned j = 0; donor && j < 2u; ++j) if (pages[j].applied && pages[j].donor == donor) donor = 0; /* one extension per page */
    if (!donor) { page_refused[at] = b->generation; return; }
    page_write(donor, staged);
    mu_sha256(staged, PAGE_BYTES, pages[k].digest);
    pages[k].generation = b->generation; pages[k].donor = donor; pages[k].slot = (uint8_t)at; pages[k].applied = 1;
}
/* 1 reverted or none applied; 0 the page is not what was written: unknown, held. */
static int page_revert(unsigned at)
{
    unsigned k = page_of(at, REGISTRY.slots[at].binding.generation);
    if (k == 2u) return 1;
    uint8_t digest[MU_DIGEST_BYTES];
    const volatile uint8_t *d = DONOR(pages[k].donor);
    for (unsigned i = 0; i < PAGE_BYTES; ++i) staged[i] = d[i];
    mu_sha256(staged, PAGE_BYTES, digest);
    if (!same(digest, pages[k].digest, 32)) return 0;
    page_write(pages[k].donor, pages[k].saved);
    pages[k].applied = 0;
    return 1;
}

/* Providers (controller_transport.h). */
static int owns_image(void *u, const struct mw_controller_binding *b)
{
    (void)u;
    const struct mw_controller_write_policy *p = b ? row_for(b->identity.package_sha256, b->identity.module, b->image_bytes) : 0;
    struct runtime_owner o; uintptr_t canonical;
    if (!p || !same_identity(&p->identity, &b->identity) || !b->canonical_extent) return 0;
    uintptr_t exec = (uintptr_t)EXEC_ALIAS(b->canonical_extent) + b->image_offset;
    return modwerk_runtime_owner_at(exec, &o) == 1 && modwerk_runtime_owner_canonical(&o, &canonical) == 1 &&
        canonical == b->canonical_extent && o.generation == b->generation && o.module == b->identity.module &&
        o.extent_bytes == b->extent_bytes && o.image_offset == b->image_offset && o.image_bytes == b->image_bytes &&
        same(o.package_sha256, b->identity.package_sha256, 32);
}
/* While no buffer policy exists (every DSP buffer claim refused), no buffer can
 * reach a held range, so the ENABLE-time check stays true for that generation;
 * otherwise the manager's live and target buffers are checked each time. */
static int resources_idle(void *u, const struct mw_controller_binding *b)
{
    (void)u;
    unsigned at = 0;
    while (at < MW_CONTROLLER_SLOTS && b != &REGISTRY.slots[at].binding) ++at; /* a slot's own binding: no lookup */
    if (at == MW_CONTROLLER_SLOTS || REGISTRY.slots[at].state == MW_CTL_EMPTY) at = slot_of(b);
    if (at < MW_CONTROLLER_SLOTS && verified[at] == b->generation && !modwerk_controller_policy_entries() &&
        (REGISTRY.slots[at].state == MW_CTL_PUBLISHING || REGISTRY.slots[at].state == MW_CTL_ACTIVE)) return 1;
    return dl_hook_buffer_ranges_idle(b->identity.feature) == 1;
}
static int writes_blocked(void *u) { (void)u; return modwerk_saved_set_busy() != 0; }
static int publication_confirmed(void *u, const struct mw_controller_binding *b)
{ (void)u; return live(b) && !modwerk_runtime_broken(); }
/* Nothing can resume or point into the image: unpublished, no journal that
 * could roll back to it, no reviewed UI root, and for Matrix no destination
 * codes left for stock to read as cue levels. */
static int roots_clear(void *u, const struct mw_controller_binding *b)
{
    (void)u;
    if (modwerk_runtime_volatile_busy() || live(b)) return 0;
    if (b->identity.feature == 2u && (READ8(MATRIX_MODE) == 2u || READ8(MATRIX_MODE_CS1) == 2u)) return 0;
    return b->canonical_extent <= UINTPTR_MAX - b->extent_bytes && UI_CLEAR(b->canonical_extent, b->canonical_extent + b->extent_bytes);
}
/* Sidechain's and Matrix's authored initialization is zero (resident_dsp.initialization_records); Analog BD's is
 * its boot record. Either array stays unchanged through the job's release. */
static int reset_source(void *u, const struct mw_controller_binding *b, unsigned c, uint32_t offset, const uint32_t **words, unsigned *count)
{
    static const uint32_t zeros[24];
    (void)u;
    unsigned f = b->identity.feature, n = c < 2u ? total(f, c) : 0u;
    if (!n || offset >= n || !words || !count || (f == 4u && !ab_decode(c))) return 0;
    unsigned k = n - offset > 24u ? 24u : n - offset;
    if (f == 1u && offset < 528u && k > 528u - offset) k = 528u - offset; /* one owned range per chunk */
    *words = f == 4u ? ab_init[c] + offset : zeros; *count = k; return 1;
}
/* Known from the dormant boot upload and every ACKed owned CAS since; any
 * uncertain job on a core makes it unknown for the rest of the boot. */
static int receiver_mask(void *u, const struct mw_controller_binding *b, unsigned c, uint32_t *out)
{
    (void)u; (void)b;
    if (c > 1u || !(mask_known >> c & 1u) || !out) return 0;
    *out = mask[c]; return 1;
}
static const struct mw_controller_transport_policy providers = {
    owns_image, resources_idle, writes_blocked, publication_confirmed, roots_clear, reset_source, receiver_mask};

static void poll(void)
{
    for (unsigned c = 0; c < 2u; ++c) {
        if (!transport.held[c]) continue;
        unsigned op = transport.jobs[c].operation, desired = transport.jobs[c].desired;
        int r = mw_controller_transport_poll(&transport, &REGISTRY.slots[transport.slot[c]].binding, c);
        if (transport.closed[c]) mask_known &= (uint8_t)~(1u << c);
        else if (r == MW_CTL_OK && (op == MW_CTL_ENABLE || op == MW_CTL_DISABLE)) mask[c] = (uint8_t)desired;
    }
}
static void begin(unsigned at, unsigned c, unsigned op)
{
    struct mw_controller_slot *s = &REGISTRY.slots[at];
    if (transport.held[c] || s->job_state[c]) return;
    if (mw_controller_transport_begin(&transport, &s->binding, c, op) == MW_CTL_PENDING && op == MW_CTL_ENABLE)
        verified[at] = s->binding.generation;
}
#ifdef MODWERK_RESIDENT_ON_DEMAND
/* Features of every live trusted controller, bound or not yet. */
static unsigned live_features(void)
{
    unsigned features = 0;
    for (unsigned i = 0; i < RUNTIME_MODULES; ++i) {
        const struct runtime_module *m = modwerk_runtime_module(i);
        struct runtime_owner o; const struct mw_controller_write_policy *p;
        if (m && modwerk_runtime_owner_snapshot(m->dsp.image, &o) == 1 && (p = row_for(o.package_sha256, o.module, o.image_bytes)))
            features |= p->identity.feature;
    }
    return features;
}
#ifdef MODWERK_DEV
/* Development bases: the engines and the controller slots, where the dev MEM request reaches them (resident_engines.h). */
unsigned modwerk_dsp_arena_now(unsigned);
static void view(void)
{
    struct mw_engines_view *v = &mw_engines_view;
    for (unsigned c = 0; c < 2u; ++c) {
        for (unsigned k = 0; k < 3u; ++k)
            v->state[c][k] = mw_engines[c][k].state, v->wait[c][k] = mw_engines_wait[c][k], v->offset[c][k] = mw_engines[c][k].offset;
        v->arena[c] = (uint16_t)modwerk_dsp_arena_now(c), v->reserved[c] = (uint16_t)dl_engine_reserved(c), v->claim_why[c] = dl_engine_why[c];
    }
    for (unsigned k = 0; k < 3u; ++k) v->admitted[k] = mw_engines_admitted[k];
    v->held = (uint8_t)modwerk_controller_held();
    v->evacuation = (uint8_t)dl_engine_evacuation();
    v->evacuations = (uint8_t)((dl_engine_evacuations & 15u) | (dl_engine_evac_failures & 15u) << 4);
    v->jobs = mw_engines_jobs, v->placed = mw_engines_placed_count, v->unplaced = mw_engines_unplaced_count, v->refused = mw_engines_refused;
    for (unsigned i = 0; i < MW_CONTROLLER_SLOTS; ++i) {
        const struct mw_controller_slot *s = &REGISTRY.slots[i];
        v->slots[i].module = s->binding.identity.module, v->slots[i].generation = s->binding.generation;
        v->slots[i].state = s->state, v->slots[i].feature = s->binding.identity.feature;
        v->slots[i].enable_acks = s->enable_acks, v->slots[i].disable_acks = s->disable_acks;
        for (unsigned c = 0; c < 2u; ++c)
            v->slots[i].acknowledged[c] = (uint16_t)s->acknowledged_words[c], v->slots[i].reset[c] = (uint16_t)s->reset_words[c];
    }
}
#endif
#endif
/* A live trusted controller with no slot: reserve and bind its owner generation.
 * At most one other held slot of the feature, a disabled predecessor. */
/* Runs when the runtime's owners changed since the last pass, or a pass left a controller waiting (its predecessor's
 * disable, a refused reservation, an owner mid-change): deriving every installed module's trust binding on every tick
 * cost 170-180 µs with six modules (1 % of the CPU; owner's MKII, 20 October 2026). */
static uint32_t bound_epoch;
static unsigned bind_again = 1;
static void bind_live(void)
{
    uint32_t epoch = modwerk_runtime_owner_epoch();
    if (epoch == bound_epoch && !bind_again) return;
    bound_epoch = epoch; bind_again = 0;
    for (unsigned i = 0; i < RUNTIME_MODULES; ++i) {
        const struct runtime_module *m = modwerk_runtime_module(i);
        struct runtime_owner o; struct mw_controller_binding b;
        const struct mw_controller_write_policy *p;
        if (!m) continue;
        if (modwerk_runtime_owner_snapshot(m->dsp.image, &o) != 1) { bind_again = 1; continue; }
        if (!(p = row_for(o.package_sha256, o.module, o.image_bytes)) || !binding_of(&o, p, &b) || slot_of(&b) < MW_CONTROLLER_SLOTS) continue;
        const struct mw_controller_slot *previous = 0; unsigned others = 0;
        for (unsigned k = 0; k < MW_CONTROLLER_SLOTS; ++k) {
            const struct mw_controller_slot *s = &REGISTRY.slots[k];
            if (held(s) && s->binding.identity.feature == p->identity.feature) { ++others; previous = s; }
        }
        bind_again = 1; /* until it is bound, or gone */
        if (others > 1u || (previous && previous->state != MW_CTL_RETIRING)) continue; /* wait for its disable */
        struct mw_controller_declaration d = {p->identity, {total(p->identity.feature, 0), total(p->identity.feature, 1)}};
        unsigned at;
        if (mw_controller_reserve(&REGISTRY, &d, &d.identity, previous ? &previous->binding : 0, &at) != MW_CTL_OK) continue;
        if (mw_controller_bind(&REGISTRY, at, &b) != MW_CTL_OK) { (void)mw_controller_cancel(&REGISTRY, &REGISTRY.slots[at].binding); continue; }
        want[at].generation = b.generation; want[at].since = ticks; want[at].quiesce = 0; verified[at] = 0;
        bind_again = 0;
    }
}
static void advance(unsigned at)
{
    struct mw_controller_slot *s = &REGISTRY.slots[at];
    const struct mw_controller_binding *b = &s->binding;
    unsigned need = b->identity.required_cores, published = live(b);
    int quiesce = !published || (want[at].generation == b->generation && want[at].quiesce);
    switch (s->state) {
    case MW_CTL_RESERVED:
        (void)mw_controller_cancel(&REGISTRY, b); break;
    case MW_CTL_BOUND: case MW_CTL_INITIALIZING: case MW_CTL_READY:
        if (quiesce) {
            if (s->state == MW_CTL_BOUND && !s->touched) { (void)mw_controller_cancel(&REGISTRY, b); break; }
            if (!jobs(s)) for (unsigned c = 0; c < 2u; ++c) if (need >> c & 1u) { begin(at, c, MW_CTL_DISABLE); break; }
            break;
        }
#ifdef MODWERK_RESIDENT_ON_DEMAND
        /* The engine is written, read back and PLACEd on every required core before any RESET chunk; a
         * generation that finds it placed (a restore, a successor) adopts it without reloading. */
        if (mw_engines_place(b->identity.feature, need, b->generation, transport.held) <= 0) break;
#endif
        for (unsigned c = 0; c < 2u; ++c) if (need >> c & 1u) {
            if (s->state != MW_CTL_READY && s->acknowledged_words[c] < s->reset_words[c]) begin(at, c, MW_CTL_RESET);
            else if (s->state == MW_CTL_READY && !jobs(s)) begin(at, c, MW_CTL_ENABLE);
        }
        break;
    case MW_CTL_PUBLISHING: case MW_CTL_ACTIVE:
        if (quiesce) {
            /* The page leaves before the hooks: no descriptor names the image once it is disabled. */
            if (!page_revert(at)) { (void)mw_controller_cancel(&REGISTRY, b); break; }
            if (!jobs(s)) for (unsigned c = 0; c < 2u; ++c) if (need >> c & 1u) { begin(at, c, MW_CTL_DISABLE); break; }
        } else if (s->state == MW_CTL_ACTIVE) page_apply(at);
        else {
            if (s->enable_acks == need && !jobs(s)) (void)mw_controller_publish(&REGISTRY, b);
            else for (unsigned c = 0; c < 2u; ++c) if ((need >> c & 1u) && !(s->enable_acks >> c & 1u)) begin(at, c, MW_CTL_ENABLE);
        }
        break;
    case MW_CTL_DISABLING:
        for (unsigned c = 0; c < 2u; ++c) if ((need >> c & 1u) && !(s->disable_acks >> c & 1u)) begin(at, c, MW_CTL_DISABLE);
        break;
    case MW_CTL_RETIRING:
        if (!published) { want[at].quiesce = 0; (void)mw_controller_retire(&REGISTRY, b); } /* republished: restore at once */
        else if ((!want[at].quiesce || ticks - want[at].since > QUIESCE_TICKS) && mw_controller_restore(&REGISTRY, b) == MW_CTL_OK) {
            want[at].generation = b->generation; want[at].quiesce = 0; want[at].since = ticks; verified[at] = 0;
        }
        break;
    default: break; /* QUARANTINED holds everything; nothing is retried */
    }
}
void modwerk_controller_tick(void)
{
    uint32_t irq = modwerk_machine_lock();
    ++ticks;
    if (!started) {
        started = 1; mask[0] = mask[1] = 0; mask_known = 3u; /* the resident boot uploads dormant stubs */
        closed = !rows_valid() || !modwerk_controller_write_policy_count ||
            !mw_controller_transport_init(&transport, &REGISTRY, &providers, 0);
    }
    if (!closed) {
        poll();
#ifdef MODWERK_RESIDENT_ON_DEMAND
        mw_engines_poll();
#endif
        bind_live();
        for (unsigned at = 0; at < MW_CONTROLLER_SLOTS; ++at) if (held(&REGISTRY.slots[at])) advance(at);
#ifdef MODWERK_RESIDENT_ON_DEMAND
        mw_engines_collect(modwerk_controller_held(), mask, mask_known, transport.held);
#endif
    }
#if defined(MODWERK_RESIDENT_ON_DEMAND) && defined(MODWERK_DEV)
    view();
#endif
    modwerk_machine_unlock(irq);
}

int modwerk_controller_admit(const struct runtime_dsp *from, const struct runtime_dsp *to,
                             enum runtime_metadata_operation operation)
{
    if (!started || closed) return RUNTIME_OK; /* nothing bound: every package is an ordinary one */
    const struct mw_controller_write_policy *incoming = to && to->present ? row_for(to->package_sha256, to->module, to->image_bytes) : 0;
    const struct mw_controller_write_policy *outgoing = from && from->present ? row_for(from->package_sha256, from->module, from->image_bytes) : 0;
    if (incoming) {
        /* One module per resident engine; a quarantined engine admits nobody. */
        for (unsigned k = 0; k < MW_CONTROLLER_SLOTS; ++k) {
            const struct mw_controller_slot *s = &REGISTRY.slots[k];
            if (held(s) && s->binding.identity.feature == incoming->identity.feature &&
                (s->state == MW_CTL_QUARANTINED || s->binding.identity.module != to->module)) return RUNTIME_CONFLICT;
        }
#ifdef MODWERK_RESIDENT_ON_DEMAND
        /* Its engine must fit at the arena's top beside every held or live controller's: a dry run of the claim.
         * Refused here rather than ever making a Part switch load code; a busy manager lets the tick wait. */
        int fit = mw_engines_admit(incoming->identity.feature, modwerk_controller_held() | live_features());
        if (fit == MW_ENGINE_MEMORY) return RUNTIME_MEMORY;
        if (fit == MW_ENGINE_STUCK_BOOT) return RUNTIME_CONFLICT;
#endif
    }
    if (!outgoing) return RUNTIME_OK;
    struct runtime_owner o; struct mw_controller_binding b;
    if (modwerk_runtime_owner_snapshot(from->image, &o) != 1 || !binding_of(&o, outgoing, &b)) return RUNTIME_CONFLICT;
    unsigned at = slot_of(&b);
    if (outgoing->identity.feature == 2u && (READ8(MATRIX_MODE) == 2u || READ8(MATRIX_MODE_CS1) == 2u))
        return RUNTIME_IN_USE; /* leave MATRIX on the AUDIO page first: the leased conversion */
    if (at == MW_CONTROLLER_SLOTS) return RUNTIME_OK; /* never bound: nothing reached a DSP */
    struct mw_controller_slot *s = &REGISTRY.slots[at];
    if (s->state == MW_CTL_QUARANTINED) return RUNTIME_CONFLICT;
    if (s->state == MW_CTL_RELEASED) return RUNTIME_OK;
    if ((s->state == MW_CTL_RESERVED || s->state == MW_CTL_BOUND) && !s->touched) {
        if (operation == RUNTIME_METADATA_SWITCH) (void)mw_controller_cancel(&REGISTRY, &s->binding);
        return RUNTIME_OK;
    }
    if (s->state == MW_CTL_RETIRING)
        return UI_CLEAR(b.canonical_extent, b.canonical_extent + b.extent_bytes) ? RUNTIME_OK : RUNTIME_IN_USE;
    if (!want[at].quiesce || want[at].generation != b.generation) {
        want[at].generation = b.generation; want[at].quiesce = 1; want[at].since = ticks;
    }
    return operation == RUNTIME_METADATA_PREPARE ? RUNTIME_OK : RUNTIME_BUSY;
}

unsigned modwerk_controller_held(void)
{
    unsigned features = 0;
    for (unsigned k = 0; k < MW_CONTROLLER_SLOTS; ++k)
        if (held(&REGISTRY.slots[k])) features |= REGISTRY.slots[k].binding.identity.feature;
    return features;
}
