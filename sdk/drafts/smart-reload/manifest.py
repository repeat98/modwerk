"""SMART RELOAD -- in arranger mode, RELOAD PART brings back the current arranger row's scenes A and B.

Stock's RELOAD PART (FUNC + CUE on the main screen, or RELOAD in the Part menu) copies the saved Part over the working
one, its active scenes with it: in arranger mode the scenes the playing row set are replaced by the Part's saved ones
until the next row. The module steps into the reload at its entry (0x4004aab4, the one site it patches; no hook or other
module uses it), lets stock reload, then writes the current row's scenes into the reloaded Part as the arranger's row
start (0x4004a100) does; a "--" side gets the scene the rows above left. Pattern mode, a row of another bank or Part, and a Part with nothing
saved stay stock's reload. OS 1.40C addresses in smart_reload.c and RESEARCH.md; the logic is host-tested by verify.py.
"""

import os

from remix.schema import Category, Detour, Gate, Kind, Linked, Module, Proof
from remix.stock_guard import stock_guard

_HERE = os.path.relpath(os.path.dirname(os.path.abspath(__file__)))
RELOAD = 0x4004aab4  # stock's RELOAD PART: lea -32(%sp),%sp ; movem.l %d2-%d5/%a2-%a3,(%sp)

MODULE = Module(
    name="smart-reload",
    key="SMART RELOAD",
    kind=Kind.CF_PATCH,
    category=Category.PARTS,  # Parts, Kits and scenes; the site category is scenes
    author="Andrey-Sidorkin",
    author_url="https://github.com/Andrey-Sidorkin",
    proof=Proof.UNTESTED,
    proof_note="Host gate (21 checks); the developer's MKI, build 0008101dc (base eb667962) beside Arr Rows and Songbook, as the developer reported it.",
    doc="In arranger mode, RELOAD PART brings back the current row's scenes A and B instead of the Part's.",
    linked=(Linked("smart_reload", os.path.join(_HERE, "smart_reload_core.s")),),
    detours=(Detour(RELOAD, stock_guard(RELOAD, 8, "b135c3d26b1fe44c606ada1d8c7b28ee8977c8b535504950904bcaa790480122"),
                    "smart_reload", "sr_reload_entry",
                    "stock's RELOAD PART: the reload, then the arranger row's scenes", kind="jmp", pad_to=8),),
    gates=(Gate("modules/smart-reload/verify.py", remix_arg=False),),
)
