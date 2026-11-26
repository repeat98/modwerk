| SPDX-License-Identifier: MIT
| SPDX-FileCopyrightText: 2026 jonathanwardle1992-beep
|
| SEQ POS -- production LFO PMTR destination SPOS (index 37).
|
| USB runtime.json contributes sp_lfo_pmtr to ot_lfo_pmtr_dest and
| hooks module_key / module_enc for FUNC+TRACK panel toasts (MOP-195).
| (No init site-event — MOP-202 uses .data sp_len defaults instead.)
| Count / formatter / SETUP beq / dest lea are base-owned after
| #21/#23/#25 — do not poke them. Base mw_lfo_pmtr_dest resolves
| contributed words.
|
| MOP-73: after_store arms address mode; Detour sp_audio_step at
| 0x400a2d6a remaps the tick's step (conflicts with playmodes).
| MOP-195: sp_level / sp_off toast builders (from archive unit.full.s)
| plus sp_module_key / sp_module_enc (trig-prob track+LEVEL pattern,
| USB core hooks — no private Detour).
| MOP-202: sp_len lives in .data with default 16 (trig-prob pattern).
| USB has no site-event for sp_dest_audio_init; BSS zeros left len=0
| so sp_map .follow'd stock (mop201). Explicit sp_dest_audio_init
| still resets lens to 16; arm paths ensure len when zero.
| Assembled -mcpu=54455 (ColdFire): no dbra, no movem predec, lsr.l not lsr.w.

        .text
        .global sp_dest_audio_init, sp_audio_step, sp_on_store, sp_map
        .global sp_level, sp_off, sp_module_key, sp_module_enc
        .global sp_pos_w, sp_dest_sink, sp_en, sp_len, sp_lfo_pmtr
        .global sp_toast, sp_held_track, sp_func_held

        .equ    PLAYHEAD,    0x800064d0
        .equ    SPOS_PMTR,   37
        .equ    MAX_LEN,     64
        .equ    NOTIFY,      0x4005a2b8
        .equ    KEY_FUNC,    0x2d
        .equ    KEY_NO,      0x32
        .equ    KEY_T1,      0x10
        .equ    ENC_LEVEL,   6

sp_dest_audio_init:
        lea     sp_pos_w,%a0
        lea     sp_en,%a1
        lea     sp_len,%a2
        moveq   #7,%d0
1:      clr.w   (%a0)+
        clr.b   (%a1)+
        move.b  #16,(%a2)+
        subq.l  #1,%d0
        bpl.s   1b
        clr.w   sp_dest_sink
        rts

| ---- d0=track, d1=raw step -> d0 = step to play ------------------------
sp_map:
        lea     -16(%sp),%sp
        movem.l %d1-%d3/%a0,(%sp)
        move.l  %d1,%d3
        andi.l  #7,%d0
        lea     sp_en,%a0
        tst.b   (%a0,%d0.l)
        beq.s   .follow
        lea     sp_len,%a0
        move.b  (%a0,%d0.l),%d2
        andi.l  #0xff,%d2
        beq.s   .follow
        cmpi.l  #MAX_LEN,%d2
        bls.s   1f
        moveq   #MAX_LEN,%d2
1:      lea     PLAYHEAD,%a0
        move.b  (%a0,%d0.l),%d1
        andi.l  #0xff,%d1
        addq.l  #1,%d1
        cmp.l   %d2,%d1
        bls.s   2f
        cmpi.l  #MAX_LEN,%d1
        bhi.s   2f
        move.l  %d1,%d2
        lea     sp_len,%a0
        move.b  %d2,(%a0,%d0.l)
2:      lea     sp_pos_w,%a0
        move.w  (%a0,%d0.l*2),%d1
        lsr.l   #8,%d1
        andi.l  #0x7f,%d1
        mulu.w  %d2,%d1
        lsr.l   #7,%d1
        cmp.l   %d2,%d1
        blo.s   3f
        move.l  %d2,%d1
        subq.l  #1,%d1
3:      move.l  %d1,%d0
        movem.l (%sp),%d1-%d3/%a0
        lea     16(%sp),%sp
        rts
.follow:
        move.l  %d3,%d0
        movem.l (%sp),%d1-%d3/%a0
        lea     16(%sp),%sp
        rts

| ---- tick audio pass: remap the step argument --------------------------
| Detour 0x400a2d6a length 6 (playmodes pm_audio_step class). Track in d5.
| Rejoin 0x400a2d74 past stock mvzb. Card / pre-event path.
sp_audio_step:
        lea     PLAYHEAD,%a0
        mvz.b   %a0@(0,%d5:l),%d0
        move.l  %d0,%d1
        move.l  %d5,%d0
        bsr.w   sp_map
        jmp     (0x400a2d74).l

        .ifdef  MODWERK_EVENTS
| ev_audio_step order 50: int f(unsigned *step, unsigned track).
| When sp_en[t], address-remap via sp_map; else leave *step. Return 0 to chain.
        .global sp_ev_audio_step
sp_ev_audio_step:
        movea.l 4(%sp),%a0
        move.l  (%a0),%d1
        move.l  8(%sp),%d0
        bsr.w   sp_map
        movea.l 4(%sp),%a0
        move.l  %d0,(%a0)
        moveq   #0,%d0
        rts
        .endif

| ---- contribute after_store: arm address mode for that track ----------
| C ABI: word pointer on stack; rts. Do not claim 0x4000d07a.
| MOP-202: if sp_len[t] is still 0, set default 16 (USB BSS / edge).
sp_on_store:
        lea     -16(%sp),%sp
        movem.l %d0-%d1/%a0-%a1,(%sp)
        move.l  20(%sp),%a1
        lea     sp_pos_w,%a0
        cmpa.l  %a0,%a1
        blo.s   .sp_done
        lea     16(%a0),%a0
        cmpa.l  %a0,%a1
        bhs.s   .sp_done
        lea     sp_pos_w,%a0
        move.l  %a1,%d0
        sub.l   %a0,%d0
        asr.l   #1,%d0
        andi.l  #7,%d0
        lea     sp_en,%a0
        moveq   #1,%d1
        move.b  %d1,(%a0,%d0.l)
        lea     sp_len,%a0
        tst.b   (%a0,%d0.l)
        bne.s   .sp_done
        moveq   #16,%d1
        move.b  %d1,(%a0,%d0.l)
.sp_done:
        movem.l (%sp),%d0-%d1/%a0-%a1
        lea     16(%sp),%sp
        rts

| ---- FUNC+TRACK+LEVEL: set SPOS and enable (toast Tn SPOS nn) ----------
| d0 = track 0..7, d1 = signed encoder delta. Ported from unit.full.s.
| MOP-202: ensure sp_len[t] default 16 when enabling with len still 0.
sp_level:
        lea     -20(%sp),%sp
        movem.l %d2-%d4/%a0-%a1,(%sp)
        andi.l  #7,%d0
        move.l  %d0,%d4
        lea     sp_en,%a0
        moveq   #1,%d3
        move.b  %d3,(%a0,%d0.l)
        lea     sp_len,%a0
        tst.b   (%a0,%d0.l)
        bne.s   .sp_len_ok
        moveq   #16,%d3
        move.b  %d3,(%a0,%d0.l)
.sp_len_ok:
        lea     sp_pos_w,%a1
        move.w  (%a1,%d0.l*2),%d2
        lsr.l   #8,%d2
        andi.l  #0x7f,%d2
        add.l   %d1,%d2
        bpl.s   1f
        moveq   #0,%d2
1:      cmpi.l  #127,%d2
        bls.s   2f
        moveq   #127,%d2
2:      move.l  %d2,%d3
        lsl.l   #8,%d3
        move.w  %d3,(%a1,%d0.l*2)
        lea     sp_toast,%a0
        move.b  #'T',(%a0)+
        move.b  %d4,%d1
        addi.l  #'1',%d1
        move.b  %d1,(%a0)+
        move.b  #' ',(%a0)+
        move.b  #'S',(%a0)+
        move.b  #'P',(%a0)+
        move.b  #'O',(%a0)+
        move.b  #'S',(%a0)+
        move.b  #' ',(%a0)+
        move.l  %d2,%d3
        cmpi.l  #100,%d3
        blo.s   .tens
        move.b  #'1',(%a0)+
        subi.l  #100,%d3
.tens:  moveq   #0,%d2
        move.w  %d3,%d2
        divu.w  #10,%d2
        move.w  %d2,%d1
        addi.l  #'0',%d1
        move.b  %d1,(%a0)+
        clr.w   %d2
        swap    %d2
        move.w  %d2,%d1
        addi.l  #'0',%d1
        move.b  %d1,(%a0)+
        clr.b   (%a0)
        pea     40
        pea     sp_toast
        jsr     (NOTIFY).l
        addq.l  #8,%sp
        movem.l (%sp),%d2-%d4/%a0-%a1
        lea     20(%sp),%sp
        rts

| ---- FUNC+TRACK+NO: disable address mode (toast Tn SPOS OFF) ----------
| d0 = track 0..7. Ported from unit.full.s.
sp_off:
        lea     -8(%sp),%sp
        movem.l %d1/%a0,(%sp)
        andi.l  #7,%d0
        lea     sp_en,%a0
        clr.b   (%a0,%d0.l)
        lea     sp_toast,%a0
        move.b  #'T',(%a0)+
        move.b  %d0,%d1
        addi.l  #'1',%d1
        move.b  %d1,(%a0)+
        move.b  #' ',(%a0)+
        move.b  #'S',(%a0)+
        move.b  #'P',(%a0)+
        move.b  #'O',(%a0)+
        move.b  #'S',(%a0)+
        move.b  #' ',(%a0)+
        move.b  #'O',(%a0)+
        move.b  #'F',(%a0)+
        move.b  #'F',(%a0)+
        clr.b   (%a0)
        pea     40
        pea     sp_toast
        jsr     (NOTIFY).l
        addq.l  #8,%sp
        movem.l (%sp),%d1/%a0
        lea     8(%sp),%sp
        rts

| ---- USB module_key: track FUNC + TRACK hold; take FUNC+TRACK+NO ------
| C ABI: int sp_module_key(int code, int pressed); nonzero takes the key.
| Sibling pattern: trig-prob tp_track_key + panel NO (no private Detour).
sp_module_key:
        lea     -16(%sp),%sp
        movem.l %d1-%d2/%a0,(%sp)
        move.l  20(%sp),%d1             | code
        move.l  24(%sp),%d2             | pressed
        moveq   #0,%d0                  | default: do not take
        cmpi.l  #KEY_FUNC,%d1
        bne.s   .mk_trk
        move.l  %d2,sp_func_held
        bra.s   .mk_done
.mk_trk: move.l  %d1,%d0
        subi.l  #KEY_T1,%d0             | 0..7 for T1..T8
        bmi.s   .mk_no
        cmpi.l  #7,%d0
        bhi.s   .mk_no
        addq.l  #1,%d0                  | hold as track+1
        tst.l   %d2
        beq.s   .mk_rel
        move.l  %d0,sp_held_track
        moveq   #0,%d0
        bra.s   .mk_done
.mk_rel: cmp.l   sp_held_track,%d0
        bne.s   .mk_rel0
        clr.l   sp_held_track
.mk_rel0:
        moveq   #0,%d0
        bra.s   .mk_done
.mk_no:  cmpi.l  #KEY_NO,%d1
        bne.s   .mk_pass
        tst.l   %d2
        beq.s   .mk_pass
        tst.l   sp_func_held
        beq.s   .mk_pass
        move.l  sp_held_track,%d0
        beq.s   .mk_pass
        subq.l  #1,%d0                  | track 0..7
        bsr.w   sp_off
        moveq   #1,%d0                  | take NO
        bra.s   .mk_done
.mk_pass:
        moveq   #0,%d0
.mk_done:
        movem.l (%sp),%d1-%d2/%a0
        lea     16(%sp),%sp
        rts

| ---- USB module_enc: take LEVEL while FUNC+TRACK held -----------------
| C ABI: int sp_module_enc(int encoder, int delta); nonzero takes the turn.
sp_module_enc:
        lea     -16(%sp),%sp
        movem.l %d1-%d2/%a0,(%sp)
        move.l  20(%sp),%d1             | encoder
        move.l  24(%sp),%d2             | delta
        moveq   #0,%d0
        cmpi.l  #ENC_LEVEL,%d1
        bne.s   .me_done
        tst.l   sp_func_held
        beq.s   .me_done
        move.l  sp_held_track,%d0
        beq.s   .me_done0
        tst.l   %d2
        beq.s   .me_done0
        subq.l  #1,%d0                  | track 0..7
        move.l  %d2,%d1                 | delta
        bsr.w   sp_level
        moveq   #1,%d0                  | take LEVEL
        bra.s   .me_done
.me_done0:
        moveq   #0,%d0
.me_done:
        movem.l (%sp),%d1-%d2/%a0
        lea     16(%sp),%sp
        rts

        .data
        .align 2
sp_lbl_spos:
        .asciz  "SPOS"
        .align 2
sp_lfo_pmtr:
        .word   SPOS_PMTR
        .word   1
        .long   sp_lbl_spos
        .long   sp_pos_w
        .long   sp_on_store
| MOP-202: default length 16 in .data so USB image load is honest init
| (no site-event for sp_dest_audio_init; BSS would stay 0 → mop201).
sp_len:
        .byte   16, 16, 16, 16, 16, 16, 16, 16

        .bss
        .align 2
sp_pos_w:
        .space  16
sp_dest_sink:
        .space  2
sp_en:
        .space  8
        .align 2
sp_toast:
        .space  16
sp_held_track:
        .space  4
sp_func_held:
        .space  4
