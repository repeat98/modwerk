; Tempo screen, HOLD FOR MOMENTARY and button combos (issue #28, v0.6),
; MS-70CDR 2.10 OS.
;
; Tempo screen (overlay state 2, footswitch hold with HOLD FOR TEMPO; state
; 5, knob 1 press on a patch with a tempo effect): drawn by the stock box
; (TEMPO and the BPM, made taller), then tempo_draw adds a line inside it,
; TURN OR TAP, or
; MIDI CLOCK while the clock sets the tempo (CLOCK RECEIVE on, a clock in
; the last 0.5 s). Turning knob 1 changes the tempo by 1 BPM a step (40 to
; 250, like tap) and keeps the screen 2 s; while the clock is live turns and
; taps do nothing. State 2 closes 2 s after the last tap (patch word in
; tempo-hold.yaml, stock waits forever).
;
; HOLD FOR MOMENTARY (settings.S V_HOLDM): the footswitch flips the effect
; on press as usual; held for HOLD_MS or more, release flips it back. The
; footswitch hold timer does nothing, and AUTO SAVE waits while the
; footswitch is down, so a flip-back leaves the patch as saved.
;
; Combos, in play mode (effect chain and effect screens, not menus), when a
; button's stock hold timer fires (1 s) with the other button also down:
;   BOTTOM + RIGHT opens the tuner, BOTTOM + LEFT opens the tempo screen.
; Both buttons' releases are then swallowed (no type change, no cursor
; move). Buttons are the 7-switch indexes i (press event 64 + 2i, release
; 65 + 2i, switch word bit i clear while down): 2 and 3 change the effect
; type (+ and -), 4 and 5 move the cursor (+1 and -1).
;
; Everything here is reached through vectors at fixed offsets, from
; trampolines in DDR (tempo-hold.yaml). Design and addresses:
; docs/os-reverse-engineering.md, "Tempo screen, HOLD FOR and combos".

        .include "hold.inc"

        .text
        .nocmp
; Entry points at fixed offsets (the patch file names them by address)
vectors:
        b       .S2     tempo_draw          ; +0    called, overlay draw
        nop     5
        b       .S2     knob_hook           ; +8    called, knob turn
        nop     5
        b       .S2     tap_hook            ; +16   called, tap tempo
        nop     5
        b       .S2     toggle_hook         ; +24   called, footswitch flip
        nop     5
        b       .S2     release_hook        ; +32   called, footswitch release
        nop     5
        b       .S2     combo_hook          ; +40   called, button hold
        nop     5

; -> A4 = 1 while the MIDI clock sets the tempo.
clock_live:
        addk    .S2     -16, b15
        stw     .D2T2   b3, *+b15(4)
        FCALL   CLOCK_GETTICKS
        mvkl    .S1     VARS, a0
        mvkh    .S1     VARS, a0
        mvkl    .S2     MIDI_FLAGS, b0
        mvkh    .S2     MIDI_FLAGS, b0
        ldw     .D1T1   *+a0(V_LAST), a1
        ldw     .D2T2   *b0, b1
        ldw     .D2T2   *+b15(4), b3
        nop     4
        sub     .L1     a4, a1, a2
        mvk     .S1     STALE_MS, a3
        cmpgtu  .L1     a2, a3, a2          ; silent too long
        cmpeq   .L1     0, a1, a1           ; no clock since boot
        or      .L1     a1, a2, a1
        and     .L2     OFF_CLOCK, b1, b1   ; CLOCK RECEIVE off
        or      .L1X    a1, b1, a1
        xor     .L1     1, a1, a4
        addk    .S2     16, b15
        b       .S2     b3
        nop     5

; Overlay states 2 and 5 (A4 = 0, B4 = tempo): stock box (made taller by
; tempo-hold.yaml), then our line inside it.
tempo_draw:
        addk    .S2     -16, b15
        stw     .D2T2   b3, *+b15(4)
        FCALL   TEMPO_BOX
        callp   .S2     clock_live, b3
        mv      .L1     a4, a1
        mvkl    .S2     s_turn, b4
        mvkh    .S2     s_turn, b4
        mvk     .S1     31, a6              ; centred, 6 px a character
  [a1]  mvkl    .S2     s_clock, b4
  [a1]  mvkh    .S2     s_clock, b4
  [a1]  mvk     .S1     34, a6
        mvk     .L1     0, a4
        mvk     .S2     TEXT_Y, b6
        FCALL   DRAW_TEXT
        ldw     .D2T2   *+b15(4), b3
        nop     4
        addk    .S2     16, b15
        b       .S2     b3
        nop     5

; Key event A4/A5. Knob 1 turned in play mode with the tempo screen open:
; tempo + steps, the screen stays 2 s more. Anything else: stock.
knob_hook:
        ldw     .D2T2   *+b14(MODE), b0
        mvk     .S1     EV_KNOB1, a0
        nop     3
        cmpeq   .L1     a4, a0, a1
  [b0]  mvk     .L1     0, a1
  [!a1] b       .S1     knob_stock
        nop     5
        ENTER
        mvk     .L1     0, a4
        FCALL   OVL_GET
        stw     .D2T1   a4, *+b15(16)       ; state (the caller's free word)
        cmpeq   .L1     2, a4, a1
        cmpeq   .L1     5, a4, a2
        or      .L1     a1, a2, a1
  [!a1] b       .S1     knob_pop
        nop     5
        callp   .S2     clock_live, b3
        mv      .L1     a4, a1
  [a1]  b       .S1     knob_keep           ; the clock owns the tempo
        nop     5
        mvkl    .S1     TEMPO_VALUE, a0
        mvkh    .S1     TEMPO_VALUE, a0
        ldw     .D1T1   *a0, a4
        ldw     .D2T1   *+b15(12), a5       ; steps
        mvk     .S2     MIN_BPM, b4
        mvk     .S1     MAX_BPM, a6
        nop     3
        add     .L1     a4, a5, a4
        FCALL   CLAMP
        mv      .L2X    a4, b4
        mvkl    .S1     TEMPO_SETTING, a4
        mvkh    .S1     TEMPO_SETTING, a4
        mvk     .L1     1, a6               ; like tap tempo
        FCALL   SET_SETTING
knob_keep:
        mvk     .L1     0, a4
        ldw     .D2T2   *+b15(16), b4       ; state
        mvk     .S1     SCREEN_MS, a6
        nop     4
        FCALL   OVL_SET
        ldw     .D2T2   *+b15(4), b3
        mvk     .L1     1, a4               ; redraw
        nop     3
        addk    .S2     16, b15
        b       .S2     b3
        nop     5
knob_pop:
        LEAVE
knob_stock:
        JUMP    STOCK_KNOB

; Tap (footswitch in state 2, knob 1 press): none while the clock is live.
tap_hook:
        addk    .S2     -16, b15
        stw     .D2T2   b3, *+b15(4)
        callp   .S2     clock_live, b3
        mv      .L1     a4, a1
        ldw     .D2T2   *+b15(4), b3
        nop     4
        addk    .S2     16, b15
  [a1]  b       .S2     b3
        nop     5
        JUMP    STOCK_TAP

; Footswitch press flips slot A4: note it for the release (MOMENTARY).
toggle_hook:
        ENTER
        FCALL   CLOCK_GETTICKS
        mvkl    .S1     HV, a0
        mvkh    .S1     HV, a0
        ldw     .D1T2   *+a0(V_HOLDM), b1
        ldw     .D2T1   *+b15(8), a1
        stw     .D1T1   a4, *+a0(V_PRESST)
        nop     3
        stw     .D1T2   b1, *+a0(V_MARM)
        stw     .D1T1   a1, *+a0(V_MSLOT)
        LEAVE
        JUMP    TOGGLE

; Footswitch release (event 33): after a long MOMENTARY press, flip back.
release_hook:
        ENTER
        FCALL   CLOCK_GETTICKS
        mvkl    .S1     HV, a0
        mvkh    .S1     HV, a0
        ldw     .D1T1   *+a0(V_MARM), a2
        ldw     .D1T1   *+a0(V_PRESST), a1
        mvk     .L1     0, a3
        mvk     .S1     HOLD_MS, a5
        nop     2
        stw     .D1T1   a3, *+a0(V_MARM)
        sub     .L1     a4, a1, a1
        cmpltu  .L1     a1, a5, a1          ; a short press stays flipped
  [a1]  mvk     .L1     0, a2
  [!a2] b       .S1     rel_stock
        ldw     .D1T1   *+a0(V_MSLOT), a4
        nop     4
        FCALL   TOGGLE
rel_stock:
        LEAVE
        JUMP    STOCK_RELEASE

; Button hold timer (events 228-231, A4; B4 = '+'/'-' for the type ones).
; A combo runs the stock footswitch hold with HOLD FOR set to what it
; opens, then swallows both buttons' releases.
combo_hook:
        ldw     .D2T2   *+b14(MODE), b0
        ldw     .D2T2   *+b14(PENDING), b1
        mvkl    .S1     SW_STATE, a0
        mvkh    .S1     SW_STATE, a0
        ldw     .D1T1   *a0, a1
        mvk     .S1     1 << BOTTOM, a2
        nop     3
        or      .L2     b0, b1, b0
  [b0]  mvk     .L1     0, a2               ; not in play mode
        andn    .L1     a2, a1, a2          ; BOTTOM down
  [!a2] b       .S1     combo_stock
        mvk     .S1     1 << RIGHT, a2
        andn    .L1     a2, a1, a2          ; RIGHT down
        mvk     .L1     0, a0               ; HOLD FOR TUNER
        mvk     .S2     (2 << (2 * BOTTOM)) | (2 << (2 * RIGHT)), b2
        nop     2
  [a2]  b       .S1     combo_go
        nop     5
        mvk     .S1     1 << LEFT, a2
        andn    .L1     a2, a1, a2          ; LEFT down
        mvk     .L1     1, a0               ; HOLD FOR TEMPO
        mvk     .S2     (2 << (2 * BOTTOM)) | (2 << (2 * LEFT)), b2
        nop     2
  [a2]  b       .S1     combo_go
        nop     5
combo_stock:
        mvk     .S1     EV_CURSOR_HOLD, a0
        cmplt   .L1     a4, a0, a1
        mvkl    .S2     STOCK_CURSOR_HOLD, b0
        mvkh    .S2     STOCK_CURSOR_HOLD, b0
  [a1]  mvkl    .S2     STOCK_TYPE_HOLD, b0
  [a1]  mvkh    .S2     STOCK_TYPE_HOLD, b0
        b       .S2     b0
        nop     5
combo_go:       ; A0 = HOLD FOR to use, B2 = releases to swallow
        mvkl    .S1     HV, a1
        mvkh    .S1     HV, a1
        ldw     .D1T1   *+a1(V_SWALLOW), a2
        nop     4
        and     .L1X    a2, b2, a2          ; done already: the other key's
  [a2]  mvk     .L1     0, a4               ; timer, queued at the same time
  [a2]  b       .S2     b3
        nop     5
        addk    .S2     -16, b15
        stw     .D2T2   b3, *+b15(4)
        mvkl    .S1     HV, a1
        mvkh    .S1     HV, a1
        mvkl    .S2     HOLD_WORD, b0
        mvkh    .S2     HOLD_WORD, b0
        ldw     .D1T1   *+a1(V_SWALLOW), a2
        ldw     .D2T2   *b0, b1
        stw     .D2T1   a0, *b0
        mvk     .S1     224, a4             ; footswitch hold event
        nop     2
        or      .L1X    a2, b2, a2
        stw     .D1T1   a2, *+a1(V_SWALLOW)
        stw     .D2T2   b1, *+b15(8)
        FCALL   STOCK_HOLD
        mvkl    .S2     HOLD_WORD, b0
        mvkh    .S2     HOLD_WORD, b0
        ldw     .D2T2   *+b15(8), b1
        ldw     .D2T2   *+b15(4), b3
        mvk     .L2     0, b2
        stw     .D2T2   b2, *+b14(HOLD_FIRED) ; the next footswitch release taps
        mvk     .L1     1, a4               ; redraw
        nop     1
        stw     .D2T2   b1, *b0
        addk    .S2     16, b15
        b       .S2     b3
        nop     5

s_turn:         .string "TURN OR TAP"
s_clock:        .string "MIDI CLOCK"
