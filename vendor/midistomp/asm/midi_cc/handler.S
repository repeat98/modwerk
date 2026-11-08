; MIDI CC -> effect on/off and knobs (issue #4), MS-70CDR 2.10 OS.
;
; Entered from the CC call site in Task_MIDI (via trampoline.S) with the
; arguments of the stock midi_channel_msg(type, channel, number, value):
;   A4 = 0 (CC)   B4 = channel   A6 = CC number   B6 = CC value   B3 = return
;
; CC map (any channel):
;   effect n (1-6) on/off  = CC 10n+4         value >= 64 is on
;   effect n, knob k (1-9) = CC 10n+4+k       0-127 scaled to the knob's range
; So CC 14-73 are ours. Everything else goes on to step.S (CC 80/81 change
; patch, issue #34), which passes the rest (including the CCs the stock OS
; uses: 0, 74, 75) to the stock midi_channel_msg unchanged.
;
; A mapped CC does what the SysEx 0x31 parameter edit does (see
; docs/os-reverse-engineering.md): Semaphore_pend, fx_set_param(slot, param,
; value, 0, 1), Semaphore_post, UI refresh, Event_post(UI, 0x40).
; fx_set_param itself ignores parameters the effect does not have and clamps
; the value to the parameter's maximum.
;
; Lives in DDR at 0xC00F2800 (the 70CDR OS uses the L2 this was in); calls go
; through a register.

        .equ    STEP, 0xC00F2020            ; step.S, then the stock midi_channel_msg
        .equ    FX_PARAM_DESC, 0xC00B056C   ; (slot, param) -> descriptor, max at +12
        .equ    FX_SET_PARAM, 0xC00BB600
        .equ    SEM_PEND, 0xC00C7EE0
        .equ    SEM_POST, 0xC00D6B00
        .equ    UI_REFRESH, 0xC00ACD84
        .equ    EVENT_POST, 0xC00CBF40
        .equ    SEM_HANDLE_OFS, 764          ; B14 offsets
        .equ    UI_EVENT_OFS, 656
        .equ    RECIP_127, 33818641     ; ceil(2^32 / 127)

; Far call: B5 = target, B3 = return label. Arguments must be set before.
        .macro  FARCALL target
        mvkl    .S2     \target, b5
        mvkh    .S2     \target, b5
        b       .S2     b5
        mvkl    .S2     ret\@, b3
        mvkh    .S2     ret\@, b3
        nop     3
ret\@:
        .endm

        .text
        .nocmp
        .global cc_handler
cc_handler:
        mvk     .S1     14, a0
        sub     .L1     a6, a0, a1          ; a1 = cc - 14
        mvk     .S1     59, a0
        cmpgtu  .L1     a1, a0, a2          ; not 14..73 -> stock
  [!a2] b       .S1     ours
        nop     5
        ; Tail call into step.S: arguments and B3 untouched.
        mvkl    .S2     STEP, b0
        mvkh    .S2     STEP, b0
        b       .S2     b0
        nop     5

ours:
        addk    .S2     -32, b15
        stw     .D2T2   b3, *+b15(8)
        stw     .D2T1   a10, *+b15(12)
        stw     .D2T1   a11, *+b15(16)
        stw     .D2T1   a12, *+b15(20)
        stw     .D2T1   a13, *+b15(24)
        mv      .L1X    b6, a13             ; a13 = CC value
        add     .L1     10, a1, a10         ; a10 = cc - 4 (10..69)
        mvk     .S1     205, a0
        mpy     .M1     a10, a0, a11        ; n = (x * 205) >> 11 = x / 10
        nop     1
        shru    .S1     a11, 11, a11        ; a11 = n (1..6)
        mvk     .S1     10, a0
        mpy     .M1     a11, a0, a0
        nop     1
        sub     .L1     a10, a0, a12        ; a12 = k (0..9)
        add     .L1     -1, a11, a11        ; a11 = slot (0..5)
        mv      .L1     a12, a2
  [a2]  b       .S1     knob
        nop     5

        ; k = 0: on/off, param 0, value 1 if CC value >= 64
        mvk     .L1     0, a10
        shru    .S1     a13, 6, a13
        b       .S1     apply
        nop     5

knob:
        add     .L1     1, a12, a10         ; param = k + 1
        mv      .L1     a11, a4
        mv      .L2X    a10, b4
        FARCALL FX_PARAM_DESC               ; a4 = descriptor
        ldw     .D1T1   *+a4(12), a0        ; parameter maximum
        nop     4
        mpy32   .M1     a13, a0, a1         ; value * max
        nop     3
        addk    .S1     63, a1              ; round to nearest
        mvkl    .S1     RECIP_127, a0
        mvkh    .S1     RECIP_127, a0
        mpy32u  .M1     a1, a0, a3:a2       ; a3 = (value * max + 63) / 127
        nop     3
        mv      .L1     a3, a13

apply:
        ldw     .D2T1   *+b14(SEM_HANDLE_OFS), a4
        mvk     .L2     -1, b4
        FARCALL SEM_PEND
        mv      .L1     a11, a4
        mv      .L2X    a10, b4
        mv      .L1     a13, a6
        mvk     .L2     0, b6
        mvk     .L1     1, a8
        FARCALL FX_SET_PARAM
        ldw     .D2T1   *+b14(SEM_HANDLE_OFS), a4
        FARCALL SEM_POST
        FARCALL UI_REFRESH
        ldw     .D2T1   *+b14(UI_EVENT_OFS), a4
        mvk     .S2     64, b4
        FARCALL EVENT_POST

        ldw     .D2T2   *+b15(8), b3
        ldw     .D2T1   *+b15(12), a10
        ldw     .D2T1   *+b15(16), a11
        ldw     .D2T1   *+b15(20), a12
        ldw     .D2T1   *+b15(24), a13
        addk    .S2     32, b15
        b       .S2     b3
        nop     5
