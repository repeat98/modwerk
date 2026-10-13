        .global sl_ui_cache_full_tail,sl_ui_cache_row_tail,sl_ui_refresh_locks,sl_ui_cache_overlay
| SY DRUM's step locks of its PLAYBACK SETUP controls: the UI hooks (the development
| line's locks_ui, 8 Oct 2026, for its SY page; the track's machine is its Part's
| machine-list signature, sd_kind). The storage ABI
| is sl_row(bank,pattern,track,step in d0..d3)->a0 and sl_write(d0..d5),
| with d4=control, d5=value (255 removes). sl_write preserves d1..d5.
| No Part, native lock column, or ordinary LFO value is written here.

        .global sl_ui_edit,sl_ui_key_hook,sl_ui_widget,sl_ui_patch,sl_ui_held_knob_hook

| d0=1 iff the visible PB SETUP belongs to SY and held steps are editable.
| Preserve every other register. Primaries must agree with the setup window's
| mirrored context, avoiding a queued project/track change editing old rows.
sl_ui_context:
        lea     -12(%sp),%sp
        movem.l %d1-%d2/%a0,(%sp)
        move.l  0x400bcd14,%d0
        cmpi.l  #0x400bb7c8,%d0          | this setup window must be active
        bne     sl_uc_no
        tst.l   0x400bb7d0
        beq     sl_uc_no
        tst.l   0x460d1736
        beq     sl_uc_no
        tst.l   0x80000012
        bne     sl_uc_no
        tst.l   0x460d5db4
        bne     sl_uc_no
        tst.w   0x460d174a
        beq     sl_uc_no
        move.l  0x460d174c,%d0
        cmpi.l  #48,%d0
        bhi     sl_uc_no
        andi.l  #15,%d0
        bne     sl_uc_no
        mvz.b   0x100b14ce,%d0
        cmpi.l  #15,%d0
        bhi     sl_uc_no
        mvz.b   0x80000002,%d1
        cmp.l   %d0,%d1
        bne     sl_uc_no
        mvz.b   0x100b14d0,%d0
        cmpi.l  #15,%d0
        bhi     sl_uc_no
        mvz.b   0x80000004,%d1
        cmp.l   %d0,%d1
        bne     sl_uc_no
        mvz.b   0x100b14cc,%d2
        cmpi.l  #7,%d2
        bhi     sl_uc_no
        mvz.b   0x80000000,%d0
        cmp.l   %d0,%d2
        bne     sl_uc_no
        mvz.b   PART_IDX,%d0
        cmpi.l  #3,%d0
        bhi     sl_uc_no
        mvz.b   0x80000003,%d1
        cmp.l   %d0,%d1
        bne     sl_uc_no
        move.l  PART_PTR,%d0
        cmpi.l  #0x40000000,%d0
        bcs     sl_uc_no
        cmpi.l  #0x48000000,%d0
        bcc     sl_uc_no
        jsr     sd_kind:l                | sydrum.s: 2 = SY DRUM on this track of the current Part
        beq     sl_uc_no                 | any other machine: no
sl_uc_yes:
        moveq   #1,%d0
        bra     sl_uc_out
sl_uc_no:
        moveq   #0,%d0
sl_uc_out:
        movem.l (%sp),%d1-%d2/%a0
        lea     12(%sp),%sp
        rts

| Fill d0..d2 with the current UI bank/pattern/track, preserving other regs.
sl_ui_location:
        mvz.b   0x100b14ce,%d0
        mvz.b   0x100b14d0,%d1
        mvz.b   0x100b14cc,%d2
        rts

| Readability is separate from edit-context eligibility: a blocked held gesture
| must still be consumed, never fall through to mutating the Part default.
sl_ui_readable:
        move.l  %d1,-(%sp)
        mvz.b   0x100b14ce,%d0
        cmpi.l  #16,%d0
        bcc     sl_ur_no
        move.l  sl_ready_mask:l,%d1
        btst    %d0,%d1
        beq     sl_ur_no
        move.l  sl_blocked_mask:l,%d1
        btst    %d0,%d1
        bne     sl_ur_no
        moveq   #1,%d0
        bra     sl_ur_out
sl_ur_no:
        moveq   #0,%d0
sl_ur_out:
        move.l  (%sp)+,%d1
        rts

| d4=control (A..D) -> d5=Part default, clamped to its maximum. Call only after
| sl_ui_context validation.
sl_ui_default:
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
        adda.l  #PLAY_SETUP,%a0
        mvz.b   (%a0),%d5
        bsr     sl_ui_max
        mvz.b   (%a0,%d4.l),%d0
        cmp.l   %d0,%d5
        bls     sl_ud_out
        move.l  %d0,%d5
sl_ud_out:
        movem.l (%sp),%d0-%d2/%a0
        lea     16(%sp),%sp
        rts

| a0 := SY DRUM's maxima of the controls (sl_ui_max6). Other regs kept.
sl_ui_max:
        lea     sl_ui_max6:l,%a0
        rts

| d4 control -> Z clear (bne) iff it is lockable on the page: A..D (LSPD LDEP WAVE S&H).
| All registers kept.
sl_ui_lockable:
        move.l  %d0,-(%sp)
        moveq   #1,%d0
        cmpi.l  #4,%d4
        bcs     sl_ul_out
        moveq   #0,%d0
sl_ul_out:
        tst.l   %d0
        movem.l (%sp),%d0                | (movem leaves the flags alone)
        addq.l  #4,%sp
        rts

| sd_setup_edit (sydrum.s) calls this before any stock store. a3=control, d3=the
| stock pressed-accelerated delta. d0=handled; all other registers preserved.
sl_ui_edit:
        lea     -52(%sp),%sp
        movem.l %d1-%d7/%a0-%a5,(%sp)
        bsr     sl_ui_context
        tst.l   %d0
        beq     sl_ue_out
        bsr     sl_ui_readable
        tst.l   %d0
        beq     sl_ue_handled
        move.l  %a3,%d4
        bsr     sl_ui_lockable           | A..D
        beq     sl_ue_handled
        move.l  %d3,-(%sp)
        move.l  %d4,-(%sp)
        jsr     0x4003249c                | same stock encoder accumulator (the knob's own state: 0..5)
        addq.l  #8,%sp
        move.l  %d0,%a4
        suba.l  %a5,%a5
        lea     sl_ui_moved(%pc),%a0
        moveq   #1,%d0
        move.b  %d0,(%a0,%d4.l)
        move.l  %d0,0x460d1750          | release must not remove a turned lock
        mvz.w   0x460d174a,%d6
        moveq   #0,%d7
sl_ue_loop:
        btst    %d7,%d6
        beq     sl_ue_next
        bsr     sl_ui_location
        move.l  0x460d174c,%d3
        add.l   %d7,%d3
        bsr     sl_row
        mvz.b   (%a0,%d4.l),%d5
        cmpi.l  #255,%d5
        bne     sl_ue_have
        bsr     sl_ui_default
sl_ue_have:
        add.l   %a4,%d5
        bpl     sl_ue_nonneg
        moveq   #0,%d5
sl_ue_nonneg:
        bsr     sl_ui_max
        mvz.b   (%a0,%d4.l),%d0
        cmp.l   %d0,%d5
        bls     sl_ue_clamped
        move.l  %d0,%d5
sl_ue_clamped:
        bsr     sl_ui_location
        bsr     sl_write
        cmpi.l  #1,%d0
        bne     sl_ue_next
        movea.l %d0,%a5
sl_ue_next:
        addq.l  #1,%d7
        cmpi.l  #16,%d7
        bne     sl_ue_loop
        tst.l   %a5
        beq     sl_ue_handled
        bsr     sl_ui_changed
sl_ue_handled:
        moveq   #1,%d0
sl_ue_out:
        movem.l (%sp),%d1-%d7/%a0-%a5
        lea     52(%sp),%sp
        rts

| Holding a trig installs the global lock encoder map, bypassing the setup
| window's ordinary knob callback. Handle its(control,rawdelta) before stock
| rejects the open setup window; all other contexts replay the native entry.
sl_ui_held_knob_hook:
        lea     -60(%sp),%sp
        movem.l %d0-%d7/%a0-%a6,(%sp)
        movea.l 64(%sp),%a3
        cmpa.l  #6,%a3
        bcc     sl_uhk_stock
        move.l  68(%sp),%d3
        move.l  %a3,%d0
        moveq   #24,%d1
        mulu.l  %d1,%d0
        lea     0x46c7de2e,%a0         | encoder A pressed flag + control*24
        tst.l   (%a0,%d0.l)
        beq     sl_uhk_edit
        move.l  %d3,%d0
        lsl.l   #3,%d0
        sub.l   %d3,%d0
        move.l  %d0,%d3
sl_uhk_edit:
        bsr     sl_ui_edit
        tst.l   %d0
        beq     sl_uhk_stock
        movea.l 0x400bb7f4,%a0         | same redraw as ordinary setup edit
        jsr     (%a0)
        movem.l (%sp),%d0-%d7/%a0-%a6
        lea     60(%sp),%sp
        rts
sl_uhk_stock:
        movem.l (%sp),%d0-%d7/%a0-%a6
        lea     60(%sp),%sp
        lea     -80(%sp),%sp
        movem.l %d2-%d7/%a2-%a6,(%sp)
        jmp     0x400508ec

| the trig press (0x40050fd6) and release (0x4005fbd2) handlers call
| 0x4002ce54 right after they change the held-trig mask 0x460d174a; stock
| redraws its trig window there but not an open PLAYBACK SETUP window, so a
| synth page kept the inversion of a released lock and did not show a held
| step's locks. The detours redraw the setup window of an FM / SY page first,
| then replay the call (its d0 is the handler's) and return past it.
        .global sl_ui_trig_press_hook,sl_ui_trig_rel_hook
sl_ui_trig_press_hook:
        bsr     sl_ui_setup_redraw
        jsr     0x4002ce54
        jmp     0x40050fdc
sl_ui_trig_rel_hook:
        bsr     sl_ui_setup_redraw
        jsr     0x4002ce54
        jmp     0x4005fbd8

| The setup window is the active one and its page is an FM / SY synth page:
| its redraw (the knob hook's). Every register preserved.
sl_ui_setup_redraw:
        lea     -60(%sp),%sp
        movem.l %d0-%d7/%a0-%a6,(%sp)
        move.l  0x400bcd14,%d0
        cmpi.l  #0x400bb7c8,%d0
        bne     sl_usr_out
        tst.l   0x400bb7d0
        beq     sl_usr_out
        mvz.b   0x100b14cc,%d2           | the current track
        cmpi.l  #7,%d2
        bhi     sl_usr_out
        jsr     sd_kind:l                | sydrum.s: 2 = SY DRUM
        beq     sl_usr_out               | any other machine: stock
        movea.l 0x400bb7f4,%a0
        jsr     (%a0)
sl_usr_out:
        movem.l (%sp),%d0-%d7/%a0-%a6
        lea     60(%sp),%sp
        rts

| Entry detour for stock 4005040c(key,event), eight displaced bytes. The
| stock held-trig map remains in use: only SY PB SETUP is intercepted here.
sl_ui_key_hook:
        bsr     sl_ui_key
        tst.l   %d0
        bne     sl_uk_hook_done
        lea     -76(%sp),%sp
        movem.l %d2-%d7/%a2-%a6,(%sp)
        jmp     0x40050414
sl_uk_hook_done:
        rts

| Incoming key/event are at8/12(sp), because the detour calls this helper.
sl_ui_key:
        lea     -56(%sp),%sp
        movem.l %d1-%d7/%a0-%a6,(%sp)
        move.l  64(%sp),%d4
        subi.l  #0x38,%d4
        cmpi.l  #5,%d4
        bhi     sl_uk_no
        bsr     sl_ui_context
        tst.l   %d0
        bne     sl_uk_context
        tst.l   68(%sp)
        bne     sl_uk_no
        cmpi.l  #SL_CONTROLS,%d4         | A..F
        bcc     sl_uk_no
        lea     sl_ui_pressed(%pc),%a0
        tst.b   (%a0,%d4.l)
        beq     sl_uk_no
        clr.b   (%a0,%d4.l)             | consume release of an old SY gesture
        bra     sl_uk_handled
sl_uk_context:
        bsr     sl_ui_lockable           | A..D: E / F are consumed, never touch a lock
        beq     sl_uk_handled             | elsewhere hidden E/F must not touch page1 locks
        bsr     sl_ui_readable
        tst.l   %d0
        bne     sl_uk_ready
        lea     sl_ui_pressed:l,%a0
        clr.b   (%a0,%d4.l)
        bra     sl_uk_handled
sl_uk_ready:
        lea     sl_ui_moved(%pc),%a4
        lea     sl_ui_pressed(%pc),%a5
        tst.l   68(%sp)
        beq     sl_uk_release
        clr.b   (%a4,%d4.l)
        moveq   #1,%d0
        move.b  %d0,(%a5,%d4.l)
        movea.l %d0,%a6                 | press: make absent locks explicit
        bsr     sl_ui_signature
        lea     sl_ui_signature_saved:l,%a0
        move.l  %d4,%d2
        lsl.l   #3,%d2
        move.l  %d0,(%a0,%d2.l)          | (eight bytes a control: A..F fit its 48)
        move.l  %d1,4(%a0,%d2.l)
        bra     sl_uk_scan
sl_uk_release:
        tst.b   (%a5,%d4.l)
        beq     sl_uk_handled
        clr.b   (%a5,%d4.l)
        tst.b   (%a4,%d4.l)
        bne     sl_uk_handled
        bsr     sl_ui_signature
        lea     sl_ui_signature_saved:l,%a0
        move.l  %d4,%d2
        lsl.l   #3,%d2
        cmp.l   (%a0,%d2.l),%d0
        bne     sl_uk_handled
        cmp.l   4(%a0,%d2.l),%d1
        bne     sl_uk_handled
        suba.l  %a6,%a6                 | release: remove existing untouched lock
sl_uk_scan:
        suba.l  %a3,%a3
        mvz.w   0x460d174a,%d6
        moveq   #0,%d7
sl_uk_loop:
        btst    %d7,%d6
        beq     sl_uk_next
        bsr     sl_ui_location
        move.l  0x460d174c,%d3
        add.l   %d7,%d3
        bsr     sl_row
        tst.l   %a6
        beq     sl_uk_remove
        mvz.b   (%a0,%d4.l),%d5
        cmpi.l  #255,%d5
        bne     sl_uk_next
        bsr     sl_ui_default
        bra     sl_uk_write
sl_uk_remove:
        move.l  #255,%d5
sl_uk_write:
        bsr     sl_write
        cmpi.l  #1,%d0
        bne     sl_uk_next
        movea.l %d0,%a3
        tst.l   %a6
        beq     sl_uk_next
        move.b  %d0,(%a4,%d4.l)         | newly added locks survive release
sl_uk_next:
        addq.l  #1,%d7
        cmpi.l  #16,%d7
        bne     sl_uk_loop
        tst.l   %a3
        beq     sl_uk_handled
        bsr     sl_ui_changed
sl_uk_handled:
        moveq   #1,%d0
        bra     sl_uk_out
sl_uk_no:
        moveq   #0,%d0
sl_uk_out:
        movem.l (%sp),%d1-%d7/%a0-%a6
        lea     56(%sp),%sp
        rts

| d0/d1 signature for press/release identity. No clearing a different selection.
sl_ui_signature:
        move.l  0x100b14cc,%d0           | track, padding, bank, Part
        mvz.b   0x100b14d0,%d1
        lsl.l   #8,%d1
        or.l    0x460d174c,%d1
        swap    %d1
        move.w  0x460d174a,%d1
        rts

| UI-local redraw/edit acknowledgement; storage owns dirty generation and
| sequencer integration owns native has-lock/trigless derived-cache handling.
sl_ui_changed:
        moveq   #1,%d0
        move.l  %d0,0x460d173a
        clr.w   0x460d1a9e
        clr.w   0x460d1aa0
        clr.w   0x460d1aa2
        clr.w   0x460d1aa4
        clr.w   0x460d1aa6
        clr.w   0x460d10dc
        bsr     sl_ui_refresh_locks
        rts

| Rebuild native has-lock flags, then the patched stock tail adds our rows.
| Native columns and trigger bitmaps are never modified by this UI cache.
sl_ui_refresh_locks:
        lea     -60(%sp),%sp
        movem.l %d0-%d7/%a0-%a6,(%sp)
        jsr     0x400339d8
        movem.l (%sp),%d0-%d7/%a0-%a6
        lea     60(%sp),%sp
        rts

| Detours replace only the restored-register/stack tail, then replay it.
| Full refresh40033aac: 4cd77cfc4fef002c; single-row40033b32:4cd7001c4fef000c.
sl_ui_cache_full_tail:
        bsr     sl_ui_cache_overlay
        movem.l (%sp),%d2-%d7/%a2-%a6
        lea     44(%sp),%sp
        rts
sl_ui_cache_row_tail:
        bsr     sl_ui_cache_overlay
        movem.l (%sp),%d2-%d4
        lea     12(%sp),%sp
        rts

sl_ui_cache_overlay:
        lea     -60(%sp),%sp
        movem.l %d0-%d7/%a0-%a6,(%sp)
        mvz.b   0x100b14ce,%d0
        cmpi.l  #16,%d0
        bcc     sl_uco_out
        move.l  sl_ready_mask:l,%d4
        btst    %d0,%d4
        beq     sl_uco_out
        move.l  sl_blocked_mask:l,%d4
        btst    %d0,%d4
        bne     sl_uco_out
        mvz.b   0x100b14d0,%d1
        cmpi.l  #16,%d1
        bcc     sl_uco_out
        lea     0x46c7d48c,%a2
        moveq   #0,%d2
sl_uco_track:
        moveq   #1,%d4
        lsl.l   %d2,%d4
        moveq   #0,%d3
sl_uco_step:
        bsr     sl_row
        move.l  4(%a0),%d5
        ori.l   #0xffff,%d5              | A..F (G H masked off)
        and.l   (%a0),%d5
        moveq   #-1,%d6
        cmp.l   %d6,%d5
        bne     sl_uco_af
        bra     sl_uco_next
sl_uco_af:
        cmp.l   (%a0),%d6                | only E / F locked (a sidecar track's on the development
        bne     sl_uco_mark              | line): no has-lock mark here
        bra     sl_uco_next
sl_uco_mark:
        mvz.b   (%a2,%d3.l),%d5
        or.l    %d4,%d5
        move.b  %d5,(%a2,%d3.l)
sl_uco_next:
        addq.l  #1,%d3
        cmpi.l  #64,%d3
        bne     sl_uco_step
        addq.l  #1,%d2
        cmpi.l  #8,%d2
        bne     sl_uco_track
sl_uco_out:
        movem.l (%sp),%d0-%d7/%a0-%a6
        lea     60(%sp),%sp
        rts

| a0 = SY DRUM's page descriptor (sd_setup_patch). Its four PLAYBACK SETUP widget slots
| (LSPD LDEP WAVE S&H) become sl_ui_widget; preserves all regs.
sl_ui_patch:
        move.l  %a1,-(%sp)
        lea     sl_ui_widget(%pc),%a1
        move.l  %a1,0x112(%a0)
        move.l  %a1,0x116(%a0)
        move.l  %a1,0x11a(%a0)
        move.l  %a1,0x11e(%a0)
        movea.l (%sp)+,%a1
        rts

| Original widget ABI(x,y,control,value,flags,formatter,canvas). Copy args,
| preserve caller's stack and the WAVE full-dial / S&H switch renderers.
| Lowest held step is the display representative, as stock held-step UI.
sl_ui_widget:
        lea     -60(%sp),%sp
        movem.l %d2-%d7/%a2-%a3,28(%sp)
        move.l  64(%sp),(%sp)
        move.l  68(%sp),4(%sp)
        move.l  72(%sp),8(%sp)
        move.l  76(%sp),12(%sp)
        move.l  80(%sp),16(%sp)
        move.l  84(%sp),20(%sp)
        move.l  88(%sp),24(%sp)
        move.l  8(%sp),%d4
        bsr     sl_ui_context
        tst.l   %d0
        beq     sl_uw_draw
        bsr     sl_ui_readable
        tst.l   %d0
        beq     sl_uw_draw
        bsr     sl_ui_lockable
        beq     sl_uw_draw
| The control is inverted iff a HELD step carries a lock on it; the value shown is
| the lowest such step's (stock's main pages, held trigs).
        mvz.w   0x460d174a,%d6
        suba.l  %a3,%a3
sl_uw_step:
        move.l  %a3,%d3
        btst    %d3,%d6
        beq     sl_uw_skip
        add.l   0x460d174c,%d3
        bsr     sl_ui_location
        bsr     sl_row
        mvz.b   (%a0,%d4.l),%d5
        cmpi.l  #255,%d5
        bne     sl_uw_found
sl_uw_skip:
        addq.l  #1,%a3
        cmpa.l  #16,%a3
        bne     sl_uw_step
        bra     sl_uw_draw
sl_uw_found:
        move.l  %d5,12(%sp)
        move.l  16(%sp),%d0
        ori.l   #1,%d0                  | same highlighted-value flag as native lock
        move.l  %d0,16(%sp)
sl_uw_draw:
        cmpi.l  #2,%d4
        beq     sl_uw_wave
        cmpi.l  #3,%d4
        beq     sl_uw_sh
        jsr     0x400479b4               | LSPD, LDEP: the stock dial
        bra     sl_uw_out
sl_uw_wave:
        jsr     sy1_wid_wave:l           | WAVE: OFF TRI SQR RND across the dial
        bra     sl_uw_out
sl_uw_sh:
        jsr     0x40046f10               | S&H: the stock switch
sl_uw_out:
        movem.l 28(%sp),%d2-%d7/%a2-%a3
        lea     60(%sp),%sp
        rts

        .balign 4
sl_ui_moved:
        .space 16                       | per control A..J (+ spare)
sl_ui_pressed:
        .space 16
sl_ui_signature_saved:
        .space 128                      | eight bytes a control, 16 controls
        .balign 4
sl_ui_max6:                             | SY DRUM: A..D maxima (LSPD LDEP WAVE S&H), then 0 (not lockable here)
        .byte 127,127,3,1,0,0,0,0,0,0,0,0,0,0,0,0
        .balign 2
