| SPDX-License-Identifier: GPL-3.0-or-later
| Modwerk's Rytm base: the FX track's edit save keeps words 38 to 41 off the
| delay's TIME. OS 1.74.
|
| Stock saves each edit of the FX track (0x400a5692, the FX track's vtable
| slot at 0x401dc46c) into the stored kit's FX record (a3: the stored kit
| + 0x7c6, the working kit's for the current kit), word by word, at
| a3 + 4 + 2 * slot, the slot from 0x40007602(12, word). That map knows words
| 0 to 37 (table 0x401c5b4c) and returns 0 for 38 to 41, so a stock-setter
| edit of word 38 to 41 lands on slot 0, the delay's TIME. Slots 38 to 41
| (a3 + 0x50) are the stored kit's copy of those words, where core-ar2 keeps
| the kit's mod storage (KIT_SPARE, store.c): map them there, and write the
| kit's four words with this layout's ID and kit generation as core's
| write-through does, so the edit loads back after a power cycle even on a
| kit last saved by an older layout.
|
| Sites: the edit save's two `lea 0x40007602,%a5` (0x400a56ee, 0x400a575a)
| become `jsr mw_fx_map_load`, which loads mw_fx_map instead. Only the two
| word-to-slot calls (returning to 0x400a5704 and 0x400a5762) are guarded:
| the same register also maps word 4's value (an index in its high byte, at
| 0x400a572a and 0x400a578c), which stock never sets to 38 to 41 and which
| goes to stock unchanged. Called like 0x40007602(track, word); d0, d1, a0
| and a1 are scratch, as for any call.
        .text
        .globl  mw_fx_map_load, mw_fx_map
        .align  2
mw_fx_map_load:
        lea     mw_fx_map,%a5
        rts

mw_fx_map:
        move.l  (%sp),%d0
        cmp.l   #0x400a5704,%d0         | the list's word-to-slot call
        beq.s   1f
        cmp.l   #0x400a5762,%d0         | the single word's
        bne.s   9f
1:      moveq   #12,%d0                 | the FX track
        cmp.l   4(%sp),%d0
        bne.s   9f
        move.l  8(%sp),%d0
        moveq   #38,%d1
        sub.l   %d1,%d0
        moveq   #3,%d1
        cmp.l   %d1,%d0
        bhi.s   9f                      | not 38 to 41: stock's slot
        move.l  %a3,%d1
        beq.s   2f
        move.l  %a2,-(%sp)              | the live words: the caller's own call
        move.l  (%a2),%a0
        move.l  40(%a0),%a0
        jsr     (%a0)
        addq.l  #4,%sp
        move.l  %d0,%a0
        move.l  76(%a0),%d1             | words 38 and 39
        move.l  %d1,0x50(%a3)
        move.l  80(%a0),%d1             | 40 and 41
        move.l  %d1,0x54(%a3)
        move.l  core_store_ids,%d1      | this layout's ID
        move.l  %d1,0x58(%a3)
        move.l  #__store_gen,%d1        | sound, kit, global, track generations
        swap    %d1
        move.b  %d1,0x5c(%a3)           | the kit's
2:      move.l  8(%sp),%d0              | slot = word
        rts
9:      jmp     0x40007602
