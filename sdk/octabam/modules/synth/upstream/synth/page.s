| SYNTH MACHINE -- ColdFire code cave, phase 3: the page (22 Sep 2026). GNU as,
| -mcpu=5475. PINNED at 0x400d24d0 (the second zero run): the override list
| below (pg_over) carries absolute pointers to the formatters and widgets, so
| the bytes depend on the address.
|
| WHAT: when FM SYNTH is chosen in the track's machine list (2.10: FLEX with the Part's
| "FM", 1, machine.s) or the current track's FLEX slot holds an FMSYNTH*- (or SYNTH*-)
| named sample, the PLAYBACK page presents the FM voice instead of a sample player -- the slot
| names read PTCH RATO INDX FINE FDBK DEC (four characters: the boxes are 19 px), the values format as the voice
| understands them (RATIO from the ratio table "0.25".."16", INDEX and FDBK
| 0..127, DECAY as the milliseconds alone / "1.1s" / "HOLD" at 127 -- four characters
| at most, the width of the value field), the four synth slots show their
| value all the time (Digitone style) and draw an icon where the sample dial
| was: two operator boxes, the modulator feeding the carrier (RATIO), a
| sideband spectrum whose bars grow with the index (INDEX), the modulator's
| box with its feedback loop, drawn when FDBK > 0 (FDBK), and the index
| envelope, a falling curve whose length follows the value (DECAY). Every
| icon keeps two pixels clear of the box's dividers (23 Sep 2026: the first
| icons carried M and C letters, ran to the edges and crowded the boxes). The
| footer reads FM SYNTH>FLEX. THE TUNING SYSTEM (27 Sep 2026): PTCH is
| semitones on a synth track -- range 0..127 = -64..+63, one raw unit a
| semitone (the engine, poly.s sy_word, reads it so), printed as a signed
| whole number ("-12", "0", "+7"; the stock formatter's "+7.0" and its
| 5-units-a-semitone stay on sample tracks) in place of the stock
| semitone-snapping accumulator; RATE is FINE, -64..+63 cents (raw 64 = 0,
| "+12c"), default 64. THE KNOBS (30 Sep 2026): all six slots' handlers are
| poly.s's po_knob, planted by po_pgdesc when it finishes the clone -- one unit
| a detent, seven with the knob pressed, and with FUNC held PTCH 12 semitones,
| FINE 10 cents, INDX/FDBK/DEC 16, RATO the next whole-number ratio (the
| stock caller clamps). Non-synth tracks and every other page draw exactly
| as stock.
|
| HOW: the page descriptor resolver 0x40031da4(track, page kind) returns
| tbl[machine] for the PLAYBACK page at 0x40031ece (`movel %a0@(0,%d0:l:4),%d0;
| bras 0x40031ed6`, 6 bytes -> `jmp pg_resolve`). Everything that draws or edits
| the page -- the generic parameter-page renderer 0x4004e0xx, the footer
| 0x4003d5xx, the knob handler 0x40055008 -- reaches the descriptor through it
| (0x40031ee0 / 0x40031f28 tail-call it). The stub replays the lookup and, for
| the FLEX descriptor of a track whose assigned FLEX slot (Part + 0x8f04a +
| track*5 + 1) has a settings record (0x100b14f0 + 0x448*slot) whose path's
| basename starts with "SYNTH" -- loaded into flex RAM or not -- returns the
| synth's descriptor: a RUNTIME CLONE of the stock FLEX record (P..P+0x192),
| built on first use by poly.s's po_pgdesc (the DRAM unit: the copy of the
| stock record from the image and the 402 B of RAM it needs live there; this
| cave has no room for them and, pinned at a fixed address, no way to name the
| unit -- so it takes the builder's address from the long before sy_render,
| whose own address the kind table's FLEX entry 0x400d6438 holds) with only
| the fields pg_over lists changed: the names, the title, the six A
| formatters (P+0xca), the four B widgets (P+0xfa), the enable nibbles
| (P+0x18e: 5/7 = bit 2 "always show the value") and, since the tuning
| system, PTCH's minimum and count (P+0x6a, P+0x9a: 0 and 128), FINE's
| default (P+0x5e+3: 64) and the two knob handlers (P+0x12a, +12: 0) --
| storage, locks, scenes, LFOs and MIDI reach the bytes exactly as before. The stock record itself is never written, and this file
| carries none of its bytes (26 Sep 2026: until then pg_desc was a copy of the
| 402-byte stock record with the fields patched, 347 of them Elektron's).
|
| The renderer draws each box at (x = 60/80/100, y = 36 top row / 8 bottom
| row; y grows UPWARD, screen row = 63 - y): the name centred on x+9 at y+20,
| then widget(x, y, slot, value, flags, fmt, window). With flags bit 3 (the
| nibble's bit 2) the stock dial 0x400479b4 clears the box, draws its circle
| bitmap at (x+4, y+7), the pointer at (x+6, y+9) and the value text centred
| at y+1. Each widget here calls the stock dial first (so the value text, the
| box clear and the lock highlight stay stock's) and then blits a 17 x 13
| column bitmap over the dial at (x+1, y+7) with 0x400128a8(bitmap, window,
| x, y): {width, height, longs per column, columns, mask}, one long per
| column, bit 31 = the bottom row, bit 31-k = row k above it; the blit does
| dst = (dst & ~mask) | (data & mask), so a full mask replaces the area. The
| icon is composed in a RAM scratch (pg_data; the main OS runs from DRAM)
| from static column images (pg_img_*) and a few procedural strokes.
| Formatters have the stock signature fmt(buf, value) -> sprintf.

        .text
        .set    RESOLVER_RET, 0x40031ed6
        .set    FLEX_P, 0x400d31ae       | the stock FLEX PLAYBACK descriptor (P form)
        .set    KIND_FLEX, 0x400d6438    | the kind table's FLEX entry: sy_render's address (the manifest's SymbolRef)
        .set    SLOT_OFF, 0x8f04b        | Part: 0x8f04a + track*5 + machine (1 = FLEX)
        .set    SIG_OFF, 0x8edbc         | Part: 0x8ed80 + 0x3c + track*30: the NEIGHBOR column, "FM", 1 (machine.s)
        .set    SETTINGS_BASE, 0x100b14f0
        .set    SETTINGS_STRIDE, 0x448
        .set    STOCK_WIDGET, 0x400479b4
        .set    BLIT, 0x400128a8
        .set    SPRINTF, 0x40013a08
        .set    FMT_D, 0x400b465d        | "%d"
        .set    FMT_PLAIN, 0x4003c178    | the stock formatter fmt(buf, value) -> sprintf(buf, "%d", value)

| ---- the FM SYNTH machine's descriptor (machine.s, at the cave's first byte) ---
| fm_descriptor() -> d0 = the FM SYNTH PLAYBACK descriptor (po_pgdesc with this cave's
| list; built on first use). machine.s calls it at this fixed address: the UI tick
| publishes it as the machine table's sixth entry for SRC SETUP's FM SYNTH row (after
| Modwerk's dedicated chooser, MIT). d0/d1/a0/a1 clobbered (C scratch).
fm_descriptor:
        moveal  KIND_FLEX,%a0            | sy_render
        moveal  %a0@(-4),%a0             | po_pgdesc
        lea     pg_over(%pc),%a1
        jmp     %a0@

| ---- the resolver detour ------------------------------------------------------
| 0x40031ece: `movel %a0@(0,%d0:l:4),%d0; bras 0x40031ed6` -> `jmp pg_resolve` (the
| cave's +16 since 2.10: fm_descriptor is first; the manifest's PG_RESOLVE_AT).
| d0 = machine type, a0 = the table 0x400d5f38, d3 = track, d1 = part index,
| a1 = the bank blob; d2-d5 are restored by the resolver's epilogue, d1/a0/a1
| are C scratch, d6/d7/a2-a6 are left alone.
pg_resolve:
        movel   %a0@(0,%d0:l:4),%d0      | replay: the machine's descriptor
        cmpil   #FLEX_P,%d0
        bne     pg_r_done
        movel   #6322,%d2
        mulsl   %d1,%d2                  | part * 6322
        addl    %a1,%d2                  | + the bank blob
        moveal  %d2,%a0                  | FM SYNTH chosen in the machine list (machine.s): FLEX
        movel   %d3,%d4                  | (the descriptor said so) with "FM", 1 in the track's
        muluw   #30,%d4                  | NEIGHBOR column
        addal   %d4,%a0
        addal   #SIG_OFF,%a0
        mvzw    %a0@,%d5
        cmpil   #0x464d,%d5
        bne     pg_unsigned
        mvzb    %a0@(2),%d5
        cmpil   #1,%d5
        beq     pg_synth
pg_unsigned:
        movel   %d3,%d4
        lsll    #2,%d4
        addl    %d3,%d4                  | track * 5
        addl    %d4,%d2
        moveal  %d2,%a0
        addal   #SLOT_OFF,%a0
        mvzb    %a0@,%d2                 | the track's FLEX slot, 0-based
        cmpil   #127,%d2
        bhi     pg_r_done                | 0xff = none; 128.. = the recorder buffers
        movel   #SETTINGS_STRIDE,%d4
        mulsl   %d2,%d4
        addil   #SETTINGS_BASE,%d4
        moveal  %d4,%a0                  | the slot's settings record; its path at +0
        | (nothing else is tested: the byte at +0x129 the first build gated on as
        | a "loaded" flag is the sample's QUANTIZED TRIG attribute, -1 = OFF for
        | a sample loaded through the file browser -- the trig routine 0x40005102
        | only chooses between an immediate and a quantized manual trig on it; an
        | empty slot has an empty path and fails the name compare below)
        moveal  %a0,%a1                  | a1 = the file name (after the last '/')
        movel   #255,%d4
pg_scan:
        mvzb    %a0@+,%d5
        beq     pg_scanned
        cmpil   #'/',%d5
        bne     pg_scan1
        moveal  %a0,%a1
pg_scan1:
        subql   #1,%d4
        bne     pg_scan
pg_scanned:
        movew   #0x464d,%d5              | "FM": FMSYNTH* is the marker name too
        cmpw    %a1@,%d5
        bne     pg_fm
        addql   #2,%a1
pg_fm:
        lea     pg_name(%pc),%a0
        moveq   #5,%d4
pg_cmp:
        mvzb    %a0@+,%d5
        mvzb    %a1@+,%d2
        cmpl    %d2,%d5
        bne     pg_r_done
        subql   #1,%d4
        bne     pg_cmp
pg_synth:
        moveal  KIND_FLEX,%a0            | the kind table's FLEX entry: poly.s's sy_render
        moveal  %a0@(-4),%a0             | the long before it: po_pgdesc
        lea     pg_over(%pc),%a1         | this cave's fields
        jsr     %a0@                     | d0 = the synth's descriptor (a1: the list; d0/d1/a0/a1 clobbered)
pg_r_done:
        jmp     RESOLVER_RET
pg_name:
        .ascii  "SYNTH"
        .align  4
| ---- what the clone changes: {offset.w, length.w, source.l} into the stock FLEX
| record, applied by po_pgdesc over its copy; a negative offset ends the list.
| Absolute pointers throughout: the cave is pinned.
pg_over:
        .short  0x009, 9
        .long   pg_title                 | P+0x009: the title, "FM SYNTH" (the footer reads FM SYNTH>FLEX)
        .short  0x01c, 30
        .long   pg_names                 | P+0x01c: slots 1..5 (STRT LEN RATE RTRG RTIM) read RATO INDX FINE FDBK DEC
        .short  0x061, 1
        .long   pg_def64                 | P+0x05e+3: FINE's default, 64 = 0 cents (stock RATE: 127)
        .short  0x06a, 4
        .long   pg_zero                  | P+0x06a: PTCH's minimum, 0 (stock 4) ...
        .short  0x09a, 4
        .long   pg_l128                  | P+0x09a: ... and count, 128 (stock 121): raw 0..127 = -64..+63 semitones
        .short  0x0ca, 24
        .long   pg_fmts                  | P+0x0ca: the six A formatters
        .short  0x0fe, 8
        .long   pg_wids_a                | P+0x0fe: the B widgets of slots 1 2
        .short  0x10a, 8
        .long   pg_wids_b                | P+0x10a: of slots 4 5
        .short  0x12a, 4
        .long   pg_zero                  | P+0x12a: PTCH's knob handler, 0 (stock: the semitone-snapping
        .short  0x136, 4                 | accumulator 0x40032d08, built for 5 a semitone) ...
        .long   pg_zero                  | P+0x12a+12: FINE's, 0 (stock RATE: 0x400328e4) -- both moot since
                                         | 30 Sep 2026: po_pgdesc finishes the clone by planting poly.s's
                                         | po_knob in all six slots (one unit a detent, x7 pressed, FUNC's
                                         | per-knob jump; the DRAM unit's address is unknown to this cave)
        .short  0x18e, 4
        .long   pg_nibbles               | P+0x18e: the enable nibbles
        .short  -1, 0
        .long   0
pg_title:
        .asciz  "FM SYNTH"
pg_names:
        .ascii  "RATO\0\0INDX\0\0FINE\0\0FDBK\0\0DEC\0\0\0"
pg_def64:
        .byte   64
        .align  4
pg_zero:
        .long   0
pg_l128:
        .long   128
pg_fmts:
        .long   pg_fmt_ptch, pg_fmt_ratio, FMT_PLAIN, pg_fmt_fine, FMT_PLAIN, pg_fmt_decay
pg_wids_a:
        .long   pg_wid_ratio, pg_wid_index
pg_wids_b:
        .long   pg_wid_fdbk, pg_wid_decay
pg_nibbles:
        .long   0x55551551               | nibble s (from the LOW end, as 0x400a6994 shifts it) = slot
                                         | s; stock 0x55311311: bit 0 = the encoder is live, bit 1 (LEN,
                                         | RTIM) = the arch the renderer draws bridging the slot to the
                                         | one before it (STRT-LEN, RTRG-RTIM: cleared here, the pairs
                                         | mean nothing to the voice), bit 2 = always show the value
                                         | (set on 1 2 4 5). The first build set 0x55715751: RATE (s3)
                                         | always shown instead of FDBK (s4)

| ---- the formatters: fmt(buf, value), C convention ----------------------------
| INDEX and FDBK print 0..127 as stored through the stock's own "%d" formatter,
| FMT_PLAIN (26 Sep 2026: this cave's copy of it was the same 26 bytes).

pg_fmt_ptch:                             | PTCH on a synth track: raw - 64 as a signed whole number, "-12" "0" "+7"
        movel   %sp@(8),%d0              | raw
        subil   #64,%d0
        lea     pg_f_plus(%pc),%a0       | "+%d" above 0 ...
        bgt     pg_fp_go
        lea     FMT_D,%a0                | ... "%d" otherwise (0, and the minus sign is the number's own)
pg_fp_go:
        movel   %d0,%sp@-
        movel   %a0,%sp@-
        movel   %sp@(12),%sp@-           | buf
        jsr     SPRINTF
        lea     %sp@(12),%sp
        rts

pg_fmt_fine:                             | FINE: raw - 64 cents, "-64c" "0c" "+12c" (four characters at most)
        movel   %sp@(8),%d0
        subil   #64,%d0
        lea     pg_f_plusc(%pc),%a0      | "+%dc"
        bgt     pg_fp_go
        lea     pg_f_dc(%pc),%a0         | "%dc"
        bra     pg_fp_go

pg_fmt_ratio:                            | the ratio table's entry: "0.25" "1" "1.41" "3.5" "16"
        movel   %d2,%sp@-
        movel   %sp@(12),%d0             | raw
        lsrl    #2,%d0
        andil   #31,%d0
        lea     pg_ratio(%pc),%a0
        mvzw    %a0@(0,%d0:l:2),%d1      | Q8
        movel   %d1,%d0
        lsrl    #8,%d0                   | the integer part
        andil   #255,%d1
        moveq   #100,%d2
        mulul   %d2,%d1
        lsrl    #8,%d1                   | the fraction in hundredths: 0 1 25 41 50 75
        beq     pg_fr_int
        cmpil   #50,%d1
        beq     pg_fr_half
        movel   %d1,%sp@-
        movel   %d0,%sp@-
        pea     pg_f_dd(%pc)             | "%d.%02d"
        movel   %sp@(20),%sp@-
        jsr     SPRINTF
        lea     %sp@(16),%sp
        bra     pg_fr_out
pg_fr_half:
        movel   %d0,%sp@-
        pea     pg_f_d5(%pc)             | "%d.5"
        movel   %sp@(16),%sp@-
        jsr     SPRINTF
        lea     %sp@(12),%sp
        bra     pg_fr_out
pg_fr_int:
        movel   %d0,%sp@-
        pea     FMT_D
        movel   %sp@(16),%sp@-
        jsr     SPRINTF
        lea     %sp@(12),%sp
pg_fr_out:
        movel   %sp@+,%d2
        rts

pg_fmt_decay:                            | tau = 2 s * (raw/127)^2: "0", "32", "286", "1.1s", "1.9s", 127 "HOLD"
        movel   %d2,%sp@-
        movel   %sp@(12),%d0             | raw
        moveq   #127,%d1                 | 127 (the last position): HOLD; 0 = the shortest, prints "0"
        cmpl    %d1,%d0                  | (5 Oct 2026: HOLD moved from 0 to 127; the short
        bccs    pg_fd_hold               | branches keep the cave at 1,812 B)
        movel   %d0,%d1
        mulul   %d0,%d1                  | raw^2
        movel   #2000,%d0
        mulul   %d1,%d0                  | * 2000 ms
        addil   #8064,%d0
        movel   #16129,%d1
        divul   %d1,%d0                  | / 127^2, rounded: ms
        cmpil   #1000,%d0
        bccs    pg_fd_sec
        movel   %d0,%sp@-
        pea     FMT_D                    | "%d": the milliseconds alone -- the value field
        movel   %sp@(16),%sp@-           | fits four characters and "598ms" ran into the divider
        jsr     SPRINTF
        lea     %sp@(12),%sp
        bra     pg_fd_out
pg_fd_sec:
        movel   #1000,%d1
        movel   %d0,%d2
        divul   %d1,%d2                  | seconds
        moveq   #100,%d1
        divul   %d1,%d0                  | tenths, total
        movel   %d2,%d1
        lsll    #3,%d1
        addl    %d2,%d1
        addl    %d2,%d1                  | seconds * 10
        subl    %d1,%d0                  | tenths
        movel   %d0,%sp@-
        movel   %d2,%sp@-
        pea     pg_f_s(%pc)              | "%d.%ds"
        movel   %sp@(20),%sp@-
        jsr     SPRINTF
        lea     %sp@(16),%sp
        bra     pg_fd_out
pg_fd_hold:
        pea     pg_f_hold(%pc)           | "HOLD": the index holds
        movel   %sp@(12),%sp@-
        jsr     SPRINTF
        addql   #8,%sp
pg_fd_out:
        movel   %sp@+,%d2
        rts

| ---- the widgets: widget(x, y, slot, value, flags, fmt, window) ---------------
pg_wid_ratio:
        moveq   #0,%d0
        bra     pg_wid
pg_wid_index:
        moveq   #1,%d0
        bra     pg_wid
pg_wid_fdbk:
        moveq   #2,%d0
        bra     pg_wid
pg_wid_decay:
        moveq   #3,%d0
        bra     pg_wid
pg_wid:
        lea     %sp@(-44),%sp
        moveml  %d2-%d7/%a2-%a6,%sp@     | args: 48 x, 52 y, 56 slot, 60 value, 64 flags, 68 fmt, 72 window
        movel   %d0,%d7                  | which icon
        movel   %sp@(72),%sp@-           | the stock dial first: the box clear, the value text,
        movel   %sp@(72),%sp@-           | the lock highlight (each push brings the next arg to 72)
        movel   %sp@(72),%sp@-
        movel   %sp@(72),%sp@-
        movel   %sp@(72),%sp@-
        movel   %sp@(72),%sp@-
        movel   %sp@(72),%sp@-
        jsr     STOCK_WIDGET
        lea     %sp@(28),%sp
        movel   %sp@(64),%d0             | flags bit 1 = the compact layout (CHROMATIC trig mode's
        btst    #1,%d0                   | half-height page: the stock prints the value alone at
        bne     pg_wid_out               | 0x40047a42) -- no room for an icon, leave the box as drawn
        movel   %sp@(60),%d6             | value
        tstl    %d7
        beq     pg_ic_ratio
        subql   #1,%d7
        beq     pg_ic_index
        subql   #1,%d7
        beq     pg_ic_fdbk
        bra     pg_ic_decay

| RATIO: the two operators, M -> C (the ratio itself is the value text)
pg_ic_ratio:
        lea     pg_img_ratio(%pc),%a0
        bsr     pg_copy
        bra     pg_blit

| INDEX: a sideband spectrum -- the carrier bar shrinks a little, the sidebands
| at +-1, +-2, +-3 grow in turn with the index (a Bessel-shaped cartoon)
pg_ic_index:
        lea     pg_img_base(%pc),%a0
        bsr     pg_copy
        movel   %d6,%d1
        moveq   #3,%d0
        mulul   %d0,%d1
        moveq   #127,%d0
        divul   %d0,%d1                  | value * 3 / 127
        moveq   #11,%d2
        subl    %d1,%d2                  | the carrier, 11 .. 8
        moveq   #8,%d0
        moveq   #1,%d1
        bsr     pg_vline
        movel   %d6,%d2
        moveq   #10,%d0
        mulul   %d0,%d2
        moveq   #127,%d0
        divul   %d0,%d2                  | +-1: value * 10 / 127
        beq     pg_ix2
        moveq   #6,%d0
        moveq   #1,%d1
        bsr     pg_vline
        moveq   #10,%d0
        moveq   #1,%d1
        bsr     pg_vline
pg_ix2:
        movel   %d6,%d2
        subil   #20,%d2
        ble     pg_ix3
        moveq   #8,%d0
        mulul   %d0,%d2
        movel   #107,%d0
        divul   %d0,%d2                  | +-2: (value - 20) * 8 / 107
        beq     pg_ix3
        moveq   #4,%d0
        moveq   #1,%d1
        bsr     pg_vline
        moveq   #12,%d0
        moveq   #1,%d1
        bsr     pg_vline
pg_ix3:
        movel   %d6,%d2
        subil   #56,%d2
        ble     pg_blit
        moveq   #6,%d0
        mulul   %d0,%d2
        moveq   #71,%d0
        divul   %d0,%d2                  | +-3: (value - 56) * 6 / 71
        beq     pg_blit
        moveq   #2,%d0
        moveq   #1,%d1
        bsr     pg_vline
        moveq   #14,%d0
        moveq   #1,%d1
        bsr     pg_vline
        bra     pg_blit

| FDBK: the modulator, and its feedback loop when the value is not 0
pg_ic_fdbk:
        lea     pg_img_fdbk(%pc),%a0
        bsr     pg_copy
        tstl    %d6
        beq     pg_blit
        lea     pg_img_loop(%pc),%a0
        bsr     pg_or
        bra     pg_blit

| DECAY: the index envelope -- an instant rise at column 1, then pg_env's
| exponential fall stretched over L = 2 + value * 13 / 127 columns to the
| floor (row 1 = I/16), columns 2..15; value 127 holds, a flat top (0 = the
| shortest fall, L = 2)
pg_ic_decay:
        lea     pg_img_base(%pc),%a0
        bsr     pg_copy
        moveq   #1,%d0
        moveq   #1,%d1
        moveq   #11,%d2
        bsr     pg_vline                 | the attack edge
        movel   #0x7fff,%d5              | value 127 (HOLD): i stays 0, h stays 11
        moveq   #127,%d0
        cmpl    %d0,%d6
        bccs    pg_dc_go
        movel   %d6,%d5
        moveq   #13,%d0
        mulul   %d0,%d5
        moveq   #127,%d0
        divul   %d0,%d5
        addql   #2,%d5                   | L, 2 .. 15 columns
pg_dc_go:
        moveq   #11,%d4                  | the previous height
        moveq   #2,%d7                   | column, 2 .. 15
pg_dc_loop:
        movel   %d7,%d2
        subql   #1,%d2
        lsll    #4,%d2
        divul   %d5,%d2                  | i = (c - 1) * 16 / L
        cmpil   #16,%d2
        ble     pg_dc1
        moveq   #16,%d2
pg_dc1:
        lea     pg_env(%pc),%a0
        mvzb    %a0@(0,%d2:l),%d2        | h
        moveal  %d2,%a3
        movel   %d7,%d0
        movel   %d2,%d1
        movel   %d4,%d2
        bsr     pg_vline                 | rows h .. previous: the outline
        movel   %a3,%d4
        addql   #1,%d7
        cmpil   #15,%d7
        ble     pg_dc_loop

| the blit: over the stock dial, at (x+1, y+7); inverted with the box when
| the parameter is locked (flags bit 0: the stock inverts x+1..x+17, y+1..y+18)
pg_blit:
        movel   %sp@(64),%d0
        btst    #0,%d0
        beq     pg_blit1
        lea     pg_data(%pc),%a0
        moveq   #16,%d0
pg_inv:
        movel   %a0@,%d1
        eoril   #0xfff00000,%d1          | rows 0..11 (row 12, y+19, lies outside the highlight)
        movel   %d1,%a0@+
        subql   #1,%d0
        bge     pg_inv
pg_blit1:
        movel   %sp@(52),%d0
        addql   #7,%d0
        movel   %d0,%sp@-                | y + 7
        movel   %sp@(52),%d0
        addql   #1,%d0
        movel   %d0,%sp@-                | x + 1
        movel   %sp@(80),%sp@-           | window
        pea     pg_bmp(%pc)
        jsr     BLIT
        lea     %sp@(16),%sp
pg_wid_out:
        moveml  %sp@,%d2-%d7/%a2-%a6
        lea     %sp@(44),%sp
        rts

| ---- icon helpers (the scratch is pg_data: 17 longs, one per column) -------
pg_copy:                                 | a0 = a 17-column image -> the scratch
        lea     pg_data(%pc),%a1
        moveq   #16,%d0
pg_copy1:
        movel   %a0@+,%a1@+
        subql   #1,%d0
        bge     pg_copy1
        rts
pg_or:                                   | OR the image at a0 into the scratch
        lea     pg_data(%pc),%a1
        moveq   #16,%d0
pg_or1:
        movel   %a0@+,%d1
        orl     %d1,%a1@+
        subql   #1,%d0
        bge     pg_or1
        rts
pg_vline:                                | column d0, rows d1 .. d2 (d1 <= d2 <= 12); clobbers d1, d3, a0
        lea     pg_data(%pc),%a0
        lea     %a0@(0,%d0:l:4),%a0
        movel   #0x80000000,%d3
        lsrl    %d1,%d3
pg_vline1:
        orl     %d3,%a0@
        lsrl    #1,%d3
        addql   #1,%d1
        cmpl    %d1,%d2
        bge     pg_vline1
        rts

| ---- data -------------------------------------------------------------------
pg_f_dd:
        .asciz  "%d.%02d"
pg_f_d5:
        .asciz  "%d.5"
pg_f_s:
        .asciz  "%d.%ds"
pg_f_hold:
        .asciz  "HOLD"
pg_f_plus:
        .asciz  "+%d"
pg_f_plusc:
        .asciz  "+%dc"
pg_f_dc:
        .asciz  "%dc"
pg_env:                                  | 11 * exp(-i/5), i = 0..16; the floor is row 1
        .byte   11, 9, 7, 6, 5, 4, 3, 3, 2, 2, 1, 1, 1, 1, 1, 1, 1
        .align  2
pg_ratio:                                | synth.s's sy_ratio: STRT raw >> 2 -> the ratio, Q8
        .short  64, 128, 192, 256, 259, 320, 362, 384
        .short  448, 512, 515, 640, 768, 896, 1024, 1027
        .short  1152, 1280, 1408, 1536, 1664, 1792, 1920, 2048
        .short  2304, 2560, 2816, 3072, 3328, 3584, 3840, 4096
        .align  4
pg_bmp:                                  | the blit's record: width, height, longs per column, columns, mask
        .long   17, 13, 1, pg_data, pg_mask
pg_mask:
        .rept   17
        .long   0xfff80000               | rows 0..12
        .endr
pg_data:                                 | the scratch (RAM)
        .fill   17, 4, 0


| RATO: the two operators, a box each, the modulator feeding the carrier
pg_img_ratio:
|   .................
|   .................
|   .................
|   .................
|   ..####.....####..
|   ..#..#..#..#..#..
|   ..#..#...#.#..#..
|   ..#..#######..#..
|   ..#..#...#.#..#..
|   ..#..#..#..#..#..
|   ..####.....####..
|   .................
|   .................
        .long   0x00000000, 0x00000000, 0x3f800000, 0x20800000
        .long   0x20800000, 0x3f800000, 0x04000000, 0x04000000
        .long   0x15000000, 0x0e000000, 0x04000000, 0x3f800000
        .long   0x20800000, 0x20800000, 0x3f800000, 0x00000000
        .long   0x00000000

| FDBK: the modulator's box; pg_img_loop is OR'd over it when FDBK > 0
pg_img_fdbk:
|   .................
|   .................
|   .................
|   .................
|   .....#######.....
|   .....#.....#.....
|   .....#.....#.....
|   .....#.....#.....
|   .....#.....#.....
|   .....#.....#.....
|   .....#######.....
|   .................
|   .................
        .long   0x00000000, 0x00000000, 0x00000000, 0x00000000
        .long   0x00000000, 0x3f800000, 0x20800000, 0x20800000
        .long   0x20800000, 0x20800000, 0x20800000, 0x3f800000
        .long   0x00000000, 0x00000000, 0x00000000, 0x00000000
        .long   0x00000000

| the feedback loop: out of the box's right side, over the top, back into
| its left side with an arrowhead
pg_img_loop:
|   .................
|   ..############...
|   ..#..........#...
|   ..#..........#...
|   ..#..........#...
|   ..#..........#...
|   ..##.........#...
|   ..###.......##...
|   ...#.............
|   .................
|   .................
|   .................
|   .................
        .long   0x00000000, 0x00000000, 0x07f00000, 0x0e100000
        .long   0x04100000, 0x00100000, 0x00100000, 0x00100000
        .long   0x00100000, 0x00100000, 0x00100000, 0x00100000
        .long   0x04100000, 0x07f00000, 0x00000000, 0x00000000
        .long   0x00000000

| the baseline of INDX and DEC: columns 1..15, a pixel clear of the box edges
pg_img_base:
|   .................
|   .................
|   .................
|   .................
|   .................
|   .................
|   .................
|   .................
|   .................
|   .................
|   .................
|   .................
|   .###############.
        .long   0x00000000, 0x80000000, 0x80000000, 0x80000000
        .long   0x80000000, 0x80000000, 0x80000000, 0x80000000
        .long   0x80000000, 0x80000000, 0x80000000, 0x80000000
        .long   0x80000000, 0x80000000, 0x80000000, 0x80000000
        .long   0x00000000

        .align  4
pg_end:
