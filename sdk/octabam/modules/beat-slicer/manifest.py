"""BEAT SLICER: CREATE BEAT GRID in the AED SLICE menu.

A C runtime module (device_module.c, device_font.c, grid_preview.c) that contributes one action to the base's
ot_sample_editor_actions table (sdk/machines/octatrack/SAMPLE_EDITOR.md). The base owns the menu row, the source
checks, the stock confirmation and the marker writes; the package holds no stock address. It has no card form:
its USB package is built from its row in src/engine/assets/octatrack-module-packages.json, and verify.py checks it.
"""
from remix.schema import Category, Proof, Gate, Kind, Module

MODULE = Module(
    name="beat-slicer", key="BEAT SLICER", kind=Kind.CF_PATCH,
    doc="Slice a sample or recorder buffer on a beat grid from its trim start, at the sample's or the project's BPM.",
    category=Category.FIXES, author="twwwy", author_url="https://github.com/twwwy",
    proof=Proof.UNTESTED,
    proof_note="USB package only; host and package checks in verify.py, hardware results in TESTING.md.",
    gates=(Gate("modules/beat-slicer/verify.py", remix_arg=False),),
)
