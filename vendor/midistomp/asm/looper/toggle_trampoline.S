; Far jump from DDR to looper.S's toggle_pre (v2.0 step 2), MS-70CDR 2.10. Replaces the
; target of the footswitch flip trampoline at 0xC00D2F30 (tempo-hold.yaml); the call site and B3 are unchanged,
; and toggle_pre goes on to the old target. Clobbers B0 (caller-saved).
        .text
        .global toggle_pre_trampoline
toggle_pre_trampoline:
        mvkl    .S2     0xC00F2208, b0
        mvkh    .S2     0xC00F2208, b0
        b       .S2     b0
        nop     5
