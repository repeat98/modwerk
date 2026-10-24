/* SPDX-License-Identifier: GPL-3.0-or-later
 * The actual board adapter (journal_board.c) feeding the actual dsp.c checked
 * catalogue/page/map publication. SYNTHETIC: the authored pages and modules,
 * the owner ledger and journal progress, the association row and every
 * manager-journal receipt and Keep answer. No firmware donor, DSP ACK or
 * hardware fact. */
#define MODWERK_JOURNAL_FACT_EXTERNAL
#define MODWERK_JOURNAL_BOARD_ENABLED 1
#define MW_JOURNAL_ASSOCIATION_STORAGE
#define MW_REVIEWED_JOURNAL_ASSOCIATIONS {{0}, 0, {0}},
#include "sha256.c"
volatile uint32_t modwerk_flash_refusal; /* flash.c, not linked here */
#include "dsp.c"
int modwerk_runtime_restoring(void) { return 0; } /* loader.c's: no restore here */
volatile uint32_t dl_residency_words[2]; /* manager.c: each core's resident code words (dsp.c's budget box) */
#include "fxmap.c"
#include "fxpage.c"
#include "journal_board.c"
#include <stdio.h>
#include <string.h>
static unsigned failures;
#define CHECK(x) do { if (!(x)) { ++failures; fprintf(stderr, "%d: %s\n", __LINE__, #x); } } while (0)
const fx_set modwerk_fx_modules = {{(1u << 26) | (1u << 27)}};
const struct fx_legacy modwerk_fx_legacy[] = {{0, 0, ""}};
const uint32_t modwerk_fx_legacy_count = 0;
struct dl_package dl_catalog[MODWERK_FX_IDS]; struct code dl_codes[2][MODWERK_FX_IDS];
const uint16_t modwerk_dsp_arena[2] = {2320, 2300};
int dl_publication_idle(void) { return 1; }
uint32_t dl_slot_cycles(unsigned i) { (void)i; return 0; } /* manager.c; the source stage is test_dsp.c's */
uint8_t modwerk_test_memory[0x40000] __attribute__((aligned(16)));
uint32_t modwerk_fx1_list[MODWERK_LIST_ROWS] = {0x1000}, modwerk_fx2_list[MODWERK_LIST_ROWS] = {0x1000};
const uint32_t modwerk_fx_rows[2] = {1, 1};
void modwerk_machine_invalidate_code(void) {}
/* Synthetic loader side: two immutable owners and the journal's progress. */
static struct runtime_owner ledger[2]; static const struct runtime_module *live_module;
static struct runtime_journal_progress progress;
int modwerk_runtime_owner_valid(const struct runtime_owner *o) { return same_owner(o, &ledger[0]) || same_owner(o, &ledger[1]); }
int modwerk_runtime_owner_canonical(const struct runtime_owner *o, uintptr_t *out)
{ if (!modwerk_runtime_owner_valid(o)) return 0; *out = o->owned_extent; return 1; }
int modwerk_runtime_owner_snapshot(const uint8_t *p, struct runtime_owner *out)
{ for (unsigned i = 0; i < 2u; ++i) if ((uintptr_t)p == ledger[i].owned_extent + ledger[i].image_offset) { *out = ledger[i]; return 1; } return 0; }
const struct runtime_module *modwerk_runtime_module(unsigned p) { return p == 3u ? live_module : 0; }
void modwerk_runtime_journal_snapshot(struct runtime_journal_progress *out) { *out = progress; }
/* Synthetic manager journal receipts. */
static int step_result = 1, code_skew;
static uint8_t receipt_required = 3;
static uint32_t next_ticket = 10;
static unsigned stages, releases;
int mw_manager_journal_freeze(uint32_t g) { return g == progress.generation && progress.phase == RJ_PUBLISHING; }
int mw_manager_journal_stage(uint32_t g, const struct runtime_journal_view *r, int reverse) { (void)r; (void)reverse; ++stages; return g == progress.generation; }
int mw_manager_journal_step(uint32_t g) { return g == progress.generation ? step_result : -1; }
int mw_manager_journal_receipt(uint32_t g, const struct runtime_journal_view *r, int reverse, uint8_t *required, struct mw_manager_core_receipt out[2])
{
    const struct runtime_dsp *to = reverse ? r->from : r->to;
    *required = receipt_required;
    for (unsigned c = 0; c < 2u; ++c) if (receipt_required >> c & 1u)
        out[c] = (struct mw_manager_core_receipt){++next_ticket, 11 + c, 64, 2300, 1, 3, 3, (uint16_t)(to->count ? 64 : 0), (uint16_t)(to->count + code_skew), 1};
    return g == progress.generation;
}
int mw_manager_journal_release(uint32_t g) { ++releases; return g == progress.generation && progress.phase == RJ_IDLE; }
static int accept_result = 1;
static unsigned accepts;
int mw_manager_journal_accept(uint32_t g, const struct runtime_journal_view *rows, unsigned n)
{ ++accepts; return g == progress.generation && progress.phase == RJ_TRIAL && rows && n == 1 ? accept_result : 0; }

static struct runtime_module *make_module(unsigned index, unsigned generation, int code)
{
    struct runtime_module *m = (struct runtime_module *)(void *)(modwerk_test_memory + 0x22000u + 0x2000u * index);
    memset(m, 0, 1024); m->id = 70; m->size = 1024;
    unsigned head = (sizeof *m + 15u) & ~15u; uint8_t *p = (uint8_t *)m + head;
    m->dsp = (struct runtime_dsp){.image = p, .image_bytes = 256, .present = 1, .module = 70, .layout = 1, .name = "Synthetic FX"};
    if (code) {
        m->dsp.words = (uint32_t *)(void *)(p + 256); m->dsp.relocations = (uint16_t *)(void *)(p + 272);
        m->dsp.count = 3; m->dsp.relocation_count = 1; m->dsp.init = 1; m->dsp.proc = 2; m->dsp.cycles = 244;
        m->dsp.id = 26; m->dsp.slots = 2; m->dsp.kind = RUNTIME_MODELED; m->dsp.state = 70; m->dsp.page = p; m->dsp.page_bytes = 256;
        uint32_t *words = (uint32_t *)(void *)(p + 256); words[0] = 0; words[1] = 2; words[2] = 3;
        memcpy(p, "MWPG", 4); put32(p + 4, 0x100); mu_sha256(modwerk_test_memory + 0x100, PAGE, p + 8);
        p[42] = 1; p[44] = 1; p[52] = 0; p[53] = 94; p[54] = 1; put32(p + 56, 77 + index);
        p[60] = 8; p[61] = 1; p[62] = 1; put32(p + 64, ADDR(p + 128)); p[68] = 0; p[69] = 16; p[72] = 0; p[73] = 8; put32(p + 136, 0x16);
    }
    memset(m->dsp.package_sha256, (int)generation, MU_DIGEST_BYTES);
    ledger[index] = (struct runtime_owner){.generation = generation, .module = m->id, .owned_extent = (uintptr_t)m, .extent_bytes = m->size, .image_offset = head, .image_bytes = 256};
    memcpy(ledger[index].package_sha256, m->dsp.package_sha256, MU_DIGEST_BYTES);
    return m;
}
/* A fresh boot: actual catalogue/map/pages, a frozen adapter ledger for one row. */
static struct runtime_journal_view prepare(int code)
{
    memset(modwerk_test_memory, 0, sizeof modwerk_test_memory); memset(owner, 0, sizeof owner); memset(catalogue_generation, 0, sizeof catalogue_generation);
    memset(owner_page, 0, sizeof owner_page); memset(owner_pinned, 0, sizeof owner_pinned); memset(owner_cycles, 0, sizeof owner_cycles); memset(owner_measured, 0, sizeof owner_measured);
    memset(dl_codes, 0, sizeof dl_codes); memset(serves, 0, sizeof serves); memset(checked_recipe, 0, sizeof checked_recipe); memset(wide, 0, sizeof wide);
    for (unsigned k = 0; k < MODWERK_FX_IDS; ++k) dl_catalog[k] = (struct dl_package)STOCK;
    memset(&modwerk_test_map, 0, sizeof modwerk_test_map); seeded(); rows(); nudge = rebinding = checked_preflight_ready = 0; (void)rebind_tick;
    memset(&board, 0, sizeof board); code_skew = 0; receipt_required = code ? 3 : 0; step_result = 1;
    struct runtime_module *before = make_module(0, 1, code), *after = make_module(1, 2, code); static const struct runtime_dsp empty;
    modwerk_machine_dsp_switch(&empty, &before->dsp); nudge = 0; live_module = before;
    struct runtime_journal_view r = {.before = ledger[0], .after = ledger[1], .from = &before->dsp, .to = &after->dsp, .module = 70, .position = 3};
    memcpy(r.package_sha256, r.after.package_sha256, MU_DIGEST_BYTES);
    memcpy(associations[0].package_sha256, r.package_sha256, MU_DIGEST_BYTES); associations[0].module = 70; associations[0].participants[0] = 70;
    progress = (struct runtime_journal_progress){.generation = 7, .records = 1, .phase = RJ_RECEIVING};
    CHECK(modwerk_machine_journal_admit(&r, 1) && board.admitted == 7 && !board.generation);
    progress.phase = RJ_PUBLISHING;
    return r;
}
/* The loader's step for one row: transition, exact preflight, CF switch, commit. */
static int step(const struct runtime_journal_view *r, int reverse, int switch_cf)
{
    uint8_t m[3] = {0};
    enum runtime_journal_observation o = modwerk_machine_journal_transition(r, reverse, m);
    if (o != RJ_READY) return (int)o;
    CHECK(m[0] == m[1] && m[1] == m[2]);
    progress.required = m[0]; progress.confirmed = m[2]; progress.touched |= m[1];
    if (!modwerk_machine_journal_switch_safe(r, reverse)) return -1;
    if (switch_cf) live_module = (const struct runtime_module *)(reverse ? r->before : r->after).owned_extent;
    return modwerk_machine_journal_committed(r, reverse) ? 100 : -2;
}
int main(void)
{
    struct modwerk_journal_commit_fact f;
    /* Forward publication from a stored receipt, consumed once by dsp.c. */
    struct runtime_journal_view r = prepare(1);
    step_result = 0; CHECK(step(&r, 0, 1) == RJ_WAIT && stages == 1 && !board.ready && board.generation == 7);
    step_result = 1; CHECK(step(&r, 0, 1) == 100 && stages == 1 && catalogue_generation[26] == 2 && checked_catalogue(&r.after, r.to, 70));
    CHECK(!modwerk_machine_journal_committed(&r, 0) && !modwerk_machine_journal_switch_safe(&r, 0) && !modwerk_machine_journal_commit_ready(&r, 0, &f));
    /* Reverse of that published row restores the old owned catalogue entry. */
    progress.phase = RJ_ROLLBACK;
    CHECK(step(&r, 1, 1) == 100 && stages == 2 && catalogue_generation[26] == 1 && checked_catalogue(&r.before, r.from, 70));
    CHECK(!modwerk_machine_journal_roots_clear(&r) && !releases); /* touched: no root proof */
    /* Reverse of an unpublished row: its forward fact is dropped unconsumed. */
    r = prepare(1); progress.touched = 3;
    uint8_t m[3]; CHECK(modwerk_machine_journal_transition(&r, 0, m) == RJ_READY && board.ready);
    progress.phase = RJ_ROLLBACK;
    CHECK(step(&r, 1, 0) == 100 && board.fact.catalogue_target == 1 && catalogue_generation[26] == 1 && live_module == (const void *)r.before.owned_extent);
    /* CF-only rows still need the exact positively checked no-job receipt. */
    r = prepare(0); CHECK(step(&r, 0, 1) == 100 && !owner[26] && !board.ready);
    /* A changed map after the receipt, or a receipt dsp.c's extents refuse, publishes nothing. */
    r = prepare(1); CHECK(modwerk_machine_journal_transition(&r, 0, m) == RJ_READY);
    static const char other[16] = "Other"; CHECK(modwerk_fxmap_assign_checked(27, 99, 1, other));
    progress.required = progress.confirmed = progress.touched = 3;
    CHECK(!modwerk_machine_journal_switch_safe(&r, 0) && board.ready && catalogue_generation[26] == 1);
    r = prepare(1); code_skew = 1; CHECK(step(&r, 0, 1) == -1 && board.ready && catalogue_generation[26] == 1);
    /* An unknown catalogue (duplicate handle) poisons: unknown, no fact, no retry. */
    r = prepare(1); owner[27] = 70;
    CHECK(modwerk_machine_journal_transition(&r, 0, m) == RJ_UNKNOWN && board.poisoned && m[0] == 3 && m[1] == 3 && !m[2]);
    unsigned staged = stages; owner[27] = 0;
    CHECK(modwerk_machine_journal_transition(&r, 0, m) == RJ_UNKNOWN && stages == staged && !modwerk_machine_journal_switch_safe(&r, 0));
    /* Keep: a fresh install (empty predecessor) whose no-job receipt dsp.c consumed
     * is accepted once; its new catalogue entry is the kept state. */
    static const struct runtime_dsp none;
    r = prepare(1); release(26); live_module = 0; r.before = (struct runtime_owner){0}; r.from = &none; receipt_required = 0;
    CHECK(step(&r, 0, 1) == 100 && catalogue_generation[26] == 2 && checked_catalogue(&r.after, r.to, 70));
    CHECK(!modwerk_machine_journal_accept(&r, 1) && !accepts); /* not a trial yet */
    progress.phase = RJ_TRIAL;
    struct runtime_journal_view stranger = r; stranger.module = 71; CHECK(!modwerk_machine_journal_accept(&stranger, 1) && !accepts);
    board.state[0] = TOUCHED; CHECK(!modwerk_machine_journal_accept(&r, 1) && !accepts); board.state[0] |= PUBLISHED; /* reversed */
    accept_result = 0; CHECK(!modwerk_machine_journal_accept(&r, 1) && accepts == 1 && board.rows == 1 && board.generation == 7);
    accept_result = 1; CHECK(modwerk_machine_journal_accept(&r, 1) == 1 && accepts == 2 && !board.rows);
    CHECK(!modwerk_machine_journal_accept(&r, 1) && accepts == 2); /* consumed once */
    progress.phase = RJ_IDLE; modwerk_machine_journal_idle(7);
    CHECK(releases == 1 && !board.generation && !board.poisoned && catalogue_generation[26] == 2 && checked_catalogue(&r.after, r.to, 70));
    /* A replacement retires its predecessor: no roots proof, refused before the manager, unchanged. */
    r = prepare(1); CHECK(step(&r, 0, 1) == 100); progress.phase = RJ_TRIAL;
    CHECK(!modwerk_machine_journal_accept(&r, 1) && accepts == 2 && board.rows == 1 && board.state[0] == (TOUCHED | PUBLISHED));
    /* Unknown manager answer poisons: unknown now and after, no release. */
    r = prepare(1); release(26); live_module = 0; r.before = (struct runtime_owner){0}; r.from = &none; receipt_required = 0;
    CHECK(step(&r, 0, 1) == 100); progress.phase = RJ_TRIAL; accept_result = -1;
    CHECK(modwerk_machine_journal_accept(&r, 1) == -1 && board.poisoned && accepts == 3);
    CHECK(modwerk_machine_journal_accept(&r, 1) == -1 && accepts == 3);
    progress.phase = RJ_IDLE; modwerk_machine_journal_idle(7); CHECK(releases == 1 && board.generation == 7);
    if (failures) return 1;
    puts("Journal board: stored manager receipts drive dsp.c's checked commit once, forward/reverse/unpublished/CF-only; stale map, refused extents and unknown catalogue publish nothing; Keep accepts a fresh install once, refuses a replacement, poisons on unknown.");
    return 0;
}
