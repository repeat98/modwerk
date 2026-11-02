; MIDI CC -> previous / next patch (issue #34), MS-70CDR 2.10 OS.
;
;   CC 80, value >= 64: previous patch (patch 1 wraps to 50)
;   CC 81, value >= 64: next patch (patch 50 wraps to 1)
; Values below 64 do nothing, so a button that sends 127 on press and 0 on
; release steps once. CC 80/81 are the MIDI spec's general purpose buttons.
;
; handler.S jumps here for every CC outside its 14-73 map, with the stock
; midi_channel_msg(type, channel, number, value) arguments:
;   A4 = 0 (CC)   B4 = channel   A6 = CC number   B6 = CC value   B3 = return
; A step becomes a Program Change to the stock midi_channel_msg (A4 = 1,
; A6 = patch 0-49), which loads it like PC does. Other CCs go on to it
; unchanged. Behind the MIDI menu's channel filter and CC RECEIVE (the gate
; in settings.S runs first), not behind PROG CH RECEIVE or START NO.
;
; In DDR at 0xC00F2020, in the first region the RAM test (issue #19) confirmed
; unused, after version-1.0.yaml's string at 0xC00F2000 (midi-cc.yaml); leaf.

        .equ    STOCK_CHANNEL_MSG, 0xC00ADF20
        .equ    CUR_PATCH, 324              ; B14 offset, current patch 0-49
        .equ    PATCHES, 50
        .equ    CC_PREV, 80                 ; CC_NEXT = CC_PREV + 1

        .text
        .nocmp
        .global step
step:
        mvk     .S1     CC_PREV, a0
        sub     .L1     a6, a0, a1          ; a1 = 0 prev, 1 next
        mvk     .S1     1, a0
        cmpgtu  .L1     a1, a0, a2          ; not CC 80/81 -> stock
  [a2]  b       .S1     stock
        nop     5
        shru    .S2     b6, 6, b0           ; value >= 64
  [!b0] b       .S2     b3                  ; release: nothing
        nop     5
        ldw     .D2T1   *+b14(CUR_PATCH), a6
        add     .L1     a1, a1, a1
        add     .L1     -1, a1, a1          ; -1 prev, +1 next
        mvk     .S1     PATCHES, a0
        mvk     .S1     0, a5
        nop     1
        add     .L1     a6, a1, a6
        cmplt   .L1     a6, a5, a2          ; before patch 1
  [a2]  add     .L1     a6, a0, a6
        cmplt   .L1     a6, a0, a2          ; past patch 50
  [!a2] sub     .L1     a6, a0, a6
        mvk     .L1     1, a4               ; Program Change
        mvk     .L2     0, b6               ; as the stock PC call site
stock:
        ; Tail call, B3 untouched.
        mvkl    .S2     STOCK_CHANNEL_MSG, b0
        mvkh    .S2     STOCK_CHANNEL_MSG, b0
        b       .S2     b0
        nop     5
