| SPDX-License-Identifier: MIT
| SPDX-FileCopyrightText: 2026 jonathanwardle1992-beep
| playstart -- PERSONALIZE PLAY START, and the [PLAY] transport gate.
|
| SETTING 0x800000e0  0 = OFF = stock play/pause (default)
|                     1 = ON  = [PLAY] always starts from the beginning
| SHADOW  0x100fff70  ANDY copy (0x100fff00 + 0x800000e0 - 0x80000070)
|
| TRANSPORT 0x800066a0  stock: 0 stopped, 1 playing, 2 paused (from the
| pause stub at 0x4009f784, which sets 2 after jsr 0x4009f5bc).
|
| Detour 0x40061822: the first instruction of the no-[REC] [PLAY] path that
| loads TRANSPORT. Quant Live Rec detours 0x40061778, six bytes earlier, and
| resumes at 0x4006177e, so both can be installed. Mute Modes cannot share
| this module: it relocates the same PERSONALIZE tables.

    .equ SETTING,      0x800000e0
    .equ SH_SETTING,   0x100fff70
    .equ TRANSPORT,    0x800066a0
    .equ LEAVE_PLAY,   0x4009f5bc
    .equ PLAY_RESUME,  0x40061828

    .text

    .global lbl_playstart
lbl_playstart:
    .asciz "PLAY START"
    .align 2

ps_off:
    .asciz "OFF"
    .align 2
ps_on:
    .asciz "ON"
    .align 2
val_tbl:
    .long ps_off
    .long ps_on

    .global get_playstart
get_playstart:
    move.l  SETTING,%d0
    cmpi.l  #1,%d0
    beq.b   gp_ok
    moveq   #0,%d0
gp_ok:
    lsl.l   #2,%d0
    lea     val_tbl,%a0
    move.l  (%a0,%d0.l),%d0
    rts

    .global set_playstart
set_playstart:
    move.l  SETTING,%d0
    cmpi.l  #1,%d0
    beq.b   sp_cur
    moveq   #0,%d0
sp_cur:
    add.l   4(%sp),%d0
    tst.l   8(%sp)
    bne.b   sp_wrap
    tst.l   %d0
    bpl.b   sp_clhi
    moveq   #0,%d0
    bra.b   sp_store
sp_clhi:
    cmpi.l  #1,%d0
    ble.b   sp_store
    moveq   #1,%d0
    bra.b   sp_store
sp_wrap:
    cmpi.l  #1,%d0
    ble.b   sp_wlo
    moveq   #0,%d0
    bra.b   sp_store
sp_wlo:
    tst.l   %d0
    bpl.b   sp_store
    moveq   #1,%d0
sp_store:
    move.l  %d0,SETTING
    move.l  %d0,SH_SETTING
    rts

    .global ps_gate
ps_gate:
    move.l  TRANSPORT,%d0
    tst.l   SETTING
    beq.b   ps_stock
    tst.l   %d0
    beq.b   ps_stock
    jsr     LEAVE_PLAY
    clr.l   TRANSPORT
    moveq   #0,%d0
ps_stock:
    jmp     PLAY_RESUME

    .ifdef MODWERK_EVENTS
    .global ps_restore
ps_restore:
    tst.b   ps_restored
    bne.b   pr_done
    move.l  SH_SETTING,%d0
    move.l  %d0,SETTING
    moveq   #1,%d0
    move.b  %d0,ps_restored
pr_done:
    rts
ps_restored:
    .byte 0
    .balign 2
    .endif
