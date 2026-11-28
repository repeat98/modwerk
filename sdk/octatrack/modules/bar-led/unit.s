| BAR LED -- the tempo LED flashes green on the pattern's 1 while the
| sequencer plays; every other flash stays stock red.
|
| Stock flashes the tempo LED from its clock-message loop: message 7 (a
| clock tick, 24 a beat) calls set_led(38, 3) (0x40013784: LED id 38, the
| tempo LED's red half, lit for three 120 Hz ticks) when the tick counter
| 0x460d1e10 is 0, then counts it 0..23. Message 2 clears the counter, so
| the first tick after a start flashes. LED ids pair red (even) with green
| (odd, the next bit up), as the trig and track LEDs do, so 39 is green.
|
| The detour is that call (0x40056f24, `jsr set_led`): bl_flash gets the
| caller's two arguments on the stack (4(sp) the id, 8(sp) the count), turns
| id 38 into 39 on the pattern's 1 and tail-jumps to set_led, which returns
| to stock. d0-d1 are free there (set_led is a C function; stock reloads d0
| after it).
|
| The pattern's 1 is read from the sequencer, not counted: the master step
| 0x800065b4 (u16, the step now playing; 0x400a422c writes it each step,
| before that step's beat flash) runs 0.. and wraps at the pattern's length.
| A flash that sees a lower step than the flash before is the first since
| the wrap: green. So it follows pattern length, scale, pattern changes,
| tempo and external MIDI clock. Not playing, every flash is stock's. The
| transport word has three states (docs/firmware/STEM_REC.md): 1 plays, 0 is
| stopped and rewound, 2 is stopped with the position kept (a pause). Only 0
| rearms the last step (-1), so the first flash after PLAY from the top is
| green, while continuing from a pause compares with the step it paused on.
|
| An MKII has RGB lamps: each LED id's colour is a palette entry the firmware
| programs (led_palette 0x40013368: id, register, r, g, b; 0x400133cc gives
| the tempo key, id 38, register 1 = red and register 2 = green at the LED
| brightness setting 0x800000d0, levels 0x400abc26). Id 39 alone never shows
| green on an MKII (#1680), while id 38 is the colour every stock flash shows.
| So on an MKII (0x46c8d18c != 0) the 1 keeps id 38 and sets its register 1 to
| green for that flash; the next flash sets it back to stock's red first. The
| MKI keeps id 39, as before.
        .text
        .global bl_flash

        .equ    SET_LED, 0x40013784
        .equ    LED_PALETTE, 0x40013368 | (id, register, r, g, b), MKII only
        .equ    TRANSPORT, 0x800065b8   | 0 rewound, 1 playing, 2 paused (Euclid's EU_TRANSPORT)
        .equ    MASTER_STEP, 0x800065b4 | u16: the master step now playing
        .equ    MKII_FLAG, 0x46c8d18c   | 1 on an MKII
        .equ    LED_LEVEL, 0x800000d0   | the LED brightness setting, 0-2
        .equ    LEVELS, 0x400abc26      | the palette level per brightness (3 longs)
        .equ    LED_TEMPO, 38           | stock's beat flash: the tempo LED, red
        .equ    LED_GREEN, 39           | the MKI tempo LED's green half

bl_flash:
        move.l  (TRANSPORT).l,%d0
        subq.l  #1,%d0
        beq.s   .playing
        bpl.s   .red                    | 2, paused: keep the step it paused on
        moveq   #-1,%d0                 | 0, rewound: the next PLAY's first flash is the 1
        move.l  %d0,(bl_last).l
        bra.s   .red
.playing:
        mvz.w   (MASTER_STEP).l,%d0
        move.l  (bl_last).l,%d1
        move.l  %d0,(bl_last).l
        cmp.l   %d1,%d0
        bcc.s   .red                    | step >= the last flash's (unsigned): no wrap
        tst.l   (MKII_FLAG).l
        bne.s   .green_mkii
        moveq   #LED_GREEN,%d0
        move.l  %d0,4(%sp)              | the caller's id argument: 38 -> 39
        jmp     (SET_LED).l
.green_mkii:                            | id 38's register 1 green, then stock's flash
        bsr.s   .level
        clr.l   -(%sp)                  | b
        move.l  %d0,-(%sp)              | g
        clr.l   -(%sp)                  | r
        moveq   #1,%d0
        move.l  %d0,(bl_green).l
        bra.s   .palette
.red:
        tst.l   (bl_green).l            | only after a green flash on an MKII
        beq.s   .stock
        clr.l   (bl_green).l
        bsr.s   .level
        clr.l   -(%sp)                  | b
        clr.l   -(%sp)                  | g
        move.l  %d0,-(%sp)              | r: stock's red, as 0x400133cc sets it
.palette:
        pea     1.w
        pea     LED_TEMPO.w
        jsr     (LED_PALETTE).l
        lea     20(%sp),%sp
.stock:
        jmp     (SET_LED).l

.level:                                 | d0 = LEVELS[brightness clamped to 0..2], as 0x400133cc
        move.l  (LED_LEVEL).l,%d0
        bpl.s   1f
        moveq   #0,%d0
1:      moveq   #2,%d1
        cmp.l   %d1,%d0
        ble.s   2f
        move.l  %d1,%d0
2:      lea     (LEVELS).l,%a0
        move.l  (%a0,%d0.l*4),%d0
        rts

| In .text: a DRAM unit's text is RAM (as Apply Scene keeps its state).
        .balign 4
bl_last:
        .long   -1
bl_green:
        .long   0                       | 1 while id 38's register 1 is green (MKII)
