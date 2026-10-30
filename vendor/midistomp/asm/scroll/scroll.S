; Faster effect scrolling with wrap (issue #37), MS-70CDR 2.10 OS.
;
; Left/right in the effect view (released, events 73/75) call the stock
; slide step(dir) at 0xC00C4AE4: 4 frames of 32 px with sleep(100) between
; them, so about 0.4 s a step. At the end of the chain the handler calls a
; 2 px bump (0xC00C4C4C) instead.
;   frame_sleep: the slide's sleep(100) call goes here: sleeps V_FRAME ms
;                (FRAME_MS, or WRAP_MS while wrapping).
;   wrap(dir):   replaces the bump: slides back across the chain with
;                step(-dir) until the other end, WRAP_MS frames, then the
;                stock bump in the travel direction (a stop), its 125 ms
;                pause cut to BOUNCE_MS.
; End tests are the key handler's own (0xC00AC38C-0xC00AC400): +1 ends at
; cursor byte == 6 - effect count (word 1), -1 ends at cursor byte == 5.
;
; In DDR at 0xC00F2100, RAM test region 1 (issue #19), after midi-cc's
; step.S at 0xC00F2020 (scroll.yaml).

        .equ    STOCK_STEP, 0xC00C4AE4      ; step(A4 = dir +1 / -1)
        .equ    STOCK_SLEEP, 0xC00CEBC0     ; sleep(A4 = ms), inferred
        .equ    STOCK_BUMP, 0xC00C4C4C      ; bump(A4 = dir): 2 px out, sleep, back
        .equ    CURSOR, 0xC009C064          ; byte 0 = cursor (5 = effect 1), word 1 = effect count
        .equ    FRAME_MS, 8                 ; stock 100
        .equ    WRAP_MS, 5
        .equ    BOUNCE_MS, 30               ; stock 125
        .equ    MAX_STEPS, 6                ; never loop if a step can't move

        .macro  FCALL target
        mvkl    .S2     \target, b5
        mvkh    .S2     \target, b5
        b       .S2     b5
        addkpc  .S2     ret\@, b3, 4
ret\@:
        .endm

        .text
        .nocmp
        .global frame_sleep
frame_sleep:    ; tail call, B3 untouched
        mvkl    .S1     v_frame, a3
        mvkh    .S1     v_frame, a3
        ldw     .D1T1   *a3, a4
        mvkl    .S2     STOCK_SLEEP, b0
        mvkh    .S2     STOCK_SLEEP, b0
        b       .S2     b0
        nop     5

        .global wrap
wrap:           ; A4 = dir of the key that hit the end
        addk    .S2     -16, b15
        stw     .D2T2   b3, *+b15(4)
        stw     .D2T1   a10, *+b15(8)
        stw     .D2T1   a11, *+b15(12)
        neg     .L1     a4, a10             ; slide back
        mvk     .S1     MAX_STEPS, a11
        mvkl    .S1     v_frame, a3
        mvkh    .S1     v_frame, a3
        mvk     .S1     WRAP_MS, a0
        stw     .D1T1   a0, *a3
wrap_loop:
        mvkl    .S1     CURSOR, a3
        mvkh    .S1     CURSOR, a3
        ldb     .D1T1   *a3, a5             ; cursor, as 0xC00C0834(0)
        ldw     .D1T1   *+a3(4), a6
        nop     4
        mvk     .S1     6, a7
        sub     .L1     a7, a6, a6          ; +1 end: 6 - effects
        mvk     .S1     5, a7               ; -1 end
        cmplt   .L1     0, a10, a1          ; going +1
  [!a1] mv      .L1     a7, a6
        cmpeq   .L1     a5, a6, a2          ; at the other end
        cmpeq   .L1     0, a11, a0
        or      .L1     a0, a2, a2
  [a2]  b       .S1     wrap_done
        nop     5
        mv      .L1     a10, a4
        FCALL   STOCK_STEP
        add     .L1     -1, a11, a11
        b       .S1     wrap_loop
        nop     5
wrap_done:
        mvkl    .S1     v_frame, a3
        mvkh    .S1     v_frame, a3
        mvk     .S1     BOUNCE_MS, a0
        stw     .D1T1   a0, *a3
        mv      .L1     a10, a4
        FCALL   STOCK_BUMP
        mvkl    .S1     v_frame, a3
        mvkh    .S1     v_frame, a3
        mvk     .S1     FRAME_MS, a0
        stw     .D1T1   a0, *a3
        ldw     .D2T2   *+b15(4), b3
        ldw     .D2T1   *+b15(8), a10
        ldw     .D2T1   *+b15(12), a11
        nop     4
        addk    .S2     16, b15
        b       .S2     b3
        nop     5

v_frame:
        .word   FRAME_MS
