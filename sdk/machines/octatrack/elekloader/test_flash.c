/* SPDX-License-Identifier: GPL-3.0-or-later
 * Host check of the USB base update (cc -DMODWERK_HOST): what the flash backend accepts (only the running base's
 * own container), and how it writes the two-slot layout (slots.h) against a NOR model that clears bits only: the
 * conversion of a unit with one copy, an update, a repeat after a lost reply, the confirm, the stub's return to the
 * previous base after three failed starts, and a power cut after every single NOR operation, after which Elektron's
 * bootloader and the stub (modelled with slots.c, the stub's own code) must still start a whole base. The fixture
 * (an image packed by the kit's codec, test_recipe.py) comes through MODWERK_FLASH_FIXTURE: [u32 image length]
 * [u32 .run offset][image][u32 container length][container]. Stock's own NOR routines, its upgrade screen, the
 * quiesce and the reset are hardware-only. */
#include "boot.c"
#include "flash.c"
#include "slots.c"
#include "sha256.c" /* the loader's, for ABI 7 sites */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static unsigned failures;
#define CHECK(x) do { if (!(x)) { failures++; fprintf(stderr, "%s:%d: %s\n", __FILE__, __LINE__, #x); } } while (0)
static const struct mu_backend *b = &modwerk_flash_backend;

void modwerk_modset_candidate(const uint8_t *package, uint32_t bytes) { (void)package; (void)bytes; }
void modwerk_modset_accepted(void) {}
const uint8_t modwerk_base_digest[MU_DIGEST_BYTES] = {0x5b, 0xa5, 1, 2, 3};

static uint32_t rd(const uint8_t *p) { return (uint32_t)p[0] << 24 | (uint32_t)p[1] << 16 | (uint32_t)p[2] << 8 | p[3]; }
static void wr(uint8_t *p, uint32_t v) { p[0] = (uint8_t)(v >> 24); p[1] = (uint8_t)(v >> 16); p[2] = (uint8_t)(v >> 8); p[3] = (uint8_t)v; }
static uint8_t *image, *container, *old;
static uint32_t image_len, container_len, run_off;
static uint8_t saved[NOR_LIMIT], two[NOR_LIMIT];

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
static int holds(uint32_t at, const uint8_t *bytes, uint32_t n) { return !memcmp(modwerk_test_nor + at, bytes, n); }
/* Another whole container: `c`'s stream changed every `step` bytes and resummed (another base, as NOR sees it). */
static void another(uint8_t *to, const uint8_t *c, uint32_t step)
{
    uint32_t len = rd(c + SECT), sum = 0;
    memcpy(to, c, container_len);
    for (uint32_t i = 100u; i < len - 8u; i += step) to[SECT + 8u + i] ^= 0x3c;
    for (uint32_t i = 0; i < len; ++i) sum += to[SECT + 8u + i];
    wr(to + SECT + 4u, sum);
}
/* A unit the card installed `c` on: Elektron's bootloader below 0x4000, `c` at 0x4000, the rest erased. */
static void one_copy_unit(const uint8_t *c)
{
    memset(modwerk_test_nor, 0xff, NOR_LIMIT);
    memset(modwerk_test_nor, 0x5a, SLOT_STUB);
    memcpy(modwerk_test_nor + SLOT_STUB, c, container_len);
}
/* A unit on two slots: the stub, `c` in A (generation 2, confirmed), B erased. */
static void two_slot_unit(const uint8_t *c)
{
    uint8_t page[SLOT_RECORD];
    one_copy_unit(c);
    memset(modwerk_test_nor + SLOT_STUB, 0xff, SLOT_STUB_BYTES);
    memcpy(modwerk_test_nor + SLOT_STUB, container, SECT);
    memcpy(modwerk_test_nor + SLOT_STUB + SECT, modwerk_test_stub, sizeof modwerk_test_stub);
    memset(modwerk_test_nor + SLOT_A, 0xff, SLOT_BYTES);
    memcpy(modwerk_test_nor + SLOT_A + SLOT_RECORD, c, container_len);
    slot_record(page, 2u, container_len, 0, 1);
    memcpy(modwerk_test_nor + SLOT_A, page, SLOT_RECORD);
}

/* What starts after a power-on: Elektron's bootloader unpacks 0x4012 and runs it, checking nothing. A whole stub:
 * it picks a slot and clears a try bit first when it says so (slots.c, the stub's own code). A whole OS container
 * there: that one. Anything else, a half-written stub too: nothing starts (a startup-menu recovery). Returns the
 * started container's NOR address, 0 for none. */
static uint32_t power_on(void)
{
    if (slot_stub_whole()) {
        struct slot_state s[2];
        int mark, k;
        slot_read(SLOT_A, s); slot_read(SLOT_B, s + 1);
        k = slot_pick(s, &mark);
        if (k < 0) return 0;
        if (mark) {
            int n = slot_newest(s);
            uint32_t at = (n ? SLOT_B : SLOT_A) + REC_TRIES;
            uint16_t w = (uint16_t)(modwerk_test_nor[at] << 8 | modwerk_test_nor[at + 1u]);
            w &= (uint16_t)(w - 1u); /* the lowest set bit cleared */
            modwerk_test_nor[at] = (uint8_t)(w >> 8); modwerk_test_nor[at + 1u] = (uint8_t)w;
        }
        return (k ? SLOT_B : SLOT_A) + SLOT_RECORD;
    }
    if (memcmp(modwerk_test_nor + SLOT_STUB, "ELEK", 4)) return 0;
    uint32_t len = rd(modwerk_test_nor + SLOT_STUB + SECT), sum = 0;
    if (len < SLOT_STUB_BYTES || len > SLOT_B - SLOT_STUB - SECT - 8u) return 0; /* a stub's trampoline runs the stub: half written, it hangs */
    for (uint32_t i = 0; i < len; ++i) sum += modwerk_test_nor[SLOT_STUB + SECT + 8u + i];
    return sum == rd(modwerk_test_nor + SLOT_STUB + SECT + 4u) ? SLOT_STUB : 0;
}
static int started_is(uint32_t at, const uint8_t *c) { return at && holds(at, c, container_len); }

/* One write, cut after `cut` NOR operations (0: none): 1 when it ran to the end. */
static int publish_cut(int cut)
{
    modwerk_test_cut = cut;
    if (setjmp(modwerk_test_power)) { modwerk_test_cut = 0; return 0; }
    int ok = offered() == 1 && b->publish(0) == MU_APPLIED;
    modwerk_test_cut = 0;
    CHECK(ok);
    return 1;
}
/* Cut a write from NOR state `before` at every NOR operation in turn: afterwards a whole base must start, the old
 * one or the new; and the update, run again from there, must end on the new one. Returns how many cut points left
 * nothing to start; *points the write's NOR operations. */
static unsigned sweep(const uint8_t *before, unsigned *points)
{
    unsigned bricks = 0;
    memcpy(saved, before, NOR_LIMIT);
    for (int cut = 1; ; ++cut) {
        memcpy(modwerk_test_nor, saved, NOR_LIMIT);
        if (publish_cut(cut)) { *points = (unsigned)cut - 1u; break; }
        uint32_t at = power_on();
        if (!at) { ++bricks; continue; }
        CHECK(started_is(at, old) || started_is(at, container));
        CHECK(publish_cut(0) && started_is(power_on(), container));
    }
    return bricks;
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
    container = malloc(container_len + 4); old = malloc(container_len);
    CHECK(fread(container, 1, container_len, f) == container_len);
    fclose(f);
    CHECK(image_len > OS_VEROFF + 2u && rd(image) == OS_FIRST && container_len % 4 == 0);
    {   /* a stub sector as build_stub.py makes one (after its header): the trampoline's section, the mark, the code */
        uint8_t *at = modwerk_test_stub; /* at[x - SECT] is sector offset x */
        uint32_t code = 1500u, h = 0x811c9dc5u, sum = 0;
        memset(at, 0xff, sizeof modwerk_test_stub);
        for (unsigned i = 0; i < 10u; ++i) { at[8u + i] = (uint8_t)(0x40u + i); sum += 0x40u + i; }
        wr(at, 10u); wr(at + 4u, sum);
        memcpy(at + STUB_MARK - SECT, "MWSTUB", 6); at[STUB_MARK - SECT + 6u] = 0; at[STUB_MARK - SECT + 7u] = STUB_VERSION;
        for (uint32_t i = 0; i < code; ++i) { at[STUB_CODE - SECT + i] = (uint8_t)(i * 29u + 3u); h = (h ^ at[STUB_CODE - SECT + i]) * 0x01000193u; }
        wr(at + STUB_MARK - SECT + 8u, code); wr(at + STUB_MARK - SECT + 12u, h);
    }
    another(old, container, 97u); /* the base the unit runs from NOR before the update */

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

    /* The bounded decoder reproduces the image and refuses a short output buffer. */
    uint8_t *out = malloc(image_len + 16);
    CHECK(modwerk_flash_depack(container + SECT + 8u, rd(container + SECT), out, image_len + 16) == (long)image_len);
    CHECK(!memcmp(out, image, image_len));
    CHECK(modwerk_flash_depack(container + SECT + 8u, rd(container + SECT), out, image_len - 1) == -1);
    CHECK(modwerk_flash_depack(container + SECT + 8u, rd(container + SECT) - 1, out, image_len + 16) == -1);
    free(out);

    /* Converting a unit the card installed: the old base copied to B and confirmed, the stub, this base into A. */
    struct slot_state s[2];
    one_copy_unit(old);
    CHECK(started_is(power_on(), old));
    CHECK(offered() == 1);
    CHECK(b->publish(0) == MU_APPLIED && modwerk_flash_refusal == FLASH_OK && !modwerk_test_misuse);
    CHECK(holds(SLOT_B + SLOT_RECORD, old, container_len) && holds(SLOT_A + SLOT_RECORD, container, container_len));
    CHECK(holds(SLOT_STUB, container, SECT) && holds(SLOT_STUB + SECT, modwerk_test_stub, sizeof modwerk_test_stub));
    for (uint32_t i = 0; i < SLOT_STUB; ++i) if (modwerk_test_nor[i] != 0x5a) { CHECK(!"Elektron's bootloader changed"); break; }
    slot_read(SLOT_A, s); slot_read(SLOT_B, s + 1);
    CHECK(s[0].whole && !s[0].confirmed && s[0].generation == 2u && !memcmp(s[0].identity, modwerk_base_digest, 32));
    CHECK(s[1].whole && s[1].confirmed && s[1].generation == 1u);
    CHECK(modwerk_flash_slots[4] == 1);
    /* Written by this base itself, from RAM after its trial (the update's one restart): not quiesced, so the base's
     * own box showed it, not stock's screen; it runs on, says BASE SAVED, and starts from A next time. */
    CHECK(modwerk_test_screens == 0 && modwerk_flash_progress == 1001u);
    CHECK(b->retire(0) == 1 && restarted() == 0);
    modwerk_test_popup = 0; modwerk_flash_tick();
    CHECK(modwerk_test_popup && !strcmp(modwerk_test_popup, "BASE SAVED") && !modwerk_flash_progress);

    /* Just written, not yet started from NOR: never confirmed. */
    modwerk_flash_host = 1; asked = 0;
    ticks = SLOTS_CONFIRM_TICKS - 1u; CHECK(modwerk_flash_tick() == 1); modwerk_flash_service();
    slot_read(SLOT_A, s); CHECK(!s[0].confirmed);
    /* The next power-on: the stub starts A (a try used); the base shows BASE UPDATED at 5 s and confirms A at 15 s.
     * A names this base, which talked over USB in its trial: no computer needed this time. */
    CHECK(power_on() == SLOT_A + SLOT_RECORD);
    ticks = 0; asked = 0; modwerk_flash_host = 0; modwerk_test_popup = 0;
    for (unsigned t = 0; t < SLOTS_CONFIRM_TICKS; ++t) if (modwerk_flash_tick()) modwerk_flash_service();
    CHECK(modwerk_test_popup && !strcmp(modwerk_test_popup, "BASE UPDATED"));
    slot_read(SLOT_A, s); CHECK(s[0].confirmed && s[0].tries == 1u);
    CHECK(modwerk_flash_slots[5] == 0 && modwerk_flash_slots[6] == 2u);
    CHECK(power_on() == SLOT_A + SLOT_RECORD); /* confirmed: no more tries used */
    slot_read(SLOT_A, s); CHECK(s[0].tries == 1u);

    /* The same container again (a lost reply, then the host's repeat): nothing erased or programmed, a restart. */
    modwerk_test_erases = modwerk_test_programs = 0;
    CHECK(offered() == 1 && b->publish(0) == MU_APPLIED);
    CHECK(modwerk_test_erases == 0 && modwerk_test_programs == 0);
    CHECK(b->restore(0) == 1 && restarted() == 0);

    /* Refused before any write. */
    uint8_t keep[4];
    memcpy(saved, modwerk_test_nor, NOR_LIMIT); modwerk_test_erases = 0;
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
    {   /* a stream that does not end where its length says (a byte dropped in the middle: resummed) */
        uint8_t *whole = malloc(container_len);
        memcpy(whole, container, container_len);
        uint32_t len = rd(container + SECT), sum = 0;
        memmove(container + SECT + 8u + len / 2, container + SECT + 9u + len / 2, len / 2 - 1);
        wr(container + SECT, len - 1);
        for (uint32_t i = 0; i < len - 1; ++i) sum += container[SECT + 8u + i];
        wr(container + SECT + 4u, sum);
        CHECK(offered() == 1 && b->publish(0) == MU_UNCHANGED);
        CHECK(modwerk_flash_refusal != FLASH_OK && modwerk_flash_refusal != FLASH_WRITE);
        memcpy(container, whole, container_len); free(whole);
    }
    CHECK(modwerk_test_erases == 0 && !memcmp(modwerk_test_nor, saved, NOR_LIMIT) && restarted() == 0);

    /* Another base's container, from a unit with one copy: refused, the conversion is the trial's (the new base, from
     * RAM, writes itself). */
    one_copy_unit(old);
    memcpy(saved, modwerk_test_nor, NOR_LIMIT);
    memcpy(running + run_off, image + run_off, run_len);
    running[run_off + 12] ^= 1; modwerk_flash_snapshot(); /* another base's .run booted */
    CHECK(offered() == 1 && b->publish(0) == MU_UNCHANGED && modwerk_flash_refusal == FLASH_OTHER_BASE);
    running[run_off] = 0xff; modwerk_flash_snapshot(); /* a length past the stage: no digest taken */
    CHECK(offered() == 1 && b->publish(0) == MU_UNCHANGED && modwerk_flash_refusal == FLASH_OTHER_BASE);
    CHECK(!memcmp(modwerk_test_nor, saved, NOR_LIMIT));
    /* On two slots another base goes into the spare slot (one restart, owner 25 October 2026), its record unnamed; it
     * confirms itself once started, run 15 s and talked to. */
    two_slot_unit(old);
    modwerk_test_screens = 0;
    CHECK(offered() == 1 && b->publish(0) == MU_APPLIED && holds(SLOT_B + SLOT_RECORD, container, container_len));
    slot_read(SLOT_B, s + 1); CHECK(s[1].whole && !s[1].confirmed && s[1].generation == 3u && !s[1].identity[0]);
    CHECK(modwerk_test_screens > 0); /* quiesced: stock's own upgrade screen */
    CHECK(b->retire(0) == 1 && restarted() == 1 && started_is(power_on(), container)); /* the one restart */
    ticks = 0; asked = 0; modwerk_flash_host = 0;
    for (unsigned t = 0; t < 2u * SLOTS_CONFIRM_TICKS; ++t) if (modwerk_flash_tick()) modwerk_flash_service();
    slot_read(SLOT_B, s + 1); CHECK(!s[1].confirmed); /* unnamed: not before a computer has talked to it */
    modwerk_flash_host = 1;
    CHECK(modwerk_flash_tick() == 1); modwerk_flash_service();
    slot_read(SLOT_B, s + 1); CHECK(s[1].confirmed && modwerk_flash_slots[5] == 1u);
    memcpy(running + run_off, image + run_off, run_len); modwerk_flash_snapshot();
    memset(running + run_off, 0xa5, run_len);
    memcpy(modwerk_test_nor, saved, NOR_LIMIT);
    CHECK(offered() == 1 && b->publish(0) == MU_APPLIED && b->retire(0) == 1 && restarted() == 0); /* convert again */

    /* A conversion that stopped after B (the stub's verify failed, the unit still up) goes on from there; NOR with
     * neither layout is refused and left alone. */
    memset(modwerk_test_nor + SLOT_STUB, 0, 0x100);
    memset(modwerk_test_nor + SLOT_A, 0xff, SLOT_BYTES);
    CHECK(offered() == 1 && b->publish(0) == MU_APPLIED && power_on() == SLOT_A + SLOT_RECORD);
    CHECK(holds(SLOT_B + SLOT_RECORD, old, container_len) && b->retire(0) == 1 && restarted() == 0);
    memset(modwerk_test_nor + SLOT_STUB, 0, 0x100);
    memset(modwerk_test_nor + SLOT_B, 0xff, SLOT_RECORD);
    memcpy(saved, modwerk_test_nor, NOR_LIMIT);
    CHECK(offered() == 1 && b->publish(0) == MU_UNCHANGED && modwerk_flash_refusal == FLASH_LAYOUT);
    CHECK(!memcmp(modwerk_test_nor, saved, NOR_LIMIT) && restarted() == 0);

    /* Not a container: a RAM boot image and a module package still reach boot.c and the loader. */
    uint8_t *stage_image = modwerk_boot_staging();
    memcpy(stage_image, image, OS_VEROFF + 2u + 101u);
    CHECK(b->prepare(0, stage_image, OS_VEROFF + 2u + 101u) == 1);
    CHECK(b->discard(0) == 1);
    memcpy(stage_image, "MWRM\0\3\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0", 28);
    modwerk_runtime_ticks = 2;
    CHECK(b->prepare(0, stage_image, 28) == 1); /* an empty package removes: the loader's */
    CHECK(b->discard(0) == 1);

    /* Two slots, an update: written into B, A (confirmed, running) left alone. A verify that fails twice is
     * uncertain, leaves A to start and the unit up for another try, which finishes. */
    two_slot_unit(old);
    memcpy(two, modwerk_test_nor, NOR_LIMIT);
    CHECK(started_is(power_on(), old));
    modwerk_test_drop = 1;
    CHECK(offered() == 1 && b->publish(0) == MU_UNCERTAIN && modwerk_flash_refusal == FLASH_WRITE);
    CHECK(b->restore(0) == 1 && restarted() == 0);
    CHECK(started_is(power_on(), old)); /* switched off now: A still starts */
    modwerk_test_drop = 0;
    CHECK(offered() == 1 && b->publish(0) == MU_APPLIED && holds(SLOT_B + SLOT_RECORD, container, container_len));
    CHECK(holds(SLOT_A + SLOT_RECORD, old, container_len));
    CHECK(b->retire(0) == 1 && restarted() == 0 && modwerk_flash_refusal == FLASH_OK);
    CHECK(started_is(power_on(), container));

    /* The new base never confirms (it does not start): two starts, then the stub returns to A, and the base that
     * runs says so and confirms nothing. The next update goes into B again; A stays. */
    memcpy(modwerk_test_nor, two, NOR_LIMIT);
    CHECK(offered() == 1 && b->publish(0) == MU_APPLIED && b->retire(0) == 1 && restarted() == 0);
    for (unsigned i = 0; i < SLOT_TRIES; ++i) CHECK(power_on() == SLOT_B + SLOT_RECORD);
    CHECK(power_on() == SLOT_A + SLOT_RECORD && power_on() == SLOT_A + SLOT_RECORD);
    modwerk_test_popup = 0; ticks = 0; asked = 0; modwerk_flash_host = 1;
    for (unsigned t = 0; t < SLOTS_CONFIRM_TICKS; ++t) if (modwerk_flash_tick()) modwerk_flash_service();
    CHECK(modwerk_test_popup && !strcmp(modwerk_test_popup, "UPDATE UNDONE") && (modwerk_flash_slots[6] & 1u));
    slot_read(SLOT_B, s + 1); CHECK(!s[1].confirmed);
    CHECK(offered() == 1 && b->publish(0) == MU_APPLIED && holds(SLOT_A + SLOT_RECORD, old, container_len));
    CHECK(b->retire(0) == 1 && restarted() == 0 && power_on() == SLOT_B + SLOT_RECORD);

    /* A power cut at every NOR operation of an update: a whole base starts every time. Of a conversion: only a cut in
     * the stub's own sector (its erase and 32 pages) leaves nothing to start. */
    unsigned points = 0, bricks;
    bricks = sweep(two, &points);
    printf("update: %u NOR operations, a cut after any of them leaves %u units unable to start\n", points, bricks);
    CHECK(bricks == 0u && points > 2u);
    one_copy_unit(old);
    memcpy(two, modwerk_test_nor, NOR_LIMIT);
    bricks = sweep(two, &points);
    printf("conversion: %u NOR operations, %u cut points (all in the stub's sector) leave nothing to start\n", points, bricks);
    CHECK(bricks > 0u && bricks <= 1u + SLOT_STUB_BYTES / PAGE);
    CHECK(!modwerk_test_misuse);

    if (failures) fprintf(stderr, "%u failures\n", failures);
    return failures ? 1 : 0;
}
