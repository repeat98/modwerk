; Second diagnostic for the MIDI clock patch (issue #5). Exactly clock.S
; with the smoothing step removed: every beat from the third on, the
; measured tempo is applied as is. Correct BPM on the display = the timing
; and division work and the smoothing step is at fault; 40 or 250 = the time
; source is not in milliseconds; no change = the beat logic never measures.

        .equ    CLOCK_GETTICKS, 0xC00DF360  ; SYS/BIOS Clock_getTicks, 1 ms
        .equ    DIVU, 0xC00DCA20            ; a4 = a4 / b4 (unsigned), RTS
        .equ    SET_SETTING, 0xC00CAC64     ; (setting, value, notify)
        .equ    TEMPO_SETTING, 0xC00EE3D8   ; value ptr, min 40, max 250
        .equ    TEMPO_VALUE, 0xC009C06C     ; current patch tempo (BPM)
        .equ    UI_REFRESH, 0xC00ACEA4
        .equ    EVENT_POST, 0xC00CC680
        .equ    UI_EVENT_OFS, 676
        .equ    VARS, 0x1181E3C0            ; 32 zero bytes, clock_vars section
        .equ    V_COUNT, 0                  ; ticks since the last beat (0..23)
        .equ    V_LAST, 4                   ; time of the last tick
        .equ    V_BEAT1, 8                  ; time of the last beat
        .equ    V_BEAT2, 12                 ; time of the beat before
        .equ    V_BEATS, 16                 ; beats seen since restart (0..2)
        .equ    V_PEND, 20                  ; tempo 1 off, waiting to be confirmed
        .equ    STACK_TOP, 0x1181FFF8       ; private stack 0x1181F000-0x1181FFFF
        .equ    GAP_MS, 250
        .equ    SPAN_MIN, 480               ; 2 beats at 250 BPM
        .equ    SPAN_MAX, 3000              ; 2 beats at 40 BPM

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
        .global clock_hook
clock_hook:
        ldbu    .D2T2   *+b14(234), b0      ; the byte just taken
        mvk     .S2     0xF8, b1
        nop     3
        cmpeq   .L2     b0, b1, b2
  [b2]  b       .S2     tick
        nop     5
        ldw     .D2T2   *+b14(224), b0      ; the replaced instruction
        b       .S2     b3
        nop     5

tick:
        addk    .S2     -32, b15
        stw     .D2T2   b3, *+b15(8)
        stw     .D2T1   a10, *+b15(12)
        stw     .D2T1   a11, *+b15(16)
        stw     .D2T1   a12, *+b15(20)
        stw     .D2T1   a13, *+b15(24)
        stw     .D2T2   b10, *+b15(28)
        mv      .L2     b15, b10            ; b10 = Task_MIDI's stack
        mvkl    .S2     STACK_TOP, b15
        mvkh    .S2     STACK_TOP, b15
        mvkl    .S1     VARS, a10
        mvkh    .S1     VARS, a10

        FARCALL CLOCK_GETTICKS
        mv      .L1     a4, a11             ; a11 = now (ms)
        ldw     .D1T1   *+a10(V_LAST), a0
        stw     .D1T1   a11, *+a10(V_LAST)
        mvk     .S1     GAP_MS, a1
        mvk     .L1     0, a3
        nop     2
        sub     .L1     a11, a0, a0         ; ms since the previous tick
        cmpgtu  .L1     a0, a1, a2          ; first tick after a gap:
  [a2]  stw     .D1T1   a3, *+a10(V_COUNT)  ;   restart counting
  [a2]  stw     .D1T1   a3, *+a10(V_BEATS)

        ; Count ticks; only every 24th (count was 0) is a beat.
        ldw     .D1T1   *+a10(V_COUNT), a12
        mvk     .S1     24, a1
        nop     3
        add     .L1     1, a12, a0
        cmpeq   .L1     a0, a1, a2
  [a2]  mvk     .L1     0, a0
        stw     .D1T1   a0, *+a10(V_COUNT)
        mv      .L1     a12, a1
  [a1]  b       .S1     out
        nop     5

        ; Beat: shift the beat times; need two earlier beats to measure.
        ldw     .D1T1   *+a10(V_BEATS), a1
        ldw     .D1T1   *+a10(V_BEAT1), a0
        ldw     .D1T1   *+a10(V_BEAT2), a12 ; two beats ago
        nop     4
        stw     .D1T1   a0, *+a10(V_BEAT2)
        stw     .D1T1   a11, *+a10(V_BEAT1)
        mvk     .S1     2, a2
        cmplt   .L1     a1, a2, a2          ; fewer than 2 beats so far
  [a2]  add     .L1     1, a1, a1
  [a2]  stw     .D1T1   a1, *+a10(V_BEATS)
  [a2]  b       .S1     out
        nop     5

        ; bpm = (120000 + span/2) / span, span = ms for the last 2 beats
        sub     .L1     a11, a12, a12
        mvk     .S1     SPAN_MIN, a0
        cmpltu  .L1     a12, a0, a1
  [a1]  mv      .L1     a0, a12
        mvk     .S1     SPAN_MAX, a0
        cmpgtu  .L1     a12, a0, a1
  [a1]  mv      .L1     a0, a12
        shru    .S1     a12, 1, a4
        mvkl    .S1     120000, a0
        mvkh    .S1     120000, a0
        add     .L1     a0, a4, a4
        mv      .L2X    a12, b4
        FARCALL DIVU
        mv      .L1     a4, a12             ; a12 = measured bpm (40..250)

        ; Apply like tap tempo (no notification to an editor), then refresh.
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
        mv      .L2     b10, b15            ; back to Task_MIDI's stack
        nop     1
        ldw     .D2T2   *+b15(8), b3
        ldw     .D2T1   *+b15(12), a10
        ldw     .D2T1   *+b15(16), a11
        ldw     .D2T1   *+b15(20), a12
        ldw     .D2T1   *+b15(24), a13
        ldw     .D2T2   *+b15(28), b10
        addk    .S2     32, b15
        ldw     .D2T2   *+b14(224), b0      ; the replaced instruction
        b       .S2     b3
        nop     5
