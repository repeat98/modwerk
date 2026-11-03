| Retrig Grid: the SETTINGS row's label callback. The firmware's MenuItem
| calls it as a std::function returning a std::string: the string to build is
| at a0 (the return slot), and d0 returns a0. It builds the string from
| retrig_grid_text() through the firmware's std::string constructor
| (STRING_CTOR, build.json), as core-ar2's store-check example does.
        .text
        .globl  retrig_grid_label
        .align  2
retrig_grid_label:
        link    %a6, #-4
        move.l  %d2, -(%sp)
        move.l  %a0, %d2                | the return slot
        jsr     retrig_grid_text        | d0 = the text; keeps d2
        pea     -1(%a6)                 | the allocator, a byte on the frame
        move.l  %d0, -(%sp)
        move.l  %d2, -(%sp)
        jsr     STRING_CTOR
        lea     12(%sp), %sp
        move.l  %d2, %d0
        move.l  -8(%a6), %d2
        unlk    %a6
        rts
