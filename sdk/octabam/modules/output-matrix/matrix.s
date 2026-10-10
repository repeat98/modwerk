| OUTPUT MATRIX, ColdFire side. GNU as, ColdFire ISA A+ (m68k-elf-as).
|
| CUE CFG lives in the byte 0x80000037 (0 NORMAL, 1 STUDIO; this module adds
| 2 MATRIX), mirrored to CS1 at 0x100b1497. Every stock reader but the
| AUDIO page tests it nonzero, so MATRIX behaves as STUDIO there.
|
| This file: the AUDIO page's third CUE CFG row and its YES actions (with
| the cue-byte conversion on a mode switch), the project load and the
| power-up CS1 check (pokes in the manifest), CUE + LEVEL as the destination
| chooser and its LEV box, and the level page that carries the bus levels,
| the eight destinations and the declick to the DSP (matrix_mix.asm).
| Tested under the ColdFire port only: see TESTING.md.

        .equ    CUE_CFG,      0x80000037
        .equ    CUE_CFG_CS1,  0x100b1497
        .equ    MENU_REDRAW,  0x4004d948   | (-1): what the stock AUDIO actions call
        .equ    AUDIO_LIST,   0x460e4390   | +0 top, +4 row in view, +8 cursor, +12 rows shown, +16 rows
        .equ    AUDIO_COLUMN, 0x460e438c   | 0 TRACK 8, 1 CUE CFG
        .equ    LIST_INIT,    0x4007ec60   | (list, rows shown, rows)
        .equ    AUDIO_KEYS0,  0x40065430   | the stock key handler, (code)
        .equ    BOX_ON,       0x400b5e90   | the checked box glyph
        .equ    BOX_OFF,      0x400b5e8e

        .text

| ---- project load -------------------------------------------------------
| Replaces 0x4008732a..0x40087337, which clamped the parsed CUE_STUDIO_MODE
| in d0 to 0/1; 0x40087338 stores d0. Returns d0 in 0..2. Only d0 changes.
        .global parse_mode
parse_mode:
        tst.l   %d0
        bge.s   1f
        moveq   #0,%d0
        rts
1:      cmpi.l  #2,%d0
        ble.s   2f
        moveq   #2,%d0
2:      rts

| ---- AUDIO page ----------------------------------------------------------
| The page draws min(rows shown, rows) rows in both columns from these
| tables; a NULL getter draws no box. TRACK 8 gets a blank third row and
| audio_keys keeps its cursor on the first two.
        .global audio_enter
audio_enter:
        pea     3.w
        pea     3.w
        pea     AUDIO_LIST
        jsr     LIST_INIT
        lea     12(%sp),%sp
        rts

        .global audio_keys
audio_keys:
        move.l  4(%sp),-(%sp)
        jsr     AUDIO_KEYS0
        addq.l  #4,%sp
        move.l  %d0,-(%sp)               | keep the stock handler's result
        tst.l   AUDIO_COLUMN
        bne.s   1f
        moveq   #1,%d0
        cmp.l   AUDIO_LIST+8,%d0
        bge.s   1f
        move.l  %d0,AUDIO_LIST+8         | TRACK 8 has two rows: cursor 1
        move.l  %d0,AUDIO_LIST+4
        clr.l   AUDIO_LIST
1:      move.l  (%sp)+,%d0
        rts

| The CUE CFG boxes: checked when the byte equals the row. d0 returns the
| glyph; d1 is free (the stock getters use d0 and d1).
        .global cue_get_normal, cue_get_studio, cue_get_matrix
cue_get_normal:
        moveq   #0,%d1
        bra.s   cue_get
cue_get_studio:
        moveq   #1,%d1
        bra.s   cue_get
cue_get_matrix:
        moveq   #2,%d1
cue_get:
        move.l  %d2,-(%sp)
        mvs.b   CUE_CFG,%d2
        move.l  #BOX_OFF,%d0
        cmp.l   %d1,%d2
        bne.s   1f
        move.l  #BOX_ON,%d0
1:      move.l  (%sp)+,%d2
        rts

| YES on a CUE CFG row. As stock: store, mirror, redraw; and when the
| switch enters or leaves MATRIX, convert every Part's cue bytes so the
| routing means the same thing in the new mode (convert_all).
        .global act_normal, act_studio, act_matrix, act_none
act_normal:
        moveq   #0,%d0
        bra.s   set_mode
act_studio:
        moveq   #1,%d0
        bra.s   set_mode
act_matrix:
        moveq   #2,%d0
set_mode:
        lea     -32(%sp),%sp
        movem.l %d2-%d7/%a2-%a3,(%sp)
        move.l  %d0,%d2                  | the new mode
        mvs.b   CUE_CFG,%d3              | the old one
        cmp.l   %d2,%d3
        beq.s   9f
        moveq   #2,%d1
        cmp.l   %d1,%d2
        beq.s   1f
        cmp.l   %d1,%d3
        bne.s   9f                       | NORMAL <-> STUDIO: nothing to convert
        moveq   #0,%d4                   | out of MATRIX into STUDIO
        tst.l   %d2
        bne.s   2f
        moveq   #3,%d4                   | out of MATRIX into NORMAL
        bsr     cue_mask_from_live
        bra.s   2f
1:      moveq   #1,%d4                   | into MATRIX from STUDIO
        tst.l   %d3
        bne.s   2f
        moveq   #2,%d4                   | into MATRIX from NORMAL
2:      move.l  %d2,-(%sp)
        bsr     convert_all
        move.l  (%sp)+,%d2
9:      move.b  %d2,CUE_CFG
        move.b  %d2,CUE_CFG_CS1
        movem.l (%sp),%d2-%d7/%a2-%a3
        lea     32(%sp),%sp
        pea     -1.w
        jsr     MENU_REDRAW
        addq.l  #4,%sp
act_none:
        rts

| ---- the conversion on a mode switch -------------------------------------
| Every bank is in RAM after a load (docs/firmware/PARTS.md section 1):
| B = 0x400e21e0 + bank * 0x9b340, working Part p at B + 0x8ed80 + p *
| 0x18b2, saved Part p at B + 0x9504a + p * 0x18b2, track t's LEVEL at
| +0x12 + 2t and its cue byte after it. The long at B + 0x9b332 has the bank
| written by the next project save. The current bank's working and saved
| Parts are also in CS1 (what survives a power cycle), at 0x100a4ece and
| 0x100ab196. The working/saved relation is kept: both copies convert, so
| no unsaved bit changes. Each mode keeps what the other can express, no
| level is lost, and a round trip comes back as it was. L is MATRIX's level;
| STUDIO has LEVEL (MAIN) and a cue level; NORMAL has LEVEL, a cue level and
| one project-wide cue bit per track (CUE + TRACK, 0x80000008 bit 16 + t),
| with CUE MUTES TRACK (0x8000009c) taking cued tracks off MAIN. d4:
|   0  MATRIX into STUDIO, 3 into NORMAL: LEVEL = L where the destination
|      has MAIN, or only PHONES (which neither mode can isolate: it stays
|      audible on MAIN), else 0; cue level = L where it has CUE, else 0.
|      OFF gives 0 and 0. Into NORMAL, the current Part's destinations with
|      CUE also set the cue bits (cue_mask_from_live): NORMAL has one set.
|   1  STUDIO into MATRIX: LEVEL and cue -> M+C at LEVEL; LEVEL only -> MAIN;
|      cue only -> CUE at the cue level; neither -> MAIN at 0.
|   2  NORMAL into MATRIX: not cued -> MAIN; cued with a cue level -> M+C
|      at LEVEL, or CUE at the cue level when LEVEL is 0 or CUE MUTES TRACK
|      is on; cued at cue level 0 -> MAIN, or OFF (LEVEL kept) when CUE
|      MUTES TRACK silenced it.
| With MASTER TRACK on, track 8 is the master, which has no cue in NORMAL
| or STUDIO (stock never cues it): out of MATRIX it keeps LEVEL = L (0 for
| OFF) with cue level 0 and is never cued; into MATRIX it becomes MAIN at
| its LEVEL.
        .equ    BANK0,        0x400e21e0
        .equ    BANK_SIZE,    0x9b340
        .equ    PART_SIZE,    0x18b2
        .equ    WORK_LV,      0x8ed92      | working Part 0, T1 LEVEL
        .equ    SAVED_LV,     0x9505c      | saved Part 0, T1 LEVEL
        .equ    BANK_SAVE,    0x9b332
        .equ    CUR_BANK,     0x46c82456   | the current bank's B
        .equ    CS1_WORK_LV,  0x100a4ee0
        .equ    CS1_SAVED_LV, 0x100ab1a8
        .equ    CS1_EDITED,   0x100f8598
        .equ    LIVE_LV,      0x80000c50
        .equ    CUE_MASK,     0x80000008   | bit 16 + t: track t is cued
        .equ    CUE_DESTS,    0x066a       | codes with CUE: 1 3 5 6 9 10
        .equ    LEVEL_DESTS,  0x19dd       | codes kept on MAIN: 0 3 4 6 7 8, and PHONES only 2 11 12
        .equ    CUE_MUTES,    0x8000009c   | CUE MUTES TRACK
        .equ    CUE_MASK_CS1, 0x100b14d4   | 0x80000008's power-cycle copy, as CUE + TRACK writes it
        .equ    D_OFF,        13
        .equ    MASTER_ON,    0x80000034   | MASTER TRACK: track 8 is the master
        .equ    CC_OUT,       0x40033e3c   | (track, cc, value): stock's audio-track CC out, gated on AUDIO CC OUT

| d4 the direction; uses d0-d3, d5-d7, a0-a3. a1 counts the bytes a bank's
| conversion changed: a bank with none is not marked for saving.
convert_all:
        movea.l #BANK0,%a2
        moveq   #16,%d5
1:      suba.l  %a1,%a1
        movea.l %a2,%a0
        adda.l  #WORK_LV,%a0
        bsr.s   conv_parts
        movea.l %a2,%a0
        adda.l  #SAVED_LV,%a0
        bsr.s   conv_parts
        cmpa.l  CUR_BANK,%a2
        bne.s   3f
        movea.l #CS1_WORK_LV,%a0         | the current bank: its CS1 copies too
        bsr.s   conv_parts
        movea.l #CS1_SAVED_LV,%a0
        bsr.s   conv_parts
3:      move.l  %a1,%d0
        tst.l   %d0
        beq.s   2f                       | nothing changed in this bank
        movea.l %a2,%a0
        adda.l  #BANK_SAVE,%a0
        moveq   #1,%d0
        move.l  %d0,(%a0)                | the next project save writes this bank
        cmpa.l  CUR_BANK,%a2
        bne.s   2f
        move.l  %d0,CS1_EDITED
2:      adda.l  #BANK_SIZE,%a2
        subq.l  #1,%d5
        bne.s   1b
        movea.l #LIVE_LV,%a0             | and what plays now
        bsr.s   conv_tracks
        rts

| Four Parts from a0 (T1 LEVEL of the first).
conv_parts:
        movea.l %a0,%a3
        moveq   #4,%d6
1:      movea.l %a3,%a0
        bsr.s   conv_tracks
        adda.l  #PART_SIZE,%a3
        subq.l  #1,%d6
        bne.s   1b
        rts

| Eight (LEVEL, cue) pairs from a0; d4 the direction. Uses d0-d3, d7.
conv_tracks:
        moveq   #0,%d7                   | the track
1:      mvz.b   (%a0),%d1                | LEVEL
        mvz.b   1(%a0),%d0               | the cue byte
        moveq   #7,%d3
        cmp.l   %d3,%d7
        bne.s   15f
        tst.b   MASTER_ON
        beq.s   15f
        cmpi.l  #1,%d4                   | track 8 as the master:
        beq.s   40f                      | into MATRIX, MAIN at its LEVEL
        cmpi.l  #2,%d4
        beq.s   40f
        moveq   #D_OFF,%d3               | out of MATRIX: no cue; OFF stays silent
        cmp.l   %d3,%d0
        bne.s   16f
        moveq   #0,%d1
16:     moveq   #0,%d0
        bra.s   7f
15:     cmpi.l  #1,%d4
        beq.s   20f
        cmpi.l  #2,%d4
        beq.s   30f
        moveq   #DEST_MAX,%d3            | out of MATRIX
        cmp.l   %d3,%d0
        bls.s   10f
        moveq   #0,%d0                   | a cue level, not a code: MAIN
10:     move.l  %d1,%d3                  | L
        move.l  #LEVEL_DESTS,%d2
        btst    %d0,%d2
        bne.s   11f
        moveq   #0,%d1                   | no MAIN side: LEVEL 0
11:     move.l  #CUE_DESTS,%d2
        btst    %d0,%d2
        bne.s   12f
        moveq   #0,%d3                   | no CUE side: cue level 0
12:     move.l  %d3,%d0
        bra.s   7f
20:     tst.l   %d0                      | from STUDIO
        beq.s   40f                      | no cue level: MAIN
        tst.l   %d1
        beq.s   41f                      | cue only: CUE at the cue level
        moveq   #3,%d0                   | both: M+C at LEVEL
        bra.s   7f
30:     btst    %d7,0x80000009           | from NORMAL: cue bit 16 + t
        beq.s   40f                      | not cued: MAIN
        tst.l   %d0
        bne.s   31f
        tst.l   CUE_MUTES                | cued at cue level 0
        beq.s   40f
        moveq   #D_OFF,%d0               | and off MAIN too: silent, LEVEL kept
        bra.s   7f
31:     tst.l   %d1
        beq.s   41f                      | LEVEL 0: CUE only
        tst.l   CUE_MUTES
        bne.s   41f                      | off MAIN: CUE only
        moveq   #3,%d0                   | M+C at LEVEL
        bra.s   7f
40:     moveq   #0,%d0                   | MAIN, LEVEL as it is
        bra.s   7f
41:     move.l  %d0,%d1                  | CUE at the cue level
        moveq   #1,%d0
7:      cmp.b   (%a0),%d1
        beq.s   71f
        move.b  %d1,(%a0)
        addq.l  #1,%a1
71:     cmp.b   1(%a0),%d0
        beq.s   8f
        move.b  %d0,1(%a0)
        addq.l  #1,%a1
8:      addq.l  #2,%a0
        addq.l  #1,%d7
        moveq   #8,%d3
        cmp.l   %d3,%d7
        bne     1b
        rts

| Into NORMAL: the cue bits (0x80000008 bits 16..23 and its CS1 copy) from
| the current Part's destinations, read from the live cue bytes before
| convert_all rewrites them; never track 8 while it is the master. Each
| track whose cue state changes gets CC 51 out, as CUE + TRACK sends it
| (0x4007d63a: value 1 cued, 0 not; CC_OUT checks AUDIO CC OUT itself).
| Uses d0, d1, d5-d7, a0, a1.
cue_mask_from_live:
        moveq   #0,%d5                   | the new cue bits
        moveq   #0,%d7
        movea.l #LIVE_LV+1,%a0
1:      moveq   #7,%d1
        cmp.l   %d1,%d7
        bne.s   3f
        tst.b   MASTER_ON
        bne.s   2f                       | the master is never cued
3:      mvz.b   (%a0),%d0
        moveq   #DEST_MAX,%d1
        cmp.l   %d1,%d0
        bhi.s   2f                       | not a code: not cued
        move.l  #CUE_DESTS,%d1
        btst    %d0,%d1
        beq.s   2f
        moveq   #16,%d6
        add.l   %d7,%d6
        bset    %d6,%d5
2:      addq.l  #2,%a0
        addq.l  #1,%d7
        moveq   #8,%d1
        cmp.l   %d1,%d7
        bne.s   1b
        move.l  CUE_MASK,%d0
        move.l  %d0,%d6                  | the old bits
        andi.l  #0xff00ffff,%d0
        or.l    %d5,%d0
        move.l  %d0,CUE_MASK
        move.l  %d0,CUE_MASK_CS1
        eor.l   %d5,%d6
        andi.l  #0x00ff0000,%d6          | the cue bits that changed
        moveq   #0,%d7
4:      moveq   #16,%d0
        add.l   %d7,%d0
        btst    %d0,%d6
        beq.s   6f
        moveq   #0,%d1
        btst    %d0,%d5
        beq.s   5f
        moveq   #1,%d1                   | now cued
5:      move.l  %d1,-(%sp)               | value
        moveq   #0x33,%d0
        move.l  %d0,-(%sp)               | CC 51
        move.l  %d7,-(%sp)               | track
        jsr     CC_OUT
        lea     12(%sp),%sp
6:      addq.l  #1,%d7
        moveq   #8,%d0
        cmp.l   %d0,%d7
        bne.s   4b
        rts

| ---- CUE + LEVEL (jmp detour, displaced: lea -16(sp),sp; movem.l d2-d5,(sp))
| The stock handler (0x4004e98c, args: encoder, delta) reads the Part's cue
| byte, adds the accelerated delta, clamps to 0..127 and from 0x4004ea10
| writes d3 everywhere the cue level lives: the Part, its CS1 copy, the
| dirty bits, the live byte 0x80000c51+2t, CC 47 out, then redraws. In
| MATRIX the same tail stores a destination code 0..13 instead, stepped as
| stock steps a select with few choices (THRU INAB, the AUDIO page lists):
| 0x4003240c adds 256 per detent (7 times that while the layer's push flag
| for the knob, 0x46c7d8ee + 24 * (0x38 + encoder), is set) to the knob's
| accumulator 0x46c7d244 + 20 * encoder, takes one step per threshold
| crossed and keeps the rest; 0x400326d4 sets the threshold to
| 32768 / max(choices, 40), so any select under 40 choices takes 819, a
| step per 3.2 detents; the display loop (0x400521c0) shrinks every
| accumulator by 1/32 a frame, so slow turns take a little more. This uses
| LEVEL's own accumulator and push flag, but in plain LEVEL's units: plain
| LEVEL (0x4004eb24, 0x4003249c) steps the same accumulator at 256, so a
| step here is 256 too and a detent adds 256 * 256 / 819 = 80. The ratio,
| 3.2 detents a step, is stock's, and what a turn leaves behind stays under
| 256, as plain LEVEL's own does, so a LEVEL turn right after releasing CUE
| moves the level as stock. A byte above 13 (a cue level from NORMAL or
| STUDIO) counts as MAIN.
        .equ    DEST_MAX,     13
        .equ    DIAL_STEP,    256          | plain LEVEL's step on the same accumulator
        .equ    DIAL_ADD,     80           | per detent: 256 / 3.2, 0x400326d4's ratio for few choices
        .equ    LEV_ACC,      0x46c7d2bc   | 0x46c7d244 + 20 * 6
        .equ    LEV_PUSH,     0x46c7debe   | 0x46c7d8ee + 24 * 0x3e
        .global cue_level_enc
cue_level_enc:
        lea     -16(%sp),%sp
        movem.l %d2-%d5,(%sp)
        mvs.b   CUE_CFG,%d0
        cmpi.l  #2,%d0
        beq.s   1f
        jmp     0x4004e994
1:      tst.l   0x80000012               | as stock: no edit while this is set
        beq.s   2f
        jmp     0x4004eb18
2:      move.l  24(%sp),%d0              | the encoder's detents
        tst.l   LEV_PUSH                 | as 0x4003240c: pushed, 7 times
        beq.s   5f
        move.l  %d0,%d1
        lsl.l   #3,%d1
        sub.l   %d0,%d1
        move.l  %d1,%d0
5:      moveq   #DIAL_ADD,%d1
        muls.l  %d1,%d0
        lea     LEV_ACC,%a0
        add.l   (%a0),%d0
        move.l  %d0,%d2
        move.l  #DIAL_STEP,%d1
        divs.l  %d1,%d0                  | whole steps, toward zero, as stock
        move.l  %d0,%d4
        muls.l  %d1,%d4
        sub.l   %d4,%d2
        move.l  %d2,(%a0)                | the rest, same sign, as stock
        tst.l   %d0
        bne.s   7f
        jmp     0x4004eb18               | no step yet: nothing to store
7:      move.l  %d0,%d4
        bsr.s   part_cue                 | d3 = the track's destination
        add.l   %d4,%d3
        bpl.s   3f
        moveq   #0,%d3
3:      moveq   #DEST_MAX,%d1
        cmp.l   %d1,%d3
        ble.s   4f
        move.l  %d1,%d3
4:      jmp     0x4004ea10               | the stock store, CC 47 and redraw

| d3 = the current track's destination code in the current Part, 0..13.
| Uses d0, d1, a0.
part_cue:
        mvz.b   0x100b14cf,%d0           | the Part
        move.l  #3161,%d1
        muls.l  %d1,%d0
        mvz.b   0x100b14cc,%d1           | the track
        add.l   %d1,%d0
        addi.l  #0x476c9,%d0
        movea.l 0x46c82456,%a0
        mvz.b   1(%a0,%d0.l*2),%d3
        moveq   #DEST_MAX,%d1
        cmp.l   %d1,%d3
        bls.s   1f
        moveq   #0,%d3                   | a cue level, not a code: MAIN
1:      rts

| ---- LEV box with CUE held (jmp detour, displaced: pea 0x400b7b98 "CUE")
| MATRIX labels the box with the current track's destination, so holding
| CUE shows it without a turn. Stock draws the label from x 45 (the
| arguments pushed at 0x4004dd6a); a name is centred there as the value is
| while turning: glyphs advance 4 pixels, so a two-letter name starts at
| 47. This path pushes the same six arguments and joins at the jsr. d3 is
| free: stock loads it after the draw.
        .global lev_box_cue
lev_box_cue:
        mvs.b   CUE_CFG,%d0
        cmpi.l  #2,%d0
        beq.s   1f
        pea     0x400b7b98
        jmp     0x4004dd6a
1:      bsr.s   part_cue                 | d3 = the track's destination
        lea     dest_names:l,%a0
        movea.l (%a0,%d3.l*4),%a0
        move.l  %a0,-(%sp)               | the string
        moveq   #-1,%d1
        move.l  %d1,-(%sp)               | the limit, as stock
        moveq   #0x38,%d1
        move.l  %d1,-(%sp)
        moveq   #45,%d0                  | x: three letters, as stock's
        tst.b   2(%a0)
        bne.s   2f
        moveq   #47,%d0                  | two letters, centred
2:      move.l  %d0,-(%sp)
        pea     0x400bf10a               | the surface
        pea     0x400ba876               | the font
        jmp     0x4004dd82               | the stock jsr 0x40012bd8

| ---- its value (jmp detour, displaced: the push of d4, "%d" and the buffer
| and the jsr to sprintf; 0x4004ddc6 goes on to draw it). MATRIX prints the
| destination's name; the same 12 bytes stay pushed for the stock pop.
        .global lev_box_val
lev_box_val:
        mvs.b   CUE_CFG,%d0
        cmpi.l  #2,%d0
        beq.s   1f
        move.l  %d4,-(%sp)
        pea     0x400b465d               | "%d"
        bra.s   2f
1:      moveq   #DEST_MAX,%d0
        cmp.l   %d0,%d4
        bls.s   3f
        moveq   #0,%d4
3:      lea     dest_names:l,%a0
        move.l  (%a0,%d4.l*4),-(%sp)
        pea     str_fmt_s
2:      pea     -8(%fp)
        jsr     0x40013a08
        jmp     0x4004ddc6

| ---- the LEV box bars (jmp detour, displaced: moveq #18,d0; muls.l d2,d0)
| STUDIO draws a level bar from d2 and a cue bar from d4, the cue bar shaded
| (0x40012368) when d5 is set: the master track, which has no cue in
| STUDIO. In MATRIX d4 is a destination code, so both bars show the level,
| solid on every track (the master may go to CUE or PHONES there): the
| path joins stock's solid drawing at 0x4004df9c, past its d5 test. On the
| MAIN display (FUNC held: 0x46c7c730 set and CUE not held, 0x4004dca0)
| stock has cleared d4, and the stock path draws it as STUDIO does.
        .global lev_bars
lev_bars:
        mvs.b   CUE_CFG,%d0
        cmpi.l  #2,%d0
        bne.s   1f
        tst.l   0x460d168c               | CUE held: the destination display
        bne.s   2f
        tst.l   0x46c7c730               | FUNC held: MAIN, as stock
        bne.s   1f
2:      move.l  %d2,%d4
        moveq   #18,%d0                  | as stock to 0x4004df9a
        muls.l  %d2,%d0
        moveq   #18,%d2
        muls.l  %d4,%d2
        jmp     0x4004df9c               | both bars solid
1:      moveq   #18,%d0
        muls.l  %d2,%d0
        jmp     0x4004df92

| ---- level page (jsr detour, displaced: move.b 0x80000032,d3) -----------
| The builder at 0x4000d1a6 fills the page's fixed words from a2 (the page
| core 0 reads at X:$205); the detour sits just after it stores d2, the MAIN
| level sign-extended, as word $29. The level bytes run 0..127, 64 = 0 dB.
|
| In MATRIX, $29 is rewritten as 64, so each track's ramped MAIN gain is its
| own level x XVOL and no bus level, and the module's mixdown applies the bus
| levels after the sum. d2 keeps the real level: one builder branch sends it
| again as $2c. Words the DSP reads only in MATRIX:
|   $37  the MAIN level        $38  the PHONES level (the MIX byte)
|   $39  T1..T4 destinations   $3a  T5..T8 (4 bits each, T1 and T5 highest)
|   $3b  1 in MATRIX, else 0
| CUE stays in $28 as stock sends it. Free here: d0, d1, d4 and a0 (each is
| written before it is read after the return). d3 also carries the codes
| word while building; the replayed load restores only its low byte, which
| is enough because stock follows with extw d3 and a word store, and clears
| d3 before any long use (0x4000d1f0, 0x4000d320).
|
| The declick: the DSP routes by the codes it is sent (sent_codes). When a
| track's destination changes, the first frame keeps the old code and sends
| the track's MAIN gain word (page halfword 4t+1, which 0x40004db8 wrote
| before this point, from 0x4000d0de) as 0, and its split (4t+3, the sample
| the ramp starts at) as 0, so the DSP's gain ramp fades
| the track out on its old outputs; the next frame sends the new code with
| the real gain, and the ramp fades it back in. A destination that returns
| to the sent code before the switch just cancels the fade.
        .equ    PG_MAIN0,     0x52
        .equ    PG_MAIN,      0x6e
        .equ    PG_PHONES,    0x70
        .equ    PG_DEST_LO,   0x72
        .equ    PG_DEST_HI,   0x74
        .equ    PG_MATRIX,    0x76
        .equ    LIVE_CUE,     0x80000c51  | + 2t: the live cue byte, here a destination
        .global page_levels
page_levels:
        mvs.b   CUE_CFG,%d0
        cmpi.l  #2,%d0
        beq.s   1f
        clr.w   PG_MATRIX(%a2)
        bra     9f
1:      move.w  %d2,PG_MAIN(%a2)
        move.w  #64,PG_MAIN0(%a2)        | $29: unity
        mvs.b   0x80000032,%d0
        move.w  %d0,PG_PHONES(%a2)
        lea     -8(%sp),%sp
        movem.l %a1/%a3,(%sp)
        lea     LIVE_CUE,%a0
        lea     sent_codes:l,%a1         | the code the DSP routes by; +8: fading
        lea     2(%a2),%a3               | T1's MAIN gain word on the page
        moveq   #0,%d3                   | the codes word being built, T1 first
        moveq   #0,%d4                   | the track
2:      mvz.b   (%a0),%d0                | the track's destination now
        addq.l  #2,%a0
        moveq   #DEST_MAX,%d1
        cmp.l   %d1,%d0
        bls.s   3f
        moveq   #0,%d0                   | a cue level, not a code: MAIN
3:      mvz.b   (%a1),%d1
        cmp.l   %d0,%d1
        bne.s   4f
        clr.b   8(%a1)                   | unchanged: no fade pending
        bra.s   6f
4:      tst.b   8(%a1)
        bne.s   5f
        move.b  #1,8(%a1)                | first frame: fade out on the old code,
        clr.w   (%a3)                    | gain 0 from sample 0 (the split, 4t+3,
        clr.w   4(%a3)                   | is where the DSP's ramp starts)
        move.l  %d1,%d0
        bra.s   6f
5:      move.b  %d0,(%a1)                | second frame: the new code, at full gain
        clr.b   8(%a1)
6:      lsl.l   #4,%d3
        or.l    %d0,%d3
        addq.l  #1,%a1
        addq.l  #8,%a3
        addq.l  #1,%d4
        moveq   #4,%d1
        cmp.l   %d1,%d4
        bne.s   7f
        move.w  %d3,PG_DEST_LO(%a2)      | T1..T4
        moveq   #0,%d3
7:      moveq   #8,%d1
        cmp.l   %d1,%d4
        bne.s   2b
        move.w  %d3,PG_DEST_HI(%a2)      | T5..T8
        movem.l (%sp),%a1/%a3
        lea     8(%sp),%sp
        move.w  #1,PG_MATRIX(%a2)
9:      move.b  0x80000032,%d3           | the displaced load
        rts

| ---- MIXER: the MIX label (jmp detour, displaced: pea 0x400b7b8c "MIX")
| In MATRIX, MIX is the PHONES level (64 = 0 dB, as MAIN and CUE), so the
| label reads PHN and the slider's ends - and +; its value popup is stock.
        .global mixer_mix_label
mixer_mix_label:
        mvs.b   CUE_CFG,%d0
        cmpi.l  #2,%d0
        beq.s   1f
        pea     0x400b7b8c
        jmp     0x4007c49e
1:      pea     str_phn
        jmp     0x4007c49e

| The slider's ends: M and C as a blend, - and + as a level (jmp detours,
| displaced: move.l #0x400b6040 "M",(sp) and pea 0x400b576f "C").
        .global mixer_mix_left, mixer_mix_right
mixer_mix_left:
        mvs.b   CUE_CFG,%d0
        cmpi.l  #2,%d0
        beq.s   1f
        move.l  #0x400b6040,(%sp)
        jmp     0x4007c510
1:      move.l  #str_minus,(%sp)
        jmp     0x4007c510
mixer_mix_right:
        mvs.b   CUE_CFG,%d0
        cmpi.l  #2,%d0
        beq.s   1f
        pea     0x400b576f
        jmp     0x4007c532
1:      pea     str_plus
        jmp     0x4007c532

| Stock code points at these (manifest SymbolRefs), so they live in .text:
| the runtime's .data moves with what else it links (the browser builder adds
| the logger), and its .text start does not.
        .align  4
        .global t8_labels, t8_getters, t8_actions, cue_labels, cue_getters, cue_actions, str_outcfg
t8_labels:   .long 0x400b44e1, 0x400b5eb0, str_blank    | MASTER, NORMAL, (none)
t8_getters:  .long 0x40065138, 0x40065154, 0
t8_actions:  .long 0x40065554, 0x40065514, act_none
cue_labels:  .long 0x400b5eb0, 0x400b5eb7, str_matrix   | NORMAL, STUDIO, MATRIX
cue_getters: .long cue_get_normal, cue_get_studio, cue_get_matrix
cue_actions: .long act_normal, act_studio, act_matrix
str_outcfg:  .asciz "OUT CFG"              | the box title, stock "CUE CFG"

        .data
| The destination codes, in CUE + LEVEL order. The DSP side reads the same
| numbering (matrix_mix.asm).
dest_names:  .long n_main, n_cue, n_phns, n_mc, n_mp, n_cp, n_all
             .long n_mnl, n_mnr, n_cul, n_cur, n_phl, n_phr, n_off
sent_codes:  .byte 0, 0, 0, 0, 0, 0, 0, 0   | the codes the DSP routes by
fading:      .byte 0, 0, 0, 0, 0, 0, 0, 0   | 1: faded out last frame (sent_codes + 8)
str_blank:   .asciz ""
str_matrix:  .asciz "MATRIX"
str_phn:     .asciz "PHN"
str_minus:   .asciz "-"
str_plus:    .asciz "+"
str_fmt_s:   .asciz "%s"
n_main:      .asciz "MN"
n_cue:       .asciz "CUE"
n_phns:      .asciz "PHN"
n_mc:        .asciz "M+C"
n_mp:        .asciz "M+P"
n_cp:        .asciz "C+P"
n_all:       .asciz "ALL"
n_mnl:       .asciz "MNL"
n_mnr:       .asciz "MNR"
n_cul:       .asciz "CUL"
n_cur:       .asciz "CUR"
n_phl:       .asciz "PHL"
n_phr:       .asciz "PHR"
n_off:       .asciz "OFF"
