| SPDX-License-Identifier: GPL-2.0-or-later
        .section .run,"ax"
        .balign 2
        .globl se_native_ctor,se_native_window,se_preview_align
        .globl se_native_register
se_native_register:
        lea -84(%sp),%sp
        movem.l %d2-%d7/%a2-%a6,(%sp)
        jmp 0x400763bc
se_native_ctor:
        lea -36(%sp),%sp
        movem.l %d2-%d3/%a2-%a4,(%sp)
        jmp 0x400a8192
se_native_window:
        lea -20(%sp),%sp
        movem.l %d2-%d6,(%sp)
        jmp 0x40074ca4
| Native recorder audition aligns its base down. Include the leading pad
| in the descriptor length, then remove it in se_window, without copying PCM.
| D2 is byte offset; D4 is byte count. Other registers/flags are preserved
| where the replaced code preserved them.
se_preview_align:
        moveq #15,%d0
        and.l %d2,%d0
        add.l %d0,%d4
        lsr.l #1,%d0
        move.l %d0,se_preview_pad
        addi.l #0x4237ef90,%d2
        moveq #-16,%d0
        and.l %d2,%d0
        move.l %d0,se_preview_base
        rts
