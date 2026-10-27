| SPDX-License-Identifier: MIT
| SPDX-FileCopyrightText: 2026 jonathanwardle1992-beep
| playstart -- PERSONALIZE PLAY START checkbox, and the [PLAY] transport gate.
|
| SETTING 0x800000dc  MAGIC_OFF = empty = stock pause (default);
|                     MAGIC_ON  = X = from step 1.
| LIVE is 0/1 so YES and PLAY agree. 0.1.9 stored 0/1 and treated any
| nonzero word as ticked, so leftover SRAM (or TRACK MUTES magic) showed
| X and the first YES only filled LIVE. Same as TRACK MUTES: only
| MAGIC_ON is on; YES xors that 0/1.
|
| Stock PLAY at 0x4006181a tests 0x460d1aec. If that word is 0 (this unit:
| 0.1.5-0.1.8), it never reaches 0x40061822 / 0x40061848 / 0x40061856
| (TRANSPORT load, jsr pause 0x4009f784, start 0x400a030c). It polls SEQ
| via pea -1 / jsr 0x4009b290, pauses with jsr 0x4009f5bc at 0x4006188a,
| and starts with pea 0 / jsr 0x4009b964 at 0x40061892. 0.1.8 still paused
| because it hooked the other branch. 0.1.5-0.1.6 jumped to 0x40061856 and
| PLAY went dead (wrong start).
|
| 0.1.9: SEQ==playing/paused and the box is X -> SEQSTOP, clr TRANSPORT,
| jmp 0x40061892. Empty box keeps seqpause. 1aec!=0 branch still converted
| the same way.

    .equ SETTING,      0x800000dc
    .equ SH_SETTING,   0x100fff6c
    .equ MAGIC_OFF,    0x50530000
    .equ MAGIC_ON,     0x50530001
    .equ TRANSPORT,    0x800066a0
    .equ PLAY_RESUME,  0x40061828
    .equ PLAY_ALT_REC, 0x40061882
    .equ PLAY_ALT_START, 0x40061892
    .equ PLAY_AFTER_PAUSE, 0x4006184e
    .equ PLAY_EPI,     0x4006189c

    .text

    .global lbl_playstart
lbl_playstart:
    .asciz "PLAY START"
    .align 2

ps_empty:
    .byte  0x15, 0
    .align 2
ps_ticked:
    .byte  0x16, 0
    .align 2

ps_load:
    move.l  SETTING,%d0
    cmpi.l  #MAGIC_ON,%d0
    beq.b   pl_on
    clr.l   LIVE
    moveq   #0,%d0
    rts
pl_on:
    moveq   #1,%d0
    move.l  %d0,LIVE
    rts

    .global get_playstart
get_playstart:
    bsr.w   ps_load
    lea     ps_empty,%a0
    tst.l   %d0
    beq.b   gp_done
    lea     ps_ticked,%a0
gp_done:
    move.l  %a0,%d0
    rts

    .global set_playstart
set_playstart:
    tst.l   8(%sp)
    beq.b   sp_rts
    bsr.w   ps_load
    eori.l  #1,%d0
    andi.l  #1,%d0
    move.l  %d0,LIVE
    addi.l  #MAGIC_OFF,%d0
    move.l  %d0,SETTING
    move.l  %d0,SH_SETTING
sp_rts:
    rts

| Z set if empty. Preserves d0 (TRANSPORT / SEQ).
ps_enabled:
    move.l  SETTING,%d1
    cmpi.l  #MAGIC_ON,%d1
    beq.b   pe_on
    clr.l   LIVE
    rts
pe_on:
    moveq   #1,%d1
    move.l  %d1,LIVE
    rts

| 0x40061822
    .global ps_gate
ps_gate:
    move.l  TRANSPORT,%d0
    bsr.w   ps_enabled
    beq.b   pg_stock
    tst.l   %d0
    beq.b   pg_stock
    jmp     ps_restart
pg_stock:
    jmp     PLAY_RESUME

| 0x40061848
    .global ps_pause
ps_pause:
    bsr.w   ps_enabled
    beq.b   pp_stock
    jmp     ps_restart
pp_stock:
    jsr     0x4009f784
    jmp     PLAY_AFTER_PAUSE

| 0x4006187c  (d0 = SEQ from 0x4009b290)
    .global ps_alt
ps_alt:
    bsr.w   ps_enabled
    beq.b   pa_stock
    tst.l   %d0
    beq.b   pa_start
    jmp     ps_restart
pa_stock:
    moveq   #1,%d1
    cmp.l   %d0,%d1
    bne.b   pa_start
    jmp     PLAY_ALT_REC
pa_start:
    jmp     PLAY_ALT_START

| 0x4006188a
    .global ps_seqpause
ps_seqpause:
    bsr.w   ps_enabled
    beq.b   pq_stock
    jmp     ps_restart
pq_stock:
    jsr     0x4009f5bc
    jmp     PLAY_EPI

    .global ps_restart
ps_restart:
    jsr     0x400a10c8
    clr.l   TRANSPORT
    jmp     PLAY_ALT_START

    .align 2
LIVE:
    .long   0

    .ifdef MODWERK_EVENTS
    .global ps_restore
ps_restore:
    tst.b   ps_restored
    bne.b   pr_done
    move.l  SH_SETTING,%d0
    cmpi.l  #MAGIC_ON,%d0
    beq.b   pr_on
    move.l  #MAGIC_OFF,%d0
pr_on:
    move.l  %d0,SETTING
    andi.l  #1,%d0
    move.l  %d0,LIVE
    moveq   #1,%d0
    move.b  %d0,ps_restored
pr_done:
    rts
ps_restored:
    .byte 0
    .balign 2
    .endif
