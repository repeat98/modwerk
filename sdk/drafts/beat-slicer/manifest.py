"""BEAT SLICER: unlisted basic AED slicer, not released firmware.

No stock sites, addresses or routines are guessed. The portable C core is
host-tested. The independent controller and shared service are private staging;
owner review and exact native/USB/hardware qualification remain. The basic
version uses ordinary stock playback without smoothing. See INTEGRATION.md.
"""
from remix.schema import Category, Proof, Gate, Kind, Module

MODULE = Module(
    name="beat-slicer", key="BEAT SLICER", kind=Kind.CF_PATCH,
    doc="Draft: sample/project BPM exact slicing; shared native integration in qualification.",
    category=Category.FIXES, author="twwwy", author_url="https://github.com/twwwy",
    proof=Proof.UNTESTED,
    proof_note="Portable core host-tested; no native, USB, audio or hardware qualification.",
    gates=(Gate("modules/beat-slicer/verify.py", remix_arg=False),),
)
