| SPDX-License-Identifier: MIT
| SPDX-FileCopyrightText: 2026 jonathanwardle1992-beep
| trackmutes -- PERSONALIZE TRACK MUTES checkbox, and the T1-T8 mute/select swap.
|
| SETTING 0x800000dc  MAGIC_OFF = empty; MAGIC_ON = X.
|
| FUNC+REC1/REC2 open recorder buffers via 0x4002ff84. Creating that
| overlay jsr's 0x40033970 (returns MIDI_MODE) and skips the page when
| MIDI is on. 0.1.26 forces that one site to continue so FUNC+REC1/2
| open from the MIDI TRACKS page. 0.1.25 hooked the pickup toggle
| 0x4003234c; that is not FUNC+REC.
|
| Stock double-tap T jmp's 0x40083ab4 (event 3) which may jsr 0x40083208,
| set 0x460fab40, bra 0x400836d8 or fall toward 0x40044920 (MIDI UI).
| 0.1.27-0.1.28 called that whole handler; sample list died and MIDI went
| dark. 0.1.29 jsr's 0x400791e4 after FUNC+T has already selected, and
| never enters 0x40083ab4.
|
| Stock 0x4007c428 (from FUNC+T mute and QUICK MUTE) forces T8 mute from
| T1-T7 when MASTER is on, and always clears bit 15. 0.1.29 eor's T1-T8
| mute bits without that coupling so T8 still mutes in MASTER mode.
|
| 0.1.29 opened 0x400791e4 on every second FUNC+T (no timer) and re-ran
| TRACK_PAGES on hold. On T8 with MASTER that overlay is the MASTER TRACK
| title and it sits on AMP/LFO/FX1/FX2; stock only draws it on SRC.
| 0.1.30: select on press only, stock-like double-tap window, and never
| create that overlay for T8 in MASTER mode.
|
| FUNC+T select must rebind the track's sample record into 0x46c8d1a0
| (stock 0x4006de34) and refresh the current page / AED (0x400554e0,
| 0x4002f2f8). 0.1.31 only jsr'd 0x40078850(1) and 0x4002f2f8, so AED
| kept the previous waveform.

    .equ SETTING,      0x800000dc
    .equ SH_SETTING,   0x100fff6c
    .equ MAGIC_OFF,    0x544d0000
    .equ MAGIC_ON,     0x544d0001
    .equ CUE_LATCH,    0x460d168c
    .equ CUE_KEYB,     0x46c7dce1
    .equ FUNC_ROW,     0x46100b1d
    .equ MIDI_MODE,    0x80000012
    .equ MASTER_ON,    0x80000034
    .equ MUTE_WORD,    0x80000008
    .equ MUTE_SHADOW,  0x100b14d4
    .equ MUTE_MIDI_W,  0x8000000c
    .equ MUTE_MIDI_SH, 0x100b14d8
    .equ EDIT_TRACK,   0x80000000
    .equ EDIT_TRACK_SH,0x100b14cc
    .equ TRACK_CONT,   0x40040256
    .equ FUNC_CONT,    0x40083e02
    .equ LEAVE_TRACK,  0x40043728
    .equ TRACK_BIND,   0x40097460
    .equ TRACK_PAGES,  0x400326a0
    .equ TRACK_ENC,    0x4004d780
    .equ SAMP_BIND,    0x40078850
    .equ AED_DRAW,     0x4002f2f8
    .equ OV_DRAW,      0x4007b780
    .equ PAGE_NOW,     0x460d1684
    .equ PAGE_REF,     0x400554e0
    .equ MIX_ROW,      0x400486cc
    .equ SAMP_PTR,     0x4006de34
    .equ SAMP_TAB,     0x46c82456
    .equ SLOT_TRK,     0x80000003
    .equ SLOT_LCD,     0x4004d640
    .equ MUTE_LED,     0x40033e3c
    .equ AFTER_UI,     0x4001529c
    .equ UI_CONT,      0x40052284
    .equ QM_LED,       0x4007e998
    .equ T_ROW,        0x46100b1a
    .equ TRIG_ROW,     0x46100b18
    .equ TRIG_MODE,    0x460d16f0
    .equ TRIG_STOCK,   0x400501d8
    .equ QM_MUTE,      0x4003d29c
    .equ REC_CREATE,   0x4002fece
    .equ SAMP_HAS,     0x40077a8c
    .equ SAMP_PREP,    0x400789e4
    .equ SAMP_LIST,    0x400791e4
    .equ WINDOW,       5

    .text

    .global lbl_trackmutes
lbl_trackmutes:
    .asciz "TRACK MUTES"
    .align 2

tm_empty:
    .byte  0x15, 0
    .align 2
tm_ticked:
    .byte  0x16, 0
    .align 2

tm_load:
    move.l  SETTING,%d0
    cmpi.l  #MAGIC_ON,%d0
    beq.b   tl_on
    clr.l   LIVE
    moveq   #0,%d0
    rts
tl_on:
    moveq   #1,%d0
    move.l  %d0,LIVE
    rts

    .global get_trackmutes
get_trackmutes:
    bsr.w   tm_load
    lea     tm_empty,%a0
    tst.l   %d0
    beq.b   gg_done
    lea     tm_ticked,%a0
gg_done:
    move.l  %a0,%d0
    rts

    .global set_trackmutes
set_trackmutes:
    tst.l   8(%sp)
    beq.b   ss_rts
    bsr.w   tm_load
    eori.l  #1,%d0
    andi.l  #1,%d0
    move.l  %d0,LIVE
    addi.l  #MAGIC_OFF,%d0
    move.l  %d0,SETTING
    move.l  %d0,SH_SETTING
ss_rts:
    rts

tm_cue_down:
    tst.l   CUE_LATCH
    bne.b   cd_yes
    tst.b   CUE_KEYB
cd_yes:
    rts

tm_func_down:
    moveq   #0,%d0
    move.b  FUNC_ROW,%d0
    btst    #5,%d0
    rts

| 0x40040250  Press only; hold/release eaten when X.
    .global tm_track_key
tm_track_key:
    move.l  8(%sp),%d0
    cmpi.l  #1,%d0
    beq.b   tk_press
    tst.l   LIVE
    beq.w   tk_stock
    move.l  4(%sp),%d1
    cmpi.l  #0x10,%d1
    bcs.w   tk_stock
    cmpi.l  #0x17,%d1
    bhi.w   tk_stock
    rts
tk_press:
    bsr.w   tm_load
    tst.l   %d0
    beq.w   tk_stock
    bsr.w   tm_cue_down
    bne.w   tk_stock
    move.l  4(%sp),%d1
    cmpi.l  #0x10,%d1
    bcs.w   tk_stock
    cmpi.l  #0x17,%d1
    bhi.w   tk_stock
    bsr.w   tm_func_down
    bne.b   tk_eaten
    move.l  4(%sp),%d1
    subi.l  #0x10,%d1
    moveq   #1,%d0
    asl.l   %d1,%d0
    moveq   #0,%d1
    move.b  tm_acc,%d1
    or.l    %d0,%d1
    moveq   #0,%d0
    move.b  T_ROW,%d0
    or.l    %d0,%d1
    move.b  %d1,tm_acc
tk_eaten:
    rts
tk_stock:
    move.l  %d2,-(%sp)
    move.l  8(%sp),%d1
    jmp     TRACK_CONT

| 0x40083dfc  FUNC+T: select. FUNC+double-tap T: stock sample slot list.
    .global tm_func_track
tm_func_track:
    bsr.w   tm_load
    tst.l   %d0
    beq.w   ft_stock
    move.l  8(%sp),%d0
    tst.l   %d0
    beq.w   ft_eaten
    move.l  4(%sp),%d1
    cmpi.l  #0x10,%d1
    bcs.w   ft_stock
    cmpi.l  #0x17,%d1
    bhi.w   ft_stock
    cmpi.l  #1,%d0
    bne.w   ft_eaten
    move.l  tm_tapk,%d0
    cmp.l   %d1,%d0
    bne.b   ft_new
    moveq   #20,%d2
    cmp.l   tm_tapt,%d2
    blt.b   ft_new
    moveq   #-1,%d0
    move.l  %d0,tm_tapk
    clr.l   tm_tapt
    tst.l   MIDI_MODE
    bne.w   ft_eaten
    move.l  %d1,%d2
    subi.l  #0x10,%d2
    cmpi.l  #7,%d2
    bne.b   ft_samp
    tst.b   MASTER_ON
    bne.w   ft_eaten
ft_samp:
    jsr     SAMP_HAS
    tst.l   %d0
    beq.b   ft_list
    jsr     SAMP_PREP
ft_list:
    jsr     SAMP_LIST
    rts
ft_new:
    move.l  %d1,tm_tapk
    clr.l   tm_tapt
ft_sel:
    move.l  %d2,-(%sp)
    subi.l  #0x10,%d1
    move.l  %d1,%d2
    bsr.w   tm_set_track
    move.l  (%sp)+,%d2
ft_eaten:
    rts
ft_stock:
    move.l  %d2,-(%sp)
    move.l  8(%sp),%d2
    jmp     FUNC_CONT

| 0x40060cfc
    .global tm_trig
tm_trig:
    tst.l   LIVE
    beq.w   tg_stock
    move.l  TRIG_MODE,%d0
    cmpi.l  #4,%d0
    bne.w   tg_stock
    move.l  8(%sp),%d0
    cmpi.l  #1,%d0
    bne.w   tg_stock
    bsr.w   tm_cue_down
    bne.w   tg_stock
    bsr.w   tm_func_down
    bne.w   tg_stock
    move.l  4(%sp),%d1
    cmpi.l  #15,%d1
    bhi.w   tg_stock
    moveq   #1,%d0
    asl.l   %d1,%d0
    move.l  tm_qacc,%d1
    or.l    %d0,%d1
    move.l  %d1,tm_qacc
    rts
tg_stock:
    jmp     TRIG_STOCK

| 0x4002fec8  jsr 0x40033970. Stock skips recorder-buffer UI when MIDI
| mode is on. Return 0 and continue the create/open path.
    .global tm_rec_midi
tm_rec_midi:
    clr.l   %d0
    jmp     REC_CREATE

| 0x4005227e
    .global tm_ui
tm_ui:
    jsr     AFTER_UI
    move.l  %d0,-(%sp)
    lea     -56(%sp),%sp
    movem.l %d1-%d7/%a0-%a6,(%sp)
    move.l  tm_tapt,%d0
    cmpi.l  #1000,%d0
    bcc.b   ui_tock
    addq.l  #1,%d0
    move.l  %d0,tm_tapt
ui_tock:
    tst.l   LIVE
    bne.b   ui_go
    move.l  SETTING,%d0
    cmpi.l  #MAGIC_ON,%d0
    bne.w   ui_out
    moveq   #1,%d0
    move.l  %d0,LIVE
ui_go:
    bsr.w   tm_cue_down
    bne.w   ui_skip
    bsr.w   tm_func_down
    bne.w   ui_skip
    moveq   #0,%d3
    move.b  tm_acc,%d3
    clr.b   tm_acc
    moveq   #0,%d0
    move.b  T_ROW,%d0
    or.l    %d0,%d3
    move.b  %d3,tm_down
    moveq   #0,%d1
    move.b  tm_wait,%d1
    bne.b   ui_wait
    tst.b   %d3
    bne.b   ui_new
    tst.b   tm_held
    beq.w   q_try
    bsr.w   tm_rearm
    bra.w   q_try
ui_new:
    moveq   #0,%d0
    move.b  tm_held,%d0
    eori.l  #0xff,%d0
    and.l   %d3,%d0
    beq.b   ui_re
    move.b  tm_down,%d0
    move.b  %d0,tm_chord
    moveq   #WINDOW,%d0
    move.b  %d0,tm_wait
    bra.w   q_try
ui_wait:
    moveq   #0,%d0
    move.b  tm_chord,%d0
    or.l    %d3,%d0
    move.b  %d0,tm_chord
    subq.l  #1,%d1
    move.b  %d1,tm_wait
    bne.w   q_try
    moveq   #0,%d1
    move.b  tm_held,%d1
    eori.l  #0xff,%d1
    and.l   %d1,%d0
    move.b  %d0,tm_new
    beq.b   ui_applied
    bsr.w   tm_apply
ui_applied:
    moveq   #0,%d0
    move.b  tm_held,%d0
    moveq   #0,%d1
    move.b  tm_chord,%d1
    or.l    %d1,%d0
    move.b  %d0,tm_held
    clr.b   tm_chord
ui_re:
    bsr.w   tm_rearm
    bra.w   q_try
ui_skip:
    clr.b   tm_acc
    clr.b   tm_chord
    clr.b   tm_wait
    moveq   #0,%d0
    move.b  tm_held,%d0
    moveq   #0,%d1
    move.b  T_ROW,%d1
    or.l    %d1,%d0
    move.b  %d0,tm_held
    bra.w   ui_out
q_try:
    move.l  TRIG_MODE,%d0
    cmpi.l  #4,%d0
    bne.w   ui_out
    move.l  tm_qacc,%d3
    clr.l   tm_qacc
    moveq   #0,%d0
    move.b  TRIG_ROW+1,%d0
    asl.l   #8,%d0
    moveq   #0,%d1
    move.b  TRIG_ROW,%d1
    or.l    %d1,%d0
    or.l    %d0,%d3
    move.l  %d3,tm_qdown
    moveq   #0,%d1
    move.b  tm_qwait,%d1
    bne.b   q_wait
    tst.l   %d3
    bne.b   q_new
    tst.l   tm_qheld
    beq.w   ui_out
    bsr.w   tm_qrearm
    bra.w   ui_out
q_new:
    move.l  tm_qheld,%d0
    eori.l  #0xffff,%d0
    and.l   %d3,%d0
    beq.b   q_re
    move.l  tm_qdown,%d0
    move.l  %d0,tm_qchord
    moveq   #WINDOW,%d0
    move.b  %d0,tm_qwait
    bra.w   ui_out
q_wait:
    move.l  tm_qchord,%d0
    or.l    %d3,%d0
    move.l  %d0,tm_qchord
    subq.l  #1,%d1
    move.b  %d1,tm_qwait
    bne.w   ui_out
    move.l  tm_qheld,%d1
    eori.l  #0xffff,%d1
    and.l   %d1,%d0
    move.l  %d0,tm_qnew
    beq.b   q_applied
    bsr.w   tm_qapply
q_applied:
    move.l  tm_qheld,%d0
    or.l    tm_qchord,%d0
    move.l  %d0,tm_qheld
    clr.l   tm_qchord
q_re:
    bsr.w   tm_qrearm
ui_out:
    movem.l (%sp),%d1-%d7/%a0-%a6
    lea     56(%sp),%sp
    move.l  (%sp)+,%d0
    jmp     UI_CONT

tm_rearm:
    moveq   #0,%d2
    move.b  T_ROW,%d2
    lea     tm_upcnt,%a0
    moveq   #0,%d3
ra_bit:
    btst    %d3,%d2
    bne.b   ra_down
    moveq   #0,%d0
    move.b  (%a0),%d0
    addq.l  #1,%d0
    move.b  %d0,(%a0)
    cmpi.l  #2,%d0
    bcs.b   ra_next
    moveq   #0,%d0
    move.b  tm_held,%d0
    bclr    %d3,%d0
    move.b  %d0,tm_held
    clr.b   (%a0)
    bra.b   ra_next
ra_down:
    clr.b   (%a0)
ra_next:
    addq.l  #1,%a0
    addq.l  #1,%d3
    cmpi.l  #8,%d3
    bcs.b   ra_bit
    rts

tm_qrearm:
    move.l  tm_qdown,%d2
    lea     tm_qupcnt,%a0
    moveq   #0,%d3
qa_bit:
    btst    %d3,%d2
    bne.b   qa_down
    moveq   #0,%d0
    move.b  (%a0),%d0
    addq.l  #1,%d0
    move.b  %d0,(%a0)
    cmpi.l  #2,%d0
    bcs.b   qa_next
    move.l  tm_qheld,%d0
    bclr    %d3,%d0
    move.l  %d0,tm_qheld
    clr.b   (%a0)
    bra.b   qa_next
qa_down:
    clr.b   (%a0)
qa_next:
    addq.l  #1,%a0
    addq.l  #1,%d3
    cmpi.l  #16,%d3
    bcs.b   qa_bit
    rts

tm_qapply:
    move.l  tm_qnew,%d2
    moveq   #0,%d3
qp_bit:
    btst    %d3,%d2
    beq.b   qp_next
    cmpi.l  #8,%d3
    bcc.b   qp_stock
    move.l  #0x100,%d0
    asl.l   %d3,%d0
    move.l  MUTE_WORD,%d1
    eor.l   %d0,%d1
    move.l  %d1,MUTE_WORD
    move.l  %d1,MUTE_SHADOW
    bra.b   qp_next
qp_stock:
    pea     1
    move.l  %d3,-(%sp)
    jsr     QM_MUTE
    addq.l  #8,%sp
qp_next:
    addq.l  #1,%d3
    cmpi.l  #16,%d3
    bcs.b   qp_bit
    pea     7
    jsr     QM_LED
    addq.l  #4,%sp
    clr.l   -(%sp)
    jsr     QM_LED
    addq.l  #4,%sp
    rts

tm_apply:
    moveq   #0,%d1
    move.b  tm_new,%d1
    asl.l   #8,%d1
    tst.l   MIDI_MODE
    bne.w   ap_midi
    move.l  MUTE_WORD,%d2
    eor.l   %d1,%d2
    move.l  %d2,MUTE_WORD
    move.l  %d2,MUTE_SHADOW
    moveq   #0,%d3
ap_aled:
    move.b  tm_new,%d1
    btst    %d3,%d1
    beq.b   ap_anext
    move.l  #0x100,%d0
    asl.l   %d3,%d0
    move.l  MUTE_WORD,%d2
    and.l   %d2,%d0
    sne     %d0
    mvsb    %d0,%d0
    neg.l   %d0
    move.l  %d0,-(%sp)
    pea     0x31
    move.l  %d3,-(%sp)
    jsr     MUTE_LED
    lea     12(%sp),%sp
ap_anext:
    addq.l  #1,%d3
    cmpi.l  #8,%d3
    bcs.b   ap_aled
    rts
ap_midi:
    move.l  MUTE_MIDI_W,%d2
    eor.l   %d1,%d2
    move.l  %d2,MUTE_MIDI_W
    move.l  %d2,MUTE_MIDI_SH
    rts

tm_set_track:
    move.l  %d0,-(%sp)
    move.l  %d1,-(%sp)
    move.l  %a0,-(%sp)
    move.l  %d2,-(%sp)
    move.b  EDIT_TRACK_SH,%d0
    move.l  %d0,-(%sp)
    jsr     LEAVE_TRACK
    addq.l  #4,%sp
    move.l  (%sp)+,%d2
    move.b  %d2,EDIT_TRACK
    move.b  %d2,EDIT_TRACK_SH
    move.b  %d2,SLOT_TRK
    jsr     TRACK_BIND
    jsr     TRACK_PAGES
    jsr     TRACK_ENC
    move.l  PAGE_NOW,%d0
    move.l  %d0,-(%sp)
    jsr     PAGE_REF
    addq.l  #4,%sp
    jsr     MIX_ROW
    move.l  SAMP_TAB,%a0
    move.l  %a0,%d0
    beq.b   st_nobind
    moveq   #0,%d0
    move.b  EDIT_TRACK_SH,%d0
    move.l  %d0,%d1
    asl.l   #3,%d1
    move.l  %d1,%d0
    add.l   %d1,%d0
    add.l   %d1,%d0
    adda.l  %d0,%a0
    move.l  8(%a0),-(%sp)
    move.l  (%a0),-(%sp)
    jsr     SAMP_PTR
    addq.l  #8,%sp
st_nobind:
    clr.l   -(%sp)
    jsr     SAMP_BIND
    addq.l  #4,%sp
    jsr     SLOT_LCD
    jsr     AED_DRAW
    jsr     OV_DRAW
    move.l  (%sp)+,%a0
    move.l  (%sp)+,%d1
    move.l  (%sp)+,%d0
    rts

    .align 2
LIVE:
    .long   0
tm_tapk:
    .long   0xffffffff
tm_tapt:
    .long   0
tm_acc:
    .byte   0
tm_down:
    .byte   0
tm_chord:
    .byte   0
tm_new:
    .byte   0
tm_held:
    .byte   0
tm_wait:
    .byte   0
tm_upcnt:
    .byte   0,0,0,0,0,0,0,0
tm_qacc:
    .long   0
tm_qdown:
    .long   0
tm_qchord:
    .long   0
tm_qnew:
    .long   0
tm_qheld:
    .long   0
tm_qwait:
    .byte   0
tm_qupcnt:
    .byte   0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0
    .balign 2

    .ifdef MODWERK_EVENTS
    .global tm_restore_tick
tm_restore_tick:
    tst.b   tm_restored
    bne.b   tt_done
    move.l  SH_SETTING,%d0
    cmpi.l  #MAGIC_ON,%d0
    beq.b   tt_on
    move.l  #MAGIC_OFF,%d0
tt_on:
    move.l  %d0,SETTING
    andi.l  #1,%d0
    move.l  %d0,LIVE
    moveq   #1,%d0
    move.b  %d0,tm_restored
tt_done:
    rts
tm_restored:
    .byte 0
    .balign 2
    .endif
