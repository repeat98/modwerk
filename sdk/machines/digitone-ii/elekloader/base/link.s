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

| ---- SETTINGS > REMOTE CTRL's label: a std::function returning a std::string --------
| The string to build is at a0; d0 returns a0.
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
        jsr     FW_STR_NEW              | stock (string, text, allocator), from the recipe
        lea     12(%sp), %sp
        move.l  %d2, %d0
        movea.l %d2, %a0
        movem.l (%sp), %d2/%a2
        unlk    %a6
        rts

| ---- RAM boot (LINK.md): the Analog Rytm MKII link's, at OS 1.12's addresses ----------
| Stock's upgrade job, 0x4010921c (jsr 0x40139104): the call that erases, writes and
| resets, with (upload, progress) on the stack. Stock's routine unless the host asked for
| a RAM boot (1) or asked and was cancelled (2): then mw_link_ramboot_go, which never
| writes the flash.
        .globl  mw_link_program
mw_link_program:
        tst.l   mw_link_ramboot_due
        bne.s   1f
        jmp     mw_link_flash           | 0x40139104, the stack as the site left it
1:      jmp     mw_link_ramboot_go      | (sp) return, 4 upload: never returns

| Every dirty line of the data cache out to DDR, registers only: by replacement (eight
| reads 64 KB apart for each of 512 sets), then cpushl by set and way. The Rytm's: on a
| MKII cpushl alone did not get the lines to DDR (9 Nov 2026).
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

| The push, then the data cache off: cacr as stock's 0xa50ce100 (OS 1.12 0x4000055a, as the
| Rytm's 1.74) without the data cache, its store buffer and the invalidates.
        .globl  mw_cache_off
mw_cache_off:
        bsr.s   mw_cache_push
        move.l  #0x0408e000, %d0
        movec   %d0, %cacr
        nop
        rts

| Stock's reset, as 0x40139104 ends (OS 1.12 0x401391f6, interrupts already masked): 0 to
| 0x48000000, 27 nops, 0x80 to the reset control register. The same as the Rytm's 1.74.
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

| The boot site, OS 1.12 0x4000053e (the same 8 bytes as the Rytm's 0x400008c6): stock's
| two calls (jsr 0x4000045c: .data to SRAM; jsr 0x400004b2: clear 0x402fb000-0x466b8c50,
| the staged upload included), the gate first. The second's rts returns to the padding.
        .globl  mw_boot_site
mw_boot_site:
        jsr     mw_boot_gate
        jsr     mw_boot_data            | 0x4000045c
        jmp     mw_boot_bss             | 0x400004b2

| mw_boot_enter(arg): enters the image now at 0x40000400 as the bootstrap does, with the
| instruction and branch caches invalidated first, by three instructions run from the
| stack (never fetched before). The Rytm's.
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
