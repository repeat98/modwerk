/* SPDX-License-Identifier: GPL-2.0-or-later */
        .text
        .globl start_bridge
        .globl step_bridge

/* The stock event and deadline are already on the stack on PLAY. */
start_bridge:
        cmpi.l  #0x4013a98c,%d7
        bne.s   start_stock
        lea     -16(%sp),%sp
        movem.l %d0-%d1/%a0-%a1,(%sp)
        /* PLAY walks track records in A5 and a four-byte index in D3. */
        move.l  %d3,%d0
        lsr.l   #2,%d0
        move.l  %d0,%d1
        mulu.w  #0x6a5,%d1
        movea.l %a5,%a0
        suba.l  %d1,%a0
        move.l  16(%sp),%d1
        clr.l   -(%sp)
        move.l  %d0,-(%sp)
        move.l  %a0,-(%sp)
        move.l  %d1,-(%sp)
        jsr     core_seq_note_bridge
        lea     16(%sp),%sp
        movem.l (%sp),%d0-%d1/%a0-%a1
        lea     16(%sp),%sp
start_stock:
        movea.l %d7,%a0
        jsr     (%a0)
        addq.l  #8,%sp
        jmp     0x400d6638

step_bridge:
        /* Keep the constructor's actual pattern argument across a switch. */
        move.l  %d0,-(%sp)
        move.l  %d7,-(%sp)
        jsr     0x400d6982
        tst.l   %d0
        beq.s   step_done
        lea     -16(%sp),%sp
        movem.l %d0-%d1/%a0-%a1,(%sp)
        move.l  28(%sp),-(%sp)          /* step */
        move.l  20(%sp),-(%sp)          /* track */
        move.l  28(%sp),-(%sp)          /* pattern */
        move.l  %d0,-(%sp)             /* event */
        jsr     core_seq_note_bridge
        lea     16(%sp),%sp
        movem.l (%sp),%d0-%d1/%a0-%a1
        lea     16(%sp),%sp
step_done:
        jmp     0x400d8204
