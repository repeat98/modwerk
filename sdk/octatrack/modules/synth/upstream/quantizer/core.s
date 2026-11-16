| SCALE QUANTIZER -- the ROM core (Octatrick 2.9, 28 Sep 2026). GNU as, -mcpu=5475.
|
| The part of the quantizer that stays in the OS image: what the boot path
| may reach and what the pinned trampoline scale.s must resolve at link
| time. Everything else -- the knob, lock, key, legato and recording glue,
| the SEQUENCER rows, the project-file lines, the names -- is quantizer.s,
| a DRAM unit of octabam's platform runtime since 2.9 (depacked by the
| loader at the boot redirect 0x4000050c, before main 0x40000db0 runs).
|
| Three battery-RAM bytes (CS1, 0x10000000..; the padding 0x100b14e2..ef
| between the settings block's last long 0x100b14de..e1 and the 16-byte-
| aligned project record 0x100b14f0 -- no absolute reference to any of
| 0x100b14e2..ef in the OS, outside the two blocks the boot memcpy's:
| 0x100b1480 + 0x4c and 0x100b14cc + 0x16):
|   NV_SCALE  0x100b14ec  0 = OFF, 1..24 = index into qz_masks
|   NV_GLIDE  0x100b14ed  0 = OFF, 1..127 (modules/synth reads it as GLIDE_AT)
|   NV_ROOT   0x100b14ee  0..11 = C .. B, the root the scale is built on (2.9)
|
|   qz_boot       jsr detour at 0x40010212, inside stock's boot sanitiser of
|                 the block (0x4000fec8, from 0x40025770: a warm boot with a
|                 project): out of range -> OFF / C, as stock does for its
|                 own bytes; ends with the displaced tst.b so the caller's
|                 bge sees its flags.
|   qz_defaults   jsr detour at 0x40025ac2, inside the project defaults
|                 (0x40025848: a cold boot, a boot with no project, the
|                 loader before its storing pass, a new project): OFF / C.
|   qz_scale_mask d0 := the scale's pitch-class mask TRANSPOSED BY ROOT (bit
|                 k = pitch class k, C = 0, is in the scale), 0 = OFF.
|                 Reached by the synth's DRAM engine through the pinned
|                 trampoline scale.s at SCALE_AT (poly.s po_snap snaps chord
|                 notes onto it by pitch class), and by quantizer.s for every
|                 snap it does -- one mask, so the knob, the locks, the keys
|                 and the chords agree. Clobbers a0 and d0; preserves d1.
| Both boot detours run AFTER the loader (measured under the port, README):
| the core is in ROM for the two link-time reasons above and so that the
| settings are sane whether or not a runtime was depacked.
        .text
        .global qz_boot, qz_defaults, qz_scale_mask
        .set    NV_SCALE, 0x100b14ec
        .set    NV_GLIDE, 0x100b14ed
        .set    NV_ROOT,  0x100b14ee

qz_boot:
        mvz.b   NV_SCALE,%d0
        cmpi.l  #24,%d0
        jbls    qz_b_glide
        clr.b   NV_SCALE
qz_b_glide:
        mvz.b   NV_GLIDE,%d0
        cmpi.l  #127,%d0
        jbls    qz_b_root
        clr.b   NV_GLIDE
qz_b_root:
        mvz.b   NV_ROOT,%d0
        cmpi.l  #11,%d0
        jbls    qz_b_back
        clr.b   NV_ROOT
qz_b_back:
        tst.b   0x100b14ae              | displaced
        rts

qz_defaults:
        clr.b   NV_SCALE
        clr.b   NV_GLIDE
        clr.b   NV_ROOT
        clr.l   0x100b14d4              | displaced
        rts

| qz_scale_mask: d0 := rotl12(qz_masks[SCALE], ROOT), 0 = OFF. The table's
| masks are on C (bit k = semitone k above the root); rotating left by ROOT
| within 12 bits puts the root on its pitch class, so a caller that tests
| bit (pitch class of a note) needs nothing else.
qz_scale_mask:
        mvz.b   NV_SCALE,%d0
        jbeq    qz_sm_ret
        lea     qz_masks(%pc),%a0
        add.l   %d0,%d0
        mvz.w   -2(%a0,%d0.l),%d0
        move.l  %d1,-(%sp)
        mvz.b   NV_ROOT,%d1
        jbeq    qz_sm_pop
        lsl.l   %d1,%d0                 | << root: bits 0..22
        move.l  %d0,%d1
        lsr.l   #8,%d1
        lsr.l   #4,%d1                  | the bits that left the 12-bit field ...
        or.l    %d1,%d0                 | ... come back at the bottom
        andi.l  #0xfff,%d0
qz_sm_pop:
        move.l  (%sp)+,%d1
qz_sm_ret:
        rts

        .balign 2
qz_masks:                               | scale 1..24 -> pitch-class mask on C, bit k = semitone k above the root
        .word   0x0ab5                    |  1 MAJOR    {0,2,4,5,7,9,11}
        .word   0x06ad                    |  2 DORIAN   {0,2,3,5,7,9,10}
        .word   0x05ab                    |  3 PHRYGIAN {0,1,3,5,7,8,10}
        .word   0x0ad5                    |  4 LYDIAN   {0,2,4,6,7,9,11}
        .word   0x06b5                    |  5 MIXOLYD  {0,2,4,5,7,9,10}
        .word   0x05ad                    |  6 MINOR    {0,2,3,5,7,8,10}
        .word   0x056b                    |  7 LOCRIAN  {0,1,3,5,6,8,10}
        .word   0x04a9                    |  8 PENT.MIN {0,3,5,7,10}
        .word   0x0295                    |  9 PENT.MAJ {0,2,4,7,9}
        .word   0x0aad                    | 10 MEL.MIN  {0,2,3,5,7,9,11}
        .word   0x09ad                    | 11 HARM.MIN {0,2,3,5,7,8,11}
        .word   0x0555                    | 12 WHOLE    {0,2,4,6,8,10}
        .word   0x04e9                    | 13 BLUES    {0,3,5,6,7,10}
        .word   0x05b3                    | 14 PHRYGDOM {0,1,4,5,7,8,10}
        .word   0x0b6d                    | 15 WH.DIM   {0,2,3,5,6,8,9,11}
        .word   0x06db                    | 16 HW.DIM   {0,1,3,4,6,7,9,10}
        .word   0x09cd                    | 17 HUNG.MIN {0,2,3,6,7,8,11}
        .word   0x018d                    | 18 HIRAJOSH {0,2,3,7,8}
        .word   0x04a3                    | 19 IN-SEN   {0,1,5,7,10}
        .word   0x0463                    | 20 IWATO    {0,1,5,6,10}
        .word   0x018b                    | 21 PELOG    {0,1,3,7,8}
        .word   0x09b3                    | 22 DBL.HARM {0,1,4,5,7,8,11}
        .word   0x055b                    | 23 SUPERLOC {0,1,3,4,6,8,10}
        .word   0x06d5                    | 24 LYD.DOM  {0,2,4,6,7,9,10}
        .balign 4
qz_core_end:
