/* SPDX-License-Identifier: GPL-3.0-or-later
 * Host check of the self-test's placement (dsp.c, PROJ > MODWERK > SELF TEST), against a modelled DSP manager:
 * each core admits a live set when its distinct loaded code, old and new together (the allocator places new code
 * beside live code), fits the core's arena and its slots fit the cycle allowance; anything else is refused and
 * counted as the manager counts it. "Alone" means alone: a module the Part's own effects crowd off one core runs on
 * the other, or on a core with nothing else; only one no core takes even then fails (SELFTEST_NOT_LOADED). The Part
 * and the knob lanes come back as they were. (cc -DMODWERK_HOST -DMODWERK_DSP_ALLOWANCE0=3120
 * -DMODWERK_DSP_ALLOWANCE1=3565 -DMODWERK_DSP_RESERVE=342) */
#define MODWERK_HOST_SELFTEST
#include "sha256.c"
volatile uint32_t modwerk_flash_refusal; /* flash.c, not linked here */
#include "dsp.c"
int modwerk_runtime_restoring(void) { return 0; } /* loader.c's: no restore here */
volatile uint32_t dl_residency_words[2]; /* manager.c: each core's resident code words (dsp.c's budget box) */
#include "fxmap.c"
#include <stdio.h>
#include <string.h>
const struct fx_legacy modwerk_fx_legacy[] = {{0x873d83ccu, 27, "E-Verb"}};
const uint32_t modwerk_fx_legacy_count = 1;
int modwerk_fxpage_build(unsigned id, uint8_t *recipe, uint32_t bytes, unsigned slots) { (void)id; (void)recipe; (void)bytes; (void)slots; return 1; }
void modwerk_fxpage_drop(unsigned id) { (void)id; }
int modwerk_runtime_owner_snapshot(const uint8_t *p,struct runtime_owner *o) { (void)p;(void)o;return 0; }
int modwerk_runtime_owner_valid(const struct runtime_owner *o) { (void)o;return 0; }
int modwerk_runtime_owner_canonical(const struct runtime_owner *o,uintptr_t *a) { (void)o;(void)a;return 0; }
const struct runtime_module *modwerk_runtime_module(unsigned p) { (void)p;return 0; }
void modwerk_runtime_journal_snapshot(struct runtime_journal_progress *p) { *p=(struct runtime_journal_progress){0}; }
int modwerk_fxpage_validate(unsigned i,const uint8_t *p,uint32_t n,unsigned s) { (void)i;(void)p;(void)n;(void)s;return 0; }
int modwerk_fxpage_current(unsigned i,const uint8_t *p,uint32_t n,unsigned s) { (void)i;(void)p;(void)n;(void)s;return 0; }
int modwerk_fxpage_commit_checked(unsigned i,uint8_t *p,uint32_t n,unsigned s) { (void)i;(void)p;(void)n;(void)s;return 0; }

static unsigned failures;
#define CHECK(x) do { if (!(x)) { failures++; fprintf(stderr, "%s:%d: %s\n", __FILE__, __LINE__, #x); } } while (0)

const fx_set modwerk_fx_modules = {{1u << 26 | 1u << 27 | 1u << 28}};
#define PLATE 20  /* two stock reverbs loaded on demand, as the beta base loads them: their code takes arena words */
#define SPRING 21
struct dl_package dl_catalog[MODWERK_FX_IDS];
struct code dl_codes[2][MODWERK_FX_IDS];
const uint16_t modwerk_dsp_arena[2] = {2396, 3269}; /* the beta base's: resident engines take the rest */
int dl_publication_idle(void) { return 1; }
uint32_t dl_slot_cycles(unsigned i) { (void)i; return 0; }

/* What the self-test reads of the manager, the transport and the meters. */
volatile uint8_t dl_intended_override[16];
volatile uint32_t modwerk_status[12], modwerk_status_reads, modwerk_status_fast;
volatile uint32_t dl_residency_rollbacks, dl_residency_failures, dl_frame_gap, dl_frames, dl_rejected[2], dl_errors;
volatile uint32_t modwerk_modset_generation, modwerk_modset_count, modwerk_modset_result, dl_pool_base[2];
static unsigned modules;
unsigned modwerk_runtime_active(void) { return modules; }
unsigned modwerk_runtime_intact(void) { return modules; }
uint32_t modwerk_runtime_broken(void) { return 0; }
static enum runtime_refusal test_refusal; /* the loader's own last refusal */
enum runtime_refusal modwerk_runtime_refusal(void) { return test_refusal; }
static int test_keybus_lost; /* controller_board.c's answer: a live reader whose key bus cannot come up this boot */
int modwerk_controller_keybus_lost(void) { return test_keybus_lost; }
int modwerk_machine_stopped(void) { return !modwerk_test_playing; }
void modwerk_post_key(unsigned code, int pressed)
{
    if (pressed && code == 0x28u) modwerk_test_playing = 1; /* PLAY */
    if (pressed && code == 0x27u) modwerk_test_playing = 0; /* STOP */
}
/* The modelled manager: per core, the ids whose code is loaded; a refused set changes nothing. `cached`: code still
 * bound from an earlier run, which the manager drops only when it needs the room (here: never). */
static uint8_t loaded[2][MODWERK_FX_IDS], cached[2][MODWERK_FX_IDS], observed[16];
static int observed_valid, job[2] = {-2, -2};
static unsigned sums, emptied_runs;
static const uint8_t *the_part;
int dl_bound(unsigned core, unsigned id) { return id < MODWERK_FX_IDS && (loaded[core][id] || cached[core][id]); }
int dl_placed(unsigned core, unsigned id) { return dl_bound(core, id) ? 0 : -1; }
int dl_sum_start(unsigned core, unsigned offset, unsigned count, uint32_t expected)
{
    (void)offset, (void)count, (void)expected;
    if (job[core] != -2) return 0;
    job[core] = 1, ++sums;
    return 1;
}
int dl_job_status(unsigned core) { return job[core]; }
void dl_job_release(unsigned core) { job[core] = -2; }
static void manager(void)
{
    ++dl_frames, ++modwerk_status_reads;
    if (observed_valid && !memcmp(observed, modwerk_test_live_fx, 16)) return;
    memcpy(observed, modwerk_test_live_fx, 16), observed_valid = 1;
    uint8_t want[2][MODWERK_FX_IDS] = {{0}};
    uint32_t cycles[2] = {0, 0};
    for (unsigned i = 0; i < 16u; ++i) {
        unsigned c = core_of_slot(i), p = modwerk_test_live_fx[i];
        cycles[c] += dl_catalog[p].cycles;
        if (!dl_catalog[p].resident) want[c][p] = 1;
    }
    for (unsigned c = 0; c < 2u; ++c) {
        unsigned words = 0;
        for (unsigned p = 0; p < MODWERK_FX_IDS; ++p) if (want[c][p] || loaded[c][p]) words += dl_catalog[p].words;
        if (words > modwerk_dsp_arena[c] || cycles[c] > (c ? MODWERK_DSP_ALLOWANCE1 : MODWERK_DSP_ALLOWANCE0)) {
            ++dl_residency_failures; /* refused: no code changes; a slot whose code is not bound is parked (NONE) */
            for (unsigned i = 0; i < 16u; ++i) {
                unsigned p = modwerk_test_live_fx[i];
                if (p && !dl_catalog[p].resident && !dl_bound(core_of_slot(i), p)) modwerk_test_live_fx[i] = 0;
            }
            memcpy(observed, modwerk_test_live_fx, 16);
            return;
        }
    }
    memcpy(loaded, want, sizeof loaded);
    for (unsigned c = 0; c < 2u; ++c) { /* a module running on a core whose Part effects the test took off */
        unsigned emptied = 0, module = 0;
        for (unsigned i = 0; i < 16u; ++i)
            if (core_of_slot(i) == c) module += owner[modwerk_test_live_fx[i]] != 0, emptied += the_part[i] && !modwerk_test_live_fx[i];
        emptied_runs += module && emptied;
    }
}

static uint32_t code[4096];
static const uint16_t relocations[1];
static struct runtime_dsp none;
static struct runtime_dsp module(uint8_t id, uint32_t words, uint16_t cycles, uint32_t runtime_id, const char *name)
{
    struct runtime_dsp d = {.words = code, .relocations = relocations, .count = words, .init = 1, .proc = 2, .cycles = cycles,
                            .id = id, .slots = 2, .kind = RUNTIME_HARDWARE, .state = 70, .module = runtime_id, .layout = 1};
    for (unsigned i = 0; name[i] && i < 15u; ++i) d.name[i] = name[i];
    return d;
}
static uint8_t bank[0x9504a + 4 * 6322];
static void (*during)(void); /* called on every tick of a run, when a check needs the test running */
/* One run: `part` is what each slot runs (FX1 T1-T8, then FX2), the modules installed; the record afterwards. */
static void run(const uint8_t *part, struct runtime_dsp *fx, unsigned n)
{
    for (unsigned k = 0; k < MODWERK_FX_IDS; ++k) release(k);
    for (unsigned k = 0; k < MODWERK_FX_IDS; ++k) dl_catalog[k] = (struct dl_package)STOCK;
    dl_catalog[PLATE] = (struct dl_package){900, 1, MODWERK_DSP_RESERVE, 2, 0, 1, 0};
    dl_catalog[SPRING] = (struct dl_package){1063, 1, MODWERK_DSP_RESERVE, 2, 0, 1, 0};
    for (unsigned k = 0; k < n; ++k) modwerk_machine_dsp_switch(&none, &fx[k]);
    modules = n;
    memcpy(modwerk_test_live_fx, part, 16), the_part = part;
    memset(loaded, 0, sizeof loaded), observed_valid = 0, dl_residency_failures = 0;
    manager();
    CHECK(!memcmp(observed, part, 16) && dl_residency_failures == 0); /* the Part runs as it is */
    emptied_runs = 0;
    for (unsigned i = 0; i < 16u; ++i) dl_intended_override[i] = 255u;
    for (unsigned i = 0; i < sizeof modwerk_test_lanes; ++i) modwerk_test_lanes[i] = (uint8_t)(i * 7u + 3u);
    for (unsigned i = 0; i < sizeof bank; i += 97u) bank[i] = (uint8_t)i;
    modwerk_test_bank = bank;
    for (unsigned p = 0; p < 4u; ++p) memcpy(bank + 0x8ed80 + p * 6322u, part, 16), memcpy(bank + 0x9504a + p * 6322u, part, 16);
    static uint8_t lanes[sizeof modwerk_test_lanes], before[sizeof bank];
    memcpy(lanes, modwerk_test_lanes, sizeof lanes), memcpy(before, bank, sizeof bank);
    CHECK(modwerk_selftest_start());
    for (unsigned tick = 0; modwerk_selftest.state == SELFTEST_RUNNING && tick < 200000u; ++tick) {
        manager(), selftest_tick();
        if (during) during();
    }
    CHECK(modwerk_selftest.state != SELFTEST_RUNNING && !modwerk_test_playing);
    CHECK(!memcmp(modwerk_test_live_fx, part, 16) && settled(part));   /* every slot runs what it ran, its code loaded */
    CHECK(!memcmp(modwerk_test_lanes, lanes, sizeof lanes));           /* every knob byte as it was */
    CHECK(!memcmp(bank, before, sizeof bank));                         /* every Part, working and saved, untouched */
    for (unsigned i = 0; i < 16u; ++i) CHECK(dl_intended_override[i] == 255u);
    for (unsigned k = 0; k < n; ++k) modwerk_machine_dsp_switch(&fx[k], &none);
}
/* Beta finding 63: while the test runs, a machine voice not charged before waits for its end; one charged keeps its. */
static unsigned during_checked;
static void frozen_claims(void)
{
    if (during_checked++) return;
    CHECK(modwerk_dsp_source_claim(1, 0xcdu, 50, 10, RUNTIME_HARDWARE) == RUNTIME_BUSY);
    CHECK(modwerk_dsp_source_claim(0, 0xabu, 411, 3, RUNTIME_EXECUTED) == RUNTIME_OK);
}
int main(void)
{
    (void)rebind_tick; /* test_dsp.c covers it */
    dl_pool_base[0] = dl_pool_base[1] = 0x40;
    /* An E-Verb-sized module (1,588 words), and core 0 (T5-T8) full of stock reverbs: 1,963 of its 2,396 words. */
    struct runtime_dsp verb = module(27, 1588, 600, 0x873d83ccu, "E-Verb");
    const uint8_t crowded0[16] = {0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, SPRING, SPRING, PLATE, PLATE};
    run(crowded0, &verb, 1);
    CHECK(modwerk_selftest.state == SELFTEST_PASSED && !modwerk_selftest.failed && modwerk_selftest.ran == 1);
    CHECK(modwerk_selftest.track[0] == 27 && !emptied_runs); /* T1, beside the Part's effects there */
    /* Both cores crowded (core 1 keeps 1,306 of 3,269 words): only a core emptied of the Part's effects holds it. The
     * modules come off before the reverbs go back, or the reverbs would not fit beside it. */
    const uint8_t crowded[16] = {0, 0, 0, 0, 0, 0, 0, 0, SPRING, SPRING, PLATE, PLATE, SPRING, SPRING, PLATE, PLATE};
    run(crowded, &verb, 1);
    CHECK(modwerk_selftest.state == SELFTEST_PASSED && !modwerk_selftest.failed && modwerk_selftest.ran == 1);
    CHECK(modwerk_selftest.track[4] == 27 && emptied_runs);  /* T5, its core otherwise NONE */
    CHECK(dl_residency_failures >= 2u && !modwerk_selftest.culprit);
    /* Larger than either core's arena: it runs nowhere, and the test says so and names it. */
    struct runtime_dsp huge = module(28, 3300, 600, 0x1234u, "Huge");
    run(crowded0, &huge, 1);
    CHECK(modwerk_selftest.state == SELFTEST_FAILED && modwerk_selftest.failed == SELFTEST_NOT_LOADED && !modwerk_selftest.ran);
    CHECK(modwerk_selftest.culprit == 0x1234u && !strcmp((const char *)modwerk_selftest.culprit_name, "Huge"));
    /* A batch: the first runs on T1, the second is refused on T5 (core 0 crowded), waits for the next batch and runs
     * there, first and alone: no failure for the batch's sake. */
    struct runtime_dsp pair[2] = {verb, module(26, 1200, 500, 0x5678u, "Small")};
    run(crowded0, pair, 2);
    CHECK(modwerk_selftest.state == SELFTEST_PASSED && !modwerk_selftest.failed && modwerk_selftest.ran == 2);
    CHECK(sums >= 2u);
    /* Two that together pass core 0's cycles (8 x 342 floor, each module 258 more: 3,252 of 3,120), the second's code
     * still bound on core 0 from an earlier run: refused beside the first, it must not count as run there. It waits
     * for the next batch and runs alone (the owner's MKII, E-Verb beside Air Chorus, failed as refused under load). */
    const uint8_t blank[16] = {0};
    struct runtime_dsp heavy[2] = {verb, module(26, 400, 600, 0x5678u, "Small")};
    cached[0][27] = 1; /* Small goes first; the E-Verb-sized one is the refused second */
    run(blank, heavy, 2);
    cached[0][27] = 0;
    CHECK(modwerk_selftest.state == SELFTEST_PASSED && !modwerk_selftest.failed && modwerk_selftest.ran == 2);
    CHECK(modwerk_selftest.track[4] == 27 && !modwerk_selftest.track[5] && dl_residency_failures >= 1u); /* last batch: alone, T5 */
    /* Beta finding 63: emptying a core must not let a machine voice in (an Analog BD track on T1 took 726 cycles of
     * core 1 that way on the owner's MKII, and the bank's own effects there could not come back). A voice charged before
     * the test keeps its claim; a new one waits for the end, then goes through. */
    CHECK(modwerk_dsp_source_claim(0, 0xabu, 411, 3, RUNTIME_EXECUTED) == RUNTIME_OK);
    during = frozen_claims;
    run(blank, &verb, 1);
    during = 0;
    CHECK(during_checked && modwerk_selftest.state == SELFTEST_PASSED);
    CHECK(modwerk_dsp_source_claim(1, 0xcdu, 50, 10, RUNTIME_HARDWARE) == RUNTIME_OK);
    modwerk_dsp_source_engine_off(0xabu), modwerk_dsp_source_engine_off(0xcdu);
    /* A live reader whose key bus was lost this boot: the test fails with SELFTEST_FEATURE (a trial is not kept), and
     * the record's refusal says RUNTIME_FEATURE while it holds. */
    test_keybus_lost = 1;
    run(blank, &verb, 1);
    CHECK(modwerk_selftest.state == SELFTEST_FAILED && modwerk_selftest.failed == SELFTEST_FEATURE);
    modwerk_selftest_refresh();
    CHECK(modwerk_selftest.refusal == RUNTIME_FEATURE);
    /* The loader's own refusal comes first: the site retries RUNTIME_BUSY and explains a rejected sync from it. */
    test_refusal = RUNTIME_BUSY;
    modwerk_selftest_refresh();
    CHECK(modwerk_selftest.refusal == RUNTIME_BUSY);
    test_refusal = RUNTIME_CONFLICT;
    modwerk_selftest_refresh();
    CHECK(modwerk_selftest.refusal == RUNTIME_CONFLICT);
    test_refusal = RUNTIME_OK;
    test_keybus_lost = 0;
    modwerk_selftest_refresh();
    CHECK(modwerk_selftest.refusal == RUNTIME_OK);
    if (failures) { fprintf(stderr, "%u self-test checks failed\n", failures); return 1; }
    puts("Octatrack self-test: a module crowded off one core runs on the other or on a core of its own, one no core holds "
         "fails alone and is named, a refused batch member runs in the next batch, and the Part and its knobs come back.");
    return 0;
}
