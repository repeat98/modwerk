/* SPDX-License-Identifier: GPL-3.0-or-later
 * Record the adapter requests issued by the production UI callbacks.
 * No clock, queue, firmware memory or audio generator is emulated here.
 */
#include <stdint.h>
#include "../meta_focus.h"
enum { TRACKS=8, ARR=0x1f, SRC=0x22, STOP=0x27, PLAY=0x28, YES=0x31, NO=0x32 };
static unsigned visible, locked, src_list, editing, row_view, armed, refused;
static unsigned track, slot, zoom, src_cursor, draft, missing, defined, last_row, pending_row;
static uint32_t playing, requested, consumed[2], rows[16];
static unsigned ARRANGER, GRID_REC, LIVE_REC, REC_HELD, RUNNING;
static unsigned selected, held, submits, last_lane, last_source;
static unsigned BYTE(uint32_t address) { return address==0x100b14ccu ? selected : 0; }
static void check_src_context(void) {}
static void redraw(void) {}
static unsigned critical(void) { return 0; }
static void restore(unsigned sr) { (void)sr; }
static int stock_window(void) { return 0; }
static int supported(void) { return 1; }
static int stock_src_available(void) { return 1; }
static int alone(unsigned code) { (void)code; return !held; }
static int valid(uint32_t refs) { (void)refs; return 1; }
static void focus_row(unsigned index) { slot=index; }
static void submit_lane(unsigned lane,unsigned source) { ++submits; last_lane=lane; last_source=source; }
static void submit(uint32_t refs,unsigned row) { (void)refs; (void)row; ++submits; }
#include "../session_controls.h"

#ifndef CLYPS_COMPILE_ONLY
#include <assert.h>
static void tap(int key)
{
    assert(module_key(key,1));
    assert(module_key(0x100|key,0));
}
int main(void)
{
    selected=1;
    tap(ARR);
    for (int key=16;key<24;++key) {
        for (held=0;held<=1;++held) {
            assert(!module_key(key|0x100,1) && !module_key(key,1));
            assert(!module_key(key|0x100,0) && !module_key(key,0));
        }
    }
    held=0;
    assert(module_enc(6,3) && track==3);
    tap(ARR);
    assert(module_enc(6,2) && slot==2 && track==3 && !submits);
    tap(SRC);
    assert(src_list && track==1 && !submits);
    assert(module_enc(6,2) && src_cursor==2 && !submits);
    tap(YES);
    assert(submits==1 && last_lane==1 && last_source==2);
    tap(NO);
    assert(!module_key(SRC,1) && !module_key(SRC,0) && !module_enc(6,1));
    return 0;
}
#endif
