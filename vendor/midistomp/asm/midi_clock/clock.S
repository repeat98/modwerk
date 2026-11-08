; MIDI clock -> patch tempo (issue #5), MS-70CDR 2.10 OS.
;
; Hook: Task_MIDI's byte loop ends every byte, realtime bytes included, at
; 0xC00AEEE0 ("ldw *+b14(216),b0", read index of the receive ring). That word
; becomes "callp clock_trampoline" (trampoline.S), so this code runs once per
; received byte with the byte at B14+226 and B3 = return into Task_MIDI. It
; runs the replaced load before returning. Only callee-saved A10 is live in
; Task_MIDI here, so B0-B2 are free on the fast path.
;
; The MIDI settings page (v0.5, asm/midi_settings/settings.S) can turn off
; MIDI CLOCK (no tempo from the clock) and START/STOP (no Start, Stop or clock
; count in the transport block); both are on by default.
;
; Every byte other than 0xF8 (timing clock), 0xFA (start) and 0xFC (stop)
; returns at once; continue (0xFB) is ignored. Start and stop only update the
; transport block (transport.inc); every clock counts in it while running.
;
; Tempo from the clock (24 ticks per quarter note):
;   - a gap of more than GAP_MS between ticks restarts the measurement;
;   - a beat's time is the sum of its 24 tick times (24 x their mean;
;     fix7): one late tick moves it by 1/24 as much as when one tick per
;     beat was timed, and fix6 still re-applied at 220 BPM from that jitter;
;     sums go in a ring of the last 8 beats, differences are mod 2^32;
;   - from the third beat on, the last 2 beats give a quick tempo; when it
;     is 4 BPM or more from the tempo applied last and within 2 BPM of the
;     previous beat's quick tempo (or nothing was applied since the clock
;     started), it is applied and the average restarts (lock in 3 beats,
;     follow a change in about 3 without applying in-between values);
;   - otherwise the average over all beats in the ring (4 to 8) is applied
;     only when it is 0.8 BPM or more from the tempo applied last (fix5):
;     every apply restarts a stock delay, and with a 2-beat measurement
;     clock jitter flipped the tempo between 140 and 141 on the pedal;
;   - tempos are kept as 10 x BPM and clamped to 40..250 BPM like tap tempo.
; Applying hands the tempo to poll.S (V_WANT), which does what tap tempo does
; from the footswitch task: set_setting(TEMPO, bpm), whose change
; callback takes the effect semaphore and retunes the effects, then
; Event_post(UI, 0x40) so the UI task redraws.
;
; The slow path runs on Task_MIDI's own 2 KB stack (fix3). Builds up to fix2
; switched to a private stack in L2; the pedal froze when the tempo changed
; with a delay on, i.e. when the delay's own tempo code ran on that stack.
; Stock Program Change already loads whole patches from Task_MIDI on its own
; stack, so that is the context the effects are used to.

        .include "transport.inc"
        .equ    DIVU, 0xC00DC560            ; a4 = a4 / b4 (unsigned), RTS
        .equ    HYST10, 8                   ; average: apply 0.8 BPM or more away
        .equ    JUMP10, 40                  ; 2 beats: jump 4 BPM or more away
        .equ    AGREE10, 20                 ; ... and within 2 BPM of last beat's
        .equ    N_MIN, 4                    ; beats the average needs
        .equ    FAST_TICKS, 12              ; fast path: half a beat agreeing
        .equ    FAST_REL, 33                ; fast path: 1/33 = 3%
        .equ    GAP_MS, 250
        .equ    BPM10_MIN, 400              ; 40 BPM, like tap tempo
        .equ    BPM10_MAX, 2500             ; 250 BPM

; Publish a4 = 10 x BPM as the block tempo (BPM x 100). Uses A5-A8, B6, B7.
        .macro  PUBTEMPO
        shl     .S1     a4, 3, a7
        shl     .S1     a4, 1, a8
        add     .L1     a7, a8, a7
        PUB_BEGIN
        stw     .D1T1   a7, *+a5(B_TEMPO)
        PUB_END
        .endm

        .text
        .nocmp
        .global clock_hook
clock_hook:
        ldbu    .D2T2   *+b14(226), b0      ; the byte just taken
        mvk     .S2     0xF8, b1
        nop     3
        cmpeq   .L2     b0, b1, b2
  [b2]  b       .S2     tick
        nop     5
        mvk     .S2     0xFA, b1
        cmpeq   .L2     b0, b1, b2
  [b2]  b       .S2     start
        mvk     .S2     0xFC, b1
        cmpeq   .L2     b0, b1, b1
  [b1]  b       .S2     stop
        nop     5
done:
        ldw     .D2T2   *+b14(216), b0      ; the replaced instruction
        b       .S2     b3
        nop     5

        ; Start: running, one more start, no clocks yet. Its time keeps the
        ; poll (poll.S) from calling the clock stopped before the first one.
start:
        mvkl    .S1     MIDI_FLAGS, a0      ; START/STOP set to OFF (v0.5)
        mvkh    .S1     MIDI_FLAGS, a0
        ldw     .D1T1   *a0, a0
        nop     4
        and     .L1     OFF_TRANSPORT, a0, a0
  [a0]  b       .S2     done
        nop     5
        addk    .S2     -8, b15
        stw     .D2T2   b3, *+b15(8)
        FARCALL CLOCK_GETTICKS
        mvkl    .S1     VARS, a0
        mvkh    .S1     VARS, a0
        stw     .D1T1   a4, *+a0(V_STARTT)
        ldw     .D2T2   *+b15(8), b3
        addk    .S2     8, b15
        PUB_BEGIN
        ldw     .D1T1   *+a5(B_STARTS), a0
        mvk     .L1     1, a1
        mvk     .L1     0, a2
        nop     2
        add     .L1     1, a0, a0
        stw     .D1T1   a0, *+a5(B_STARTS)
        stw     .D1T1   a1, *+a5(B_RUN)
        stw     .D1T1   a2, *+a5(B_TICKS)
        PUB_END
        b       .S2     done
        nop     5

stop:
        mvkl    .S1     MIDI_FLAGS, a0
        mvkh    .S1     MIDI_FLAGS, a0
        ldw     .D1T1   *a0, a0
        nop     4
        and     .L1     OFF_TRANSPORT, a0, a0
  [a0]  b       .S2     done
        nop     5
        PUB_BEGIN
        mvk     .L1     0, a0
        stw     .D1T1   a0, *+a5(B_RUN)
        PUB_END
        b       .S2     done
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
        nop     1                           ; fix3: stay on Task_MIDI's stack
        mvkl    .S1     VARS, a10
        mvkh    .S1     VARS, a10

        FARCALL CLOCK_GETTICKS
        mv      .L1     a4, a11             ; a11 = now (ms)
        mvkl    .S1     MIDI_FLAGS, a12     ; a12 = MIDI settings (v0.5)
        mvkh    .S1     MIDI_FLAGS, a12
        ldw     .D1T1   *a12, a12
        nop     4
        and     .L1     OFF_TRANSPORT, a12, a0
  [a0]  b       .S1     counted             ; START/STOP off: no count
        nop     5
        PUB_BEGIN                           ; one more clock while running
        ldw     .D1T1   *+a5(B_RUN), a1
        ldw     .D1T1   *+a5(B_TICKS), a0
        nop     4
  [a1]  add     .L1     1, a0, a0
        stw     .D1T1   a0, *+a5(B_TICKS)
        PUB_END
counted:
        and     .L1     OFF_CLOCK, a12, a0
  [a0]  b       .S1     out                 ; MIDI CLOCK off: tempo stays
        nop     5
        ldw     .D1T1   *+a10(V_LAST), a0
        stw     .D1T1   a11, *+a10(V_LAST)
        mvk     .S1     GAP_MS, a1
        mvk     .L1     0, a3
        nop     2
        sub     .L1     a11, a0, a0         ; ms since the previous tick
        cmpgtu  .L1     a0, a1, a2          ; first tick after a gap:
  [a2]  stw     .D1T1   a3, *+a10(V_COUNT)  ;   restart counting
  [a2]  stw     .D1T1   a3, *+a10(V_BEATS)
  [a2]  stw     .D1T1   a3, *+a10(V_APPLIED10) ; and apply the next tempo
  [a2]  stw     .D1T1   a3, *+a10(V_SUM)
  [a2]  stw     .D1T1   a3, *+a10(V_PREVQ)
  [a2]  stw     .D1T1   a3, *+a10(V_NTK)
  [a2]  stw     .D1T1   a3, *+a10(V_RUN)

        ; Fast path (v0.4 fix1): every tick, the last 24 tick intervals (one
        ; beat) give 10 x bpm = (600000 + span/2) / span. When it is more
        ; than 3% from the tempo applied last for FAST_TICKS ticks in a row,
        ; each within 3% of the first, the average of those values is applied
        ; and the beat measurement starts again from here. A tempo change
        ; lands in about 1.5 beats instead of 3 to 4. Smaller changes still
        ; go through the beat path below. Simulated with up to 3 ms tick
        ; jitter: steady tempos are never re-applied; a change is applied
        ; once, now and then twice (the second time a fine correction).
        ldw     .D1T1   *+a10(V_TIDX), a1
        ldw     .D1T1   *+a10(V_NTK), a2
        nop     4
        addaw   .D1     a10, a1, a0
        ldw     .D1T1   *+a0(V_TR), a12     ; a12 = time 24 ticks ago
        stw     .D1T1   a11, *+a0(V_TR)
        add     .L1     1, a1, a1
        mvk     .S1     24, a5
        cmpeq   .L1     a1, a5, a0
  [a0]  mvk     .L1     0, a1
        stw     .D1T1   a1, *+a10(V_TIDX)
        cmplt   .L1     a2, a5, a0          ; ring not full yet
  [a0]  add     .L1     1, a2, a2
  [a0]  stw     .D1T1   a2, *+a10(V_NTK)
  [a0]  b       .S1     fast_out
        ldw     .D1T1   *+a10(V_APPLIED10), a13
        nop     4
        mv      .L1     a13, a0
  [!a0] b       .S1     fast_out            ; nothing applied yet
        nop     5
        sub     .L1     a11, a12, a0
  [!a0] mvk     .L1     1, a0               ; never divide by 0
        shru    .S1     a0, 1, a4
        mvkl    .S1     600000, a1
        mvkh    .S1     600000, a1
        add     .L1     a1, a4, a4
        mv      .L2X    a0, b4
        FARCALL DIVU
        mvk     .S1     BPM10_MIN, a0
        cmplt   .L1     a4, a0, a1
  [a1]  mv      .L1     a0, a4
        mvk     .S1     BPM10_MAX, a0
        cmpgt   .L1     a4, a0, a1
  [a1]  mv      .L1     a0, a4
        ldw     .D1T1   *+a10(V_RUN), a2
        ldw     .D1T1   *+a10(V_RQ), a5
        sub     .L1     a4, a13, a0
        abs     .L1     a0, a0
        mvk     .S1     FAST_REL, a1
        mpy     .M1     a0, a1, a0
        nop     1
        cmpgt   .L1     a0, a13, a0         ; more than 3% away
  [!a0] b       .S1     fast_reset
        nop     5
  [!a2] b       .S1     fast_new
        nop     5
        sub     .L1     a4, a5, a0
        abs     .L1     a0, a0
        mpy     .M1     a0, a1, a0
        nop     1
        cmpgt   .L1     a0, a5, a0          ; strays from the run
  [a0]  b       .S1     fast_reset
        ldw     .D1T1   *+a10(V_QS), a6
        nop     4
        b       .S1     fast_add
        nop     5
fast_new:
        stw     .D1T1   a4, *+a10(V_RQ)
        mvk     .L1     0, a6
fast_add:
        add     .L1     1, a2, a2
        add     .L1     a4, a6, a6
        stw     .D1T1   a2, *+a10(V_RUN)
        stw     .D1T1   a6, *+a10(V_QS)
        mvk     .S1     FAST_TICKS, a0
        cmplt   .L1     a2, a0, a0
  [a0]  b       .S1     fast_out
        nop     5
        mv      .L1     a6, a4              ; their average
        mvk     .S2     FAST_TICKS, b4
        FARCALL DIVU
        mvk     .L1     0, a3
        stw     .D1T1   a3, *+a10(V_RUN)
        stw     .D1T1   a3, *+a10(V_BEATS)  ; beats start again from here
        stw     .D1T1   a3, *+a10(V_COUNT)
        stw     .D1T1   a3, *+a10(V_SUM)
        stw     .D1T1   a3, *+a10(V_PREVQ)
        PUBTEMPO
        mv      .L1     a4, a12
        b       .S1     apply
        nop     5
fast_reset:
        mvk     .L1     0, a0
        stw     .D1T1   a0, *+a10(V_RUN)
fast_out:
        mvk     .L1     0, a3

        ; Count ticks and add up their times; the 24th completes a beat.
        ldw     .D1T1   *+a10(V_COUNT), a12
        ldw     .D1T1   *+a10(V_SUM), a13
        mvk     .S1     24, a1
        nop     3
        add     .L1     a11, a13, a13
        add     .L1     1, a12, a0
        cmpeq   .L1     a0, a1, a2          ; a2 = beat complete
  [a2]  mvk     .L1     0, a0
        stw     .D1T1   a0, *+a10(V_COUNT)
  [!a2] stw     .D1T1   a13, *+a10(V_SUM)
  [a2]  stw     .D1T1   a3, *+a10(V_SUM)
  [!a2] b       .S1     out
        nop     5
        mv      .L1     a13, a11            ; a11 = this beat's tick-time sum

        ; Beat: ring of the last 8 beat times (n = how many it holds).
        ldw     .D1T1   *+a10(V_IDX), a1
        ldw     .D1T1   *+a10(V_BEATS), a2
        nop     4
        add     .L1     -2, a1, a0
        and     .L1     7, a0, a0
        addaw   .D1     a10, a0, a0
        ldw     .D1T1   *+a0(V_RING), a12   ; a12 = time 2 beats ago
        sub     .L1     a1, a2, a0
        and     .L1     7, a0, a0
        addaw   .D1     a10, a0, a0
        ldw     .D1T1   *+a0(V_RING), a13   ; a13 = time n beats ago
        addaw   .D1     a10, a1, a0
        stw     .D1T1   a11, *+a0(V_RING)   ; this beat
        add     .L1     1, a1, a1
        and     .L1     7, a1, a1
        stw     .D1T1   a1, *+a10(V_IDX)
        stw     .D1T1   a2, *+a10(V_N)
        mvk     .S1     8, a1
        cmplt   .L1     a2, a1, a1          ; ring not full yet
  [a1]  add     .L1     1, a2, a0
  [a1]  stw     .D1T1   a0, *+a10(V_BEATS)
        mvk     .S1     2, a1
        cmplt   .L1     a2, a1, a1          ; need two earlier beats
  [a1]  b       .S1     out
        nop     5

        ; Quick measurement over the last 2 beats, span in 24ths of a ms:
        ; 10 x bpm = (28800000 + span/2) / span. A change of 4 BPM or more
        ; that agrees with the previous beat's quick value is a real tempo
        ; change (the windows right after a change straddle both tempos):
        ; apply it and restart the average from this beat. The first tempo
        ; after the clock starts needs no agreement.
        sub     .L1     a11, a12, a0
  [!a0] mvk     .L1     1, a0               ; never divide by 0
        shru    .S1     a0, 1, a4
        mvkl    .S1     28800000, a1
        mvkh    .S1     28800000, a1
        add     .L1     a1, a4, a4
        mv      .L2X    a0, b4
        FARCALL DIVU
        mvk     .S1     BPM10_MIN, a0
        cmplt   .L1     a4, a0, a1
  [a1]  mv      .L1     a0, a4
        mvk     .S1     BPM10_MAX, a0
        cmpgt   .L1     a4, a0, a1
  [a1]  mv      .L1     a0, a4
        ldw     .D1T1   *+a10(V_APPLIED10), a3
        ldw     .D1T1   *+a10(V_PREVQ), a2
        mvk     .S1     JUMP10, a1
        nop     3
        stw     .D1T1   a4, *+a10(V_PREVQ)
        sub     .L1     a4, a3, a0
        abs     .L1     a0, a0
        cmplt   .L1     a0, a1, a1          ; a1 = no jump
  [a1]  b       .S1     steady
        nop     5
        sub     .L1     a4, a2, a0
        abs     .L1     a0, a0
        mvk     .S1     AGREE10, a1
        cmplt   .L1     a0, a1, a1          ; agrees with the last beat
        cmpeq   .L1     0, a3, a0           ; nothing applied since the start
        or      .L1     a0, a1, a1
  [!a1] b       .S1     out                 ; wait for the next beat
        nop     5
        PUBTEMPO
        mvk     .L1     1, a0
        stw     .D1T1   a0, *+a10(V_BEATS)  ; the average starts again here
        mv      .L1     a4, a12
        b       .S1     apply
        nop     5

        ; Steady tempo: average over all n beats in the ring (4 to 8),
        ; 10 x bpm = (n x 14400000 + span/2) / span, applied only when it is
        ; 0.8 BPM or more from the tempo applied last. Each apply restarts
        ; a stock delay, and with 2 beats clock jitter flipped 140/141 BPM.
steady:
        ldw     .D1T1   *+a10(V_N), a1
        mvk     .S1     28125, a3           ; 14400000 = 28125 << 9
        mvk     .S1     N_MIN, a0
        nop     2
        cmplt   .L1     a1, a0, a2
  [a2]  b       .S1     out
        nop     5
        mpyu    .M1     a1, a3, a4
        sub     .L1     a11, a13, a0
  [!a0] mvk     .L1     1, a0
        shl     .S1     a4, 9, a4
        shru    .S1     a0, 1, a3
        add     .L1     a3, a4, a4
        mv      .L2X    a0, b4
        FARCALL DIVU
        mvk     .S1     BPM10_MIN, a0
        cmplt   .L1     a4, a0, a1
  [a1]  mv      .L1     a0, a4
        mvk     .S1     BPM10_MAX, a0
        cmpgt   .L1     a4, a0, a1
  [a1]  mv      .L1     a0, a4
        PUBTEMPO                            ; effects get every average
        ldw     .D1T1   *+a10(V_APPLIED10), a0
        mvk     .S1     HYST10, a1
        nop     3
        sub     .L1     a4, a0, a0
        abs     .L1     a0, a0
        cmplt   .L1     a0, a1, a1
  [a1]  b       .S1     out
        nop     5
        mv      .L1     a4, a12

apply:  ; a12 = 10 x tempo
        add     .L1     5, a12, a4          ; bpm = (bpm10 + 5) / 10
        mvk     .S2     10, b4
        FARCALL DIVU
        mv      .L1     a4, a12             ; a12 = tempo to apply (40..250)
        shl     .S1     a12, 3, a0
        shl     .S1     a12, 1, a1
        add     .L1     a0, a1, a0
        stw     .D1T1   a0, *+a10(V_APPLIED10)

        ; Hand the tempo to the poll (poll.S), which applies it from the
        ; footswitch task within 16 ms (v0.4 fix2): applying here blocked
        ; Task_MIDI while the effects retuned, and EuGate then came out a
        ; fixed number of clocks late after each tempo change.
        stw     .D1T1   a12, *+a10(V_WANT)

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
        ldw     .D2T2   *+b14(216), b0      ; the replaced instruction
        b       .S2     b3
        nop     5
