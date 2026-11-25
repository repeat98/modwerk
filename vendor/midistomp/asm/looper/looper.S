; Looper services (v2.0 step 2), MS-70CDR 2.10 OS.
;
; The Looper ZDL claims the services block (services.inc) with its params
; pointer and beats a heartbeat every audio block. This code, reached from
; four existing trampolines (looper.yaml), does the firmware's part:
;   poll_pre   16 ms round of Task_SwitchNrmlSpdRead, after the transport
;              poll: frees a claim whose heartbeat stopped, finds the
;              claimant's slot, works out whether the looper is under the
;              cursor in play mode (S_MINE), publishes the LED's GPIO
;              registers, and hands the LED back to the LED task when the
;              cursor leaves the looper.
;   toggle_pre footswitch press on slot A4: on the looper's slot it counts
;              a press instead of flipping the effect (no flip, no AUTO SAVE).
;   hold_pre   footswitch hold (event 224): nothing while on the looper.
;   cc_pre     MIDI CC: the looper slot's on/off CC (10n+4) counts a press
;              for values 64-127 and is dropped for 0-63.
;   The poll also writes transport words 6 (footswitch down) and 7 (hold
;   claim, cleared every round): docs/dev/transport-block.md.
; The status box is drawn by lbox.c; the poll asks the UI for a redraw when the
; text, the progress (in 64ths) or the inversion changes.
; Everything else goes on to the hooks the trampolines called before.
; Design and addresses: docs/dev/os-reverse-engineering.md, "Looper services".
;
; In DDR at 0xC00F2200, RAM test region 1, after scroll.S.

        .include "services.inc"
        .equ    POLL_HOOK, 0x1181E800       ; poll.S (transport upkeep), returns A4 = ticks
        .equ    TOGGLE_HOOK, 0x1181FA98     ; hold.S toggle_hook (MOMENTARY), then the flip
        .equ    HOLD_HOOK, 0x1181FF20       ; hold2.S hold_hook, then the stock hold
        .equ    CC_HANDLER, 0xC00F2800      ; midi_cc handler.S (DDR)
        .equ    HOLDV, 0x1181EA24           ; hold.inc HV: +0 V_HOLDM, +12 V_MARM, +20 V_PDOWN
        .equ    SCREEN, 352                 ; B14 offset, 11 (with MODE 11) = PERFORM MODE
        .equ    ZMT_FTSW, 0x1181FF18        ; transport word 6 (transport.inc B_FTSW), word 7 after it

        .macro  FCALL target
        mvkl    .S2     \target, b5
        mvkh    .S2     \target, b5
        b       .S2     b5
        addkpc  .S2     ret\@, b3, 4
ret\@:
        .endm

        .macro  JUMP target
        mvkl    .S2     \target, b0
        mvkh    .S2     \target, b0
        b       .S2     b0
        nop     5
        .endm

        .text
        .nocmp
vectors:
        b       .S2     poll_pre            ; +0
        nop     5
        b       .S2     toggle_pre          ; +8
        nop     5
        b       .S2     hold_pre            ; +16
        nop     5
        b       .S2     cc_pre              ; +24
        nop     5

; Called instead of poll.S; same contract: returns A4 = ticks, keeps every
; callee-saved register. Uses A0-A9, B0-B9.
poll_pre:
        addk    .S2     -16, b15
        stw     .D2T2   b3, *+b15(4)
        mvkl    .S2     POLL_HOOK, b5
        mvkh    .S2     POLL_HOOK, b5
        b       .S2     b5
        addkpc  .S2     polled, b3, 4
polled:
        stw     .D2T1   a4, *+b15(8)
        ; word 6 = a MOMENTARY press held (V_MARM) or, in PERFORM MODE, its
        ; footswitch down (V_PDOWN); word 7 = 0 (a loaded RISER writes it back)
        mvkl    .S1     HOLDV, a3
        mvkh    .S1     HOLDV, a3
        ldw     .D1T1   *+a3(12), a5
        ldw     .D1T1   *+a3(20), a6
        ldw     .D2T2   *+b14(MODE), b2
        ldw     .D2T2   *+b14(SCREEN), b3
        mvkl    .S1     ZMT_FTSW, a7
        mvkh    .S1     ZMT_FTSW, a7
        mvk     .L1     0, a8
        cmpeq   .L2     11, b2, b0
        cmpeq   .L2     11, b3, b2
        and     .L2     b0, b2, b0          ; PERFORM MODE: screen 11 in the menus
  [!b0] mvk     .L1     0, a6
        or      .L1     a5, a6, a5
        stw     .D1T1   a5, *a7
        stw     .D1T1   a8, *+a7(4)
        mvkl    .S1     SV, a0
        mvkh    .S1     SV, a0
        ldw     .D1T1   *+a0(S_CLAIM), a1
        ldw     .D1T1   *+a0(S_HB), a2
        ldw     .D1T1   *+a0(S_LASTHB), a3
        ldw     .D1T1   *+a0(S_STALE), a5
        nop     4
        stw     .D1T1   a2, *+a0(S_LASTHB)
        cmpeq   .L1     a2, a3, a6          ; no audio block since the last poll
        mv      .L2X    a6, b0
  [!b0] mvk     .L1     0, a5
  [b0]  add     .L1     1, a5, a5
        stw     .D1T1   a5, *+a0(S_STALE)
        cmplt   .L1     STALE_POLLS - 1, a5, a7
        mv      .L2X    a7, b0
  [b0]  mvk     .L1     0, a1               ; the looper is gone: free its claim
  [b0]  stw     .D1T1   a1, *+a0(S_CLAIM)

        ; the claimant's slot: the state block whose word 1 is its params pointer
        mvk     .L2     -1, b1
        mvkl    .S1     SLOT_STATE, a8
        mvkh    .S1     SLOT_STATE, a8
        mvk     .L1     0, a9
  [!a1] b       .S1     slot_done
        nop     5
slot_loop:
        ldw     .D1T1   *a8, a3
        nop     4
        cmpeq   .L1     a3, a1, a2
  [a2]  mv      .L2X    a9, b1
        addk    .S1     SLOT_STRIDE, a8
        add     .L1     1, a9, a9
        cmpgt   .L1     6, a9, a2
  [a2]  b       .S1     slot_loop
        nop     5
slot_done:
        stw     .D1T2   b1, *+a0(S_SLOT)

        ; the LED: GPIO pin 0, active low (the LED task writes 1 - "lit")
        mvkl    .S1     GPIO_BANK01, a3
        mvkh    .S1     GPIO_BANK01, a3
        ldw     .D1T1   *a3, a3
        mvk     .L1     1, a5
        nop     3
        add     .D1     a3, 28, a2          ; CLR_DATA: pin low, lit
        add     .D1     a3, 24, a4          ; SET_DATA: pin high, dark
        stw     .D1T1   a2, *+a0(S_LEDON)
        stw     .D1T1   a4, *+a0(S_LEDOFF)
        stw     .D1T1   a5, *+a0(S_LEDMASK)

        ; under the cursor in play mode?
        ldw     .D2T2   *+b14(MODE), b2
        mvkl    .S1     CURSOR, a3
        mvkh    .S1     CURSOR, a3
        ldb     .D1T1   *a3, a3
        nop     4
        mvkl    .S1     VIEW, a5
        mvkh    .S1     VIEW, a5
        ldw     .D1T1   *a5, a5
        nop     4
        shl     .S1     a5, 1, a4
        add     .L1     a4, a5, a4
        shl     .S1     a4, 1, a4           ; 6 x view
        add     .L1     a4, a3, a4          ; + cursor
        mvkl    .S1     CURSOR_SLOT, a5
        mvkh    .S1     CURSOR_SLOT, a5
        ldw     .D1T1   *+a5[a4], a4
        cmpltu  .L1     5, a3, a1           ; cursor not 0-5: no slot
        nop     3
  [a1]  mvk     .L1     -1, a4
        cmpeq   .L1X    a4, b1, a6          ; cursor slot is the looper's
        cmpeq   .L2     0, b2, b0           ; play mode
        mv      .L1X    b0, a2
        and     .L1     a6, a2, a6
        cmpgt   .L2     0, b1, b0           ; no looper
  [b0]  mvk     .L1     0, a6
        ldw     .D1T1   *+a0(S_WASMINE), a7
        stw     .D1T1   a6, *+a0(S_MINE)
        stw     .D1T1   a6, *+a0(S_WASMINE)
        nop     2
        andn    .L1     a7, a6, a7          ; was on the looper, isn't now
        ; word 22: params pointer of the effect under the cursor in play mode, 0 = none;
        ; the effect with that ctx[1] may drive the LED (Takeoff, GRDLOOP)
        mvk     .L1     0, a5
        cmpgtu  .L1     6, a4, a1           ; slot 0-5 (-1 fails)
        and     .L1     a1, a2, a1          ; and play mode
        mvk     .S1     SLOT_STRIDE, a8
        mpy     .M1     a4, a8, a8
        mvkl    .S1     SLOT_STATE, a9
        mvkh    .S1     SLOT_STATE, a9
        add     .L1     a9, a8, a9
  [a1]  ldw     .D1T1   *a9, a5
        ldw     .D1T1   *+a0(S_LEDOWN), a3
        nop     4
        stw     .D1T1   a5, *+a0(S_LEDOWN)
        cmpeq   .L1     a5, a3, a1
  [a1]  b       .S1     poll_redraw         ; same effect: leave the LED to it
        nop     5
        ; the cursor moved to another effect: flip the LED task's "written" bit so it
        ; writes the LED again (the stock LED comes back after an owner)
        mvkl    .S1     LED_APPLIED, a3
        mvkh    .S1     LED_APPLIED, a3
        ldw     .D1T1   *a3, a4
        nop     4
        xor     .L1     1, a4, a4
        stw     .D1T1   a4, *a3
poll_redraw:
        ; on the looper: redraw when the status text or the box's fill step changed;
        ; and once when it just left it (A7 = 1), so the stock view repaints the box
        ldw     .D1T1   *+a0(S_MINE), a1
        nop     4
        or      .L1     a1, a7, a1
  [!a1] b       .S1     poll_out
        nop     5
        ldw     .D1T1   *+a0(S_TEXT), a3
        ldw     .D1T1   *+a0(S_TEXT + 4), a4
        ldw     .D1T1   *+a0(S_PROG), a5
        ldw     .D1T1   *+a0(S_INV), a9
        ldw     .D1T1   *+a0(S_DTEXT), a6
        ldw     .D1T1   *+a0(S_DTEXT + 4), a7
        ldw     .D1T1   *+a0(S_DKEY), a8
        shl     .S1     a7, 31, a2          ; just left: a key that never matches (A7 is still the flag)
        nop     3
        shru    .S1     a5, 2, a5
        shl     .S1     a9, 8, a9
        xor     .L1     a8, a2, a8
        or      .L1     a5, a9, a5          ; progress / 4 + inverted x 256
        cmpeq   .L1     a3, a6, a1
        cmpeq   .L1     a4, a7, a2
        and     .L1     a1, a2, a1
        cmpeq   .L1     a5, a8, a2
        and     .L1     a1, a2, a1
  [a1]  b       .S1     poll_out
        nop     5
        stw     .D1T1   a3, *+a0(S_DTEXT)
        stw     .D1T1   a4, *+a0(S_DTEXT + 4)
        stw     .D1T1   a5, *+a0(S_DKEY)
        ldw     .D2T1   *+b14(UI_EVENT), a4
        mvk     .S2     EV_REDRAW, b4
        nop     3
        FCALL   EVENT_POST
poll_out:
        ldw     .D2T1   *+b15(8), a4
        ldw     .D2T2   *+b15(4), b3
        nop     4
        addk    .S2     16, b15
        b       .S2     b3
        nop     5

; S_PRESS += 1 with interrupts off (Task_MIDI and the UI task both count).
; A0 = SV. Uses A3, B6, B7.
        .macro  COUNT_PRESS
        mvc     .S2     csr, b6
        and     .L2     -2, b6, b7
        mvc     .S2     b7, csr
        ldw     .D1T1   *+a0(S_PRESS), a3
        nop     4
        add     .L1     1, a3, a3
        stw     .D1T1   a3, *+a0(S_PRESS)
        mvc     .S2     b6, csr
        .endm

; Footswitch press flips slot A4 (B3 = return).
toggle_pre:
        mvkl    .S1     SV, a0
        mvkh    .S1     SV, a0
        ldw     .D1T1   *+a0(S_SLOT), a1
        nop     4
        cmpeq   .L1     a1, a4, a2
  [a2]  b       .S1     toggle_press
        nop     5
        mvkl    .S1     HOLDV, a0           ; word 6 = MOMENTARY: the flag lands with the flip
        mvkh    .S1     HOLDV, a0
        ldw     .D1T1   *a0, a1
        mvkl    .S1     ZMT_FTSW, a2
        mvkh    .S1     ZMT_FTSW, a2
        nop     3
        stw     .D1T1   a1, *a2
        JUMP    TOGGLE_HOOK
toggle_press:
        COUNT_PRESS
        b       .S2     b3
        nop     5

; Footswitch hold timer (event 224, A4): nothing on the looper.
hold_pre:
        mvkl    .S1     SV, a0
        mvkh    .S1     SV, a0
        ldw     .D1T1   *+a0(S_MINE), a1
        nop     4
  [a1]  mvk     .L1     0, a4
  [a1]  b       .S2     b3
        nop     5
        JUMP    HOLD_HOOK

; MIDI CC (A6 = number, B6 = value; A4, B4, A6, B6 and B3 go on untouched).
cc_pre:
        mvkl    .S1     SV, a0
        mvkh    .S1     SV, a0
        ldw     .D1T1   *+a0(S_SLOT), a1
        nop     4
        shl     .S1     a1, 3, a2
        shl     .S1     a1, 1, a3
        add     .L1     a2, a3, a2
        add     .L1     14, a2, a2          ; 10 x slot + 14: the slot's on/off CC
        cmpeq   .L1     a2, a6, a2
        cmpgt   .L2X    0, a1, b0
  [b0]  mvk     .L1     0, a2               ; no looper
  [a2]  b       .S1     cc_ours
        nop     5
        JUMP    CC_HANDLER
cc_ours:
        shru    .S2     b6, 6, b0           ; 64-127 is a press
  [!b0] b       .S2     b3
        nop     5
        COUNT_PRESS
        b       .S2     b3
        nop     5

