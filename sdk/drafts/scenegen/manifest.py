"""SCENE GEN: scenes generated around the Part's values, for the crossfader to travel between.

A C runtime module (engine.c, rows.c) that contributes four rows to the base's ot_sequencer_rows table
(sdk/machines/octatrack/HOOKS.md): PROJECT > CONTROL > SEQUENCER lists SCN TARGET, SCN PARAMS, SCN SPREAD and SCENE
GEN after stock's three. YES on SCENE GEN writes scene locks for the chosen page-1 parameters of the active track or
every audio track into scene A, scene B, all sixteen scenes, or a walk through them; LEVEL to the left there restores
the scenes as they were. It writes the active Part's own scene lock rows, patches no stock site and holds no stock
address beyond the Part, the page descriptors and the crossfader morph Apply Scene uses. It has no card form: its USB
package is built from its row in src/engine/assets/octatrack-module-packages.json, and verify.py checks it.
"""
from remix.schema import Category, Proof, Gate, Kind, Module

MODULE = Module(
    name="scenegen", key="SCENEGEN", kind=Kind.CF_PATCH,
    doc="Generated scenes: page-1 parameters locked around the Part's values in one scene, all sixteen, or a walk.",
    category=Category.PARTS, author="semierendonmez-commits", author_url="https://github.com/semierendonmez-commits",
    proof=Proof.UNTESTED,
    proof_note="USB package only; host and package checks in verify.py, hardware results in TESTING.md.",
    gates=(Gate("modules/scenegen/verify.py", remix_arg=False),),
)
