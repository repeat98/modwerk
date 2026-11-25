; M0 probe (probe.S): the far stub at 0x1181BF60 (only caller: the audio
; block's register save, callp at 0x1181BDE0) goes to blk_start (vector +0),
; which goes on to the stock save 0xC00E14C0. The stub's b b31 / nop 5 stay.
        .text
        .nocmp
        mvkl    .S2     0xC00F3100, b31
        mvkh    .S2     0xC00F3100, b31
