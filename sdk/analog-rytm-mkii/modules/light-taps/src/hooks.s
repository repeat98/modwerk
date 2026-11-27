        | SPDX-License-Identifier: GPL-3.0-or-later
        | Light Taps' sites in OS 1.74's panel driver. None is a branch target,
        | and no other module or the base patches them.
        |
        |   0x4008232c (6)   jsr 0x400013b2 (queue, event): posts a pad's
        |                    pressure (type 2) or strike (type 3)
        |   0x40082492 (6)   jsr 0x400013b2 (queue, event): posts a key's
        |                    press or release (type 0); pads are keys 0x90-0x9b
        |   0x40081944 (6)   addq.l #1,0x42f92114 in the panel task
        |                    (0x4008193c, about every millisecond); d0-d1/a0-a1
        |                    are dead there
        |
        | The two posts hand the event to light_taps_event, then jump to the
        | stock routine with the stack as the caller left it, so it returns to
        | the caller; the caller reloads d0-d1/a0-a1 afterwards. The tick
        | replays its instruction, then lets light_taps_poll post a light tap.

        .text
        .align  2

        .globl  light_taps_post_pad
light_taps_post_pad:
        move.l  8(%sp),-(%sp)           | the event
        jsr     light_taps_event
        addq.l  #4,%sp
        jmp     0x400013b2

        .globl  light_taps_post_key
light_taps_post_key:
        move.l  8(%sp),-(%sp)
        jsr     light_taps_event
        addq.l  #4,%sp
        jmp     0x400013b2

        .globl  light_taps_ms
light_taps_ms:
        addq.l  #1,0x42f92114           | the replaced instruction
        jsr     light_taps_poll
        rts

        | Menu label callback: the std::string to fill is the hidden return
        | pointer in a0, as MIDI Feedback's labels.s has it.
        .globl  light_taps_label
light_taps_label:
        link    %a6,#-4
        move.l  %d2,-(%sp)
        move.l  %a0,%d2
        jsr     light_taps_on
        lea     light_taps_off_text,%a1
        tst.l   %d0
        beq.s   1f
        lea     light_taps_on_text,%a1
1:      pea     -1(%a6)
        move.l  %a1,-(%sp)
        move.l  %d2,-(%sp)
        jsr     STRING_CTOR
        lea     12(%sp),%sp
        move.l  %d2,%d0
        move.l  -8(%a6),%d2
        unlk    %a6
        rts

light_taps_off_text:
        .asciz  "LIGHT TAPS: OFF"
light_taps_on_text:
        .asciz  "LIGHT TAPS: ON"
        .balign 2
