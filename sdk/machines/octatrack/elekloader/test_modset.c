/* SPDX-License-Identifier: GPL-3.0-or-later
 * Host check of modset.c with a pretend card: accepted packages are saved to the two files in turn, a
 * removal drops its module, the newest whole set is installed after a boot, a damaged newer file leaves the
 * older one, and another base's set or a held PROJ or FUNC installs nothing. A Keep joins the set only as exactly the
 * trial's whole-set identity, and its save reports unsaved and failed until the card has it. A start that crashed,
 * stopped or hung while its restore ran leaves the package it was installing out, or holds the set once. A module
 * switched off on the unit is unloaded and waits on the shelf, across power cycles, until it is switched on or a host
 * installs or removes it; a refused switch changes nothing. */
#define MODWERK_RUNTIME_VOLATILE_JOURNAL
#include "sha256.c"
#include "modset.c"
static unsigned set_records;
void modwerk_diag_set(void) { ++set_records; } /* diag.c: counted here */
static uint32_t refused_m, refused_c, refused_used, refused_largest, refuse_id;
static uint32_t pool_free = RUNTIME_POOL_BYTES, pool_largest = RUNTIME_POOL_BYTES; /* the loader's pool, as the test sets it */
uint32_t modwerk_runtime_free(uint32_t *largest) { if (largest) *largest = pool_largest; return pool_free; }
static unsigned busy_left; /* refuse_id's next refusals; then it installs (0: refused every time) */
static enum runtime_refusal refusal_now = RUNTIME_BUSY;
static uint32_t refused_check_now = RUNTIME_CHECK_CLAIMS, refused_k; /* the check the stub loader names, and what the log got */
enum runtime_check modwerk_runtime_refused_check(void) { return (enum runtime_check)refused_check_now; }
void modwerk_diag_refused(uint32_t module, uint32_t refusal, uint32_t used, uint32_t largest, uint32_t check) { refused_m = module, refused_c = refusal, refused_used = used, refused_largest = largest, refused_k = check; }
enum runtime_refusal modwerk_runtime_refusal(void) { return refusal_now; }
static enum runtime_refusal noted = RUNTIME_MALFORMED; /* what modset.c told the loader a refusal was */
void modwerk_runtime_refused(enum runtime_refusal why) { noted = why; }
#include <setjmp.h>
#include <stdio.h>
#include <string.h>

static unsigned failures;
#define CHECK(x) do { if (!(x)) { failures++; fprintf(stderr, "%s:%d: %s\n", __FILE__, __LINE__, #x); } } while (0)
/* Keys as the panel reports them: code row * 8 + bit of the held-key rows (scripts/device.mjs). */
#define FUNC 0x2du
#define PROJ 0x1cu
#define PART 0x1du /* PROJ's neighbour in its row */
#define HOLD(code) (modwerk_test_keys[(code) >> 3] |= (uint8_t)(1u << ((code) & 7u)))
#define LET_GO() memset(modwerk_test_keys, 0, sizeof modwerk_test_keys)
const uint8_t modwerk_base_digest[32] = {1, 2, 3};
static uint8_t card[2][SET_BYTES], card_shelf[2][SET_BYTES];
static int card_bytes[2], card_shelf_bytes[2];
static int volatile_busy;
static unsigned writes, write_fail;
int modwerk_runtime_volatile_busy(void) { return volatile_busy; }
int modwerk_test_file(int op, const char *path, uint8_t *data, unsigned n)
{
    int which = path[8] == '1';
    if (op == 2) { memcpy(data, card_shelf[which], (size_t)card_shelf_bytes[which]); return card_shelf_bytes[which]; }
    if (op == 3) { memcpy(card_shelf[which], data, n); card_shelf_bytes[which] = (int)n; return 1; }
    if (op == 1) card_shelf_bytes[which] = 0; /* a new file: the shelf follows, or none */
    if (op == 1 && write_fail) { ++writes; memcpy(card[which], data, n / 2); card_bytes[which] = (int)n; return 0; } /* torn */
    if (op == 1) { ++writes;memcpy(card[which], data, n); card_bytes[which] = (int)n; return 1; }
    if (!card_bytes[which]) return 0;
    memcpy(data, card[which], (size_t)card_bytes[which]);
    return card_bytes[which];
}
static unsigned prepared, installed, entered;
static uint32_t ids[8];
static uint32_t crash_id, stall_id; /* the package whose install crashes the unit (crash.c restarts it) or stops a DSP */
static jmp_buf crashed;
static int enter(void *u) { (void)u; ++entered; return 1; }
static int safe(void *u) { (void)u; return 1; }
static int leave(void *u) { (void)u; return 1; }
static int prepare(void *u, const uint8_t *d, uint32_t n)
{
    (void)u; ids[prepared++ % 8] = be32(d + 28);
    if (crash_id && be32(d + 28) == crash_id) { ++modwerk_test_crashes; longjmp(crashed, 1); }
    if (stall_id && be32(d + 28) == stall_id) { ++modwerk_test_stalls; return 0; } /* dsp.c shuts the loader off */
    int ok = (n > 32u || !be32(d + 8)) && be32(d + 28) != refuse_id; /* a removal is 32 bytes (the site's, modset.c's) */
    if (!ok && busy_left && !--busy_left) refuse_id = 0; /* the last refusal: it installs next */
    return ok;
}
static int discard(void *u) { (void)u; return 1; }
static enum mu_publication publish(void *u) { (void)u; return MU_APPLIED; }
static int restore_backend(void *u) { (void)u; return 1; }
static int retire(void *u) { (void)u; ++installed; return 1; }
const struct mu_backend modwerk_runtime_backend = {0, enter, safe, leave, prepare, discard, publish, restore_backend, retire};

static uint8_t package[5][48];
static void make(unsigned k, uint32_t id, int removal)
{
    memset(package[k], 0, 48);
    memcpy(package[k], "MWRM", 4); package[k][5] = 4;
    put32(package[k] + 8, removal ? 0 : 4); put32(package[k] + 28, id);
}
static void accept(unsigned k, uint32_t n) { modwerk_modset_candidate(package[k], n); modwerk_modset_accepted(); }
static void cut(void) /* RAM gone, the card and battery RAM kept: a crash restart or a power cycle */
{
    memset(set, 0, sizeof set); restored = 0; pending = 0; slot = 0; keep_bytes = 0; prepared = installed = entered = 0; restore_tries = 0;
    restore_count = 0; adopted = 0;
    modwerk_modset_result = 0; notice = 0; notice_after = 0; modwerk_test_ticks = 200;
    modwerk_modset_notice_tick(); /* the ticks before the restore */
}
static void boot(void) { modwerk_test_guard.armed = 0; cut(); } /* after a start that ran and settled */
static void run(unsigned ticks) { while (ticks--) ++modwerk_test_ticks, ++modwerk_test_frames, modwerk_modset_notice_tick(); }
static void stand(unsigned ticks) { while (ticks--) ++modwerk_test_ticks, modwerk_modset_notice_tick(); } /* frames stopped */
static uint8_t named[2][72];
static void make_named(unsigned k, uint32_t id, const char *name) /* ABI 6: its name at 50 */
{
    memset(named[k], 0, 72); memcpy(named[k], "MWRM", 4); named[k][5] = 6;
    put32(named[k] + 8, 4); put32(named[k] + 28, id); memcpy(named[k] + 50, name, strlen(name) < 15 ? strlen(name) : 15);
}
static int said(const char *text) { return modwerk_test_said && !strcmp(modwerk_test_said, text); }

/* The whole-set identity a journal reports for these live packages (journal.h). */
static int identity(const uint8_t *const p[], const uint32_t b[], unsigned n, uint8_t out[32])
{
    uint32_t ids[8]; uint8_t sha[8 * 32];
    for (unsigned i = 0; i < n; ++i) ids[i] = be32(p[i] + 28), mu_sha256(p[i], b[i], sha + 32 * i);
    return runtime_journal_set_digest(ids, sha, n, out);
}

int main(void)
{
    make(0, 0x873d83ccu, 0); make(1, 0x3cbedc9cu, 0); make(2, 0x873d83ccu, 1);
    modwerk_test_ticks = 200; restored = 1; /* a running unit */
    accept(0, 48); accept(1, 40);
    CHECK(modwerk_modset_count == 2 && pending);
    modwerk_modset_service();
    CHECK(!pending && card_bytes[1] && !card_bytes[0] && modwerk_modset_result == SAVED);   /* slot 1 first */
    accept(0, 48);                                                                           /* a replacement */
    CHECK(modwerk_modset_count == 2);
    accept(2, 36);                                                                           /* E-Verb removed */
    CHECK(modwerk_modset_count == 1);
    modwerk_modset_service();
    CHECK(card_bytes[0] && be32(card[0] + 8) > be32(card[1] + 8));                          /* slot 0, newer */
    /* Every actual saved-set path refuses while the private journal owns
     * RAM: staged/accepted trial packages do not mutate the saved baseline,
     * service/direct store cannot issue even a first write, including when
     * a preceding baseline save was pending. */
    uint8_t before_set[SET_BYTES];memcpy(before_set,set,sizeof set);
    uint8_t before_hash[2][32],digest[32];
    for(unsigned i=0;i<2;i++){mu_sha256(card[i],(uint32_t)card_bytes[i],digest);memcpy(before_hash[i],digest,32);}
    unsigned written=writes,generation=modwerk_modset_generation;
    volatile_busy=1;
    for(unsigned phase=0;phase<7;phase++) {
        modwerk_modset_candidate(package[0],48);modwerk_modset_accepted();pending=1;
        modwerk_modset_service();CHECK(!store(0) && !store(1));
        CHECK(writes==written && modwerk_modset_generation==generation && !memcmp(before_set,set,sizeof set));
        for(unsigned i=0;i<2;i++){mu_sha256(card[i],(uint32_t)card_bytes[i],digest);CHECK(!memcmp(before_hash[i],digest,32));}
    }
    pending=0;volatile_busy=0;
    /* After a boot: the newest set, installed through the loader. */
    boot(); modwerk_modset_service();
    CHECK(modwerk_modset_result == RESTORED && installed == 1 && ids[0] == 0x3cbedc9cu && entered == 1 && !refused_m);
    /* One refused BUSY (finding 69): tried again every half second, the host held meanwhile, and left out after ten
     * seconds; the log names the refused module and the loader's refusal. */
    refuse_id = 0x3cbedc9cu; written = writes; pool_free = 4096u, pool_largest = 2048u; boot(); modwerk_modset_service();
    CHECK(!restored && prepared == 1 && !modwerk_modset_result);
    modwerk_test_ticks += RESTORE_RETRY - 1; modwerk_modset_service(); CHECK(prepared == 1); /* not before its time */
    for (unsigned t = 0; t < 40u && !restored; ++t) modwerk_test_ticks += RESTORE_RETRY, modwerk_modset_service();
    CHECK(restored && prepared == RESTORE_TRIES);
    CHECK(modwerk_modset_result == REFUSED && !installed && refused_m == 0x3cbedc9cu && refused_c == RUNTIME_BUSY);
    CHECK(refused_used == RUNTIME_POOL_BYTES - 4096u && refused_largest == 2048u && refused_k == RUNTIME_CHECK_CLAIMS); /* the pool
                                                                    * when it was left out, and the check that refused it */
    pool_free = pool_largest = RUNTIME_POOL_BYTES;
    CHECK(used() == HEADER && !pending && writes == written); /* set[] names what runs; the card keeps it */
    refuse_id = 0, refused_m = refused_c = refused_used = refused_largest = 0;
    /* BUSY twice, then it installs: the whole set, as the card has it, with nothing sealed or written. */
    refuse_id = 0x3cbedc9cu, busy_left = 2; boot(); modwerk_modset_service();
    for (unsigned t = 0; t < 40u && !restored; ++t) modwerk_test_ticks += RESTORE_RETRY, modwerk_modset_service();
    CHECK(modwerk_modset_result == RESTORED && installed == 1 && prepared == 3 && !refused_m);
    CHECK(!memcmp(set, card[slot], (size_t)card_bytes[slot]) && !pending && writes == written);
    /* Any other refusal is left out at once. */
    refuse_id = 0x3cbedc9cu, refusal_now = RUNTIME_CONFLICT; boot(); modwerk_modset_service();
    CHECK(restored && prepared == 1 && modwerk_modset_result == REFUSED && refused_c == RUNTIME_CONFLICT);
    refuse_id = 0, refused_m = refused_c = 0, refusal_now = RUNTIME_BUSY;
    /* The newer file damaged: the older one, with both modules. */
    card[0][HEADER + 9] ^= 1; boot(); modwerk_modset_service();
    CHECK(modwerk_modset_result == RESTORED && installed == 2);
    /* Nothing installed: FUNC held, PROJ held (from power-on, where FUNC opens the Startup Menu), or a set another
     * base wrote. PART, beside PROJ in its row, installs as usual. */
    card[0][HEADER + 9] ^= 1; HOLD(FUNC); boot(); modwerk_modset_service();
    CHECK(modwerk_modset_result == SKIPPED && !installed);
    LET_GO(); HOLD(PROJ); modwerk_test_said = 0; boot(); modwerk_modset_service();
    CHECK(modwerk_modset_result == SKIPPED && !installed && modwerk_test_said && !strcmp(modwerk_test_said, "MODULES SKIPPED"));
    LET_GO(); HOLD(PART); boot(); modwerk_modset_service();
    CHECK(modwerk_modset_result == RESTORED && installed == 1);
    LET_GO(); card[0][20] ^= 1; card[1][20] ^= 1; boot(); modwerk_modset_service();
    CHECK(modwerk_modset_result == FOREIGN && !installed);
    /* A closed gate waits: no restore, no save. */
    card[0][20] ^= 1; card[1][20] ^= 1; boot(); modwerk_test_gate = 0; modwerk_modset_service();
    CHECK(!restored && !installed);
    modwerk_test_gate = 1; modwerk_modset_service();
    CHECK(restored && installed == 1);
    /* The identity's encoding, independently: "MWS1", count, then (id, SHA-256) in rising id order. */
    uint8_t encoded[8 + 2 * 36] = {'M', 'W', 'S', '1', 0, 0, 0, 2}, expect[32], got[32], shas[64];
    const uint32_t two[2] = {0x22222222u, 0x11111111u};
    for (unsigned i = 0; i < 64; ++i) shas[i] = (uint8_t)(i * 7u + 1u);
    put32(encoded + 8, two[1]); memcpy(encoded + 12, shas + 32, 32); put32(encoded + 44, two[0]); memcpy(encoded + 48, shas, 32);
    mu_sha256(encoded, sizeof encoded, expect);
    CHECK(runtime_journal_set_digest(two, shas, 2, got) && !memcmp(got, expect, 32));
    const uint32_t same[2] = {7, 7}, zero[2] = {0, 7};
    CHECK(!runtime_journal_set_digest(same, shas, 2, got) && !runtime_journal_set_digest(zero, shas, 2, got));
    CHECK(!runtime_journal_set_digest(two, shas, RUNTIME_JOURNAL_ROWS + 1u, got));
    /* Keep, on the restored {3cbedc9c}: two fresh packages join it only as exactly the trial's identity. */
    make(3, 0x11111111u, 0); make(4, 0x22222222u, 0);
    const uint8_t *trial[3] = {package[1], package[3], package[4]}, *kept[2] = {package[3], package[4]};
    const uint32_t trial_bytes[3] = {40, 48, 48}, kept_bytes[2] = {48, 48}, huge[2] = {48, SET_BYTES + 1u}, wraps[2] = {48, 0xfffffffdu};
    uint8_t want[32], wrong[32];
    CHECK(identity(trial, trial_bytes, 3, want)); memcpy(wrong, want, 32); wrong[0] ^= 1;
    unsigned g = modwerk_modset_generation; uint32_t end = used(), length = be32(set + HEADER + 4);
    memcpy(before_set, set, HEADER);
    CHECK(!modwerk_modset_keep(kept, kept_bytes, 2, wrong));                      /* not the trial's identity */
    CHECK(!modwerk_modset_keep(kept, huge, 2, want) && !modwerk_modset_keep(kept, wraps, 2, want)); /* no package that big */
    put32(set + 16, SET_BYTES - 100u); CHECK(!modwerk_modset_keep(kept, kept_bytes, 2, want)); put32(set + 16, end);
    put32(set + HEADER + 4, 0x7fffffffu); CHECK(!modwerk_modset_keep(kept, kept_bytes, 2, want));
    put32(set + HEADER + 4, length);                                              /* an entry past the set */
    CHECK(!modwerk_modset_keep(trial, trial_bytes, 1, want));                     /* a module already in the set */
    restored = 0; CHECK(!modwerk_modset_keep(kept, kept_bytes, 2, want)); restored = 1;
    modwerk_modset_kept();
    CHECK(!memcmp(before_set, set, HEADER) && modwerk_modset_generation == g && !pending && !modwerk_modset_unsaved());
    CHECK(modwerk_modset_keep(kept, kept_bytes, 2, want) && !memcmp(before_set, set, HEADER) && !pending);
    modwerk_modset_kept(); modwerk_modset_kept();                                 /* sealed once */
    CHECK(modwerk_modset_generation == g + 1 && modwerk_modset_count == 3 && pending && modwerk_modset_unsaved() == 1u);
    CHECK(modwerk_modset_due());                                                  /* ep0.c's tick wakes the engine */
    modwerk_test_gate = 0; modwerk_modset_service(); CHECK(pending && modwerk_modset_due()); modwerk_test_gate = 1;
    write_fail = 1; modwerk_modset_service();
    CHECK(modwerk_modset_result == SAVE_FAILED && pending && modwerk_modset_unsaved() == 3u && !modwerk_modset_due());
    write_fail = 0; written = writes; modwerk_modset_service(); CHECK(writes == written); /* ten seconds to the retry */
    modwerk_test_ticks += 600; CHECK(modwerk_modset_due()); modwerk_modset_service();
    CHECK(modwerk_modset_result == SAVED && !pending && !modwerk_modset_unsaved() && !modwerk_modset_due());
    accept(0, 48); CHECK(modwerk_modset_count == 4); modwerk_modset_service(); /* a legacy install keeps the kept */
    boot(); modwerk_modset_service(); CHECK(modwerk_modset_result == RESTORED && installed == 4);
    /* A FUNC or PROJ boot installs nothing yet keeps the card's newest generation: what is saved after it wins at the next
     * boot (it used to save generation 1 and lose to the older set), and with nothing saved the old set returns. */
    unsigned newest = modwerk_modset_generation;
    HOLD(FUNC); boot(); modwerk_modset_service(); LET_GO();
    CHECK(modwerk_modset_result == SKIPPED && !installed && used() == HEADER && be32(set + 8) == newest);
    boot(); modwerk_modset_service(); CHECK(modwerk_modset_result == RESTORED && installed == 4);
    HOLD(PROJ); boot(); modwerk_modset_service(); LET_GO();
    CHECK(modwerk_modset_result == SKIPPED && !installed && used() == HEADER && be32(set + 8) == newest);
    CHECK(identity(kept, kept_bytes, 2, want) && modwerk_modset_keep(kept, kept_bytes, 2, want)); /* nothing live: only the kept */
    modwerk_modset_kept(); modwerk_modset_service();
    CHECK(modwerk_modset_result == SAVED && modwerk_modset_generation == newest + 1);
    boot(); modwerk_modset_service(); CHECK(modwerk_modset_result == RESTORED && installed == 2);
    HOLD(FUNC); boot(); modwerk_modset_service(); LET_GO();
    accept(0, 48); modwerk_modset_service(); CHECK(modwerk_modset_result == SAVED && modwerk_modset_generation == newest + 2);
    boot(); modwerk_modset_service(); CHECK(modwerk_modset_result == RESTORED && installed == 1);
    /* "MODULES LOADED" waits for the engines the bank uses: half a second at least, ten seconds at most, once. */
    boot(); modwerk_test_said = 0; modwerk_modset_service(); CHECK(modwerk_modset_result == RESTORED && !modwerk_test_said);
    modwerk_test_settling = 1;
    for (unsigned t = 0; t < 600u; ++t, ++modwerk_test_ticks) modwerk_modset_notice_tick();
    CHECK(!modwerk_test_said);
    modwerk_modset_notice_tick(); CHECK(modwerk_test_said && !strcmp(modwerk_test_said, "MODULES LOADED"));
    modwerk_test_said = 0; modwerk_modset_notice_tick(); CHECK(!modwerk_test_said);
    boot(); modwerk_modset_service(); modwerk_test_settling = 0;
    for (unsigned t = 0; t < 30u; ++t, ++modwerk_test_ticks) modwerk_modset_notice_tick();
    CHECK(!modwerk_test_said);
    modwerk_modset_notice_tick(); CHECK(modwerk_test_said && !strcmp(modwerk_test_said, "MODULES LOADED"));
    /* The host changing the set drops a held notice; a partial restore says so at once (no engine changes that). */
    modwerk_test_said = 0; boot(); modwerk_modset_service(); modwerk_test_settling = 1;
    modwerk_modset_candidate(0, 0);
    for (unsigned t = 0; t < 700u; ++t, ++modwerk_test_ticks) modwerk_modset_notice_tick();
    CHECK(!modwerk_test_said); modwerk_test_settling = 0;
    accept(1, 48); modwerk_modset_service(); CHECK(modwerk_modset_result == SAVED && modwerk_modset_count == 2);
    refuse_id = be32(package[1] + 28); refusal_now = RUNTIME_FULL; /* not BUSY: left out at once, no retries */
    boot(); modwerk_modset_service(); refuse_id = 0; refusal_now = RUNTIME_BUSY;
    CHECK(modwerk_modset_result == REFUSED && installed == 1 && modwerk_test_said && !strcmp(modwerk_test_said, "SOME MODULES FAILED"));
    modwerk_test_said = 0;
    for (unsigned t = 0; t < 700u; ++t, ++modwerk_test_ticks) modwerk_modset_notice_tick();
    CHECK(!modwerk_test_said);

    /* The boot guard, on a fresh card: Tape Echo, Supercalifragilistic (both named), 0x103. */
    memset(card_bytes, 0, sizeof card_bytes); memset(&modwerk_test_guard, 0, sizeof modwerk_test_guard);
    boot(); restored = 1; make_named(0, 0x101u, "Tape Echo"); make_named(1, 0x102u, "Supercalifragilistic"); make(0, 0x103u, 0);
    modwerk_modset_candidate(named[0], 72); modwerk_modset_accepted(); modwerk_modset_candidate(named[1], 72); modwerk_modset_accepted();
    accept(0, 48); modwerk_modset_service(); CHECK(modwerk_modset_result == SAVED && modwerk_modset_count == 3);
    /* A start settles after ten seconds with frames moving; ticks alone (a DSP stopped) never settle it. */
    boot(); modwerk_modset_service(); CHECK(modwerk_modset_result == RESTORED && installed == 3 && modwerk_test_guard.armed);
    stand(700); CHECK(modwerk_test_guard.armed && !modwerk_test_guard.loading);
    run(GUARD_SETTLE - 1u); CHECK(modwerk_test_guard.armed); run(1); CHECK(!modwerk_test_guard.armed);
    /* A crash while Supercalifragilistic installs restarts the unit: the next start leaves it out, names it after
     * crash.c's popup and logs why, and so does every start until the card's set changes. */
    crash_id = 0x102u; boot(); if (!setjmp(crashed)) { modwerk_modset_service(); CHECK(0); } crash_id = 0;
    CHECK(modwerk_test_guard.armed && modwerk_test_guard.loading == 0x102u);
    written = writes; refused_m = refused_c = 0;
    cut(); modwerk_test_said = 0; modwerk_modset_service();
    CHECK(modwerk_modset_result == LEFT_OUT && installed == 2 && ids[1] == 0x103u && refused_m == 0x102u && refused_c == GUARD_LEFT);
    run(GUARD_NOTICE - 1u - modwerk_test_ticks); CHECK(!modwerk_test_said);
    modwerk_test_dialog = 1; run(700); CHECK(!modwerk_test_said); /* MISSING shows: the notice waits for it */
    modwerk_test_dialog = 0; run(1); CHECK(said("SUPERCALIFR LEFT OUT"));
    run(GUARD_SETTLE + 1u); CHECK(!modwerk_test_guard.armed);
    boot(); modwerk_modset_service(); CHECK(modwerk_modset_result == LEFT_OUT && installed == 2 && writes == written);
    /* A stall while Tape Echo installs: the loader refuses the rest, frames stop, and the power cycle leaves both out. */
    stall_id = 0x101u; refusal_now = RUNTIME_CONFLICT; boot(); modwerk_modset_service(); stall_id = 0; refusal_now = RUNTIME_BUSY;
    CHECK(modwerk_test_guard.loading == 0x101u); stand(700); CHECK(modwerk_test_guard.armed);
    cut(); modwerk_test_said = 0; modwerk_modset_service(); run(GUARD_NOTICE);
    CHECK(modwerk_modset_result == LEFT_OUT && installed == 1 && ids[0] == 0x103u && said("MODULES LEFT OUT"));
    /* A sync that changes the set (here it puts both back) tries every module again. */
    run(GUARD_SETTLE + 1u);
    modwerk_modset_candidate(named[0], 72); modwerk_modset_accepted(); modwerk_modset_candidate(named[1], 72); modwerk_modset_accepted();
    modwerk_modset_service(); CHECK(modwerk_modset_result == SAVED && modwerk_modset_count == 3);
    boot(); modwerk_modset_service(); CHECK(modwerk_modset_result == RESTORED && installed == 3);
    /* A crash in the ten seconds after the restore names no package: nothing loads this once, the card unchanged,
     * then the whole set again. */
    run(100); ++modwerk_test_crashes; written = writes; refused_m = 1, refused_c = 0;
    cut(); modwerk_test_said = 0; modwerk_modset_service();
    CHECK(modwerk_modset_result == HELD && !installed && used() == HEADER && writes == written && !refused_m && refused_c == GUARD_HELD);
    run(GUARD_NOTICE - 1u - modwerk_test_ticks); CHECK(!modwerk_test_said); run(1); CHECK(said("MODULES HELD"));
    cut(); modwerk_modset_service(); CHECK(modwerk_modset_result == RESTORED && installed == 3);
    /* A start that never settled with nothing recorded (a hang, or switched off early) is tried again once; the
     * second in a row is held. */
    cut(); modwerk_modset_service(); CHECK(modwerk_modset_result == RESTORED && installed == 3);
    cut(); modwerk_modset_service(); CHECK(modwerk_modset_result == HELD && !installed);
    cut(); modwerk_modset_service(); CHECK(modwerk_modset_result == RESTORED && installed == 3);
    /* Another base's guard says nothing about this one. */
    modwerk_test_guard.loading = 0x101u, ++modwerk_test_crashes, modwerk_test_guard.base ^= 1u;
    cut(); modwerk_modset_service(); CHECK(modwerk_modset_result == RESTORED && installed == 3);
    /* FUNC held after a crash skips everything, and the guard still remembers the package for the next start. */
    crash_id = 0x103u; boot(); if (!setjmp(crashed)) { modwerk_modset_service(); CHECK(0); } crash_id = 0;
    HOLD(FUNC); cut(); modwerk_modset_service(); LET_GO();
    CHECK(modwerk_modset_result == SKIPPED && !installed);
    boot(); modwerk_modset_service(); CHECK(modwerk_modset_result == LEFT_OUT && installed == 2);
    /* PROJ > MODWERK > MODULES. A unit with Tape Echo (named) and two more, saved. */
    memset(card_bytes, 0, sizeof card_bytes); memset(card_shelf_bytes, 0, sizeof card_shelf_bytes);
    memset(&modwerk_test_guard, 0, sizeof modwerk_test_guard); memset(set, 0, sizeof set); off_bytes = 0;
    cut(); restored = 1; refuse_id = 0; refusal_now = RUNTIME_IN_USE;
    make_named(0, 0x201u, "Tape Echo"); named[0][67] = 9; make(3, 0x202u, 0); make(4, 0x203u, 0);
    modwerk_modset_candidate(named[0], 72); modwerk_modset_accepted(); accept(3, 48); accept(4, 44);
    modwerk_modset_service(); CHECK(modwerk_modset_count == 3 && !pending);
    uint8_t off[8 + MODSET_OFF_ENTRY * 4], sum[32];
    CHECK(modwerk_modset_off_list(off, 0, 4) == 8 && !off[3] && !off[5] && !modwerk_modset_switch_due());
    /* Off: the loader removes it, it leaves the set for the shelf, and the card has both at once. */
    written = writes; prepared = 0;
    CHECK(modwerk_modset_switch(0x201u, 0) && modwerk_modset_switch_result == MODSET_SWITCH_PENDING && modwerk_modset_switch_due());
    CHECK(!modwerk_modset_switch(0x202u, 0));                                /* one at a time */
    modwerk_modset_service();
    CHECK(modwerk_modset_switch_result == MODSET_SWITCHED && !modwerk_modset_switch_due() && prepared == 1 && ids[0] == 0x201u);
    CHECK(modwerk_modset_count == 2 && !pending && writes == written + 1 && off_bytes == 512);
    mu_sha256(named[0], 72, sum);
    CHECK(modwerk_modset_off_list(off, 0, 4) == 8 + MODSET_OFF_ENTRY && off[3] == 1 && off[5] == 1 && be32(off + 8) == 0xff000009u &&
          be32(off + 12) == 0x201u && !strcmp((const char *)off + 16, "Tape Echo") && !memcmp(off + 32, sum, 32)); /* layout 9 */
    { uint32_t have[2]; uint8_t sha[64], want[32], got[32]; /* the set's identity is the two that run */
      have[0] = 0x202u, have[1] = 0x203u; mu_sha256(package[3], 48, sha); mu_sha256(package[4], 44, sha + 32);
      CHECK(runtime_journal_set_digest(have, sha, 2, want));
      have[0] = be32(set + HEADER), mu_sha256(set + HEADER + 8, be32(set + HEADER + 4), sha);
      have[1] = be32(set + HEADER + 56), mu_sha256(set + HEADER + 64, be32(set + HEADER + 60), sha + 32);
      CHECK(runtime_journal_set_digest(have, sha, 2, got) && !memcmp(want, got, 32)); }
    /* A power cycle: the two install, the third stays off. */
    boot(); modwerk_modset_service();
    CHECK(modwerk_modset_result == RESTORED && installed == 2 && modwerk_modset_off_list(off, 0, 4) == 8 + MODSET_OFF_ENTRY && be32(off + 12) == 0x201u);
    run(GUARD_SETTLE + 1u);
    /* Refused, and nothing changes: playing, a host session, a module a track runs, one that is not there. */
    written = writes;
    modwerk_test_playing = 1; CHECK(modwerk_modset_switch(0x202u, 0)); modwerk_modset_service(); modwerk_test_playing = 0;
    CHECK(modwerk_modset_switch_result == MODSET_SWITCH_PLAYING);
    modwerk_test_host_busy = 1; CHECK(modwerk_modset_switch(0x202u, 0)); modwerk_modset_service(); modwerk_test_host_busy = 0;
    CHECK(modwerk_modset_switch_result == MODSET_SWITCH_BUSY);
    refuse_id = 0x202u; CHECK(modwerk_modset_switch(0x202u, 0)); modwerk_modset_service(); refuse_id = 0;
    CHECK(modwerk_modset_switch_result == MODSET_SWITCH_REFUSED + RUNTIME_IN_USE);
    CHECK(modwerk_modset_switch(0x777u, 0)); modwerk_modset_service(); CHECK(modwerk_modset_switch_result == MODSET_SWITCH_GONE);
    CHECK(modwerk_modset_switch(0x202u, 1)); modwerk_modset_service(); CHECK(modwerk_modset_switch_result == MODSET_SWITCH_GONE);
    refuse_id = 0x201u; CHECK(modwerk_modset_switch(0x201u, 1)); modwerk_modset_service(); refuse_id = 0;
    CHECK(modwerk_modset_switch_result == MODSET_SWITCH_REFUSED + RUNTIME_IN_USE);
    CHECK(modwerk_modset_count == 2 && writes == written && off_bytes == 512 && be32(OFF + 8) == 1 && !pending);
    /* On: the shelved package installs byte for byte and joins the set; the shelf is empty on the card too. */
    prepared = 0; CHECK(modwerk_modset_switch(0x201u, 1)); modwerk_modset_service();
    CHECK(modwerk_modset_switch_result == MODSET_SWITCHED && prepared == 1 && ids[0] == 0x201u && modwerk_modset_count == 3 && !off_bytes);
    CHECK(be32(set + used() - 80) == 0x201u && be32(set + used() - 76) == 72 && !memcmp(set + used() - 72, named[0], 72));
    CHECK(writes == written + 1 && !card_shelf_bytes[slot]);
    boot(); modwerk_modset_service(); CHECK(modwerk_modset_result == RESTORED && installed == 3 && !off_bytes);
    run(GUARD_SETTLE + 1u);
    /* Three off, then the middle one on: the two beside it keep their packages. */
    CHECK(modwerk_modset_switch(0x202u, 0)); modwerk_modset_service(); CHECK(modwerk_modset_switch(0x201u, 0)); modwerk_modset_service();
    CHECK(modwerk_modset_switch(0x203u, 0)); modwerk_modset_service();
    CHECK(!modwerk_modset_count && used() == HEADER && be32(OFF + 8) == 3);
    CHECK(modwerk_modset_switch(0x201u, 1)); modwerk_modset_service();
    CHECK(modwerk_modset_count == 1 && modwerk_modset_off_list(off, 0, 4) == 8 + 2 * MODSET_OFF_ENTRY && be32(off + 12) == 0x202u &&
          be32(off + 12 + MODSET_OFF_ENTRY) == 0x203u && off_whole(OFF, off_bytes));
    mu_sha256(package[4], 44, sum); CHECK(!memcmp(off + 32 + MODSET_OFF_ENTRY, sum, 32));
    CHECK(modwerk_modset_off_list(off, 1, 4) == 8 + MODSET_OFF_ENTRY && be32(off + 12) == 0x203u && off[5] == 2); /* paged */
    /* A host that installs a module that is off switches it on; one that removes it takes it off the shelf. */
    accept(3, 48); CHECK(modwerk_modset_count == 2 && be32(OFF + 8) == 1 && be32(OFF + OFF_HEADER) == 0x203u);
    make(2, 0x203u, 1); accept(2, 32); CHECK(modwerk_modset_count == 2 && !off_bytes);
    modwerk_modset_service(); CHECK(!pending);
    /* PROJ held at power-on skips the set and keeps the shelf. A set whose shelf is damaged is not whole: the other
     * file's older set restores, as after a write cut short between the two. */
    CHECK(modwerk_modset_switch(0x202u, 0)); modwerk_modset_service(); CHECK(modwerk_modset_switch_result == MODSET_SWITCHED && !pending);
    HOLD(PROJ); boot(); modwerk_modset_service(); LET_GO();
    CHECK(modwerk_modset_result == SKIPPED && !installed && off_bytes == 512 && be32(OFF + OFF_HEADER) == 0x202u);
    /* This start runs none of the card's set: a switch now would save the one module over all of them, so it waits. */
    written = writes; CHECK(modwerk_modset_switch(0x202u, 1)); modwerk_modset_service();
    CHECK(modwerk_modset_switch_result == MODSET_SWITCH_PARTIAL && writes == written && used() == HEADER && off_bytes == 512);
    CHECK(modwerk_modset_is_off(0x202u) && !modwerk_modset_is_off(0x201u) && !modwerk_modset_is_off(0));
    off_moving = 1; CHECK(!modwerk_modset_is_off(0x202u)); off_moving = 2; /* while the shelf moves: not sure, so not off */
    /* Another base's set, a damaged file or a module the restore refused: a restart comes back the same, so a sync. */
    for (uint32_t r = FOREIGN; r <= REFUSED; ++r) {
        modwerk_modset_result = r; CHECK(modwerk_modset_switch(0x202u, 1)); modwerk_modset_service();
        CHECK(modwerk_modset_switch_result == MODSET_SWITCH_SYNC && writes == written && off_bytes == 512);
    }
    modwerk_modset_result = HELD; CHECK(modwerk_modset_switch(0x202u, 1)); modwerk_modset_service();
    CHECK(modwerk_modset_switch_result == MODSET_SWITCH_PARTIAL);
    modwerk_modset_result = SKIPPED;
    card_shelf[slot][OFF_HEADER + OFF_RECORD + 9] ^= 1;
    boot(); modwerk_modset_service(); CHECK(modwerk_modset_result == RESTORED && installed == 2 && !off_bytes); /* the older file: both on */

    /* RESTORE: what the restore did with every package, not only the first left out (#1528, #1596). On a fresh card,
     * Tape Echo, Supercalifragilistic (both named) and 0x303: the guard leaves the first out after a crash while it
     * installed, the loader refuses the second for module memory, the third loads. */
    memset(card_bytes, 0, sizeof card_bytes); memset(card_shelf_bytes, 0, sizeof card_shelf_bytes);
    memset(&modwerk_test_guard, 0, sizeof modwerk_test_guard); memset(set, 0, sizeof set); off_bytes = 0;
    cut(); restored = 1; refuse_id = 0; refusal_now = RUNTIME_BUSY;
    make_named(0, 0x301u, "Tape Echo"); make_named(1, 0x302u, "Supercalifragilistic"); make(3, 0x303u, 0);
    modwerk_modset_candidate(named[0], 72); modwerk_modset_accepted(); modwerk_modset_candidate(named[1], 72); modwerk_modset_accepted();
    accept(3, 48); modwerk_modset_service(); CHECK(modwerk_modset_count == 3 && !pending);
    crash_id = 0x301u; boot(); if (!setjmp(crashed)) { modwerk_modset_service(); CHECK(0); } crash_id = 0;
    uint8_t page[8 + MODSET_RESTORE_ENTRY * MODSET_RESTORE_PAGE];
    refuse_id = 0x302u; refusal_now = RUNTIME_MEMORY; refused_check_now = RUNTIME_CHECK_POOL; pool_largest = 1024u;
    cut(); CHECK(modwerk_modset_restore_list(page, 0, MODSET_RESTORE_PAGE) == 8 && !memcmp(page, "MWR", 3) && !page[3] && !page[5]);
    modwerk_test_said = 0; modwerk_modset_service();
    refuse_id = 0; refusal_now = RUNTIME_BUSY; refused_check_now = RUNTIME_CHECK_CLAIMS; pool_largest = RUNTIME_POOL_BYTES;
    CHECK(modwerk_modset_result == LEFT_OUT && installed == 1 && refused_m == 0x301u && refused_c == GUARD_LEFT); /* the log: the first only */
    CHECK(modwerk_modset_restore_list(page, 0, MODSET_RESTORE_PAGE) == 8 + 3 * MODSET_RESTORE_ENTRY && page[3] == 3 && !page[4] &&
          page[5] == 3 && page[6] == LEFT_OUT && page[7] == 1);
    const uint8_t *e = page + 8; /* left out by the guard: why 0x100, no check */
    CHECK(e[0] == 2 && !e[1] && e[2] == 1 && !e[3] && be32(e + 4) == 0x301u && be32(e + 8) == 72 && !strcmp((const char *)e + 16, "Tape Echo"));
    e += MODSET_RESTORE_ENTRY; /* refused: the loader's refusal and check, and the pool's largest free run then */
    CHECK(e[0] == 2 && e[1] == RUNTIME_CHECK_POOL && !e[2] && e[3] == RUNTIME_MEMORY && be32(e + 4) == 0x302u && be32(e + 8) == 72 &&
          be32(e + 12) == 1024u && !strcmp((const char *)e + 16, "Supercalifragil"));
    e += MODSET_RESTORE_ENTRY; /* loaded; no name before ABI 6 */
    CHECK(e[0] == 1 && !e[1] && !e[2] && !e[3] && be32(e + 4) == 0x303u && be32(e + 8) == 48 && !e[16]);
    CHECK(modwerk_modset_restore_list(page, 2, MODSET_RESTORE_PAGE) == 8 + MODSET_RESTORE_ENTRY && page[3] == 1 && page[5] == 3 &&
          be32(page + 12) == 0x303u); /* paged */
    CHECK(modwerk_modset_restore_list(page, 3, MODSET_RESTORE_PAGE) == 8 && !page[3] && page[5] == 3);
    /* A sync afterwards: the entries still say what this start loaded, the header what the card holds now. */
    accept(3, 48); modwerk_modset_service();
    CHECK(modwerk_modset_result == SAVED && modwerk_modset_restore_list(page, 0, MODSET_RESTORE_PAGE) == 8 + 3 * MODSET_RESTORE_ENTRY && page[6] == SAVED);
    /* PROJ held: nothing restored, nothing listed. */
    HOLD(PROJ); boot(); modwerk_modset_service(); LET_GO();
    CHECK(modwerk_modset_result == SKIPPED && modwerk_modset_restore_list(page, 0, MODSET_RESTORE_PAGE) == 8 && !page[5] && page[6] == SKIPPED);

    /* ADOPT TEST (development bases): the card's set another base wrote restores, read-only: that start writes no set. */
    for (unsigned i = 0; i < 2; ++i) card[i][20] ^= 1;
    boot(); modwerk_modset_service(); CHECK(modwerk_modset_result == FOREIGN && !installed);
    modwerk_modset_adopt_test(1); modwerk_test_adopt[1] ^= 1; /* another base's request */
    boot(); modwerk_modset_service(); CHECK(modwerk_modset_result == FOREIGN && !installed);
    modwerk_modset_adopt_test(1); written = writes;
    boot(); modwerk_modset_service(); CHECK(adopted && modwerk_modset_result == RESTORED && installed == 1); /* the sync's set: 0x303 */
    accept(0, 48); modwerk_modset_service(); CHECK(modwerk_modset_result == SAVE_FAILED && pending && writes == written);
    modwerk_modset_adopt_test(0); boot(); modwerk_modset_service(); CHECK(!adopted && modwerk_modset_result == FOREIGN && !installed);
    if (failures) { fprintf(stderr, "%u module set checks failed\n", failures); return 1; }
    puts("Octatrack module set: saved in turn, removals dropped, the newest whole set restored, damaged and foreign sets and a held PROJ or FUNC refused, "
         "a Keep joined only as the trial's identity and reported unsaved until saved, a start that crashed or stopped while restoring guarded, "
         "modules switched off and on at once and kept off across power cycles, every package's restore outcome listed for a host, "
         "and another base's set restored read-only on a development request.");
    return 0;
}
