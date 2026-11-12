/* Original VECTOR integration; registration seams adapted from octabam's */
/* MIT Analog BD machine.s (Sam Banks / repeat98). Replayed stock instructions */
/* are generated only in the private local build by prepare.py. */
        .text
        .global st_machine_name, st_src_names, st_main_commit
        .global st_src_commit, st_src_commit2, st_name_a, st_name_b
        .global st_setup_open, st_chooser_open, st_setup_row, st_chooser_row
        .global st_setup_edit6, st_setup_draw6, st_tick_hook
        .equ BANK_PTR, 0x46c82456
        .equ PART_OFF, 0x8ed80
st_machine_name:
        move.l 4(%sp),%d0
        cmpi.l #5,%d0
        beq.s 1f
        jmp st_name_replay
1:      lea st_name(%pc),%a0
        move.l %a0,%d0
        rts
st_src_names:
        .long 0x400b3eac,0x400b3e98,0x400b7c67,0x400b5413,0x400b7a63,st_name
st_row_type:
        lea -20(%sp),%sp
        movem.l %d1/%a0-%a1,8(%sp)
        move.l %d0,(%sp)
        move.l %a0,4(%sp)
        jsr st_type
        movem.l 8(%sp),%d1/%a0-%a1
        lea 20(%sp),%sp
        rts
st_main_commit:
        lea -32(%sp),%sp
        movem.l %d0-%d2/%a0-%a1,12(%sp)
        move.l %a1,%d2
        add.l %d0,%d2
        addi.l #PART_OFF,%d2
        move.l %d2,(%sp)
        move.l %d1,4(%sp)
        moveq #0,%d2
        cmpi.l #5,%d4
        bne.s 1f
        moveq #1,%d2
1:      move.l %d2,8(%sp)
        jsr st_assign
        cmpi.l #5,%d4
        bne.s 2f
        move.l %d0,%d4
2:      movem.l 12(%sp),%d0-%d2/%a0-%a1
        lea 32(%sp),%sp
        jmp st_main_replay
st_src_commit:
        pea 0x4005a61c
        bra.s st_src_common
st_src_commit2:
        pea 0x4005a856
st_src_common:
        move.l 0x460d5c30,%d1
        lea -32(%sp),%sp
        movem.l %d0/%d2-%d3/%a0-%a1,12(%sp)
        move.l %a1,%d3
        add.l %d0,%d3
        addi.l #PART_OFF,%d3
        move.l %d3,(%sp)
        move.l %d2,4(%sp)
        moveq #0,%d3
        cmpi.l #5,%d1
        bne.s 1f
        moveq #1,%d3
1:      move.l %d3,8(%sp)
        move.l %d1,%d3
        jsr st_assign
        cmpi.l #5,%d3
        beq.s 2f
        move.l %d3,%d0
2:      move.l %d0,%d1
        movem.l 12(%sp),%d0/%d2-%d3/%a0-%a1
        lea 32(%sp),%sp
        rts
st_setup_open:
        move.b (%a0),%d3
        move.l %d0,-(%sp)
        mvs.b %d3,%d0
        bsr st_row_type
        move.l %d0,%d3
        move.l (%sp)+,%d0
        mvs.b %d3,%d4
        pea 0x400bb704
        jmp 0x400585e6
st_chooser_open:
        mvs.b (%a0),%d0
        bsr st_chooser_row_type
        move.l %d0,-(%sp)
        pea 0x460e7386
        jmp 0x40078890
st_name_a:
        bsr st_name_pick
        jmp 0x4003d722
st_name_b:
        bsr st_name_pick
        jmp 0x4004c374
st_name_pick:
        bsr st_row_type
        lea st_src_names(%pc),%a0
        move.l (%a0,%d0.l*4),%d1
        rts
st_setup_row:
        mvs.b (%a0),%d0
        lea 24(%sp),%sp
        bsr st_row_type
        jmp 0x4003c986
st_chooser_row:
        mvs.b (%a0),%d0
        bsr st_chooser_row_type
        cmp.l %d0,%d2
        bne.s 1f
        jmp 0x400786ce
1:      jmp 0x400786fc
st_chooser_row_type:
        lea -20(%sp),%sp
        movem.l %d1/%a0-%a1,8(%sp)
        move.l %d0,(%sp)
        move.l %a0,4(%sp)
        jsr st_chooser_type
        movem.l 8(%sp),%d1/%a0-%a1
        lea 20(%sp),%sp
        rts
/* SRC SETUP on row five edits the real underlying pool's settings. */
st_pool_kind:
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
st_setup_edit6:
        cmpi.l #5,%d2
        bne.s 1f
        lea -28(%sp),%sp
        movem.l %d0-%d1/%a0-%a1,12(%sp)
        move.l %a3,(%sp)
        move.l %d3,4(%sp)
        jsr st_setup_knob
        move.l %d0,8(%sp)
        movem.l 12(%sp),%d0-%d1/%a0-%a1
        tst.l 8(%sp)
        lea 28(%sp),%sp
        beq.s 2f
        jmp 0x4003a624
2:
        bsr st_pool_kind
        move.l %d0,%d2
1:      jmp st_edit_replay
st_setup_draw6:
        cmpi.l #5,%d6
        bne.s 1f
        lea -20(%sp),%sp
        movem.l %d0-%d1/%a0-%a1,4(%sp)
        move.l 92(%sp),(%sp)
        jsr st_setup_page
        move.l %d0,92(%sp)
        movem.l 4(%sp),%d0-%d1/%a0-%a1
        lea 20(%sp),%sp
        move.l %d0,-(%sp)
        bsr st_pool_kind
        move.l %d0,%d6
        move.l (%sp)+,%d0
1:      jmp st_draw_replay
st_tick_hook:
        jsr 0x4005213c
        jsr 0x4007e940
        jsr st_ui_tick
        jmp 0x40052228
st_name:
        .asciz "VECTOR"
        .data
        .balign 4
        .global st_layer, st_edit_layer
st_layer:
        .long 0,st_keys,st_encs,0,0,-1,-1
st_edit_layer:
        .long 0,st_keys,0,0,0,-1,-1
st_keys:
        .irp k,0x31,0x3e
        .byte \k,0
        .long st_key,st_key,st_key,0,0
        .word 0,0
        .endr
        .byte 0xff,0
        .long 0,0,0,0,0
        .word 0,0
st_encs:
        .irp k,0,1,2,3,4,5
        .byte \k,0
        .long st_knob,0,0,0,0
        .endr
        .byte 0xff,0
        .long 0,0,0,0,0

/* Only the stock parameter-page DRAW call chooses the generator descriptor.
 * The parameter resolver and every playback/editor consumer remain stock. */
        .text
        .balign 2
        .global st_src_draw
st_src_draw:
        pea -1.w
        pea -1.w
        jsr st_draw_page
        jmp 0x4004e4d0

/* Stock double-tap TRACK enters the VECTOR backing-pool modal. */
        .global st_pool_open, st_stock_pool_open, st_list_draw, st_pool_title
st_pool_open:
        lea -16(%sp),%sp
        movem.l %d0-%d1/%a0-%a1,(%sp)
        jsr st_selected
        tst.l %d0
        beq.s .pool_stock
        movem.l (%sp),%d0-%d1/%a0-%a1
        lea 16(%sp),%sp
        jmp st_pool_choice_open
.pool_stock:
        movem.l (%sp),%d0-%d1/%a0-%a1
        lea 16(%sp),%sp
st_stock_pool_open:
        move.l %a2,-(%sp)
        tst.l 0x460e70e0
        jmp 0x400791ec
st_list_draw:
        lea -16(%sp),%sp
        movem.l %d0-%d1/%a0-%a1,(%sp)
        jsr st_pool_choice_draw
        tst.l %d0
        beq.s .list_stock
        movem.l (%sp),%d0-%d1/%a0-%a1
        lea 16(%sp),%sp
        rts
.list_stock:
        movem.l (%sp),%d0-%d1/%a0-%a1
        lea 16(%sp),%sp
        lea -24(%sp),%sp
        movem.l %d2-%d3/%a2-%a5,(%sp)
        jmp 0x4006d78c
st_pool_title:
        moveq #1,%d6
        cmpi.l #5,%d0
        bne.s .title_stock
        lea -16(%sp),%sp
        movem.l %d0-%d1/%a0-%a1,(%sp)
        jsr st_selected
        tst.l %d0
        beq.s .title_unsigned
        movem.l (%sp),%d0-%d1/%a0-%a1
        lea 16(%sp),%sp
        bra.s .title_pool
.title_unsigned:
        movem.l (%sp),%d0-%d1/%a0-%a1
        lea 16(%sp),%sp
.title_stock:
        cmp.l %d0,%d6
        bcs.s .title_plain
.title_pool:
        jmp 0x40077b62
.title_plain:
        jmp 0x40077b70

/* Validate the rest of each Part with the real stock routine. */
        .text
        .balign 2
        .global st_validate, st_stock_validate
st_validate:
        jmp st_validate_part
st_stock_validate:
        lea -96(%sp),%sp
        movem.l %d2-%d7/%a2-%fp,(%sp)
        jmp 0x40002320
