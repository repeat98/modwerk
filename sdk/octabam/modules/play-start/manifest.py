from remix.stock_guard import stock_guard
"""PLAY_START -- PERSONALIZE -> PLAY START checkbox: empty (stock play/pause)
or ticked ([PLAY] always starts the sequencer from the beginning).

Default empty, so installing the module changes nothing until the musician
ticks it. STOP, MIDI START/CONTINUE/STOP, and [REC]+[PLAY] stay stock.

When 0x460d1aec is 0, stock PLAY never uses 0x40061822/0x40061848/0x40061856.
It polls SEQ at 0x4009b290, pauses at 0x4006188a (jsr 0x4009f5bc), and
starts at 0x40061892 (jsr 0x4009b964). 0.1.8 hooked the other branch so
[PLAY] still paused. 0.1.9 hooks 0x4006187c and 0x4006188a as well: with
X, SEQSTOP then 0x40061892. Empty box still seqpause. The 1aec!=0 pause
is still converted, but start is 0x40061892 not 0x40061856 (0.1.5-0.1.6
dead PLAY).

PERSONALIZE: a stock checkbox (glyphs 0x15 empty / 0x16 ticked), stored
in the free word 0x800000dc and ANDY shadow 0x100fff6c (Mute Modes uses
the same exclusive slot). 0.1.0-0.1.2 used 0x800000e0, the live
frame-builder ping, so the box and [PLAY] gate fought a stock bit.
0.1.9 stored 0/1 and treated any nonzero word as ticked, so leftover
SRAM showed X and YES had to run twice to clear it. 0.1.10 uses MAGIC
0x50530000 empty / 0x50530001 X, same as TRACK MUTES: only MAGIC_ON is
on, and YES xors that 0/1.
Input 0x40068fd0: YES wrap=1, LEFT/RIGHT/cursor wrap=0. wrap=0 returns
without a store; wrap=1 toggles 0<->1. The three ANDY restore sites are
widened pea 0x64 -> 0x70 so 0x800000dc survives power-off on a card build.
Those sites and the PERSONALIZE pointer arrays are the same Mute Modes
relocates, so the two cannot share a card or USB set until a base-owned
PERSONALIZE table exists; the manifest names mute-modes in conflicts.

No DSP code, no effect slot, no project bytes: a project saved with the
module loads unchanged on stock (the setting is PERSONALIZE, not the
project).
"""

import os

from remix.schema import Category, Detour, Gate, Kind, Linked, Module, Poke, Proof, TableGrow

_HERE = os.path.relpath(os.path.dirname(os.path.realpath(__file__))).replace("\\", "/")
H = bytes.fromhex

LABELS, GETTERS, SETTERS = 0x400b2a34, 0x400b2a74, 0x400b2ac0
COUNT_AT = 0x40068fb2
ANDY_RESTORE_SITES = (0x4001f322, 0x4001f3be, 0x4001fb24)
PLAY_STATE_LOAD = 0x40061822
PLAY_PAUSE_JSR = 0x40061848
PLAY_ALT_CMP = 0x4006187c
PLAY_SEQPAUSE_JSR = 0x4006188a

MODULE = Module(
    name="play-start",
    key="PLAY START",
    kind=Kind.CF_PATCH,
    category=Category.MACHINES,
    author="jonathanwardle1992-beep",
    author_url="https://github.com/jonathanwardle1992-beep",
    proof=Proof.UNTESTED,
    proof_note="0.1.10: PERSONALIZE empty unless MAGIC_ON; one YES ticks. 0.1.9 same-unit card started X and needed two YES to clear. USB Keep/Undo and ot_emu untested.",
    doc="PERSONALIZE -> PLAY START checkbox: empty keeps stock play/pause; ticked makes [PLAY] always start from the beginning.",
    linked=(
        Linked("playstart", _HERE + "/playstart.s"),
    ),
    detours=(
        Detour(
            PLAY_STATE_LOAD,
            stock_guard(PLAY_STATE_LOAD, 6, "030bad78a2e80cb7a308438ef961832c22203d0af66c3bab24845253473ab91c"),
            "playstart",
            "ps_gate",
            "[PLAY] 1aec!=0: playing or paused starts from the beginning",
        ),
        Detour(
            PLAY_PAUSE_JSR,
            stock_guard(PLAY_PAUSE_JSR, 6, "343d2481a9a601d9465f975937d51a99a916cc3a4183bf09dbfbc55fb5ab70d3"),
            "playstart",
            "ps_pause",
            "[PLAY] 1aec!=0: replace pause jsr",
        ),
        Detour(
            PLAY_ALT_CMP,
            stock_guard(PLAY_ALT_CMP, 6, "7bc4acbcd952120b8eb9fe6fb2121f99b5ca60ae4b1f00224d9e9667386ee281"),
            "playstart",
            "ps_alt",
            "[PLAY] 1aec==0: SEQ playing or paused starts from the beginning",
        ),
        Detour(
            PLAY_SEQPAUSE_JSR,
            stock_guard(PLAY_SEQPAUSE_JSR, 6, "3e28fad13d0c74f1ed5ea725d3b88d97b943c83dc80c32074b599549667601df"),
            "playstart",
            "ps_seqpause",
            "[PLAY] 1aec==0: replace seqpause jsr",
        ),
    ),
    tables=(
        TableGrow("PERSONALIZE labels", LABELS, 16, (("playstart", "lbl_playstart"),),
                  ((0x40068efe, LABELS),), insert_at=2),
        TableGrow("PERSONALIZE getters", GETTERS, 16, (("playstart", "get_playstart"),),
                  ((0x40068f0a, GETTERS),), insert_at=2),
        TableGrow("PERSONALIZE setters", SETTERS, 16, (("playstart", "set_playstart"),),
                  ((0x40069022, SETTERS), (0x4006903e, SETTERS), (0x40069056, SETTERS)),
                  insert_at=2),
    ),
    pokes=(
        Poke(COUNT_AT, stock_guard(COUNT_AT, 2, "5dd82fd23ac20130aebe3391a4c9a9fda6ca01bd143223a558ec253b65083dfd"), H("7210"),
             "PERSONALIZE rows 15 -> 16 (MKI), 16 -> 17 (MKII): + PLAY START"),
    ) + tuple(
        Poke(site, stock_guard(site, 4, "8c4c50dbddad08d1ae644a694665e608f2bbdb90d7a321fc640e844ae4c149fa"), H("48780070"),
             "ANDY restore pea 0x64 -> 0x70: PLAY START (0x800000dc) survives power-off")
        for site in ANDY_RESTORE_SITES
    ),
    gates=(Gate("modules/play-start/verify.py", remix_arg=False),),
)
