/* SPDX-License-Identifier: GPL-2.0-or-later */
        .text
        .globl core_seq_phrase_start
core_seq_phrase_start:
        addq.l #1,core_seq_transport_epoch
        jmp 0x401388b6

        .globl core_seq_phrase_submit
core_seq_phrase_submit:
        tst.l ev_seq_audio_phrase
        beq.s stock
        lea -16(%sp),%sp
        movem.l %d0-%d1/%a0-%a1,(%sp)
        move.l 20(%sp),-(%sp)
        move.l 20(%sp),-(%sp)
        jsr core_seq_phrase_replace
        addq.l #8,%sp
        tst.l %d0
        beq.s restore_stock
        movem.l (%sp),%d0-%d1/%a0-%a1
        lea 16(%sp),%sp
        jmp 0x400d82fe
restore_stock:
        movem.l (%sp),%d0-%d1/%a0-%a1
        lea 16(%sp),%sp
stock:
        jsr 0x4013a98c
        jmp 0x400d82fe

        .globl core_seq_phrase_atomic
core_seq_phrase_atomic:
        move.l %d2,-(%sp)
        move.w %sr,%d2
        move.w #0x2700,%sr
        move.l 16(%sp),-(%sp)
        move.l 16(%sp),-(%sp)
        move.l 16(%sp),-(%sp)
        jsr core_seq_phrase_commit
        lea 12(%sp),%sp
        move.w %d2,%sr
        move.l (%sp)+,%d2
        rts
