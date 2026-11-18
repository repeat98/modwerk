"""SYNTIZ: an original track machine with six models (SAW, PULSE, ENS, TABLE, MORPH, CHOIR).

A C runtime module (engine.c, machine_map.c, machine.c) that contributes one machine to the base's ot_machines
table (sdk/machines/octatrack/HOOKS.md) and raises ev_trig_muted before it starts a note. The base owns the chooser
row, the double tap of the track key and SRC SETUP; the module renders its own samples. It has no card form: its
USB package is built from its row in src/engine/assets/octatrack-module-packages.json, and verify.py checks it.
"""
from remix.schema import Category, Proof, Gate, Kind, Module

MODULE = Module(
    name="syntiz", key="SYNTIZ", kind=Kind.CF_PATCH,
    doc="A track machine with six models: stacked saws, pulse, ensemble, 32 single-cycle tables, morph and choir.",
    category=Category.MACHINES, author="stigmagit", author_url="https://github.com/stigmagit",
    proof=Proof.UNTESTED,
    proof_note="USB package only; host and package checks in verify.py, hardware results in TESTING.md.",
    gates=(Gate("modules/syntiz/verify.py", remix_arg=False),),
)
