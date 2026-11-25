| SPDX-License-Identifier: GPL-3.0-or-later
| Development bases only (base.json's dev, machine:base --dev): the GLOBAL row's label and the RAM boot's
| sites and helpers (link.c). Every base's router and boot sites are in link.s.

        .section .run, "ax"

| ---- GLOBAL > REMOTE CONTROL's label: a std::function returning a std::string -------
| The string to build is at a0; d0 returns a0 (as Sample Playback Rate's row label).
        .globl  mw_link_row_label
mw_link_row_label:
        link    %a6, #-4
        lea     -8(%sp), %sp            | ColdFire's movem takes (An) only
        movem.l %d2/%a2, (%sp)
        move.l  %a0, %d2
        jsr     mw_link_row_text        | d0 = the text, as an integer
        movea.l %d0, %a2
        pea     -1(%a6)                 | the allocator, unused
        move.l  %a2, -(%sp)
        move.l  %d2, -(%sp)
        jsr     mw_link_string          | stock 0x401bcff0 (string, text, allocator)
        lea     12(%sp), %sp
        move.l  %d2, %d0
        movea.l %d2, %a0
        movem.l (%sp), %d2/%a2
        unlk    %a6
        rts

| ---- RAM boot: stock's upgrade job, OS 1.74 0x4004dc14 (jsr 0x4009f404) -----------
| The call that erases, writes and resets, with (struct, ctx) on the stack. Stock's
| routine unless the host asked for a RAM boot of this upload (1) or asked and was
| cancelled (2): then mw_link_ramboot_go, which never writes the flash.
        .globl  mw_link_program
mw_link_program:
        tst.l   mw_link_ramboot_due
        bne.s   1f
        jmp     mw_link_flash           | 0x4009f404, the stack as the site left it
1:      jmp     mw_link_ramboot_go      | (sp) return, 4 struct: never returns

| Every dirty line of the data cache out to DDR, two ways, registers only (no memory
| write of its own). First by replacement: for each of 512 sets (a 32 KB four-way
| cache; a 16 KB one sees each twice) eight reads 64 KB apart in the OS's code. At
| most four can hit, so at least four miss in a row of the replacement counter and
| every way is refilled, its dirty line written out first. Then cpushl, which names a
| line by set (a0 bits 4 and up) and way (bits 1-0): on a MKII it alone did not
| get the lines to DDR (9 Nov 2026).
        .globl  mw_cache_push
mw_cache_push:
        nop
        movea.l #0x40000000, %a0
        move.l  #512, %d1
1:      moveq   #8, %d0
        movea.l %a0, %a1
2:      tst.b   (%a1)
        adda.l  #0x10000, %a1
        subq.l  #1, %d0
        bne.s   2b
        lea     16(%a0), %a0
        subq.l  #1, %d1
        bne.s   1b
        moveq   #0, %d0                 | way
3:      movea.l %d0, %a0
        move.l  #512, %d1
4:      cpushl  %dc, (%a0)
        lea     16(%a0), %a0
        subq.l  #1, %d1
        bne.s   4b
        addq.l  #1, %d0
        moveq   #4, %d1
        cmp.l   %d1, %d0
        bne.s   3b
        rts

| The push, then the data cache off: cacr as stock's 0xa50ce100 without the data
| cache, its store buffer and the invalidates. What is written after this goes to DDR
| at once. Call with interrupts masked; the next thing is a reset.
        .globl  mw_cache_off
mw_cache_off:
        bsr.s   mw_cache_push
        move.l  #0x0408e000, %d0
        movec   %d0, %cacr
        nop
        rts

| Stock's reset, as 0x4009f404 ends (interrupts already masked): 0 to 0x48000000, its
| run of nops, 0x80 to the reset control register.
        .globl  mw_link_reset
mw_link_reset:
        moveq   #0, %d0
        move.l  %d0, 0x48000000
        .rept   27
        nop
        .endr
        moveq   #-128, %d0
        move.b  %d0, 0xec090000
1:      bra.s   1b

| mw_boot_enter(arg): enters the image now at 0x40000400 as the bootstrap does, with
| the instruction and branch caches invalidated first: they hold lines of the image
| that was running and of this mod area, which the new image's boot hook rewrites.
| The three instructions that do it run from the stack, never executed before, so
| nothing fetched after the invalidate is stale. cacr = the bootstrap's 0x0008c000
| + ICINVA + BCINVA. The entry reads its argument at 4(sp) and sets its own stack.
        .globl  mw_boot_enter
mw_boot_enter:
        move.l  4(%sp), %d1
        movea.l 0x40000400, %a0
        move.l  #0x000cc100, %d0
        move.l  #0x4e904e71, -(%sp)     | jsr (a0); nop
        move.l  #0x4e7b0002, -(%sp)     | movec d0, cacr
        movea.l %sp, %a1
        move.l  %d1, -(%sp)
        jmp     (%a1)
