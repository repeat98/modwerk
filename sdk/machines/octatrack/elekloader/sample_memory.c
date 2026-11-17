/* SPDX-License-Identifier: GPL-3.0-or-later
 * ot_sample_memory (events.json 52): one module borrows whole pages of stock's sample pool while it is installed
 * (Kits keeps its 2 MB library there), so a unit without that module loses no sample memory.
 *
 * Stock's pool, OS 1.40C (read in the code, 16 November 2026): row 0 at 0x46c2e9c0 is an ordered list of 16-bit page
 * numbers, [0, used) the Flex slots' pages, [used, total) free; row 1 at 0x46c35bd4 is the copy a release builds.
 * used is at 0x8000691c, total at 0x80006920. Sample loads take from used upwards; a track recorder pops list[total-1]
 * and zeroes that entry in both rows (0x400948cc), and gives pages back by clearing each and pushing it at total
 * (0x40095a90); nothing hands out an entry at or above total. Cold init (0x40096f24: boot, LOAD PROJECT, a new project,
 * REFORMAT FLEX RAM) refills row 0 with 1..count, sets used 0 and total count, and clears the whole arena with the call
 * at 0x40097012, whose operand this base owns (mw_arena_clear).
 *
 * take() pops the module's pages from the top of the free list as a recorder would, masked, when they are one run at
 * page LOWEST or above. mw_arena_clear() keeps them out of every fresh list and clears around them. give_back() returns
 * them as a recorder's shrink does. The engine task runs the service before it raises ev_modules_ready, with the card
 * free and nothing playing. */
#include <stdint.h>
#include "loader.h"
#include "modwerk_events.h"

#ifndef SM_HOST
#define LIST ((volatile uint16_t *)0x46c2e9c0u)    /* row 0 */
#define SHADOW ((volatile uint16_t *)0x46c35bd4u)  /* row 1 */
#define USED (*(volatile uint32_t *)0x8000691cu)
#define TOTAL (*(volatile uint32_t *)0x80006920u)
#define CLEAR(at, bytes) ((void (*)(void *, uint32_t))0x40020984u)((void *)(at), (bytes)) /* stock's arena clear */
extern uint8_t arena_base[];                       /* core-ot: the arena's base after the base's own pages */
#define BASE ((uint8_t *)arena_base)
#define ROW ((volatile struct modwerk_sample_memory *)modwerk_runtime_event_row[MODWERK_OT_SAMPLE_MEMORY - RUNTIME_EVENTS][0])
uint32_t modwerk_machine_mask(void);
void modwerk_machine_unmask(uint32_t);
#endif
#define PAGE 6144u
#define LOWEST 171u  /* the file manager's COPY FILE uses pages 0-170 of the arena as a raw buffer */
#define MOST 400u    /* the contract's limit: 2.4 MB */

static uint32_t first, pages;                       /* the borrowed run; pages 0: none */
static volatile struct modwerk_sample_memory *holder;

/* The top n entries of the free list, when they are one ascending run of pages from LOWEST, leave the list in both
 * rows. Masked: a recorder's draw can pop from the top at interrupt level. */
static int take(uint32_t n)
{
    uint32_t sr = modwerk_machine_mask(), total = TOTAL, at, p;
    int ok = total >= USED + n && n;
    if (ok) {
        at = total - n, p = LIST[at];
        ok = p >= LOWEST;
        for (uint32_t i = 1; ok && i < n; ++i) ok = LIST[at + i] == p + i;
        if (ok) {
            for (uint32_t i = 0; i < n; ++i) LIST[at + i] = 0, SHADOW[at + i] = 0;
            TOTAL = at, first = p, pages = n;
        }
    }
    modwerk_machine_unmask(sr);
    return ok;
}

/* Each page cleared, then pushed back at the top of both rows, as stock's recorder shrink returns one. */
static void give_back(void)
{
    for (uint32_t p = first; p < first + pages; ++p) {
        CLEAR(BASE + p * PAGE, PAGE);
        uint32_t sr = modwerk_machine_mask(), total = TOTAL;
        LIST[total] = (uint16_t)p, SHADOW[total] = (uint16_t)p, TOTAL = total + 1u;
        modwerk_machine_unmask(sr);
    }
    first = pages = 0;
}

/* Cold init's arena clear: with pages borrowed, the fresh list (1..count, total count) loses them and the arena is
 * cleared around them, so they keep their contents. Unmasked, as stock fills the list. */
void mw_arena_clear(uint8_t *base, uint32_t bytes)
{
    if (!pages) { CLEAR(base, bytes); return; }
    uint32_t total = TOTAL, kept = 0;
    for (uint32_t i = 0; i < total; ++i) {
        uint16_t p = LIST[i];
        if (p < first || p >= first + pages) LIST[kept++] = p;
    }
    for (uint32_t i = kept; i < total; ++i) LIST[i] = 0;
    TOTAL = kept;
    CLEAR(base, first * PAGE);
    if (bytes > (first + pages) * PAGE) CLEAR(base + (first + pages) * PAGE, bytes - (first + pages) * PAGE);
}

/* The engine task, before ev_modules_ready: the record of the module installed now gets its pages; a removed one's
 * come back; a replacement asking for as many pages keeps the run (it reads its file again at ev_modules_ready). A
 * record the pool cannot serve keeps at 0, and the next change of the set asks again. */
void modwerk_sample_memory_service(void)
{
    uint32_t sr = modwerk_machine_mask();
    volatile struct modwerk_sample_memory *r = ROW;
    modwerk_machine_unmask(sr);
    if (r && (r->abi != 1u || !r->pages || r->pages > MOST)) r = 0; /* not one this base reads: as if none */
    if (pages && r && r->pages == pages) {
        if (r != holder || !r->at) holder = r, r->at = BASE + first * PAGE;
        return;
    }
    if (pages) give_back(), holder = 0;
    if (r && take(r->pages)) holder = r, r->at = BASE + first * PAGE;
}
