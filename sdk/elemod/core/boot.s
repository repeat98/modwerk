| SPDX-License-Identifier: GPL-3.0-or-later
| Original Modwerk boot copier, using the public elemod linker symbol ABI.
| It executes in the unpacked image before the mod RAM image exists.
| The original boot call's target is resolved from verified local firmware.
| Assembled with MW_BASE (a machine's Modwerk base), it also copies each .fast row
| to on-chip SRAM, starts DTIM0 as a free-running timebase unless it already runs,
| and calls the base's mw_base_init once, all before the stock boot routine.
        .section .boot, "ax"
        .globl mw_boot
mw_boot:
        lea -64(%sp), %sp
        movem.l %d0-%d7/%a0-%a6, (%sp)
        move.w %sr, %d0
        move.l %d0, 60(%sp)
        movea.l #__run_load, %a0
        movea.l #__run_start, %a1
        move.l #__run_words, %d0
        tst.l %d0
        beq.s .Lzero
.Lcopy:
        move.l (%a0)+, (%a1)+
        subq.l #1, %d0
        bne.s .Lcopy
.Lzero:
        movea.l #__bss_start, %a1
        move.l #__bss_words, %d0
        tst.l %d0
        beq.s .Ldone
.Lclear:
        clr.l (%a1)+
        subq.l #1, %d0
        bne.s .Lclear
.Ldone:
        .ifdef MW_BASE
        | fa_copies rows: {load, run, bytes, 0}, ended by a zero load address.
        lea fa_copies, %a2
.Lrow:
        move.l (%a2), %d0
        beq.s .Lrows
        movea.l %d0, %a0
        movea.l 4(%a2), %a1
        move.l 8(%a2), %d0
        lsr.l #2, %d0
        beq.s .Lnext
.Lfast:
        move.l (%a0)+, (%a1)+
        subq.l #1, %d0
        bne.s .Lfast
.Lnext:
        lea 16(%a2), %a2
        bra.s .Lrow
.Lrows:
        | DTIM0 (MCF54418RM 30.3): leave a running timer alone; else enable its clock
        | (PPMSR0 = 28), reset DTMR0, then run it free from the bus clock (RST, CLK = 01).
        movea.l #0xfc070000, %a0
        move.w (%a0), %d0
        btst #0, %d0
        bne.s .Ltimer
        moveq #28, %d0
        move.b %d0, 0xfc04002d
        moveq #0, %d0
        move.w %d0, (%a0)
        moveq #3, %d0
        move.w %d0, (%a0)
.Ltimer:
        jsr mw_base_init
        .endif
        move.l 60(%sp), %d0
        move.w %d0, %sr
        movem.l (%sp), %d0-%d7/%a0-%a6
        lea 64(%sp), %sp
        jmp mw_stock_boot

        .ifdef MW_BASE
        | What a weak import that no mod defines resolves to.
        .section .bss, "aw", @nobits
        .globl core_zero
core_zero:
        .space 16
        .else
        .section .run, "ax"
        .globl mw_probe_data
mw_probe_data:
        .long 0x4d57524b, 0x434f5245, 0x12345678, 0x87654321
        .section .bss, "aw", @nobits
        .globl mw_probe_zero
mw_probe_zero:
        .space 16
        .endif
