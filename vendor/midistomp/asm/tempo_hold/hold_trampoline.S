; Far jump from DDR to hold_hook in L2 (hold2.S vector table), MS-70CDR 2.10.
; Placed at 0xC00D4270: zero bytes after a function's return (bnop b3,5) at the
; end of a plain fetch packet, never a branch target. Called from
; 0xC00ACFC0; B3 still holds the return address. Clobbers B0 (caller-saved).
        .text
        .global hold_trampoline
hold_trampoline:
        mvkl    .S2     0x1181FF20, b0
        mvkh    .S2     0x1181FF20, b0
        b       .S2     b0
        nop     5
