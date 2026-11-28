| SPDX-License-Identifier: MIT
| Modwerk take-hook entries. No shared-site patch, no embedded stock byte.
| The MIDI continuation keeps held-note matching, gate and live recording.
        .text
        .global sw_usb_midi_on, sw_usb_midi_off, sw_usb_chrom_pitch, sw_usb_chrom_release, sw_usb_claim_chromatic
| A no-argument take predicate still sees the site's callee-saved d2. Use
| that track, not the panel-selected one (a held key may belong elsewhere).
        .type sw_usb_claim_chromatic,@function
sw_usb_claim_chromatic:
        move.l %d2,-(%sp)
        jsr sw_usb_claim
        addq.l #4,%sp
        rts
        .size sw_usb_claim_chromatic,.-sw_usb_claim_chromatic
        .type sw_usb_midi_on,@function
sw_usb_midi_on:
        mvz.b (%a3),%d0
        subi.l #20,%d0
        move.l %d0,%a0
        moveq #29,%d1
        move.l %d1,(%a5,%d2.l*4)
        jmp 0x4000e754
        .size sw_usb_midi_on,.-sw_usb_midi_on

        .type sw_usb_midi_off,@function
sw_usb_midi_off:
        mvs.b (%a0),%d1
        mvs.b (%a3),%d0
        cmp.l %d1,%d0
        bne .midi_old_note
        lea -20(%sp),%sp
        movem.l %d0-%d1/%a0-%a1,4(%sp)
        move.l %d2,(%sp)
        jsr sw_usb_release_track
        movem.l 4(%sp),%d0-%d1/%a0-%a1
        lea 20(%sp),%sp
        jmp 0x4000dfdc
.midi_old_note:
        jmp 0x4000dff8
        .size sw_usb_midi_off,.-sw_usb_midi_off

        .type sw_usb_chrom_pitch,@function
sw_usb_chrom_pitch:
        lea 52(%a2),%a2
        mvz.b 0x100b14cf,%d0
        rts
        .size sw_usb_chrom_pitch,.-sw_usb_chrom_pitch

        .type sw_usb_chrom_release,@function
sw_usb_chrom_release:
        mvz.b (%a0,%d2.l),%d1
        move.l %a2,%d0
        addq.l #1,%d0
        cmp.l %d0,%d1
        bne .chrom_old_note
        lea -20(%sp),%sp
        movem.l %d0-%d1/%a0-%a1,4(%sp)
        move.l %d2,(%sp)
        jsr sw_usb_release_track
        movem.l 4(%sp),%d0-%d1/%a0-%a1
        lea 20(%sp),%sp
.chrom_old_note:
        move.l %a2,%d0
        jmp 0x4004fbe4
        .size sw_usb_chrom_release,.-sw_usb_chrom_release

        .section .rodata
        .align 4
        .global sw_usb_take_midi_on, sw_usb_take_midi_off, sw_usb_take_chrom_pitch, sw_usb_take_chrom_release
sw_usb_take_midi_on:
        .long sw_usb_claim,sw_usb_midi_on
        .type sw_usb_take_midi_on,@object
        .size sw_usb_take_midi_on,8
sw_usb_take_midi_off:
        .long sw_usb_claim,sw_usb_midi_off
        .type sw_usb_take_midi_off,@object
        .size sw_usb_take_midi_off,8
sw_usb_take_chrom_pitch:
        .long sw_usb_claim_chromatic,sw_usb_chrom_pitch
        .type sw_usb_take_chrom_pitch,@object
        .size sw_usb_take_chrom_pitch,8
sw_usb_take_chrom_release:
        .long sw_usb_claim_chromatic,sw_usb_chrom_release
        .type sw_usb_take_chrom_release,@object
        .size sw_usb_take_chrom_release,8
