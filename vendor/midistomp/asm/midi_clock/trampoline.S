; Far jump from DDR to the MIDI clock hook in L2 RAM (issue #5).
; Placed at 0xC00A1A50 (MS-70CDR 2.10): the 16 zero bytes after a function's
; return (bnop b3,5 at 0xC00A1A4C), the last four words of a plain fetch
; packet, never a branch target. The hook site in Task_MIDI (0xC00AEEE0, see
; clock.S) calls here; B3 holds the return address into Task_MIDI.
; Clobbers B0, which the hook reloads before returning.
        .text
        .global clock_trampoline
clock_trampoline:
        mvkl    .S2     0x1181E040, b0
        mvkh    .S2     0x1181E040, b0
        b       .S2     b0
        nop     5
