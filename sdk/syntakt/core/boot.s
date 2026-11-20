| SPDX-License-Identifier: GPL-3.0-or-later
| Modwerk Syntakt core, ColdFire ISA_A. Original code. The assembled bytes live in src/engine/elektron/syntakt.ts
| (SYNTAKT_BOOT_STUB for OS 1.40, SYNTAKT_GAP_STUB for OS 1.42) and src/engine/elektron/syntakt.test.ts decodes them
| instruction by instruction.
|
| The core is entered through a `jmp` planted at the wipe's first instruction (0x400004b2 in OS 1.40 and 1.42). The
| factory system has already copied fast memory and has not yet wiped working memory. Anything glued onto the main
| system sits inside that wipe, so this stub has to copy itself out before it returns. Interrupts are masked. A0 and
| D1 start free. D4-D7 must be preserved, which the two replayed factory instructions do. D0 and A1 are saved around
| the copy and restored before the return.
|
| OS 1.40 links only the replay, the mark and the return. It does not lower the stack and does not copy itself.
| OS 1.42 also changes the factory stack word at 0x400004f4 from 0x48000000 to 0x47fe0000. That word is the only
| factory change that opens the gap. The stack grows down, so the staying copy lives in the 128 KB above the new
| stack start. The glued-on copy remains in the wipe and dies when the wipe runs.

	.text
	.globl	mw_boot
mw_boot:
	lea	-16(%sp),%sp		| replay the two displaced stock instructions
	movem.l	%d4-%d7,(%sp)
	lea	0x8000733c,%a0		| the SRAM tail, where the mark is written; not mod memory
	move.l	#0x4d57534b,(%a0)+	| signature "MWSK"
	move.l	#0x00010000,(%a0)+	| probe version 0.1.0
	move.l	#0x00000cc4,(%a0)+	| length of the reserved SRAM tail (3268 bytes)
	move.l	#0,(%a0)		| reserved
	| ----- OS 1.42 continues here. OS 1.40 jumps to mw_stock_resume instead. -----
	move.l	%d0,-(%sp)		| only A0 and D1 start free
	move.l	%a1,-(%sp)
	lea	mw_boot,%a0		| the glued-on copy, still inside the wipe
	lea	0x47fe0000,%a1		| the staying copy, at the start of the stack gap
	move.l	#21,%d1			| this stub is 84 bytes, 21 longwords
	tst.l	%d1
	beq.s	mw_copied
mw_copy:
	move.l	(%a0)+,%d0		| ColdFire has no memory-to-memory move
	move.l	%d0,(%a1)+
	subq.l	#1,%d1
	bne.s	mw_copy
mw_copied:
	move.l	(%sp)+,%a1
	move.l	(%sp)+,%d0
	nop				| the staying copy is a whole number of longwords
	jmp	mw_stock_resume		| back to stock at 0x400004ba (relocated by the linker)
