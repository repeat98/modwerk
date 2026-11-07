| SPDX-License-Identifier: GPL-3.0-or-later
| MIDI Engine: the two stock sites it patches (OS 1.74 addresses in build.json).
|
| notes_gate: the audio interrupt's note branch, where a queued trig event
| of kind 1 (a note) plays, over `adda.l #EVENTS,%a3` (6 bytes), re-emitted:
| a3 is then the event and d2 its track. Stock reads d0, d1, a0 and a1 again
| after this point only once it has set them, but they are kept anyway, as
| is everything the C handler might touch.
|
| wait_gate: the MIDI note task's wait for its next message, over its
| `jsr` (6 bytes), with the mailbox argument stock pushed. It waits as stock
| does, then sends what the engine queued, and returns the message in d0.

        .text
        .extern midi_engine_trig, midi_engine_drain

        .align  2
        .globl  midi_engine_notes_gate
midi_engine_notes_gate:
        adda.l  #midi_engine_events,%a3           | stock: a3 = the event
        lea     -16(%sp),%sp
        movem.l %d0-%d1/%a0-%a1,(%sp)
        move.l  %a3,-(%sp)                        | the event
        move.l  %d2,-(%sp)                        | its track
        jsr     midi_engine_trig
        addq.l  #8,%sp
        movem.l (%sp),%d0-%d1/%a0-%a1
        lea     16(%sp),%sp
        jmp     midi_engine_notes_resume

        .align  2
        .globl  midi_engine_wait_gate
midi_engine_wait_gate:
        move.l  4(%sp),-(%sp)                     | the mailbox
        jsr     midi_engine_stock_wait
        addq.l  #4,%sp
        move.l  %d0,-(%sp)                        | the message
        jsr     midi_engine_drain
        move.l  (%sp)+,%d0
        rts
