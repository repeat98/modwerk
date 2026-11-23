; SPDX-License-Identifier: GPL-3.0-or-later
; MS-70CDR 2.10. Count attempted ELF-header reads, then tail-call stock.
        .global probe_read, probe_draw
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

        .balign 32
read_count:
        .word   0
        .balign 32

        .section .patch_read,"ax",@progbits
        callp   .S2     probe_read,b3

        .section .patch_draw,"ax",@progbits
        callp   .S2     probe_draw,b3
