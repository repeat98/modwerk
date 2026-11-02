/* SPDX-License-Identifier: MIT */
#include "recorder_boundary.h"
#define CHECK(x) do { if (!(x)) return __LINE__; } while (0)
int bs_recorder_selftest(void) {
    struct bs_preview_guard g;
    struct bs_recorder_boundary b;
    struct bs_preview_token before, after;
    for (uint32_t selected=0; selected<3; ++selected) for (uint32_t other=0; other<3; ++other)
    for (uint32_t track=0; track<8; ++track) {
        bs_guard_init(&g); CHECK(bs_guard_enable(&g)); CHECK(bs_guard_acquire(&g,&before));
        bs_recorder_boundary_init(&b,&g);
        CHECK(!g.enabled && !bs_guard_valid(&g,&before) && bs_recorder_quiescent_locked(&b));
        CHECK(bs_guard_enable(&g)); CHECK(bs_guard_acquire(&g,&before));
        uint32_t rev=g.revision, serial=g.serial;
        bs_recorder_enter_locked(&b,0x1000,track,selected,other);
        CHECK(b.depth==1 && !b.fault && !bs_recorder_quiescent_locked(&b));
        if (selected || other==1) {
            CHECK(b.frames[0].ticket>serial && g.revision>rev);
            CHECK(!bs_guard_valid(&g,&before) && !bs_guard_acquire(&g,&after));
        } else CHECK(!b.frames[0].ticket && g.revision==rev && bs_guard_valid(&g,&before));
        bs_recorder_leave_locked(&b,0x1000);
        CHECK(bs_recorder_quiescent_locked(&b) && bs_guard_acquire(&g,&after));
        CHECK(bs_guard_valid(&g,&before)==!(selected || other==1));
    }
    for (uint32_t track=0; track<8; ++track) {
        bs_guard_init(&g); bs_recorder_boundary_init(&b,&g); CHECK(bs_guard_enable(&g));
        CHECK(bs_guard_acquire(&g,&before));
        bs_recorder_prepare_locked(&b,0x2000,track);
        uint32_t preparation=b.frames[0].ticket;
        CHECK(preparation && b.depth==1 && !b.fault && !bs_guard_valid(&g,&before));
        bs_recorder_enter_locked(&b,0x1f00,track,2,0);
        CHECK(b.depth==2 && b.frames[1].ticket && b.frames[1].ticket!=preparation);
        bs_recorder_leave_locked(&b,0x1f00); CHECK(!bs_guard_acquire(&g,&after));
        bs_recorder_leave_locked(&b,0x2000);
        CHECK(bs_recorder_quiescent_locked(&b) && bs_guard_acquire(&g,&after) && !bs_guard_valid(&g,&before));
    }
    /* Independent writer and nested idle/active calls retain distinct tickets. */
    bs_guard_init(&g); bs_recorder_boundary_init(&b,&g); CHECK(bs_guard_enable(&g));
    uint32_t independent=bs_guard_writer_begin(&g); CHECK(independent);
    for(uint32_t i=0;i<BS_RECORDER_DEPTH;++i) {
        bs_recorder_enter_locked(&b,0x1000-64*i,i,i&1,0);
        CHECK(!b.fault && b.depth==i+1);
    }
    for(uint32_t i=BS_RECORDER_DEPTH;i>0;--i) {
        bs_recorder_leave_locked(&b,0x1000-64*(i-1));
        CHECK(!b.fault && b.depth==i-1 && !bs_guard_acquire(&g,&after));
    }
    CHECK(bs_guard_writer_end(&g,independent) && bs_guard_acquire(&g,&after));
    for(uint32_t mode=0;mode<14;++mode) {
        bs_guard_init(&g); bs_recorder_boundary_init(&b,&g); CHECK(bs_guard_enable(&g));
        if(mode==0)bs_recorder_leave_locked(&b,0x1000);
        if(mode==1)bs_recorder_enter_locked(&b,0,0,0,0);
        if(mode==2)bs_recorder_enter_locked(&b,0x1002,0,0,0);
        if(mode==3)bs_recorder_enter_locked(&b,0x1000,8,0,0);
        if(mode==4)bs_recorder_enter_locked(&b,0x1000,0,3,0);
        if(mode==5)bs_recorder_enter_locked(&b,0x1000,0,0,3);
        if(mode==6 || mode==7 || mode==8) {
            bs_recorder_enter_locked(&b,0x1000,0,2,0); CHECK(b.frames[0].ticket);
            if(mode==6)bs_recorder_enter_locked(&b,0x1000,0,0,0);
            if(mode==7)bs_recorder_leave_locked(&b,0x2000);
            if(mode==8) { CHECK(bs_guard_writer_end(&g,b.frames[0].ticket)); bs_recorder_leave_locked(&b,0x1000); }
        }
        if(mode==9)for(uint32_t i=0;i<=BS_RECORDER_DEPTH;++i)bs_recorder_enter_locked(&b,0x1000+64*i,0,0,0);
        if(mode>=10 && mode<=12) {
            if(mode==10)g.serial=UINT32_MAX;
            if(mode==11)g.revision=UINT32_MAX;
            if(mode==12)for(uint32_t i=0;i<BS_GUARD_WRITERS;++i)CHECK(bs_guard_writer_begin(&g));
            bs_recorder_enter_locked(&b,0x1000,0,2,0);
        }
        if(mode==13)bs_recorder_prepare_locked(&b,0x1000,8);
        CHECK(b.fault && !g.enabled && !bs_recorder_quiescent_locked(&b));
        uint32_t depth=b.depth;
        bs_recorder_leave_locked(&b,0x1000); bs_recorder_enter_locked(&b,0x2000,0,0,0);
        CHECK(b.fault && !g.enabled && b.depth==depth && !bs_guard_acquire(&g,&after));
    }
    bs_recorder_boundary_init(&b,0); bs_recorder_enter_locked(&b,0x1000,0,0,0); bs_recorder_leave_locked(&b,0x1000);
    CHECK(b.fault && !bs_recorder_quiescent_locked(&b));
    bs_recorder_boundary_init(0,&g); bs_recorder_enter_locked(0,0,0,0,0); bs_recorder_leave_locked(0,0);
    CHECK(!bs_recorder_quiescent_locked(0));
    return 0;
}
