/* SPDX-License-Identifier: GPL-3.0-or-later
 * Octatrack controller board (controller_board.h). Every entry runs under the
 * stable lock; the providers are also reached from the frame interrupt through
 * the write lease, so they only read. */
#include "controller_board.h"
#include "journal.h"
#include "machine_lifetime.h"
#include "dsp_ledger.h"       /* the features, their cores, what they imply and their reset words (dsp-sites.json) */
#ifdef MODWERK_RESIDENT_ON_DEMAND
#include "resident_engines.h" /* engines on demand: placed before the first RESET, collected once nobody holds them */
#else
#define MW_ENGINE_PACKAGED_WORDS 0u /* no engines placed: a packaged feature's controller is never admitted */
#endif

int modwerk_saved_set_busy(void);
int dl_hook_buffer_ranges_idle(unsigned);
#ifdef MODWERK_RESIDENT_ON_DEMAND
int modwerk_dsp_keybus_charge(int on);       /* dsp.c (resident_engines.dsp): the tap's per-core price, 1 fits and held */
uint32_t modwerk_dsp_keybus_price(unsigned c); /* ... on core c while it is not charged there, 0 once it is */
int modwerk_dsp_bank_names(unsigned id);     /* dsp.c: a track runs this FX id, or one of the bank's Parts names it */
extern volatile uint8_t modwerk_controller_lease_seen; /* controller_write_lease.c: features a trusted controller asked to write */
#endif
unsigned modwerk_controller_policy_entries(void);

#define MATRIX_MODE 0x80000037u     /* CUE CFG, 2 is MATRIX (output-matrix/matrix.s) */
#define MATRIX_MODE_CS1 0x100b1497u /* its power-cycle mirror */
#define COMPRESSOR 24u              /* stock COMPRESSOR's FX id (machine_registry.c): what Sidechain's engine hooks */
#define QUIESCE_TICKS 600u          /* a disable for a removal nobody completes: ~10 s of UI ticks */
#define PAGE_BYTES 0x192u           /* a stock effect descriptor (fxpage.c) */
#define PAGE_LOW 0x40000400u        /* stock descriptors live in the OS image's RAM copy */
#define PAGE_HIGH 0x400de1e0u
#ifdef MW_CONTROLLER_BOARD_TEST
uint8_t mw_controller_board_test_read8(uint32_t);
int mw_controller_board_test_ui(uintptr_t lo, uintptr_t hi);
uint8_t *mw_controller_board_test_donor(uint32_t);
#define READ8(a) mw_controller_board_test_read8(a)
#define UI_CLEAR(lo, hi) mw_controller_board_test_ui(lo, hi)
#define DONOR(a) mw_controller_board_test_donor(a)
uint32_t mw_controller_board_test_bank(void);
int mw_controller_board_test_handle(uint32_t module);
#define BANK_NOW() mw_controller_board_test_bank()
#define HANDLE(module) mw_controller_board_test_handle(module)
#else
#define READ8(a) (*(volatile const uint8_t *)(uintptr_t)(a))
#define DONOR(a) ((uint8_t *)(uintptr_t)(a))
#define BANK_NOW() (*(volatile const uint32_t *)0x46c82456u) /* the current bank (selection.c), 0 before a project */
int modwerk_dsp_catalogue_handle(uint32_t module); /* dsp.c: the effect id a module holds this session, <0 none */
#define HANDLE(module) modwerk_dsp_catalogue_handle(module)
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
/* Engines load when a track uses them, not when their module is installed (owner, 22 October 2026). Sidechain is used
 * while a track runs stock COMPRESSOR or one of the bank's Parts names it. Analog BD (any packaged feature) is used once
 * its controller asked for the write lease in this bank: its renderer does, every frame, for each track that carries its
 * machine, which only the current Part shows, so the bank keeps it until it changes and a Part switch never waits for
 * a placement. Output Matrix counts as used while installed: with CUE CFG on MATRIX its routing codes are cue levels to
 * stock, so its engine must already run when MATRIX is chosen. A held slot whose feature is unused is parked: never
 * placed, or, once placed, disabled (its page reverted) and left RETIRING, so the engines collect its words; used again,
 * it is restored and placed, reset and enabled as at install. */
static uint8_t parked[MW_CONTROLLER_SLOTS];
#ifdef MODWERK_RESIDENT_ON_DEMAND
/* All its cores or none (beta finding 63): a used engine that cannot be claimed on every core it needs waits whole and
 * wants no core's words meanwhile. On 22 October 2026 Analog BD, placed on core 0 while core 1 had no room, held 998 of
 * core 0's words it could never use, and the self-test could no longer place BBD alone there. */
static uint8_t roomless[MW_CONTROLLER_SLOTS];
static uint8_t seen, used;
static uint32_t seen_bank;
#endif
/* The key bus holder (docs/OCTATRACK_PACKAGE_DSP_HOOKS.md, approved plan (1a)): no package and no trust row. It is
 * wanted while a held slot's feature implies it (Sidechain) or a live package requires it (ABI 9), and then placed (on
 * demand), reset (1,026 words) and enabled on both cores, one owned job per core at a time, before any Sidechain enable;
 * once nothing wants it, disabled, then collected with the engines. Its own generation names its owned jobs. */
#define KEYBUS_GENERATION 0x4b425553u /* "KBUS": never an owner generation's range (they count up from 1) */
enum { KB_IDLE, KB_RESET, KB_ENABLE, KB_DISABLE, KB_STUCK, KB_SCRUB };
static struct { struct dl_owned_job job; uint8_t op; } kb_lane[2];
static uint16_t kb_reset[2];   /* reset words ACKed since this core last disabled it (the receiver's ready bit) */
/* The tap has seeded this core's window (its mark and counter) since it was last scrubbed: once the bus is let go, its
 * first reset chunk (the window's seed, counter and first words; dsp-sites.json lists the window first) is sent again
 * before anything else may use the window, so a reader installed later never takes a stale mark for a live bus. */
static uint8_t kb_dirty[2];
static uint8_t kb_wanted;      /* the last tick's verdict, for held() and the view */
static uint8_t kb_readers;     /* ... and whether a live package requires it (a reader) */
#ifdef MODWERK_RESIDENT_ON_DEMAND
static uint8_t kb_priced;      /* the tap's price is charged on both cores (dsp.c): only for readers */
#endif
static const uint32_t kb_zeros[24];
/* The key bus cannot come up this boot: the board closed, or a core's state lost (its mask unknown, a lane stuck or its
 * owned channel closed: an uncertain job closed it for the boot, the transport's fail-closed rule). Nothing reopens it,
 * which would act on a DSP whose state nobody knows, so a reader is refused (RUNTIME_FEATURE) rather than admitted to
 * pass its audio until a restart; the view's key bus byte shows it (bit 7). Seen once on an MKII, 21 Oct 2026. */
static int __attribute__((unused)) keybus_down(void)
{
    if (closed || mask_known != 3u) return 1;
    for (unsigned c = 0; c < 2u; ++c) if (kb_lane[c].op == KB_STUCK || dl_owned_closed(c)) return 1;
    return 0;
}
/* A live reader whose key bus cannot come up this boot (dsp.c: the self-test fails with it and the self-test record's
 * refusal says RUNTIME_FEATURE while it holds and the loader has none of its own, on production bases too). A reader admitted before its core was lost
 * stays installed and dry until a restart; this is how the unit says so. */
int modwerk_controller_keybus_lost(void) { return kb_readers && keybus_down(); }
/* In-place page extensions: the stock descriptor's bytes before, the SHA-256 of what was written. */
static struct { uint32_t generation, donor; uint8_t slot, applied; uint8_t saved[PAGE_BYTES], digest[32]; } pages[2];
static uint32_t page_refused[MW_CONTROLLER_SLOTS];
static uint8_t staged[PAGE_BYTES];
#define REGISTRY modwerk_controller_registry

static int same(const void *a, const void *b, unsigned n)
{ const uint8_t *x = a, *y = b; while (n--) if (*x++ != *y++) return 0; return 1; }
static int nonzero(const uint8_t *p, unsigned n) { while (n--) if (*p++) return 1; return 0; }
static unsigned cores(unsigned feature) { return MW_DSP_CORES(feature); }
/* stock_hooks reset totals, from the ledger (dsp_sites.py --check keeps them equal to resident_dsp.resource_ranges):
 * SC Y $7f0+$210 and the shared tail $202; Matrix Y $c00+$c1 on core A; Analog BD X $2840-$36ff on both cores; the key
 * bus the shared tail $202 first (its seed and counter lead it), then Y $800+$200. */
#define KEYBUS MW_DSP_KEYBUS /* the key bus: a base feature, held for packages and Sidechain */
#define KEYBUS_WORDS MW_DSP_RESET_WORDS(MW_DSP_KEYBUS)
#define KEYBUS_SPLIT MW_DSP_RESET_SPLIT(MW_DSP_KEYBUS) /* its first owned range: one per reset chunk */
#define KEYBUS_IMPLIED(f) (MW_DSP_IMPLIED((f) & ~KEYBUS) & KEYBUS) /* what a held controller feature holds too */
static unsigned total(unsigned feature, unsigned c) { return cores(feature) >> c & 1u ? MW_DSP_RESET_WORDS(feature) : 0u; }
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
/* Published at a position, as this exact owner generation: that module, or 0. */
static const struct runtime_module *module_of(const struct mw_controller_binding *b)
{
    for (unsigned i = 0; i < RUNTIME_MODULES; ++i) {
        const struct runtime_module *m = modwerk_runtime_module(i);
        struct runtime_owner o; uintptr_t canonical;
        if (m && modwerk_runtime_owner_snapshot(m->dsp.image, &o) == 1 && o.generation == b->generation &&
            o.module == b->identity.module && modwerk_runtime_owner_canonical(&o, &canonical) == 1 &&
            canonical == b->canonical_extent) return m;
    }
    return 0;
}
static int live(const struct mw_controller_binding *b) { return module_of(b) != 0; }

/* A packaged feature's engine (dsp_ledger.h MW_DSP_PACKAGED, ABI 10) is its controller's package's DSP section: the
 * trust row pins the rest (the controller digest), so this is its whole check, at admission. One entry, at the
 * feature's one site, on the feature's cores, entered at word 0 (the receiver's stub enters a packaged engine there),
 * with an exit exactly where the site has one (its package's build checks the long branch before it); its claims
 * exactly the feature's regions on each core, in the ledger's order (its reset's), each written with its initial
 * words; no larger than the engines' buffer. */
static int applies(const struct runtime_dsp_claim *q, unsigned c) { return q->core == c || q->core == RUNTIME_CLAIM_BOTH_CORES; }
static int engine_shape(const struct runtime_dsp *d, unsigned feature)
{
    unsigned sites = 0;
    for (unsigned s = 0; s < MW_DSP_SITES; ++s) sites += mw_dsp_sites[s].feature == feature;
    if (!(MW_DSP_PACKAGED & feature) || sites != 1u || !d->engine_count || d->engine_count > MW_ENGINE_PACKAGED_WORDS ||
        d->entry_count != 1u || !d->entries || (d->claim_count && !d->claims)) return 0;
    const struct runtime_dsp_entry *e = &d->entries[0];
    if (e->site >= MW_DSP_SITES || mw_dsp_sites[e->site].feature != feature || e->cores != cores(feature) || e->entry) return 0;
    for (unsigned c = 0; c < 2u; ++c) {
        if (!(cores(feature) >> c & 1u)) continue;
        if (!mw_dsp_sites[e->site].exit[c] != !e->exit) return 0;
        unsigned at = 0;
        for (unsigned n = 0; n < MW_DSP_REGIONS; ++n) {
            const struct mw_dsp_region *g = &mw_dsp_regions[n];
            if (g->feature != feature || g->core != c) continue;
            while (at < d->claim_count && !applies(&d->claims[at], c)) ++at;
            if (at == d->claim_count) return 0;
            const struct runtime_dsp_claim *q = &d->claims[at++];
            if (q->space != g->space || q->address != g->address || q->words != g->words) return 0;
        }
        while (at < d->claim_count) if (applies(&d->claims[at++], c)) return 0;
    }
    for (unsigned i = 0; i < d->claim_count; ++i) {
        const struct runtime_dsp_claim *q = &d->claims[i];
        if ((q->access & (RUNTIME_CLAIM_INIT | RUNTIME_CLAIM_WRITE)) != (RUNTIME_CLAIM_INIT | RUNTIME_CLAIM_WRITE) ||
            (q->core == RUNTIME_CLAIM_BOTH_CORES ? cores(feature) != 3u : !(cores(feature) >> q->core & 1u))) return 0;
    }
    return 1;
}
/* Its reset on core c from `offset`: the initial words of the claims there, in order, never past one claim. */
static int engine_init(const struct runtime_dsp *d, unsigned c, uint32_t offset, const uint32_t **words, unsigned *count)
{
    uint32_t at = 0, logical = 0;
    for (unsigned i = 0; d->initial && i < d->claim_count; ++i) {
        const struct runtime_dsp_claim *q = &d->claims[i];
        if (!(q->access & RUNTIME_CLAIM_INIT)) continue;
        if (applies(q, c)) {
            if (offset < logical + q->words) {
                uint32_t k = logical + q->words - offset;
                *words = d->initial + at + (offset - logical), *count = k > 24u ? 24u : k;
                return 1;
            }
            logical += q->words;
        }
        at += q->words;
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
        same(o.controller_sha256, b->identity.package_sha256, 32);
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
/* Sidechain's and Matrix's authored initialization is zero (resident_dsp.initialization_records); a packaged feature's
 * is its package's initial words (engine_init), which stay in its pool extent while this generation is held: its slot
 * refuses the module's switch until its jobs are done and its hooks disabled. Either array stays unchanged through the
 * job's release. */
static int reset_source(void *u, const struct mw_controller_binding *b, unsigned c, uint32_t offset, const uint32_t **words, unsigned *count)
{
    static const uint32_t zeros[24];
    (void)u;
    unsigned f = b->identity.feature, n = c < 2u ? total(f, c) : 0u;
    if (!n || offset >= n || !words || !count) return 0;
    if (MW_DSP_PACKAGED & f) {
        const struct runtime_module *m = module_of(b);
        return m && engine_init(&m->dsp, c, offset, words, count) && *count <= n - offset;
    }
    unsigned k = n - offset > 24u ? 24u : n - offset;
    if (f == 1u && offset < 528u && k > 528u - offset) k = 528u - offset; /* one owned range per chunk */
    *words = zeros; *count = k; return 1;
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
    if (transport.held[c] || s->job_state[c] || kb_lane[c].op) return;
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
        if (m && modwerk_runtime_owner_snapshot(m->dsp.image, &o) == 1 && (p = row_for(o.controller_sha256, o.module, o.image_bytes)))
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
        for (unsigned k = 0; k < MW_ENGINE_FEATURES; ++k)
            v->state[c][k] = mw_engines[c][k].state, v->wait[c][k] = mw_engines_wait[c][k], v->offset[c][k] = mw_engines[c][k].offset;
        v->keybus_reset[c] = (uint8_t)(kb_reset[c] / 8u);
        v->arena[c] = (uint16_t)modwerk_dsp_arena_now(c), v->reserved[c] = (uint16_t)dl_engine_reserved(c), v->claim_why[c] = dl_engine_why[c];
    }
    for (unsigned k = 0; k < MW_ENGINE_FEATURES; ++k) v->admitted[k] = mw_engines_admitted[k];
    v->keybus = (uint8_t)(kb_wanted | kb_lane[0].op << 1 | kb_lane[1].op << 4 | (keybus_down() ? 0x80u : 0u));
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
static unsigned slot_features(void)
{
    unsigned features = 0;
    for (unsigned k = 0; k < MW_CONTROLLER_SLOTS; ++k)
        if (held(&REGISTRY.slots[k])) features |= REGISTRY.slots[k].binding.identity.feature;
    return features;
}
#ifdef MODWERK_RESIDENT_ON_DEMAND
/* Once a tick: what is used (above). A new bank starts from nothing. */
static void use_tick(void)
{
    uint32_t bank = BANK_NOW();
    if (bank != seen_bank) seen_bank = bank, seen = 0;
    seen |= modwerk_controller_lease_seen & MW_DSP_PACKAGED; modwerk_controller_lease_seen = 0;
    used = (uint8_t)(seen | 2u | (modwerk_dsp_bank_names(COMPRESSOR) ? 1u : 0u));
}
/* Slot `at` needs its engine: held and used, or on its way out of use (its DISABLE not yet complete, so Sidechain goes
 * off before the key bus does). A slot that never placed one and is not used needs none. */
static int engine_wanted(unsigned at)
{
    const struct mw_controller_slot *s = &REGISTRY.slots[at];
    if (!held(s)) return 0;
    if (parked[at]) return s->state != MW_CTL_RETIRING;
    if (roomless[at] && s->state <= MW_CTL_BOUND) return 0;
    return (used & s->binding.identity.feature) || s->touched || s->state > MW_CTL_BOUND;
}
static unsigned engine_features(void)
{
    unsigned features = 0;
    for (unsigned k = 0; k < MW_CONTROLLER_SLOTS; ++k)
        if (engine_wanted(k)) features |= REGISTRY.slots[k].binding.identity.feature;
    return features;
}
#else
static unsigned engine_features(void) { return slot_features(); }
#endif
/* A live package requires the key bus (ABI 9 `requires`, loader.h): a reader, once a track runs its effect or the bank's
 * Parts name it (use_tick's rule). A few loads a tick, no hashing. */
static int keybus_read(void)
{
    for (unsigned i = 0; i < RUNTIME_MODULES; ++i) {
        const struct runtime_module *m = modwerk_runtime_module(i);
        if (!m || !(m->dsp.requires & KEYBUS)) continue;
#ifdef MODWERK_RESIDENT_ON_DEMAND
        int id = HANDLE(m->dsp.module);
        if (id >= 0 && modwerk_dsp_bank_names((unsigned)id)) return 1;
#else
        return 1;
#endif
    }
    return 0;
}
#ifdef MODWERK_RESIDENT_ON_DEMAND
/* The FX allocator's seam (resident_engines.allocator): the tap's price on core c that a set of effects (FX1 T1-T8, then
 * FX2) brings when it names a reader's effect while the tap is not charged there. So the pick or Part change that brings
 * a reader is DSP FULL when the tap does not fit beside it, as an effect is; its install never is (owner, 24 October
 * 2026: a project may never name it, and the Part it is installed beside may change). */
uint32_t modwerk_controller_keybus_pending(unsigned c, const uint8_t ids[16])
{
    for (unsigned i = 0; i < RUNTIME_MODULES; ++i) {
        const struct runtime_module *m = modwerk_runtime_module(i);
        int id = m && (m->dsp.requires & KEYBUS) ? HANDLE(m->dsp.module) : -1;
        for (unsigned s = 0; id >= 0 && s < 16u; ++s)
            if (ids[s] == (unsigned)id) return modwerk_dsp_keybus_price(c);
    }
    return 0;
}
#endif
/* The key bus is on for a feature that needs it on this core (Sidechain's detector reads it). */
static int keybus_ready(unsigned feature, unsigned c) { return !KEYBUS_IMPLIED(feature) || (mask[c] & KEYBUS); }
/* Drain the key bus's own owned jobs: an ACKed CAS updates the known mask; anything uncertain closes that core's owned
 * channel (the transport's fail-closed rule) and makes its mask unknown for the boot. */
static void keybus_poll(void)
{
    for (unsigned c = 0; c < 2u; ++c) {
        if (kb_lane[c].op == KB_IDLE || kb_lane[c].op == KB_STUCK) continue;
        struct dl_owned_progress p;
        int s = dl_owned_job_poll(&kb_lane[c].job, &p);
        if (!s) continue;
        int ok = s == 1 && p.sent_sequence == kb_lane[c].job.last_sequence && p.acknowledged_sequence == kb_lane[c].job.last_sequence;
        if (s == -2 || dl_owned_job_release(&kb_lane[c].job) != 1) {
            /* Not this job's terminal state: nothing about the DSP is known, and the lane stays held for good. */
            dl_owned_fail_closed(c);
            mask_known &= (uint8_t)~(1u << c), kb_lane[c].op = KB_STUCK;
            continue;
        }
        unsigned op = kb_lane[c].op;
        kb_lane[c].op = KB_IDLE;
        if (!ok) { mask_known &= (uint8_t)~(1u << c); continue; } /* the transport closed that core for the boot */
        if (op == KB_RESET) { /* an offset-0 chunk zeroes the seed, as a scrub does */
            if (!kb_reset[c]) kb_dirty[c] = 0;
            kb_reset[c] = (uint16_t)(kb_reset[c] + kb_lane[c].job.count);
        }
        else if (op == KB_SCRUB) kb_dirty[c] = 0, kb_reset[c] = 0; /* the seed is zero; the next want resets from 0 */
        else if (op == KB_ENABLE) mask[c] = (uint8_t)(mask[c] | KEYBUS), kb_dirty[c] = 1;
        else mask[c] = (uint8_t)(mask[c] & ~KEYBUS), kb_reset[c] = 0; /* a disable invalidates its reset */
    }
}
static int keybus_start(unsigned c, unsigned op)
{
    struct dl_owned_job job;
    int ok;
    if (op == KB_RESET || op == KB_SCRUB) {
        unsigned offset = op == KB_SCRUB ? 0u : kb_reset[c], n = KEYBUS_WORDS - offset > 24u ? 24u : KEYBUS_WORDS - offset;
        if (offset < KEYBUS_SPLIT && n > KEYBUS_SPLIT - offset) n = KEYBUS_SPLIT - offset;
        ok = dl_owned_reset_reserve(c, KEYBUS_GENERATION, KEYBUS, offset, n, kb_zeros, &job);
    } else ok = dl_owned_command_reserve(c, KEYBUS_GENERATION, 10u, mask[c],
                                         op == KB_ENABLE ? mask[c] | KEYBUS : mask[c] & ~KEYBUS, 0, &job);
    if (!ok) return 0;  /* another owned job holds the core, or it is closed: next tick */
    if (dl_owned_submit(&job) != 1) {
        if (dl_owned_cancel(&job) != 1) dl_owned_fail_closed(c), mask_known &= (uint8_t)~(1u << c);
        return 0;
    }
    kb_lane[c].job = job, kb_lane[c].op = (uint8_t)op;
    return 1;
}
/* Once a tick, before the slots advance: what the key bus needs next on each core. */
static void keybus_tick(void)
{
    keybus_poll();
    unsigned sidechain = KEYBUS_IMPLIED(engine_features());
    kb_readers = (uint8_t)keybus_read();
    kb_wanted = (uint8_t)(sidechain || kb_readers);
#ifdef MODWERK_RESIDENT_ON_DEMAND
    mw_engines_want(engine_features() | sidechain | (kb_wanted ? KEYBUS : 0u));
    /* The tap's price, on both cores, only while a reader requires the key bus: Sidechain alone is admitted and charged
     * as before the key bus (its tap never was), so without a reader nothing changes for it. */
    if (kb_readers && !kb_priced && modwerk_dsp_keybus_charge(1)) kb_priced = 1;
#endif
    uint8_t busy[2] = {(uint8_t)(transport.held[0] || kb_lane[0].op), (uint8_t)(transport.held[1] || kb_lane[1].op)};
    if (kb_wanted && (mask[0] & mask[1] & KEYBUS) != KEYBUS) {
#ifdef MODWERK_RESIDENT_ON_DEMAND
        /* Readers alone wait for the tap's price first; then the engine at the arena's top, as for any engine; nothing
         * is reset before PLACE is ACKed on both cores. */
        if (!sidechain && !kb_priced) return;
        if (mw_engines_place(KEYBUS, 3u, KEYBUS_GENERATION, busy, mask, mask_known) <= 0) return;
#endif
        for (unsigned c = 0; c < 2u; ++c) {
            if (busy[c] || !(mask_known >> c & 1u) || (mask[c] & KEYBUS)) continue;
            /* Its reset and its tap write the bus and the window: never while a slot buffer is there. */
            if (dl_hook_buffer_ranges_idle(KEYBUS) != 1) break;
            /* A core enables only once the other core's reset is complete too (or it is on there already): a reader
             * keyed from the other core reads that core's half of the window, and until its reset it may hold an earlier
             * run's frames (the scrub zeroes only the seed). An unknown core keeps both off: readers then pass audio. */
            unsigned o = 1u - c;
            if (kb_reset[c] < KEYBUS_WORDS) (void)keybus_start(c, KB_RESET);
            else if ((mask_known >> o & 1u) && ((mask[o] & KEYBUS) || kb_reset[o] >= KEYBUS_WORDS)) (void)keybus_start(c, KB_ENABLE);
        }
    } else if (!kb_wanted) {
        for (unsigned c = 0; c < 2u; ++c) {
            if (!busy[c] && (mask_known >> c & 1u) && (mask[c] & KEYBUS)) (void)keybus_start(c, KB_DISABLE);
            /* Off after a run: zero the seed and counter first (an offset-0 chunk, the receiver's fresh start), while the
             * bus still holds the window (modwerk_controller_held), never over a slot buffer. */
            else if (!busy[c] && (mask_known >> c & 1u) && kb_dirty[c] && dl_hook_buffer_ranges_idle(KEYBUS) == 1)
                (void)keybus_start(c, KB_SCRUB);
            /* Never enabled here, or let go before its ENABLE: what the reset wrote counts for nothing once the bus is no
             * longer held, since a slot buffer may take the window meanwhile. The next want resets from offset 0 (the
             * receiver's fresh start: it clears its ready bit). */
            else if (!(mask[c] & KEYBUS) && kb_lane[c].op == KB_IDLE) kb_reset[c] = 0;
        }
    }
}
#ifdef MODWERK_RESIDENT_ON_DEMAND
/* The tap's price is let go once no reader is left: at once while Sidechain still holds the bus (as before the key
 * bus), otherwise once the bus is off and unplaced on both cores. */
static void keybus_release(void)
{
    if (kb_priced && !kb_readers && (KEYBUS_IMPLIED(engine_features()) ||
        (!kb_wanted && !((mask[0] | mask[1]) & KEYBUS) && mw_engines[0][3].state == MW_ENGINE_FREE && mw_engines[1][3].state == MW_ENGINE_FREE)))
        (void)modwerk_dsp_keybus_charge(0), kb_priced = 0;
}
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
        if (!(p = row_for(o.controller_sha256, o.module, o.image_bytes)) || !binding_of(&o, p, &b) || slot_of(&b) < MW_CONTROLLER_SLOTS) continue;
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
    const struct runtime_module *m = module_of(b);
    unsigned need = b->identity.required_cores, published = m != 0;
    int quiesce = !published || (want[at].generation == b->generation && want[at].quiesce);
#ifdef MODWERK_RESIDENT_ON_DEMAND
    /* Unused by this bank (use_tick): never placed, or parked while the unit is quiet and settled, as compaction waits. */
    int idle = !quiesce && !(used & b->identity.feature), park = idle && !jobs(s) && mw_engines_settled();
    if (!idle && s->state != MW_CTL_DISABLING && s->state != MW_CTL_RETIRING) parked[at] = 0;
#else
    int idle = 0, park = 0;
#endif
    switch (s->state) {
    case MW_CTL_RESERVED:
        (void)mw_controller_cancel(&REGISTRY, b); break;
    case MW_CTL_BOUND: case MW_CTL_INITIALIZING: case MW_CTL_READY:
        if (quiesce) {
            if (s->state == MW_CTL_BOUND && !s->touched) { (void)mw_controller_cancel(&REGISTRY, b); break; }
            if (!jobs(s)) for (unsigned c = 0; c < 2u; ++c) if (need >> c & 1u) { begin(at, c, MW_CTL_DISABLE); break; }
            break;
        }
        if (idle) {
            /* Never placed: nothing to give back. Otherwise its feature goes off first, then the engines collect it. */
            if (park && (s->touched || s->state != MW_CTL_BOUND)) {
                for (unsigned c = 0; c < 2u; ++c) if (need >> c & 1u) { begin(at, c, MW_CTL_DISABLE); break; }
                parked[at] = s->state == MW_CTL_DISABLING;
            }
            break;
        }
#ifdef MODWERK_RESIDENT_ON_DEMAND
        /* The engine is written, read back and PLACEd on every required core before any RESET chunk; a
         * generation that finds it placed (a restore, a successor) adopts it without reloading. */
        if (MW_DSP_PACKAGED & b->identity.feature) {
            if (!engine_shape(&m->dsp, b->identity.feature)) break; /* admitted whole: never, but never placed then */
            const struct runtime_dsp_entry *e = &m->dsp.entries[0];
            struct mw_engine_unit units[2] = {{0}};
            for (unsigned c = 0; c < 2u; ++c)
                if (need >> c & 1u) units[c] = (struct mw_engine_unit){m->dsp.engine, m->dsp.engine_relocations, (uint16_t)m->dsp.engine_count,
                                                                       m->dsp.engine_relocation_count, e->exit, mw_dsp_sites[e->site].exit[c]};
            mw_engines_package(b->identity.feature, b->generation, units);
        }
        /* The whole engine or nothing: admission's dry run, now when it is used (a partial claim goes back, collected).
         * Room found again waits a tick, so the key bus Sidechain implies is wanted, and placed above it, first. */
        unsigned was = roomless[at];
        roomless[at] = !mw_engines_ready(b->identity.feature, need) &&
            mw_engines_admit(b->identity.feature, engine_features() | (kb_wanted ? KEYBUS : 0u),
                             MW_DSP_PACKAGED & b->identity.feature ? m->dsp.engine_count : 0u) == MW_ENGINE_MEMORY;
        if (roomless[at] || was) break;
        if (mw_engines_place(b->identity.feature, need, b->generation, transport.held, mask, mask_known) <= 0) break;
#endif
        for (unsigned c = 0; c < 2u; ++c) if (need >> c & 1u) {
            if (s->state != MW_CTL_READY && s->acknowledged_words[c] < s->reset_words[c]) begin(at, c, MW_CTL_RESET);
            else if (s->state == MW_CTL_READY && !jobs(s) && keybus_ready(b->identity.feature, c)) begin(at, c, MW_CTL_ENABLE);
        }
        break;
    case MW_CTL_PUBLISHING: case MW_CTL_ACTIVE:
        if (quiesce) {
            /* The page leaves before the hooks: no descriptor names the image once it is disabled. */
            if (!page_revert(at)) { (void)mw_controller_cancel(&REGISTRY, b); break; }
            if (!jobs(s)) for (unsigned c = 0; c < 2u; ++c) if (need >> c & 1u) { begin(at, c, MW_CTL_DISABLE); break; }
        } else if (idle) {
            /* Parked as a removal disables, but a page that is not what was written keeps it running (not quarantined). */
            if (park && page_revert(at)) {
                for (unsigned c = 0; c < 2u; ++c) if (need >> c & 1u) { begin(at, c, MW_CTL_DISABLE); break; }
                parked[at] = s->state == MW_CTL_DISABLING;
            }
        } else if (s->state == MW_CTL_ACTIVE) page_apply(at);
        else {
            if (s->enable_acks == need && !jobs(s)) (void)mw_controller_publish(&REGISTRY, b);
            else for (unsigned c = 0; c < 2u; ++c)
                if ((need >> c & 1u) && !(s->enable_acks >> c & 1u) && keybus_ready(b->identity.feature, c)) begin(at, c, MW_CTL_ENABLE);
        }
        break;
    case MW_CTL_DISABLING:
        for (unsigned c = 0; c < 2u; ++c) if ((need >> c & 1u) && !(s->disable_acks >> c & 1u)) begin(at, c, MW_CTL_DISABLE);
        break;
    case MW_CTL_RETIRING:
        if (!published) { want[at].quiesce = 0; parked[at] = 0; (void)mw_controller_retire(&REGISTRY, b); } /* republished: restore at once */
        else if (parked[at] && !quiesce) {
            /* Parked: back as at install once this bank uses it again. */
            if (!idle && mw_controller_restore(&REGISTRY, b) == MW_CTL_OK) parked[at] = 0, verified[at] = 0;
        }
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
#ifdef MODWERK_RESIDENT_ON_DEMAND
        use_tick();
#endif
        keybus_tick();
        for (unsigned at = 0; at < MW_CONTROLLER_SLOTS; ++at) if (held(&REGISTRY.slots[at])) advance(at);
#ifdef MODWERK_RESIDENT_ON_DEMAND
        {
            uint8_t busy[2] = {(uint8_t)(transport.held[0] || kb_lane[0].op), (uint8_t)(transport.held[1] || kb_lane[1].op)};
            /* Collect by what is wanted: it unplaces an engine only where its feature is known off on that core. */
            mw_engines_collect(engine_features() | (kb_wanted ? KEYBUS : 0u), mask, mask_known, busy);
        }
        keybus_release();
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
    /* Nothing bound: every package is an ordinary one, but a reader would wait for a bus that never comes (the board
     * holds it), unpriced: refused. The first tick runs at boot, long before the saved set's restore. */
    if (!started || closed) return to && to->present && (to->requires & KEYBUS) ? (closed ? RUNTIME_CONFLICT : RUNTIME_BUSY) : RUNTIME_OK;
    const struct mw_controller_write_policy *incoming = to && to->present ? row_for(to->controller_sha256, to->module, to->image_bytes) : 0;
    const struct mw_controller_write_policy *outgoing = from && from->present ? row_for(from->controller_sha256, from->module, from->image_bytes) : 0;
    if (incoming) {
        /* A packaged feature's controller brings its engine, whole; no other does. */
        if (MW_DSP_PACKAGED & incoming->identity.feature ? !engine_shape(to, incoming->identity.feature) : to->engine_count != 0)
            return RUNTIME_MALFORMED;
        /* One module per resident engine; a quarantined engine admits nobody. */
        for (unsigned k = 0; k < MW_CONTROLLER_SLOTS; ++k) {
            const struct mw_controller_slot *s = &REGISTRY.slots[k];
            if (held(s) && s->binding.identity.feature == incoming->identity.feature &&
                (s->state == MW_CTL_QUARANTINED || s->binding.identity.module != to->module)) return RUNTIME_CONFLICT;
        }
#ifdef MODWERK_RESIDENT_ON_DEMAND
        /* Its engine takes no room at install: it is placed once a track uses it (use_tick), and waits for room then.
         * Only an engine stuck for this boot refuses. */
        if (mw_engines_admit(incoming->identity.feature, modwerk_controller_held() | live_features(), to->engine_count) == MW_ENGINE_STUCK_BOOT)
            return RUNTIME_CONFLICT;
#endif
    }
#ifdef MODWERK_RESIDENT_ON_DEMAND
    /* ABI 9: a package that requires the key bus (a reader) needs the bus engine (room for it, or already placed: the
     * dry run says FITS then; a stuck engine refuses), and the tap's price unless another reader pays it. Sidechain's
     * engine and the bus share nothing but the bus words. */
    if (to && to->present && (to->requires & KEYBUS)) {
        /* Not while the bus is being let go: a core disabling or scrubbing, or off with its seed not yet zeroed, still
         * shows the last run's mark, which the reader would take for a live bus for a job round trip. Retry. */
        /* A bus that cannot come up this boot (a core's state lost, keybus_down): refused, seed clean or not, rather
         * than admitted to pass its audio or told to retry what never succeeds. A dirty seed there is never scrubbed
         * either, so the window stays held. */
        if (keybus_down()) return RUNTIME_FEATURE;
        for (unsigned c = 0; c < 2u; ++c)
            if (kb_lane[c].op == KB_DISABLE || kb_lane[c].op == KB_SCRUB || (kb_dirty[c] && !(mask[c] & KEYBUS))) return RUNTIME_BUSY;
        /* The bus engine waits for room as any engine does; stuck on a core, it never places. */
        if (mw_engines_admit(KEYBUS, modwerk_controller_held() | live_features(), 0) == MW_ENGINE_STUCK_BOOT) return RUNTIME_FEATURE;
        /* The tap's price is not checked here: it is charged only once the bank names a reader's effect, and the pick
         * that brings it pays it (modwerk_controller_keybus_pending). A check here promised nothing and refused a sync
         * whenever the Part on screen left no room (owner, 24 October 2026). A reader the bank already names when it
         * goes in (beta finding 64) waits for the price (keybus_tick), as an engine waits for room. */
    }
#endif
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

/* ABI 10 (loader.h), locked, in place of the claims' check: an engine only from a trusted controller of a packaged
 * feature, whole (engine_shape); its claims are that feature's regions, which the base keeps for it. */
int modwerk_machine_dsp_engine_admit(const struct runtime_dsp *d)
{
    const struct mw_controller_write_policy *p = started && d ? row_for(d->controller_sha256, d->module, d->image_bytes) : 0;
    if (!p) return RUNTIME_CONFLICT;
    return engine_shape(d, p->identity.feature) ? RUNTIME_OK : RUNTIME_MALFORMED;
}

/* Held features: every held slot's, and the key bus while it is wanted, on or not known to be off on a core (an FX
 * buffer never goes where the tap may still write). */
unsigned modwerk_controller_held(void)
{
    unsigned features = slot_features();
    if (kb_wanted || (KEYBUS_IMPLIED(features)) || ((mask[0] | mask[1]) & KEYBUS) || (started && mask_known != 3u) ||
        ((kb_dirty[0] || kb_dirty[1]) && !closed)) features |= KEYBUS; /* until its seed is scrubbed */
    return features;
}
