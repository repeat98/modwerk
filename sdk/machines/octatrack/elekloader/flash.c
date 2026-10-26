/* SPDX-License-Identifier: GPL-3.0-or-later
 * Updating the base over USB (flash.c): a base writes its own container to NOR, with stock's OS UPGRADE
 * primitives, so the card is for the first install only. The host RAM-boots the new base first (boot.c), then
 * stages that base's plain ELEK container (the kit's .bin deciphered) with the running base, which refuses
 * anything but itself: the container must depack to an OS entry carrying NOR's bootstrap version, stock's
 * bootloader copy byte for byte and this base's own packed .run stream (run_unpack.s). A base that was never booted
 * on this unit can therefore never reach NOR. Neither is compared with the running RAM: stock rewrites bytes of its
 * bootloader copy and reuses the RAM the packed .run was loaded into once it has started (ot_emu, 23 October 2026;
 * every write on a unit was refused). The copy is checked against stock's digest, and the stream against the digest
 * .boot takes before stock's start (modwerk_flash_snapshot).
 *
 * Two slots (slots.h, docs/OCTATRACK_TWO_SLOT_BASE.md): the base is written only into the slot a power cut may lose,
 * never over the one the unit can start, and the boot stub at 0x4000 starts the newest whole slot, or the other
 * after an unconfirmed one failed to start three times. A unit with one copy at 0x4000 (the card's install) is
 * converted on its first update: the base it started from is copied to slot B and confirmed, then the stub's sector
 * is written (the one moment a power cut can still cost a startup-menu recovery, once per unit), then slot A.
 *
 * verify (prepare): the container's format and section sum, in the stage. commit (publish): the container copied
 * aside, depacked into the stage with a bounded decoder and checked; then OS UPGRADE's quiesce (boot.s) and the
 * write, with stock's sector erase, page program and upgrade screen; each slot's record page last, so a cut write
 * never counts. A write that fails its verify twice leaves the unit running for another try. Accept (retire) or any
 * rollback after a write restarts the unit, which boots NOR (boot.s, no mailbox). */
#include "flash.h"
#include "boot.h"
#include "runtime.h"
#include "slots.h"

#define OS_ENTRY 0x40000400u
#define OS_FIRST 0x4fefffe4u         /* the entry's `lea (-28,%sp),%sp` (boot.c) */
#define OS_VEROFF 0x000de648u        /* the bootstrap version word the image carries (boot.c) */
#define BOOTLOADER_FROM 0x400de1e0u  /* what the OS re-flashes the bootstrap from (check_flash_safety.py) */
#define BOOTLOADER_END 0x400e21e0u
#define NOR_FIRST 0x4000u            /* the container in NOR (elek.py FIRST) */
#define NOR_LIMIT 0x200000u          /* the OS window's end (elekloader devices: flash_limit) */
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
#include <setjmp.h>
uint8_t modwerk_test_nor[NOR_LIMIT];
const uint8_t *modwerk_test_running, *modwerk_test_run_load;
uint32_t modwerk_test_sectors[SECTORS], modwerk_test_flash_version = 0x0408u;
int modwerk_test_erases, modwerk_test_programs, modwerk_test_drop, modwerk_test_screens, modwerk_test_misuse;
uint8_t modwerk_test_bootloader_digest[MU_DIGEST_BYTES];
/* A power cut: after this many more NOR operations (0 never) the next one stops half done and control returns to
 * modwerk_test_power, as the unit would stop there. */
int modwerk_test_cut;
jmp_buf modwerk_test_power;
static uint32_t noise_state = 1;
static int noise(void) { noise_state = noise_state * 1103515245u + 12345u; return (int)(noise_state >> 16 & 1u); }
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
    if (modwerk_test_cut && !--modwerk_test_cut) { /* a cut erase: an unknown mix of erased and old bytes */
        for (uint32_t i = a; i < end; ++i) if (noise()) modwerk_test_nor[i] = 0xff;
        longjmp(modwerk_test_power, 1);
    }
    for (uint32_t i = a; i < end; ++i) modwerk_test_nor[i] = 0xff;
    ++modwerk_test_erases;
}
static void nor_program(uint32_t a, const uint8_t *src) /* NOR clears bits only: an unerased sector shows */
{
    if (a % PAGE || a < NOR_FIRST || a > NOR_LIMIT - PAGE) ++modwerk_test_misuse;
    for (unsigned i = 0; i < PAGE; ++i) if (modwerk_test_nor[a + i] != 0xff) ++modwerk_test_misuse; /* only over erased bytes */
    if (modwerk_test_cut && !--modwerk_test_cut) {
        for (unsigned i = 0; i < PAGE; ++i) if (noise()) modwerk_test_nor[a + i] &= src[i];
        longjmp(modwerk_test_power, 1);
    }
    for (unsigned i = 0; i < PAGE; ++i) modwerk_test_nor[a + i] &= src[i];
    if (modwerk_test_drop) modwerk_test_nor[a + 3u] = (uint8_t)(src[3] ^ 1u);
    ++modwerk_test_programs;
}
static int nor_word_program(uint32_t a, uint16_t v)
{
    if (a & 1u || a < NOR_FIRST || a >= NOR_LIMIT) ++modwerk_test_misuse;
    if (modwerk_test_cut && !--modwerk_test_cut) {
        if (noise()) modwerk_test_nor[a] &= (uint8_t)(v >> 8);
        longjmp(modwerk_test_power, 1);
    }
    modwerk_test_nor[a] &= (uint8_t)(v >> 8); modwerk_test_nor[a + 1u] &= (uint8_t)v;
    return nor_word(a) == v;
}
static void stock_screen(int step, uint32_t done, uint32_t total) { (void)step; (void)done; (void)total; ++modwerk_test_screens; }
const char *modwerk_test_popup;
static void popup(const char *text) { modwerk_test_popup = text; }
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
 * themselves, with interrupts masked only around the command bytes. The page program is used on erased pages only. */
static void nor_erase(uint32_t a) { ((void (*)(uint32_t))0x40020628u)(a); }
static void nor_program(uint32_t a, const uint8_t *src) { ((void (*)(uint32_t, const uint8_t *))0x400206f4u)(a, src); }
/* One word, as the bootloader's MIDI UPGRADE programs it (its unlock and command words), over bits already
 * programmed too, which a page program's completion poll may not survive; bounded, then back to reading. The
 * command writes are masked as stock masks them; the base runs from RAM, so reading NOR meanwhile is no hazard. */
static int nor_word_program(uint32_t a, uint16_t v)
{
    volatile uint16_t *cmd1 = (volatile uint16_t *)0xaaaau, *cmd2 = (volatile uint16_t *)0x5554u;
    uint32_t sr = modwerk_machine_mask();
    *cmd1 = 0xaaaau; *cmd2 = 0x5555u; *cmd1 = 0xa0a0u;
    *(volatile uint16_t *)(uintptr_t)a = v;
    modwerk_machine_unmask(sr);
    for (uint32_t n = 0; n < 1000000u; ++n) if (nor_word(a) == v) return 1;
    *cmd1 = 0xf0f0u; /* reset: reading again */
    return 0;
}
/* Stock's OS UPGRADE screen (1.40C 0x4007f9cc): step 0 PREPARING FLASH, 1 WRITING OS DATA, 3 VERIFYING OS DATA,
 * with its progress bar, drawn and sent to the LCD at once; stock calls it after the same quiesce. */
static void stock_screen(int step, uint32_t done, uint32_t total) { ((void (*)(int, uint32_t, uint32_t))0x4007f9ccu)(step, done, total); }
/* Stock's brief popup, as ep0.c says MODWERK CONNECTED. */
static void popup(const char *text) { ((void (*)(const char *, unsigned))0x4005a2b8u)(text, 0x60); }
#endif

static uint32_t rd32(const uint8_t *p) { return (uint32_t)p[0] << 24 | (uint32_t)p[1] << 16 | (uint32_t)p[2] << 8 | p[3]; }
static int refuse(enum flash_refusal why) { modwerk_flash_refusal = why; f_candidate = 0; return 0; }
/* A write's progress for the unit's screen: stock's own upgrade screen while quiesced; written while the OS runs on,
 * the base's box shows it (modwerk_flash_progress, status.c) instead, so the two never draw over each other. */
static int quiet;
volatile uint32_t modwerk_flash_progress; /* 0 none, else 1 + per mille done */
static void upgrade_screen(int step, uint32_t done, uint32_t total)
{
    if (quiet) stock_screen(step, done, total);
    else modwerk_flash_progress = 1u + (step == 3 ? 1000u : step == 1 ? 100u + 850u * done / total : 100u * done / total);
}
static const char *note; /* a popup the next tick shows (stock's popup from the sys task, as ep0.c's) */

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

/* The depacked container: 0 refused (named), 1 another base that keeps Elektron's bootloader safe (an OS entry with
 * NOR's bootstrap version and stock's bootloader copy), 2 this very base (its packed .run as .boot found it). */
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
    if (!run_bytes || at > size || run_bytes > size - at) return 1;
    mu_sha256(img + at, run_bytes, digest);
    return differ(digest, run_digest, MU_DIGEST_BYTES) ? 1 : 2;
}
static uint8_t nor8(uint32_t a) { return (uint8_t)(nor_word(a & ~1u) >> (a & 1u ? 0 : 8)); }
static uint32_t nor32(uint32_t a) { return (uint32_t)nor_word(a) << 16 | nor_word(a + 2u); }
/* NOR at `at` holds n bytes (even) of RAM at `ram`, or of NOR at `from` when ram is 0. */
static int nor_holds(uint32_t at, const uint8_t *ram, uint32_t from, uint32_t n)
{
    for (uint32_t i = 0; i < n; i += 2u)
        if (nor_word(at + i) != (ram ? (uint16_t)(ram[i] << 8 | ram[i + 1u]) : nor_word(from + i))) return 0;
    return 1;
}
/* Only the starts of stock's own sector table, and never Elektron's bootloader below the stub. */
static int erase_at(uint32_t a)
{
    if (a < SLOT_STUB || a >= NOR_LIMIT) return 0;
    for (unsigned k = 0; k < SECTORS; ++k) if (SECTOR[k] == a) { nor_erase(a); return 1; }
    return 0;
}
static uint32_t slot_base(int k) { return k ? SLOT_B : SLOT_A; }

/* One slot: its first sector (the record page) erased first, so it stops counting at once; the container's pages,
 * checked; the record page last. From RAM, or from NOR (the old base's copy, read a page at a time). */
static int write_slot(uint32_t base, const uint8_t *ram, uint32_t from, uint32_t len, uint32_t generation,
                      const uint8_t *identity, int confirmed)
{
    uint8_t page[PAGE];
    uint32_t sectors = (SLOT_RECORD + len + SLOT_SECTOR - 1u) / SLOT_SECTOR, chunks = len / 0x4000u + 1u;
    if (len > SLOT_CONTAINER_MAX || len % 4u) return 0;
    for (int attempt = 0; attempt < 2; ++attempt) {
        for (uint32_t k = 0; k < sectors; ++k) { upgrade_screen(0, k, sectors); if (!erase_at(base + k * SLOT_SECTOR)) return 0; }
        for (uint32_t off = 0; off < len; off += PAGE) {
            if (!(off % 0x4000u)) upgrade_screen(1, off / 0x4000u, chunks);
            if (!ram) for (unsigned i = 0; i < PAGE; ++i) page[i] = nor8(from + off + i);
            nor_program(base + SLOT_RECORD + off, ram ? ram + off : page);
        }
        upgrade_screen(3, 0, 2u);
        if (!nor_holds(base + SLOT_RECORD, ram, from, len)) continue;
        slot_record(page, generation, len, identity, confirmed);
        nor_program(base, page);
        upgrade_screen(3, 2u, 2u);
        struct slot_state s;
        slot_read(base, &s);
        if (s.whole && s.generation == generation && s.length == len) return 1;
    }
    return 0;
}

/* Byte i (SECT and on) of the stub's sector. The base keeps only what is not 0xff (stub_body.c, build_stub.py): the
 * trampoline's section and the mark, and the code, so its RAM costs about a kilobyte, not the sector's 8. */
#ifdef MODWERK_HOST
uint8_t modwerk_test_stub[SLOT_STUB_BYTES - SECT];
static uint8_t stub_byte(uint32_t i) { return modwerk_test_stub[i - SECT]; }
#else
extern const uint8_t modwerk_stub_head[STUB_CODE - SECT], modwerk_stub_code[];
extern const uint32_t modwerk_stub_code_bytes;
static uint8_t stub_byte(uint32_t i)
{
    return i < STUB_CODE ? modwerk_stub_head[i - SECT] : i - STUB_CODE < modwerk_stub_code_bytes ? modwerk_stub_code[i - STUB_CODE] : 0xffu;
}
#endif
/* NOR's stub sector holds a whole stub (slots.c), whichever base wrote it. */
static int stub_ours(void) { return slot_stub_whole(); }
/* The stub's sector: the header of the container being written (the version the OS shows: 0x4004-0x4012), then
 * the stub. Its erase is the one window in which a cut leaves Elektron's bootloader nothing to start. */
static int write_stub(void)
{
    uint8_t page[PAGE];
    for (int attempt = 0; attempt < 2; ++attempt) {
        upgrade_screen(0, 0, 1u);
        if (!erase_at(SLOT_STUB)) return 0;
        for (uint32_t off = 0; off < SLOT_STUB_BYTES; off += PAGE) {
            for (unsigned i = 0; i < PAGE; ++i) page[i] = off + i < SECT ? packed[off + i] : stub_byte(off + i);
            nor_program(SLOT_STUB + off, page);
        }
        int same = nor_holds(SLOT_STUB, packed, 0, SECT);
        for (uint32_t i = SECT; same && i < SLOT_STUB_BYTES; ++i) same = nor8(SLOT_STUB + i) == stub_byte(i);
        if (same && stub_ours()) return 1;
    }
    return 0;
}
/* A unit with one copy: a whole container at 0x4000, a real OS (far longer than a stub) that ends below slot B;
 * its length to copy, in words. 0 otherwise. */
static uint32_t one_copy(void)
{
    if (nor32(NOR_FIRST) != 0x454c454bu) return 0; /* "ELEK" */
    uint32_t len = nor32(NOR_FIRST + SECT), sum = 0;
    if (len < SLOT_STUB_BYTES || len > SLOT_CONTAINER_MAX - SECT - 8u - 3u) return 0;
    for (uint32_t i = 0; i < len; ++i) sum += nor8(NOR_FIRST + SECT + 8u + i);
    return sum == nor32(NOR_FIRST + SECT + 4u) ? (SECT + 8u + len + 3u) & ~3u : 0;
}
static void read_slots(struct slot_state *s) { slot_read(SLOT_A, s); slot_read(SLOT_B, s + 1); }
static uint32_t next_generation(const struct slot_state *s)
{
    uint32_t g = 0;
    for (int k = 0; k < 2; ++k) if (s[k].whole && s[k].generation > g) g = s[k].generation;
    return g + 1u;
}
extern const uint8_t modwerk_base_digest[MU_DIGEST_BYTES];
/* Converting: the base the unit started from NOR, copied to slot B and confirmed (the fallback for this very first
 * update), then the stub's sector, then this base into slot A. `old` 0: slot B already holds the copy (a conversion
 * that stopped after it, with the unit still up). */
static int convert(uint32_t old)
{
    struct slot_state s[2];
    if (old && !write_slot(SLOT_B, 0, NOR_FIRST, old, 1u, 0, 1)) return 0;
    if (!write_stub()) return 0;
    read_slots(s);
    return write_slot(SLOT_A, packed, 0, f_length, next_generation(s), modwerk_base_digest, 0);
}
/* Two slots: nothing to write when the slot the stub starts next already holds this container (a repeat after a
 * lost reply); otherwise into the slot slot_keep leaves alone, as the newest. The record names this base when it
 * writes itself; another base's (the one-restart update, owner 25 October 2026) it cannot name: zeros. */
static int update(int mine)
{
    struct slot_state s[2];
    int mark, next;
    read_slots(s);
    next = slot_pick(s, &mark);
    if (next >= 0 && s[next].length == f_length && nor_holds(slot_base(next) + SLOT_RECORD, packed, 0, f_length)) return 1;
    return write_slot(slot_base(!slot_keep(s)), packed, 0, f_length, next_generation(s), mine ? modwerk_base_digest : 0, 0);
}

/* A record that names its base (written by the base itself), not zeros (another base wrote it). */
static int named(const struct slot_state *s)
{
    for (unsigned i = 0; i < MU_DIGEST_BYTES; ++i) if (s->identity[i]) return 1;
    return 0;
}
/* The slot the stub started this time, from the records alone: the newest when confirmed or one of its tries used,
 * the other after its tries ran out or before its first start (just written), -1 when neither tells. */
static int running(const struct slot_state *s)
{
    int n = slot_newest(s);
    if (n < 0 || s[n].confirmed || (s[n].tries >= 1u && s[n].tries <= SLOT_TRIES)) return n;
    return s[!n].whole ? !n : -1;
}
/* SLOTS (ep0.c): refreshed by the engine, read by the interrupt. */
volatile uint8_t modwerk_flash_slots[FLASH_SLOTS_BYTES];
static int slots_note; /* the popup after a start: 1 a new base started, 2 the stub went back to the previous one */
/* The newest slot names its base (it wrote itself after it had run from RAM and talked over USB in the trial): a
 * healthy run from it is enough to keep it, without a computer this time. Another base's needs one. */
static int newest_named;
static void slots_refresh(void)
{
    struct slot_state s[2];
    uint8_t r[FLASH_SLOTS_BYTES] = {'M', 'W', 'S', 'S', 2, 0xff};
    int two = stub_ours(), n = -1;
    if (two) read_slots(s);
    else if (one_copy()) r[4] = 0;
    if (two) {
        r[4] = 1;
        n = slot_newest(s);
        int run = running(s);
        if (run >= 0 && (!named(&s[run]) || !differ(s[run].identity, modwerk_base_digest, MU_DIGEST_BYTES))) r[5] = (uint8_t)run;
        for (int k = 0; k < 2; ++k) {
            uint8_t *at = r + 8 + 8 * k;
            at[0] = (uint8_t)(s[k].generation >> 24); at[1] = (uint8_t)(s[k].generation >> 16);
            at[2] = (uint8_t)(s[k].generation >> 8); at[3] = (uint8_t)s[k].generation;
            at[4] = (uint8_t)(s[k].whole | s[k].confirmed << 1); at[5] = (uint8_t)s[k].tries;
        }
        if (n >= 0 && !s[n].confirmed && s[n].tries > SLOT_TRIES) r[6] |= 1u; /* the stub started the other one */
        if (r[5] != 0xff && s[r[5]].confirmed) r[6] |= 2u;
        newest_named = n >= 0 && named(&s[n]);
        if (r[6] & 1u) slots_note = 2;
        else if (n >= 0 && r[5] == n && !s[n].confirmed && s[n].tries == 1u) slots_note = 1;
    }
    for (unsigned i = 0; i < FLASH_SLOTS_BYTES; ++i) modwerk_flash_slots[i] = r[i];
}
/* Confirm the newest slot once its base has run healthy from it for 15 s: the stub started it (a try used) and its
 * tries are not spent, and it is this base when its record names one. Another base's slot (unnamed) also waits for
 * a computer's USB contact since the start, so a base that starts but has lost USB is never kept (owner, 25 October
 * 2026); a named one talked over USB in its trial. Never a slot this base has only just written (no try used yet). */
static int confirm(void)
{
    struct slot_state s[2];
    if (!stub_ours()) return 0;
    read_slots(s);
    int n = slot_newest(s);
    if (n < 0 || s[n].confirmed || s[n].tries < 1u || s[n].tries > SLOT_TRIES ||
        (named(&s[n]) && differ(s[n].identity, modwerk_base_digest, MU_DIGEST_BYTES))) return 0;
    return nor_word_program(slot_base(n) + REC_CONFIRMED, 0);
}
#define SLOTS_LOOK_TICKS 60u      /* 1 s after start (60 Hz): the first look at the slots */
#define SLOTS_NOTE_TICKS 300u     /* 5 s: the popup, after the startup */
#define SLOTS_CONFIRM_TICKS 900u  /* 15 s up and running: healthy enough to keep, once a computer has talked to it */
static uint32_t ticks;
static volatile int due_look, due_confirm, busy, asked;
volatile int modwerk_flash_host;
int modwerk_flash_tick(void)
{
    if (ticks < 0xffffffffu) ++ticks;
    if (ticks == SLOTS_LOOK_TICKS) return due_look = 1;
    if (ticks == SLOTS_NOTE_TICKS && slots_note)
        popup(slots_note == 1 ? "BASE UPDATED" : "UPDATE UNDONE");
    if (note && !busy) { popup(note); note = 0; modwerk_flash_progress = 0; }
    if (!asked && ticks >= SLOTS_CONFIRM_TICKS && (modwerk_flash_host || newest_named)) return asked = due_confirm = 1;
    return 0;
}
void modwerk_flash_service(void)
{
    if (busy) return; /* a write in progress (f_publish) refreshes when it ends */
    if (due_look) { due_look = 0; slots_refresh(); }
    if (due_confirm) { due_confirm = 0; if (confirm()) slots_refresh(); }
}

static enum mu_publication f_publish(void *u)
{
    if (!f_candidate) return modwerk_boot_backend.publish(u);
    f_candidate = 0;
    copy(packed, modwerk_boot_staging(), f_length);
    for (uint32_t i = 0; i < PAGE; ++i) packed[f_length + i] = 0; /* the last page's slack */
    int base = same_base(), two = stub_ours();
    if (!base) return MU_UNCHANGED;
    /* Another base goes only into a spare slot: converting a unit with one copy, a base writes only itself, after it
     * started on the unit from RAM (the trial). */
    if (base != 2 && !two) { refuse(FLASH_OTHER_BASE); return MU_UNCHANGED; }
    struct slot_state b;
    uint32_t old = 0;
    if (!two && !(old = one_copy())) { /* neither layout: only a conversion that stopped after slot B continues */
        slot_read(SLOT_B, &b);
        if (!b.whole || !b.confirmed) { refuse(FLASH_LAYOUT); return MU_UNCHANGED; }
    }
    /* At most one restart per update (owner, 25 October 2026). Another base's: stock's quiesce and screen, the write,
     * then the restart onto it. This base's own, from RAM after the trial (the update's restart): written while it
     * runs on, as stock's routines need no quiesce (they mask only their command writes, and the OS runs from RAM);
     * the next start is from the new slot. */
    int restart = base != 2;
    f_owned = 1; busy = 1; quiet = restart;
    if (restart) modwerk_boot_quiesce();
    int ok = two ? update(base == 2) : convert(old);
    slots_refresh(); busy = 0;
    if (!ok) { modwerk_flash_refusal = FLASH_WRITE; return MU_UNCERTAIN; }
    f_flashed = restart;
    if (!restart) note = "BASE SAVED";
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
