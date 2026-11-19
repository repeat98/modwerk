| SPDX-License-Identifier: GPL-3.0-or-later
| Development bases only (base.json's dev, machine:base --dev): the Digitone II link's receive site (link.c).

        .section .run, "ax"

| ---- stock's SysEx router, OS 1.12 0x4012197a (MIDI task) -------------------------
| The site is the router's lea SYSEX_TABLE,a3 (6 bytes), with the message in a1, its length in d1 and the source in
| d2 (2 or 4 USB, 8 or 16 DIN), as core-dn2 0.3's ev_sysex finds them. mw_link_rx copies the link's own messages into
| its ring; every register comes back as it was and stock routes the message as before, so the site only observes.
        .globl  mw_link_router
mw_link_router:
        lea     -16(%sp), %sp
        movem.l %d0-%d1/%a0-%a1, (%sp)
        move.l  %d2, -(%sp)             | source
        move.l  %d1, -(%sp)             | length
        move.l  %a1, -(%sp)             | message
        jsr     mw_link_rx
        lea     12(%sp), %sp
        movem.l (%sp), %d0-%d1/%a0-%a1
        lea     16(%sp), %sp
        lea     SYSEX_TABLE, %a3        | the instruction the site replaced
        rts
