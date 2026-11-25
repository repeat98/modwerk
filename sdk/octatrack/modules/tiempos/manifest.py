"""TIEMPOS: the time left on all eight audio tracks, on one screen behind CUE + MIDI.

A C runtime module (tiempos.c) on the base's four core hooks (module_tick, module_draw, module_key, module_enc).
It reads each voice's play position and trim, measures how fast the position moves against the 132 MHz timer and
draws its own screen; the package holds no stock-code site. It has no card form: its USB package is built from its
row in src/engine/assets/octatrack-module-packages.json, and verify.py checks it.
"""
from remix.schema import Category, Proof, Gate, Kind, Module

MODULE = Module(
    name="tiempos", key="TIEMPOS", kind=Kind.CF_PATCH,
    doc="The time left on all eight audio tracks, measured from how fast each voice plays.",
    category=Category.TRACK, author="imdantelo", author_url="https://github.com/imdantelo",
    proof=Proof.UNTESTED,
    proof_note="USB package only; host and package checks in verify.py, hardware results in TESTING.md.",
    gates=(Gate("modules/tiempos/verify.py", remix_arg=False),),
)
