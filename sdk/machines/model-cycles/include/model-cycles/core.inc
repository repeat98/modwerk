| SPDX-License-Identifier: GPL-2.0-or-later
| Modwerk's Model:Cycles core (OS 1.13): constants for assembly. The fw_* locations are
| symbols of the core (fw.s); name them directly. C: model-cycles/core.h.

| Logical key codes fw_key_held takes.
        .equ FW_KEY_FUNC, 1
        .equ FW_KEY_TRACK, 2
        .equ FW_KEY_RETRIG, 4

| Kits: fw_kits + FW_KIT_SIZE * n is pattern n's kit (0-95); track sounds at +FW_KIT_SOUNDS
| (six), the pool at +FW_KIT_POOL (64), FW_SOUND_SIZE bytes per sound.
        .equ FW_KIT_SIZE, 7094
        .equ FW_KIT_SOUNDS, 28
        .equ FW_KIT_POOL, 694
        .equ FW_SOUND_SIZE, 100
        .equ FW_SOUND_MACHINE, 38

| The project's track objects: the first at project + FW_TRACK_OBJECTS, FW_TRACK_OBJECT
| bytes apart; word +40 of a track object's vtable returns its live sound.
        .equ FW_TRACK_OBJECTS, 212
        .equ FW_TRACK_OBJECT, 68
