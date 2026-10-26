| DEJA VU -- the waveform handlers: the LFO engine's ABI -> dv_call (dejavu.c).
|
| Called by the inline LFO engine (0x4000d022, jsr through the table at
| 0x400d6210) every frame, in every TRIG mode, with:
|   a0 = the LFO's state record, 0x800010e8 + 28*i, i = 3*track + lfo
|   fp = the TRIG-mode record the engine chose, 0x80006184 + 16*n; n = the
|        TRIG mode, + 8 exactly on a trig of the track (spike D0, 24 Oct)
|   a2 = the track's page record (post scene morph): SPD i at +0xc+2*lfo
|        (knob in the high byte), DEP i at +0x12+2*lfo, MULT at +0x24+lfo,
|        TRIG at +0x27+lfo
|   d2 = lfo (0..2)
| Writes the output to 4(a0). Keeps every register but d0-d1/a0-a1.
| The track's sequencer, read-only (1.40C; the base and Play Modes read the
| same bytes): step counter 0x800064d0 + t, tick 0x800064f0 + t, run flag
| 0x80006500 + t. C runs only when they change, on a trig, on a wave
| switch, or (DJQ) when DEP changes; DJC's glide steps here.
        .text
        .global dv_wave, dq_wave, dc_wave
        .global dv_label, dq_label, dc_label
        .global dv_icon, dq_icon, dc_icon
        .global dv_labels, dv_labels_8, dv_labels_16
        .global dv_icons, dv_icons_8, dv_icons_16

| dv_lfo offsets (dejavu.c): rend +8, seen +84, delta +92, left +96,
| frames +100, dq +104, magic +112; 116 bytes.
        .macro  DVWAVE name, wave
\name:
        move.l  %a0,%d0
        subi.l  #0x800010e8,%d0         | 28*i
        mulu.w  #2341,%d0               | i = 28i*2341 >> 16 (exact for i < 4000)
        clr.w   %d0
        swap    %d0                     | d0 = i
        moveq   #24,%d1
        cmp.l   %d1,%d0
        bcc.s   .Lnone\@                | not one of the 24 audio LFOs (never expected)
        move.l  %d0,%d1
        mulu.w  #0x5556,%d1
        clr.w   %d1
        swap    %d1                     | track = i/3 (exact for i < 24)
        addi.l  #0x800064d0,%d1
        movea.l %d1,%a1                 | the track's step counter
        moveq   #\wave,%d1
        lsl.l   #8,%d1
        tst.b   (0x30,%a1)              | its run flag (0x80006500 + t)
        beq.s   .Lstop\@
        addq.l  #1,%d1
.Lstop\@:
        lsl.l   #8,%d1
        move.b  (%a1),%d1               | step counter
        lsl.l   #8,%d1
        move.b  (0x20,%a1),%d1          | tick (0x800064f0 + t): d1 = the snapshot
        mulu.w  #116,%d0                | sizeof(dv_lfo)
        lea     dv_state:l,%a1
        adda.l  %d0,%a1                 | &dv_state[i]
        .if \wave == 2
        addq.l  #1,(100,%a1)            | DJC: frames since the last change
        .endif
        move.l  (112,%a1),%d0
        cmpi.l  #0x444A5631,%d0         | set up (DV_MAGIC)? memory may hold anything
        bne.s   .Lcall\@
        cmp.l   (84,%a1),%d1            | as at the last call
        bne.s   .Lcall\@
        cmpa.l  #0x80006204,%fp         | TRIG record n >= 8: a trig this frame
        bcc.s   .Lcall\@
        .if \wave == 1
        move.b  (0x1e,%a2,%d2.l),%d0    | DJQ: PMTR and DEP as it was snapped for?
        swap    %d0
        move.w  (0x12,%a2,%d2.l*2),%d0
        andi.l  #0x00ffffff,%d0
        cmp.l   (104,%a1),%d0
        bne.s   .Lcall\@
        .endif
        .if \wave == 2
        tst.l   (96,%a1)                | DJC: a glide running?
        beq.s   .Lheld\@
        subq.l  #1,(96,%a1)
        move.l  (92,%a1),%d0
        add.l   %d0,(8,%a1)             | one frame of it
        .endif
.Lheld\@:
        move.l  (8,%a1),(4,%a0)         | the output (0 until first set)
        rts
.Lnone\@:
        clr.l   (4,%a0)
        rts
.Lcall\@:
        move.l  %a0,-(%sp)
        clr.l   %d0
        move.b  (0x1e,%a2,%d2.l),%d0    | PMTR
        swap    %d0
        move.w  (0x12,%a2,%d2.l*2),%d0  | DEP word
        move.l  %d0,-(%sp)              | dq = PMTR << 16 | DEP
        pea     \wave\().w
        move.l  %d1,-(%sp)              | snap
        clr.l   %d0
        move.b  (0x27,%a2,%d2.l),%d0    | TRIG mode
        move.l  %d0,-(%sp)
        clr.l   %d0
        move.b  (0x24,%a2,%d2.l),%d0    | MULT 0..6 -> loop length
        move.l  %d0,-(%sp)
        move.l  %d2,%d0
        add.l   %d0,%d0
        move.b  (0xc,%a2,%d0.l),%d0     | SPD knob byte (high byte of the word) = DEJA
        andi.l  #0xff,%d0
        move.l  %d0,-(%sp)
        moveq   #0,%d0
        cmpa.l  #0x80006204,%fp
        bcs.s   .Lnotrig\@
        moveq   #1,%d0
.Lnotrig\@:
        move.l  %d0,-(%sp)              | trig
        move.l  %a1,-(%sp)              | the LFO's state
        jsr     dv_call
        lea     (32,%sp),%sp
        movea.l (%sp)+,%a0
        move.l  %d0,(4,%a0)
        rts
        .endm

        DVWAVE  dv_wave, 0
        DVWAVE  dq_wave, 1
        DVWAVE  dc_wave, 2

dv_label:
        .asciz  "DJV"
dq_label:
        .asciz  "DJQ"
dc_label:
        .asciz  "DJC"
        .balign 4

| LFO SETUP's WAVE cell draws an icon from the 19-entry table 0x400bdf36
| (record: width 17, height 9, 1, pixels, mask); entry 19 is ours.
dv_icon:
        .long   17, 9, 1, dv_icon_px, dv_icon_mask
dq_icon:
        .long   17, 9, 1, dq_icon_px, dv_icon_mask
dc_icon:
        .long   17, 9, 1, dc_icon_px, dv_icon_mask

| The grown tables, where the schema has StockCopy (manifest.py): the 19 stock
| pointers are copied in from guarded stock bytes at build or install, then
| ours. Without StockCopy (upstream octabam) TableGrow builds them instead and
| these 168 bytes stay unused. A copy covers at most 32 bytes (loader.h), so
| each table is three: entries 0-7, 8-15 and 16-18.
        .balign 4
dv_labels:
        .space  32                      | stock 0x400be38e: 19 label pointers
dv_labels_8:
        .space  32
dv_labels_16:
        .space  12
        .long   dv_label, dq_label, dc_label
dv_icons:
        .space  32                      | stock 0x400bdf36: 19 icon record pointers
dv_icons_8:
        .space  32
dv_icons_16:
        .space  12
        .long   dv_icon, dq_icon, dc_icon
