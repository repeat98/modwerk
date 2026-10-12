| tuner.s -- TUNER: a guitar-tuner readout of the current audio track.
|
| UP held + TEMPO opens a window (the TEMPO window's shape: 0x4005829c at
| class 5, so the two evict each other) that reads the current audio
| track's post-FX pre-fader audio and prints note, octave, cents and a
| needle. Three hooks, all detours from manifest.py:
|
|   tu_tempo  0x40059ef0  the TEMPO opener's first instruction: with UP
|                         held the tuner toggles and the stock window is
|                         never created; otherwise the stock opener runs.
|   tu_frame  0x4000d99a  frame_isr's tail (the instruction before USB
|                         AUDIO's site): while the window is open, the
|                         selected track's 16 frames of this block are
|                         summed to mono, (L + R) >> 1, and the top 16
|                         bits ring-buffered (4,096 samples, 93 ms).
|   tu_tick   0x40056c72  the UI task's loop head (before every
|                         queue_receive): every UPDATE_FRAMES blocks with
|                         the window open the ring is analysed and the
|                         window redrawn. Nothing runs when it is closed.
|
| THE DETECTOR (tu_analyse; a Python model of the same integer arithmetic
| was the reference while it was written): peak gate at -54 dBFS; the 4,096 samples scaled so the peak
| lies in [384, 768); an 8-tap boxcar decimates by 4 (11,025 Hz, 1,024
| samples); McLeod's normalised square difference n(t) = 2 r(t) / (m0 +
| m_t) for lags 1..368 (30 Hz) over W = 656 products, Q15; key maxima =
| the highest value of each positive lobe after the first negative
| crossing; the first lobe within 0.80 of the best wins (clarity >= 0.5 or
| no reading); parabolic interpolation; then the YIN difference d(t) = m0 +
| m_t - 2 r(t) at 44.1 kHz for seven lags around 4x the coarse lag over
| 2,048 products, its minimum interpolated. Period in Q8 samples -> octave
| by doubling into the C0..B0 band, note by the quarter-tone edges, cents
| by the nearest 2^(c/1200) (12-bit ratio). Plain `mulsw` / `divsl`: no
| EMAC, so no accumulator state to lose to a task switch (stock tasks set
| MACSR at 0x400987ea.. and the scheduler saves no EMAC registers).
|
| Every intermediate fits a signed long: r <= (m0 + m_t) / 2 <= 656 x
| 768^2 = 3.9e8 coarse; at full rate m0, m_t <= 2,048 x 768^2 = 1.2e9 and d
| is kept unsigned (< 2^32) and compared unsigned.

        .set    KROWS,     0x46100b18   | bytes: the panel's held keys, code = row*8 + bit
        .set    KUP,       0x33
        .set    TRACK,     0x80000000   | byte: the current audio track, 0..7
        .set    RB_BASE,   0x80003190   | the read-back arena (usbaudio.s)
        .set    RB_PREV,   0x800000e4   | long: the bank the producer reads
        .set    TEMPOWIN,  0x460d16a0   | long: the stock TEMPO window handle
        .set    SCRDIRTY,  0x46c7c72c   | long: screen refresh request
        .set    UIQUEUE,   0x460d1664
        .set    WCREATE,   0x4005829c   | (w, h, 0, 0, class, closed) -> handle
        .set    WFRAME,    0x40056f4c   | (handle): the window's frame
        .set    WDESTROY,  0x40055db4   | (&handle): destroy, SCRDIRTY, handle = 0
        .set    CLEAR,     0x40035624   | (surface): the interior cleared
        .set    FONT,      0x400ba876   | the small UI font, 6 px
        .set    BIGFONT,   0x400ba83a   | 8 px, 13 px advance
        .set    TEXT,      0x40012bd8   | (font, surf, x, y, limit, str)
        .set    TWIDTH,    0x40012f30   | (font, limit, str) -> pixels
        .set    RULE,      0x40011910   | (surf, x, y, x2, 1)
        .set    VLINE,     0x40011b94   | (surf, x, y0, y1, 1)
        .set    BOX,       0x40012254   | (surf, x1, y1, x2, y2, mode): 0 clear, 1 set, -1 invert
        .set    SPRINTF,   0x40013a08   | (buf, fmt, ...)
        .set    LPUSH,     0x40031494   | (layer)
        .set    LPOP,      0x4003146c   | (layer)
        .set    TEMPO_GO,  0x40059ef6   | the stock opener after its `tstl TEMPOWIN`
        .set    UI_GO,     0x40056c78   | the UI loop after its `pea UIQUEUE`
        .set    ISR_GO,    0x4000d9a0   | frame_isr's last instruction (USB AUDIO's site)

        .set    WINW,      96
        .set    WINH,      56
        .set    NRING,     4096
        .set    NLAG,      368          | 11025 / 368 = 30 Hz
        .set    W,         656          | 1024 - NLAG
        .set    W2,        2048
        .set    PK_LO,     384
        .set    PK_HI,     768
        .set    GATE,      64           | 16-bit units: -54 dBFS
        .set    KEEP,      26214        | 0.80 in Q15
        .set    CLARITY,   16384        | 0.50 in Q15
        .set    UPDATE_FRAMES, 400      | 145 ms: ~7 readings a second
        .set    LOWP,      355329       | B0's lower period edge, Q8 (the tables below)

        .text
        .globl  tu_tempo, tu_frame, tu_tick, tu_open, tu_close, tu_draw, tu_analyse

| ---- 0x40059ef0: the TEMPO opener. UP held -> the tuner instead. --------
tu_tempo:
        moveq   #0,%d0
        moveb   KROWS+(KUP>>3),%d0
        btst    #(KUP&7),%d0
        bne.s   1f
        tstl    TEMPOWIN               | the displaced instruction; its flags
        jmp     TEMPO_GO               | feed the stock `bne`
1:      tstl    tu_win
        bne.w   tu_close               | open: UP + TEMPO closes it
        bra.w   tu_open

| ---- 0x4000d99a: frame_isr's tail, every block. d0-d7/a0-a6 are restored
| from the stack at ISR_GO + 6, so everything is free here. ---------------
tu_frame:
        movel   %d1,0x80004800         | the displaced instruction
        tstl    tu_win
        beq.s   9f
        movel   RB_PREV,%d0
        lsll    #8,%d0
        lsll    #2,%d0                 | bank * 1024
        moveq   #0,%d1
        moveb   TRACK,%d1
        andil   #7,%d1
        lsll    #7,%d1                 | track * 128
        addl    %d1,%d0
        addil   #RB_BASE,%d0
        moveal  %d0,%a0                | a0 = this bank, this track, frame 0
        movel   tu_wr,%d2
        lea     tu_ring,%a1
        moveq   #16,%d3
1:      movel   %a0@+,%d0              | L, 24 bits left-justified
        movel   %a0@+,%d1              | R
        asrl    #1,%d0
        asrl    #1,%d1
        addl    %d1,%d0                | (L + R) >> 1, no overflow
        swap    %d0                    | the top 16 bits
        movew   %d0,%a1@(0,%d2:l:2)
        addql   #1,%d2
        andil   #NRING-1,%d2
        subql   #1,%d3
        bne.s   1b
        movel   %d2,tu_wr
        addql   #1,tu_frames
9:      jmp     ISR_GO

| ---- 0x40056c72: the UI task's loop head. d2-d7/a2-a6 hold the loop's
| constants: saved around the work. --------------------------------------
tu_tick:
        tstl    tu_win
        beq.s   9f
        movel   tu_frames,%d0
        cmpil   #UPDATE_FRAMES,%d0
        blt.s   9f
        clrl    tu_frames
        lea     %sp@(-44),%sp
        movem.l %d2-%d7/%a2-%a6,%sp@
        bsr.w   tu_analyse
        bsr.w   tu_draw
        movem.l %sp@,%d2-%d7/%a2-%a6
        lea     %sp@(44),%sp
9:      pea     UIQUEUE                | the displaced instruction
        jmp     UI_GO

| ---- open / close: the stock TEMPO opener's and close's shape ------------
tu_open:
        pea     tu_close               | the closed callback (eviction)
        pea     5                      | TEMPO's window class
        clrl    %sp@-
        clrl    %sp@-
        pea     WINH
        pea     WINW
        jsr     WCREATE
        lea     %sp@(24),%sp
        movel   %d0,tu_win
        beq.s   9f
        movel   %d0,%sp@-
        jsr     WFRAME
        addql   #4,%sp
        pea     TU_LAYER
        jsr     LPUSH
        addql   #4,%sp
        clrl    tu_valid               | "--" until the first reading
        clrl    tu_live
        clrl    tu_frames
        bra.w   tu_draw
9:      rts

tu_close:
        tstl    tu_win
        beq.s   9f
        pea     tu_win
        jsr     WDESTROY               | tu_win = 0, SCRDIRTY = 1
        addql   #4,%sp
        pea     TU_LAYER
        jsr     LPOP
        addql   #4,%sp
9:      rts

| ==== the detector ========================================================
| Clobbers d0-d7/a0-a6 (the caller saved them). Results in tu_note, tu_oct,
| tu_cents, tu_f10, tu_valid (ever), tu_live (this reading confident).
tu_analyse:
| -- A: snapshot the ring, oldest first, and the peak ----------------------
        movel   tu_wr,%d0              | the oldest sample's index
        lea     tu_ring,%a0
        lea     tu_x,%a1
        movel   #NRING,%d1
        moveq   #0,%d3                 | peak
1:      mvsw    %a0@(0,%d0:l:2),%d2
        movew   %d2,%a1@+
        tstl    %d2
        bpl.s   2f
        negl    %d2
2:      cmpl    %d3,%d2
        ble.s   3f
        movel   %d2,%d3
3:      addql   #1,%d0
        andil   #NRING-1,%d0
        subql   #1,%d1
        bne.s   1b
        cmpil   #GATE,%d3
        blt.w   nosig
| -- B: the peak into [PK_LO, PK_HI): d4 = left shift, d5 = right shift ---
        moveq   #0,%d4
        moveq   #0,%d5
4:      cmpil   #PK_HI,%d3
        blt.s   5f
        lsrl    #1,%d3
        addql   #1,%d5
        bra.s   4b
5:      cmpil   #PK_LO,%d3
        bge.s   6f
        lsll    #1,%d3
        addql   #1,%d4
        bra.s   5b
6:      lea     tu_x,%a1
        movel   #NRING,%d1
7:      mvsw    %a1@,%d0
        lsll    %d4,%d0
        asrl    %d5,%d0
        movew   %d0,%a1@+
        subql   #1,%d1
        bne.s   7b
| -- C: decimate by 4 with an 8-tap boxcar: y[j] = sum(x[4j..4j+7]) >> 3 --
        lea     tu_x,%a0
        lea     tu_y,%a1
        movel   #1022,%d1
1:      mvsw    %a0@,%d0
        mvsw    %a0@(2),%d2
        addl    %d2,%d0
        mvsw    %a0@(4),%d2
        addl    %d2,%d0
        mvsw    %a0@(6),%d2
        addl    %d2,%d0
        mvsw    %a0@(8),%d2
        addl    %d2,%d0
        mvsw    %a0@(10),%d2
        addl    %d2,%d0
        mvsw    %a0@(12),%d2
        addl    %d2,%d0
        mvsw    %a0@(14),%d2
        addl    %d2,%d0
        asrl    #3,%d0
        movew   %d0,%a1@+
        addql   #8,%a0
        subql   #1,%d1
        bne.s   1b
        clrl    %a1@                   | y[1022], y[1023]
| -- D: NSDF n(t), t = 1..NLAG, Q15 words in tu_n[t] ----------------------
| d6 = m0 = sum y[0..W-1]^2, d7 = m_t = sum y[t..t+W-1]^2 (slid per lag)
        lea     tu_y,%a0
        moveq   #0,%d6
        movel   #W,%d1
1:      movew   %a0@+,%d0
        mulsw   %d0,%d0
        addl    %d0,%d6
        subql   #1,%d1
        bne.s   1b
        lea     tu_y+2,%a0             | m_1
        moveq   #0,%d7
        movel   #W,%d1
2:      movew   %a0@+,%d0
        mulsw   %d0,%d0
        addl    %d0,%d7
        subql   #1,%d1
        bne.s   2b
        moveq   #1,%d5                 | d5 = t
        lea     tu_n+2,%a3             | &n[1]
        clrw    tu_n                   | n[0] unused
lagloop:
        lea     tu_y,%a0
        movel   %d5,%d0
        addl    %d0,%d0
        lea     tu_y,%a1
        addal   %d0,%a1                | a1 = &y[t]
        moveq   #0,%d2                 | r
        movel   #W/8,%d1
3:      .rept   8
        movew   %a0@+,%d0
        mulsw   %a1@+,%d0
        addl    %d0,%d2
        .endr
        subql   #1,%d1
        bne.s   3b
| m = m0 + m_t; s = max(0, bits(m) - 16); n = (r scaled) / (m >> s)
        movel   %d6,%d3
        addl    %d7,%d3                | m
        moveq   #0,%d4                 | s
        movel   %d3,%d0
4:      cmpil   #0x10000,%d0
        blt.s   5f
        lsrl    #1,%d0
        addql   #1,%d4
        bra.s   4b
5:      tstl    %d0                    | md = m >> s
        beq.s   7f                     | (silence: n = 0)
        moveq   #16,%d1
        subl    %d4,%d1                | 16 - s
        bmi.s   6f
        lsll    %d1,%d2                | r << (16 - s)
        bra.s   8f
6:      negl    %d1
        asrl    %d1,%d2                | r >> (s - 16)
8:      divsl   %d0,%d2                | n = 2r / m in Q15 (signed, truncating)
        cmpil   #32767,%d2
        ble.s   7f
        movel   #32767,%d2
7:      movew   %d2,%a3@+
| slide m_t: m_{t+1} = m_t - y[t]^2 + y[t+W]^2
        movel   %d5,%d0
        addl    %d0,%d0
        lea     tu_y,%a0
        addal   %d0,%a0
        movew   %a0@,%d0
        mulsw   %d0,%d0
        subl    %d0,%d7
        movew   %a0@(2*W),%d0
        mulsw   %d0,%d0
        addl    %d0,%d7
        addql   #1,%d5
        cmpil   #NLAG,%d5
        ble.w   lagloop
        clrw    %a3@                   | n[NLAG+1] = 0
| -- E: lobes. One pass records (lag, max) of every positive lobe after the
| first negative crossing (a lobe open at lag 1 is lag 0's); then the best,
| then the first lobe within KEEP of it. ----------------------------------
        lea     tu_n+2,%a0             | &n[1]
        lea     tu_lobes,%a1
        moveq   #0,%d1                 | lobes recorded
        moveq   #0,%d2                 | in a lobe
        mvsw    %a0@,%d0
        sle     %d3                    | d3 = 0xff: no lobe to skip
        moveq   #1,%d5                 | t
        moveq   #0,%d6                 | lobe max
        moveq   #0,%d7                 | its lag
1:      mvsw    %a0@+,%d0
        ble.s   3f
        tstl    %d2
        bne.s   2f
        moveq   #1,%d2                 | a lobe opens
        movel   %d0,%d6
        movel   %d5,%d7
        bra.s   5f
2:      cmpl    %d6,%d0
        ble.s   5f
        movel   %d0,%d6
        movel   %d5,%d7
        bra.s   5f
3:      tstl    %d2
        beq.s   5f
        moveq   #0,%d2                 | a lobe closes
        tstb    %d3
        bne.s   4f
        st      %d3                    | the first one, lag 0's: dropped
        bra.s   5f
4:      cmpil   #64,%d1
        bge.s   5f
        movew   %d7,%a1@+
        movew   %d6,%a1@+
        addql   #1,%d1
5:      addql   #1,%d5
        cmpil   #NLAG,%d5
        ble.s   1b
        tstl    %d2                    | a lobe still open at NLAG
        beq.s   6f
        tstb    %d3
        beq.s   6f
        cmpil   #64,%d1
        bge.s   6f
        movew   %d7,%a1@+
        movew   %d6,%a1@+
        addql   #1,%d1
6:      tstl    %d1
        beq.w   nosig
        lea     tu_lobes,%a1
        movel   %d1,%d0
        moveq   #0,%d6                 | best
7:      mvsw    %a1@(2),%d2
        cmpl    %d6,%d2
        ble.s   8f
        movel   %d2,%d6
8:      addql   #4,%a1
        subql   #1,%d0
        bne.s   7b
        cmpil   #CLARITY,%d6
        blt.w   nosig
        movel   %d6,%d0
        movel   #KEEP,%d1
        mulsl   %d1,%d0
        asrl    #8,%d0
        asrl    #7,%d0                 | thr = best * 0.80
        lea     tu_lobes,%a1
9:      mvsw    %a1@(2),%d2
        cmpl    %d0,%d2
        bge.s   10f
        addql   #4,%a1
        bra.s   9b
10:     mvsw    %a1@,%d5               | d5 = tc
| -- F: parabolic on n around tc: tcf = tc*256 + 128*(nm - np)/(nm - 2n0 + np)
        lea     tu_n,%a0
        movel   %d5,%d0
        addl    %d0,%d0
        addal   %d0,%a0                | &n[tc]
        mvsw    %a0@(-2),%d2           | nm
        mvsw    %a0@,%d3               | n0
        mvsw    %a0@(2),%d4            | np
        movel   %d2,%d0
        subl    %d4,%d0                | nm - np
        lsll    #7,%d0                 | * 128
        movel   %d2,%d1
        addl    %d4,%d1
        subl    %d3,%d1
        subl    %d3,%d1                | den = nm - 2 n0 + np (< 0 at a peak)
        bge.s   1f                     | flat or not a peak: no correction
        divsl   %d1,%d0
        bra.s   2f
1:      moveq   #0,%d0
2:      movel   %d5,%d1
        lsll    #8,%d1
        addl    %d0,%d1                | tcf, Q8 coarse samples
| -- G: refine at 44.1 kHz: d(t) = m0 + m_t - 2 r(t) over W2 at t0-3..t0+3
        lsll    #2,%d1
        addil   #128,%d1
        asrl    #8,%d1                 | t0 = round(4 * tcf)
        moveq   #4,%d0
        cmpl    %d0,%d1
        bge.s   3f
        movel   %d0,%d1
3:      movel   %d1,tu_t0
        subql   #3,%d1
        movel   %d1,%d5                | d5 = t, the first lag
        lea     tu_x,%a0
        moveq   #0,%d6                 | m0
        movel   #W2,%d1
4:      movew   %a0@+,%d0
        mulsw   %d0,%d0
        addl    %d0,%d6
        subql   #1,%d1
        bne.s   4b
        lea     tu_x,%a0
        movel   %d5,%d0
        addl    %d0,%d0
        addal   %d0,%a0                | &x[t]
        moveq   #0,%d7                 | m_t
        movel   #W2,%d1
5:      movew   %a0@+,%d0
        mulsw   %d0,%d0
        addl    %d0,%d7
        subql   #1,%d1
        bne.s   5b
        lea     tu_d,%a3
        moveq   #7,%d4                 | seven lags
reflag: lea     tu_x,%a0
        movel   %d5,%d0
        addl    %d0,%d0
        lea     tu_x,%a1
        addal   %d0,%a1                | &x[t]
        moveq   #0,%d2                 | r
        movel   #W2/8,%d1
6:      .rept   8
        movew   %a0@+,%d0
        mulsw   %a1@+,%d0
        addl    %d0,%d2
        .endr
        subql   #1,%d1
        bne.s   6b
        movel   %d6,%d0
        addl    %d7,%d0
        subl    %d2,%d0
        subl    %d2,%d0                | d = m0 + m_t - 2r, unsigned
        movel   %d0,%a3@+
| slide m_t to t + 1: - x[t]^2 + x[t + W2]^2
        movel   %d5,%d0
        addl    %d0,%d0
        lea     tu_x,%a0
        addal   %d0,%a0
        movew   %a0@,%d0
        mulsw   %d0,%d0
        subl    %d0,%d7
        movew   %a0@(2*W2),%d0
        mulsw   %d0,%d0
        addl    %d0,%d7
        addql   #1,%d5
        subql   #1,%d4
        bne.w   reflag
| the minimum of d[0..6], unsigned
        lea     tu_d,%a3
        moveq   #0,%d4                 | k
        moveq   #0,%d5                 | argmin
        movel   %a3@,%d6               | min
7:      addql   #1,%d4
        cmpil   #7,%d4
        bge.s   8f
        movel   %a3@(0,%d4:l:4),%d0
        cmpl    %d6,%d0
        bcc.s   7b
        movel   %d0,%d6
        movel   %d4,%d5
        bra.s   7b
8:      movel   tu_t0,%d1
        subql   #3,%d1
        addl    %d5,%d1                | tf = t0 - 3 + k
        lsll    #8,%d1                 | tff = tf * 256 (+ d8 below)
        tstl    %d5
        beq.s   12f                    | at an end: no interpolation
        cmpil   #6,%d5
        beq.s   12f
        movel   %a3@(-4,%d5:l:4),%d2   | dm
        movel   %a3@(0,%d5:l:4),%d3    | d0
        movel   %a3@(4,%d5:l:4),%d4    | dp
9:      movel   %d2,%d0
        orl     %d3,%d0
        orl     %d4,%d0
        cmpil   #0x1000000,%d0         | all below 2^24: the differences x128 fit
        bcs.s   10f
        lsrl    #4,%d2
        lsrl    #4,%d3
        lsrl    #4,%d4
        bra.s   9b
10:     movel   %d2,%d0
        subl    %d4,%d0                | dm - dp
        lsll    #7,%d0
        movel   %d2,%d7
        addl    %d4,%d7
        subl    %d3,%d7
        subl    %d3,%d7                | den = dm - 2 d0 + dp (> 0 at a minimum)
        ble.s   12f
        divsl   %d7,%d0
        cmpil   #128,%d0
        ble.s   11f
        moveq   #127,%d0
11:     cmpil   #-128,%d0
        bge.s   13f
        moveq   #-127,%d0
13:     addl    %d0,%d1
12:     movel   %d1,tu_tff             | the period, Q8 samples at 44100
| -- H: frequency x10 = 44100 * 2560 / tff ---------------------------------
        movel   #112896000,%d0
        divul   %d1,%d0
        movel   %d0,tu_f10
| -- I: octave by doubling into [LOWP, 2 LOWP), note by the edges, cents --
        moveq   #0,%d2                 | octave
1:      cmpil   #LOWP,%d1
        bge.s   2f
        addl    %d1,%d1
        addql   #1,%d2
        bra.s   1b
2:      movel   %d2,tu_oct
        lea     BOUND,%a0
        moveq   #0,%d3                 | note
3:      cmpl    %a0@(0,%d3:l:4),%d1
        bhi.s   4f
        addql   #1,%d3
        cmpil   #11,%d3
        blt.s   3b
4:      movel   %d3,tu_note
        lea     P0,%a0
        movel   %a0@(0,%d3:l:4),%d0
        lsll    #8,%d0
        lsll    #3,%d0                 | P0[note] << 11
        movel   %d1,%d4
        lsrl    #1,%d4
        divul   %d4,%d0                | q = (P0 << 12) / t, ~[3979, 4216]
        lea     CENTS,%a0
        moveq   #0,%d3                 | c
        movel   #0x7fffffff,%d5        | best distance
        moveq   #0,%d6                 | its c
5:      mvzw    %a0@(0,%d3:l:2),%d1
        subl    %d0,%d1
        bpl.s   6f
        negl    %d1
6:      cmpl    %d5,%d1
        bge.s   7f
        movel   %d1,%d5
        movel   %d3,%d6
7:      addql   #1,%d3
        cmpil   #101,%d3
        blt.s   5b
        subil   #50,%d6
        movel   %d6,tu_cents
        moveq   #1,%d0
        movel   %d0,tu_valid
        movel   %d0,tu_live
        rts
nosig:  clrl    tu_live                | hold the last reading
        rts

| ==== the window ==========================================================
| text: d0 = x, d1 = y (bottom row), a0 = str, on a5; clobbers d0/d1/a0/a1
text:   movel   %a0,%sp@-
        pea     -1
        movel   %d1,%sp@-
        movel   %d0,%sp@-
        movel   %a5,%sp@-
        pea     FONT
        jsr     TEXT
        lea     %sp@(24),%sp
        rts
| ctext: a6@ (the buffer) centred at x = d0, row d1, font a1
ctext:  movel   %d0,%a6@(32)
        movel   %d1,%a6@(36)
        movel   %a1,%a6@(40)
        pea     %a6@
        pea     -1
        movel   %a1,%sp@-
        jsr     TWIDTH
        lea     %sp@(12),%sp
        lsrl    #1,%d0
        movel   %a6@(32),%d1
        subl    %d0,%d1
        movel   %d1,%d0                | x = centre - width / 2
        pea     %a6@
        pea     -1
        movel   %a6@(36),%sp@-
        movel   %d0,%sp@-
        movel   %a5,%sp@-
        movel   %a6@(40),%sp@-
        jsr     TEXT
        lea     %sp@(24),%sp
        rts
| rtext: a6@ right-aligned at x = d0, row d1, small font
rtext:  movel   %d0,%a6@(32)
        movel   %d1,%a6@(36)
        pea     %a6@
        pea     -1
        pea     FONT
        jsr     TWIDTH
        lea     %sp@(12),%sp
        movel   %a6@(32),%d1
        subl    %d0,%d1
        movel   %d1,%d0
        movel   %a6@(36),%d1
        lea     %a6@,%a0
        bra.w   text
| vline: x = d0, y0 = d1, y1 = d2
vline:  pea     1
        movel   %d2,%sp@-
        movel   %d1,%sp@-
        movel   %d0,%sp@-
        movel   %a5,%sp@-
        jsr     VLINE
        lea     %sp@(20),%sp
        rts

        .set    SCALEY,   18           | the cents scale's row
        .set    SCALEX0,  8            | -50 cents
        .set    SCALEX1,  WINW-8       | +50 cents

| tu_draw: the whole window. Locals at a6 (48 B): 0..31 buf, 32/36/40 parked.
tu_draw:
        lea     %sp@(-92),%sp
        movem.l %d2-%d7/%a2-%a6,%sp@
        lea     %sp@(44),%a6
        movel   tu_win,%d0
        beq.w   dexit
        moveal  %d0,%a5
        lea     %a5@(36),%a5           | a5 = the window's surface {w, h, ...}
        movel   %a5,%sp@-
        jsr     CLEAR
        addql   #4,%sp
        movel   %a5@(4),%d7
        subil   #14,%d7                | d7 = h - 14: the header row
| header: TUNER, HOLD when holding, the track at the right; the rule
        moveq   #4,%d0
        movel   %d7,%d1
        addql   #2,%d1
        lea     T_TUNER,%a0
        bsr.w   text
        tstl    tu_valid
        beq.s   1f
        tstl    tu_live
        bne.s   1f
        moveq   #WINW/2,%d0
        movel   %d7,%d1
        addql   #2,%d1
        lea     T_HOLD,%a0
        bsr.w   text
1:      moveq   #0,%d0
        moveb   TRACK,%d0
        andil   #7,%d0
        addql   #1,%d0
        movel   %d0,%sp@-
        pea     TRKFMT
        pea     %a6@
        jsr     SPRINTF
        lea     %sp@(12),%sp
        moveq   #WINW-5,%d0
        movel   %d7,%d1
        addql   #2,%d1
        bsr.w   rtext
        pea     1
        pea     WINW-6
        movel   %d7,%d0
        subql   #1,%d0
        movel   %d0,%sp@-
        pea     4
        movel   %a5,%sp@-
        jsr     RULE
        lea     %sp@(20),%sp
| the scale: a rule with ticks at -50, -25, 0, +25, +50 cents
        pea     1
        pea     SCALEX1
        pea     SCALEY
        pea     SCALEX0
        movel   %a5,%sp@-
        jsr     RULE
        lea     %sp@(20),%sp
        moveq   #SCALEX0,%d0
        moveq   #SCALEY-2,%d1
        moveq   #SCALEY+2,%d2
        bsr.w   vline
        moveq   #(SCALEX0+SCALEX1)/2,%d0
        moveq   #SCALEY-4,%d1
        moveq   #SCALEY+4,%d2
        bsr.w   vline
        moveq   #SCALEX1,%d0
        moveq   #SCALEY-2,%d1
        moveq   #SCALEY+2,%d2
        bsr.w   vline
        moveq   #(3*SCALEX0+SCALEX1)/4,%d0
        moveq   #SCALEY-1,%d1
        moveq   #SCALEY+1,%d2
        bsr.w   vline
        moveq   #(SCALEX0+3*SCALEX1)/4,%d0
        moveq   #SCALEY-1,%d1
        moveq   #SCALEY+1,%d2
        bsr.w   vline
        tstl    tu_valid
        bne.s   2f
| no reading yet: "--" centred by its width, exactly where the note name sits
        movew   #0x2d2d,%a6@           | "--\0" in the buffer
        clrb    %a6@(2)
        moveq   #WINW/2,%d0
        moveq   #SCALEY+8,%d1
        lea     BIGFONT,%a1
        bsr.w   ctext
        bra.w   ddone
| the note name and octave, big, above the scale
2:      movel   tu_oct,%sp@-
        movel   tu_note,%d0
        lea     NAMES,%a0
        movel   %a0@(0,%d0:l:4),%sp@-
        pea     NOTEFMT
        pea     %a6@
        jsr     SPRINTF
        lea     %sp@(16),%sp
        moveq   #WINW/2,%d0
        moveq   #SCALEY+8,%d1
        lea     BIGFONT,%a1
        bsr.w   ctext
| the needle: a 3-px box on the scale at the cents position
        movel   tu_cents,%d0
        addil   #50,%d0
        moveq   #SCALEX1-SCALEX0,%d1
        mulsl   %d1,%d0
        moveq   #100,%d1
        divul   %d1,%d0
        addil   #SCALEX0,%d0           | x
        pea     1
        pea     SCALEY+5
        movel   %d0,%d1
        addql   #1,%d1
        movel   %d1,%sp@-
        pea     SCALEY-5
        subql   #1,%d0
        movel   %d0,%sp@-
        movel   %a5,%sp@-
        jsr     BOX
        lea     %sp@(24),%sp
| the bottom row: cents at the left, Hz at the right
        movel   tu_cents,%d0
        movel   %d0,%sp@-
        lea     CENTSP,%a0
        tstl    %d0
        bge.s   3f
        negl    %d0
        movel   %d0,%sp@
        lea     CENTSN,%a0
3:      movel   %a0,%sp@-
        pea     %a6@
        jsr     SPRINTF
        lea     %sp@(12),%sp
        moveq   #4,%d0
        moveq   #5,%d1
        lea     %a6@,%a0
        bsr.w   text
        movel   tu_f10,%d0
        movel   %d0,%d1
        moveq   #10,%d2
        divul   %d2,%d0
        movel   %d0,%d2
        moveq   #10,%d3
        mulsl   %d3,%d2
        subl    %d2,%d1                | tenths
        movel   %d1,%sp@-
        movel   %d0,%sp@-
        pea     HZFMT
        pea     %a6@
        jsr     SPRINTF
        lea     %sp@(16),%sp
        moveq   #WINW-5,%d0
        moveq   #5,%d1
        bsr.w   rtext
ddone:  moveq   #1,%d0
        movel   %d0,SCRDIRTY
dexit:  movem.l %sp@,%d2-%d7/%a2-%a6
        lea     %sp@(92),%sp
        rts

| ---- data ---------------------------------------------------------------
T_TUNER: .asciz "TUNER"
T_HOLD:  .asciz "HOLD"
TRKFMT:  .asciz "T%d"
NOTEFMT: .asciz "%s%d"
CENTSP:  .asciz "+%dc"
CENTSN:  .asciz "-%dc"
HZFMT:   .asciz "%d.%dHz"
N_C:     .asciz "C"
N_CS:    .asciz "C#"
N_D:     .asciz "D"
N_DS:    .asciz "D#"
N_E:     .asciz "E"
N_F:     .asciz "F"
N_FS:    .asciz "F#"
N_G:     .asciz "G"
N_GS:    .asciz "G#"
N_A:     .asciz "A"
N_AS:    .asciz "A#"
N_B:     .asciz "B"
        .balign 4
NAMES:  .long   N_C, N_CS, N_D, N_DS, N_E, N_F, N_FS, N_G, N_GS, N_A, N_AS, N_B
| periods of C0..B0 in Q8 samples at 44,100 Hz (C0 = 16.3516 Hz), and each
| note's lower edge, a quarter tone down (P0 * 2^(-1/24)); LOWP = BOUND[11]
P0:     .long   690428, 651677, 615101, 580578, 547993, 517236, 488206, 460805, 434942, 410531, 387490, 365741
BOUND:  .long   670773, 633125, 597590, 564050, 532393, 502511, 474308, 447687, 422560, 398844, 376459, 355329
| round(4096 * 2^((c - 50) / 1200)), c = 0..100
CENTS:  .word   3979, 3982, 3984, 3986, 3989, 3991, 3993, 3996, 3998, 4000, 4002, 4005
        .word   4007, 4009, 4012, 4014, 4016, 4019, 4021, 4023, 4026, 4028, 4030, 4033
        .word   4035, 4037, 4040, 4042, 4044, 4047, 4049, 4051, 4054, 4056, 4058, 4061
        .word   4063, 4065, 4068, 4070, 4072, 4075, 4077, 4079, 4082, 4084, 4087, 4089
        .word   4091, 4094, 4096, 4098, 4101, 4103, 4105, 4108, 4110, 4113, 4115, 4117
        .word   4120, 4122, 4124, 4127, 4129, 4132, 4134, 4136, 4139, 4141, 4144, 4146
        .word   4148, 4151, 4153, 4156, 4158, 4160, 4163, 4165, 4168, 4170, 4172, 4175
        .word   4177, 4180, 4182, 4184, 4187, 4189, 4192, 4194, 4197, 4199, 4201, 4204
        .word   4206, 4209, 4211, 4214, 4216
        .balign 4
| An input layer as the stock ones: {0, keys, encoders, 0, 0, -1, -1}.
| TEMPO / YES / NO close (the stock TEMPO window's keys); UP and DOWN are
| swallowed (UP is half of the chord); everything else falls through.
TU_LAYER:
        .long   0, TU_KEYS, TU_ENCS, 0, 0, -1, -1
TU_KEYS:
        .byte   0x18, 0
        .long   tu_close, 0, 0, 0, 0
        .word   0, 0
        .byte   0x31, 0
        .long   tu_close, 0, 0, 0, 0
        .word   0, 0
        .byte   0x32, 0
        .long   tu_close, 0, 0, 0, 0
        .word   0, 0
        .byte   0x33, 0
        .long   0, 0, 0, 0, 0
        .word   0, 0
        .byte   0x20, 0
        .long   0, 0, 0, 0, 0
        .word   0, 0
        .byte   0xff, 0
        .long   0, 0, 0, 0, 0
        .word   0, 0
TU_ENCS:
        .byte   0xff, 0
        .long   0, 0, 0, 0, 0

        .data
        .balign 4
        .globl  tu_win, tu_wr, tu_frames, tu_note, tu_oct, tu_cents, tu_f10, tu_valid, tu_live, tu_tff, tu_ring
tu_win:    .long 0                     | the window handle, 0 = closed
tu_wr:     .long 0                     | the ring's write index
tu_frames: .long 0                     | blocks since the last analysis
tu_note:   .long 0                     | 0 = C .. 11 = B
tu_oct:    .long 0                     | A4 = 440 Hz is note 9, octave 4
tu_cents:  .long 0                     | -50..50
tu_f10:    .long 0                     | Hz x 10
tu_valid:  .long 0                     | a reading was ever made since open
tu_live:   .long 0                     | the last analysis was confident
tu_tff:    .long 0                     | the period, Q8 samples (diagnostics)
tu_t0:     .long 0
tu_ring:   .space NRING*2              | 16-bit mono, written by the frame ISR
tu_x:      .space NRING*2              | the snapshot, normalised
tu_y:      .space 1024*2               | decimated by 4
tu_n:      .space (NLAG+2)*2           | NSDF, Q15
tu_lobes:  .space 64*4                 | (lag, max) per positive lobe
tu_d:      .space 7*4                  | the YIN difference at the seven lags
