/* Original POLY integration; registration seams adapted from octabam's */
/* MIT Analog BD machine.s (Sam Banks / repeat98). Replayed stock instructions */
/* are generated only in the private local build by prepare.py. */
        .text
        .global mr_machine_name, mr_src_names, mr_main_commit
        .global mr_src_commit, mr_src_commit2, mr_name_a, mr_name_b
        .global mr_setup_open, mr_chooser_open, mr_setup_row, mr_chooser_row, mr_chooser_name
        .global mr_setup_edit6, mr_setup_draw6, mr_tick_hook
        .equ BANK_PTR, 0x46c82456
        .equ PART_OFF, 0x8ed80
mr_machine_name:
        lea -12(%sp),%sp
        movem.l %d1/%a0-%a1,(%sp)
        move.l 16(%sp),-(%sp)
        jsr mr_name
        addq.l #4,%sp
        movem.l (%sp),%d1/%a0-%a1
        lea 12(%sp),%sp
        rts
mr_row_type:
        lea -20(%sp),%sp
        movem.l %d1/%a0-%a1,8(%sp)
        move.l %d0,(%sp)
        move.l %a0,4(%sp)
        jsr mr_type
        movem.l 8(%sp),%d1/%a0-%a1
        lea 20(%sp),%sp
        rts
mr_main_commit:
        lea -32(%sp),%sp
        movem.l %d0-%d2/%a0-%a1,12(%sp)
        move.l %a1,%d2
        add.l %d0,%d2
        addi.l #PART_OFF,%d2
        move.l %d2,(%sp)
        move.l %d1,4(%sp)
        move.l %d4,8(%sp)
        jsr mr_assign
        tst.l %d0
        bmi.s .main_refuse
        move.l %d0,%d4
        movem.l 12(%sp),%d0-%d2/%a0-%a1
        lea 32(%sp),%sp
        jmp pm_main_replay
.main_refuse:
        movem.l 12(%sp),%d0-%d2/%a0-%a1
        lea 32(%sp),%sp
        jmp 0x4007989c
mr_src_commit:
        pea 0x4005a61c
        bra.s mr_src_common
mr_src_commit2:
        pea 0x4005a856
mr_src_common:
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
        jsr mr_assign
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
mr_setup_open:
        move.b (%a0),%d3
        move.l %d0,-(%sp)
        mvs.b %d3,%d0
        bsr mr_row_type
        move.l %d0,%d3
        move.l (%sp)+,%d0
        mvs.b %d3,%d4
        pea 0x400bb704
        jmp 0x400585e6
mr_chooser_open:
        mvs.b (%a0),%d0
        bsr mr_chooser_row_type
        move.l %d0,-(%sp)
        pea 0x460e7386
        jmp 0x40078890
mr_name_a:
        bsr mr_name_pick
        jmp 0x4003d722
mr_name_b:
        bsr mr_name_pick
        jmp 0x4004c374
mr_name_pick:
        bsr mr_row_type
        lea mr_src_names(%pc),%a0
        move.l (%a0,%d0.l*4),%d1
        rts
mr_setup_row:
        mvs.b (%a0),%d0
        lea 24(%sp),%sp
        bsr mr_row_type
        jmp 0x4003c986
| The machine chooser (double-tap TRACK) draws six rows from the top of the
| screen, d2 the row on screen. Past six rows (POLY8 beside VECTOR, FM Synth
| or Analog BD) its list (0x460e7386, top row first) scrolls but the rows did
| not: names and the track's mark read the list's row, top + d2, as the USB
| base's mw_chooser_name/mw_chooser_row do. The highlight is by screen row.
mr_chooser_name:
        move.l 4(%sp),%d0
        add.l 0x460e7386,%d0
        move.l %d0,-(%sp)
        jsr mr_machine_name
        addq.l #4,%sp
        rts
mr_chooser_row:
        mvs.b (%a0),%d0
        bsr mr_chooser_row_type
        move.l %d2,%d1                  | d1 is free: both paths load it again
        add.l 0x460e7386,%d1
        cmp.l %d0,%d1
        bne.s 1f
        jmp 0x400786ce
1:      jmp 0x400786fc
mr_chooser_row_type:
        lea -20(%sp),%sp
        movem.l %d1/%a0-%a1,8(%sp)
        move.l %d0,(%sp)
        move.l %a0,4(%sp)
        jsr mr_chooser_type
        movem.l 8(%sp),%d1/%a0-%a1
        lea 20(%sp),%sp
        rts
/* SRC SETUP on row five edits the real underlying pool's settings. */
mr_pool_kind:
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
mr_setup_edit6:
        cmpi.l #5,%d2
        bcs.s 1f
        move.l %a3,%d0
        cmpi.l #4,%d0
        bne.s 2f
        jmp 0x4003a624
2:      bsr mr_pool_kind
        move.l %d0,%d2
1:      jmp pm_edit_replay
mr_setup_draw6:
        cmpi.l #5,%d6
        bcs.s 1f
        move.l %d0,-(%sp)
        bsr mr_pool_kind
        move.l %d0,%d6
        move.l (%sp)+,%d0
1:      jmp pm_draw_replay
mr_tick_hook:
        jsr 0x4005213c
        jsr 0x4007e940
        jsr mr_ui_tick
        jmp 0x40052228

        .global mr_resolve_pb, mr_validate_hook, mr_stock_validate
mr_resolve_pb:
        move.l %a0,-(%sp)
        jsr mr_page
        addq.l #4,%sp
        tst.l %d0
        bne.s 1f
        mvs.b %d5,%d0
        lea mr_pb_table,%a0
        jmp 0x40031ece
1:      jmp 0x40031ed6
mr_validate_hook:
        jmp mr_validate
mr_stock_validate:
        lea -96(%sp),%sp
        movem.l %d2-%d7/%a2-%fp,(%sp)
        jmp 0x40002320

        .global mr_pool_open, mr_pool_title, mr_list_draw
mr_pool_open:
        lea -16(%sp),%sp
        movem.l %d0-%d1/%a0-%a1,(%sp)
        jsr mr_open_pool
        tst.l %d0
        beq.s 1f
        movem.l (%sp),%d0-%d1/%a0-%a1
        lea 16(%sp),%sp
        rts
1:      movem.l (%sp),%d0-%d1/%a0-%a1
        lea 16(%sp),%sp
        jmp pm_stock_pool_open
mr_pool_title:
        moveq #1,%d6
        cmpi.l #5,%d0
        bcs.s 1f
        lea -20(%sp),%sp
        movem.l %d0-%d1/%a0-%a1,4(%sp)
        move.l %d0,(%sp)
        jsr mr_row_has_pool
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
mr_list_draw:
        lea -20(%sp),%sp
        movem.l %d0-%d1/%a0-%a1,4(%sp)
        jsr mr_list_target
        move.l %d0,(%sp)
        movem.l 4(%sp),%d0-%d1/%a0-%a1
        move.l (%sp),16(%sp)
        lea 16(%sp),%sp
        rts

| Dispatch the overlapping audio/key sites without altering the entry ABI.
| Every absent weak target resolves to zero; the POLY path replays stock.
        .weak rate_hook, qz_octkey, qz_octnum, po_mon, po_moff
        .global mr_rate_hook, mr_octkey, mr_octnum, mr_note_on, mr_note_off
        .macro MR_NEXT target, fallback
        move.l #\target,-(%sp)
        tst.l (%sp)
        beq.s 9f
        rts
9:      addq.l #4,%sp
        jmp \fallback
        .endm
        .macro MR_TRACK input,poly_target
        lea -16(%sp),%sp
        movem.l %d0-%d1/%a0-%a1,(%sp)
        \input
        jsr poly_is_track
        tst.l %d0
        beq.s 8f
        movem.l (%sp),%d0-%d1/%a0-%a1
        lea 16(%sp),%sp
        jmp \poly_target
8:      movem.l (%sp),%d0-%d1/%a0-%a1
        lea 16(%sp),%sp
        .endm
mr_rate_hook:
        MR_TRACK "move.l 68(%sp),%d0",poly_increment_shift
        MR_NEXT rate_hook,poly_increment_shift
mr_octkey:
        tst.l 0x80000012
        bne.s .mr_octkey_midi
        MR_TRACK "mvz.b 0x100b14cc,%d0",poly_octave_button
.mr_octkey_midi:
        MR_NEXT qz_octkey,poly_octave_button
mr_octnum:
        tst.l 0x80000012
        bne.s .mr_octnum_midi
        MR_TRACK "mvz.b 0x100b14cc,%d0",poly_oct_number
        move.l 0x460d16fc,%d0
.mr_octnum_midi:
        MR_NEXT qz_octnum,poly_oct_number
mr_note_on:
        MR_TRACK "move.l %d2,%d0",poly_midi_note_on
        MR_NEXT po_mon,poly_midi_note_on
mr_note_off:
        MR_TRACK "move.l %d2,%d0",poly_midi_note_off
        MR_NEXT po_moff,poly_midi_note_off

        .global mr_stop_voice
mr_stop_voice:
        tst.l poly_voice_selector
        bne.s 1f
        tst.l poly_rendering
        bne.s 1f
        lea -20(%sp),%sp
        movem.l %d0-%d1/%a0-%a1,4(%sp)
        move.l 24(%sp),(%sp)
        jsr mr_mute_suppressed
        tst.l %d0
        beq.s 2f
        movem.l 4(%sp),%d0-%d1/%a0-%a1
        lea 20(%sp),%sp
        rts
2:      movem.l 4(%sp),%d0-%d1/%a0-%a1
        lea 20(%sp),%sp
1:      jmp poly_stop_voice

| Authored bounded name table in the existing validated chooser section.
        .text
        .balign 4
mr_src_names:
        .long 0x400b3eac,0x400b3e98,0x400b7c67,0x400b5413,0x400b7a63
        .long 0,0,0,0

| Preserve FM's complete published pointer ABI. Its bundled quantizer uses
| the legato/key helpers and HOLD table as well as the playback descriptor.
| Explicit composition exports expose existing local labels without changing
| the upstream engine's bytes. Absent FM helpers resolve to zero.
        .text
        .balign 4
        .weak po_octave,po_legkey,po_legmode,po_keyrel,po_knob,po_keyrec,po_hold128,po_pgdesc
        .long po_octave,po_legkey,po_legmode,po_keyrel,po_knob,po_keyrec,po_hold128,po_pgdesc
        .global mr_source_render
mr_source_render:
        jmp mr_source_render_impl

| Nine authored placeholders; the native stock table supplies rows 0..4 at
| runtime, and each selected machine supplies its own descriptor.
        .text
        .balign 4
        .global mr_pb_table
mr_pb_table:
        .space 36
