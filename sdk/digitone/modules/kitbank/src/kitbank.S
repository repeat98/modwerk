| SPDX-License-Identifier: GPL-3.0-or-later
| kitbank: the 16 patterns of a bank play the kit of the bank's first pattern (A01..A16 -> A01's kit,
| B01..B16 -> B01's kit...), like the Octatrack's parts. A SETTINGS row, KIT PER BANK, turns it on for the
| project; a change applies at the next pattern change (the engine and the screen switch together).
| [PTN]+[YES] on a pattern LOCKS it: it takes a copy of the bank's kit and keeps its own sound from then on;
| [PTN]+[YES] again shares the bank's kit again. The switch and the 128 locks are saved in the project header
| (an elekloader-format ELKP block tagged KBLK, in the bytes 0x1c..0x200 the OS keeps as they are); a project
| without the block opens with the switch off and no lock, so every pattern plays its own kit as on the stock OS.
| Digitone mk1 / Keys, OS 1.44 only.
|
| Every place the OS picks "kit k" for pattern k gets "kit k & 0x70" while the switch is latched on:
|   set_pattern       0x40094f14  immediate pattern change -> the sound engine's kit pointer 0x4138f220
|   KitActive::getKit 0x4014df66  screen, edits, sound loads
|   0x40095f08, 0x40096236       a queued pattern change taking effect (playback, chains, song)
|   0x4000eb10 / 0x4000e7f4 / 0x4001570e  project save / load / new: the KBLK block
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
        .equ GET_UI,     0x4014a060     | -> the UI (for messages)
        .equ SHOW_MSG,   0x400ae25c     | (ui, text): the short message in the top bar
        .equ KA_LOAD,    0x4001da46     | KitActive::load(this, index, 1, 0): the tracks take kit index
        .equ PROJ_PTR,   0x419f0de0     | -> the project; KitActive = project + 0x250
        .equ KEY_PTN,    4
        .equ PASTE_WRITE, 0x40028146    | return address of the paste routine's getKit before writing the kit
        .equ PASTE_KIT,  0x16121        | the kit inside the clipboard
        .equ KEY_YES,    13
        .equ GAP,        0x1c           | project header bytes the OS keeps: elekloader's ELKP area
        .equ ELKP,       0x454c4b50
        .equ KBLK,       0x4b424c4b
        .equ BLK_SIZE,   20             | kb_on (4) + 128 lock bits (16)

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
        bsr.w   resolve                 | the bank's first pattern, or itself when locked
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
        move.l  (%sp), %d1
        cmp.l   #PASTE_WRITE, %d1
        beq.s   3f
        bsr.w   resolve
        move.l  %d0, 8(%sp)
2:      move.l  %d2, -(%sp)             | the 6 stock bytes, replayed
        movea.l 8(%sp), %a0
        jmp     0x4014df6c
3:      bsr.w   pastefix                | pasting: the pattern's own slot, locked when the sound differs
        bra.s   2b

| ---- a pattern paste writes the clipboard's kit into getKit(k) (caller 0x40028146; the clipboard's kit is at
| *(fp-16) + 0x16121, fp being the paste routine's frame). Into a bank's first pattern it replaces the bank's
| kit, as the stock OS replaces that pattern's kit. Into another pattern it goes to the pattern's own slot, which
| is left as it is in 8(sp), and the pattern is locked when the pasted kit differs from the bank's kit, shared
| when it is the same: the bank's kit is never overwritten from another pattern.
pastefix:
        move.l  %d0, %d1
        andi.l  #15, %d1
        beq.w   9f                      | a bank's first pattern: its slot is the bank's kit
        lea     -16(%sp), %sp
        movem.l %d2-%d3/%a2-%a3, (%sp)
        move.l  %d0, %d3                | d3 = k, kept to the end
        movea.l -16(%fp), %a2
        adda.l  #PASTE_KIT, %a2         | the clipboard's kit
        andi.l  #0x70, %d0
        mulu.w  #KSTRIDE, %d0
        add.l   #KITS, %d0
        movea.l %d0, %a3                | the bank's kit
        move.l  #KSTRIDE/4, %d1
1:      move.l  (%a2)+, %d0
        cmp.l   (%a3)+, %d0
        bne.s   2f
        subq.l  #1, %d1
        bne.s   1b
        moveq   #0, %d1                 | the same sound: shared
        bra.s   3f
2:      moveq   #1, %d1                 | another sound: locked
3:      move.l  %d3, %d0
        lsr.l   #3, %d0
        lea     kb_locks, %a2
        adda.l  %d0, %a2                | a2 = the byte
        move.l  %d3, %d0
        andi.l  #7, %d0                 | d0 = the bit
        moveq   #0, %d2
        move.b  (%a2), %d2
        bclr    %d0, %d2
        tst.l   %d1
        beq.s   4f
        bset    %d0, %d2
4:      move.b  %d2, (%a2)
        move.l  PAT_ACT, %d0            | pasting into the active pattern: the engine follows its kit now
        sub.l   #PATS, %d0
        bcs.s   5f
        move.l  #PSTRIDE, %d1
        divu.l  %d1, %d0
        cmp.l   %d3, %d0
        bne.s   5f
        bsr.w   resolve
        mulu.w  #KSTRIDE, %d0
        add.l   #KITS, %d0
        move.l  %d0, KIT_ACT
5:      move.l  %d3, %d0                | k again for the caller
        movem.l (%sp), %d2-%d3/%a2-%a3
        lea     16(%sp), %sp
9:      rts

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
        bsr.w   resolve
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


| ---- resolve: d0 = pattern 0..127 -> the kit index it plays while on (d1 destroyed) ----------------------
resolve:
        move.l  %a0, -(%sp)
        move.l  %d0, %d1
        lsr.l   #3, %d1
        lea     kb_locks, %a0
        move.b  (%a0,%d1.l), %d1
        movea.l (%sp)+, %a0
        move.l  %d0, -(%sp)
        andi.l  #7, %d0
        btst    %d0, %d1
        bne.s   1f
        move.l  (%sp)+, %d0
        andi.l  #0x70, %d0              | shared: the bank's first pattern
        rts
1:      move.l  (%sp)+, %d0             | locked: its own kit
        rts

| ---- ev_key(brain, ev): [PTN]+[YES] locks or shares the active pattern while on -------------------------------
| ev+12 key code, ev+16 flags (bit 0 press, bit 1 FUNC held, bit 3 a held key's repeat). PTN presses and releases
| go to the OS as usual (they only track whether PTN is held); a YES press while PTN is held is taken. On the stock
| OS, YES does nothing while PTN is held.
        .globl  kb_key
kb_key:
        movea.l 8(%sp), %a0
        move.l  12(%a0), %d1            | key code
        move.l  16(%a0), %d0            | flags
        moveq   #KEY_PTN, %d1
        cmp.l   12(%a0), %d1
        bne.s   1f
        andi.l  #1, %d0
        move.b  %d0, kb_ptn             | PTN held or not
        bra.s   8f
1:      moveq   #KEY_YES, %d1
        cmp.l   12(%a0), %d1
        bne.s   8f
        tst.b   kb_ptn
        beq.s   8f
        tst.b   kb_live
        beq.s   8f                      | off: the stock OS gets it
        btst    #0, %d0
        beq.s   7f                      | the release: taken
        btst    #3, %d0
        bne.s   7f                      | a held key's repeat: taken, nothing done
        bsr.w   toggle
7:      moveq   #1, %d0
        rts
8:      moveq   #0, %d0
        rts

toggle:
        lea     -16(%sp), %sp
        movem.l %d2-%d3/%a2-%a3, (%sp)
        move.l  PAT_ACT, %d2
        sub.l   #PATS, %d2
        bcs.w   9f
        cmp.l   #PSTRIDE*128, %d2
        bcc.w   9f
        move.l  #PSTRIDE, %d1
        divu.l  %d1, %d2                | d2 = the active pattern
        move.l  %d2, %d0
        andi.l  #15, %d0
        bne.s   1f
        pea     msg_first               | a bank's first pattern: its kit is the bank's kit
        bra.w   6f
1:      move.l  %d2, %d3
        lsr.l   #3, %d3
        lea     kb_locks, %a2
        adda.l  %d3, %a2                | a2 = the byte
        move.l  %d2, %d3
        andi.l  #7, %d3                 | d3 = the bit
        moveq   #0, %d0
        move.b  (%a2), %d0
        btst    %d3, %d0
        beq.s   2f
        bclr    %d3, %d0                | share again
        move.b  %d0, (%a2)
        pea     msg_shared
        bra.s   5f
2:      move.l  %d0, -(%sp)             | lock: copy the bank's kit into the pattern's own slot first
        move.l  %d2, %d0
        andi.l  #0x70, %d0
        mulu.w  #KSTRIDE, %d0
        add.l   #KITS, %d0
        movea.l %d0, %a0
        move.l  %d2, %d0
        mulu.w  #KSTRIDE, %d0
        add.l   #KITS, %d0
        movea.l %d0, %a1
        move.l  #KSTRIDE/4, %d1
3:      move.l  (%a0)+, (%a1)+
        subq.l  #1, %d1
        bne.s   3b
        move.l  (%sp)+, %d0
        bset    %d3, %d0
        move.b  %d0, (%a2)
        pea     msg_locked
5:      move.l  %d2, %d0                | the engine and the tracks move to the kit it now plays
        bsr.w   resolve
        move.l  %d0, %d3
        mulu.w  #KSTRIDE, %d0
        add.l   #KITS, %d0
        move.l  %d0, KIT_ACT
        clr.l   -(%sp)
        pea     1
        move.l  %d3, -(%sp)
        movea.l PROJ_PTR, %a0
        pea     0x250(%a0)
        jsr     KA_LOAD
        lea     16(%sp), %sp
6:      jsr     GET_UI
        move.l  %d0, -(%sp)
        jsr     SHOW_MSG
        addq.l  #8, %sp
9:      movem.l (%sp), %d2-%d3/%a2-%a3
        lea     16(%sp), %sp
        rts

| ---- project save: Project_serialize(file, project, ...) writes the KBLK block into the file header --------
        .globl  kb_projsave
kb_projsave:
        movea.l 4(%sp), %a0
        lea     GAP(%a0), %a0
        move.l  (%a0), %d0
        beq.s   1f
        cmp.l   #ELKP, %d0              | another tool's data: left alone
        bne.s   4f
1:      move.l  #ELKP, (%a0)+
        move.l  #KBLK, (%a0)+
        moveq   #BLK_SIZE, %d0
        move.l  %d0, (%a0)+
        lea     kb_on, %a1
        moveq   #BLK_SIZE/4, %d1
2:      move.l  (%a1)+, (%a0)+
        subq.l  #1, %d1
        bne.s   2b
        clr.l   (%a0)                   | a zero tag ends the list
4:      lea     -44(%sp), %sp           | the 8 stock bytes, replayed
        movem.l %d2-%d7/%a2-%a6, (%sp)
        jmp     0x4000eb18

| ---- project load: Project_deserialize(project, file, ...) reads it back; no block -> off, no lock --------
        .globl  kb_projload
kb_projload:
        bsr.s   clear
        movea.l 8(%sp), %a0
        move.l  %a0, %d0
        beq.s   4f
        lea     GAP(%a0), %a0
        move.l  (%a0)+, %d0
        cmp.l   #ELKP, %d0
        bne.s   4f
        move.l  (%a0)+, %d0
        cmp.l   #KBLK, %d0
        bne.s   4f
        moveq   #BLK_SIZE, %d0
        cmp.l   (%a0)+, %d0
        bne.s   4f
        lea     kb_on, %a1
        moveq   #BLK_SIZE/4, %d1
2:      move.l  (%a0)+, (%a1)+
        subq.l  #1, %d1
        bne.s   2b
4:      lea     -36(%sp), %sp
        movem.l %d2-%d5/%a2-%a6, (%sp)
        jmp     0x4000e7fc

| ---- new project: off, no lock -----------------------------------------------------------------------------
        .globl  kb_projnew
kb_projnew:
        bsr.s   clear
        lea     -20(%sp), %sp
        movem.l %d2-%d4/%a2-%a3, (%sp)
        jmp     0x40015716

clear:
        lea     kb_on, %a0
        moveq   #BLK_SIZE/4, %d0
1:      clr.l   (%a0)+
        subq.l  #1, %d0
        bne.s   1b
        rts

kb_row: .long   kb_label, kb_select, kb_draw, kb_change
kb_str: .asciz  "KIT PER BANK"
msg_locked: .asciz "KIT LOCKED"
msg_shared: .asciz "KIT SHARED"
msg_first:  .asciz "BANK KIT"
        .balign 4

        .section .bss
        .balign 4
kb_on:  .skip 4                         | byte 0: the project's KIT PER BANK switch (saved, with kb_locks)
kb_locks: .skip 16                      | 128 bits: pattern k = byte k/8, bit k%8
kb_live: .skip 4                        | byte 0: the switch as of the last pattern change
kb_ptn: .skip 4                         | byte 0: PTN held
