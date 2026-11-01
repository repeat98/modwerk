| SPDX-License-Identifier: GPL-3.0-or-later
| Menu label callback: hidden std::string return pointer in a0.
        .text
        .align 2
        .globl mf_toggle_label, mf_refresh_label
mf_toggle_label:
        link %a6,#-4
        move.l %d2,-(%sp)
        move.l %a0,%d2
        jsr mf_label_text
        move.l %a0,%a1
        bra.s mf_make_label
mf_refresh_label:
        link %a6,#-4
        move.l %d2,-(%sp)
        move.l %a0,%d2
        lea mf_refresh_text,%a1
mf_make_label:
        pea -1(%a6)
        move.l %a1,-(%sp)
        move.l %d2,-(%sp)
        jsr MF_STRING_CTOR
        lea 12(%sp),%sp
        move.l %d2,%d0
        move.l -8(%a6),%d2
        unlk %a6
        rts
mf_refresh_text:
        .asciz "SEND FEEDBACK"
