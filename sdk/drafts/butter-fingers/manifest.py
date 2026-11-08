"""BUTTER FINGERS -- removing a lock by pressing a DATA ENTRY knob no longer
writes a new one when the knob slips a detent.

While a TRIG key (a parameter lock) or SCENE A/B (a scene lock) is held, a
pressed knob's first single detent is dropped, and every turn of that knob for
150 ms after its release. Later turns while pressed pass, so stock's coarse
press + turn edit (x7) still works, one detent short. Outside lock editing,
every knob behaves as stock (TEMPO's LEVEL x7 while pushed is untouched).

No stock code is patched: the module reads the base's key and encoder events
(runtime.json: module_key, module_enc, module_tick) and takes only the turns
above. No DSP code, no project bytes, no setting.
"""

import os

from remix.schema import Category, Gate, Kind, Linked, Module, Proof

_HERE = os.path.relpath(os.path.dirname(os.path.abspath(__file__)))

MODULE = Module(
    name="butter-fingers",
    key="BUTTER FINGERS",
    kind=Kind.CF_PATCH,
    category=Category.FIXES,
    author="jankolkmeier",
    author_url="https://github.com/jankolkmeier",
    proof=Proof.UNTESTED,
    proof_note="Host gate and ot_emu lock-removal comparison against stock; reported working on one MKII over USB.",
    doc="No stray locks after removing one with a knob press: a slipped detent while pressed or on release is dropped.",
    linked=(
        Linked("butterfingers", os.path.join(_HERE, "butter_fingers_core.s")),
    ),
    gates=(Gate(os.path.join(_HERE, "verify.py"), remix_arg=False),),
)
