/* SPDX-License-Identifier: GPL-3.0-or-later */
#include <assert.h>
#define CLYPS_HOST_TEST
#define CLYPS_PERFORMANCE
#include "../live_module.c"
static unsigned running, popup, midi, record, bad_grid, held_key = 64;

static uint32_t host_long(uintptr_t addr)
{
    if (addr == 0x800065b8u) return running;
    if (addr == 0x460d1e70u) return popup;
    if (addr == 0x460d1736u) return record;
    return 0;
}
static uint8_t host_byte(uintptr_t addr)
{
    if (addr == 0x80000015u) return midi;
    if (held_key < 64 && addr == 0x46100b18u + held_key/8) return 1u << (held_key%8);
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
int main(void)
{
    midi=1;
    assert(!module_key(ARR,1));
    midi=0; record=1;
    assert(!module_key(ARR,1));
    record=0; held_key=0x2d;
    assert(!module_key(ARR,1));
    held_key=64;
    tap(ARR); tap(YES);
    assert(end_of_path && !pending_row && !last_row);
    tap(DOWN); tap(PAGE_KEY); tap(YES);
    tap(ARR); tap(0x11); tap(2);
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
    tap(ARR); tap(0x11); tap(3); clyps_wrap();
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
    clyps_project_init(); assert(!mode && !defined && !last_row && !playing);
    return 0;
}
