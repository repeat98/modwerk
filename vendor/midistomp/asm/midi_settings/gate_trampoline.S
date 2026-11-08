; Far jump from DDR to midi_gate in L2 (settings.S vector table), MS-70CDR 2.10.
; Placed at 0xC00B2D0C: zero bytes after a function's return (bnop b3,5) at the
; end of a plain fetch packet, never a branch target. Called from
; the CC (0xC00AEE6C) and PC (0xC00AEE90) call sites in Task_MIDI; B3 still holds the return address. Clobbers B0 (caller-saved).
        .text
        .global gate_trampoline
gate_trampoline:
        mvkl    .S2     0x1181EA90, b0
        mvkh    .S2     0x1181EA90, b0
        b       .S2     b0
        nop     5
