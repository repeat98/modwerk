; Far jump from DDR to tempo_draw in L2 (hold.S vector table), MS-70CDR 2.10.
; Placed at 0xC00CB62C: zero bytes after a function's return (bnop b3,5) at the
; end of a plain fetch packet, never a branch target. Called from
; 0xC00BB050; B3 still holds the return address. Clobbers B0 (caller-saved).
        .text
        .global tempo_draw_trampoline
tempo_draw_trampoline:
        mvkl    .S2     0x1181FA80, b0
        mvkh    .S2     0x1181FA80, b0
        b       .S2     b0
        nop     5
