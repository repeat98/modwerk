; Second part of hold.S (it did not fit in one free L2 block), MS-70CDR 2.10
; OS: footswitch hold timer, AUTO SAVE check and button releases.

        .include "hold.inc"

        .text
        .nocmp
; Entry points at fixed offsets (the patch file names them by address)
vectors2:
        b       .S2     hold_hook           ; +0   called, footswitch hold
        nop     5
        b       .S2     dirty_hook          ; +8   called, AUTO SAVE check
        nop     5
        b       .S2     swallow_hook        ; +16  called, button release
        nop     5

; Footswitch hold timer (event 224): nothing for MOMENTARY.
hold_hook:
        mvkl    .S1     HV, a0
        mvkh    .S1     HV, a0
        ldw     .D1T1   *+a0(V_HOLDM), a1
        nop     4
  [a1]  mvk     .L1     0, a4
  [a1]  b       .S2     b3
        nop     5
        JUMP    STOCK_HOLD

; AUTO SAVE asks if the patch changed: not while a MOMENTARY press is down.
dirty_hook:
        mvkl    .S1     HV, a0
        mvkh    .S1     HV, a0
        ldw     .D1T1   *+a0(V_MARM), a1
        nop     4
  [a1]  mvk     .L1     0, a4
  [a1]  b       .S2     b3
        nop     5
        JUMP    IS_DIRTY

; Button release (events 69/71/73/75, A4): swallowed after a combo.
swallow_hook:
        mvkl    .S1     HV, a0
        mvkh    .S1     HV, a0
        ldw     .D1T1   *+a0(V_SWALLOW), a1
        mvk     .S1     64, a2
        sub     .L1     a4, a2, a2
        mvk     .L1     1, a3
        shl     .S1     a3, a2, a3          ; this release's bit
        nop     1
        and     .L1     a1, a3, a2
  [a2]  andn    .L1     a1, a3, a1
  [a2]  stw     .D1T1   a1, *+a0(V_SWALLOW)
  [a2]  mvk     .L1     0, a4
  [a2]  b       .S2     b3
        mvk     .S1     EV_CURSOR_REL, a0
        cmplt   .L1     a4, a0, a1
        mvkl    .S2     STOCK_CURSOR_REL, b0
        mvkh    .S2     STOCK_CURSOR_REL, b0
  [a1]  mvkl    .S2     STOCK_TYPE_REL, b0
  [a1]  mvkh    .S2     STOCK_TYPE_REL, b0
        nop     1
        b       .S2     b0
        nop     5
