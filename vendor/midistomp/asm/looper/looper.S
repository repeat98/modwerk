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
;   draw_pre   every screen draw, before the LCD send (call at 0xC00BB0EC):
;              on the looper's Effect View, the status box (knob pages: x 74-127,
;              y 0-10; cover: x 68-126, y 19-32): a white box with a black
;              border, filled black from the left with the ZDL's progress, its
;              text centred in the screen's bold font (proportional) and drawn
;              inverted over the fill; the whole inside inverted while the ZDL
;              says so (pulse, blink). The poll asks the UI for a redraw when the
;              text, the progress (in 64ths) or the inversion changes.
; Everything else goes on to the hooks the trampolines called before.
; Design and addresses: docs/os-reverse-engineering.md, "Looper services".
;
; In DDR at 0xC00F2200, RAM test region 1, after scroll.S.

        .include "services.inc"
        .equ    POLL_HOOK, 0x1181E800       ; poll.S (transport upkeep), returns A4 = ticks
        .equ    TOGGLE_HOOK, 0x1181FA98     ; hold.S toggle_hook (MOMENTARY), then the flip
        .equ    HOLD_HOOK, 0x1181FF20       ; hold2.S hold_hook, then the stock hold
        .equ    CC_HANDLER, 0xC00F2800      ; midi_cc handler.S (DDR)

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
        b       .S2     draw_pre            ; +32
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
        shl     .S1     a3, 4, a4
        shl     .S1     a3, 3, a5
        add     .L1     a4, a5, a4          ; 24 x cursor
        mvkl    .S1     CURSOR_SLOT, a5
        mvkh    .S1     CURSOR_SLOT, a5
        add     .L1     a4, a5, a4
        ldw     .D1T1   *a4, a4
        nop     4
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
        mv      .L2X    a7, b0
  [!b0] b       .S1     poll_redraw
        nop     5
        ; flip the LED task's "written" bit so it writes the LED again
        mvkl    .S1     LED_APPLIED, a3
        mvkh    .S1     LED_APPLIED, a3
        ldw     .D1T1   *a3, a4
        nop     4
        xor     .L1     1, a4, a4
        stw     .D1T1   a4, *a3
poll_redraw:
        ; on the looper: redraw when the status text or the box's fill step changed
        ldw     .D1T1   *+a0(S_MINE), a1
        nop     4
  [!a1] b       .S1     poll_out
        nop     5
        ldw     .D1T1   *+a0(S_TEXT), a3
        ldw     .D1T1   *+a0(S_TEXT + 4), a4
        ldw     .D1T1   *+a0(S_PROG), a5
        ldw     .D1T1   *+a0(S_INV), a9
        ldw     .D1T1   *+a0(S_DTEXT), a6
        ldw     .D1T1   *+a0(S_DTEXT + 4), a7
        ldw     .D1T1   *+a0(S_DKEY), a8
        nop     4
        shru    .S1     a5, 2, a5
        shl     .S1     a9, 8, a9
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

; Called instead of 0xC00D5720 (A4 = its argument, B3 = return) after every
; screen draw, before the LCD send. On the looper's Effect View with no overlay
; or prompt, draws the status box; then on to 0xC00D5720. (The 50G hooked
; the setter 0xC00B5794 one call earlier; the 70CDR OS has no such setter.)
; Uses A0-A9, A16-A31, B0-B5, B16-B19 (caller-saved).
draw_pre:
        addk    .S2     -96, b15            ; +4 B3, +8 A4, +16 the text, a byte a column
        stw     .D2T2   b3, *+b15(4)
        stw     .D2T1   a4, *+b15(8)
        mvkl    .S1     SV, a0
        mvkh    .S1     SV, a0
        ldw     .D1T1   *+a0(S_MINE), a1
        ldw     .D2T2   *+b14(PENDING), b0
        nop     4
  [b0]  mvk     .L1     0, a1
  [!a1] b       .S1     draw_out
        nop     5
        mvk     .L1     0, a4
        FCALL   OVL_GET
        cmpeq   .L1     -1, a4, a1          ; no overlay (tempo box, tuner ...)
  [!a1] b       .S1     draw_out
        nop     5

        ; where: knob pages (A1 = 1) or cover. The box's bits are relative to
        ; 8-pixel row A22: M all of it, TB its top and bottom line, I inside.
        mvkl    .S1     VIEW_KNOBS, a3
        mvkh    .S1     VIEW_KNOBS, a3
        ldw     .D1T1   *a3, a1
        nop     4
        mvk     .S1     74, a20             ; X0
        mvk     .S1     53, a21             ; X1 - X0
        mvk     .L1     0, a22              ; row
        mvk     .L1     2, a23              ; text: y 2-8
        mvk     .S1     0x7FF, a24          ; y 0-10
        mvk     .S1     0x401, a25
        mvk     .S1     0x3FE, a26
  [!a1] mvk     .S1     68, a20
  [!a1] mvk     .S1     58, a21
  [!a1] mvk     .L1     2, a22              ; y 16-39
  [!a1] mvk     .L1     6, a23              ; text: y 22-28
  [!a1] mvkl    .S1     0x1FFF8, a24        ; y 19-32
  [!a1] mvkh    .S1     0x1FFF8, a24
  [!a1] mvkl    .S1     0x10008, a25
  [!a1] mvkh    .S1     0x10008, a25
  [!a1] mvkl    .S1     0xFFF0, a26
  [!a1] mvkh    .S1     0xFFF0, a26

        ; the text's columns, proportional: each character's inked columns and a
        ; gap, a space 2 columns; A28 = width
        mvkl    .S1     SV + S_TEXT, a16
        mvkh    .S1     SV + S_TEXT, a16
        mvkl    .S1     FONT7, a17
        mvkh    .S1     FONT7, a17
        add     .D2     b15, 16, b16
        mv      .L2     b16, b17
        mvk     .L1     8, a2
        mvk     .L1     0, a28
ch_loop:
        ldbu    .D1T1   *a16++, a19
        nop     4
        shl     .S1     a19, 3, a5
        sub     .L1     a5, a19, a5
        add     .L1     a17, a5, a5         ; FONT7 + 7 x code
        mvk     .L1     -1, a6              ; first inked column
        mvk     .L1     0, a7               ; last
        mvk     .L1     0, a8
        mvk     .L1     7, a1
scan_loop:
        ldbu    .D1T1   *a5++, a9
        nop     4
        mv      .L2X    a9, b1
        cmpltu  .L2     0, b1, b2
        cmpgt   .L1     0, a6, a0
        and     .L1X    a0, b2, a0
  [a0]  mv      .L1     a8, a6
  [b2]  mv      .L1     a8, a7
        add     .L1     1, a8, a8
        sub     .L1     a1, 1, a1
  [a1]  b       .S1     scan_loop
        nop     5
        mvk     .L1     0, a9
        cmpgt   .L1     0, a6, a0           ; blank
  [a0]  stb     .D2T1   a9, *b17++
  [a0]  stb     .D2T1   a9, *b17++
  [a0]  add     .L1     2, a28, a28
  [a0]  b       .S1     ch_next
        nop     5
        sub     .L1     a5, 7, a5
        add     .L1     a5, a6, a5
        sub     .L1     a7, a6, a1
        add     .L1     1, a1, a1
emit_loop:
        ldbu    .D1T1   *a5++, a9
        nop     4
        stb     .D2T1   a9, *b17++
        add     .L1     1, a28, a28
        sub     .L1     a1, 1, a1
  [a1]  b       .S1     emit_loop
        nop     5
        mvk     .L1     0, a9
        stb     .D2T1   a9, *b17++          ; gap
        add     .L1     1, a28, a28
ch_next:
        sub     .L1     a2, 1, a2
  [a2]  b       .S1     ch_loop
        nop     5
trim_loop:                                  ; drop the trailing gaps and spaces
        mv      .L1     a28, a1
  [!a1] b       .S1     trimmed
        nop     5
        add     .L2X    b16, a28, b18
        ldbu    .D2T2   *-b18(1), b0
        nop     4
  [b0]  b       .S1     trimmed
        nop     5
        sub     .L1     a28, 1, a28
        b       .S1     trim_loop
        nop     5
trimmed:
        sub     .L1     a21, 1, a3          ; inside width
        sub     .L1     a3, a28, a4
        shr     .S1     a4, 1, a4           ; text start inside
        cmpgt   .L1     0, a4, a0
  [a0]  mvk     .L1     0, a4
        mvkl    .S1     SV, a0
        mvkh    .S1     SV, a0
        ldw     .D1T1   *+a0(S_PROG), a5
        ldw     .D1T1   *+a0(S_INV), a29
        nop     4
        mpy     .M1     a3, a5, a5
        nop     1
        shr     .S1     a5, 8, a5           ; fill width
        mvkl    .S1     FB, a27
        mvkh    .S1     FB, a27
        shl     .S1     a22, 7, a6
        add     .L1     a27, a6, a27
        add     .L1     a27, a20, a27       ; FB + 128 x row + X0
        mvk     .S1     128, a18
        mvk     .S1     256, a19
        mvk     .L1     0, a8               ; column
        add     .L1     1, a21, a9
        mv      .L2X    a9, b0
px_loop:
        ldbu    .D1T1   *a27, a9
        ldbu    .D1T1   *+a27[a18], a30
        ldbu    .D1T1   *+a27[a19], a31
        nop     4
        shl     .S1     a30, 8, a30
        shl     .S1     a31, 16, a31
        or      .L1     a9, a30, a9
        or      .L1     a9, a31, a9         ; the 3 rows' pixels
        cmpeq   .L1     0, a8, a0
        cmpeq   .L1     a8, a21, a1
        or      .L1     a0, a1, a0
        mv      .L1     a24, a6             ; side: all border
  [a0]  b       .S1     px_put
        nop     5
        sub     .L1     a8, 1, a7           ; column inside
        mv      .L1     a25, a6             ; top and bottom border
        cmplt   .L1     a7, a5, a1
  [a1]  or      .L1     a6, a26, a6         ; the fill
        sub     .L1     a7, a4, a16         ; column in the text
        cmplt   .L1     a16, a28, a1
        cmpgt   .L1     0, a16, a2
        xor     .L1     1, a2, a2
        and     .L1     a1, a2, a1
        mv      .L2X    a16, b19
  [a1]  ldbu    .D2T1   *+b16[b19], a17
  [!a1] mvk     .L1     0, a17
        nop     4
        shl     .S1     a17, a23, a17
        and     .L1     a17, a26, a17
        xor     .L1     a6, a17, a6         ; text inverted over the fill
        mv      .L1     a29, a1
  [a1]  xor     .L1     a6, a26, a6         ; the pulse / blink
px_put:
        andn    .L1     a9, a24, a9
        or      .L1     a9, a6, a9
        stb     .D1T1   a9, *a27
        shru    .S1     a9, 8, a9
        stb     .D1T1   a9, *+a27[a18]
        shru    .S1     a9, 8, a9
        stb     .D1T1   a9, *+a27[a19]
        add     .L1     1, a27, a27
        add     .L1     1, a8, a8
        sub     .L2     b0, 1, b0
  [b0]  b       .S1     px_loop
        nop     5
        mvk     .L1     7, a3
        shl     .S1     a3, a22, a3         ; send the box's 3 rows
        mvkl    .S1     FB_DIRTY, a6
        mvkh    .S1     FB_DIRTY, a6
        ldbu    .D1T1   *a6, a4
        nop     4
        or      .L1     a3, a4, a4
        stb     .D1T1   a4, *a6
draw_out:
        ldw     .D2T2   *+b15(4), b3
        ldw     .D2T1   *+b15(8), a4
        nop     4
        addk    .S2     96, b15
        JUMP    LCD_GATE
