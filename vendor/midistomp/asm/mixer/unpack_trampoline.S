; settings.S unpack trampoline (0xC00BD9E4, 16 bytes) retargeted to the mixer C
; settings_unpack (chain_vec.asm), which calls settings.S unpack_hook and adds
; PEDAL INPUT in bit 7 of byte 23. B3 still holds the return. Clobbers B0.
        .text
unpack_trampoline:
        mvkl    .S2     0xC00F8038, b0
        mvkh    .S2     0xC00F8038, b0
        b       .S2     b0
        nop     5
