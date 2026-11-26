; USB AUDIO IN, DSP side, one inject for every INPUTS: while the host's
; stream is open, write its channels over the inputs of core 0's current RX
; block; while it is closed, leave the block alone and the jacks come
; through.
;
; Placed by the build in payload A's donor region and reached from the frame
; head: P:$88's `move r2,x:>$204` becomes `jsr >inject` (schema.DspHook) and
; is replayed here. Every stock reader of the RX block (x:>$202) runs after
; P:$88 in the frame, the core 0 -> core 1 handoff and the read-back the
; recorder takes included, so one inject serves both cores and the recorder.
;
; The ColdFire's frame transfer (usbaudio_in.s in_build) is two passes, each
; a flag word then, when the flag is 1, 16 samples x 2 channels as hi/lo
; halfword pairs (hi = sample[23:8], lo = sample[7:0]):
;   the CD pass: flag, then C,D -- slots 0-1 (INPUTS CD and ABCD)
;   the AB pass: flag, then A,B -- slots 2-3 (INPUTS AB and ABCD)
; A flag of 0 has no data after it, so the AB pass's flag is the next word.
; Closed or silent: both flag words 0 (in_frame clears words 0-1).
; DSP_DEST $6320 (usbaudio_in.s) lands at r6 + $320 after the DSP's mask:
; the frame's two bank setups (A P:$54, P:$64) set r6 to $4000 or $2000 and
; the host-DMA mask to $5fff or $3fff (P:$75, P:$77), so the transfer is at
; $4320 or $2320 by frame; a literal is right every other frame. The host port ships each 16-bit
; halfword as one X word whose high byte is stale. Each sample is joined with
; one insert: the lo word is loaded whole into a (its bits 7:0 land in a1's
; low byte), then the hi word's low 16 bits go over a1 bits 23:8 (offset 32
; of the 56-bit accumulator, width 16: #$010020), so neither stale byte
; survives and the lo word's bits 23:8 need no mask. a1 is stored (no
; limiting: a2 can be stale).
;
; The RX block is 16 samples x 4 slots; slots 2 and 3 are inputs A and B
; (the firmware's GAIN assignment, hardware 26 Sep 2026), 0 and 1 are C/D.
; Live at P:$88: r2 (stored here), r4-r7, b. Free: a, x1, r0, r1.
;
; brclr's operand is the displacement from the brclr itself, written as a
; number: dsp_asm puts a label's ABSOLUTE address in the extension word,
; which the chip reads as a displacement (stock P:$63e `0cc58c 00001d`
; branches +$1d); docs/contributing/TRAPS.md trap-brclr.
;
; The stores walk r1 with (r1)+ and step to the next sample's pair with
; lua (r1+2): no displaced access in the loop (one-word displaced moves
; cost about twice a plain one, docs/firmware/CHIP.md section 2). One outer
; do #2 runs the CD pass, then the AB pass, over the same inner loop: X:$202
; is read once, and no bsr. Each pass ends with r1 on its own slot pair +2:
; a pass with data leaves the inner loop 64 past its pair, lua (r1-64) takes
; it back, and lua (r1+2) (the outer loop's last word, where a flag of 0
; branches) moves on to the next pass's pair.
;
; Forms with a stock site in payload A: move x:(r0)+,a (P:$b2), lua (r1+$4),r1
; (P:$341), do #<n (P:$9f), move x:(rN)+,x1 (P:$ae), brclr #n,x1 (P:$63e);
; move r6,a / add #>n,a / move a,r0 and the flag tests ran in the shipped
; inject (build 16 on Bryan T's unit). No stock site known, run on Bryan T's
; MKII (21 Oct 2026, usb-io-main-cue-abcd, OCTABAM1): insert #co,x1,a (the
; offset counts from bit 0 of the 56-bit accumulator), move a1,x:(r1)+, lua
; with a negative displacement, a do loop nested in another, and a brclr to
; the outer loop's last address. 29 words (39 before); 16 samples x 2
; channels cost 9 instructions a sample, 15 before. Bit-exact against the
; previous inject in the emulator over every IN value, both banks and all
; nine RX blocks, with random stale bytes; verify_usb_in passes; on the unit
; tools/hw/usb_in_tones.py reads the same as with the 39-word inject.

inject:
        move    r2,x:>$204              ; the displaced instruction
        move    r6,a
        add     #>$320,a
        move    a,r0                    ; the transfer: this frame's bank + $320
        move    x:>$202,r1              ; r1 = the current RX block, slot 0 (C)
        do      #2,>usbi_end            ; the CD pass, then the AB pass
        move    x:(r0)+,x1              ; the pass's flag
        brclr   #0,x1,$10               ; to usbi_next; bit 0: the stale high byte is not read
        do      #16,>usbi_back
        move    x:(r0)+,x1              ; first channel, bits 23:8 (high byte stale)
        move    x:(r0)+,a               ; bits 7:0 into a1's low byte
        insert  #$010020,x1,a           ; x1's 16 bits over a1 bits 23:8
        move    a1,x:(r1)+              ; slot 0 (C) or 2 (A)
        move    x:(r0)+,x1              ; second channel
        move    x:(r0)+,a
        insert  #$010020,x1,a
        move    a1,x:(r1)+              ; slot 1 (D) or 3 (B)
        lua     (r1+2),r1               ; next sample's pair
usbi_back:
        lua     (r1-64),r1              ; back to this pass's slot pair
usbi_next:
        lua     (r1+2),r1               ; the next pass's pair (A after C)
usbi_end:
        rts
