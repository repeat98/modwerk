/* SPDX-License-Identifier: GPL-2.0-or-later */
/* The core's kit-data and project-data store on the host, with the byte vectors of its saved format.
 * Built three times: -DTABLE=1 (Euclidean Scale's EUS2 block alone), 2 (three blocks, the last two too big
 * together), 0 (no module saves anything). */
#include <assert.h>
#include <string.h>
#include "../store.c"

#define KIT 0x5574
#define PAD 0x573e
#define RECORD 0x5800

static uint8_t kits[CORE_KITS * KIT];
static uint8_t *pattern;
uintptr_t core_store_host[5];

static int last_kit = -2, last_found = -2, calls;
static void changed(int kit, int found)
{
    last_kit = kit;
    last_found = found;
    ++calls;
}

static int loaded_found[3] = {-1, -1, -1};
static void loaded0(int found) { loaded_found[0] = found; }
static void loaded1(int found) { loaded_found[1] = found; }
static void loaded2(int found) { loaded_found[2] = found; }

static uint8_t eus[CORE_KITS * 64], big[CORE_KITS * 100], mid[CORE_KITS * 60], small[CORE_KITS * 10];
static const core_kitdata_t eus2 = {{'E', 'U', 'S', '2'}, 64, eus, changed};
static const core_kitdata_t k_big = {{'B', 'I', 'G', '1'}, 100, big, changed};
static const core_kitdata_t k_mid = {{'M', 'I', 'D', '1'}, 60, mid, changed};
static const core_kitdata_t k_small = {{'S', 'M', 'L', '1'}, 10, small, changed};

static uint8_t p0[16], p1[600], p2[8];
static const core_projdata_t pd0 = {{'A', 'A', 'A', 'A'}, 16, p0, loaded0};
static const core_projdata_t pd1 = {{'T', 'O', 'O', 'B'}, 600, p1, loaded1}; /* never fits the 484-byte gap */
static const core_projdata_t pd2 = {{'C', 'C', 'C', 'C'}, 8, p2, loaded2};

#if TABLE == 1
const core_kitdata_t *const core_kitdata[] = {&eus2, 0};
const core_projdata_t *const core_projdata[] = {0};
#elif TABLE == 2
const core_kitdata_t *const core_kitdata[] = {&k_big, &k_mid, &k_small, 0};
const core_projdata_t *const core_projdata[] = {&pd0, &pd1, &pd2, 0};
#else
const core_kitdata_t *const core_kitdata[] = {0};
const core_projdata_t *const core_projdata[] = {0};
#endif

static uint8_t record[RECORD], file[0x200];

static void fill(uint8_t *p, uint32_t n, uint8_t seed)
{
    for (uint32_t i = 0; i < n; ++i)
        p[i] = (uint8_t)(seed + i * 7u);
}

/* A record as stock leaves it: end mark, zeros after it, and the base's project archive in the last 48 bytes. */
static void stock_record(void)
{
    memset(record, 0x11, sizeof record);
    put32(record + PAD - 4, 0xbacef00cu);
    memset(record + PAD, 0, AREA);
    memset(record + PAD + AREA, 0x77, RECORD - PAD - AREA);
}

static int archive_intact(void)
{
    for (uint32_t i = PAD + AREA; i < RECORD; ++i)
        if (record[i] != 0x77)
            return 0;
    return record[PAD - 1] == 0x0c && record[PAD - 5] == 0x11;
}

static void table1(void)
{
    assert(crc16(0xffff, (const uint8_t *)"123456789", 9) == 0x29b1);
    assert(layout() == 0xa2bd);
    assert(core_kitdata_room() == 143);
    assert(PAD + AREA == RECORD - 48); /* core's area ends where the project archive starts */

    /* Save kit 5: 4B A2 BD, its 64 bytes, 79 zeros, and nothing else in the record. */
    fill(eus + 5 * 64, 64, 3);
    stock_record();
    core_kitdata_save(record, kits + 5 * KIT);
    assert(record[PAD] == 0x4b && record[PAD + 1] == 0xa2 && record[PAD + 2] == 0xbd);
    assert(!memcmp(record + PAD + 3, eus + 5 * 64, 64));
    assert(blank(record + PAD + 67, 79));
    assert(archive_intact());

    /* Load it into kit 9: the same block, found. */
    calls = 0;
    core_kitdata_load(kits + 9 * KIT, record);
    assert(!memcmp(eus + 9 * 64, eus + 5 * 64, 64) && last_kit == 9 && last_found == 1 && calls == 1);

    /* Saved under another module set (other layout): zeros, not found. */
    record[PAD + 2] ^= 1;
    core_kitdata_load(kits + 9 * KIT, record);
    assert(blank(eus + 9 * 64, 64) && last_found == 0);

    /* A blank area (a stock kit): zeros, not found, no conflict. */
    const uint32_t before = core_store_conflicts;
    stock_record();
    fill(eus + 9 * 64, 64, 9);
    core_kitdata_load(kits + 9 * KIT, record);
    assert(blank(eus + 9 * 64, 64) && last_found == 0 && core_store_conflicts == before);

    /* Someone else's bytes: left as they are on save, zeros on load, each counted. */
    record[PAD + 10] = 0x5a;
    core_kitdata_save(record, kits + 5 * KIT);
    assert(record[PAD] == 0 && record[PAD + 10] == 0x5a && core_store_conflicts == before + 1);
    fill(eus + 9 * 64, 64, 9);
    core_kitdata_load(kits + 9 * KIT, record);
    assert(blank(eus + 9 * 64, 64) && last_found == 0 && core_store_conflicts == before + 2);

    /* Kit copies in RAM: kit 5 to kit 7 directly. */
    calls = 0;
    core_kit_copied(kits + 7 * KIT, kits + 5 * KIT);
    assert(!memcmp(eus + 7 * 64, eus + 5 * 64, 64) && last_kit == 7 && last_found == 1 && calls == 1);

    /* Kit 5 to a buffer (the clipboard), the buffer saved (SAVE KIT) and back into kit 11 through the shadow. */
    static uint8_t clip[KIT], other[KIT];
    core_kit_copied(clip, kits + 5 * KIT);
    stock_record();
    core_kitdata_save(record, clip);
    assert(record[PAD] == 0x4b && !memcmp(record + PAD + 3, eus + 5 * 64, 64) && archive_intact());
    core_kit_copied(kits + 11 * KIT, clip);
    assert(!memcmp(eus + 11 * 64, eus + 5 * 64, 64) && last_kit == 11 && last_found == 1);

    /* A record loaded into a buffer (a kit from the +Drive) carries its block to the kit it is pasted into. */
    fill(eus + 5 * 64, 64, 40);
    stock_record();
    core_kitdata_save(record, kits + 5 * KIT);
    core_kitdata_load(other, record);
    core_kit_copied(kits + 12 * KIT, other);
    assert(!memcmp(eus + 12 * 64, eus + 5 * 64, 64));

    /* A buffer never seen: the kit it is copied into keeps its blocks, nothing fires; a save of it writes zeros. */
    static uint8_t unseen[KIT];
    fill(eus + 13 * 64, 64, 50);
    uint8_t keep[64];
    memcpy(keep, eus + 13 * 64, 64);
    calls = 0;
    core_kit_copied(kits + 13 * KIT, unseen);
    assert(!memcmp(eus + 13 * 64, keep, 64) && calls == 0);
    stock_record();
    record[PAD] = 0x4b;
    core_kitdata_save(record, unseen);
    assert(blank(record + PAD, AREA) && archive_intact());

    /* A buffer overwritten by an unseen one loses its shadow; a record without core's mark drops it too. */
    core_kit_copied(clip, unseen);
    assert(!shadow_of(clip));
    core_kit_copied(clip, kits + 5 * KIT);
    stock_record();
    core_kitdata_load(clip, record);
    assert(!shadow_of(clip));

    /* Addresses between kits are buffers. */
    assert(kit_index(kits + 3 * KIT) == 3 && kit_index(kits + 3 * KIT + 2) == -1 && kit_index(kits + CORE_KITS * KIT) == -1);
    assert(kit_index(kits - KIT) == -1);

    /* The kit on: the pattern object's word at +0x138. */
    static uint8_t object[0x140];
    pattern = 0;
    assert(core_kit_on() == -1);
    pattern = object;
    *(uint32_t *)(object + 0x138) = 42;
    assert(core_kit_on() == 42);
    *(uint32_t *)(object + 0x138) = 128;
    assert(core_kit_on() == -1);

    /* No project data module: the project's header gap stays as it is. */
    memset(file, 0, sizeof file);
    file[0x30] = 1;
    core_projdata_save(file);
    assert(file[0x1c] == 0 && file[0x30] == 1);
}

static void table2(void)
{
    /* big (100) fits, mid (60) does not after it, small (10) would but packing stops at mid. */
    fill(big + 2 * 100, 100, 1);
    fill(mid + 2 * 60, 60, 2);
    fill(small + 2 * 10, 10, 3);
    stock_record();
    core_kitdata_save(record, kits + 2 * KIT);
    assert(record[PAD] == 0x4b && !memcmp(record + PAD + 3, big + 2 * 100, 100) && blank(record + PAD + 103, 43));
    assert(archive_intact());
    fill(mid + 4 * 60, 60, 4);
    fill(small + 4 * 10, 10, 4);
    calls = 0;
    core_kitdata_load(kits + 4 * KIT, record);
    assert(!memcmp(big + 4 * 100, big + 2 * 100, 100));
    assert(blank(mid + 4 * 60, 60) && blank(small + 4 * 10, 10) && last_found == 0 && calls == 3);

    /* Project data: AAAA and CCCC saved, TOOB skipped, then read back. */
    memset(file, 0, sizeof file);
    fill(p0, 16, 5);
    fill(p2, 8, 6);
    core_projdata_save(file);
    const uint8_t *gap = file + 0x1c;
    assert(get32(gap) == 0x454c4b50u && !memcmp(gap + 4, "AAAA", 4) && get32(gap + 8) == 16);
    assert(!memcmp(gap + 12, p0, 16) && !memcmp(gap + 28, "CCCC", 4) && get32(gap + 32) == 8);
    assert(!memcmp(gap + 36, p2, 8) && blank(gap + 44, 484 - 44));
    uint8_t want0[16], want2[8];
    memcpy(want0, p0, 16);
    memcpy(want2, p2, 8);
    fill(p0, 16, 99);
    fill(p2, 8, 99);
    fill(p1, 600, 99);
    core_projdata_load(file);
    assert(!memcmp(p0, want0, 16) && !memcmp(p2, want2, 8) && blank(p1, 600));
    assert(loaded_found[0] == 1 && loaded_found[1] == 0 && loaded_found[2] == 1);

    /* A record whose size runs past the gap stops the walk: CCCC behind it is not found. */
    put32(file + 0x1c + 8, 1000);
    core_projdata_load(file);
    assert(loaded_found[0] == 0 && loaded_found[2] == 0 && blank(p0, 16));

    /* A gap that is not core's: untouched on save, every block zero and not found on load, both counted. */
    const uint32_t before = core_store_conflicts;
    memset(file, 0, sizeof file);
    file[0x40] = 9;
    core_projdata_save(file);
    assert(file[0x1c] == 0 && file[0x40] == 9 && core_store_conflicts == before + 1);
    core_projdata_load(file);
    assert(loaded_found[0] == 0 && loaded_found[2] == 0 && core_store_conflicts == before + 2);
}

static void table0(void)
{
    /* No kit-data module: records, kits and the count stay as they are. */
    stock_record();
    record[PAD + 4] = 0x5a;
    core_kitdata_save(record, kits);
    core_kitdata_load(kits, record);
    core_kit_copied(kits + KIT, kits);
    assert(record[PAD + 4] == 0x5a && core_store_conflicts == 0);
}

int main(void)
{
    core_store_host[0] = (uintptr_t)kits;
    core_store_host[1] = KIT;
    core_store_host[2] = PAD;
    core_store_host[3] = AREA;
    core_store_host[4] = (uintptr_t)&pattern;
#if TABLE == 1
    table1();
#elif TABLE == 2
    table2();
#else
    table0();
#endif
    (void)table0;
    (void)table1;
    (void)table2;
    (void)eus2; (void)k_big; (void)k_mid; (void)k_small; (void)pd0; (void)pd1; (void)pd2;
    return 0;
}
