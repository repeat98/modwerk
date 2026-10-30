; Tuner screen softkeys: the middle knob's label, stock blank,
; reads EXIT (stock string 0xC00E90FC), MS-70CDR 2.10.
; Placed at 0xC00DAA30: zero bytes after a function's return (bnop b3,5) at the
; end of a plain fetch packet, never a branch target. Called from 0xC00BAD40
; (softkey(1, label, 0)) instead of the softkey function; B3 still holds the
; return address.
        .equ    SOFTKEY, 0xC009F8F0         ; (knob, string, 0)
        .text
        .global tuner_label_trampoline
tuner_label_trampoline:
        mvkl    .S2     0xC00E90FC, b4
        mvkh    .S2     0xC00E90FC, b4
        ; b .S2 SOFTKEY: gas takes no absolute branch target, so encoded by
        ; hand (displacement from this fetch packet, 0xC00DAA20, in words)
        .word   ((((SOFTKEY - 0xC00DAA20) >> 2) & 0x1FFFFF) << 7) | 0x12
        nop     5
