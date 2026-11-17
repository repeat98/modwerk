| SPDX-License-Identifier: GPL-3.0-or-later
| Crossfader: the two firmware sites and the SETTINGS row. The logic is in xfade.c.

        .equ    STR_CTOR,   0x4017af20          | std::string(this, const char*, alloc&)
        .equ    FXVIEW_VT,  0x401848dc          | the effects/mixer page view's vtable
        .equ    FX_CH,      0x4197c740          | FX CONTROL CH (0-15, or off); the replaced instruction reads it

        .text

| ---------------- getTitle entry (0x40030930), the parameter pages' title ----------------------
| Replaces "subq.l #4,sp; move.l a3,-(sp); move.l a2,-(sp)". Replays it under our return address and
| remembers the effects/mixer view (Compressor, Internal Mixer, External Mixer), so the LEVEL knob and
| the fader box know when the Internal Mixer is on screen. a0 (the string to make) is kept.
        .balign 2
        .globl  cxf_titlehook
cxf_titlehook:
        move.l  (%sp)+, %d1                     | our return address
        subq.l  #4, %sp
        move.l  %a3, -(%sp)
        move.l  %a2, -(%sp)
        move.l  %d1, -(%sp)
        movea.l 20(%sp), %a1                    | the view (getTitle's argument)
        move.l  (%a1), %d1
        cmpi.l  #FXVIEW_VT, %d1
        bne.s   1f
        move.l  %a1, cxf_view
1:      rts

| ---------------- a view is shown (0x400c9ce4, in View::show) ----------------------------------
| Replaces "lea 0x4013779e,a5", right after show has stored the screen in the view (a2). Every view
| passes here before its first frame, menus included; xfade.c keeps the track pages among them, for
| LEVEL on the FADER ON tracks. (The titles came a frame late, and RAM-P1's SRC page asks for none.)
        .balign 2
        .globl  cxf_showhook
cxf_showhook:
        move.l  %a2, cxf_shownv
        lea     0x4013779e, %a5
        rts

| ---------------- incoming CC (0x400d4cec, the CC handler, once per message) --------------------
| Replaces "cmp.l FX_CH,d4" (the handler's test for FX CONTROL CH). d4 the channel, d5 the CC number,
| d6 the value. The fader's CC on FX CONTROL CH is handed to xfade.c; the message then goes on as
| stock. The replaced compare runs last, for the branch after the site.
        .balign 2
        .globl  cxf_cchook
cxf_cchook:
        cmp.l   FX_CH, %d4
        bne.s   9f
        cmp.l   cxf_cc, %d5
        bne.s   9f
        move.l  %d6, cxf_in
9:      cmp.l   FX_CH, %d4
        rts

| ---------------- the mixer, each channel's gain (0x40071d86) ----------------------------------
| Replaces "addi.l #-256,d1" where the mixer's three ways of making a channel's gain meet: d2 the
| channel (0-7 tracks, 8 IN L, 9 IN R), d6 its gain, d1 its pan. cxf_mix scales d6 by the crossfade.
| d0, a0 and a1 are free here; d1 and the rest are kept.
        .balign 2
        .globl  cxf_mixhook
cxf_mixhook:
        addi.l  #-256, %d1                      | the instruction this replaced
        lea     -16(%sp), %sp
        movem.l %d0-%d1/%a0-%a1, (%sp)
        move.l  %d6, -(%sp)
        move.l  %d2, -(%sp)
        jsr     cxf_mix
        addq.l  #8, %sp
        move.l  %d0, %d6
        movem.l (%sp), %d0-%d1/%a0-%a1
        lea     16(%sp), %sp
        rts

| ---------------- SETTINGS: the CROSSFADER row ----------------------------------------------------
        .globl  cxf_settings
cxf_settings:
        pea     row_xf
        move.l  8(%sp), -(%sp)                  | the menu
        jsr     core_additem
        addq.l  #8, %sp
        rts

row_label:                                      | builds the std::string in a0
        link    %a6, #-4
        move.l  %d2, -(%sp)
        pea     -1(%a6)
        pea     str_row
        move.l  %a0, %d2
        move.l  %a0, -(%sp)
        jsr     STR_CTOR
        lea     12(%sp), %sp
        move.l  %d2, %d0
        move.l  -8(%a6), %d2
        unlk    %a6
        rts

        .balign 4
row_xf:
        .long   row_label, cxf_select, cxf_rowdraw, cxf_change
str_row:
        .asciz  "CROSSFADER"
        .balign 2
