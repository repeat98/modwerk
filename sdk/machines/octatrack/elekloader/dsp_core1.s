| SPDX-License-Identifier: GPL-3.0-or-later
| The DSP loader's packet to core 1 (build_core.py --dsp-loader): sent right after stock's own push
| to core 1 (frame-transfer state 2, X:$6080), the way and the time stock writes core 1, never at
| state 7. On the owner's MKII a packet to core 1 at state 7 completed and core 1's frames stopped,
| in either bank (10 October 2026); stock's states run early in the frame, state 7 near its end.
| This hooks state 3's entry: its own transfer's completion re-enters state 3, then stock's runs.
| Core 1's host flags are read here too, while state 2 has it selected: selecting core 1 at
| state 7, even only to read them, stopped the frames on the owner's MKII (AB2, 10 October 2026).
        .text
        .global dl_state3, dl_c1_phase, dl_c1_sent, dl_c1_isr
        .equ UNCACHED,0x08000000
        .equ DONE,0x40004bc8            | the eDMA interrupt's exit: restores d0-d1/a0-a1, rte
        .equ STATE3,0x400049d2          | stock's state 3 after the instruction this hook replaced

dl_state3:
        move.w 0x20000008,%d0           | core 1's host ISR (dsp.c modwerk_dsp_flags)
        move.w %d0,dl_c1_isr
        tst.l dl_c1_phase
        bne 2f                          | our packet's completion
        lea dl_tx+128,%a0               | core 1's packet, dl_tx[1]
        adda.l #UNCACHED,%a0
        tst.w (%a0)
        beq 3f                          | nothing waiting
        move.w 0xfc04501e,%d0           | TCD0 CSR: idle is DONE (bit 7), not ACTIVE (6), no START (0)
        andi.l #0xc1,%d0
        cmpi.l #0x80,%d0
        bne 3f                          | still busy: not sent now (next frame, or the job times out)
        moveq #1,%d0
        move.b %d0,0xfc0a400c           | core 1, as state 2 left it
        move.l %a0,0xfc045000           | as hooks.s dl_write: 64 halfwords to X:$6320, host command $88
        moveq #64,%d0
        move.l %d0,0xfc045008
        move.w #0x81,%d0
        move.w %d0,0x20000000
        move.w #0x6320,%d0
        move.w %d0,0x2000001c
        move.w #63,%d0
        move.w %d0,0x2000001c
        move.w #0x88,%d0
        move.w %d0,0x20000004
        move.w #0x8002,%d0
        move.w %d0,0xfc045014
        move.w %d0,0xfc04501c
        moveq #1,%d0
        move.l %d0,dl_c1_phase
        addq.l #1,dl_c1_sent
        clr.b 0xfc04401e                | start channel 0; state 3 stays the state
        jmp DONE
2:      clr.l dl_c1_phase
        lea dl_tx+128,%a0               | sent once: a lost packet times out, a late answer never counts twice
        adda.l #UNCACHED,%a0
        clr.w (%a0)
3:      clr.b %d0                       | the instructions the hook replaced
        move.b %d0,0xfc0a400c
        jmp STATE3

        .data
        .balign 4
dl_c1_phase: .long 0                    | 1 while our transfer runs
dl_c1_sent: .long 0                     | packets sent to core 1
dl_c1_isr: .short 0                     | core 1's host ISR at the last state 3
