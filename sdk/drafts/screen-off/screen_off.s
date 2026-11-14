| SPDX-License-Identifier: MIT
| SPDX-FileCopyrightText: 2026 jonathanwardle1992-beep
|
| SCREEN OFF, the ColdFire unit. Same decisions as screen_off.c, which the
| host gate runs. Hold UP (0x33) and tap NO (0x32) to toggle the blank.
| The release of that NO is taken as well. Every other key returns 0.
| While blanked, so_draw clears the 1024-byte composed frame.
|
| so_at is the one relocated word. A magic other than SOF1 is a fresh
| module (screen on). UP also counts as down when bit 3 of the held-key
| row at 0x46100b1e is set (code 0x33, the row stock updates before the
| event). 0x4004d948(-1) marks the display for the UI flush.

        .text
        .global so_key, so_draw, so_tick

        .equ KEY_NO, 0x32
        .equ KEY_UP, 0x33
        .equ MAGIC, 0x534F4631

so_ready:
        move.l  so_at,%a0
        cmpi.l  #MAGIC,(%a0)
        beq.s   ready_ok
        clr.l   (%a0)
        clr.l   4(%a0)
        clr.l   8(%a0)
        move.l  #MAGIC,(%a0)
ready_ok:
        rts

so_key:
        move.l  4(%sp),%d0
        move.l  8(%sp),%d1
        jsr     so_ready
        cmpi.l  #KEY_UP,%d0
        bne.s   key_not_up
        tst.l   %d1
        beq.s   key_up_release
        move.b  #1,4(%a0)
        clr.l   %d0
        rts
key_up_release:
        clr.b   4(%a0)
        clr.l   %d0
        rts
key_not_up:
        cmpi.l  #KEY_NO,%d0
        bne.s   key_pass
        tst.l   %d1
        beq.s   key_no_release
        tst.b   6(%a0)
        bne.s   key_no_repeat
        move.b  #1,6(%a0)
        tst.b   4(%a0)
        bne.s   key_toggle
        btst    #3,0x46100b1e.l
        beq.s   key_pass
key_toggle:
        eori.b  #1,5(%a0)
        move.b  #1,7(%a0)
        addq.l  #1,8(%a0)
        moveq   #-1,%d0
        move.l  %d0,-(%sp)
        jsr     0x4004d948.l
        addq.l  #4,%sp
        moveq   #1,%d0
        rts
key_no_repeat:
        moveq   #0,%d0
        tst.b   7(%a0)
        beq.s   key_repeat_out
        moveq   #1,%d0
key_repeat_out:
        rts
key_no_release:
        moveq   #0,%d0
        tst.b   7(%a0)
        beq.s   key_release_clear
        moveq   #1,%d0
key_release_clear:
        clr.b   6(%a0)
        clr.b   7(%a0)
        rts
key_pass:
        clr.l   %d0
        rts

so_draw:
        move.l  4(%sp),%a1
        jsr     so_ready
        tst.b   5(%a0)
        beq.s   draw_out
        cmpa.l  #0,%a1
        beq.s   draw_out
        move.w  #1023,%d0
draw_clear:
        clr.b   (%a1)+
        dbf     %d0,draw_clear
draw_out:
        rts

so_tick:
        move.l  4(%sp),%a1
        jsr     so_ready
        move.l  8(%a0),%d0
        add.l   %d0,%d0
        moveq   #0,%d1
        move.b  5(%a0),%d1
        or.l    %d1,%d0
        move.l  %d0,(%a1)
        rts

        .data
        .align  2
so_at:
        .long   so_state
so_state:
        .long   0
        .long   0
        .long   0
