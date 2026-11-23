| SPDX-License-Identifier: GPL-3.0-or-later
| Development bases only (base.json's dev, machine:base --dev): the development link's router site
| (link.c). After the Analog Rytm MKII's link (sdk/machines/analog-rytm-mkii/elekloader/base/link.s).

        .section .run, "ax"

| ---- stock's SysEx router, OS 1.13 0x400812f6 (router(msg, len, port)) -----------
| Stock's MIDI input hands every complete SysEx (status byte F0, table 0x40112950) to it. The site
| takes its first two instructions (lea -16(sp),sp; movem.l d2-d3/a2-a3,(sp)). (sp) = return,
| 4 msg, 8 len, 12 port. mw_link_rx takes the link's own messages; everything else runs the
| replaced instructions and goes on in stock.
        .globl  mw_link_router
mw_link_router:
        move.l  12(%sp), -(%sp)         | port
        move.l  12(%sp), -(%sp)         | len
        move.l  12(%sp), -(%sp)         | msg
        jsr     mw_link_rx
        lea     12(%sp), %sp
        tst.l   %d0
        bne.s   1f
        lea     -16(%sp), %sp           | the instructions this replaced
        movem.l %d2-%d3/%a2-%a3, (%sp)
        jmp     mw_link_router_resume   | 0x400812fe
1:      rts
