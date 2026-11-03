from remix.stock_guard import stock_guard
"""PLAY_START -- PERSONALIZE -> PLAY START: OFF (stock play/pause) or ON
([PLAY] always starts the sequencer from the beginning and never pauses).

Default OFF, so installing the module changes nothing until the musician
turns it on. STOP, MIDI START/CONTINUE/STOP, and [REC]+[PLAY] stay stock.

The PLAY key handler loads the transport state word 0x800066a0 at
0x40061822 (after the [REC]-held branch, so Quant Live Rec's detour at
0x40061778 still runs first). When PLAY START is ON and that word is not
zero (playing or paused), this module calls the same helper the stock
pause path uses (0x4009f5bc), clears the state, and continues into stock's
stopped-PLAY start path so [PLAY] starts from the beginning instead of
pausing or continuing from the pause point.

PERSONALIZE: one text row PLAY START with OFF/ON, stored in the free word
0x800000e0 and its ANDY shadow 0x100fff70. The three ANDY restore sites are
widened pea 0x64 -> 0x74 so that word survives power-off on a card build.
Those sites and the PERSONALIZE pointer arrays are the same Mute Modes
relocates, so the two cannot share a card or USB set until a base-owned
PERSONALIZE table exists; the manifest names mute-modes in conflicts.

No DSP code, no effect slot, no project bytes: a project saved with the
module loads unchanged on stock (the setting is PERSONALIZE, not the
project).
"""

import os

from remix.schema import Category, Detour, Gate, Kind, Linked, Module, Poke, Proof, TableGrow

_HERE = os.path.relpath(os.path.dirname(os.path.realpath(__file__)))
H = bytes.fromhex

LABELS, GETTERS, SETTERS = 0x400b2a34, 0x400b2a74, 0x400b2ac0
COUNT_AT = 0x40068fb2
ANDY_RESTORE_SITES = (0x4001f322, 0x4001f3be, 0x4001fb24)
PLAY_STATE_LOAD = 0x40061822

MODULE = Module(
    name="play-start",
    key="PLAY START",
    kind=Kind.CF_PATCH,
    category=Category.MACHINES,
    author="jonathanwardle1992-beep",
    author_url="https://github.com/jonathanwardle1992-beep",
    proof=Proof.UNTESTED,
    proof_note="Source assembled against original 1.40C guards; transport behaviour not yet run on a unit or in ot_emu.",
    doc="PERSONALIZE -> PLAY START: OFF keeps stock play/pause; ON makes [PLAY] always start from the beginning.",
    linked=(
        Linked("playstart", os.path.join(_HERE, "playstart.s")),
    ),
    detours=(
        Detour(
            PLAY_STATE_LOAD,
            stock_guard(PLAY_STATE_LOAD, 6, "030bad78a2e80cb7a308438ef961832c22203d0af66c3bab24845253473ab91c"),
            "playstart",
            "ps_gate",
            "[PLAY]: when PLAY START is ON, playing or paused starts from the beginning instead of pausing",
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
        Poke(site, stock_guard(site, 4, "8c4c50dbddad08d1ae644a694665e608f2bbdb90d7a321fc640e844ae4c149fa"), H("48780074"),
             "ANDY restore pea 0x64 -> 0x74: PLAY START (0x800000e0) survives power-off")
        for site in ANDY_RESTORE_SITES
    ),
    gates=(Gate(os.path.join(_HERE, "verify.py"), remix_arg=False),),
)
