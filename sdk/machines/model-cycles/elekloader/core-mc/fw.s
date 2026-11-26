| SPDX-License-Identifier: GPL-2.0-or-later
| core-mc 0.2 (Model:Cycles 1.13): firmware locations as exports, as core 3.0 has
| them for the Digitakt mk1 (mods/core/fw.s). A mod that names these instead of
| the addresses needs no address of its own; mod.json (defsym FW_*) gives their
| values, and the linker resolves the names against the core in the build. In
| C: elekloader/sdk/include/model-cycles/core.h; in assembly: core.inc beside it.
| No code, no site: the core's bytes are 0.1's. Values are OS 1.13's. Each one
| is called or read by the OS's own code (an absolute jsr or operand, or for
| fw_fill and fw_fs_find_id a PC-relative call), and each was used by mods that
| run on units (hello-marker, and mods outside this repository).
|
| The project and the UI (the UI task):
|   fw_project           0x400cf866  project() -> the Project singleton, or 0
|   fw_project_tracks    0x4000eb90  project_tracks(project) -> its track selection (+48)
|   fw_selection_active  0x40012412  selection_active(selection) -> the active track 0-5
|   fw_ui_states         0x400cf9a8  ui_states() -> the UIStates singleton
|   fw_value_shown       0x4006b704  value_shown(ui_states): a parameter's value is on screen
|   fw_trig_held         0x4006b736  trig_held(ui_states): a trig is held (knobs edit its locks)
|   fw_key_held          0x4007faf4  key_held(code): FUNC 1, TRACK 2, RETRIG 4 (logical codes)
| Sounds and kits:
|   fw_kits              0x409c9c80  the 96 patterns' kits, 7094 bytes each: the six track
|                                    sounds at +28, the pool of 64 at +694, 100 bytes a sound
|   fw_play_kit          0x800017e4  -> the kit the audio side plays (the current pattern's
|                                    working copy)
| The screen (128 x 64, 1 bit; y = 0 is the bottom row):
|   fw_fill              0x400710c6  fill(bmp, x0, y0, x1, y1, colour, step)
|   fw_text              0x40071a04  text(bmp, font, x, y, flags, fmt, ...): flags 0 from x on,
|                                    2 centred on x
|   fw_font_make         0x40072260  font_make(font, glyphs): a font object {vtable, glyphs}
|   fw_font_drop         0x40072080  font_drop(font): undoes it
|   fw_font_small        0x40140ab0  glyphs, 5 x 9 pixels
|   fw_font_medium       0x4014120c  glyphs, 7 x 9 pixels
|   fw_view_redraw       0x40076bee  view_redraw(view): sets the view's byte +32, so the
|                                    screen draws it again
| The +Drive's file system (call under its lock; the lock lets its holder in
| again but does not count, so an inner unlock frees it):
|   fw_fs_mounted        0x40f07cf4  nonzero once the file system is mounted
|   fw_fs_lock_word      0x40fe6df0  its lock; +0 the task that holds it
|   fw_running_task      0x422fef30  the running task
|   fw_fs_lock           0x40001cc4  fs_lock(&fw_fs_lock_word)
|   fw_fs_unlock         0x40001df6  fs_unlock(&fw_fs_lock_word)
|   fw_fs_entry          0x4007de78  fs_entry(inode, h): h = {inode, id, size, inode word 16};
|                                    0 for a file, -1 otherwise
|   fw_fs_read           0x4007baaa  fs_read(buf, len, fh): fh = {inode, position, -, open};
|                                    the bytes read, or -1
|   fw_fs_find_id        0x4007dc30  fs_find_id(id) -> the pair's index in fw_fs_ids, or -1
|   fw_fs_ids            0x401fb8a4  the files by id: {id, inode} pairs, sorted by id

        .macro  FW name, value
        .globl  \name
        .set    \name, \value
        .endm

        FW      fw_project, FW_PROJECT
        FW      fw_project_tracks, FW_PROJECT_TRACKS
        FW      fw_selection_active, FW_SELECTION_ACTIVE
        FW      fw_ui_states, FW_UI_STATES
        FW      fw_value_shown, FW_VALUE_SHOWN
        FW      fw_trig_held, FW_TRIG_HELD
        FW      fw_key_held, FW_KEY_HELD
        FW      fw_kits, FW_KITS
        FW      fw_play_kit, FW_PLAY_KIT
        FW      fw_fill, FW_FILL
        FW      fw_text, FW_TEXT
        FW      fw_font_make, FW_FONT_MAKE
        FW      fw_font_drop, FW_FONT_DROP
        FW      fw_font_small, FW_FONT_SMALL
        FW      fw_font_medium, FW_FONT_MEDIUM
        FW      fw_view_redraw, FW_VIEW_REDRAW
        FW      fw_fs_mounted, FW_FS_MOUNTED
        FW      fw_fs_lock_word, FW_FS_LOCK_WORD
        FW      fw_running_task, FW_RUNNING_TASK
        FW      fw_fs_lock, FW_FS_LOCK
        FW      fw_fs_unlock, FW_FS_UNLOCK
        FW      fw_fs_entry, FW_FS_ENTRY
        FW      fw_fs_read, FW_FS_READ
        FW      fw_fs_find_id, FW_FS_FIND_ID
        FW      fw_fs_ids, FW_FS_IDS
