/* SPDX-License-Identifier: GPL-3.0-or-later
 * Host check of the USB base update (cc -DMODWERK_HOST): what the flash
 * backend accepts (only the running base's own container), the sectors it
 * erases and pages it programs against a NOR model that clears bits only,
 * the verify and its one retry, and the restart it arms. The fixture (an
 * image packed by the kit's Python codec, test_recipe.py) comes through
 * MODWERK_FLASH_FIXTURE: [u32 image length][u32 .run offset][image]
 * [u32 container length][container]. Stock's own NOR routines, the
 * quiesce and the reset are hardware-only. */
#include "boot.c"
#include "flash.c"
#include "sha256.c" /* the loader's, for ABI 7 sites */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static unsigned failures;
#define CHECK(x) do { if (!(x)) { failures++; fprintf(stderr, "%s:%d: %s\n", __FILE__, __LINE__, #x); } } while (0)
static const struct mu_backend *b = &modwerk_flash_backend;

void modwerk_modset_candidate(const uint8_t *package, uint32_t bytes) { (void)package; (void)bytes; }
void modwerk_modset_accepted(void) {}

static uint32_t rd(const uint8_t *p) { return (uint32_t)p[0] << 24 | (uint32_t)p[1] << 16 | (uint32_t)p[2] << 8 | p[3]; }
static uint8_t *image, *container;
static uint32_t image_len, container_len, run_off;

/* Stage the container as the host does and verify it. */
static int offered(void)
{
    memcpy(modwerk_boot_staging(), container, container_len);
    return b->prepare(0, modwerk_boot_staging(), container_len);
}
/* Run an armed restart: 30 ticks, then the service (boot.c's host stub counts resets). */
static int restarted(void)
{
    int before = modwerk_test_resets;
    for (int i = 0; i < 40; ++i) if (modwerk_boot_tick()) modwerk_boot_service();
    return modwerk_test_resets - before;
}
static int nor_holds_container(void)
{
    return !memcmp(modwerk_test_nor + 0x4000u, container, container_len);
}

int main(void)
{
    const char *path = MODWERK_FLASH_FIXTURE;
    FILE *f = fopen(path, "rb");
    if (!f) { fprintf(stderr, "no fixture at %s\n", path); return 2; }
    uint8_t head[8];
    CHECK(fread(head, 1, 8, f) == 8);
    image_len = rd(head); run_off = rd(head + 4);
    image = malloc(image_len); CHECK(fread(image, 1, image_len, f) == image_len);
    CHECK(fread(head, 1, 4, f) == 4); container_len = rd(head);
    container = malloc(container_len + 4); CHECK(fread(container, 1, container_len, f) == container_len);
    fclose(f);
    CHECK(image_len > OS_VEROFF + 2u && rd(image) == OS_FIRST && container_len % 4 == 0);

    /* The running image: the fixture's, with a word outside the compared regions changed (stock .data a module
     * patched). Its packed .run is digested at boot, then stock's start overwrites it and rewrites bytes of the
     * bootloader copy, as on a unit (ot_emu, 23 October 2026: every write was refused against the running RAM). */
    static const uint32_t starts[SECTORS] = {0x4000, 0x6000, 0x8000, 0xa000, 0xc000, 0xe000, 0x10000, 0x20000, 0x30000, 0x40000,
        0x50000, 0x60000, 0x70000, 0x80000, 0x90000, 0xa0000, 0xb0000, 0xc0000, 0xd0000, 0xe0000, 0xf0000, 0x100000, 0x110000,
        0x120000, 0x130000, 0x140000, 0x150000, 0x160000, 0x170000, 0x180000, 0x190000, 0x1a0000, 0x1b0000, 0x1c0000, 0x1d0000,
        0x1e0000, 0x1f0000};
    memcpy(modwerk_test_sectors, starts, sizeof starts);
    uint8_t *running = malloc(image_len);
    memcpy(running, image, image_len);
    running[0x1000] ^= 0xff; running[0xb9650 + 0x400 - 0x400] ^= 0x55;
    modwerk_test_running = running; modwerk_test_run_load = running + run_off;
    mu_sha256(image + (BOOTLOADER_FROM - OS_ENTRY), BOOTLOADER_END - BOOTLOADER_FROM, modwerk_test_bootloader_digest);
    modwerk_flash_snapshot();
    uint32_t run_len = 8u + rd(running + run_off);
    memset(running + run_off, 0xa5, run_len);
    running[0x400e201eu - 0x40000400u] ^= 0x20; running[0x400e2108u - 0x40000400u] ^= 0x1a;
    memset(modwerk_test_nor, 0x5a, sizeof modwerk_test_nor); /* another base's bytes */

    /* The bounded decoder reproduces the image and refuses a short output buffer. */
    uint8_t *out = malloc(image_len + 16);
    CHECK(modwerk_flash_depack(container + SECT + 8u, rd(container + SECT), out, image_len + 16) == (long)image_len);
    CHECK(!memcmp(out, image, image_len));
    CHECK(modwerk_flash_depack(container + SECT + 8u, rd(container + SECT), out, image_len - 1) == -1);
    CHECK(modwerk_flash_depack(container + SECT + 8u, rd(container + SECT) - 1, out, image_len + 16) == -1);
    free(out);

    /* Accepted: verified, written over the sectors up to its end, NOR verified, the restart armed by accept. */
    CHECK(offered() == 1);
    CHECK(b->publish(0) == MU_APPLIED);
    CHECK(nor_holds_container());
    unsigned sectors = 0;
    for (unsigned k = 0; k < SECTORS; ++k) if (starts[k] <= 0x4000u + container_len) ++sectors;
    CHECK(modwerk_test_erases == (int)sectors);
    CHECK(modwerk_test_programs == (int)((container_len + 255u) / 256u));
    CHECK(modwerk_flash_refusal == FLASH_OK);
    CHECK(restarted() == 0);
    CHECK(b->retire(0) == 1);
    CHECK(restarted() == 1);

    /* The same container again: nothing erased or programmed, still accepted; a rollback after it restarts too. */
    modwerk_test_erases = modwerk_test_programs = 0;
    CHECK(offered() == 1 && b->publish(0) == MU_APPLIED);
    CHECK(modwerk_test_erases == 0 && modwerk_test_programs == 0);
    CHECK(b->restore(0) == 1 && restarted() == 1);

    /* Refused before any write. */
    uint8_t keep[4];
    memset(modwerk_test_nor, 0x5a, sizeof modwerk_test_nor); modwerk_test_erases = 0;
    CHECK(offered() == 1);
    memcpy(keep, container + 20, 4); container[20] ^= 1; /* the section sum */
    CHECK(offered() == 0 && modwerk_flash_refusal == FLASH_FORMAT);
    memcpy(container + 20, keep, 4);
    container_len += 2; /* not a whole number of words */
    CHECK(offered() == 0 && modwerk_flash_refusal == FLASH_FORMAT);
    container_len -= 2;
    modwerk_test_flash_version = 0x0409u; /* NOR's bootstrap is another: the entry would reprogram it */
    CHECK(offered() == 1 && b->publish(0) == MU_UNCHANGED && modwerk_flash_refusal == FLASH_BOOTSTRAP);
    modwerk_test_flash_version = 0x0408u;
    modwerk_test_bootloader_digest[0] ^= 1; /* the candidate's bootloader copy is not stock's */
    CHECK(offered() == 1 && b->publish(0) == MU_UNCHANGED && modwerk_flash_refusal == FLASH_PROTECTED);
    modwerk_test_bootloader_digest[0] ^= 1;
    memcpy(running + run_off, image + run_off, run_len);
    running[run_off + 12] ^= 1; modwerk_flash_snapshot(); /* another base's .run booted */
    CHECK(offered() == 1 && b->publish(0) == MU_UNCHANGED && modwerk_flash_refusal == FLASH_OTHER_BASE);
    running[run_off] = 0xff; modwerk_flash_snapshot(); /* a length past the stage: no digest taken */
    CHECK(offered() == 1 && b->publish(0) == MU_UNCHANGED && modwerk_flash_refusal == FLASH_OTHER_BASE);
    memcpy(running + run_off, image + run_off, run_len); modwerk_flash_snapshot();
    memset(running + run_off, 0xa5, run_len);
    {   /* a stream that does not end where its length says (a byte dropped in the middle: resummed) */
        uint32_t len = rd(container + SECT), sum = 0;
        memmove(container + SECT + 8u + len / 2, container + SECT + 9u + len / 2, len / 2 - 1);
        container[SECT] = (uint8_t)((len - 1) >> 24); container[SECT + 1] = (uint8_t)((len - 1) >> 16);
        container[SECT + 2] = (uint8_t)((len - 1) >> 8); container[SECT + 3] = (uint8_t)(len - 1);
        for (uint32_t i = 0; i < len - 1; ++i) sum += container[SECT + 8u + i];
        container[SECT + 4] = (uint8_t)(sum >> 24); container[SECT + 5] = (uint8_t)(sum >> 16); container[SECT + 6] = (uint8_t)(sum >> 8); container[SECT + 7] = (uint8_t)sum;
        CHECK(offered() == 1 && b->publish(0) == MU_UNCHANGED);
        CHECK(modwerk_flash_refusal != FLASH_OK && modwerk_flash_refusal != FLASH_WRITE);
    }
    CHECK(modwerk_test_erases == 0 && !memcmp(modwerk_test_nor + 0x4000u, modwerk_test_nor + 0x4000u + 0x10000u, 0x1000u));
    CHECK(restarted() == 0);

    /* Not a container: a RAM boot image and a module package still reach boot.c and the loader. */
    uint8_t *stage_image = modwerk_boot_staging();
    memcpy(stage_image, image, OS_VEROFF + 2u + 101u);
    CHECK(b->prepare(0, stage_image, OS_VEROFF + 2u + 101u) == 1);
    CHECK(b->discard(0) == 1);
    memcpy(stage_image, "MWRM\0\3\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0", 28);
    modwerk_runtime_ticks = 2;
    CHECK(b->prepare(0, stage_image, 28) == 1); /* an empty package removes: the loader's */
    CHECK(b->discard(0) == 1);

    /* A write whose verify fails twice: uncertain, named, no restart; the unit stays up and the next try succeeds. */
    FILE *g = fopen(path, "rb"); /* the fixture's container again */
    CHECK(g && fseek(g, 8 + (long)image_len + 4, SEEK_SET) == 0 && fread(container, 1, container_len, g) == container_len); fclose(g);
    modwerk_test_drop = 1;
    CHECK(offered() == 1 && b->publish(0) == MU_UNCERTAIN && modwerk_flash_refusal == FLASH_WRITE);
    CHECK(b->restore(0) == 1 && restarted() == 0);
    modwerk_test_drop = 0;
    CHECK(offered() == 1 && b->publish(0) == MU_APPLIED && nor_holds_container());
    CHECK(b->retire(0) == 1 && restarted() == 1 && modwerk_flash_refusal == FLASH_OK);

    if (failures) fprintf(stderr, "%u failures\n", failures);
    return failures ? 1 : 0;
}
