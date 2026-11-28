/* SPDX-License-Identifier: GPL-3.0-or-later
 * Host check of modset.c's sector store and load (MODWERK_HOST_CARD) on a pretend card that loses power and fails reads.
 * The power is cut before every stock file call a save makes (each sector of the set and of the shelf, the close, the
 * read back and its close), with a file's length landing sector by sector or only at its close. After every cut the next
 * start runs the previous whole set or the new one, never a mix, and the next save wins at the start after it.
 * A slot that is missing or empty is absent. One that cannot be opened, or any of whose reads fails, is unreadable:
 * nothing restores from it, the start reports DAMAGED rather than "nothing saved", and the next save overwrites it
 * before it counts as saved, so what it held can never come back over a newer Keep. SYNTHETIC: no card, file system or
 * loader code is established here. */
#include "sha256.c"
#include "modset.c"
#include <setjmp.h>
#include <stdio.h>
#include <string.h>

static unsigned failures;
#define CHECK(x) do { if (!(x)) { ++failures; fprintf(stderr, "%s:%d: %s\n", __FILE__, __LINE__, #x); } } while (0)
const uint8_t modwerk_base_digest[32] = {7, 8, 9};
uint8_t modwerk_test_card_io[512];
void modwerk_diag_set(void) {}
void modwerk_diag_refused(uint32_t module, uint32_t refusal, uint32_t used, uint32_t largest, uint32_t check) { (void)module; (void)refusal; (void)used; (void)largest; (void)check; }
uint32_t modwerk_runtime_free(uint32_t *largest) { if (largest) *largest = RUNTIME_POOL_BYTES; return RUNTIME_POOL_BYTES; }
enum runtime_check modwerk_runtime_refused_check(void) { return RUNTIME_CHECK_NONE; }
enum runtime_refusal modwerk_runtime_refusal(void) { return RUNTIME_BUSY; }
void modwerk_runtime_refused(enum runtime_refusal why) { (void)why; }

/* The card: two files written in place. A read open of a missing file gives -12 and of an empty one -10, as the base's
 * logger reads stock's open (stock_140c.c); any other failure is an I/O error. */
#define CARD_BYTES (SET_BYTES + 512u)
static uint8_t card[2][CARD_BYTES];
static uint32_t card_length[2];
static int card_exists[2], open_error[2]; /* open_error: what a read open of the file gives instead, 0 none */
static unsigned bad_sector[2];            /* 1 + the sector whose read fails, 0 none */
static unsigned read_opens[2], fail_after[2]; /* read opens of each file; past fail_after of them (0: never) they fail */
static int length_at_close;               /* a file's length lands only at its close, not with each sector */
static unsigned steps, cut_at, writes_to[2]; /* stock calls so far; the one the power cut stops (0: none) */
static jmp_buf power;
static void step(void) { if (++steps == cut_at) longjmp(power, 1); }
int olog_stock_open(struct file_object *f, const char *path, const char *mode, void *io, unsigned n)
{
    unsigned which = path[8] == '1';
    CHECK(io == modwerk_test_card_io && n == 512u && (path[8] == '0' || path[8] == '1') && (mode[0] == 'r' || mode[0] == 'w'));
    step();
    f->word[0] = which, f->word[1] = 0, f->word[2] = mode[0] == 'w', f->word[4] = 0;
    if (f->word[2]) { card_exists[which] = 1; return 0; }
    if (fail_after[which] && ++read_opens[which] > fail_after[which]) return -5;
    return !card_exists[which] ? -12 : open_error[which] ? open_error[which] : !card_length[which] ? -10 : 0;
}
int modwerk_test_card_size(struct file_object *f) { return (int)card_length[f->word[0]]; }
int olog_stock_read(struct file_object *f, void *out, unsigned n)
{
    step();
    unsigned which = f->word[0];
    if (bad_sector[which] == f->word[1] / 512u + 1u) return -1;
    if (f->word[1] + n > card_length[which]) return 0;
    memcpy(out, card[which] + f->word[1], n), f->word[1] += n;
    return 1;
}
int olog_stock_write(struct file_object *f, const void *data, unsigned n)
{
    step();
    unsigned which = f->word[0];
    if (f->word[1] + n > CARD_BYTES) return 0;
    memcpy(card[which] + f->word[1], data, n), f->word[1] += n, ++writes_to[which];
    if (f->word[1] > f->word[4]) f->word[4] = f->word[1];
    if (!length_at_close && f->word[1] > card_length[which]) card_length[which] = f->word[1];
    return 1;
}
/* As stock's: the length from word 4. A shorter one would leave the file's chain ending in freed clusters (#1830). */
int olog_stock_close(struct file_object *f)
{
    step();
    if (f->word[2]) { CHECK(f->word[4] >= card_length[f->word[0]]); card_length[f->word[0]] = f->word[4]; }
    return 0;
}

/* The loader: which modules run. */
static uint32_t running[8], offered;
static unsigned running_count;
static int offered_removal;
static int enter(void *u) { (void)u; return 1; }
static int prepare(void *u, const uint8_t *d, uint32_t n) { (void)u; offered = be32(d + 28), offered_removal = removes(d, n); return 1; }
static int discard(void *u) { (void)u; return 1; }
static enum mu_publication publish(void *u) { (void)u; return MU_APPLIED; }
static int retire(void *u)
{
    (void)u;
    unsigned k = 0;
    for (unsigned i = 0; i < running_count; ++i) if (running[i] != offered) running[k++] = running[i];
    if (!offered_removal) running[k++] = offered;
    running_count = k;
    return 1;
}
const struct mu_backend modwerk_runtime_backend = {0, enter, enter, enter, prepare, discard, publish, enter, retire};

/* Six modules, two of them over a sector, and the package that removes each. */
#define MODULES 6u
static uint8_t packages[MODULES][1400], removal[MODULES][32];
static const uint32_t sizes[MODULES] = {72, 1400, 468, 600, 96, 1100};
static uint32_t id_of(unsigned k) { return 0x401u + k; }
static void make_packages(void)
{
    for (unsigned k = 0; k < MODULES; ++k) {
        memset(packages[k], (int)(0x40u + k), sizes[k]), memset(packages[k], 0, 80);
        memcpy(packages[k], "MWRM", 4), packages[k][5] = 6, put32(packages[k] + 8, 4), put32(packages[k] + 28, id_of(k));
        memset(removal[k], 0, 32), memcpy(removal[k], "MWRM", 4), removal[k][5] = 4, put32(removal[k] + 28, id_of(k));
    }
}
static void power_on(void) /* RAM gone, the card kept */
{
    memset(set, 0, sizeof set), memset(&modwerk_test_guard, 0, sizeof modwerk_test_guard);
    off_bytes = 0, restored = pending = slot = 0, restore_tries = 0, candidate = 0, switch_asked = 0, running_count = 0;
    modwerk_modset_result = 0, modwerk_test_ticks = 200, cut_at = 0;
    modwerk_modset_service();
}
static void fresh_card(void)
{
    memset(card, 0, sizeof card), memset(card_length, 0, sizeof card_length), memset(card_exists, 0, sizeof card_exists);
    memset(open_error, 0, sizeof open_error), memset(bad_sector, 0, sizeof bad_sector);
    power_on();
}
/* Saves until the card has the set (a save may write both files), at most four tries. */
static void save(void) { for (unsigned i = 0; i < 4u && pending; ++i) modwerk_test_ticks += 600u, modwerk_modset_service(); }
/* A host installs module k, or removes it. */
static void install(unsigned k)
{
    modwerk_modset_candidate(packages[k], sizes[k]), (void)prepare(0, packages[k], sizes[k]), (void)retire(0), modwerk_modset_accepted();
}
static void remove_module(unsigned k)
{
    modwerk_modset_candidate(removal[k], 32), (void)prepare(0, removal[k], 32), (void)retire(0), modwerk_modset_accepted();
}
static int runs(uint32_t id) { for (unsigned i = 0; i < running_count; ++i) if (running[i] == id) return 1; return 0; }
/* What runs and what is on the shelf, as bits (module k: bit k running, bit 8 + k off); -1 unless each module is in at
 * most one place, the set names exactly what runs with each package's own bytes, and the shelf is whole. */
static int state(void)
{
    int bits = 0;
    for (unsigned k = 0; k < MODULES; ++k) {
        const uint8_t *r = off_find(id_of(k)), *on = 0;
        for (uint32_t at = HEADER; at < used(); at += 8u + ((be32(set + at + 4) + 3u) & ~3u)) if (be32(set + at) == id_of(k)) on = set + at;
        if ((r && on) || !!on != runs(id_of(k))) return -1;
        if (on && (be32(on + 4) != sizes[k] || memcmp(on + 8, packages[k], sizes[k]))) return -1;
        if (r && (be32(r + 4) != sizes[k] || memcmp(r + OFF_RECORD, packages[k], sizes[k]))) return -1;
        bits |= on ? 1 << k : r ? 1 << (8 + k) : 0;
    }
    return off_bytes && !off_whole(OFF, off_bytes) ? -1 : bits;
}

/* The changes the power cuts are made in, from a fresh card: install, remove, switch off and on, each saved. Between
 * them the shelf appears, grows, shrinks and empties, and the set grows past a file's length and shrinks below it. */
enum { INSTALL, REMOVE, OFF_SWITCH, ON_SWITCH };
static const uint8_t script[][2] = {
    {INSTALL, 0}, {INSTALL, 1}, {INSTALL, 2}, {OFF_SWITCH, 1}, {INSTALL, 3}, {OFF_SWITCH, 0}, {REMOVE, 2}, {ON_SWITCH, 1},
    {INSTALL, 5}, {ON_SWITCH, 0}, {REMOVE, 3},
};
#define SCRIPT_STEPS (sizeof script / sizeof script[0])
static void change(unsigned n)
{
    unsigned k = script[n][1];
    if (script[n][0] == INSTALL) install(k);
    else if (script[n][0] == REMOVE) remove_module(k);
    else { CHECK(modwerk_modset_switch(id_of(k), script[n][0] == ON_SWITCH)); modwerk_modset_service(); CHECK(modwerk_modset_switch_result == MODSET_SWITCHED); }
    save();
}
static void replay(unsigned n) { fresh_card(); for (unsigned i = 0; i < n; ++i) { change(i); CHECK(!pending); } }

static unsigned power_cuts(void)
{
    unsigned cuts = 0;
    for (unsigned n = 0; n < SCRIPT_STEPS; ++n) {
        replay(n);
        int before = state();
        unsigned from = steps;
        change(n);
        int after = state();
        unsigned calls = steps - from;
        CHECK(before >= 0 && after >= 0 && after != before && !pending && modwerk_modset_result == SAVED && calls);
        power_on(); CHECK(state() == after && modwerk_modset_result == RESTORED); /* and it is what the card holds */
        for (unsigned k = 1; k <= calls; ++k, ++cuts) {
            replay(n);
            cut_at = steps + k;
            if (!setjmp(power)) { change(n); CHECK(0); }
            power_on();
            int now = state();
            /* The previous whole set, or the new one once every sector of it has landed; on a fresh card a first save
             * cut short leaves nothing whole, so nothing restores. */
            CHECK(now == before || now == after);
            CHECK(n ? modwerk_modset_result == RESTORED : modwerk_modset_result == RESTORED || modwerk_modset_result == NONE_SAVED || modwerk_modset_result == DAMAGED);
            if (now != before && now != after) fprintf(stderr, "change %u, cut at call %u of %u (length %s): state %d, before %d, after %d\n",
                                                        n, k, calls, length_at_close ? "at close" : "per sector", now, before, after);
            /* The next save wins at the next start, whatever the cut left in the file it was writing (module 4 is not
             * in the script). */
            install(4), save();
            int saved = state();
            CHECK(!pending && modwerk_modset_result == SAVED && saved >= 0 && (saved & 1 << 4));
            power_on(); CHECK(state() == saved && modwerk_modset_result == RESTORED);
        }
    }
    return cuts;
}

/* The card after `n` steps of the script, saved twice more so both files hold a whole set: the newer in `newer`. */
static void two_sets(unsigned n, unsigned *newer)
{
    replay(n);
    install(4), save(); remove_module(4), save();
    power_on();
    *newer = slot;
    CHECK(modwerk_modset_result == RESTORED && card_length[0] && card_length[1] && be32(card[slot] + 8) == be32(card[slot ^ 1u] + 8) + 1u);
}
/* The read failures of this start pass (the card reads again), a Keep of module 5 on whatever this start runs is
 * saved, and the unit starts again. */
static int keep_then_restart(int *kept)
{
    memset(open_error, 0, sizeof open_error), memset(bad_sector, 0, sizeof bad_sector);
    install(5); save();
    *kept = state();
    int ok = !pending && modwerk_modset_result == SAVED && *kept >= 0 && (*kept & 1 << 5);
    power_on();
    return ok;
}

static void read_errors(void)
{
    unsigned newer, w0, w1;
    int kept, old;
    /* Missing and empty files are absent: nothing saved, not damaged. */
    fresh_card(); CHECK(modwerk_modset_result == NONE_SAVED && !running_count);
    card_exists[0] = card_exists[1] = 1; power_on(); CHECK(modwerk_modset_result == NONE_SAVED && !running_count);

    /* Both files unreadable at a start (an I/O error opening each): nothing restores and the start says DAMAGED, not
     * "nothing saved". A Keep then overwrites both before it counts as saved; with the card reading again, it wins. */
    two_sets(3, &newer); old = state();
    open_error[0] = open_error[1] = -5; power_on();
    CHECK(modwerk_modset_result == DAMAGED && !running_count && used() == HEADER);
    w0 = writes_to[0], w1 = writes_to[1];
    CHECK(keep_then_restart(&kept) && writes_to[0] > w0 && writes_to[1] > w1);
    CHECK(modwerk_modset_result == RESTORED && state() == kept && state() != old);
    /* The same with the first sector of each unreadable. */
    two_sets(3, &newer);
    bad_sector[0] = bad_sector[1] = 1; power_on();
    CHECK(modwerk_modset_result == DAMAGED && !running_count);
    CHECK(keep_then_restart(&kept) && modwerk_modset_result == RESTORED && state() == kept);
    /* Still unreadable when the Keep is written: its read back fails, so it is not saved, and says so. */
    two_sets(3, &newer);
    open_error[0] = open_error[1] = -5; power_on(); install(5), save();
    CHECK(pending && modwerk_modset_result == SAVE_FAILED);

    /* The newer file unreadable, the older whole: the older restores, the Keep goes into the unreadable file, and with
     * the card reading again the Keep wins over what that file held. */
    two_sets(4, &newer); old = state();
    open_error[newer] = -5; power_on();
    CHECK(modwerk_modset_result == RESTORED && slot == (newer ^ 1u) && state() != old);
    w0 = writes_to[newer], w1 = writes_to[newer ^ 1u];
    CHECK(keep_then_restart(&kept) && writes_to[newer] > w0 && writes_to[newer ^ 1u] == w1);
    CHECK(modwerk_modset_result == RESTORED && state() == kept);

    /* One file unreadable, the other missing: the save goes into the unreadable one, once. */
    two_sets(2, &newer);
    card_exists[newer ^ 1u] = 0, card_length[newer ^ 1u] = 0, open_error[newer] = -5; power_on();
    CHECK(modwerk_modset_result == DAMAGED && !running_count);
    w0 = writes_to[newer], w1 = writes_to[newer ^ 1u];
    CHECK(keep_then_restart(&kept) && writes_to[newer] > w0 && writes_to[newer ^ 1u] == w1);
    CHECK(modwerk_modset_result == RESTORED && state() == kept);

    /* One file unreadable, the other another base's set: that one restores, the Keep goes into the unreadable one and wins. */
    two_sets(2, &newer);
    card[newer ^ 1u][20] ^= 1, open_error[newer] = -5; power_on();
    CHECK(modwerk_modset_result == RESTORED && running_count);
    w1 = writes_to[newer ^ 1u];
    CHECK(keep_then_restart(&kept) && writes_to[newer ^ 1u] == w1 && modwerk_modset_result == RESTORED && state() == kept);

    /* The newer file's header reads, a later sector does not, and the older file is missing: DAMAGED, and the Keep goes
     * into the file that failed, so with the card reading again the Keep wins. */
    two_sets(3, &newer);
    card_exists[newer ^ 1u] = 0, card_length[newer ^ 1u] = 0, bad_sector[newer] = 2; power_on();
    CHECK(modwerk_modset_result == DAMAGED && !running_count);
    CHECK(keep_then_restart(&kept) && modwerk_modset_result == RESTORED && state() == kept);

    /* PROJ held at a start that read neither file: nothing installs, and a Keep after it still wins. */
    two_sets(3, &newer);
    open_error[0] = open_error[1] = -5; modwerk_test_keys[0x1c >> 3] |= 1u << (0x1c & 7); power_on(); memset(modwerk_test_keys, 0, sizeof modwerk_test_keys);
    CHECK(modwerk_modset_result == SKIPPED && !running_count);
    CHECK(keep_then_restart(&kept) && modwerk_modset_result == RESTORED && state() == kept);

    /* The newer file reads whole, then fails when it is read again to restore: DAMAGED, nothing runs, and a Keep wins. */
    two_sets(3, &newer);
    if (newer) install(4), save(), power_on(), newer = slot;
    CHECK(!newer && modwerk_modset_result == RESTORED);
    read_opens[0] = 0, fail_after[0] = 1; power_on(); fail_after[0] = 0;
    CHECK(modwerk_modset_result == DAMAGED && !running_count && used() == HEADER);
    CHECK(keep_then_restart(&kept) && modwerk_modset_result == RESTORED && state() == kept);
}

int main(void)
{
    make_packages();
    unsigned cuts = 0;
    for (length_at_close = 0; length_at_close < 2; ++length_at_close) cuts += power_cuts();
    length_at_close = 0;
    read_errors();
    if (failures) { fprintf(stderr, "%u saved-set card checks failed\n", failures); return 1; }
    printf("Saved set on a card: %u power cuts, each start ran the previous whole set or the new one and the next save won; "
           "unreadable files reported damaged and overwritten by the next save before it counted as saved.\n", cuts);
    return 0;
}
