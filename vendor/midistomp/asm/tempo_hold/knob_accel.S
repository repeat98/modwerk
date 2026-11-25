; Tempo knob speed-up (MS-70CDR 2.10 OS): A4 = knob 1 steps -> A4 = steps,
; bigger on a fast turn. The same curve as the mixer's knob_step (port of the
; stock step 0xC00ABE58) with range 210 (40-250 BPM): when the last key event
; was knob 1 too and a detent took iv < 20 ms, steps * (21 - iv) * 210 / 150
; (0 keeps the plain steps). Called by hold.S knob_hook; hold.S's L2 slot is
; full, so this sits at the end of looper.S's DDR budget (0xC00F2700).

        .include "hold.inc"

        .equ    LAST_EVENT, 0xC009D024      ; stock: last key-loop event
        .equ    DIVI, 0xC00DB5A0            ; stock signed divide (A4 / B4)

        .text
        .nocmp
knob_accel:
        addk    .S2     -16, b15
        stw     .D2T2   b3, *+b15(4)
        stw     .D2T1   a4, *+b15(8)        ; steps
        mvkl    .S1     LAST_EVENT, a0
        mvkh    .S1     LAST_EVENT, a0
        ldw     .D1T1   *a0, a1
        mvk     .S1     EV_KNOB1, a0
        mv      .L1     a4, a2
        nop     3
        cmpeq   .L1     a1, a0, a1          ; knob 1 again
  [!a2] mvk     .L1     0, a1
  [!a1] b       .S1     accel_done
        nop     5
        FCALL   CLOCK_GETTICKS
        mvkl    .S1     HV, a0
        mvkh    .S1     HV, a0
        ldw     .D1T1   *+a0(V_KTIME), a1
        ldw     .D2T2   *+b15(8), b4
        stw     .D1T1   a4, *+a0(V_KTIME)
        nop     3
        sub     .L1     a4, a1, a4          ; ms since the last turn
        abs     .L2     b4, b4
        FCALL   DIVI                        ; iv, ms a detent
        mvk     .S1     20, a0
        cmplt   .L1     a4, a0, a1
  [!a1] b       .S1     accel_done
        ldw     .D2T1   *+b15(8), a5
        mvk     .S1     21, a0
        sub     .L1     a0, a4, a4
        mvk     .S1     210, a6
        nop     2
        mpy32   .M1     a4, a5, a4          ; stock order: (21 - iv) * steps * range
        nop     3
        mpy32   .M1     a4, a6, a4
        mvk     .S2     150, b4
        nop     2
        FCALL   DIVI
        mv      .L1     a4, a1
  [a1]  stw     .D2T1   a1, *+b15(8)        ; 0 keeps the plain steps
accel_done:
        ldw     .D2T2   *+b15(4), b3
        ldw     .D2T1   *+b15(8), a4
        nop     4
        addk    .S2     16, b15
        b       .S2     b3
        nop     5
