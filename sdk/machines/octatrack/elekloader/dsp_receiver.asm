; SPDX-License-Identifier: GPL-3.0-or-later
; The DSP side of the runtime loader (dsp_loader.py places it on both cores):
; Octabam's receiver (sdk/octabam/platform/dsp-dynload-transport/receiver_runtime.asm),
; answering through the host flags instead of a read-back.
;
; Why: on the owner's MKII (10 October 2026) the first packet stopped core 0
; for good. The old receiver answered with words the ColdFire pulled through
; host command $89. Stock never pulls from core 0: core 0 waits at P:$97 for
; HTDE, its host transmit register emptied by the host, before every frame.
; With no wait states on the host bus the ColdFire's burst outruns the DSP's
; DMA, words stay in HTX, and P:$97 waits forever. ot_emu makes a host read
; wait for the DSP's word, so it never showed. Here the host never reads:
; one HCR write per packet sets HF3 (refused) and toggles HF2 (handled), which
; the host reads in its ISR without taking anything. An upload checks its P
; read-back against the sum the packet carries.
;
; Packet (X:r6+$320, 64 words, each 16 bits): 0 magic $4c44, 1 sequence,
; 2 opcode, 3 core, 4 count or id, 5 offset or init, 6 checksum, 7 proc, or a
; WRITE's expected sum (low 16 bits; its high 8 in word 56), 8-55 the data
; (two words per 24-bit word), 59-63 scratch. Opcodes: 1 PROBE, 3 WRITE, 4 BIND,
; 5 UNBIND, 6 BYPASS (an id onto stock's null stub), 7 BASE (X:$255 entry),
; 8 PEEK (one bit of a P word, answered in HF3), 9 SUM (HF3: the sum of 1-256 table words differs from the
; packet's, word 7 low 16 bits and word 56 high 8: the self-test's check of code where it runs).
; The first refused packet of a boot leaves a record (missoffset, then two words):
;   $01rrrr: its halfwords sum to rrrr, not 0; the sequence that arrived; their
;            position-weighted sum (each halfword times 64 - its index), mod 2^24.
;   $02oooo: a WRITE outside its bounds, or an unknown opcode oooo; count; offset.
;   $03tttt: a WRITE whose read-back sum differs: the table offset of its first wrong
;            word, the word the packet wrote, the word P held. If every word matches,
;            only the sum differed: the chunk's end, and the last word twice.
; The table (dltable, its size filled in by the build) keeps each id's original entries in its
; first 64 words; the rest is the code arena. Both cores' frame hooks run this
; before any effect. Entry changes keep the stock per-instance state.
frame:
        move    r6,x:>$207              ; the instruction the hook displaced
; The dispatch tables (docs/OCTATRACK_MORE_EFFECT_IDS.md step 4): init[@IDS@] at X:@INITTABLE@, then proc[@IDS@], where
; stock's six reads of X:$215 and X:$235 now point (dsp_loader.py). No payload record loads that region, so the first
; frame sets it up before any effect runs: stock's 32 entries copied, every id past them on the null stub.
        move    #>tblready,r1
        move    p:(r1),a
        tst     a
        bne     tblset
        move    #>$215,r0
        move    #>@INITTABLE@,r1
        do      #<32,initcopied
        move    x:(r0)+,x0
        move    x0,x:(r1)+
initcopied:
@INITFILL@        move    #>$235,r0
        do      #<32,proccopied
        move    x:(r0)+,x0
        move    x0,x:(r1)+
proccopied:
@PROCFILL@        ; The packet operations run from the shared window (see the split at coldops below): the payload
        ; record leaves their words at the top of the arena, and they move to this core's window tail before any
        ; packet is read. Both payloads' boot loops zero the window before the first frame, so they cannot be
        ; loaded there; once copied, the arena's top words are the allocator's like the rest.
        move    #>@STAGE@,r0
        move    #>@WINDOW@,r1
        do      #@COLDWORDS@,coldcopied
        move    p:(r0)+,x0
        move    x0,p:(r1)+
coldcopied:
        move    #>nullentry,r1
        move    #>@NULL_INIT@,x0
        move    x0,p:(r1)+
        move    #>@NULL_PROC@,x0
        move    x0,p:(r1)
        move    #>tblready,r1
        move    #>1,x0
        move    x0,p:(r1)
tblset:
; Load meter: core 0's main loop (P:$4b) counts its idle iterations in b until a frame is due, and
; this runs before stock stores that count (P:$92); b stays untouched. Core 1 counts its wait for
; core 0 in X:$2840 (c1wait), taken and cleared here (the build substitutes that for core 1).
; Each window of 1024 frames is published after its serial: the least and most idle
; counts, their sum and the frames with none (missed). Core 1 keeps no such count.
        move    b1,x0
        move    #>idlewin,r0
        move    p:(r0),a
        sub     #>1,a
        move    a1,p:(r0)+              ; frames left
        move    p:(r0),a
        cmp     x0,a
        tgt     x0,a
        move    a1,p:(r0)+              ; least
        move    p:(r0),a
        cmp     x0,a
        tlt     x0,a
        move    a1,p:(r0)+              ; most
        move    p:(r0),a
        add     x0,a
        move    a1,p:(r0)+              ; sum
        move    x0,a
        tst     a
        bne     counted
        move    p:(r0),a
        add     #>1,a
        move    a1,p:(r0)               ; missed
counted:
        move    #>idlewin,r0
        move    p:(r0),a
        tst     a
        bgt     tallied
        move    #>1024,x0
        move    x0,p:(r0)+
        move    #>idlepub,r1
        move    p:(r1),a
        add     #>1,a
        move    a1,p:(r1)+
        move    #>$7fffff,x1            ; the next window's least starts high
        move    #>0,x0
        move    p:(r0),a
        move    a1,p:(r1)+
        move    x1,p:(r0)+
        move    p:(r0),a
        move    a1,p:(r1)+
        move    x0,p:(r0)+
        move    p:(r0),a
        move    a1,p:(r1)+
        move    x0,p:(r0)+
        move    p:(r0),a
        move    a1,p:(r1)+
        move    x0,p:(r0)+
tallied:
        move    r6,a
        add     #>$320,a
        move    a,r0
        move    x:(r0),a
        eor     #>$4c44,a
        and     #>$ffff,a               ; Z from A1 only: a junk top byte cannot hide the magic
        bne     finish
        ; Keep the header's 16 bits only. `and` leaves A2 stale, and cmp, tst and do read all of A:
        ; on the owner's MKII a WRITE whose masked count and offset were in range was refused (AB2).
        move    r0,r1
        do      #<8,cleaned
        move    x:(r1),a
        and     #>$ffff,a
        move    a1,x:(r1)+
cleaned:
        move    r0,r1
        move    #>0,x1
        do      #<$40,checksumdone
        move    x:(r1)+,a
        and     #>$ffff,a
        add     x1,a
        move    a1,x1
checksumdone:
        and     #>$ffff,a
        bne     coldsum
        move    r3,x:(r0+63)
        move    x:(r0+2),a
        and     #>$ffff,a
        cmp     #>1,a
        beq     accepted
        bra     coldops
coldsum:
        move    #>@COLDSUM@,r1          ; a torn packet: its record is kept by the window's half (badsum)
        jmp     (r1)
coldops:
        move    #>@COLDOPS@,r1          ; every other opcode: the window's half
        jmp     (r1)
accepted:
        move    x:(r0+63),r3
        move    #>0,x0                  ; HF3 clear: done
        bra     reply
badsaved:
        move    x:(r0+63),r3
        move    #>$10,x0                ; HF3 set: refused
reply:
        ; One HCR write: HF3 the result, HF2 toggled so the host sees the packet handled.
        movep   x:<<$ffffc2,a1
        and     #>$ffffef,a
        or      x0,a
        eor     #>$8,a
        movep   a1,x:<<$ffffc2
        move    #>0,a
        move    a1,x:(r0)               ; consume the packet
finish:
        rts
;=window=
; From here to the private marker the receiver runs from the window, the top of this core's FX2 block 3, which no buffer
; reaching past offset $3e00 is given (buffers.c, the build's block-3 rule). Code fetched from the window costs a wait
; state a word (twice the cycles of private P, measured on the owner's MKII, 28 October 2026), so only what runs on a
; frame that carries a packet is here. It is assembled on its own: the private half's addresses are absolute numbers.
coldops:
        move    x:(r0+2),a
        and     #>$ffff,a
        cmp     #>3,a
        beq     upload
        cmp     #>4,a
        beq     binding
        cmp     #>5,a
        beq     binding
        cmp     #>6,a
        beq     binding
        cmp     #>7,a
        beq     setbase
        cmp     #>8,a
        beq     peekbit
        cmp     #>9,a
        beq     summed
        bra     refusewrite
summed:
        ; SUM (9): WRITE's read-back over (r0+4) words, 1-256, from table offset (r0+5), nothing written.
        move    x:(r0+4),a
        and     #>$ffff,a
        cmp     #>1,a
        blt     refusewrite
        cmp     #>256,a
        bgt     refusewrite
        move    a1,x1
        move    x:(r0+5),a
        and     #>$ffff,a
        cmp     #>64,a
        blt     refusewrite
        add     x1,a
        cmp     #>@DLWORDS@,a
        bgt     refusewrite
        bra     written
upload:
        move    x:(r0+4),a
        and     #>$ffff,a
        cmp     #>1,a
        blt     refusewrite
        cmp     #>24,a
        bgt     refusewrite
        move    a1,x1
        move    x:(r0+5),a
        and     #>$ffff,a
        cmp     #>64,a
        blt     refusewrite
        add     x1,a
        cmp     #>@DLWORDS@,a
        bgt     refusewrite
        sub     x1,a
        move    a1,x0
        move    #>@TABLE@,a
        add     x0,a
        move    a,r3
        move    r0,a
        add     #>8,a
        move    a,r1
        move    x1,a
        do      a,written
        move    x:(r1)+,a
        and     #>$ffff,a
        asl     #8,a,a
        move    a1,x0
        move    x:(r1)+,a
        and     #>$ff,a
        or      x0,a
        move    a1,x0
        move    x0,p:(r3)
        move    r3,a
        add     #>1,a
        move    a,r3
written:
        ; Read back the entire chunk through P and compare it with the packet's sum.
        move    x:(r0+5),a
        and     #>$ffff,a
        move    a1,x0
        move    #>@TABLE@,a
        add     x0,a
        move    a,r3
        move    #>0,x1
        move    x:(r0+4),a
        and     #>$ffff,a
        do      a,verified
        move    p:(r3),x0
        move    x1,a
        add     x0,a
        move    a1,x1
        move    r3,a
        add     #>1,a
        move    a,r3
verified:
        move    x:(r0+56),a
        and     #>$ff,a
        asl     #16,a,a
        move    a1,x0
        move    x:(r0+7),a
        and     #>$ffff,a
        or      x0,a
        move    a1,x0
        move    x1,a
        cmp     x0,a
        bne     wrongsum
        bra     accepted
wrongsum:
        move    x:(r0+2),a              ; a SUM refuses without WRITE's record
        and     #>$ffff,a
        cmp     #>9,a
        beq     badsaved
mismatch:
        move    x:(r0+5),a
        and     #>$ffff,a
        move    a1,x0
        move    #>@TABLE@,a
        add     x0,a
        move    a,r3                    ; P, from the chunk's first word
        move    r0,a
        add     #>8,a
        move    a,r1                    ; the packet's words
        move    #>0,x0
        move    x0,x:(r0+61)            ; the first wrong word's P address, 0 none yet
        move    x:(r0+4),a
        and     #>$ffff,a
        ; A DO loop without an early exit: dsp_asm cannot branch backwards to a label.
        do      a,scanned
        move    x:(r1)+,a
        and     #>$ffff,a
        asl     #8,a,a
        move    a1,x0
        move    x:(r1)+,a
        and     #>$ff,a
        or      x0,a
        move    a1,x1                   ; the word the packet wrote
        move    p:(r3),x0               ; the word P holds
        move    x1,a
        cmp     x0,a
        beq     nextword
        move    x:(r0+61),a
        tst     a
        bne     nextword
        move    r3,x:(r0+61)
        move    x1,a
        move    a1,x:(r0+59)
        move    x0,x:(r0+60)
nextword:
        move    r3,a
        add     #>1,a
        move    a,r3
scanned:
        move    x:(r0+61),a
        tst     a
        bne     tableoffset
        move    r3,x:(r0+61)            ; every word matches: only the sum differed
        move    x1,a
        move    a1,x:(r0+59)
        move    x0,x:(r0+60)
tableoffset:
        move    #>@TABLE@,a
        move    a1,x0
        move    x:(r0+61),a
        sub     x0,a
        add     #>$30000,a
        move    a1,x:(r0+61)
        bra     keeprecord
refusewrite:
        move    x:(r0+2),a
        and     #>$ffff,a
        add     #>$20000,a
        move    a1,x:(r0+61)
        move    x:(r0+4),a
        and     #>$ffff,a
        move    a1,x:(r0+59)
        move    x:(r0+5),a
        and     #>$ffff,a
        move    a1,x:(r0+60)
        bra     keeprecord
; The checksum failed (a torn or corrupted packet): what arrived, to compare with what was sent.
badsum:
        move    r3,x:(r0+63)
        add     #>$10000,a              ; a1: the residue (the and above)
        move    a1,x:(r0+61)
        move    x:(r0+1),a
        and     #>$ffff,a
        move    a1,x:(r0+59)
        move    r0,r1
        move    #>0,x1
        move    #>0,x0
        do      #<$40,weighed
        move    x:(r1)+,a
        and     #>$ffff,a
        add     x1,a
        move    a1,x1                   ; the running sum
        move    x0,a
        add     x1,a
        move    a1,x0                   ; the sum of the running sums
weighed:
        move    x0,x:(r0+60)
; The record: (r0+61) first, then (r0+59) and (r0+60). Only the first of a boot is kept.
keeprecord:
        move    #>@MISSOFFSET@,r3
        move    p:(r3),x0
        move    x0,a
        tst     a
        bne     badsaved
        move    x:(r0+61),x0
        move    x0,p:(r3)
        move    x:(r0+59),x0
        move    #>@MISSEXPECTED@,r3
        move    x0,p:(r3)
        move    x:(r0+60),x0
        move    #>@MISSACTUAL@,r3
        move    x0,p:(r3)
        bra     badsaved
binding:
        move    x:(r0+4),a
        and     #>$ffff,a
        cmp     #>@IDMAX@,a
        bgt     badsaved
        move    a1,x1
        asl     a
        move    a1,x0
        move    #>@TABLE@,a
        add     x0,a
        move    a,r3
        ; Only stock's 32 ids have originals to keep: past them the saved pair is the null stub's, so BIND keeps
        ; nothing and UNBIND and BYPASS put the stub back.
        move    x1,a
        cmp     #>31,a
        ble     ownsaved
        move    #>@NULLENTRY@,r3
ownsaved:
        move    x1,a
        add     #>@INITTABLE@,a
        move    a,r1
        move    x:(r0+2),a
        and     #>$ffff,a
        cmp     #>5,a
        beq     restoreentry
        cmp     #>6,a
        beq     stubentry
        ; Check both offsets before touching either dispatch entry.
        move    x:(r0+5),a
        and     #>$ffff,a
        cmp     #>64,a
        blt     badsaved
        cmp     #>@DLWORDS@,a
        bge     badsaved
        move    x:(r0+7),a
        and     #>$ffff,a
        cmp     #>64,a
        blt     badsaved
        cmp     #>@DLWORDS@,a
        bge     badsaved
        move    p:(r3),x0
        move    x0,a
        tst     a
        bne     retained
        move    x:(r1),x0
        move    x0,p:(r3)
        move    r3,a
        add     #>1,a
        move    a,r3
        move    x:(r1+@IDS@),x0
        move    x0,p:(r3)
retained:
        move    x:(r0+5),a
        and     #>$ffff,a
        move    a1,x0
        move    #>@TABLE@,a
        add     x0,a
        move    a1,x:(r1)
        move    x:(r0+7),a
        and     #>$ffff,a
        move    a1,x0
        move    #>@TABLE@,a
        add     x0,a
        move    a1,x:(r1+@IDS@)
        bra     accepted
restoreentry:
        move    p:(r3),x0
        move    x0,a
        tst     a
        beq     accepted
        move    x0,x:(r1)
        move    r3,a
        add     #>1,a
        move    a,r3
        move    p:(r3),x0
        move    x0,x:(r1+@IDS@)
        bra     accepted
stubentry:
        move    p:(r3),x0
        move    x0,a
        tst     a
        bne     stubsaved
        move    x:(r1),x0
        move    x0,p:(r3)
        move    r3,a
        add     #>1,a
        move    a,r3
        move    x:(r1+@IDS@),x0
        move    x0,p:(r3)
stubsaved:
        move    #>@NULL_INIT@,x0
        move    x0,x:(r1)
        move    #>@NULL_PROC@,x0
        move    x0,x:(r1+@IDS@)
        bra     accepted
; BASE (7): the Y buffer table entry X:$255 + (r0+4), 0..7, becomes
; (r0+7) << 16 | (r0+5). Stock reads it only in an effect's init.
setbase:
        move    x:(r0+4),a
        and     #>$ffff,a
        cmp     #>7,a
        bgt     badsaved
        add     #>$255,a
        move    a1,r1
        move    x:(r0+7),a
        and     #>$ff,a
        asl     #16,a,a
        move    a1,x0
        move    x:(r0+5),a
        and     #>$ffff,a
        or      x0,a
        move    a1,x:(r1)
        bra     accepted
; PEEK (8): HF3 answers (P:(r0+5) >> 8 * (r0+4)) & (r0+7), private P only:
; one bit a packet, because the host never reads a DSP word (see above).
peekbit:
        move    x:(r0+5),a
        and     #>$ffff,a
        move    a1,x0
        move    x0,a                    ; a2 clean, whatever the word's top byte held
        cmp     #>$2000,a
        bge     badsaved
        move    a,r3
        move    x:(r0+7),a
        and     #>$ffff,a
        move    a1,x1                   ; the mask
        move    x:(r0+4),a
        and     #>$ffff,a
        bne     highbyte
        move    p:(r3),x0
        move    x0,a
        bra     testbit
highbyte:
        move    p:(r3),x0
        move    x0,a
        lsr     #8,a
testbit:
        move    a1,x0
        move    x1,a
        and     x0,a
        bne     badsaved
        bra     accepted
accepted:
        move    x:(r0+63),r3
        move    #>0,x0                  ; HF3 clear: done
        bra     reply
badsaved:
        move    x:(r0+63),r3
        move    #>$10,x0                ; HF3 set: refused
reply:
        ; One HCR write: HF3 the result, HF2 toggled so the host sees the packet handled.
        movep   x:<<$ffffc2,a1
        and     #>$ffffef,a
        or      x0,a
        eor     #>$8,a
        movep   a1,x:<<$ffffc2
        move    #>0,a
        move    a1,x:(r0)               ; consume the packet
finish:
        rts
;=private=
; Core 1's wait for core 0 (P:$57, brclr #1,y:<<$ffffd3) as a counted one: each pass adds one to
; X:$2840 (core 1's, untouched by stock), which its frame hook takes as its idle count (see frame).
; DO FOREVER and BRKCS, not a branch back: dsp_asm writes a backward brclr's target absolute.
c1wait:
        do      forever,c1over
        move    x:>$2840,a
        add     #>1,a
        move    a1,x:>$2840
        btst    #1,y:<<$ffffd3
        brkcs
c1over:
        rts
tablebase:
        move    #>dltable,a
        rts
missoffset:                             ; never executed: the first wrong word (see above)
        nop
missexpected:
        nop
missactual:
        nop
idlewin:                                  ; never executed: the load meter (see frame): frames left,
        nop                             ; least, most, sum and missed of this window
        nop
        nop
        nop
        nop
idlepub:                            ; then the published window: serial, least, most, sum, missed
        nop
        nop
        nop
        nop
        nop
nullentry:                              ; the saved pair of every id past 31: the null stub's init and proc
        nop
        nop
tblready:                               ; 1 once the first frame set the dispatch tables up
        nop
dltable:
