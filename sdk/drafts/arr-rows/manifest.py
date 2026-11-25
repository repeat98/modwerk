"""ARR ROWS -- select several rows in the arrangement editor and copy, clear,
paste or insert them together.

CUE + UP/DOWN starts or extends a selection from the cursor (stock moves the
cursor as for UP/DOWN alone); FUNC + REC copies it, FUNC + PLAY clears it,
FUNC + STOP replaces the selected rows (or the cursor row) with the copied
rows and CUE + FUNC + STOP inserts them. Repeating a
paste, clear or insert in the same place undoes it, as stock does for one row.
Without a selection and without rows copied here, every key is stock's.

No stock code is patched: the module reads the base's key events and draws on
the composed frame (runtime.json: module_key, module_tick, module_draw). It
edits only the working arrangement in RAM, in stock's own row layout, marks it
changed as stock does and calls stock's row clear, message box and editor
redraw (OS 1.40C addresses in arr_rows.c, RESEARCH.md). No DSP code, no Part
or project bytes, no setting; the clipboard lives in RAM until power off.
"""

import os

from remix.schema import Category, Gate, Kind, Linked, Module, Proof

_HERE = os.path.relpath(os.path.dirname(os.path.abspath(__file__)))

MODULE = Module(
    name="arr-rows",
    key="ARR ROWS",
    kind=Kind.CF_PATCH,
    category=Category.MACHINES,  # display group "machines and the sequencer"; the site category is system
    author="Andrey-Sidorkin",
    author_url="https://github.com/Andrey-Sidorkin",
    proof=Proof.UNTESTED,
    proof_note="Host gate (98 checks); the developer's MKI checks, 0.2.0 on build 50bb1e6b2 (base 0.7.13).",
    doc="Select rows in the arrangement editor with CUE + UP/DOWN; copy, clear, paste or insert them together.",
    linked=(
        Linked("arrrows", os.path.join(_HERE, "arr_rows_core.s")),
    ),
    gates=(Gate("modules/arr-rows/verify.py", remix_arg=False),),
)
