| SPDX-License-Identifier: MIT
| SPDX-FileCopyrightText: 2026 jonathanwardle1992-beep
|
| TEMPO LFO -- project/global tempo as LFO PMTR destination TEMPO (index 39).
|
| Live state in DRAM (.bss):
|   tm_bpm_w[8]   halfwords LFO writes (amount in bits 8-15, 0..127)
|   tm_dirty[8]   non-zero after an LFO store to that track's TEMPO word
|
| Symbols:
|   tm_on_store   contribute after_store: map/publish into PROJECT_BPM24
|                 (base mw_lfo_pmtr_store calls this; do not claim 0x4000d07a)
|   tm_lfo_store  legacy site-shaped helper (unused; store is base-owned)
|   tm_lfo_pmtr   USB contribute record for base table ot_lfo_pmtr_dest
|
| Publishes the stock project tempo word at 0x8000181c (BPM x 24, 30..300),
| the same word REPITCH and the frame builder already follow. Does NOT own
| track scale/speed (that is TSPD / track-speed-lfo at index 34). Does NOT
| claim ev_audio_step / Play Modes / SPOS remapper sites.
|
| USB runtime.json contributes tm_lfo_pmtr. Count / formatter / SETUP beq /
| dest lea / dest store are base-owned — do not poke them.
|
| Coordinated map: 30 PROB .. 38 TSTR, 39 TEMPO (this).
|
| Assembled -mcpu=54455 (ColdFire): no dbra, no movem predec, lsr.l not lsr.w,
| no immediate-to-indexed memory (move.b #imm,(%a0,%d0.l) → moveq + move.b Dn).

        .text
        .global tm_on_store, tm_lfo_store, tm_init
        .global tm_publish, tm_sync, tm_bpm_w, tm_dirty, tm_lfo_pmtr

        .equ    TEMPO_PMTR,     39
        .equ    PROJECT_BPM24,  0x8000181c
        .equ    BPM24_MIN,      720
        .equ    BPM24_MAX,      7200
        .equ    STORE_BACK,     0x4000d080

| ---- defaults: sync shadows from the live project tempo ----------------
tm_init:
        lea     -16(%sp),%sp
        movem.l %d0-%d1/%a0-%a1,(%sp)
        moveq   #7,%d0
1:      bsr.w   tm_sync_one
        subq.l  #1,%d0
        bpl.s   1b
        movem.l (%sp),%d0-%d1/%a0-%a1
        lea     16(%sp),%sp
        rts

| ---- d0=track: copy PROJECT_BPM24 into tm_bpm_w[t] and clear dirty -----
tm_sync_one:
        lea     -16(%sp),%sp
        movem.l %d1-%d2/%a0-%a1,(%sp)
        andi.l  #7,%d0
        move.l  (PROJECT_BPM24).l,%d1
        cmpi.l  #BPM24_MIN,%d1
        bhs.s   1f
        move.l  #BPM24_MIN,%d1
1:      cmpi.l  #BPM24_MAX,%d1
        bls.s   2f
        move.l  #BPM24_MAX,%d1
2:      divu.w  #24,%d1                 | BPM in low word
        andi.l  #0xffff,%d1
        cmpi.l  #30,%d1
        bhs.s   3f
        moveq   #30,%d1
3:      cmpi.l  #300,%d1
        bls.s   4f
        move.l  #300,%d1
4:      subi.l  #30,%d1                 | 0..270
        mulu.w  #127,%d1
        divu.w  #270,%d1
        andi.l  #0xffff,%d1
        lea     tm_bpm_w,%a1
        move.l  %d1,%d2
        lsl.l   #8,%d2
        move.w  %d2,(%a1,%d0.l*2)
        lea     tm_dirty,%a1
        clr.b   (%a1,%d0.l)
        movem.l (%sp),%d1-%d2/%a0-%a1
        lea     16(%sp),%sp
        rts

| ---- sync every non-dirty track from PROJECT_BPM24 ---------------------
tm_sync:
        lea     -8(%sp),%sp
        movem.l %d0/%a0,(%sp)
        moveq   #7,%d0
1:      lea     tm_dirty,%a0
        tst.b   (%a0,%d0.l)
        bne.s   2f
        bsr.w   tm_sync_one
2:      subq.l  #1,%d0
        bpl.s   1b
        movem.l (%sp),%d0/%a0
        lea     8(%sp),%sp
        rts

| ---- d1 = high byte 0..127 -> d1 = BPM24 (720..7200) -------------------
tm_map_bpm24:
        mulu.w  #270,%d1                | 0..34290
        divu.w  #127,%d1
        andi.l  #0xffff,%d1
        addi.l  #30,%d1                 | BPM 30..300
        cmpi.l  #30,%d1
        bhs.s   1f
        moveq   #30,%d1
1:      cmpi.l  #300,%d1
        bls.s   2f
        move.l  #300,%d1
2:      mulu.w  #24,%d1
        cmpi.l  #BPM24_MIN,%d1
        bhs.s   3f
        move.l  #BPM24_MIN,%d1
3:      cmpi.l  #BPM24_MAX,%d1
        bls.s   4f
        move.l  #BPM24_MAX,%d1
4:      rts

| ---- publish dirty shadows into PROJECT_BPM24 (last dirty wins) --------
tm_publish:
        lea     -16(%sp),%sp
        movem.l %d0-%d1/%a0-%a1,(%sp)
        moveq   #7,%d0
1:      lea     tm_dirty,%a1
        tst.b   (%a1,%d0.l)
        beq.s   2f
        lea     tm_bpm_w,%a1
        move.w  (%a1,%d0.l*2),%d1
        lsr.l   #8,%d1
        andi.l  #0xff,%d1
        bsr.w   tm_map_bpm24
        move.l  %d1,(PROJECT_BPM24).l
2:      subq.l  #1,%d0
        bpl.s   1b
        movem.l (%sp),%d0-%d1/%a0-%a1
        lea     16(%sp),%sp
        rts

| Dest lea 0x4000d042 / store 0x4000d07a are base-owned; not package sites.

| ---- contribute after_store (C ABI: word pointer on stack; rts)
| Base already wrote *word. Map high byte onto BPM24 and publish globally.
tm_on_store:
        lea     -16(%sp),%sp
        movem.l %d0-%d1/%a0-%a1,(%sp)
        move.l  20(%sp),%a0             | word (4 frame + 16 saved)
        lea     tm_bpm_w,%a1
        cmpa.l  %a1,%a0
        blo.s   .tm_done
        lea     16(%a1),%a1
        cmpa.l  %a1,%a0
        bhs.s   .tm_done
        lea     tm_bpm_w,%a1
        move.l  %a0,%d0
        sub.l   %a1,%d0
        asr.l   #1,%d0
        andi.l  #7,%d0
        lea     tm_dirty,%a1
        moveq   #1,%d1
        move.b  %d1,(%a1,%d0.l)
        move.w  (%a0),%d1
        lsr.l   #8,%d1
        andi.l  #0xff,%d1
        bsr.w   tm_map_bpm24
        move.l  %d1,(PROJECT_BPM24).l
.tm_done:
        movem.l (%sp),%d0-%d1/%a0-%a1
        lea     16(%sp),%sp
        rts

| ---- legacy site-shaped helper (unused; store site is base-owned)
tm_lfo_store:
        move.w  %d0,(%a1)
        move.l  %a1,-(%sp)
        bsr.w   tm_on_store
        addq.l  #4,%sp
        jmp     (STORE_BACK).l

        .data
        .align 2
tm_lbl_tempo:
        .asciz  "TEMPO"
        .align 2
| struct modwerk_lfo_pmtr_dest { index, flags, label, words, after_store }
tm_lfo_pmtr:
        .word   TEMPO_PMTR
        .word   1                       | MODWERK_LFO_PMTR_AUDIO
        .long   tm_lbl_tempo
        .long   tm_bpm_w
        .long   tm_on_store

        .bss
        .align 2
tm_bpm_w:
        .space  16
tm_dirty:
        .space  8
