"""SCOPE -- standalone full-screen OSC / XY / ALL of track audio.

DOWN + TEMPO opens a 128x64 class-1 window. UP + TEMPO is left to stock
(or to TUNER when that module is chosen alone). OSC = mono polyline;
XY = L×R Lissajous; ALL = 8-track level strips. A=GAIN B=TIME; CUE
release toggles the G/P HUD.

Modwerk 0.2.0+ uses runtime.json: module_key, module_tick and ev_usb_frame
instead of patching stock's TEMPO, frame tail and UI-loop sites, so SCOPE
can sit beside Tuner. Octabam 3fcf4fe still patches those three sites.
"""

import os

from remix.schema import Category, Gate, Kind, Linked, Module, Proof

_HERE = os.path.relpath(os.path.dirname(os.path.realpath(__file__)))

MODULE = Module(
    name="scope",
    key="SCOPE",
    kind=Kind.CF_PATCH,
    category=Category.MACHINES,
    author="ilia-murzinov",
    author_url="https://github.com/ilia-murzinov",
    proof=Proof.UNTESTED,
    proof_note="Draft port of octabam SCOPE (3fcf4fe4). Hook-based build: not yet qualified on hardware.",
    doc="DOWN+TEMPO full-screen OSC/XY/ALL of track audio; A GAIN B TIME.",
    linked=(Linked("scope", os.path.join(_HERE, "unit.s"), cpu="5475", dram=True),),
    detours=(),
    gates=(Gate("modules/scope/verify.py", remix_arg=False),),
)