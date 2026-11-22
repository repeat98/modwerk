"""SONGBOOK -- 128 arrangements per project, as 16 books of 8 (setlists follow in a later version).

Book 1 is stock's arr01-arr08; book 2 is arr09-arr16, and so on to book 16, arr121-arr128: ordinary stock
arrangement files in the project directory, written and read by stock's own routines. In ARR > CHANGE, stopped,
LEFT/RIGHT step the book.

A switch posts stock's own "write the project" job (SYNC TO CARD's, 0x40022cd4) and does its card work inside it, in
stock's card task: the module steps into stock's per-arrangement writer at its entry (0x400915ac, the one site it
patches; no hook or other module uses it). On book 1 stock writes arr01-08 as always; on another book the book's 8
files are written instead; then the next book is loaded. Leaving book 1 keeps a backup (arr01.bak .. arr08.bak);
arriving at book 1 loads it and marks all 8 changed, so arr01-08 are rewritten from it. SAVE/RELOAD PROJECT, project
loads and the install use the base's project hooks (runtime.json). Which book the slots hold is kept in the module's
battery-RAM range with a fingerprint of the slots. OS 1.40C addresses in songbook.c and RESEARCH.md.
"""

import os

from remix.schema import Category, Detour, Gate, Kind, Linked, Module, Proof
from remix.stock_guard import stock_guard

_HERE = os.path.relpath(os.path.dirname(os.path.abspath(__file__)))
WRITER = 0x400915ac  # stock's arrangement writer: link.w %fp,#-324 ; movem.l %d2-%d7/%a2-%a5,(%sp)

MODULE = Module(
    name="songbook",
    key="SONGBOOK",
    kind=Kind.CF_PATCH,
    category=Category.MACHINES,  # display group "machines and the sequencer"; the site category is system
    author="Andrey-Sidorkin",
    author_url="https://github.com/Andrey-Sidorkin",
    proof=Proof.UNTESTED,
    proof_note="Host gate (71 checks); the developer's MKI checks on build c5027552c; the book 1 load fix since is not yet on a unit.",
    doc="128 arrangements per project as 16 books of 8, all stock arrangement files: arr01-arr08 stay book 1.",
    linked=(Linked("songbook", os.path.join(_HERE, "songbook_core.s")),),
    detours=(Detour(WRITER, stock_guard(WRITER, 8, "b692e058a2f3049810c18b0571d61c085c3daba589a09b531fed42f528b96012"),
                    "songbook", "as_writer_entry",
                    "stock's arrangement writer: on book 1 stock's own, on another book its arr files; a switch's load",
                    kind="jmp", pad_to=8),),
    gates=(Gate("modules/songbook/verify.py", remix_arg=False),),
)
