; SPDX-License-Identifier: GPL-3.0-or-later
; MS-70CDR 2.10. Record the loader's completed stream operations.
        .global probe_read, probe_draw, probe_midi
        .nocmp
        .section .probe,"ax",@progbits

        .macro trace_call name, stock, kind
        .balign 32
\name:
        ; The four register arguments and the caller's free stack word
        ; remain available to the stock callee.
        stw     .D2T2   b3,*b15--(32)
        mvk     .L1     \kind,a0
        stw     .D2T1   a0,*+b15(20)
        .if \kind == 5
        zero    .L1     a1
        stw     .D2T1   a1,*+b15(24)
        stw     .D2T1   a1,*+b15(28)
        .else
        stw     .D2T2   b4,*+b15(24)
        stw     .D2T1   a6,*+b15(28)
        .endif
        callp   .S2     \stock,b3
        bnop    .S1     trace_return,5
        .endm

        trace_call probe_read, stock_read, 1
        trace_call probe_copy, stock_read, 2
        trace_call probe_view, stock_view, 3
        trace_call probe_seek, stock_seek, 4
        trace_call probe_close, stock_close, 5

trace_return:
        ldw     .D2T1   *+b15(20),a0
        ldw     .D2T1   *+b15(24),a2
        ldw     .D2T1   *+b15(28),a3
        mvkl    .S1     trace_total,a5
        mvkh    .S1     trace_total,a5
        mvkl    .S1     read_count,a7
        mvkh    .S1     read_count,a7

        ; Serialize publication across DSP tasks. Avoid nesting DINT
        ; when entered with GIE clear, since it would replace SGIE.
        mvc     .S2     TSR,b0
        and     .L2     1,b0,b0
        [!b0] bnop .S1  trace_append,5
        dint
trace_append:
        ldw     .D1T1   *a5,a6
        cmpeq   .L1     1,a0,a1
        [a1] ldw .D1T1  *a7,a8
        add     .L1     4,a5,a9
        nop     1
        and     .L1     7,a6,a5
        shl     .S1     a5,4,a5
        add     .L1     a9,a5,a5
        stw     .D1T1   a0,*a5
        stw     .D1T1   a2,*+a5(4)
        stw     .D1T1   a3,*+a5(8)
        stw     .D1T1   a4,*+a5(12)
        [a1] add .L1    1,a8,a8
        [a1] stw .D1T1  a8,*a7
        add     .L1     1,a6,a6
        stw     .D1T1   a6,*-a9(4)
        [!b0] bnop .S1  trace_restore,5
        rint

trace_restore:
        ; Return the original result in A4 and the original link in B3.
        ldw     .D2T2   *++b15(32),b3
        nop     4
        bnop    .S2     b3,5

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
; diagnostic frames F0 7D 'M' 'S' 'T' <07 or 08> nonce F7. The stream still
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
        cmpeq   .L1     5,a1,a0
        [a0] bnop .S1   midi_command,5
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
midi_command:
        cmpeq   .L1     7,a4,a0
        cmpeq   .L1     8,a4,a2
        or      .L1     a0,a2,a0
        [!a0] bnop .S1  midi_reset,5
        stw     .D1T1   a4,*+a3(8)
        bnop    .S1     midi_next,5
midi_end:
        zero    .L1     a1
        stw     .D1T1   a1,*a3
        cmpeq   .L1     a4,a7,a0
        [!a0] bnop .S1  midi_done,5

        ; The stock MIDI sender takes a stack-backed buffer. The
        ; largest reply is 141 bytes, starting at SP+8.
        mvk     .S2     40,b6
        stw     .D2T2   b3,*b15--[b6]
        add     .L2     8,b15,b5
        mv      .L1X    b5,a4
        ldw     .D1T1   *+a3(4),a5
        ldw     .D1T1   *+a3(8),a9
        mvkl    .S1     0x534d7df0,a2
        mvkh    .S1     0x534d7df0,a2
        stw     .D1T1   a2,*a4
        mvk     .S1     0x54,a2
        stb     .D1T1   a2,*+a4(4)
        mvk     .S1     0x41,a2
        add     .L1     a2,a9,a1
        stb     .D1T1   a1,*+a4(5)
        stb     .D1T1   a5,*+a4(6)
        add     .L1     7,a4,a3
        mvk     .S1     127,a8
        cmpeq   .L1     8,a9,a0
        [a0] bnop .S1   midi_trace,5

        mvkl    .S1     read_count,a5
        mvkh    .S1     read_count,a5
        ldw     .D1T1   *a5,a1
        nop     4
        callp   .S2     midi_word,b3
        bnop    .S1     midi_send,5

midi_trace:
        mvkl    .S1     trace_total,a5
        mvkh    .S1     trace_total,a5
        ldw     .D1T1   *a5++,a1
        nop     4
        mv      .L1     a1,a9
        callp   .S2     midi_word,b3
        mvk     .L1     8,a6
midi_record:
        ldw     .D1T1   *a5++,a1
        mvk     .L1     3,a7
        nop     3
        stb     .D1T1   a1,*a3++
midi_field:
        ldw     .D1T1   *a5++,a1
        nop     4
        callp   .S2     midi_word,b3
        sub     .L1     a7,1,a7
        mv      .L1     a7,a0
        [a0] bnop .S1   midi_field,5
        sub     .L1     a6,1,a6
        mv      .L1     a6,a0
        [a0] bnop .S1   midi_record,5
        ; A writer publishes only after storing the record. A change
        ; during serialization invalidates the snapshot.
        mvkl    .S1     trace_total,a5
        mvkh    .S1     trace_total,a5
        ldw     .D1T1   *a5,a1
        nop     4
        cmpeq   .L1     a9,a1,a0
        [!a0] bnop .S1  midi_restore,5

midi_send:
        mvk     .S1     0xf7,a7
        stb     .D1T1   a7,*a3++
        sub     .L2X    a3,b5,b4
        callp   .S2     stock_midi_send,b3
midi_restore:
        mvk     .S2     40,b6
        ldw     .D2T2   *++b15[b6],b3
        nop     4
midi_done:
        b       .S2     midistomp_diag_mend
        nop     5

midi_word:
        mvk     .L1     5,a0
midi_group:
        and     .L1     a1,a8,a2
        stb     .D1T1   a2,*a3++
        shru    .S1     a1,7,a1
        sub     .L1     a0,1,a0
        [a0] bnop .S1   midi_group,5
        bnop    .S2     b3,5

        .balign 32
read_count:
        .word   0
receive_state:
        .word   0,0,0            ; next byte, nonce, command
request_prefix:
        .byte   0xf0,0x7d,0x4d,0x53,0x54
        .balign 4
trace_total:
        .word   0
        .space  128              ; eight (kind, width/offset, count/origin, result) records
        .balign 32

        .section .patch_read,"ax",@progbits
        callp   .S2     probe_read,b3

        .section .patch_draw,"ax",@progbits
        callp   .S2     probe_draw,b3

        .section .patch_midi,"ax",@progbits
        b       .S2     probe_midi

        .macro patch_call name, wrapper
        .section .patch_\name,"ax",@progbits
        callp   .S2     \wrapper,b3
        .endm

        patch_call seek_phdr, probe_seek
        patch_call view_phdr, probe_view
        patch_call seek_section, probe_seek
        patch_call view_section, probe_view
        patch_call seek_symbols, probe_seek
        patch_call view_symbols, probe_view
        patch_call seek_reloc, probe_seek
        patch_call copy_reloc, probe_copy
        patch_call copy_word, probe_copy
        patch_call seek_data, probe_seek
        patch_call view_data, probe_view
        patch_call seek_end, probe_seek
        patch_call close, probe_close
