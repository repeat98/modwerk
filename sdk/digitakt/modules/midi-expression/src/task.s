| SPDX-License-Identifier: GPL-3.0-or-later
| MIDI Expression: the MIDI tracks' task sends what the mod has pending (OS 1.54).
|
| After each record from its queue, the task makes its per-track pass and
| then sends its two buffers:
|     400e1dbe  move.b 0x421b6620,%d0     | the notes buffer's length
|     400e1dc4  beq.s  0x400e1dd6
|     ...       midi_out(notes), then midi_out(CCs) if 0x421b6a21 is not 0
| A 6-byte jsr site at 0x400e1dbe calls me_task_hook: me_task_pass (expr.c)
| appends the pending values to the CC buffer; then the instruction, last,
| so the beq tests its flags as stock. %d2 (the loop's count) and every
| other register are kept; %d0 is set as the instruction sets it.

        .section .run, "ax"
        .balign 2
        .globl  me_task_hook
me_task_hook:
        lea     -16(%sp), %sp
        movem.l %d1/%a0-%a1, (%sp)
        jsr     me_task_pass
        movem.l (%sp), %d1/%a0-%a1
        lea     16(%sp), %sp
        move.b  0x421b6620, %d0
        rts
