; midi_clock's poll trampoline (0xC00C82D0, 16 bytes) retargeted to the mixer
; poll (vector +120), which goes on to midi_clock's poll.S. Clobbers B0.
        .text
poll_trampoline:
        mvkl    .S2     0xC00F6078, b0
        mvkh    .S2     0xC00F6078, b0
        b       .S2     b0
        nop     5
