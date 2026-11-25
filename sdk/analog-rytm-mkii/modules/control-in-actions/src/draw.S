// SPDX-License-Identifier: GPL-3.0-or-later
// Control In Actions: the CONTROL INPUT view's draw reaches here where it
// asks whether MODE is EXPR (the site at 0x4013077c), with MODE in d0, the
// view in a2, the screen in d2 and the jack's level, mV, in d3. EXPR goes on
// to stock's bars once the module has seen which learn is open; ACTION
// draws the module's; any other mode ends the draw, as stock's.

#include "ar2-1.74.h"

        .text
        .globl  control_in_actions_draw_glue
control_in_actions_draw_glue:
        moveq   #2,%d1
        cmpl    %d0,%d1
        beqs    1f
        moveq   #MODE_FSW,%d1
        cmpl    %d0,%d1
        bnes    2f
        movel   %d3,%sp@-
        movel   %d2,%sp@-
        movel   %a2,%sp@-
        jsr     control_in_actions_draw
        lea     %sp@(12),%sp
2:      jmp     DRAW_END_AT
1:      movel   %a2,%sp@-
        jsr     control_in_actions_expr
        addql   #4,%sp
        jmp     DRAW_EXPR_AT
