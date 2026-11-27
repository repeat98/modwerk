| SPDX-License-Identifier: GPL-3.0-or-later
| Every base (base.json's common): the link's router site and the boot site (link.c). A development base
| adds link-dev.s: the GLOBAL row's label and the RAM boot's sites. The is_key_held site (development bases)
| jumps straight to link.c's mw_link_held.

        .section .run, "ax"

| ---- stock's SysEx router, OS 1.74 0x40083dd8 (router(msg, len, iface)) -----------
| The site takes its first two instructions (lea -16(sp),sp; movem.l d2-d3/a2-a3,(sp)).
| (sp) = return, 4 msg, 8 len, 12 iface. mw_link_rx takes the link's own messages;
| everything else runs the replaced instructions and goes on in stock.
        .globl  mw_link_router
mw_link_router:
        move.l  12(%sp), -(%sp)         | iface
        move.l  12(%sp), -(%sp)         | len
        move.l  12(%sp), -(%sp)         | msg
        jsr     mw_link_rx
        lea     12(%sp), %sp
        tst.l   %d0
        bne.s   1f
        lea     -16(%sp), %sp           | the instructions this replaced
        movem.l %d2-%d3/%a2-%a3, (%sp)
        jmp     mw_link_router_resume   | 0x40083de0
1:      rts

| ---- the boot site, OS 1.74 0x400008c6 --------------------------------------------
| Takes stock's two calls (jsr 0x400007e4: .data to SRAM; jsr 0x4000083a: .bss clear):
| the gate first (the set identity, the log, a development base's RAM boot), then both. The second's rts returns to the site's padding.
        .globl  mw_boot_site
mw_boot_site:
        jsr     mw_boot_gate
        jsr     mw_boot_data            | 0x400007e4
        jmp     mw_boot_bss             | 0x4000083a

