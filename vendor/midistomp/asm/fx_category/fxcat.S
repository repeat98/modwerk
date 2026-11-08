; Effect select: a 3 x 2 category screen on the MS-70CDR 2.10 OS.
;
; The stock category screen (B14[88] = 32 change effect, 33 add effect unit)
; has 5 spots. This gives it 6, in a 3 x 2 grid, one effect group per spot
; and EXIT last, after the category screen of Zoom's MS pedals as an idea:
;     DYN/FLTR  OD/DIST  AMP        cursor 0 1 2       gid 1 3 4
;     MOD/SFX   DLY/REV  EXIT              3 4 5           6 8
;   cursor:  mod 6 (0xC00A7A50/56); x / y tables here with 6 spots, three
;            columns 42 px apart, rows at y 10 and 36 (the stock ones hold 5,
;            other data follows); keys 68 / 70 move column-wise, 0 3 1 4 2 5
;            (jump table 0xC00EF18C), keys 72 / 74 stay +-1.
;   enter:   ENTER (event 32) on EXIT (cursor 5) leaves; on any other spot
;            the stock code puts the first effect of its gid in the unit; an
;            empty gid gives effect 0, a blank unit.
;   tbl:     the gid per spot, here (the stock table holds 4, other data
;            follows).
;   draw:    labels 1-4 point at the group names below, row 2 at x 3
;            (fx-category.yaml); DLY/REV and the EXIT box here.
; One gid per spot: ENTER puts the first effect of that gid in the unit, the
; effect knob then scrolls on through the sorted list, so Filter (2) follows
; DYN, SFX (7) follows MOD and Reverb (9) follows DLY.
; The knob 2 press does what it does on the stock screen.
;
; In DDR at 0xC00F2A00, between midi-cc (to 0xC00F29A0) and looper
; (0xC00F3000), below RAM test region 1 (fx-category.yaml).

        .equ    BOX, 0xC00A0144             ; box(A4 0, B4 x0, A6 y0, B6 x1, A8 y1, B8 1)
        .equ    LABEL, 0xC00A8B34           ; label(A4 str, B4 x, A6 y, B6 4)
        .equ    RET, 0xC00A7BF0             ; key handlers: return A4
        .equ    EXIT, 0xC00A7BE6            ; key handler: B14[80] = 0, return 1
        .equ    GO, 0xC00A7B04              ; key handler: stock ENTER, B4 = cursor

        .text
        .nocmp
tbl:    .word   1, 3, 4, 6, 8, 0            ; gid per spot, [5] EXIT
xs:     .word   1, 43, 85, 1, 43, 85        ; cursor box x: 3 columns, 42 px apart
ys:     .word   10, 10, 10, 36, 36, 36      ; cursor box y: 2 rows
nxt:    .word   3, 4, 5, 1, 2, 0            ; column-wise: 0 3 1 4 2 5
prv:    .word   5, 3, 4, 0, 1, 2
        .global s1, s2, s3, s4, s5          ; the group names
s2:     .string "OD/ DIST", 0
s3:     .string "AMP", 0
s4:     .string "MOD/SFX ", 0
s5:     .string "DLY/REV ", 0
s1:     .string "DYN/FLTR", 0         ; last: its word at +156 ("LTR") has bit 0 clear, no p-bit into draw

        .align  32
        .global draw
draw:           ; at +160, from the EXIT box call (0xC00A90D4); B3 = return
        stw     .D2T2   b3, *b15--[2]
        mvkl    .S2     box, b3             ; label("DLY/REV ", 45, 38, 4), back to box
     || mvkl    .S1     s5, a4
        mvkh    .S2     box, b3
     || mvkh    .S1     s5, a4
        mvkl    .S2     LABEL, b0
        mvkh    .S2     LABEL, b0
        b       .S2     b0
        mvk     .S2     45, b4
        mvk     .S1     38, a6
        mvk     .L2     4, b6
        nop     2
box:            ; the EXIT box at spot 5, then back to the caller
        ldw     .D2T2   *++b15[2], b3
        mvkl    .S2     BOX, b0
        mvkh    .S2     BOX, b0
        b       .S2     b0
        mvk     .L1     0, a4
     || mvk     .S2     87, b4
        mvk     .S1     38, a6
     || mvk     .S2     124, b6
        mvk     .S1     60, a8
     || mvk     .L2     1, b8
        nop     2

        .align  32
        .global next
next:           ; key 70, from the jump table; B4 = cursor
        mvkl    .S1     nxt, a3
     || b       .S2     move
        mvkh    .S1     nxt, a3
        nop     4

        .global prev
prev:           ; key 68
        mvkl    .S1     prv, a3
        mvkh    .S1     prv, a3
move:           ; cursor = a3[cursor]
        mv      .L1X    b4, a5
        ldw     .D1T1   *+a3[a5], a4
        mvkl    .S2     RET, b0
        mvkh    .S2     RET, b0
        nop     3
        stw     .D2T1   a4, *+b14(356)      ; B14[89], the cursor
        b       .S2     b0
        mvk     .L1     1, a4
        nop     4

        .align  32
        .global enter
enter:          ; from 0xC00A7B00 (ENTER); B4 = cursor, kept for the stock ENTER
        mvkl    .S2     GO, b0
     || cmpeq   .L2     5, b4, b1           ; EXIT spot
        mvkh    .S2     GO, b0
  [b1]  mvkl    .S2     EXIT, b0
  [b1]  mvkh    .S2     EXIT, b0
        b       .S2     b0
        nop     5
