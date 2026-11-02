; MIDI SETTINGS menu, MIDI channel, PC start, tempo lock (issue #26, v0.5),
; MS-70CDR 2.10 OS.
;
; Menu (left knob press) gets a fifth entry, MIDI SETTINGS, between SETTINGS
; and the version entry, and scrolls like the SETTINGS list:
;   DELETE EFFECT UNIT / EFFECT CHAIN / SETTINGS / MIDI SETTINGS / MOD 0.5
; MIDI SETTINGS (screen 14, unused by stock) lists six settings, each opening
; a choice screen (screen 13, unused by stock) like AUTO SAVE:
;   CLOCK RECEIVE      OFF/ON, clock sets the patch tempo (v0.3)
;   TRANSPORT RECEIVE  OFF/ON, Start/Stop and the clock count (v0.4)
;   PROG CH RECEIVE    OFF/ON, program change loads patches
;   PROG CH START NO.  0/1: 1 = PC 1 loads patch 1 (default), 0 = stock
;   CC RECEIVE         OFF/ON, every CC (v0.2 map, stock CC 0/74/75)
;   MIDI CHANNEL       OMNI/1..16 for PC and CC (clock, Start, Stop and SysEx
;                      have no channel)
; SETTINGS (screen 1) gets an eighth row, TEMPO LOCK OFF/ON: changing patch
; keeps the current tempo (tempo_lock below).
; v0.6: the menu entry and title read MIDI; SETTINGS row 0 (stock HOLD FOR
; TUNER/TAP, screen 12) opens a choice screen here instead: HOLD FOR TUNER /
; TEMPO / MOMENTARY. The stock word keeps 0 = tuner, 1 = tempo (MOMENTARY
; stores 0 there, so stock code treats it as TUNER) and V_HOLDM says
; MOMENTARY (asm/tempo_hold/hold.S reads it), saved as bit 6 of byte 23 of
; record 50.
;
; UI (docs/os-reverse-engineering.md, "Settings screen"): screens 1, 13 and
; 14 go through the dispatchers' switch tables, which branch (not call) to
; an entry with the frame still on the stack; the entries here load the
; event like the stock stubs and return to the dispatcher's epilogue.
; Screen 0 (the menu) has no table entry: the stubs' callp to the stock menu
; handlers is retargeted (trampolines) to menu_keys and menu_draw. All lists
; are drawn by draw_list, which does what the stock SETTINGS draw does.
;
; Saving:
;   - the MIDI word (V_FLAGS) rides in bits 8-17 of the 4-byte "last patch"
;     flash record 51, of which stock uses the patch number (0-49) only:
;     rec_save adds it whenever the stock code saves that record (patch
;     changes, and leaving a MIDI choice screen after a change), rec_load
;     takes it out at boot. A stock record has 0 there = all defaults.
;   - TEMPO LOCK is bit 5 of byte 23 of the stock settings record (50), via
;     pack_hook/unpack_hook; leaving its choice screen after a change saves
;     the stock settings record.
;
; MIDI word: bits 0-3 "receive off" for clock, transport, PC, CC (clock.S
; tests them, transport.inc), bit 4 = PROG CH START is 0, bits 5-9 channel
; (0 = OMNI). 0 = all defaults.

        .include "../midi_clock/transport.inc"

        .equ    BASE, 0x1181EA00
        .equ    V_FLAGS, 0                  ; = MIDI_FLAGS - BASE
        .equ    V_ITEM, 4                   ; setting shown on screen 13 (0..6)
        .equ    V_ORIG, 8                   ; its value when the screen opened
        .equ    V_TLOCK, 12                 ; TEMPO LOCK on
        .equ    V_LOCKT, 16                 ; tempo kept across patch changes
        .equ    V_PREVT, 20                 ; tempo one poll round ago
        .equ    V_LPATCH, 24                ; patch the poll saw last
        .equ    V_PEND, 28                  ; rounds left to restore the tempo
        .equ    V_BOOT, 32                  ; rounds left before the lock acts
        .equ    V_HOLDM, 36                 ; HOLD FOR is MOMENTARY (v0.6)

        .equ    SET_SCREEN, 0xC00A75E0      ; (screen, row)
        .equ    LIST_INDEX, 0xC00A7040      ; -> row + top of the list
        .equ    LIST_SCROLL, 0xC00A72D4     ; (delta, rows)
        .equ    STOCK_MENU_KEYS, 0xC00A79B4
        .equ    STOCK_LIST_KEYS, 0xC00A7904
        .equ    KEY_DONE, 0xC00A83C0        ; key dispatcher epilogue, A4 = redraw
        .equ    DRAW_DONE, 0xC00A9404       ; draw dispatcher epilogue
        .equ    DRAW_TITLE, 0xC00A7378      ; (string)
        .equ    DRAW_TEXT, 0xC009FCE0       ; (0, string, x, y)
        .equ    DRAW_ICON, 0xC009F9B0       ; (0, x, y, w, h, bitmap)
        .equ    DRAW_BOX, 0xC00A0144        ; (0, x, y, x2, y2, mode)
        .equ    HILITE, 0xC00A73A4          ; (row, narrow for a scrollbar)
        .equ    SCROLLBAR, 0xC00A8874       ; (top, rows)
        .equ    DRAW_ARROWS, 0xC00A7400     ; (0)
        .equ    SOFTKEY, 0xC009F8F0         ; (knob, string, 0)
        .equ    BATTERY_LEVEL, 0xC00D7260   ; -> 0..4, 5+ = no battery icon
        .equ    BATTERY_ICONS, 0xC00EEA50
        .equ    STR_MENU, 0xC00E90F1
        .equ    STR_SETTINGS, 0xC00E9004
        .equ    STR_ENTER, 0xC00E90F6
        .equ    STR_EXIT, 0xC00E90FC
        .equ    STR_BLANK, 0xC00E9101
        .equ    OFF_ON, 0xC00ECD38          ; "OFF", "ON"
        .equ    SETTINGS_WORDS, 0xC009D8F8
        .equ    SAVE_SETTINGS, 0xC00BA3E4   ; (words), writes record 50
        .equ    CLAMP, 0xC00A766C           ; (value, min, max)
        .equ    PACK, 0xC00D382C
        .equ    UNPACK, 0xC00D3740
        .equ    REC_SAVE, 0xC00B49F4        ; (record, buffer)
        .equ    REC_LOAD, 0xC00B4AAC        ; (record, buffer) -> 0 = ok
        .equ    SAVE_LAST_PATCH, 0xC00B8410 ; (patch), writes record 51
        .equ    CUR_PATCH, 324              ; B14 offset
        .equ    CC_HANDLER, 0xC00F2800
        .equ    STOCK_CHANNEL_MSG, 0xC00ADF20
        .equ    EV_ENTER, 34
        .equ    EV_EXIT, 65
        .equ    EV_TURN, 160
        .equ    SCREEN_MENU, 0
        .equ    SCREEN_LIST, 1
        .equ    SCREEN_VERSION, 9
        .equ    SCREEN_OPT, 13
        .equ    SCREEN_MIDI, 14
        .equ    ITEM_SIZE, 24
        .equ    ITEM_TLOCK, 6
        .equ    ITEM_HOLD, 7
        .equ    HOLD_WORD, 0xC009D920       ; stock HOLD FOR: 0 tuner, 1 tap
        .equ    TLOCK_WORD, BASE + V_TLOCK
        .equ    PEND_ROUNDS, 16             ; 16 ms poll rounds
        .equ    BOOT_ROUNDS, 125

; Branch to an absolute address (B0).
        .macro  JUMP target
        mvkl    .S2     \target, b0
        mvkh    .S2     \target, b0
        b       .S2     b0
        nop     5
        .endm

; A3 = descriptor of setting \reg (clobbers A1).
        .macro  ITEM reg
        mvkl    .S1     items, a3
        mvkh    .S1     items, a3
        mvk     .S1     ITEM_SIZE, a1
        mpy     .M1     \reg, a1, a1
        nop     1
        add     .L1     a3, a1, a3
        .endm

; Switch-table entries: event pair from the dispatcher's frame, return to
; its epilogue.
        .macro  KEY_ENTRY handler
        lddw    .D2T1   *+b15(8), a5:a4
        mvkl    .S2     KEY_DONE, b3
        mvkh    .S2     KEY_DONE, b3
        b       .S2     \handler
        nop     5
        .endm

; Return from a function with a 16-byte frame, B3 saved at +4.
        .macro  RET16
        ldw     .D2T2   *+b15(4), b3
        nop     4
        addk    .S2     16, b15
        b       .S2     b3
        nop     5
        .endm

        .text
        .nocmp
vars:
        .word   0                           ; +0  V_FLAGS
        .word   0                           ; +4  V_ITEM
        .word   0                           ; +8  V_ORIG
        .word   0                           ; +12 V_TLOCK
        .word   0                           ; +16 V_LOCKT
        .word   0                           ; +20 V_PREVT
        .word   0                           ; +24 V_LPATCH
        .word   0                           ; +28 V_PEND
        .word   BOOT_ROUNDS                 ; +32 V_BOOT
        .word   0                           ; +36 V_HOLDM
        .word   0, 0, 0, 0, 0, 0            ; +40.. hold.S (asm/tempo_hold/hold.inc)
; +64: entry points at fixed offsets (the patch file names them by address)
vectors:
        b       .S2     menu_keys           ; +64  called, menu stub
        nop     5
        b       .S2     menu_draw           ; +72  called, menu stub
        nop     5
        b       .S2     settings_keys_e     ; +80  table, screen 1 keys
        nop     5
        b       .S2     settings_draw       ; +88  table, screen 1 draw
        nop     5
        b       .S2     midi_keys_e         ; +96  table, screen 14 keys
        nop     5
        b       .S2     midi_draw           ; +104 table, screen 14 draw
        nop     5
        b       .S2     opt_keys_e          ; +112 table, screen 13 keys
        nop     5
        b       .S2     opt_draw            ; +120 table, screen 13 draw
        nop     5
        b       .S2     pack_hook           ; +128 called, settings save
        nop     5
        b       .S2     unpack_hook         ; +136 called, settings load
        nop     5
        b       .S2     midi_gate           ; +144 called, Task_MIDI CC/PC
        nop     5
        b       .S2     rec_load            ; +152 called, record 51 load
        nop     5
        b       .S2     rec_save            ; +160 called, record 51 save
        nop     5
        b       .S2     tempo_lock          ; +168 called, poll.S
        nop     5
        .p2align 5                          ; keep data out of code packets

; Settings: name, value word, choice names, then bytes shift, mask, xor
; (value = (word >> shift & mask) ^ xor), choices, parent screen and row.
        .macro  ITEMDEF name, word, choices, shift, mask, xor, count, parent, row
        .word   \name, \word, \choices
        .byte   \shift, \mask, \xor, \count, \parent, \row, 0, 0
        .word   0
        .endm
items:
        ITEMDEF s_clock, MIDI_FLAGS, OFF_ON, 0, 1, 1, 2, SCREEN_MIDI, 0
        ITEMDEF s_transport, MIDI_FLAGS, OFF_ON, 1, 1, 1, 2, SCREEN_MIDI, 1
        ITEMDEF s_pc, MIDI_FLAGS, OFF_ON, 2, 1, 1, 2, SCREEN_MIDI, 2
        ITEMDEF s_pcstart, MIDI_FLAGS, zero_one, 4, 1, 1, 2, SCREEN_MIDI, 3
        ITEMDEF s_cc, MIDI_FLAGS, OFF_ON, 3, 1, 1, 2, SCREEN_MIDI, 4
        ITEMDEF s_channel, MIDI_FLAGS, channels, 5, 31, 0, 17, SCREEN_MIDI, 5
        ITEMDEF s_tlock, TLOCK_WORD, OFF_ON, 0, 1, 0, 2, SCREEN_LIST, 7
        ITEMDEF s_hold, HOLD_WORD, hold_names, 0, 0, 0, 3, SCREEN_LIST, 0

menu_names:     ; stock entries, ours before the version entry
        .word   0xC00E8FE4, 0xC00E8FF7, 0xC00E9004, s_midi, 0xC00E900D
settings_names: ; stock rows but our HOLD FOR, then ours
        .word   s_hold, 0xC00E9028, 0xC00E903A, 0xC00E904B
        .word   0xC00E9055, 0xC00E9062, 0xC00E9070, s_tlock
midi_names:
        .word   s_clock, s_transport, s_pc, s_pcstart, s_cc, s_channel
zero_one:
        .word   s_0, s_1
hold_names:     ; stock "TUNER", "TEMPO" (the tap screen title), ours
        .word   0xC00E909F, 0xC00EB0DC, s_moment
channels:
        .word   s_omni, s_1, s_2, s_3, s_4, s_5, s_6, s_7, s_8
        .word   s_9, s_10, s_11, s_12, s_13, s_14, s_15, s_16
; 7x7 row icons, one byte per column, bit 0 at the top: the stock SETTINGS
; icons, a padlock for TEMPO LOCK, a MIDI socket.
settings_icons:
        .byte   0x1c, 0x3e, 0x4f, 0x41, 0x7b, 0x36, 0x1c
        .byte   0x00, 0x00, 0x1f, 0x60, 0x1f, 0x00, 0x00
        .byte   0x1c, 0x22, 0x40, 0x4f, 0x40, 0x22, 0x1c
        .byte   0x70, 0x44, 0x4c, 0x5f, 0x4c, 0x44, 0x70
        .byte   0x00, 0x7e, 0x7f, 0x7f, 0x7f, 0x7e, 0x00
        .byte   0x7f, 0x41, 0x5d, 0x5d, 0x5d, 0x41, 0x7f
        .byte   0x1c, 0x22, 0x71, 0x79, 0x7d, 0x3e, 0x1c
        .byte   0x78, 0x7e, 0x79, 0x49, 0x79, 0x7e, 0x78
midi_icon:
        .byte   0x1c, 0x22, 0x55, 0x41, 0x55, 0x22, 0x1c
s_midi:         .string "MIDI"
s_clock:        .string "CLOCK RECEIVE"
s_transport:    .string "TRANSPORT RECEIVE"
s_pc:           .string "PROG CH RECEIVE"
s_pcstart:      .string "PROG CH START NO."
s_cc:           .string "CC RECEIVE"
s_channel:      .string "MIDI CHANNEL"
s_tlock:        .string "TEMPO LOCK"
s_hold:         .string "HOLD FOR"
s_moment:       .string "MOMENTARY"
s_omni:         .string "OMNI"
s_0:            .string "0"
s_1:            .string "1"
s_2:            .string "2"
s_3:            .string "3"
s_4:            .string "4"
s_5:            .string "5"
s_6:            .string "6"
s_7:            .string "7"
s_8:            .string "8"
s_9:            .string "9"
s_10:           .string "10"
s_11:           .string "11"
s_12:           .string "12"
s_13:           .string "13"
s_14:           .string "14"
s_15:           .string "15"
s_16:           .string "16"
        .p2align 5

; draw_list(A4 title, B4 names, A6 rows, B6 icons or 0, A8 icon stride,
; B8 left softkey): a list screen as the stock SETTINGS draw (0xC00A88A4)
; does it. Four rows from the top (B14+360), icons at x 1 and text at x 12,
; or text at x 1 without icons; scrollbar and narrow highlight past 4 rows.
draw_list:
        addk    .S2     -48, b15
        stw     .D2T2   b3, *+b15(4)
        stw     .D2T1   a10, *+b15(8)
        stw     .D2T1   a11, *+b15(12)
        stw     .D2T1   a12, *+b15(16)
        stw     .D2T1   a13, *+b15(20)
        stw     .D2T1   a14, *+b15(24)
        stw     .D2T1   a15, *+b15(28)
        stw     .D2T2   b10, *+b15(32)
        stw     .D2T2   b11, *+b15(36)
        mv      .L1X    b4, a10             ; names
        mv      .L1     a6, a11             ; rows
        mv      .L1X    b6, a12             ; icons
        mv      .L1     a8, a13             ; icon stride
        mv      .L1X    b8, a14             ; left softkey
        FARCALL DRAW_TITLE
        ldw     .D2T2   *+b14(360), b11     ; top
        mvk     .L2     0, b10              ; screen row
        nop     4
dl_row:
        mv      .L1X    b11, a15
        add     .L1X    a15, b10, a15       ; a15 = list index
        cmplt   .L1     a15, a11, a1        ; index < rows
        cmpgt   .L2     4, b10, b1          ; screen row < 4
        mv      .L1X    b1, a2
        and     .L1     a1, a2, a1
  [!a1] b       .S1     dl_rows_done
        nop     5
        mvk     .S2     9, b0
        mpy     .M2     b10, b0, b0
        nop     1
        add     .L2     12, b0, b0          ; y = 9 * row + 12
        stw     .D2T2   b0, *+b15(40)
        mv      .L1     a12, a2
  [!a2] b       .S1     dl_text
        nop     5
        mpy     .M1     a15, a13, a0
        nop     1
        add     .L1     a12, a0, a0
        mv      .L2X    a0, b8              ; bitmap
        mvk     .L1     0, a4
        mvk     .L2     1, b4               ; x
        ldw     .D2T1   *+b15(40), a6       ; y
        mvk     .L2     7, b6
        mvk     .L1     7, a8
        nop     4
        FARCALL DRAW_ICON
dl_text:
        ldw     .D1T2   *+a10[a15], b4      ; names[index]
        ldw     .D2T2   *+b15(40), b6       ; y
        mv      .L1     a12, a1
        mvk     .L1     1, a6               ; x
  [a1]  mvk     .S1     12, a6
        mvk     .L1     0, a4
        nop     3
        FARCALL DRAW_TEXT
        add     .L2     1, b10, b10
        b       .S1     dl_row
        nop     5
dl_rows_done:
        mvk     .L1     4, a0
        cmplt   .L1     a0, a11, a1         ; scrollbar if more than 4 rows
        stw     .D2T1   a1, *+b15(40)
        mv      .L2X    a1, b4
        ldw     .D2T1   *+b14(356), a4      ; highlighted screen row
        nop     4
        FARCALL HILITE
        ldw     .D2T1   *+b15(40), a1
        nop     4
  [!a1] b       .S1     dl_no_bar
        nop     5
        mv      .L1X    b11, a4
        mv      .L2X    a11, b4
        FARCALL SCROLLBAR
dl_no_bar:
        mvk     .L1     0, a4
        FARCALL DRAW_ARROWS
        mvk     .L1     0, a4
        mv      .L2X    a14, b4
        mvk     .L1     0, a6
        FARCALL SOFTKEY
        mvk     .L1     1, a4
        mvkl    .S2     STR_EXIT, b4
        mvkh    .S2     STR_EXIT, b4
        mvk     .L1     0, a6
        FARCALL SOFTKEY
        mvk     .L1     2, a4
        mvkl    .S2     STR_BLANK, b4
        mvkh    .S2     STR_BLANK, b4
        mvk     .L1     0, a6
        FARCALL SOFTKEY
        ldw     .D2T2   *+b15(4), b3
        ldw     .D2T1   *+b15(8), a10
        ldw     .D2T1   *+b15(12), a11
        ldw     .D2T1   *+b15(16), a12
        ldw     .D2T1   *+b15(20), a13
        ldw     .D2T1   *+b15(24), a14
        ldw     .D2T1   *+b15(28), a15
        ldw     .D2T2   *+b15(32), b10
        ldw     .D2T2   *+b15(36), b11
        nop     4
        addk    .S2     48, b15
        b       .S2     b3
        nop     5

; Menu draw (screen 0), called from the draw dispatcher's default stub:
; five entries, then the battery icon as the stock menu draw (0xC00A7460).
menu_draw:
        addk    .S2     -16, b15
        stw     .D2T2   b3, *+b15(4)
        stw     .D2T1   a10, *+b15(8)
        mvkl    .S1     STR_MENU, a4
        mvkh    .S1     STR_MENU, a4
        mvkl    .S2     menu_names, b4
        mvkh    .S2     menu_names, b4
        mvk     .L1     5, a6
        mvk     .L2     0, b6
        mvk     .L1     0, a8
        mvkl    .S2     STR_ENTER, b8
        mvkh    .S2     STR_ENTER, b8
        FARCALL draw_list
        FARCALL BATTERY_LEVEL
        mv      .L1     a4, a10
        mvk     .L1     5, a0
        cmpgt   .L1     a0, a4, a1          ; level < 5: battery powered
  [!a1] b       .S1     md_done
        nop     5
        mvk     .L1     0, a4
        mvk     .S2     114, b4
        mvk     .L1     1, a6
        mvk     .S2     126, b6
        mvk     .L1     7, a8
        mvk     .L2     2, b8
        FARCALL DRAW_BOX
        mvkl    .S1     BATTERY_ICONS, a0
        mvkh    .S1     BATTERY_ICONS, a0
        ldw     .D1T2   *+a0[a10], b8
        mvk     .L1     0, a4
        mvk     .S2     114, b4
        mvk     .L1     1, a6
        mvk     .S2     13, b6
        mvk     .L1     7, a8
        FARCALL DRAW_ICON
md_done:
        ldw     .D2T1   *+b15(8), a10
        RET16

; Menu keys (screen 0), called from the key dispatcher's default stub with
; A4 = event, A5 = knob turn. ENTER on MIDI SETTINGS or the version entry is
; ours, the stock handler does the rest (it only knows indexes 0-3).
menu_keys:
        addk    .S2     -16, b15
        stw     .D2T2   b3, *+b15(4)
        stw     .D2T1   a4, *+b15(8)
        stw     .D2T1   a5, *+b15(12)
        mvk     .S1     EV_TURN, a0
        cmpeq   .L1     a4, a0, a1
  [a1]  b       .S1     mk_turn
        nop     5
        mvk     .S1     EV_ENTER, a0
        cmpeq   .L1     a4, a0, a1
  [a1]  b       .S1     mk_enter
        nop     5
mk_stock:
        ldw     .D2T2   *+b15(4), b3
        ldw     .D2T1   *+b15(8), a4
        ldw     .D2T1   *+b15(12), a5
        nop     4
        addk    .S2     16, b15
        JUMP    STOCK_MENU_KEYS
mk_turn:
        mv      .L1     a5, a4
        mvk     .L2     5, b4
        FARCALL LIST_SCROLL
        b       .S1     redraw16
        nop     5
mk_enter:
        FARCALL LIST_INDEX
        mv      .L1     a4, a3              ; index
        mvk     .L1     3, a0
        cmpeq   .L1     a3, a0, a1          ; MIDI SETTINGS
        mvk     .L1     4, a0
        cmpeq   .L1     a3, a0, a2          ; version entry
        mvk     .L1     SCREEN_MIDI, a4
  [a2]  mvk     .L1     SCREEN_VERSION, a4
        mvk     .L2     0, b4
        or      .L1     a1, a2, a1
  [a1]  b       .S1     goto16
        nop     5
        b       .S1     mk_stock
        nop     5

; Shared tails for 16-byte-frame key handlers: set_screen(A4, B4) then
; return 1; or just return 1.
goto16:
        FARCALL SET_SCREEN
redraw16:
        mvk     .L1     1, a4
        RET16

; SETTINGS list (screen 1): one more row, TEMPO LOCK; the stock handler
; does the stock rows and EXIT.
settings_keys_e:
        KEY_ENTRY settings_keys
settings_keys:
        addk    .S2     -16, b15
        stw     .D2T2   b3, *+b15(4)
        stw     .D2T1   a4, *+b15(8)
        stw     .D2T1   a5, *+b15(12)
        mvk     .S1     EV_TURN, a0
        cmpeq   .L1     a4, a0, a1
  [a1]  b       .S1     sk_turn
        nop     5
        mvk     .S1     EV_ENTER, a0
        cmpeq   .L1     a4, a0, a1
  [a1]  b       .S1     sk_enter
        nop     5
sk_stock:
        ldw     .D2T2   *+b15(4), b3
        ldw     .D2T1   *+b15(8), a4
        ldw     .D2T1   *+b15(12), a5
        nop     4
        addk    .S2     16, b15
        JUMP    STOCK_LIST_KEYS
sk_turn:
        mv      .L1     a5, a4
        mvk     .L2     8, b4
        FARCALL LIST_SCROLL
        b       .S1     redraw16
        nop     5
sk_enter:
        FARCALL LIST_INDEX
        mvk     .L1     7, a0
        cmpeq   .L1     a4, a0, a1
        cmpeq   .L1     0, a4, a2           ; HOLD FOR: ours, not screen 12
        or      .L1     a1, a2, a0
  [!a0] b       .S1     sk_stock
        nop     5
        mvk     .L1     ITEM_TLOCK, a4
  [a2]  mvk     .L1     ITEM_HOLD, a4
        FARCALL open_choice
        b       .S1     redraw16
        nop     5

; MIDI SETTINGS list (screen 14).
midi_keys_e:
        KEY_ENTRY midi_keys
midi_keys:
        addk    .S2     -16, b15
        stw     .D2T2   b3, *+b15(4)
        mvk     .S1     EV_TURN, a0
        cmpeq   .L1     a4, a0, a1
  [a1]  b       .S1     mlk_turn
        nop     5
        mvk     .S1     EV_ENTER, a0
        cmpeq   .L1     a4, a0, a1
  [a1]  b       .S1     mlk_enter
        nop     5
        mvk     .S1     EV_EXIT, a0
        cmpeq   .L1     a4, a0, a1
        mvk     .L1     SCREEN_MENU, a4
        mvk     .L2     3, b4               ; back on MIDI SETTINGS
  [a1]  b       .S1     goto16
        nop     5
        mvk     .L1     0, a4               ; other keys: nothing to do
        RET16
mlk_turn:
        mv      .L1     a5, a4
        mvk     .L2     6, b4
        FARCALL LIST_SCROLL
        b       .S1     redraw16
        nop     5
mlk_enter:
        FARCALL LIST_INDEX                  ; index = setting 0..5
        FARCALL open_choice
        b       .S1     redraw16
        nop     5

; open_choice(A4 setting): screen 13 with the current value highlighted.
open_choice:
        addk    .S2     -16, b15
        stw     .D2T2   b3, *+b15(4)
        mvkl    .S1     BASE, a0
        mvkh    .S1     BASE, a0
        stw     .D1T1   a4, *+a0(V_ITEM)
        FARCALL get_value
        mvkl    .S1     BASE, a0
        mvkh    .S1     BASE, a0
        stw     .D1T1   a4, *+a0(V_ORIG)
        mv      .L2X    a4, b4
        mvk     .L1     SCREEN_OPT, a4
        FARCALL SET_SCREEN
        RET16

; get_value(A4 setting) -> A4. Leaf.
get_value:
        mvk     .L1     ITEM_HOLD, a0
        cmpeq   .L1     a4, a0, a1
  [a1]  b       .S1     gv_hold
        nop     5
        ITEM    a4
        ldw     .D1T1   *+a3(4), a0         ; value word
        ldbu    .D1T1   *+a3(12), a5        ; shift
        ldbu    .D1T1   *+a3(13), a6        ; mask
        ldbu    .D1T1   *+a3(14), a7        ; xor
        nop     4
        ldw     .D1T1   *a0, a4
        nop     4
        shru    .S1     a4, a5, a4
        and     .L1     a4, a6, a4
        xor     .L1     a4, a7, a4
        b       .S2     b3
        nop     5

; HOLD FOR: 2 = MOMENTARY (ours), else the stock word.
gv_hold:
        mvkl    .S1     BASE, a0
        mvkh    .S1     BASE, a0
        ldw     .D1T1   *+a0(V_HOLDM), a1
        mvkl    .S1     HOLD_WORD, a0
        mvkh    .S1     HOLD_WORD, a0
        ldw     .D1T1   *a0, a4
        nop     4
  [a1]  mvk     .L1     2, a4
        b       .S2     b3
        nop     5

; set_value(A4 setting, B4 value). Leaf.
set_value:
        mvk     .L1     ITEM_HOLD, a0
        cmpeq   .L1     a4, a0, a1
  [!a1] b       .S1     sv_item
        nop     5
        mvkl    .S1     BASE, a0
        mvkh    .S1     BASE, a0
        cmpeq   .L2     2, b4, b0
        stw     .D1T2   b0, *+a0(V_HOLDM)
        mvkl    .S1     HOLD_WORD, a0
        mvkh    .S1     HOLD_WORD, a0
        cmpeq   .L2     1, b4, b0
        stw     .D1T2   b0, *a0
        b       .S2     b3
        nop     5
sv_item:
        ITEM    a4
        ldw     .D1T1   *+a3(4), a0
        ldbu    .D1T1   *+a3(12), a5
        ldbu    .D1T1   *+a3(13), a6
        ldbu    .D1T1   *+a3(14), a7
        nop     4
        ldw     .D1T1   *a0, a8
        mv      .L1X    b4, a9
        xor     .L1     a9, a7, a9
        shl     .S1     a9, a5, a9          ; stored value in place
        shl     .S1     a6, a5, a6          ; mask in place
        nop     1
        andn    .L1     a8, a6, a8
        or      .L1     a8, a9, a8
        stw     .D1T1   a8, *a0
        b       .S2     b3
        nop     5

; Choice screen (screen 13): the knob picks, EXIT saves a change and goes
; back to the setting's row.
opt_keys_e:
        KEY_ENTRY opt_keys
opt_keys:
        addk    .S2     -16, b15
        stw     .D2T2   b3, *+b15(4)
        stw     .D2T1   a10, *+b15(8)
        stw     .D2T1   a11, *+b15(12)
        mvkl    .S1     BASE, a0
        mvkh    .S1     BASE, a0
        ldw     .D1T1   *+a0(V_ITEM), a10
        nop     4
        mvk     .S1     EV_TURN, a0
        cmpeq   .L1     a4, a0, a1
  [a1]  b       .S1     ok_turn
        nop     5
        mvk     .S1     EV_EXIT, a0
        cmpeq   .L1     a4, a0, a1
  [a1]  b       .S1     ok_exit
        nop     5
        mvk     .L1     0, a4               ; other keys: nothing to do
ok_ret:
        ldw     .D2T1   *+b15(8), a10
        ldw     .D2T1   *+b15(12), a11
        RET16
ok_turn:        ; value = clamp(value + turn), like the stock OFF/ON screens
        mv      .L1     a5, a11
        mv      .L1     a10, a4
        FARCALL get_value
        add     .L1     a4, a11, a4
        ITEM    a10
        ldbu    .D1T1   *+a3(15), a6        ; choices
        mvk     .L2     0, b4
        nop     4
        add     .L1     -1, a6, a6
        FARCALL CLAMP
        mv      .L1     a4, a11             ; new value
        mvk     .L1     3, a0               ; list position for the highlight
        cmplt   .L1     a0, a11, a2
        mv      .L1     a11, a6             ; row
        mvk     .L1     0, a7               ; top
  [a2]  mvk     .L1     3, a6
  [a2]  add     .L1     -3, a11, a7
        stw     .D2T1   a6, *+b14(356)
        stw     .D2T1   a7, *+b14(360)
        mv      .L2X    a11, b4
        mv      .L1     a10, a4
        FARCALL set_value
        ; TRANSPORT RECEIVE turned off: the transport counts as stopped.
        cmpeq   .L1     1, a10, a1
        cmpeq   .L1     0, a11, a2
        and     .L1     a1, a2, a1
  [!a1] b       .S1     ok_redraw
        nop     5
        PUB_BEGIN
        mvk     .L1     0, a0
        stw     .D1T1   a0, *+a5(B_RUN)
        PUB_END
ok_redraw:
        mvk     .L1     1, a4
        b       .S1     ok_ret
        nop     5
ok_exit:
        mv      .L1     a10, a4
        FARCALL get_value
        mvkl    .S1     BASE, a0
        mvkh    .S1     BASE, a0
        ldw     .D1T1   *+a0(V_ORIG), a0
        nop     4
        cmpeq   .L1     a4, a0, a1
  [a1]  b       .S1     ok_back             ; unchanged: nothing to save
        nop     5
        mvk     .L1     ITEM_TLOCK, a0
        cmpeq   .L1     a10, a0, a1
        mvk     .L1     ITEM_HOLD, a0
        cmpeq   .L1     a10, a0, a2
        or      .L1     a1, a2, a1
  [a1]  b       .S1     ok_flip
        nop     5
        ldw     .D2T1   *+b14(CUR_PATCH), a4    ; MIDI: save record 51 now
        nop     4
        FARCALL SAVE_LAST_PATCH
        b       .S1     ok_back
        nop     5
ok_flip:        ; TEMPO LOCK, HOLD FOR: save the stock settings record now
        mvkl    .S1     SETTINGS_WORDS, a4
        mvkh    .S1     SETTINGS_WORDS, a4
        FARCALL SAVE_SETTINGS
ok_back:
        ITEM    a10
        ldbu    .D1T1   *+a3(16), a4        ; parent screen
        ldbu    .D1T2   *+a3(17), b4        ; row there
        nop     4
        FARCALL SET_SCREEN
        b       .S1     ok_redraw
        nop     5

; Draws, entered from the draw dispatcher's switch: tail-call draw_list
; with B3 = the dispatcher's epilogue.
settings_draw:
        mvkl    .S2     DRAW_DONE, b3
        mvkh    .S2     DRAW_DONE, b3
        mvkl    .S1     STR_SETTINGS, a4
        mvkh    .S1     STR_SETTINGS, a4
        mvkl    .S2     settings_names, b4
        mvkh    .S2     settings_names, b4
        mvk     .L1     8, a6
        mvkl    .S2     settings_icons, b6
        mvkh    .S2     settings_icons, b6
        mvk     .L1     7, a8
        mvkl    .S2     STR_ENTER, b8
        mvkh    .S2     STR_ENTER, b8
        b       .S2     draw_list
        nop     5

midi_draw:
        mvkl    .S2     DRAW_DONE, b3
        mvkh    .S2     DRAW_DONE, b3
        mvkl    .S1     s_midi, a4
        mvkh    .S1     s_midi, a4
        mvkl    .S2     midi_names, b4
        mvkh    .S2     midi_names, b4
        mvk     .L1     6, a6
        mvkl    .S2     midi_icon, b6
        mvkh    .S2     midi_icon, b6
        mvk     .L1     0, a8               ; same icon on every row
        mvkl    .S2     STR_ENTER, b8
        mvkh    .S2     STR_ENTER, b8
        b       .S2     draw_list
        nop     5

opt_draw:
        mvkl    .S1     BASE, a0
        mvkh    .S1     BASE, a0
        ldw     .D1T1   *+a0(V_ITEM), a4
        nop     4
        ITEM    a4
        ldw     .D1T1   *+a3(0), a4         ; title = the setting's name
        ldw     .D1T2   *+a3(8), b4         ; choice names
        ldbu    .D1T1   *+a3(15), a6        ; choices
        mvk     .L2     0, b6
        mvk     .L1     0, a8
        mvkl    .S2     STR_BLANK, b8
        mvkh    .S2     STR_BLANK, b8
        mvkl    .S2     DRAW_DONE, b3
        mvkh    .S2     DRAW_DONE, b3
        b       .S2     draw_list
        nop     5

; Stock pack (A4 = 24-byte record, B4 = settings words) then TEMPO LOCK into
; bit 5 and MOMENTARY into bit 6 of byte 23 (bits 1-7 are free; bits 1-4
; held a test build's MIDI bits and are cleared). B3 = return into the stock
; save.
pack_hook:
        addk    .S2     -16, b15
        stw     .D2T2   b3, *+b15(4)
        stw     .D2T1   a4, *+b15(8)
        FARCALL PACK
        ldw     .D2T1   *+b15(8), a4
        mvkl    .S1     BASE, a0
        mvkh    .S1     BASE, a0
        ldw     .D1T1   *+a0(V_HOLDM), a2
        ldw     .D1T1   *+a0(V_TLOCK), a0
        nop     3
        ldbu    .D1T1   *+a4(23), a1
        shl     .S1     a2, 6, a2
        shl     .S1     a0, 5, a0
        nop     2
        and     .L1     1, a1, a1
        or      .L1     a0, a1, a1
        or      .L1     a2, a1, a1
        stb     .D1T1   a1, *+a4(23)
        RET16

; Stock unpack at boot (A4 = settings words, B4 = record) then TEMPO LOCK.
unpack_hook:
        addk    .S2     -16, b15
        stw     .D2T2   b3, *+b15(4)
        stw     .D2T2   b4, *+b15(8)
        FARCALL UNPACK
        ldw     .D2T2   *+b15(8), b4
        nop     4
        ldbu    .D2T2   *+b4(23), b0
        mvkl    .S1     BASE, a0
        mvkh    .S1     BASE, a0
        nop     2
        shru    .S2     b0, 5, b1
        and     .L2     1, b1, b1
        stw     .D1T2   b1, *+a0(V_TLOCK)
        shru    .S2     b0, 6, b1
        and     .L2     1, b1, b1
        stw     .D1T2   b1, *+a0(V_HOLDM)
        RET16

; Record 51 load at boot (A4 = 51, B4 = 4-byte buffer): the MIDI word comes
; out of bits 8-17, the stock code sees the patch number alone.
rec_load:
        addk    .S2     -16, b15
        stw     .D2T2   b3, *+b15(4)
        stw     .D2T2   b4, *+b15(8)
        FARCALL REC_LOAD
        ldw     .D2T2   *+b15(8), b4
        mv      .L1     a4, a1
        nop     3
  [a1]  b       .S1     rl_ret              ; no record: defaults
        nop     5
        ldw     .D2T1   *b4, a0
        mvkl    .S1     MIDI_FLAGS, a5
        mvkh    .S1     MIDI_FLAGS, a5
        nop     3
        extu    .S1     a0, 24, 24, a3      ; patch number
        extu    .S1     a0, 14, 22, a0      ; MIDI word
        stw     .D2T1   a3, *b4
        stw     .D1T1   a0, *a5
rl_ret:
        RET16

; Record 51 save (A4 = 51, B4 = buffer with the patch number, B3 = return
; into 0xC00B8410): add the MIDI word, then the stock save.
rec_save:
        ldw     .D2T1   *b4, a0
        mvkl    .S1     MIDI_FLAGS, a5
        mvkh    .S1     MIDI_FLAGS, a5
        ldw     .D1T1   *a5, a5
        nop     4
        extu    .S1     a0, 24, 24, a0
        shl     .S1     a5, 8, a5
        or      .L1     a0, a5, a0
        stw     .D2T1   a0, *b4
        JUMP    REC_SAVE

; In front of Task_MIDI's CC and PC calls of midi_channel_msg(type, channel,
; number, value): A4 = 0 for CC, 1 for PC; B4 = channel 0-15; A6 = number;
; B3 = return into Task_MIDI.
midi_gate:
        mvkl    .S1     MIDI_FLAGS, a7
        mvkh    .S1     MIDI_FLAGS, a7
        ldw     .D1T1   *a7, a7
        mv      .L1     a4, a2              ; a2 = 1 for PC
        nop     3
        extu    .S1     a7, 22, 27, a1      ; channel setting, 0 = OMNI
  [!a1] b       .S1     mg_channel_ok
        nop     5
        add     .L1     -1, a1, a1
        cmpeq   .L1X    a1, b4, a1
  [!a1] b       .S2     b3                  ; another channel: drop it
        nop     5
mg_channel_ok:
        mvk     .L1     OFF_CC, a1
  [a2]  mvk     .L1     OFF_PC, a1
        and     .L1     a1, a7, a1
  [a1]  b       .S2     b3                  ; receive off: drop it
        nop     5
  [!a2] b       .S1     mg_cc
        nop     5
        mvk     .S1     16, a1              ; PROG CH START 0: stock numbers
        and     .L1     a1, a7, a1
  [a1]  b       .S1     mg_pc
        nop     5
        mvk     .S1     127, a0             ; stock special case, as is
        cmpeq   .L1     a6, a0, a1
  [a1]  b       .S1     mg_pc
        nop     5
        cmpeq   .L1     0, a6, a1
  [a1]  b       .S2     b3                  ; PC 0: no patch 0 to load
        nop     5
        add     .L1     -1, a6, a6          ; PC 1 loads patch 1
mg_pc:
        JUMP    STOCK_CHANNEL_MSG
mg_cc:
        JUMP    CC_HANDLER

; TEMPO LOCK, called by poll.S every 16 ms (footswitch task) before it
; applies V_WANT. While idle it remembers the tempo of one round ago; for
; PEND_ROUNDS after the patch number changes it asks for that tempo back
; (V_WANT, applied like tap tempo) whenever the patch load changed it.
; Tap, the tempo knob and MIDI clock change the tempo without a patch
; change, so the lock follows them. Idle for BOOT_ROUNDS after power-on, so
; the start patch's tempo is the first one kept. Leaf.
tempo_lock:
        mvkl    .S1     BASE, a3
        mvkh    .S1     BASE, a3
        mvkl    .S1     TEMPO_VALUE, a0
        mvkh    .S1     TEMPO_VALUE, a0
        ldw     .D2T1   *+b14(CUR_PATCH), a4
        ldw     .D1T1   *a0, a5             ; tempo
        ldw     .D1T1   *+a3(V_LPATCH), a6
        ldw     .D1T1   *+a3(V_PEND), a7
        ldw     .D1T1   *+a3(V_TLOCK), a8
        ldw     .D1T1   *+a3(V_BOOT), a9
        nop     4
        cmpeq   .L1     a4, a6, a1
  [!a1] stw     .D1T1   a4, *+a3(V_LPATCH)
  [!a1] mvk     .S1     PEND_ROUNDS, a7
        mv      .L1     a9, a2
  [a2]  add     .L1     -1, a9, a9
  [a2]  stw     .D1T1   a9, *+a3(V_BOOT)
  [a2]  mvk     .L1     0, a8               ; booting: act as off
        cmpeq   .L1     0, a8, a0
        cmpeq   .L1     0, a7, a1
        or      .L1     a0, a1, a1          ; a1 = idle
        ldw     .D1T1   *+a3(V_PREVT), a6
        ldw     .D1T1   *+a3(V_LOCKT), a0
        nop     4
  [a1]  stw     .D1T1   a6, *+a3(V_LOCKT)   ; idle: kept = one round ago
  [a1]  stw     .D1T1   a5, *+a3(V_PREVT)
  [a1]  mvk     .L1     0, a7
  [!a1] add     .L1     -1, a7, a7
  [!a1] stw     .D1T1   a0, *+a3(V_PREVT)   ; pending: keep the kept tempo
        stw     .D1T1   a7, *+a3(V_PEND)
  [a1]  b       .S2     b3
        nop     5
        cmpeq   .L1     0, a0, a1           ; nothing kept yet
        cmpeq   .L1     a5, a0, a2          ; tempo is the kept one
        or      .L1     a1, a2, a1
  [a1]  b       .S2     b3
        nop     5
        mvkl    .S1     VARS, a6
        mvkh    .S1     VARS, a6
        mvc     .S2     csr, b6             ; Task_MIDI may set V_WANT too
        and     .L2     -2, b6, b7
        mvc     .S2     b7, csr
        ldw     .D1T1   *+a6(V_WANT), a1
        nop     4
  [!a1] stw     .D1T1   a0, *+a6(V_WANT)
        mvc     .S2     b6, csr
        b       .S2     b3
        nop     5
