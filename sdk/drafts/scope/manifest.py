"""SCOPE -- standalone full-screen OSC / XY / ALL of track audio.

DOWN + TEMPO opens a 128x64 class-1 window. UP + TEMPO is left to stock
(or to TUNER when that module is chosen alone). OSC = mono polyline;
XY = L×R Lissajous; ALL = 8-track level strips. A=GAIN B=TIME; CUE
release toggles the G/P HUD.

Ported from ilia-murzinov's octabam module at 3fcf4fe4 (standalone; no
TUNER require/Override). Shares TEMPO / frame_isr / UI-loop sites with
catalog TUNER: a Modwerk set cannot carry both until a base hook owns
those sites (octabam's HOOKS bridge). Declare conflict with tuner for
the gesture pair until then.
"""

import os

from remix.schema import Category, Detour, Gate, Kind, Linked, Module, Proof
from remix.stock_guard import stock_guard

_HERE = os.path.relpath(os.path.dirname(os.path.realpath(__file__)))

TEMPO_OPEN = 0x40059EF0
FRAME_TAIL = 0x4000D99A
UI_LOOP = 0x40056C72

# Same 1.40C spans TUNER guards; provenance in sdk/octatrack/modules/tuner/evidence/.
_GUARDS = {
    TEMPO_OPEN: stock_guard(TEMPO_OPEN, 6, "f6a3ca67f755cf77cada82cbb69793ccf442a7994c8ec87a9dff56f83ca048c5"),
    FRAME_TAIL: stock_guard(FRAME_TAIL, 6, "9a7d100114ea50c9317af4f9de9210dd0eeae82f9ce03b255ac0d7bb5f707b91"),
    UI_LOOP: stock_guard(UI_LOOP, 6, "9c0a1089c078d792bc2cdac2cf3b905c17ad1f4466addf54f4b84f2fa2f9cdd0"),
}

MODULE = Module(
    name="scope",
    key="SCOPE",
    kind=Kind.CF_PATCH,
    category=Category.MACHINES,
    author="ilia-murzinov",
    author_url="https://github.com/ilia-murzinov",
    proof=Proof.UNTESTED,
    proof_note="Draft port of octabam SCOPE (3fcf4fe4). Octabam MKII/OCTA S2 evidence is not Modwerk USB qualification.",
    doc="DOWN+TEMPO full-screen OSC/XY/ALL of track audio; A GAIN B TIME.",
    linked=(Linked("scope", os.path.join(_HERE, "unit.s"), cpu="5475", dram=True),),
    detours=(
        Detour(TEMPO_OPEN, _GUARDS[TEMPO_OPEN], "scope", "sc_tempo",
               "TEMPO: DOWN -> SCOPE, else stock"),
        Detour(FRAME_TAIL, _GUARDS[FRAME_TAIL], "scope", "sc_frame",
               "frame_isr: fill SCOPE ring while that window is open"),
        Detour(UI_LOOP, _GUARDS[UI_LOOP], "scope", "sc_tick",
               "UI loop: SCOPE ~60 Hz draw while open"),
    ),
    gates=(Gate("modules/scope/verify.py", remix_arg=False),),
)
