/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Added machine types: the machine descriptor lookup (0x400c89a4) and the parameter-code lookup
 * (0x400da3a2) answer a type core_machines names with the stock type it stands for. Every other type
 * replays the displaced stock instructions and continues in stock. a0 and a1 are kept, as stock
 * leaves them. */
        .text
        .even
        .globl core_machine_descriptor_entry, core_machine_param_entry

core_machine_descriptor_entry:
        moveq   #7,%d1
        move.l  4(%sp),%d0
        cmp.l   %d1,%d0
        bcs.s   2f
        move.l  %a0,-(%sp)
        move.l  %a1,-(%sp)
        move.l  %d0,-(%sp)
        jsr     core_machine_stands_for
        addq.l  #4,%sp
        move.l  (%sp)+,%a1
        move.l  (%sp)+,%a0
        tst.l   %d0
        bmi.s   1f
        move.l  %d0,-(%sp)
        bsr.s   stock_descriptor
        addq.l  #4,%sp
        rts
1:      move.l  4(%sp),%d0
2:      moveq   #6,%d1
        jmp     0x400c89aa
stock_descriptor:
        moveq   #6,%d1
        move.l  4(%sp),%d0
        jmp     0x400c89aa

/* (slot, type, out) */
core_machine_param_entry:
        moveq   #7,%d1
        move.l  8(%sp),%d0
        cmp.l   %d1,%d0
        bcs.s   1f
        move.l  %a0,-(%sp)
        move.l  %a1,-(%sp)
        move.l  %d0,-(%sp)
        jsr     core_machine_stands_for
        addq.l  #4,%sp
        move.l  (%sp)+,%a1
        move.l  (%sp)+,%a0
        tst.l   %d0
        bmi.s   1f
        move.l  12(%sp),-(%sp)
        move.l  %d0,-(%sp)
        move.l  12(%sp),-(%sp)
        bsr.s   stock_param_code
        lea     12(%sp),%sp
        rts
1:      move.l  %a2,-(%sp)
        moveq   #70,%d1
        move.l  %d2,-(%sp)
        jmp     0x400da3a8
stock_param_code:
        move.l  %a2,-(%sp)
        moveq   #70,%d1
        move.l  %d2,-(%sp)
        jmp     0x400da3a8

/* The three machine-string lookups (type): name, short name and menu title. An added type answers
 * from its record, others replay `moveq #6,%d1; move.l 4(%sp),%d0` and continue in stock. */
        .macro  STRING_ENTRY label, field, cont
        .globl  \label
\label:
        move.l  4(%sp),%d0
        moveq   #7,%d1
        cmp.l   %d1,%d0
        bcs.s   2f
        move.l  %a0,-(%sp)
        move.l  %a1,-(%sp)
        move.l  %d0,-(%sp)
        jsr     core_machine_stands_for
        addq.l  #4,%sp
        tst.l   %d0
        bmi.s   1f
        move.l  #\field,-(%sp)
        move.l  16(%sp),-(%sp)
        jsr     core_machine_string
        addq.l  #8,%sp
        move.l  (%sp)+,%a1
        move.l  (%sp)+,%a0
        rts
1:      move.l  (%sp)+,%a1
        move.l  (%sp)+,%a0
        move.l  4(%sp),%d0
2:      moveq   #6,%d1
        jmp     \cont
        .endm

        STRING_ENTRY core_machine_name_entry, 0, 0x400da6b2
        STRING_ENTRY core_machine_short_entry, 1, 0x400da6d8
        STRING_ENTRY core_machine_menu_entry, 2, 0x400da6fe

        .section .note.GNU-stack,"",@progbits
