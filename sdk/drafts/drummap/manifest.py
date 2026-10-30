"""DRUMMAP: Mutable Instruments Grids' drum map as a track machine for the sample tracks.

A C runtime module (engine.c, grids.c, machine.c) that contributes one record to the base's ot_machines table
(sdk/machines/octatrack/HOOKS.md): SRC SETUP lists it, and a sample track running it gets PART, X, Y, FILL, CHAO and
AVEL on the SRC page. It writes the track's trigs and VOL locks from the Grids map; the stock sequencer plays them,
so it keeps no clock, patches no stock site and holds no stock address beyond the Part and pattern records stock's
own editors use. The map is Émilie Gillet's (GPL-3.0) as the Phazerville DrumMap applet reads it (Benjamin
Rosenbach, MIT). It has no card form: its USB package is built from its row in
src/engine/assets/octatrack-module-packages.json, and verify.py checks it.
"""
from remix.schema import Category, Proof, Gate, Kind, Module

MODULE = Module(
    name="drummap", key="DRUMMAP", kind=Kind.CF_PATCH,
    doc="Grids drum patterns on sample tracks: a part (BD, SD, HH), a map position, fill and chaos.",
    category=Category.MACHINES, author="semierendonmez-commits", author_url="https://github.com/semierendonmez-commits",
    proof=Proof.UNTESTED,
    proof_note="USB package only; host and package checks in verify.py, hardware results in TESTING.md.",
    gates=(Gate("modules/drummap/verify.py", remix_arg=False),),
)
