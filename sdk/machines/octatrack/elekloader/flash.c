/* SPDX-License-Identifier: GPL-3.0-or-later
 * Updating the base over USB (flash.c): a base writes its own container
 * to NOR, with stock's OS UPGRADE primitives, so the card is for the first
 * install only. The host RAM-boots the new base first (boot.c), then stages
 * that base's plain ELEK container (the kit's .bin deciphered) with the
 * running base, which refuses anything but itself: the container must
 * depack to an OS entry carrying NOR's bootstrap version, stock's bootloader
 * copy byte for byte and this base's own packed .run stream (run_unpack.s).
 * A base that was never booted on this unit can therefore never reach NOR.
 * Neither is compared with the running RAM: stock rewrites bytes of its
 * bootloader copy and reuses the RAM the packed .run was loaded into once it
 * has started (ot_emu, 23 October 2026; every write on a unit was refused).
 * The copy is checked against stock's digest, and the stream against the
 * digest .boot takes before stock's start (modwerk_flash_snapshot).
 *
 * verify (prepare): the container's format and section sum, in the stage.
 * commit (publish): the container copied aside, depacked into the stage
 * with a bounded decoder and checked; then OS UPGRADE's quiesce (boot.s),
 * the sectors erased, the pages programmed and NOR verified, with stock's
 * routines and sector table (0x40080074's loop: 0x4007fb84 in 1.40C). A
 * container NOR already holds writes nothing. A verify that fails after a
 * second write leaves the unit running, so the host can try again: only a
 * power-off then needs the Startup Menu. Accept (retire) or any rollback
 * after a write restarts the unit, which boots NOR (boot.s, no mailbox).
 * The window a power cut can hit is the write itself, as with the card. */
#include "flash.h"
#include "boot.h"
#include "runtime.h"

#define OS_ENTRY 0x40000400u
#define OS_FIRST 0x4fefffe4u         /* the entry's `lea (-28,%sp),%sp` (boot.c) */
#define OS_VEROFF 0x000de648u        /* the bootstrap version word the image carries (boot.c) */
#define BOOTLOADER_FROM 0x400de1e0u  /* what the OS re-flashes the bootstrap from (check_flash_safety.py) */
#define BOOTLOADER_END 0x400e21e0u
#define NOR_FIRST 0x4000u            /* the container in NOR (elek.py FIRST) */
#define NOR_LIMIT 0x200000u          /* the OS window's end (elekloader devices: flash_limit) */
#define SECT 0x12u                   /* the section's [f_length][sum] header in the container (elek.py SECT) */
#define PAGE 256u                    /* stock programs 256 bytes a call */
#define SECTORS 37u                  /* stock's table of sector starts, 0x4000 to 0x1f0000 */

volatile uint32_t modwerk_flash_refusal;
/* No libc in the base: its own byte loops, as upload.c and loader.c keep. */
static void copy(uint8_t *d, const uint8_t *s, uint32_t n) { while (n--) *d++ = *s++; }
static int differ(const uint8_t *a, const uint8_t *b, uint32_t n) { while (n--) if (*a++ != *b++) return 1; return 0; }
static uint8_t packed[FLASH_CONTAINER_BYTES] __attribute__((aligned(16)));
static uint32_t f_length;
static int f_candidate, f_owned, f_flashed;

void modwerk_modset_candidate(const uint8_t *package, uint32_t bytes); /* modset.c */
void modwerk_boot_quiesce(void);                                       /* boot.s */

#ifdef MODWERK_HOST
uint8_t modwerk_test_nor[NOR_LIMIT];
const uint8_t *modwerk_test_running, *modwerk_test_run_load;
uint32_t modwerk_test_sectors[SECTORS], modwerk_test_flash_version = 0x0408u;
int modwerk_test_erases, modwerk_test_programs, modwerk_test_drop;
uint8_t modwerk_test_bootloader_digest[MU_DIGEST_BYTES];
#define BOOTLOADER_DIGEST modwerk_test_bootloader_digest
#define RUNNING(a) (modwerk_test_running + ((a) - OS_ENTRY))
#define RUN_LOAD modwerk_test_run_load
#define SECTOR modwerk_test_sectors
static uint32_t flash_nor_version(void) { return modwerk_test_flash_version; }
static uint16_t nor_word(uint32_t a) { return (uint16_t)(modwerk_test_nor[a] << 8 | modwerk_test_nor[a + 1u]); }
static void nor_erase(uint32_t a)
{
    uint32_t end = NOR_LIMIT;
    for (unsigned k = 0; k < SECTORS; ++k) if (SECTOR[k] > a && SECTOR[k] < end) end = SECTOR[k];
    for (uint32_t i = a; i < end; ++i) modwerk_test_nor[i] = 0xff;
    ++modwerk_test_erases;
}
static void nor_program(uint32_t a, const uint8_t *src) /* NOR clears bits only: an unerased sector shows */
{
    for (unsigned i = 0; i < PAGE; ++i) modwerk_test_nor[a + i] &= src[i];
    if (modwerk_test_drop) modwerk_test_nor[a + 3u] = (uint8_t)(src[3] ^ 1u);
    ++modwerk_test_programs;
}
#else
extern const uint8_t __run_load[];   /* the packed .run inside this image (run_unpack.s) */
#define RUNNING(a) ((const uint8_t *)(uintptr_t)(a))
#define RUN_LOAD __run_load
#define SECTOR ((const uint32_t *)0x400a95c0u)
/* SHA-256 of stock 1.40C's bootloader copy, BOOTLOADER_FROM to BOOTLOADER_END, which check_flash_safety.py proves
 * every base carries unchanged. The running copy is no reference: stock writes 0x400e201e-0x400e2108 at run time. */
static const uint8_t BOOTLOADER_DIGEST[MU_DIGEST_BYTES] = {
    0x10,0x95,0x94,0xe7,0x98,0x15,0x4a,0x80,0x3a,0x4b,0xad,0x21,0xc8,0x76,0x56,0x58,
    0x89,0x5d,0x64,0x44,0x24,0xeb,0x94,0x2c,0xf5,0x8f,0x69,0xea,0x18,0x25,0xd6,0xd7};
static uint32_t flash_nor_version(void) { return *(volatile uint16_t *)0x3ffcu; }
static uint16_t nor_word(uint32_t a) { return *(volatile uint16_t *)(uintptr_t)a; }
/* Stock's sector erase and 256-byte page program (1.40C): both unlock, command and poll the chip
 * themselves, with interrupts masked only around the command bytes. */
static void nor_erase(uint32_t a) { ((void (*)(uint32_t))0x40020628u)(a); }
static void nor_program(uint32_t a, const uint8_t *src) { ((void (*)(uint32_t, const uint8_t *))0x400206f4u)(a, src); }
#endif

static uint32_t rd32(const uint8_t *p) { return (uint32_t)p[0] << 24 | (uint32_t)p[1] << 16 | (uint32_t)p[2] << 8 | p[3]; }
static int refuse(enum flash_refusal why) { modwerk_flash_refusal = why; f_candidate = 0; return 0; }

/* The packed .run as MAIN loaded it: its digest and length with its header, 0 until .boot took them. */
static uint8_t run_digest[MU_DIGEST_BYTES];
static uint32_t run_bytes;
/* .boot calls this right after .run is unpacked and .bss cleared (build_core.py BOOT_FLASH_SNAPSHOT), while the
 * stream still lies where the image put it: stock's start reuses that RAM. */
void modwerk_flash_snapshot(void)
{
    uint32_t n = rd32(RUN_LOAD);
    run_bytes = 0;
    if (n > BOOT_IMAGE_BYTES - 8u) return;
    mu_sha256(RUN_LOAD, n + 8u, run_digest);
    run_bytes = n + 8u;
}

/* The kit's section stream (codec/elz.py, run_unpack.s's format), bounded both ways. */
struct bits { const uint8_t *p, *end; unsigned tag; int err; };
static unsigned bit(struct bits *s)
{
    s->tag = (s->tag << 1) & 0x1ffu;
    if (!(s->tag & 0xffu)) {
        if (s->p >= s->end) { s->err = 1; return 0; }
        unsigned b = *s->p++;
        s->tag = (b << 1) | 1u;
        return b >> 7;
    }
    return (s->tag >> 8) & 1u;
}
static uint32_t gamma(struct bits *s)
{
    uint32_t v = 1;
    for (;;) {
        v = (v << 1) | bit(s);
        if (bit(s)) return v;
        if (v > 0x02000000u || s->err) { s->err = 1; return 0; }
    }
}
long modwerk_flash_depack(const uint8_t *in, uint32_t in_len, uint8_t *out, uint32_t out_max)
{
    struct bits s = { in, in + in_len, 0, 0 };
    uint32_t n = 0, last = 1;
    for (;;) {
        if (bit(&s)) {
            if (s.err || s.p >= s.end || n >= out_max) return -1;
            out[n++] = *s.p++;
            continue;
        }
        uint32_t g = gamma(&s), off, len;
        if (s.err) return -1;
        if (g == 2u) off = last;
        else {
            if (s.p >= s.end) return -1;
            uint32_t raw = (g << 8) + *s.p++;
            if (raw == 767u) return s.p == s.end ? (long)n : -1;
            off = raw - 767u; last = off;
        }
        len = bit(&s) * 2u; len += bit(&s);
        if (!len) len = gamma(&s) + 2u;
        if (s.err) return -1;
        if (off > 3328u) ++len;
        if (!off || off > n || len >= out_max - n) return -1;
        for (uint32_t i = 0; i <= len; ++i) { out[n] = out[n - off]; ++n; }
    }
}

/* The container's format: in the stage, as the host staged it. */
static int f_prepare(void *u, const uint8_t *d, uint32_t n)
{
    f_candidate = f_flashed = f_owned = 0;
    if (n < 4u || differ(d, (const uint8_t *)"ELEK", 4)) return modwerk_boot_backend.prepare(u, d, n);
    modwerk_modset_candidate(0, 0); /* not a set change */
    if (d != modwerk_boot_staging() || n % 4u || n > FLASH_CONTAINER_BYTES - PAGE || n > NOR_LIMIT - NOR_FIRST || n < SECT + 8u)
        return refuse(FLASH_FORMAT);
    uint32_t len = rd32(d + SECT), sum = 0;
    if (len > n - SECT - 8u) return refuse(FLASH_FORMAT);
    for (uint32_t i = 0; i < len; ++i) sum += d[SECT + 8u + i];
    if (sum != rd32(d + SECT + 4u)) return refuse(FLASH_FORMAT);
    f_length = n; f_candidate = 1; modwerk_flash_refusal = FLASH_OK;
    return 1;
}
static int f_discard(void *u) { f_candidate = f_owned = 0; return modwerk_boot_backend.discard(u); }

/* The depacked container is this base, and nothing else. */
static int same_base(void)
{
    uint8_t *img = modwerk_boot_staging();
    long out = modwerk_flash_depack(packed + SECT + 8u, rd32(packed + SECT), img, BOOT_IMAGE_BYTES);
    if (out < 0) return refuse(FLASH_DEPACK);
    uint32_t size = (uint32_t)out;
    if (size < OS_VEROFF + 2u || rd32(img) != OS_FIRST) return refuse(FLASH_ENTRY);
    if (((uint32_t)img[OS_VEROFF] << 8 | img[OS_VEROFF + 1u]) != flash_nor_version()) return refuse(FLASH_BOOTSTRAP);
    uint8_t digest[MU_DIGEST_BYTES];
    if (size < BOOTLOADER_END - OS_ENTRY) return refuse(FLASH_PROTECTED);
    mu_sha256(img + (BOOTLOADER_FROM - OS_ENTRY), BOOTLOADER_END - BOOTLOADER_FROM, digest);
    if (differ(digest, BOOTLOADER_DIGEST, MU_DIGEST_BYTES)) return refuse(FLASH_PROTECTED);
    uint32_t at = (uint32_t)(RUN_LOAD - RUNNING(OS_ENTRY));
    if (!run_bytes || at > size || run_bytes > size - at) return refuse(FLASH_OTHER_BASE);
    mu_sha256(img + at, run_bytes, digest);
    if (differ(digest, run_digest, MU_DIGEST_BYTES)) return refuse(FLASH_OTHER_BASE);
    return 1;
}
static int same_as_nor(void)
{
    for (uint32_t i = 0; i < f_length; i += 2u)
        if (nor_word(NOR_FIRST + i) != (uint16_t)(packed[i] << 8 | packed[i + 1u])) return 0;
    return 1;
}
static void write_nor(void)
{
    uint32_t end = NOR_FIRST + f_length;
    for (unsigned k = 0; k < SECTORS && SECTOR[k] <= end; ++k) nor_erase(SECTOR[k]); /* stock's count: a sector starting at the end too */
    for (uint32_t off = 0; off < f_length; off += PAGE) nor_program(NOR_FIRST + off, packed + off);
}
static enum mu_publication f_publish(void *u)
{
    if (!f_candidate) return modwerk_boot_backend.publish(u);
    f_candidate = 0;
    copy(packed, modwerk_boot_staging(), f_length);
    for (uint32_t i = 0; i < PAGE; ++i) packed[f_length + i] = 0; /* the last page's slack */
    if (!same_base()) return MU_UNCHANGED;
    f_owned = 1;
    modwerk_boot_quiesce();
    if (!same_as_nor()) {
        write_nor();
        if (!same_as_nor()) write_nor();
        if (!same_as_nor()) { modwerk_flash_refusal = FLASH_WRITE; return MU_UNCERTAIN; }
    }
    f_flashed = 1;
    return MU_APPLIED;
}
/* After a write the unit restarts on NOR whichever way the transaction ends; a failed write stays up for a retry. */
static int f_restore(void *u)
{
    if (!f_owned) return modwerk_boot_backend.restore(u);
    if (f_flashed) modwerk_boot_restart();
    f_owned = f_flashed = 0;
    return 1;
}
static int f_retire(void *u)
{
    if (!f_owned) return modwerk_boot_backend.retire(u);
    if (f_flashed) modwerk_boot_restart();
    f_owned = f_flashed = 0;
    return 1;
}
static int f_enter(void *u) { return modwerk_boot_backend.enter(u); }
static int f_safe(void *u) { return modwerk_boot_backend.safe(u); }
static int f_leave(void *u) { return modwerk_boot_backend.leave(u); }
const struct mu_backend modwerk_flash_backend = {0, f_enter, f_safe, f_leave, f_prepare, f_discard, f_publish, f_restore, f_retire};
