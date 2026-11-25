| SPDX-License-Identifier: GPL-2.0-or-later
| core-mc 0.2 for the Model:Cycles (OS 1.13), in assembly: the constants that go
| with the firmware locations (core.h has the same in C). Assembly names the
| locations directly: fw_project, fw_fill, fw_key_held, ...
| The SDK puts this folder on the include path:
|
|       .include "model-cycles/core.inc"

        .equ    FW_KEY_FUNC,        1           | logical codes fw_key_held takes
        .equ    FW_KEY_TRACK,       2
        .equ    FW_KEY_RETRIG,      4
        .equ    FW_KIT_SIZE,        7094        | fw_kits: 96 kits, this far apart
        .equ    FW_KIT_SOUNDS,      28          | a kit's six track sounds, 100 bytes each
        .equ    FW_KIT_POOL,        694         | its pool of 64 sounds
        .equ    FW_SOUND_SIZE,      100
        .equ    FW_SOUND_MACHINE,   38          | a sound's byte: its machine, 0-5 stock
        .equ    FW_TRACK_OBJECTS,   212         | the project's track objects, 68 bytes apart;
        .equ    FW_TRACK_OBJECT,    68          | +40 of one's vtable gives its live sound
