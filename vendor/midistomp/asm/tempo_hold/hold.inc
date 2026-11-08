; Shared by hold.S and hold2.S.
        .include "../midi_clock/transport.inc"

; Variables: settings.S words from +36 (V_HOLDM, its own) on, zero at boot.
        .equ    HV, 0x1181EA24
        .equ    V_HOLDM, 0                  ; HOLD FOR is MOMENTARY (settings.S)
        .equ    V_MSLOT, 4                  ; slot the footswitch flipped
        .equ    V_PRESST, 8                 ; time of that press
        .equ    V_MARM, 12                  ; 1 = flip back on a long press
        .equ    V_SWALLOW, 16               ; releases to ignore, bit = event - 64
        .equ    MODE, 320                   ; B14 offset, 0 = play
        .equ    PENDING, 340                ; B14 offset, stock keys cancel it first
        .equ    HOLD_FIRED, 348             ; B14 offset, 1 = the release does not tap
        .equ    HOLD_WORD, 0xC009D920       ; stock HOLD FOR: 0 tuner, 1 tempo
        .equ    SW_STATE, 0xC009DF90        ; 7 switches, bit i clear = down
        .equ    BOTTOM, 3                   ; the type key under the footswitch
        .equ    RIGHT, 5                    ; i 4 is the left key (v0.6 r4 test)
        .equ    LEFT, 4
        .equ    EV_KNOB1, 160               ; knob 1 turn, A5 = steps
        .equ    EV_CURSOR_HOLD, 230         ; 230/231 cursor, 228/229 type
        .equ    EV_CURSOR_REL, 72           ; 73/75 cursor, 69/71 type
        .equ    HOLD_MS, 500
        .equ    STALE_MS, 500
        .equ    SCREEN_MS, 2000
        .equ    MIN_BPM, 40
        .equ    MAX_BPM, 250
        .equ    TEXT_Y, 53                  ; inside the box, under the BPM

        .equ    OVL_GET, 0xC00CCD6C         ; (0) -> overlay state, -1 = none
        .equ    OVL_SET, 0xC00CCC84         ; (0, state, ms)
        .equ    TEMPO_BOX, 0xC00AAB10       ; (0, tempo)
        .equ    DRAW_TEXT, 0xC009FCE0       ; (0, string, x, y)
        .equ    CLAMP, 0xC00A766C           ; (value, min, max)
        .equ    TOGGLE, 0xC00ABCB8          ; (slot)
        .equ    IS_DIRTY, 0xC00B8534
        .equ    STOCK_KNOB, 0xC00AC0E8
        .equ    STOCK_TAP, 0xC00BA488
        .equ    STOCK_HOLD, 0xC00ABD30
        .equ    STOCK_RELEASE, 0xC00AC8FC
        .equ    STOCK_TYPE_HOLD, 0xC00ABA58
        .equ    STOCK_CURSOR_HOLD, 0xC00AB968
        .equ    STOCK_TYPE_REL, 0xC00AC450
        .equ    STOCK_CURSOR_REL, 0xC00AC30C

; Branch to an absolute address (B0).
        .macro  JUMP target
        mvkl    .S2     \target, b0
        mvkh    .S2     \target, b0
        b       .S2     b0
        nop     5
        .endm

; Far call to DDR, 4 words (transport.inc's FARCALL takes 6). B3, B5 clobbered.
        .macro  FCALL target
        mvkl    .S2     \target, b5
        mvkh    .S2     \target, b5
        b       .S2     b5
        addkpc  .S2     ret\@, b3, 4
ret\@:
        .endm

; 16-byte frame with B3 at +4, A4 at +8, A5 at +12.
        .macro  ENTER
        addk    .S2     -16, b15
        stw     .D2T2   b3, *+b15(4)
        stw     .D2T1   a4, *+b15(8)
        stw     .D2T1   a5, *+b15(12)
        .endm

        .macro  LEAVE
        ldw     .D2T2   *+b15(4), b3
        ldw     .D2T1   *+b15(8), a4
        ldw     .D2T1   *+b15(12), a5
        nop     4
        addk    .S2     16, b15
        .endm

