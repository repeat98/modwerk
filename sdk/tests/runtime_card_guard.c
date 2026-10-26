/* SPDX-License-Identifier: GPL-3.0-or-later
 * Actual runtime loader and saved-set service, with bounded fake RAM/card.
 * No module instructions run. Optional private inputs are never printed.
 */
#include "../../sdk/runtime/loader/loader.c"
#include "../../sdk/runtime/upload/sha256.c"
/* Both production translation units deliberately keep these names private. */
#define candidate card_candidate
#define candidate_bytes card_candidate_bytes
#define slot card_slot
#define restore card_restore
#define be32 card_be32
#define put32 card_put32
#include "../../sdk/machines/octatrack/elekloader/modset.c"
void modwerk_diag_set(void) {} /* diag.c's log record of the set: not under test here */
void modwerk_diag_refused(uint32_t module, uint32_t refusal) { (void)module; (void)refusal; }
#undef candidate
#undef candidate_bytes
#undef slot
#undef restore
#undef be32
#undef put32
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static unsigned failures, reads, writes;
#define CHECK(x) do { if (!(x)) { ++failures; fprintf(stderr, "guard check failed at line %d\n", __LINE__); } } while (0)
const uint8_t modwerk_base_digest[32] = {1, 2, 3};
static uint8_t *main_image;
static uint32_t main_bytes;
static uint8_t card[2][SET_BYTES];
static int card_bytes[2];
int modwerk_test_file(int op, const char *path, uint8_t *data, unsigned n)
{
    unsigned which = !strcmp(path, "/MODWERK1.SET");
    if (strcmp(path, "/MODWERK0.SET") && !which) return 0;
    if (op) { ++writes; return 0; } /* proof must never save */
    ++reads;
    if ((unsigned)card_bytes[which] > n) return 0;
    memcpy(data, card[which], (size_t)card_bytes[which]);
    return card_bytes[which];
}
int modwerk_machine_stopped(void) { return 1; }
void *modwerk_machine_uncached(void *p) { return p; }
void modwerk_machine_invalidate_code(void) {}
int modwerk_machine_patchable(uint32_t a, uint32_t n)
{
    return a >= 0x40000400u && a - 0x40000400u <= main_bytes && n <= main_bytes - (a - 0x40000400u);
}
uint8_t *modwerk_machine_code(uint32_t a)
{
    /* Model the real glue's cached/uncached views of the same MAIN bytes. */
    if (a >= 0x48000400u && a < 0x50000000u) a -= 0x08000000u;
    return modwerk_machine_patchable(a, 1) ? main_image + a - 0x40000400u : 0;
}
void modwerk_machine_flush_data(uint32_t a, uint32_t n) { (void)a; (void)n; }
uint32_t modwerk_machine_mask(void) { return 7; }
void modwerk_machine_unmask(uint32_t sr) { (void)sr; }
uint32_t modwerk_machine_lock(void) { return 4; }
void modwerk_machine_unlock(uint32_t sr) { (void)sr; }
unsigned modwerk_machine_paused(struct runtime_span *s, unsigned n, const struct runtime_context *context) { (void)s; (void)n; (void)context; return 0; }
int modwerk_machine_dsp_admit(const struct runtime_dsp *from, struct runtime_dsp *to) { (void)from; (void)to; return RUNTIME_OK; }
void modwerk_machine_dsp_switch(const struct runtime_dsp *from, const struct runtime_dsp *to) { (void)from; (void)to; }

static void reset(void)
{
    memset(pool, 0, sizeof pool); memset(owned, 0, sizeof owned);
    for (unsigned i = 0; i < RUNTIME_MODULES; ++i) live[i] = 0;
    owners = slot = 0; prepared = held = 0; candidate = previous = 0; refusal = RUNTIME_OK;
    memset(set, 0, sizeof set); restored = pending = card_slot = 0; card_candidate = 0;
    modwerk_modset_result = 0; modwerk_modset_count = 0; modwerk_test_ticks = 200;
    modwerk_test_held = 0; modwerk_test_gate = 1; reads = writes = 0;
}
static void make_card(const uint8_t *package, uint32_t n)
{
    uint32_t bytes = HEADER + 8u + ((n + 3u) & ~3u);
    CHECK(bytes <= SET_BYTES);
    memset(card, 0, sizeof card); card_bytes[0] = (int)bytes; card_bytes[1] = 0;
    memcpy(card[0], "MWST", 4); put32(card[0] + 4, 1); put32(card[0] + 8, 7);
    put32(card[0] + 12, 1); put32(card[0] + 16, bytes);
    memcpy(card[0] + 20, modwerk_base_digest, 32);
    put32(card[0] + HEADER, be32(package + 28)); put32(card[0] + HEADER + 4, n);
    memcpy(card[0] + HEADER + 8, package, n);
    mu_sha256(card[0] + HEADER, bytes - HEADER, card[0] + 52);
}
static void proof(uint8_t *package, uint32_t n, uint8_t *expected, uint32_t expected_n)
{
    uint8_t *original = malloc(main_bytes), digest_before[32], digest_after[32];
    CHECK(original != 0); if (!original) return;
    memcpy(original, main_image, main_bytes);
    CHECK(modwerk_machine_code(0x4000045eu) == modwerk_machine_code(0x4800045eu));
    reset(); CHECK(modwerk_runtime_backend.prepare(0, package, n)); CHECK(candidate && candidate->dsp.image_bytes == expected_n);
    if (candidate && candidate->dsp.image_bytes == expected_n) {
        uint8_t *relocated = malloc(expected_n); CHECK(relocated != 0);
        if (relocated) {
            memcpy(relocated, expected, expected_n);
            for (uint32_t i = 0; i < be32(package + 16); ++i) {
                uint32_t at = be32(package + 76u + expected_n + 4u * i);
                CHECK(at <= expected_n - 4u);
                if (at <= expected_n - 4u) put32(relocated + at, be32(relocated + at) + (uint32_t)(uintptr_t)candidate->dsp.image);
            }
            CHECK(!memcmp(relocated, candidate->dsp.image, expected_n)); free(relocated);
        }
    }
    CHECK(discard(0)); CHECK(!memcmp(original, main_image, main_bytes));

    /* A baseline survives rejected direct admission, with no patched sites. */
    uint8_t baseline[80] = {0}; memcpy(baseline, "MWRM", 4); baseline[5] = 8;
    put32(baseline + 8, 4); put32(baseline + 28, 0x01020304u);
    CHECK(enter(0) && modwerk_runtime_backend.prepare(0, baseline, sizeof baseline) && modwerk_runtime_backend.publish(0) == MU_APPLIED && modwerk_runtime_backend.retire(0));
    CHECK(modwerk_runtime_active() == 1);
    main_image[0x4000045eu - 0x40000400u + 3u] ^= 4u;
    mu_sha256(main_image, main_bytes, digest_before);
    CHECK(!modwerk_runtime_backend.prepare(0, package, n) && refusal == RUNTIME_STOCK);
    CHECK(modwerk_runtime_active() == 1 && modwerk_runtime_module(0)->id == 0x01020304u);
    CHECK(discard(0)); mu_sha256(main_image, main_bytes, digest_after);
    CHECK(!memcmp(digest_before, digest_after, sizeof digest_before)); CHECK(leave(0));

    /* A matching full SET identity cannot override its package's arena guard. */
    make_card(package, n); reset(); modwerk_modset_service();
    CHECK(modwerk_modset_result == REFUSED && !modwerk_runtime_active());
    CHECK(reads == 3 && !writes); CHECK(refusal == RUNTIME_STOCK);
    mu_sha256(main_image, main_bytes, digest_after); CHECK(!memcmp(digest_before, digest_after, sizeof digest_before));

    /* The existing full identity check rejects before package admission. */
    memcpy(main_image, original, main_bytes); reset(); card[0][20] ^= 1u; modwerk_modset_service();
    CHECK(modwerk_modset_result == FOREIGN && !modwerk_runtime_active() && !writes && !owners);
    CHECK(!memcmp(original, main_image, main_bytes)); card[0][20] ^= 1u;

    /* Exact native restoration works; removing it restores every original site. */
    reset(); modwerk_modset_service();
    CHECK(modwerk_modset_result == RESTORED && modwerk_runtime_active() == 1 && modwerk_runtime_intact() == 1 && !writes);
    uint8_t removal[76] = {0}; memcpy(removal, "MWRM", 4); removal[5] = 8; put32(removal + 28, be32(package + 28));
    CHECK(enter(0) && modwerk_runtime_backend.prepare(0, removal, sizeof removal) && modwerk_runtime_backend.publish(0) == MU_APPLIED && modwerk_runtime_backend.retire(0) && leave(0));
    CHECK(!modwerk_runtime_active() && !memcmp(original, main_image, main_bytes));
    free(original);
}
static uint8_t *read_file(const char *path, uint32_t *n)
{
    FILE *f = fopen(path, "rb"); if (!f) exit(2);
    if (fseek(f, 0, SEEK_END)) exit(2);
    long size = ftell(f); rewind(f);
    if (size < 0 || size > 2 * 1024 * 1024) exit(2);
    uint8_t *data = malloc((size_t)size); if (!data || fread(data, 1, (size_t)size, f) != (size_t)size) exit(2);
    fclose(f); *n = (uint32_t)size; return data;
}
int main(int argc, char **argv)
{
    if (argc == 4) {
        uint32_t n, expected_n; main_image = read_file(argv[1], &main_bytes);
        uint8_t *package = read_file(argv[2], &n), *expected = read_file(argv[3], &expected_n);
        proof(package, n, expected, expected_n); free(package); free(expected); free(main_image);
    } else if (argc == 1) {
        uint8_t memory[1024] = {0}, package[124] = {0}, expected[4]; main_image = memory; main_bytes = sizeof memory;
        put32(memory + 0x5e, 0x40d00000u); memcpy(expected, memory + 0x5e, 4);
        memcpy(package, "MWRM", 4); package[5] = 8; put32(package + 8, 4); put32(package + 28, 0x05060708u); put32(package + 68, 1);
        put32(package + 84, 0x4000045eu); package[89] = 4; mu_sha256(expected, 4, package + 92);
        proof(package, sizeof package, expected, sizeof expected);
    } else return 2;
    if (failures) return 1;
    puts("Actual loader/card guard: native reconstruction, wrong-arena admission, matching-base card rejection, foreign-base rejection and exact removal passed; no card writes or module execution.");
    return 0;
}
