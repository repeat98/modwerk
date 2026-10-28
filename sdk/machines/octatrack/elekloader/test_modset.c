/* SPDX-License-Identifier: GPL-3.0-or-later
 * Host check of modset.c with a pretend card: accepted packages are saved to the two files in turn, a
 * removal drops its module, the newest whole set is installed after a boot, a damaged newer file leaves the
 * older one, and another base's set or a held FUNC installs nothing. A Keep joins the set only as exactly the
 * trial's whole-set identity, and its save reports unsaved and failed until the card has it. */
#define MODWERK_RUNTIME_VOLATILE_JOURNAL
#include "sha256.c"
#include "modset.c"
static unsigned set_records;
void modwerk_diag_set(void) { ++set_records; } /* diag.c: counted here */
static uint32_t refused_m, refused_c, refuse_id;
static unsigned busy_left; /* refuse_id's next refusals; then it installs (0: refused every time) */
static enum runtime_refusal refusal_now = RUNTIME_BUSY;
void modwerk_diag_refused(uint32_t module, uint32_t refusal) { refused_m = module, refused_c = refusal; }
enum runtime_refusal modwerk_runtime_refusal(void) { return refusal_now; }
static enum runtime_refusal noted = RUNTIME_MALFORMED; /* what modset.c told the loader a refusal was */
void modwerk_runtime_refused(enum runtime_refusal why) { noted = why; }
#include <stdio.h>
#include <string.h>

static unsigned failures;
#define CHECK(x) do { if (!(x)) { failures++; fprintf(stderr, "%s:%d: %s\n", __FILE__, __LINE__, #x); } } while (0)
const uint8_t modwerk_base_digest[32] = {1, 2, 3};
static uint8_t card[2][SET_BYTES];
static int card_bytes[2];
static int volatile_busy;
static unsigned writes, write_fail;
int modwerk_runtime_volatile_busy(void) { return volatile_busy; }
int modwerk_test_file(int op, const char *path, uint8_t *data, unsigned n)
{
    int which = path[8] == '1';
    if (op == 1 && write_fail) { ++writes; memcpy(card[which], data, n / 2); card_bytes[which] = (int)n; return 0; } /* torn */
    if (op == 1) { ++writes;memcpy(card[which], data, n); card_bytes[which] = (int)n; return 1; }
    if (!card_bytes[which]) return 0;
    memcpy(data, card[which], (size_t)card_bytes[which]);
    return card_bytes[which];
}
static unsigned prepared, installed, entered;
static uint32_t ids[8];
static int enter(void *u) { (void)u; ++entered; return 1; }
static int safe(void *u) { (void)u; return 1; }
static int leave(void *u) { (void)u; return 1; }
static int prepare(void *u, const uint8_t *d, uint32_t n)
{
    (void)u; ids[prepared++ % 8] = be32(d + 28);
    int ok = n > 32u && be32(d + 28) != refuse_id;
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
static void boot(void) /* RAM gone, the card kept */
{
    memset(set, 0, sizeof set); restored = 0; pending = 0; slot = 0; keep_bytes = 0; prepared = installed = entered = 0;
    modwerk_modset_result = 0; modwerk_test_ticks = 200;
}

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
    refuse_id = 0x3cbedc9cu; written = writes; boot(); modwerk_modset_service();
    CHECK(!restored && prepared == 1 && !modwerk_modset_result);
    modwerk_test_ticks += RESTORE_RETRY - 1; modwerk_modset_service(); CHECK(prepared == 1); /* not before its time */
    for (unsigned t = 0; t < 40u && !restored; ++t) modwerk_test_ticks += RESTORE_RETRY, modwerk_modset_service();
    CHECK(restored && prepared == RESTORE_TRIES);
    CHECK(modwerk_modset_result == REFUSED && !installed && refused_m == 0x3cbedc9cu && refused_c == RUNTIME_BUSY);
    CHECK(used() == HEADER && !pending && writes == written); /* set[] names what runs; the card keeps it */
    refuse_id = 0, refused_m = refused_c = 0;
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
    /* Nothing installed: FUNC held, or a set another base wrote. */
    card[0][HEADER + 9] ^= 1; modwerk_test_held = 1; boot(); modwerk_modset_service();
    CHECK(modwerk_modset_result == SKIPPED && !installed);
    modwerk_test_held = 0; card[0][20] ^= 1; card[1][20] ^= 1; boot(); modwerk_modset_service();
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
    /* A FUNC boot installs nothing yet keeps the card's newest generation: what is saved after it wins at the next
     * boot (it used to save generation 1 and lose to the older set), and with nothing saved the old set returns. */
    unsigned newest = modwerk_modset_generation;
    modwerk_test_held = 1; boot(); modwerk_modset_service(); modwerk_test_held = 0;
    CHECK(modwerk_modset_result == SKIPPED && !installed && used() == HEADER && be32(set + 8) == newest);
    boot(); modwerk_modset_service(); CHECK(modwerk_modset_result == RESTORED && installed == 4);
    modwerk_test_held = 1; boot(); modwerk_modset_service(); modwerk_test_held = 0;
    CHECK(identity(kept, kept_bytes, 2, want) && modwerk_modset_keep(kept, kept_bytes, 2, want)); /* nothing live: only the kept */
    modwerk_modset_kept(); modwerk_modset_service();
    CHECK(modwerk_modset_result == SAVED && modwerk_modset_generation == newest + 1);
    boot(); modwerk_modset_service(); CHECK(modwerk_modset_result == RESTORED && installed == 2);
    modwerk_test_held = 1; boot(); modwerk_modset_service(); modwerk_test_held = 0;
    accept(0, 48); modwerk_modset_service(); CHECK(modwerk_modset_result == SAVED && modwerk_modset_generation == newest + 2);
    boot(); modwerk_modset_service(); CHECK(modwerk_modset_result == RESTORED && installed == 1);
    if (failures) { fprintf(stderr, "%u module set checks failed\n", failures); return 1; }
    puts("Octatrack module set: saved in turn, removals dropped, the newest whole set restored, damaged and foreign sets and a held FUNC refused, "
         "a Keep joined only as the trial's identity and reported unsaved until saved.");
    return 0;
}
