; RAM canary test (issue #19), MS-70CDR 2.10 OS. Diagnostic build only, never
; released.
;
; The space audit (issue #19) lists RAM with no static reference in the OS. This
; fills each region with a known pattern (word = its address ^ KEY) once,
; on the first 16 ms footswitch round after boot, and the VERSION screen
; (renamed RAMTEST) counts how many words in each region no longer hold it.
; A region that stays at 0 while the pedal is used is free.
;
; Loaded in DDR at 0xC00F1380, right after the OS image (ends 0xC00F1364), so
; stock code reaches it with a plain callp (ram-test.yaml):
;   0xC00C6998 (Task_SwitchNrmlSpdRead, already -> poll trampoline) -> ram_poll
;   0xC00A93D0 (screen 9 draw stub, callp 0xC00A8428) -> ram_draw
; SDRAM is filled and read through the uncached alias 0xC8xxxxxx (the OS's
; own DMA buffers use it), so the cache never hides a write.

        .equ    POLL_TRAMP, 0xC00C82D0      ; midi-clock.yaml, to poll.S
        .equ    TITLE, 0xC00A7378           ; (title)
        .equ    TITLE_STR, 0xC00E900D       ; "VERSION", RAMTEST in this build
        .equ    SNPRINTF, 0xC00DDEE0        ; (buf, size, fmt on stack +4, ...)
        .equ    TEXT, 0xC00A0040            ; (0, text, x, y)
        .equ    SOFTKEY, 0xC009F8F0         ; (knob, text, 0)
        .equ    S_EMPTY, 0xC00E9101
        .equ    S_EXIT, 0xC00E90FC
        .equ    KEY, 0x5AA5C33C
        .equ    UNCACHED, 0x08000000
        .equ    NREG, 5

        .macro  FCALL target
        mvkl    .S2     \target, b5
        mvkh    .S2     \target, b5
        b       .S2     b5
        addkpc  .S2     ret\@, b3, 4
ret\@:
        .endm

        .text
        .nocmp
; Replaces Task_SwitchNrmlSpdRead's call: fill once, then the poll as before.
ram_poll:
        mvkl    .S1     filled, a0
        mvkh    .S1     filled, a0
        ldw     .D1T1   *a0, a1
        mvkl    .S2     POLL_TRAMP, b0
        mvkh    .S2     POLL_TRAMP, b0
        nop     2
  [a1]  b       .S2     b0                  ; B3 still returns to the task
        nop     5
        mvk     .L1     1, a1
        stw     .D1T1   a1, *a0
        mvkl    .S1     regions, a8
        mvkh    .S1     regions, a8
        mvk     .S2     NREG, b2
        mvkl    .S1     KEY, a7
        mvkh    .S1     KEY, a7
fill_reg:
        ldw     .D1T1   *a8++, a4           ; start
        ldw     .D1T2   *a8++, b4           ; end
        add     .L1     4, a8, a8           ; skip the count
        sub     .L2     b2, 1, b2
        nop     2
fill_word:
        xor     .L1     a4, a7, a3
        stw     .D1T1   a3, *a4++
        cmpgtu  .L2X    b4, a4, b1
  [b1]  b       .S1     fill_word
        nop     5
  [b2]  b       .S1     fill_reg
        nop     5
        b       .S2     b0
        nop     5

; A4 = start, B4 = end -> A4 = words not holding the pattern.
count:
        mvk     .L1     0, a6
        mvkl    .S1     KEY, a7
        mvkh    .S1     KEY, a7
cnt_word:
        ldw     .D1T1   *a4, a5
        xor     .L1     a4, a7, a3
        add     .L1     4, a4, a4
        cmpgtu  .L2X    b4, a4, b1
        nop     1
        cmpeq   .L1     a5, a3, a1
  [!a1] add     .L1     1, a6, a6
  [b1]  b       .S1     cnt_word
        nop     5
        mv      .L1     a6, a4
        b       .S2     b3
        nop     5

; Screen 9 draw: title, the five counts, EXIT on the middle knob.
ram_draw:
        addk    .S2     -64, b15
        stw     .D2T2   b3, *+b15(48)
        stw     .D2T1   a10, *+b15(52)
        stw     .D2T1   a11, *+b15(56)
        mvkl    .S1     TITLE_STR, a4
        mvkh    .S1     TITLE_STR, a4
        FCALL   TITLE
        mvkl    .S1     regions, a10
        mvkh    .S1     regions, a10
        mvk     .S1     NREG, a11
cnt_reg:
        ldw     .D1T1   *a10++, a4
        ldw     .D1T2   *a10++, b4
        nop     4
        callp   .S2     count, b3
        sub     .L1     a11, 1, a11
        mv      .L1     a11, a1
        stw     .D1T1   a4, *a10++          ; the region's count
  [a1]  b       .S1     cnt_reg
        nop     5
        mvkl    .S1     lines, a10
        mvkh    .S1     lines, a10
        mvk     .S1     3, a11
line:
        ldw     .D1T1   *a10++, a0          ; fmt
        ldw     .D1T1   *a10++, a1          ; first count
        ldw     .D1T1   *a10++, a2          ; second count
        ldw     .D1T2   *a10++, b6          ; y
        nop     4
        ldw     .D1T1   *a1, a1
        ldw     .D1T1   *a2, a2
        stw     .D2T1   a0, *+b15(4)
        stw     .D2T2   b6, *+b15(60)
        nop     2
        stw     .D2T1   a1, *+b15(8)
        stw     .D2T1   a2, *+b15(12)
        addaw   .D1X    b15, 4, a4
        mvk     .S2     32, b4
        FCALL   SNPRINTF
        mvk     .L1     0, a4
        addaw   .D2     b15, 4, b4
        mvk     .S1     6, a6
        ldw     .D2T2   *+b15(60), b6
        nop     4
        FCALL   TEXT
        sub     .L1     a11, 1, a11
        mv      .L1     a11, a1
  [a1]  b       .S1     line
        nop     5
        mvk     .L1     0, a4
        mvkl    .S2     S_EMPTY, b4
        mvkh    .S2     S_EMPTY, b4
        mvk     .L1     0, a6
        FCALL   SOFTKEY
        mvk     .L1     1, a4
        mvkl    .S2     S_EXIT, b4
        mvkh    .S2     S_EXIT, b4
        mvk     .L1     0, a6
        FCALL   SOFTKEY
        mvk     .L1     2, a4
        mvkl    .S2     S_EMPTY, b4
        mvkh    .S2     S_EMPTY, b4
        mvk     .L1     0, a6
        FCALL   SOFTKEY
        ldw     .D2T2   *+b15(48), b3
        ldw     .D2T1   *+b15(52), a10
        ldw     .D2T1   *+b15(56), a11
        nop     4
        addk    .S2     64, b15
        b       .S2     b3
        nop     5

        .align  4
; Regions (issue #19): start, end, count. Derived on the 70CDR OS like the
; 50G's: outside the image (ends 0xC00F1364), the six per-slot delay arenas
; (zero-init 0xC0200000-0xC0636980: 6 x 0x7800 + 6 x 0xAC440), the DMA buffers
; (0xC87D0000 + 0x24000) and 0xC0000000-0xC009DFAC; no image or cinit-data
; word points into the rest (the cinit data was decoded).
; 1 starts above our DDR sections (0xC00F2000-0xC00F307F in use).
; 1-2: the 50G OS had an overlay table at 0xC0198000-0xC01ADAD4 (so 1 ended
;   0xC0198000 and 2 began 0xC01ADAD4); the 70CDR has none, so 2 starts at
;   0xC0198000. The split stays so the counts compare with the 50G's.
; 3-5 are the 50G's: same arenas, DMA and shared RAM (0x80000000 only appears
;   in float constants, never as an address).
regions:
        .word   0xC00F3100 | UNCACHED, 0xC0198000 | UNCACHED, 0
        .word   0xC0198000 | UNCACHED, 0xC0200000 | UNCACHED, 0
        .word   0xC0636980 | UNCACHED, 0xC07D0000 | UNCACHED, 0
        .word   0xC07F4000 | UNCACHED, 0xC0800000 | UNCACHED, 0
        .word   0x80000000, 0x80020000, 0   ; shared RAM, if the chip has it
filled: .word   0
; fmt, first count, second count, y (the stock VERSION rows)
lines:  .word   f12, regions + 8, regions + 20, 16
        .word   f34, regions + 32, regions + 44, 28
        .word   f5, regions + 56, regions + 56, 40
f12:    .string "1:%d 2:%d"
f34:    .string "3:%d 4:%d"
f5:     .string "5:%d"
