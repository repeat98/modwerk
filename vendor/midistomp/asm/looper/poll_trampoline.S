; Far jump from DDR to looper.S's poll_pre (v2.0 step 2), MS-70CDR 2.10. Replaces the
; target of the transport poll trampoline at 0xC00C82D0 (midi-clock.yaml); the call site and B3 are unchanged,
; and poll_pre goes on to the old target. Clobbers B0 (caller-saved).
        .text
        .global poll_pre_trampoline
poll_pre_trampoline:
        mvkl    .S2     0xC00F2200, b0
        mvkh    .S2     0xC00F2200, b0
        b       .S2     b0
        nop     5
