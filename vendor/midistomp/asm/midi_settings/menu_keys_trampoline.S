; Far jump from DDR to menu_keys in L2 (settings.S vector table), MS-70CDR 2.10.
; Placed at 0xC00BEC90: zero bytes after a function's return (bnop b3,5) at the
; end of a plain fetch packet, never a branch target. Called from
; the key dispatcher's default (menu) stub (0xC00A8310); B3 still holds the return address. Clobbers B0 (caller-saved).
        .text
        .global menu_keys_trampoline
menu_keys_trampoline:
        mvkl    .S2     0x1181EA40, b0
        mvkh    .S2     0x1181EA40, b0
        b       .S2     b0
        nop     5
