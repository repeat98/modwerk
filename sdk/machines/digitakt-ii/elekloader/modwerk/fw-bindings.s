| SPDX-License-Identifier: GPL-2.0-or-later
| OS 1.17 firmware bindings used by Modwerk's scheduler and module pages.
        .macro  FW name, value
        .globl  \name
        .set    \name, \value
        .endm

        FW      fw_fillrect, FW_FILLRECT
        FW      fw_textf, FW_TEXTF
        FW      fw_font, FW_FONT
        FW      fw_font_narrow, FW_FONT_NARROW
        FW      fw_key_down, FW_KEY_DOWN
        FW      fw_enc_init, FW_ENC_INIT
        FW      fw_enc_list, FW_ENC_LIST
        FW      fw_enc_param, FW_ENC_PARAM
        FW      fw_ui_states, FW_UI_STATES
        FW      fw_brain, FW_BRAIN
        FW      fw_vt_main, FW_VT_MAIN
        FW      fw_vt_func, FW_VT_FUNC
        FW      fw_str_new, FW_STR_NEW
        FW      fw_memcpy, MEMCPY
        FW      fw_patterns, FW_PATTERNS
        FW      fw_pattern_size, FW_PATTERN_SIZE
