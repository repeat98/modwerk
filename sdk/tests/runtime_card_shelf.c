/* SPDX-License-Identifier: GPL-3.0-or-later
 * The saved set's sector store and load (modset.c, MODWERK_HOST_CARD) with modules switched off on the unit: a
 * pretend card that overwrites its files in place and loses power before any one sector write lands. After every
 * such cut the next start finds each module exactly once, running or on the shelf, as before the switch or as after
 * it. SYNTHETIC: no card, file system, loader or module code is established here. */
#include "sha256.c"
#include "modset.c"
uint32_t modwerk_runtime_free(uint32_t *largest) { if (largest) *largest = RUNTIME_POOL_BYTES; return RUNTIME_POOL_BYTES; }
enum runtime_check modwerk_runtime_refused_check(void) { return RUNTIME_CHECK_NONE; }
#include <setjmp.h>
#include <stdio.h>
#include <string.h>

static unsigned failures;
#define CHECK(x) do { if (!(x)) { ++failures; fprintf(stderr, "%s:%d: %s\n", __FILE__, __LINE__, #x); } } while (0)
const uint8_t modwerk_base_digest[32] = {4, 5, 6};
uint8_t modwerk_test_card_io[512];
void modwerk_diag_set(void) {}
void modwerk_diag_refused(uint32_t module, uint32_t refusal, uint32_t used, uint32_t largest, uint32_t check) { (void)module; (void)refusal; (void)used; (void)largest; (void)check; }
enum runtime_refusal modwerk_runtime_refusal(void) { return RUNTIME_BUSY; }
void modwerk_runtime_refused(enum runtime_refusal why) { (void)why; }

static uint8_t card[2][SET_BYTES + 512u];
static uint32_t card_length[2];
static unsigned card_writes, cut_at; /* the write that never lands (0: none) */
static jmp_buf power;
int olog_stock_open(struct file_object *f, const char *path, const char *mode, void *io, unsigned n)
{
    (void)io, (void)n;
    f->word[0] = path[8] == '1', f->word[1] = 0, f->word[2] = mode[0] == 'w', f->word[4] = 0;
    return f->word[2] || card_length[f->word[0]] ? 0 : -1; /* a write keeps what the file held: in place */
}
int modwerk_test_card_size(struct file_object *f) { return (int)card_length[f->word[0]]; }
int olog_stock_read(struct file_object *f, void *out, unsigned n)
{
    if (f->word[1] + n > card_length[f->word[0]]) return 0;
    memcpy(out, card[f->word[0]] + f->word[1], n), f->word[1] += n;
    return 1;
}
int olog_stock_write(struct file_object *f, const void *data, unsigned n)
{
    if (++card_writes == cut_at) longjmp(power, 1);
    if (f->word[1] + n > sizeof card[0]) return 0;
    memcpy(card[f->word[0]] + f->word[1], data, n), f->word[1] += n;
    if (f->word[1] > card_length[f->word[0]]) card_length[f->word[0]] = f->word[1];
    if (f->word[1] > f->word[4]) f->word[4] = f->word[1];
    return 1;
}
/* As stock's: the length from word 4. A shorter one would leave the file's chain ending in freed clusters (#1830). */
int olog_stock_close(struct file_object *f)
{
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

static uint8_t packages[3][1400];
static const uint32_t ids[3] = {0x301u, 0x302u, 0x303u}, sizes[3] = {72, 1400, 468}; /* one spans sectors */
static void power_on(void) /* RAM gone, the card kept */
{
    memset(set, 0, sizeof set), memset(&modwerk_test_guard, 0, sizeof modwerk_test_guard);
    off_bytes = 0, restored = pending = slot = 0, restore_tries = 0, candidate = 0, switch_asked = 0, running_count = 0;
    modwerk_modset_result = 0, modwerk_test_ticks = 200, cut_at = 0;
    modwerk_modset_service();
}
static int runs(uint32_t id) { for (unsigned i = 0; i < running_count; ++i) if (running[i] == id) return 1; return 0; }
/* Which of the three are off now, as bits; -1 unless each is there exactly once with its own package. */
static int state(void)
{
    int bits = 0;
    for (unsigned i = 0; i < 3u; ++i) {
        const uint8_t *r = off_find(ids[i]), *on = 0;
        for (uint32_t at = HEADER; at < used(); at += 8u + ((be32(set + at + 4) + 3u) & ~3u)) if (be32(set + at) == ids[i]) on = set + at;
        if (!!r == !!on || !!on != runs(ids[i])) return -1;
        if (r ? be32(r + 4) != sizes[i] || memcmp(r + OFF_RECORD, packages[i], sizes[i]) : be32(on + 4) != sizes[i] || memcmp(on + 8, packages[i], sizes[i])) return -1;
        bits |= r ? 1 << i : 0;
    }
    return off_bytes && !off_whole(OFF, off_bytes) ? -1 : bits;
}
static void flip(unsigned module, int on)
{
    CHECK(modwerk_modset_switch(ids[module], on));
    modwerk_modset_service();
}
/* The switches of `steps` from a fresh card, three bits a step (module, then on), all landing. */
static void play(const uint8_t *steps, unsigned n)
{
    memset(card_length, 0, sizeof card_length), memset(card, 0, sizeof card), card_writes = 0;
    power_on();
    for (unsigned i = 0; i < 3u; ++i) {
        memset(packages[i], (int)(0x40u + i), sizes[i]), memset(packages[i], 0, 80);
        memcpy(packages[i], "MWRM", 4), packages[i][5] = 6, put32(packages[i] + 8, 4), put32(packages[i] + 28, ids[i]);
        modwerk_modset_candidate(packages[i], sizes[i]), (void)prepare(0, packages[i], sizes[i]), (void)retire(0), modwerk_modset_accepted();
    }
    modwerk_modset_service();
    for (unsigned i = 0; i < n; ++i) flip(steps[i] >> 1, steps[i] & 1);
}
int main(void)
{
    /* off, off, on, off, on, on: each with the shelf empty, growing, shrinking and moving a sector. */
    static const uint8_t steps[] = {1 << 1, 0 << 1, 1 << 1 | 1, 2 << 1, 0 << 1 | 1, 2 << 1 | 1};
    unsigned cuts = 0;
    for (unsigned n = 0; n < sizeof steps; ++n) {
        play(steps, n);
        int before = state();
        unsigned writes_before = card_writes;
        flip(steps[n] >> 1, steps[n] & 1);
        int after = state();
        unsigned sectors = card_writes - writes_before;
        CHECK(before >= 0 && after == (before ^ 1 << (steps[n] >> 1)) && modwerk_modset_switch_result == MODSET_SWITCHED && !pending && sectors);
        power_on(); CHECK(state() == after && modwerk_modset_result == RESTORED); /* and it is what the card holds */
        for (unsigned k = 1; k <= sectors; ++k, ++cuts) {
            play(steps, n);
            cut_at = card_writes + k;
            if (!setjmp(power)) { flip(steps[n] >> 1, steps[n] & 1); CHECK(0); }
            power_on();
            CHECK(state() == before); /* the save never finished: the older file, whole */
            if (state() != before) fprintf(stderr, "step %u, cut at sector %u of %u: state %d, before %d, after %d\n", n, k, sectors, state(), before, after);
        }
    }
    if (failures) return 1;
    printf("Saved set with a shelf: %u power cuts, each module found once at the next start.\n", cuts);
    return 0;
}
