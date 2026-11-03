/* SPDX-License-Identifier: MIT
 * Host check of the admission of independent machine packages (machine_contributors.c) over synthetic memory:
 * a package's ot_machines record found by its hook offset, a replacement of the same machine, a machine leaving
 * with no Part, with a Part holding its signature, with a base retirement (check at PREPARE, retire at SWITCH),
 * and a stock UI root naming its image. Synthetic bytes only. */
#define MODWERK_HOST
#define MW_NO_DEFAULTS
#include "machine_contributors.h"
#include "modwerk_events.h"
#include <stdio.h>
#include <string.h>
static unsigned failures;
#define CHECK(x) do { if (!(x)) { failures++; fprintf(stderr, "%s:%d: %s\n", __FILE__, __LINE__, #x); } } while (0)
#define BANK 0x40100000u
static uint8_t bank[0x9504au + 4u * 6322u], sram[2][4u * 6322u], cache[1696];
static uint32_t ui_root; /* a value planted in the key cache */
static int unreadable;
static int host_read(void *context, uint32_t at, void *out, uint32_t n)
{
    (void)context;
    if (unreadable) return 0;
    uint8_t *to = out;
    if (at >= BANK && at - BANK + n <= sizeof bank) { memcpy(to, bank + (at - BANK), n); return 1; }
    for (unsigned s = 0; s < 2; ++s) {
        uint32_t base = s ? 0x100ab196u : 0x100a4eceu;
        if (at >= base && at - base + n <= sizeof sram[s]) { memcpy(to, sram[s] + (at - base), n); return 1; }
    }
    if (at >= 0x46c7d8deu && at - 0x46c7d8deu + n <= sizeof cache) { memcpy(to, cache + (at - 0x46c7d8deu), n); return 1; }
    memset(to, 0, n); /* the layer root and anything else: empty */
    return 1;
}
static int checks, retires, verdict_check, verdict_retire;
int mw_ab_board_check(void) { ++checks; return verdict_check; }
int mw_ab_board_retire(void) { ++retires; return verdict_retire; }
static uint8_t image_a[256], image_b[256], image_v[256];
static uint32_t unit_address(const uint8_t *p)
{ return 0x40200000u + (p == image_a ? 0u : p == image_b ? 0x100u : 0x200u); }
#define MW_IMAGE_ADDRESS(p) unit_address(p)
#include "machine_contributors.c"

static struct runtime_dsp package(uint8_t *image, char s0, char s1, uint32_t module, int contributes)
{
    struct runtime_dsp d; memset(&d, 0, sizeof d);
    d.present = 1; d.image = image; d.image_bytes = 256; d.module = module;
    for (unsigned i = 0; i < RUNTIME_HOOKS; ++i) d.hook_offset[i] = RUNTIME_NONE;
    if (contributes) {
        d.hook_offset[MODWERK_OT_MACHINES] = 64; d.contributes = 1;
        image[64] = 0, image[67] = 1, image[68] = (uint8_t)s0, image[69] = (uint8_t)s1, image[70] = 1, image[71] = 1;
    }
    return d;
}
static void sign(uint8_t *part, unsigned track, char s0, char s1) { part[0x22 + track] = 1; part[60 + 30 * track] = (uint8_t)s0; part[61 + 30 * track] = (uint8_t)s1; part[62 + 30 * track] = 1; }
static void word(uint8_t *p, uint32_t v)
{ for (unsigned i = 0; i < 4; ++i) p[i] = (uint8_t)(v >> (24u - 8u * i)); }
static struct runtime_dsp start_package(unsigned operation)
{
    memset(image_v, 0, sizeof image_v);
    struct runtime_dsp d = package(image_v, 'F', 'R', 0x4652, 1);
    d.hook_offset[MODWERK_OT_MACHINE_STARTS] = 160;
    word(image_v + 64 + 12, MODWERK_MACHINE_PROTECT | MODWERK_MACHINE_START);
    word(image_v + 160, MODWERK_MACHINE_START_ABI); word(image_v + 164, 16);
    uint32_t base = operation == RUNTIME_METADATA_PREPARE ? 0 : unit_address(image_v);
    word(image_v + 168, base + 64); word(image_v + 172, base + 16);
    return d;
}
static void start_records(void)
{
    const unsigned phases[] = {RUNTIME_METADATA_PREPARE, RUNTIME_METADATA_SWITCH};
    for (unsigned p = 0; p < 2; ++p) {
        unsigned op = phases[p];
        struct runtime_dsp d = start_package(op);
        CHECK(machine_contributor_validate(&d, op) == RUNTIME_OK);
        /* Every truncated descriptor/extension extent, including a declared hook past the image. */
        for (unsigned bytes = 0; bytes <= sizeof image_v; ++bytes) {
            d.image_bytes = bytes;
            CHECK(machine_contributor_validate(&d, op) == (bytes < 176 ? RUNTIME_MALFORMED : RUNTIME_OK));
        }
        d.image_bytes = sizeof image_v;
        const unsigned bad_hook[] = {1, 63, 64, 128, 144 + 1, 161, 242, 256, UINT32_MAX};
        for (unsigned i = 0; i < sizeof bad_hook / sizeof *bad_hook; ++i) {
            d.hook_offset[MODWERK_OT_MACHINE_STARTS] = bad_hook[i];
            CHECK(machine_contributor_validate(&d, op) == RUNTIME_MALFORMED);
        }
        d = start_package(op);
        uint32_t base = op == RUNTIME_METADATA_PREPARE ? 0 : unit_address(image_v);
        const unsigned good_call[] = {0, 2, 254};
        for (unsigned i = 0; i < sizeof good_call / sizeof *good_call; ++i) {
            word(image_v + 172, base + good_call[i]);
            CHECK(machine_contributor_validate(&d, op) == RUNTIME_OK);
        }
        const uint32_t bad_call[] = {1, 255, 256, UINT32_MAX};
        for (unsigned i = 0; i < sizeof bad_call / sizeof *bad_call; ++i) {
            word(image_v + 172, base + bad_call[i]);
            CHECK(machine_contributor_validate(&d, op) == RUNTIME_MALFORMED);
        }
        d = start_package(op);
        /* A callback/descriptor in another package, missing relocations, incompatible versions and an orphan record. */
        word(image_v + 168, base + 66);
        CHECK(machine_contributor_validate(&d, op) == RUNTIME_MALFORMED);
        word(image_v + 168, base + 64); word(image_v + 172, unit_address(image_a) + 16);
        CHECK(machine_contributor_validate(&d, op) == RUNTIME_MALFORMED);
        d = start_package(phases[1 - p]);
        CHECK(machine_contributor_validate(&d, op) == RUNTIME_MALFORMED);
        d = start_package(op); word(image_v + 160, 2);
        CHECK(machine_contributor_validate(&d, op) == RUNTIME_MALFORMED);
        word(image_v + 160, 1); word(image_v + 164, 20);
        CHECK(machine_contributor_validate(&d, op) == RUNTIME_MALFORMED);
        /* SETUP_PAGE extends the descriptor to 88 bytes; START cannot occupy
         * either of its two callback words, even though the base ABI is 80. */
        d = start_package(op);
        word(image_v + 76, MODWERK_MACHINE_START | MODWERK_MACHINE_SETUP_PAGE);
        CHECK(machine_contributor_validate(&d, op) == RUNTIME_OK);
        memcpy(image_v + 144, image_v + 160, 16);
        d.hook_offset[MODWERK_OT_MACHINE_STARTS] = 144;
        CHECK(machine_contributor_validate(&d, op) == RUNTIME_MALFORMED);
        d.hook_offset[MODWERK_OT_MACHINE_STARTS] = RUNTIME_NONE;
        word(image_v + 76, MODWERK_MACHINE_SETUP_PAGE);
        d.image_bytes = 151;
        CHECK(machine_contributor_validate(&d, op) == RUNTIME_MALFORMED);
        d.image_bytes = 152;
        CHECK(machine_contributor_validate(&d, op) == RUNTIME_OK);
        d = start_package(op); d.hook_offset[MODWERK_OT_MACHINES] = RUNTIME_NONE;
        CHECK(machine_contributor_validate(&d, op) == RUNTIME_MALFORMED);
        d = start_package(op); word(image_v + 76, MODWERK_MACHINE_PROTECT);
        CHECK(machine_contributor_validate(&d, op) == RUNTIME_MALFORMED);
        d = start_package(op); d.hook_offset[MODWERK_OT_MACHINE_STARTS] = RUNTIME_NONE;
        CHECK(machine_contributor_validate(&d, op) == RUNTIME_MALFORMED);
        word(image_v + 76, MODWERK_MACHINE_PROTECT);
        CHECK(machine_contributor_validate(&d, op) == RUNTIME_OK); /* unchanged legacy machine */
        word(image_v + 64, 2);
        CHECK(machine_contributor_validate(&d, op) == RUNTIME_MALFORMED);
        d = start_package(op); d.image = 0;
        CHECK(machine_contributor_validate(&d, op) == RUNTIME_MALFORMED);
    }
    memset(image_v, 0, sizeof image_v);
}

int main(void)
{
    start_records();
    struct runtime_dsp none; memset(&none, 0, sizeof none);
    struct runtime_dsp ab = package(image_a, 'A', 'B', 0xab, 1), ab2 = package(image_b, 'A', 'B', 0xab, 1),
                       vec = package(image_v, 'S', '2', 0x52, 1), plain = package(image_v, 0, 0, 0x99, 0);
    CHECK(machine_contribution(&ab) == image_a + 64 && !machine_contribution(&plain) && !machine_contribution(&none));
    /* Installing a machine marks its foreign roots; an ordinary package is untouched. */
    CHECK(machine_contributor_admission(&none, &vec, host_read, 0, BANK, RUNTIME_METADATA_PREPARE) == RUNTIME_OK && vec.foreign_roots);
    plain.foreign_roots = 0;
    CHECK(machine_contributor_admission(&none, &plain, host_read, 0, BANK, RUNTIME_METADATA_PREPARE) == RUNTIME_OK && !plain.foreign_roots);
    /* VECTOR leaves with no Part holding it; then with a saved SRAM Part holding S2/1: refused; unknown memory: refused. */
    CHECK(machine_contributor_admission(&vec, &none, host_read, 0, BANK, RUNTIME_METADATA_SWITCH) == RUNTIME_OK);
    sign(sram[1] + 2 * 6322u, 5, 'S', '2');
    CHECK(machine_contributor_admission(&vec, &none, host_read, 0, BANK, RUNTIME_METADATA_PREPARE) == RUNTIME_IN_USE);
    CHECK(machine_contributor_admission(&vec, &plain, host_read, 0, BANK, RUNTIME_METADATA_SWITCH) == RUNTIME_IN_USE);
    memset(sram[1], 0, sizeof sram[1]);
    unreadable = 1;
    CHECK(machine_contributor_admission(&vec, &none, host_read, 0, BANK, RUNTIME_METADATA_PREPARE) == RUNTIME_IN_USE);
    unreadable = 0;
    /* A replacement of the same machine is no departure: no Part or retirement check. */
    sign(bank + 0x8ed80u, 2, 'A', 'B');
    CHECK(machine_contributor_admission(&ab, &ab2, host_read, 0, BANK, RUNTIME_METADATA_SWITCH) == RUNTIME_OK && !retires && ab2.foreign_roots);
    /* Analog BD leaves through its base retirement: PREPARE checks (PLANNED admits, UNKNOWN refuses), SWITCH retires
     * (only CLEAR retires). The Part signature fallback is not used for it. */
    verdict_check = MACHINE_RETIRE_PLANNED;
    CHECK(machine_contributor_admission(&ab, &none, host_read, 0, BANK, RUNTIME_METADATA_PREPARE) == RUNTIME_OK && checks == 2);
    verdict_check = MACHINE_RETIRE_UNKNOWN;
    CHECK(machine_contributor_admission(&ab, &none, host_read, 0, BANK, RUNTIME_METADATA_PREPARE) == RUNTIME_IN_USE);
    verdict_retire = MACHINE_RETIRE_PARTIAL;
    CHECK(machine_contributor_admission(&ab, &vec, host_read, 0, BANK, RUNTIME_METADATA_SWITCH) == RUNTIME_IN_USE && retires == 1);
    verdict_retire = MACHINE_RETIRE_PLANNED;
    CHECK(machine_contributor_admission(&ab, &none, host_read, 0, BANK, RUNTIME_METADATA_SWITCH) == RUNTIME_IN_USE);
    verdict_retire = MACHINE_RETIRE_CLEAR;
    CHECK(machine_contributor_admission(&ab, &none, host_read, 0, BANK, RUNTIME_METADATA_SWITCH) == RUNTIME_OK && retires == 3);
    /* A base without the retirement (its check answers -1): the Part signature decides, as for any machine. */
    verdict_check = -1;
    CHECK(machine_contributor_admission(&ab, &none, host_read, 0, BANK, RUNTIME_METADATA_SWITCH) == RUNTIME_IN_USE && retires == 3);
    memset(bank, 0, sizeof bank);
    CHECK(machine_contributor_admission(&ab, &none, host_read, 0, BANK, RUNTIME_METADATA_SWITCH) == RUNTIME_OK && retires == 3);
    verdict_check = MACHINE_RETIRE_CLEAR;
    /* A stock UI root naming the leaving image refuses, before its retirement runs. */
    cache[100] = 0x40, cache[101] = 0x20, cache[102] = 0x00, cache[103] = 0x10; /* inside Analog BD's image */
    CHECK(machine_contributor_admission(&ab, &none, host_read, 0, BANK, RUNTIME_METADATA_SWITCH) == RUNTIME_IN_USE && retires == 3);
    CHECK(machine_contributor_admission(&vec, &none, host_read, 0, BANK, RUNTIME_METADATA_SWITCH) == RUNTIME_OK);
    (void)ui_root;
    if (failures) { fprintf(stderr, "%u contributor checks failed\n", failures); return 1; }
    puts("Machine contributors: records by hook offset, foreign roots, replacement, Part signature refusal, unknown memory, "
         "and the Analog BD retirement's check/retire verdicts passed.");
    return 0;
}
