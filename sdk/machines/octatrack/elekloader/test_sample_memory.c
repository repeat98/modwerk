/* SPDX-License-Identifier: GPL-3.0-or-later
 * Host check of ot_sample_memory (sample_memory.c) over a model of stock's sample pool, 600 pages instead of 14,602:
 * a record gets the top run of the free list, both rows lose it and total drops; a cold init keeps the run out of the
 * fresh list and clears around it, so its contents stay; removal clears the pages and pushes them back on top; a
 * replacement asking for as many pages keeps the run; a run below page 171, a fragmented top, too few free pages and a
 * record of another ABI are refused and change nothing. No stock byte is used. */
#define SM_HOST
#include <stdint.h>
#include <stdio.h>
#include <string.h>
static unsigned failures;
#define CHECK(x) do { if (!(x)) { failures++; fprintf(stderr, "%s:%d: %s\n", __FILE__, __LINE__, #x); } } while (0)

#define COUNT 600u
static uint16_t list[COUNT + 8], shadow[COUNT + 8];
static uint32_t used_, total_, masked, masks;
static uint8_t arena[(COUNT + 1u) * 6144u];
static unsigned clears; static uint32_t cleared_from[1024], cleared_bytes[1024];
static void clear(void *at, uint32_t bytes)
{
    cleared_from[clears] = (uint32_t)((uint8_t *)at - arena), cleared_bytes[clears++] = bytes;
    memset(at, 0, bytes);
}
#define LIST list
#define SHADOW shadow
#define USED used_
#define TOTAL total_
#define CLEAR(at, bytes) clear((void *)(at), (bytes))
#define BASE arena
#include "modwerk_events.h"
static volatile struct modwerk_sample_memory *row;
#define ROW row
uint32_t modwerk_machine_mask(void) { masked++, masks++; return 0; }
void modwerk_machine_unmask(uint32_t sr) { (void)sr; masked--; }
#include "sample_memory.c"

/* Stock's cold init as read in the image: the list 1..COUNT, used 0, total COUNT, then the arena clear. */
static void cold_init(void)
{
    for (uint32_t i = 0; i < COUNT; ++i) list[i] = (uint16_t)(i + 1u);
    used_ = 0, total_ = COUNT, clears = 0;
    mw_arena_clear(arena, (COUNT + 1u) * 6144u);
}
/* A recorder's reserve: it pops the top entry and zeroes it in both rows (0x400948cc). */
static void recorder_pop(uint32_t n) { while (n--) { --total_; list[total_] = 0, shadow[total_] = 0; } }
static int in_list(uint32_t page) { for (uint32_t i = 0; i < total_; ++i) if (list[i] == page) return 1; return 0; }

int main(void)
{
    struct modwerk_sample_memory kits = {1, 100, 0, {0, 0}}, again = {1, 100, 0, {0, 0}}, bigger = {1, 120, 0, {0, 0}};
    memset(shadow, 0xff, sizeof shadow);                         /* row 1 holds whatever a release left */
    cold_init(); recorder_pop(40); used_ = 50;                  /* 40 recorder pages on top, 50 Flex pages below */
    CHECK(clears == 1 && cleared_from[0] == 0 && cleared_bytes[0] == (COUNT + 1u) * 6144u); /* no borrow: stock's clear */

    /* Install: the top run 461..560 (list indices 460..559) leaves both rows. */
    row = &kits; modwerk_sample_memory_service();
    CHECK(kits.at == arena + 461u * 6144u && total_ == 460u && list[460] == 0 && shadow[460] == 0 && list[559] == 0);
    CHECK(list[459] == 460u && !in_list(461) && !in_list(560) && masked == 0);
    memset(kits.at, 0x5a, 100u * 6144u);                         /* the module's library */
    modwerk_sample_memory_service();                             /* the set changes beside it: nothing moves */
    CHECK(total_ == 460u && kits.at == arena + 461u * 6144u);

    /* LOAD PROJECT: cold init keeps the run, clears around it, and the recorders reserve above it. */
    cold_init();
    CHECK(total_ == COUNT - 100u && !in_list(461) && !in_list(560) && in_list(460) && in_list(561) && in_list(600));
    CHECK(clears == 2 && cleared_from[0] == 0 && cleared_bytes[0] == 461u * 6144u &&
          cleared_from[1] == 561u * 6144u && cleared_bytes[1] == (COUNT + 1u - 561u) * 6144u);
    CHECK(kits.at[0] == 0x5a && kits.at[100u * 6144u - 1u] == 0x5a && arena[461u * 6144u - 1u] == 0 && arena[561u * 6144u] == 0);
    for (uint32_t i = 1; i < total_; ++i) CHECK(list[i] > list[i - 1]); /* still ascending */
    recorder_pop(40);
    CHECK(total_ == 460u && !in_list(461));

    /* A replacement that asks for as many pages keeps the run, contents and all. */
    row = &again; modwerk_sample_memory_service();
    CHECK(again.at == arena + 461u * 6144u && total_ == 460u && again.at[0] == 0x5a);

    /* Removal: each page cleared and pushed back on top of both rows. */
    row = 0; clears = 0; modwerk_sample_memory_service();
    CHECK(total_ == 560u && list[460] == 461u && shadow[460] == 461u && list[559] == 560u && shadow[559] == 560u);
    CHECK(clears == 100u && cleared_from[0] == 461u * 6144u && cleared_bytes[0] == 6144u && arena[461u * 6144u] == 0);
    cold_init(); CHECK(clears == 1 && total_ == COUNT);          /* nothing borrowed: stock's clear again */

    /* A record asking for more pages than the run it would replace: return, then take afresh. */
    row = &kits; kits.at = 0; modwerk_sample_memory_service();
    CHECK(kits.at == arena + 501u * 6144u && total_ == 500u);
    row = &bigger; modwerk_sample_memory_service();
    CHECK(bigger.at == arena + 481u * 6144u && total_ == 480u && !in_list(481) && !in_list(600));

    /* Refusals change nothing. */
    row = 0; modwerk_sample_memory_service(); CHECK(total_ == COUNT);
    used_ = COUNT - 50u; row = &kits; kits.at = 0; modwerk_sample_memory_service(); /* 50 free, 100 asked */
    CHECK(!kits.at && total_ == COUNT && list[COUNT - 1u] == COUNT);
    used_ = 0; total_ = 200u;                                     /* the run would start at page 101, below 171 */
    modwerk_sample_memory_service(); CHECK(!kits.at && total_ == 200u && list[100] == 101u);
    total_ = COUNT; list[COUNT - 10u] = 7u;                       /* a fragmented top */
    modwerk_sample_memory_service(); CHECK(!kits.at && total_ == COUNT && list[COUNT - 10u] == 7u);
    list[COUNT - 10u] = COUNT - 9u;
    struct modwerk_sample_memory other = {2, 100, 0, {0, 0}};    /* another ABI reads as no record */
    row = &other; modwerk_sample_memory_service(); CHECK(!other.at && total_ == COUNT);
    CHECK(masked == 0 && masks > 0);

    if (failures) { fprintf(stderr, "%u sample memory checks failed\n", failures); return 1; }
    puts("Sample memory: take, cold init around the run, replacement, return, refusals passed.");
    return 0;
}
