| SPDX-License-Identifier: GPL-2.0-or-later
| Modwerk's Digitakt II core: OS 1.17 firmware locations exported to modules (values from mod.json's defsym).
        .macro  FW name, value
        .globl  \name
        .set    \name, \value
        .endm

        FW      fw_led_set, FW_LED_SET
        FW      fw_invalidate, FW_INVALIDATE
        FW      fw_textbox, FW_TEXTBOX
        FW      fw_font_menu, FW_FONT_MENU
        FW      fw_op_new, OP_NEW
