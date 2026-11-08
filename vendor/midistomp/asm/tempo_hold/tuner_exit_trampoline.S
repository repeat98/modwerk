; Far jump from DDR to tuner_exit in L2, MS-70CDR 2.10.
; Placed at 0xC00D8D10: zero bytes after a function's return (bnop b3,5) at the
; end of a plain fetch packet, never a branch target. Called from
; 0xC00AD170 (event 65); B3 still holds the return address. Clobbers B0 (caller-saved).
        .text
        .global tuner_exit_trampoline
tuner_exit_trampoline:
        mvkl    .S2     0x1181E7C0, b0
        mvkh    .S2     0x1181E7C0, b0
        b       .S2     b0
        nop     5
