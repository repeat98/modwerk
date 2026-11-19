| SPDX-License-Identifier: MIT
| The shared scale: the 52-ID scale catalogue and one pure snap, for the base and for card builds
| (include/modwerk_scale.h; README "Shared scale"). GNU as, ColdFire ISA_A (assembles with -mcpu=5475
| and -mcpu=54455). No state, no stock address and no absolute reference: the code reads its table
| PC-relative (.rodata, which the linker places beside .text, within 32 KB of the lea), so the same file
| links unchanged into the base, a runtime package or a card build's Linked unit. A source CavePatch keeps
| only .text and would drop the table, so card builds must link it as a Linked unit.
|
| The snap is Scale Quantizer's (sdk/octabam/modules/quantizer/upstream/quantizer: core.s qz_scale_mask
| rotates the mask by ROOT, quantizer.s qz_msnap finds the nearest degree, the lower one first at each
| distance), Copyright (c) 2026 Tim Hastie, MIT. The mask table is octabam's catalogue (modules/scales
| scales.s sc_masks, Copyright (c) 2026 Sam Banks, MIT), vendored unchanged at vendor/octabam-scales/
| with its LICENSE beside it (sdk/imports/octabam-scales-755a02ac.json); sdk/tests/test_shared_scale.py
| checks that the two tables agree word for word.
|
|   modwerk_scale_snap(note, id, root) -> d0
|       C call: three longs on the stack, the note first; d0-d1/a0-a1 scratch, every other register
|       kept. d0 := the MIDI note nearest to note whose degree above root is in scale id, ties to the
|       lower note, within 0..127. note itself when id is not 1..52, root is not 0..11 or note is not
|       0..127. An assembly caller: move.l root,-(%sp); move.l id,-(%sp); move.l note,-(%sp);
|       jsr modwerk_scale_snap; lea 12(%sp),%sp.
|   modwerk_scale_masks[id - 1]
|       52 words: bit d set = d semitones above the tonic are in the scale (bit 0, the tonic, always).
|       An ID never changes meaning; a new scale takes the next ID (octabam's rule).
|   modwerk_scale_from_quantizer[n]
|       25 bytes: Scale Quantizer's saved SCALE n (0 OFF, 1..24) -> the catalogue ID with the same mask
|       (0 OFF). IDs 1..7 are the same; 8..24 differ. A project saved with Scale Quantizer keeps its
|       scale when the base or a card build reads it through this table.
        .text
        .global modwerk_scale_snap, modwerk_scale_masks, modwerk_scale_from_quantizer
        .set    MODWERK_SCALE_COUNT, 52

modwerk_scale_snap:
        lea     -12(%sp),%sp
        movem.l %d2-%d4,(%sp)
        move.l  16(%sp),%d2             | the note
        move.l  20(%sp),%d0             | the ID
        move.l  24(%sp),%d1             | the root
        cmpi.l  #127,%d2
        jbhi    ms_keep                 | (unsigned: a negative note too)
        cmpi.l  #11,%d1
        jbhi    ms_keep
        subq.l  #1,%d0
        cmpi.l  #MODWERK_SCALE_COUNT-1,%d0
        jbhi    ms_keep                 | ID 0 wraps past the count
        lea     modwerk_scale_masks(%pc),%a0
        add.l   %d0,%d0
        moveq   #0,%d3
        move.w  (%a0,%d0.l),%d3         | the mask on the tonic
        tst.l   %d1                     | qz_scale_mask: rotated left by the root within 12 bits
        jbeq    ms_rotated
        lsl.l   %d1,%d3                 | << root: bits 0..22
        move.l  %d3,%d0
        lsr.l   #8,%d0
        lsr.l   #4,%d0                  | the bits that left the 12-bit field ...
        or.l    %d0,%d3                 | ... come back at the bottom
        andi.l  #0xfff,%d3
ms_rotated:                             | qz_msnap from here: d2 = the note, d3 = the mask by pitch class
        move.l  %d2,%d1
        moveq   #12,%d4
        divu.l  %d4,%d1
        mulu.l  %d4,%d1
        move.l  %d2,%d0
        sub.l   %d1,%d0
        move.l  %d0,%a1                 | a1 = the note's pitch class
        moveq   #0,%d4                  | distance 0, 1, 2 ...
ms_loop:
        move.l  %d2,%d1
        sub.l   %d4,%d1                 | the lower candidate first
        jbmi    ms_hi                   | (below note 0: none)
        move.l  %a1,%d0
        sub.l   %d4,%d0
        jbpl    ms_lo
        addi.l  #12,%d0
ms_lo:
        btst    %d0,%d3
        jbne    ms_found
ms_hi:
        move.l  %d2,%d1
        add.l   %d4,%d1                 | then the upper
        cmpi.l  #127,%d1
        jbgt    ms_next                 | (above note 127: none)
        move.l  %a1,%d0
        add.l   %d4,%d0
        cmpi.l  #12,%d0
        jblt    ms_up
        subi.l  #12,%d0
ms_up:
        btst    %d0,%d3
        jbne    ms_found
ms_next:
        addq.l  #1,%d4
        cmpi.l  #11,%d4
        jble    ms_loop
ms_keep:
        move.l  %d2,%d1                 | no degree at all (cannot happen: every mask has its tonic)
ms_found:
        move.l  %d1,%d0
        movem.l (%sp),%d2-%d4
        lea     12(%sp),%sp
        rts

        .pushsection .rodata
        .balign 2
modwerk_scale_masks:                    | octabam modules/scales sc_masks, by ID from 1
        .word   0xab5,0x6ad,0x5ab,0xad5,0x6b5,0x5ad,0x56b       | MAJOR
        .word   0xaad,0x6ab,0xb55,0x6d5,0x5b5,0x56d,0x55b       | MELODIC MINOR
        .word   0x9ad,0x66b,0xb35,0x6cd,0x5b3,0xad9,0x35b       | HARMONIC MINOR
        .word   0x9b5,0x66d,0x59b,0xacd,0x6b3,0xb59,0x36b       | HARMONIC MAJOR
        .word   0x9b3,0xcd9,0x39b,0x9cd,0x673,0xb39,0x367       | DOUBLE HARMONIC
        .word   0x295,0x4a5,0x529,0x2a5,0x4a9                   | PENTATONIC
        .word   0x4e9,0x29d                                     | BLUES
        .word   0x18d,0x4a3,0x463,0x28d,0x18b                   | JAPANESE
        .word   0x555,0xb6d,0x6db,0x999,0xfff                   | SYMMETRIC
modwerk_scale_masks_end:
        .ifne   modwerk_scale_masks_end - modwerk_scale_masks - 2 * MODWERK_SCALE_COUNT
        .error  "modwerk_scale_masks holds one word per ID"
        .endif

modwerk_scale_from_quantizer:           | Scale Quantizer's SCALE 0..24 -> the catalogue ID
        .byte   0                                               |  0 OFF
        .byte   1,2,3,4,5,6,7                                   |  1..7 MAJOR .. LOCRIAN: the same IDs
        .byte   40,36,8,15,48,41,19                             |  8 PENT.MIN .. 14 PHRYGDOM
        .byte   49,50,32,43,44,45,47                            | 15 WH.DIM .. 21 PELOG
        .byte   29,14,11                                        | 22 DBL.HARM, 23 SUPERLOC, 24 LYD.DOM
modwerk_scale_from_quantizer_end:
        .ifne   modwerk_scale_from_quantizer_end - modwerk_scale_from_quantizer - 25
        .error  "modwerk_scale_from_quantizer holds OFF and Scale Quantizer's 24 scales"
        .endif
        .balign 2
        .popsection
