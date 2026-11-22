/* SPDX-License-Identifier: GPL-3.0-or-later */
        .text
        .even
        .globl core_mixer_count_entry, core_mixer_list_entry
        .globl core_mixer_descriptor_entry, core_mixer_draw_entry
        .globl core_audio_frame_entry

core_audio_frame_entry:
        jsr     core_voice_frame        | linked voices follow their lead's knobs (voices.c)
        move.l  %a2,-(%sp)
        move.l  20(%sp),-(%sp)          | the base's own frame words first (machine-frame.c)
        move.l  20(%sp),-(%sp)
        move.l  20(%sp),-(%sp)
        move.l  20(%sp),-(%sp)
        jsr     core_machine_frame
        lea     16(%sp),%sp
        lea     ev_audio_frame,%a2
1:      move.l  (%a2)+,%d0
        beq.s   2f
        move.l  20(%sp),-(%sp)
        move.l  20(%sp),-(%sp)
        move.l  20(%sp),-(%sp)
        move.l  20(%sp),-(%sp)
        movea.l %d0,%a0
        jsr     (%a0)
        lea     16(%sp),%sp
        bra.s   1b
2:      move.l  (%sp)+,%a2
        jmp     0x400cd420

core_mixer_count_entry:
        move.l  %a0,-(%sp)
        move.l  %a1,-(%sp)
        jsr     core_mixer_prepare
        move.l  (%sp)+,%a1
        move.l  (%sp)+,%a0
        move.l  %d0,%d1
        moveq   #1,%d0
        move.l  %d1,-(%sp)
        jmp     0x40066df8

core_mixer_list_entry:
        move.l  #core_mixer_page_ids,%d0
        jmp     0x40066e08

core_mixer_descriptor_entry:
        move.l  %a0,-(%sp)
        move.l  %a1,-(%sp)
        move.l  12(%sp),-(%sp)
        jsr     core_mixer_descriptor
        addq.l  #4,%sp
        move.l  (%sp)+,%a1
        move.l  (%sp)+,%a0
        tst.l   %d0
        bne.s   1f
        moveq   #32,%d1
        move.l  4(%sp),%d0
        jmp     0x400c8990
1:      rts

core_mixer_draw_entry:
        move.l  8(%sp),-(%sp)
        move.l  8(%sp),-(%sp)
        jsr     core_mixer_draw
        addq.l  #8,%sp
        tst.l   %d0
        bne.s   1f
        move.l  %a2,-(%sp)
        move.l  %d2,-(%sp)
        movea.l 12(%sp),%a2
        jmp     0x400763b4
1:      rts

        .section .note.GNU-stack,"",@progbits
