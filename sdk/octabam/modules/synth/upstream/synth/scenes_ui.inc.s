| FM SYNTH setup scene editor, adapted from the development setup-scene UI.
| VOIC and CHRD only: raw one-detent turns; held trig takes precedence.
| Press an absent scene control to assign its Part default. A press/release
| without a turn clears an existing assignment, as the stock scene gesture.
        .global fs_ui_edit, fs_ui_value, fs_ui_entry
        .global fs_ui_knob_a_hook, fs_ui_knob_b_hook, fs_ui_key_a_hook, fs_ui_key_b_hook

| d0 = 1 iff the visible PLAYBACK SETUP is a synth track's and a scene is held with no
| trig held (a held trig keeps the turn for the step locks).
| Every other register kept.
fs_ui_context:
        lea     -12(%sp),%sp
        movem.l %d1-%d2/%a0,(%sp)
        move.l  0x400bcd14,%d0
        cmpi.l  #0x400bb7c8,%d0          | the setup window is the active one
        bne     fs_uc_no
        tst.l   0x400bb7d0
        beq     fs_uc_no
        tst.l   0x80000012
        bne     fs_uc_no
        tst.l   0x460d5db4
        bne     fs_uc_no
        tst.l   0x460d169c               | 1 scene A held / 2 scene B
        beq     fs_uc_no
        tst.w   0x460d174a
        bne     fs_uc_no
        mvz.b   0x100b14ce,%d0
        cmpi.l  #15,%d0
        bhi     fs_uc_no
        mvz.b   0x100b14cc,%d2
        cmpi.l  #7,%d2
        bhi     fs_uc_no
        mvz.b   PART_IDX,%d0
        cmpi.l  #3,%d0
        bhi     fs_uc_no
        move.l  PART_PTR,%d0
        cmpi.l  #0x40000000,%d0
        bcs     fs_uc_no
        cmpi.l  #0x48000000,%d0
        bcc     fs_uc_no
        jsr     po_fm_kind:l
        tst.l   %d0
        beq     fs_uc_no
        moveq   #1,%d0
        bra     fs_uc_out
fs_uc_no:
        moveq   #0,%d0
fs_uc_out:
        movem.l (%sp),%d1-%d2/%a0
        lea     12(%sp),%sp
        rts

| -> d0 bank, d1 part, d2 the held side's selected scene, d3 track (the UI's), a0 =
| the row. Call after fs_ui_context. A selection out of range gives the FF row.
fs_ui_row:
        mvz.b   PART_IDX,%d1
        move.l  #6322,%d0
        mulu.l  %d1,%d0
        movea.l PART_PTR,%a0
        adda.l  %d0,%a0
        adda.l  #0x8ed90,%a0
        moveq   #2,%d0
        cmp.l   0x460d169c,%d0
        bne     fs_ur_a
        addq.l  #1,%a0                   | scene B's selection
fs_ur_a:
        mvz.b   (%a0),%d2
        mvz.b   0x100b14ce,%d0
        mvz.b   0x100b14cc,%d3
        jmp     fl_scene_row:l

| a3 = control, d3 = the raw detent delta. d0 = 1 when a scene owns the
| gesture (the caller must then not store the Part default). Other registers kept.
fs_ui_edit:
        lea     -52(%sp),%sp
        movem.l %d1-%d7/%a0-%a5,(%sp)
        bsr     fs_ui_context
        tst.l   %d0
        beq     fs_ue_out
        moveq   #0,%d0
        cmpa.l  #2,%a3
        bcc     fs_ue_out                | the remaining setup controls stay stock
        bsr     fs_ui_readable
        tst.l   %d0
        beq     fs_ue_handled
        move.l  %a3,%d4
        move.l  %d3,%d1
        jsr     po_voic_steps:l          | VOIC: one step a stock threshold (setup.inc.s)
        movea.l %d1,%a4
        moveq   #1,%d0
        move.l  %d0,0x460d1698           | turned: the release must not remove it
        bsr     fs_ui_row
        mvz.b   (%a0,%d4.l),%d5
        cmpi.l  #255,%d5
        bne     fs_ue_have
        bsr     fs_ui_default            | not assigned yet: start from the Part default
fs_ue_have:
        add.l   %a4,%d5
        bpl     fs_ue_pos
        moveq   #0,%d5
fs_ue_pos:
        tst.l   %d4
        bne     fs_ue_min
        tst.l   %d5
        bne     fs_ue_min
        moveq   #1,%d5
fs_ue_min:
        bsr     fs_ui_max
        mvz.b   (%a0,%d4.l),%d6
        cmp.l   %d6,%d5
        bls     fs_ue_write
        move.l  %d6,%d5
fs_ue_write:
        jsr     fl_scene_write:l
        cmpi.l  #1,%d0
        bne     fs_ue_handled
        bsr     fs_ui_changed
fs_ue_handled:
        moveq   #2,%d0
        move.b  %d0,fs_ui_entry:l        | (diagnostic: 2 = the setup window's callback, 1 = a scene handler detour)
        moveq   #1,%d0
fs_ue_out:
        movem.l (%sp),%d1-%d7/%a0-%a5
        lea     52(%sp),%sp
        rts

| The marks stock's scene editors leave (0x40053498): the Part is dirty (bank + 0x95048
| and 0x100b145e, bit = part), the bank and the project changed, the edited side.
fs_ui_changed:
        lea     -16(%sp),%sp
        movem.l %d0-%d1/%a0-%a1,(%sp)
        mvz.b   PART_IDX,%d1
        moveq   #1,%d0
        lsl.l   %d1,%d0
        movea.l PART_PTR,%a0
        adda.l  #0x95048,%a0
        mvz.b   (%a0),%d1
        or.l    %d0,%d1
        move.b  %d1,(%a0)
        mvz.b   0x100b145e,%d1
        or.l    %d0,%d1
        move.b  %d1,0x100b145e
        movea.l PART_PTR,%a0
        adda.l  #0x9b332,%a0
        moveq   #1,%d0
        move.l  %d0,(%a0)
        move.l  %d0,0x100f8598
        jsr     0x40027e00
        move.l  0x460d169c,%d0
        move.l  %d0,0x460d1694
        movem.l (%sp),%d0-%d1/%a0-%a1
        lea     16(%sp),%sp
        rts

| d4 = control -> d0 = the held scene's value for it on the visible setup page, or 255
| (no scene held / not assigned). Other registers kept. The widget wrapper's question.
fs_ui_value:
        lea     -20(%sp),%sp
        movem.l %d1-%d3/%a0-%a1,(%sp)
        cmpi.l  #1,%d4
        bhi     fs_uv_no
        bsr     fs_ui_context
        tst.l   %d0
        beq     fs_uv_no
        bsr     fs_ui_readable
        tst.l   %d0
        beq     fs_uv_no
        bsr     fs_ui_row
        mvz.b   (%a0,%d4.l),%d0
        cmpi.l  #255,%d0
        bne     fs_uv_out
fs_uv_no:
        move.l  #255,%d0
fs_uv_out:
        movem.l (%sp),%d1-%d3/%a0-%a1
        lea     20(%sp),%sp
        rts

| The four stock scene handlers, entered by detour (8 displaced bytes each). The held
| side is 0x460d169c, whichever function stock entered. (2.18) A gesture that is not FM
| SYNTH's goes on to SY DRUM's handler when SY DRUM is in the remix, which replays the
| displaced instructions itself.
fs_ui_knob_a_hook:
        bsr     fs_ui_knob
        tst.l   %d0
        bne     fs_uh_done
        .if HAVE_SYDRUM
        jmp     sc_ui_knob_a_hook:l      | SY DRUM's setup scenes (sy-drum/scenes_ui.inc.s), then stock
        .else
        lea     -36(%sp),%sp
        movem.l %d2-%d7/%a2-%a4,(%sp)
        jmp     0x400534a0
        .endif
fs_ui_knob_b_hook:
        bsr     fs_ui_knob
        tst.l   %d0
        bne     fs_uh_done
        .if HAVE_SYDRUM
        jmp     sc_ui_knob_b_hook:l      | SY DRUM's setup scenes (sy-drum/scenes_ui.inc.s), then stock
        .else
        lea     -32(%sp),%sp
        movem.l %d2-%d7/%a2-%a3,(%sp)
        jmp     0x40052ea0
        .endif
fs_ui_key_a_hook:
        bsr     fs_ui_key
        tst.l   %d0
        bne     fs_uh_done
        .if HAVE_SYDRUM
        jmp     sc_ui_key_a_hook:l      | SY DRUM's setup scenes (sy-drum/scenes_ui.inc.s), then stock
        .else
        lea     -40(%sp),%sp
        movem.l %d2-%d7/%a2-%a5,(%sp)
        jmp     0x40054364
        .endif
fs_ui_key_b_hook:
        bsr     fs_ui_key
        tst.l   %d0
        bne     fs_uh_done
        .if HAVE_SYDRUM
        jmp     sc_ui_key_b_hook:l      | SY DRUM's setup scenes (sy-drum/scenes_ui.inc.s), then stock
        .else
        lea     -44(%sp),%sp
        movem.l %d2-%d7/%a2-%a6,(%sp)
        jmp     0x40053a70
        .endif
fs_uh_done:
        rts

| (slot, raw delta) at 8 / 12(sp) of the hook's caller frame. d0 = 1 handled.
fs_ui_knob:
        lea     -56(%sp),%sp
        movem.l %d1-%d7/%a0-%a6,(%sp)
        bsr     fs_ui_context
        tst.l   %d0
        beq     fs_uk_out
        moveq   #0,%d0
        movea.l 64(%sp),%a3
        cmpa.l  #2,%a3
        bcc     fs_uk_out                | not an encoder A-F: stock (which rejects it here)
        move.l  68(%sp),%d3
fs_uk_edit:
        bsr     fs_ui_edit
        movea.l 0x400bb7f4,%a0           | the setup window's redraw
        jsr     (%a0)
        moveq   #1,%d0
        move.b  %d0,fs_ui_entry:l
fs_uk_out:
        movem.l (%sp),%d1-%d7/%a0-%a6
        lea     56(%sp),%sp
        rts

| (key 0x38.., event: nonzero = press) at 8 / 12(sp) of the hook's caller frame.
fs_ui_key:
        lea     -56(%sp),%sp
        movem.l %d1-%d7/%a0-%a6,(%sp)
        move.l  64(%sp),%d4
        subi.l  #0x38,%d4
        cmpi.l  #5,%d4
        bhi     fs_ky_no
        bsr     fs_ui_context
        tst.l   %d0
        beq     fs_ky_no
        cmpi.l  #2,%d4
        bcc     fs_ky_no
        bsr     fs_ui_readable
        tst.l   %d0
        beq     fs_ky_handled
        bsr     fs_ui_row
        mvz.b   (%a0,%d4.l),%d6
        tst.l   68(%sp)
        beq     fs_ky_release
        cmpi.l  #255,%d6
        beq     fs_ky_assign
        clr.l   0x460d1698               | press on an assigned control: a release with no turn removes it
        bra     fs_ky_handled
fs_ky_assign:
        bsr     fs_ui_default            | press on an unassigned control: assign at the Part default
        moveq   #1,%d6
        move.l  %d6,0x460d1698
        bra     fs_ky_write
fs_ky_release:
        tst.l   0x460d1698
        bne     fs_ky_handled
        cmpi.l  #255,%d6
        beq     fs_ky_handled
        move.l  #255,%d5
fs_ky_write:
        jsr     fl_scene_write:l
        cmpi.l  #1,%d0
        bne     fs_ky_handled
        bsr     fs_ui_changed
        movea.l 0x400bb7f4,%a0
        jsr     (%a0)
fs_ky_handled:
        moveq   #1,%d0
        bra     fs_ky_out
fs_ky_no:
        moveq   #0,%d0
fs_ky_out:
        movem.l (%sp),%d1-%d7/%a0-%a6
        lea     56(%sp),%sp
        rts


| Storage readiness is independent of gesture ownership.
fs_ui_readable:
        move.l  %d1,-(%sp)
        mvz.b   0x100b14ce,%d0
        move.l  fl_ready_mask:l,%d1
        btst    %d0,%d1
        beq     fs_ur_no
        move.l  fl_blocked_mask:l,%d1
        btst    %d0,%d1
        bne     fs_ur_no
        moveq   #1,%d0
        bra     fs_ur_out
fs_ur_no:
        moveq   #0,%d0
fs_ur_out:
        move.l  (%sp)+,%d1
        rts

| d4 control -> d5 Part default; keeps every other register.
fs_ui_default:
        lea     -12(%sp),%sp
        movem.l %d0-%d2,(%sp)
        mvz.b   0x100b14cc,%d2
        jsr     po_setup_default:l
        tst.l   %d4
        beq     fs_ud_voice
        move.l  %d1,%d0
fs_ud_voice:
        move.l  %d0,%d5
        movem.l (%sp),%d0-%d2
        lea     12(%sp),%sp
        rts
fs_ui_max:
        lea     fs_ui_maxima:l,%a0
        rts
        .data
        .balign 4
fs_ui_maxima:    .byte 4,127,0,0
fs_ui_entry:     .byte 0
        .balign 4
        .text

| Widget argument window: return address then x,y,control,value,flags,formatter,canvas.
| A held scene overrides the displayed value and uses stock's inverted-value bit.
        .global fs_widget_overlay
fs_widget_overlay:
        lea     -12(%sp),%sp
        movem.l %d0-%d1/%d4,(%sp)
        move.l  24(%sp),%d4
        bsr     fs_ui_value
        cmpi.l  #255,%d0
        beq     fs_wo_out
        move.l  %d0,28(%sp)
        move.l  32(%sp),%d1
        ori.l   #1,%d1
        move.l  %d1,32(%sp)
fs_wo_out:
        movem.l (%sp),%d0-%d1/%d4
        lea     12(%sp),%sp
        rts
