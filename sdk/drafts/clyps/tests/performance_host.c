/* SPDX-License-Identifier: GPL-3.0-or-later */
#include <assert.h>
#define CLYPS_HOST_TEST
#define CLYPS_PERFORMANCE
#include "../live_module.c"
static unsigned running, popup, midi, record, live_record, bank, pattern_chain, bad_grid, held_key = 64, held_key2 = 64, stock_track;

static uint32_t host_long(uintptr_t addr)
{
    if (addr == 0x800065b8u) return running;
    if (addr == 0x460d1e70u) return popup;
    if (addr == 0x460d172au) return live_record;
    if (addr == 0x80006546u) return pattern_chain;
    if (addr == 0x460d1736u) return record;
    return 0;
}
static uint8_t host_byte(uintptr_t addr)
{
    if (addr == 0x80000034u) return bank;
    if (addr == 0x80000015u) return midi;
    if (addr == 0x100b14ccu) return (uint8_t)stock_track;
    if (addr >= 0x46100b18u && addr < 0x46100b20u) {
        unsigned row = addr - 0x46100b18u, bits = 0;
        if (held_key < 64 && row == held_key/8) bits |= 1u << (held_key%8);
        if (held_key2 < 64 && row == held_key2/8) bits |= 1u << (held_key2%8);
        return (uint8_t)bits;
    }
    if (addr >= BANK_BASE && addr < BANK_BASE+16*PATTERN_BYTES) {
        unsigned offset = (addr-BANK_BASE)%PATTERN_BYTES;
        if (offset == 0x8e51 || offset == 0x8e53)
            return bad_grid && addr >= BANK_BASE+PATTERN_BYTES ? 32 : 16;
        if (offset == 0x8e52 || offset == 0x8e54) return 2;
    }
    return 0;
}
static void tap(unsigned key)
{
    assert(module_key(key,1));
    assert(module_key(key,0));
}
/* TRACK keys belong to the stock: it selects, CLYPS follows (D33). */
static void select_track(unsigned t)
{
    assert(!module_key(0x10 + t,1));
    stock_track = t;
    assert(!module_key(0x10 + t,0));
}
static unsigned org(const volatile uint32_t *o, unsigned lane) { return origin(o, lane); }
int main(void)
{
    midi=1;
    assert(!module_key(ARR,1));
    midi=0; record=1;
    assert(!module_key(ARR,1));
    record=0; live_record=1;
    assert(!module_key(ARR,1)); live_record=0;
    pattern_chain=1;
    assert(!module_key(ARR,1)); pattern_chain=0;
    bank=1;
    assert(!module_key(ARR,1)); bank=0;
    held_key=0x2d;
    assert(!module_key(ARR,1));
    held_key=64;
    tap(ARR); tap(YES);
    assert(end_of_path && !pending_row && !last_row);
    tap(DOWN); tap(PAGE_KEY); tap(YES);
    tap(ARR); select_track(1); tap(2);
    tap(ARR); tap(DOWN); tap(DOWN); tap(DOWN); tap(PAGE_KEY); tap(YES);
    assert(defined==18 && slot==4 && playing==0x20);
    running=1;
    assert(module_key(YES,1) && module_key(YES,1));
    assert(pending_row==2 && last_row==0 && slot==4);
    assert(module_key(YES,0));
    tap(YES);
    assert(pending_row==2 && playing==0x20);
    clyps_wrap();
    assert(last_row==2 && !pending_row && !playing);
    tap(YES);
    assert(pending_row==5 && !module_key(STOP,1));
    clyps_wrap();
    assert(last_row==2 && !playing && !pending_row);
    tap(4); tap(0);  /* Undefined row cannot erase the confirmed pending launch. */
    assert(pending_row==5 && last_row==2);
    clyps_wrap();
    tap(ARR); select_track(1); tap(3); clyps_wrap();
    assert(playing==0x30 && last_row==5);
    tap(ARR); tap(YES); assert(end_of_path && !pending_row);
    tap(PAGE_KEY); tap(DOWN); tap(9); tap(YES);
    assert(rows[4]==0x90 && playing==0x30);
    bad_grid=1; tap(4); assert(refused && !pending_row); bad_grid=0;
    popup=1;
    assert(!module_key(YES,1)); popup=0; assert(!module_key(YES,1)); assert(!module_key(YES,0));
    assert(!mode && locked);
    running=0; tap(YES);
    assert(!locked && !playing && !last_row);
    tap(ARR); tap(YES);
    assert(last_row==2);
    assert(module_key(DOWN,1)); popup=1;
    assert(module_key(DOWN,0));  /* Release stays with the initial owner. */
    popup=0;
    tap(ARR);
    clyps_bank_load(1,0);
    assert(!module_key(ARR,1) && !mode);
    clyps_bank_loaded();
    clyps_project_init(); assert(!mode && !defined && !last_row && !playing);

    /* D33 · A1: the stock tab and CLYPS name the same track in every view. */
    stock_track = 2;
    tap(ARR); assert(view == ROW && track == 2);
    tap(RIGHT); tap(LEFT); assert(track == 2);          /* no silent split from the stock tab */
    select_track(5); assert(module_key(DOWN,1) && module_key(DOWN,0)); assert(track == 5);
    tap(ARR); assert(view == CLIP && track == 5);
    select_track(0); tap(UP); assert(track == 0);

    /* A2: the crossfader and Scene gestures reach the stock while CLYPS is on screen. */
    assert(!module_key(64,1) && !module_key(64,0));
    assert(!module_key(SCENE_A,1));
    held_key = SCENE_A; assert(!module_key(3,1)); assert(!module_key(3,0)); held_key = 64;
    assert(!module_key(SCENE_A,0));
    assert(view == CLIP && !playing && !requested);

    /* C1/C2: Panorama TRACK + TRIG launches one cell; the path and the other lanes stay. */
    clyps_project_init(); stock_track = 0;
    tap(ARR); tap(PAGE_KEY); tap(YES);                   /* R01 = home */
    tap(DOWN); tap(DOWN); tap(PAGE_KEY); tap(YES);
    tap(PAGE_KEY); tap(DOWN); tap(7); tap(YES);          /* R03: T1 = A08 */
    select_track(2); tap(DOWN); tap(PAGE_KEY); tap(YES);
    tap(PAGE_KEY); tap(DOWN); tap(5); tap(YES);          /* R04: T3 = A06 */
    assert(defined == 0xd && rows[2] == 0x7 && rows[3] == 0x500);
    tap(0);                                              /* stopped Row launch R01 */
    assert(last_row == 1 && org(org_play,0) == 1 && org(org_play,7) == 1);
    running = 1;
    held_key = 0x12; assert(!module_key(0x12,1));         /* hold T3 (stock selects it) */
    stock_track = 2;
    held_key2 = 3; assert(module_key(3,1)); assert(module_key(3,0)); held_key2 = 64;
    assert(!module_key(0x12,0)); held_key = 64;
    assert(requested == 0x500 && playing == 0 && !pending_row && last_row == 1);
    assert(org(org_req,2) == 4 && org(org_play,2) == 1 && org(org_req,0) == 1);
    assert(rows[3] == 0x500 && rows[0] == 0);           /* stored Rows unchanged */
    assert(!module_key(STOP,1) && !module_key(STOP,0));    /* STOP cancels source and origin */
    assert(requested == 0 && org(org_req,2) == 1);
    held_key = 0x12; held_key2 = 3; assert(module_key(3,1)); assert(module_key(3,0)); held_key = held_key2 = 64;
    clyps_wrap();
    assert(playing == 0x500 && org(org_play,2) == 4 && org(org_play,0) == 1 && last_row == 1);
    held_key = 0x10; held_key2 = 2; assert(module_key(2,1)); assert(module_key(2,0)); held_key = held_key2 = 64;
    clyps_wrap();                                        /* T1 from R03: A08 */
    assert(playing == 0x507 && org(org_play,0) == 3 && last_row == 1);
    tap(YES); assert(pending_row == 3); clyps_wrap();    /* Row Advance stays independent */
    assert(last_row == 3 && playing == 0x7 && org(org_play,2) == 3);
    held_key = 0x11; held_key2 = 9; assert(module_key(9,1)); held_key = held_key2 = 64;
    assert(missing && requested == 0x7);                 /* undefined Row: nothing launches */
    assert(module_key(9,0));
    tap(2); clyps_wrap();                                /* duplicate: R03 again keeps R03 origin */
    assert(org(org_play,0) == 3);

    /* B1: Selective Edit Lock. Sound is free, sequence edits are held. */
    tap(NO); assert(view == NATIVE && locked);
    assert(!module_key(0x23,1) && !module_key(0x23,0));  /* AMP page */
    assert(!module_key(0x14,1)); stock_track = 4; assert(!module_key(0x14,0));
    assert(!module_enc(0, 3) && !module_enc(LEVEL_KNOB, -2));   /* plain turns edit the Part */
    held_key = SCENE_B; assert(!module_enc(1, 1)); assert(!module_key(4,1)); assert(!module_key(4,0)); held_key = 64;
    assert(module_key(5,1) && lock_note); assert(module_key(5,0));       /* trig edit held */
    held_key = 6; assert(module_enc(0, 1)); held_key = 64;               /* p-lock held */
    assert(module_key(0x2d,1) && module_key(0x2d,0));                    /* FUNC */
    assert(module_key(0x2e,1) && module_key(0x2e,0));                    /* PATTERN */
    assert(!module_key(0x24,1) && !lock_note); assert(!module_key(0x24,0));
    assert(!module_key(64,1));
    assert(playing == 0x7 && last_row == 3);

    /* B2: ARR returns to the remembered view; the Clip focus survives on the same track. */
    tap(ARR); assert(view == ROW && track == 4);
    tap(ARR); assert(view == CLIP);
    tap(DOWN); unsigned kept = src_cursor;
    assert(!module_key(0x25,1) && !module_key(0x25,0) && view == NATIVE);
    tap(ARR); assert(view == CLIP && src_cursor == kept);
    tap(NO); select_track(0); tap(ARR); assert(view == CLIP && track == 0 && src_cursor == 7);

    /* C3: LEVEL navigates and never launches. */
    tap(ARR); assert(view == ROW);
    unsigned before = requested;
    assert(module_enc(LEVEL_KNOB, 3)); assert(slot == 6 && requested == before);
    tap(PAGE_KEY); assert(module_enc(LEVEL_KNOB, 2) && operation == RESTORE_HOME);
    tap(YES); assert(refused && playing == 0x7);         /* Restore All refuses during play */
    running = 0; tap(YES); assert(!playing && !last_row && !org(org_play,0));
    return 0;
}
