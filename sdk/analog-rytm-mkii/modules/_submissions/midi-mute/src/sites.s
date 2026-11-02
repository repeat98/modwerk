| MIDI Mute: the two per-track calls inside stock's MIDI note routines
| (OS 1.74). Each site's whole call - its argument pushes, the jsr and the
| stack pop - becomes `jsr` to one of these and NOPs, so nothing branches
| into the replaced bytes. Each one calls the C handler with the call's own
| arguments; the handler plays or releases through stock itself. d0-d1/a0-a1
| are free at both sites; the C handlers keep every other register.
        .text

| note_on_site, over 0x400845e4 (26 bytes): the note-on routine's loop over
| the tracks a note is for. d3 = track, d6 = pitch, a4 = interface; the
| velocity is the routine's third argument, 52(%sp) here.
        .globl  midi_mute_on_site
        .align  2
midi_mute_on_site:
        move.l  52(%sp), %d0            | velocity
        move.l  %a4, -(%sp)             | interface
        move.l  %d0, -(%sp)
        move.l  %d6, -(%sp)             | pitch
        move.l  %d3, -(%sp)             | track
        jsr     midi_mute_note_on
        lea     16(%sp), %sp
        rts

| port_rows_site, by jmp over 0x40048486 (6 bytes): PORT CONFIG's
| constructor (MidiConfigMenuView) after its last row, RECEIVE CC/NRPN, has
| been added; a4 is the view, the menu its rows go to. The constructor's
| epilogue is re-emitted after the call.
        .globl  midi_mute_port_rows_site
        .align  2
midi_mute_port_rows_site:
        move.l  %a4, -(%sp)
        jsr     midi_mute_port_rows
        addq.l  #4, %sp
        movem.l 24(%sp), %d2-%d6/%a2-%a6
        lea     128(%sp), %sp
        rts

| note_off_site, over 0x400844a4 (14 bytes): the note-off routine's loop.
| d4 = track, d2 = pitch; the interface is the routine's third argument,
| 40(%sp) here. d3 (the routine's track mask) is kept.
        .globl  midi_mute_off_site
        .align  2
midi_mute_off_site:
        move.l  40(%sp), %d0            | interface
        move.l  %d0, -(%sp)
        move.l  %d2, -(%sp)             | pitch
        move.l  %d4, -(%sp)             | track
        jsr     midi_mute_note_off
        lea     12(%sp), %sp
        rts
