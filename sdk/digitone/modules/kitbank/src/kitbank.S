| SPDX-License-Identifier: GPL-3.0-or-later
| kitbank: the 16 patterns of a bank play the kit of the bank's first pattern (A01..A16 -> A01's kit,
| B01..B16 -> B01's kit...), like the Octatrack's parts. A SETTINGS row, KIT PER BANK, turns it on; it is off
| at power-on, and a change applies at the next pattern change (the engine and the screen switch together).
| Digitone mk1 / Keys, OS 1.44 only.
|
| Every place the OS picks "kit k" for pattern k gets "kit k & 0x70" while the switch is latched on:
|   set_pattern       0x40094f14  immediate pattern change -> the sound engine's kit pointer 0x4138f220
|   KitActive::getKit 0x4014df66  screen, edits, sound loads
|   0x40095f08, 0x40096236       a queued pattern change taking effect (playback, chains, song)
|   0x400278f0 / 0x40027d3a / 0x40029ada  kit save, kit reload, sound reload, only when called from the
|                     pattern menus (return address 0x40027a00..0x4002a200), so the automatic saves after
|                     copy / paste / clear keep their own slot.
| Every pattern keeps its own kit in the project, untouched: switched off, each pattern plays its own kit again.
| Handlers touch only d0/d1/a0/a1 (free at a gcc m68k function entry) or save what they use.
| The SETTINGS row follows digihealth's SYSTEM INFO row (GPL-2.0-or-later), with OS 1.44 addresses.

        .equ PATS,       0x407fd414     | the 128 live patterns
        .equ PSTRIDE,    0x1611d
        .equ KITS,       0x41306294     | the 128 live kits
        .equ KSTRIDE,    0x988
        .equ PAT_ACT,    0x4138f214     | active pattern
        .equ KIT_ACT,    0x4138f220     | the sound engine's kit
        .equ MENU_LO,    0x40027a00
        .equ MENU_HI,    0x4002a200
        .equ STR_CTOR,   0x4018afc8     | std::string(this, const char*, alloc&)
        .equ INVALIDATE, 0x400e539e     | View::invalidate(view)
        .equ BLIT,       0x400de4c0     | blit(dst, src, x, y, centre)
        .equ CHECKBOXES, 0x419ee988     | -> Bitmap[2], 0x1c each: empty, ticked

        .section .run, "ax"

| ---- ev_settings: the KIT PER BANK row --------------------------------------------------------------
        .globl  kb_settings
kb_settings:
        pea     kb_row
        move.l  8(%sp), -(%sp)          | the menu
        jsr     core_additem
        addq.l  #8, %sp
        rts

| label() -> std::string, returned through a0
kb_label:
        link    %a6, #-4
        move.l  %d2, -(%sp)
        pea     -1(%a6)
        pea     kb_str
        move.l  %a0, %d2
        move.l  %a0, -(%sp)
        jsr     STR_CTOR
        lea     12(%sp), %sp
        move.l  %d2, %d0
        move.l  -8(%a6), %d2
        unlk    %a6
        rts

| select(payload, item): toggle, then redraw the menu
kb_select:
        movea.l 4(%sp), %a0
        movea.l (%a0), %a0
        moveq   #0, %d0
        tst.b   kb_on
        seq     %d0
        andi.l  #1, %d0
        move.b  %d0, kb_on
        lea     0x38(%a0), %a0
        move.l  %a0, 4(%sp)
        jmp     INVALIDATE

| change(payload, item, delta): RIGHT on, LEFT off
kb_change:
        movea.l 4(%sp), %a0
        movea.l (%a0), %a0
        move.l  12(%sp), %d0
        beq.s   1f
        sgt     %d0
        andi.l  #1, %d0
        move.b  %d0, kb_on
        lea     0x38(%a0), %a0
        move.l  %a0, 4(%sp)
        jmp     INVALIDATE
1:      rts

| draw(payload, item, bmp, x, y): the checkbox
kb_draw:
        moveq   #0, %d0
        tst.b   kb_on
        beq.s   1f
        moveq   #0x1c, %d0
1:      add.l   CHECKBOXES, %d0
        move.l  12(%sp), %d1
        move.l  %d1, 4(%sp)
        move.l  %d0, 8(%sp)
        move.l  16(%sp), %d1
        move.l  %d1, 12(%sp)
        move.l  20(%sp), %d1
        move.l  %d1, 16(%sp)
        clr.l   20(%sp)
        jmp     BLIT

| ---- d0 = pattern pointer -> d0 = its bank kit pointer, or 0 when d0 is no live pattern (d1 destroyed) ----
bankkit:
        sub.l   #PATS, %d0
        bcs.s   8f
        cmp.l   #PSTRIDE*128, %d0
        bcc.s   8f
        move.l  #PSTRIDE, %d1
        divu.l  %d1, %d0                | pattern number
        andi.l  #0x70, %d0              | the bank's first pattern
        mulu.w  #KSTRIDE, %d0
        add.l   #KITS, %d0
        rts
8:      moveq   #0, %d0
        rts

| ---- set_pattern: latch the switch, then the bank's kit for the request ---------------------------------
        .globl  kb_setpat
kb_setpat:
        move.b  kb_on, %d0
        move.b  %d0, kb_live
        beq.s   1f
        move.l  4(%sp), %d0             | pattern*
        bsr.w   bankkit
        tst.l   %d0
        beq.s   1f
        move.l  %d0, 8(%sp)             | kit*
1:      lea     -24(%sp), %sp           | the 8 stock bytes, replayed
        movem.l %d2-%d4/%a2-%a4, (%sp)
        jmp     0x40094f1c

| ---- KitActive::getKit(this, index) ---------------------------------------------------------------------
        .globl  kb_getkit
kb_getkit:
        tst.b   kb_live
        beq.s   2f
        move.l  8(%sp), %d0             | index
        cmp.l   #128, %d0
        bcc.s   2f
        andi.l  #0x70, %d0
        move.l  %d0, 8(%sp)
2:      move.l  %d2, -(%sp)             | the 6 stock bytes, replayed
        movea.l 8(%sp), %a0
        jmp     0x4014df6c

| ---- a queued pattern change taking effect: fp = 0x4138f224 (the waiting kit), PAT_ACT already new -------
qfix:
        lea     -8(%sp), %sp
        movem.l %d0-%d1, (%sp)
        move.b  kb_on, %d0
        move.b  %d0, kb_live
        beq.s   3f
        move.l  PAT_ACT, %d0
        bsr.w   bankkit
        tst.l   %d0
        beq.s   3f
        move.l  %d0, (%fp)
3:      movem.l (%sp), %d0-%d1
        lea     8(%sp), %sp
        rts

        .globl  kb_qact1, kb_qact2
kb_qact1:
        bsr.w   qfix
        move.l  (%fp), KIT_ACT          | the 6 stock bytes, replayed
        jmp     0x40095f0e
kb_qact2:
        bsr.w   qfix
        move.l  (%fp), KIT_ACT
        jmp     0x4009623c

| ---- kit save / kit reload / sound reload (project, flag, k...): k -> the bank's first pattern ----------
| at the bsr: 0(sp) back here, 4(sp) the caller's return, 8 project, 12 flag, 16(sp) k
fixk:
        tst.b   kb_live
        beq.s   9f
        move.l  4(%sp), %d0
        cmp.l   #MENU_LO, %d0
        bcs.s   9f
        cmp.l   #MENU_HI, %d0
        bcc.s   9f
        move.l  16(%sp), %d0
        cmp.l   #128, %d0
        bcc.s   9f
        andi.l  #0x70, %d0
        move.l  %d0, 16(%sp)
9:      rts

        .globl  kb_save, kb_reload, kb_sndreload
kb_save:
        bsr.w   fixk
        link.w  %fp, #-28               | the 8 stock bytes, replayed
        movem.l %d2-%d5/%a2-%a3, (%sp)
        jmp     0x400278f8
kb_reload:
        bsr.w   fixk
        link.w  %fp, #-32
        movem.l %d2-%d6/%a2-%a3, (%sp)
        jmp     0x40027d42
kb_sndreload:
        bsr.w   fixk
        link.w  %fp, #-60
        movem.l %d2-%d7/%a2-%a5, (%sp)
        jmp     0x40029ae2

kb_row: .long   kb_label, kb_select, kb_draw, kb_change
kb_str: .asciz  "KIT PER BANK"
        .balign 4

        .section .bss
        .balign 4
kb_on:  .skip 1                         | the SETTINGS switch, off at power-on
kb_live: .skip 1                        | the switch as of the last pattern change
        .skip 2
