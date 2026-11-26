"""TEMPO LFO — project/global tempo as LFO PMTR destination TEMPO (index 39).

USB: runtime.json contributes tm_lfo_pmtr to ot_lfo_pmtr_dest (order 100).
Base owns count/formatter/beq/lea/store. MOP-204 tip scaffold: after_store →
tm_on_store publishes PROJECT_BPM24 (0x8000181c). Does not own track speed
(TSPD) and does not claim SPOS / Play Modes remapper sites.

Coordinated map: 30 PROB … 38 TSTR, 39 TEMPO. Catalog PINNED (MOP-257).
"""

import os

from remix.schema import Category, Proof, Gate, Kind, Linked, Module

_HERE = os.path.relpath(os.path.dirname(os.path.realpath(__file__))).replace("\\", "/")

MODULE = Module(
    name="tempo-lfo",
    key="TEMPO",
    kind=Kind.CF_PATCH,
    doc="Project/global tempo as LFO PMTR destination TEMPO (index 39).",
    category=Category.MACHINES,
    author="jonathanwardle1992-beep",
    author_url="https://github.com/jonathanwardle1992-beep",
    proof=Proof.PORT,
    proof_note="MOP-257 catalog pin: Keep mop253/254, measured 624 mop255, "
               "tests.qualification placed under Jon owner-review G. "
               "Contribute TEMPO=39 → PROJECT_BPM24 via after_store tm_on_store. "
               "Lea-free / store-free (base-owned).",
    linked=(
        Linked("tempo", f"{_HERE}/unit.s", cpu="5475", dram=True),
    ),
    detours=(),
    gates=(Gate("modules/tempo-lfo/verify.py", remix_arg=False),),
)
