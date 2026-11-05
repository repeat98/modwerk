| FM SYNTH grid locks; only VOIC and CHRD are lockable. Root supplies the scene widget overlay.
        .set FL_PLAY_SETUP,0x8ef60
        .global fl_ui_cache_full_tail,fl_ui_cache_row_tail,fl_ui_refresh_locks,fl_ui_cache_overlay

        .global fl_ui_edit,fl_ui_key_hook,fl_ui_widget,fl_ui_patch,fl_ui_held_knob_hook

fl_ui_context:
        lea     -12(%sp),%sp
        movem.l %d1-%d2/%a0,(%sp)
        move.l  0x400bcd14,%d0
        cmpi.l  #0x400bb7c8,%d0
        bne     fl_uc_no
        tst.l   0x400bb7d0
        beq     fl_uc_no
        tst.l   0x460d1736
        beq     fl_uc_no
        tst.l   0x80000012
        bne     fl_uc_no
        tst.l   0x460d5db4
        bne     fl_uc_no
        tst.w   0x460d174a
        beq     fl_uc_no
        move.l  0x460d174c,%d0
        cmpi.l  #48,%d0
        bhi     fl_uc_no
        andi.l  #15,%d0
        bne     fl_uc_no
        mvz.b   0x100b14ce,%d0
        cmpi.l  #15,%d0
        bhi     fl_uc_no
        mvz.b   0x80000002,%d1
        cmp.l   %d0,%d1
        bne     fl_uc_no
        mvz.b   0x100b14d0,%d0
        cmpi.l  #15,%d0
        bhi     fl_uc_no
        mvz.b   0x80000004,%d1
        cmp.l   %d0,%d1
        bne     fl_uc_no
        mvz.b   0x100b14cc,%d2
        cmpi.l  #7,%d2
        bhi     fl_uc_no
        mvz.b   0x80000000,%d0
        cmp.l   %d0,%d2
        bne     fl_uc_no
        mvz.b   PART_IDX,%d0
        cmpi.l  #3,%d0
        bhi     fl_uc_no
        mvz.b   0x80000003,%d1
        cmp.l   %d0,%d1
        bne     fl_uc_no
        move.l  PART_PTR,%d0
        cmpi.l  #0x40000000,%d0
        bcs     fl_uc_no
        cmpi.l  #0x48000000,%d0
        bcc     fl_uc_no
        jsr     po_fm_kind:l
        beq     fl_uc_no
fl_uc_yes:
        moveq   #1,%d0
        bra     fl_uc_out
fl_uc_no:
        moveq   #0,%d0
fl_uc_out:
        movem.l (%sp),%d1-%d2/%a0
        lea     12(%sp),%sp
        rts

fl_ui_location:
        mvz.b   0x100b14ce,%d0
        mvz.b   0x100b14d0,%d1
        mvz.b   0x100b14cc,%d2
        rts

fl_ui_readable:
        move.l  %d1,-(%sp)
        mvz.b   0x100b14ce,%d0
        cmpi.l  #16,%d0
        bcc     fl_ur_no
        move.l  fl_ready_mask:l,%d1
        btst    %d0,%d1
        beq     fl_ur_no
        move.l  fl_blocked_mask:l,%d1
        btst    %d0,%d1
        bne     fl_ur_no
        moveq   #1,%d0
        bra     fl_ur_out
fl_ur_no:
        moveq   #0,%d0
fl_ur_out:
        move.l  (%sp)+,%d1
        rts

fl_ui_default:
        lea     -16(%sp),%sp
        movem.l %d0-%d2/%a0,(%sp)
        mvz.b   PART_IDX,%d0
        move.l  #6322,%d2
        mulu.l  %d2,%d0
        mvz.b   0x100b14cc,%d1
        moveq   #30,%d2
        mulu.l  %d2,%d1
        add.l   %d1,%d0
        add.l   %d4,%d0
        movea.l PART_PTR,%a0
        adda.l  %d0,%a0
        adda.l  #FL_PLAY_SETUP,%a0
        mvz.b   (%a0),%d5
        bsr     fl_ui_max
        mvz.b   (%a0,%d4.l),%d0
        cmp.l   %d0,%d5
        bls     fl_ud_out
        move.l  %d0,%d5
fl_ud_out:
        tst.l   %d4
        bne     fl_ud_min_ok
        tst.l   %d5
        bne     fl_ud_min_ok
        moveq   #1,%d5
fl_ud_min_ok:
        movem.l (%sp),%d0-%d2/%a0
        lea     16(%sp),%sp
        rts

fl_ui_max:
        lea     fl_ui_max6:l,%a0
        rts

fl_ui_lockable:
        move.l  %d0,-(%sp)
        moveq   #1,%d0
        cmpi.l  #2,%d4
        bcs     fl_ul_out
        moveq   #0,%d0
fl_ul_out:
        tst.l   %d0
        movem.l (%sp),%d0
        addq.l  #4,%sp
        rts

fl_ui_edit:
        lea     -52(%sp),%sp
        movem.l %d1-%d7/%a0-%a5,(%sp)
        bsr     fl_ui_context
        tst.l   %d0
        beq     fl_ue_out
        bsr     fl_ui_readable
        tst.l   %d0
        beq     fl_ue_handled
        move.l  %a3,%d4
        bsr     fl_ui_lockable
        beq     fl_ue_unhandled
        move.l  %d4,%d0
        mulu.w  #24,%d0
        lea     0x46c7de2e,%a0
        move.l  %d3,%d1
        tst.l   (%a0,%d0.l)
        beq     fl_ue_delta
        moveq   #7,%d0
        divs.l  %d0,%d1
fl_ue_delta:
        jsr     po_voic_steps:l          | VOIC: one step a stock threshold (setup.inc.s)
        move.l  %d1,%a4
        suba.l  %a5,%a5
        lea     fl_ui_moved(%pc),%a0
        moveq   #1,%d0
        move.b  %d0,(%a0,%d4.l)
        move.l  %d0,0x460d1750
        mvz.w   0x460d174a,%d6
        moveq   #0,%d7
fl_ue_loop:
        btst    %d7,%d6
        beq     fl_ue_next
        bsr     fl_ui_location
        move.l  0x460d174c,%d3
        add.l   %d7,%d3
        bsr     fl_row
        mvz.b   (%a0,%d4.l),%d5
        cmpi.l  #255,%d5
        bne     fl_ue_have
        bsr     fl_ui_default
fl_ue_have:
        add.l   %a4,%d5
        bpl     fl_ue_nonneg
        moveq   #0,%d5
fl_ue_nonneg:
        tst.l   %d4
        bne     fl_ue_min_ok
        tst.l   %d5
        bne     fl_ue_min_ok
        moveq   #1,%d5
fl_ue_min_ok:
        bsr     fl_ui_max
        mvz.b   (%a0,%d4.l),%d0
        cmp.l   %d0,%d5
        bls     fl_ue_clamped
        move.l  %d0,%d5
fl_ue_clamped:
        bsr     fl_ui_location
        bsr     fl_write
        cmpi.l  #1,%d0
        bne     fl_ue_next
        movea.l %d0,%a5
fl_ue_next:
        addq.l  #1,%d7
        cmpi.l  #16,%d7
        bne     fl_ue_loop
        tst.l   %a5
        beq     fl_ue_handled
        bsr     fl_ui_changed
fl_ue_handled:
        moveq   #1,%d0
        bra     fl_ue_out
fl_ue_unhandled:
        moveq   #0,%d0
fl_ue_out:
        movem.l (%sp),%d1-%d7/%a0-%a5
        lea     52(%sp),%sp
        rts

fl_ui_held_knob_hook:
        lea     -60(%sp),%sp
        movem.l %d0-%d7/%a0-%a6,(%sp)
        movea.l 64(%sp),%a3
        cmpa.l  #6,%a3
        bcc     fl_uhk_stock
        move.l  68(%sp),%d3
        move.l  %a3,%d0
        moveq   #24,%d1
        mulu.l  %d1,%d0
        lea     0x46c7de2e,%a0
        tst.l   (%a0,%d0.l)
        beq     fl_uhk_edit
        move.l  %d3,%d0
        lsl.l   #3,%d0
        sub.l   %d3,%d0
        move.l  %d0,%d3
fl_uhk_edit:
        bsr     fl_ui_edit
        tst.l   %d0
        beq     fl_uhk_stock
        movea.l 0x400bb7f4,%a0
        jsr     (%a0)
        movem.l (%sp),%d0-%d7/%a0-%a6
        lea     60(%sp),%sp
        rts
fl_uhk_stock:
        movem.l (%sp),%d0-%d7/%a0-%a6
        lea     60(%sp),%sp
        .if HAVE_SYDRUM
        jmp sl_ui_held_knob_hook:l
        .else
        lea     -80(%sp),%sp
        movem.l %d2-%d7/%a2-%a6,(%sp)
        jmp     0x400508ec
        .endif

        .global fl_ui_trig_press_hook,fl_ui_trig_rel_hook
fl_ui_trig_press_hook:
        bsr     fl_ui_setup_redraw
        .if HAVE_SYDRUM
        jmp sl_ui_trig_press_hook:l
        .else
        jsr     0x4002ce54
        jmp     0x40050fdc
        .endif
fl_ui_trig_rel_hook:
        bsr     fl_ui_setup_redraw
        .if HAVE_SYDRUM
        jmp sl_ui_trig_rel_hook:l
        .else
        jsr     0x4002ce54
        jmp     0x4005fbd8
        .endif

| (2.19) SCENE A / B: the press handler (0x4004348c) sets the held side 0x460d169c and the
| release handler (0x40054ca4) clears it; stock redraws its parameter pages there but not an
| open PLAYBACK SETUP window, so a held scene's VOIC / CHRD were not shown inverted until a
| knob turned, nor the Part's back on release. The same redraw as the trig hooks', then the
| displaced instruction (SY DRUM's hook replays it when SY DRUM is in the remix).
        .global fl_ui_scene_press_hook,fl_ui_scene_rel_hook
fl_ui_scene_press_hook:
        bsr     fl_ui_setup_redraw
        .if HAVE_SYDRUM
        jmp sl_ui_scene_press_hook:l
        .else
        clr.l   0x460d1698
        jmp     0x400434ca
        .endif
fl_ui_scene_rel_hook:
        bsr     fl_ui_setup_redraw
        .if HAVE_SYDRUM
        jmp sl_ui_scene_rel_hook:l
        .else
        jsr     0x400418e0
        jmp     0x40054cd0
        .endif

fl_ui_setup_redraw:
        lea     -60(%sp),%sp
        movem.l %d0-%d7/%a0-%a6,(%sp)
        move.l  0x400bcd14,%d0
        cmpi.l  #0x400bb7c8,%d0
        bne     fl_usr_out
        tst.l   0x400bb7d0
        beq     fl_usr_out
        mvz.b   0x100b14cc,%d2
        cmpi.l  #7,%d2
        bhi     fl_usr_out
        jsr     po_fm_kind:l
        beq     fl_usr_out
        movea.l 0x400bb7f4,%a0
        jsr     (%a0)
fl_usr_out:
        movem.l (%sp),%d0-%d7/%a0-%a6
        lea     60(%sp),%sp
        rts

fl_ui_key_hook:
        bsr     fl_ui_key
        tst.l   %d0
        bne     fl_uk_hook_done
        .if HAVE_SYDRUM
        jmp sl_ui_key_hook:l
        .else
        lea     -76(%sp),%sp
        movem.l %d2-%d7/%a2-%a6,(%sp)
        jmp     0x40050414
        .endif
fl_uk_hook_done:
        rts

fl_ui_key:
        lea     -56(%sp),%sp
        movem.l %d1-%d7/%a0-%a6,(%sp)
        move.l  64(%sp),%d4
        subi.l  #0x38,%d4
        cmpi.l  #5,%d4
        bhi     fl_uk_no
        bsr     fl_ui_context
        tst.l   %d0
        bne     fl_uk_context
        tst.l   68(%sp)
        bne     fl_uk_no
        cmpi.l  #FL_CONTROLS,%d4
        bcc     fl_uk_no
        lea     fl_ui_pressed(%pc),%a0
        tst.b   (%a0,%d4.l)
        beq     fl_uk_no
        clr.b   (%a0,%d4.l)
        bra     fl_uk_handled
fl_uk_context:
        bsr     fl_ui_lockable
        beq     fl_uk_no
        bsr     fl_ui_readable
        tst.l   %d0
        bne     fl_uk_ready
        lea     fl_ui_pressed:l,%a0
        clr.b   (%a0,%d4.l)
        bra     fl_uk_handled
fl_uk_ready:
        lea     fl_ui_moved(%pc),%a4
        lea     fl_ui_pressed(%pc),%a5
        tst.l   68(%sp)
        beq     fl_uk_release
        clr.b   (%a4,%d4.l)
        moveq   #1,%d0
        move.b  %d0,(%a5,%d4.l)
        movea.l %d0,%a6
        bsr     fl_ui_signature
        lea     fl_ui_signature_saved:l,%a0
        move.l  %d4,%d2
        lsl.l   #3,%d2
        move.l  %d0,(%a0,%d2.l)
        move.l  %d1,4(%a0,%d2.l)
        bra     fl_uk_scan
fl_uk_release:
        tst.b   (%a5,%d4.l)
        beq     fl_uk_handled
        clr.b   (%a5,%d4.l)
        tst.b   (%a4,%d4.l)
        bne     fl_uk_handled
        bsr     fl_ui_signature
        lea     fl_ui_signature_saved:l,%a0
        move.l  %d4,%d2
        lsl.l   #3,%d2
        cmp.l   (%a0,%d2.l),%d0
        bne     fl_uk_handled
        cmp.l   4(%a0,%d2.l),%d1
        bne     fl_uk_handled
        suba.l  %a6,%a6
fl_uk_scan:
        suba.l  %a3,%a3
        mvz.w   0x460d174a,%d6
        moveq   #0,%d7
fl_uk_loop:
        btst    %d7,%d6
        beq     fl_uk_next
        bsr     fl_ui_location
        move.l  0x460d174c,%d3
        add.l   %d7,%d3
        bsr     fl_row
        tst.l   %a6
        beq     fl_uk_remove
        mvz.b   (%a0,%d4.l),%d5
        cmpi.l  #255,%d5
        bne     fl_uk_next
        bsr     fl_ui_default
        bra     fl_uk_write
fl_uk_remove:
        move.l  #255,%d5
fl_uk_write:
        bsr     fl_write
        cmpi.l  #1,%d0
        bne     fl_uk_next
        movea.l %d0,%a3
        tst.l   %a6
        beq     fl_uk_next
        move.b  %d0,(%a4,%d4.l)
fl_uk_next:
        addq.l  #1,%d7
        cmpi.l  #16,%d7
        bne     fl_uk_loop
        tst.l   %a3
        beq     fl_uk_handled
        bsr     fl_ui_changed
fl_uk_handled:
        moveq   #1,%d0
        bra     fl_uk_out
fl_uk_no:
        moveq   #0,%d0
fl_uk_out:
        movem.l (%sp),%d1-%d7/%a0-%a6
        lea     56(%sp),%sp
        rts

fl_ui_signature:
        move.l  0x100b14cc,%d0
        mvz.b   0x100b14d0,%d1
        lsl.l   #8,%d1
        or.l    0x460d174c,%d1
        swap    %d1
        move.w  0x460d174a,%d1
        rts

fl_ui_changed:
        moveq   #1,%d0
        move.l  %d0,0x460d173a
        clr.w   0x460d1a9e
        clr.w   0x460d1aa0
        clr.w   0x460d1aa2
        clr.w   0x460d1aa4
        clr.w   0x460d1aa6
        clr.w   0x460d10dc
        bsr     fl_ui_refresh_locks
        rts

fl_ui_refresh_locks:
        lea     -60(%sp),%sp
        movem.l %d0-%d7/%a0-%a6,(%sp)
        jsr     0x400339d8
        movem.l (%sp),%d0-%d7/%a0-%a6
        lea     60(%sp),%sp
        rts

fl_ui_cache_full_tail:
        bsr     fl_ui_cache_overlay
        .if HAVE_SYDRUM
        jmp sl_ui_cache_full_tail:l
        .else
        movem.l (%sp),%d2-%d7/%a2-%a6
        lea     44(%sp),%sp
        rts
        .endif
fl_ui_cache_row_tail:
        bsr     fl_ui_cache_overlay
        .if HAVE_SYDRUM
        jmp sl_ui_cache_row_tail:l
        .else
        movem.l (%sp),%d2-%d4
        lea     12(%sp),%sp
        rts
        .endif

fl_ui_cache_overlay:
        lea     -60(%sp),%sp
        movem.l %d0-%d7/%a0-%a6,(%sp)
        mvz.b   0x100b14ce,%d0
        cmpi.l  #16,%d0
        bcc     fl_uco_out
        move.l  fl_ready_mask:l,%d4
        btst    %d0,%d4
        beq     fl_uco_out
        move.l  fl_blocked_mask:l,%d4
        btst    %d0,%d4
        bne     fl_uco_out
        mvz.b   0x100b14d0,%d1
        cmpi.l  #16,%d1
        bcc     fl_uco_out
        lea     0x46c7d48c,%a2
        moveq   #0,%d2
fl_uco_track:
        moveq   #1,%d4
        lsl.l   %d2,%d4
        moveq   #0,%d3
fl_uco_step:
        bsr     fl_row
        move.l  4(%a0),%d5
        ori.l   #0xffff,%d5
        and.l   (%a0),%d5
        moveq   #-1,%d6
        cmp.l   %d6,%d5
        bne     fl_uco_af
        bra     fl_uco_next
fl_uco_af:
        cmp.l   (%a0),%d6
        bne     fl_uco_mark
        bra     fl_uco_next
fl_uco_mark:
        mvz.b   (%a2,%d3.l),%d5
        or.l    %d4,%d5
        move.b  %d5,(%a2,%d3.l)
fl_uco_next:
        addq.l  #1,%d3
        cmpi.l  #64,%d3
        bne     fl_uco_step
        addq.l  #1,%d2
        cmpi.l  #8,%d2
        bne     fl_uco_track
fl_uco_out:
        movem.l (%sp),%d0-%d7/%a0-%a6
        lea     60(%sp),%sp
        rts

fl_ui_patch:
        move.l  %a1,-(%sp)
        lea     fl_ui_widget(%pc),%a1
        move.l  %a1,0x112(%a0)
        move.l  %a1,0x116(%a0)
        movea.l (%sp)+,%a1
        rts

fl_ui_widget:
        lea     -60(%sp),%sp
        movem.l %d2-%d7/%a2-%a3,28(%sp)
        move.l  64(%sp),(%sp)
        move.l  68(%sp),4(%sp)
        move.l  72(%sp),8(%sp)
        move.l  76(%sp),12(%sp)
        move.l  80(%sp),16(%sp)
        move.l  84(%sp),20(%sp)
        move.l  88(%sp),24(%sp)
| These two dials use fixed layout, independently of native enum staging.
| Keep inversion and the native negative value's frame-only request intact.
        move.l  16(%sp),%d0
        ori.l   #8,%d0
        move.l  %d0,16(%sp)
        tst.l   12(%sp)
        bmi     fl_uw_native
        move.l  8(%sp),%d4
| Own both the displayed value and formatter: SETUP's stock staging still
| supplies its native parameter context. The other four widgets stay stock.
        bsr     fl_ui_value
        move.l  %d0,12(%sp)
        lea     po_fmt_voic:l,%a0
        tst.l   %d4
        beq     fl_uw_format
        lea     po_fmt_chord:l,%a0
fl_uw_format:
        move.l  %a0,20(%sp)
        bsr     fl_ui_context
        tst.l   %d0
        beq     fl_uw_draw
        bsr     fl_ui_readable
        tst.l   %d0
        beq     fl_uw_draw
        bsr     fl_ui_lockable
        beq     fl_uw_draw

        mvz.w   0x460d174a,%d6
        suba.l  %a3,%a3
fl_uw_step:
        move.l  %a3,%d3
        btst    %d3,%d6
        beq     fl_uw_skip
        add.l   0x460d174c,%d3
        bsr     fl_ui_location
        bsr     fl_row
        mvz.b   (%a0,%d4.l),%d5
        cmpi.l  #255,%d5
        bne     fl_uw_found
fl_uw_skip:
        addq.l  #1,%a3
        cmpa.l  #16,%a3
        bne     fl_uw_step
        bra     fl_uw_draw
fl_uw_found:
        move.l  %d5,12(%sp)
        move.l  16(%sp),%d0
        ori.l   #1,%d0
        move.l  %d0,16(%sp)
fl_uw_draw:
        jsr     fs_widget_overlay:l
        tst.l   %d4
        bne     fl_uw_native
        jsr     po_voic_dial:l           | VOIC: 1..4 spread over the dial's arc
fl_uw_native:
        jsr     0x400479b4
fl_uw_out:
        movem.l 28(%sp),%d2-%d7/%a2-%a3
        lea     60(%sp),%sp
        rts

| d4 control -> d0 displayed raw value; preserve all other registers.
| A held scene's value wins, otherwise the lowest held step, then the Part.
        .global fl_ui_value
fl_ui_value:
        lea     -32(%sp),%sp
        movem.l %d1-%d3/%d5-%d7/%a0-%a1,(%sp)
        jsr     fs_ui_value:l
        cmpi.l  #255,%d0
        bne     fl_uval_out
        bsr     fl_ui_default
        move.l  %d5,%d7
        bsr     fl_ui_context
        tst.l   %d0
        beq     fl_uval_default
        bsr     fl_ui_readable
        tst.l   %d0
        beq     fl_uval_default
        mvz.w   0x460d174a,%d6
        moveq   #0,%d5
fl_uval_step:
        btst    %d5,%d6
        beq     fl_uval_next
        move.l  0x460d174c,%d3
        add.l   %d5,%d3
        bsr     fl_ui_location
        bsr     fl_row
        mvz.b   (%a0,%d4.l),%d0
        cmpi.l  #255,%d0
        bne     fl_uval_out
fl_uval_next:
        addq.l  #1,%d5
        cmpi.l  #16,%d5
        bne     fl_uval_step
fl_uval_default:
        move.l  %d7,%d0
fl_uval_out:
        movem.l (%sp),%d1-%d3/%d5-%d7/%a0-%a1
        lea     32(%sp),%sp
        rts

        .balign 4
fl_ui_moved:
        .space 16
fl_ui_pressed:
        .space 16
fl_ui_signature_saved:
        .space 128
        .balign 4
fl_ui_max6:
        .byte 4,127,0,0,0,0,0,0,0,0,0,0,0,0,0,0
        .balign 2
