/* SPDX-License-Identifier: GPL-2.0-or-later */
/* Linked voices: the frame interrupt's note loop (OS 1.17). At 0x4002dff4 the loop loads the next note record from
 * its frame (fp - 100) and tests it (6 bytes: moveal, tstl). The base's jsr replaces both: it lets voices.c move the
 * record to a voice track, then loads and tests the record as stock did, so the beq that follows sees the same
 * condition codes. Every register but a0 is kept. */
        .text
        .even
        .globl core_voice_event_entry

core_voice_event_entry:
        movea.l -100(%fp),%a0
        lea     -12(%sp),%sp
        movem.l %d0-%d1/%a1,(%sp)
        tst.l   %a0
        beq.s   1f
        move.l  %a0,-(%sp)
        jsr     core_voice_event
        addq.l  #4,%sp
1:      movem.l (%sp),%d0-%d1/%a1
        lea     12(%sp),%sp
        movea.l -100(%fp),%a0
        tst.l   %a0
        rts

/* SETTINGS > VOICES: the row's label, a std::function returning a std::string built at a0 (core-dt2 rows.s,
 * core_value_label). It rewrites the label for the track on now, then lets core's routine build the string from it
 * with the same a0 and stack. */
        .globl core_voice_row_label

core_voice_row_label:
        move.l  %a0,-(%sp)
        jsr     core_voice_label_update
        movea.l (%sp)+,%a0
        jmp     core_value_label

        .section .note.GNU-stack,"",@progbits
