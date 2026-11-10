; Mixer Mode M3c (docs/dev/mixer-mode-plan.md), MS-70CDR 2.10 OS. Test builds only.
;
; The asm half of Mixer Mode: fixed entry points, the mixer data, saving
; (the settings ride in the packed patch), the bus-follows-effect hooks, the
; poll and MIDI CC 85-95. The engine, the settings packing and the node knob
; pages (screen 15) are C (the section at 0xC00F8000, chain_vec.asm vectors):
;   engine.c  the bus engine (replaces the stock slot loop, packet 0x1181BE00
;             jumps to +0, chain_jump.S), signal flow as docs/dev/v2.0-brief.md
;   pages.c   IN / [ROUTE] / [MIX] / OUT knob pages, mix_get / mix_put
; Settings (chain.h S_*): 24 bytes, 0-10 the node settings, 11 MAGIC, 12-17
; LAYOUT (the bus of each slot), 18-23 Input R, Master R, Output Mode, Mute A,
; Mute B, Solo. Levels go 0-150, 100 = unity.
;
; Bus of each slot (M3a): LAYOUT[slot], saved with the patch, set on the
; Effect Chain screen (M3b: chain_keys.c, which also moves, adds and deletes
; through the hooks below). It follows the effect when the Effect Chain
; screen moves it (mv_swap), or an effect is added (mv_add) or deleted
; (mv_delete): each wraps the stock function at its only call site and moves
; the buses just before stock moves the effects (docs/dev/mixer-mode-m3-research.md,
; "M3a hooks").
;
; Saving (pages.c mix_get / mix_put): the bus of each slot and settings
; 18-23 ride in byte 17 of the six 18-byte slot blocks of the packed 122-byte
; patch (free: bytes 0-16 are the effect's; bits 0-1 the bus, bits 2-6 the next 5
; of the 22 bits of 18-23, bit 6 of block 6 marks this layout, bit 7 always 0: a
; SysEx round trip moves it), settings 0-10 in a table at the
; end of the global record 50 (R50, grown to 824 bytes, an entry per patch;
; then the Perform table, asm/perform/perform_store.c).
; LIVE holds the 24 bytes of the patch being played, SAVED the ones stored in
; flash (IS_DIRTY compares them, as stock compares the patch with its saved
; copy at 0xC009C07C).
;   - unpack_live (patch load into 0xC009BF58) / unpack_saved (the saved
;     copy, 0xC009C07C): stock unpack, take the settings. A patch saved by
;     M3b5 / M3b6 (settings in bytes 14, 15, the top of P8) is read once more
;     and its P8 masked back to 12 bits.
;   - rec_save (every patch record save, 0xC00B84C0): when the buffer is the
;     live-save one (0xC009C2A8, the live patch packed by 0xC00B84D0), put
;     LIVE in and SAVED = LIVE; record 50 too when the patch's entry changed.
;     Other saves (copies, editor store, factory reset) are packed records
;     that carry their own byte 17. A patch load that auto saves the patch it
;     leaves (0xC00B89F4, after the unpack) gets PREV, the settings LIVE had
;     before the unpack; unpack_live sets that save up for mixer-only edits too.
;   - pack_dump (the patch sent to an editor): stock pack, put LIVE in.
;   - dirty (IS_DIRTY): stock, or LIVE differs from SAVED.
;   - record 50 load / save (pages.c r50_load / r50_save): stock's 24 bytes
;     are the first 24 of R50.
; A patch without settings (stock, v1.x, factory) loads the defaults: Serial,
; every slot PRE.

        .equ    BASE, 0xC00F6000
        .equ    MASTER, BASE + 72           ; Master, smoothed (float, engine.c)
        .equ    PEND, BASE + 76             ; 1: the load's auto save gets PREV
        .equ    LIMHIT, BASE + 77           ; 1: the limiter cut the gain (poll clears)
        .equ    SHOWN, BASE + 78            ; LIMIT tag as last drawn
        .equ    HOLD, BASE + 80             ; polls left to show LIMIT
        .equ    PAGE, BASE + 128            ; MIXER screen page (pages.c PG_*)
        .equ    PG_OUT, 6
        .equ    UI, BASE + 136              ; [8] Effect Chain UI state (chain.h)
        .equ    GAINS, BASE + 144           ; [8 floats] engine.c
        .equ    PEDAL, BASE + 176           ; PEDAL INPUT: 1 = STEREO (pedal_in.c)
        .equ    MENUSCR, BASE + 184         ; [7] the screen of each menu entry (menu_enter.S)
        .equ    MENU7, BASE + 196           ; menu entry names (menu_draw.S)
        .equ    LIVE, BASE + 224            ; [24] settings of the patch played (chain.h)
        .equ    LAYOUT, LIVE + 12           ; [6] the bus of each slot (settings 12-17)
        .equ    SAVED, BASE + 248           ; [24] ... as saved in flash
        .equ    PREV, BASE + 272            ; [24] LIVE before a patch load
        .equ    MAXES, BASE + 296           ; [24] maximum of each setting
        .equ    DEFAULTS, BASE + 320        ; [24]
        .equ    NSET, 24
        .equ    R50, 0xC0116000             ; [11228] record 50 (chain.h)
        .equ    CUR_PATCH, 324              ; B14 offset: the patch played

        .equ    C_SEC, 0xC00F8000           ; chain_vec.asm vectors
        .equ    C_POLL, C_SEC + 16          ; chain_poll
        .equ    C_ENGINE, C_SEC + 64        ; engine_run
        .equ    C_GET, C_SEC + 72           ; mix_get (packed, settings)
        .equ    C_PUT, C_SEC + 80           ; mix_put (packed, settings)
        .equ    C_KEYS, C_SEC + 88          ; screen 15 keys (pages_key)
        .equ    C_DRAW, C_SEC + 96          ; screen 15 draw (pages_draw_h)

        .equ    AFTER_LOOP, 0x1181BE48      ; stock: callp 0x1181B090 (post mix)
        .equ    SLOT_VAR, 576               ; B14 offset: slot being run
        .equ    PRE, 0
        .equ    BUS_A, 1

        .equ    UNPACK_WRAP, 0xC00B8294     ; (RAM patch, packed)
        .equ    PACK_WRAP, 0xC00B8474       ; (packed, RAM patch)
        .equ    IS_DIRTY, 0xC00B8534        ; -> 1 = patch differs from saved
        .equ    REC_SAVE, 0xC00B49F4        ; (record, buffer)
        .equ    SAVE_BUF, 0xC009C2A8        ; live patch, packed for saving
        .equ    LIVE_PATCH, 0xC009BF58      ; the patch played, unpacked
        .equ    MEMCPY, 0xC00E09C0          ; (dst, src, n)
        .equ    FX_SWAP, 0xC00B6BC4         ; (row, row) Effect Chain move
        .equ    FX_ADD, 0xC00C22F4          ; (effect id) insert at ANCHOR + SIDE
        .equ    FX_DELETE, 0xC00C2030       ; delete the slot under the cursor
        .equ    COUNT, 0xC009C068           ; number of effects in the patch
        .equ    VIEW, 0xC009D8F8            ; play-mode view (word)
        .equ    CURSOR, 0xC009C064          ; play-mode cursor (signed byte)
        .equ    CURSOR_SLOTS, 0xC00EE748    ; [view][6] slot under each cursor position
        .equ    ANCHOR, 128                 ; B14 offsets: the slot an add goes next to,
        .equ    SIDE, 132                   ; 1: on its left (slot + 1)
        .equ    UI_CUR, 0
        .equ    UI_ADDBUS, 4
        .equ    STEP, 0xC00F2020            ; midi_cc step.S: CC 80/81, then stock
        .equ    UI_REFRESH, 0xC00ACD84
        .equ    POLL, 0x1181E800            ; midi_clock poll.S (L2)
        .equ    LP_POLL, 0xC00F2200         ; looper.S poll_pre (it calls poll.S), when looper.yaml is in
        .equ    LP_MAGIC, 0x5A4C5301        ; at 0xC00F3000, its services block (block.S)
        .equ    MODE, 320                   ; B14 offsets: 11 = menu
        .equ    SCREEN, 352                 ; 15 = MIXER
        .equ    HOLD_POLLS, 30              ; LIMIT stays about 0.5 s
        .equ    EVENT_POST, 0xC00CBF40
        .equ    UI_EVENT_OFS, 656           ; B14 offset
        .equ    CC_FIRST, 85                ; CC 85-101

        .equ    S_MODE, 0                   ; setting bytes (chain.h)
        .equ    S_SEND, 1
        .equ    S_IN, 2
        .equ    S_RA, 3
        .equ    S_RB, 4
        .equ    S_XF, 5
        .equ    S_MASTER, 6
        .equ    S_CURVE, 7
        .equ    S_MA, 8
        .equ    S_MB, 9
        .equ    S_PHASE, 10
        .equ    S_INR, 18
        .equ    S_MR, 19
        .equ    S_OUT, 20
        .equ    S_MUTEA, 21
        .equ    S_MUTEB, 22
        .equ    S_SOLO, 23
        .equ    MAGIC, 0x4D                 ; byte 11: settings are present
        .equ    NONE, 255

        .equ    F_ONE, 0x3F800000

        .text
        .nocmp
; +0: entry points at fixed offsets (the patch file names them by address)
vectors:
        b       .S2     engine              ; +0  from 0x1181BE00
        nop     5
        b       .S2     unpack_live         ; +8  callp at 0xC00B8964
        nop     5
        b       .S2     unpack_saved        ; +16 callp at 0xC00AE2EC
        nop     5
        b       .S2     pack_dump           ; +24 callp at 0xC00AE680
        nop     5
        b       .S2     dirty               ; +32 callp at 4 IS_DIRTY sites
        nop     5
        b       .S2     rec_save            ; +40 jump from 0xC00B84C0
        nop     5
        b       .S2     keys_e              ; +48 screen 15 key table
        nop     5
        b       .S2     draw_e              ; +56 screen 15 draw table
        nop     5
        b       .S2     cc                  ; +64 midi_cc handler.S: CCs not 14-73
        nop     5
        .word   0, 0, 0                     ; +72 MASTER, PEND / LIMHIT / SHOWN, HOLD
        .word   0, 0, 0
        b       .S2     mv_swap             ; +96  callp at 0xC00B76A4 (FX_SWAP)
        nop     5
        b       .S2     mv_add              ; +104 callp at 0xC00A7BE0 (FX_ADD)
        nop     5
        b       .S2     mv_delete           ; +112 callp at 0xC00A8294 (FX_DELETE)
        nop     5
        b       .S2     poll                ; +120 jump from midi-clock's poll trampoline
        nop     5


; +128: data at fixed offsets (the .equ above), never executed
        .word   0, 0                        ; +128 PAGE
        .byte   0, 0, BUS_A, 0, NONE, 0, 0, PG_OUT ; +136 UI (chain.h): CUR SEL BUSROW DELP ADDBUS FROMCHAIN PFIRST PLAST
        .word   0, 0, 0, 0, 0, F_ONE, 0, 0  ; +144 GAINS: In, SendA, SendB, cA, cB, limiter, InR, MasterR
        .byte   0, 0, 0, 0, 0, 0, 0, 0  ; +176 PEDAL, +177 IDLE, +178 IDLE_SHOWN (chain.h), then free to +184
        ; +184 MENUSCR: entries 0-1 stock, 2 PERFORM MODE (screen 11), 3 MASTER (11), 4 SETTINGS (1),
        ; 5 the version entry (9), 6 KALEIDO (11); [7] the entry last opened (menu_enter.S).
        ; MIDI SETTINGS is the last SETTINGS row (pedal_in.c).
        .byte   0, 0, 11, 11, 1, 9, 11, 0
        .word   0                           ; +192 free
        ; +196 MENU7: the stock menu entries with PERFORM MODE and MASTER after EFFECT CHAIN,
        ; KALEIDO last (all 7 used)
        .word   0xC00E8FE4, 0xC00E8FF7, s_perform, s_master, 0xC00E9004, 0xC00E900D, s_kaleido
        .byte   0, 50, 100, 100, 100, 50, 100, 1, 100, 100, 0, MAGIC ; +224 LIVE
        .byte   PRE, PRE, PRE, PRE, PRE, PRE, 100, 100, 0, 0, 0, 0
        .byte   0, 50, 100, 100, 100, 50, 100, 1, 100, 100, 0, MAGIC ; +248 SAVED
        .byte   PRE, PRE, PRE, PRE, PRE, PRE, 100, 100, 0, 0, 0, 0
        .byte   0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 ; +272 PREV
        .byte   0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
        .byte   3, 100, 150, 150, 150, 100, 150, 2, 150, 150, 1, 255 ; +296 MAXES
        .byte   3, 3, 3, 3, 3, 3, 150, 150, 2, 1, 1, 2
        .byte   0, 50, 100, 100, 100, 50, 100, 1, 100, 100, 0, MAGIC ; +320 DEFAULTS
        .byte   PRE, PRE, PRE, PRE, PRE, PRE, 100, 100, 0, 0, 0, 0

; ---------------------------------------------------------------- engine

; engine.c: the block's register save (0xC00E14C0) ran before this, so the C
; ABI's caller-saved registers are free, as for the effects it calls.
engine:
        mvkl    .S2     C_ENGINE, b0
        mvkh    .S2     C_ENGINE, b0
        b       .S2     b0
        addkpc  .S2     e_out, b3, 4
e_out:
        mvk     .L2     6, b0
        stw     .D2T2   b0, *+b14(SLOT_VAR) ; as the stock loop leaves it
        mvkl    .S2     AFTER_LOOP, b0
        mvkh    .S2     AFTER_LOOP, b0
        b       .S2     b0
        nop     5

; ---------------------------------------------------------------- saving

; Patch load into the live patch (A4 = 0xC009BF58) or into its saved copy
; (A4 = 0xC009C07C); B4 = packed record. B3 = return into the OS.
; unpack_live runs in the load routine (0xC00B88E4): A11 = the patch it leaves
; (-1: none), B11 = 1 when its stock IS_DIRTY (0xC00B892C, not hookable) found
; edits, the live patch already copied to its B15+4 for the save at 0xC00B89F4.
; Mixer-only edits get that same copy and save, like any stock edit.
unpack_live:
        mvk     .L1     -1, a0
        cmpeq   .L1     a11, a0, a1
  [!a1] mv      .L1X    b11, a1
  [a1]  b       .S1     ul_go               ; no patch left, or stock saves it
        nop     5
        addk    .S2     -16, b15
        stw     .D2T2   b3, *+b15(4)
        stw     .D2T1   a4, *+b15(8)
        stw     .D2T2   b4, *+b15(12)
        callp   .S2     dirty, b3           ; here only the settings or buses can differ
        mv      .L1     a4, a1
  [!a1] b       .S1     ul_pop
        nop     5
        mv      .L1X    b15, a4
        addk    .S1     20, a4              ; the load routine's B15+4
        mvkl    .S2     LIVE_PATCH, b4
        mvkh    .S2     LIVE_PATCH, b4
        mvk     .S1     0x124, a6
        mvkl    .S2     MEMCPY, b5
        mvkh    .S2     MEMCPY, b5
        b       .S2     b5
        addkpc  .S2     ul_set, b3, 4
ul_set:
        mvk     .L2     1, b11
ul_pop:
        ldw     .D2T2   *+b15(4), b3
        ldw     .D2T1   *+b15(8), a4
        ldw     .D2T2   *+b15(12), b4
        nop     4
        addk    .S2     16, b15
ul_go:
        mvk     .L1     0, a0
        b       .S1     unpack_hook
        nop     5
unpack_saved:
        mvk     .L1     1, a0
unpack_hook:
        addk    .S2     -24, b15
        stw     .D2T2   b3, *+b15(4)
        stw     .D2T1   a10, *+b15(8)
        stw     .D2T1   a11, *+b15(12)
        stw     .D2T1   a12, *+b15(16)
        mv      .L1     a4, a10             ; RAM patch
        mv      .L1X    b4, a11             ; packed
        mv      .L1     a0, a12             ; 1 = saved copy
        mvkl    .S2     UNPACK_WRAP, b5
        mvkh    .S2     UNPACK_WRAP, b5
        b       .S2     b5
        addkpc  .S2     uh_bytes, b3, 4
uh_bytes:
        mv      .L2     b11, b1             ; the load routine's B11: it will auto
        mv      .L1     a12, a1             ; save the patch it leaves after this
  [a1]  mvk     .L2     0, b1
  [!b1] b       .S1     uh_get
        nop     5
        mvkl    .S1     LIVE, a4            ; that save gets the settings it had
        mvkh    .S1     LIVE, a4
        mvkl    .S2     PREV, b4
        mvkh    .S2     PREV, b4
        callp   .S2     copy24, b3
        mvkl    .S1     PEND, a0
        mvkh    .S1     PEND, a0
        mvk     .L1     1, a1
        stb     .D1T1   a1, *a0
uh_get:
        ldw     .D2T1   *+b14(CUR_PATCH), a6 ; the saved copy's record
        mv      .L1     a11, a4
        mvkl    .S2     SAVED, b4
        mvkh    .S2     SAVED, b4
        mvkl    .S2     LIVE, b5
        mvkh    .S2     LIVE, b5
        mv      .L1     a12, a1
  [!a1] mv      .L2     b5, b4
  [!a1] mv      .L1     a13, a6             ; the load routine's patch number
        callp   .S2     get_bytes, b3
        stw     .D2T1   a4, *+b15(20)       ; 1: an M3b5 / M3b6 patch
        mv      .L1     a12, a1
  [a1]  b       .S1     uh_mask
        nop     5
        mvkl    .S1     LIVE, a4            ; a loaded patch is as saved
        mvkh    .S1     LIVE, a4
        mvkl    .S2     SAVED, b4
        mvkh    .S2     SAVED, b4
        callp   .S2     copy24, b3
uh_mask:
        ldw     .D2T1   *+b15(20), a1
        nop     4
  [!a1] b       .S1     uh_ret
        nop     5
        mv      .L1     a10, a4
        callp   .S2     mask_p8, b3
uh_ret:
        ldw     .D2T2   *+b15(4), b3
        ldw     .D2T1   *+b15(8), a10
        ldw     .D2T1   *+b15(12), a11
        ldw     .D2T1   *+b15(16), a12
        nop     4
        addk    .S2     24, b15
        b       .S2     b3
        nop     5

; The patch sent to an editor: A4 = packed (0xC009C2A8), B4 = live patch.
pack_dump:
        addk    .S2     -16, b15
        stw     .D2T2   b3, *+b15(4)
        stw     .D2T1   a10, *+b15(8)
        mv      .L1     a4, a10
        mvkl    .S2     PACK_WRAP, b5
        mvkh    .S2     PACK_WRAP, b5
        b       .S2     b5
        addkpc  .S2     pd_bytes, b3, 4
pd_bytes:
        mv      .L1     a10, a4
        mvk     .L1     -1, a6              ; no record: byte 17 only
        mvkl    .S2     LIVE, b4
        mvkh    .S2     LIVE, b4
        callp   .S2     put_bytes, b3
        ldw     .D2T2   *+b15(4), b3
        ldw     .D2T1   *+b15(8), a10
        nop     4
        addk    .S2     16, b15
        b       .S2     b3
        nop     5

; Every patch record save: A4 = record, B4 = packed record, B3 = return into
; the OS (the stock 0xC00B84C0, which this replaces, returns 0).
rec_save:
        addk    .S2     -24, b15
        stw     .D2T2   b3, *+b15(4)
        stw     .D2T1   a4, *+b15(8)
        stw     .D2T2   b4, *+b15(12)
        mvk     .L1     0, a0
        stw     .D2T1   a0, *+b15(20)       ; 1: R50 changed, save record 50
        mvkl    .S2     SAVE_BUF, b0
        mvkh    .S2     SAVE_BUF, b0
        cmpeq   .L2     b4, b0, b0
  [!b0] b       .S1     rs_stock            ; a packed copy: its own bytes
        nop     5
        mv      .L1X    b4, a4
        mvkl    .S1     PEND, a6
        mvkh    .S1     PEND, a6
        ldbu    .D1T2   *a6, b1             ; 1: a patch load saving the patch it left
        mvk     .L1     0, a7
        stb     .D1T1   a7, *a6
        mvkl    .S2     LIVE, b4
        mvkh    .S2     LIVE, b4
        nop     1
  [b1]  mvkl    .S2     PREV, b4
  [b1]  mvkh    .S2     PREV, b4
        stw     .D2T2   b1, *+b15(16)
        ldw     .D2T1   *+b15(8), a6        ; the record: its R50 entry
        nop     4
        callp   .S2     put_bytes, b3       ; C: B1 not kept
        stw     .D2T1   a4, *+b15(20)
        ldw     .D2T2   *+b15(16), b1
        nop     4
  [b1]  b       .S1     rs_stock            ; SAVED already holds the new patch's
        nop     5
        mvkl    .S1     LIVE, a4
        mvkh    .S1     LIVE, a4
        mvkl    .S2     SAVED, b4
        mvkh    .S2     SAVED, b4
        callp   .S2     copy24, b3          ; saved = live
rs_stock:
        ldw     .D2T1   *+b15(8), a4
        ldw     .D2T2   *+b15(12), b4
        nop     4
        mvkl    .S2     REC_SAVE, b5
        mvkh    .S2     REC_SAVE, b5
        b       .S2     b5
        addkpc  .S2     rs_done, b3, 4
rs_done:
        ldw     .D2T1   *+b15(20), a1
        nop     4
  [!a1] b       .S1     rs_ret
        nop     5
        mvk     .S1     50, a4              ; after the patch: a power cut in between
        mvkl    .S2     R50, b4             ; loses the new settings, not the patch
        mvkh    .S2     R50, b4
        mvkl    .S2     REC_SAVE, b5
        mvkh    .S2     REC_SAVE, b5
        b       .S2     b5
        addkpc  .S2     rs_ret, b3, 4
rs_ret:
        ldw     .D2T2   *+b15(4), b3
        nop     4
        addk    .S2     24, b15
        mvk     .L1     0, a4
        b       .S2     b3
        nop     5

; IS_DIRTY, or the settings or buses differ from the saved ones. B3 = return.
dirty:
        addk    .S2     -16, b15
        stw     .D2T2   b3, *+b15(4)
        mvkl    .S2     IS_DIRTY, b5
        mvkh    .S2     IS_DIRTY, b5
        b       .S2     b5
        addkpc  .S2     dt_cmp, b3, 4
dt_cmp:
        ldw     .D2T2   *+b15(4), b3
        mvkl    .S1     LIVE, a5
        mvkh    .S1     LIVE, a5
        mvkl    .S1     SAVED, a6
        mvkh    .S1     SAVED, a6
        mvk     .S1     NSET, a1
dt_loop:
        ldbu    .D1T1   *a5++, a2
        ldbu    .D1T1   *a6++, a3
        nop     4
        cmpeq   .L1     a2, a3, a0
  [!a0] mvk     .L1     1, a4
        sub     .L1     a1, 1, a1
  [a1]  b       .S1     dt_loop
        nop     5
        addk    .S2     16, b15
        b       .S2     b3
        nop     5

; pages.c mix_get (A4 = packed, B4 = 24 settings, A6 = record; returns 1 for
; an M3b5 / M3b6 patch) and mix_put (A4 = packed, B4 = settings, A6 = record;
; returns 1 when R50 changed): tail calls, B3 = return.
; C: they use any caller-saved register (A0-A9, B0-B9).
get_bytes:
        mvkl    .S2     C_GET, b5
        mvkh    .S2     C_GET, b5
        b       .S2     b5
        nop     5
put_bytes:
        mvkl    .S2     C_PUT, b5
        mvkh    .S2     C_PUT, b5
        b       .S2     b5
        nop     5

; 24 settings from A4 to B4. Uses A1, A2, A5.
copy24:
        mv      .L1X    b4, a5
        mvk     .S1     NSET, a1
c24_loop:
        ldbu    .D1T1   *a4++, a2
        nop     4
        stb     .D1T1   a2, *a5++
        sub     .L1     a1, 1, a1
  [a1]  b       .S1     c24_loop
        nop     5
        b       .S2     b3
        nop     5


; P8 (word 9 of each 44-byte slot of the RAM patch at A4) back to 12 bits:
; the stock unpack read the setting bytes into its top bits. Uses A1, A2.
mask_p8:
        addk    .S1     36, a4
        mvk     .L1     6, a1
mp_loop:
        ldw     .D1T1   *a4, a2
        nop     4
        extu    .S1     a2, 20, 20, a2
        stw     .D1T1   a2, *a4
        addk    .S1     44, a4
        sub     .L1     a1, 1, a1
  [a1]  b       .S1     mp_loop
        nop     5
        b       .S2     b3
        nop     5

; ---------------------------------------------------------------- bus follows the effect

; Each wraps a stock function at its only call site (arguments in A4 / B4,
; B3 = return, all three untouched): it moves LAYOUT as stock is about to
; move the effects, then jumps to stock. Before stock, not after: stock
; mutes the slots within microseconds of its start (fade, then the slot
; mutes), while after it come the slow parts with the slots playing again
; (the swap's delay memory copy, the add / delete type change). Edited mark:
; stock's own (the records move), and LAYOUT now differs from SAVED's buses.
; Uses A0-A8, B5-B8.

; Effect Chain move (0xC00B76A4, lifted effect turned): the effects at rows
; A4 and B4 trade places (slot = count - 1 - row, 0xC00B6BAC). Both bytes in
; one execute packet: the audio never runs half a swap.
mv_swap:
        mvkl    .S1     COUNT, a0
        mvkh    .S1     COUNT, a0
        ldw     .D1T1   *a0, a0
        nop     4
        sub     .L1     a0, 1, a0
        sub     .L1     a0, a4, a5          ; slot A
        sub     .L1X    a0, b4, a6          ; slot B
        cmpgtu  .L1     6, a5, a1
        cmpgtu  .L1     6, a6, a2
        and     .L1     a1, a2, a1
  [!a1] b       .S1     ms_stock
        nop     5
        mvkl    .S1     LAYOUT, a3
        mvkh    .S1     LAYOUT, a3
        ldbu    .D1T1   *+a3[a5], a7
        ldbu    .D1T1   *+a3[a6], a8
        mv      .L2X    a3, b6
        mv      .L2X    a6, b7
        nop     2
        mv      .L2X    a7, b8
        stb     .D1T1   a8, *+a3[a5]
||      stb     .D2T2   b8, *+b6[b7]
ms_stock:
        mvkl    .S2     FX_SWAP, b5
        mvkh    .S2     FX_SWAP, b5
        b       .S2     b5
        nop     5

; Effect add (0xC00A7BE0, screen 33 ENTER, A4 = effect id): stock inserts at
; slot ANCHOR + SIDE and moves the slots from there up one (the last is
; always empty: add needs fewer than six). The new effect gets the anchor's
; bus, or UI_ADDBUS when the Effect Chain screen asked for one (then the
; chain cursor goes on it).
mv_add:
        ldw     .D2T1   *+b14(ANCHOR), a5
        ldw     .D2T1   *+b14(SIDE), a6
        nop     4
        add     .L1     a5, a6, a6          ; the new effect's slot
        cmpgtu  .L1     6, a5, a1
        cmpgtu  .L1     6, a6, a2
        and     .L1     a1, a2, a1
  [!a1] b       .S1     ma_stock
        nop     5
        mvkl    .S1     LAYOUT, a3
        mvkh    .S1     LAYOUT, a3
        ldbu    .D1T1   *+a3[a5], a7        ; the anchor's bus
        mvkl    .S2     UI, b6
        mvkh    .S2     UI, b6
        ldbu    .D2T2   *+b6(UI_ADDBUS), b7
        nop     4
        cmpgtu  .L2     4, b7, b0           ; an add from the Effect Chain screen:
  [b0]  mv      .L1X    b7, a7              ; the bus it asked for, the cursor on it
  [b0]  mv      .L2X    a6, b8
  [b0]  stb     .D2T2   b8, *+b6(UI_CUR)
        mvk     .S2     NONE, b8
  [b0]  stb     .D2T2   b8, *+b6(UI_ADDBUS)
        add     .L1     5, a3, a8           ; from the last slot down
        mvk     .L1     5, a0
        sub     .L1     a0, a6, a1          ; slots to move up
ma_loop:
  [!a1] b       .S1     ma_new
        nop     5
        ldbu    .D1T1   *-a8(1), a0
        nop     4
        stb     .D1T1   a0, *a8--
        sub     .L1     a1, 1, a1
        b       .S1     ma_loop
        nop     5
ma_new:
        stb     .D1T1   a7, *+a3[a6]
ma_stock:
        mvkl    .S2     FX_ADD, b5
        mvkh    .S2     FX_ADD, b5
        b       .S2     b5
        nop     5

; Effect delete (0xC00A8294, screen 2 YES): stock deletes the slot under the
; cursor (its own lookup at 0xC00C2098: CURSOR_SLOTS[6 x VIEW + CURSOR]) and
; moves the slots above it down one; the last slot gets PRE. With one effect
; stock only empties it (the shift moves the empty slots' buses).
mv_delete:
        mvkl    .S1     VIEW, a0
        mvkh    .S1     VIEW, a0
        ldw     .D1T1   *a0, a0
        mvkl    .S1     CURSOR, a1
        mvkh    .S1     CURSOR, a1
        ldb     .D1T1   *a1, a1
        nop     4
        mvk     .S1     6, a2
        mpy     .M1     a0, a2, a0
        nop     1
        add     .L1     a0, a1, a0
        mvkl    .S1     CURSOR_SLOTS, a2
        mvkh    .S1     CURSOR_SLOTS, a2
        ldw     .D1T1   *+a2[a0], a5        ; the slot deleted
        nop     4
        cmpgtu  .L1     6, a5, a1
  [!a1] b       .S1     md_stock
        nop     5
        mvkl    .S1     LAYOUT, a3
        mvkh    .S1     LAYOUT, a3
        add     .L1     a3, a5, a8
        mvk     .L1     5, a0
        sub     .L1     a0, a5, a1          ; slots to move down
md_loop:
  [!a1] b       .S1     md_last
        nop     5
        ldbu    .D1T1   *+a8(1), a0
        nop     4
        stb     .D1T1   a0, *a8++
        sub     .L1     a1, 1, a1
        b       .S1     md_loop
        nop     5
md_last:
        mvk     .L1     PRE, a0
        stb     .D1T1   a0, *+a3(5)
md_stock:
        mvkl    .S2     FX_DELETE, b5
        mvkh    .S2     FX_DELETE, b5
        b       .S2     b5
        nop     5

; ---------------------------------------------------------------- MIXER screen

; Screen 15 (the node knob pages): pages.c through the C vectors, which take
; the event pair from the dispatcher's frame.
keys_e:
        mvkl    .S2     C_KEYS, b0
        mvkh    .S2     C_KEYS, b0
        b       .S2     b0
        nop     5
draw_e:
        mvkl    .S2     C_DRAW, b0
        mvkh    .S2     C_DRAW, b0
        b       .S2     b0
        nop     5

; Every 16 ms round of Task_SwitchNrmlSpdRead, before midi_clock's poll (B3
; returns into the task). LIMHIT -> HOLD; a redraw when the LIMIT tag the OUT
; page shows is out of date; then chain_poll (C: any caller-saved register).
poll:
        addk    .S2     -16, b15
        stw     .D2T2   b3, *+b15(4)
        mvkl    .S1     LIMHIT, a0
        mvkh    .S1     LIMHIT, a0
        ldbu    .D1T1   *a0, a1
        ldbu    .D1T1   *+a0(1), a6         ; SHOWN
        mvkl    .S1     HOLD, a5
        mvkh    .S1     HOLD, a5
        ldw     .D1T1   *a5, a2
        mvk     .L1     0, a4
        stb     .D1T1   a4, *a0
        nop     2
  [a2]  sub     .L1     a2, 1, a2
  [a1]  mvk     .S1     HOLD_POLLS, a2
        stw     .D1T1   a2, *a5
  [a2]  mvk     .L1     1, a2
        cmpeq   .L1     a2, a6, a1
  [a1]  b       .S1     pl_out              ; the tag is up to date
        nop     5
        ldw     .D2T2   *+b14(MODE), b0
        ldw     .D2T2   *+b14(SCREEN), b1
        mvkl    .S1     PAGE, a0
        mvkh    .S1     PAGE, a0
        ldw     .D1T1   *a0, a0
        nop     4
        cmpeq   .L2     11, b0, b0
        cmpeq   .L2     15, b1, b1
        and     .L2     b0, b1, b0
        cmpeq   .L1     PG_OUT, a0, a0
        and     .L2X    b0, a0, b0
  [!b0] b       .S1     pl_out              ; the OUT page is not open
        nop     5
        ldw     .D2T1   *+b14(UI_EVENT_OFS), a4
        mvk     .S2     64, b4
        nop     3
        mvkl    .S2     EVENT_POST, b5
        mvkh    .S2     EVENT_POST, b5
        b       .S2     b5
        addkpc  .S2     pl_out, b3, 4
pl_out:
        mvkl    .S2     C_POLL, b5      ; the Effect Chain screen's (C, any caller-saved register)
        mvkh    .S2     C_POLL, b5
        b       .S2     b5
        addkpc  .S2     pl_ret, b3, 4
pl_ret:
        ldw     .D2T2   *+b15(4), b3
        mvkl    .S1     0xC00F3000, a0
        mvkh    .S1     0xC00F3000, a0
        ldw     .D1T1   *a0, a0
        mvkl    .S2     LP_MAGIC, b1
        mvkh    .S2     LP_MAGIC, b1
        nop     3
        cmpeq   .L2X    b1, a0, b1          ; looper.yaml applied first: chain its poll
        addk    .S2     16, b15
        mvkl    .S2     POLL, b0
        mvkh    .S2     POLL, b0
  [b1]  mvkl    .S2     LP_POLL, b0
  [b1]  mvkh    .S2     LP_POLL, b0
        b       .S2     b0
        nop     5

; ---------------------------------------------------------------- MIDI CC

; CC 85-101 -> a setting (0-127 scaled to its range), else on to step.S.
; Arguments as midi_channel_msg: A6 = CC number, B6 = value, B3 = return.
cc:
        mvk     .S1     CC_FIRST, a0
        sub     .L1     a6, a0, a1
        mvk     .S1     16, a0
        cmpgtu  .L1     a1, a0, a2
  [!a2] b       .S1     cc_ours
        nop     5
        mvkl    .S2     STEP, b0            ; tail call, arguments untouched
        mvkh    .S2     STEP, b0
        b       .S2     b0
        nop     5
cc_ours:
        mvkl    .S1     cc_map, a0
        mvkh    .S1     cc_map, a0
        ldbu    .D1T1   *+a0[a1], a2        ; setting
        nop     4
        mvkl    .S1     MAXES, a0
        mvkh    .S1     MAXES, a0
        ldbu    .D1T1   *+a0[a2], a3
        mvkl    .S1     PEDAL, a0
        mvkh    .S1     PEDAL, a0
        ldbu    .D1T1   *a0, a0
        nop     4
        cmpeq   .L1     S_MODE, a2, a1      ; Mode with a MONO input: Serial / Parallel
  [a0]  mvk     .L1     0, a1
  [a1]  mvk     .L1     1, a3
        mv      .L1     a0, a4              ; PEDAL, for the Split checks below
        mv      .L1X    b6, a5
        mpy     .M1     a5, a3, a5          ; value x max
        nop     1
        addk    .S1     63, a5
        mvk     .S1     259, a0
        mpy     .M1     a5, a0, a5
        nop     1
        shru    .S1     a5, 15, a5          ; (value x max + 63) / 127
        cmpgt   .L1     a5, a3, a1          ; 151 at max 150: the /127 is approximate
  [a1]  mv      .L1     a3, a5
        mvkl    .S1     LIVE, a0
        mvkh    .S1     LIVE, a0
        stb     .D1T1   a5, *+a0[a2]
        ldbu    .D1T1   *+a0[S_MODE], a6    ; not Split: Input drives Input R and Master
        ldbu    .D1T1   *+a0[S_OUT], a7     ; drives Master R too, as the knobs (pages.c)
        nop     4
        and     .L1     3, a6, a6
        cmpeq   .L1     2, a6, a1
        xor     .L1     1, a1, a1           ; a1 = input not Split (eff_mode() != 2)
  [!a1] cmpeq   .L1     0, a4, a1
        cmpeq   .L2X    S_IN, a2, b0
  [!a1] mvk     .S2     0, b0
  [b0]  stb     .D1T1   a5, *+a0[S_INR]
        cmpeq   .L1     2, a7, a1           ; output Split
        cmpeq   .L2X    S_MASTER, a2, b1
  [a1]  mvk     .S2     0, b1
  [b1]  stb     .D1T1   a5, *+a0[S_MR]
        addk    .S2     -16, b15            ; the auto save timer, then a redraw
        stw     .D2T2   b3, *+b15(4)
        mvkl    .S2     UI_REFRESH, b5
        mvkh    .S2     UI_REFRESH, b5
        b       .S2     b5
        addkpc  .S2     cc_post, b3, 4
cc_post:
        ldw     .D2T1   *+b14(UI_EVENT_OFS), a4
        mvk     .S2     64, b4
        nop     3
        mvkl    .S2     EVENT_POST, b5
        mvkh    .S2     EVENT_POST, b5
        b       .S2     b5
        addkpc  .S2     cc_done, b3, 4
cc_done:
        ldw     .D2T2   *+b15(4), b3
        nop     4
        addk    .S2     16, b15
        b       .S2     b3
        nop     5

; ---------------------------------------------------------------- tables

; CC 85 Send, 86 Crossfade, 87 Master, 88 Input Level, 89 / 90 Route A / B,
; 91 / 92 Mix A / B, 93 Mode, 94 Curve, 95 Phase Invert B, 96 Input R, 97 Master R,
; 98 Output Mode, 99 / 100 Mute A / B, 101 Solo
cc_map: .byte   S_SEND, S_XF, S_MASTER, S_IN, S_RA, S_RB, S_MA, S_MB
        .byte   S_MODE, S_CURVE, S_PHASE, S_INR, S_MR, S_OUT, S_MUTEA, S_MUTEB
        .byte   S_SOLO, 0, 0, 0
s_perform:  .string "PERFORM MODE"
            .byte 0
            .byte 0, 0
s_master:   .string "MASTER"
            .byte 0
s_kaleido:  .string "KALEIDO"
            .byte 0
            .align 4                ; ends on a word: an odd length here crashes cl6x 8.5 (fatal error 99926)
