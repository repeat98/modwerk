/* SPDX-License-Identifier: GPL-3.0-or-later
 * Host check of store.c: a new start gives every module NEW; changed blocks reach battery RAM once a second; the
 * writer puts every block out as '#MWS='/'#MWD='/'#MWE=' lines; a load of those lines gives each module its block
 * (LOADED), keeps a module that is not installed and drops a damaged or incomplete entry; a failed load changes
 * nothing; a reinstall or a power cycle gives the kept block back (RESTORED); a block at a new size replaces its old
 * one; a block that finds no room is counted, not kept. */
#define MODWERK_HOST
#include <stdio.h>
#include <string.h>
#include "store.c"

static unsigned failures;
#define CHECK(x) do { if (!(x)) { failures++; fprintf(stderr, "%s:%d: %s\n", __FILE__, __LINE__, #x); } } while (0)

static uint8_t a_block[40], b_block[20], big_block[4][4096];
static unsigned a_how = 9, b_how = 9, a_version, a_bytes, a_calls, b_calls;
static void a_loaded(unsigned how, unsigned version, unsigned bytes) { a_how = how, a_version = version, a_bytes = bytes, ++a_calls; }
static void b_loaded(unsigned how, unsigned version, unsigned bytes) { b_how = how, (void)version, (void)bytes, ++b_calls; }
static struct modwerk_store rec_a = {MODWERK_STORE_ABI, a_block, sizeof a_block, 2, a_loaded};
static struct modwerk_store rec_b = {MODWERK_STORE_ABI, b_block, sizeof b_block, 1, b_loaded};
static struct modwerk_store rec_big[4];
uint32_t modwerk_test_owner(const void *r)
{
    if (r == &rec_a) return 0xaaaa0001u;
    if (r == &rec_b) return 0xbbbb0002u;
    for (unsigned k = 0; k < 4; ++k) if (r == &rec_big[k]) return 0xcccc0000u + k;
    return 0;
}

/* The writer's output, and the loader feeding it back line by line (NUL-ended, without CR LF). */
static char file[16384];
static unsigned file_n;
static int capture(uint32_t f, const void *data, unsigned n) { (void)f; if (file_n + n < sizeof file) memcpy(file + file_n, data, n), file_n += n; return (int)n; }
static void save(void) { file_n = 0; modwerk_store_write(7); file[file_n] = 0; }
static void load(const char *text, int32_t result)
{
    modwerk_store_begin(0); /* the parse-only pass stages nothing */
    modwerk_store_begin(1);
    char line[128];
    for (const char *p = text; *p; ) {
        unsigned n = 0;
        while (p[n] && p[n] != '\r' && p[n] != '\n') ++n;
        if (n < sizeof line) { memcpy(line, p, n); line[n] = 0; modwerk_store_line(line); }
        p += n;
        while (*p == '\r' || *p == '\n') ++p;
    }
    modwerk_store_loaded(result);
}
static void ticks(unsigned n) { while (n--) modwerk_store_tick(); }
static unsigned count(const char *text, const char *what) { unsigned n = 0; for (const char *p = text; (p = strstr(p, what)); ++p) ++n; return n; }

int main(void)
{
    modwerk_test_write = capture;
    memset(&modwerk_test_battery, 0xa5, sizeof modwerk_test_battery); /* battery RAM before the first start */
    modwerk_test_rows[0] = &rec_a, modwerk_test_rows[1] = &rec_b;

    /* The first start: nothing kept, so each module puts its defaults in. */
    ticks(1);
    CHECK(BAT->magic == MAGIC && BAT->used == 0u && a_how == MODWERK_STORE_NEW && b_how == MODWERK_STORE_NEW && a_calls == 1u);
    ticks(5);
    CHECK(a_calls == 1u); /* a record seen before is left alone */

    /* Edits reach battery RAM within a second. */
    for (unsigned i = 0; i < sizeof a_block; ++i) a_block[i] = (uint8_t)(i * 7u);
    memset(b_block, 0x42, sizeof b_block);
    ticks(60);
    CHECK(find(BAT, 0xaaaa0001u) != NONE && find(BAT, 0xbbbb0002u) != NONE);

    /* The writer: a block's S line, a D line per 16 bytes, its E line; at most 53 characters each. */
    a_block[0] = 99; /* changed after the last copy: the writer takes the block as it is now */
    save();
    CHECK(count(file, "#MWS=aaaa0001:0002:0028\r\n") == 1u && count(file, "#MWD=aaaa0001:") == 3u && count(file, "#MWE=aaaa0001:") == 1u);
    CHECK(count(file, "#MWD=aaaa0001:0000:6307") == 1u && count(file, "#MWD=bbbb0002:") == 2u);
    for (const char *p = file, *e; (e = strstr(p, "\r\n")); p = e + 2) CHECK(e - p + 2 <= 53);
    char saved[16384];
    memcpy(saved, file, file_n + 1u);

    /* A load: the project's blocks go in (LOADED), a module not installed is kept, broken entries are dropped. */
    char project[20000];
    snprintf(project, sizeof project, "%s%s", saved,
             "#MWS=dddd0004:0001:0003\r\n#MWD=dddd0004:0000:010203\r\n#MWE=dddd0004:%s\r\n"   /* not installed: kept */
             "#MWS=eeee0005:0001:0002\r\n#MWD=eeee0005:0000:0102\r\n#MWE=eeee0005:00000000\r\n" /* wrong sum */
             "#MWS=ffff0006:0001:0004\r\n#MWD=ffff0006:0000:0102\r\n#MWE=ffff0006:00000000\r\n" /* short */
             "#MWS=ffff0007:0001:0002\r\n#MWD=ffff0007:0001:0102\r\n");                          /* out of order, no end */
    uint8_t d_bytes[3] = {1, 2, 3};
    char sum[9];
    snprintf(sum, sizeof sum, "%08x", sum_of(d_bytes, 3));
    char *at = strstr(project, "%s");
    memmove(at + 8, at + 2, strlen(at + 2) + 1u); memcpy(at, sum, 8);
    memset(a_block, 0, sizeof a_block), memset(b_block, 0, sizeof b_block);
    load(project, 0);
    CHECK(a_calls == 1u); /* nothing reaches a module before the tick */
    ticks(1);
    CHECK(a_how == MODWERK_STORE_LOADED && a_version == 2u && a_bytes == 40u && a_block[0] == 99 && a_block[39] == (uint8_t)(39u * 7u));
    CHECK(b_how == MODWERK_STORE_LOADED && b_block[19] == 0x42);
    CHECK(find(BAT, 0xdddd0004u) != NONE && find(BAT, 0xeeee0005u) == NONE && find(BAT, 0xffff0006u) == NONE && find(BAT, 0xffff0007u) == NONE);
    save();
    CHECK(count(file, "#MWS=dddd0004:0001:0003\r\n#MWD=dddd0004:0000:010203\r\n") == 1u); /* written back as read */

    /* A project without store lines: every installed module gets NEW, and nothing of the last project is kept. */
    load("PATTERN_CHANGE_AUTO_SILENCE_TRACKS=0\r\n", 0);
    ticks(1);
    CHECK(a_how == MODWERK_STORE_NEW && b_how == MODWERK_STORE_NEW && BAT->used == 0u);

    /* A failed load keeps the project that is still there. */
    load(saved, 0); ticks(1);
    unsigned calls = a_calls;
    load("#MWS=aaaa0001:0002:0028\r\n", -1);
    ticks(1);
    CHECK(a_calls == calls && find(BAT, 0xaaaa0001u) != NONE);

    /* B removed: its block stays and is written; reinstalled, it gets it back (RESTORED). */
    modwerk_test_rows[1] = 0;
    ticks(1);
    save();
    CHECK(count(file, "#MWS=bbbb0002:") == 1u);
    memset(b_block, 0, sizeof b_block);
    modwerk_test_rows[1] = &rec_b;
    ticks(1);
    CHECK(b_how == MODWERK_STORE_RESTORED && b_block[0] == 0x42);

    /* A power cycle: the modules come back with what battery RAM kept. */
    seen_n = 0, memset(a_block, 0, sizeof a_block);
    ticks(1);
    CHECK(a_how == MODWERK_STORE_RESTORED && a_block[0] == 99);

    /* A new version at another size: the old block is dropped, the new one appended. */
    uint32_t used = BAT->used;
    rec_a.bytes = 32, rec_a.version = 3;
    ticks(60);
    CHECK(BAT->used == used + HEAD + 32u && u16(BAT->data + find(BAT, 0xaaaa0001u) + 4u) == 32u);

    /* No room: counted, not kept, and nothing else lost. */
    for (unsigned k = 0; k < 4; ++k) {
        rec_big[k] = (struct modwerk_store){MODWERK_STORE_ABI, big_block[k], 4096, 1, 0};
        modwerk_test_rows[2u + k] = &rec_big[k];
    }
    ticks(60);
    CHECK(modwerk_store_refused >= 1u && find(BAT, 0xbbbb0002u) != NONE && BAT->used <= CAPACITY);

    if (failures) fprintf(stderr, "%u failure(s)\n", failures);
    else puts("store: NEW, keep, write, LOADED with a kept absent module and broken entries dropped, failed load, RESTORED, size change, no room");
    return failures != 0;
}
