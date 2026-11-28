| SPDX-License-Identifier: GPL-2.0-or-later
| Analog Rytm core (Modwerk): an OS upgrade's restart lets the queued serial bytes go out first.
|
| After writing a new OS stock masks every interrupt and calls FINISH_DRAIN, which waits for counts that only the
| panel link's DMA and the UART interrupts move: bytes still queued then never leave, and the unit hangs on
| SUCCESS! REBOOTING. core_finish_drain (jsr from that site, or from C as a void function) lets the interrupts
| run until both queues are empty, then masks them and goes on in FINISH_DRAIN, which returns to the caller with
| interrupts masked. Uses d1 and SR besides what FINISH_DRAIN uses.

        .irp name, FINISH_PANEL, FINISH_UART, FINISH_DRAIN
        .ifndef \name
        .error "finish.s: \name is not defined for this machine"
        .endif
        .endr

        .section .run, "ax"

        .globl core_finish_drain
core_finish_drain:
        move.w %sr, %d1
1:      move.w #0x2700, %sr
        tst.l FINISH_PANEL
        bgt.s 2f
        tst.l FINISH_UART
        bgt.s 2f
        jmp FINISH_DRAIN
2:      move.w %d1, %sr
3:      tst.l FINISH_PANEL
        bgt.s 3b
        tst.l FINISH_UART
        bgt.s 3b
        bra.s 1b
