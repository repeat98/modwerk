; Far jump from DDR to pack_hook in L2 (settings.S vector table), MS-70CDR 2.10.
; Placed at 0xC00B9EC8: zero bytes after a function's return (bnop b3,5) at the
; end of a plain fetch packet, never a branch target. Called from
; the stock pack call in the settings save (0xC00BA3D4); B3 still holds the return address. Clobbers B0 (caller-saved).
        .text
        .global pack_trampoline
pack_trampoline:
        mvkl    .S2     0x1181EA80, b0
        mvkh    .S2     0x1181EA80, b0
        b       .S2     b0
        nop     5
