/* SPDX-License-Identifier: MIT */
/* Original ColdFire ABI bridge. No stock instruction bytes are embedded. */
    .text
    .align 2
    .globl bs_flex_stock_query
    .type bs_flex_stock_query,@function
bs_flex_stock_query:
    move.l %a2,-(%sp)
    move.l 20(%sp),%a2
    move.l 8(%sp),%a0
    move.l #1,-(%sp)
    move.l 20(%sp),-(%sp)
    move.l 20(%sp),-(%sp)
    jsr (%a0)
    lea 12(%sp),%sp
    move.l %d0,(%a2)
    move.l %d1,4(%a2)
    move.l (%sp)+,%a2
    rts
    .size bs_flex_stock_query,.-bs_flex_stock_query
    .section .note.GNU-stack,"",@progbits
