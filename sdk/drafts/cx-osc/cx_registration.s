        .text
        .balign 4
        .global cx_take_midi_note_on
cx_take_midi_note_on:
        .long   0, po_mon
        .global cx_take_midi_note_off
cx_take_midi_note_off:
        .long   0, po_moff
        .global cx_fmstart
        .type   cx_fmstart, @function
cx_fmstart:
        jmp     po_fmstart
        .size   cx_fmstart, .-cx_fmstart
        .balign 4
        .global cx_machine
cx_machine:
        .long   1                      | MODWERK_MACHINE_ABI
        .byte   'C', 'X', 1, 1
        .long   cx_machine_label
        .long   785                    | PROTECT | SETUP_ALL | START | NATIVE_FLEX
        .long   0
        .long   fm_defaults
        .long   0                      | base signs the Part and applies fm_defaults
        .long   0                      | admit_track
        .long   0                      | base resolves the CX signature
        .long   fm_track_page          | track_page (Modwerk registry; not fm_descriptor)
        .long   cx_ui_tick             | ui_tick (registry; not fm_tick)
        .long   0                      | leave
        .long   0                      | pool_open
        .long   0                      | pool_left
        .long   0                      | choice_left
        .long   0                      | list_draw
        .long   sy_render              | render
        .long   0                      | PROTECT lets the base validate FLEX safely
        .word   0, 0
        .byte   0, 0, 0, 0
cx_machine_label:
        .asciz  "CX OSC"
        .balign 4
        .global cx_machine_start
        .type   cx_machine_start, @object
        .size   cx_machine_start, 16
cx_machine_start:
        .long   1                      | MODWERK_MACHINE_START_ABI
        .long   16
        .long   cx_machine
        .long   cx_fmstart
