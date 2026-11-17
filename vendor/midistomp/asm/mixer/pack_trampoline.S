; settings.S pack trampoline (0xC00B9EC8, 16 bytes) retargeted to the mixer C
; settings_pack (chain_vec.asm), which calls settings.S pack_hook and adds
; PEDAL INPUT in bit 7 of byte 23. B3 still holds the return. Clobbers B0.
        .text
pack_trampoline:
        mvkl    .S2     0xC00F8030, b0
        mvkh    .S2     0xC00F8030, b0
        b       .S2     b0
        nop     5
