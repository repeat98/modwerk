; Middle knob press in the tuner leaves it (v0.6), MS-70CDR 2.10 OS.
;
; The key loop's call for event 65 (middle knob release, stock 0xC00AC790:
; opens the patch list in play mode, nothing in the tuner) comes here via
; tuner_exit_trampoline.S. In the tuner (mode 5 or 6) it runs the stock
; footswitch press (0xC00AC990, event 32) instead, which is how stock leaves
; the tuner. Everything else goes to the stock handler. Loaded in the free
; 64 bytes between the clock variables and poll.S.

        .equ    MODE, 320                   ; B14 offset
        .equ    STOCK_MIDDLE, 0xC00AC790
        .equ    FOOT_PRESS, 0xC00AC990

        .text
        .nocmp
tuner_exit:
        ldw     .D2T2   *+b14(MODE), b0
        nop     4
        add     .L2     -5, b0, b0
        cmpltu  .L2     1, b0, b0           ; not the tuner
        mvkl    .S2     STOCK_MIDDLE, b5
        mvkh    .S2     STOCK_MIDDLE, b5
  [!b0] mvk     .S1     32, a4
  [!b0] mvkl    .S2     FOOT_PRESS, b5
  [!b0] mvkh    .S2     FOOT_PRESS, b5
        b       .S2     b5
        nop     5
