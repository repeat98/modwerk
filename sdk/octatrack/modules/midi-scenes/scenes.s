| MIDI SCENES -- scene locks for the eight MIDI tracks.
|
| Original author of the behaviour: bkkbrls-del (midisc, MIDISC2.1). Sam
| Banks wrote this file fresh in GNU as for octabam (modules/midi-scenes at
| f7d72906, MIT) from what his image does at the stock sites below, measured
| against it under the port; none of bkkbrls-del's code or data is copied or
| linked. Modwerk's port (16 November 2026) takes the project events from
| the base's hooks instead of octabam's STORE (the storage section at the end).
|
| Stock keeps scene locks for the audio tracks only (Part +0x662: 16 scenes x
| 8 tracks x 32 B). The tests of 0x80000012 (MIDI track mode) in the scene
| hold, the encoder press and the lock-offset paths send MIDI mode away from
| them. This unit adds a second table, MSC, with the same shape:
|
|     MSC[scene << 8 | track << 5 | flat],  0xff = no lock
|
| flat = MIDI page * 6 + knob (NOTE 0, LFO 1, ARP 2, CTRL1 3, CTRL2 4;
| flats 0..29). There is one table per Part with locks (scn_blk, in the storage
| section); every site reads the displayed Part's (0x100b14cf) in the
| current bank.
|
| Sites (all stock addresses; the manifest holds the bytes they replace):
|
|   B1  0x400534ce 0x40052ece  scene A / B held, encoder turned: the value
|                              goes to MSC, the mix runs at the current XF
|   B2  0x4004e348             knob readout: the held scene's lock
|   B3  0x40053a9e 0x40054392  scene held, encoder pressed: the lock cleared
|   B4  0x40034754 0x4003493e  lock LEDs scan MSC (the empty-scan branches
|       0x40034764 0x40034950  are removed, the scene-block base is MSC)
|   B5  0x40031f44             scene pad lit when MSC holds a lock for it
|   B6  0x400343bc 0x400343e8  per-track and per-page lock offsets
|       0x4003445e 0x4003448e
|   B7  0x4003f3a2 0x40061e78  XF: the locked parameters morph between the
|       0x40062c32             two scenes and go out as CCs
|   B8  0x40052a10 0x40052ae0  scene pad press / assign: mix at the XF
|   B11 (the mix)              track t reads and writes only track t's rows
|   B29 0x40062f24 0x40062fbe  CLEAR / COPY / PASTE SCENE rows
|       0x40062e3c
|   B30 0x400434ca             encoder press, MIDI mode: overlay refresh
|
| B9 (scene pad release) is stock's own sequence at 0x40054cb6..0x40054cd2
| and needs no site. Not here: B10, B12..B28, B31..B33.
|
| Registers at the sites follow what the stock functions leave free: the
| hold, press and pad functions save d2-d7/a2.. in their prologues, so the
| hooks may use d0-d7/a0-a1 once their own arguments are read.

        .set    PARTSZ,         0x18b2          | one Part in the bank window
        .set    BANK0,          0x400e21e0      | bank 0's RAM base
        .set    BANKSZ,         0x9b340         | one bank
        .set    SCHED,          0x800065b8      | long: 1 while the sequencer schedules
        .set    PLAY_BANK,      0x800065bd      | byte: the playing pattern's bank
        .set    PLAY_PTN,       0x800065be      | byte: the playing pattern
        .set    ENG_BANK,       0x80001828      | byte: the engine's playing bank
        .set    ENG_PART,       0x80001829      | byte: the engine's playing Part
        .set    PTN_STRIDE,     0x8ed8          | one pattern in a bank
        .set    PTN_PART,       0x8e57          | pattern: its Part byte
        .set    Q_BANK,         0x46c7a9c6      | bytes: bank of each queued pattern
        .set    Q_PART,         0x46c77c1a      | bytes: Part of each queued pattern
        .set    SCENE_ASSIGN,   0x8ed90         | bank: scene A id, scene B id (0xff = none)
        .set    PART_LIVE,      0x8f162         | bank: MIDI track params, 32 B per track
        .set    MIDI_MODE,      0x80000012      | long: nonzero in MIDI track mode
        .set    SCENE_HELD,     0x460d169c      | long: 1 scene A held, 2 scene B held
        .set    PAGE_MODE,      0x460d1684      | long: 0 NOTE .. 4 CTRL2
        .set    XF_RAM,         0x460d16c8      | long: crossfader position
        .set    PART_DISP,      0x100b14cf      | byte: displayed Part
        .set    TRACK_DISP,     0x100b14cc      | byte: displayed track
        .set    BANK_PTR,       0x46c82456      | long: current bank's RAM base
        .set    REC,            0x46c76dc0      | MIDI track records, 0x44 B each
        .set    REC_STRIDE,     0x44
        .set    LOCK_MASK,      0x8000664e      | u32 per track: bit = param locked by the playing step
        .set    LANE,           0x46c76fe0      | per track, 32 B: the values the sequencer's CC loop sends
        .set    CCSENT,         0x46c76000      | per channel, 4 longs: bit = CC number already handled this tick
        .set    CCCACHE,        0x46c76100      | per channel, 128 B: the last CC value sent
        .set    MSGBUF,         0x400d8082      | the three-byte CC message the MIDI routine builds
        .set    MIDI_TX,        0x40010bc8      | (3, buffer): queue a MIDI message
        .set    CC_TX,          0x4009eec8      | (track, flat, value, quiet): MIDI-track emitter
        .set    UI_OVERLAY,     0x4004d948      | (-1): redraws the knob overlay
        .set    PRESS_UI,       0x400418e0      | the stock encoder-press refresh
        .set    CLIPBOARD_TYPE, 0x460d0ffa      | long: 0x10 = a scene is on the clipboard
        .set    NOLOCK,         0xff
        .set    ST_VALID,       0               | scn_state long: a mix has run
        .set    ST_XF,          4               | scn_state long: the XF position it mixed
        .set    ST_DUE,         8               | scn_state long: a mix is due (the target or the tables changed)

        .text
        .globl  scn_hold_a, scn_hold_b, scn_dial, scn_enc_a, scn_enc_b
        .globl  scn_taddi, scn_paddi, scn_pad, scn_press, scn_done
        .globl  scn_morph, scn_xf1, scn_xf2, scn_clear, scn_copy, scn_paste
        .globl  scn_qrec, scn_qcommit, scn_switch, scn_step, scn_evt, scn_pwrite, scn_invalidate
        .globl  scn_snap1, scn_snap2, scn_ccnote
        .globl  scn_blk, scn_map, scn_used, scn_clip, scn_state
        .globl  scn_ev_banks_load, scn_ev_banks_loaded, scn_ev_bank_load, scn_ev_bank_loaded
        .globl  scn_ev_project_new, scn_ev_bank_written, scn_ev_project_store, scn_ev_project_stored
        .globl  scn_ev_project_reloaded, scn_ev_part_clear, scn_ev_modules_ready

| ===================================================== B1: hold + turn ====

| 0x400534ce, 0x40052ece: `tstl 0x80000012 / bne bail` in the scene-hold
| function (d3 = knob 0..5, d6 = signed delta). Audio mode continues at
| the stock instruction after the test.
scn_hold_a:
        tstl    MIDI_MODE
        beq.s   1f
        moveq   #0,%d0                  | scene A
        bsr.w   hold_store
        tstl    %d0
        beq.s   2f
        jmp     0x40053a36              | stock epilogue: redraw, return
2:      jmp     0x40053a5c              | no scene assigned: return
1:      jmp     0x400534d8

scn_hold_b:
        tstl    MIDI_MODE
        beq.s   1f
        moveq   #1,%d0                  | scene B
        bsr.w   hold_store
        tstl    %d0
        beq.s   2f
        jmp     0x40053464
2:      jmp     0x4005348c
1:      jmp     0x40052ed8

| hold_store: d0 = 0 / 1 (scene A / B), d3 = knob, d6 = delta. The held
| scene's lock for the displayed track and the knob becomes (its value, or
| the Part's unlocked value when it had none) + delta, clamped; the mix runs.
| Returns d0 = 1, or 0 when the Part has no scene assigned to that key.
| Clobbers d1-d2, d4-d5, a0-a1.
hold_store:
        bsr.w   toast_due
        bsr.w   row_offset              | d1 = MSC offset of the row, -1 = none
        tstl    %d1
        bmi.s   8f
        bsr.w   flat_of_knob            | d5 = flat; keeps d1
        addl    %d5,%d1
        bsr.w   msc_a0
        lea     scn_sink,%a1
        cmpal   %a1,%a0
        bne.s   1f
        lea     TXT_FULL,%a0            | NBLK Parts hold locks: refused
        bsr.w   scn_notify
        moveq   #1,%d0
        rts
1:      lea     %a0@(0,%d1:l),%a1       | a1 -> the lock
        mvzb    %a1@,%d1
        cmpil   #NOLOCK,%d1
        bne.s   2f
        bsr.w   part_value              | d1 = the Part's unlocked value
2:      addl    %d6,%d1
        bsr.w   clamp                   | d1 = 0..127, the ARP limits
        moveb   %d1,%a1@
        bsr.w   msc_edited
        bsr.w   mix
        moveq   #1,%d0
        rts
8:      moveq   #0,%d0
        rts

| flat_of_knob: d5 = (PAGE_MODE * 6 + d3) & 31. Clobbers d0.
flat_of_knob:
        movel   PAGE_MODE,%d0
        movel   %d0,%d5
        lsll    #3,%d5
        addl    %d0,%d0
        subl    %d0,%d5
        addl    %d3,%d5
        andil   #31,%d5
        rts

| part_window: a0 = the displayed Part's window in the current bank.
| Clobbers d0-d1.
part_window:
        mvzb    PART_DISP,%d0
        movel   #PARTSZ,%d1
        mulsl   %d1,%d0
        moveal  BANK_PTR,%a0
        addal   %d0,%a0
        rts

| row_offset: d0 = 0 / 1 (scene A / B) -> d1 = (scene << 8) + (displayed
| track << 5), the offset of that scene's row for the displayed track in
| MSC; d1 = -1 when the Part has no scene assigned to that key.
| Clobbers d0, a0.
row_offset:
        movel   %d0,%sp@-
        bsr.w   part_window             | clobbers d0-d1
        movel   %sp@+,%d1
        addal   #SCENE_ASSIGN,%a0
        mvzb    %a0@(0,%d1:l),%d0
        cmpil   #NOLOCK,%d0
        bne.s   1f
        moveq   #-1,%d1
        rts
1:      andil   #15,%d0
        lsll    #8,%d0
        mvzb    TRACK_DISP,%d1
        andil   #7,%d1
        lsll    #5,%d1
        addl    %d0,%d1
        rts

| part_value: d1 = the displayed Part's unlocked value for the displayed
| track and flat d5 (Part +0x3e2, 32 B per MIDI track). Clobbers d0, a0.
part_value:
        bsr.w   part_window
        addal   #PART_LIVE,%a0
        mvzb    TRACK_DISP,%d0
        andil   #7,%d0
        lsll    #5,%d0
        addl    %d5,%d0
        mvzb    %a0@(0,%d0:l),%d1
        rts

| clamp: d1 (signed) -> 0..127; on the ARP page (2) the knobs LEG, MODE, SPD,
| RNGE (flats 13..16) stop at 1, 6, 95, 7. d5 = flat. Clobbers d0, d2.
clamp:
        tstl    %d1
        bpl.s   1f
        moveq   #0,%d1
        rts
1:      movel   PAGE_MODE,%d0
        cmpil   #2,%d0
        bne.s   5f
        movel   %d5,%d0
        subil   #12,%d0                 | knob on the ARP page
        moveq   #1,%d2
        cmpil   #1,%d0
        beq.s   4f
        moveq   #6,%d2
        cmpil   #2,%d0
        beq.s   4f
        moveq   #95,%d2
        cmpil   #3,%d0
        beq.s   4f
        moveq   #7,%d2
        cmpil   #4,%d0
        bne.s   5f
4:      cmpl    %d2,%d1
        bls.s   9f
        movel   %d2,%d1
9:      rts
5:      cmpil   #128,%d1
        bcs.s   9b
        moveq   #127,%d1
        rts

| ======================================================= B2: the readout ====

| 0x4004e348, in the knob readout (d5 = flags, a4 = knob 0..5): with a scene
| held and a lock stored for the knob, the readout shows that lock (d5 bit 0
| set, d0 = value); otherwise stock's own value computation.
scn_dial:
        movel   SCENE_HELD,%d0
        beq.s   live
        cmpil   #2,%d0
        bhi.s   live
        movel   %d1,%sp@-
        movel   %d2,%sp@-
        movel   %d3,%sp@-
        movel   %a0,%sp@-
        movel   %a1,%sp@-
        subql   #1,%d0                  | 0 = A, 1 = B
        bsr.w   row_offset
        tstl    %d1
        bmi.s   miss
        movel   PAGE_MODE,%d2
        movel   %d2,%d0
        lsll    #3,%d0
        addl    %d2,%d2
        subl    %d2,%d0                 | page * 6
        addl    %a4,%d0                 | + knob
        addl    %d0,%d1
        bsr.w   msc_a0
        mvzb    %a0@(0,%d1:l),%d0
        cmpil   #NOLOCK,%d0
        beq.s   miss
        cmpil   #128,%d0
        bcc.s   miss
        moveq   #1,%d1
        orl     %d1,%d5
        moveal  %sp@+,%a1
        moveal  %sp@+,%a0
        movel   %sp@+,%d3
        movel   %sp@+,%d2
        movel   %sp@+,%d1
        jmp     0x4004e382
miss:   moveal  %sp@+,%a1
        moveal  %sp@+,%a0
        movel   %sp@+,%d3
        movel   %sp@+,%d2
        movel   %sp@+,%d1
live:   mvzb    TRACK_DISP,%d0          | the displaced stock sequence
        movel   PAGE_MODE,%d2
        mvzb    PART_DISP,%d1
        lsll    #5,%d0
        movel   #PARTSZ,%d3
        mulsl   %d3,%d1
        addl    %d1,%d0
        movel   %d2,%d1
        lsll    #3,%d1
        addl    %d2,%d2
        subl    %d2,%d1
        addl    %d1,%d0
        addl    BANK_PTR,%d0
        addl    %a4,%d0
        moveal  %d0,%a0
        addal   #PART_LIVE,%a0
        mvzb    %a0@,%d0
        jmp     0x4004e382

| ===================================================== B3: encoder press ====

| 0x40053a9e, 0x40054392: `tstl 0x80000012 / bne bail` in the encoder-press
| functions (d4 = event code, 56..61 = encoder 1..6). In MIDI mode they
| return to the stock bail address; with a scene held the press first
| clears that knob's lock.
scn_enc_a:
        tstl    MIDI_MODE
        beq.s   1f
        movel   SCENE_HELD,%d0
        beq.s   2f
        bsr.w   unlock
2:      jmp     0x40054350
1:      jmp     0x40053aa8

scn_enc_b:
        tstl    MIDI_MODE
        beq.s   1f
        movel   SCENE_HELD,%d0
        beq.s   2f
        bsr.w   unlock
2:      jmp     0x40054c52
1:      jmp     0x4005439c

| unlock: d4 = event code. The held scene's lock for the displayed track
| and encoder d4 - 56 becomes "none", the mix runs, the overlay redraws.
| Preserves every register.
unlock:
        lea     %sp@(-28),%sp
        movem.l %d0-%d3/%d5/%a0-%a1,%sp@
        movel   %d4,%d3
        subil   #56,%d3
        cmpil   #5,%d3
        bhi.s   9f
        bsr.w   flat_of_knob            | d5
        movel   SCENE_HELD,%d0
        subql   #1,%d0                  | 0 = A, 1 = B
        bsr.w   row_offset
        tstl    %d1
        bmi.s   9f
        addl    %d5,%d1
        bsr.w   msc_a0
        moveq   #-1,%d0                  | 0xff in the byte
        moveb   %d0,%a0@(0,%d1:l)
        bsr.w   msc_edited
        bsr.w   mix
        pea     0xffffffff
        jsr     UI_OVERLAY
        addql   #4,%sp
9:      movem.l %sp@,%d0-%d3/%d5/%a0-%a1
        lea     %sp@(28),%sp
        rts

| ============================================== B4, B6: lock LEDs, offsets ====

| 0x400343e8, 0x40034764, 0x40034950 (d0) and 0x4003448e (d1): `addil
| #0x8f3e2,Dn` turns a window-relative scene-block offset into an address.
| In MIDI mode the base becomes MSC. d0 / d1 are the address the stock
| code built from the bank, the displayed Part and the scene / track
| offset; those two terms come off and MSC goes on.
scn_taddi:
        tstl    MIDI_MODE
        beq.s   1f
        movel   %d1,%sp@-
        movel   %d2,%sp@-
        mvzb    PART_DISP,%d1
        movel   #PARTSZ,%d2
        mulsl   %d1,%d2
        subl    %d2,%d0
        movel   BANK_PTR,%d1
        subl    %d1,%d0
        movel   %a0,%sp@-
        bsr.w   msc_a0
        addl    %a0,%d0
        moveal  %sp@+,%a0
        movel   %sp@+,%d2
        movel   %sp@+,%d1
        rts
1:      addil   #0x8f3e2,%d0
        rts

scn_paddi:
        tstl    MIDI_MODE
        beq.s   1f
        movel   %d0,%sp@-
        movel   %d2,%sp@-
        mvzb    PART_DISP,%d0
        movel   #PARTSZ,%d2
        mulsl   %d0,%d2
        subl    %d2,%d1
        movel   BANK_PTR,%d0
        subl    %d0,%d1
        movel   %a0,%sp@-
        bsr.w   msc_a0
        addl    %a0,%d1
        moveal  %sp@+,%a0
        movel   %sp@+,%d2
        movel   %sp@+,%d0
        rts
1:      addil   #0x8f3e2,%d1
        rts

| ============================================================ B5: pad ====

| 0x40031f44: the pad-has-locks function's prologue (`lea sp@(-28),sp /
| moveml d2-d7/a2,sp@`), argument = scene. Any lock in MSC[scene] lights the
| pad in every mode; none continues with stock's audio check.
scn_pad:
        lea     %sp@(-28),%sp
        movem.l %d2-%d7/%a2,%sp@
        movel   %sp@(32),%d0
        andil   #15,%d0
        lsll    #8,%d0
        bsr.w   msc_a0
        addal   %d0,%a0
        movel   #256,%d1
1:      mvzb    %a0@,%d0
        cmpil   #NOLOCK,%d0
        bne.s   2f
        addql   #1,%a0
        subql   #1,%d1
        bne.s   1b
        movel   %sp@(32),%d0
        jmp     0x40031f4c
2:      moveq   #1,%d0
        movem.l %sp@,%d2-%d7/%a2
        lea     %sp@(28),%sp
        rts

| ================================================ B8, B30: scene keys ====

| 0x400434ca: `jsr 0x400418e0 / movel sp@+,d2` after a scene key sets
| SCENE_HELD. In MIDI mode the knob overlay is redrawn.
scn_press:
        jsr     PRESS_UI
        tstl    MIDI_MODE
        beq.s   1f
        pea     0xffffffff
        jsr     UI_OVERLAY
        addql   #4,%sp
1:      movel   %sp@+,%d2
        jmp     0x4007e8d8

| 0x40052a10, 0x40052ae0: `jmp 0x4007e8d8` at the end of the scene recall
| paths: the mix at the current XF, in any mode.
scn_done:
        bsr.w   mix
        jmp     0x4007e8d8

| ================================================================ B7: XF ====

| 0x40061e78: after the panel handler's CC 48 out (`jsr 0x40033e3c`).
scn_xf1:
        bsr.w   mix
        mvs.b   0x8000004a,%d0
        jmp     0x40061e7e

| 0x40062c32: after the second XF publish.
scn_xf2:
        bsr.w   mix
        mvz.b   0x80000003,%d0
        jmp     0x40062c38

| 0x4003f3a2: `jmp 0x4003577c`, the tail of the audio morph. Once a mix has
| run, an XF position it has not mixed yet is mixed. d0 is live here.
scn_morph:
        movel   %d0,%sp@-
        tstl    scn_state+ST_VALID
        beq.s   1f
        movel   XF_RAM,%d0
        cmpl    scn_state+ST_XF,%d0
        beq.s   1f
        bsr.w   mix
1:      movel   %sp@+,%d0
        jmp     0x4003577c

| mix: for each MIDI track t and flat f the value at the XF position x is
|
|     lock A, lock B   -> (A, B), the unlocked side (no lock) reading the
|                         Part's value
|     one lock         -> that lock on its end; the Part's value on the other
|     none             -> the Part's value (record written, nothing sent)
|
| v = A at weight 0, B at weight 127, A + ((B - A) * w >> 7) between, with
| w = 127 - (x & 127). Scenes A and B are the displayed Part's assignments.
| v & 127 goes to the track record REC + 0x44 t + f; when it changed, the
| stock emitter sends it (CC_TX caches per CC number). Flats 18..29 also
| lose bit f of the track's lock-mask long. Preserves every register.
mix:
        lea     %sp@(-52),%sp
        movem.l %d0-%d7/%a0-%a4,%sp@
        bsr.w   follow
        movel   scn_pbi,%d0
        cmpil   #15,%d0
        bhi.w   mix_out
        tstl    scn_state+ST_DUE
        beq.s   1f
        bsr.w   ctx_reset
1:      movel   #BANKSZ,%d1
        mulsl   %d1,%d0
        addil   #BANK0,%d0
        moveal  %d0,%a0
        movel   scn_pp,%d0
        movel   #PARTSZ,%d1
        mulsl   %d1,%d0
        addal   %d0,%a0                 | a0 = the mix Part's window
        moveal  %a0,%a4
        addal   #PART_LIVE,%a4          | a4 -> its unlocked values, 32 B per track
        addal   #SCENE_ASSIGN,%a0
        subal   %a2,%a2                 | a2 = scene A's rows, 0 = no scene
        mvzb    %a0@,%d0
        cmpil   #NOLOCK,%d0
        beq.s   1f
        andil   #15,%d0
        lsll    #8,%d0
        movel   %a0,%sp@-
        bsr.w   msc_mix
        moveal  %a0,%a2
        moveal  %sp@+,%a0
        addal   %d0,%a2
1:      subal   %a3,%a3                 | a3 = scene B's rows
        mvzb    %a0@(1),%d0
        cmpil   #NOLOCK,%d0
        beq.s   2f
        andil   #15,%d0
        lsll    #8,%d0
        movel   %a0,%sp@-
        bsr.w   msc_mix
        moveal  %a0,%a3
        moveal  %sp@+,%a0
        addal   %d0,%a3
2:      movel   XF_RAM,%d5
        andil   #127,%d5
        moveq   #127,%d0
        subl    %d5,%d0
        movel   %d0,%d5                 | d5 = w
        lea     scn_snap:l,%a1
        movel   scn_only,%d6            | d6 = track: all of them, or only the one a trig played on
        beq.s   1f
        subql   #1,%d6
1:
mix_track:
        moveq   #0,%d7                  | d7 = flat
mix_flat:
        movel   %d6,%d0
        lsll    #5,%d0
        addl    %d7,%d0                 | d0 = t * 32 + f
        movel   #NOLOCK,%d3             | d3 = lock A
        movel   %a2,%d1
        beq.s   3f
        mvzb    %a2@(0,%d0:l),%d3
3:      movel   #NOLOCK,%d4             | d4 = lock B
        movel   %a3,%d1
        beq.s   4f
        mvzb    %a3@(0,%d0:l),%d4
4:      cmpil   #NOLOCK,%d3
        bne.s   5f
        cmpil   #NOLOCK,%d4
        beq.w   mix_free
5:      cmpil   #NOLOCK,%d3
        bne.s   6f
        mvzb    %a1@(0,%d0:l),%d3       | A unlocked: the trig snapshot, else the Part's value
        cmpil   #NOLOCK,%d3
        bne.s   6f
        mvzb    %a4@(0,%d0:l),%d3
6:      cmpil   #NOLOCK,%d4
        bne.s   7f
        mvzb    %a1@(0,%d0:l),%d4
        cmpil   #NOLOCK,%d4
        bne.s   7f
        mvzb    %a4@(0,%d0:l),%d4
7:      movel   %d3,%d2
        tstl    %d5
        beq.s   8f                      | the A end
        movel   %d4,%d2
        cmpil   #127,%d5
        beq.s   8f                      | the B end
        subl    %d3,%d2
        mulsl   %d5,%d2
        asrl    #7,%d2
        addl    %d3,%d2
        moveq   #1,%d3                  | between the ends
        bra.s   9f
8:      moveq   #0,%d3
9:      andil   #127,%d2
        movel   #REC_STRIDE,%d1
        mulsl   %d6,%d1
        addl    %d7,%d1
        lea     REC,%a0
        addal   %d1,%a0                 | a0 -> the record's byte
        mvzb    %a0@,%d1
        moveb   %d2,%a0@
        tstl    %d3
        beq.s   1f
        lea     scn_sdirty:l,%a0
        tstb    %a0@(0,%d6:l)
        bne.s   mix_ctl                 | between the ends, a trig playing: the CC loop sends it
1:      cmpl    %d2,%d1
        beq.s   mix_ctl
        clrl    %sp@-                   | CC_TX (track, flat, value, 0)
        movel   %d2,%sp@-
        movel   %d7,%sp@-
        movel   %d6,%sp@-
        jsr     CC_TX
        lea     %sp@(16),%sp
        lea     scn_snap:l,%a1          | CC_TX saves d2-d7/a2-a5 only: a1 comes back clobbered
        bra.s   mix_ctl
mix_free:                               | no lock on either side
        tstl    scn_only
        bne.w   mix_next                | the track a trig played on: its values stay
        lea     scn_sdirty:l,%a0
        tstb    %a0@(0,%d6:l)
        beq.s   1f
        movel   %d6,%d1                 | a trig plays: a flat its step locks is left alone
        lsll    #2,%d1
        moveal  %d1,%a0
        addal   #LOCK_MASK,%a0
        movel   %a0@,%d1
        btst    %d7,%d1
        bne.w   mix_next
1:      mvzb    %a4@(0,%d0:l),%d2
        andil   #127,%d2
        movel   #REC_STRIDE,%d1
        mulsl   %d6,%d1
        addl    %d7,%d1
        lea     REC,%a0
        addal   %d1,%a0
        moveb   %d2,%a0@
mix_ctl:
        cmpil   #18,%d7
        bcs.s   mix_next
        movel   %d6,%d0
        lsll    #2,%d0
        moveal  %d0,%a0
        addal   #LOCK_MASK,%a0
        moveq   #1,%d0
        lsll    %d7,%d0
        notl    %d0
        andl    %d0,%a0@
mix_next:
        addql   #1,%d7
        cmpil   #30,%d7
        bcs.w   mix_flat
        tstl    scn_only
        bne.s   mix_out
        addql   #1,%d6
        cmpil   #8,%d6
        bcs.w   mix_track
        lea     scn_state:l,%a0
        moveq   #1,%d0
        movel   %d0,%a0@(ST_VALID)
        clrl    %a0@(ST_DUE)
        movel   XF_RAM,%d0
        movel   %d0,%a0@(ST_XF)
mix_out:
        movem.l %sp@,%d0-%d7/%a0-%a4
        lea     %sp@(52),%sp
        rts

| ====================================== B10, B16-B18, B28: the mix Part ====

| The mix runs on the target Part: the displayed Part while the sequencer is
| not scheduling, the Part of the pattern that plays while it is (that
| pattern's Part byte). scn_pbi (bank index, 0xff = none) and scn_pp (Part)
| hold it. A change, a pattern switch, a Part event or a table change makes a
| mix due (ST_DUE); ensure runs it.

| set_target: d0 = bank index, d1 = Part. Keeps every register.
set_target:
        cmpl    scn_pbi,%d0
        bne.s   1f
        cmpl    scn_pp,%d1
        beq.s   9f
1:      movel   %d0,scn_pbi
        movel   %d1,scn_pp
        mov3ql  #1,scn_state+ST_DUE
9:      rts

| scn_invalidate: a mix is due. Keeps every register.
scn_invalidate:
        mov3ql  #1,scn_state+ST_DUE
        rts

| pattern_part: d0 = the playing pattern's bank, d1 = its Part; d0 = -1 when
| the sequencer's bytes are out of range. Clobbers a0.
pattern_part:
        mvzb    PLAY_BANK,%d0
        cmpil   #15,%d0
        bhi.s   8f
        movel   %d0,%sp@-
        movel   #BANKSZ,%d1
        mulsl   %d1,%d0
        addil   #BANK0,%d0
        moveal  %d0,%a0
        mvzb    PLAY_PTN,%d1
        cmpil   #15,%d1
        bhi.s   7f
        movel   #PTN_STRIDE,%d0
        mulsl   %d1,%d0
        addal   %d0,%a0
        addal   #PTN_PART,%a0
        mvzb    %a0@,%d1
        cmpil   #3,%d1
        bhi.s   7f
        movel   %sp@+,%d0
        rts
7:      addql   #4,%sp
8:      moveq   #-1,%d0
        rts

| follow: not scheduling, the target is the displayed Part; scheduling, it
| stays where it is until a switch or a queued pattern's first step moves it,
| and is taken from the playing pattern when it is still none. Keeps every register.
follow:
        movel   %d0,%sp@-
        movel   %d1,%sp@-
        movel   %a0,%sp@-
        movel   SCHED,%d0
        cmpil   #1,%d0
        beq.s   1f
        clrl    scn_pnd
        mvzb    CUR_BANK,%d0
        andil   #15,%d0
        mvzb    PART_DISP,%d1
        andil   #3,%d1
        bsr.w   set_target
        bra.s   9f
1:      movel   scn_pbi,%d0
        cmpil   #15,%d0
        bls.s   9f
        bsr.w   pattern_part
        tstl    %d0
        bmi.s   9f
        bsr.w   set_target
9:      moveal  %sp@+,%a0
        movel   %sp@+,%d1
        movel   %sp@+,%d0
        rts

| ensure: the mix is run when one is due. Keeps every register.
ensure:
        bsr.w   follow
        tstl    scn_state+ST_DUE
        beq.s   9f
        bsr.w   mix
9:      rts

| 0x400a3c2a: move.l d0,0x46c76aae in the sequencer tick (d0 = the time of the
| queued pattern's first step, a2 = its queue index). A queued pattern whose
| Part is not the target waits as pending until that step.
scn_qrec:
        movel   %d0,0x46c76aae
        lea     %sp@(-24),%sp
        movem.l %d0-%d3/%a0-%a1,%sp@
        movel   %a2,%d3
        cmpil   #23,%d3
        bhi.s   9f
        lea     Q_BANK:l,%a0
        mvzb    %a0@(0,%d3:l),%d1
        cmpil   #15,%d1
        bhi.s   9f
        lea     Q_PART:l,%a0
        mvzb    %a0@(0,%d3:l),%d2
        cmpil   #3,%d2
        bhi.s   9f
        cmpl    scn_pbi,%d1
        bne.s   1f
        cmpl    scn_pp,%d2
        beq.s   9f
1:      tstl    scn_pnd
        beq.s   2f
        cmpl    scn_pnd_b,%d1
        bne.s   2f
        cmpl    scn_pnd_p,%d2
        bne.s   2f
        movel   %d0,%d3
        subl    scn_pnd_t,%d3
        bpl.s   9f                      | already pending for an earlier step
2:      movel   %d0,scn_pnd_t
        movel   %d1,scn_pnd_b
        movel   %d2,scn_pnd_p
        mov3ql  #1,scn_pnd
9:      movem.l %sp@,%d0-%d3/%a0-%a1
        lea     %sp@(24),%sp
        jmp     0x400a3c30

| 0x400a169a: lea 0x46c77b66,%a1 in the sequencer's step routine (sp@(140) = the
| step time). The pending Part becomes the target at its first step; the
| mix follows at once.
scn_qcommit:
        lea     0x46c77b66,%a1
        tstl    scn_pnd
        bne.s   1f
        jmp     0x400a16a0
1:      movel   %d0,%sp@-
        movel   %d1,%sp@-
        movel   scn_pnd_t,%d0
        subl    %sp@(148),%d0           | the step time: 140, two pushes
        bpl.s   9f
        clrl    scn_pnd
        movel   scn_pnd_b,%d0
        movel   scn_pnd_p,%d1
        bsr.w   set_target
        bsr.w   ensure
9:      movel   %sp@+,%d1
        movel   %sp@+,%d0
        jmp     0x400a16a0

| 0x400a44f4 (12 bytes): lea 0x80006634,%a1; move.l (a1),0x8000662c in the
| pattern switch tick. The new pattern's Part is the target at once; the mix
| follows at the next playback step.
scn_switch:
        lea     0x80006634,%a1
        movel   %a1@,0x8000662c
        movel   %d0,%sp@-
        movel   %d1,%sp@-
        movel   %a0,%sp@-
        bsr.w   pattern_part
        tstl    %d0
        bmi.s   9f
        bsr.w   set_target
9:      moveal  %sp@+,%a0
        movel   %sp@+,%d1
        movel   %sp@+,%d0
        jmp     0x400a4500

| 0x400a4ba0: lea 0x800065e4,%a2 in the playback step. While the sequencer
| schedules, the target follows the engine latch, not the sequencer's bytes:
| the latch moves the moment the engine takes a switched pattern (a direct
| jump lands here, not at a commit or a queued first step), and the mix below
| runs in this same step -- engine_follow's timing, his B26..B28 while playing.
scn_step:
        movel   %d0,%sp@-
        movel   %d1,%sp@-
        movel   SCHED,%d0
        cmpil   #1,%d0
        bne.s   1f
        moveq   #0,%d0
        mvzb    ENG_BANK,%d0
        cmpil   #15,%d0
        bhi.s   1f
        moveq   #0,%d1
        mvzb    ENG_PART,%d1
        cmpil   #3,%d1
        bhi.s   1f
        bsr.w   set_target
1:      movel   %sp@+,%d1
        movel   %sp@+,%d0
        bsr.w   ensure
        lea     0x800065e4,%a2
        jmp     0x400a4ba6

| 0x4006221c (8 bytes): clr.l -(sp); jsr 0x40078850, after the event that sets
| the current Part has written it and run `jsr 0x400326a0`.
scn_evt:
        clrl    %sp@-
        jsr     0x40078850
        bsr.w   ensure
        jmp     0x40062224

| 0x4005538a (8 bytes): move.b d2,(a5); move.l #0x18b2,d1 in the panel's MIDI
| parameter write (d4 = track, d6 = flat). The mix runs, and the value the
| rest of the routine sends is the one it left in the track record.
scn_pwrite:
        moveb   %d2,%a5@
        movel   #PARTSZ,%d1
        bsr.w   mix
        movel   #REC_STRIDE,%d0
        mulsl   %d4,%d0
        addl    %d6,%d0
        lea     REC,%a0
        addal   %d0,%a0
        mvzb    %a0@,%d2
        jmp     0x40055392

| ctx_reset: the context the mix rebuilds on when a mix is due: the trig
| snapshots are empty and no track has a trig playing. Keeps every register.
ctx_reset:
        movel   %d0,%sp@-
        movel   %a0,%sp@-
        lea     scn_snap:l,%a0
        moveq   #64,%d0
1:      movel   #-1,%a0@+
        subql   #1,%d0
        bne.s   1b
        clrl    scn_sdirty
        clrl    scn_sdirty+4
        moveal  %sp@+,%a0
        movel   %sp@+,%d0
        rts

| ============================================ B12: the trig snapshot ====

| 0x400a19da (8 bytes): moveml (a0),d1-d4/d6-d7/a4-a5; moveml ...,(a1) in the
| sequencer's step routine: a track's 32-byte lane (values with the trig's
| locks) is copied to its destination as a trig plays (d5 = track, a0 = the
| lane). The lane is kept as the track's snapshot.
scn_snap1:
        movem.l %a0@,%d1-%d4/%d6-%d7/%a4-%a5
        movem.l %d1-%d4/%d6-%d7/%a4-%a5,%a1@
        lea     %sp@(-64),%sp
        movem.l %d0-%d7/%a0-%a6,%sp@
        cmpil   #7,%d5
        bhi.s   9f
        bsr.w   ensure
        movel   %d5,%d0
        lsll    #5,%d0
        lea     scn_snap:l,%a1
        addal   %d0,%a1
        moveq   #8,%d0
1:      movel   %a0@+,%a1@+
        subql   #1,%d0
        bne.s   1b
        lea     scn_spend:l,%a0
        moveq   #1,%d0
        moveb   %d0,%a0@(0,%d5:l)
9:      movem.l %sp@,%d0-%d7/%a0-%a6
        lea     %sp@(64),%sp
        jmp     0x400a19e2

| 0x400a1d32: movel a2,d1; btst #0,d1, after the 30-parameter loop of track d5.
| When the track took a snapshot, it is marked as having a trig playing and
| re-mixed alone.
scn_snap2:
        lea     %sp@(-64),%sp
        movem.l %d0-%d7/%a0-%a6,%sp@
        cmpil   #7,%d5
        bhi.s   9f
        lea     scn_spend:l,%a0
        tstb    %a0@(0,%d5:l)
        beq.s   9f
        clrb    %a0@(0,%d5:l)
        tstl    scn_state+ST_VALID
        beq.s   9f
        lea     scn_sdirty:l,%a0
        moveq   #1,%d0
        moveb   %d0,%a0@(0,%d5:l)
        movel   %d5,%d0
        addql   #1,%d0
        movel   %d0,scn_only
        bsr.w   mix
        clrl    scn_only
9:      movem.l %sp@,%d0-%d7/%a0-%a6
        lea     %sp@(64),%sp
        movel   %a2,%d1
        btst    #0,%d1
        jmp     0x400a1d38

| ================================= B14: the CC loop before the note-on ====

| 0x4009faaa: move.l #0x10001,d0 in the MIDI routine 0x4009f794, after the
| track's channel and mute tests (d5 = channel, d7 = track). Stock sends the
| track's CC values after its note-on; the loop runs here instead (the stock
| loop at 0x4009fe4e is jumped over). The routine's three frame slots the loop
| uses are kept.
scn_ccnote:
        lea     %sp@(-72),%sp
        movem.l %d0-%d7/%a0-%a6,%sp@
        movel   %fp@(-64),%d0
        movel   %d0,%sp@(60)
        movel   %fp@(-54),%d0
        movel   %d0,%sp@(64)
        movel   %fp@(-50),%d0
        movel   %d0,%sp@(68)
        bsr.w   cc_loop
        movel   %sp@(60),%d0
        movel   %d0,%fp@(-64)
        movel   %sp@(64),%d0
        movel   %d0,%fp@(-54)
        movel   %sp@(68),%d0
        movel   %d0,%fp@(-50)
        movem.l %sp@,%d0-%d7/%a0-%a6
        lea     %sp@(72),%sp
        movel   #0x10001,%d0
        jmp     0x4009fab0

| cc_loop: d7 = track, d5 = channel. Sends the track's enabled CCs (flats 20..23,
| then 24..29) whose lane value differs from the last one sent on the channel,
| once per CC number per tick.
cc_loop:
        movel   %d5,%d0
        lsll    #2,%d0
        moveal  %d0,%a5                 | a5 = channel * 4
        movel   %d7,%d0
        movel   #REC_STRIDE,%d1
        mulsl   %d1,%d0
        addil   #REC+0x34,%d0
        moveal  %d0,%a2                 | the CC numbers of flats 20..23
        movel   %d7,%d0
        lsll    #5,%d0
        addil   #LANE+20,%d0
        moveal  %d0,%a3                 | their lane values
        moveal  %fp@(-28),%a4           | the enable bits (record +0x1e)
        moveq   #2,%d6
        moveq   #4,%d4
        bsr.s   cc_pass
        movel   %d7,%d0
        movel   #REC_STRIDE,%d1
        mulsl   %d1,%d0
        addil   #REC+0x38,%d0
        moveal  %d0,%a2                 | the CC numbers of flats 24..29
        movel   %d7,%d0
        lsll    #5,%d0
        addil   #LANE+24,%d0
        moveal  %d0,%a3
        moveal  %fp@(-24),%a4
        addal   #31,%a4                 | record +0x1f
        moveq   #0,%d6
        moveq   #6,%d4
cc_pass:
        mvsb    %a2@,%d2                | the CC number
        moveb   %a3@,%d3                | the lane value
        moveq   #31,%d1
        andl    %d2,%d1
        moveq   #1,%d0
        lsll    %d1,%d0
        movel   %d0,%d1                 | d1 = its bit
        movel   %d2,%d0
        asrl    #5,%d0
        addl    %a5,%d0
        lea     CCSENT:l,%a0
        movel   %a0@(0,%d0:l:4),%d0
        andl    %d1,%d0
        bne.w   cp_next                 | already handled this tick
        mvsb    %a4@,%d0
        btst    %d6,%d0
        beq.w   cp_next                 | not enabled
        moveal  %fp@(-32),%a1
        mvsb    %a1@,%d1
        mvsb    0x46c79e70,%d0
        cmpl    %d1,%d0
        bne.s   cp_mask
        movel   %d5,%d0
        lsll    #7,%d0
        addl    %d2,%d0
        lea     CCCACHE:l,%a1
        mvsb    %a1@(0,%d0:l),%d1
        mvsb    %d3,%d0
        cmpl    %d1,%d0
        beq.s   cp_mask
        moveb   %d2,MSGBUF+1
        moveb   %d3,MSGBUF+2
        pea     MSGBUF
        pea     3
        jsr     MIDI_TX
        movel   %d5,%d0
        lsll    #7,%d0
        addl    %d2,%d0
        lea     CCCACHE:l,%a1
        moveb   %d3,%a1@(0,%d0:l)
        addql   #8,%sp
cp_mask:
        moveq   #31,%d1
        andl    %d2,%d1
        moveq   #1,%d0
        lsll    %d1,%d0
        movel   %d0,%d1
        movel   %d2,%d0
        asrl    #5,%d0
        addl    %a5,%d0
        lea     CCSENT:l,%a0
        orl     %d1,%a0@(0,%d0:l:4)
cp_next:
        addql   #1,%a2
        addql   #1,%a3
        addql   #1,%d6
        subql   #1,%d4
        bne.w   cc_pass
        rts

| ====================================================== B29: scene rows ====

| 0x40062f24: CLEAR SCENE, jsr 0x40038c30(scene). In MIDI mode MSC[scene] is
| wiped and the mix runs; stock clears the audio scene in either mode.
scn_clear:
        tstl    MIDI_MODE
        beq.s   scn_stock_clear
        movel   %d0,%sp@-
        movel   %d1,%sp@-
        movel   %a0,%sp@-
        movel   %sp@(16),%d0
        andil   #15,%d0
        lsll    #8,%d0
        bsr.w   msc_a0
        addal   %d0,%a0
        movel   #256,%d1
1:      moveb   #NOLOCK,%a0@
        addql   #1,%a0
        subql   #1,%d1
        bne.s   1b
        moveal  %sp@+,%a0
        movel   %sp@+,%d1
        movel   %sp@+,%d0
        bsr.w   msc_edited
        bsr.w   mix
scn_stock_clear:
        jmp     0x40038c30

| 0x40062fbe: COPY SCENE, jsr 0x400274cc(part, scene). In MIDI mode
| MSC[scene] goes to the clipboard; stock copies the audio scene in either
| mode.
scn_copy:
        tstl    MIDI_MODE
        beq.s   scn_stock_copy
        movel   %d0,%sp@-
        movel   %d1,%sp@-
        movel   %a0,%sp@-
        movel   %a1,%sp@-
        movel   %sp@(24),%d0
        andil   #15,%d0
        lsll    #8,%d0
        bsr.w   msc_a0
        addal   %d0,%a0
        lea     scn_clip:l,%a1
        movel   #256,%d1
1:      moveb   %a0@+,%d0
        moveb   %d0,%a1@+
        subql   #1,%d1
        bne.s   1b
        moveal  %sp@+,%a1
        moveal  %sp@+,%a0
        movel   %sp@+,%d1
        movel   %sp@+,%d0
scn_stock_copy:
        jmp     0x400274cc

| 0x40062e3c: PASTE SCENE, jsr 0x40027578(part, scene). In MIDI mode, when a
| scene is on the clipboard the clipboard goes to MSC[scene]; stock pastes
| the audio scene in either mode.
scn_paste:
        tstl    MIDI_MODE
        beq.s   2f
        movel   CLIPBOARD_TYPE,%d0
        cmpil   #0x10,%d0
        bne.s   2f
        movel   %d0,%sp@-
        movel   %d1,%sp@-
        movel   %a0,%sp@-
        movel   %a1,%sp@-
        movel   %sp@(24),%d0
        andil   #15,%d0
        lsll    #8,%d0
        bsr.w   msc_a0
        lea     scn_sink,%a1
        cmpal   %a1,%a0
        bne.s   3f
        lea     TXT_FULL,%a0            | NBLK Parts hold locks: refused
        bsr.w   scn_notify
        moveal  %sp@+,%a1
        moveal  %sp@+,%a0
        movel   %sp@+,%d1
        movel   %sp@+,%d0
        bra.s   2f
3:      moveal  %a0,%a1
        addal   %d0,%a1
        lea     scn_clip:l,%a0
        movel   #256,%d1
1:      moveb   %a0@+,%d0
        moveb   %d0,%a1@+
        subql   #1,%d1
        bne.s   1b
        moveal  %sp@+,%a1
        moveal  %sp@+,%a0
        movel   %sp@+,%d1
        movel   %sp@+,%d0
        bsr.w   msc_edited
2:      jmp     0x40027578

| ================================================================ storage ====
| One lock table per Part, 4,096 B each, for the 64 Parts of a project (slot =
| bank * 4 + Part). Modwerk 0.3.1 keeps NBLK tables (scn_blk) and gives one to a
| Part when it is displayed or gets locks (scn_map: slot -> table + 1, 0 =
| none); every other Part reads the one empty table (scn_empty, 0xff, never
| written). A table that holds no lock goes back when another Part needs one,
| unless its Part is displayed or mixed (blk_take). With all NBLK holding
| locks, the displayed Part gets the sink (scn_sink, 0xff again on every call):
| an edit there is refused with a toast (hold_store, scn_paste). So at most
| NBLK Parts hold locks; the 256 KiB library of 0.3.0 took 35 % of the base's
| module pool for every set. Every table above is the displayed Part's
| (msc_a0); the mix reads the mix Part's (msc_mix), which never allocates.
| The library is written whole to scenes.work beside
| the bank files. The current bank's locks are copied to battery RAM
| (0x100f9800..0x100fbf00, sdk/machines/octatrack/battery-ram.json) on every
| edit, load and bank write, as stock keeps its Part copy there: an unsaved
| edit survives a power cycle (measured on stock, octabam's MIDI_SCENES.md
| section 8). The base's hooks call the scn_ev_* handlers (runtime.json).
|
| scenes.work: 'MSCW', version 1, payload length 262,144, CRC-32 of the
| payload; then the 64 slots in order. A file that is not that is never
| written over (scn_nowrite); the banks it would have filled stay empty.
| Battery RAM: 'SCS2' (written last), bank, count, sum, project id; then one
| long per lock, (Part << 12 | scene << 8 | track << 5 | flat) << 8 | value.
| The sum adds the bank, the project id, the count and every entry. A bank
| with more locks than fit keeps no copy (the magic stays 0).
| A load (scenes.work, the battery-RAM copy, a 2.x project's blobs) that finds
| more locked Parts than NBLK leaves the rest empty, counts them in
| scn_cnt_drop, never writes scenes.work over (scn_nowrite: the file keeps
| them) and shows a toast at the next scene gesture (scn_toast).

        .set    CUR_BANK,       0x80000002      | byte: the current bank
        .set    CS1_BASE,       0x100f9800
        .set    CS1_END,        CS1_BASE+0x2700 | 9,984 bytes; Kits keeps its 256-byte table above (battery-ram.json)
        .set    CS1_DATA,       0x100f9814      | after the magic, bank, count, sum and project id
        .set    CS1_MAX,        (CS1_END-CS1_DATA)/4
        .set    CS1_MAGIC,      0x53435332      | 'SCS2'
        .set    FMAGIC,         0x4d534357      | 'MSCW'
        .set    LIB_B,          64*4096         | scenes.work's payload: all 64 slots
        .set    NBLK,           24              | Parts that may hold locks (at most 32: scn_used)
        .set    NOTIFY,         0x4005a2b8      | (text, ticks > 0): the stock toast; the UI task only
        .set    TOAST_T,        0x48            | 1.2 s at the 60 Hz UI tick
        .set    F_COPY,         0x40016388      | (dst path, src path, 0) -> <0 error
        .set    F_OPEN,         0x40016864      | (fo, path, mode, buffer, size) -> <0 error
        .set    F_READ,         0x40016564      | (fo, dst, n) -> 1
        .set    F_WRITE,        0x400166b8      | (fo, src, n) -> 1
        .set    F_CLOSE,        0x4001677c      | (fo)
        .set    PROJDIR,        0x40025230      | (0, 0) -> the project directory
        .set    SPRINTF,        0x40013a08
        .set    IOB_LEN,        0x1000

| msc_a0: a0 = the displayed Part's table, given one when it has none (the
| stock sites write through it: B1, B3, B6), the sink when none is free or a
| load is running. Keeps every other register.
msc_a0:
        movel   %d0,%sp@-
        movel   %d1,%sp@-
        bsr.w   scn_ensure
        bsr.w   disp_slot
        tstl    scn_loading
        bne.s   1f
        bsr.w   tbl_w
        bra.s   9f
1:      bsr.w   tbl_r                   | a load is filling tables: only one it already has
        movel   %a0,%d1
        lea     scn_empty,%a0
        cmpl    %a0,%d1
        bne.s   2f
        bsr.w   sink_ff                 | none: the sink, never the shared empty table
        bra.s   9f
2:      moveal  %d1,%a0
9:      movel   %sp@+,%d1
        movel   %sp@+,%d0
        rts

| msc_mix: a0 = the mix Part's table (scn_pbi, scn_pp), the empty table when
| it has none; never allocates (the sequencer step calls it). Keeps every other register.
msc_mix:
        movel   %d0,%sp@-
        movel   %d1,%sp@-
        bsr.w   scn_ensure
        movel   scn_pbi,%d0
        andil   #15,%d0
        lsll    #2,%d0
        movel   scn_pp,%d1
        andil   #3,%d1
        addl    %d1,%d0
        bsr.w   tbl_r
        movel   %sp@+,%d1
        movel   %sp@+,%d0
        rts

| scn_ensure: the empty table is 0xff before first use. Keeps every register.
scn_ensure:
        tstl    scn_ready
        bne.s   9f
        movel   %d0,%sp@-
        movel   %d1,%sp@-
        movel   %a0,%sp@-
        lea     scn_empty,%a0
        movel   #1024,%d0
        bsr.w   fill_ff
        moveq   #1,%d0
        movel   %d0,scn_ready
        moveal  %sp@+,%a0
        movel   %sp@+,%d1
        movel   %sp@+,%d0
9:      rts

| disp_slot: d0 = the displayed Part's slot. Keeps every other register.
disp_slot:
        movel   %d1,%sp@-
        mvzb    CUR_BANK,%d0
        andil   #15,%d0
        lsll    #2,%d0
        mvzb    PART_DISP,%d1
        andil   #3,%d1
        addl    %d1,%d0
        movel   %sp@+,%d1
        rts

| mix_slot: d0 = the mix Part's slot, -1 with none. Keeps every other register.
mix_slot:
        movel   scn_pbi,%d0
        cmpil   #15,%d0
        bhi.s   8f
        lsll    #2,%d0
        movel   %d1,%sp@-
        movel   scn_pp,%d1
        andil   #3,%d1
        addl    %d1,%d0
        movel   %sp@+,%d1
        rts
8:      moveq   #-1,%d0
        rts

| blk_at: d0 = a table's index -> a0 = its address. Keeps every other register.
blk_at:
        movel   %d0,%sp@-
        lsll    #6,%d0
        lsll    #6,%d0
        lea     scn_blk,%a0
        addal   %d0,%a0
        movel   %sp@+,%d0
        rts

| tbl_r: d0 = a slot (0..63) -> a0 = its table, the empty table when it has
| none. Keeps every other register.
tbl_r:
        movel   %d0,%sp@-
        andil   #63,%d0
        lea     scn_map,%a0
        addal   %d0,%a0
        mvzb    %a0@,%d0
        tstl    %d0
        bne.s   1f
        lea     scn_empty,%a0
        bra.s   9f
1:      subql   #1,%d0
        bsr.s   blk_at
9:      movel   %sp@+,%d0
        rts

| sink_ff: a0 = the sink, all 0xff again. Keeps every other register.
sink_ff:
        movel   %d0,%sp@-
        movel   %d1,%sp@-
        lea     scn_sink,%a0
        movel   #1024,%d0
        bsr.w   fill_ff
        lea     scn_sink,%a0
        movel   %sp@+,%d1
        movel   %sp@+,%d0
        rts

| tbl_w: d0 = a slot -> a0 = its table, a fresh one (0xff) when it had none,
| the sink (0xff, counted in scn_cnt_full) when no table is free. Keeps every
| other register. The table is filled before the map names it, so a reader
| on another task never sees it half made.
tbl_w:
        lea     %sp@(-16),%sp
        movem.l %d0-%d2/%a1,%sp@
        andil   #63,%d0
        movel   %d0,%d2                 | d2 = the slot
        bsr.w   tbl_r
        lea     scn_empty,%a1
        cmpal   %a1,%a0
        bne.s   9f                      | it has one
        bsr.w   blk_take                | d0 = a table claimed for it, -1 none
        tstl    %d0
        bmi.s   7f
        tstl    scn_loading
        beq.s   1f
        movel   scn_fresh,%d1           | a load's table: not taken back until it ends
        bset    %d0,%d1
        movel   %d1,scn_fresh
1:      movel   %d0,%sp@-               | its index
        bsr.w   blk_at
        movel   %a0,%sp@-
        movel   #1024,%d0
        bsr.w   fill_ff                 | clobbers d0, d1, a0
        moveal  %sp@+,%a0
        movel   %sp@+,%d0
        lea     scn_owner,%a1
        moveb   %d2,%a1@(0,%d0:l)       | its owner
        addql   #1,%d0
        lea     scn_map,%a1
        moveb   %d0,%a1@(0,%d2:l)       | published: the slot names it
        bra.s   9f
7:      bsr.w   sink_ff
        addql   #1,scn_cnt_full
9:      movem.l %sp@,%d0-%d2/%a1
        lea     %sp@(16),%sp
        rts

| blk_take -> d0 = a table claimed (its bit set in scn_used), -1 when none
| is free and none can be taken back. Taking back: a table whose slot no
| longer names it, or one with no lock whose Part is neither displayed nor
| mixed; never one the running load gave out (scn_fresh: it may still be
| filling it), and not again until a lock has changed since the last scan that
| found none (scn_edits). Keeps every other register.
blk_take:
        lea     %sp@(-36),%sp
        movem.l %d1-%d6/%a0-%a2,%sp@
        bsr.w   blk_free                | under the mask: a free one claimed
        tstl    %d0
        bpl.w   9f
        movel   scn_edits,%d0
        cmpl    scn_nofit,%d0
        beq.w   8f
        bsr.w   disp_slot
        movel   %d0,%d4                 | d4 = the displayed slot
        bsr.w   mix_slot
        movel   %d0,%d5                 | d5 = the mix slot
        moveq   #0,%d3                  | d3 = the table
1:      movel   scn_used,%d0
        btst    %d3,%d0
        beq.w   5f
        movel   scn_fresh,%d0
        btst    %d3,%d0
        bne.w   5f
        lea     scn_owner,%a1
        mvzb    %a1@(0,%d3:l),%d6       | d6 = its slot
        cmpil   #63,%d6
        bhi.w   5f                      | pending: another task is giving it out
        lea     scn_map,%a2
        mvzb    %a2@(0,%d6:l),%d0
        subql   #1,%d0
        cmpl    %d3,%d0
        bne.w   4f                      | the slot no longer names it: free to take
        cmpl    %d4,%d6
        beq.w   5f
        cmpl    %d5,%d6
        beq.w   5f
        movel   %d3,%d0
        bsr.w   blk_at
        bsr.w   is_empty
        tstl    %d0
        beq.w   5f
4:      move.w  %sr,%d1                 | under the mask: still the same, then it is ours
        move.w  #0x2700,%sr
        movel   scn_used,%d0
        btst    %d3,%d0
        beq.w   6f
        lea     scn_owner,%a1
        mvzb    %a1@(0,%d3:l),%d0
        cmpl    %d6,%d0
        bne.w   6f
        lea     scn_map,%a2
        mvzb    %a2@(0,%d6:l),%d0
        subql   #1,%d0
        cmpl    %d3,%d0
        bne.w   3f
        clrb    %a2@(0,%d6:l)           | the slot loses it
3:      moveq   #-1,%d0
        moveb   %d0,%a1@(0,%d3:l)       | pending, as blk_free leaves it
        move.w  %d1,%sr
        movel   %d3,%d0
        bra.w   9f
6:      move.w  %d1,%sr
5:      addql   #1,%d3
        cmpil   #NBLK,%d3
        bne.w   1b
        movel   scn_edits,%d0
        movel   %d0,scn_nofit
8:      moveq   #-1,%d0
9:      movem.l %sp@,%d1-%d6/%a0-%a2
        lea     %sp@(36),%sp
        rts

| blk_free -> d0 = a free table claimed under the mask (its owner 0xff,
| pending, so blk_take on another task leaves it), -1 none. Keeps every other register.
blk_free:
        movel   %d1,%sp@-
        movel   %d2,%sp@-
        move.w  %sr,%d2
        move.w  #0x2700,%sr
        movel   scn_used,%d1
        moveq   #0,%d0
1:      btst    %d0,%d1
        beq.s   2f
        addql   #1,%d0
        cmpil   #NBLK,%d0
        bne.s   1b
        moveq   #-1,%d0
        bra.s   9f
2:      bset    %d0,%d1
        movel   %d1,scn_used
        movel   %a0,%sp@-
        lea     scn_owner,%a0
        moveq   #-1,%d1
        moveb   %d1,%a0@(0,%d0:l)       | pending: no slot until tbl_w publishes it
        moveal  %sp@+,%a0
9:      move.w  %d2,%sr
        movel   %sp@+,%d2
        movel   %sp@+,%d1
        rts

| slot_free: d0 = a slot -> it has no table; its table, if any, is free. Keeps every register.
slot_free:
        lea     %sp@(-16),%sp
        movem.l %d0-%d2/%a0,%sp@
        andil   #63,%d0
        move.w  %sr,%d2
        move.w  #0x2700,%sr
        lea     scn_map,%a0
        mvzb    %a0@(0,%d0:l),%d1
        clrb    %a0@(0,%d0:l)
        tstl    %d1
        beq.s   9f
        subql   #1,%d1
        movel   scn_used,%d0
        bclr    %d1,%d0
        movel   %d0,scn_used
9:      move.w  %d2,%sr
        movem.l %sp@,%d0-%d2/%a0
        lea     %sp@(16),%sp
        rts

| is_empty: a0 = a table -> d0 = 1 when it holds no lock (4,096 bytes of 0xff), else 0.
| Keeps every other register.
is_empty:
        movel   %d1,%sp@-
        movel   %a0,%sp@-
        movel   #1024,%d1
1:      movel   %a0@+,%d0
        notl    %d0
        bne.s   2f
        subql   #1,%d1
        bne.s   1b
        moveq   #1,%d0
        bra.s   9f
2:      moveq   #0,%d0
9:      moveal  %sp@+,%a0
        movel   %sp@+,%d1
        rts

| scn_notify: the UI task only. a0 = a toast's text. Keeps every register.
scn_notify:
        lea     %sp@(-16),%sp
        movem.l %d0-%d1/%a0-%a1,%sp@
        pea     TOAST_T
        movel   %a0,%sp@-
        jsr     NOTIFY
        addql   #8,%sp
        movem.l %sp@,%d0-%d1/%a0-%a1
        lea     %sp@(16),%sp
        rts

| toast_due: the UI task only. A load that dropped locked Parts shows its toast once. Keeps every register.
toast_due:
        tstl    scn_toast
        beq.s   9f
        clrl    scn_toast
        movel   %a0,%sp@-
        lea     TXT_DROP,%a0
        bsr.s   scn_notify
        moveal  %sp@+,%a0
9:      rts

| fill_ff: a0 = start, d0 = longs. Clobbers d0, d1, a0.
fill_ff:
        moveq   #-1,%d1
1:      movel   %d1,%a0@+
        subql   #1,%d0
        bne.s   1b
        rts

| msc_edited: a lock changed. The file is due, CS1 follows, and the Part is
| marked changed the way stock's editors mark it (SAVE PROJECT does nothing
| for a project it thinks unchanged). Keeps every register.
msc_edited:
        lea     %sp@(-32),%sp
        movem.l %d0-%d5/%a0-%a1,%sp@
        addql   #1,scn_edits            | a table may have emptied: blk_take may look again
        moveq   #1,%d0
        movel   %d0,scn_dirty
        mvzb    CUR_BANK,%d0
        bsr.w   cs1_full
        mvzb    PART_DISP,%d1           | the Part is changed, as for a stock editor's store
        andil   #3,%d1
        moveq   #1,%d0
        lsll    %d1,%d0
        movel   %d0,%d1                 | d1 = its bit
        movel   BANK_PTR,%d0
        moveal  %d0,%a0
        addil   #0x95048,%d0            | the bank's changed-Part bits
        moveal  %d0,%a1
        moveq   #0,%d0
        moveb   %a1@,%d0
        orl     %d1,%d0
        moveb   %d0,%a1@
        moveq   #0,%d0
        moveb   0x100b145e,%d0          | the unsaved-Part bits
        orl     %d1,%d0
        moveb   %d0,0x100b145e
        movel   %a0,%d0
        addil   #0x9b332,%d0            | the bank's changed flag
        moveal  %d0,%a1
        moveq   #1,%d0
        movel   %d0,%a1@
        movel   %d0,0x100f8598          | the global changed flag
        jsr     0x40027e00              | the edited-state refresh
        movem.l %sp@,%d0-%d5/%a0-%a1
        lea     %sp@(32),%sp
        rts

| cs1_full: d0 = bank -> battery RAM holds that bank's locks. Keeps every register.
| Two tasks reach it (the UI task for an edit, the engine task for a load or a
| bank write), the UI task preempting the other at any instruction. The
| request is left in scn_want; a copy that finds one running sets scn_again
| and returns, and the running copy, which re-reads scn_want and starts over,
| is the one whose copy stands. The magic is set under the mask with the
| last compare, after the bank, the count and the sum.
cs1_full:
        tstl    scn_dropped
        beq.s   1f
        clrl    CS1_BASE                | a load left a Part out: no copy (load_drop)
        rts
1:      lea     %sp@(-40),%sp
        movem.l %d0-%d5/%a0-%a1,%sp@
        andil   #15,%d0
        move.w  %sr,%d1
        movew   %d1,%sp@(32)
        move.w  #0x2700,%sr
        movel   %d0,scn_want
        tstl    scn_busy
        bne.w   cf_later
        moveq   #1,%d1
        movel   %d1,scn_busy
        movew   %sp@(32),%d1
        move.w  %d1,%sr
cf_run: clrl    scn_again
        movel   scn_want,%d0
        lea     CS1_BASE,%a1
        clrl    %a1@                    | no magic while it is written
        movel   %d0,%a1@(4)
        movel   scn_projid,%d3
        movel   %d3,%a1@(16)
        addl    %d0,%d3                 | the sum: the bank, the project id, then the entries and the count
        lsll    #2,%d0
        movel   %d0,%sp@(36)            | the bank's first slot
        lea     CS1_DATA,%a1
        moveq   #0,%d2                  | the byte's index in the bank: Part << 12 | scene << 8 | track << 5 | flat
        moveq   #0,%d4                  | entries
1:      movel   %d2,%d0
        andil   #0xfff,%d0
        bne.s   6f
        movel   %d2,%d0                 | a Part's first byte: its table
        lsrl    #6,%d0
        lsrl    #6,%d0
        addl    %sp@(36),%d0
        bsr.w   tbl_r
6:      movel   %a0@+,%d0
        moveq   #-1,%d1
        cmpl    %d1,%d0
        bne.s   2f
        addql   #4,%d2                  | four bytes without a lock
        bra.s   5f
2:      subql   #4,%a0
        moveq   #4,%d5
3:      moveq   #0,%d0
        moveb   %a0@+,%d0
        cmpil   #0xff,%d0
        beq.s   4f
        cmpil   #CS1_MAX,%d4
        bcc.s   cf_full
        movel   %d2,%d1
        lsll    #8,%d1
        orl     %d0,%d1
        movel   %d1,%a1@+
        addl    %d1,%d3
        addql   #1,%d4
4:      addql   #1,%d2
        subql   #1,%d5
        bne.s   3b
5:      cmpil   #16384,%d2
        bne.s   1b
        lea     CS1_BASE,%a1
        movel   %d4,%a1@(8)
        addl    %d4,%d3
        movel   %d3,%a1@(12)
        move.w  #0x2700,%sr
        tstl    scn_again
        bne.s   cf_redo
        clrl    scn_busy
        movel   #CS1_MAGIC,%d0
        movel   %d0,CS1_BASE
        movew   %sp@(32),%d1
        move.w  %d1,%sr
        bra.s   cf_out
cf_full:                                | more locks than fit: no copy, the magic stays 0
        move.w  #0x2700,%sr
        tstl    scn_again
        bne.s   cf_redo
        clrl    scn_busy
        movew   %sp@(32),%d1
        move.w  %d1,%sr
        bra.s   cf_out
cf_redo:
        movew   %sp@(32),%d1
        move.w  %d1,%sr
        bra.w   cf_run
cf_later:
        moveq   #1,%d1
        movel   %d1,scn_again
        movew   %sp@(32),%d1
        move.w  %d1,%sr
cf_out: movem.l %sp@,%d0-%d5/%a0-%a1
        lea     %sp@(40),%sp
        rts

| cs1_restore: when battery RAM holds a whole copy of the current bank's
| locks for this project (magic, bank, project id, count and sum), it
| replaces that bank's four tables: they may hold edits scenes.work lacks.
| Keeps every register.
cs1_restore:
        lea     %sp@(-24),%sp
        movem.l %d0-%d3/%a0-%a1,%sp@
        bsr.w   scn_ensure
        mvzb    CUR_BANK,%d0
        andil   #15,%d0
        lea     CS1_BASE,%a1
        movel   %a1@,%d1
        cmpil   #CS1_MAGIC,%d1
        bne.w   cr_out
        cmpl    %a1@(4),%d0
        bne.w   cr_out
        movel   scn_projid,%d1
        cmpl    %a1@(16),%d1
        bne.w   cr_out
        movel   %a1@(8),%d2             | the count
        cmpil   #CS1_MAX,%d2
        bhi.w   cr_out
        movel   %d0,%d3
        addl    %d1,%d3
        addl    %d2,%d3
        lea     CS1_DATA,%a0
        movel   %d2,%d1
        beq.s   2f
1:      addl    %a0@+,%d3
        subql   #1,%d1
        bne.s   1b
2:      cmpl    %a1@(12),%d3
        bne.w   cr_out
        movel   %d0,%d3
        lsll    #2,%d3                  | d3 = the bank's first slot
        bsr.w   bank_free               | its four Parts lose their tables
        lea     CS1_DATA,%a1
        tstl    %d2
        beq.s   4f
3:      movel   %a1@+,%d1               | an entry: (Part << 12 | index) << 8 | value
        movel   %d1,%d0
        lsrl    #8,%d0
        lsrl    #6,%d0
        lsrl    #6,%d0
        andil   #3,%d0
        addl    %d3,%d0
        bsr.w   tbl_w                   | a0 = the Part's table
        movel   %a0,%d0
        cmpil   #scn_sink,%d0
        bne.s   5f
        bsr.w   load_drop               | no table left: not restored
        bra.s   6f
5:      movel   %d1,%d0
        lsrl    #8,%d0
        andil   #0xfff,%d0
        moveb   %d1,%a0@(0,%d0:l)
6:      subql   #1,%d2
        bne.s   3b
4:      moveq   #1,%d0
        movel   %d0,scn_dirty           | the copy may hold edits the file lacks
cr_out: movem.l %sp@,%d0-%d3/%a0-%a1
        lea     %sp@(24),%sp
        rts

| proj_id: scn_projid = FNV-1a of the project directory's path, which tags the
| battery-RAM copy. The engine task only. Keeps d2-d7/a2-a6.
proj_id:
        movel   %d2,%sp@-
        clrl    %sp@-
        clrl    %sp@-
        jsr     PROJDIR
        addql   #8,%sp
        moveal  %d0,%a0
        tstl    %d0
        beq.s   9f
        movel   #0x811c9dc5,%d0
        movel   #0x01000193,%d2
1:      moveq   #0,%d1
        moveb   %a0@+,%d1
        beq.s   9f
        eorl    %d1,%d0
        mulu.l  %d2,%d0
        bra.s   1b
9:      movel   %d0,scn_projid
        movel   %sp@+,%d2
        rts

| clear_banks: d1 = a bank mask -> those banks' Parts have no table (no lock). Clobbers d0-d3, a0.
clear_banks:
        movel   %d1,%d3
        moveq   #0,%d2
1:      btst    %d2,%d3
        beq.s   2f
        movel   %d2,%d0
        bsr.s   bank_free
2:      addql   #1,%d2
        cmpil   #16,%d2
        bne.s   1b
        rts

| bank_free: d0 = a bank -> its four Parts have no table. Keeps every register.
bank_free:
        movel   %d0,%sp@-
        movel   %d1,%sp@-
        andil   #15,%d0
        lsll    #2,%d0
        moveq   #4,%d1
1:      bsr.w   slot_free
        addql   #1,%d0
        subql   #1,%d1
        bne.s   1b
        movel   %sp@+,%d1
        movel   %sp@+,%d0
        rts

| load_drop: a load found no table for a locked Part. It stays empty, the file
| that holds it is never written over, battery RAM keeps no copy of the bank
| (cs1_full: a copy without that Part would replace the file's at the next
| install), and the toast is due. Keeps every register.
load_drop:
        addql   #1,scn_cnt_drop
        mov3ql  #1,scn_dropped
        mov3ql  #1,scn_nowrite
        mov3ql  #1,scn_toast
        rts

| write_scenes -> d0 = 0 when scenes.work holds the library: all 64 slots, a
| Part without a table as the empty table (the file's format is 0.3.0's).
write_scenes:
        movel   %d2,%sp@-
        movel   %d3,%sp@-
        moveq   #0,%d3                  | the slot
        moveq   #0,%d2                  | the running CRC
1:      movel   %d3,%d0
        bsr.w   tbl_r
        movel   #4096,%d0
        movel   %d2,%d1
        jsr     scn_crc32
        movel   %d0,%d2
        addql   #1,%d3
        cmpil   #64,%d3
        bne.s   1b
        movel   %d2,scn_hdr+12
        movel   #FMAGIC,%d0
        movel   %d0,scn_hdr
        moveq   #1,%d0
        movel   %d0,scn_hdr+4
        movel   #LIB_B,%d0
        movel   %d0,scn_hdr+8
        lea     FMT_WORK,%a0
        lea     scn_path,%a1
        moveq   #0,%d0
        jsr     scn_fpath
        lea     scn_path,%a0
        lea     MODE_W,%a1
        lea     scn_ctx,%a2
        jsr     scn_fopen
        tstl    %d0
        bmi.s   8f
        lea     scn_hdr,%a0
        moveq   #16,%d0
        jsr     scn_fwrite
        movel   %d0,%d2
        moveq   #0,%d3
2:      movel   %d3,%d0
        bsr.w   tbl_r
        movel   #4096,%d0
        jsr     scn_fwrite
        subql   #1,%d0
        bne.s   7f
        addql   #1,%d3
        cmpil   #64,%d3
        bne.s   2b
        subql   #1,%d2
        bne.s   7f
        jsr     scn_fclose
        moveq   #0,%d0
        bra.s   9f
7:      jsr     scn_fclose
8:      addql   #1,scn_cnt_ioerr
        moveq   #-1,%d0
9:      movel   %sp@+,%d3
        movel   %sp@+,%d2
        rts

write_if_dirty:
        tstl    scn_ready
        beq.s   1f
        tstl    scn_dirty
        beq.s   1f
        tstl    scn_nowrite
        bne.s   1f
        bsr.w   write_scenes
        tstl    %d0
        bne.s   1f
        clrl    scn_dirty
1:      rts

| read_scenes: d1 = a bank mask -> d0 = 0 the masked banks read, 1 no file,
| 2 a file that is not scenes.work version 1 or fails its CRC (the masked
| banks then hold what was read, and load_masked empties them). Slot by slot
| through scn_scratch, the CRC over all of them: a masked bank's slot that
| holds a lock gets a table and the slot's bytes (load_drop when none is left).
read_scenes:
        movel   %d2,%sp@-
        movel   %d3,%sp@-
        movel   %d4,%sp@-
        movel   %d1,%sp@-
        bsr.w   clear_banks             | the masked banks start empty
        movel   %sp@+,%d3               | d3 = the mask
        lea     FMT_WORK,%a0
        lea     scn_path,%a1
        moveq   #0,%d0
        jsr     scn_fpath
        lea     scn_path,%a0
        lea     MODE_R,%a1
        lea     scn_ctx,%a2
        jsr     scn_fopen
        tstl    %d0
        bpl.s   1f
        moveq   #1,%d0
        bra.w   9f
1:      lea     scn_hdr,%a0
        moveq   #16,%d0
        jsr     scn_fread
        subql   #1,%d0
        bne.w   7f
        lea     scn_hdr,%a0
        movel   %a0@,%d0
        cmpil   #FMAGIC,%d0
        bne.w   7f
        moveq   #1,%d0
        cmpl    %a0@(4),%d0
        bne.w   7f
        movel   %a0@(8),%d0
        cmpil   #LIB_B,%d0
        bne.w   7f
        moveq   #0,%d2                  | the slot
        moveq   #0,%d4                  | the running CRC
2:      lea     scn_scratch,%a0
        movel   #4096,%d0
        jsr     scn_fread
        subql   #1,%d0
        bne.s   7f
        lea     scn_scratch,%a0
        movel   #4096,%d0
        movel   %d4,%d1
        jsr     scn_crc32
        movel   %d0,%d4
        movel   %d2,%d0
        lsrl    #2,%d0                  | its bank
        btst    %d0,%d3
        beq.s   5f
        lea     scn_scratch,%a0
        bsr.w   is_empty
        tstl    %d0
        bne.s   5f                      | no lock: the Part keeps no table
        movel   %d2,%d0
        bsr.w   tbl_w
        movel   %a0,%d0
        cmpil   #scn_sink,%d0
        bne.s   3f
        bsr.w   load_drop
        bra.s   5f
3:      lea     scn_scratch,%a1
        movel   #1024,%d0
4:      movel   %a1@+,%a0@+
        subql   #1,%d0
        bne.s   4b
5:      addql   #1,%d2
        cmpil   #64,%d2
        bne.s   2b
        jsr     scn_fclose
        cmpl    scn_hdr+12,%d4
        bne.s   6f
        moveq   #0,%d0
        bra.s   9f
7:      jsr     scn_fclose
6:      addql   #1,scn_cnt_bad
        moveq   #2,%d0
9:      movel   %sp@+,%d4
        movel   %sp@+,%d3
        movel   %sp@+,%d2
        rts

| load_masked: d1 = a bank mask: those banks from scenes.work; empty when it
| has none, empty and never overwritten when it is refused (there is no
| prompt: README.md says how to start over). Clobbers d0-d5, a0-a2.
load_masked:
        movel   %d1,%d4
        bsr.w   read_scenes
        tstl    %d0
        beq.s   9f
        movel   %d0,%d5
        movel   %d4,%d1
        bsr.w   clear_banks
        cmpil   #1,%d5
        bne.s   2f
        movel   scn_cvmask,%d0          | no file: a 2.x project's blobs are read once the banks are in
        orl     %d4,%d0
        movel   %d0,scn_cvmask
        rts
2:      cmpil   #2,%d5
        bne.s   9f
        moveq   #1,%d0
        movel   %d0,scn_nowrite
9:      rts

| scn_convert: d1 = a bank mask. A project saved under MIDISC 2.x keeps each
| Part's locks in a sparse blob inside the Part (Part +0x17a2, the freeze twin
| at +0x1712; the working Part first, then the saved one): 'MS', a count (at
| most 46), then entries of a 16-bit index into the lock table and a value. The
| first blob of a Part that holds up (every index <= 0xfff, every value <= 127)
| fills that Part's table, and that Part copy's design area is then set to what
| stock Part Clear leaves (cv_wipe). Clobbers d0-d7, a0-a2.
scn_convert:
        movel   %d1,%d7
        moveq   #0,%d6                  | bank
cv_bank:
        btst    %d6,%d7
        beq.w   cv_next
        moveq   #0,%d5                  | Part
cv_part:
        movel   %d6,%d0
        movel   #0x9b340,%d1
        mulu.l  %d1,%d0
        addil   #0x400e21e0,%d0
        moveal  %d0,%a0
        movel   #PARTSZ,%d0
        mulu.l  %d5,%d0
        addal   %d0,%a0                 | the Part's offset in its bank
        moveal  %a0,%a1
        addal   #0x8ed80+0x17a2,%a1
        moveq   #0,%d4
        bsr.w   cv_try
        tstl    %d0
        bne.w   cv_done
        moveal  %a0,%a1
        addal   #0x8ed80+0x1712,%a1
        moveq   #1,%d4
        bsr.w   cv_try
        tstl    %d0
        bne.w   cv_done
        moveal  %a0,%a1
        addal   #0x9504a+0x17a2,%a1
        moveq   #0,%d4
        bsr.w   cv_try
        tstl    %d0
        bne.w   cv_done
        moveal  %a0,%a1
        addal   #0x9504a+0x1712,%a1
        moveq   #1,%d4
        bsr.w   cv_try
cv_done:
        addql   #1,%d5
        cmpil   #4,%d5
        bne.w   cv_part
cv_next:
        addql   #1,%d6
        cmpil   #16,%d6
        bne.w   cv_bank
        rts                             | the caller refreshes the battery-RAM copy

| cv_try: a1 = a blob, d4 = 0 (the blob at +0x17a2) or 1 (the freeze twin at
| +0x1712), d6 = bank, d5 = Part -> d0 = 1 when it held up and was
| applied (d0 = 0: not an 'MS' blob, or an entry out of range; nothing applied).
| Reads by byte: the entries sit at odd addresses.
cv_try:
        movel   %a1,cv_base
        mvzb    %a1@,%d0
        cmpil   #0x4d,%d0
        bne.w   cv_no
        mvzb    %a1@(1),%d0
        cmpil   #0x53,%d0
        bne.w   cv_no
        mvzb    %a1@(2),%d2             | the count
        cmpil   #46,%d2
        bhi.w   cv_no
        lea     %a1@(4),%a2
        movel   %d2,%d3
        beq.w   cv_ok
cv_chk: mvzb    %a2@,%d0
        lsll    #8,%d0
        mvzb    %a2@(1),%d1
        orl     %d1,%d0
        cmpil   #0xfff,%d0
        bhi.w   cv_no
        mvzb    %a2@(2),%d0
        cmpil   #127,%d0
        bhi.w   cv_no
        addql   #3,%a2
        subql   #1,%d3
        bne.w   cv_chk
cv_ok:  movel   %a0,%sp@-               | the caller's Part
        movel   %d6,%d0
        lsll    #2,%d0
        addl    %d5,%d0
        bsr.w   tbl_w
        moveal  %a0,%a2                 | the Part's table
        moveal  %sp@+,%a0
        movel   %a2,%d0
        cmpil   #scn_sink,%d0
        bne.s   1f
        addql   #1,scn_cnt_drop         | no table left: the blob stays in the Part, unread
        mov3ql  #1,scn_toast
        bra.w   cv_no
1:      lea     %a1@(4),%a1
        tstl    %d2
        beq.w   cv_yes
cv_ap:  mvzb    %a1@,%d0
        lsll    #8,%d0
        mvzb    %a1@(1),%d1
        orl     %d1,%d0
        mvzb    %a1@(2),%d1
        moveb   %d1,%a2@(0,%d0:l)
        addql   #3,%a1
        subql   #1,%d2
        bne.w   cv_ap
cv_yes: moveq   #1,%d0
        movel   %d0,scn_dirty
        bra.w   cv_wipe
cv_no:  moveq   #0,%d0
        rts

| cv_wipe: d4 as in cv_try, cv_base = the blob's address. Both 144-byte halves
| of that Part copy's design area (+0x1712, +0x17a2) return to what stock Part
| Clear leaves, measured under the port: zeros, the last 16 bytes 0xff.
cv_wipe:
        movel   cv_base,%d0
        tstl    %d4
        bne.s   1f
        subil   #0x90,%d0               | the blob half: the twin half precedes it
1:      moveal  %d0,%a2
        moveq   #0,%d0
        movel   #0x110,%d1
        bsr.w   cv_fill
        moveq   #-1,%d0
        moveq   #16,%d1
        bsr.w   cv_fill
        moveq   #1,%d0
        rts
cv_fill:
        moveb   %d0,%a2@+
        subql   #1,%d1
        bne.s   cv_fill
        rts

| ---- the base's hooks (runtime.json; sdk/machines/octatrack/HOOKS.md) ----
| Every handler runs in the task stock loads and saves projects in, or the
| engine task with the card free (ev_modules_ready), or the task of a Part
| Clear (ev_part_clear): the file calls are made only from the first two.
| C convention: the arguments on the stack, d2-d7/a2-a6 kept, the result in
| d0 (0: these handlers add nothing to a hook whose answers are OR'd).

| hook_call: a1 = the handler, d0 and d1 its arguments. While it runs a load
| may fill tables (scn_loading): the displayed Part gets none it lacks
| (msc_a0), and the tables it gives out are not taken back (scn_fresh).
hook_call:
        lea     %sp@(-44),%sp
        movem.l %d2-%d7/%a2-%a6,%sp@
        mov3ql  #1,scn_loading
        jsr     %a1@
        clrl    scn_loading
        clrl    scn_fresh
        movem.l %sp@,%d2-%d7/%a2-%a6
        lea     %sp@(44),%sp
        moveq   #0,%d0
        rts

scn_ev_banks_load:                      | a project load reads every bank
        lea     st_loadall_pre,%a1
        bra.s   hook_call
scn_ev_banks_loaded:
scn_ev_bank_loaded:
        lea     st_load_post,%a1
        bra.s   hook_call
scn_ev_bank_load:                       | (mask, caller)
        movel   %sp@(4),%d1
        lea     st_loadmask_pre,%a1
        bra.s   hook_call
scn_ev_project_new:
        lea     st_newproj,%a1
        bra.s   hook_call
scn_ev_bank_written:
        lea     st_bankw_post,%a1
        bra.s   hook_call
scn_ev_project_store:
        lea     write_if_dirty,%a1
        bra.s   hook_call
scn_ev_project_stored:
        lea     st_pstore_post,%a1
        bra.s   hook_call
scn_ev_project_reloaded:
        lea     st_preload_post,%a1
        bra.s   hook_call
scn_ev_part_clear:                      | (part)
        movel   %sp@(4),%d0
        lea     st_partclear,%a1
        bra.s   hook_call
scn_ev_modules_ready:
        lea     st_ready,%a1
        bra.s   hook_call

st_loadall_pre:
        bsr.w   scn_ensure
        clrl    scn_dropped
        clrl    scn_nowrite
        clrl    scn_dirty
        movel   #0xffff,%d1
        bra.w   load_masked

st_loadmask_pre:                        | d1 = the mask
        bsr.w   scn_ensure
        bra.w   load_masked

| st_load_post: the banks are in: a 2.x project's blobs are read, the mix is
| due, and battery RAM holds this project's current bank.
st_load_post:
        mov3ql  #1,scn_state+ST_DUE
        movel   scn_cvmask,%d1
        beq.s   1f
        clrl    scn_cvmask
        bsr.w   scn_convert
1:      bsr.w   proj_id
        mvzb    CUR_BANK,%d0
        bra.w   cs1_full

st_newproj:
        bsr.w   scn_ensure
        movel   #0xffff,%d1
        bsr.w   clear_banks             | no Part holds a table
        moveq   #1,%d0
        movel   %d0,scn_ready
        movel   %d0,scn_dirty
        clrl    scn_dropped
        clrl    scn_nowrite
        rts

| st_bankw_post: stock wrote the changed banks (a background save, SAVE TO
| NEW, a new project): scenes.work follows, and battery RAM holds the
| current bank under the project's (perhaps new) name.
st_bankw_post:
        bsr.w   write_if_dirty
        tstl    scn_ready
        beq.s   1f
        bsr.w   proj_id
        mvzb    CUR_BANK,%d0
        bra.w   cs1_full
1:      rts

st_pstore_post:
        tstl    scn_ready
        beq.s   1f
        tstl    scn_nowrite
        bne.s   1f
        lea     FMT_STRD,%a0
        lea     scn_psrc,%a1
        moveq   #0,%d0
        jsr     scn_fpath
        lea     FMT_WORK,%a0
        lea     scn_path,%a1
        moveq   #0,%d0
        jsr     scn_fpath
        clrl    %sp@-
        pea     scn_path
        pea     scn_psrc
        jsr     F_COPY
        lea     %sp@(12),%sp
1:      rts

st_preload_post:
        tstl    scn_ready
        beq.s   1f
        lea     FMT_WORK,%a0
        lea     scn_psrc,%a1
        moveq   #0,%d0
        jsr     scn_fpath
        lea     FMT_STRD,%a0
        lea     scn_path,%a1
        moveq   #0,%d0
        jsr     scn_fpath
        clrl    %sp@-
        pea     scn_path
        pea     scn_psrc
        jsr     F_COPY
        lea     %sp@(12),%sp
        tstl    %d0
        bmi.s   1f
        clrl    scn_dropped
        clrl    scn_nowrite
        clrl    scn_dirty
        movel   #0xffff,%d1
        bsr.w   load_masked
        bsr.w   proj_id
        mvzb    CUR_BANK,%d0
        bra.w   cs1_full
1:      rts

st_partclear:                           | d0 = the part
        bsr.w   scn_ensure
        andil   #3,%d0
        mvzb    CUR_BANK,%d1
        andil   #15,%d1
        lsll    #2,%d1
        addl    %d1,%d0
        bsr.w   slot_free               | the Part's table goes back: no lock
        moveq   #1,%d0
        movel   %d0,scn_dirty
        movel   %d0,scn_state+ST_DUE
        mvzb    CUR_BANK,%d0
        bra.w   cs1_full

| st_ready: the base installed this module (the restore at a power-up, or a
| set over USB) or changed the set beside it. The first time, the project is
| already loaded: every bank from scenes.work (or a 2.x project's blobs),
| then the battery-RAM copy of the current bank, which may hold edits made
| before a power cycle, then a fresh copy.
st_ready:
        tstl    scn_loaded
        bne.s   9f
        moveq   #1,%d0
        movel   %d0,scn_loaded
        bsr.w   proj_id
        bsr.w   st_loadall_pre
        movel   scn_cvmask,%d1
        beq.s   1f
        clrl    scn_cvmask
        bsr.w   scn_convert
1:      bsr.w   cs1_restore
        mov3ql  #1,scn_state+ST_DUE
        mvzb    CUR_BANK,%d0
        bra.w   cs1_full
9:      rts

| ---- files (after octabam's STORE, modules/store/store.s, by Sam Banks, MIT) ----
| The stock file object (24 B) and its 4 KB buffer are scn_ctx. Each call
| clobbers d0, d1, a0, a1 and keeps everything else; a2 = scn_ctx.

| scn_fpath: a0 = format ("%s/name.ext"), a1 = a 260-byte buffer, d0 = 0.
scn_fpath:
        movel   %a2,%sp@-
        movel   %a3,%sp@-
        moveal  %a0,%a2
        moveal  %a1,%a3
        movel   %d0,%sp@-
        clrl    %sp@-
        clrl    %sp@-
        jsr     PROJDIR
        addql   #8,%sp
        movel   %d0,%sp@-
        movel   %a2,%sp@-
        movel   %a3,%sp@-
        jsr     SPRINTF
        lea     %sp@(16),%sp
        movel   %sp@+,%a3
        movel   %sp@+,%a2
        rts

| scn_fopen: a0 = path, a1 = mode, a2 = ctx -> d0 (< 0: failed).
scn_fopen:
        pea     IOB_LEN
        pea     %a2@(24)
        movel   %a1,%sp@-
        movel   %a0,%sp@-
        pea     %a2@
        jsr     F_OPEN
        lea     %sp@(20),%sp
        rts

| scn_fread / scn_fwrite: a0 = buffer, d0 = length, a2 = ctx -> d0 (1: done).
scn_fread:
        movel   %d0,%sp@-
        movel   %a0,%sp@-
        pea     %a2@
        jsr     F_READ
        lea     %sp@(12),%sp
        rts
scn_fwrite:
        movel   %d0,%sp@-
        movel   %a0,%sp@-
        pea     %a2@
        jsr     F_WRITE
        lea     %sp@(12),%sp
        rts

scn_fclose:
        pea     %a2@
        jsr     F_CLOSE
        addql   #4,%sp
        rts

| scn_crc32: a0 = data, d0 = length, d1 = the CRC of what came before (0 to
| start) -> d0 = the CRC-32 (zlib's); the table is built on the first call.
| Keeps d2-d7/a2-a6; clobbers d1, a0.
scn_crc32:
        movel   %d2,%sp@-
        movel   %a2,%sp@-
        movel   %d0,%d2
        movel   %d1,%sp@-
        bsr.s   crc_init
        movel   %sp@+,%d1
        lea     scn_crctab,%a2
        movel   %d1,%d0
        notl    %d0
        tstl    %d2
        beq.s   2f
1:      moveq   #0,%d1
        moveb   %a0@+,%d1
        eorl    %d0,%d1
        andil   #0xff,%d1
        lsrl    #8,%d0
        movel   %a2@(0,%d1:l:4),%d1
        eorl    %d1,%d0
        subql   #1,%d2
        bne.s   1b
2:      notl    %d0
        movel   %sp@+,%a2
        movel   %sp@+,%d2
        rts

crc_init:
        tstl    scn_crcready
        bne.s   9f
        movel   %d2,%sp@-
        movel   %a0,%sp@-
        lea     scn_crctab,%a0
        moveq   #0,%d0
1:      movel   %d0,%d1
        moveq   #7,%d2
2:      lsrl    #1,%d1
        bcc.s   3f
        eoril   #0xedb88320,%d1
3:      subql   #1,%d2
        bpl.s   2b
        movel   %d1,%a0@+
        addql   #1,%d0
        cmpil   #256,%d0
        bne.s   1b
        moveq   #1,%d0
        movel   %d0,scn_crcready
        movel   %sp@+,%a0
        movel   %sp@+,%d2
9:      rts

| ======================================================================= data

        .section .data
        .align  4
scn_state:
        .long   0
        .long   -1
        .long   0
scn_only:       .long   0               | track + 1 while a trig's track is re-mixed alone
scn_sdirty:     .long   0, 0            | per track: a trig has played since the context was reset
scn_spend:      .long   0, 0            | per track: a snapshot is taken, its re-mix not yet run
scn_snap:       .fill   256, 1, 0xff    | per track, 32 B: the lane of the trig that played
scn_pbi:        .long   0xff            | the mix Part: its bank (0xff: none yet) and Part
scn_pp:         .long   0
scn_pnd:        .long   0               | a queued pattern's Part waits for its first step
scn_pnd_t:      .long   0
scn_pnd_b:      .long   0
scn_pnd_p:      .long   0
scn_clip:
        .fill   256, 1, 0xff            | the scene clipboard
scn_ready:      .long   0               | scn_empty is filled
scn_used:       .long   0               | bit n: table n of scn_blk is given out
scn_fresh:      .long   0               | bit n: given out by the running load (blk_take leaves it)
scn_loading:    .long   0               | a project hook is running (hook_call)
scn_edits:      .long   0               | locks changed (msc_edited)
scn_nofit:      .long   -1              | scn_edits when blk_take last found nothing to take back
scn_toast:      .long   0               | a load left locked Parts empty: the toast is due
scn_cnt_full:   .long   0               | a table asked for with none left
scn_cnt_drop:   .long   0               | a load left a locked Part (or a lock) out
scn_dropped:    .long   0               | since the last whole load: a Part was left out (load_drop)
TXT_FULL:       .asciz  "LOCKS: 24 PARTS"
TXT_DROP:       .asciz  "LOCKS NOT LOADED"
        .align  4
scn_dirty:      .long   0               | scenes.work is due
cv_base:        .long   0
scn_cvmask:     .long   0               | banks to read 2.x blobs from once they are loaded
scn_nowrite:    .long   0               | scenes.work was refused: never overwritten
scn_loaded:     .long   0               | st_ready has read the project once since the install
scn_projid:     .long   0               | proj_id: the project directory's FNV-1a
scn_crcready:   .long   0               | scn_crctab is built
scn_busy:       .long   0               | cs1_full is running
scn_again:      .long   0               | another cs1_full was asked for meanwhile
scn_want:       .long   0               | the bank the newest cs1_full wants
scn_cnt_bad:    .long   0               | scenes.work refused
scn_cnt_ioerr:  .long   0               | scenes.work not written
FMT_WORK:       .asciz  "%s/scenes.work"
FMT_STRD:       .asciz  "%s/scenes.strd"
MODE_R:         .asciz  "r"
MODE_W:         .asciz  "w"

        .section .bss
        .align  4
scn_blk:        .space  NBLK*4096       | the Parts' tables, given out by tbl_w
scn_empty:      .space  4096            | the table of every Part without one: 0xff, never written
scn_sink:       .space  4096            | the displayed Part's when no table is left: 0xff again on every call
scn_map:        .space  64              | per slot: its table + 1, 0 = none
scn_owner:      .space  32              | per table: the slot it was given to
scn_scratch:    .space  4096            | read_scenes: each slot as it is read
scn_crctab:     .space  256*4
scn_ctx:        .space  4120            | the stock file object and its buffer
scn_hdr:        .space  16
scn_path:       .space  260
scn_psrc:       .space  260
