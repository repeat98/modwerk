; Diagnostic stand-in for clock.S (issue #5, first flash test failed).
; Same hook, address and calling contract as clock.S; it answers two
; questions on the pedal's tap tempo screen:
;   1. Does setting the tempo from Task_MIDI work and show?
;      CC 80 (any channel), value v -> tempo 40 + v.
;   2. Do MIDI clock bytes (0xF8) reach Task_MIDI at all?
;      Every 24th clock byte -> tempo + 1 (250 wraps to 40). No timing.
; CC 80 is detected from Task_MIDI's parser state after the CC is done:
; running status (B14+232) 0xBn, first data byte (B14+233) 80, data count
; (B14+235) back to 0, and the byte just taken (B14+234) is the value.

        .equ    SET_SETTING, 0xC00CAC64
        .equ    TEMPO_SETTING, 0xC00EE3D8
        .equ    TEMPO_VALUE, 0xC009C06C
        .equ    UI_REFRESH, 0xC00ACEA4
        .equ    EVENT_POST, 0xC00CC680
        .equ    UI_EVENT_OFS, 676
        .equ    VARS, 0x1181E3C0            ; +0 = clock byte count
        .equ    STACK_TOP, 0x1181FFF8

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
        .global clock_hook
clock_hook:
        ldbu    .D2T2   *+b14(234), b0      ; the byte just taken
        mvk     .S2     0xF8, b1
        nop     3
        cmpeq   .L2     b0, b1, b2
  [b2]  b       .S2     slow
        nop     5
        ldbu    .D2T2   *+b14(235), b1      ; CC 80 finished?
        ldbu    .D2T2   *+b14(233), b2
        nop     4
  [b1]  b       .S2     back
        mvk     .S2     80, b1
        cmpeq   .L2     b2, b1, b2
        ldbu    .D2T2   *+b14(232), b1
        nop     2
  [!b2] b       .S2     back
        nop     2
        shru    .S2     b1, 4, b1
        mvk     .S2     11, b2
        cmpeq   .L2     b1, b2, b2
  [b2]  b       .S2     slow
        nop     5
back:
        ldw     .D2T2   *+b14(224), b0      ; the replaced instruction
        b       .S2     b3
        nop     5

slow:
        addk    .S2     -32, b15
        stw     .D2T2   b3, *+b15(8)
        stw     .D2T1   a10, *+b15(12)
        stw     .D2T1   a11, *+b15(16)
        stw     .D2T1   a12, *+b15(20)
        stw     .D2T2   b10, *+b15(28)
        mv      .L2     b15, b10
        mvkl    .S2     STACK_TOP, b15
        mvkh    .S2     STACK_TOP, b15
        mvkl    .S1     VARS, a10
        mvkh    .S1     VARS, a10
        mvkl    .S1     TEMPO_VALUE, a0
        mvkh    .S1     TEMPO_VALUE, a0
        ldw     .D1T1   *a0, a12            ; a12 = tempo now
        ldbu    .D2T1   *+b14(234), a11     ; a11 = byte
        mvk     .S1     0xF8, a1
        nop     3
        cmpeq   .L1     a11, a1, a1
  [a1]  b       .S1     clockbyte
        nop     5

        ; CC 80: tempo = 40 + value
        add     .L1     10, a11, a12
        addk    .S1     30, a12
        b       .S1     apply
        nop     5

clockbyte:
        ldw     .D1T1   *+a10(0), a0
        mvk     .S1     24, a1
        nop     3
        add     .L1     1, a0, a0
        cmpeq   .L1     a0, a1, a2
  [a2]  mvk     .L1     0, a0
        stw     .D1T1   a0, *+a10(0)
  [!a2] b       .S1     out
        nop     5
        add     .L1     1, a12, a12         ; one more BPM per 24 clocks
        mvk     .S1     250, a1
        cmpgt   .L1     a12, a1, a2
  [a2]  mvk     .S1     40, a12

apply:
        mvkl    .S1     TEMPO_SETTING, a4
        mvkh    .S1     TEMPO_SETTING, a4
        mv      .L2X    a12, b4
        mvk     .L1     0, a6
        FARCALL SET_SETTING
        FARCALL UI_REFRESH
        ldw     .D2T1   *+b14(UI_EVENT_OFS), a4
        mvk     .S2     64, b4
        FARCALL EVENT_POST

out:
        mv      .L2     b10, b15
        nop     1
        ldw     .D2T2   *+b15(8), b3
        ldw     .D2T1   *+b15(12), a10
        ldw     .D2T1   *+b15(16), a11
        ldw     .D2T1   *+b15(20), a12
        ldw     .D2T2   *+b15(28), b10
        addk    .S2     32, b15
        ldw     .D2T2   *+b14(224), b0      ; the replaced instruction
        b       .S2     b3
        nop     5
