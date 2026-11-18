/* SPDX-License-Identifier: GPL-3.0-or-later
 * Host check of fxpage.c: a page recipe as build.py writes it becomes the module's descriptor (donor,
 * patches, inherited enable bits, the handle as its id, formatters with their fixups), the choosers list it
 * after the stock rows, and a recipe that names the wrong donor or reaches past its image is refused. */
#include "sha256.c"
#include "fxpage.c"
#include <stdio.h>
#include <string.h>

static unsigned failures;
#define CHECK(x) do { if (!(x)) { failures++; fprintf(stderr, "%s:%d: %s\n", __FILE__, __LINE__, #x); } } while (0)
const fx_set modwerk_fx_modules = {{1u << 26 | 1u << 27}};
uint32_t modwerk_fx1_list[MODWERK_LIST_ROWS] = {0x1000, 0x1100, 0x1200}, modwerk_fx2_list[MODWERK_LIST_ROWS] = {0x1000, 0x2100, 0x2200, 0x2300};
const uint32_t modwerk_fx_rows[2] = {3, 4};
static unsigned invalidations, pushes, pushed_before;
static uint32_t pushed_at, pushed_bytes;
void modwerk_machine_invalidate_code(void) { ++invalidations; }
#ifdef MODWERK_CACHED_MODULES /* build_core.py --cached-modules: each formatter's fixed code is pushed before the invalidation */
void modwerk_machine_flush_data(uint32_t address, uint32_t length)
{ ++pushes, pushed_at = address, pushed_bytes = length, pushed_before = invalidations; }
#endif

uint8_t modwerk_test_memory[0x40000] __attribute__((aligned(4))); /* pages from 0x10000: 128 ids need 0xd000 */
#define donor (modwerk_test_memory + 0x100)
#define image (modwerk_test_memory + 0x1000)
static unsigned recipe(void) /* 1 integer, 1 string, slot 2 inherited, one formatter with one fixup at 8 */
{
    memset(image, 0, 256);
    memcpy(image, "MWPG", 4);
    put32(image + 4, ADDR(donor));
    mu_sha256(donor, PAGE, image + 8);
    image[40] = 0, image[41] = 1 << 2;          /* inherited: slot 2 */
    image[42] = 1, image[43] = 1, image[44] = 1;
    uint8_t *e = image + 52;
    e[0] = 0, e[1] = 0x5e, e[2] = 1, put32(e + 4, 77); e += 8;        /* default of knob 0 */
    e[0] = 0, e[1] = 22, e[2] = 6, e[3] = 4; memcpy(e + 4, "SIZE", 4); e += 8;
    uint8_t *code = image + 128;
    e[0] = 8, e[1] = 1, e[2] = 1; put32(e + 4, ADDR(code)); e[8] = 0, e[9] = 16; e[12] = 0, e[13] = 8;
    put32(code + 8, 0x16);                      /* the knob names, descriptor-relative */
    return 160;
}

int main(void)
{
    for (unsigned i = 0; i < PAGE; ++i) donor[i] = (uint8_t)(i * 7);
    put32(donor + 0x18e, 0x12345678u);          /* enable bits; slot 2 is the nibble at bits 8-11 */
    uint32_t bytes = recipe();
    CHECK(modwerk_fxpage_build(27, image, bytes, 2));
    uint8_t *d = pages[27];
    CHECK(d[3] == 27 && d[0x5e] == 77 && !memcmp(d + 22, "SIZE\0\0", 6) && d[100] == (uint8_t)(100 * 7));
    CHECK((be32(d + 0x18e) & 0xf00u) == 0x600u);                              /* inherited from the donor */
    CHECK(be32(d + 0xca + 32) == ADDR(image + 128) && be32(d + 0xfa + 32) == 0);
    CHECK(be32(image + 128 + 8) == ADDR(d) + 0x16 && be32(image + 48) == ADDR(d) && invalidations == 1);
#ifdef MODWERK_CACHED_MODULES
    CHECK(pushes == 1 && pushed_at == ADDR(image + 128) && pushed_bytes == 16 && pushed_before == 0);
#else
    CHECK(!pushes && !pushed_at && !pushed_bytes && !pushed_before);
#endif
    /* FX2 lists it after the stock rows; FX1 does not; the tables name its descriptor and row. */
    CHECK(modwerk_fx2_list[4] == ADDR(d) && !modwerk_fx2_list[5] && modwerk_fx2_list[3] == 0x2300 && !modwerk_fx1_list[3]);
    CHECK(TABLE(1)[27] == ADDR(d) && TABLE(3)[27] == 4 && TABLE(0)[27] == 0x1000 && !TABLE(2)[27] && TABLE(1)[26] == 0x1000);
    /* Built again at another handle: the fixup moves with the page. */
    CHECK(modwerk_fxpage_build(26, image, bytes, 3));
    CHECK(be32(image + 128 + 8) == ADDR(pages[26]) + 0x16 && pages[26][3] == 26);
    CHECK(modwerk_fx1_list[3] == ADDR(pages[26]) && modwerk_fx2_list[4] == ADDR(pages[26]) &&
          modwerk_fx2_list[5] == ADDR(pages[27]) && TABLE(3)[27] == 5);
    modwerk_fxpage_drop(26);
    CHECK(!modwerk_fx1_list[3] && modwerk_fx2_list[4] == ADDR(d) && TABLE(1)[26] == 0x1000 && !TABLE(3)[26]);
    /* Refused: another donor's bytes, a fixup past its code, the image cut short, a stock effect's id. */
    bytes = recipe(); image[8] ^= 1; CHECK(!modwerk_fxpage_build(26, image, bytes, 2));
    bytes = recipe(); image[52 + 16 + 13] = 14; CHECK(!modwerk_fxpage_build(26, image, bytes, 2));
    bytes = recipe(); CHECK(!modwerk_fxpage_build(26, image, 140, 2));
    CHECK(!modwerk_fxpage_build(21, image, bytes, 2));
    /* A formatter with more than five labels: the shared wide dial lists it with its maximum while listed. */
    bytes = recipe(); image[52 + 16 + 3] = 64; CHECK(modwerk_fxpage_build(26, image, bytes, 2));
    CHECK(modwerk_wide_table[0] == ADDR(image + 128) && modwerk_wide_table[1] == 64 && !modwerk_wide_table[2]);
    modwerk_fxpage_drop(26); CHECK(!modwerk_wide_table[0]);
    bytes = recipe(); image[52 + 16 + 3] = 4; CHECK(!modwerk_fxpage_build(26, image, bytes, 2)); /* 5 labels or fewer: no */
    /* Refused before any write, page and image alike: formatter code over a record or the head, a repeated or
     * overlapping fixup, a second formatter's code inside the first's. A fixup there would move what is read next. */
    uint8_t page_before[PAGE], image_before[256];
    memcpy(page_before, pages[26], PAGE);
#define REFUSED(edit) do { bytes = recipe(); edit; memcpy(image_before, image, 256); \
        CHECK(!modwerk_fxpage_build(26, image, bytes, 2) && !memcmp(pages[26], page_before, PAGE) && !memcmp(image, image_before, 256)); } while (0)
    REFUSED(put32(image + 52 + 16 + 4, ADDR(image + 64)));
    REFUSED(put32(image + 52 + 16 + 4, ADDR(image + 40)));
    REFUSED((image[52 + 16 + 1] = 2, image[52 + 16 + 15] = 8));
    REFUSED((image[52 + 16 + 1] = 2, image[52 + 16 + 15] = 10));
    REFUSED((image[44] = 2, memcpy(image + 84, image + 68, 16), put32(image + 84 + 4, ADDR(image + 136))));
    bytes = recipe(); image[52 + 16 + 1] = 2, image[52 + 16 + 15] = 12; CHECK(modwerk_fxpage_build(26, image, bytes, 2));
    modwerk_fxpage_drop(26);
    bytes = recipe(); image[44] = 2, memcpy(image + 84, image + 68, 16), image[84] = 9, put32(image + 84 + 4, ADDR(image + 144));
    CHECK(modwerk_fxpage_build(26, image, bytes, 2) && be32(pages[26] + 0xca + 36) == ADDR(image + 144) &&
          be32(image + 144 + 8) == ADDR(pages[26]));
    modwerk_fxpage_drop(26);
    /* A handle no installed module serves (MISSING): NONE's own page until the first tick builds the MISSING page,
     * NONE's bytes with its two names changed; a listed page is untouched, and a dropped one falls back to it. */
    memset(image, 0, PAGE); image[3] = 0; memcpy(image + 4, "NONE", 4); memcpy(image + 9, "NONE", 4); image[0x40] = 0x5a;
    CHECK(TABLE(0)[26] == 0x1000 && TABLE(1)[26] == 0x1000 && modwerk_fxpage_current(26, 0, 0, 0));
    modwerk_fxpage_missing();
    CHECK(TABLE(0)[26] == ADDR(MISSING_PAGE) && TABLE(1)[26] == ADDR(MISSING_PAGE) && TABLE(0)[27] == ADDR(MISSING_PAGE));
    CHECK(TABLE(1)[27] == ADDR(pages[27]) && !TABLE(2)[26] && !TABLE(3)[26] && modwerk_fxpage_current(26, 0, 0, 0));
    CHECK(!memcmp(MISSING_PAGE + 4, "MISS", 5) && !memcmp(MISSING_PAGE + 9, "MISSING\0\0\0\0\0", 13) &&
          MISSING_PAGE[3] == 0 && MISSING_PAGE[0x40] == 0x5a);
    bytes = recipe(); CHECK(modwerk_fxpage_build(26, image, bytes, 2) && TABLE(1)[26] == ADDR(pages[26]) && TABLE(0)[26] == ADDR(MISSING_PAGE));
    modwerk_fxpage_drop(26); CHECK(TABLE(1)[26] == ADDR(MISSING_PAGE) && modwerk_fxpage_current(26, 0, 0, 0));
    if (failures) { fprintf(stderr, "%u FX page checks failed\n", failures); return 1; }
    puts("Octatrack FX pages: a recipe becomes its descriptor and chooser rows, follows its handle, and is refused when it is wrong.");
    return 0;
}
