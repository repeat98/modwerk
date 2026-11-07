| Digi Expression: the EXPRESSION row in SETTINGS (core hook ev_settings), as
| Digi Matrix adds its MOD MATRIX row. YES on it opens the page (page.c).
| OS 1.54 addresses.

        .equ    STRING_CTOR, 0x4017af20         | std::string(this, const char *, alloc &)

        .text
        .globl  me_settings
me_settings:
        pea     row_expression
        move.l  8(%sp), -(%sp)                  | the menu
        jsr     core_additem
        addq.l  #8, %sp
        rts

| the row's label: builds the std::string in a0
row_label:
        link    %a6, #-4
        move.l  %d2, -(%sp)
        pea     -1(%a6)
        pea     str_row
        move.l  %a0, %d2
        move.l  %a0, -(%sp)
        jsr     STRING_CTOR
        lea     12(%sp), %sp
        move.l  %d2, %d0
        move.l  -8(%a6), %d2
        unlk    %a6
        rts

        .balign 4
row_expression:
        .long   row_label, me_settings_select, me_settings_rowdraw, me_settings_change
str_row:
        .asciz  "EXPRESSION"
        .balign 2
