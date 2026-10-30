; Far jump from DDR to the transport poll in L2 RAM (issue #24).
; Placed at 0xC00C82D0 (MS-70CDR 2.10): the 16 zero bytes after a function's
; return (bnop b3,5 at 0xC00C82CC), the last four words of a plain fetch
; packet, never a branch target. Task_SwitchNrmlSpdRead's Clock_getTicks call
; at 0xC00C6998 calls here instead; B3 returns into that task.
; Clobbers B0 (caller-saved).
        .text
        .global poll_trampoline
poll_trampoline:
        mvkl    .S2     0x1181E800, b0
        mvkh    .S2     0x1181E800, b0
        b       .S2     b0
        nop     5
