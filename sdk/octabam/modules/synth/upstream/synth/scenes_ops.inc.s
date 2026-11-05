| ==== SETUP SCENES: the stock scene and Part operations carry them (b59) ============
| (2.18) With SY DRUM in the remix every hook ends in SY DRUM's own (sy-drum/scenes_ops.inc.s:
| its LSPD LDEP WAVE S&H table), which replays the displaced instructions instead.
| Ten entry detours (8 displaced bytes each, lock_hooks.json). Each does its row work
| on the parallel table with the UI's bank (0x100b14ce), restores every register,
| replays the displaced instructions and continues in stock:
|   scene COPY 0x400274cc (part, scene)        -> fs_scene_clip
|   scene undo snapshot 0x400275a0 (op, part, scene) -> fs_scene_undo
|   scene WRITE 0x40025b40 (src, part, scene)  paste (src = the clipboard 0x460c8122)
|                                              or undo (src = 0x460bf218)
|   scene CLEAR 0x40038c30 (scene)             the UI's Part
|   Part SAVE 0x4004a908 (part)                working -> part-saved
|   Part RELOAD 0x4004aab4 (part)              part-saved -> working (only when stock's
|                                              saved flag bank + 0x9b312 + part is set)
|   Part CLEAR 0x4004a9d0 (part)               working -> FF (stock then falls into SAVE)
|   Part COPY 0x4002932c (part)                -> fs_part_clip
|   Part undo snapshot 0x400292a0 (op, part)   -> fs_part_undo
|   Part WRITE 0x40029a4c (src, part)          paste / undo, by src as for a scene
        .global fs_scene_copy_hook, fs_scene_undo_hook, fs_scene_write_hook, fs_scene_clear_hook
        .global fs_part_save_hook, fs_part_reload_hook, fs_part_clear_hook
        .global fs_part_copy_hook, fs_part_undo_hook, fs_part_write_hook
        .set    FS_CLIP_SRC, 0x460c8122
        .set    FS_UNDO_SRC, 0x460bf218

| d1 part, d2 scene -> a0 = the 16 bytes of that scene in the UI's bank (track 0's
| row), or 0 when a coordinate is off or the bank is not ready. d0 = the bank.
fs_op_scene:
        move.l  %d3,-(%sp)
        mvz.b   0x100b14ce,%d0
        moveq   #0,%d3
        jsr     fl_scene_row:l
        move.l  (%sp)+,%d3
fs_op_check:
        move.l  %d1,-(%sp)
        cmpa.l  #fl_scene_empty,%a0
        beq     fs_op_none
        move.l  fl_ready_mask:l,%d1
        btst    %d0,%d1
        beq     fs_op_none
        move.l  fl_blocked_mask:l,%d1
        btst    %d0,%d1
        beq     fs_op_ok
fs_op_none:
        suba.l  %a0,%a0
fs_op_ok:
        move.l  (%sp)+,%d1
        cmpa.l  #0,%a0
        rts
| d1 part -> a0 = the 256 working bytes of that Part (scene 0, track 0), or 0.
fs_op_part:
        move.l  %d2,-(%sp)
        moveq   #0,%d2
        bsr     fs_op_scene
        move.l  (%sp)+,%d2
        cmpa.l  #0,%a0
        rts
| a0 -> a1, d3 longs. Clobbers d3, a0, a1.
fs_op_copy:
        move.l  (%a0)+,(%a1)+
        subq.l  #1,%d3
        bne     fs_op_copy
        rts
| a1, d3 longs := FF. Clobbers d3, a1, d4.
fs_op_fill:
        moveq   #-1,%d4
fs_op_fill1:
        move.l  %d4,(%a1)+
        subq.l  #1,%d3
        bne     fs_op_fill1
        rts
| d4 = a valid bit to set.
fs_op_valid:
        lea     fs_clip_valid:l,%a1
        or.l    %d4,(%a1)
        rts
        .macro  fs_op_enter
        lea     -64(%sp),%sp
        movem.l %d0-%d7/%a0-%a6,(%sp)
        move.w  %sr,%d0
        move.l  %d0,60(%sp)
        move.w  #0x2700,%sr
        .endm
        .macro  fs_op_leave
        move.l  60(%sp),%d0
        move.w  %d0,%sr
        movem.l (%sp),%d0-%d7/%a0-%a6
        lea     64(%sp),%sp
        .endm

fs_scene_copy_hook:                      | (part, scene)
        fs_op_enter
        move.l  68(%sp),%d1
        move.l  72(%sp),%d2
        bsr     fs_op_scene
        beq     fs_sch_out
        lea     fs_scene_clip:l,%a1
        moveq   #4,%d3
        bsr     fs_op_copy
        moveq   #1,%d4
        bsr     fs_op_valid
fs_sch_out:
        fs_op_leave
        .if HAVE_SYDRUM
        jmp     sc_scene_copy_hook:l           | SY DRUM's setup scenes (sy-drum/scenes_ops.inc.s), then stock
        .else
        lea     -24(%sp),%sp
        movem.l %d2-%d7,(%sp)
        jmp     0x400274d4
        .endif

fs_scene_undo_hook:                      | (op, part, scene)
        fs_op_enter
        move.l  72(%sp),%d1
        move.l  76(%sp),%d2
        bsr     fs_op_scene
        beq     fs_suh_out
        lea     fs_scene_undo:l,%a1
        moveq   #4,%d3
        bsr     fs_op_copy
        moveq   #2,%d4
        bsr     fs_op_valid
fs_suh_out:
        fs_op_leave
        .if HAVE_SYDRUM
        jmp     sc_scene_undo_hook:l           | SY DRUM's setup scenes (sy-drum/scenes_ops.inc.s), then stock
        .else
        lea     -24(%sp),%sp
        movem.l %d2-%d7,(%sp)
        jmp     0x400275a8
        .endif

fs_scene_write_hook:                     | (src, part, scene)
        fs_op_enter
        move.l  68(%sp),%d5
        lea     fs_scene_clip:l,%a2
        moveq   #1,%d4
        cmpi.l  #FS_CLIP_SRC,%d5
        beq     fs_swh_src
        lea     fs_scene_undo:l,%a2
        moveq   #2,%d4
        cmpi.l  #FS_UNDO_SRC,%d5
        bne     fs_swh_out               | another source: not ours
fs_swh_src:
        and.l   fs_clip_valid:l,%d4
        beq     fs_swh_out               | nothing of ours was captured with it
        move.l  72(%sp),%d1
        move.l  76(%sp),%d2
        bsr     fs_op_scene
        beq     fs_swh_out
        movea.l %a0,%a1
        movea.l %a2,%a0
        moveq   #4,%d3
        bsr     fs_op_copy
        jsr     fl_mark_dirty:l
fs_swh_out:
        fs_op_leave
        .if HAVE_SYDRUM
        jmp     sc_scene_write_hook:l           | SY DRUM's setup scenes (sy-drum/scenes_ops.inc.s), then stock
        .else
        lea     -48(%sp),%sp
        movem.l %d2-%d7/%a2-%a6,(%sp)
        jmp     0x40025b48
        .endif

fs_scene_clear_hook:                     | (scene), the UI's Part
        fs_op_enter
        mvz.b   PART_IDX,%d1
        move.l  68(%sp),%d2
        bsr     fs_op_scene
        beq     fs_sxh_out
        movea.l %a0,%a1
        moveq   #4,%d3
        bsr     fs_op_fill
        jsr     fl_mark_dirty:l
fs_sxh_out:
        fs_op_leave
        .if HAVE_SYDRUM
        jmp     sc_scene_clear_hook:l           | SY DRUM's setup scenes (sy-drum/scenes_ops.inc.s), then stock
        .else
        lea     -40(%sp),%sp
        movem.l %d2-%d7/%a2-%a5,(%sp)
        jmp     0x40038c38
        .endif

fs_part_save_hook:                       | (part): working -> part-saved
        fs_op_enter
        move.l  68(%sp),%d1
        bsr     fs_op_part
        beq     fs_psh_out
        lea     1024(%a0),%a1
        move.l  #64,%d3
        bsr     fs_op_copy
        jsr     fl_mark_dirty:l
fs_psh_out:
        fs_op_leave
        .if HAVE_SYDRUM
        jmp     sc_part_save_hook:l           | SY DRUM's setup scenes (sy-drum/scenes_ops.inc.s), then stock
        .else
        lea     -20(%sp),%sp
        movem.l %d2-%d4/%a2-%a3,(%sp)
        jmp     0x4004a910
        .endif

fs_part_reload_hook:                     | (part): part-saved -> working, when stock has a saved Part
        fs_op_enter
        move.l  68(%sp),%d1
        bsr     fs_op_part
        beq     fs_prh_out
        movea.l PART_PTR,%a2
        adda.l  #0x9b312,%a2
        tst.b   (%a2,%d1.l)
        beq     fs_prh_out               | stock returns before touching the Part
        movea.l %a0,%a1
        lea     1024(%a0),%a0
        move.l  #64,%d3
        bsr     fs_op_copy
        jsr     fl_mark_dirty:l
fs_prh_out:
        fs_op_leave
        .if HAVE_SYDRUM
        jmp     sc_part_reload_hook:l           | SY DRUM's setup scenes (sy-drum/scenes_ops.inc.s), then stock
        .else
        lea     -32(%sp),%sp
        movem.l %d2-%d5/%a2-%a3,(%sp)
        jmp     0x4004aabc
        .endif

fs_part_clear_hook:                      | (part): working -> none (stock falls into SAVE)
        fs_op_enter
        move.l  68(%sp),%d1
        bsr     fs_op_part
        beq     fs_pxh_out
        movea.l %a0,%a1
        move.l  #64,%d3
        bsr     fs_op_fill
        jsr     fl_mark_dirty:l
fs_pxh_out:
        fs_op_leave
        .if HAVE_SYDRUM
        jmp     sc_part_clear_hook:l           | SY DRUM's setup scenes (sy-drum/scenes_ops.inc.s), then stock
        .else
        lea     -16(%sp),%sp
        movem.l %d2-%d3/%a2-%a3,(%sp)
        jmp     0x4004a9d8
        .endif

fs_part_copy_hook:                       | (part)
        fs_op_enter
        move.l  68(%sp),%d1
        bsr     fs_op_part
        beq     fs_pch_out
        lea     fs_part_clip:l,%a1
        move.l  #64,%d3
        bsr     fs_op_copy
        moveq   #4,%d4
        bsr     fs_op_valid
fs_pch_out:
        fs_op_leave
        .if HAVE_SYDRUM
        jmp     sc_part_copy_hook:l           | SY DRUM's setup scenes (sy-drum/scenes_ops.inc.s), then stock
        .else
        pea     0x18b2
        move.l  8(%sp),%d0
        jmp     0x40029334
        .endif

fs_part_undo_hook:                       | (op, part)
        fs_op_enter
        move.l  72(%sp),%d1
        bsr     fs_op_part
        beq     fs_puh_out
        lea     fs_part_undo:l,%a1
        move.l  #64,%d3
        bsr     fs_op_copy
        moveq   #8,%d4
        bsr     fs_op_valid
fs_puh_out:
        fs_op_leave
        .if HAVE_SYDRUM
        jmp     sc_part_undo_hook:l           | SY DRUM's setup scenes (sy-drum/scenes_ops.inc.s), then stock
        .else
        move.l  8(%sp),%d0
        lea     4(%sp),%a0
        jmp     0x400292a8
        .endif

fs_part_write_hook:                      | (src, part)
        fs_op_enter
        move.l  68(%sp),%d5
        lea     fs_part_clip:l,%a2
        moveq   #4,%d4
        cmpi.l  #FS_CLIP_SRC,%d5
        beq     fs_pwh_src
        lea     fs_part_undo:l,%a2
        moveq   #8,%d4
        cmpi.l  #FS_UNDO_SRC,%d5
        bne     fs_pwh_out
fs_pwh_src:
        and.l   fs_clip_valid:l,%d4
        beq     fs_pwh_out
        move.l  72(%sp),%d1
        bsr     fs_op_part
        beq     fs_pwh_out
        movea.l %a0,%a1
        movea.l %a2,%a0
        move.l  #64,%d3
        bsr     fs_op_copy
        jsr     fl_mark_dirty:l
fs_pwh_out:
        fs_op_leave
        .if HAVE_SYDRUM
        jmp     sc_part_write_hook:l           | SY DRUM's setup scenes (sy-drum/scenes_ops.inc.s), then stock
        .else
        lea     -20(%sp),%sp
        movem.l %d2-%d5/%a2,(%sp)
        jmp     0x40029a54
        .endif

| Cleared on project reset; clip storage contents are inert until valid.
        .global fs_reset,fs_clip_valid
fs_reset:
        clr.l   fs_track_valid:l
        clr.l   fs_clip_valid:l
        rts
        .data
        .balign 4
fs_clip_valid:   .long 0
fs_scene_clip:   .fill 4,4,0xffffffff
fs_scene_undo:   .fill 4,4,0xffffffff
fs_part_clip:    .fill 64,4,0xffffffff
fs_part_undo:    .fill 64,4,0xffffffff
        .text


| Whole-track COPY / PASTE also carry all scene assignments for that track.
| Called alongside fl_clip_xfer only for the native full-track format (kind4),
| after the machine-budget guard has accepted a restore.
| d0 native clipboard pointer, d1 pattern, d2 track, d5 0 capture / 1 restore.
| Every register preserved. Table copy and dirty generation are atomic.
        .global fs_track_xfer
fs_track_xfer:
        fs_op_enter
        move.l  0(%sp),%d0
        lea     fs_track_clip:l,%a2
        lea     fl_clip_kind:l,%a3
        moveq   #1,%d6
        cmpi.l  #FS_CLIP_SRC,%d0
        beq     fs_tx_buffer
        cmpi.l  #FS_UNDO_SRC,%d0
        bne     fs_tx_out
        lea     fs_track_undo:l,%a2
        lea     fl_undo_kind:l,%a3
        moveq   #2,%d6
fs_tx_buffer:
        tst.l   %d5
        bne     fs_tx_restore_check
        move.l  %d6,%d0
        not.l   %d0
        and.l   %d0,fs_track_valid:l
        bra     fs_tx_context
fs_tx_restore_check:
        move.l  (%a3),%d0
        cmpi.l  #4,%d0                  | same native clipboard generation/type
        bne     fs_tx_out
        move.l  fs_track_valid:l,%d0
        and.l   %d6,%d0
        beq     fs_tx_out
fs_tx_context:
        cmpi.l  #16,%d1
        bcc     fs_tx_out
        cmpi.l  #8,%d2
        bcc     fs_tx_out
        move.l  %d2,%d3
        move.l  #36568,%d0
        mulu.l  %d1,%d0
        movea.l PART_PTR,%a0
        cmpa.l  #0x40000000,%a0
        bcs     fs_tx_out
        cmpa.l  #0x48000000,%a0
        bcc     fs_tx_out
        adda.l  %d0,%a0
        adda.l  #0x8e57,%a0
        mvz.b   (%a0),%d1
        cmpi.l  #4,%d1
        bcc     fs_tx_out
        mvz.b   0x100b14ce,%d0
        cmpi.l  #16,%d0
        bcc     fs_tx_out
        moveq   #0,%d2
        jsr     fl_scene_row:l
        bsr     fs_op_check
        beq     fs_tx_out
        moveq   #16,%d7
        tst.l   %d5
        bne     fs_tx_restore
fs_tx_capture:
        move.w  (%a0),(%a2)+
        adda.l  #16,%a0
        subq.l  #1,%d7
        bne     fs_tx_capture
        or.l    %d6,fs_track_valid:l
        bra     fs_tx_out
fs_tx_restore:
        moveq   #0,%d4
fs_tx_restore_row:
        move.w  (%a2)+,%d6
        cmp.w   (%a0),%d6
        beq     fs_tx_restore_next
        move.w  %d6,(%a0)
        moveq   #1,%d4
fs_tx_restore_next:
        adda.l  #16,%a0
        subq.l  #1,%d7
        bne     fs_tx_restore_row
        tst.l   %d4
        beq     fs_tx_out
        jsr     fl_mark_dirty:l
fs_tx_out:
        fs_op_leave
        rts
        .data
        .balign 4
fs_track_valid:  .long 0
fs_track_clip:   .fill 8,4,0xffffffff
fs_track_undo:   .fill 8,4,0xffffffff
        .text
