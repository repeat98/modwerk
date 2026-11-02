| BAR LED -- the tempo LED flashes green on beat 1 of every bar while the
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
| id 38 into 39 on the 1 and tail-jumps to set_led, which returns to stock.
| d0-d1 are free there (set_led is a C function; stock reloads d0 after it).
|
| The bar is counted from PLAY in beats: four flashes a bar. It counts
| stock's own beat flashes, so it follows tempo, external MIDI clock and
| tempo changes with no clock of its own. Stopped, every flash is stock's
| and the count is rearmed, so the next PLAY starts on the 1.
        .text
        .global bl_flash

        .equ    SET_LED, 0x40013784
        .equ    TRANSPORT, 0x800065b8   | 1 while the sequencer plays (Euclid's EU_TRANSPORT)
        .equ    LED_GREEN, 39           | the tempo LED's green half (stock flashes 38, red)

bl_flash:
        move.l  (TRANSPORT).l,%d0
        subq.l  #1,%d0
        beq.s   .playing
        moveq   #-1,%d0                 | stopped: the next PLAY's first flash is the 1
        move.l  %d0,(bl_beat).l
        jmp     (SET_LED).l
.playing:
        move.l  (bl_beat).l,%d0
        addq.l  #1,%d0
        moveq   #3,%d1
        and.l   %d1,%d0                 | beat in the bar, 0..3
        move.l  %d0,(bl_beat).l
        bne.s   .red
        moveq   #LED_GREEN,%d0
        move.l  %d0,4(%sp)              | the caller's id argument: 38 -> 39
.red:
        jmp     (SET_LED).l

| In .text: a DRAM unit's text is RAM (as Apply Scene keeps its state).
        .balign 4
bl_beat:
        .long   -1
