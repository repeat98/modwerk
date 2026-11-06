; Mixer Mode M0 hardware probes P1-P6, v2 (docs/dev/mixer-mode-m0.md), MS-70CDR 2.10 OS.
; Diagnostic build only, never released. Reads only: no flash write, and the
; audio path runs the same effect calls in the same order as stock.
;
; Audio side (one DSP audio block = 8 frames):
;   blk_start  stub 0x1181BF60 (the block's register save, its only caller):
;              TSCL at block start, period since the previous block start.
;   chain      replaces the stock slot loop (packet 0x1181BE00): the same
;              loop (B14+576 = slot, A4 = slot state, call 0xC00EE930[slot],
;              B14+576 = 6 after), plus TSCL around each effect call and an
;              XOR of the F (ctx[5]), Acc (ctx[6]) and Dry (ctx[4]) buffers
;              before and after it (changed = the effect wrote it). Returns
;              to 0x1181BE48 (the stock post mix). v2: it also keeps the
;              ctx[4..10] words each slot is called with (P6 CTX) and, while
;              P6 BUS is open, XORs the 64 bytes at each of them around the
;              call (which of those buffers the effect wrote).
;   blk_end    stub 0x1181BF40 (the block's register restore): block time
;              minus the probe's own checks, min/avg/max over windows of
;              4096 blocks (0.74 s), then publishes the window.
; UI side (VERSION screen, screen 9; the menu entry reads M0PROBE):
;   probe_draw draw stub 0xC00A93D0: one page of the probe, 6 text rows.
;   probe_keys key stub 0xC00A8364: a knob turn changes the page, other keys
;              (the middle knob EXIT) go to the stock version keys.
;   probe_poll 16 ms footswitch round (0xC00C6998, midi-clock's poll call):
;              asks for a redraw every 32 rounds while a live page (P1-P3)
;              is open, then the poll trampoline as before.
; Pages: 0 version (what is flashed), 1 CPU, 2 SLOTS, 3 CYCLES, 4 BUS, 5 CTX,
; 6 CTX BUS, 7 RECORDS, 8 STORE, 9 BANK 0, 10 BANK 1. Opening the screen
; shows page 0. Measuring (audio side) runs only while the screen is open:
; closed, the hooks cost a flag test and the chain runs a plain slot loop.
; CPU clock 300 MHz (AIS PLL config): one 8-frame block at 44.1 kHz = 54422
; cycles. TSCL stops while the OS idles (0xC00D42E4 sets PDCCMD bit 16, the
; idle task runs IDLE at 0x1181A8C0), so a TSCL period between two blocks
; counts busy cycles only: P1 rates the block against PERIOD instead.
;
; Loaded in DDR at 0xC00F3100 (RAM test region 1, free on the 70CDR; the
; release sections end at 0xC00F2800 + 416). The L2 stubs and the OS call
; sites reach it through the vectors at +0.

        .equ    SAVE_REGS, 0xC00E14C0       ; block register save (A3 = return)
        .equ    REST_REGS, 0xC00E14A0       ; block register restore + return
        .equ    AFTER_LOOP, 0x1181BE48      ; stock: callp 0x1181B090 (post mix)
        .equ    FX_TABLE, 0xC00EE930        ; audio function of each slot
        .equ    STATE0, 0x11F03000          ; slot state blocks, 212 B each
        .equ    SLOT_VAR, 576               ; B14 offset: slot being run
        .equ    BUF_F, 0x11F03738           ; ctx[5] chain signal, 16 floats
        .equ    BUF_ACC, 0x11F03778         ; ctx[6] accumulator, 16 floats
        .equ    BUF_DRY, 0x11F03838         ; ctx[4] dry, 16 floats
        .equ    FX_EMPTY, 0xC00E0780        ; empty slot
        .equ    FX_MUTE, 0xC00E0784         ; clears F (effect change, patch load)
        .equ    FX_GAIN, 0x1181BEC0         ; OS gain stage
        .equ    DESC_TAB, 0xC0064E04        ; 28 B per slot, word 0 = ZDL descriptor
        .equ    PATCH, 0xC009BF58           ; current patch, 44 B per slot
        .equ    CURSOR, 0xC009C064          ; signed byte: cursor (view 0)
        .equ    CURSOR_SLOT, 0xC00EE748     ; word [24 x cursor]: slot under it (footswitch lookup 0xC00ACAE0)
        .equ    POLL_TRAMP, 0xC00C82D0      ; midi-clock.yaml, to poll.S
        .equ    VERSION_KEYS, 0xC00A7628    ; stock version screen keys
        .equ    TITLE, 0xC00A7378           ; (string)
        .equ    SNPRINTF, 0xC00DDEE0        ; (buf, size, fmt on stack +4, ...)
        .equ    DRAW_TEXT, 0xC009FCE0       ; (0, text, x, y), 6-pixel font
        .equ    EVENT_POST, 0xC00CBF40      ; (event, mask)
        .equ    REC_LOAD, 0xC00B4AAC        ; (record, buffer) -> 0 = ok
        .equ    FLASH_READ, 0xC00B8E64      ; (flash address, buffer, length)
        .equ    BANK0, 0x3B7000
        .equ    BANK1, 0x3DA000
        .equ    UI_EVENT, 656               ; B14 offsets
        .equ    MODE, 320                   ; 11 = menu
        .equ    SCREEN, 352                 ; 9 = version
        .equ    REC_HDR, 416                ; record store: header pointer
        .equ    REC_DATA, 420               ; data pointer
        .equ    REC_BANK, 424               ; bank in use
        .equ    EV_TURN, 160
        .equ    NPAGES, 11
        .equ    LIVE_PAGES, 7
        .equ    PG_CBUS, 6                  ; P6 BUS: the ctx buffer checks run only then
        .equ    PERIOD, 54422               ; cycles per block: 300 MHz x 8 / 44100
        .equ    NCTX, 7                     ; ctx[4..10] kept per slot
        .equ    WIN, 4096                   ; blocks per window
        .equ    WIN_SHIFT, 12

; just below vars (ldw *-R(ucst5)): the on switch. Nothing is measured while
; the probe screen is closed: probe_poll sets V_ON every 16 ms round from the
; screen state, blk_start copies it to V_RUN for the whole block.
        .equ    V_ON, 4                     ; vars - 4: 1 = probe screen open
        .equ    V_RUN, 8                    ; vars - 8: this block measures
; vars: offsets < 128 (ldw/stw *+R(ucst5) reach 124)
        .equ    V_T0, 0                     ; TSCL at this block's start
        .equ    V_FX, 4                     ; effect cycles, this block
        .equ    V_OVH, 8                    ; chain cycles not in effects, this block
        .equ    V_KBLK, 12                  ; peak block cycles since P1 was opened
        .equ    V_KFX, 16                   ; peak effect cycles since then
        .equ    V_WIN, 20                   ; windows published
        .equ    V_PAGE, 24
        .equ    V_TICK, 28                  ; 16 ms rounds
; window (W) at 32..187, published copy (P) at 192..347, same layout
        .equ    W_N, 32
        .equ    W_BMIN, 36                  ; reset to -1
        .equ    W_FMIN, 40                  ; reset to -1
        .equ    W_PMAX, 44
        .equ    W_BMAX, 48
        .equ    W_FMAX, 52
        .equ    W_PSUM, 56                  ; sums 56..91, published >> 12 (= average)
        .equ    W_BSUM, 60
        .equ    W_FSUM, 64
        .equ    W_SSUM, 68                  ; [6] cycles per slot
        .equ    W_SMAX, 92                  ; [6]
        .equ    W_F, 116                    ; [6] blocks the slot changed F
        .equ    W_A, 140                    ; [6] ... Acc
        .equ    W_D, 164                    ; [6] ... Dry
        .equ    W_WORDS, 39
        .equ    P_OFS, 160                  ; P_x = vars + P_OFS + W_x
        .equ    SL, 64                      ; per-slot base: vars + 4 x slot + SL

        .macro  FCALL target
        mvkl    .S2     \target, b5
        mvkh    .S2     \target, b5
        b       .S2     b5
        addkpc  .S2     ret\@, b3, 4
ret\@:
        .endm

        .macro  ADDR reg, sym
        mvkl    .S1     \sym, \reg
        mvkh    .S1     \sym, \reg
        .endm

        .text
        .nocmp
vectors:
        b       .S2     blk_start           ; +0  from stub 0x1181BF60
        nop     5
        b       .S2     blk_end             ; +8  from stub 0x1181BF40
        nop     5
        b       .S2     chain               ; +16 from 0x1181BE00
        nop     5
        b       .S2     probe_poll          ; +24 callp at 0xC00C6998
        nop     5
        b       .S2     probe_draw          ; +32 callp at 0xC00A93D0
        nop     5
        b       .S2     probe_keys          ; +40 callp at 0xC00A8364
        nop     5

; ---------------------------------------------------------------- audio side

; Before the block saves its registers: callee-saved ones, A3 (return into
; the block) and B3 are live. Uses B0, B1, B16-B21, B31 only.
blk_start:
        mvkl    .S2     vars, b17
        mvkh    .S2     vars, b17
        ldw     .D2T2   *-b17(V_ON), b0
        ldw     .D2T2   *-b17(V_RUN), b1
        nop     4
        stw     .D2T2   b0, *-b17(V_RUN)    ; this block measures (chain, blk_end) or not
  [!b0] b       .S2     bs_out              ; probe screen closed: nothing else
        nop     5
  [b1]  b       .S2     bs_meas
        nop     5
        ; the screen just opened: start fresh (window, published values, ctx
        ; counts, peaks; T0 = 0 skips the first period)
        mvk     .L2     0, b16
        stw     .D2T2   b16, *+b17(V_T0)
        stw     .D2T2   b16, *+b17(V_KBLK)
        stw     .D2T2   b16, *+b17(V_KFX)
        mvk     .S2     W_N, b18
        add     .L2     b17, b18, b18
        mvk     .S2     (P_OFS + W_N + W_WORDS * 4 - W_N) / 4, b1   ; W, gap, P
bs_clr:
        stw     .D2T2   b16, *b18++
        sub     .L2     b1, 1, b1
  [b1]  b       .S2     bs_clr
        nop     5
        mvk     .L2     -1, b19
        stw     .D2T2   b19, *+b17(W_BMIN)
        stw     .D2T2   b19, *+b17(W_FMIN)
        mvkl    .S2     wc, b18
        mvkh    .S2     wc, b18
        mvk     .S2     2 * 6 * NCTX, b1    ; wc, pc
bs_clrc:
        stw     .D2T2   b16, *b18++
        sub     .L2     b1, 1, b1
  [b1]  b       .S2     bs_clrc
        nop     5
bs_meas:
        mvc     .S2     tscl, b16
        ldw     .D2T2   *+b17(V_T0), b18
        ldw     .D2T2   *+b17(W_PSUM), b19
        ldw     .D2T2   *+b17(W_PMAX), b20
        nop     4
        stw     .D2T2   b16, *+b17(V_T0)
        sub     .L2     b16, b18, b21       ; period
        mv      .L2     b18, b0
  [!b0] mvk     .L2     0, b21              ; first block: no period
        add     .L2     b19, b21, b19
        cmpgtu  .L2     b21, b20, b1
  [b1]  mv      .L2     b21, b20
        stw     .D2T2   b19, *+b17(W_PSUM)
        stw     .D2T2   b20, *+b17(W_PMAX)
bs_out:
        mvkl    .S2     SAVE_REGS, b31
        mvkh    .S2     SAVE_REGS, b31
        b       .S2     b31
        nop     5

; Before the block restores its registers (they come back from the stack,
; so only B14, B15 matter). Uses B0-B2, B16-B31.
blk_end:
        mvc     .S2     tscl, b16
        mvkl    .S2     vars, b17
        mvkh    .S2     vars, b17
        ldw     .D2T2   *-b17(V_RUN), b0
        nop     4
  [!b0] b       .S1     be_out              ; this block did not measure
        nop     5
        ldw     .D2T2   *+b17(V_T0), b18
        ldw     .D2T2   *+b17(V_FX), b19
        ldw     .D2T2   *+b17(V_OVH), b20
        ldw     .D2T2   *+b17(W_N), b21
        ldw     .D2T2   *+b17(W_BSUM), b22
        ldw     .D2T2   *+b17(W_FSUM), b23
        ldw     .D2T2   *+b17(W_BMAX), b24
        ldw     .D2T2   *+b17(W_FMAX), b25
        ldw     .D2T2   *+b17(W_BMIN), b26
        ldw     .D2T2   *+b17(W_FMIN), b27
        ldw     .D2T2   *+b17(V_KBLK), b28
        ldw     .D2T2   *+b17(V_KFX), b29
        nop     4
        sub     .L2     b16, b18, b16
        sub     .L2     b16, b20, b16       ; block cycles without the probe's checks
        add     .L2     1, b21, b21
        add     .L2     b22, b16, b22
        add     .L2     b23, b19, b23
        cmpgtu  .L2     b16, b24, b0
  [b0]  mv      .L2     b16, b24
        cmpgtu  .L2     b19, b25, b0
  [b0]  mv      .L2     b19, b25
        cmpltu  .L2     b16, b26, b0
  [b0]  mv      .L2     b16, b26
        cmpltu  .L2     b19, b27, b0
  [b0]  mv      .L2     b19, b27
        cmpgtu  .L2     b16, b28, b0
  [b0]  mv      .L2     b16, b28
        cmpgtu  .L2     b19, b29, b0
  [b0]  mv      .L2     b19, b29
        stw     .D2T2   b21, *+b17(W_N)
        stw     .D2T2   b22, *+b17(W_BSUM)
        stw     .D2T2   b23, *+b17(W_FSUM)
        stw     .D2T2   b24, *+b17(W_BMAX)
        stw     .D2T2   b25, *+b17(W_FMAX)
        stw     .D2T2   b26, *+b17(W_BMIN)
        stw     .D2T2   b27, *+b17(W_FMIN)
        stw     .D2T2   b28, *+b17(V_KBLK)
        stw     .D2T2   b29, *+b17(V_KFX)
        mvk     .S2     WIN, b30
        cmpeq   .L2     b21, b30, b0
  [!b0] b       .S1     be_out
        nop     5
        ; publish: P = W (sums >> 12), then reset W (mins to -1, the rest 0)
        mvk     .S2     W_N, b18
        add     .L2     b17, b18, b18       ; W
        mvk     .S2     W_N + P_OFS, b19
        add     .L2     b17, b19, b19       ; P
        mvk     .L2     0, b20              ; word index
        mvk     .S2     W_WORDS, b21
be_pub:
        ldw     .D2T2   *b18, b22
        cmpgt   .L2     (W_PSUM - W_N) / 4, b20, b0     ; before the sums
        cmpgt   .L2     (W_SSUM - W_N) / 4 + 6, b20, b1 ; before the per-slot maxes
        xor     .L2     1, b0, b0
        and     .L2     b0, b1, b2          ; a sum
        cmpeq   .L2     (W_BMIN - W_N) / 4, b20, b0
        cmpeq   .L2     (W_FMIN - W_N) / 4, b20, b1
        or      .L2     b0, b1, b1
        mvk     .L2     0, b23
  [b1]  mvk     .L2     -1, b23
  [b2]  shru    .S2     b22, WIN_SHIFT, b22
        stw     .D2T2   b22, *b19++
        stw     .D2T2   b23, *b18++
        add     .L2     1, b20, b20
        cmplt   .L2     b20, b21, b0
  [b0]  b       .S1     be_pub
        nop     5
        ; and the ctx buffer counts: pc = wc, then wc = 0
        mvkl    .S2     wc, b18
        mvkh    .S2     wc, b18
        mvkl    .S2     pc, b19
        mvkh    .S2     pc, b19
        mvk     .S2     6 * NCTX, b1
        mvk     .L2     0, b23
be_cpy:
        ldw     .D2T2   *b18, b22
        sub     .L2     b1, 1, b1
        nop     3
        stw     .D2T2   b22, *b19++
        stw     .D2T2   b23, *b18++
  [b1]  b       .S1     be_cpy
        nop     5
        ldw     .D2T2   *+b17(V_WIN), b22
        nop     4
        add     .L2     1, b22, b22
        stw     .D2T2   b22, *+b17(V_WIN)
be_out:
        mvkl    .S2     REST_REGS, b31
        mvkh    .S2     REST_REGS, b31
        b       .S2     b31
        nop     5

; XOR of the 16 words at A0 -> \out. Uses A16-A31.
        .macro  XSUM out
        lddw    .D1T1   *+a0(0), a17:a16
        lddw    .D1T1   *+a0(8), a19:a18
        lddw    .D1T1   *+a0(16), a21:a20
        lddw    .D1T1   *+a0(24), a23:a22
        lddw    .D1T1   *+a0(32), a25:a24
        lddw    .D1T1   *+a0(40), a27:a26
        lddw    .D1T1   *+a0(48), a29:a28
        lddw    .D1T1   *+a0(56), a31:a30
        nop     4
        xor     .L1     a16, a17, a16
        xor     .L1     a18, a19, a18
        xor     .L1     a20, a21, a20
        xor     .L1     a22, a23, a22
        xor     .L1     a24, a25, a24
        xor     .L1     a26, a27, a26
        xor     .L1     a28, a29, a28
        xor     .L1     a30, a31, a30
        xor     .L1     a16, a18, a16
        xor     .L1     a20, a22, a20
        xor     .L1     a24, a26, a24
        xor     .L1     a28, a30, a28
        xor     .L1     a16, a20, a16
        xor     .L1     a24, a28, a24
        xor     .L1     a16, a24, \out
        .endm

; A5 = XOR(F), A6 = XOR(Acc), A7 = XOR(Dry). Uses A0, A16-A31.
sums:
        ADDR    a0, BUF_F
        XSUM    a5
        ADDR    a0, BUF_ACC
        XSUM    a6
        ADDR    a0, BUF_DRY
        XSUM    a7
        b       .S2     b3
        nop     5

; XOR of the 64 bytes at each of the NCTX pointers at A8 -> NCTX words at B8.
; Pointers outside L2 (0x118xxxxx), L1D (0x11Fxxxxx) and DDR (0xCxxxxxxx) read
; zbuf instead. Unaligned loads: ctx[7] (0xC005C94C) is not 8-byte aligned.
; Uses A0-A3, A8, A9, A16-A31, B8; keeps A4.
csums:
        mvk     .L1     NCTX, a9
cs_ptr:
        ldw     .D1T1   *a8++, a0
        nop     4
        shru    .S1     a0, 28, a1
        cmpeq   .L1     12, a1, a1          ; DDR
        shru    .S1     a0, 20, a2
        mvk     .S1     0x118, a3
        cmpeq   .L1     a2, a3, a3          ; L2
        or      .L1     a1, a3, a1
        mvk     .S1     0x11F, a3
        cmpeq   .L1     a2, a3, a3          ; L1D
        or      .L1     a1, a3, a1
        ADDR    a2, zbuf
  [!a1] mv      .L1     a2, a0
        ldndw   .D1T1   *+a0[0], a17:a16
        ldndw   .D1T1   *+a0[1], a19:a18
        ldndw   .D1T1   *+a0[2], a21:a20
        ldndw   .D1T1   *+a0[3], a23:a22
        ldndw   .D1T1   *+a0[4], a25:a24
        ldndw   .D1T1   *+a0[5], a27:a26
        ldndw   .D1T1   *+a0[6], a29:a28
        ldndw   .D1T1   *+a0[7], a31:a30
        nop     4
        xor     .L1     a16, a17, a16
        xor     .L1     a18, a19, a18
        xor     .L1     a20, a21, a20
        xor     .L1     a22, a23, a22
        xor     .L1     a24, a25, a24
        xor     .L1     a26, a27, a26
        xor     .L1     a28, a29, a28
        xor     .L1     a30, a31, a30
        xor     .L1     a16, a18, a16
        xor     .L1     a20, a22, a20
        xor     .L1     a24, a26, a24
        xor     .L1     a28, a30, a28
        xor     .L1     a16, a20, a16
        xor     .L1     a24, a28, a24
        xor     .L1     a16, a24, a3
        stw     .D2T1   a3, *b8++
        sub     .L1     a9, 1, a9
        mv      .L1     a9, a1
  [a1]  b       .S1     cs_ptr
        nop     5
        b       .S2     b3
        nop     5

; The slot loop. Everything but B14/B15 is free (the block saved the
; callee-saved registers); effects keep A10-A15, B10-B13.
; A12 slot, A13 vars, A14/A15/B11 sums before, B10 chain start, B12 effect
; start, B13 effect cycles, A10 = 1: P6 BUS is on screen (ctx buffer checks).
chain:
        ADDR    a13, vars
        ldw     .D1T1   *-a13(V_RUN), a0
        ldw     .D1T1   *+a13(V_PAGE), a10
        mvk     .L1     0, a12
        mvk     .L2     0, b13
        nop     2
  [!a0] b       .S1     cf_slot             ; not measuring: the plain loop
        nop     5
        mvc     .S2     tscl, b10
        cmpeq   .L1     PG_CBUS, a10, a10
c_slot:
        stw     .D2T1   a12, *+b14(SLOT_VAR)
        callp   .S2     sums, b3
        mv      .L1     a5, a14
        mv      .L1     a6, a15
        mv      .L2X    a7, b11
        mvk     .S1     212, a0
        mpy     .M1     a0, a12, a1
        ADDR    a4, STATE0
        add     .L1     a4, a1, a4          ; A4 = state of the slot
        ; keep ctx[4..10] as the effect gets them
        ADDR    a8, d_ctx
        mvk     .S1     NCTX * 4, a0
        mpy     .M1     a0, a12, a0
        nop     1
        add     .L1     a8, a0, a8          ; this slot's kept ctx words
        ldw     .D1T1   *+a4(16), a16
        ldw     .D1T1   *+a4(20), a17
        ldw     .D1T1   *+a4(24), a18
        ldw     .D1T1   *+a4(28), a19
        ldw     .D1T1   *+a4(32), a20
        ldw     .D1T1   *+a4(36), a21
        ldw     .D1T1   *+a4(40), a22
        nop     4
        stw     .D1T1   a16, *+a8(0)
        stw     .D1T1   a17, *+a8(4)
        stw     .D1T1   a18, *+a8(8)
        stw     .D1T1   a19, *+a8(12)
        stw     .D1T1   a20, *+a8(16)
        stw     .D1T1   a21, *+a8(20)
        stw     .D1T1   a22, *+a8(24)
        mv      .L1     a10, a1
  [!a1] b       .S1     c_call
        nop     5
        mvkl    .S2     d_xb, b8
        mvkh    .S2     d_xb, b8
        callp   .S2     csums, b3           ; the ctx buffers before the call
c_call:
        mvkl    .S2     FX_TABLE, b5
        mvkh    .S2     FX_TABLE, b5
        mv      .L2X    a12, b6
        ldw     .D2T2   *+b5[b6], b4        ; B4 = its audio function
        nop     4
        mvc     .S2     tscl, b12
        b       .S2     b4
        addkpc  .S2     c_ret, b3, 4
c_ret:
        mvc     .S2     tscl, b0
        sub     .L2     b0, b12, b0
        add     .L2     b13, b0, b13
        mv      .L1X    b0, a3              ; A3 = this effect's cycles
        addaw   .D1     a13, a12, a8
        addk    .S1     SL, a8              ; A8 = per-slot base
        ldw     .D1T1   *+a8(W_SSUM - SL), a1
        ldw     .D1T1   *+a8(W_SMAX - SL), a2
        nop     4
        add     .L1     a1, a3, a1
        cmpgtu  .L1     a3, a2, a0
  [a0]  mv      .L1     a3, a2
        stw     .D1T1   a1, *+a8(W_SSUM - SL)
        stw     .D1T1   a2, *+a8(W_SMAX - SL)
        callp   .S2     sums, b3
        addaw   .D1     a13, a12, a8
        addk    .S1     SL, a8
        ldw     .D1T1   *+a8(W_F - SL), a1
        ldw     .D1T1   *+a8(W_A - SL), a2
        ldw     .D1T1   *+a8(W_D - SL), a9
        mv      .L1X    b11, a4
        cmpeq   .L1     a5, a14, a5
        cmpeq   .L1     a6, a15, a6
        cmpeq   .L1     a7, a4, a7
        xor     .L1     1, a5, a5
        xor     .L1     1, a6, a6
        xor     .L1     1, a7, a7
        add     .L1     a1, a5, a1
        add     .L1     a2, a6, a2
        add     .L1     a9, a7, a9
        stw     .D1T1   a1, *+a8(W_F - SL)
        stw     .D1T1   a2, *+a8(W_A - SL)
        stw     .D1T1   a9, *+a8(W_D - SL)
        mv      .L1     a10, a1
  [!a1] b       .S1     c_next
        nop     5
        ; P6 BUS: count the ctx buffers the call changed
        ADDR    a8, d_ctx
        mvk     .S1     NCTX * 4, a0
        mpy     .M1     a0, a12, a11
        nop     1
        add     .L1     a8, a11, a8
        mvkl    .S2     d_xa, b8
        mvkh    .S2     d_xa, b8
        callp   .S2     csums, b3
        ADDR    a4, d_xb
        ADDR    a5, d_xa
        ADDR    a7, wc
        add     .L1     a7, a11, a7         ; this slot's counts
        mvk     .L1     NCTX, a9
c_cmp:
        ldw     .D1T1   *a4++, a0
        ldw     .D1T1   *a5++, a1
        ldw     .D1T1   *a7, a2
        nop     4
        cmpeq   .L1     a0, a1, a0
        xor     .L1     1, a0, a0
        add     .L1     a2, a0, a2
        stw     .D1T1   a2, *a7++
        sub     .L1     a9, 1, a9
        mv      .L1     a9, a1
  [a1]  b       .S1     c_cmp
        nop     5
c_next:
        add     .L1     1, a12, a12
        cmpgt   .L1     6, a12, a0
  [a0]  b       .S1     c_slot
        nop     5
        mvk     .L2     6, b0
        stw     .D2T2   b0, *+b14(SLOT_VAR) ; as the stock loop leaves it
        mvc     .S2     tscl, b0
        sub     .L2     b0, b10, b0
        sub     .L2     b0, b13, b0         ; chain cycles outside the effects
        stw     .D1T2   b13, *+a13(V_FX)
        stw     .D1T2   b0, *+a13(V_OVH)
c_out:
        mvkl    .S2     AFTER_LOOP, b0
        mvkh    .S2     AFTER_LOOP, b0
        b       .S2     b0
        nop     5

; The plain loop while the probe screen is closed: what the stock loop does
; (B14+576 = slot, A4 = slot state, call 0xC00EE930[slot], then 6). A12 = 0.
cf_slot:
        stw     .D2T1   a12, *+b14(SLOT_VAR)
        mvk     .S1     212, a0
        mpy     .M1     a0, a12, a1
        ADDR    a4, STATE0
        add     .L1     a4, a1, a4
        mvkl    .S2     FX_TABLE, b5
        mvkh    .S2     FX_TABLE, b5
        mv      .L2X    a12, b6
        ldw     .D2T2   *+b5[b6], b4
        nop     4
        b       .S2     b4
        addkpc  .S2     cf_ret, b3, 4
cf_ret:
        add     .L1     1, a12, a12
        cmpgt   .L1     6, a12, a0
  [a0]  b       .S1     cf_slot
        nop     5
        mvk     .L2     6, b0
        stw     .D2T2   b0, *+b14(SLOT_VAR)
        b       .S1     c_out
        nop     5

; ------------------------------------------------------------------- UI side

; Instead of Task_SwitchNrmlSpdRead's poll call: a redraw every 32 rounds on
; a live page of the probe screen, then the poll as before (B3 unchanged).
; Uses A0-A9, B0-B9.
probe_poll:
        addk    .S2     -16, b15
        stw     .D2T2   b3, *+b15(4)
        ADDR    a0, vars
        ldw     .D1T1   *+a0(V_TICK), a1
        ldw     .D1T1   *+a0(V_PAGE), a2
        ldw     .D2T2   *+b14(MODE), b0
        ldw     .D2T2   *+b14(SCREEN), b1
        ldw     .D1T1   *-a0(V_ON), a3
        nop     4
        add     .L1     1, a1, a1
        stw     .D1T1   a1, *+a0(V_TICK)
        extu    .S1     a1, 27, 27, a1      ; low 5 bits
        cmpeq   .L1     0, a1, a1
        cmpgt   .L1     LIVE_PAGES, a2, a2
        and     .L1     a1, a2, a1
        cmpeq   .L2     11, b0, b0
        cmpeq   .L2     9, b1, b1
        and     .L2     b0, b1, b0          ; the probe screen is open
        stw     .D1T2   b0, *-a0(V_ON)      ; the audio side measures only then
        cmpeq   .L2X    0, a3, b2
        and     .L2     b2, b0, b2          ; it just opened: start on the version page
        mvk     .L1     0, a5
  [b2]  stw     .D1T1   a5, *+a0(V_PAGE)
        and     .L2X    b0, a1, b0
        or      .L2     b0, b2, b0
  [!b0] b       .S1     pp_out
        nop     5
        ldw     .D2T1   *+b14(UI_EVENT), a4
        mvk     .S2     64, b4
        nop     3
        FCALL   EVENT_POST
pp_out:
        ldw     .D2T2   *+b15(4), b3
        addk    .S2     16, b15
        mvkl    .S2     POLL_TRAMP, b0
        mvkh    .S2     POLL_TRAMP, b0
        b       .S2     b0
        nop     5

; Version screen keys: A4 = event, A5 = steps. A knob turn moves the page
; (wrapping); opening P1 resets the peaks. Other keys: stock.
probe_keys:
        mvk     .S1     EV_TURN, a0
        sub     .L1     a4, a0, a0
        cmpgtu  .L1     3, a0, a1           ; events 160-162: any of the 3 knobs
        mvkl    .S2     VERSION_KEYS, b5
        mvkh    .S2     VERSION_KEYS, b5
  [!a1] b       .S2     b5
        nop     5
        ADDR    a0, vars
        ldw     .D1T1   *+a0(V_PAGE), a2
        nop     4
        cmpgt   .L1     0, a5, a1           ; turned left
  [a1]  sub     .L1     a2, 1, a2
  [!a1] add     .L1     1, a2, a2
        cmpgt   .L1     0, a2, a1
  [a1]  mvk     .L1     NPAGES - 1, a2
        cmplt   .L1     NPAGES - 1, a2, a1
  [a1]  mvk     .L1     0, a2
        stw     .D1T1   a2, *+a0(V_PAGE)
        cmpeq   .L1     1, a2, a1           ; P1
        mvk     .L1     0, a2
  [a1]  stw     .D1T1   a2, *+a0(V_KBLK)
  [a1]  stw     .D1T1   a2, *+a0(V_KFX)
        mvk     .L1     1, a4               ; redraw
        b       .S2     b3
        nop     5

; a4 = a4 / a6 (unsigned), 0 if a6 = 0. Uses A0-A6.
udiv:
        mv      .L1     a6, a0
  [!a0] mvk     .L1     0, a4
  [!a0] b       .S2     b3
        nop     5
        mvk     .L1     0, a2               ; quotient
        mvk     .L1     0, a3               ; remainder
        mvk     .S1     32, a1
ud_loop:
        shru    .S1     a4, 31, a5
        shl     .S1     a4, 1, a4
        shl     .S1     a3, 1, a3
        or      .L1     a3, a5, a3
        shl     .S1     a2, 1, a2
        cmpltu  .L1     a3, a6, a0
  [!a0] sub     .L1     a3, a6, a3
  [!a0] or      .L1     1, a2, a2
        sub     .L1     a1, 1, a1
  [a1]  b       .S1     ud_loop
        nop     5
        mv      .L1     a2, a4
        b       .S2     b3
        nop     5

; a4 = a4 x 100 / a6. Uses A0-A6, B3 kept in B6.
pct:
        mv      .L2     b3, b6
        mvk     .S1     100, a0
        mpy32   .M1     a4, a0, a4
        nop     3
        callp   .S2     udiv, b3
        b       .S2     b6
        nop     5

; Write the low A6 hex digits of A4 at B4, then a NUL; A4 = the NUL's address.
; Uses A0-A7.
hexn:
        mv      .L1X    b4, a5
        add     .L1     a5, a6, a5
        mv      .L1     a5, a7
        mvk     .L1     0, a0
        stb     .D1T1   a0, *a5
        mv      .L1     a6, a2
hx_loop:
        and     .L1     15, a4, a1
        shru    .S1     a4, 4, a4
        cmpgt   .L1     10, a1, a0
  [a0]  addk    .S1     48, a1              ; '0'
  [!a0] addk    .S1     55, a1              ; 'A' - 10
        sub     .L1     a5, 1, a5
        stb     .D1T1   a1, *a5
        sub     .L1     a2, 1, a2
  [a2]  b       .S1     hx_loop
        nop     5
        mv      .L1     a7, a4
        b       .S2     b3
        nop     5

; Copy at most A6 characters of the string at B4 to A4, then a NUL. Uses A0-A2, B0.
copystr:
        mv      .L1     a6, a2
cs_loop:
  [!a2] b       .S1     cs_end
        nop     5
        ldbu    .D2T2   *b4++, b0
        nop     4
  [!b0] b       .S1     cs_end
        nop     5
        stb     .D1T2   b0, *a4++
        sub     .L1     a2, 1, a2
        b       .S1     cs_loop
        nop     5
cs_end:
        mvk     .L1     0, a0
        stb     .D1T1   a0, *a4
        b       .S2     b3
        nop     5

; P1: the load figures, against the real block period (PERIOD, not the TSCL
; period, which skips idle time), and the patch's declared DSP total.
; Internal: may change any register but B14/B15.
derive_cpu:
        mv      .L2     b3, b13
        ADDR    a10, vars+P_OFS
        ADDR    a11, PERIOD
        ldw     .D1T1   *+a10(W_BSUM), a4
        mv      .L1     a11, a6
        nop     3
        callp   .S2     pct, b3
        ADDR    a0, d_pavg
        stw     .D1T1   a4, *a0
        ldw     .D1T1   *+a10(W_BMAX), a4
        mv      .L1     a11, a6
        nop     3
        callp   .S2     pct, b3
        ADDR    a0, d_pmax
        stw     .D1T1   a4, *a0
        ADDR    a0, vars
        ldw     .D1T1   *+a0(V_KBLK), a4
        mv      .L1     a11, a6
        nop     3
        callp   .S2     pct, b3
        ADDR    a0, d_pk
        stw     .D1T1   a4, *a0
        ldw     .D1T1   *+a10(W_PSUM), a4   ; busy cycles per block (all tasks)
        mv      .L1     a11, a6
        nop     3
        callp   .S2     pct, b3
        ADDR    a0, d_cpu
        stw     .D1T1   a4, *a0
        ; declared DSP total: what the DSP Full check 0xC00BB4E0 adds up for all
        ; 6 slots, the float at +40 of each slot's descriptor entry 1
        mvk     .L1     0, a12              ; slot
        mvk     .L1     0, a14              ; sum (0.0f)
dc_slot:
        mvk     .S1     28, a0
        mpy     .M1     a0, a12, a0
        ADDR    a1, DESC_TAB
        add     .L1     a1, a0, a1
        ldw     .D1T1   *a1, a13            ; descriptor
        nop     4
        shru    .S1     a13, 28, a0
        cmpeq   .L1     12, a0, a1          ; in DDR
  [!a1] b       .S1     dc_next
        nop     5
        addk    .S1     48, a13
        ldw     .D1T1   *+a13(40), a0
        nop     4
        addsp   .L1     a14, a0, a14
        nop     3
dc_next:
        add     .L1     1, a12, a12
        cmpgt   .L1     6, a12, a1
  [a1]  b       .S1     dc_slot
        nop     5
        mvkl    .S1     0x41200000, a1      ; 10.0
        mvkh    .S1     0x41200000, a1
        mpysp   .M1     a14, a1, a0
        nop     3
        spint   .L1     a0, a14             ; total x 10
        nop     3
        mv      .L1     a14, a4
        mvk     .L1     10, a6
        callp   .S2     udiv, b3
        mvk     .L1     10, a0
        mpy     .M1     a0, a4, a0
        nop     1
        sub     .L1     a14, a0, a0
        ADDR    a1, d_dsp
        stw     .D1T1   a4, *a1
        stw     .D1T1   a0, *+a1(4)         ; d_dspt
        b       .S2     b13
        nop     5

; P6: the cursor slot's kept ctx words, which words differ in the other
; slots, and the ctx buffer counts as one character per buffer.
; Internal: may change any register but B14/B15.
derive_ctx:
        mv      .L2     b3, b13
        ADDR    a0, d_cslot
        ldw     .D1T1   *a0, a10
        nop     4
        cmpgt   .L1     0, a10, a1
        cmplt   .L1     5, a10, a2
        or      .L1     a1, a2, a1
  [a1]  mvk     .L1     0, a10
        ADDR    a0, d_xslot
        stw     .D1T1   a10, *a0
        mvk     .S1     NCTX * 4, a0
        mpy     .M1     a0, a10, a0
        ADDR    a11, d_ctx
        add     .L1     a11, a0, a11        ; A11 = the shown slot's words
        ; 7 hex strings, 12 B apart
        mvk     .L1     0, a12
dx_hex:
        ldw     .D1T1   *+a11[a12], a4
        mvk     .S1     12, a0
        mpy     .M1     a0, a12, a0
        ADDR    a1, d_cx
        nop     2
        add     .L1     a1, a0, a1
        mv      .L2X    a1, b4
        mvk     .L1     8, a6
        callp   .S2     hexn, b3
        add     .L1     1, a12, a12
        cmpgt   .L1     NCTX, a12, a1
  [a1]  b       .S1     dx_hex
        nop     5
        ; per slot: mask of the words that differ from the shown slot's
        mvk     .L1     0, a12              ; slot
dx_mask:
        mvk     .S1     NCTX * 4, a0
        mpy     .M1     a0, a12, a0
        ADDR    a13, d_ctx
        add     .L1     a13, a0, a13
        mvk     .L1     0, a14              ; mask
        mvk     .L1     0, a15              ; word
dx_word:
        ldw     .D1T1   *+a13[a15], a0
        ldw     .D1T1   *+a11[a15], a1
        nop     4
        cmpeq   .L1     a0, a1, a0
        xor     .L1     1, a0, a0
        shl     .S1     a0, a15, a0
        or      .L1     a14, a0, a14
        add     .L1     1, a15, a15
        cmpgt   .L1     NCTX, a15, a1
  [a1]  b       .S1     dx_word
        nop     5
        mv      .L1     a14, a4
        ADDR    a1, d_dm
        addaw   .D1     a1, a12, a1
        mv      .L2X    a1, b4
        mvk     .L1     2, a6
        callp   .S2     hexn, b3
        ; and this slot's buffer counts: - never, * every block, else 0-9 tenths
        mvk     .S1     NCTX * 4, a0
        mpy     .M1     a0, a12, a0
        ADDR    a13, pc
        add     .L1     a13, a0, a13
        ADDR    a3, d_cb
        addad   .D1     a3, a12, a3         ; 8 B per slot
        mvk     .L1     0, a15
dx_cnt:
        ldw     .D1T1   *a13++, a0
        nop     4
        mvk     .S1     10, a1
        mpy32   .M1     a0, a1, a1
        nop     3
        shru    .S1     a1, WIN_SHIFT, a1
        addk    .S1     48, a1              ; '0' + tenths
        mvk     .S1     WIN, a2
        cmplt   .L1     a0, a2, a2
  [!a2] mvk     .S1     42, a1              ; '*'
        cmpeq   .L1     0, a0, a2
  [a2]  mvk     .S1     45, a1              ; '-'
        stb     .D1T1   a1, *a3++
        add     .L1     1, a15, a15
        cmpgt   .L1     NCTX, a15, a1
  [a1]  b       .S1     dx_cnt
        nop     5
        mvk     .L1     0, a0
        stb     .D1T1   a0, *a3
        add     .L1     1, a12, a12
        cmpgt   .L1     6, a12, a1
  [a1]  b       .S1     dx_mask
        nop     5
        b       .S2     b13
        nop     5

; P2: name and DSP cost of each slot, cursor and the slot under it.
derive_slots:
        mv      .L2     b3, b13
        mvk     .L1     0, a10              ; slot
ds_slot:
        mvkl    .S2     FX_TABLE, b0
        mvkh    .S2     FX_TABLE, b0
        mv      .L2X    a10, b1
        ldw     .D2T1   *+b0[b1], a11       ; audio function
        mvk     .S1     12, a0
        mpy     .M1     a0, a10, a0
        ADDR    a12, d_names
        add     .L1     a12, a0, a12        ; A12 = name buffer
        mvk     .L1     0, a14              ; cost x 10
        ADDR    a0, FX_EMPTY
        cmpeq   .L1     a11, a0, a1
        mvkl    .S2     s_empty, b4
        mvkh    .S2     s_empty, b4
  [a1]  b       .S1     ds_name
        nop     5
        ADDR    a0, FX_MUTE
        cmpeq   .L1     a11, a0, a1
        mvkl    .S2     s_mute, b4
        mvkh    .S2     s_mute, b4
  [a1]  b       .S1     ds_name
        nop     5
        ADDR    a0, FX_GAIN
        cmpeq   .L1     a11, a0, a1
        mvkl    .S2     s_gain, b4
        mvkh    .S2     s_gain, b4
  [a1]  b       .S1     ds_name
        nop     5
        mvkl    .S2     s_unknown, b4
        mvkh    .S2     s_unknown, b4
        mvk     .S1     28, a0
        mpy     .M1     a0, a10, a0
        ADDR    a1, DESC_TAB
        add     .L1     a1, a0, a1
        ldw     .D1T1   *a1, a13            ; descriptor
        nop     4
        shru    .S1     a13, 28, a0
        cmpeq   .L1     12, a0, a1          ; in DDR (0xCxxxxxxx)
  [!a1] b       .S1     ds_name
        nop     5
        addk    .S1     48, a13             ; entry 1: name, audio function at +32
        ldw     .D1T1   *+a13(32), a0
        nop     4
        cmpeq   .L1     a0, a11, a1
  [!a1] b       .S1     ds_name
        nop     5
        ldw     .D1T1   *+a13(40), a0       ; DSP cost, float
        mvkl    .S1     0x41200000, a1      ; 10.0
        mvkh    .S1     0x41200000, a1
        nop     3
        mpysp   .M1     a0, a1, a0
        nop     3
        spint   .L1     a0, a14
        nop     3
        mv      .L2X    a13, b4
ds_name:
        mv      .L1     a12, a4
        mvk     .L1     10, a6
        callp   .S2     copystr, b3
        mv      .L1     a14, a4
        mvk     .L1     10, a6
        callp   .S2     udiv, b3            ; whole part
        mvk     .L1     10, a0
        mpy     .M1     a0, a4, a0
        nop     1
        sub     .L1     a14, a0, a0         ; tenths
        ADDR    a1, d_cost
        addaw   .D1     a1, a10, a1
        stw     .D1T1   a4, *a1
        stw     .D1T1   a0, *+a1(24)        ; d_tenth
        add     .L1     1, a10, a10
        cmpgt   .L1     6, a10, a1
  [a1]  b       .S1     ds_slot
        nop     5
        ; cursor (signed byte) and the slot under it, -1 if out of range
        ADDR    a0, CURSOR
        ldb     .D1T1   *a0, a4
        mvk     .L1     -1, a5
        nop     3
        cmpgt   .L1     0, a4, a1
        cmplt   .L1     5, a4, a2
        or      .L1     a1, a2, a1
  [a1]  b       .S1     ds_cur
        nop     5
        mvk     .S1     24, a0
        mpy     .M1     a0, a4, a0
        ADDR    a1, CURSOR_SLOT
        add     .L1     a1, a0, a1
        ldw     .D1T1   *a1, a5
        nop     4
ds_cur:
        ADDR    a0, d_cur
        stw     .D1T1   a4, *a0
        stw     .D1T1   a5, *+a0(4)         ; d_cslot
        b       .S2     b13
        nop     5

; P4: OR of bytes 14, 15, 17 of every slot block and byte 110 & 0xE0 over the
; stored records 0-49; the 11 words of the cursor's slot (slot 0 if none) in
; the current patch.
do_records:
        mv      .L2     b3, b13
        mvk     .L1     0, a10              ; record
        mvk     .L1     0, a11              ; loaded ok
        mvk     .L1     -1, a12             ; first record with a non-zero byte
        mvk     .L1     0, a13              ; OR byte 14
        mvk     .L1     0, a14              ; 15
        mvk     .L1     0, a15              ; 17
        mvk     .L2     0, b10              ; 110 & 0xE0
dr_rec:
        mv      .L1     a10, a4
        mvkl    .S2     d_rec, b4
        mvkh    .S2     d_rec, b4
        FCALL   REC_LOAD
        mv      .L1     a4, a0
  [a0]  b       .S1     dr_next
        nop     5
        add     .L1     1, a11, a11
        ADDR    a3, d_rec
        mvk     .L1     6, a2
        mvk     .L1     0, a9               ; this record's OR
dr_blk:
        ldbu    .D1T1   *+a3(14), a4
        ldbu    .D1T1   *+a3(15), a5
        ldbu    .D1T1   *+a3(17), a6
        nop     4
        or      .L1     a13, a4, a13
        or      .L1     a14, a5, a14
        or      .L1     a15, a6, a15
        or      .L1     a9, a4, a9
        or      .L1     a9, a5, a9
        or      .L1     a9, a6, a9
        addk    .S1     18, a3
        sub     .L1     a2, 1, a2
  [a2]  b       .S1     dr_blk
        nop     5
        ADDR    a3, d_rec
        mvk     .S1     110, a5
        ldbu    .D1T1   *+a3[a5], a4
        nop     4
        mvk     .S1     0xE0, a5
        and     .L1     a4, a5, a4
        or      .L1X    a4, b10, a5
        mv      .L2X    a5, b10
        or      .L1     a9, a4, a9
        ; first non-zero record
        cmpgt   .L1     0, a12, a1
        cmpeq   .L1     0, a9, a2
        xor     .L1     1, a2, a2
        and     .L1     a1, a2, a1
  [a1]  mv      .L1     a10, a12
dr_next:
        add     .L1     1, a10, a10
        mvk     .S1     50, a0
        cmplt   .L1     a10, a0, a1
  [a1]  b       .S1     dr_rec
        nop     5
        ADDR    a0, d_recok
        stw     .D1T1   a11, *a0
        stw     .D1T1   a12, *+a0(4)        ; d_recnz
        mv      .L1     a13, a4
        mvkl    .S2     d_h14, b4
        mvkh    .S2     d_h14, b4
        mvk     .L1     2, a6
        callp   .S2     hexn, b3
        mv      .L1     a14, a4
        mvkl    .S2     d_h15, b4
        mvkh    .S2     d_h15, b4
        mvk     .L1     2, a6
        callp   .S2     hexn, b3
        mv      .L1     a15, a4
        mvkl    .S2     d_h17, b4
        mvkh    .S2     d_h17, b4
        mvk     .L1     2, a6
        callp   .S2     hexn, b3
        mv      .L1X    b10, a4
        mvkl    .S2     d_h110, b4
        mvkh    .S2     d_h110, b4
        mvk     .L1     2, a6
        callp   .S2     hexn, b3
        ; the current patch, slot under the cursor
        ADDR    a0, d_cslot
        ldw     .D1T1   *a0, a4
        nop     4
        cmpgt   .L1     0, a4, a1
        cmplt   .L1     5, a4, a2
        or      .L1     a1, a2, a1
  [a1]  mvk     .L1     0, a4
        ADDR    a0, d_wslot
        stw     .D1T1   a4, *a0
        mvk     .S1     44, a0
        mpy     .M1     a0, a4, a0
        ADDR    a1, PATCH
        add     .L1     a1, a0, a1          ; source
        ADDR    a3, d_w
        mvk     .L1     11, a2
dr_w:
        ldw     .D1T1   *a1++, a0
        nop     4
        stw     .D1T1   a0, *a3++
        sub     .L1     a2, 1, a2
  [a2]  b       .S1     dr_w
        nop     5
        ADDR    a0, d_w
        ldw     .D1T1   *+a0(4), a4         ; w1, the effect id
        mvkl    .S2     d_hid, b4
        mvkh    .S2     d_hid, b4
        mvk     .L1     8, a6
        nop     2
        callp   .S2     hexn, b3
        b       .S2     b13
        nop     5

; P5: record store bank, pointers and the gap between them.
do_store:
        mv      .L2     b3, b13
        ldw     .D2T1   *+b14(REC_BANK), a10
        ldw     .D2T1   *+b14(REC_HDR), a11
        ldw     .D2T1   *+b14(REC_DATA), a12
        nop     4
        ADDR    a0, d_bank
        stw     .D1T1   a10, *a0
        sub     .L1     a12, a11, a1
        stw     .D1T1   a1, *+a0(4)         ; d_gap
        mv      .L1     a11, a4
        mvkl    .S2     d_hhdr, b4
        mvkh    .S2     d_hhdr, b4
        mvk     .L1     8, a6
        callp   .S2     hexn, b3
        mv      .L1     a12, a4
        mvkl    .S2     d_hdat, b4
        mvkh    .S2     d_hdat, b4
        mvk     .L1     8, a6
        callp   .S2     hexn, b3
        b       .S2     b13
        nop     5

; P5: the first 36 bytes of the bank at flash address A4, 4 rows of
; "oo xxxxxxxxxxxxxxxxxx" (offset, 9 bytes).
do_bank:
        mv      .L2     b3, b13
        mvkl    .S2     d_flash, b4
        mvkh    .S2     d_flash, b4
        mvk     .S1     36, a6
        FCALL   FLASH_READ
        ADDR    a10, d_flash        ; source
        ADDR    a11, d_dump         ; row buffers, 24 B each
        mvk     .L1     0, a12      ; row
db_row:
        mvk     .S1     9, a0
        mpy     .M1     a0, a12, a4
        mv      .L2X    a11, b4
        mvk     .L1     2, a6
        callp   .S2     hexn, b3
        mvk     .S1     32, a0              ; ' '
        stb     .D1T1   a0, *a4++
        mv      .L1     a4, a13             ; write position
        mvk     .L1     9, a14
db_byte:
        ldbu    .D1T1   *a10++, a4
        mv      .L2X    a13, b4
        mvk     .L1     2, a6
        nop     2
        callp   .S2     hexn, b3
        mv      .L1     a4, a13
        sub     .L1     a14, 1, a14
        mv      .L1     a14, a1
  [a1]  b       .S1     db_byte
        nop     5
        addk    .S1     24, a11
        add     .L1     1, a12, a12
        cmpgt   .L1     4, a12, a1
  [a1]  b       .S1     db_row
        nop     5
        b       .S2     b13
        nop     5

; Screen 9 draw (called by the draw dispatcher's stub, B3 = back to it).
; Frame: +4 fmt, +8..+24 snprintf values, +32.. saved registers.
probe_draw:
        addk    .S2     -96, b15
        stw     .D2T2   b3, *+b15(32)
        stw     .D2T1   a10, *+b15(36)
        stw     .D2T1   a11, *+b15(40)
        stw     .D2T1   a12, *+b15(44)
        stw     .D2T1   a13, *+b15(48)
        stw     .D2T1   a14, *+b15(52)
        stw     .D2T1   a15, *+b15(56)
        stw     .D2T2   b10, *+b15(60)
        stw     .D2T2   b11, *+b15(64)
        stw     .D2T2   b12, *+b15(68)
        stw     .D2T2   b13, *+b15(72)
        callp   .S2     derive_cpu, b3
        callp   .S2     derive_slots, b3
        callp   .S2     derive_ctx, b3
        ADDR    a0, vars
        ldw     .D1T1   *+a0(V_PAGE), a11
        nop     4
        stw     .D2T1   a11, *+b15(76)
        cmpeq   .L1     7, a11, a1
  [!a1] b       .S1     pd_5
        nop     5
        callp   .S2     do_records, b3
pd_5:
        ldw     .D2T1   *+b15(76), a11
        nop     4
        cmpeq   .L1     8, a11, a1
  [!a1] b       .S1     pd_6
        nop     5
        callp   .S2     do_store, b3
pd_6:
        ldw     .D2T1   *+b15(76), a11
        nop     4
        cmpeq   .L1     9, a11, a1
        cmpeq   .L1     10, a11, a2
        or      .L1     a1, a2, a0
  [!a0] b       .S1     pd_draw
        nop     5
        ADDR    a4, BANK0
        ADDR    a3, BANK1
  [a2]  mv      .L1     a3, a4
        callp   .S2     do_bank, b3
pd_draw:
        ldw     .D2T1   *+b15(76), a11
        ADDR    a12, pages
        mvk     .S1     156, a0
        nop     2
        mpy     .M1     a0, a11, a0
        nop     1
        add     .L1     a12, a0, a12        ; this page
        ldw     .D1T1   *a12, a0            ; title format
        ldw     .D1T1   *+a12(4), a1        ; -> its values
        ldw     .D1T1   *+a12(8), a2
        nop     4
        ldw     .D1T1   *a1, a1
        ldw     .D1T1   *a2, a2
        stw     .D2T1   a0, *+b15(4)
        nop     3
        stw     .D2T1   a1, *+b15(8)
        stw     .D2T1   a2, *+b15(12)
        ADDR    a4, d_title
        mvk     .S2     19, b4              ; 18 characters fit the title
        FCALL   SNPRINTF
        ADDR    a4, d_title
        FCALL   TITLE
        addk    .S1     12, a12
        mvk     .L1     0, a13              ; row
pd_row:
        ldw     .D1T1   *a12, a0
        nop     4
  [!a0] b       .S1     pd_next
        nop     5
        stw     .D2T1   a0, *+b15(4)
        add     .L1     4, a12, a14         ; value pointers
        addaw   .D2     b15, 2, b10         ; their stack slots
        mvk     .L1     5, a2
pd_arg:
        ldw     .D1T1   *a14++, a0
        nop     4
        ldw     .D1T1   *a0, a0
        nop     4
        stw     .D2T1   a0, *b10++
        sub     .L1     a2, 1, a2
  [a2]  b       .S1     pd_arg
        nop     5
        ADDR    a4, d_line
        mvk     .S2     22, b4              ; 21 characters fit a row
        FCALL   SNPRINTF
        mvk     .S1     9, a0
        mpy     .M1     a0, a13, a0
        mvk     .L1     0, a4
        mvkl    .S2     d_line, b4
        mvkh    .S2     d_line, b4
        addk    .S1     10, a0
        mv      .L2X    a0, b6              ; y = 10 + 9 x row
        mvk     .L1     1, a6
        FCALL   DRAW_TEXT
pd_next:
        addk    .S1     24, a12
        add     .L1     1, a13, a13
        cmpgt   .L1     6, a13, a1
  [a1]  b       .S1     pd_row
        nop     5
        ldw     .D2T2   *+b15(32), b3
        ldw     .D2T1   *+b15(36), a10
        ldw     .D2T1   *+b15(40), a11
        ldw     .D2T1   *+b15(44), a12
        ldw     .D2T1   *+b15(48), a13
        ldw     .D2T1   *+b15(52), a14
        ldw     .D2T1   *+b15(56), a15
        ldw     .D2T2   *+b15(60), b10
        ldw     .D2T2   *+b15(64), b11
        ldw     .D2T2   *+b15(68), b12
        ldw     .D2T2   *+b15(72), b13
        addk    .S2     96, b15
        b       .S2     b3
        nop     5

; ---------------------------------------------------------------- page tables

; A row: format and five pointers to its values (unused ones -> zero).
        .macro  ROW fmt, a=zero, b=zero, c=zero, d=zero, e=zero
        .word   \fmt, \a, \b, \c, \d, \e
        .endm
        .macro  NOROW
        .word   0, 0, 0, 0, 0, 0
        .endm
; Per-slot rows: slot k's values sit at base + 4k.
        .macro  SLOTROWS fmt, a, b, c, d
        ROW     \fmt, num0, \a+0, \b+0, \c+0, \d+0
        ROW     \fmt, num1, \a+4, \b+4, \c+4, \d+4
        ROW     \fmt, num2, \a+8, \b+8, \c+8, \d+8
        ROW     \fmt, num3, \a+12, \b+12, \c+12, \d+12
        ROW     \fmt, num4, \a+16, \b+16, \c+16, \d+16
        ROW     \fmt, num5, \a+20, \b+20, \c+20, \d+20
        .endm
        .equ    P, vars + P_OFS

        .align  4
; 156 B per page: title format, -> its two values, 6 rows
pages:
        .word   t_ver, sp_stamp, zero                      ; 0 what is flashed
        ROW     f_kind
        ROW     f_commit, sp_stamp+4
        ROW     f_date, sp_stamp+8
        ROW     f_s, sp_stamp+12
        NOROW
        ROW     f_turn
        .word   t_cpu, vars+V_WIN, zero                    ; 1 P1 CPU
        ROW     f_per, P+W_PSUM, P+W_PMAX
        ROW     f_blk, P+W_BMIN, P+W_BSUM, P+W_BMAX
        ROW     f_fx, P+W_FMIN, P+W_FSUM, P+W_FMAX
        ROW     f_load, d_pavg, d_pmax
        ROW     f_peak, vars+V_KBLK, d_pk
        ROW     f_dsp, d_dsp, d_dspt, d_cpu
        .word   t_slots, d_cur, d_cslot                    ; 2 P2 SLOTS
        SLOTROWS f_slot, sp_names, d_cost, d_tenth, zeros
        .word   t_cyc, vars+V_OVH, zero                       ; 3 P3 CYCLES
        SLOTROWS f_cyc, P+W_SSUM, P+W_SMAX, zeros, zeros
        .word   t_bus, zero, zero                             ; 4 P3 BUS
        SLOTROWS f_bus, P+W_F, P+W_A, P+W_D, zeros
        .word   t_ctx, d_xslot, zero                          ; 5 P6 CTX
        ROW     f_c45, sp_cx+0, sp_cx+4
        ROW     f_c67, sp_cx+8, sp_cx+12
        ROW     f_c89, sp_cx+16, sp_cx+20
        ROW     f_c10, sp_cx+24
        ROW     f_dif0, sp_dm+0, sp_dm+4, sp_dm+8
        ROW     f_dif3, sp_dm+12, sp_dm+16, sp_dm+20
        .word   t_cbus, zero, zero                            ; 6 P6 BUS
        SLOTROWS f_cbus, sp_cb, zeros, zeros, zeros
        .word   t_rec, zero, zero                             ; 7 P4 RECORDS
        ROW     f_or, sp_h14, sp_h15, sp_h17
        ROW     f_or2, sp_h110, d_recok, d_recnz
        ROW     f_slotw, d_wslot, d_w, sp_hid
        ROW     f_p1, d_w+8, d_w+12, d_w+16, d_w+20
        ROW     f_p5, d_w+24, d_w+28, d_w+32
        ROW     f_p8, d_w+36, d_w+40
        .word   t_store, zero, zero                           ; 8 P5 STORE
        ROW     f_bank, d_bank
        ROW     f_hdr, sp_hhdr
        ROW     f_dat, sp_hdat
        ROW     f_gap, d_gap
        NOROW
        NOROW
        .word   t_bank0, zero, zero                           ; 9 P5 BANK 0
        ROW     f_s, sp_dump+0
        ROW     f_s, sp_dump+4
        ROW     f_s, sp_dump+8
        ROW     f_s, sp_dump+12
        NOROW
        NOROW
        .word   t_bank1, zero, zero                           ; 10 P5 BANK 1
        ROW     f_s, sp_dump+0
        ROW     f_s, sp_dump+4
        ROW     f_s, sp_dump+8
        ROW     f_s, sp_dump+12
        NOROW
        NOROW
pages_end:

; Words holding string addresses (for %s), slot numbers, zeros.
sp_names:
        .word   d_names, d_names + 12, d_names + 24, d_names + 36, d_names + 48, d_names + 60
sp_h14: .word   d_h14
sp_h15: .word   d_h15
sp_h17: .word   d_h17
sp_h110: .word  d_h110
sp_hid: .word   d_hid
sp_hhdr: .word  d_hhdr
sp_hdat: .word  d_hdat
sp_dump: .word  d_dump, d_dump + 24, d_dump + 48, d_dump + 72
sp_stamp: .word st_ver, st_commit, st_date, st_label
sp_cx:  .word   d_cx, d_cx + 12, d_cx + 24, d_cx + 36, d_cx + 48, d_cx + 60, d_cx + 72
sp_dm:  .word   d_dm, d_dm + 4, d_dm + 8, d_dm + 12, d_dm + 16, d_dm + 20
sp_cb:  .word   d_cb, d_cb + 8, d_cb + 16, d_cb + 24, d_cb + 32, d_cb + 40
num0:   .word   0
num1:   .word   1
num2:   .word   2
num3:   .word   3
num4:   .word   4
num5:   .word   5
zero:   .word   0
zeros:  .word   0, 0, 0, 0, 0, 0

; ---------------------------------------------------------------------- data
        .align  3
        .word   0, 0                    ; vars - 8 V_RUN, vars - 4 V_ON
vars:   .space  W_BMIN
        .word   -1, -1                  ; W_BMIN, W_FMIN
        .space  192 - W_FMIN - 4
        .space  W_WORDS * 4             ; P
        .space  4
d_pavg: .word   0
d_pmax: .word   0
d_pk:   .word   0
d_cur:  .word   0
d_cslot: .word  0
d_cost: .word   0, 0, 0, 0, 0, 0
d_tenth: .word  0, 0, 0, 0, 0, 0
d_recok: .word  0
d_recnz: .word  0
d_wslot: .word  0
d_w:    .space  44
d_bank: .word   0
d_gap:  .word   0
d_names: .space 72
d_h14:  .space  4
d_h15:  .space  4
d_h17:  .space  4
d_h110: .space  4
d_hid:  .space  12
d_hhdr: .space  12
d_hdat: .space  12
d_dump: .space  96
d_title: .space 24
d_line: .space  32
d_rec:  .space  128
d_flash: .space 40
; What is flashed: 16-byte zero-padded ASCII fields. The patch file keeps
; the "<key>" placeholders; the build fills them (zoomms build --stamp, see
; the section's stamp: offsets in patches/m0-probe.yaml).
st_ver:    .ascii "<version>"
        .space  16 - 9
st_commit: .ascii "<commit>"
        .space  16 - 8
st_date:   .ascii "<date>"
        .space  16 - 6
st_label:  .ascii "<label>"
        .space  16 - 7
d_cpu:  .word   0
d_dsp:  .word   0                       ; declared DSP total: whole
d_dspt: .word   0                       ; tenths
d_xslot: .word  0
d_ctx:  .space  6 * NCTX * 4            ; ctx[4..10] of each slot at call time
d_xb:   .space  NCTX * 4                ; ctx buffer XORs before the call
d_xa:   .space  NCTX * 4                ; ... after
wc:     .space  6 * NCTX * 4            ; window: blocks each ctx buffer changed
pc:     .space  6 * NCTX * 4            ; published
zbuf:   .space  64                      ; read instead of a bad pointer
d_cx:   .space  84
d_dm:   .space  24
d_cb:   .space  48

t_ver:   .string "MIDISTOMP %s"
f_kind:  .string "BUILD DEV"
f_commit: .string "COMMIT %s"
f_date:  .string "DATE %s"
f_turn:  .string "TURN A KNOB: PROBES"
t_cpu:   .string "P1 CPU  #%d"
t_slots: .string "P2 CUR %d SLOT %d"
t_cyc:   .string "P3 CYC PRB %d"
t_bus:   .string "P3 BUS F/A/D"
t_rec:   .string "P4 RECORDS"
t_store: .string "P5 STORE"
t_bank0: .string "P5 BANK 0 3B7000"
t_bank1: .string "P5 BANK 1 3DA000"
f_per:   .string "PER %d MAX %d"
f_blk:   .string "BLK %d %d %d"
f_fx:    .string "FX  %d %d %d"
f_load:  .string "LOAD %d%% MAX %d%%"
f_peak:  .string "PEAK %d %d%%"
f_dsp:   .string "DSP %d.%d/300 CPU %d%%"
t_ctx:   .string "P6 CTX SLOT %d"
t_cbus:  .string "P6 BUS CTX 4-10"
f_c45:   .string "4 %s 5 %s"
f_c67:   .string "6 %s 7 %s"
f_c89:   .string "8 %s 9 %s"
f_c10:   .string "10 %s"
f_dif0:  .string "DIF 0:%s 1:%s 2:%s"
f_dif3:  .string "DIF 3:%s 4:%s 5:%s"
f_cbus:  .string "%d %s"
f_slot:  .string "%d %s %d.%d"
f_cyc:   .string "%d AVG %d MAX %d"
f_bus:   .string "%d F%d A%d D%d"
f_or:    .string "OR 14:%s 15:%s 17:%s"
f_or2:   .string "110:%s OK %d NZ %d"
f_slotw: .string "S%d ON%d ID %s"
f_p1:    .string "P1 %d %d %d %d"
f_p5:    .string "P5 %d %d %d"
f_p8:    .string "P8 %d  P9 %d"
f_bank:  .string "BANK IN USE %d"
f_hdr:   .string "HDR  %s"
f_dat:   .string "DATA %s"
f_gap:   .string "GAP  %d"
f_s:     .string "%s"
s_empty: .string "-"
s_mute:  .string "MUTE"
s_gain:  .string "GAIN"
s_unknown: .string "?"
