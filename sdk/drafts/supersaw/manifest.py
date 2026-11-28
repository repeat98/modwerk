"""SuperSAW-OT source draft, USB only; no card firmware recipe.

runtime.json declares the existing base subscriptions. A public package recipe,
current-base qualification and SW/1 boot validation remain pending. This native
declaration is metadata, not proof that the empty card build is this machine.
"""
from remix.schema import Category, Gate, Kind, Module, Proof

MODULE = Module(
    name="supersaw", key="SUPERSAW", kind=Kind.CF_PATCH,
    category=Category.MACHINES,
    author="jokobol", author_url="https://github.com/jokobol",
    doc="Monophonic track machine with one to seven detuned saw oscillators and stereo spread.",
    proof=Proof.UNTESTED,
    proof_note="Historical private RAM package tested on José's MKII; current-base package and persistence unqualified. No card build.",
    gates=(Gate("modules/supersaw/verify.py", remix_arg=False),),
)
