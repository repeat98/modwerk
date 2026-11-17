/* SPDX-License-Identifier: GPL-2.0-or-later */
/* Replay the stock serializer call with its original five arguments. */
        .text
        .globl core_startup_serialize
core_startup_serialize:
        move.l  20(%sp),-(%sp)
        move.l  20(%sp),-(%sp)
        move.l  20(%sp),-(%sp)
        move.l  20(%sp),-(%sp)
        move.l  20(%sp),-(%sp)
        jsr     0x400df66c
        lea     20(%sp),%sp
        tst.b   %d0
        beq.s   1f
        move.l  %d0,-(%sp)
        move.l  12(%sp),-(%sp)
        move.l  12(%sp),-(%sp)
        jsr     core_startup_kitdata_refresh
        addq.l  #8,%sp
        move.l  (%sp)+,%d0
1:      rts

        .balign 4
        .globl core_startup_kitdata_layout
core_startup_kitdata_layout:
        .long FW_STARTUP_PROJECT_FILE, FW_ACTIVE_PROJECT
        .long FW_STARTUP_KITS_OFFSET, FW_STARTUP_KIT_STRIDE
