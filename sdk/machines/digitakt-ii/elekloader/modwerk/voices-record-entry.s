/* SPDX-License-Identifier: GPL-2.0-or-later */
/* Linked voices, live recording (OS 1.17): the sequencer's live-record routine at 0x40048fb2 takes (sequencer, track,
 * note, velocity, flag, step, ...) on the stack and records the note on that track's step. Its first 6 bytes
 * (linkw %fp,#-68; moveq #15,%d0) become the base's jsr: voices.c may change the track argument to the voice track the
 * note will play on, then this replays the two instructions on the caller's stack, as stock ran them, and resumes at
 * 0x40048fb8. Scratch registers d0, d1, a0 and a1 carry nothing into the routine (its arguments are on the stack). */
        .text
        .even
        .globl core_voice_record_entry

core_voice_record_entry:
        lea     -16(%sp),%sp
        movem.l %d0-%d1/%a0-%a1,(%sp)
        pea     24(%sp)                 /* the arguments: our return address and the caller's lie in between */
        jsr     core_voice_record
        addq.l  #4,%sp
        movem.l (%sp),%d0-%d1/%a0-%a1
        lea     16(%sp),%sp
        movea.l (%sp)+,%a0              /* back to 0x40048fb8, with the stack as the caller left it */
        link.w  %fp,#-68
        moveq   #15,%d0
        jmp     (%a0)

        .section .note.GNU-stack,"",@progbits
