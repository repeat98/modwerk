/* SPDX-License-Identifier: GPL-3.0-or-later */
#include "native_view.h"
static void performance_draw(unsigned char *frame)
{
    /* Design System v1 (D31): Panorama Full Grid and Clip View Native Frame. */
    if (view == ROW) { panorama_draw(frame); return; }
    if (view == CLIP) { clip_native_draw(frame); return; }
    for (unsigned i=0; i<1024; ++i) frame[i]=0;
    if (view == SETUP) {
        label(frame,0,0,"CLYPS SETUP"); label(frame,55,0,"R"); number(frame,60,0,slot+1);
        label(frame,80,0,"T"); number(frame,85,0,track+1);
        label(frame,2,2,"CAPTURE PLAYING TO ROW");
        label(frame,2,3,"CELL SOURCE"); number(frame,55,3,draft+1);
        label(frame,2,4,"RESTORE ALL AT STOP");
        for (unsigned x=0;x<110;++x) frame[x*8+5-operation] ^= 0x7f;
        label(frame,2,6,refused ? "STOP FIRST OR CHECK GRID" : missing ? "CAPTURE ROW FIRST" : "UP DOWN SELECT  YES CONFIRM");
        return;
    }
    label(frame,0,0,"CLYPS CLIP T"); number(frame,52,0,track+1);
    unsigned active=source(playing,track), next=source(requested,track);
    for (unsigned i=0;i<16;++i) {
        unsigned x=32*(i%4), band=2+i/4;
        number(frame,x+2,band,i+1);
        if (active==i) label(frame,x+12,band,"P");
        if (next==i && next!=active) label(frame,x+19,band,"Q");
        if (src_cursor==i) for (unsigned dx=0;dx<28;++dx) frame[(x+dx)*8+7-band]^=0x7f;
    }
    label(frame,0,7,"TRIG DIRECT   YES FOCUS");
}
