"""UNGEMACH: an original track machine, a dissonant drone that never stands still.

A C runtime module (engine.c, machine.c) that contributes one machine to the base's ot_machines table and takes its
tracks' playback increment (ev_play_increment), both in sdk/machines/octatrack/HOOKS.md. The base owns the chooser row
and SRC SETUP; the module renders its own samples on the ColdFire. It has no card form: its USB package is built from
its row in src/engine/assets/octatrack-module-packages.json once listed, and verify.py checks it.
"""
from remix.schema import Category, Proof, Gate, Kind, Module

MODULE = Module(
    name="ungemach", key="UNGEMACH", kind=Kind.CF_PATCH,
    doc="A track machine: a dissonant, living drone of sixteen detuned voices with a punch on each trig.",
    category=Category.MACHINES, author="GnocchiBalboa", author_url="https://github.com/GnocchiBalboa",
    proof=Proof.UNTESTED,
    proof_note="USB package only; host and package checks in verify.py, hardware results in TESTING.md.",
    gates=(Gate("modules/ungemach/verify.py", remix_arg=False),),
)
