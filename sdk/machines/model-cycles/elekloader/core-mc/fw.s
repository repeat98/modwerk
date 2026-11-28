| SPDX-License-Identifier: GPL-3.0-or-later
| Modwerk's Model:Cycles core: where OS 1.13 keeps the routines and data modules use, as
| absolute global symbols. No bytes: a module that names one links to the address here, so
| it carries no stock address of its own. C API and conventions: model-cycles/core.h.

        .macro fw name, addr
        .globl \name
        .set \name, \addr
        .endm

| Project and UI state (call from the UI task only).
        fw fw_project,          0x400cf866
        fw fw_project_tracks,   0x4000eb90
        fw fw_selection_active, 0x40012412
        fw fw_ui_states,        0x400cf9a8
        fw fw_value_shown,      0x4006b704
        fw fw_trig_held,        0x4006b736
        fw fw_key_held,         0x4007faf4

| Kits: the 96 patterns' kits, and the pointer to the one the audio side plays.
        fw fw_kits,             0x409c9c80
        fw fw_play_kit,         0x800017e4

| Screen and fonts.
        fw fw_fill,             0x400710c6
        fw fw_text,             0x40071a04
        fw fw_font_make,        0x40072260
        fw fw_font_drop,        0x40072080
        fw fw_font_small,       0x40140ab0
        fw fw_font_medium,      0x4014120c
        fw fw_view_redraw,      0x40076bee

| +Drive file system.
        fw fw_fs_mounted,       0x40f07cf4
        fw fw_fs_lock_word,     0x40fe6df0
        fw fw_running_task,     0x422fef30
        fw fw_fs_lock,          0x40001cc4
        fw fw_fs_unlock,        0x40001df6
        fw fw_fs_entry,         0x4007de78
        fw fw_fs_read,          0x4007baaa
        fw fw_fs_find_id,       0x4007dc30
        fw fw_fs_ids,           0x401fb8a4
