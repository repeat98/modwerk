"""THRESHOLD SLICES: CREATE THRESHOLD SLICES in the AED SLICE menu.

A C runtime module. The base owns the menu row, the source checks, the bounded
peak read, the stock confirmation and the marker writes. The package holds the
detector and the popup. It has no card form.
"""
from remix.schema import Category, Proof, Kind, Module

MODULE = Module(
    name="threshold-slices", key="THRESHOLD", kind=Kind.CF_PATCH,
    doc="Slice a sample where the level rises through a threshold.",
    category=Category.FIXES, author="jonathanwardle1992-beep",
    author_url="https://github.com/jonathanwardle1992-beep",
    proof=Proof.UNTESTED,
    proof_note="Host scan test in sdk/tests/test_threshold_slices.py. No hardware run yet.",
)
