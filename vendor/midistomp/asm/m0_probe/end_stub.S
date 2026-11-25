; M0 probe (probe.S): the far stub at 0x1181BF40 (only caller: the audio
; block's register restore, callp at 0x1181BE5C) goes to blk_end (vector +8),
; which goes on to the stock restore 0xC00E14A0. The stub's b b31 / nop 5 stay.
        .text
        .nocmp
        mvkl    .S2     0xC00F3108, b31
        mvkh    .S2     0xC00F3108, b31
