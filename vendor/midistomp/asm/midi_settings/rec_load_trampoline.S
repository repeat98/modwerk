; Far jump from DDR to rec_load in L2 (settings.S vector table), MS-70CDR 2.10.
; Placed at 0xC00C492C: zero bytes after a function's return (bnop b3,5) at the
; end of a plain fetch packet, never a branch target. Called from
; the record 51 load at boot (0xC00B8B14); B3 still holds the return address. Clobbers B0 (caller-saved).
        .text
        .global rec_load_trampoline
rec_load_trampoline:
        mvkl    .S2     0x1181EA98, b0
        mvkh    .S2     0x1181EA98, b0
        b       .S2     b0
        nop     5
