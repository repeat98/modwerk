"""ARR SETLISTS -- 128 arrangements per project, as 16 banks of 8 (setlists follow in a later version).

Bank A is stock's: the 8 arrangements in battery RAM and arr01-arr08, which the module never makes hold another bank.
Banks B-P are files of its own in the project directory (arrbankB.work .. arrbankP.work, and .strd copies), each the
8 arrangements as stock keeps them in battery RAM. In ARR > CHANGE, stopped, LEFT/RIGHT step the bank.

A switch posts stock's own "write the project" job (SYNC TO CARD's, 0x40022cd4) and does its card work inside it, in
stock's card task: the module steps into stock's arrangement writer at its entry (0x400915ac, the one site it
patches; no hook or other module uses it). On bank A stock writes arr01-08 as always; on another bank the bank's file
is written instead; then the new bank is loaded. Leaving A keeps a backup (arrbankA.bak); arriving at A loads it and
marks all 8 changed, so arr01-08 are rewritten from it. SAVE/RELOAD PROJECT, project loads and the install use the
base's project hooks (runtime.json). Which bank the slots hold is kept in the module's battery-RAM range with a
fingerprint of the slots. OS 1.40C addresses in arr_setlists.c and RESEARCH.md.
"""

import os

from remix.schema import Category, Detour, Gate, Kind, Linked, Module, Proof
from remix.stock_guard import stock_guard

_HERE = os.path.relpath(os.path.dirname(os.path.abspath(__file__)))
WRITER = 0x400915ac  # stock's arrangement writer: link.w %fp,#-324 ; movem.l %d2-%d7/%a2-%a5,(%sp)

MODULE = Module(
    name="arr-setlists",
    key="ARR SETLISTS",
    kind=Kind.CF_PATCH,
    category=Category.MACHINES,  # display group "machines and the sequencer"; the site category is system
    author="Andrey-Sidorkin",
    author_url="https://github.com/Andrey-Sidorkin",
    proof=Proof.UNTESTED,
    proof_note="Host gate; stock's arrangement storage and jobs measured under ot_emu; not yet on a unit.",
    doc="128 arrangements per project as 16 banks of 8; bank A stays stock's, B-P are files of the module's own.",
    linked=(Linked("arrsetlists", os.path.join(_HERE, "arr_setlists_core.s")),),
    detours=(Detour(WRITER, stock_guard(WRITER, 8, "b692e058a2f3049810c18b0571d61c085c3daba589a09b531fed42f528b96012"),
                    "arrsetlists", "as_writer_entry",
                    "stock's arrangement writer: on bank A stock's own, on another bank the bank's file; a switch's load",
                    kind="jmp", pad_to=8),),
    gates=(Gate("modules/arr-setlists/verify.py", remix_arg=False),),
)
