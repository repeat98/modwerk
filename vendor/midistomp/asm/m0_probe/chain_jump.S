; M0 probe (probe.S): replaces the stock slot loop's first fetch packet at
; 0x1181BE00 (the return point of callp 0x1181B340) with a jump to chain
; (vector +16), which runs the loop and goes on at 0x1181BE48. Plain packet:
; four zero words (nops, added by the patch) fill it, so the stock header at
; 0x1181BE1C goes away. B31 is caller-saved (the OS stubs use it too).
        .text
        .nocmp
        mvkl    .S2     0xC00F3110, b31
        mvkh    .S2     0xC00F3110, b31
        b       .S2     b31
        nop     5
