| SPDX-License-Identifier: GPL-3.0-or-later
| The stock OS routines Track Names calls. Addresses only (build.json's defsym);
| no firmware bytes.
        .macro  FW name, value
        .globl  \name
        .set    \name, \value
        .endm
        FW      tn_fillrect, FW_FILLRECT
        FW      tn_textf, FW_TEXTF
        FW      tn_font, FW_FONT
        FW      tn_font_narrow, FW_FONT_NARROW
