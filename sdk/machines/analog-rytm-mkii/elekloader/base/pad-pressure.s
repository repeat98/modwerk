| SPDX-License-Identifier: GPL-3.0-or-later
| Modwerk's Rytm base: pad pressure (Nathaniel Pavel, from the Pad Pressure
| Fix module 0.2.0). OS 1.74. A held pad's pressure reaches the sound's
| aftertouch and MIDI poly pressure during a retrig roll too, and CHROMATIC
| pads send it on the note they played.
|
| Retrig rolls: three byte sites in base.json, no code here. A pad pressure
| event goes to the top view first and to the view below only if that one
| returns 0. With RTRG (key 0x85) held or the track ALWAYS ON, and VEL.CUR 0,
| KeyboardView (0x400c74d4) and ChromPadsView (0x400c6196) write the pressure
| to the roll's velocity (0x4011f262) and branch past the aftertouch setter
| (0x4011f490) and MIDI poly pressure (0x400850f4): those branches
| (0x400c755a, 0x400c6228) become no-ops, so the pressure takes the plain
| pad's path as well. The RETRIG menu RTRG opens (pressure method
| 0x400e27cc) returns the pad's valid flag for every event, so with RTRG
| held no view below got pressure at all: its return (0x400e2924) becomes
| `moveq #0,%d0`, so the view below also gets the event and does the above.
| With VEL.CUR 0 one squeeze therefore sets both the roll's velocity, as
| stock, and the aftertouch targets, which goes past stock. With RTRG held
| the pressure also reaches PERF mode's performance pads, which stock froze.
|
| CHROMATIC note: ChromPadsView (a2 below) keeps two notes per pad: the
| pad's place in the current layout at view + 404 + 4 * pad, which UP and
| DOWN rewrite (-1 for a pad past the top), and the note a press played at
| view + 308 + 4 * pad (stored at 0x400c63be, -1 once released at
| 0x400c5a16). The note on and the note off go out 24 below the held note
| (0x400c5924, 0x400c59ca). The pressure handler instead passes the layout
| note, unchanged, to the poly pressure sender (0x400c628e), so a held pad
| sent `9n 24 vv`, then `An 3c pp`. The pressure to the sound (0x4011f490,
| per track) takes no note.
|
| mw_pad_pressure_out replaces that one call (slot, channel, note, value):
| the slot is the pad, and a2 still holds the view, so it sends the held
| note less 24, exactly the note off's note. With no held note (-1), or a
| note outside 0..127, it sends nothing, as the note on sender (0x40085856)
| refuses such a note; the sender itself queues the note's low byte
| unchecked (0x40085a8c). KeyboardView (pads outside CHROMATIC) sends note
| on and pressure through one helper (0x400c6eea) and is left alone.

        .equ    MW_PP_SEND,     0x400850f4        | (slot, channel, note, value)
        .equ    MW_PP_HELD,     308               | ChromPadsView: note held per pad
        .equ    MW_PP_OFFSET,   24                | ChromPadsView's MIDI note offset

        .text
        .align  2
        .globl  mw_pad_pressure_out
mw_pad_pressure_out:
        move.l  4(%sp),%d0                        | the slot: the pad, 0..11
        moveq   #11,%d1
        cmp.l   %d0,%d1
        bcs.s   1f                                | as the sender: no such slot
        lea     MW_PP_HELD(%a2),%a0
        move.l  (%a0,%d0.l*4),%d0                 | the note the press played
        moveq   #MW_PP_OFFSET,%d1
        sub.l   %d1,%d0
        moveq   #127,%d1
        cmp.l   %d0,%d1
        bcs.s   1f                                | none held, or out of range
        move.l  %d0,12(%sp)                       | the note the note on sent
        jmp     MW_PP_SEND
1:      moveq   #0,%d0                            | as the sender's refusal
        rts
