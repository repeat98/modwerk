; DIAGNOSTICS: fixed entry points, magic word, build stamps and the menu name at the
; start of its C section (0xC00F3100), linked first by scripts/build_diag_ui.py.
; patches/diag.yaml's callps and asm/mixer/engine.c name these offsets.
        .sect   ".vectors"
        .nocmp
        .global diag_end, diag_poll, diag_draw, diag_keys, diag_menu, diag_mwake, diag_mend, diag_b3
        B       .S2     diag_end        ; +0  engine.c, end of each audio block
        NOP     5
        B       .S2     diag_poll       ; +8  callp at 0xC00C6998 (16 ms poll)
        NOP     5
        B       .S2     diag_draw       ; +16 callp at 0xC00A93D0 (screen 9 draw)
        NOP     5
        B       .S2     diag_kv         ; +24 callp at 0xC00A8364 (screen 9 keys)
        NOP     5
        B       .S2     diag_menu       ; +32 callp at 0xC00A9398 (menu draw)
        NOP     5
        .word   0x47414944              ; +40 "DIAG": engine.c calls +0 only when this is here
        .space  20
        .string "<version>"             ; +64 stamps, 16 bytes each (zoomms build --stamp)
        .space  7
        .string "<commit>"              ; +80
        .space  8
        .string "<date>"                ; +96
        .space  10
        .string "<label>"               ; +112
        .space  9
        .string "SYSTEM"                ; +128 the menu entry (mixer.S MENU7 word 5)
        .space  10
        B       .S2     diag_mw         ; +144 callp at 0xC00AECCC (Task_MIDI wakes up)
        NOP     5
        B       .S2     diag_me         ; +152 callp at 0xC00AEEE0 (end of its byte loop)
        NOP     5

; Screen 9 keys: A4 = event, A5 = steps. A knob turn (160-162) or the knob 3 click (67)
; goes to diag_keys with steps in B4 (the C argument); the rest goes to the stock version
; keys untouched (EXIT).
        .sect   ".text"
diag_kv:
        MVK     .S1     160, A0
        SUB     .L1     A4, A0, A0
        CMPGTU  .L1     3, A0, A1               ; A1 = a knob turn
        MVK     .S1     67, A0
        CMPEQ   .L1     A4, A0, A2              ; or the knob 3 click
        OR      .L1     A1, A2, A1
        MVKL    .S2     0xC00A7628, B5          ; VERSION_KEYS
        MVKH    .S2     0xC00A7628, B5
  [!A1] B       .S2     B5
  [A1]  B       .S2     diag_keys
  [A1]  MV      .L2X    A5, B4
        NOP     4

; MIDI timing (diag.c): Task_MIDI's scratch registers are free at both sites; B3 is the
; return into it, kept in diag_b3 while the C runs. Each stub replays the replaced load.
diag_mw:                                ; replaces ldw *+b14(220),b0 (write index)
        MVKL    .S1     diag_b3, A0
        MVKH    .S1     diag_b3, A0
        STW     .D1T2   B3, *A0
        B       .S2     diag_mwake
        ADDKPC  .S2     mw1, B3, 4
mw1:    MVKL    .S1     diag_b3, A0
        MVKH    .S1     diag_b3, A0
        LDW     .D1T2   *A0, B3
        LDW     .D2T2   *+B14(220), B0
        NOP     4
        B       .S2     B3
        NOP     5

diag_me:                                ; replaces midi-clock's callp clock_trampoline
        MVKL    .S1     diag_b3, A0
        MVKH    .S1     diag_b3, A0
        STW     .D1T2   B3, *A0
        MVKL    .S2     0xC00A1A50, B5  ; clock_trampoline: clock.S, then back here
        MVKH    .S2     0xC00A1A50, B5
        B       .S2     B5
        ADDKPC  .S2     me1, B3, 4
me1:    B       .S2     diag_mend       ; after the clock code, so its cost counts
        ADDKPC  .S2     me2, B3, 4
me2:    MVKL    .S1     diag_b3, A0
        MVKH    .S1     diag_b3, A0
        LDW     .D1T2   *A0, B3
        LDW     .D2T2   *+B14(216), B0  ; the read index, as clock.S leaves it
        NOP     4
        B       .S2     B3
        NOP     5
