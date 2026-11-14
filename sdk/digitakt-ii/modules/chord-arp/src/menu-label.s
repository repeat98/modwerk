/* SPDX-License-Identifier: GPL-3.0-or-later */
        .text
        .globl chord_arp_row_label
chord_arp_row_label:
        link %a6,#-4
        move.l %d2,-(%sp)
        move.l %a0,%d2
        pea -1(%a6)
        pea row_label
        move.l %d2,-(%sp)
        jsr fw_str_new
        lea 12(%sp),%sp
        move.l %d2,%d0
        move.l -8(%a6),%d2
        unlk %a6
        rts
row_label:
        .asciz "CHORD ARP"
        .balign 2
