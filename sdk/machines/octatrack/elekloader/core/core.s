| SPDX-License-Identifier: GPL-3.0-or-later
| Boot copier (Modwerk core). The OS entry's jsr to stock's DSP-boot step (0x4000050c) lands on boot.
| boot runs that step, places .run, clears .bss and sets core_up, then returns with every register as
| the DSP-boot step left it. All writes into the reserve go through the uncached alias, so no data-cache
| line can still hold the reserve's old bytes when code there first runs or C first reads .bss.
| Nothing in .boot may be called after boot returns: stock reuses this RAM.
| No CACR write, no cache push, no SR change.
|
| Assembly-time switches (--defsym NAME=1), all off for the standalone core:
|   MW_PREBOOT        call mw_resident_dsp_boot before anything else
|   MW_RUN_PACKED     place .run with mw_run_unpack instead of the word copy
|   MW_RETAINED_SKIP  leave [modwerk_retained_start, modwerk_retained_end) out of the .bss clear
|   MW_FLASH_SNAPSHOT call modwerk_flash_snapshot last
| ColdFire V4e; assemble with -mcpu=54455.

        .section .boot, "ax"
        .globl  boot
        .balign 2
boot:
        .ifdef  MW_PREBOOT
| MODWERK-SEAM: preboot
        jsr     mw_resident_dsp_boot    | saves every register it uses itself
        .endif
        jsr     BOOT_CONTINUE           | the call the site replaced, registers as at the site
        lea     -16(%sp), %sp           | reserve the frame first: ColdFire movem has no -(sp)
        movem.l %d0-%d1/%a0-%a1, (%sp)

| Place .run: 4 * __run_words bytes at __run_start, uncached.
        .ifdef  MW_RUN_PACKED
| MODWERK-SEAM: run-packed
        jsr     mw_run_unpack           | preserves every register; hangs on a bad stream
        .else
        lea     __run_load, %a0
        movea.l #__run_start + UNCACHED, %a1
        move.l  #__run_words, %d0
        beq.s   2f                      | zero words: copy nothing
1:      move.l  (%a0)+, (%a1)+
        subq.l  #1, %d0
        bne.s   1b
2:
        .endif

| Clear .bss as address ranges [%a0, %a1), so an empty range (zero words, or the retained block flush
| with either end) clears nothing.
        move.l  #__bss_words, %d0
        movea.l #__bss_start + UNCACHED, %a0
        lea     (%a0, %d0.l*4), %a1     | uncached end of .bss
        .ifdef  MW_RETAINED_SKIP
| MODWERK-SEAM: retained-skip
        move.l  %a1, -(%sp)             | keep the end for the second range
        movea.l #modwerk_retained_start + UNCACHED, %a1
        bsr.s   clear_range
        movea.l #modwerk_retained_end + UNCACHED, %a0
        movea.l (%sp)+, %a1
        .endif
        bsr.s   clear_range

        moveq   #1, %d0
        move.b  %d0, core_up            | from here the draw gate enters the bus

        .ifdef  MW_FLASH_SNAPSHOT
| MODWERK-SEAM: flash-snapshot
        jsr     modwerk_flash_snapshot  | C: clobbers d0/d1/a0/a1, restored below
        .endif

        movem.l (%sp), %d0-%d1/%a0-%a1
        lea     16(%sp), %sp
        rts

| Zero the longs from %a0 up to %a1 (unsigned compare; both are uncached SDRAM addresses).
clear_range:
        moveq   #0, %d1
1:      cmpa.l  %a1, %a0
        bcc.s   2f
        move.l  %d1, (%a0)+
        bra.s   1b
2:      rts

| Weak imports nothing defines resolve here: 16 bytes that are never written, so they read as zero.
        .section .bss
        .balign 4
        .globl  core_zero
core_zero:
        .space  16
