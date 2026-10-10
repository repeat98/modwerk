| PROCESSOR LOAD -- the ColdFire's audio-interrupt load, shown in the stock TEMPO popup.
|
| Four parts, all in this one DRAM unit:
|   pl_isr        the frame interrupt's entry (main's install of the vector names it instead of the
|                 stock handler): a DMA timer 3 stamp, then the stock handler.
|   pl_tail       the frame interrupt's epilogue (every exit path): the body's duration into a running
|                 sum, a block count and the longest block, then the stock restore and RTE.
|   pl_ui         the UI task loop, the type-1 message path: pl_tick, then the stock countdown call.
|   pl_tempo_draw the stock TEMPO draw (every caller): the stock body, then the meter's overlay.
| The interrupt side never divides, draws or waits; it reads DTIM3 and adds. Everything else runs in
| the UI task. Nothing writes a hardware register, the card or a DSP.
|
| The clock: DTIM3 counts the 132 MHz bus clock (measured on an MKI). One 16-sample block at
| 44.1 kHz is 362.8 us = 47,891.2 ticks.

        .equ DTCN3,       0xfc07c00c    | DMA timer 3's free-running count (read only)
        .equ SYS_UP,      0x460d180e    | stock: SYS startup complete (set after the boot logo)
        .equ STOCK_ISR,   0x4000aad0    | the stock frame handler the vector install names
        .equ UI_RESUME,   0x40056c90    | the UI loop, after the displaced countdown call
        .equ TEMPO_BODY,  0x4004b530    | the stock TEMPO draw, after its displaced prologue
        .equ TEMPOWIN,    0x460d16a0    | the stock TEMPO window handle (0 = closed)
        .equ SCRDIRTY,    0x46c7c72c    | screen refresh request
        .equ BOX,         0x40012254    | (surf, x0, y0, x1, y1, color), inclusive; color 0 clears
        .equ TEXT,        0x40012bd8    | (font, surf, x, y, limit, text), ORs pixels
        .equ FONT,        0x400ba876    | the small font: 3 px wide, 6 px high
        .equ KEYS_FUNC,   0x46100b1d    | the key state byte: bit 5 = FUNC held

        .equ PERIOD,      33000000      | a window: a quarter second at 132 MHz
        .equ STALE,       528000000     | a window longer than four seconds is not a reading
        .equ MAX_FRAMES,  11025         | ... nor one with more blocks than four seconds hold
        .equ BLOCK,       47892         | 16 / 44100 s at 132 MHz, rounded up
        .equ BODY_MAX,    0x01000000    | a longer "body" spans a timer reset: not a duration
        .equ WARN,        70            | the "!" from this mean up

| pl_stats: written by the interrupt (and MAXREQ by the UI), read by the UI under SEQ.
        .equ PS_SEQ,      0             | odd while the tail updates SUM / COUNT / MAX
        .equ PS_ARMED,    4             | 1 once stock's startup flag was seen
        .equ PS_OPEN,     8             | 1 between an entry stamp and its tail
        .equ PS_ENTRY,    12            | DTIM3 at the entry
        .equ PS_SUM,      16            | body ticks, modulo 2^32
        .equ PS_COUNT,    20            | completed blocks, modulo 2^32
        .equ PS_MAX,      24            | the longest block since the UI's last request
        .equ PS_MAXREQ,   28            | UI: 1 = the next block starts a new longest

| pl_state: the UI task's own.
        .equ LM_SEEDED,   0
        .equ LM_TIME,     4             | DTIM3 at the last committed sample
        .equ LM_SUM,      8
        .equ LM_FRAMES,   12
        .equ LM_PERCENT,  16            | the mean, 0..100; -1 = no reading
        .equ LM_WORST,    20            | the longest block, % of a block, 0..999; -1 = no reading
        .equ LM_POLL,     24            | DTIM3 at the last sample attempt
        .equ LM_POLLED,   28
        .equ LM_FUNC,     32            | FUNC held at the last tick
        .equ LM_TEXT,     36            | "47%" / "70%!" / "--%", NUL-terminated, 8 bytes
        .equ LM_WTEXT,    44            | "W112" / "W--", NUL-terminated, 8 bytes

        .text
        .globl pl_isr, pl_tail, pl_ui, pl_tempo_draw
        .globl pl_tick, pl_format, pl_overlay, pl_stats, pl_state, pl_state_end

| ---- the frame interrupt's entry ------------------------------------------------------------
| Main's install of vector 0x41 pushes this address instead of the stock handler's. The
| exception frame and every register reach the stock handler unchanged.
pl_isr:
        lea     -8(%sp),%sp
        movem.l %d0/%a0,(%sp)
        lea     pl_stats,%a0
        tst.l   PS_ARMED(%a0)
        bne.s   1f
        tst.l   SYS_UP                  | the boot logo resets DTIM3: start after it
        beq.s   2f
        moveq   #1,%d0
        move.l  %d0,PS_ARMED(%a0)
1:      move.l  DTCN3,%d0
        move.l  %d0,PS_ENTRY(%a0)
        moveq   #1,%d0
        move.l  %d0,PS_OPEN(%a0)
2:      movem.l (%sp),%d0/%a0
        lea     8(%sp),%sp
        jmp     STOCK_ISR

| ---- the frame interrupt's epilogue ----------------------------------------------------------
| Every stock exit reaches this point with D0-A6 saved at SP; the three displaced instructions
| (restore, release, RTE) end it.
pl_tail:
        lea     pl_stats,%a0
        tst.l   PS_OPEN(%a0)
        beq.s   9f                      | no entry stamp (not armed yet)
        clr.l   PS_OPEN(%a0)
        move.l  DTCN3,%d0
        sub.l   PS_ENTRY(%a0),%d0       | the body's ticks, modulo 2^32
        cmpi.l  #BODY_MAX,%d0
        bcc.s   9f
        addq.l  #1,PS_SEQ(%a0)          | odd
        add.l   %d0,PS_SUM(%a0)
        addq.l  #1,PS_COUNT(%a0)
        tst.l   PS_MAXREQ(%a0)
        bne.s   1f
        cmp.l   PS_MAX(%a0),%d0
        bls.s   2f
1:      move.l  %d0,PS_MAX(%a0)
        clr.l   PS_MAXREQ(%a0)
2:      addq.l  #1,PS_SEQ(%a0)          | even
9:      movem.l (%sp),%d0-%d7/%a0-%a6
        lea     252(%sp),%sp
        rte

| ---- the UI task --------------------------------------------------------------------------------
| The type-1 message path of the UI loop (about 60 times a second, measured): the meter's tick,
| then the displaced `movea.l %d6,%a0; jsr (%a0)` (the stock countdown; the displaced tpf is a
| no-op).
pl_ui:
        bsr.w   pl_tick
        movea.l %d6,%a0
        jsr     (%a0)
        jmp     UI_RESUME

| Keeps every register. A FUNC change redraws the popup at once; a sample is taken at most once a
| window. One seqlock attempt: an interrupted read is "no reading", never waited for.
pl_tick:
        lea     -44(%sp),%sp
        movem.l %d0-%d7/%a0-%a2,(%sp)
        lea     pl_state,%a1
        lea     pl_stats,%a0
        moveq   #0,%d0
        lea     KEYS_FUNC,%a2
        btst    #5,(%a2)
        beq.s   1f
        moveq   #1,%d0
1:      cmp.l   LM_FUNC(%a1),%d0
        beq.s   2f
        move.l  %d0,LM_FUNC(%a1)
        bsr.w   pl_overlay
2:      tst.l   PS_ARMED(%a0)
        beq.w   lm_done                 | not armed: the popup keeps "--%"
        move.l  DTCN3,%d1
        tst.l   LM_POLLED(%a1)
        beq.s   lm_sample
        move.l  %d1,%d5
        sub.l   LM_POLL(%a1),%d5
        cmpi.l  #PERIOD,%d5
        bcs.w   lm_done
lm_sample:
        moveq   #1,%d0
        move.l  %d0,LM_POLLED(%a1)
        move.l  %d1,LM_POLL(%a1)
        move.l  PS_SEQ(%a0),%d0
        btst    #0,%d0
        bne.w   lm_unavailable
        move.l  PS_SUM(%a0),%d2         | body ticks
        move.l  PS_COUNT(%a0),%d3       | blocks
        move.l  PS_MAX(%a0),%d4         | the longest block since the last request
        moveq   #1,%d6
        move.l  %d6,PS_MAXREQ(%a0)      | the next block starts the next window's longest
        move.l  DTCN3,%d1
        cmp.l   PS_SEQ(%a0),%d0
        bne.w   lm_unavailable          | a block ended meanwhile: no reading, no retry
        tst.l   LM_SEEDED(%a1)
        beq.w   lm_seed
        move.l  %d1,%d5
        sub.l   LM_TIME(%a1),%d5        | elapsed ticks
        cmpi.l  #STALE,%d5
        bhi.w   lm_reseed
        move.l  %d3,%d7
        sub.l   LM_FRAMES(%a1),%d7
        beq.w   lm_reseed               | no block completed: no audio, no reading
        cmpi.l  #MAX_FRAMES,%d7
        bhi.w   lm_reseed               | includes a whole timer wrap
        move.l  %d2,%d6
        sub.l   LM_SUM(%a1),%d6         | busy ticks
        cmp.l   %d5,%d6
        bls.s   lm_ratio
| A block can straddle the window's start: tolerate one block of excess; more is a reset epoch.
        move.l  %d6,%d7
        sub.l   %d5,%d7
        cmpi.l  #BLOCK,%d7
        bhi.w   lm_reseed
        move.l  %d5,%d6
lm_ratio:
| Both shifted right by ten before x100: a four-second window keeps the product below 2^32.
        moveq   #10,%d0
        lsr.l   %d0,%d5
        lsr.l   %d0,%d6
        moveq   #100,%d7
        mulu.l  %d7,%d6
        move.l  %d5,%d7
        lsr.l   #1,%d7
        add.l   %d7,%d6
        divu.l  %d5,%d6                 | the rounded percentage
        cmpi.l  #100,%d6
        bls.s   1f
        moveq   #100,%d6
1:      move.l  %d6,LM_PERCENT(%a1)
        cmpi.l  #BODY_MAX,%d4           | (the tail never stores more)
        bcs.s   2f
        move.l  #BODY_MAX-1,%d4
2:      moveq   #100,%d7
        mulu.l  %d7,%d4
        addi.l  #BLOCK/2,%d4
        move.l  #BLOCK,%d7
        divu.l  %d7,%d4                 | the longest block, % of one block, rounded
        cmpi.l  #999,%d4
        bls.s   3f
        move.l  #999,%d4
3:      move.l  %d4,LM_WORST(%a1)
        bra.s   lm_commit
lm_seed:
        moveq   #1,%d0
        move.l  %d0,LM_SEEDED(%a1)
lm_reseed:
        moveq   #-1,%d0
        move.l  %d0,LM_PERCENT(%a1)
        move.l  %d0,LM_WORST(%a1)
lm_commit:
        move.l  %d1,LM_TIME(%a1)
        move.l  %d2,LM_SUM(%a1)
        move.l  %d3,LM_FRAMES(%a1)
        bsr.w   pl_format
        bsr.w   pl_overlay
        bra.s   lm_done
lm_unavailable:
| An incoherent read drops the baseline: the next window seeds, the one after reads.
        clr.l   LM_SEEDED(%a1)
        moveq   #-1,%d0
        move.l  %d0,LM_PERCENT(%a1)
        move.l  %d0,LM_WORST(%a1)
        bsr.w   pl_format
        bsr.w   pl_overlay
lm_done:
        movem.l (%sp),%d0-%d7/%a0-%a2
        lea     44(%sp),%sp
        rts

| a1 = pl_state. The two texts; clobbers d0, d5-d7, a2.
pl_format:
        lea     LM_TEXT(%a1),%a2
        move.l  LM_PERCENT(%a1),%d0
        bpl.s   1f
        move.b  #'-',(%a2)+
        move.b  #'-',(%a2)+
        bra.s   2f
1:      bsr.s   pl_digits
2:      move.b  #'%',(%a2)+
        move.l  LM_PERCENT(%a1),%d0
        cmpi.l  #WARN,%d0
        blt.s   3f                      | (-1, no reading, is below)
        move.b  #'!',(%a2)+
3:      clr.b   (%a2)
        lea     LM_WTEXT(%a1),%a2
        move.b  #'W',(%a2)+
        move.l  LM_WORST(%a1),%d0
        bpl.s   4f
        move.b  #'-',(%a2)+
        move.b  #'-',(%a2)+
        bra.s   5f
4:      bsr.s   pl_digits
5:      clr.b   (%a2)
        rts

| d0 = 0..999 -> its decimal digits at (a2)+, no leading zeros. Clobbers d0, d5-d7.
pl_digits:
        moveq   #100,%d6
        cmp.l   %d6,%d0
        bcs.s   1f
        move.l  %d0,%d5
        divu.l  %d6,%d5
        move.l  %d5,%d7
        mulu.l  %d6,%d7
        sub.l   %d7,%d0
        addi.l  #'0',%d5
        move.b  %d5,(%a2)+
        bra.s   2f                      | a hundreds digit: the tens digit always follows
1:      cmpi.l  #10,%d0
        bcs.s   3f
2:      moveq   #10,%d6
        move.l  %d0,%d5
        divu.l  %d6,%d5
        move.l  %d5,%d7
        mulu.l  %d6,%d7
        sub.l   %d7,%d0
        addi.l  #'0',%d5
        move.b  %d5,(%a2)+
3:      addi.l  #'0',%d0
        move.b  %d0,(%a2)+
        rts

| ---- the TEMPO popup -------------------------------------------------------------------------
| Every caller of the stock TEMPO draw still runs its whole body (the two displaced prologue
| instructions replayed here; the draw takes no arguments), then the overlay.
pl_tempo_draw:
        bsr.s   pl_tempo_original
        bra.w   pl_overlay
pl_tempo_original:
        link.w  %a6,#-24
        movem.l %d2-%d4/%a2,(%sp)
        jmp     TEMPO_BODY

| With the popup open: clear the meter's 18 x 6 px rectangle (x3..20, two pixels above the
| header, which the poke moved down to make room) and print the mean, or with FUNC held the
| longest block. Keeps every register.
pl_overlay:
        lea     -24(%sp),%sp
        movem.l %d0-%d2/%a0-%a2,(%sp)
        move.l  TEMPOWIN,%d0
        beq.s   9f
        movea.l %d0,%a2
        lea     36(%a2),%a2             | the window's surface
        move.l  4(%a2),%d2
        subq.l  #7,%d2                  | the meter's baseline (y41 in the stock 73 x 48 popup)
        clr.l   -(%sp)                  | color 0: clear
        move.l  %d2,%d0
        addq.l  #4,%d0
        move.l  %d0,-(%sp)              | y1
        pea     20                      | x1
        move.l  %d2,%d0
        subq.l  #1,%d0
        move.l  %d0,-(%sp)              | y0
        pea     3                       | x0
        move.l  %a2,-(%sp)
        jsr     BOX
        lea     24(%sp),%sp
        moveq   #1,%d1
        move.l  %d1,SCRDIRTY            | the screen redraws after this UI pass
        lea     pl_state+LM_TEXT,%a0
        tst.l   pl_state+LM_FUNC
        beq.s   1f
        lea     pl_state+LM_WTEXT,%a0
1:      move.l  %a0,-(%sp)
        pea     -1
        move.l  %d2,-(%sp)
        pea     3
        move.l  %a2,-(%sp)
        move.l  #FONT,-(%sp)
        jsr     TEXT
        lea     24(%sp),%sp
9:      movem.l (%sp),%d0-%d2/%a0-%a2
        lea     24(%sp),%sp
        rts

        .balign 4
pl_stats:
        .zero   32
pl_state:
        .zero   16
        .long   -1                      | LM_PERCENT
        .long   -1                      | LM_WORST
        .zero   12                      | LM_POLL, LM_POLLED, LM_FUNC
        .asciz  "--%"                   | LM_TEXT
        .zero   4
        .asciz  "W--"                   | LM_WTEXT
        .zero   4
pl_state_end:
