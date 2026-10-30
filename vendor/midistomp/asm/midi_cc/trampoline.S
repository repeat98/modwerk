; Far jump from the CC call site to the MIDI CC handler (DDR 0xC00F2800).
; Placed at 0xC00BB190 (MS-70CDR 2.10): 16 zero bytes after a return (bnop b3,5 at 0xC00BB18C),
; never a branch target. The CC call site (callp at 0xC00AEE6C) is retargeted
; here; B3 still holds the return address into Task_MIDI, so the handler
; returns straight to the caller. Clobbers B0 (caller-saved).
        .text
        .global trampoline
trampoline:
        mvkl    .S2     0xC00F2800, b0
        mvkh    .S2     0xC00F2800, b0
        b       .S2     b0
        nop     5
