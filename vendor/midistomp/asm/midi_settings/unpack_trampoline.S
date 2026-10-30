; Far jump from DDR to unpack_hook in L2 (settings.S vector table), MS-70CDR 2.10.
; Placed at 0xC00BD9E4: zero bytes after a function's return (bnop b3,5) at the
; end of a plain fetch packet, never a branch target. Called from
; the stock unpack call in the boot-time settings load (0xC00BA77C); B3 still holds the return address. Clobbers B0 (caller-saved).
        .text
        .global unpack_trampoline
unpack_trampoline:
        mvkl    .S2     0x1181EA88, b0
        mvkh    .S2     0x1181EA88, b0
        b       .S2     b0
        nop     5
