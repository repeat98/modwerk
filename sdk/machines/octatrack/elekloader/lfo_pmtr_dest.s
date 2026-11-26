| SPDX-License-Identifier: MIT
| ot_lfo_pmtr_dest stock seams (events.json; lfo_pmtr_dest.c). Formatter is owned
| at 0x4003bf64. Dest lea at 0x4000d042 (lea + cmpi; pad_to=8; rejoin 0x4000d04a)
| jumps here. Lea claim deferred: FM Synth still at 0x4000d03e until companion migrate.
| Store at 0x4000d07a (move.w d0,(a1) + subq.l #1,4(sp); rejoin 0x4000d080) jumps
| to mw_lfo_pmtr_store so contributed words keep the stock write once dest lea has
| pointed a1 at words[track] (MOP-70). When a1 matches the last resolved contrib
| words ptr and resolve stashed mw_lfo_pmtr_after, call that peer publish hook
| with the word pointer (MOP-71; peers must not claim this site). SETUP encoder
| clamp is an own/poke at 0x4003923c (MOP-34 twin: stock beq 6734 → nop 4e71;
| fall-through 0x4003923e). Displaced stock bytes are zero placeholders the base
| build fills from the user's own OS: no stock byte is carried.
|
| Frame-builder LFO loop (OS 1.40C 0x4000cf40): a4 = per-track LFO state
| (0x80004858 + 8·t), MACSR = 0x20, ACC1/ACC2 hold clamp constants set once
| per track. A C resolve that left those dirty made contributed stores look
| dry under Undo (MOP-69). Reload MACSR+ACC1/ACC2 after resolve; ColdFire has
| no movem predec.
|
| Frame after lea -56: 0:d0 … 28:d7, 32:a0 … 52:a5 (14 longs).
        .text
        .global mw_lfo_pmtr_format, mw_lfo_pmtr_dest, mw_lfo_pmtr_store
        .global mw_lfo_dbg
        .extern mw_lfo_pmtr_after
        .equ    SPRINTF, 0x40013a08
        .equ    LFO_STATE, 0x80004858

| ---- PMTR formatter @ 0x4003bf64 (pad_to=8) --------------------------------
mw_lfo_pmtr_format:
        move.l  8(%sp),%d0
        move.l  %d0,-(%sp)
        jsr     mw_lfo_pmtr_label
        addq.l  #4,%sp
        tst.l   %d0
        beq.s   .stock_fmt
        move.l  %d0,8(%sp)
        jmp     (SPRINTF).l
.stock_fmt:
        .globl  modwerk_stock_4003bf64_8
modwerk_stock_4003bf64_8:
        .space  8
        jmp     0x4003bf6c

| ---- destination lea @ 0x4000d042 (lea + cmpi; pad_to=8) -------------------
mw_lfo_pmtr_dest:
        lea     -56(%sp),%sp
        movem.l %d0-%d7/%a0-%a5,(%sp)
        move.l  48(%sp),%d1             | a4 → track
        subi.l  #LFO_STATE,%d1
        lsr.l   #3,%d1
        andi.l  #7,%d1
        move.l  %d1,-(%sp)              | track
        move.l  20(%sp),-(%sp)          | d4 index (saved at 16; +4 after track push)
        jsr     mw_lfo_pmtr_resolve
        addq.l  #8,%sp
        moveq   #32,%d1                 | reload frame-builder EMAC state
        move.l  %d1,%macsr
        move.l  #0x80000000,%acc1
        move.l  #0x7fff80ff,%acc2
        lea     mw_lfo_dbg,%a0
        addq.l  #1,(%a0)                | dest calls
        move.l  16(%sp),4(%a0)          | last PMTR index (saved d4)
        tst.l   %d0
        beq.s   .stock_lea
        addq.l  #1,8(%a0)               | resolve hits
        move.l  %d0,12(%a0)             | last words ptr
        move.l  (%sp),28(%a0)           | depth at entry (saved d0)
        movea.l %d0,%a1
| Stock PMTR words sit in the live param page the engine keeps as the
| unmodulated base; contribute BSS is not refreshed. In-place
| MAC+saturate (mvs.w (a1) then depth*lfo) therefore rails at 0 or
| 0x7f00 after a few frames (MOP-69/70). Restoring the bipolar centre
| every hit makes each store base+mod like a refreshed stock word.
        move.w  #0x4000,(%a1)
        move.l  %d0,36(%sp)             | saved a1 ← words[track]
        movem.l (%sp),%d0-%d7/%a0-%a5
        lea     56(%sp),%sp
        cmpi.w  #0x7f00,%d0
        jmp     0x4000d04a
.stock_lea:
        movem.l (%sp),%d0-%d7/%a0-%a5
        lea     56(%sp),%sp
        .globl  modwerk_stock_4000d042_8
modwerk_stock_4000d042_8:
        .space  8
        jmp     0x4000d04a

| ---- destination store @ 0x4000d07a (6 B; rejoin 0x4000d080) ---------------
| Replay both displaced insns (move.w d0,(a1) + subq.l #1,4(sp)).
| When a1 matches the last resolved words ptr, keep contrib-only dbg and
| call the optional after_store stashed by resolve (peer publish; MOP-71).
mw_lfo_pmtr_store:
        move.w  %d0,(%a1)
        lea     -16(%sp),%sp
        movem.l %d0/%d1/%a0/%a1,(%sp)
        lea     mw_lfo_dbg,%a0
        addq.l  #1,16(%a0)              | store calls
        move.l  %a1,20(%a0)             | last store a1
        move.w  %d0,24(%a0)             | last store value
        cmp.l   12(%a0),%a1             | contrib words?
        bne.s   2f
        move.w  %d0,26(%a0)             | contrib lastVal
        move.l  4(%sp),32(%a0)          | d1 at contrib store (saved)
        move.l  mw_lfo_pmtr_after,%d1
        beq.s   2f
        addq.l  #1,36(%a0)              | after_store calls
        move.l  %a1,-(%sp)
        move.l  %d1,%a0
        jsr     (%a0)
        addq.l  #4,%sp
2:      movem.l (%sp),%d0/%d1/%a0/%a1
        lea     16(%sp),%sp
        subq.l  #1,4(%sp)
        jmp     0x4000d080

        .bss
        .align  4
mw_lfo_dbg:
        .space  44                      | 0 calls, 4 lastIndex, 8 hits, 12 wordsPtr,
                                        | 16 stores, 20 lastA1, 24 lastVal,
                                        | 26 contribVal, 28 depth, 32 a3_8,
                                        | 36 after_store calls
