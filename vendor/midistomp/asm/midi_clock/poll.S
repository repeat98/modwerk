; Transport block upkeep (issue #24), MS-70CDR 2.10 OS.
;
; Task_SwitchNrmlSpdRead polls the footswitches every 16 ms and starts each
; round with Clock_getTicks (callp at 0xC00C6998). That call is retargeted to
; poll_trampoline.S, which jumps here. This does the same job (returns the
; time in A4, keeps every callee-saved register) and on the way:
;   - clears "running" when no clock came for STALE_MS, neither since the
;     last clock nor since Start (a cable pulled without a Stop);
;   - applies a tempo clock.S asked for (V_WANT) like tap tempo does, so
;     Task_MIDI never waits while the effects retune (v0.4 fix2);
;   - copies a new patch TEMPO (tap, TEMPO setting, patch load) into the block
;     as BPM x 100, unless the clock is live: then clock.S owns the tempo.
;     A TEMPO change while the clock is live (the clock setting it) is only
;     noted, so after the clock stops effects keep its finer tempo until
;     TEMPO changes again;
;   - lets TEMPO LOCK (settings.S) put the tempo back after a patch change.

        .include "transport.inc"
        .equ    STALE_MS, 500
        .equ    TEMPO_LOCK, 0x1181EAA8      ; settings.S tempo_lock vector

        .text
        .nocmp
        .global poll_hook
poll_hook:
        addk    .S2     -16, b15
        stw     .D2T2   b3, *+b15(16)
        FARCALL CLOCK_GETTICKS              ; a4 = now, returned as is
        stw     .D2T1   a4, *+b15(12)
        mvkl    .S1     VARS, a0
        mvkh    .S1     VARS, a0
        mvkl    .S2     TEMPO_VALUE, b0
        mvkh    .S2     TEMPO_VALUE, b0
        mvkl    .S1     BLOCK, a1
        mvkh    .S1     BLOCK, a1
        ldw     .D1T1   *+a0(V_LAST), a2
        ldw     .D1T1   *+a0(V_STARTT), a3
        ldw     .D1T1   *+a1(B_RUN), a8
        ldw     .D1T1   *+a0(V_PSEEN), a9
        ldw     .D2T2   *b0, b1             ; b1 = patch TEMPO
        mvk     .S1     STALE_MS, a7
        nop     3
        cmpeq   .L1     0, a2, a6           ; no clock since boot
        sub     .L1     a4, a2, a2
        sub     .L1     a4, a3, a3
        cmpgtu  .L1     a2, a7, a2
        or      .L1     a6, a2, a2          ; a2 = clock silent
        cmpgtu  .L1     a3, a7, a3          ; a3 = Start is not recent
        and     .L1     a2, a3, a3
        and     .L1     a8, a3, a1          ; running, but nothing came
  [!a1] b       .S1     tempo
        nop     5
        PUB_BEGIN
        mvk     .L1     0, a3
        stw     .D1T1   a3, *+a5(B_RUN)
        PUB_END

tempo:
        cmpeq   .L1X    a9, b1, a1
  [a1]  b       .S1     out                 ; TEMPO unchanged
        nop     5
        stw     .D1T2   b1, *+a0(V_PSEEN)
  [!a2] b       .S1     out                 ; the clock owns the tempo
        nop     5
        mvk     .S2     100, b2
        mpy     .M2     b1, b2, b2          ; 40..250 fits 16 bits
        nop     1
        PUB_BEGIN
        stw     .D1T2   b2, *+a5(B_TEMPO)
        PUB_END

out:
        FARCALL TEMPO_LOCK                  ; may ask for the kept tempo (v0.5)
        ; A tempo from the clock: take it (interrupts off, Task_MIDI may
        ; write a newer one any time) and apply it like tap tempo.
        mvkl    .S1     VARS, a0
        mvkh    .S1     VARS, a0
        mvk     .L1     0, a2
        mvc     .S2     csr, b6
        and     .L2     -2, b6, b7
        mvc     .S2     b7, csr
        ldw     .D1T2   *+a0(V_WANT), b4
        stw     .D1T1   a2, *+a0(V_WANT)
        nop     3
        mvc     .S2     b6, csr
        mv      .L1X    b4, a1
  [!a1] b       .S1     done
        nop     5
        mvkl    .S1     TEMPO_SETTING, a4
        mvkh    .S1     TEMPO_SETTING, a4
        mvk     .L1     0, a6               ; no editor notification
        FARCALL SET_SETTING
        ldw     .D2T1   *+b14(UI_EVENT_OFS), a4
        mvk     .S2     64, b4
        FARCALL EVENT_POST
done:
        ldw     .D2T1   *+b15(12), a4       ; now
        ldw     .D2T2   *+b15(16), b3
        addk    .S2     16, b15
        nop     4
        b       .S2     b3
        nop     5
