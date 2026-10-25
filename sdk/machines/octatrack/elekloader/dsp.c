/* SPDX-License-Identifier: GPL-3.0-or-later
 * DSP effects from runtime modules (build_core.py --dsp-loader). Octabam's
 * DSP dynamic loading (sdk/octabam/platform/dsp-dynload-transport, built
 * into this base) loads an effect's code into a DSP when a track picks it,
 * shares it per core and frees it when nothing uses it; its allocator admits
 * each target against both cores' arenas and cycle allowances before
 * anything changes. Here its catalog is filled from module packages instead
 * of the build: a module's effect is registered when the loader publishes
 * the module and unregistered when it goes. Development only. */
#include "runtime.h"
#include "allocator.h"
#include "transfer.h"
#include "status.h"
#include "fxids.h"
#include "dsp_journal.h"
#include "fxpage.h"
#include "fxmap.h"
#include "upload.h"

/* manager.c's code descriptor, which it reads from dl_codes. */
struct code { const uint32_t *words; const uint16_t *relocations; uint16_t count, init, proc, relocation_count; };
/* Stock first: each slot is charged at least the dearest stock effect its bank's Parts name there
 * (modwerk_dsp_slot_floors; owner, 24 October 2026, beta finding 34), so a Part switch or a RELOAD never needs room it
 * was not given, and eight stock slots of any bank fit a core (the dearest, MODWERK_DSP_RESERVE, eight times): only a
 * module, or a stock pick dearer than its bank's Parts use there, is refused. Machine voices and engines, which a bank
 * change keeps, still book each slot at MODWERK_DSP_RESERVE. All in chip cycles per sample (build_core.py). A module is
 * admitted before its tracks are known, so against the smaller core's allowance. */
#define MODWERK_DSP_ALLOWANCE (MODWERK_DSP_ALLOWANCE0 < MODWERK_DSP_ALLOWANCE1 ? MODWERK_DSP_ALLOWANCE0 : MODWERK_DSP_ALLOWANCE1)
typedef char stock_always_fits[8u * MODWERK_DSP_RESERVE <= MODWERK_DSP_ALLOWANCE ? 1 : -1];
/* An instance's chip cycles. A claim from the emulator (executed instructions, modeled cycles) ran 1.42-1.74 times
 * that on the owner's MKII (11 October 2026); charged at 7/4 of it until the module carries a hardware figure. */
static uint32_t charged(uint32_t cycles, uint8_t kind) { return kind == RUNTIME_HARDWARE ? cycles : (cycles * 7u + 3u) / 4u; }
static uint32_t chip_cycles(const struct runtime_dsp *d) { return charged(d->cycles, d->kind); }
/* Source stage: a machine whose DSP voice replaces a track's stock source declares a price per voice (each track it
 * renders) and per core while its engine is on, in its own figure kind. Both are charged before every FX slot (the
 * allocator starts each core's sum at modwerk_dsp_source_charge), and a claim fits beside each slot's committed or
 * pending charge, at least the stock reserve, so a stock pick still never needs admission. Machine lock held. */
#define SOURCE_ENGINES 8u
uint32_t dl_slot_cycles(unsigned slot); /* manager.c (build_core.py): a slot's committed or pending charge */
static uint32_t source_voice[8], source_owner[8];
static volatile uint8_t source_frozen; /* the self-test runs: no voice is charged anew until it ends (beta finding 63) */
static struct { uint32_t module, cycles; } source_engine[2][SOURCE_ENGINES];
static unsigned source_core(unsigned track) { return track < 4u ? 1u : 0u; } /* the allocator's core_of: tracks 1-4 on core 1 */
static uint32_t slot_charge(unsigned core) /* each of the core's eight slots at least the stock reserve: for voices */
{
    uint32_t sum = 0;
    for (unsigned i = 0; i < 16u; ++i)
        if (source_core(i & 7u) == core) { uint32_t x = dl_slot_cycles(i); sum += x > MODWERK_DSP_RESERVE ? x : MODWERK_DSP_RESERVE; }
    return sum;
}
uint32_t modwerk_dsp_source_charge(unsigned core)
{
    uint32_t sum = 0;
    if (core > 1u) return 0;
    for (unsigned e = 0; e < SOURCE_ENGINES; ++e) sum += source_engine[core][e].cycles;
    for (unsigned t = 0; t < 8u; ++t) if (source_core(t) == core) sum += source_voice[t];
    return sum;
}
/* The last claim refused for cycles: the core and the cycles it asked for (its voice and any engine it adds), for the
 * DSP FULL box (status.c). A machine's voice has no effect pick to show a refusal, so the box says it. */
static unsigned refused_core;
static uint32_t refused_add;
void modwerk_dsp_source_refusal(unsigned *core, uint32_t *add) { *core = refused_core, *add = refused_add; }
/* `module` (its runtime id) renders `track`, replacing whatever claimed it; nothing changes unless the core's sources,
 * this voice, the module's engine and every slot fit its allowance. */
int modwerk_dsp_source_claim(unsigned track, uint32_t module, uint32_t voice, uint32_t engine, uint8_t kind)
{
    if (track >= 8u || !module || !kind || kind > RUNTIME_HARDWARE || voice > 0xffffu || engine > 0xffffu) return RUNTIME_MALFORMED;
    /* Its emptied cores would let a voice in that leaves the Part's own effects no room to come back: wait for its end. */
    if (source_frozen && source_owner[track] != module) return RUNTIME_BUSY;
    unsigned c = source_core(track), at = SOURCE_ENGINES;
    for (unsigned e = 0; e < SOURCE_ENGINES; ++e) if (source_engine[c][e].module == module) at = e; /* its engine */
    for (unsigned e = 0; at == SOURCE_ENGINES && e < SOURCE_ENGINES; ++e) if (!source_engine[c][e].module) at = e;
    if (at == SOURCE_ENGINES) return RUNTIME_FULL;
    uint32_t v = charged(voice, kind), e = charged(engine, kind), old = source_engine[c][at].module ? source_engine[c][at].cycles : 0;
    uint32_t keep = old > e ? old : e;
    uint32_t total = slot_charge(c) + modwerk_dsp_source_charge(c) - source_voice[track] - old + v + keep;
    if (total > (c ? MODWERK_DSP_ALLOWANCE1 : MODWERK_DSP_ALLOWANCE0)) { refused_core = c, refused_add = v + keep - old; return RUNTIME_CYCLES; }
    source_voice[track] = v, source_owner[track] = module;
    source_engine[c][at].module = module, source_engine[c][at].cycles = keep;
    return RUNTIME_OK;
}
/* The track is back on its stock source (the machine left it, or its claim was refused): its voice is free. */
void modwerk_dsp_source_release(unsigned track)
{
    if (track < 8u) source_voice[track] = 0, source_owner[track] = 0;
}
/* The module's engine is off on both cores (disabled or retired): its engine and every voice it held are free. */
void modwerk_dsp_source_engine_off(uint32_t module)
{
    for (unsigned t = 0; module && t < 8u; ++t) if (source_owner[t] == module) modwerk_dsp_source_release(t);
    for (unsigned c = 0; module && c < 2u; ++c)
        for (unsigned e = 0; e < SOURCE_ENGINES; ++e)
            if (source_engine[c][e].module == module) source_engine[c][e].module = 0, source_engine[c][e].cycles = 0;
}
/* A module id with no module: the null stub runs there, free on both slots. */
#define STOCK {0, 1, 0, 3, 1, 1, 0}
/* identity.c (dsp_loader.py catalog_c): every stock DSP effect's package per core, loaded on demand;
 * a module registers into its own id. */
extern struct dl_package dl_catalog[MODWERK_FX_IDS];
extern struct code dl_codes[2][MODWERK_FX_IDS];
extern const uint16_t modwerk_dsp_arena[2]; /* each core's code arena past the saved entries, words (identity.c) */
int dl_publication_idle(void);
void dl_residency_nudge(void);
#define SLOT_WORDS 132u /* an instance's r7 block: $00-$83; $84+ hung the unit (Octabam AGENTS.md) */
/* The Y block stock gives each slot (X:0x255): FX1 3K words, FX2 16K. On T3 and T7 stock keeps its own
 * words at the head of the FX2 block (Octabam dsp_ranges.py); a module there shares them as stock's reverbs do. */
#define FX1_BUFFER 3072u
#define FX2_BUFFER 16384u

#ifdef MODWERK_HOST
uint8_t modwerk_test_live_fx[16], *modwerk_test_bank;
#define LIVE_FX modwerk_test_live_fx
#define BANK ((uintptr_t)modwerk_test_bank)
#else
#define LIVE_FX ((const volatile uint8_t *)0x80000ec4u) /* the FX ids each track runs: FX1 T1-T8, then FX2 */
#define BANK (*(volatile uint32_t *)0x46c82456u)         /* the current bank (selection.c), 0 before a project */
#endif
#define PART(bank, i) ((const volatile uint8_t *)((bank) + ((i) < 4 ? 0x8ed80u : 0x9504au - 4u * 6322u) + (i) * 6322u))
static volatile int nudge;

static int in_use(unsigned id)
{
    for (unsigned i = 0; i < 16; ++i) if (LIVE_FX[i] == id) return 1;
    return 0;
}
/* Handles (owner, 11 October 2026): a module's effect id is a handle, not the module's for good. The
 * project's map (fxmap.c) names the module behind each; `owner` is who holds each this session. A
 * module goes where the map puts it, else to its preferred id (today's catalogue assignment), else to
 * the lowest free one, never to a handle the project names another module at; a replacement keeps its
 * module's. The loader's record of a module's effect id is the one it got at admission, which a project
 * load may move (rebind_tick), so the module id is what finds it. */
uint32_t modwerk_fxmap_module(unsigned id);
int modwerk_fxmap_handle(uint32_t module);
fx_set modwerk_fxmap_used(void);
uint32_t modwerk_fxmap_generation(void);
void modwerk_fxmap_assign(unsigned id, uint32_t module, unsigned layout, const char *name);
void modwerk_fxmap_name(unsigned id, char *out);
int modwerk_fxmap_loading(void);
extern volatile uint32_t modwerk_fxmap_read, modwerk_fxmap_written;
extern volatile uint32_t modwerk_modset_generation, modwerk_modset_count, modwerk_modset_result; /* modset.c */
int modwerk_fxpage_build(unsigned id, uint8_t *recipe, uint32_t bytes, unsigned slots); /* fxpage.c */
void modwerk_fxpage_drop(unsigned id);
static uint32_t owner[MODWERK_FX_IDS];
static uint8_t catalogue_digest[MODWERK_FX_IDS][MU_DIGEST_BYTES];
static uint32_t catalogue_generation[MODWERK_FX_IDS]; /* immutable loader generation, never a host claim */
static uint16_t owner_layout[MODWERK_FX_IDS];
static char owner_name[MODWERK_FX_IDS][16];
static uint8_t *owner_page[MODWERK_FX_IDS]; /* its page recipe (the module image's head), and that image's length */
static uint32_t owner_page_bytes[MODWERK_FX_IDS];
static uint8_t owner_pinned[MODWERK_FX_IDS]; /* its ColdFire code names this id: it never moves (loader.h) */
static uint32_t owner_cycles[MODWERK_FX_IDS]; /* an instance's chip cycles a sample, unfloored (status.c's MODULE LOAD) */
/* Each slot's least charge: the dearest stock effect this bank's Parts name there, working or saved, the one it runs and
 * the one `ids` asks for. A module id counts nothing here: each module is admitted for itself, and a Part naming one
 * that does not fit is refused at the switch. */
static void floors(const uint8_t ids[16], uint32_t least[16])
{
    uintptr_t bank = BANK;
    for (unsigned i = 0; i < 16u; ++i) {
        uint32_t most = 0;
        for (unsigned n = 0; n < 10u; ++n) {
            unsigned p = n < 8u ? (bank ? PART(bank, n)[i] : 255u) : n == 8u ? LIVE_FX[i] : ids[i];
            if (p < MODWERK_FX_IDS && !owner[p] && dl_catalog[p].cycles > most) most = dl_catalog[p].cycles;
        }
        least[i] = most;
    }
}
/* What runs and each of the bank's four Parts (working copies), the dearest, on core: each slot its effect's cycles, at
 * least its floor. No Part switch needs more. */
static uint32_t bank_booking(const uint32_t least[16], unsigned core)
{
    uintptr_t bank = BANK;
    uint32_t most = 0;
    for (unsigned n = 0; n < (bank ? 5u : 1u); ++n) {
        const volatile uint8_t *set = n ? PART(bank, n - 1u) : LIVE_FX;
        uint32_t sum = 0;
        for (unsigned i = 0; i < 16u; ++i)
            if (source_core(i & 7u) == core) {
                unsigned id = set[i];
                uint32_t x = id < MODWERK_FX_IDS ? dl_catalog[id].cycles : 0u;
                sum += x > least[i] ? x : least[i];
            }
        most = sum > most ? sum : most;
    }
    return most;
}
static const uint8_t no_target[16] = {255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255};
/* The allocator's prepare (`ids` its target): each slot's floor into `least`, and 1 + the core where the target's raised
 * floors (a stock pick dearer than its bank's Parts use there) take what runs or a Part of the bank past the allowance
 * beside the machines' voices, else 0, so a Part switch is never refused for a stock effect (owner, 24 October 2026, beta
 * finding 34). A Part switch, a load or the self-test names nothing the bank and the tracks do not: it raises none. */
unsigned modwerk_dsp_slot_floors(const uint8_t ids[16], uint32_t least[16])
{
    uint32_t was[16];
    unsigned raised = 0;
    floors(no_target, was); /* the Parts once: the target only adds its own stock effects */
    for (unsigned i = 0; i < 16u; ++i) {
        unsigned p = ids[i];
        uint32_t x = p < MODWERK_FX_IDS && !owner[p] ? dl_catalog[p].cycles : 0u;
        least[i] = x > was[i] ? x : was[i], raised |= least[i] > was[i];
    }
    for (unsigned c = 0; raised && c < 2u; ++c) {
        uint32_t voices = modwerk_dsp_source_charge(c), after = bank_booking(least, c) + voices;
        if (after > (c ? MODWERK_DSP_ALLOWANCE1 : MODWERK_DSP_ALLOWANCE0) && after > bank_booking(was, c) + voices) return 1u + c;
    }
    return 0;
}
/* The STATUS page's DSP row and the box after a refused pick: the bank's dearest set on core, as the allocator books it. */
static uint32_t slot_booking(unsigned core)
{
    uint32_t least[16];
    floors(no_target, least);
    return bank_booking(least, core);
}
static uint8_t owner_measured[MODWERK_FX_IDS]; /* 1: a hardware figure; 0: 7/4 of an emulator claim */
/* shortcut: a pinned module's ColdFire hooks still act on tracks running its id after it lets go of it (a project
 * from elsewhere naming another module there); give such modules their handle at run time to lift this. */
static unsigned rebinding; /* ticks into a rebind, 0 none */
static int handle_of(uint32_t module)
{
    for (unsigned k = 0; module && k < MODWERK_FX_IDS; ++k) if (owner[k] == module) return (int)k;
    return -1;
}
static int free_for(unsigned k, uint32_t module, fx_set used)
{
    if (!fx_in(modwerk_fx_modules, k) || owner[k]) return 0;
#ifdef MODWERK_RUNTIME_SETS
    if (modwerk_runtime_handle_reserved(module,k)) return 0;
#endif
    uint32_t named = modwerk_fxmap_module(k);
    return named == module || !fx_in(used, k); /* a handle the project uses for an unknown module stays its own */
}
static int choose(uint32_t module, unsigned preferred, int pinned)
{
    fx_set used = modwerk_fxmap_used();
    int mapped = modwerk_fxmap_handle(module);
    if (pinned) return (mapped < 0 || mapped == (int)preferred) && free_for(preferred, module, used) ? (int)preferred : -1;
    if (mapped >= 0 && !owner[mapped]) return mapped;
    if (free_for(preferred, module, used)) return (int)preferred;
    for (unsigned k = 0; k < MODWERK_FX_IDS; ++k) if (free_for(k, module, used)) return (int)k;
    return -1;
}
/* An Undo of a module a track runs (beta finding 66): before its change that track ran the null stub, dry, under the
 * same handle, as a project naming a module that is not installed does. So a restore makes such a slot dry again
 * first: NONE written into its live id, as the manager parks one (manager.c reinit). Stock gives the track its Part's
 * id back at its next trig, which with the module gone is the stub. Any other removal still waits for the track. */
static void park(unsigned id)
{
    volatile uint8_t *live = (volatile uint8_t *)(uintptr_t)LIVE_FX;
    for (unsigned i = 0; i < 16; ++i) if (live[i] == id) live[i] = 0;
}
int modwerk_machine_dsp_admit(const struct runtime_dsp *from, struct runtime_dsp *to)
{
    /* An effect a track runs, or one a transaction may hold between prepare and retirement, stays.
     * A new one may register at any time: no transaction names an effect nobody has picked. */
    int had = from->count ? handle_of(from->module) : -1;
    if (from->count && had >= 0 && in_use((unsigned)had)) {
        if (!modwerk_runtime_restoring()) return RUNTIME_IN_USE; /* the host says why: pick another effect */
        park((unsigned)had);
    }
    if (from->count && (!dl_publication_idle() || rebinding)) return RUNTIME_BUSY;
    if (!to->count) return RUNTIME_OK;
    if (rebinding) return RUNTIME_BUSY;
    int id = had >= 0 ? had : choose(to->module, to->id, to->pinned);
    if (id < 0) return RUNTIME_FULL; /* every module handle is held or named */
    to->id = (uint8_t)id;
    unsigned arena = modwerk_dsp_arena[0] < modwerk_dsp_arena[1] ? modwerk_dsp_arena[0] : modwerk_dsp_arena[1];
    if (to->count > arena || to->state > SLOT_WORDS || to->buffer > (to->slots & 1u ? FX1_BUFFER : FX2_BUFFER)) return RUNTIME_MEMORY;
    /* shortcut: modeled cycles and executed instructions admit in this development base, at 7/4 (chip_cycles);
     * a release base admits hardware-timed figures only (owner, 10 October 2026). */
    /* One instance must fit beside seven stock slots on a core. */
    if (!to->kind || to->kind > RUNTIME_HARDWARE || chip_cycles(to) > MODWERK_DSP_ALLOWANCE - 7u * MODWERK_DSP_RESERVE)
        return RUNTIME_CYCLES;
    return RUNTIME_OK;
}
/* Locked, by the loader's switch (no task runs): the manager sees the catalog change between two of its steps. */
static const struct dl_package unheld = STOCK;
static void release(unsigned k)
{
    dl_catalog[k] = unheld;
    dl_codes[0][k] = dl_codes[1][k] = (struct code){0, 0, 0, 0, 0, 0};
    owner[k] = 0, owner_page[k] = 0, owner_pinned[k] = 0, owner_cycles[k] = 0, owner_measured[k] = 0;
    catalogue_generation[k] = 0;
    modwerk_fxpage_drop(k);
}
/* Its page in the choosers at handle k, when it brought one (a module without one still runs where a
 * project names it). */
static void list(unsigned k, uint8_t *page, uint32_t bytes)
{
    owner_page[k] = page, owner_page_bytes[k] = bytes;
    if (page) modwerk_fxpage_build(k, page, bytes, dl_catalog[k].slots);
}
/* The immutable catalogue generation also seals its actual source words and
 * relocations outside the owned image, where a running module cannot adopt it. */
static void catalogue_stamp(const struct runtime_dsp *d,uint8_t *out)
{
    uint8_t parts[2u*MU_DIGEST_BYTES];
    mu_sha256((const uint8_t *)d->words,4u*d->count,parts);
    mu_sha256((const uint8_t *)d->relocations,2u*d->relocation_count,parts+MU_DIGEST_BYTES);
    mu_sha256(parts,sizeof parts,out);
}
/* Shared scalar publication, without a page, map write or manager nudge. */
static void __attribute__((noinline)) catalogue_install(const struct runtime_dsp *to,uint32_t generation)
{
    dl_catalog[to->id] = (struct dl_package){(uint16_t)to->count, 1, chip_cycles(to), to->slots, 0, 1, to->buffer != 0};
    dl_codes[0][to->id] = dl_codes[1][to->id] =
        (struct code){to->words, to->relocations, (uint16_t)to->count, to->init, to->proc, to->relocation_count};
    owner[to->id] = to->module, owner_layout[to->id] = to->layout, owner_pinned[to->id] = to->pinned;
    catalogue_generation[to->id] = generation;
    catalogue_stamp(to,catalogue_digest[to->id]);
    owner_cycles[to->id] = chip_cycles(to), owner_measured[to->id] = to->kind == RUNTIME_HARDWARE;
    for (unsigned i = 0; i < 16u; ++i) owner_name[to->id][i] = to->name[i];
}
void modwerk_machine_dsp_switch(const struct runtime_dsp *from, const struct runtime_dsp *to)
{
    int had = from->count ? handle_of(from->module) : -1;
    if (had >= 0) release((unsigned)had);
    if (to->count) {
        struct runtime_owner identity={0};
        uint32_t generation=modwerk_runtime_owner_snapshot(to->image,&identity)==1 && identity.module==to->module?identity.generation:0;
        catalogue_install(to,generation);
        list(to->id, (uint8_t *)(uintptr_t)to->page, to->page_bytes);
        modwerk_fxmap_assign(to->id, to->module, to->layout, to->name);
        nudge = 1; /* tracks may already name it (a saved project): load it there now */
    }
}
/* This is the real journal publication seam. Missing board transition authority
 * remains closed; a copied owner or a transport idle flag is never readiness. */
#ifndef MODWERK_JOURNAL_FACT_EXTERNAL
__attribute__((weak)) int modwerk_machine_journal_commit_ready(const struct runtime_journal_view *r,int reverse,struct modwerk_journal_commit_fact *f)
{ (void)r;(void)reverse;(void)f;return 0; }
__attribute__((weak)) int modwerk_machine_journal_commit_consume(const struct modwerk_journal_commit_fact *f)
{ (void)f;return 0; }
#endif
static int same_bytes(const uint8_t *a,const uint8_t *b,unsigned n)
{ for(unsigned i=0;i<n;++i) if(a[i]!=b[i]) return 0;return 1; }
static int same_owner(const struct runtime_owner *a,const struct runtime_owner *b)
{
    return a->generation==b->generation && a->module==b->module && a->owned_extent==b->owned_extent &&
        a->extent_bytes==b->extent_bytes && a->image_offset==b->image_offset && a->image_bytes==b->image_bytes &&
        same_bytes(a->package_sha256,b->package_sha256,MU_DIGEST_BYTES);
}
static int same_row(const struct runtime_journal_view *a,const struct runtime_journal_view *b)
{ return a->module==b->module && a->position==b->position && a->from==b->from && a->to==b->to && same_owner(&a->before,&b->before) && same_owner(&a->after,&b->after) && same_bytes(a->package_sha256,b->package_sha256,MU_DIGEST_BYTES); }
static int owned_range(const struct runtime_owner *o,const void *p,uint32_t n,unsigned alignment)
{
    uintptr_t a=(uintptr_t)p;
    return a>=o->owned_extent && a-o->owned_extent<=o->extent_bytes && n<=o->extent_bytes-(a-o->owned_extent) && !(a&(alignment-1u));
}
static int checked_descriptor(const struct runtime_owner *o,const struct runtime_dsp *d,uint32_t module)
{
    if(!d) return 0;
    if(!o->generation) {
        const struct runtime_owner empty={0};const struct runtime_dsp none={0};
        return same_owner(o,&empty) && same_bytes((const uint8_t *)d,(const uint8_t *)&none,sizeof none);
    }
    uintptr_t canonical;struct runtime_owner actual;
    if(o->module!=module || !modwerk_runtime_owner_valid(o) || !modwerk_runtime_owner_canonical(o,&canonical) ||
       !canonical || o->extent_bytes<sizeof(struct runtime_module) || o->image_offset>o->extent_bytes ||
       o->image_bytes>o->extent_bytes-o->image_offset || o->owned_extent>UINTPTR_MAX-o->extent_bytes ||
       d!=&((const struct runtime_module *)o->owned_extent)->dsp || !d->present || d->module!=module ||
       (uintptr_t)d->image!=o->owned_extent+o->image_offset || d->image_bytes!=o->image_bytes ||
       !same_bytes(d->package_sha256,o->package_sha256,MU_DIGEST_BYTES) ||
       modwerk_runtime_owner_snapshot(d->image,&actual)!=1 || !same_owner(o,&actual)) return 0;
    if(!d->count) return !d->page && !d->relocation_count;
    unsigned arena=modwerk_dsp_arena[0]<modwerk_dsp_arena[1]?modwerk_dsp_arena[0]:modwerk_dsp_arena[1];
    if(d->count>arena || d->count>UINT16_MAX || d->state>SLOT_WORDS || !d->slots || d->slots>3u ||
       d->buffer>(d->slots&1u?FX1_BUFFER:FX2_BUFFER) || !d->kind || d->kind>RUNTIME_HARDWARE ||
       chip_cycles(d)>MODWERK_DSP_ALLOWANCE-7u*MODWERK_DSP_RESERVE || d->init>=d->count || d->proc>=d->count ||
       !fx_in(modwerk_fx_modules,d->id) || d->name[15] || !owned_range(o,d->words,4u*d->count,4u) ||
       (d->relocation_count && !owned_range(o,d->relocations,2u*d->relocation_count,2u))) return 0;
    for(unsigned i=0;i<d->count;++i) if(d->words[i]>0xffffffu) return 0;
    for(unsigned i=0;i<d->relocation_count;++i) {
        unsigned r=d->relocations[i];
        if(r>=d->count || d->words[r]>=d->count || (i && r<=d->relocations[i-1u])) return 0;
    }
    return !d->page || (d->page==d->image && d->page_bytes==d->image_bytes && modwerk_fxpage_validate(d->id,d->page,d->page_bytes,d->slots));
}
static int empty_catalogue(unsigned id)
{
    const struct dl_package *p=&dl_catalog[id];
    if(owner[id] || catalogue_generation[id] || owner_page[id] || owner_pinned[id] || owner_cycles[id] || owner_measured[id] ||
       p->words || p->alignment!=1u || p->cycles || p->slots!=3u || !p->resident || !p->qualified || p->buffer) return 0;
    for(unsigned c=0;c<2u;++c) { const struct code *k=&dl_codes[c][id];
        if(k->words || k->relocations || k->count || k->init || k->proc || k->relocation_count) return 0; }
    return modwerk_fxpage_current(id,0,0,0);
}
static int checked_catalogue(const struct runtime_owner *o,const struct runtime_dsp *d,uint32_t module)
{
    int id=modwerk_dsp_catalogue_handle(module);
    if(id==-2) return 0;
    if(!d->count) return id<0;
    if(id<0) return 0;
    const struct dl_package *p=&dl_catalog[id];uint32_t cycles=chip_cycles(d);uint8_t digest[MU_DIGEST_BYTES];
    catalogue_stamp(d,digest);
    if(!same_bytes(digest,catalogue_digest[id],MU_DIGEST_BYTES)) return 0;
    if(catalogue_generation[id]!=o->generation || owner_layout[id]!=d->layout || owner_pinned[id]!=d->pinned ||
       owner_cycles[id]!=cycles || owner_measured[id]!=(d->kind==RUNTIME_HARDWARE) ||
       !same_bytes((const uint8_t *)owner_name[id],(const uint8_t *)d->name,16u) || owner_page[id]!=d->page || owner_page_bytes[id]!=d->page_bytes ||
       p->words!=d->count || p->alignment!=1u || p->cycles!=cycles ||
       p->slots!=d->slots || p->resident || !p->qualified || p->buffer!=(d->buffer!=0)) return 0;
    for(unsigned c=0;c<2u;++c) { const struct code *k=&dl_codes[c][id];
        if(k->words!=d->words || k->relocations!=d->relocations || k->count!=d->count || k->init!=d->init || k->proc!=d->proc || k->relocation_count!=d->relocation_count) return 0; }
    return modwerk_fxpage_current((unsigned)id,d->page,d->page_bytes,d->slots) && modwerk_fxmap_current((unsigned)id,module,d->layout,d->name);
}
int modwerk_dsp_catalogue_handle(uint32_t module)
{
    int found=-1;
    for(unsigned k=0;module && k<MODWERK_FX_IDS;++k) if(owner[k]==module) { if(found>=0) return -2;found=(int)k; }
    return found;
}
static int checked_live(const struct runtime_journal_view *r,const struct runtime_owner *o,const struct runtime_dsp *d)
{
    const struct runtime_module *m=modwerk_runtime_module(r->position);
    return o->generation?m && (uintptr_t)m==o->owned_extent && m->id==r->module && &m->dsp==d:!m;
}
static int same_fact(const struct modwerk_journal_commit_fact *a,const struct modwerk_journal_commit_fact *b)
{
    if(!same_row(&a->row,&b->row) || a->ticket!=b->ticket || a->generation!=b->generation || a->map_generation!=b->map_generation ||
       a->reverse!=b->reverse || a->required!=b->required || a->touched!=b->touched || a->confirmed!=b->confirmed || a->released!=b->released || a->catalogue_handle!=b->catalogue_handle || a->catalogue_target!=b->catalogue_target) return 0;
    for(unsigned c=0;c<2u;++c) if(a->job_ticket[c]!=b->job_ticket[c] || a->job_generation[c]!=b->job_generation[c] ||
        a->pool_base[c]!=b->pool_base[c] || a->pool_words[c]!=b->pool_words[c] || a->first_sequence[c]!=b->first_sequence[c] ||
        a->last_sequence[c]!=b->last_sequence[c] || a->acknowledged_sequence[c]!=b->acknowledged_sequence[c] ||
        a->code_offset[c]!=b->code_offset[c] || a->code_words[c]!=b->code_words[c]) return 0;
    return 1;
}
static struct modwerk_journal_commit_fact checked_preflight;
static unsigned checked_preflight_ready;
static int checked_commit(const struct runtime_journal_view *r,int reverse,int committed,struct modwerk_journal_commit_fact *fact)
{
    if(!r || !r->module || r->position>=RUNTIME_MODULES || (reverse!=0 && reverse!=1) || rebinding || nudge ||
       !checked_descriptor(&r->before,r->from,r->module) || !checked_descriptor(&r->after,r->to,r->module) ||
       (r->before.generation && r->before.generation==r->after.generation) ||
       modwerk_machine_journal_commit_ready(r,reverse,fact)!=1 || !same_row(r,&fact->row) || !fact->ticket ||
       fact->reverse!=reverse || fact->catalogue_target>1u || (fact->catalogue_target && !reverse)) return 0;
    const struct runtime_owner *target=reverse?&r->before:&r->after,*source=reverse?&r->after:&r->before;
    const struct runtime_dsp *to=reverse?r->from:r->to,*from=reverse?r->to:r->from;
    if(fact->catalogue_target) source=target,from=to;
    struct runtime_journal_progress progress;modwerk_runtime_journal_snapshot(&progress);
    if(!fact->generation || fact->generation!=progress.generation || progress.phase!=(reverse?RJ_ROLLBACK:RJ_PUBLISHING) ||
       !fact->map_generation || fact->map_generation!=modwerk_fxmap_checked_generation() || fact->map_generation==UINT32_MAX ||
       fact->required>3u || fact->touched!=fact->required || fact->confirmed!=fact->required || fact->released!=fact->required ||
       progress.required!=fact->required || progress.confirmed!=fact->confirmed || (fact->touched&~progress.touched) ||
       !checked_live(r,committed?target:source,committed?to:from) || !checked_catalogue(source,from,r->module)) return 0;
    int had=modwerk_dsp_catalogue_handle(r->module),id=had>=0?had:to->id;
    if(had==-2 || fact->catalogue_handle!=(to->count?(unsigned)id:255u)) return 0;
    if(to->count && ((!reverse && id!=to->id) || (had<0 && !empty_catalogue((unsigned)id)) ||
       !modwerk_fxmap_allows_checked((unsigned)id,to->module))) return 0;
    for(unsigned c=0;c<2u;++c) {
        if(fact->required>>c&1u) {
            if(!fact->job_ticket[c] || !fact->job_generation[c] || !fact->first_sequence[c] || fact->first_sequence[c]>fact->last_sequence[c] ||
               fact->acknowledged_sequence[c]!=fact->last_sequence[c]) return 0;
            if(to->count) {
                if(fact->pool_base[c]>0x2000u || fact->pool_words[c]>0x2000u-fact->pool_base[c] ||
                   fact->code_offset[c]<64u || fact->code_offset[c]<fact->pool_base[c] || fact->code_words[c]!=to->count ||
                   fact->code_offset[c]-fact->pool_base[c]>fact->pool_words[c] || to->count>fact->pool_words[c]-(fact->code_offset[c]-fact->pool_base[c])) return 0;
            } else if(fact->code_words[c] || fact->code_offset[c]) return 0;
        } else if(fact->job_ticket[c] || fact->job_generation[c] || fact->first_sequence[c] || fact->last_sequence[c] ||
                  fact->acknowledged_sequence[c] || fact->code_offset[c] || fact->code_words[c]) return 0;
    }
    return 1;
}
int modwerk_machine_journal_switch_safe(const struct runtime_journal_view *r,int reverse)
{
    checked_preflight_ready=0;struct modwerk_journal_commit_fact fact={0};
    if(!checked_commit(r,reverse,0,&fact)) return 0;
    checked_preflight=fact;checked_preflight_ready=1;return 1;
}
int modwerk_machine_journal_committed(const struct runtime_journal_view *r,int reverse)
{
    struct modwerk_journal_commit_fact fact={0};unsigned had_ready=checked_preflight_ready;checked_preflight_ready=0;
    if(!had_ready || !checked_commit(r,reverse,1,&fact) || !same_fact(&fact,&checked_preflight) || modwerk_machine_journal_commit_consume(&fact)!=1) return 0;
    const struct runtime_owner *target=reverse?&r->before:&r->after;
    const struct runtime_dsp *target_dsp=reverse?r->from:r->to;struct runtime_dsp selected=*target_dsp;
    int had=modwerk_dsp_catalogue_handle(r->module);if(selected.count) selected.id=fact.catalogue_handle;
    const struct runtime_dsp *to=&selected;
    if(to->count) {
        if(!modwerk_fxpage_commit_checked(to->id,(uint8_t *)(uintptr_t)to->page,to->page_bytes,to->slots)) return 0;
        catalogue_install(to,target->generation);owner_page[to->id]=(uint8_t *)(uintptr_t)to->page;owner_page_bytes[to->id]=to->page_bytes;
        if(!modwerk_fxmap_assign_checked(to->id,to->module,to->layout,to->name)) return 0;
    } else if(had>=0) release((unsigned)had);
    return checked_live(r,target,target_dsp) && checked_descriptor(target,target_dsp,r->module) && checked_catalogue(target,target_dsp,r->module) &&
        (had<0 || to->count || empty_catalogue((unsigned)had));
}
/* A project load can name an installed module at another handle, or another module at the handle one
 * holds. Those modules let go first: the manager retires their code, so no slot runs the wrong module.
 * Once it is idle, each takes the handle the map gives it (choose); one that finds none stays out. */
static struct { struct dl_package package; struct code code[2]; uint32_t module, page_bytes, cycles, generation; uint8_t *page; uint16_t layout; char name[16]; uint8_t pinned, from, measured, digest[MU_DIGEST_BYTES]; } moving[MODWERK_FX_IDS];
static unsigned moving_count;
static uint32_t mapped; /* the map generation the handles follow */
static int rebind_tick(void) /* 1: the handles follow the map's current generation */
{
    if (!rebinding) {
        uint32_t generation = modwerk_fxmap_generation();
        if (generation == mapped) return 1;
        if (!dl_publication_idle()) return 0;
        mapped = generation;
        fx_set used = modwerk_fxmap_used();
        moving_count = 0;
        for (unsigned k = 0; k < MODWERK_FX_IDS; ++k) {
            if (!owner[k]) continue;
            int want = modwerk_fxmap_handle(owner[k]);
            uint32_t named = modwerk_fxmap_module(k);
            if (want == (int)k || (want < 0 && (!named || named == owner[k] || !fx_in(used, k)))) continue;
            moving[moving_count].package = dl_catalog[k];
            moving[moving_count].code[0] = dl_codes[0][k], moving[moving_count].code[1] = dl_codes[1][k];
            moving[moving_count].module = owner[k], moving[moving_count].layout = owner_layout[k];
            moving[moving_count].generation = catalogue_generation[k];
            for(unsigned byte=0;byte<MU_DIGEST_BYTES;++byte) moving[moving_count].digest[byte]=catalogue_digest[k][byte];
            moving[moving_count].page = owner_page[k], moving[moving_count].page_bytes = owner_page_bytes[k];
            moving[moving_count].pinned = owner_pinned[k], moving[moving_count].from = (uint8_t)k;
            moving[moving_count].cycles = owner_cycles[k], moving[moving_count].measured = owner_measured[k];
            for (unsigned i = 0; i < 16u; ++i) moving[moving_count].name[i] = owner_name[k][i];
            ++moving_count;
            release(k);
        }
        if (moving_count) rebinding = 1, nudge = 1;
        return !moving_count;
    }
    if (++rebinding < 4u || !dl_publication_idle()) return 0; /* the manager has retired what let go */
    int fresh = modwerk_fxmap_generation() == mapped; /* else a newer map came meanwhile: the next tick follows it */
    for (unsigned i = 0; i < moving_count; ++i) {
        int id = choose(moving[i].module, moving[i].pinned ? moving[i].from : MODWERK_FX_IDS, moving[i].pinned); /* pinned: its own or none */
        if (id < 0) continue;
        dl_catalog[id] = moving[i].package;
        dl_codes[0][id] = moving[i].code[0], dl_codes[1][id] = moving[i].code[1];
        owner[id] = moving[i].module, owner_layout[id] = moving[i].layout, owner_pinned[id] = moving[i].pinned;
        catalogue_generation[id] = moving[i].generation;
        for(unsigned byte=0;byte<MU_DIGEST_BYTES;++byte) catalogue_digest[id][byte]=moving[i].digest[byte];
        owner_cycles[id] = moving[i].cycles, owner_measured[id] = moving[i].measured;
        for (unsigned c = 0; c < 16u; ++c) owner_name[id][c] = moving[i].name[c];
        list((unsigned)id, moving[i].page, moving[i].page_bytes);
        if (modwerk_fxmap_handle(moving[i].module) != id) modwerk_fxmap_assign((unsigned)id, moving[i].module, moving[i].layout, moving[i].name);
    }
    if (fresh) mapped = modwerk_fxmap_generation();
    rebinding = 0, nudge = 1;
    return fresh;
}
/* The module effects the current bank names: what each track runs, and its four Parts, working and saved.
 * Other banks stay on the card. A bit per effect id, for an update to warn before removing one. */
fx_set modwerk_dsp_used(void)
{
    fx_set used = {{0}};
    uintptr_t bank = BANK;
    for (unsigned i = 0; i < 16; ++i) used = fx_with(used, LIVE_FX[i]);
    for (unsigned part = 0; bank && part < 8; ++part)
        for (unsigned i = 0; i < 16; ++i) used = fx_with(used, PART(bank, part)[i]);
    return fx_and(used, modwerk_fx_modules);
}
/* The same for one FX id, stock or module: an engine's controller is used while this holds (controller_board.c). */
int modwerk_dsp_bank_names(unsigned id)
{
    uintptr_t bank = BANK; int named = in_use(id);
    for (unsigned k = 0; bank && !named && k < 8u * 16u; ++k) named = PART(bank, k >> 4)[k & 15u] == id;
    return named;
}

/* MODULE LOAD (status.c): each installed module effect, by handle: its name, an instance's chip cycles a sample
 * (unfloored: what it costs, not the ledger's charge), whether that is a hardware figure, and how many slots run it
 * on each core (T1-T4 core 1, T5-T8 core 0). Returns how many it wrote, at most MODWERK_FX_IDS. */
unsigned modwerk_dsp_module_loads(struct modwerk_module_load *out)
{
    unsigned n = 0;
    for (unsigned k = 0; k < MODWERK_FX_IDS; ++k) {
        if (!owner[k]) continue;
        struct modwerk_module_load *m = &out[n++];
        for (unsigned i = 0; i < 16u; ++i) m->name[i] = owner_name[k][i];
        m->id = (uint8_t)k, m->measured = owner_measured[k], m->cycles = owner_cycles[k], m->slots[0] = m->slots[1] = 0;
        for (unsigned i = 0; i < 16u; ++i) if (LIVE_FX[i] == k) ++m->slots[(i & 7u) < 4u ? 1 : 0];
    }
    return n;
}

/* The budget box (status.c) for slot (FX1 T1-T8, then FX2): its core's ledger and code memory, the effect's time. */
extern volatile uint32_t dl_residency_words[2];
int modwerk_dsp_budget(unsigned slot, struct modwerk_dsp_budget *out)
{
    unsigned id = slot < 16u ? LIVE_FX[slot] : 0u, c = source_core(slot & 7u);
    if (slot >= 16u || id >= MODWERK_FX_IDS || !owner[id]) return 0;
    out->core = (uint8_t)c, out->allowance = c ? MODWERK_DSP_ALLOWANCE1 : MODWERK_DSP_ALLOWANCE0;
    out->charge = slot_booking(c) + modwerk_dsp_source_charge(c), out->effect_cycles = dl_slot_cycles(slot);
    out->words = dl_residency_words[c], out->arena = modwerk_dsp_arena[c];
    for (unsigned i = 0; i < 16u; ++i) out->name[i] = owner_name[id][i];
    return 1;
}

uint32_t modwerk_dsp_booked(unsigned core)
{
    uint32_t allowance = core ? MODWERK_DSP_ALLOWANCE1 : MODWERK_DSP_ALLOWANCE0, charge = slot_booking(core & 1u) + modwerk_dsp_source_charge(core);
    return charge >= allowance ? 1000u : charge * 1000u / allowance;
}

/* Development only: a chooser pick or Part change replayed as the panel makes
 * it, for scripted hardware runs (a USB test command calls modwerk_dsp_pick
 * from the engine task; the sys task's tick runs it, with the selectors'
 * own guards). slot: 0 FX1, 1 FX2 (track 0-7, chooser row), 2 Part (row = Part 0-3).
 * Up to four wait, one a tick, so a run can make picks on consecutive ticks. */
static volatile uint32_t picks[4], picks_in, picks_out;
int modwerk_dsp_pick(unsigned slot, unsigned track, unsigned row)
{
    if (picks_in - picks_out >= 4u || slot > 2 || track > 7 || row > (slot == 2 ? 3u : 31u)) return 0;
    picks[picks_in % 4u] = slot << 16 | track << 8 | row;
    picks_in = picks_in + 1;
    return 1;
}
/* A track naming a module effect that is not installed runs stock's null stub, dry,
 * its stored parameters untouched; the unit says so when such a track is selected. */
volatile uint32_t modwerk_dsp_missing; /* times the unit said so, for diagnostics */
fx_set modwerk_dsp_dry(void)
{
    fx_set dry = {{0}};
    for (unsigned i = 0; i < 16; ++i) {
        unsigned fx = LIVE_FX[i];
        if (fx_in(modwerk_fx_modules, fx) && dl_catalog[fx].resident) dry = fx_with(dry, fx);
    }
    return dry;
}
/* Each tick (modwerk_dsp_tick), after the rebind's step (`following`: rebind_tick's answer): whether to say "MISSING
 * <NAME>" (into `text`, 24 bytes; 1) for the track just selected (`track`, 8 and up on the MIDI side); the project's
 * whole list is status.c's page. Only while the handles follow the map of the project that is loaded: during a load
 * the tracks can run its handles before its end applies its map (fxmap.c), and a rebind takes a module off a handle
 * before it gets its own, so until then a handle can run dry for a moment under the last project's name for it (MKII,
 * 21 October 2026: "MISSING SPECTRUM", Spectrum's catalogue handle, for a project whose map gave that handle to
 * RINGMOD SC, installed). A selection meanwhile waits and is checked once that is over. A load holds it at most
 * LOAD_HOLD ticks (about a minute), in case one never ends. */
#define LOAD_HOLD 3600u
static unsigned last_track = 0xffu, load_held;
int modwerk_dsp_missing_tick(int following, unsigned track, char *text)
{
    if (!modwerk_fxmap_loading()) load_held = 0;
    else if (load_held < LOAD_HOLD) ++load_held, following = 0;
    if (!following || track == last_track) return 0;
    last_track = track;
    fx_set say = {{0}};
    if (track < 8u) say = fx_and(modwerk_dsp_dry(), fx_with(fx_with(say, LIVE_FX[track]), LIVE_FX[8u + track]));
    if (!fx_any(say)) return 0;
    unsigned k = 0;
    while (!fx_in(say, k)) ++k;
    for (unsigned i = 0; i < 8u; ++i) text[i] = "MISSING "[i];
    modwerk_fxmap_name(k, text + 8);
    for (char *c = text + 8; *c; ++c) if (*c >= 'a' && *c <= 'z') *c = (char)(*c - 32); /* the popup sizes capitals only */
    if (!text[8]) for (unsigned i = 0; i < 15u; ++i) text[i] = "MODULE MISSING"[i];
    return 1;
}
/* MISSING (ep0.c, status.c): the modules the project names, in any bank, that no installed module answers for:
 * "MWM" and a count, then per handle 24 bytes: the handle, 0, the layout (big-endian), the module id
 * (big-endian) and the name (16 bytes). Entries `first` on, at most `most` of them: ep0.c's pages of
 * MODWERK_MISSING_PAGE are 4 + 24 x count bytes, never a whole number of 64-byte packets. */
int modwerk_fxmap_describe(unsigned id, uint32_t *module, uint16_t *layout, char *name);
unsigned modwerk_dsp_missing_list(uint8_t *out, unsigned first, unsigned most)
{
    fx_set used = modwerk_fxmap_used();
    unsigned n = 0, seen = 0;
    for (unsigned k = 0; k < MODWERK_FX_IDS && n < most; ++k) {
        uint32_t module;
        uint16_t layout;
        char name[16];
        if (!fx_in(used, k) || !modwerk_fxmap_describe(k, &module, &layout, name) || owner[k] == module) continue;
        if (seen++ < first) continue;
        uint8_t *e = out + 4u + 24u * n++;
        e[0] = (uint8_t)k, e[1] = 0, e[2] = (uint8_t)(layout >> 8), e[3] = (uint8_t)layout;
        for (unsigned i = 0; i < 4u; ++i) e[4 + i] = (uint8_t)(module >> (24 - 8 * i));
        for (unsigned i = 0; i < 16u; ++i) e[8 + i] = (uint8_t)name[i];
    }
    out[0] = 'M', out[1] = 'W', out[2] = 'M', out[3] = (uint8_t)n;
    return 4u + 24u * n;
}
/* The host side of each core's HI08 (sdk/octabam/tools/emu/ot_emu/dsp.h): the
 * window at 0x20000000 shows the core the GPIO byte selects, one byte register
 * per 4-byte stride in the low byte of a 16-bit access. */
#define DSP_SELECT (*(volatile uint8_t *)0xfc0a400cu)
#define HOST_ISR (*(volatile uint16_t *)0x20000008u) /* bit 0 RXDF, 3 HF2, 4 HF3 */
#define HOST_RXL (*(volatile uint16_t *)0x2000001cu) /* a read takes the word */
#define HOST_TXL (*(volatile uint16_t *)0x2000001cu) /* a write gives the core a word */
#define EDMA_ES (*(volatile uint32_t *)0xfc044004u) /* bit 31 VLD, 11-8 the channel in error */
#ifndef MODWERK_HOST
/* The receiver's answer (dsp_receiver.asm): HF2 toggles for each packet handled, HF3 says refused.
 * Called from the frame-transfer interrupt at its end, where core 0 is selected. Never select core 1
 * there (AB2 froze on that alone): its flags are the ones dsp_core1.s read at state 3. */
volatile uint32_t modwerk_dsp_last_flags; /* the last read, core 0 in bits 0-1, core 1 in 8-9 */
extern volatile uint16_t dl_c1_isr;
unsigned modwerk_dsp_flags(unsigned core)
{
    unsigned isr = core ? dl_c1_isr : HOST_ISR;
    modwerk_dsp_last_flags = (modwerk_dsp_last_flags & ~(3u << 8 * core)) | (isr >> 3 & 3u) << 8 * core;
    return isr >> 3 & 3u;
}
#endif

/* Frames stop only when a DSP stops, so the sys task watches them, outside the
 * frame path: frames still for half a second while the loader has a transfer
 * in flight is a hang (counted, and the loader shut off until a reboot). */
#define STALL_TICKS 30u
static uint32_t seen_frames, still;
int modwerk_dsp_stalled(uint32_t frames, int busy)
{
    if (frames != seen_frames || !busy) { seen_frames = frames; still = 0; return 0; }
    return ++still == STALL_TICKS;
}
volatile uint32_t modwerk_dsp_stalls, modwerk_dsp_drained; /* hangs seen; words taken back from the DSPs */
volatile uint32_t modwerk_dsp_edma_errors, modwerk_dsp_edma_es; /* our transfers that eDMA refused; its last ES */
#ifndef MODWERK_HOST
extern volatile uint32_t dl_frames, dl_phase, dl_rx_nbytes, dl_residency_enabled;
extern volatile uint32_t dl_c1_phase, dl_c1_sent; /* dsp_core1.s: core 1's packet after stock's state 2 */
int dl_job_status(unsigned core);
void dl_abort(void);
/* The last stall, in battery RAM after crash.c's record, so it survives the power cycle a stopped DSP needs: why
 * (1 frames stopped, 2 eDMA refused a transfer, 0 a test), the tick, the loader's report as it stood (dsp.c and
 * status.c, report_words of them), each core's last packet header (magic, sequence, opcode, core, count or id,
 * offset or init, checksum, proc), what each track ran, and the host port's status: the selected core's ISR now
 * (RXDF bit 0 set: the core holds a word the ColdFire never took, so it waits at P:$97 for ever) and core 1's
 * as dsp_core1.s last read it. Read only: selecting a core here could break stock's transfer. */
struct stall { uint32_t magic, count, reason, ticks, report_words, report[96]; uint16_t tx[2][8]; uint8_t live[16]; uint16_t isr[2]; };
#define STALL ((volatile struct stall *)0x100ff900u)
typedef char stall_fits_battery_ram[0x100ff900u + sizeof(struct stall) <= 0x100fff00u ? 1 : -1];
typedef char stall_holds_report[sizeof ((struct stall *)0)->report / 4u >= DSP_REPORT_WORDS ? 1 : -1]; /* 66 + status.c's 12, more past 32 ids */
unsigned modwerk_dsp_report(uint32_t *out);
extern volatile uint32_t modwerk_dsp_watch_ticks;
void modwerk_dsp_stall_record(unsigned reason)
{
    volatile struct stall *s = STALL;
    uint32_t count = s->magic == 0x4d575354u ? s->count + 1 : 1; /* "MWST" */
    s->magic = 0;
    s->reason = reason, s->ticks = modwerk_dsp_watch_ticks;
    s->report_words = modwerk_dsp_report((uint32_t *)(uintptr_t)s->report);
    for (unsigned c = 0; c < 2; ++c) for (unsigned i = 0; i < 8; ++i) s->tx[c][i] = dl_tx[c][i];
    for (unsigned i = 0; i < 16; ++i) s->live[i] = LIVE_FX[i];
    s->isr[0] = HOST_ISR, s->isr[1] = dl_c1_isr;
    s->count = count, s->magic = 0x4d575354u;
}
/* Best effort: take whatever a core still offers the host (a DSP waiting to hand
 * over words waits at P:$97 for ever), put the transfer machine's channel 1 back,
 * forget the transfer and let the next frame interrupt in, as stock state 7 does. */
static void recover(unsigned reason)
{
    modwerk_dsp_stall_record(reason); /* before anything below changes the loader's state */
    uint32_t sr = modwerk_machine_mask();
    if ((dl_phase || dl_c1_phase) && EDMA_ES >> 31) {
        /* eDMA refused our transfer, so the core's DMA still waits for the words its host command
         * promised: give it what is left by hand (all of it after a configuration error, which
         * stops the channel at its start), then clear the error. hooks.s: phase 1 writes core 0;
         * dsp_core1.s writes core 1. */
        uint32_t nbytes = *(volatile uint32_t *)0xfc045008u, left = (*(volatile uint16_t *)0xfc045014u & 0x1ffu) * nbytes / 2u;
        const volatile uint16_t *from = (const volatile uint16_t *)*(volatile uint32_t *)0xfc045000u;
        modwerk_dsp_edma_es = EDMA_ES;
        DSP_SELECT = dl_c1_phase ? 1u : (uint8_t)(dl_phase - 1u);
        for (uint32_t i = 0, spin = 0; i < left && spin < 100000u; ++i) {
            for (spin = 0; !(HOST_ISR & 2u) && spin < 100000u; ++spin) {} /* TXDE */
            HOST_TXL = from[i];
        }
        *(volatile uint8_t *)0xfc04401du = 0; /* CERR: channel 0 */
        modwerk_dsp_edma_errors = modwerk_dsp_edma_errors + 1;
    } else if ((dl_phase || dl_c1_phase) && !(*(volatile uint16_t *)0xfc04501eu & 0x80u)) {
        /* No error, but channel 0 never finished (TCD0 not DONE): the selected DSP never took the
         * words, so the transfer waits on the host handshake for ever. Cancel it to free the channel
         * and the host port; the job is abandoned and the loader shut off below. */
        modwerk_dsp_edma_es = EDMA_ES;
        *(volatile uint32_t *)0xfc044000u |= 1u << 17; /* eDMA CR: cancel the running transfer */
    }
    for (unsigned core = 0; core < 2; ++core) {
        DSP_SELECT = (uint8_t)core;
        for (unsigned n = 0; n < 1024u && HOST_ISR & 1u; ++n) { (void)HOST_RXL; modwerk_dsp_drained = modwerk_dsp_drained + 1; }
    }
    DSP_SELECT = 0;
    if (dl_phase && dl_rx_nbytes) *(volatile uint32_t *)0xfc045028u = dl_rx_nbytes; /* none saved with --dsp-hook usbin */
    /* Abandoned at state 3, stock's chain resumes with the next frame: its interrupt restarts at state 0. */
    dl_phase = dl_c1_phase = 0;
    dl_abort();
    dl_residency_enabled = 0;
    *(volatile uint8_t *)0xfc04801du = 1; /* INTC0 CIMR: the frame interrupt */
    modwerk_machine_unmask(sr);
    modwerk_dsp_stalls = modwerk_dsp_stalls + 1;
    ((void (*)(const char *, unsigned))0x4005a2b8u)("DSP STOPPED", 0x30);
}
#endif
/* Development: one PROBE packet to a core (the dev PROBE request), for finding on
 * the unit which step stops a core: build_core.py --dsp-probe A (delivery only),
 * B (the receiver checks and answers) or neither (the whole receiver). */
volatile uint32_t modwerk_dsp_watch_ticks, modwerk_dsp_probes, modwerk_dsp_probes_ok, modwerk_dsp_probes_failed;
static int probing = -1;
int modwerk_dsp_probe(unsigned core)
{
#ifndef MODWERK_HOST
    if (core > 1 || probing >= 0 || !dl_publication_idle() || !dl_command_start(core, DL_PROBE, 0, 0, 0)) return 0;
#endif
    probing = (int)core;
    modwerk_dsp_probes = modwerk_dsp_probes + 1;
    return 1;
}
/* The receiver's first P word that read back wrong (dsp_receiver.asm, three P words at
 * MODWERK_DSP_MISS0/1): its table offset, the word the packet wrote, the word P held. After
 * a core refuses a packet, and once the manager is idle, the tick reads them back a bit a
 * packet with PEEK (its answer is HF3): the host never reads a DSP word. It reads from two
 * words earlier: tablebase's operand, the table address, is a known word that checks PEEK. */
#define MISS_WORDS 5u
volatile int32_t modwerk_dsp_miss_core = -1;  /* the core read, -1 none yet */
volatile uint32_t modwerk_dsp_miss_bits, modwerk_dsp_miss[MISS_WORDS]; /* bits read (120: done); table, rts, the record */
/* The load meter's last published window (dsp_receiver.asm, five P words at MODWERK_DSP_METER0/1):
 * its serial, the least, most and summed idle counts of core 0's main loop, and the frames with none.
 * Read the same way, on request (the development METER request). */
volatile int32_t modwerk_dsp_meter_core = -1;
volatile uint32_t modwerk_dsp_meter_bits, modwerk_dsp_meter[MISS_WORDS];
#ifdef MODWERK_DSP_XWATCH
/* Probe X (dsp_loader.py PROBES['X']): the watch's four P words after the meter's window (changed, the first's address
 * and value, passes), read on request (dev.c 26) ahead of the status page's meter reads, which never pause. */
volatile int32_t modwerk_dsp_xwatch_core = -1;
volatile uint32_t modwerk_dsp_xwatch_bits, modwerk_dsp_xwatch[4];
static volatile int xwatch_wanted = -1;
int modwerk_dsp_xwatch_read(unsigned core)
{
    if (core > 1 || xwatch_wanted >= 0) return 0;
    xwatch_wanted = (int)core;
    return 1;
}
#endif
#ifndef MODWERK_HOST
extern volatile uint32_t dl_rejected[2];
static volatile int meter_wanted = -1;
static unsigned meter_first, meter_words;
/* Words first .. first + words - 1 of core's window (into modwerk_dsp_meter[first..]): 24 bits a tick. */
int modwerk_dsp_meter_read(unsigned core, unsigned first, unsigned words)
{
    if (core > 1 || meter_wanted >= 0 || !words || first + words > MISS_WORDS) return 0;
    meter_first = first, meter_words = words;
    meter_wanted = (int)core;
    return 1;
}
static int peeking = -1;
static unsigned peek_from, peek_words, peek_inflight;
static volatile uint32_t *peek_into, *peek_bits;
static uint32_t peek_seen[2];
static void peek_tick(void)
{
    static const uint16_t record[2] = {MODWERK_DSP_MISS0, MODWERK_DSP_MISS1}, meter[2] = {MODWERK_DSP_METER0, MODWERK_DSP_METER1};
    if (peeking < 0) {
        for (unsigned c = 0; c < 2 && peeking < 0; ++c)
            if (dl_rejected[c] != peek_seen[c] && probing < 0 && dl_publication_idle() && dl_job_status(c) == -2) {
                peek_seen[c] = dl_rejected[c];
                peeking = (int)c;
                modwerk_dsp_miss_core = (int32_t)c;
                modwerk_dsp_miss_bits = 0;
                for (unsigned i = 0; i < MISS_WORDS; ++i) modwerk_dsp_miss[i] = 0;
                peek_from = record[c] - 2u, peek_into = modwerk_dsp_miss, peek_bits = &modwerk_dsp_miss_bits, peek_words = MISS_WORDS;
            }
#ifdef MODWERK_DSP_XWATCH
        if (peeking < 0 && xwatch_wanted >= 0 && probing < 0 && dl_publication_idle() && dl_job_status((unsigned)xwatch_wanted) == -2) {
            peeking = xwatch_wanted;
            xwatch_wanted = -1;
            modwerk_dsp_xwatch_core = peeking;
            modwerk_dsp_xwatch_bits = 0;
            for (unsigned i = 0; i < 4u; ++i) modwerk_dsp_xwatch[i] = 0;
            peek_from = meter[peeking] + 7u, peek_into = modwerk_dsp_xwatch, peek_bits = &modwerk_dsp_xwatch_bits, peek_words = 4;
        }
#endif
        if (peeking < 0 && meter_wanted >= 0 && probing < 0 && dl_publication_idle() && dl_job_status((unsigned)meter_wanted) == -2) {
            peeking = meter_wanted;
            meter_wanted = -1;
            modwerk_dsp_meter_core = peeking;
            modwerk_dsp_meter_bits = 0;
            for (unsigned i = meter_first; i < meter_first + meter_words; ++i) modwerk_dsp_meter[i] = 0; /* only these: another read's stay */
            peek_from = meter[peeking] + meter_first, peek_into = modwerk_dsp_meter + meter_first;
            peek_bits = &modwerk_dsp_meter_bits, peek_words = meter_words;
        }
        if (peeking < 0) return;
    }
    unsigned c = (unsigned)peeking, bit = *peek_bits;
    if (peek_inflight) { /* only its own job: the manager's in this core's channel is never read or released here */
        int status = dl_job_status(c);
        if (!status) return; /* in flight */
        peek_inflight = 0;
        if (status != -2) {  /* answered: refused (HF3) is a 1 */
            if (status < 0) peek_into[bit / 24u] |= 1u << bit % 24u;
            dl_job_release(c);
            *peek_bits = ++bit;
            if (bit == 24u * peek_words) { peeking = -1; return; }
        }
    }
    /* A pick, a Part change or a probe goes first: the read waits between bits, never holding the core's
     * channel while the manager publishes (the status page reads all the time). */
    if (!dl_publication_idle() || probing >= 0) return;
    /* Bits 16-23 come from the word shifted right by 8 (the packet's mask is 16 bits). */
    unsigned b = bit % 24u;
    if (dl_command_start(c, DL_PEEK, b >= 16u, peek_from + bit / 24u, b >= 16u ? 1u << (b - 8u) : 1u << b)) peek_inflight = 1;
    else peeking = -1; /* the manager or a probe took the core: keep what was read */
}
#endif
#if !defined(MODWERK_HOST) || defined(MODWERK_HOST_SELFTEST) /* test_selftest.c runs it on the host */
/* The self-test (PROJ > MODWERK > SELF TEST, or dev.c request 21; owner, 11 October 2026): with the transport
 * stopped, by the live FX array only (never a Part), in about 3 s for every eight DSP modules:
 * 0. playback: PLAY, as the panel presses it; everything below runs with the pattern playing, and each placed
 *    effect's knobs are swept in its track's live lane (page 1 fast, page 2 slowly, the lanes locks and LFOs
 *    write; the Part is not touched), so the effects run moving, on whatever the tracks play, samples or none;
 * 1. configuration: every live module's stock-code sites still hold its patches;
 * 2. together: the DSP modules in batches, one a track, the dearest first and core 0's tracks (T5-T8, it also
 *    mixes) first, so a batch reaches the ledger's limit; each placed as soon as the one before runs bound;
 *    one the ledger refuses (its core full) goes first into the next batch. A batch's first module is tried alone
 *    (owner, 14 October 2026): on T5, then on T1, in FX2 then FX1 as its slots allow, beside whatever the Part runs;
 *    refused on all of those, the same again with every other slot of its core NONE (stock and module effects
 *    alike, in the live array only), so the Part's own reverbs and delays never fail a module that fits a core of
 *    its own. Only a module no core takes even then cannot run at all (SELFTEST_NOT_LOADED). The rest of that
 *    batch keeps the emptied core and fills the remaining tracks; one refused waits for the next batch, where it
 *    is tried alone, so a batch never fails for its own sake. Each batch runs until both cores' meters have a
 *    fresh window: no core and not the CPU past 90 %, frames running, none late (an interrupt held off too long
 *    stops the DSPs). Then each placed module's code
 *    is summed where it runs (dsp_receiver.asm's SUM) against its package. Every module must have run;
 * 3. stress: twice, the last batch cleared (its modules back to what the Part runs there, an emptied core left
 *    empty) and placed again at once (uploads and retirements while it all runs);
 * then each track gets back what it ran and its lanes, and STOP. Fails as well on a stall or a loader rejection,
 * error or rollback. NO cancels it (all of that is restored as well). */
#include "selftest.h"
volatile struct selftest modwerk_selftest;
#ifdef MODWERK_HOST
uint8_t modwerk_test_lanes[8 * 72];
volatile uint32_t modwerk_test_playing;
#define LIVE_SET ((volatile uint8_t *)modwerk_test_live_fx)
#define LANE(t) ((volatile uint8_t *)modwerk_test_lanes + 72u * (t))
#define PLAYING (modwerk_test_playing == 1u)
#else
#define LIVE_SET ((volatile uint8_t *)0x80000ec4u)
#define LANE(t) ((volatile uint8_t *)(0x80000810u + 72u * (t))) /* a track's live lane (Octabam's PARAM_PAGES.md 5a') */
#define PLAYING (*(volatile uint32_t *)0x800065b8u == 1u)
#endif
int dl_bound(unsigned core, unsigned id);           /* manager.c (build_core.py's edit): a slot there runs bound code */
extern volatile uint8_t dl_intended_override[16];   /* manager.c (build_core.py's edit): what a parked slot waits for */
unsigned modwerk_runtime_intact(void);              /* loader.c: live modules whose sites hold */
extern volatile uint32_t dl_residency_enabled;      /* manager.c: 0 once a stall shut the loader off (recover) */
extern volatile uint32_t modwerk_status[];          /* status.c: [0] the CPU, [2] the T5-8 peak, [4] the T1-4 peak */
extern volatile uint32_t modwerk_status_reads, modwerk_status_fast; /* status.c: meter windows read; peaks only */
extern volatile uint32_t dl_residency_rollbacks, dl_residency_failures;
extern volatile uint32_t dl_frame_gap;            /* transfer.c (build_core.py's edit): the longest time between frames */
extern volatile uint32_t modwerk_modset_result, modwerk_modset_count; /* modset.c: the card's set */
int dl_placed(unsigned core, unsigned id);        /* manager.c: where id's code sits on core, -1 not placed */
int dl_sum_start(unsigned core, unsigned offset, unsigned count, uint32_t expected); /* transfer.c: SUM */
static const uint8_t track_order[8] = {4, 5, 6, 7, 0, 1, 2, 3}; /* core 0's tracks first: it mixes as well */
static uint8_t chk_id[2][8], batch_ids[8];
/* The first failure's module: by its effect id (k < MODWERK_FX_IDS), or by its runtime id alone (a module without
 * an effect: k is MODWERK_FX_IDS). */
static void blame(unsigned k, uint32_t module)
{
    volatile struct selftest *t = &modwerk_selftest;
    if (t->culprit) return;
    t->culprit = k < MODWERK_FX_IDS ? owner[k] : module;
    for (unsigned i = 0; i < 16u; ++i) t->culprit_name[i] = k < MODWERK_FX_IDS ? owner_name[k][i] : 0;
    for (unsigned j = 0; module && k >= MODWERK_FX_IDS && j < MODWERK_FX_IDS; ++j)
        if (owner[j] == module) for (unsigned i = 0; i < 16u; ++i) t->culprit_name[i] = owner_name[j][i];
}
static unsigned chk_n[2], chk_i[2], chk_at[2], chk_busy[2];
/* What words [from, from + n) of p's code sum to on core c, placed at table offset `offset`: relocated as
 * transfer.c's packet() wrote them. */
static uint32_t code_sum(unsigned c, unsigned p, unsigned from, unsigned n, unsigned offset)
{
    const struct code *k = &dl_codes[c][p];
    uint32_t base = dl_pool_base[c] + offset, sum = 0;
    for (unsigned i = from; i < from + n; ++i) {
        uint32_t v = k->words[i];
        for (unsigned r = 0; r < k->relocation_count; ++r)
            if ((k->relocations[r] & 0x7fffu) == i) v = k->relocations[r] & 0x8000u ? v - base : v + base;
        sum += v & 0xffffffu;
    }
    return sum & 0xffffffu;
}
/* controller_board.c: a live package requires a base feature that cannot come up this boot (the key bus with a DSP
 * core's state lost). A self-test fails with it (SELFTEST_FEATURE), so a trial is not kept with a module that can only
 * pass its audio, and the record's refusal says so (RUNTIME_FEATURE) while it holds and the loader has no refusal of its
 * own to report: the site explains a rejected sync and retries RUNTIME_BUSY from that field, so the loader's own
 * refusal always comes first. 0 on a base without the board. */
#ifndef MODWERK_HOST_SELFTEST
__attribute__((weak)) int modwerk_controller_keybus_lost(void) { return 0; }
#else
int modwerk_controller_keybus_lost(void);
#endif
void modwerk_selftest_refresh(void)
{
    modwerk_selftest.saved = modwerk_modset_result, modwerk_selftest.saved_count = modwerk_modset_count;
    modwerk_selftest.live = modwerk_runtime_active();
    { extern volatile uint32_t modwerk_flash_refusal; uint32_t loader = modwerk_runtime_refusal();
      modwerk_selftest.refusal = modwerk_flash_refusal ? 100u + modwerk_flash_refusal : /* flash.h: a refused or failed base write, apart from the loader's */
          loader ? loader : modwerk_controller_keybus_lost() ? (uint32_t)RUNTIME_FEATURE : (uint32_t)RUNTIME_OK; }
}
enum { PLACE, WAIT, HOLD, CODE, CLEAR, EMPTY, RESET };
/* st_live: what each slot ran before the test; st_base: the batch's background, that with a core the batch emptied
 * NONE; st_want: st_base and the batch's modules. st_used: the tracks the batch has taken (bits); st_try: its first
 * module's attempt (alone_slot); st_slot: where the module being placed goes; st_back: the restore's half. */
static uint8_t st_live[16], st_base[16], st_want[16], st_queue[MODWERK_FX_IDS], st_later[MODWERK_FX_IDS];
static unsigned st_queued, st_deferred, st_used, st_try, st_slot, st_back, st_batch, st_step, st_ticks, st_round;
static uint32_t st_counted, st_frames, st_failures, st_reads;
volatile uint32_t modwerk_selftest_key;
void modwerk_post_key(unsigned code, int pressed); /* boot.c: through the panel's byte ringer */
static uint8_t st_lanes[8][72];
static void press(unsigned code) { modwerk_selftest_key = code + 1u; modwerk_post_key(code, 1); modwerk_post_key(code, 0); }
/* The FX lane bytes of track t: page 1 FX1 18-23, FX2 24-29; page 2 FX1 0x32-0x37, FX2 0x38-0x3d. */
static int fx_lane_byte(unsigned b) { return (b >= 18u && b < 30u) || (b >= 0x32u && b < 0x3eu); }
static unsigned triangle(unsigned x) { x &= 255u; return x < 128u ? x : 255u - x; }
/* Each placed effect's knobs moving: page 1 a step every other tick, page 2 one every 16. */
static void modulate(const uint8_t *want)
{
    for (unsigned i = 0; i < 16u; ++i) {
        if (want[i] == st_live[i] || !want[i]) continue; /* a slot the test emptied runs NONE */
        volatile uint8_t *lane = LANE(i & 7u);
        unsigned p1 = i < 8u ? 18u : 24u, p2 = i < 8u ? 0x32u : 0x38u;
        for (unsigned k = 0; k < 6u; ++k) {
            lane[p1 + k] = (uint8_t)triangle(st_ticks * 3u + 41u * k);
            lane[p2 + k] = (uint8_t)triangle(st_ticks / 16u + 53u * k);
        }
    }
}
static void restore_lanes(void)
{
    for (unsigned t = 0; t < 8u; ++t) for (unsigned b = 0; b < 72u; ++b) if (fx_lane_byte(b)) LANE(t)[b] = st_lanes[t][b];
}
static int st_played;
static uint32_t counted(void) { return modwerk_dsp_stalls + dl_rejected[0] + dl_rejected[1] + dl_errors + dl_residency_rollbacks; }
static unsigned core_of_slot(unsigned i) { return (i & 7u) < 4u ? 1u : 0u; }
static int settled(const uint8_t *want) /* the manager idle, and every slot running `want` with its code bound */
{
    if (!dl_publication_idle()) return 0;
    for (unsigned i = 0; i < 16u; ++i)
        if (LIVE_SET[i] != want[i] || (want[i] < MODWERK_FX_IDS && !dl_catalog[want[i]].resident && !dl_bound(core_of_slot(i), want[i]))) return 0;
    return 1;
}
/* Settled, judged at least seven ticks after the change, once the manager has taken it: a set that only takes code
 * off looks settled before the manager has seen it, and its next step would then meet the old code still loaded. */
static int taken(const uint8_t *want) { return st_ticks > 6u && settled(want); }
static void set_live(const uint8_t *want)
{
    for (unsigned i = 0; i < 16u; ++i) {
        dl_intended_override[i] = want[i] != st_live[i] ? want[i] : 255u; /* a parked slot waits for this, not the Part */
        if (LIVE_SET[i] != want[i]) ((volatile uint8_t *)LIVE_SET)[i] = want[i];
    }
}
static void finish(void)
{
    volatile struct selftest *t = &modwerk_selftest;
    for (unsigned i = 0; i < 16u; ++i) dl_intended_override[i] = 255u;
    modwerk_status_fast = 0;
    if (counted() != st_counted) t->failed |= SELFTEST_COUNTED;
    for (unsigned i = 0; i < 16u; ++i) if (LIVE_SET[i] != st_live[i]) t->failed |= SELFTEST_NOT_BACK;
    t->gap = dl_frame_gap;
    if (dl_frame_gap > SELFTEST_FRAME_LIMIT) t->failed |= SELFTEST_LATE;
    if (modwerk_controller_keybus_lost()) t->failed |= SELFTEST_FEATURE;
    t->phase = 0, t->state = t->failed ? SELFTEST_FAILED : SELFTEST_PASSED, source_frozen = 0;
}
/* Playing: the live set and the lanes as the Part has them now, then the checks. */
static void started(volatile struct selftest *t)
{
    for (unsigned i = 0; i < 16u; ++i) st_live[i] = st_base[i] = st_want[i] = LIVE_SET[i];
    for (unsigned tr = 0; tr < 8u; ++tr) for (unsigned b = 0; b < 72u; ++b) st_lanes[tr][b] = LANE(tr)[b];
    st_counted = counted(), st_used = st_try = st_batch = st_step = st_ticks = st_round = 0;
    dl_frame_gap = 0;
    t->phase = st_queued ? SELFTEST_TOGETHER : SELFTEST_RESTORE;
}
int modwerk_selftest_start(void)
{
    volatile struct selftest *t = &modwerk_selftest;
    if (t->state == SELFTEST_RUNNING || !modwerk_machine_stopped() || !dl_publication_idle() || rebinding || picks_in != picks_out) return 0;
    t->failed = t->ran = t->peak[0] = t->peak[1] = t->cpu = t->done = t->gap = t->culprit = 0;
    for (unsigned i = 0; i < 16u; ++i) t->culprit_name[i] = 0;
    for (unsigned i = 0; i < 8u; ++i) t->track[i] = 0;
    st_queued = st_deferred = 0;
    for (unsigned k = 0; k < MODWERK_FX_IDS; ++k) if (owner[k] && dl_catalog[k].words) st_queue[st_queued++] = (uint8_t)k;
    for (unsigned a = 1; a < st_queued; ++a) /* the dearest first, so a batch reaches the ledger's limit */
        for (unsigned b = a; b && dl_catalog[st_queue[b]].cycles > dl_catalog[st_queue[b - 1]].cycles; --b) {
            uint8_t x = st_queue[b]; st_queue[b] = st_queue[b - 1], st_queue[b - 1] = x;
        }
    t->modules = modwerk_runtime_active(), t->dsp = st_queued, t->intact = modwerk_runtime_intact(), t->total = st_queued + 2u;
    if (t->intact != t->modules) t->failed |= SELFTEST_BROKEN, blame(MODWERK_FX_IDS, modwerk_runtime_broken());
    /* A stall earlier this boot shut the loader off: no module's DSP code loads until a restart, so nothing here can
     * pass (a release image passed with it so on the owner's MKII, 24 October 2026). */
    if (!dl_residency_enabled) t->failed |= SELFTEST_STOPPED;
    for (unsigned i = 0; i < 16u; ++i) st_live[i] = st_base[i] = st_want[i] = LIVE_SET[i];
    for (unsigned tr = 0; tr < 8u; ++tr) for (unsigned b = 0; b < 72u; ++b) st_lanes[tr][b] = LANE(tr)[b];
    st_counted = counted(), st_ticks = st_step = st_back = 0, st_played = 0;
    modwerk_status_fast = 1;
    t->phase = SELFTEST_CONFIGURATION, t->state = SELFTEST_RUNNING, source_frozen = 1; /* the tick presses PLAY */
    return 1;
}
void modwerk_selftest_abort(void)
{
    if (modwerk_selftest.state != SELFTEST_RUNNING) return;
    modwerk_selftest.failed |= SELFTEST_ABORTED;
    modwerk_selftest.phase = SELFTEST_RESTORE, st_ticks = 0;
}
static void pop(void) { for (unsigned k = 1; k < st_queued; ++k) st_queue[k - 1] = st_queue[k]; --st_queued; }
/* A batch's first module alone, attempt n (slots: 1 FX1, 2 FX2): FX2 then FX1 as its slots allow, each on T5 (core 0)
 * then T1 (core 1), beside the Part's effects; then all of those again with every other slot of that core NONE
 * (*empty). Its slot (0-15), or 16 after the last. */
static unsigned alone_slot(unsigned slots, unsigned n, int *empty)
{
    unsigned kinds = (slots & 1u) + (slots >> 1 & 1u), k = kinds ? n % (2u * kinds) : 0;
    *empty = n >= 2u * kinds;
    if (n >= 4u * kinds) return 16u;
    return ((slots & 2u) && k < 2u ? 8u : 0u) + (k & 1u ? 0u : 4u);
}
static unsigned next_track(void) /* the batch's next track: core 0's first */
{
    for (unsigned k = 0; k < 8u; ++k) if (!(st_used >> track_order[k] & 1u)) return track_order[k];
    return 8u;
}
static void together(volatile struct selftest *t)
{
    if (st_step == PLACE) {
        if (!st_queued || st_used == 0xffu) { /* the batch is full or nothing is left: let it run */
            if (st_batch) st_step = HOLD, st_ticks = 0, st_frames = dl_frames, st_reads = ~0u;
            else st_step = CLEAR, st_back = 0, st_ticks = 0;
            return;
        }
        if (!dl_publication_idle()) return;
        unsigned id = st_queue[0], slots = dl_catalog[id].slots;
        int empty = 0;
        if (st_batch) st_slot = (slots & 2u ? 8u : 0u) + next_track();
        else if ((st_slot = alone_slot(slots, st_try, &empty)) > 15u) { /* no core runs it, even with nothing else */
            t->failed |= SELFTEST_NOT_LOADED, t->done = t->done + 1, blame(id, 0), pop(), st_try = 0;
            return;
        }
        if (empty) { /* the core's every slot NONE first: the allocator places new code beside live code */
            for (unsigned i = 0; i < 16u; ++i) if (core_of_slot(i) == core_of_slot(st_slot)) st_base[i] = st_want[i] = 0;
            set_live(st_want), st_step = EMPTY, st_ticks = 0;
            return;
        }
        st_want[st_slot] = (uint8_t)id, set_live(st_want), st_failures = dl_residency_failures, st_step = WAIT, st_ticks = 0;
        return;
    }
    if (st_step == EMPTY) {
        if (taken(st_want)) st_want[st_slot] = st_queue[0], set_live(st_want), st_failures = dl_residency_failures, st_step = WAIT, st_ticks = 0;
        else if (st_ticks > 240u) ++st_try, st_step = RESET, st_ticks = 0; /* it would not empty: the next attempt */
        return;
    }
    if (st_step == RESET) { /* the Part's effects back, as it ran them, before the next attempt */
        for (unsigned i = 0; i < 16u; ++i) st_base[i] = st_want[i] = st_live[i];
        set_live(st_want);
        if (taken(st_want) || st_ticks > 300u) st_step = PLACE;
        return;
    }
    if (st_step == WAIT) {
        unsigned id = st_queue[0], i = st_slot;
        /* A refusal first: the manager leaves code loaded until it needs the room, so a module it refused here can
         * still be bound from an earlier run and read as settled (owner's MKII, 20 October 2026: E-Verb refused on
         * T6 for cycles beside Air Chorus on T5, counted as run, then failed the stress as refused). */
        int refused = dl_residency_failures != st_failures && dl_publication_idle();
        if (!refused && settled(st_want)) {
            if (st_batch < 8u) batch_ids[st_batch] = (uint8_t)id;
            t->track[i & 7u] = (uint8_t)id, t->ran = t->ran + 1, t->done = t->done + 1, ++st_batch;
            st_used |= 1u << (i & 7u), st_try = 0;
        } else if (refused || st_ticks > 120u) {
            st_want[i] = st_base[i], set_live(st_want); /* refused: its core is full */
            if (!st_batch) { ++st_try, st_step = RESET, st_ticks = 0; return; } /* alone: the next attempt */
            st_later[st_deferred++] = (uint8_t)id, st_used |= 1u << (i & 7u); /* first in the next batch, alone */
        } else return;
        pop(), st_step = PLACE;
        return;
    }
    if (st_step == HOLD) { /* until both cores' meters have a fresh window with everything bound */
        if (st_reads == ~0u) { if (settled(st_want)) st_reads = modwerk_status_reads, st_ticks = 0; return; }
        if (st_ticks > 6u && modwerk_status[4] > t->peak[0]) t->peak[0] = modwerk_status[4];
        if (st_ticks > 6u && modwerk_status[2] > t->peak[1]) t->peak[1] = modwerk_status[2];
        if (modwerk_status[0] > t->cpu) t->cpu = modwerk_status[0];
        modulate(st_want);
        if (modwerk_status_reads - st_reads < 3u && st_ticks < 240u) return;
        /* what this batch did: frames stopped or late, a core or the CPU past 90 %: its dearest module named */
        uint32_t before = t->failed;
        if (dl_frames == st_frames) t->failed |= SELFTEST_STOPPED;
        if (dl_frame_gap > SELFTEST_FRAME_LIMIT) t->failed |= SELFTEST_LATE;
        if (t->peak[0] > 900u || t->peak[1] > 900u) t->failed |= SELFTEST_PEAK;
        if (t->cpu > 900u) t->failed |= SELFTEST_CPU;
        if (t->failed != before && st_batch) blame(batch_ids[0], 0);
        chk_n[0] = chk_n[1] = chk_i[0] = chk_i[1] = chk_at[0] = chk_at[1] = chk_busy[0] = chk_busy[1] = 0;
        for (unsigned i = 0; i < 16u; ++i) { /* each placed module once on each core it runs on */
            unsigned core = core_of_slot(i), seen = 0;
            if (st_want[i] == st_live[i] || !st_want[i]) continue;
            for (unsigned k = 0; k < chk_n[core]; ++k) seen |= chk_id[core][k] == st_want[i];
            if (!seen && chk_n[core] < 8u) chk_id[core][chk_n[core]++] = st_want[i];
        }
        st_step = CODE, st_ticks = 0;
        return;
    }
    if (st_step == CODE) { /* both cores at once, a 256-word chunk a packet */
        unsigned left = 0;
        for (unsigned c = 0; c < 2u; ++c) {
            if (chk_busy[c]) {
                int s = dl_job_status(c);
                if (!s) { left = 1; continue; }
                dl_job_release(c), chk_busy[c] = 0;
                if (s < 0) t->failed |= SELFTEST_CORRUPT, blame(chk_id[c][chk_i[c]], 0);
                if ((chk_at[c] += 256u) >= dl_codes[c][chk_id[c][chk_i[c]]].count) ++chk_i[c], chk_at[c] = 0;
            }
            if (chk_i[c] >= chk_n[c]) continue;
            left = 1;
            unsigned id = chk_id[c][chk_i[c]], words = dl_codes[c][id].count;
            int at = dl_placed(c, id);
            if (at < 0 || !words) { ++chk_i[c], chk_at[c] = 0; continue; }
            unsigned n = words - chk_at[c] < 256u ? words - chk_at[c] : 256u;
            if (dl_publication_idle() && dl_job_status(c) == -2 &&
                dl_sum_start(c, (unsigned)at + chk_at[c], n, code_sum(c, id, chk_at[c], n, (unsigned)at))) chk_busy[c] = 1;
        }
        if (!left || st_ticks > 600u) st_step = CLEAR, st_back = 0, st_ticks = 0; /* ten seconds at most: a channel never free is not a verdict */
        return;
    }
    /* CLEAR: the next batch starts with the deferred ones; after the last, the stress rounds use this batch */
    if (st_deferred) {
        for (unsigned k = st_queued; k--;) st_queue[k + st_deferred] = st_queue[k];
        for (unsigned k = 0; k < st_deferred; ++k) st_queue[k] = st_later[k];
        st_queued += st_deferred, st_deferred = 0;
    }
    if (st_queued) { /* the modules off first, then an emptied core's effects back: their code arrives once the modules' left */
        if (!st_back) set_live(st_base), st_back = 1, st_ticks = 0;
        if (st_back == 1u) { if (!taken(st_base) && st_ticks <= 300u) return; set_live(st_live), st_back = 2, st_ticks = 0; }
        if (!taken(st_live)) return;
        for (unsigned i = 0; i < 16u; ++i) st_base[i] = st_want[i] = st_live[i];
        for (unsigned i = 0; i < 8u; ++i) t->track[i] = 0;
        st_used = st_try = st_batch = st_back = 0, st_step = PLACE;
        return;
    }
    t->phase = SELFTEST_STRESS, st_step = st_round = 0, st_ticks = 0;
}
static void selftest_tick(void)
{
    volatile struct selftest *t = &modwerk_selftest;
    if (t->state != SELFTEST_RUNNING) return;
    ++st_ticks;
    if (t->phase == SELFTEST_CONFIGURATION) { /* PLAY, and the checks once it plays */
        if (!st_step) { press(0x28u), st_played = 1, st_step = 1, st_ticks = 0; return; }
        if (PLAYING && st_ticks > 6u) { started(t); return; }
        if (st_ticks > 120u) t->failed |= SELFTEST_ABORTED, t->phase = SELFTEST_RESTORE, st_ticks = 0; /* it would not play */
        return;
    }
    if (!PLAYING && t->phase != SELFTEST_RESTORE) modwerk_selftest_abort(); /* the transport stopped */
    if (t->phase == SELFTEST_TOGETHER) { together(t); return; }
    if (t->phase == SELFTEST_STRESS) {
        if (st_round < 2u) { /* the last batch cleared, then placed again at once */
            static uint8_t batch[16];
            if (st_step == 0) { for (unsigned i = 0; i < 16u; ++i) batch[i] = st_want[i]; set_live(st_base), st_step = 1, st_ticks = 0; return; }
            if (st_step == 1) { if (taken(st_base)) set_live(batch), st_step = 2, st_ticks = 0; else if (st_ticks > 240u) t->failed |= SELFTEST_REFUSED, st_round = 2; return; }
            if (settled(batch)) ++st_round, t->done = t->done + 1, st_step = 0;
            else if (st_ticks > 240u) t->failed |= SELFTEST_REFUSED, st_round = 2;
            return;
        }
        if (st_step != 3) { st_step = 3, st_ticks = 0, st_frames = dl_frames; return; }
        modulate(st_want);
        if (st_ticks < 60u) return;
        if (dl_frames == st_frames) t->failed |= SELFTEST_STOPPED;
        t->phase = SELFTEST_RESTORE, st_ticks = 0;
        return;
    }
    /* SELFTEST_RESTORE: each track back to what it ran and its lanes, then STOP if the test pressed PLAY: the modules off
     * first (a core the test emptied stays empty), then the Part's effects back, so no code waits on the modules' room */
    restore_lanes();
    if (st_back < 2u) {
        if (!st_back) set_live(st_base), st_back = 1, st_ticks = 0;
        if (!taken(st_base) && st_ticks <= 300u) return;
        st_back = 2, st_ticks = 0;
    }
    set_live(st_live);
    if (!taken(st_live) && st_ticks <= 300u) return;
    if (st_played && PLAYING) { if (st_step != 9) press(0x27u), st_step = 9, st_ticks = 0; if (st_ticks < 60u) return; }
    finish();
}
#endif
#ifndef MODWERK_HOST
/* Packing each core's code (owner, 11 October 2026). Code a track runs never moves on its own, so taking a module off
 * leaves a hole a later, larger one may not fit. Each hole is closed by moving a block into it the way a copying
 * collector moves objects: the new copy is uploaded while the old one runs, the dispatch entry is bound to it at a
 * frame, and the old copy is freed (manager.c's dl_move, build_core.py's edit). A slot's state lives in X and Y, and
 * stock reruns init only when the id changes, so the effect carries on, playing or not. One move at a time, when
 * the manager is idle and two seconds after the last key, so no move meets a pick. Dev request 25 times a run:
 * modwerk_dsp_compact_counts, DTCN3 counts until no hole is left (0xffffffff: one could not be closed). */
volatile uint32_t modwerk_dsp_compact_counts, modwerk_dsp_compact_step, modwerk_dsp_compact_moves;
extern volatile uint32_t modwerk_status_key_at; /* status.c: modwerk_runtime_ticks at the last key or knob */
int modwerk_upload_busy(void);                 /* ep0.c: a host session is open */
int dl_move(unsigned core, unsigned p, unsigned offset);
unsigned dl_arena(unsigned core);
int modwerk_compact_plan(const unsigned *at, const unsigned *n, const unsigned *align, unsigned k, unsigned cap, unsigned *which, unsigned *to);
unsigned modwerk_compact_left(const unsigned *at, const unsigned *n, const unsigned *align, unsigned k, unsigned cap);
static uint32_t compact_at;
int modwerk_dsp_compact(void)
{
    if (modwerk_dsp_compact_step) return 0;
    compact_at = *(volatile uint32_t *)0xfc07c00cu, modwerk_dsp_compact_step = 1;
    return 1;
}
static unsigned placed(unsigned c, unsigned *at, unsigned *n, unsigned *align, unsigned *id) /* core c's code by address */
{
    unsigned k = 0;
    for (unsigned p = 0; p < MODWERK_FX_IDS; ++p) {
        int a = dl_placed(c, p);
        if (a < 0) continue;
        unsigned j = k++;
        for (; j && at[j - 1] > (unsigned)a - 64u; --j) at[j] = at[j - 1], n[j] = n[j - 1], align[j] = align[j - 1], id[j] = id[j - 1];
        at[j] = (unsigned)a - 64u, n[j] = dl_catalog[p].words, align[j] = dl_catalog[p].alignment, id[j] = p; /* from DL_CODE_START */
    }
    return k;
}
static int holes(void) /* a core's free code words are in more than one run */
{
    unsigned at[MODWERK_FX_IDS], n[MODWERK_FX_IDS], align[MODWERK_FX_IDS], id[MODWERK_FX_IDS];
    for (unsigned c = 0; c < 2u; ++c)
        if (modwerk_compact_left(at, n, align, placed(c, at, n, align, id), dl_arena(c))) return 1;
    return 0;
}
static int move_one(void)
{
    for (unsigned c = 0; c < 2u; ++c) {
        unsigned at[MODWERK_FX_IDS], n[MODWERK_FX_IDS], align[MODWERK_FX_IDS], id[MODWERK_FX_IDS], k = placed(c, at, n, align, id),
            which, to;
        if (modwerk_compact_plan(at, n, align, k, dl_arena(c), &which, &to) && dl_move(c, id[which], to)) return 1;
    }
    return 0;
}
extern volatile uint32_t dl_residency_commits, dl_residency_rollbacks; /* manager.c */
static void compact_tick(void)
{
    if (modwerk_selftest.state == SELFTEST_RUNNING || !dl_publication_idle() || rebinding || picks_in != picks_out) return;
    if (modwerk_upload_busy()) return; /* a host session: its trial and self-test meet no move */
    if (*(volatile uint8_t *)0x800065bfu != *(volatile uint8_t *)0x800065bdu ||
        *(volatile uint8_t *)0x800065c0u != *(volatile uint8_t *)0x800065beu) return; /* a pattern change is queued */
    if (!modwerk_dsp_compact_step && modwerk_runtime_ticks - modwerk_status_key_at < 120u) return;
    static unsigned spent, key; /* moves since the last key: a layout that cannot be packed stops after 32 */
    /* A layout a plan found packed is not planned again until it changes (a commit, a rollback, an arena): the plan
     * on every idle tick cost about 120 µs with six modules placed (owner's MKII, 20 October 2026). */
    static uint32_t packed_commits, packed_rollbacks; static unsigned packed_arena[2], packed;
    if (key != modwerk_status_key_at || modwerk_dsp_compact_step == 1u) key = modwerk_status_key_at, spent = 0;
    if (modwerk_dsp_compact_step == 1u) modwerk_dsp_compact_step = 2u;
    if (packed && (packed_commits != dl_residency_commits || packed_rollbacks != dl_residency_rollbacks ||
                   packed_arena[0] != dl_arena(0) || packed_arena[1] != dl_arena(1))) packed = 0;
    if (spent < 32u && (!packed || modwerk_dsp_compact_step)) {
        if (move_one()) { ++spent, modwerk_dsp_compact_moves = modwerk_dsp_compact_moves + 1; return; }
        packed = 1, packed_commits = dl_residency_commits, packed_rollbacks = dl_residency_rollbacks;
        packed_arena[0] = dl_arena(0), packed_arena[1] = dl_arena(1);
    }
    if (modwerk_dsp_compact_step)
        modwerk_dsp_compact_counts = holes() ? 0xffffffffu : *(volatile uint32_t *)0xfc07c00cu - compact_at, modwerk_dsp_compact_step = 0;
}
/* manager.c's last way to place a pick that fits a core packed but not beside its live code (build_core.py
 * TRANSITION_EDITS, beta finding 35): pack now, the request waiting. 0 when packing cannot run (the self-test, a
 * host session) or no core has a hole; the wait ends after five seconds whatever the moves have done. */
static uint32_t pack_at;
int modwerk_dsp_pack(void)
{
    if (modwerk_selftest.state == SELFTEST_RUNNING || modwerk_upload_busy() || !holes()) return 0;
    (void)modwerk_dsp_compact(); /* already packing: the request waits for that one */
    pack_at = modwerk_runtime_ticks;
    return 1;
}
int modwerk_dsp_packing(void) { return modwerk_dsp_compact_step && modwerk_runtime_ticks - pack_at < 300u; }
#endif
/* The compaction planner (dsp.c's move_one; host-tested by test_dsp.c): k placed blocks sorted by address (where each
 * starts, its words, its alignment, 0 as 1) in an arena of cap words. A copy needs one free run as big as its block,
 * apart from its own old copy, so a hole under a block bigger than all the core's free words could never close: big
 * blocks (a quarter of the arena or more) sit at the top, packed down from it, where the allocator places them
 * (build_core.py), and the rest packs up from the bottom; the free words are then one run between them. First a big
 * block below the top ones goes up under them when that room is free. Then, below the top ones, lowest hole first:
 * the first block above it that fits in it clear of its own old copy; else the block right above it parks in the
 * first gap above it that holds it (the hole widens, and it comes back down later); else the block right below it
 * parks there, when the room it leaves and the hole together hold the block above. A hole that allows none of these
 * is passed over. 1 and the move (block index, new start) when there is one. */
static unsigned up_to(unsigned at, unsigned align) { unsigned a = align ? align : 1u; return (at + a - 1u) & ~(a - 1u); }
static unsigned down_to(unsigned at, unsigned align) { return at & ~((align ? align : 1u) - 1u); }
int modwerk_compact_plan(const unsigned *at, const unsigned *n, const unsigned *align, unsigned k, unsigned cap,
                         unsigned *which, unsigned *to)
{
    unsigned top = k, ceiling = cap; /* blocks top..k-1: big ones packed down from the arena's end */
    while (top && n[top - 1] * 4u >= cap && n[top - 1] <= ceiling && down_to(ceiling - n[top - 1], align[top - 1]) == at[top - 1])
        ceiling = at[--top];
    for (unsigned i = top; i--;) { /* a big block below them, up under them */
        if (n[i] * 4u < cap || n[i] > ceiling || down_to(ceiling - n[i], align[i]) < at[i] + n[i]) continue;
        unsigned t = down_to(ceiling - n[i], align[i]), clear = 1;
        for (unsigned j = i + 1; j < top; ++j) clear &= t >= at[j] + n[j] || t + n[i] <= at[j];
        if (clear) { *which = i, *to = t; return 1; }
    }
    for (unsigned i = 0, end = 0; i < top; end = at[i] + n[i], ++i) {
        if (up_to(end, align[i]) >= at[i]) continue; /* no hole, or only the block's own alignment padding */
        for (unsigned j = i; j < top; ++j) /* a block above that fits in the hole */
            if (up_to(end, align[j]) + n[j] <= at[i]) { *which = j, *to = up_to(end, align[j]); return 1; }
        for (unsigned m = i + 1; m <= top; ++m) { /* else the block above parks in the first gap above it that holds it */
            unsigned from = up_to(at[m - 1] + n[m - 1], align[i]), until = m < top ? at[m] : ceiling;
            if (from + n[i] <= until) { *which = i, *to = from; return 1; }
        }
        if (i && up_to(at[i - 1], align[i]) + n[i] <= at[i]) /* else the block below parks above, if that frees enough */
            for (unsigned m = i + 1; m <= top; ++m) {
                unsigned from = up_to(at[m - 1] + n[m - 1], align[i - 1]), until = m < top ? at[m] : ceiling;
                if (from + n[i - 1] <= until) { *which = i - 1, *to = from; return 1; }
            }
    }
    return 0;
}
/* Free words outside the largest free run (alignment padding aside): 0 when the planner's work is done. */
unsigned modwerk_compact_left(const unsigned *at, const unsigned *n, const unsigned *align, unsigned k, unsigned cap)
{
    unsigned free = 0, largest = 0, end = 0;
    for (unsigned i = 0; i <= k; ++i) {
        unsigned next = i < k ? at[i] : cap, run = next > end ? next - end : 0;
        if ((i < k && run < align[i]) || (i && run < align[i - 1])) run = 0; /* a block beside it could not sit closer */
        free += run, largest = run > largest ? run : largest;
        if (i < k) end = at[i] + n[i];
    }
    return free - largest;
}
void modwerk_dsp_unpack(void); /* identity.c: the stock effects' code into RAM, before the manager needs it */
/* Development (dev.c request 20): this many microseconds with interrupts masked on the next tick, timed by DTCN3
 * (132 MHz), to find how long the frame chain survives a held-off frame interrupt. Off the USB request path. */
volatile uint32_t modwerk_dsp_mask_test;
void modwerk_dsp_tick(void)
{
    modwerk_dsp_watch_ticks = modwerk_dsp_watch_ticks + 1; /* the watchdog's heartbeat */
#ifndef MODWERK_HOST
    if (modwerk_dsp_mask_test) {
        uint32_t us = modwerk_dsp_mask_test, sr = modwerk_machine_mask(), t0 = *(volatile uint32_t *)0xfc07c00cu;
        while (*(volatile uint32_t *)0xfc07c00cu - t0 < us * 132u) {}
        modwerk_machine_unmask(sr);
        modwerk_dsp_mask_test = 0;
    }
    static int unpacked;
    if (!unpacked) unpacked = 1, modwerk_dsp_unpack();
    peek_tick();
    selftest_tick();
    compact_tick();
    if (probing >= 0 && dl_job_status((unsigned)probing) != 0) {
        if (dl_job_status((unsigned)probing) > 0) modwerk_dsp_probes_ok = modwerk_dsp_probes_ok + 1;
        else modwerk_dsp_probes_failed = modwerk_dsp_probes_failed + 1;
        dl_job_release((unsigned)probing);
        probing = -1;
    }
    if ((dl_phase || dl_c1_phase) && EDMA_ES >> 31 && !(EDMA_ES >> 8 & 0xfu)) recover(2); /* eDMA refused our transfer: at once */
    else if (modwerk_dsp_stalled(dl_frames, dl_phase || !dl_job_status(0) || !dl_job_status(1))) recover(1);
    int following = rebind_tick();
    static char text[24];
    if (modwerk_dsp_missing_tick(following, *(volatile uint8_t *)0x80000000u, text)) { /* the current track */
        ((void (*)(const char *, unsigned))0x4005a2b8u)(text, 0xa0);
        modwerk_dsp_missing = modwerk_dsp_missing + 1;
    }
    if (nudge) { nudge = 0; dl_residency_nudge(); }
    if (picks_in == picks_out) return;
    uint32_t p = picks[picks_out % 4u];
    picks_out = picks_out + 1;
    unsigned slot = p >> 16 & 0xffu, row = p & 0xffu;
    if (slot == 2) { ((void (*)(unsigned))0x4004a8a4u)(row); return; } /* the manual Part change */
    *(volatile uint8_t *)0x80000000u = (uint8_t)(p >> 8);              /* the current track, as the selectors read it */
    *(volatile uint32_t *)(slot ? 0x460d5ca8u : 0x460d5c94u) = row;   /* the chooser's cursor */
    ((void (*)(void))(slot ? 0x40052474u : 0x400526e4u))();
#endif
}

/* What a hardware run reads (a development LOADER request): DSP_REPORT_WORDS
 * words, version first. Engine task; it reads counters only, never the host port. */
#ifndef MODWERK_HOST
extern volatile uint32_t dl_accepted[2], dl_rejected[2], dl_errors, dl_pool_base[2], dl_pool_words[2];
extern volatile uint32_t dl_selection_requested, dl_selection_completed, dl_selection_refused, dl_selection_cancelled;
extern volatile uint32_t dl_residency_commits, dl_residency_failures, dl_residency_rollbacks, dl_residency_words[2];
extern volatile uint32_t dl_early, dl_parked, dl_reinit, dl_pin7, dl_straddle;
uint32_t dl_manager_state(void);
uint32_t modwerk_status_report(uint32_t *out); /* status.c: load and memory, twelve words */
#define R8(a) (*(volatile uint8_t *)(a))
#define R16(a) (*(volatile uint16_t *)(a))
#define R32(a) (*(volatile uint32_t *)(a))
unsigned modwerk_dsp_report(uint32_t *out)
{
    const uint32_t words[] = {
        11, dl_frames, dl_phase, (uint32_t)dl_job_status(0), (uint32_t)dl_job_status(1), modwerk_dsp_last_flags,
        dl_accepted[0], dl_accepted[1], dl_rejected[0], dl_rejected[1], dl_errors, modwerk_dsp_stalls, modwerk_dsp_drained,
        dl_residency_enabled, dl_manager_state(), modwerk_dsp_watch_ticks, modwerk_dsp_probes, modwerk_dsp_probes_ok,
        modwerk_dsp_probes_failed,
        dl_selection_requested, dl_selection_completed, dl_selection_refused, dl_selection_cancelled,
        dl_residency_commits, dl_residency_failures, dl_residency_rollbacks, dl_residency_words[0], dl_residency_words[1],
        dl_early, dl_parked, dl_reinit, modwerk_dsp_missing, modwerk_dsp_used().w[0], modwerk_dsp_dry().w[0],
        /* Where stock's frame chain stands (reads without side effects): the transfer machine's state and the
         * frame interrupt's busy flag (stock RAM), INTC0 IPRL and IMRL, EPORT pin levels | edge flags | the
         * DSP select, eDMA INT | ERR, TCD0 CSR | TCD1 CSR, eDMA ES. */
        R32(0x46104d3eu), R32(0x46104d4eu), R32(0xfc048004u), R32(0xfc04800cu),
        (uint32_t)R8(0xfc094005u) << 16 | (uint32_t)R8(0xfc094006u) << 8 | R8(0xfc0a400cu),
        (uint32_t)R16(0xfc044026u) << 16 | R16(0xfc04402eu), (uint32_t)R16(0xfc04501eu) << 16 | R16(0xfc04503eu),
        R32(0xfc044004u), modwerk_dsp_edma_errors, modwerk_dsp_edma_es,
        (uint32_t)modwerk_dsp_miss_core, modwerk_dsp_miss_bits, modwerk_dsp_miss[0], modwerk_dsp_miss[2], modwerk_dsp_miss[3],
        modwerk_dsp_miss[4], dl_pin7, dl_straddle, dl_c1_sent,
        (uint32_t)modwerk_dsp_meter_core, modwerk_dsp_meter_bits, modwerk_dsp_meter[0], modwerk_dsp_meter[1], modwerk_dsp_meter[2],
        modwerk_dsp_meter[3], modwerk_dsp_meter[4], modwerk_fxmap_generation(), modwerk_fxmap_read, modwerk_fxmap_written,
        modwerk_modset_generation, modwerk_modset_count, modwerk_modset_result};
    unsigned n = sizeof words / sizeof words[0]; /* then status.c's twelve */
    for (unsigned i = 0; i < n; ++i) out[i] = words[i];
    n += modwerk_status_report(out + n);
    /* More than 32 ids: the masks' other words at the end, so every word before keeps its place (version 12). */
    fx_set used = modwerk_dsp_used(), dry = modwerk_dsp_dry();
    for (unsigned i = 1; i < MODWERK_FX_WORDS; ++i) out[n++] = used.w[i];
    for (unsigned i = 1; i < MODWERK_FX_WORDS; ++i) out[n++] = dry.w[i];
    if (MODWERK_FX_WORDS > 1u) out[0] = 12, out[n++] = 0; /* a pad: 4 x words must not fill whole 64-byte packets */
    return n;
}
#endif

/* shortcut: no publication guards yet (queued patterns, project loads, Part
 * edits); the manager's observer loads what those routes publish and parks
 * the slot dry until then. Port publication.c with the Part routes. */
void dl_publication_finish(void) {}
void dl_publication_tick(void) {}
