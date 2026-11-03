| APPLY SCENE -- hold [SCENE A] and press [YES]: scene A's locks become the
| active Part's base values; [SCENE B] + [YES] likewise for scene B; hold
| both scene keys and press [YES]: what the crossfader blends right now
| becomes the base.
|
| One detour, at the entry of stock's base-layer YES handler (0x4005e4c8,
| handler(key, edge)). The SCENE key's held layer (keys 0x400babc6 /
| 0x400baf34) has no YES record, so a YES pressed while a scene key is held
| falls through to this handler, which on stock shows ARM ALL exactly as
| YES alone does. Which scene keys are down comes from stock's per-key
| state table (0x46c7d8f1 + key*24, nonzero while the key is down: SCENE A
| 0x19, SCENE B 0x1a); stock's own held-scene word (0x460d169c) names only
| the last scene key pressed and clears when either is released. With a
| scene key down, in audio mode and outside the one mode stock diverts YES
| from (0x460d1aec), the press runs as_apply instead and its release is
| swallowed; every other YES replays the two displaced instructions and
| rejoins stock.
|
| Per track and scene byte k (0-5 PLAYBACK of the assigned machine, 6-11
| LFO, 12-17 AMP, 18-23 FX1, 24-29 FX2):
|  - one scene (mode 1 = A, 2 = B): the lock of the scene at Part+0x10
|    (A) or +0x11 (B), whether or not that scene is muted; an unlocked
|    byte is left alone.
|  - the blend (mode 3): stock's scene morph (the frame builder,
|    0x4000ce42..0x4000cefa). Side A is the lock of the scene at Part+0x10
|    or, unlocked or muted (0x80000006), the Part base; side B likewise
|    (+0x11, 0x80000007). The halfword stock hands the DSP is A*256*wA +
|    B*256*wB in Q15, rounded to nearest, with wA/wB the negated halves of
|    the track's weight long (0x80003c60 + 4t, what the fader event wrote).
|    The new base is that halfword rounded to a whole knob step:
|    (hw + 0x80) >> 8.
| A value that differs from the base goes through stock's page-1 writer
| 0x40054cd8(track, flat, value), the MIDI CC store: it refuses disabled
| slots (AMP XVOL, empty THRU/NEIGHBOR/PICKUP slots), clamps to the
| descriptor, writes the working Part, its CS1 copy and the live lane, and
| sets the unsaved bit and edited flags. The toast names the mode, or says
| NOTHING TO APPLY when no value differed from the Part (no locks, the same
| apply twice, or the blend with both scenes muted). The saved Part, both scenes, the
| selection, the mutes and the fader are not touched, so stock RELOAD PART
| restores the Part as it was last saved.
|
| TRIG + SCENE (0.2): in grid recording, hold trigs, press SCENE A, SCENE B
| or both; when the last scene key goes up, every value the scene (or the
| blend) locks becomes a p-lock on each held step of the active track.
| Two more detours, at the entries of stock's SCENE press 0x4004348c(key,
| 1) and release 0x40054ca4(key, 0). A press with trigs held (0x460d174a,
| nonzero only in grid recording) and no chord running starts one: it
| notes the held steps, the track, pattern and Part, and a snapshot of what
| stock's own gestures inside the chord change (the scene selection, the
| track's two selected lock rows, their XLV rows: a trig pressed while a
| scene key is held selects a scene, a knob locks one). It clears stock's
| remove-on-release masks and marks the held trigs used, as a knob turn
| does, so the trigs stay. Each scene key pressed while the chord runs is
| added to its mode. When the last one is released the chord ends: if the
| track, pattern, Part and snapshot are as they were, as_lock writes the
| locks; otherwise stock's gesture won and nothing is written.
| Per held step and scene byte k (the step lock's slot k is the same
| parameter): one scene writes its lock, muted or not; the blend writes the
| morph as above, with the step's own lock standing in for the Part value
| where the step has one (stock applies step locks before the morph). Slots
| the page lacks (0x40031da4(track, page)'s enable bits) are skipped, values
| are clamped to the descriptor and 0..127 as stock's lock writer
| 0x400508e4 does, and each changed byte is stored as that writer stores
| it: bank RAM, the battery copy (0x1001614e), the step's has-locks bit,
| the edited flags, then the track is rebuilt for the sequencer. Toasts:
| SCENE A/B TO TRIGS, SCENE BLEND TO TRIGS, NOTHING TO LOCK.
        .text
        .global as_yes_hook
        .global as_scene_press
        .global as_scene_release

        .set    KEY_A,      0x46c7db49  | stock's key state, SCENE A: nonzero while down
        .set    KEY_B,      0x46c7db61  | SCENE B
        .set    YES_DIVERT, 0x460d1aec  | stock sends YES to 0x4004903c while set
        .set    MIDI_MODE,  0x80000012
        .set    BANK_BASE,  0x46c82456  | the current bank's RAM
        .set    CUR_PART,   0x100b14cf  | the active Part, 0..3
        .set    MUTE_A,     0x80000006
        .set    MUTE_B,     0x80000007
        .set    WEIGHTS,    0x80003c60  | per track: (-wA << 16) | (-wB & 0xffff), Q15
        .set    P1_WRITER,  0x40054cd8
        .set    NOTIFY,     0x4005a2b8  | (text, ticks): the stock toast
        .set    XF_LAST,    0x400c0c44  | the fader value the STRT/LEN/RATE morph last sent
        .set    XF_MORPH,   0x4003f1b4  | that morph, as a fader move runs it
        .set    YES_REJOIN, 0x4005e4d0  | after the two displaced instructions
        | TRIG + SCENE
        .set    HELD_TRIGS, 0x460d174a  | u16, a bit per trig key held in grid recording
        .set    HELD_PAGE,  0x460d174c  | the first step of the page those keys name
        .set    CUR_TRACK,  0x100b14cc
        .set    CUR_PAT,    0x100b14d0
        .set    PEND_KEEP,  0x460d1a9e  | five u16 masks: trigs stock removes on release
        .set    PEND_X,     0x460d10dc
        .set    TRIG_USED,  0x460d173a  | a held trig was used: stock keeps it on release
        .set    LOCK_DRAW,  0x460d1750
        .set    STEP_LOCKED, 0x46c7d48c | per step, a bit per audio track: the step has locks
        .set    PAT_CS1,    0x1001614e  | the current bank's patterns, battery copy
        .set    BANK_EDIT,  0x9b332     | bank RAM + this: the bank is edited
        .set    EDITED,     0x100f8598
        .set    DESC,       0x40031da4  | (track, page): the page's descriptor
        .set    UNDO_OFF,   0x40027e00  | the calls stock's lock writer makes after a write
        .set    UNDO_CLEAR, 0x40027de4
        .set    TRACK_REBUILD, 0x4009da20 | (track): the sequencer reads the track again
        .set    LEDS,       0x400418e0
        .set    REDRAW,     0x4004d948  | (-1)
        .set    SCENE_LAYER, 0x400babba | the layer stock's SCENE release removes
        .set    PRESS_REJOIN, 0x40043492 | SCENE press, after its two displaced instructions
        .set    REL_REJOIN, 0x40054caa  | SCENE release, after its displaced pea

| -------- the detour: replaces `move.l 4(%sp),%d1; move.l 8(%sp),%d0` --
as_yes_hook:
        tst.l   8(%sp)                  | edge: 0 = release
        beq.s   .Lrelease
        moveq   #0,%d0                  | the mode: 1 = A, 2 = B, 3 = both (the blend)
        tst.b   (KEY_A).l
        beq.s   1f
        moveq   #1,%d0
1:      tst.b   (KEY_B).l
        beq.s   2f
        addq.l  #2,%d0
2:      tst.l   %d0
        beq.s   .Lstock
        tst.l   (YES_DIVERT).l
        bne.s   .Lstock
        tst.l   (MIDI_MODE).l
        bne.s   .Lstock
        lea     as_taken(%pc),%a0
        move.b  #1,(%a0)
        bra.w   as_apply                | d0 = the mode; its rts returns to the key dispatcher
.Lrelease:
        lea     as_taken(%pc),%a0       | swallow only the release of a press we took
        tst.b   (%a0)
        beq.s   .Lstock
        clr.b   (%a0)
        rts
.Lstock:
        move.l  4(%sp),%d1
        move.l  8(%sp),%d0
        jmp     (YES_REJOIN).l

| -------- the apply ------------------------------------------------------
| d7 track, d6 scene byte k, d5 wA, d4 wB, d3 the LFO/AMP/FX block - 6,
| a2 the assigned machine's PLAYBACK block, a3/a4 the A/B lock rows (0 =
| muted; one scene: a3 its row, a4 0), a5 the working Part. 40(%sp)
| counts the bytes that changed, 44(%sp) holds the mode.
as_apply:
        lea     -48(%sp),%sp
        movem.l %d2-%d7/%a2-%a5,(%sp)
        clr.l   40(%sp)
        move.l  %d0,44(%sp)
        movea.l (BANK_BASE).l,%a5
        moveq   #0,%d0
        move.b  (CUR_PART).l,%d0
        move.l  #0x18b2,%d1
        muls.l  %d1,%d0
        adda.l  %d0,%a5
        adda.l  #0x8ed80,%a5            | W = the active working Part
        moveq   #0,%d7
.Ltrack:
        | the A and B lock rows: W + 0x662 + (scene*8 + t)*32, or 0 when muted
        suba.l  %a3,%a3
        suba.l  %a4,%a4
        moveq   #3,%d0
        cmp.l   44(%sp),%d0
        beq.s   0f
        moveq   #0x10-1,%d1             | one scene, muted or not: its row alone
        add.l   44(%sp),%d1
        moveq   #0,%d0
        move.b  (%a5,%d1.l),%d0
        bsr.w   as_row
        movea.l %a0,%a3
        bra.s   2f
0:      tst.b   (MUTE_A).l
        bne.s   1f
        moveq   #0,%d0
        move.b  0x10(%a5),%d0
        bsr.w   as_row
        movea.l %a0,%a3
1:      tst.b   (MUTE_B).l
        bne.s   2f
        moveq   #0,%d0
        move.b  0x11(%a5),%d0
        bsr.w   as_row
        movea.l %a0,%a4
2:      | the weights
        lea     (WEIGHTS).l,%a0
        move.l  (%a0,%d7.l*4),%d0
        move.l  %d0,%d5
        swap    %d5
        ext.l   %d5
        neg.l   %d5                     | wA
        move.w  %d0,%d4
        ext.l   %d4
        neg.l   %d4                     | wB
        | PLAYBACK: W + 0x2a + t*30 + machine*6 (+ k)
        moveq   #0,%d0
        move.b  0x22(%a5,%d7.l),%d0
        move.l  %d0,%d1
        add.l   %d1,%d1
        add.l   %d1,%d0
        add.l   %d0,%d0                 | machine*6
        move.l  %d7,%d1
        lsl.l   #5,%d1
        sub.l   %d7,%d1
        sub.l   %d7,%d1                 | t*30
        add.l   %d1,%d0
        lea     0x2a(%a5,%d0.l),%a2
        | LFO/AMP/FX1/FX2: W + 0x11a + t*24 + (k - 6)
        move.l  %d7,%d3
        lsl.l   #3,%d3
        move.l  %d3,%d1
        add.l   %d1,%d1
        add.l   %d1,%d3                 | t*24
        add.l   %a5,%d3
        add.l   #0x114,%d3
        moveq   #0,%d6
.Lparam:
        moveq   #-1,%d1                 | side A lock, -1 = none
        cmpa.l  #0,%a3
        beq.s   3f
        move.b  (%a3,%d6.l),%d1
        extb.l  %d1
3:      moveq   #-1,%d2                 | side B lock
        cmpa.l  #0,%a4
        beq.s   4f
        move.b  (%a4,%d6.l),%d2
        extb.l  %d2
4:      move.l  %d1,%d0
        and.l   %d2,%d0
        bmi.w   .Lnext                  | both unlocked: stock passes the base through
        moveq   #6,%d0
        cmp.l   %d0,%d6
        bge.s   5f
        lea     (%a2,%d6.l),%a0
        bra.s   6f
5:      movea.l %d3,%a0
        adda.l  %d6,%a0
6:      moveq   #0,%d0
        move.b  (%a0),%d0               | the Part base
        moveq   #3,%d2
        cmp.l   44(%sp),%d2
        bne.s   .Lwrite                 | one scene: d1 is its lock
        moveq   #-1,%d2                 | the blend: side B's lock again
        cmpa.l  #0,%a4
        beq.s   7f
        move.b  (%a4,%d6.l),%d2
        extb.l  %d2
7:      tst.l   %d1                     | an unlocked side plays the base
        bpl.s   8f
        move.l  %d0,%d1
8:      tst.l   %d2
        bpl.s   8f
        move.l  %d0,%d2
8:      muls.l  %d5,%d1
        muls.l  %d4,%d2
        add.l   %d2,%d1
        moveq   #64,%d2
        add.l   %d2,%d1
        asr.l   #7,%d1                  | the DSP halfword, rounded as the MAC rounds
        add.l   #0x80,%d1
        asr.l   #8,%d1                  | to a whole knob step
.Lwrite:
        cmp.l   %d0,%d1
        beq.s   .Lnext
        move.l  %d0,%d2                 | the base, kept across the call
        move.l  %d1,-(%sp)              | value
        move.l  %d6,-(%sp)              | flat = the scene byte numbering
        move.l  %d7,-(%sp)              | track
        jsr     (P1_WRITER).l
        lea     12(%sp),%sp
        | count only a byte that changed: the writer refuses disabled slots
        | (AMP XVOL) and clamps, so a lock can leave the Part as it was
        moveq   #6,%d0
        cmp.l   %d0,%d6
        bge.s   1f
        lea     (%a2,%d6.l),%a0
        bra.s   2f
1:      movea.l %d3,%a0
        adda.l  %d6,%a0
2:      moveq   #0,%d0
        move.b  (%a0),%d0
        cmp.l   %d2,%d0
        beq.s   .Lnext
        addq.l  #1,40(%sp)
.Lnext:
        addq.l  #1,%d6
        moveq   #30,%d0
        cmp.l   %d0,%d6
        blt.w   .Lparam
        addq.l  #1,%d7
        moveq   #8,%d0
        cmp.l   %d0,%d7
        blt.w   .Ltrack
        tst.l   40(%sp)
        beq.s   9f
        | STRT/LEN/RATE reach the voices as a message on a fader move only:
        | send it again from the new base, as a fader move would.
        moveq   #-1,%d0
        move.l  %d0,(XF_LAST).l
        jsr     (XF_MORPH).l
9:      lea     as_text_a(%pc),%a0
        move.l  44(%sp),%d0
        subq.l  #1,%d0
        beq.s   1f
        lea     as_text_b(%pc),%a0
        subq.l  #1,%d0
        beq.s   1f
        lea     as_text_mix(%pc),%a0
1:      tst.l   40(%sp)                 | nothing written: no lock differed from the Part
        bne.s   2f
        lea     as_text_none(%pc),%a0
2:      pea     (0x30).w
        move.l  %a0,-(%sp)
        jsr     (NOTIFY).l
        addq.l  #8,%sp
        movem.l (%sp),%d2-%d7/%a2-%a5
        lea     48(%sp),%sp
        rts

| -------- TRIG + SCENE: the press, replaces `move.l %d2,-(%sp); move.l 8(%sp),%d2`
as_scene_press:
        move.l  4(%sp),%d0
        moveq   #0x19,%d1
        sub.l   %d1,%d0                 | 0 = SCENE A, 1 = SCENE B
        moveq   #1,%d1
        cmp.l   %d1,%d0
        bhi.s   .Lsp_stock
        addq.l  #1,%d0                  | the key's bit: A 1, B 2
        lea     as_chord(%pc),%a0
        tst.b   (%a0)
        bne.s   .Lsp_add
        tst.w   (HELD_TRIGS).l
        beq.s   .Lsp_stock
        tst.l   (MIDI_MODE).l
        bne.s   .Lsp_stock
        move.l  %d0,-(%sp)
        bsr.w   as_chord_begin
        move.l  (%sp)+,%d0
        lea     as_chord(%pc),%a0
.Lsp_add:
        moveq   #0,%d1
        move.b  1(%a0),%d1
        or.l    %d0,%d1
        move.b  %d1,1(%a0)              | down
        move.b  2(%a0),%d1
        or.l    %d0,%d1
        move.b  %d1,2(%a0)              | seen: the mode
.Lsp_stock:
        move.l  %d2,-(%sp)
        move.l  8(%sp),%d2
        jmp     (PRESS_REJOIN).l

| -------- the release, replaces `pea 0x400babba` -------------------------
as_scene_release:
        lea     as_chord(%pc),%a0
        tst.b   (%a0)
        beq.s   .Lsr_stock
        move.l  4(%sp),%d0
        moveq   #0x19,%d1
        sub.l   %d1,%d0
        moveq   #1,%d1
        cmp.l   %d1,%d0
        bhi.s   .Lsr_stock
        addq.l  #1,%d0
        not.l   %d0
        moveq   #0,%d1
        move.b  1(%a0),%d1
        and.l   %d0,%d1
        move.b  %d1,1(%a0)
        bne.s   .Lsr_stock              | a scene key of the chord is still down
        clr.b   (%a0)                   | the last one: the chord ends
        bsr.w   as_lock
.Lsr_stock:
        pea     (SCENE_LAYER).l
        jmp     (REL_REJOIN).l

| d0-d1/a0-a1 clobbered
as_chord_begin:
        lea     as_chord(%pc),%a0
        move.b  #1,(%a0)
        clr.b   1(%a0)
        clr.b   2(%a0)
        move.b  (CUR_TRACK).l,%d0
        move.b  %d0,3(%a0)
        move.b  (CUR_PAT).l,%d0
        move.b  %d0,4(%a0)
        move.b  (CUR_PART).l,%d0
        move.b  %d0,5(%a0)
        move.w  (HELD_TRIGS).l,%d0
        move.w  %d0,6(%a0)
        move.l  (HELD_PAGE).l,%d0
        move.l  %d0,8(%a0)
        lea     12(%a0),%a1
        bsr.w   as_snap
        | the held trigs are used, as a knob turn uses them: stock keeps them
        lea     (PEND_KEEP).l,%a1
        clr.l   (%a1)+
        clr.l   (%a1)+
        clr.w   (%a1)
        clr.w   (PEND_X).l
        moveq   #1,%d0
        move.l  %d0,(TRIG_USED).l
        rts

| a0 = the active working Part; d0-d1 clobbered
as_work:
        moveq   #0,%d0
        move.b  (CUR_PART).l,%d0
        mulu.w  #0x18b2,%d0
        add.l   #0x8ed80,%d0
        movea.l (BANK_BASE).l,%a0
        adda.l  %d0,%a0
        rts

| a1 = 86 bytes: the scene selection, then per side the chord track's lock
| row and the scene's XLV row; d0-d1/a0-a1 clobbered
as_snap:
        lea     -12(%sp),%sp
        movem.l %d2-%d3/%a2,(%sp)
        bsr.w   as_work
        movea.l %a0,%a2
        moveq   #0,%d3
        move.b  as_chord+3(%pc),%d3
        move.b  0x10(%a2),(%a1)+
        move.b  0x11(%a2),(%a1)+
        moveq   #0,%d2                  | the side
1:      moveq   #0,%d0
        move.b  0x10(%a2,%d2.l),%d0     | its scene
        move.l  %d0,%d1
        lsl.l   #3,%d0
        add.l   %d3,%d0
        lsl.l   #5,%d0
        movea.l %a2,%a0
        adda.l  %d0,%a0
        adda.l  #0x662,%a0
        moveq   #31,%d0
2:      move.b  (%a0)+,(%a1)+
        subq.l  #1,%d0
        bpl.s   2b
        move.l  %d1,%d0                 | XLV: W + 0x1662 + scene*10
        lsl.l   #3,%d0
        add.l   %d1,%d0
        add.l   %d1,%d0
        movea.l %a2,%a0
        adda.l  %d0,%a0
        adda.l  #0x1662,%a0
        moveq   #9,%d0
3:      move.b  (%a0)+,(%a1)+
        subq.l  #1,%d0
        bpl.s   3b
        addq.l  #1,%d2
        moveq   #2,%d0
        cmp.l   %d0,%d2
        blt.s   1b
        movem.l (%sp),%d2-%d3/%a2
        lea     12(%sp),%sp
        rts

| d0 into 0..127
as_clamp7:
        tst.l   %d0
        bpl.s   1f
        moveq   #0,%d0
1:      cmpi.l  #127,%d0
        ble.s   2f
        moveq   #127,%d0
2:      rts

| -------- the chord's end: write the locks ----------------------------------
| d7 track, d6 scene byte k, d5 wA, d4 wB, d3 step*32, a2 the track's step
| locks (bank RAM), a3/a4 the A/B lock rows (0 = muted; one scene: a3 its
| row, a4 0), a5 the working Part. Frame: 40 count, 44 mode, 48 battery
| copy - bank RAM, 52 the PLAYBACK base, 56 the LFO/AMP/FX base - 6, 84 the
| page's first step, 88 the steps still to do, 92 the step, 96 + 2k the
| slot's lowest and highest value (lowest -1: the page has no such knob).
| 40..125 first hold the snapshot compared against the chord's.
as_lock:
        lea     -160(%sp),%sp
        movem.l %d2-%d7/%a2-%a5,(%sp)
        lea     as_chord(%pc),%a2
        moveq   #0,%d0
        moveq   #0,%d1
        move.b  (CUR_TRACK).l,%d0
        move.b  3(%a2),%d1
        cmp.l   %d0,%d1
        bne.w   .Ll_out
        move.b  (CUR_PAT).l,%d0
        move.b  4(%a2),%d1
        cmp.l   %d0,%d1
        bne.w   .Ll_out
        move.b  (CUR_PART).l,%d0
        move.b  5(%a2),%d1
        cmp.l   %d0,%d1
        bne.w   .Ll_out
        lea     40(%sp),%a1
        bsr.w   as_snap
        lea     as_chord+12(%pc),%a0
        lea     40(%sp),%a1
        moveq   #0,%d1
        moveq   #0,%d2
        moveq   #85,%d0
1:      move.b  (%a0)+,%d1
        move.b  (%a1)+,%d2
        cmp.l   %d1,%d2
        bne.w   .Ll_out                 | stock selected a scene or wrote a lock
        subq.l  #1,%d0
        bpl.s   1b

        lea     as_chord(%pc),%a2
        clr.l   40(%sp)
        moveq   #0,%d0
        move.b  2(%a2),%d0
        move.l  %d0,44(%sp)             | 1 A, 2 B, 3 the blend
        moveq   #0,%d7
        move.b  3(%a2),%d7
        move.l  8(%a2),%d0
        move.l  %d0,84(%sp)
        moveq   #0,%d0
        move.w  6(%a2),%d0
        move.l  %d0,88(%sp)
        bsr.w   as_work
        movea.l %a0,%a5
        | each slot's limits, from the page's descriptor
        moveq   #0,%d6                  | k
        moveq   #0,%d2                  | page
.Ldesc:
        move.l  %d2,-(%sp)
        move.l  %d7,-(%sp)
        jsr     (DESC).l
        addq.l  #8,%sp
        movea.l %d0,%a3
        moveq   #0,%d3                  | slot*4
.Lslot:
        lea     96(%sp),%a0
        adda.l  %d6,%a0
        adda.l  %d6,%a0
        move.l  0x18e(%a3),%d0
        lsr.l   %d3,%d0
        btst    #0,%d0
        bne.s   1f
        move.b  #-1,(%a0)
        bra.s   2f
1:      movea.l %a3,%a1
        adda.l  %d3,%a1
        move.l  0x6a(%a1),%d0           | lowest
        move.l  0x9a(%a1),%d4           | count
        add.l   %d0,%d4
        subq.l  #1,%d4                  | highest
        bsr.w   as_clamp7
        move.b  %d0,(%a0)
        move.l  %d4,%d0
        bsr.w   as_clamp7
        move.b  %d0,1(%a0)
2:      addq.l  #1,%d6
        addq.l  #4,%d3
        moveq   #24,%d0
        cmp.l   %d0,%d3
        blt.s   .Lslot
        addq.l  #1,%d2
        moveq   #5,%d0
        cmp.l   %d0,%d2
        blt.s   .Ldesc
        | the A and B lock rows, as the Part apply takes them
        suba.l  %a3,%a3
        suba.l  %a4,%a4
        moveq   #3,%d0
        cmp.l   44(%sp),%d0
        beq.s   3f
        moveq   #0x10-1,%d1
        add.l   44(%sp),%d1
        moveq   #0,%d0
        move.b  (%a5,%d1.l),%d0
        bsr.w   as_row
        movea.l %a0,%a3
        bra.s   5f
3:      tst.b   (MUTE_A).l
        bne.s   4f
        moveq   #0,%d0
        move.b  0x10(%a5),%d0
        bsr.w   as_row
        movea.l %a0,%a3
4:      tst.b   (MUTE_B).l
        bne.s   5f
        moveq   #0,%d0
        move.b  0x11(%a5),%d0
        bsr.w   as_row
        movea.l %a0,%a4
5:      lea     (WEIGHTS).l,%a0
        move.l  (%a0,%d7.l*4),%d0
        move.l  %d0,%d5
        swap    %d5
        ext.l   %d5
        neg.l   %d5                     | wA
        move.w  %d0,%d4
        ext.l   %d4
        neg.l   %d4                     | wB
        | the Part's own values: PLAYBACK W + 0x2a + t*30 + machine*6, the rest W + 0x114 + t*24
        moveq   #0,%d0
        move.b  0x22(%a5,%d7.l),%d0
        move.l  %d0,%d1
        add.l   %d1,%d1
        add.l   %d1,%d0
        add.l   %d0,%d0                 | machine*6
        move.l  %d7,%d1
        lsl.l   #5,%d1
        sub.l   %d7,%d1
        sub.l   %d7,%d1                 | t*30
        add.l   %d1,%d0
        lea     0x2a(%a5,%d0.l),%a0
        move.l  %a0,52(%sp)
        move.l  %d7,%d0
        lsl.l   #3,%d0
        move.l  %d0,%d1
        add.l   %d1,%d1
        add.l   %d1,%d0                 | t*24
        add.l   %a5,%d0
        add.l   #0x114,%d0
        move.l  %d0,56(%sp)
        | the track's step locks: bank + pattern*0x8ed8 + t*0x91a + 0x59
        moveq   #0,%d0
        move.b  (CUR_PAT).l,%d0
        mulu.w  #0x8ed8,%d0             | 16 patterns: fits the word multiply
        move.l  #0x91a,%d1
        muls.l  %d7,%d1
        add.l   %d1,%d0
        add.l   #0x59,%d0
        movea.l (BANK_BASE).l,%a2
        adda.l  %d0,%a2
        move.l  #PAT_CS1,%d0
        sub.l   (BANK_BASE).l,%d0
        move.l  %d0,48(%sp)
.Lstep:
        move.l  88(%sp),%d0
        beq.w   .Ldone
        moveq   #0,%d1
1:      btst    %d1,%d0                 | the lowest held trig
        bne.s   2f
        addq.l  #1,%d1
        bra.s   1b
2:      bclr    %d1,%d0
        move.l  %d0,88(%sp)
        move.l  %d1,%d3
        add.l   84(%sp),%d3             | its step
        move.l  %d3,92(%sp)
        lsl.l   #5,%d3
        moveq   #0,%d6
.Lk:
        moveq   #-1,%d1                 | side A's lock, -1 = none
        cmpa.l  #0,%a3
        beq.s   1f
        move.b  (%a3,%d6.l),%d1
        extb.l  %d1
1:      moveq   #-1,%d2                 | side B's
        cmpa.l  #0,%a4
        beq.s   2f
        move.b  (%a4,%d6.l),%d2
        extb.l  %d2
2:      move.l  %d1,%d0
        and.l   %d2,%d0
        bmi.w   .Lknext                 | no scene of the chord locks it
        lea     96(%sp),%a1
        adda.l  %d6,%a1
        adda.l  %d6,%a1
        tst.b   (%a1)
        bmi.w   .Lknext                 | the page has no such knob
        lea     (%a2,%d3.l),%a0
        adda.l  %d6,%a0                 | the step's lock byte
        moveq   #3,%d0
        cmp.l   44(%sp),%d0
        bne.s   .Lclamp                 | one scene: d1 is its lock
        moveq   #0,%d0
        move.b  (%a0),%d0               | the blend: what the step plays
        cmpi.l  #0xff,%d0
        bne.s   4f
        moveq   #6,%d0
        cmp.l   %d0,%d6
        bge.s   3f
        movea.l 52(%sp),%a1
        bra.s   6f
3:      movea.l 56(%sp),%a1
6:      moveq   #0,%d0
        move.b  (%a1,%d6.l),%d0         | no step lock: the Part's value
4:      tst.l   %d1
        bpl.s   7f
        move.l  %d0,%d1
7:      tst.l   %d2
        bpl.s   8f
        move.l  %d0,%d2
8:      muls.l  %d5,%d1
        muls.l  %d4,%d2
        add.l   %d2,%d1
        moveq   #64,%d2
        add.l   %d2,%d1
        asr.l   #7,%d1                  | the DSP halfword, rounded as the MAC rounds
        add.l   #0x80,%d1
        asr.l   #8,%d1                  | to a whole knob step
        lea     96(%sp),%a1
        adda.l  %d6,%a1
        adda.l  %d6,%a1
.Lclamp:
        moveq   #0,%d0
        move.b  (%a1),%d0
        cmp.l   %d0,%d1
        bge.s   1f
        move.l  %d0,%d1
1:      move.b  1(%a1),%d0
        cmp.l   %d0,%d1
        ble.s   2f
        move.l  %d0,%d1
2:      move.b  (%a0),%d0
        cmp.l   %d0,%d1
        beq.s   .Lknext                 | the step already has that lock
        move.b  %d1,(%a0)
        move.l  48(%sp),%d0
        move.b  %d1,(%a0,%d0.l)         | and its battery copy
        addq.l  #1,40(%sp)
        lea     (STEP_LOCKED).l,%a1
        move.l  92(%sp),%d0
        moveq   #0,%d1
        move.b  (%a1,%d0.l),%d1
        bset    %d7,%d1
        move.b  %d1,(%a1,%d0.l)
.Lknext:
        addq.l  #1,%d6
        moveq   #30,%d0
        cmp.l   %d0,%d6
        blt.w   .Lk
        bra.w   .Lstep
.Ldone:
        tst.l   40(%sp)
        beq.s   .Ltoast
        | after the writes, the calls stock's lock writer makes after its own
        moveq   #1,%d0
        move.l  %d0,(EDITED).l
        movea.l (BANK_BASE).l,%a0
        adda.l  #BANK_EDIT,%a0
        move.l  %d0,(%a0)
        jsr     (UNDO_OFF).l
        move.l  %d7,-(%sp)
        jsr     (TRACK_REBUILD).l
        addq.l  #4,%sp
        moveq   #1,%d0
        tst.w   (HELD_TRIGS).l
        beq.s   1f
        move.l  %d0,(TRIG_USED).l       | only while a trig is held: its release clears it
1:      move.l  %d0,(LOCK_DRAW).l
        moveq   #-1,%d0
        move.l  %d0,-(%sp)              | REDRAW's argument; LEDS takes none
        jsr     (LEDS).l
        jsr     (REDRAW).l
        addq.l  #4,%sp
        jsr     (UNDO_CLEAR).l
.Ltoast:
        lea     as_text_la(%pc),%a0
        move.l  44(%sp),%d0
        subq.l  #1,%d0
        beq.s   1f
        lea     as_text_lb(%pc),%a0
        subq.l  #1,%d0
        beq.s   1f
        lea     as_text_lmix(%pc),%a0
1:      tst.l   40(%sp)
        bne.s   2f
        lea     as_text_lnone(%pc),%a0
2:      pea     (0x30).w
        move.l  %a0,-(%sp)
        jsr     (NOTIFY).l
        addq.l  #8,%sp
.Ll_out:
        movem.l (%sp),%d2-%d7/%a2-%a5
        lea     160(%sp),%sp
        rts

| a0 = W + 0x662 + (d0*8 + d7)*32: scene d0's lock row for track d7
as_row:
        lsl.l   #3,%d0
        add.l   %d7,%d0
        lsl.l   #5,%d0
        movea.l %a5,%a0
        adda.l  %d0,%a0
        adda.l  #0x662,%a0
        rts

as_text_a:
        .asciz  "SCENE A APPLIED"
as_text_b:
        .asciz  "SCENE B APPLIED"
as_text_mix:
        .asciz  "SCENE BLEND APPLIED"
as_text_none:
        .asciz  "NOTHING TO APPLY"
as_text_la:
        .asciz  "SCENE A TO TRIGS"
as_text_lb:
        .asciz  "SCENE B TO TRIGS"
as_text_lmix:
        .asciz  "SCENE BLEND TO TRIGS"
as_text_lnone:
        .asciz  "NOTHING TO LOCK"
| The chord: +0 running, +1 the scene keys down (A 1, B 2), +2 every scene
| key pressed in it, +3 track, +4 pattern, +5 Part, +6 the held trigs
| (u16), +8 their page's first step, +12 the snapshot (86 bytes).
        .balign 4
as_chord:
        .space  100
| In .text: a DRAM unit's text is RAM, and .data would cost an 8 KB boundary.
as_taken:
        .byte   0
        .align  2
