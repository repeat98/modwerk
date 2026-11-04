| TEMP SAVE -- [FUNC] + [YES] keeps a copy of the active pattern and its
| whole Part (scenes included); [FUNC] + [NO] puts both back.
|
| Two detours, at the entries of stock's FUNCTION-layer YES and NO
| handlers (YES 0x4005e3d8, NO 0x4005e1fc; handler(key, edge), press and
| release; the same two on both models: the FUNCTION key's sub-map is
| 0x400bfa32 -> keys 0x400bf628 on the MKII, 0x400bfa1e -> 0x400bf2b4 on
| the MKI).
| With no list open stock's FUNC + YES runs the plain-YES routine
| 0x4005e294 (ARM ALL) and FUNC + NO, outside its one special mode
| (0x460d172a), the plain-NO routine 0x4005e0e8 (DISARM ALL), so on those
| screens both gestures repeat what YES and NO alone do. The FUNCTION
| layer sits over every window, and in every window that reaches these
| handlers stock's FUNC + YES / FUNC + NO are ARM ALL / DISARM ALL too, or a
| list's own action (measured under the port). So the module takes them on
| the pattern screen and in every page and menu window, and leaves them to
| stock in lists, dialogs, editors, browsers, SRC SETUP and AED (ts_screen),
| in YES's divert mode (0x460d1aec) and NO's special mode. A taken press swallows its own release; everything else
| replays the two displaced instructions and rejoins stock.
|
| The save: memcpy 0x40020898 of the current pattern (bank RAM
| [0x46c82456] + pattern * 0x8ed8, 0x8ed8 bytes) and of the working Part
| (bank + 0x8ed80 + part * 0x18b2, 0x18b2 bytes) into the unit's buffers,
| with the bank (0x80000002), the pattern (0x100b14d0), the Part
| (0x80000003) and a hash of the project's name (0x100f8378) and set
| (0x100f8480). One slot; the flag starts clear at every boot.
|
| The reload, on the same bank, pattern and project only (otherwise the
| toast says NO TEMP SAVE and nothing changes):
|  1. the pattern goes back through stock's pattern writer 0x4002b9b0(src,
|     pattern), the one pattern paste and its undo use: bank RAM and the
|     battery copy, the edited flags, the pattern's Part made current and
|     applied (0x4004a8a4), the sequencer told (0x4009c550);
|  2. the Part goes back through stock's Part Reload 0x4004aab4(part),
|     which reads only the saved Part in RAM (bank + 0x9504a + part *
|     0x18b2) and its has-saved byte (bank + 0x9b312 + part). The copy is
|     swapped into that slot word by word, has-saved set, the reload run
|     (working Part and its CS1 copy, the machine transitions per track),
|     then the copy swapped back out and has-saved restored: the saved
|     Part and the clipboard are never changed. The scene selection
|     (Part + 0x10, + 0x11) is the one live before the reload. Stock
|     clears the unsaved bit; it is set again (RAM and CS1), since the
|     working Part now differs from the saved one, as after a paste;
|  3. the screen refresh stock's FUNC + CUE runs after its Part Reload
|     (0x4005e0a8 .. 0x4005e0d8), then the toast: drawn before the refresh,
|     the toast would be painted over in an open window.
| Crossfader, scene mutes and track mutes are not in the pattern or the
| Part and are never touched.
        .text
        .global ts_yes_hook
        .global ts_no_hook

        .set    BANK_PTR,   0x46c82456  | the current bank's RAM
        .set    CUR_BANK,   0x80000002
        .set    CUR_PART,   0x80000003
        .set    CUR_PAT,    0x100b14d0
        .set    PAT_LEN,    0x8ed8
        .set    PART_LEN,   0x18b2
        .set    PARTS,      0x8ed80     | bank + this + part * PART_LEN: the working Parts
        .set    SAVED,      0x9504a     | the saved Parts
        .set    UNSAVED,    0x95048     | bit p: Part p unsaved
        .set    HAS_SAVED,  0x9b312     | + p: Part p has a saved copy
        .set    CS1_UNSAVED, 0x100b145e
        .set    PROJ_NAME,  0x100f8378
        .set    PROJ_SET,   0x100f8480
        .set    LIST_A,     0x460e5e4c  | a sample list is open (FUNC + YES previews)
        .set    LIST_B,     0x460e70e0
        .set    POPUP,      0x460d175c  | the open popup's record, 0 with none
        .set    POPUP_FLAGS, 0x20       | its flags: 0x21 open, 0x01 closed
        .set    POPUP_OPEN, 0x20
        .set    TOAST,      0x460d1e70  | the message's window (0x4005a2b8), 0 with none; the same record
        .set    DIALOG,     0x460e5cd0  | the yes/no dialog's window (0x4006d57c), 0 with none
        .set    WIN_CLOSE,  0x460d1188  | stock's window table, entry 0: the open window's close routine
        .set    WIN_KIND,   0x460d119c  | and its kind
        .set    KIND_PAGE,  1
        .set    KIND_MENU,  3
        .set    SRC_SETUP_CLOSE, 0x40055e18 | SRC SETUP of an audio track
        .set    AED_CLOSE,  0x4006dd18
        .set    YES_DIVERT, 0x460d1aec  | stock sends YES elsewhere while set
        .set    NO_SPECIAL, 0x460d172a  | stock's FUNC + NO has its own job while set
        .set    KEY_MODE,   0x800000b8  | while set, YES and NO alone do nothing
        .set    MEMCPY,     0x40020898  | (dst, src, n)
        .set    PAT_WRITE,  0x4002b9b0  | (src, pattern)
        .set    PART_RELOAD, 0x4004aab4 | (part): 0 without a saved copy
        .set    NOTIFY,     0x4005a2b8  | (text, ticks): the stock toast
        .set    REFRESH_ON, 0x46c7c72c
        .set    YES_REJOIN, 0x4005e3e0  | after the two displaced instructions
        .set    NO_REJOIN,  0x4005e204

| -------- FUNC + YES: replaces `lea -12(%sp),%sp; movem.l %d2-%d4,(%sp)` --
| Each key keeps its own taken flag. A press sets it when the module takes
| the press and clears it when stock gets it, so a release the dispatcher
| sent elsewhere (FUNC let go first: the release then reaches the plain
| layer) can never leave it set for a later stock press.
ts_yes_hook:
        lea     ts_taken_yes(%pc),%a0
        tst.l   8(%sp)                  | edge: 0 = release
        beq.s   .Lyrel
        clr.b   (%a0)
        bsr.w   ts_screen               | d0 = 0: the pattern screen
        bne.s   .Lystock
        tst.l   (YES_DIVERT).l
        bne.s   .Lystock
        lea     ts_taken_yes(%pc),%a0
        move.b  #1,(%a0)
        bra.w   ts_save                 | its rts returns to the key dispatcher
.Lyrel:
        tst.b   (%a0)                   | swallow only the release of a press we took
        beq.s   .Lystock
        clr.b   (%a0)
        rts
.Lystock:
        lea     -12(%sp),%sp
        movem.l %d2-%d4,(%sp)
        jmp     (YES_REJOIN).l

| -------- FUNC + NO: replaces `move.l 4(%sp),%d1; move.l 8(%sp),%d0` -----
ts_no_hook:
        lea     ts_taken_no(%pc),%a0
        tst.l   8(%sp)
        beq.s   .Lnrel
        clr.b   (%a0)
        bsr.w   ts_screen
        bne.s   .Lnstock
        tst.l   (NO_SPECIAL).l
        bne.s   .Lnstock
        lea     ts_taken_no(%pc),%a0
        move.b  #1,(%a0)
        bra.w   ts_reload
.Lnrel:
        tst.b   (%a0)
        beq.s   .Lnstock
        clr.b   (%a0)
        rts
.Lnstock:
        move.l  4(%sp),%d1
        move.l  8(%sp),%d0
        jmp     (NO_REJOIN).l

| d0 = nonzero, flags set from it, where FUNC + YES / FUNC + NO stay stock's;
| d0 = 0 everywhere else: the pattern screen, any page or menu window, and
| the message box. Stock's: an open list (0x460e5e4c, 0x460e70e0: the
| sample and slot lists, where FUNC + YES previews; AED); the mode in which
| YES and NO alone do nothing (0x800000b8: there FUNC + YES / FUNC + NO are
| stock's only way to ARM ALL and DISARM ALL); a yes/no dialog (0x460e5cd0,
| the dialog's window, set by 0x4006d57c and cleared when it closes); and
| an open window that is not a page or a menu. Every window the panel opens
| is the popup record (slot 0x460d175c, flags 0x21 while open); which one
| it is, stock's window table says (0x460d1188 + 4i the close routine,
| 0x460d119c + 4i the kind; entry 0 is the open page or menu, entries are
| not cleared on close, so they are read only while the popup is open).
| Kind 1 is a page (the SETUP pages, MIXER, PROJECT and its pages, PART,
| ARRANGER, PATTERN SETTINGS, SCALE, TRACK TRIG EDIT, RECORDING SETUP),
| kind 3 a menu list (FUNC + PART); the others stay stock: the RENAME
| editor, TEMPO and card progress screens (5), CHOOSE PROJECT (2). Two pages
| stay stock by name: SRC SETUP of an audio track, where FUNC + YES
| previews the slot's sample, and AED. Measured under the port.
ts_screen:
        move.l  (LIST_A).l,%d0
        or.l    (LIST_B).l,%d0
        or.l    (KEY_MODE).l,%d0
        or.l    (DIALOG).l,%d0
        bne.s   9f
        move.l  (POPUP).l,%d1
        beq.s   8f                      | no window: the pattern screen
        cmp.l   (TOAST).l,%d1           | only a message (TEMP SAVED, ARM ALL): a quick second
        beq.s   8f                      | press saves or reloads again
        move.l  %d1,%a0
        move.l  POPUP_FLAGS(%a0),%d0
        andi.l  #POPUP_OPEN,%d0
        beq.s   8f                      | its record closed
        move.l  (WIN_KIND).l,%d0
        moveq   #KIND_PAGE,%d1
        cmp.l   %d1,%d0
        beq.s   1f
        moveq   #KIND_MENU,%d1
        cmp.l   %d1,%d0
        bne.s   9f                      | a dialog, editor, browser or progress screen
1:      move.l  (WIN_CLOSE).l,%d0
        cmpi.l  #SRC_SETUP_CLOSE,%d0
        beq.s   7f
        cmpi.l  #AED_CLOSE,%d0
        bne.s   8f
7:      moveq   #1,%d0
        rts
8:      moveq   #0,%d0
9:      rts

| -------- the save ---------------------------------------------------------
ts_save:
        lea     -12(%sp),%sp
        movem.l %d2-%d3/%a2,(%sp)
        lea     (MEMCPY).l,%a2
        move.l  (BANK_PTR).l,%d2
        moveq   #0,%d0
        move.b  (CUR_PAT).l,%d0
        move.l  #PAT_LEN,%d1
        mulu.l  %d1,%d0
        add.l   %d2,%d0
        pea     (PAT_LEN).l
        move.l  %d0,-(%sp)
        pea     (ts_pat).l
        jsr     (%a2)
        lea     12(%sp),%sp
        moveq   #0,%d0
        move.b  (CUR_PART).l,%d0
        move.l  #PART_LEN,%d1
        mulu.l  %d1,%d0
        add.l   %d2,%d0
        add.l   #PARTS,%d0
        pea     (PART_LEN).l
        move.l  %d0,-(%sp)
        pea     (ts_part).l
        jsr     (%a2)
        lea     12(%sp),%sp
        lea     ts_state(%pc),%a0
        move.b  (CUR_BANK).l,%d0
        move.b  %d0,1(%a0)
        move.b  (CUR_PAT).l,%d0
        move.b  %d0,2(%a0)
        move.b  (CUR_PART).l,%d0
        move.b  %d0,3(%a0)
        bsr.w   ts_project
        lea     ts_state(%pc),%a0
        move.l  %d0,4(%a0)
        move.b  #1,(%a0)                | valid
        lea     ts_text_saved(%pc),%a0
        bra.w   ts_toast_out

| -------- the reload -------------------------------------------------------
ts_reload:
        lea     -12(%sp),%sp
        movem.l %d2-%d3/%a2,(%sp)
        lea     ts_state(%pc),%a2
        tst.b   (%a2)
        beq.w   .Lnone
        moveq   #0,%d0
        move.b  (CUR_BANK).l,%d0
        moveq   #0,%d1
        move.b  1(%a2),%d1
        cmp.l   %d1,%d0
        bne.w   .Lnone
        moveq   #0,%d0
        move.b  (CUR_PAT).l,%d0
        move.b  2(%a2),%d1
        cmp.l   %d1,%d0
        bne.w   .Lnone
        bsr.w   ts_project
        cmp.l   4(%a2),%d0
        bne.w   .Lnone

        | the scene selection live now in the copy's own Part (the pattern
        | may have been moved to another Part since)
        move.l  (BANK_PTR).l,%a0
        moveq   #0,%d0
        move.b  3(%a2),%d0
        move.l  #PART_LEN,%d1
        mulu.l  %d1,%d0
        add.l   #PARTS,%d0
        move.w  0x10(%a0,%d0.l),%d3     | scene A, scene B

        | 1. the pattern
        moveq   #0,%d0
        move.b  2(%a2),%d0
        move.l  %d0,-(%sp)
        pea     (ts_pat).l
        jsr     (PAT_WRITE).l
        addq.l  #8,%sp

        | 2. the Part, through the saved slot
        lea     (ts_part).l,%a1
        move.w  0x10(%a1),%d2           | the copy's own selection, kept for the next reload
        move.w  %d3,0x10(%a1)
        bsr.w   ts_swap                 | the copy into the saved slot; a0 = has-saved byte
        move.b  (%a0),%d3               | (the selection is in the slot now)
        move.b  #1,(%a0)
        moveq   #0,%d0
        move.b  3(%a2),%d0
        move.l  %d0,-(%sp)
        jsr     (PART_RELOAD).l
        addq.l  #4,%sp
        bsr.w   ts_swap                 | the saved Part back, the copy back
        move.b  %d3,(%a0)
        lea     (ts_part).l,%a1
        move.w  %d2,0x10(%a1)
        | unsaved again, RAM and CS1, as after a paste
        moveq   #1,%d0
        moveq   #0,%d1
        move.b  3(%a2),%d1
        lsl.l   %d1,%d0
        move.l  (BANK_PTR).l,%a0
        add.l   #UNSAVED,%a0
        move.b  (%a0),%d1
        or.l    %d0,%d1
        move.b  %d1,(%a0)
        move.b  (CS1_UNSAVED).l,%d1
        or.l    %d0,%d1
        move.b  %d1,(CS1_UNSAVED).l

        | 3. FUNC + CUE's refresh, then the toast: the refresh repaints an open
        |    window, which would hide a toast drawn before it
        moveq   #1,%d0
        move.l  %d0,(REFRESH_ON).l
        pea     (-1).w
        jsr     (0x4004d948).l
        jsr     (0x40032208).l
        jsr     (0x4004d640).l
        jsr     (0x400486cc).l
        jsr     (0x4006dbe8).l
        jsr     (0x40077b00).l
        jsr     (0x4002f2f8).l
        addq.l  #4,%sp
        pea     (0x18).w
        pea     ts_text_reloaded(%pc)
        jsr     (NOTIFY).l
        addq.l  #8,%sp
        movem.l (%sp),%d2-%d3/%a2
        lea     12(%sp),%sp
        rts
.Lnone:
        lea     ts_text_none(%pc),%a0
ts_toast_out:
        pea     (0x18).w
        move.l  %a0,-(%sp)
        jsr     (NOTIFY).l
        addq.l  #8,%sp
        movem.l (%sp),%d2-%d3/%a2
        lea     12(%sp),%sp
        rts

| swap ts_part with the saved Part of the slot's Part, a word at a time.
| a2 = ts_state. Returns a0 = that Part's has-saved byte. Keeps d2-d3.
ts_swap:
        move.l  %d4,-(%sp)
        move.l  (BANK_PTR).l,%a0
        moveq   #0,%d0
        move.b  3(%a2),%d0
        move.l  %d0,%d4
        move.l  #PART_LEN,%d1
        mulu.l  %d1,%d0
        add.l   #SAVED,%d0
        lea     (ts_part).l,%a1
        add.l   %a0,%d0
        move.l  %d0,%a0
        move.l  #PART_LEN/2-1,%d1
1:      move.w  (%a0),%d0
        move.w  (%a1),(%a0)+
        move.w  %d0,(%a1)+
        subq.l  #1,%d1
        bpl.s   1b
        move.l  (BANK_PTR).l,%a0
        add.l   #HAS_SAVED,%a0
        add.l   %d4,%a0
        move.l  (%sp)+,%d4
        rts

| d0 = FNV-1a of the project's name and set, so another project's copy
| is never put back. Uses d1-d3, a0.
ts_project:
        move.l  #0x01000193,%d3
        move.l  #0x811c9dc5,%d0
        lea     (PROJ_NAME).l,%a0
        bsr.s   1f
        lea     (PROJ_SET).l,%a0
1:      move.l  #255,%d1
2:      moveq   #0,%d2
        move.b  (%a0)+,%d2
        beq.s   3f
        eor.l   %d2,%d0
        mulu.l  %d3,%d0
        subq.l  #1,%d1
        bne.s   2b
3:      rts

ts_text_saved:    .asciz "TEMP SAVED"
ts_text_reloaded: .asciz "RELOADED"
ts_text_none:     .asciz "NO TEMP SAVE"

| In .text, as Apply Scene's: a DRAM unit's text is RAM, and .data would
| cost an 8 KB boundary. +0 valid, +1 bank, +2 pattern, +3 Part, +4 the
| project's hash; zero at every boot (the image is unpacked again).
        .balign 4
ts_state:   .long 0, 0
ts_taken_yes: .byte 0
ts_taken_no:  .byte 0
        .balign 2

| The copy is reached by absolute address (relocated at load): in a large
| card build the shared DRAM link can put .bss beyond a 16-bit PC offset.
        .bss
        .balign 4
ts_part:    .space PART_LEN
        .balign 4
ts_pat:     .space PAT_LEN
