| SPDX-License-Identifier: GPL-3.0-or-later
| Pipo Loop: the audio interrupt's hook and LOP's PIPO text.
|
| The audio interrupt calls the sample prefetch for voice 0 once a block,
| after the effective parameters (locks, scenes, LFO) are complete and
| before any voice reads STA, END and LOP. The site is that `jsr`; the gate
| runs pipo_loop_audio and then tail-jumps to the stock routine with the
| stack as the caller left it (return address and its two arguments), so the
| stock routine returns straight to the interrupt. d0-d1/a0-a1 are free
| across a call; the C handler keeps the rest.

        .text
        .globl  pipo_loop_gate
        .extern pipo_loop_audio

pipo_loop_gate:
        jsr     pipo_loop_audio
        jmp     pipo_loop_prefetch

| Stock's OFF/ON text formatter, text(ctx, value 8.8, buf), shared by eight
| OFF/ON parameters; ctx is the parameter's record + 20. The site replaces
| its first two instructions, which take value's integer part into d0; the
| gate does the same, prints PIPO for 2 on LOP's record only (MIDI CC can put
| 2 in the others, which stay ON) and otherwise resumes stock, which reloads
| d1 itself. PIPO goes through stock's own sprintf(buf, text) tail call, as
| OFF and ON do.

        .globl  pipo_loop_text_gate

pipo_loop_text_gate:
        move.l  8(%sp),%d0                      | displaced
        asr.l   #8,%d0                          | displaced
        moveq   #2,%d1
        cmp.l   %d1,%d0
        bne.s   2f
        lea     pipo_loop_lop_ctx,%a0
        cmpa.l  4(%sp),%a0
        beq.s   1f
2:      jmp     pipo_loop_text_resume
1:      move.l  12(%sp),4(%sp)                  | buf
        lea     pipo_loop_pipo,%a0              | the text (ColdFire: no #imm32 to d16(An))
        move.l  %a0,8(%sp)
        jmp     pipo_loop_sprintf

| Stock's OFF/ON switch icon, icon(ctx, value 8.8, ...), draws frame 0 or 1
| of a two-frame switch; BD CLASSIC's WAV (0..2) is drawn by the same routine
| with a three-frame switch. For LOP's record only (ctx is its record + 36),
| the gate tail-jumps to WAV's routine with the arguments untouched, so LOP's
| OFF, ON and PIPO show as stock's three-position switch. Every other OFF/ON
| switch replays the displaced load of its frame list and resumes stock, and
| so does LOP above 2 (MIDI CC 30 can set it; it plays as ON).

        .globl  pipo_loop_icon_gate

pipo_loop_icon_gate:
        lea     pipo_loop_icon_ctx,%a0
        cmpa.l  4(%sp),%a0
        bne.s   1f
        move.l  8(%sp),%d0                      | above PIPO (MIDI CC 30 is unclamped) plays
        asr.l   #8,%d0                          | as ON: stock's switch, as ON draws
        moveq   #2,%d1
        cmp.l   %d1,%d0
        bhi.s   1f
        jmp     pipo_loop_icon3
1:      movea.l pipo_loop_icon_frames,%a0       | displaced
        jmp     pipo_loop_icon_resume

| How a FUNC turn on STA or END feels. Stock's encoder handler copies the
| parameter's encoder profile into a buffer (d4) and takes two count factors
| from its record (a5, d6), then its engine (0x4006efca, 0x4006f1fa) turns
| the counts into a delta. The site replaces the first three pushes of that
| call, where both of the handler's paths meet; for STA and END (d2) with FUNC
| held, pipo_loop_profile puts LOP's profile in the buffer and the gate takes
| LOP's factors, so the turn steps as LOP's switch does.

        .globl  pipo_loop_prof_gate
        .extern pipo_loop_profile

pipo_loop_prof_gate:
        cmpi.l  #43,%d2                         | STA
        beq.s   1f
        cmpi.l  #44,%d2                         | END
        bne.s   9f
1:      move.l  %d4,-(%sp)                      | the profile buffer
        jsr     pipo_loop_profile
        addq.l  #4,%sp
        tst.l   %d0
        beq.s   9f
        movea.l pipo_loop_lop_rec+4,%a5         | LOP's count factors
        move.l  pipo_loop_lop_rec+8,%d6
9:      move.l  %d6,-(%sp)                      | displaced
        move.l  %a5,-(%sp)                      | displaced
        move.l  %d5,-(%sp)                      | displaced
        jmp     pipo_loop_prof_resume

| S and E labels (marks.c). The site is the last two instructions of stock's
| waveform widget draw routine before it restores its registers: d2 the
| bitmap, a2 the widget. The gate draws the labels over everything the
| routine drew and replays them.

        .globl  pipo_loop_marks_gate
        .extern pipo_loop_marks

pipo_loop_marks_gate:
        move.l  %a2,-(%sp)
        move.l  %d2,-(%sp)
        jsr     pipo_loop_marks
        addq.l  #8,%sp
        clr.b   %d0                             | displaced
        move.b  %d0,49(%a2)                     | displaced
        jmp     pipo_loop_marks_resume

| Zero snap: FUNC + turn on the SAMPLE page's STA or END. Stock's encoder
| handler ends by calling the view's apply-delta with FUNC held, which steps
| STA and END by whole numbers. The site replaces the first two instructions
| of that call's setup (d6 = FUNC held, d2 the id, d4 the delta, a2 the view,
| a0 the view's vtable). For STA and END with FUNC held, pipo_loop_snap gives
| the delta to the next zero crossing the way the turn went; the call then
| goes out as an ordinary fine turn of that size, so stock's own path clamps,
| draws and stores it. With no crossing that way it returns 0 and the point
| holds. Stock's d0-d1/a1 are put back for the rest of the handler.

        .equ    SNAP_NONE, 0x7fffffff
        .globl  pipo_loop_func_gate
        .extern pipo_loop_snap

pipo_loop_func_gate:
        mvz.b   %d6,%d6                         | displaced
        tst.l   %d6
        beq.s   9f
        cmpi.l  #43,%d2                         | STA
        beq.s   1f
        cmpi.l  #44,%d2                         | END
        bne.s   9f
1:      lea     -12(%sp),%sp                    | stock's d0-d1/a1 come back as they were
        movem.l %d0-%d1/%a1,(%sp)
        clr.l   -(%sp)                          | not a lock
        move.l  %d4,-(%sp)
        move.l  %d2,-(%sp)
        move.l  %a2,-(%sp)
        jsr     pipo_loop_snap
        lea     16(%sp),%sp
        cmp.l   #SNAP_NONE,%d0
        beq.s   2f
        move.l  %d0,%d4                         | the step to the crossing
        moveq   #0,%d6                          | applied as a fine turn
2:      movem.l (%sp),%d0-%d1/%a1
        lea     12(%sp),%sp
        movea.l (%a2),%a0                       | the view's vtable, as stock had it
9:      pea     -34(%fp)                        | displaced
        jmp     pipo_loop_func_resume

| The same with a trig held: stock edits the trig's lock through the view's
| lock call, view->vt[124](view, id, delta), with no FUNC argument (FUNC
| makes no difference there). The site replaces the three pushes of its
| arguments; d6's low byte is FUNC held, set earlier in the handler, d2 the
| id, d4 the delta, a2 the view, a0 its vtable. Where the view has a lock
| editor, the delta for STA and END with FUNC held becomes the step to the
| next crossing from the lock's value; without one stock edits each held
| trig in turn and pipo_loop_trig_gate takes it there.

        .globl  pipo_loop_lock_gate

pipo_loop_lock_gate:
        tst.b   %d6
        beq.s   9f
        cmpi.l  #43,%d2                         | STA
        beq.s   1f
        cmpi.l  #44,%d2                         | END
        bne.s   9f
1:      lea     -12(%sp),%sp                    | stock's d0-d1/a1 come back as they were
        movem.l %d0-%d1/%a1,(%sp)
        pea     1                               | a lock
        move.l  %d4,-(%sp)
        move.l  %d2,-(%sp)
        move.l  %a2,-(%sp)
        jsr     pipo_loop_snap
        lea     16(%sp),%sp
        cmp.l   #SNAP_NONE,%d0
        beq.s   2f
        move.l  %d0,%d4
2:      movem.l (%sp),%d0-%d1/%a1
        lea     12(%sp),%sp
        movea.l (%a2),%a0                       | the view's vtable, as stock had it
9:      move.l  %d4,-(%sp)                      | displaced
        move.l  %d2,-(%sp)                      | displaced
        move.l  %a2,-(%sp)                      | displaced
        jmp     pipo_loop_lock_resume

| Stock's lock edit without a lock editor runs this for each held trig: a
| trig with a lock gets view->vt[120](view, trig, id, delta). The site
| replaces the setup of that call (d0 the delta, d2 the trig, a2 the edit's
| {view, id, delta}); pipo_loop_snap_trig gives the step from that trig's
| own lock to the next crossing, for STA and END with FUNC held.

        .globl  pipo_loop_trig_gate
        .extern pipo_loop_snap_trig

pipo_loop_trig_gate:
        lea     -8(%sp),%sp                     | stock's d0 (the delta) and d1
        movem.l %d0-%d1,(%sp)
        move.l  %d0,-(%sp)                      | delta
        move.l  4(%a2),-(%sp)                   | id
        move.l  %d2,-(%sp)                      | trig
        move.l  (%a2),-(%sp)                    | view
        jsr     pipo_loop_snap_trig
        lea     16(%sp),%sp
        cmp.l   #SNAP_NONE,%d0
        bne.s   1f
        move.l  (%sp),%d0                       | stock's delta, as it came
1:      move.l  4(%sp),%d1
        lea     8(%sp),%sp
        movea.l (%a2),%a0                       | displaced
        movea.l (%a0),%a1                       | displaced
        move.l  %d0,-(%sp)                      | displaced
        jmp     pipo_loop_trig_resume

| Exact turns (pipo_loop_mirror in pipo.c). Stock's prefetch sets up two DMA
| transfers per voice into its SRAM window: TCD1 (descriptor at
| PIPO_TCD1_AT) copies the segment after the loop's end (from the loop's
| start, wrap_al = WRAP_AL), TCD2 (PIPO_TCD2_AT) the main segment (from the
| window's start, WIN_AL); a wrap is in the window when TCD1's length
| (LEN1) is above 0. These gates sit where stock writes each transfer's
| source: for a voice in PIPO, pipo_loop_mirror gives a buffer of the loop's
| frames the other way round to copy instead. Voice 0's prefetch is its own
| routine; voices 1-7 share one, its loop counter (voice - 1) at 88(%sp).

        .equ    LEN1, 0x8000582c
        .equ    LEN2, 0x80005830
        .equ    WRAP_AL, 0x80005834
        .equ    WIN_AL, 0x80005838
        .equ    WIN_BASE, 0x80005864
        .globl  pipo_loop_v0w_gate, pipo_loop_v0m_gate, pipo_loop_vnw_gate, pipo_loop_vnm_gate
        .extern pipo_loop_mirror

| mirror(voice d0, which d1, len a0): -> d0 the buffer or 0
mirror: move.l  %a0,-(%sp)                      | len
        move.l  WRAP_AL,-(%sp)
        move.l  WIN_AL,-(%sp)
        move.l  %d1,-(%sp)
        move.l  %d0,-(%sp)
        jsr     pipo_loop_mirror
        lea     20(%sp),%sp
        rts

| voice 0, TCD1: a0 its source, a2 the descriptor, d1 LEN1, d3 its window
| index. Replaces `move.l %d3,%d0; add.l %d0,%d0; move.l %a0,(%a2)`.
pipo_loop_v0w_gate:
        tst.l   %d1
        ble.s   9f
        lea     -12(%sp),%sp
        movem.l %d1/%a0-%a1,(%sp)
        movea.l %d1,%a0
        moveq   #0,%d0
        moveq   #1,%d1
        bsr.w   mirror
        tst.l   %d0
        beq.s   1f
        move.l  %d0,4(%sp)                      | the source: the buffer
1:      movem.l (%sp),%d1/%a0-%a1
        lea     12(%sp),%sp
9:      move.l  %d3,%d0                         | displaced
        add.l   %d0,%d0                         | displaced
        move.l  %a0,(%a2)                       | displaced
        rts

| voice 0, TCD2: a1 its source, a0 the descriptor, d4 LEN2, d6 its
| destination. Replaces `moveq #1,%d0; move.l %a1,(%a0); move.l %d6,16(%a0)`.
pipo_loop_v0m_gate:
        tst.l   LEN1
        ble.s   9f
        lea     -12(%sp),%sp
        movem.l %d1/%a0-%a1,(%sp)
        movea.l %d4,%a0
        moveq   #0,%d0
        moveq   #2,%d1
        bsr.w   mirror
        tst.l   %d0
        beq.s   1f
        move.l  %d0,8(%sp)                      | the source: the buffer
1:      movem.l (%sp),%d1/%a0-%a1
        lea     12(%sp),%sp
9:      moveq   #1,%d0                          | displaced
        move.l  %a1,(%a0)                       | displaced
        move.l  %d6,16(%a0)                     | displaced
        rts

| voices 1-7, TCD1: a0 its source, a2 the descriptor, d0 its window index.
| Replaces `add.l %d0,%d0; move.l %a0,(%a2); add.l WIN_BASE,%d0`.
pipo_loop_vnw_gate:
        tst.l   LEN1
        ble.s   9f
        lea     -16(%sp),%sp
        movem.l %d0-%d1/%a0-%a1,(%sp)
        move.l  108(%sp),%d0                    | the loop counter (88 + return + saves)
        addq.l  #1,%d0
        movea.l LEN1,%a0
        moveq   #1,%d1
        bsr.w   mirror
        tst.l   %d0
        beq.s   1f
        move.l  %d0,8(%sp)
1:      movem.l (%sp),%d0-%d1/%a0-%a1
        lea     16(%sp),%sp
9:      add.l   %d0,%d0                         | displaced
        move.l  %a0,(%a2)                       | displaced
        add.l   WIN_BASE,%d0                    | displaced
        rts

| voices 1-7, TCD2: a1 its source, a0 the descriptor. Replaces
| `moveq #1,%d0; move.l %a1,(%a0); movea.l 60(%sp),%a1`.
pipo_loop_vnm_gate:
        tst.l   LEN1
        ble.s   9f
        lea     -12(%sp),%sp
        movem.l %d1/%a0-%a1,(%sp)
        move.l  104(%sp),%d0                    | the loop counter (88 + return + saves)
        addq.l  #1,%d0
        movea.l LEN2,%a0
        moveq   #2,%d1
        bsr.w   mirror
        tst.l   %d0
        beq.s   1f
        move.l  %d0,8(%sp)                      | the source: the buffer
1:      movem.l (%sp),%d1/%a0-%a1
        lea     12(%sp),%sp
9:      moveq   #1,%d0                          | displaced
        move.l  %a1,(%a0)                       | displaced
        movea.l 64(%sp),%a1                     | displaced (60 + return)
        rts

        .section .rodata
pipo_loop_pipo:
        .asciz  "PIPO"
