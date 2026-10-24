"""BEAT SLICER: unlisted planning draft, not installable firmware.

No stock sites, addresses or routines are guessed. The portable C core is
host-tested. An owner-reviewed editor event, adapter, stock storage and
verified playback smoothing are required. See INTEGRATION.md.
"""
from remix.schema import Category, Proof, Gate, Kind, Module

MODULE = Module(
    name="beat-slicer", key="BEAT SLICER", kind=Kind.CF_PATCH,
    doc="Draft: sample/project BPM slice planner; no firmware adapter yet.",
    category=Category.FIXES, author="twwwy", author_url="https://github.com/twwwy",
    proof=Proof.UNTESTED,
    proof_note="Portable core host-tested; no native, USB, audio or hardware qualification.",
    gates=(Gate("modules/beat-slicer/verify.py", remix_arg=False),),
)
