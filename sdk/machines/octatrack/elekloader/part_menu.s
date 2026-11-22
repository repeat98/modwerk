| SPDX-License-Identifier: MIT
| The sites of the Part Edit menu (part_menu.c, events.json ot_part_menu). Each of stock's three Part Edit openers
| ends in jsr 0x4006d94c (the popup) with its five arguments on the stack; the base's opener takes the same
| arguments and returns to the opener's own stack pop. No stock bytes are replayed.
        .text
        .balign 2
        .global mw_part_menu_at_4002dc68, mw_part_menu_at_4002dc90, mw_part_menu_at_4002dcc4
mw_part_menu_at_4002dc68:
        jsr mw_part_menu_open
        jmp 0x4002dc6e
mw_part_menu_at_4002dc90:
        jsr mw_part_menu_open
        jmp 0x4002dc96
mw_part_menu_at_4002dcc4:
        jsr mw_part_menu_open
        jmp 0x4002dcca
