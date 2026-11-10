; Mixer Mode M2 (mixer.S rec_save): replaces the fetch packet at 0xC00B84C0,
; the stock patch-record save wrapper (A4 = record, B4 = packed record), with
; a jump to the mixer's rec_save, which saves the record the same way. Plain
; packet: the stock header at 0xC00B84DC goes; the three instructions of the
; next function (0xC00B84D0, the live-patch save) are the stock words, already
; 32-bit (callp is relative to this packet, which does not move). B0 is
; caller-saved.
        .text
        .nocmp
        mvkl    .S2     0xC00F6028, b0
        mvkh    .S2     0xC00F6028, b0
        b       .S2     b0
        nop     5
        .word   0x10520010                  ; 0xC00B84D0: callp 0xC00E14C0, a3
        .word   0x05900fd8                  ; mv a4, a11
        .word   0x05615428                  ; mvk 0xC2A8, a10
        nop                                 ; was the packet header
