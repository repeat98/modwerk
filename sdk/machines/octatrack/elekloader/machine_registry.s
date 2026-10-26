| SPDX-License-Identifier: MIT
| The base machine registry's stock seams (events.json ot_machines and ot_sequencer_rows
| sites; machine_registry.c). Adapted from POLY8's shared machine hooks
| (sdk/octabam/modules/poly8/shared-machine-hooks.s, MIT, Sam Banks / repeat98), whose
| registration seams derive from octabam's Analog BD machine.s. Displaced stock
| instructions are zero placeholders the base build fills from the user's own OS
| (modwerk_stock_<address>_<n>): no stock byte is carried.
        .text
        .global mw_machine_name, mw_main_commit, mw_src_commit, mw_src_commit2, mw_name_a, mw_name_b
        .global mw_setup_open, mw_chooser_open, mw_setup_row, mw_chooser_row, mw_chooser_name
        .global mw_setup_edit6, mw_setup_draw6, mw_tick_hook, mw_resolve_pb, mw_validate_hook, mw_stock_validate
        .global mw_pool_open, mw_pool_title, mw_list_draw, mw_stock_pool_open, mw_stock_list_draw, mw_source_render
        .global mw_seq_draw, mw_seq_none, mw_seq_get_none, mw_seq_set_none
        .equ BANK_PTR, 0x46c82456
        .equ PART_OFF, 0x8ed80
| The machine name by chooser row (the whole stock routine: its argument at 4(sp)).
mw_machine_name:
        lea -12(%sp),%sp
        movem.l %d1/%a0-%a1,(%sp)
        move.l 16(%sp),-(%sp)
        jsr mw_name
        addq.l #4,%sp
        movem.l (%sp),%d1/%a0-%a1
        lea 12(%sp),%sp
        rts
mw_row_type:
        lea -20(%sp),%sp
        movem.l %d1/%a0-%a1,8(%sp)
        move.l %d0,(%sp)
        move.l %a0,4(%sp)
        jsr mw_type
        movem.l 8(%sp),%d1/%a0-%a1
        lea 20(%sp),%sp
        rts
mw_main_commit:
        lea -32(%sp),%sp
        movem.l %d0-%d2/%a0-%a1,12(%sp)
        move.l %a1,%d2
        add.l %d0,%d2
        addi.l #PART_OFF,%d2
        move.l %d2,(%sp)
        move.l %d1,4(%sp)
        move.l %d4,8(%sp)
        jsr mw_assign
        tst.l %d0
        bmi.s .main_refuse
        move.l %d0,%d4
        movem.l 12(%sp),%d0-%d2/%a0-%a1
        lea 32(%sp),%sp
        .globl modwerk_stock_4007981c_6
modwerk_stock_4007981c_6:
        .space 6
        jmp 0x40079822
.main_refuse:
        movem.l 12(%sp),%d0-%d2/%a0-%a1
        lea 32(%sp),%sp
        jmp 0x4007989c
mw_src_commit:
        pea 0x4005a61c
        bra.s mw_src_common
mw_src_commit2:
        pea 0x4005a856
mw_src_common:
        move.l 0x460d5c30,%d1
        lea -32(%sp),%sp
        movem.l %d0/%d2-%d3/%a0-%a1,12(%sp)
        move.l %a1,%d3
        add.l %d0,%d3
        addi.l #PART_OFF,%d3
        move.l %d3,(%sp)
        move.l %d2,4(%sp)
        move.l %d1,8(%sp)
        move.l %d1,%d3
        jsr mw_assign
        tst.l %d0
        bmi.s .src_refuse
        move.l %d0,%d1
        movem.l 12(%sp),%d0/%d2-%d3/%a0-%a1
        lea 32(%sp),%sp
        rts
.src_refuse:
        movem.l 12(%sp),%d0/%d2-%d3/%a0-%a1
        lea 32(%sp),%sp
        mvz.b (%a0),%d1
        move.l %d1,0x460d5c30
        rts
mw_setup_open:
        move.b (%a0),%d3
        move.l %d0,-(%sp)
        mvs.b %d3,%d0
        bsr mw_row_type
        move.l %d0,%d3
        move.l (%sp)+,%d0
        mvs.b %d3,%d4
        pea 0x400bb704
        jmp 0x400585e6
mw_chooser_open:
        mvs.b (%a0),%d0
        bsr mw_chooser_row_type
        move.l %d0,-(%sp)
        pea 0x460e7386
        jmp 0x40078890
mw_name_a:
        bsr mw_name_pick
        jmp 0x4003d722
mw_name_b:
        bsr mw_name_pick
        jmp 0x4004c374
mw_name_pick:
        bsr mw_row_type
        lea mw_src_names,%a0
        move.l (%a0,%d0.l*4),%d1
        rts
mw_setup_row:
        mvs.b (%a0),%d0
        lea 24(%sp),%sp
        bsr mw_row_type
        jmp 0x4003c986
| The machine chooser (double-tap TRACK) draws its six rows from the top of the screen, d2 the
| row on screen: past six rows (four machines) its list (0x460e7386, top row first) scrolls but
| the rows did not. Its names and the track's mark read the list's row, top + d2; the cursor's
| highlight is by screen row already. SRC SETUP's list adds its top itself.
mw_chooser_name:
        move.l 4(%sp),%d0
        add.l 0x460e7386,%d0
        move.l %d0,-(%sp)
        jsr mw_machine_name
        addq.l #4,%sp
        rts
mw_chooser_row:
        mvs.b (%a0),%d0
        bsr mw_chooser_row_type
        move.l %d2,%d1                  | d1 is free: both paths load it again
        add.l 0x460e7386,%d1
        cmp.l %d0,%d1
        bne.s 1f
        jmp 0x400786ce
1:      jmp 0x400786fc
mw_chooser_row_type:
        lea -20(%sp),%sp
        movem.l %d1/%a0-%a1,8(%sp)
        move.l %d0,(%sp)
        move.l %a0,4(%sp)
        jsr mw_chooser_type
        movem.l 8(%sp),%d1/%a0-%a1
        lea 20(%sp),%sp
        rts
| SRC SETUP on a machine row edits the real underlying pool's settings.
mw_pool_kind:
        move.l %a0,-(%sp)
        move.l %d1,-(%sp)
        movea.l BANK_PTR,%a0
        mvz.b 0x100b14cf,%d1
        mulu.w #6322,%d1
        adda.l %d1,%a0
        mvz.b 0x100b14cc,%d1
        adda.l #0x8eda2,%a0
        mvz.b (%a0,%d1.l),%d0
        move.l (%sp)+,%d1
        move.l (%sp)+,%a0
        rts
mw_setup_edit6:
        cmpi.l #5,%d2
        bcs.s 1f
        move.l %a3,%d0
        cmpi.l #4,%d0
        bne.s 2f
        jmp 0x4003a624
2:      bsr mw_pool_kind
        move.l %d0,%d2
1:
        .globl modwerk_stock_4003a52e_8
modwerk_stock_4003a52e_8:
        .space 8
        jmp 0x4003a536
mw_setup_draw6:
        cmpi.l #5,%d6
        bcs.s 1f
        move.l %d0,-(%sp)
        bsr mw_pool_kind
        move.l %d0,%d6
        move.l (%sp)+,%d0
1:
        .globl modwerk_stock_4003cd98_8
modwerk_stock_4003cd98_8:
        .space 8
        jmp 0x4003cda0
mw_tick_hook:
        jsr 0x4005213c                  | stock's two calls (its first is pc-relative, so it cannot be copied)
        jsr 0x4007e940
        jsr mw_ui_tick
        jmp 0x40052228
mw_resolve_pb:
        move.l %a0,-(%sp)
        jsr mw_page
        addq.l #4,%sp
        tst.l %d0
        bne.s 1f
        mvs.b %d5,%d0
        lea mw_pb_table,%a0
        jmp 0x40031ece
1:      jmp 0x40031ed6
mw_validate_hook:
        jmp mw_validate
mw_stock_validate:
        .globl modwerk_stock_40002318_8
modwerk_stock_40002318_8:
        .space 8
        jmp 0x40002320
mw_pool_open:
        lea -16(%sp),%sp
        movem.l %d0-%d1/%a0-%a1,(%sp)
        jsr mw_open_pool
        tst.l %d0
        beq.s 1f
        movem.l (%sp),%d0-%d1/%a0-%a1
        lea 16(%sp),%sp
        rts
1:      movem.l (%sp),%d0-%d1/%a0-%a1
        lea 16(%sp),%sp
mw_stock_pool_open:
        .globl modwerk_stock_400791e4_8
modwerk_stock_400791e4_8:
        .space 8
        jmp 0x400791ec
mw_pool_title:
        moveq #1,%d6
        cmpi.l #5,%d0
        bcs.s 1f
        lea -20(%sp),%sp
        movem.l %d0-%d1/%a0-%a1,4(%sp)
        move.l %d0,(%sp)
        jsr mw_row_has_pool
        tst.l %d0
        beq.s 2f
        movem.l 4(%sp),%d0-%d1/%a0-%a1
        lea 20(%sp),%sp
        jmp 0x40077b62
2:      movem.l 4(%sp),%d0-%d1/%a0-%a1
        lea 20(%sp),%sp
        jmp 0x40077b70
1:      cmp.l %d0,%d6
        bcs.s 3f
        jmp 0x40077b62
3:      jmp 0x40077b70
| The pool list drawer: the current machine's own, entered as stock's, else stock's.
mw_list_draw:
        lea -20(%sp),%sp
        movem.l %d0-%d1/%a0-%a1,4(%sp)
        jsr mw_list_target
        move.l %d0,(%sp)
        movem.l 4(%sp),%d0-%d1/%a0-%a1
        move.l (%sp),16(%sp)
        lea 16(%sp),%sp
        rts
mw_stock_list_draw:
        .globl modwerk_stock_4006d784_8
modwerk_stock_4006d784_8:
        .space 8
        jmp 0x4006d78c
mw_source_render:
        jmp mw_source_render_impl
| The frame guard's clock (machine_registry.c): the frame interrupt's entry stamps DTCN3 after stock's register save,
| and its exit times the frame before stock's restore and rte.
        .global mw_frame_entry, mw_frame_leave
mw_frame_entry:
        .globl modwerk_stock_4000aad0_8
modwerk_stock_4000aad0_8:
        .space 8
        move.l 0xfc07c00c,%d0
        move.l %d0,mw_frame_t0
        jmp 0x4000aad8
mw_frame_leave:
        jsr mw_frame_exit
        .globl modwerk_stock_4000d9a6_10
modwerk_stock_4000d9a6_10:
        .space 10
| SEQUENCER: the draw loop indexes the rows from the list's scroll offset, so contributed
| rows past the third scroll into view (Scale Quantizer's qz_draw, Tim Hastie).
mw_seq_draw:
        move.l 0x460e43d8,%d2
        lsl.l #2,%d2
        lea 32(%sp),%sp
        jmp 0x40065bd0
mw_seq_get_none:
        lea mw_seq_none,%a0
        move.l %a0,%d0
mw_seq_set_none:
        rts
mw_seq_none:
        .byte 0
        .balign 2
