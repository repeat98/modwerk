| SPDX-License-Identifier: GPL-3.0-or-later
| Modwerk Syntakt boot probe, ColdFire ISA_A. Original code; the assembled bytes live in src/engine/elektron/syntakt.ts
| (SYNTAKT_BOOT_STUB) and src/engine/elektron/syntakt.test.ts decodes them instruction by instruction.
|
| The core is entered through a `jmp` planted at the BSS-clear entry (0x400004b2 in OS 1.40 and 1.42), the one place a
| core must run on this machine: the OS copies its on-chip SRAM image first, then zeroes everything from the SRAM-init
| data to the end of its BSS, and anything appended to the main OS lies inside that range. At this point interrupts are
| masked, SRAM is initialised, A0 and D1 are free (the BSS clear sets them next) and D4-D7 must be preserved.

	.text
	.globl	mw_boot
mw_boot:
	lea	-16(%sp),%sp		| replay the two displaced stock instructions
	movem.l	%d4-%d7,(%sp)
	lea	0x8000733c,%a0		| the proven-free SRAM tail (sdk/syntakt/core/stock-map.json)
	move.l	#0x4d57534b,(%a0)+	| signature "MWSK": a trial can read it back to see that the hook ran
	move.l	#0x00010000,(%a0)+	| probe version 0.1.0
	move.l	#0x00000cc4,(%a0)+	| length of the reserved area (3268 bytes)
	move.l	#0,(%a0)		| reserved
	jmp	mw_stock_resume		| back to stock at 0x400004ba (relocated by the linker)
