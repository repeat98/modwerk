; SPDX-License-Identifier: GPL-3.0-or-later
; MS-70CDR 2.10. Count attempted ELF-header reads, then tail-call stock.
        .global probe_read, probe_draw, probe_midi
        .nocmp
        .section .probe,"ax",@progbits
        .balign 32
probe_read:
        mvkl    .S1     read_count,a0
        mvkh    .S1     read_count,a0
        ldw     .D1T1   *a0,a1
        nop     4
        add     .L1     1,a1,a1
        stw     .D1T1   a1,*a0
        b       .S2     stock_read
        nop     5

; Add an eight-digit read count at the right of the SYSTEM title.
        .balign 32
probe_draw:
        ; B15 points to the next free word. Keep the return address in
        ; our frame, above the stack word the two callees can use.
        stw     .D2T2   b3,*b15--(32)
        callp   .S2     midistomp_diag_draw,b3
        stw     .D2T1   a4,*+b15(20)
        mvkl    .S1     read_count,a0
        mvkh    .S1     read_count,a0
        ldw     .D1T1   *a0,a1
        add     .L2     8,b15,b4
        mv      .L1X    b4,a0
        mvk     .L1     8,a3
        mvk     .S1     9,a7
        mvk     .S1     0x30,a8
digit:
        shru    .S1     a1,28,a5
        cmpgtu  .L1     a5,a7,a2
        add     .L1     a8,a5,a5
        [a2] add .L1    7,a5,a5
        stb     .D1T1   a5,*a0++
        shl     .S1     a1,4,a1
        sub     .L1     a3,1,a3
        mv      .L1     a3,a2
        [a2] b  .S1     digit
        nop     5
        mvk     .L1     0,a4
        stb     .D1T1   a4,*a0
        mvk     .S1     78,a6
        mvk     .L2     1,b6
        callp   .S2     draw_text,b3
        ldw     .D2T1   *+b15(20),a4
        ldw     .D2T2   *++b15(32),b3
        nop     4
        bnop    .S2     b3,5

; Task_MIDI calls this after MIDI clock handling. Consume just the
; diagnostic frame F0 7D 'M' 'S' 'T' 07 nonce F7. The byte stream still
; goes through the normal MIDI parser.
        .balign 32
probe_midi:
        ldbu    .D2T1   *+b14(226),a4
        mvkl    .S1     receive_state,a3
        mvkh    .S1     receive_state,a3
        ldw     .D1T1   *a3,a1
        mvk     .S1     0xf7,a7
        mvk     .S1     0xf0,a8
        cmpgtu  .L1     a4,a7,a0
        [a0] bnop .S1   midi_done,5
        cmpeq   .L1     a4,a8,a0
        [a0] mvk .L1    1,a1
        [a0] b  .S1     midi_state
        nop     5
        mv      .L1     a1,a0
        [!a0] bnop .S1  midi_done,5
        cmpeq   .L1     7,a1,a0
        [a0] b  .S1     midi_end
        nop     5
        shru    .S1     a4,7,a0
        [a0] b  .S1     midi_reset
        nop     5
        cmpeq   .L1     6,a1,a0
        [a0] stw .D1T1  a4,*+a3(4)
        [a0] b  .S1     midi_next
        nop     5
        mvkl    .S1     request_prefix,a5
        mvkh    .S1     request_prefix,a5
        ldbu    .D1T1   *+a5[a1],a8
        nop     4
        cmpeq   .L1     a4,a8,a0
        [!a0] b .S1     midi_reset
        nop     5
midi_next:
        add     .L1     1,a1,a1
midi_state:
        b       .S1     midi_done
        stw     .D1T1   a1,*a3
        nop     4
midi_reset:
        b       .S1     midi_done
        zero    .L1     a1
        stw     .D1T1   a1,*a3
        nop     3
midi_end:
        zero    .L1     a1
        stw     .D1T1   a1,*a3
        cmpeq   .L1     a4,a7,a0
        [!a0] bnop .S1  midi_done,5

        ; The stock MIDI sender takes a stack-backed buffer, like the
        ; upstream diagnostics sender. Preserve the return to diag_vec.
        stw     .D2T2   b3,*b15--(32)
        add     .L2     8,b15,b5
        mv      .L1X    b5,a4
        ldw     .D1T1   *+a3(4),a5
        mvkl    .S1     read_count,a8
        mvkh    .S1     read_count,a8
        ldw     .D1T1   *a8,a1
        mvkl    .S1     0x534d7df0,a2
        mvkh    .S1     0x534d7df0,a2
        stw     .D1T1   a2,*a4
        mvk     .S1     0x4854,a2
        sth     .D1T1   a2,*+a4(4)
        stb     .D1T1   a5,*+a4(6)
        add     .L1     7,a4,a3
        mvk     .S1     127,a8
        mvk     .L1     5,a0
midi_group:
        and     .L1     a1,a8,a2
        stb     .D1T1   a2,*a3++
        shru    .S1     a1,7,a1
        sub     .L1     a0,1,a0
        [a0] bnop .S1   midi_group,5
        stb     .D1T1   a7,*a3
        mvk     .S2     13,b4
        callp   .S2     stock_midi_send,b3
        ldw     .D2T2   *++b15(32),b3
        nop     4
midi_done:
        b       .S2     midistomp_diag_mend
        nop     5

        .balign 32
read_count:
        .word   0
receive_state:
        .word   0,0              ; next byte, then nonce
request_prefix:
        .byte   0xf0,0x7d,0x4d,0x53,0x54,0x07
        .balign 32

        .section .patch_read,"ax",@progbits
        callp   .S2     probe_read,b3

        .section .patch_draw,"ax",@progbits
        callp   .S2     probe_draw,b3

        .section .patch_midi,"ax",@progbits
        b       .S2     probe_midi
