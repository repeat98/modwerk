"""FRACT source-draft metadata, not a card-build recipe.

The C runtime package is built separately by build_private.py against an exact
compatible private base. No stock writes or linked card units are declared here.
The gate validates source compilation only, never release qualification.
"""
from remix.schema import Category, Gate, Kind, Module, Proof

MODULE = Module(
    name="fract-machine", key="FRACT", kind=Kind.CF_PATCH,
    category=Category.MACHINES, author="ex1010",
    author_url="https://github.com/ex1010",
    doc="Source draft: three-grain track machine; no public installable package.",
    proof=Proof.UNTESTED,
    proof_note="Short private hardware audition reported; exact public build and release lifecycle unqualified.",
    gates=(Gate("modules/fract-machine/verify.py", remix_arg=False),),
)
