/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Added machine types: the machine descriptor lookup (0x400c89a4) answers a type core_machines names with
 * the base's descriptor for it (machine-knobs.c), and the parameter-code lookup (0x400da3a2) as the stock
 * type it stands for. Every other type replays the displaced stock instructions and continues in stock.
 * a0 and a1 are kept, as stock leaves them. */
        .text
        .even
        .globl core_machine_descriptor_entry, core_machine_param_entry, core_stock_descriptor

core_machine_descriptor_entry:
        move.l  %a0,-(%sp)
        move.l  %a1,-(%sp)
        move.l  12(%sp),-(%sp)
        jsr     core_machine_knob_names         | the knob rows' names follow the machine asked for
        addq.l  #4,%sp
        move.l  (%sp)+,%a1
        move.l  (%sp)+,%a0
        moveq   #7,%d1
        move.l  4(%sp),%d0
        cmp.l   %d1,%d0
        bcs.s   2f
        move.l  %a0,-(%sp)
        move.l  %a1,-(%sp)
        move.l  %d0,-(%sp)
        jsr     core_machine_descriptor
        addq.l  #4,%sp
        move.l  (%sp)+,%a1
        move.l  (%sp)+,%a0
        tst.l   %d0
        beq.s   1f
        rts
1:      move.l  4(%sp),%d0
2:      moveq   #6,%d1
        jmp     0x400c89aa
/* The stock lookup for a stock type, callable from C: (type) -> descriptor; clobbers d0 and d1. */
core_stock_descriptor:
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
        move.l  16(%sp),-(%sp)
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

/* Permission (type, track class): an added type answers as the stock type it stands for. Replays
 * `move.l %d2,-(%sp); moveq #6,%d2; move.l 8(%sp),%d0`. */
        .globl  core_machine_permit_entry
core_machine_permit_entry:
        move.l  4(%sp),%d0
        moveq   #7,%d1
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
        move.l  8(%sp),-(%sp)
        move.l  %d0,-(%sp)
        bsr.s   stock_permit
        addq.l  #8,%sp
        rts
1:
stock_permit:
        move.l  %d2,-(%sp)
        moveq   #6,%d2
        move.l  8(%sp),%d0
        jmp     0x400da51c

/* The SRC page's sample slot code by type (core_machine_sample_slot in machines.c): each site replaces the stock
 * `cmp.l type,six; bcs.s none; lea 0x401eda30,aX` and resumes after the stock `mvz.b (aX,type),result; bra.s; clr.l`
 * with the result register set and every other register as it was. \slot is the result's offset in the saved block
 * (d0 at 0, d1 at 4). */
        .macro  SLOT_ENTRY label, type, slot, resume
        .globl  \label
\label:
        lea     -16(%sp),%sp
        movem.l %d0-%d1/%a0-%a1,(%sp)
        move.l  \type,-(%sp)
        jsr     core_machine_sample_slot
        addq.l  #4,%sp
        move.l  %d0,\slot(%sp)
        movem.l (%sp),%d0-%d1/%a0-%a1
        lea     16(%sp),%sp
        jmp     \resume
        .endm

        SLOT_ENTRY core_machine_slot_entry_16cec, %d1, 4, 0x40016cfe
        SLOT_ENTRY core_machine_slot_entry_16da6, %d0, 4, 0x40016db8
        SLOT_ENTRY core_machine_slot_entry_17748, %d5, 0, 0x4001775a
        SLOT_ENTRY core_machine_slot_entry_17f74, %d3, 4, 0x40017f86
        SLOT_ENTRY core_machine_slot_entry_183f4, %d4, 4, 0x40018406
        SLOT_ENTRY core_machine_slot_entry_1844c, %d4, 4, 0x4001845e

/* The same lookup as a function (type at 4(%sp)), from 0x40017d50: replaces `cmp.l %d0,%d1; bcs.s; lea`. */
        .globl  core_machine_slot_entry_17d56
core_machine_slot_entry_17d56:
        move.l  %a1,-(%sp)
        move.l  %d0,-(%sp)
        jsr     core_machine_sample_slot
        addq.l  #4,%sp
        move.l  (%sp)+,%a1
        rts

/* The machine menu's list getter (a0: the result vector; one stack argument): run stock, then let the
 * base append the added types. Replays `lea -24(%sp),%sp; movem.l %d2-%d5/%a2-%a3,(%sp)`. */
        .globl  core_machine_list_entry
core_machine_list_entry:
        move.l  4(%sp),-(%sp)
        bsr.s   stock_list
        addq.l  #4,%sp
        move.l  %d0,-(%sp)
        jsr     core_machine_list_extend
        move.l  (%sp)+,%d0
        rts
stock_list:
        lea     -24(%sp),%sp
        movem.l %d2-%d5/%a2-%a3,(%sp)
        jmp     0x40052a10

/* Sound load (0x400db47a, 16 bytes): d0 holds the stored type byte. Stock keeps 0-6 and 0xff and turns
 * anything else into 0; the base also keeps an installed added type. Leaves d2 = 7, as the replaced
 * code does, and stores nothing itself: stock stores d0 at 0x400db48a. */
        .globl  core_machine_kit_type_entry
core_machine_kit_type_entry:
        move.l  %a0,-(%sp)
        move.l  %a1,-(%sp)
        move.l  %d0,-(%sp)
        jsr     core_machine_kit_type
        addq.l  #4,%sp
        move.l  (%sp)+,%a1
        move.l  (%sp)+,%a0
        moveq   #7,%d2
        jmp     0x400db48a

/* The SRC view's machine type (0x4005f6bc, called at 0x4001702c, 0x40017736 and 0x40017bd2): the view opens
 * its second page (SAMPLE's sample view and the like) by the type it answers and none for a type above 6, so
 * an added type answers as the stock type it stands for there. */
        .globl  core_machine_view_type_entry, core_machine_sample_draw_entry, core_machine_sample_views
/* The sample view's own draw call (0x40017ada: `move.l %a2,(%sp); jsr 0x40017728`), which runs in every frame composed
 * with the second page showing: it counts the frame for a module's ev_draw handler, then makes the stock call with
 * the caller's return. The routine it calls has other callers that run on any page while notes play (MACHINES.md). */
core_machine_sample_draw_entry:
        move.l  %a2,4(%sp)
        addq.l  #1,core_machine_sample_views
        jmp     0x40017728

core_machine_view_type_entry:
        move.l  4(%sp),-(%sp)
        jsr     0x4005f6bc
        addq.l  #4,%sp
        moveq   #7,%d1
        cmp.l   %d1,%d0
        bcs.s   1f
        move.l  %a0,-(%sp)
        move.l  %a1,-(%sp)
        move.l  %d0,-(%sp)
        move.l  %d0,-(%sp)
        jsr     core_machine_stands_for
        addq.l  #4,%sp
        move.l  (%sp)+,%d1
        move.l  (%sp)+,%a1
        move.l  (%sp)+,%a0
        tst.l   %d0
        bpl.s   1f
        move.l  %d1,%d0
1:      rts

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
