/* SPDX-License-Identifier: GPL-3.0-or-later
 * Machine-neutral runtime module loader: the upload controller's backend
 * (README.md). A machine adds the glue declared at the end and trampolines
 * from its hook bus that call the active module's hooks. */
#ifndef MODWERK_LOADER_H
#define MODWERK_LOADER_H
#include <stdint.h>
#include "upload.h"
#include "modwerk_module.h"
#define RUNTIME_ABI 10u
#define RUNTIME_GROUP_METADATA 4u       /* ABI8 MWMG prefix; machine must explicitly admit its lifetime */
#define RUNTIME_CAPABILITY_FLAGS 7u     /* CF sites, hash-backed stock copies, authored constant fills; and 128, site events, when the machine has them (64 is the volatile journal) */
#define RUNTIME_HEADER_BYTES 80u        /* ABI 9 and 10: ABI 8 (76) plus requires u16, claim and hook-entry counts u8;
                                         * older headers: 76, 72, 68, 50, 32, 28 */
#define RUNTIME_IMAGE_BYTES 131072u      /* one module's image and bss (Tape Echo's tone table is 86 KiB) */
#define RUNTIME_RELOCATIONS 2048u
#define RUNTIME_SITES 128u
#define RUNTIME_SITE_BYTES 32u
#define RUNTIME_SITE_RELOCATIONS 8u
#define RUNTIME_COPIES 128u               /* ABI 7: stock bytes copied into the image, each at most RUNTIME_SITE_BYTES */
#define RUNTIME_FILLS 64u                /* ABI 8: bounded authored constant initializers, no bytes carried */
#define RUNTIME_DSP_WORDS 4096u          /* one module's DSP code and tables, 24-bit words */
#define RUNTIME_DSP_RELOCATIONS 256u
#define RUNTIME_DSP_CLAIMS 16u           /* ABI 9: X/Y words the DSP code reads or writes outside its slot */
#define RUNTIME_DSP_HOOK_ENTRIES 8u      /* ABI 9: entries for the base's stock-DSP hook sites (ABI 10: an engine's) */
#define RUNTIME_DSP_INIT_WORDS 4096u     /* ABI 10: an engine's claims' initial words, 24-bit */
/* A machine may raise these (the Octatrack: 128 modules in 768 KiB, build_core.py). */
#ifndef RUNTIME_POOL_BYTES
#define RUNTIME_POOL_BYTES 262144u       /* every module's memory, reclaimed once nothing can reach it */
#endif
#ifndef RUNTIME_MODULES
#define RUNTIME_MODULES 32u              /* live at once: bounds the cost of each event, not memory */
#endif
#define RUNTIME_PAUSED 32u               /* memory spans the glue may report */
#define RUNTIME_NONE 0xffffffffu
/* Hook order in packages: the events every Elekloader core has. Later events
 * append; a base refuses a package with hooks it does not dispatch. */
enum runtime_event { RUNTIME_TICK, RUNTIME_DRAW, RUNTIME_KEY, RUNTIME_ENC, RUNTIME_EVENTS };
/* A machine's events at stock sites its base owns (the Octatrack's: sdk/machines/octatrack/EVENTS.md) follow as hook
 * indices RUNTIME_EVENTS on, from its generated header (runtime_events.h, generated from its events.json). */
#ifdef MODWERK_RUNTIME_EVENTS
#include "runtime_events.h"
#else
#define RUNTIME_SITE_EVENTS 0u
#endif
#define RUNTIME_HOOKS (RUNTIME_EVENTS + RUNTIME_SITE_EVENTS)
#define RUNTIME_RAISE 255u /* a raised event's hook word with this order: the image offset of a zero 4-byte slot the
                            * loader fills with the base's entry for that event (modwerk_raise_<event>); not a handler */
struct runtime_site { uint32_t address, length; uint8_t stock[RUNTIME_SITE_BYTES], code[RUNTIME_SITE_BYTES]; };
/* ABI 9: an X/Y span the module's DSP code reads or writes outside its own slot (README.md, "Base features and DSP
 * claims"). space 1 X, 2 Y; core 0 or 1 (on the Octatrack core 0 runs payload A, tracks 5-8); an address at or past
 * 0x30000 is in the window both cores see. access bit 0 read, bit 1 write. ABI 10, an engine's claims only: bit 2, its
 * initial words follow the DSP relocations (`initial` in the parsed package); core 2, the same span on both cores. */
struct runtime_dsp_claim { uint32_t address, words; uint8_t space, core, access, pad; };
enum { RUNTIME_CLAIM_READ = 1, RUNTIME_CLAIM_WRITE = 2, RUNTIME_CLAIM_INIT = 4, RUNTIME_CLAIM_BOTH_CORES = 2 };
/* ABI 10: one of an engine's entries at a stock-DSP hook site of the base (README.md, "Engines at hook sites"): the
 * site's catalogue index, its cores (bit 0 core 0, bit 1 core 1), the engine word it enters at, and `exit`, 0 or the
 * engine word holding a long branch's displacement that the base points at the site's exit on each core. */
struct runtime_dsp_entry { uint32_t entry; uint16_t exit; uint8_t site, cores; };
/* A module's DSP effect (README.md, "DSP code"): relocatable code the machine
 * loads into a DSP when a track picks the effect, and what it needs there. */
struct runtime_dsp {
    const uint32_t *words;         /* 24-bit words; relocation words hold offsets into them */
    const uint16_t *relocations;
    uint32_t count;                /* 0: no DSP code */
    uint16_t relocation_count, init, proc, cycles; /* cycles: worst case per sample and instance */
    uint16_t buffer;               /* Y words of the slot's delay buffer it reads from its base; 0 none */
    uint8_t id, slots, kind, state;  /* effect id; 1 FX1, 2 FX2; cycles' evidence; state words per instance */
    const uint8_t *image;           /* whole CF image, staging at admission then owned pool memory */
    uint32_t image_bytes;
    uint8_t flags;                  /* header flags; metadata bit requires machine-specific admission */
    uint8_t present;                /* 1 install/replace; 0 empty removal; module identity is still supplied */
    uint32_t module;                 /* the module's id: its identity. The package's effect id is only its
                                      * preferred one; the machine's admission gives the one it gets. */
    uint16_t layout;                 /* what its stored parameter values mean; a change that reads them
                                      * differently raises it (ABI 6; 0 from ABI 5) */
    char name[16];                   /* its display name, NUL-ended (ABI 6; empty from ABI 5) */
    const uint8_t *page;             /* the module image's head, when the package's flag 1 says it
                                      * starts with the effect's page recipe for the machine (ABI 6) */
    uint32_t page_bytes;             /* the image's length, all the recipe may reach */
    uint8_t pinned;                  /* flag 2: its ColdFire code names its effect id, so it takes that one or
                                      * none (ABI 6) */
    uint8_t foreign_roots;           /* trusted board admission only, never an uploaded flag */
    uint8_t contributes;             /* the loader's: its hooks contribute to a table (machine UI roots may name it) */
    uint32_t hook_offset[RUNTIME_HOOKS]; /* the loader's: each hook word's image offset, RUNTIME_NONE without (a table's
                                      * record, read by the machine's admission) */
    uint8_t package_sha256[MU_DIGEST_BYTES]; /* exact encoded package, retained across relocation;
                                            * private board declarations must never hash mutable image bytes */
    uint16_t requires;               /* ABI 9: base feature bits it needs (modwerk_machine_dsp_features) */
    uint8_t claim_count;             /* ABI 9: its claims, kept in its pool extent beside its DSP words */
    const struct runtime_dsp_claim *claims;
    /* ABI 10: an engine instead of an effect (the package's slots 0): DSP words for the base's hook sites, at base 0,
     * each relocation an index (| 0x8000: the word holds a fixed P address, value - base; else an offset, value +
     * base); count 0 here, so nothing takes it for an effect. Kept in its pool extent, as the claims are. */
    uint32_t engine_count, init_count;  /* init_count: every init claim's words, in claim order (`initial`) */
    uint16_t engine_relocation_count;
    uint8_t entry_count, pad;
    const uint32_t *engine, *initial;
    const uint16_t *engine_relocations;
    const struct runtime_dsp_entry *entries;
    /* SHA-256 of what is not DSP: the header with its DSP fields zeroed, then the bytes up to its claims (hooks,
     * image, relocations, sites, copies, fills). A base trusts a controller by it, so a DSP-only change keeps it. */
    uint8_t controller_sha256[MU_DIGEST_BYTES];
};
enum runtime_cycles { RUNTIME_EXECUTED = 1, RUNTIME_MODELED, RUNTIME_HARDWARE };
/* At the start of the module's pool extent, followed by its sites, code, data, bss and DSP code. */
struct runtime_module { uint32_t id, size; uintptr_t hook[RUNTIME_HOOKS]; const struct runtime_site *site; uint32_t sites; struct runtime_dsp dsp;
                        uint8_t order[RUNTIME_HOOKS]; }; /* hook 0: none; order: a site event's, lower first */
/* Board-owned immutable reconstruction identity, kept outside the module
 * extent. This does not confer publication, DSP readiness or write authority.
 * Query/validation callers must retain the stable machine lock throughout the
 * operation that uses it; a copied snapshot is never a lifetime lease. */
struct runtime_owner {
    uint32_t generation, module;
    uintptr_t owned_extent; /* actual read alias; board canonicalization is a separate checked operation */
    uint32_t extent_bytes, image_offset, image_bytes;
    uint8_t package_sha256[MU_DIGEST_BYTES];
    uint8_t controller_sha256[MU_DIGEST_BYTES]; /* ABI 10: runtime_dsp's, what a board's trust rows pin */
};
int modwerk_runtime_owner_snapshot(const uint8_t *image,struct runtime_owner *);
int modwerk_runtime_owner_valid(const struct runtime_owner *);
/* Stable lock held. The intact owner whose image holds `address` in the alias
 * its code runs from (owned_extent), and that allocation's canonical extent:
 * the pool's own base plus its offset, checked against the pool's ends. */
int modwerk_runtime_owner_at(uintptr_t address,struct runtime_owner *);
int modwerk_runtime_owner_canonical(const struct runtime_owner *,uintptr_t *extent);
/* Stable lock held. modwerk_runtime_owner_valid, trying the entry *hint first and leaving where it was found
 * there: one check while the ledger is unchanged. */
int modwerk_runtime_owner_held(const struct runtime_owner *,unsigned *hint);
/* Changes with every change of the owner ledger or of a position (install, discard, reclaim, publish, restore,
 * journal switch); odd while one is under way. A result derived from owners while it was even and unchanged still
 * holds, apart from each owner's own header, which modwerk_runtime_owner_held checks. */
uint32_t modwerk_runtime_owner_epoch(void);
/* Why the last package was refused, for diagnostics and the unit's own message. */
enum runtime_refusal { RUNTIME_OK, RUNTIME_MALFORMED, RUNTIME_MEMORY, RUNTIME_CONFLICT, RUNTIME_FULL, RUNTIME_BUSY, RUNTIME_CYCLES,
                       RUNTIME_IN_USE /* a track runs the effect it would replace or remove */,
                       RUNTIME_STOCK /* ABI 7: the bytes under a site are not the stock bytes its hash names */,
                       RUNTIME_EVENT /* a site or copy meets a stock site the base owns as an event: subscribe to it */,
                       RUNTIME_FEATURE /* ABI 9: a base feature the package requires cannot come up this boot (on the
                                        * Octatrack, the key bus with a DSP core's state lost): restart, then retry */ };
/* ABI 9 refusals use the codes above: a feature the base does not have, a claim another live module's claim meets
 * (either writing), and (ABI 9) any hook entry are RUNTIME_CONFLICT. ABI 10: an engine the machine does not admit
 * (modwerk_machine_dsp_engine_admit) answers the machine's refusal. */
/* ABI 7's site record (a 32-byte hash for the stock bytes) is never longer than ABI 6's (the stock bytes). */
#define RUNTIME_PACKAGE_BYTES (RUNTIME_HEADER_BYTES + 4u * RUNTIME_HOOKS + RUNTIME_IMAGE_BYTES + 4u * RUNTIME_RELOCATIONS + \
                               RUNTIME_SITES * (8u + 2u * RUNTIME_SITE_BYTES + 2u * RUNTIME_SITE_RELOCATIONS) + \
                               RUNTIME_COPIES * (12u + 32u) + RUNTIME_FILLS * 12u + 12u * RUNTIME_DSP_CLAIMS + \
                               8u * RUNTIME_DSP_HOOK_ENTRIES + 4u * RUNTIME_DSP_WORDS + 2u * RUNTIME_DSP_RELOCATIONS + \
                               4u * RUNTIME_DSP_INIT_WORDS)

/* The controller's staging buffer is the machine's; it must hold RUNTIME_PACKAGE_BYTES. */
extern const struct mu_backend modwerk_runtime_backend;
/* Whole-set backend, gated by MODWERK_RUNTIME_SETS and capability 512. It
 * uses the production module admission/switches and retains every predecessor
 * through trial. Publish may return MU_PUBLISHING_MORE; never implicit Keep. */
int modwerk_runtime_set_busy(void);
#ifdef MODWERK_RUNTIME_SETS
extern const struct mu_backend modwerk_runtime_set_backend;
int modwerk_runtime_handle_reserved(uint32_t module, unsigned handle);
unsigned modwerk_runtime_set_identity(uint8_t *out);
void modwerk_runtime_set_refresh(void);
#endif
extern struct modwerk_runtime_api modwerk_runtime_api;
/* A trampoline reads each position once, then calls its hook. Memory is
 * reclaimed only when no paused task holds an address inside it, so a hook
 * still running old code stays valid. */
const struct runtime_module *modwerk_runtime_module(unsigned position);
unsigned modwerk_runtime_active(void);               /* modules live */
unsigned modwerk_runtime_intact(void);               /* of them, those whose stock-code sites hold their patches */
uint32_t modwerk_runtime_broken(void);               /* the first live module whose sites do not hold: its id, 0 none */
uint32_t modwerk_runtime_free(uint32_t *largest);    /* pool bytes free, and the largest free run */
unsigned modwerk_runtime_list(uint8_t *out, unsigned first, unsigned most); /* INVENTORY: 4 + 24 x entries bytes */
enum runtime_refusal modwerk_runtime_refusal(void);
void modwerk_runtime_refused(enum runtime_refusal why); /* a machine check that refuses before the loader (Octatrack modset.c) */
unsigned modwerk_runtime_refused_event(void);         /* after RUNTIME_EVENT: that event's hook index */
#if RUNTIME_SITE_EVENTS
/* Each site event's handlers in (order, module id) order, then 0: the base's dispatch (runtime_events.s,
 * modwerk_events_code up to modwerk_events_code_end) walks them. Rewritten masked, only while no paused
 * task is inside that dispatch. */
extern uintptr_t volatile *const modwerk_runtime_event_row[RUNTIME_SITE_EVENTS];
extern const uint8_t modwerk_events_code[], modwerk_events_code_end[];
#endif
void modwerk_machine_tables_changed(void);          /* masked, after rows changed; weak no-op by default */
/* Masked: a site's bytes went back to stock (`patched` were its module's), so stock data that copied them can follow;
 * weak no-op by default. */
void modwerk_machine_site_restored(uint32_t address, uint32_t length, const uint8_t *patched, const uint8_t *stock);
unsigned modwerk_runtime_capabilities(uint8_t *out); /* MWCP v1: 12 bytes, read-only */
extern volatile uint32_t modwerk_runtime_ticks; /* advanced by the glue's tick, for diagnostics */
uint32_t modwerk_runtime_value(void);
uint32_t modwerk_runtime_calls(void);

/* Machine glue. */
struct runtime_span { const uint8_t *from, *to; };
struct runtime_context { uint32_t registers[16]; }; /* captured at a loader backend entry */
int modwerk_machine_stopped(void);                 /* nothing plays or records */
void *modwerk_machine_uncached(void *);            /* the alias module code and data run from */
void modwerk_machine_invalidate_code(void);        /* instruction and branch caches */
/* Stock code: whether [address, address + length) may be patched at all (RAM
 * only, never what the OS may write to flash), and an uncached view of it. */
int modwerk_machine_patchable(uint32_t address, uint32_t length);
uint8_t *modwerk_machine_code(uint32_t address);
void modwerk_machine_flush_data(uint32_t address, uint32_t length); /* push and invalidate data-cache lines */
uint32_t modwerk_machine_mask(void);               /* no other code runs until unmask */
void modwerk_machine_unmask(uint32_t);
/* No other task, and no interrupt that could reach the loader, runs until unlock; the machine's real-time
 * interrupts still do. Held for the loader's long work (stack scans, the DSP switch); a mask inside it covers
 * the stock-code bytes alone. On the Octatrack: a frame interrupt held off a ring half stops the DSPs. */
uint32_t modwerk_machine_lock(void);
void modwerk_machine_unlock(uint32_t);
/* With the machine locked: every task's live stack and saved registers.
 * The current context was captured at backend entry, before the loader's
 * administrative addresses existed. It stays valid through the operation.
 * More than `max` means unknown. */
unsigned modwerk_machine_paused(struct runtime_span *, unsigned max, const struct runtime_context *);
/* Canonical value for reachability comparisons across mapped RAM aliases. */
uint32_t modwerk_machine_reference(uint32_t);
/* DSP effects: may `to` take `from`'s place (either may be absent: count 0)?
 * A runtime_refusal; checked at admission and again, masked, at the switch,
 * which then calls dsp_switch. A machine without a DSP loader refuses any. */
/* PREPARE sees encoded placeholders; SWITCH sees reconstructed arrays. Both
 * operations run under the stable machine lock. No public ABI flag. */
enum runtime_metadata_operation { RUNTIME_METADATA_PREPARE=1, RUNTIME_METADATA_SWITCH=2 };
/* Default refuses groups; a board assigns foreign_roots only after trusted
 * declaration and current/paused consumer checks. */
int modwerk_machine_metadata_admit(const struct runtime_dsp *from, struct runtime_dsp *to,
    const struct runtime_context *,enum runtime_metadata_operation);
int modwerk_machine_dsp_admit(const struct runtime_dsp *from, struct runtime_dsp *to); /* may set to->id */
/* 1 while a restore switches (an Undo, or the rollback after a failed self-test): it puts a position back as it was
 * before its change, so a machine may make a track that runs the outgoing module dry first (Octatrack, dsp.c). */
int modwerk_runtime_restoring(void);
/* ABI 9: the base feature bits this base provides to packages (`requires`); weak, 0 by default (the Octatrack's
 * on-demand base: sdk/machines/octatrack/dsp-sites.json's features). */
unsigned modwerk_machine_dsp_features(void);
/* ABI 9, locked, at admission: may these claims stand beside the base's own DSP words and its live buffers (a
 * runtime_refusal)? Weak: refuses any claim. Another live module's claims are the loader's to check. */
int modwerk_machine_dsp_claims_admit(unsigned requires, const struct runtime_dsp_claim *claims, unsigned n);
/* ABI 10, locked, at admission, in place of the claims' check: may this engine take its hook sites and its claims (a
 * runtime_refusal)? `d` holds its counts, claims and entries; its words are not yet kept. Weak: refuses every engine. */
int modwerk_machine_dsp_engine_admit(const struct runtime_dsp *d);
void modwerk_machine_dsp_switch(const struct runtime_dsp *from, const struct runtime_dsp *to);
#endif
