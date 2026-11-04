| SPDX-License-Identifier: MIT
| SPDX-FileCopyrightText: 2026 jonathanwardle1992-beep
| Micro Timing per track. TRACK TRIG EDIT gains MICRO T under TRIGS.
|
| LEVEL rewrites every step of the selected track through the stock
| per-trig writer. MIDI button off writes the audio field. MIDI button
| on writes the MIDI field. The other side is left alone. The footer
| uses the stock fractions. The lane is dashes, a centre 0, and a cursor.
| The remembered number lives in battery RAM until power-off. The trigs
| stay in the pattern. This unit does not keep its own clock.

    .text

    .global mt_level
    .global mt_label
    .global mt_footer
    .global mt_force1
    .global mt_hide_slide_label
    .global mt_hide_slide_grid
    .global mt_mode4
    .global mt_label_origin
    .global mt_label_limit
    .global mt_grid_origin
    .global mt_grid_step
    .global mt_lane_row
mt_level:
    move.l 0x460e73e4, %d0
    cmpi.l #0x1, %d0
    bne.w mt_level_stock
    move.l 0x8(%a7), %d2
    lea -0x2c(%a7), %a7
    movem.l %d2-%d7/%a2-%a6, (%a7)
    jsr mt_apply
    movem.l (%a7), %d2-%d7/%a2-%a6
    lea 0x2c(%a7), %a7
    jmp 0x4007b780
mt_level_stock:
    jmp 0x4007bd64
mt_label:
    jsr 0x40033970
    tst.l %d0
    beq.w mt_label_stock
    cmpi.l #0x1, %d2
    bne.w mt_label_stock
    pea mt_micro
    bra.w mt_label_ff
mt_label_stock:
    move.l (%a3), -(%a7)
mt_label_ff:
    pea 0xffff.w
    jmp 0x4007b874
mt_footer:
    move.l 0x460e73e4, %d0
    cmpi.l #0x1, %d0
    bne.w mt_footer_stock
    jsr mt_format
mt_footer_draw:
    pea 0x25.w
    pea mt_strbuf
    pea mt_strbuf
    clr.l -(%a7)
    clr.l -(%a7)
    pea 0x6.w
    pea 0x6.w
    move.l %a4, -(%a7)
    pea 0x400ba876
    jsr 0x40013904
    lea 0x24(%a7), %a7
    jmp 0x4007b9e0
mt_footer_stock:
    jsr 0x40033990
    jmp 0x4007b9ae
mt_format:
    jsr mt_current
    move.l %d0, %d1
    lea mt_strbuf, %a0
    move.b #0x4d, (%a0)+
    move.b #0x54, (%a0)+
    moveq #0x0, %d0
    move.b 0x100b14cc, %d0
    andi.l #0x7, %d0
    addq.l #0x1, %d0
    addi.l #0x30, %d0
    move.b %d0, (%a0)+
    move.b #0x3a, (%a0)+
    jsr mt_write_metric
    rts
mt_current:
    jsr mt_ensure
    moveq #0x0, %d0
    move.b 0x800065bd, %d0
    andi.l #0xf, %d0
    lsl.l #0x7, %d0
    moveq #0x0, %d1
    move.b 0x100b14d0, %d1
    andi.l #0xf, %d1
    lsl.l #0x3, %d1
    add.l %d1, %d0
    moveq #0x0, %d1
    move.b 0x100b14cc, %d1
    andi.l #0x7, %d1
    add.l %d1, %d0
    lea 0x100f9000, %a0
    adda.l %d0, %a0
    move.b (%a0), %d0
    ext.w %d0
    ext.l %d0
    rts
mt_ensure:
    move.l 0x100f8ffc, %d0
    cmpi.l #0x4d54494d, %d0
    beq.w mt_ensure_ok
    lea 0x100f9000, %a0
    move.l #0x200, %d0
mt_ensure_loop:
    clr.l (%a0)+
    subq.l #0x1, %d0
    bne.w mt_ensure_loop
    move.l #0x4d54494d, %d0
    move.l %d0, 0x100f8ffc
mt_ensure_ok:
    rts
mt_apply:
    cmpi.l #0x17, %d2
    ble.w mt_apply_dlo
    moveq #0x17, %d2
    bra.w mt_apply_dok
mt_apply_dlo:
    cmpi.l #0xffffffe9, %d2
    bge.w mt_apply_dok
    moveq #-0x17, %d2
mt_apply_dok:
    tst.l %d2
    beq.w mt_apply_rts
    jsr mt_current
    move.l %d0, %d3
    add.l %d2, %d0
    cmpi.l #0x17, %d0
    ble.w mt_apply_nlo
    moveq #0x17, %d0
    bra.w mt_apply_nok
mt_apply_nlo:
    cmpi.l #0xffffffe9, %d0
    bge.w mt_apply_nok
    moveq #-0x17, %d0
mt_apply_nok:
    move.b %d0, (%a0)
    cmp.l %d3, %d0
    beq.w mt_apply_rts
    move.l %d0, %d6
    jsr mt_rewrite
    jsr mt_dirty
mt_apply_rts:
    rts
mt_rewrite:
    move.l 0x460d1018, %d0
    move.l %d0, -(%a7)
    jsr 0x40033970
    tst.l %d0
    beq.w mt_rewrite_audio
    moveq #0x2, %d0
    bra.w mt_rewrite_set
mt_rewrite_audio:
    moveq #0x0, %d0
mt_rewrite_set:
    move.l %d0, 0x460d1018
    jsr mt_steps
    move.l (%a7)+, %d0
    move.l %d0, 0x460d1018
    rts
mt_steps:
    moveq #0x0, %d4
mt_step:
    move.l %d4, -(%a7)
    move.l %d6, -(%a7)
    move.l %d6, -(%a7)
    move.l %d4, -(%a7)
    jsr 0x4002d640
    lea 0x8(%a7), %a7
    move.l (%a7)+, %d6
    move.l (%a7)+, %d4
    addq.l #0x1, %d4
    cmpi.l #0x40, %d4
    blt.w mt_step
    rts
mt_dirty:
    movea.l 0x46c82456, %a1
    movea.l %a1, %a0
    adda.l #0x9b332, %a0
    moveq #0x1, %d0
    move.l %d0, (%a0)
    move.l %d0, 0x100f8598
    jsr 0x40027e00
    moveq #0x0, %d0
    move.b 0x100b14cc, %d0
    andi.l #0x7, %d0
    move.l %d0, -(%a7)
    jsr 0x4009da20
    lea 0x4(%a7), %a7
    moveq #0x0, %d0
    move.b 0x100b14cc, %d0
    andi.l #0x7, %d0
    addq.l #0x8, %d0
    move.l %d0, -(%a7)
    jsr 0x4009da20
    lea 0x4(%a7), %a7
    rts
mt_force1:
    pea 0x1.w
    pea 0x460e73dc
    jsr 0x4007edb0
    lea 0x8(%a7), %a7
    rts
mt_hide_slide_label:
    cmpi.l #0x0, %d2
    beq.w mt_hide_slide_label_yes
    cmpi.l #0x2, %d2
    bne.w mt_hide_slide_label_no
mt_hide_slide_label_yes:
    jmp 0x4007b8ae
mt_hide_slide_label_no:
    jmp 0x4007b86e
mt_hide_slide_grid:
    cmpi.l #0x0, %d7
    beq.w mt_hide_slide_grid_yes
    cmpi.l #0x2, %d7
    bne.w mt_hide_slide_grid_no
mt_hide_slide_grid_yes:
    jmp 0x4007bd24
mt_hide_slide_grid_no:
    jmp 0x4007bac4
mt_mode4:
    move.l 0x4(%a7), %d0
    cmpi.l #0x4, %d0
    bls.w mt_mode4_ok
    moveq #0x4, %d0
mt_mode4_ok:
    move.l %d0, 0x460d5db4
    clr.l 0x4(%a7)
    jmp 0x4007e998
mt_label_origin:
    move.l 0x460e73dc, %d2
    move.l %d2, %d0
    lsl.l #0x2, %d0
    adda.l %d0, %a3
    movea.w #0x27, %a2
    jmp 0x4007b7fe
mt_label_limit:
    pea 0x460e73dc
    movea.l %d4, %a1
    jsr (%a1)
    addq.l #0x4, %a7
    add.l 0x460e73dc, %d0
    cmpi.l #0x5, %d0
    ble.w mt_label_capped
    moveq #0x5, %d0
mt_label_capped:
    jmp 0x4007b8c0
mt_grid_origin:
    move.l 0x460e73dc, %d7
    movea.w #0x28, %a3
    jmp 0x4007ba5e
mt_grid_step:
    addq.l #0x1, %d7
    subq.l #0x7, %a3
    move.l 0x460e73dc, %d1
    addq.l #0x4, %d1
    cmpi.l #0x5, %d1
    ble.w mt_grid_capped
    moveq #0x5, %d1
mt_grid_capped:
    cmp.l %d7, %d1
    beq.w mt_grid_done
    jmp 0x4007ba6a
mt_grid_done:
    jmp 0x4007bd30
mt_lane_row:
    cmpi.l #0x1, %d7
    bne.w mt_lane_stock
    move.l %a3, %d0
    addq.l #0x1, %d0
    movea.l %d0, %a2
    moveq #0x0, %d6
    moveq #0x29, %d5
mt_dash_loop:
    pea 0x1.w
    move.l %a2, -(%a7)
    move.l %d5, -(%a7)
    move.l %a2, -(%a7)
    move.l %d5, %d0
    subq.l #0x1, %d0
    move.l %d0, -(%a7)
    move.l %a4, -(%a7)
    jsr 0x40012254
    lea 0x18(%a7), %a7
    addq.l #0x3, %d5
    addq.l #0x1, %d6
    cmpi.l #0x10, %d6
    blt.w mt_dash_loop
    pea mt_zero
    pea 0xffff.w
    move.l %a3, %d0
    subq.l #0x1, %d0
    move.l %d0, -(%a7)
    pea 0x3d.w
    move.l %a4, -(%a7)
    pea 0x400ba876
    jsr 0x40012bd8
    lea 0x18(%a7), %a7
    jsr mt_current
    addi.l #0x3e, %d0
    cmpi.l #0x56, %d0
    blt.w mt_cursor_lo
    moveq #0x55, %d0
mt_cursor_lo:
    cmpi.l #0x28, %d0
    bge.w mt_cursor_x
    moveq #0x28, %d0
mt_cursor_x:
    move.l %d0, %d5
    move.l %a3, %d0
    subq.l #0x2, %d0
    move.l %a3, %d1
    addq.l #0x3, %d1
    pea 0x1.w
    move.l %d1, -(%a7)
    move.l %d5, -(%a7)
    move.l %d0, -(%a7)
    move.l %d5, -(%a7)
    move.l %a4, -(%a7)
    jsr 0x40012254
    lea 0x18(%a7), %a7
    jmp 0x4007bcfc
mt_lane_stock:
    movea.l 0x46c82456, %a0
    jmp 0x4007bc48
mt_write_metric:
    tst.l %d1
    beq.w mt_metric_grid
    bmi.w mt_metric_neg
    move.b #0x2b, (%a0)+
    bra.w mt_metric_copy
mt_metric_neg:
    move.b #0x2d, (%a0)+
    neg.l %d1
mt_metric_copy:
    lea 0x400b2528, %a1
    move.l %d1, %d0
    lsl.l #0x2, %d0
    adda.l %d0, %a1
    movea.l (%a1), %a1
    bra.w mt_metric_chars
mt_metric_grid:
    lea 0x400b4024, %a1
mt_metric_chars:
    move.b (%a1)+, %d0
    move.b %d0, (%a0)+
    bne.w mt_metric_chars
    rts

    .align 2
    .global mt_micro
mt_micro:
    .asciz "MICRO T"
    .align 2
    .global mt_strbuf
mt_strbuf:
    .fill 16, 1, 0
    .global mt_zero
mt_zero:
    .asciz "0"
    .align 2
    .global mt_names
mt_names:
    .long 0x400b4ac0
    .long mt_micro
    .long 0x400b4af9
    .long 0x400b4b3d
    .long 0x400b73bf
